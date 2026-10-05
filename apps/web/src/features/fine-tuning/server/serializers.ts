import type { FineTuneJob } from "@/server/db/schema";
import type { JobEventView, JobSnapshot } from "../live";
import type { JobEventRow } from "./queries";

export function toJobSnapshot(job: FineTuneJob): JobSnapshot {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    metrics: job.metrics ?? null,
    error: job.error,
    outputRepoId: job.outputRepoId,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toJobEventView(event: JobEventRow): JobEventView {
  return {
    id: event.id,
    type: event.type,
    message: event.message,
    data: event.data ?? null,
    createdAt: event.createdAt.toISOString(),
  };
}
