import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "@/server/db";
import { type FineTuneJob, fineTuneJobEvents, fineTuneJobs } from "@/server/db/schema";
import { JOB_STATUS_LABELS } from "../lib/labels";
import { allowedSourceStatuses } from "../lib/status";
import type { FineTuneJobStatus, JobEventType } from "../types";

/** Appends an app-side event to a job's timeline (trainer events go through ingestion). */
export async function appendJobEvent(
  jobId: string,
  type: JobEventType,
  message: string,
  data?: Record<string, unknown>,
  executor: Executor = db,
): Promise<void> {
  await executor.insert(fineTuneJobEvents).values({ jobId, type, message, data });
}

export type JobPatch = Partial<
  Pick<
    FineTuneJob,
    | "progress"
    | "metrics"
    | "error"
    | "startedAt"
    | "finishedAt"
    | "outputRepoId"
    | "providerRunId"
    | "orchestratorRunId"
    | "attempt"
    | "lastEventAt"
  >
>;

interface TransitionOptions {
  /** Timeline message (defaults to the status label). */
  message?: string;
  /** Set to false when the caller already recorded an event for this change. */
  recordEvent?: boolean;
  executor?: Executor;
}

/**
 * Moves a job to `to` only if the state machine allows it from the current status.
 * The guard lives in the SQL `WHERE`, so concurrent writers (workflow, trainer
 * callbacks, user cancellation) can never move a job backwards or out of a final state.
 * Returns whether the transition happened.
 */
export async function transitionJob(
  jobId: string,
  to: FineTuneJobStatus,
  patch: JobPatch = {},
  { message, recordEvent = true, executor = db }: TransitionOptions = {},
): Promise<boolean> {
  const [row] = await executor
    .update(fineTuneJobs)
    .set({ ...patch, status: to })
    .where(and(eq(fineTuneJobs.id, jobId), inArray(fineTuneJobs.status, allowedSourceStatuses(to))))
    .returning({ id: fineTuneJobs.id });

  if (row && recordEvent) {
    await appendJobEvent(
      jobId,
      "status",
      message ?? JOB_STATUS_LABELS[to],
      { status: to },
      executor,
    );
  }
  return Boolean(row);
}

export async function patchJob(jobId: string, patch: JobPatch, executor: Executor = db) {
  await executor.update(fineTuneJobs).set(patch).where(eq(fineTuneJobs.id, jobId));
}
