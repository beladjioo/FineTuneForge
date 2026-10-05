import { describe, expect, it } from "vitest";
import { type JobEventView, mergeEvents, metricPoints } from "./live";

const event = (
  id: number,
  type: JobEventView["type"],
  data: Record<string, unknown> | null = null,
) => ({
  id,
  type,
  message: null,
  data,
  createdAt: new Date(0).toISOString(),
});

describe("metricPoints", () => {
  it("keeps metric events only, sorted by step, merging train and eval values", () => {
    const points = metricPoints([
      event(3, "metric", { step: 20, trainLoss: 0.9, epoch: 1 }),
      event(1, "log"),
      event(2, "metric", { step: 10, trainLoss: 1.4 }),
      event(4, "metric", { step: 20, evalLoss: 1.1 }),
      event(5, "metric", { step: Number.NaN }),
    ]);
    expect(points).toEqual([
      { step: 10, epoch: undefined, trainLoss: 1.4, evalLoss: undefined },
      { step: 20, epoch: 1, trainLoss: 0.9, evalLoss: 1.1 },
    ]);
  });
});

describe("mergeEvents", () => {
  it("appends unseen events in id order and ignores replays", () => {
    const current = [event(1, "log"), event(2, "log")];
    const merged = mergeEvents(current, [event(2, "log"), event(4, "log"), event(3, "log")]);
    expect(merged.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(mergeEvents(current, [event(1, "log")])).toBe(current);
  });
});

import { nearestIndex, niceTicks } from "./lib/chart";

describe("chart helpers", () => {
  it("produces round ticks covering the range", () => {
    expect(niceTicks(0.43, 2.31)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(niceTicks(0, 120, 5)).toEqual([0, 25, 50, 75, 100, 125]);
    expect(niceTicks(1, 1).length).toBeGreaterThan(1);
  });

  it("finds the nearest step", () => {
    expect(nearestIndex([10, 20, 30], 24)).toBe(1);
    expect(nearestIndex([10, 20, 30], 1000)).toBe(2);
  });
});
