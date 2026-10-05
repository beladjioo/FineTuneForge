/**
 * Curated catalog of base models offered for LoRA fine-tuning.
 *
 * Only instruct/chat variants: users bring examples of the behavior they want,
 * and starting from an instruction-tuned model gets there with far less data.
 */

/** GPU classes, named after Modal's GPU identifiers. */
export const GPU_TYPES = ["L4", "A10G", "L40S", "A100-80GB"] as const;
export type GpuType = (typeof GPU_TYPES)[number];

export interface GpuSpec {
  label: string;
  vramGb: number;
  /** Sustained bf16 throughput actually reached by LoRA training (not the datasheet peak). */
  effectiveTflops: number;
}

export const GPUS: Record<GpuType, GpuSpec> = {
  L4: { label: "NVIDIA L4", vramGb: 24, effectiveTflops: 25 },
  A10G: { label: "NVIDIA A10G", vramGb: 24, effectiveTflops: 30 },
  L40S: { label: "NVIDIA L40S", vramGb: 48, effectiveTflops: 70 },
  "A100-80GB": { label: "NVIDIA A100 80 Go", vramGb: 80, effectiveTflops: 110 },
};

export type ModelBadge = "recommended" | "fast" | "multilingual" | "powerful";

export interface BaseModel {
  /** Hugging Face repo id. */
  id: string;
  name: string;
  publisher: string;
  /** Parameter count, in billions. */
  paramsB: number;
  contextLength: number;
  license: { label: string; url: string; commercialUse: boolean };
  /** Gated on Hugging Face: the user must accept the license with their account first. */
  gated: boolean;
  /** Some chat templates (Gemma, Mistral) reject a "system" role: it is merged into the first user turn. */
  supportsSystemPrompt: boolean;
  gpu: GpuType;
  description: string;
  badges: ModelBadge[];
  /** Tiny models for local CPU smoke tests; hidden in production. */
  devOnly?: boolean;
}

export const BASE_MODELS: readonly BaseModel[] = [
  {
    id: "Qwen/Qwen2.5-0.5B-Instruct",
    name: "Qwen 2.5 0.5B Instruct",
    publisher: "Alibaba",
    paramsB: 0.49,
    contextLength: 32_768,
    license: {
      label: "Apache 2.0",
      url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/blob/main/LICENSE",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "L4",
    description: "Minuscule et très rapide : idéal pour un premier essai ou des tâches simples.",
    badges: ["fast", "multilingual"],
  },
  {
    id: "meta-llama/Llama-3.2-1B-Instruct",
    name: "Llama 3.2 1B Instruct",
    publisher: "Meta",
    paramsB: 1.24,
    contextLength: 131_072,
    license: {
      label: "Llama 3.2 Community",
      url: "https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt",
      commercialUse: true,
    },
    gated: true,
    supportsSystemPrompt: true,
    gpu: "L4",
    description: "Petit modèle polyvalent, bon en français, parfait pour un chatbot léger.",
    badges: ["recommended", "fast"],
  },
  {
    id: "Qwen/Qwen2.5-1.5B-Instruct",
    name: "Qwen 2.5 1.5B Instruct",
    publisher: "Alibaba",
    paramsB: 1.54,
    contextLength: 32_768,
    license: {
      label: "Apache 2.0",
      url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "A10G",
    description: "Le meilleur compromis qualité / coût pour la plupart des cas d'usage.",
    badges: ["recommended", "multilingual"],
  },
  {
    id: "google/gemma-2-2b-it",
    name: "Gemma 2 2B Instruct",
    publisher: "Google",
    paramsB: 2.61,
    contextLength: 8_192,
    license: {
      label: "Gemma Terms of Use",
      url: "https://ai.google.dev/gemma/terms",
      commercialUse: true,
    },
    gated: true,
    supportsSystemPrompt: false,
    gpu: "A10G",
    description: "Très bonne qualité rédactionnelle pour sa taille.",
    badges: [],
  },
  {
    id: "meta-llama/Llama-3.2-3B-Instruct",
    name: "Llama 3.2 3B Instruct",
    publisher: "Meta",
    paramsB: 3.21,
    contextLength: 131_072,
    license: {
      label: "Llama 3.2 Community",
      url: "https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/blob/main/LICENSE.txt",
      commercialUse: true,
    },
    gated: true,
    supportsSystemPrompt: true,
    gpu: "A10G",
    description: "Plus de raisonnement que la version 1B, toujours rapide à entraîner.",
    badges: [],
  },
  {
    id: "Qwen/Qwen2.5-3B-Instruct",
    name: "Qwen 2.5 3B Instruct",
    publisher: "Alibaba",
    paramsB: 3.09,
    contextLength: 32_768,
    license: {
      label: "Qwen Research (non commercial)",
      url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE",
      commercialUse: false,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "A10G",
    description: "Excellent en multilingue et en données structurées (JSON, tableaux).",
    badges: ["multilingual"],
  },
  {
    id: "microsoft/Phi-3.5-mini-instruct",
    name: "Phi-3.5 mini Instruct",
    publisher: "Microsoft",
    paramsB: 3.82,
    contextLength: 131_072,
    license: {
      label: "MIT",
      url: "https://huggingface.co/microsoft/Phi-3.5-mini-instruct/blob/main/LICENSE",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "L40S",
    description: "Fort en raisonnement et en code, licence très permissive.",
    badges: ["powerful"],
  },
  {
    id: "Qwen/Qwen2.5-7B-Instruct",
    name: "Qwen 2.5 7B Instruct",
    publisher: "Alibaba",
    paramsB: 7.62,
    contextLength: 32_768,
    license: {
      label: "Apache 2.0",
      url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/blob/main/LICENSE",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "L40S",
    description: "Le plus capable du catalogue : pour des tâches exigeantes.",
    badges: ["powerful", "multilingual"],
  },
  {
    id: "mistralai/Mistral-7B-Instruct-v0.3",
    name: "Mistral 7B Instruct v0.3",
    publisher: "Mistral AI",
    paramsB: 7.25,
    contextLength: 32_768,
    license: {
      label: "Apache 2.0",
      url: "https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: false,
    gpu: "L40S",
    description: "Le modèle français de référence, robuste et bien documenté.",
    badges: ["powerful"],
  },
  {
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    name: "SmolLM2 135M Instruct (dev)",
    publisher: "Hugging Face",
    paramsB: 0.135,
    contextLength: 8_192,
    license: {
      label: "Apache 2.0",
      url: "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct",
      commercialUse: true,
    },
    gated: false,
    supportsSystemPrompt: true,
    gpu: "L4",
    description: "Modèle de test : s'entraîne en quelques minutes sur CPU.",
    badges: ["fast"],
    devOnly: true,
  },
];

export function listBaseModels(options: { includeDevOnly: boolean }): BaseModel[] {
  return BASE_MODELS.filter((model) => options.includeDevOnly || !model.devOnly);
}

export function getBaseModel(id: string): BaseModel | undefined {
  return BASE_MODELS.find((model) => model.id === id);
}

export const MODEL_BADGE_LABELS: Record<ModelBadge, string> = {
  recommended: "Recommandé",
  fast: "Rapide",
  multilingual: "Multilingue",
  powerful: "Puissant",
};
