import { type BaseModel, GPUS } from "@/config/models";
import { CHARS_PER_TOKEN } from "@/features/datasets/lib/constants";
import type { LoraHyperparameters } from "../types";

/**
 * Rough training plan, shown before launch so non-experts know what to expect.
 * The train/eval split rule is part of the trainer contract (see services/trainer).
 */

export function evalSplitSize(sampleCount: number): number {
  return sampleCount >= 50 ? Math.min(200, Math.round(sampleCount * 0.1)) : 0;
}

/** Chat templates add role markers around each message (~8 tokens per turn). */
const TEMPLATE_TOKENS_PER_SAMPLE = 24;

export interface TrainingEstimate {
  trainSamples: number;
  evalSamples: number;
  totalSteps: number;
  trainedTokens: number;
  /** Includes model download/loading and adapter upload. */
  estimatedSeconds: number;
}

export function estimateTraining(input: {
  model: Pick<BaseModel, "paramsB" | "gpu">;
  hyperparameters: Pick<
    LoraHyperparameters,
    "epochs" | "batchSize" | "gradientAccumulationSteps" | "maxSeqLength"
  >;
  sampleCount: number;
  avgChars: number;
}): TrainingEstimate {
  const { model, hyperparameters, sampleCount, avgChars } = input;
  const evalSamples = evalSplitSize(sampleCount);
  const trainSamples = sampleCount - evalSamples;

  const effectiveBatch = hyperparameters.batchSize * hyperparameters.gradientAccumulationSteps;
  const stepsPerEpoch = Math.max(1, Math.ceil(trainSamples / effectiveBatch));
  const totalSteps = stepsPerEpoch * hyperparameters.epochs;

  const tokensPerSample = Math.min(
    Math.ceil(avgChars / CHARS_PER_TOKEN) + TEMPLATE_TOKENS_PER_SAMPLE,
    hyperparameters.maxSeqLength,
  );
  const trainedTokens = trainSamples * tokensPerSample * hyperparameters.epochs;

  // Forward + backward ≈ 6 FLOPs per parameter per token.
  const params = model.paramsB * 1e9;
  const trainingSeconds = (trainedTokens * 6 * params) / (GPUS[model.gpu].effectiveTflops * 1e12);
  // Container start, model download/load, adapter upload.
  const overheadSeconds = 90 + model.paramsB * 25;

  return {
    trainSamples,
    evalSamples,
    totalSteps,
    trainedTokens,
    estimatedSeconds: Math.round(overheadSeconds + trainingSeconds),
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return "~1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `~${hours} h` : `~${hours} h ${String(rest).padStart(2, "0")}`;
}
