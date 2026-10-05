/**
 * Fine-tuning domain types (Phase 2). Declared now because they shape the
 * `fine_tune_jobs` table and the contract with the GPU trainer.
 */

export const FINE_TUNE_JOB_STATUSES = [
  "queued",
  "preparing",
  "training",
  "evaluating",
  "uploading",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type FineTuneJobStatus = (typeof FINE_TUNE_JOB_STATUSES)[number];

export const TRAINING_PRESETS = ["beginner", "intermediate", "advanced", "custom"] as const;
export type TrainingPreset = (typeof TRAINING_PRESETS)[number];

/** Where the GPU work runs. `local` is for development on a workstation. */
export const TRAINING_PROVIDERS = ["modal", "runpod", "local"] as const;
export type TrainingProvider = (typeof TRAINING_PROVIDERS)[number];

export interface LoraHyperparameters {
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
  gradientAccumulationSteps: number;
  maxSeqLength: number;
  warmupRatio: number;
  /** PEFT target modules, or "all-linear" to let PEFT pick every linear layer. */
  targetModules: string[] | "all-linear";
}

/** Latest training metrics, denormalized on the job for cheap progress display. */
export interface JobMetrics {
  step?: number;
  totalSteps?: number;
  epoch?: number;
  trainLoss?: number;
  evalLoss?: number;
  learningRate?: number;
}

export interface JobEvaluation {
  perplexity?: number;
  baselinePerplexity?: number;
  samples: Array<{ prompt: string; baseOutput?: string; fineTunedOutput: string }>;
}

export const JOB_EVENT_TYPES = ["log", "metric", "status"] as const;
export type JobEventType = (typeof JOB_EVENT_TYPES)[number];
