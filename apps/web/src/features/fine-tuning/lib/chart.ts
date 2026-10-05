/** Small, dependency-free helpers for the loss chart. */

/** Round tick values (1, 2, 2.5, 5 × 10^n) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return niceTicks(min - pad, max + pad, target);
  }
  const rawStep = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((candidate) => candidate >= rawStep) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value / step) * step);
  }
  return ticks.map((tick) => Number(tick.toPrecision(12)));
}

/** Index of the point whose `step` is closest to `target` (points sorted by step). */
export function nearestIndex(steps: readonly number[], target: number): number {
  let best = 0;
  for (let index = 1; index < steps.length; index++) {
    if (Math.abs((steps[index] ?? 0) - target) < Math.abs((steps[best] ?? 0) - target))
      best = index;
  }
  return best;
}
