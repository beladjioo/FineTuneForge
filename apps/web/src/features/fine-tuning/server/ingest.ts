import "server-only";
import { db } from "@/server/db";
import { fineTuneJobEvents } from "@/server/db/schema";
import { inngest } from "@/server/inngest";
import type { TrainerEvent } from "../contract";
import { trainerFinished } from "../events";
import { isTerminalStatus } from "../lib/status";
import type { JobMetrics } from "../types";
import { patchJob, transitionJob } from "./job-events";
import { getJobById } from "./queries";

export type IngestResult =
  | { outcome: "accepted" | "duplicate" }
  | { outcome: "not_found" }
  /** The job is final (cancelled, failed…): the trainer should stop. */
  | { outcome: "inactive"; jobStatus: string };

/** Wakes the workflow waiting on this job. The event id makes re-sends idempotent. */
async function notifyFinished(jobId: string, status: "succeeded" | "failed") {
  await inngest.send(
    trainerFinished.create({ jobId, status }, { id: `trainer-finished-${jobId}` }),
  );
}

function eventRow(event: TrainerEvent) {
  switch (event.type) {
    case "log":
      return { type: "log" as const, message: event.message, data: { level: event.level } };
    case "metric": {
      const { jobId: _jobId, seq: _seq, type: _type, ...data } = event;
      return { type: "metric" as const, message: null, data };
    }
    case "status":
      return {
        type: "status" as const,
        message: event.message ?? null,
        data: { status: event.status, ...(event.result ? { result: event.result } : {}) },
      };
  }
}

/**
 * Applies one trainer event: appends it to the timeline and updates the job, in a
 * single transaction. Safe to call several times with the same event (`seq` dedupe),
 * and in any order (forward-only state machine, monotonic metrics).
 */
export async function ingestTrainerEvent(event: TrainerEvent): Promise<IngestResult> {
  const job = await getJobById(event.jobId);
  if (!job) return { outcome: "not_found" };

  const finalStatus =
    event.type === "status" && (event.status === "succeeded" || event.status === "failed")
      ? event.status
      : null;

  if (isTerminalStatus(job.status)) {
    // A retried delivery of the final status: make sure the workflow heard about it.
    if (finalStatus && finalStatus === job.status) {
      await notifyFinished(job.id, finalStatus);
      return { outcome: "duplicate" };
    }
    return { outcome: "inactive", jobStatus: job.status };
  }

  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(fineTuneJobEvents)
      .values({ jobId: job.id, seq: event.seq, ...eventRow(event) })
      .onConflictDoNothing({ target: [fineTuneJobEvents.jobId, fineTuneJobEvents.seq] })
      .returning({ id: fineTuneJobEvents.id });
    if (inserted.length === 0) return "duplicate" as const;

    if (event.type === "log") {
      await patchJob(job.id, { lastEventAt: now }, tx);
    } else if (event.type === "metric") {
      const previous: JobMetrics = job.metrics ?? {};
      const isNewer = event.step >= (previous.step ?? 0);
      await patchJob(
        job.id,
        {
          lastEventAt: now,
          ...(isNewer
            ? {
                // Stays below 1 until the adapter is actually published.
                progress: Math.max(job.progress, Math.min(0.99, event.step / event.totalSteps)),
                metrics: {
                  ...previous,
                  step: event.step,
                  totalSteps: event.totalSteps,
                  epoch: event.epoch,
                  learningRate: event.learningRate ?? previous.learningRate,
                  trainLoss: event.trainLoss ?? previous.trainLoss,
                  evalLoss: event.evalLoss ?? previous.evalLoss,
                },
              }
            : {}),
        },
        tx,
      );
    } else if (event.status === "succeeded") {
      await transitionJob(
        job.id,
        "succeeded",
        {
          progress: 1,
          finishedAt: now,
          lastEventAt: now,
          outputRepoId: event.result?.repoId ?? job.outputRepoId,
          metrics: {
            ...job.metrics,
            trainLoss: event.result?.trainLoss ?? job.metrics?.trainLoss,
            evalLoss: event.result?.evalLoss ?? job.metrics?.evalLoss,
          },
        },
        { recordEvent: false, executor: tx },
      );
    } else if (event.status === "failed") {
      await transitionJob(
        job.id,
        "failed",
        { error: event.message ?? "L'entraînement a échoué.", finishedAt: now, lastEventAt: now },
        { recordEvent: false, executor: tx },
      );
    } else {
      const moved = await transitionJob(
        job.id,
        event.status,
        {
          lastEventAt: now,
          ...(event.status === "training" && !job.startedAt ? { startedAt: now } : {}),
        },
        { recordEvent: false, executor: tx },
      );
      if (!moved) await patchJob(job.id, { lastEventAt: now }, tx);
    }
    return "accepted" as const;
  });

  if (finalStatus) await notifyFinished(job.id, finalStatus);
  return { outcome };
}
