import "server-only";
import { NonRetriableError } from "inngest";
import { getBaseModel } from "@/config/models";
import { getDataset } from "@/features/datasets/server/queries";
import {
  checkModelAccess,
  createModelRepo,
  HubAuthError,
  HubRepoExistsError,
} from "@/features/huggingface/server/hub-client";
import { env } from "@/server/env";
import { getStorage } from "@/server/storage";
import { TRAINER_CONTRACT_VERSION, type TrainingSpec } from "../contract";
import { isTerminalStatus } from "../lib/status";
import type { FineTuneJobStatus } from "../types";
import { HubCredentialsError, resolveHubCredentials } from "./hub-credentials";
import { appendJobEvent, patchJob, transitionJob } from "./job-events";
import { getTrainingProvider } from "./providers";
import { getJobById } from "./queries";

/**
 * Step implementations of the fine-tuning workflow (see workflow.ts). Each one is
 * idempotent: Inngest may re-run a step after a crash or a transient error.
 * Problems the user must fix are thrown as NonRetriableError with a French message.
 */

/** Without any trainer event for this long, we ask the provider whether the run is alive. */
const SILENCE_BEFORE_CHECK_MS = 20 * 60 * 1000;
/** Even if the provider says "running", this much silence means the run is stuck. */
const MAX_SILENCE_MS = 60 * 60 * 1000;
const DATASET_URL_TTL_SECONDS = 12 * 60 * 60;
const REPO_NAME_ATTEMPTS = 5;

async function loadJob(jobId: string) {
  const job = await getJobById(jobId);
  if (!job) throw new NonRetriableError(`Job ${jobId} introuvable.`);
  return job;
}

function trainerCallbackUrl(path: string): string {
  return new URL(path, env.TRAINER_CALLBACK_BASE_URL ?? env.APP_URL).toString();
}

export type PrepareResult = { skipped: true; status: FineTuneJobStatus } | { skipped: false };

/** Validates everything that can be checked before paying for a GPU. */
export async function prepareJob(jobId: string, orchestratorRunId: string): Promise<PrepareResult> {
  const job = await loadJob(jobId);
  if (isTerminalStatus(job.status)) return { skipped: true, status: job.status };

  if (job.status === "queued") {
    await transitionJob(
      jobId,
      "preparing",
      { orchestratorRunId, attempt: job.attempt + 1 },
      {
        message: "Préparation du job",
      },
    );
  }

  const model = getBaseModel(job.baseModelId);
  if (!model) throw new NonRetriableError(`Le modèle ${job.baseModelId} n'est plus proposé.`);

  const dataset = await getDataset(job.userId, job.datasetId);
  if (!dataset || dataset.status !== "ready" || !dataset.normalizedFileKey) {
    throw new NonRetriableError("Le dataset n'est plus disponible.");
  }

  const provider = getTrainingProvider(job.provider);
  if (!provider.usesHub) {
    await appendJobEvent(jobId, "log", "Mode simulation : aucun appel à Hugging Face.");
    return { skipped: false };
  }

  let credentials: Awaited<ReturnType<typeof resolveHubCredentials>>;
  try {
    credentials = await resolveHubCredentials(job);
  } catch (error) {
    if (error instanceof HubCredentialsError) throw new NonRetriableError(error.message);
    throw error;
  }
  const hub = { endpoint: env.HF_ENDPOINT, token: credentials.token };

  const access = await checkModelAccess(model.id, hub);
  if (access === "gated") {
    throw new NonRetriableError(
      `Accès refusé à ${model.name} : ce modèle est soumis à licence. Acceptez-la sur https://huggingface.co/${model.id} avec votre compte Hugging Face, puis relancez le fine-tuning.`,
    );
  }
  if (access === "not_found") {
    throw new NonRetriableError(`Le modèle ${model.id} est introuvable sur Hugging Face.`);
  }

  // Create the output repo now: it validates write access before the GPU starts,
  // and picks a free name if the requested one is taken.
  if (job.outputRepoId && !job.outputRepoId.includes("/")) {
    throw new NonRetriableError("Nom de dépôt de sortie invalide.");
  }
  const requested = job.outputRepoId?.split("/")[1] ?? job.name;
  const organization = job.outputDestination === "platform" ? credentials.namespace : undefined;
  for (let attempt = 1; attempt <= REPO_NAME_ATTEMPTS; attempt++) {
    const name = attempt === 1 ? requested : `${requested}-${attempt}`;
    try {
      const { repoId } = await createModelRepo(
        { name, organization, private: job.outputRepoPrivate },
        hub,
      );
      await patchJob(jobId, { outputRepoId: repoId });
      await appendJobEvent(jobId, "log", `Dépôt de sortie créé : ${repoId}`);
      return { skipped: false };
    } catch (error) {
      if (error instanceof HubRepoExistsError) continue;
      if (error instanceof HubAuthError) {
        throw new NonRetriableError(
          "Hugging Face refuse la création du dépôt : vérifiez que votre token a bien le rôle « Write ».",
        );
      }
      throw error;
    }
  }
  throw new NonRetriableError(
    `Le nom de dépôt « ${requested} » est déjà pris. Choisissez-en un autre.`,
  );
}

/** Starts the GPU run. Never starts a second run for the same job. */
export async function dispatchJob(jobId: string): Promise<{ runId: string }> {
  const job = await loadJob(jobId);
  if (job.providerRunId) return { runId: job.providerRunId };
  if (isTerminalStatus(job.status)) throw new NonRetriableError("Le job n'est plus actif.");

  const model = getBaseModel(job.baseModelId);
  const dataset = await getDataset(job.userId, job.datasetId);
  if (!model || !dataset?.normalizedFileKey || !dataset.format) {
    throw new NonRetriableError("Le modèle ou le dataset n'est plus disponible.");
  }

  const spec: TrainingSpec = {
    version: TRAINER_CONTRACT_VERSION,
    jobId,
    baseModel: { id: model.id, supportsSystemPrompt: model.supportsSystemPrompt },
    dataset: {
      url: await getStorage().presignDownload({
        key: dataset.normalizedFileKey,
        expiresInSeconds: DATASET_URL_TTL_SECONDS,
      }),
      format: dataset.format,
      sampleCount: dataset.sampleCount,
    },
    hyperparameters: job.hyperparameters,
    output: {
      repoId: job.outputRepoId ?? `${job.name}`,
      private: job.outputRepoPrivate,
      jobName: job.name,
    },
    callbacks: {
      eventsUrl: trainerCallbackUrl("/api/trainer/events"),
      credentialsUrl: trainerCallbackUrl("/api/trainer/credentials"),
    },
  };

  const provider = getTrainingProvider(job.provider);
  const { runId } = await provider.start(spec, { gpu: model.gpu });
  await patchJob(jobId, { providerRunId: runId });

  // The user may have cancelled while the run was being started.
  const current = await loadJob(jobId);
  if (current.status === "cancelled") {
    await provider.cancel(runId);
    return { runId };
  }

  const where =
    provider.id === "modal"
      ? `GPU ${model.gpu}`
      : provider.id === "local"
        ? "trainer local"
        : "simulateur";
  await appendJobEvent(jobId, "log", `Entraînement lancé (${where}, run ${runId})`);
  return { runId };
}

export type HealthCheck =
  | { state: "running" }
  | { state: "finished"; status: FineTuneJobStatus }
  | { state: "stalled"; reason: string };

/** Detects runs that died without reporting (OOM kill, preemption, lost callbacks…). */
export async function checkJobHealth(jobId: string, nowMs = Date.now()): Promise<HealthCheck> {
  const job = await loadJob(jobId);
  if (isTerminalStatus(job.status)) return { state: "finished", status: job.status };

  const lastSign = job.lastEventAt ?? job.startedAt ?? job.updatedAt;
  const silentMs = nowMs - lastSign.getTime();
  if (silentMs < SILENCE_BEFORE_CHECK_MS) return { state: "running" };

  const runStatus = job.providerRunId
    ? await getTrainingProvider(job.provider)
        .getStatus(job.providerRunId)
        .catch(() => "unknown" as const)
    : "unknown";
  if (runStatus === "running" && silentMs < MAX_SILENCE_MS) return { state: "running" };

  const minutes = Math.round(silentMs / 60_000);
  return {
    state: "stalled",
    reason: `Le worker d'entraînement ne donne plus signe de vie depuis ${minutes} min (statut fournisseur : ${runStatus}).`,
  };
}

/** Reconciles the final state once the trainer reported its result. */
export async function finalizeJob(jobId: string, reported: "succeeded" | "failed") {
  const job = await loadJob(jobId);
  if (!isTerminalStatus(job.status)) {
    await transitionJob(jobId, reported, {
      finishedAt: new Date(),
      ...(reported === "succeeded" ? { progress: 1 } : {}),
    });
  }
  const final = await loadJob(jobId);
  return { status: final.status };
}

/** Called when the workflow gives up: records why and stops the GPU if needed. */
export async function failJob(jobId: string, reason: string): Promise<void> {
  const failed = await transitionJob(
    jobId,
    "failed",
    { error: reason, finishedAt: new Date() },
    {
      message: "Échec du fine-tuning",
    },
  );
  if (failed) await appendJobEvent(jobId, "log", reason, { level: "error" });
  await cancelProviderRun(jobId);
}

export async function cancelProviderRun(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job?.providerRunId) return;
  await getTrainingProvider(job.provider).cancel(job.providerRunId);
}
