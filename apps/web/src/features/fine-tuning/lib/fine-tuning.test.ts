import { describe, expect, it } from "vitest";
import { BASE_MODELS, getBaseModel, listBaseModels } from "@/config/models";
import { trainerEventSchema } from "../contract";
import { estimateTraining, evalSplitSize, formatDuration } from "./estimate";
import { clampToContext, hyperparametersSchema, PRESETS, resolveHyperparameters } from "./presets";
import { REPO_NAME_PATTERN, toRepoName, withSuffix } from "./repo-name";
import { allowedSourceStatuses, canTransition, isTerminalStatus } from "./status";

describe("model catalog", () => {
  it("has unique ids and hides dev-only models when asked", () => {
    const ids = BASE_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(listBaseModels({ includeDevOnly: false }).some((model) => model.devOnly)).toBe(false);
    expect(getBaseModel("Qwen/Qwen2.5-1.5B-Instruct")?.gpu).toBe("A10G");
    expect(getBaseModel("unknown/model")).toBeUndefined();
  });
});

describe("presets", () => {
  it("all presets satisfy the custom bounds", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(hyperparametersSchema.safeParse(preset.hyperparameters).success).toBe(true);
    }
  });

  it("resolves presets by copy and requires values for custom", () => {
    const resolved = resolveHyperparameters("beginner", undefined);
    resolved.epochs = 99;
    expect(PRESETS.beginner.hyperparameters.epochs).toBe(2);
    expect(() => resolveHyperparameters("custom", undefined)).toThrow();
  });

  it("rejects out-of-range custom values", () => {
    const bad = { ...PRESETS.intermediate.hyperparameters, learningRate: 0.01, loraRank: 12 };
    const result = hyperparametersSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("clamps the sequence length to the model context", () => {
    expect(clampToContext(PRESETS.advanced.hyperparameters, 1024).maxSeqLength).toBe(1024);
  });
});

describe("estimateTraining", () => {
  it("computes steps from the train split and effective batch size", () => {
    const estimate = estimateTraining({
      model: { paramsB: 1.5, gpu: "A10G" },
      hyperparameters: {
        epochs: 3,
        batchSize: 4,
        gradientAccumulationSteps: 4,
        maxSeqLength: 2048,
      },
      sampleCount: 1000,
      avgChars: 400,
    });
    expect(estimate.evalSamples).toBe(100);
    expect(estimate.trainSamples).toBe(900);
    expect(estimate.totalSteps).toBe(57 * 3);
    expect(estimate.trainedTokens).toBe(900 * (100 + 24) * 3);
    expect(estimate.estimatedSeconds).toBeGreaterThan(90);
  });

  it("never plans zero steps and skips the eval split on tiny datasets", () => {
    expect(evalSplitSize(20)).toBe(0);
    expect(evalSplitSize(5000)).toBe(200);
    const estimate = estimateTraining({
      model: { paramsB: 0.5, gpu: "L4" },
      hyperparameters: {
        epochs: 1,
        batchSize: 32,
        gradientAccumulationSteps: 32,
        maxSeqLength: 512,
      },
      sampleCount: 12,
      avgChars: 100,
    });
    expect(estimate.totalSteps).toBe(1);
  });

  it("formats durations for humans", () => {
    expect(formatDuration(30)).toBe("~1 min");
    expect(formatDuration(600)).toBe("~10 min");
    expect(formatDuration(3600 * 2 + 300)).toBe("~2 h 05");
  });
});

describe("job state machine", () => {
  it("moves forward, allows skipping, never goes back", () => {
    expect(canTransition("queued", "preparing")).toBe(true);
    expect(canTransition("training", "uploading")).toBe(true);
    expect(canTransition("uploading", "training")).toBe(false);
    expect(canTransition("training", "training")).toBe(false);
  });

  it("can fail or be cancelled from any active state, and terminal states are final", () => {
    expect(canTransition("training", "failed")).toBe(true);
    expect(canTransition("queued", "cancelled")).toBe(true);
    expect(canTransition("succeeded", "failed")).toBe(false);
    expect(canTransition("cancelled", "training")).toBe(false);
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("lists valid source statuses for guarded updates", () => {
    expect(allowedSourceStatuses("training").sort()).toEqual(["preparing", "queued"]);
    expect(allowedSourceStatuses("cancelled")).not.toContain("succeeded");
  });
});

describe("repo names", () => {
  it("produces valid Hugging Face repo names", () => {
    expect(toRepoName("Assistant Support — Été 2026 !")).toBe("assistant-support-ete-2026");
    expect(toRepoName("***")).toBe("mon-modele");
    expect(toRepoName("a".repeat(200))).toHaveLength(96);
    for (const name of ["Assistant Support", "x", "-a-", "llama 3.2 1b"]) {
      expect(toRepoName(name)).toMatch(REPO_NAME_PATTERN);
    }
    expect(withSuffix("a".repeat(96), "2")).toHaveLength(96);
  });
});

describe("trainer events contract", () => {
  const jobId = "6f1c2b9e-8f43-4a3e-9d55-2f5b8f6f8a10";

  it("accepts the three event types", () => {
    for (const event of [
      { jobId, seq: 0, type: "status", status: "training" },
      { jobId, seq: 1, type: "metric", step: 10, totalSteps: 100, epoch: 0.3, trainLoss: 1.2 },
      { jobId, seq: 2, type: "log", level: "info", message: "Chargement du modèle" },
    ]) {
      expect(trainerEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects statuses the trainer may not set and non-finite metrics", () => {
    expect(
      trainerEventSchema.safeParse({ jobId, seq: 0, type: "status", status: "cancelled" }).success,
    ).toBe(false);
    expect(
      trainerEventSchema.safeParse({
        jobId,
        seq: 0,
        type: "metric",
        step: 1,
        totalSteps: 2,
        epoch: 0,
        trainLoss: Number.NaN,
      }).success,
    ).toBe(false);
  });
});
