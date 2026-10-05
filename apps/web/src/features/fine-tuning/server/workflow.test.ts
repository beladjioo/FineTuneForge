import { InngestTestEngine } from "@inngest/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as orchestration from "./orchestration";
import { failureReason, runFineTune } from "./workflow";

vi.mock("./orchestration", () => ({
  prepareJob: vi.fn(),
  dispatchJob: vi.fn(),
  checkJobHealth: vi.fn(),
  finalizeJob: vi.fn(),
  failJob: vi.fn(),
  cancelProviderRun: vi.fn(),
}));

const jobId = "0b6a7d4e-5c3f-4a8e-9d21-7f1e2c3b4a5d";
const userId = "9c8b7a6d-5e4f-4321-8fed-cba987654321";
const mocked = vi.mocked(orchestration);

type TrainerOutcome = "succeeded" | "failed" | null;

/**
 * Runs the workflow with a fresh engine (it caches step mocks between executions).
 * `waits` scripts what each `step.waitForEvent` returns (null = timeout). The wait is
 * stubbed through `transformCtx` because @inngest/test 1.0 hands v4's event-schema
 * validation a lazy promise instead of the mocked event.
 */
function run(waits: TrainerOutcome[] = []) {
  return new InngestTestEngine({
    function: runFineTune,
    // Called once per execution: Inngest replays the function from the top for
    // every step, so the n-th wait of an execution must always get the same answer.
    transformCtx: (ctx) => {
      let call = 0;
      return {
        ...ctx,
        step: {
          ...ctx.step,
          waitForEvent: vi.fn(async () => {
            const status = waits[call++] ?? null;
            return status ? { name: "fine-tune/trainer.finished", data: { jobId, status } } : null;
          }),
        },
      } as typeof ctx;
    },
  }).execute({ events: [{ name: "fine-tune/job.requested", data: { jobId, userId } }] });
}

describe("run-fine-tune workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.prepareJob.mockResolvedValue({ skipped: false });
    mocked.dispatchJob.mockResolvedValue({ runId: "run-1" });
  });

  it("prepares, dispatches, waits for the trainer and finalizes", async () => {
    mocked.finalizeJob.mockResolvedValue({ status: "succeeded" });

    const { result } = await run(["succeeded"]);

    expect(result).toEqual({ status: "succeeded" });
    expect(mocked.prepareJob).toHaveBeenCalledWith(jobId, expect.any(String));
    expect(mocked.dispatchJob).toHaveBeenCalledWith(jobId);
    expect(mocked.finalizeJob).toHaveBeenCalledWith(jobId, "succeeded");
  });

  it("stops early when the job was cancelled before it started", async () => {
    mocked.prepareJob.mockResolvedValue({ skipped: true, status: "cancelled" });

    const { result } = await run();

    expect(result).toEqual({ status: "cancelled" });
    expect(mocked.dispatchJob).not.toHaveBeenCalled();
  });

  it("keeps waiting while the run is healthy, then finishes", async () => {
    mocked.checkJobHealth.mockResolvedValueOnce({ state: "running" });
    mocked.finalizeJob.mockResolvedValue({ status: "failed" });

    const { result } = await run([null, "failed"]);

    expect(result).toEqual({ status: "failed" });
    expect(mocked.checkJobHealth).toHaveBeenCalledTimes(1);
  });

  it("notices a job that finished while no wait was registered", async () => {
    mocked.checkJobHealth.mockResolvedValue({ state: "finished", status: "succeeded" });

    const { result } = await run([null]);

    expect(result).toEqual({ status: "succeeded" });
    expect(mocked.finalizeJob).not.toHaveBeenCalled();
  });

  it("fails without retrying when the worker went silent", async () => {
    mocked.checkJobHealth.mockResolvedValue({
      state: "stalled",
      reason: "Le worker ne répond plus.",
    });

    const { error } = await run([null]);

    expect(error).toMatchObject({
      name: "NonRetriableError",
      message: "Le worker ne répond plus.",
    });
  });
});

describe("failureReason", () => {
  it("shows user-facing messages as-is and wraps unexpected errors", () => {
    expect(failureReason({ name: "NonRetriableError", message: "Acceptez la licence." })).toBe(
      "Acceptez la licence.",
    );
    expect(failureReason({ name: "Error", message: "ECONNRESET" })).toMatch(
      /plusieurs tentatives \(ECONNRESET\)/,
    );
  });
});
