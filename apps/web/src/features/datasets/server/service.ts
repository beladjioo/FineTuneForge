import "server-only";
import { and, eq } from "drizzle-orm";
import { getPlan, type PlanDefinition } from "@/config/plans";
import { formatBytes } from "@/lib/utils";
import { db } from "@/server/db";
import { type Dataset, datasets } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { getStorage, type PresignedUpload, storageKeys } from "@/server/storage";
import { analyzeDataset } from "../lib/analyze";
import { DATASET_LIMITS } from "../lib/constants";
import { toJsonl, truncateSample } from "../lib/samples";
import { contentTypeForKind, fileExtension, sourceKindFromFileName } from "../lib/source";
import type { DatasetStatus } from "../lib/types";
import type { CreateDatasetUploadInput } from "../schemas";
import { countDatasets, countJobsUsingDataset, getDataset } from "./queries";

/**
 * Dataset write-side use cases. Framework-agnostic: callers (Server Actions,
 * background jobs, tests) pass the authenticated owner explicitly.
 */

export interface DatasetOwner {
  id: string;
  plan?: unknown;
}

/**
 * Step 1 of an import: checks quotas, creates the dataset row and returns a
 * short-lived URL the browser uses to upload the file straight to storage.
 */
export async function createDatasetUpload(
  owner: DatasetOwner,
  input: CreateDatasetUploadInput,
): Promise<{ datasetId: string; upload: PresignedUpload }> {
  const plan = getPlan(owner.plan);
  const kind = sourceKindFromFileName(input.fileName);
  if (!kind) {
    throw new AppError(
      "Type de fichier non supporté. Formats acceptés : .txt, .jsonl, .json, .csv.",
    );
  }
  if (input.fileSize > plan.limits.maxDatasetBytes) {
    throw new AppError(
      `Fichier trop volumineux : ${formatBytes(plan.limits.maxDatasetBytes)} maximum avec le plan ${plan.name}.`,
    );
  }
  if ((await countDatasets(owner.id)) >= plan.limits.maxDatasets) {
    throw new AppError(
      `Vous avez atteint la limite de ${plan.limits.maxDatasets} datasets du plan ${plan.name}. Supprimez-en un pour continuer.`,
    );
  }

  const datasetId = crypto.randomUUID();
  const originalFileKey = storageKeys.datasetOriginal(
    owner.id,
    datasetId,
    fileExtension(input.fileName),
  );

  await db.insert(datasets).values({
    id: datasetId,
    userId: owner.id,
    name: input.name,
    description: input.description || null,
    source: input.source,
    status: "uploading",
    originalFilename: input.fileName,
    originalFileKey,
    sizeBytes: input.fileSize,
  });

  const upload = await getStorage().presignUpload({
    key: originalFileKey,
    contentType: contentTypeForKind(kind),
    maxBytes: plan.limits.maxDatasetBytes,
  });

  return { datasetId, upload };
}

async function markFailed(datasetId: string, error: string): Promise<{ status: DatasetStatus }> {
  await db.update(datasets).set({ status: "failed", error }).where(eq(datasets.id, datasetId));
  return { status: "failed" };
}

/** Parses the uploaded file, stores the normalized JSONL and records the report. */
async function processDataset(
  dataset: Dataset,
  plan: PlanDefinition,
): Promise<{ status: DatasetStatus }> {
  const storage = getStorage();
  const object = await storage.stat(dataset.originalFileKey);
  if (!object) {
    return markFailed(dataset.id, "Le fichier n'a pas été reçu. Relancez l'import.");
  }
  if (object.size > plan.limits.maxDatasetBytes) {
    await storage.delete([dataset.originalFileKey]);
    return markFailed(
      dataset.id,
      `Fichier trop volumineux : ${formatBytes(plan.limits.maxDatasetBytes)} maximum avec le plan ${plan.name}.`,
    );
  }

  // The browser already ran this analysis; the server re-runs it on the stored
  // bytes because client-side checks can be bypassed.
  const content = await storage.getText(dataset.originalFileKey);
  const analysis = analyzeDataset({ content, fileName: dataset.originalFilename });

  const common = {
    sizeBytes: object.size,
    format: analysis.format,
    stats: analysis.stats,
    report: analysis.report,
    preview: analysis.samples
      .slice(0, DATASET_LIMITS.previewSamples)
      .map((sample) => truncateSample(sample, DATASET_LIMITS.previewFieldChars)),
  };

  if (!analysis.canImport) {
    await db
      .update(datasets)
      .set({ ...common, status: "failed", sampleCount: 0 })
      .where(eq(datasets.id, dataset.id));
    return { status: "failed" };
  }

  const normalizedFileKey = storageKeys.datasetNormalized(dataset.userId, dataset.id);
  await storage.put(normalizedFileKey, toJsonl(analysis.samples), "application/x-ndjson");
  await db
    .update(datasets)
    .set({ ...common, status: "ready", sampleCount: analysis.samples.length, normalizedFileKey })
    .where(eq(datasets.id, dataset.id));

  return { status: "ready" };
}

/**
 * Step 2 of an import, called once the browser upload has completed.
 * Idempotent: a dataset is claimed atomically, so concurrent or repeated calls
 * never process the same file twice.
 */
export async function finalizeDatasetUpload(
  owner: DatasetOwner,
  datasetId: string,
): Promise<{ status: DatasetStatus }> {
  const [claimed] = await db
    .update(datasets)
    .set({ status: "processing", error: null })
    .where(
      and(
        eq(datasets.id, datasetId),
        eq(datasets.userId, owner.id),
        eq(datasets.status, "uploading"),
      ),
    )
    .returning();

  if (!claimed) {
    const existing = await getDataset(owner.id, datasetId);
    if (!existing) throw new AppError("Dataset introuvable.");
    return { status: existing.status };
  }

  try {
    return await processDataset(claimed, getPlan(owner.plan));
  } catch (error) {
    console.error(`[datasets] processing failed for ${datasetId}`, error);
    return markFailed(datasetId, "Le traitement du fichier a échoué. Réessayez l'import.");
  }
}

export async function deleteDataset(ownerId: string, datasetId: string): Promise<void> {
  const dataset = await getDataset(ownerId, datasetId);
  if (!dataset) throw new AppError("Dataset introuvable.");

  const jobCount = await countJobsUsingDataset(datasetId);
  if (jobCount > 0) {
    throw new AppError(
      `Ce dataset est utilisé par ${jobCount} fine-tune${jobCount > 1 ? "s" : ""} et ne peut pas être supprimé.`,
    );
  }

  await db.delete(datasets).where(and(eq(datasets.id, datasetId), eq(datasets.userId, ownerId)));

  // Files are removed after the row: an orphaned object is harmless, a row
  // pointing to a missing file is not.
  const keys = [dataset.originalFileKey, dataset.normalizedFileKey].filter((key): key is string =>
    Boolean(key),
  );
  await getStorage()
    .delete(keys)
    .catch((error) => console.error(`[datasets] storage cleanup failed for ${datasetId}`, error));
}
