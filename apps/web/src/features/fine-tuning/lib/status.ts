import type { FineTuneJobStatus } from "../types";

/**
 * Job state machine:
 *   queued → preparing → training → evaluating → uploading → succeeded
 *   any non-terminal state → failed | cancelled
 * Steps may be skipped (e.g. training → uploading) but never go backwards,
 * which makes late or duplicated worker events harmless.
 */

const PIPELINE: readonly FineTuneJobStatus[] = [
  "queued",
  "preparing",
  "training",
  "evaluating",
  "uploading",
  "succeeded",
];

export const TERMINAL_STATUSES: readonly FineTuneJobStatus[] = ["succeeded", "failed", "cancelled"];

export function isTerminalStatus(status: FineTuneJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActiveStatus(status: FineTuneJobStatus): boolean {
  return !isTerminalStatus(status);
}

export function canTransition(from: FineTuneJobStatus, to: FineTuneJobStatus): boolean {
  if (isTerminalStatus(from) || from === to) return false;
  if (to === "failed" || to === "cancelled") return true;
  return PIPELINE.indexOf(to) > PIPELINE.indexOf(from);
}

/** Statuses from which a transition to `to` is allowed (for guarded SQL updates). */
export function allowedSourceStatuses(to: FineTuneJobStatus): FineTuneJobStatus[] {
  return [...PIPELINE, "failed", "cancelled"].filter((from) =>
    canTransition(from as FineTuneJobStatus, to),
  ) as FineTuneJobStatus[];
}
