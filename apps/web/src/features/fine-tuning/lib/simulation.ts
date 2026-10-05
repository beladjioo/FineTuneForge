/**
 * Synthetic training curves for the `simulated` provider: plausible enough to
 * build and demo the UI without a GPU (exponential decay + deterministic jitter).
 */

export function simulatedTrainLoss(step: number, totalSteps: number): number {
  const progress = totalSteps === 0 ? 1 : step / totalSteps;
  const jitter = Math.sin(step * 1.7) * 0.04;
  return round(0.45 + 1.9 * Math.exp(-4 * progress) + jitter);
}

export function simulatedEvalLoss(epoch: number, epochs: number): number {
  return round(0.55 + 1.7 * Math.exp((-3.5 * epoch) / Math.max(1, epochs)));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Keeps simulated runs short: between 12 and 48 steps whatever the dataset size. */
export function simulatedTotalSteps(realSteps: number): number {
  return Math.min(48, Math.max(12, realSteps));
}
