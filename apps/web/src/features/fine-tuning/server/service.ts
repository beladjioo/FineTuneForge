import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getBaseModel } from "@/config/models";
import { getPlan } from "@/config/plans";
import { getHuggingFaceConnection } from "@/features/huggingface/server/credentials";
import { startOfCurrentMonthUtc } from "@/lib/dates";
import { db } from "@/server/db";
import { datasets, fineTuneJobs, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { inngest } from "@/server/inngest";
import { fineTuneCancelRequested, fineTuneRequested } from "../events";
import { clampToContext, resolveHyperparameters } from "../lib/presets";
import { isTerminalStatus } from "../lib/status";
import type { CreateFineTuneJobInput } from "../schemas";
import { isPlatformDestinationAvailable } from "./hub-credentials";
import { appendJobEvent, transitionJob } from "./job-events";
import { defaultProviderId } from "./providers";
import { countActiveJobs, countBillableJobsSince, getJob } from "./queries";

export interface JobOwner {
  id: string;
  plan?: unknown;
}

async function outputNamespace(
  owner: JobOwner,
  input: CreateFineTuneJobInput,
  providerId: string,
): Promise<string> {
  if (input.destination === "platform") {
    if (!isPlatformDestinationAvailable() || !env.HF_PLATFORM_ORG) {
      throw new AppError("La publication sur le compte FineTuneForge n'est pas disponible.");
    }
    return env.HF_PLATFORM_ORG;
  }
  const connection = await getHuggingFaceConnection(owner.id);
  if (connection) return connection.hfUsername;
  // Simulated runs never touch the Hub: no account needed to try the product locally.
  if (providerId === "simulated") return "simulation";
  throw new AppError(
    "Connectez votre compte Hugging Face (Paramètres) pour y publier votre modèle.",
  );
}

/**
 * Creates a job and hands it to the workflow engine. Quotas are checked inside a
 * transaction holding a lock on the user row, so two simultaneous launches cannot
 * both slip under the limit.
 */
export async function createFineTuneJob(
  owner: JobOwner,
  input: CreateFineTuneJobInput,
): Promise<{ jobId: string }> {
  const plan = getPlan(owner.plan);
  const model = getBaseModel(input.baseModelId);
  if (!model || (model.devOnly && env.NODE_ENV === "production")) {
    throw new AppError("Ce modèle n'est pas disponible.");
  }
  if (input.private && !plan.limits.privateDeployments) {
    throw new AppError("Les modèles privés sont réservés au plan Pro.");
  }

  const hyperparameters = clampToContext(
    resolveHyperparameters(input.preset, input.hyperparameters),
    model.contextLength,
  );
  const provider = defaultProviderId();
  const namespace = await outputNamespace(owner, input, provider);

  const jobId = await db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${users} where ${users.id} = ${owner.id} for update`);

    const [dataset] = await tx
      .select({ id: datasets.id })
      .from(datasets)
      .where(
        and(
          eq(datasets.id, input.datasetId),
          eq(datasets.userId, owner.id),
          eq(datasets.status, "ready"),
        ),
      )
      .limit(1);
    if (!dataset) throw new AppError("Ce dataset n'existe pas ou n'est pas prêt.");

    if ((await countActiveJobs(owner.id, tx)) >= plan.limits.maxConcurrentJobs) {
      throw new AppError(
        plan.limits.maxConcurrentJobs === 1
          ? "Un fine-tuning est déjà en cours. Attendez qu'il se termine (ou annulez-le)."
          : `Vous avez déjà ${plan.limits.maxConcurrentJobs} fine-tunings en cours.`,
      );
    }

    const monthlyLimit = plan.limits.fineTunesPerMonth;
    if (
      monthlyLimit !== null &&
      (await countBillableJobsSince(owner.id, startOfCurrentMonthUtc(), tx)) >= monthlyLimit
    ) {
      throw new AppError(
        `Quota atteint : ${monthlyLimit} fine-tune${monthlyLimit > 1 ? "s" : ""} par mois avec le plan ${plan.name}. Passez au plan Pro pour des fine-tunes illimités.`,
      );
    }

    const [job] = await tx
      .insert(fineTuneJobs)
      .values({
        userId: owner.id,
        datasetId: input.datasetId,
        name: input.name,
        baseModelId: model.id,
        preset: input.preset,
        hyperparameters,
        provider,
        outputDestination: input.destination,
        outputRepoId: `${namespace}/${input.repoName}`,
        outputRepoPrivate: input.private,
      })
      .returning({ id: fineTuneJobs.id });
    if (!job) throw new Error("Job insert returned no row");

    await appendJobEvent(
      job.id,
      "status",
      "Job créé, en attente de démarrage",
      { status: "queued" },
      tx,
    );
    return job.id;
  });

  try {
    await inngest.send(
      fineTuneRequested.create({ jobId, userId: owner.id }, { id: `fine-tune-requested-${jobId}` }),
    );
  } catch (error) {
    console.error(`[fine-tuning] could not enqueue job ${jobId}`, error);
    await transitionJob(jobId, "failed", {
      error: "Impossible de démarrer le job : l'orchestrateur est injoignable.",
      finishedAt: new Date(),
    });
    throw new AppError("Le service d'entraînement est momentanément indisponible. Réessayez.");
  }

  return { jobId };
}

export async function cancelFineTuneJob(ownerId: string, jobId: string): Promise<void> {
  const job = await getJob(ownerId, jobId);
  if (!job) throw new AppError("Fine-tuning introuvable.");
  if (isTerminalStatus(job.status)) throw new AppError("Ce fine-tuning est déjà terminé.");

  const cancelled = await transitionJob(
    jobId,
    "cancelled",
    { finishedAt: new Date() },
    { message: "Annulé par l'utilisateur" },
  );
  if (!cancelled) throw new AppError("Ce fine-tuning vient de se terminer.");

  await inngest.send(
    fineTuneCancelRequested.create({ jobId }, { id: `fine-tune-cancel-${jobId}` }),
  );
}
