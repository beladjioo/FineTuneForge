import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { datasets, fineTuneJobs } from "@/server/db/schema";

/**
 * Read-side data access for datasets. Every query is scoped by `userId`, so
 * authorization is enforced by construction rather than remembered by callers.
 */

const listColumns = {
  id: datasets.id,
  name: datasets.name,
  status: datasets.status,
  format: datasets.format,
  source: datasets.source,
  sampleCount: datasets.sampleCount,
  sizeBytes: datasets.sizeBytes,
  originalFilename: datasets.originalFilename,
  createdAt: datasets.createdAt,
};

export type DatasetListItem = Awaited<ReturnType<typeof listDatasets>>[number];

export async function listDatasets(userId: string, options: { limit?: number } = {}) {
  return db
    .select(listColumns)
    .from(datasets)
    .where(eq(datasets.userId, userId))
    .orderBy(desc(datasets.createdAt))
    .limit(options.limit ?? 100);
}

export async function getDataset(userId: string, datasetId: string) {
  const [dataset] = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, datasetId), eq(datasets.userId, userId)))
    .limit(1);
  return dataset ?? null;
}

export async function countDatasets(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(datasets)
    .where(eq(datasets.userId, userId));
  return row?.value ?? 0;
}

export async function countJobsUsingDataset(datasetId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(fineTuneJobs)
    .where(eq(fineTuneJobs.datasetId, datasetId));
  return row?.value ?? 0;
}
