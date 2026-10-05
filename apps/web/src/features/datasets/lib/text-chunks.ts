/**
 * Splits text longer than `maxChars` into chunks, preferring line breaks, then
 * sentence boundaries, and cutting mid-sentence only as a last resort.
 */

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += maxChars) {
    pieces.push(text.slice(start, start + maxChars));
  }
  return pieces;
}

/** Greedily packs units (each ≤ maxChars) into chunks of at most maxChars. */
function pack(units: readonly string[], maxChars: number, separator: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!current) {
      current = unit;
    } else if (current.length + separator.length + unit.length <= maxChars) {
      current += separator + unit;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const sentences = line
    .split(/(?<=[.!?…])\s+/)
    .flatMap((sentence) =>
      sentence.length <= maxChars ? [sentence] : hardSplit(sentence, maxChars),
    );
  return pack(sentences, maxChars, " ");
}

export function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const units = text.split("\n").flatMap((line) => splitLine(line, maxChars));
  return pack(units, maxChars, "\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}
