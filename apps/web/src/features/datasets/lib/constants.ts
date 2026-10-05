/** Validation thresholds. Tuned for LoRA SFT on 1B–7B models. */
export const DATASET_LIMITS = {
  /** Below this, fine-tuning is pointless: import is blocked. */
  minSamples: 10,
  /** Below this, we warn that results will likely be weak. */
  recommendedMinSamples: 100,
  maxSamples: 100_000,
  /** ~8k tokens: longer samples get truncated by the trainer. */
  maxSampleChars: 32_000,
  /** Long .txt paragraphs are split into chunks of at most this size (~1k tokens). */
  textChunkChars: 4_000,
  /** Row-level issues kept in the report (the total is always counted). */
  maxRowIssues: 100,
  previewSamples: 20,
  previewFieldChars: 1_000,
} as const;

/** Rough chars-per-token ratio used for estimates (English/French text). */
export const CHARS_PER_TOKEN = 4;
