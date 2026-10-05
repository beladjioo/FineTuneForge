import { z } from "zod";
import type { DatasetFormat } from "@/features/datasets/lib/types";
import type { LoraHyperparameters } from "./types";

/**
 * Wire contract between the web app and the GPU trainer (services/trainer).
 * Mirrored by `trainer/spec.py`: bump `TRAINER_CONTRACT_VERSION` on breaking changes.
 *
 *   web  → trainer   POST {TRAINER_URL}/jobs            TrainingSpec       (Bearer TRAINER_API_SECRET)
 *   web  → trainer   POST {TRAINER_URL}/jobs/{id}/cancel
 *   trainer → web    POST callbacks.eventsUrl           TrainerEvent       (HMAC, see trainer-signature.ts)
 *   trainer → web    POST callbacks.credentialsUrl      → { hfToken }      (HMAC, only while the job is active)
 *
 * The Hugging Face token is never part of the spec: the trainer fetches it just in
 * time, so it is not stored by the orchestrator or the GPU provider.
 */

export const TRAINER_CONTRACT_VERSION = 1;

export interface TrainingSpec {
  version: typeof TRAINER_CONTRACT_VERSION;
  jobId: string;
  baseModel: { id: string; supportsSystemPrompt: boolean };
  dataset: { url: string; format: DatasetFormat; sampleCount: number };
  hyperparameters: LoraHyperparameters;
  output: { repoId: string; private: boolean; jobName: string };
  callbacks: { eventsUrl: string; credentialsUrl: string };
}

const eventBase = {
  jobId: z.uuid(),
  /** Monotonic per run: makes retried deliveries idempotent. */
  seq: z.number().int().nonnegative(),
};

const finiteNumber = z.number().refine(Number.isFinite, "must be finite");

export const TRAINER_REPORTED_STATUSES = [
  "preparing",
  "training",
  "evaluating",
  "uploading",
  "succeeded",
  "failed",
] as const;

export const trainerEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("status"),
    status: z.enum(TRAINER_REPORTED_STATUSES),
    message: z.string().max(2000).optional(),
    result: z
      .object({
        repoId: z.string().max(200),
        trainLoss: finiteNumber.optional(),
        evalLoss: finiteNumber.optional(),
        runtimeSeconds: finiteNumber.optional(),
      })
      .optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("metric"),
    step: z.number().int().nonnegative(),
    totalSteps: z.number().int().positive(),
    epoch: finiteNumber,
    trainLoss: finiteNumber.optional(),
    evalLoss: finiteNumber.optional(),
    learningRate: finiteNumber.optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("log"),
    level: z.enum(["info", "warning", "error"]),
    message: z.string().max(4000),
  }),
]);

export type TrainerEvent = z.infer<typeof trainerEventSchema>;
