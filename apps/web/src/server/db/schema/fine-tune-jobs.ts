import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  JobEvaluation,
  JobMetrics,
  LoraHyperparameters,
} from "../../../features/fine-tuning/types";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { datasets } from "./datasets";
import {
  fineTuneJobStatusEnum,
  jobEventTypeEnum,
  outputDestinationEnum,
  trainingPresetEnum,
  trainingProviderEnum,
} from "./enums";

/**
 * A LoRA fine-tuning run (Phase 2).
 *
 * The orchestration (Inngest) owns status transitions; the GPU worker reports
 * progress through signed callbacks that append `fine_tune_job_events` and
 * refresh the denormalized `progress` / `metrics` columns.
 */
export const fineTuneJobs = pgTable(
  "fine_tune_jobs",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // `restrict`: a dataset used by a job cannot be deleted (reproducibility).
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "restrict" }),
    name: text("name").notNull(),

    /** Hugging Face repo id of the base model, e.g. "Qwen/Qwen2.5-1.5B-Instruct". */
    baseModelId: text("base_model_id").notNull(),
    preset: trainingPresetEnum("preset").notNull(),
    hyperparameters: jsonb("hyperparameters").$type<LoraHyperparameters>().notNull(),

    status: fineTuneJobStatusEnum("status").notNull().default("queued"),
    /** 0 → 1. */
    progress: real("progress").notNull().default(0),
    metrics: jsonb("metrics").$type<JobMetrics>(),
    evaluation: jsonb("evaluation").$type<JobEvaluation>(),

    provider: trainingProviderEnum("provider").notNull(),
    /** Run id on the GPU provider (Modal call id, RunPod job id…). */
    providerRunId: text("provider_run_id"),
    /** Inngest run id, to correlate logs and cancel. */
    orchestratorRunId: text("orchestrator_run_id"),
    attempt: integer("attempt").notNull().default(0),

    /** Namespace receiving the adapter: the user's HF account or the platform org. */
    outputDestination: outputDestinationEnum("output_destination").notNull().default("user"),
    /** Where the LoRA adapter is pushed, e.g. "alice/llama-3.2-1b-support-bot". */
    outputRepoId: text("output_repo_id"),
    outputRepoPrivate: boolean("output_repo_private").notNull().default(false),

    error: text("error"),
    /** Last event received from the trainer: drives the "worker went silent" watchdog. */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("fine_tune_jobs_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("fine_tune_jobs_dataset_id_idx").on(table.datasetId),
    index("fine_tune_jobs_status_idx").on(table.status),
  ],
);

/** Append-only timeline of a job: logs, metric points (loss curve) and status changes. */
export const fineTuneJobEvents = pgTable(
  "fine_tune_job_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => fineTuneJobs.id, { onDelete: "cascade" }),
    type: jobEventTypeEnum("type").notNull(),
    /** Trainer sequence number (null for events emitted by the app itself). */
    seq: integer("seq"),
    message: text("message"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("fine_tune_job_events_job_id_id_idx").on(table.jobId, table.id),
    // Retried deliveries of the same trainer event are ignored.
    uniqueIndex("fine_tune_job_events_job_id_seq_idx").on(table.jobId, table.seq),
  ],
);

export type FineTuneJob = typeof fineTuneJobs.$inferSelect;
export type NewFineTuneJob = typeof fineTuneJobs.$inferInsert;
export type FineTuneJobEvent = typeof fineTuneJobEvents.$inferSelect;
