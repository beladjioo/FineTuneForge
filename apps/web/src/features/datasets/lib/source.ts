import type { SourceKind } from "./types";

/** File extensions accepted by the uploader, mapped to how they are parsed. */
const EXTENSION_KINDS: Record<string, SourceKind> = {
  ".txt": "txt",
  ".md": "txt",
  ".jsonl": "jsonl",
  ".ndjson": "jsonl",
  ".json": "json",
  ".csv": "csv",
  ".tsv": "csv",
};

export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_KINDS);

const CONTENT_TYPES: Record<SourceKind, string> = {
  txt: "text/plain; charset=utf-8",
  jsonl: "application/x-ndjson",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
};

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function sourceKindFromFileName(fileName: string): SourceKind | null {
  return EXTENSION_KINDS[fileExtension(fileName)] ?? null;
}

export function contentTypeForKind(kind: SourceKind): string {
  return CONTENT_TYPES[kind];
}

function isJsonObjectLine(line: string): boolean {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

/**
 * Guesses how pasted text should be parsed: a JSON array, JSON Lines, or plain text.
 * Only the first non-empty lines are inspected, so this stays cheap on large pastes.
 */
export function detectPastedKind(content: string): Exclude<SourceKind, "csv"> {
  const trimmed = content.trim();
  if (trimmed.startsWith("[")) {
    try {
      if (Array.isArray(JSON.parse(trimmed))) return "json";
    } catch {
      // Not a JSON array: fall through.
    }
  }
  const firstLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (firstLines.length > 0 && firstLines.every(isJsonObjectLine)) return "jsonl";
  return "txt";
}

/** File name given to pasted content, so the server parses it the same way. */
export function pastedFileName(kind: Exclude<SourceKind, "csv">): string {
  return `texte-colle.${kind}`;
}
