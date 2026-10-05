import "server-only";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { inngest } from "@/server/inngest";
import { fineTuneCancelRequested, fineTuneRequested, trainerFinished } from "../events";
import {
  cancelProviderRun,
  checkJobHealth,
  dispatchJob,
  failJob,
  finalizeJob,
  prepareJob,
} from "./orchestration";

/** Each wait lasts this long before a health check; 48 rounds ≈ 8 h of training max. */
const WAIT_ROUND = "10m";
const MAX_WAIT_ROUNDS = 48;

/** Converts the final error of a run into the message stored on the job. */
export function failureReason(error: { name?: string; message?: string }): string {
  if (error.name === "NonRetriableError" && error.message) return error.message;
  return `Le fine-tuning a échoué après plusieurs tentatives (${error.message ?? "erreur inconnue"}). Réessayez ; si le problème persiste, contactez le support.`;
}

/**
 * Durable orchestration of one fine-tuning job:
 *   prepare (checks, output repo) → dispatch (GPU run) → wait for the trainer
 *   (with periodic health checks) → finalize.
 * Retries: 3 per step. Cancellation: `fine-tune/job.cancel-requested`.
 */
export const runFineTune = inngest.createFunction(
  {
    id: "run-fine-tune",
    name: "Fine-tuning LoRA",
    triggers: [fineTuneRequested],
    retries: 3,
    cancelOn: [{ event: fineTuneCancelRequested, match: "data.jobId" }],
    timeouts: { finish: "9h" },
    onFailure: async ({ event, error, step }) => {
      // The triggering event may itself be the problem (failed schema validation).
      const parsed = z.uuid().safeParse(event.data.event.data?.jobId);
      if (!parsed.success) return;
      await step.run("mark-job-failed", () => failJob(parsed.data, failureReason(error)));
    },
  },
  async ({ event, step, runId }) => {
    const { jobId } = event.data;

    const prepared = await step.run("prepare", () => prepareJob(jobId, runId));
    if (prepared.skipped) return { status: prepared.status };

    await step.run("dispatch", () => dispatchJob(jobId));

    for (let round = 0; round < MAX_WAIT_ROUNDS; round++) {
      const finished = await step.waitForEvent(`wait-for-trainer-${round}`, {
        event: trainerFinished,
        match: "data.jobId",
        timeout: WAIT_ROUND,
      });
      if (finished) {
        return step.run("finalize", () => finalizeJob(jobId, finished.data.status));
      }

      const health = await step.run(`check-health-${round}`, () => checkJobHealth(jobId));
      if (health.state === "finished") return { status: health.status };
      if (health.state === "stalled") throw new NonRetriableError(health.reason);
    }

    throw new NonRetriableError("Durée maximale d'entraînement dépassée (8 h).");
  },
);

/** Stops the GPU run of a cancelled job (the workflow itself is stopped by `cancelOn`). */
export const cancelTrainingRun = inngest.createFunction(
  {
    id: "cancel-training-run",
    name: "Annulation d'un entraînement",
    triggers: [fineTuneCancelRequested],
    retries: 5,
  },
  async ({ event, step }) => {
    await step.run("cancel-provider-run", () => cancelProviderRun(event.data.jobId));
  },
);

export const fineTuningFunctions = [runFineTune, cancelTrainingRun];
