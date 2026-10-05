import type { FineTuneJobStatus, JobEventType, JobMetrics } from "./types";

/**
 * Serializable job state shared by the job page (initial render) and the live
 * stream (`/api/fine-tunes/[jobId]/stream`).
 */

export interface JobSnapshot {
  id: string;
  status: FineTuneJobStatus;
  progress: number;
  metrics: JobMetrics | null;
  error: string | null;
  outputRepoId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface JobEventView {
  id: number;
  type: JobEventType;
  message: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface MetricPoint {
  step: number;
  epoch?: number;
  trainLoss?: number;
  evalLoss?: number;
}

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Metric events → chart points, sorted by step, last value wins per step. */
export function metricPoints(events: readonly JobEventView[]): MetricPoint[] {
  const byStep = new Map<number, MetricPoint>();
  for (const event of events) {
    if (event.type !== "metric" || !event.data) continue;
    const step = num(event.data.step);
    if (step === undefined) continue;
    const previous = byStep.get(step) ?? { step };
    byStep.set(step, {
      step,
      epoch: num(event.data.epoch) ?? previous.epoch,
      trainLoss: num(event.data.trainLoss) ?? previous.trainLoss,
      evalLoss: num(event.data.evalLoss) ?? previous.evalLoss,
    });
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

export function mergeEvents(current: JobEventView[], incoming: JobEventView[]): JobEventView[] {
  if (incoming.length === 0) return current;
  const known = new Set(current.map((event) => event.id));
  const fresh = incoming.filter((event) => !known.has(event.id));
  return fresh.length === 0 ? current : [...current, ...fresh].sort((a, b) => a.id - b.id);
}
