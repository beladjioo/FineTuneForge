import { z } from "zod";
import type { LoraHyperparameters, TrainingPreset } from "../types";

/**
 * LoRA presets. Values follow common practice for SFT of 1B–7B instruct models:
 * lr 1e-4–2e-4, alpha = 2 × rank, all linear layers targeted.
 */

export type NamedPreset = Exclude<TrainingPreset, "custom">;

export interface PresetDefinition {
  label: string;
  summary: string;
  hyperparameters: LoraHyperparameters;
}

const common = {
  loraDropout: 0.05,
  batchSize: 4,
  warmupRatio: 0.03,
  targetModules: "all-linear",
} as const;

export const PRESETS: Record<NamedPreset, PresetDefinition> = {
  beginner: {
    label: "Débutant",
    summary: "Rapide et sans risque : idéal pour un premier essai.",
    hyperparameters: {
      ...common,
      loraRank: 8,
      loraAlpha: 16,
      learningRate: 2e-4,
      epochs: 2,
      gradientAccumulationSteps: 2,
      maxSeqLength: 1024,
    },
  },
  intermediate: {
    label: "Intermédiaire",
    summary: "L'équilibre recommandé entre qualité, durée et coût.",
    hyperparameters: {
      ...common,
      loraRank: 16,
      loraAlpha: 32,
      learningRate: 2e-4,
      epochs: 3,
      gradientAccumulationSteps: 4,
      maxSeqLength: 2048,
    },
  },
  advanced: {
    label: "Avancé",
    summary: "Plus de capacité d'apprentissage, pour des datasets riches.",
    hyperparameters: {
      ...common,
      loraRank: 32,
      loraAlpha: 64,
      learningRate: 1e-4,
      epochs: 4,
      gradientAccumulationSteps: 4,
      maxSeqLength: 2048,
    },
  },
};

export const LORA_RANKS = [4, 8, 16, 32, 64] as const;

/** Bounds for hand-tuned ("custom") hyperparameters. */
export const hyperparametersSchema = z.object({
  loraRank: z.union(LORA_RANKS.map((rank) => z.literal(rank))),
  loraAlpha: z.number().int().min(1).max(256),
  loraDropout: z.number().min(0).max(0.5),
  learningRate: z
    .number()
    .min(1e-6, "Learning rate trop faible.")
    .max(1e-3, "Learning rate trop élevé (max 0,001)."),
  epochs: z.number().int().min(1).max(10, "10 epochs maximum."),
  batchSize: z.number().int().min(1).max(32),
  gradientAccumulationSteps: z.number().int().min(1).max(32),
  maxSeqLength: z.number().int().min(128).max(8192),
  warmupRatio: z.number().min(0).max(0.2),
  targetModules: z.union([z.literal("all-linear"), z.array(z.string().min(1)).min(1)]),
});

/** Resolves the effective hyperparameters of a job request. */
export function resolveHyperparameters(
  preset: TrainingPreset,
  custom: LoraHyperparameters | undefined,
): LoraHyperparameters {
  if (preset === "custom") {
    if (!custom) throw new Error("Custom preset requires explicit hyperparameters");
    return custom;
  }
  return { ...PRESETS[preset].hyperparameters };
}

/** Keeps the sequence length within what the base model supports. */
export function clampToContext(
  hyperparameters: LoraHyperparameters,
  contextLength: number,
): LoraHyperparameters {
  return {
    ...hyperparameters,
    maxSeqLength: Math.min(hyperparameters.maxSeqLength, contextLength),
  };
}
