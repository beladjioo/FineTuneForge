import { CHARS_PER_TOKEN } from "./constants";
import type { DatasetFormat, DatasetStats, TrainingSample } from "./types";

/** Number of characters the model will actually see for a sample. */
export function sampleLength(sample: TrainingSample): number {
  if ("text" in sample) return sample.text.length;
  if ("prompt" in sample) return sample.prompt.length + sample.completion.length;
  return sample.messages.reduce((total, message) => total + message.content.length, 0);
}

/** Stable identity used for de-duplication. */
export function sampleKey(sample: TrainingSample): string {
  return JSON.stringify(sample);
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

/** Copy of a sample with long fields shortened — for previews stored in the database. */
export function truncateSample(sample: TrainingSample, maxChars: number): TrainingSample {
  if ("text" in sample) return { text: truncate(sample.text, maxChars) };
  if ("prompt" in sample) {
    return {
      prompt: truncate(sample.prompt, maxChars),
      completion: truncate(sample.completion, maxChars),
    };
  }
  return {
    messages: sample.messages.map((message) => ({
      role: message.role,
      content: truncate(message.content, maxChars),
    })),
  };
}

/** Serializes samples to JSON Lines, the format consumed by the trainer. */
export function toJsonl(samples: readonly TrainingSample[]): string {
  return samples.length === 0
    ? ""
    : `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`;
}

export function computeStats(
  samples: readonly TrainingSample[],
  format: DatasetFormat,
): DatasetStats | null {
  if (samples.length === 0) return null;

  let totalChars = 0;
  let minChars = Number.POSITIVE_INFINITY;
  let maxChars = 0;
  let totalMessages = 0;

  for (const sample of samples) {
    const length = sampleLength(sample);
    totalChars += length;
    minChars = Math.min(minChars, length);
    maxChars = Math.max(maxChars, length);
    if ("messages" in sample) totalMessages += sample.messages.length;
  }

  return {
    sampleCount: samples.length,
    totalChars,
    avgChars: Math.round(totalChars / samples.length),
    minChars,
    maxChars,
    estimatedTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
    ...(format === "chat"
      ? { avgMessages: Math.round((totalMessages / samples.length) * 10) / 10 }
      : {}),
  };
}
