import Papa from "papaparse";
import type { DatasetIssue, RowIssue, SourceKind } from "./types";

/** A record extracted from the source file, before schema normalization. */
export interface RawRecord {
  row: number;
  value: unknown;
}

export interface ParseResult {
  records: RawRecord[];
  /** Records that could not even be parsed (they count as invalid). */
  rowIssues: RowIssue[];
  /** File-level problem that makes the whole file unusable. */
  fatal?: DatasetIssue;
}

const fatal = (code: string, message: string): ParseResult => ({
  records: [],
  rowIssues: [],
  fatal: { severity: "error", code, message },
});

/** Plain text: one record per paragraph (blocks separated by at least one blank line). */
function parseText(content: string): ParseResult {
  const records: RawRecord[] = [];
  const lines = content.split(/\r?\n/);
  let block: string[] = [];
  let blockStart = 1;

  const flush = () => {
    const text = block.join("\n").trim();
    if (text) records.push({ row: blockStart, value: text });
    block = [];
  };

  lines.forEach((line, index) => {
    if (line.trim() === "") {
      flush();
      return;
    }
    if (block.length === 0) blockStart = index + 1;
    block.push(line);
  });
  flush();

  return { records, rowIssues: [] };
}

/** JSON Lines: one JSON value per non-empty line. */
function parseJsonl(content: string): ParseResult {
  const records: RawRecord[] = [];
  const rowIssues: RowIssue[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      records.push({ row: index + 1, value: JSON.parse(line) });
    } catch {
      rowIssues.push({
        severity: "error",
        code: "invalid_json",
        row: index + 1,
        message: "JSON invalide sur cette ligne.",
      });
    }
  });

  return { records, rowIssues };
}

/** JSON: a top-level array of records. */
function parseJson(content: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    return fatal("invalid_json", `Le fichier n'est pas un JSON valide${detail}.`);
  }
  if (!Array.isArray(value)) {
    return fatal(
      "json_not_array",
      "Le fichier JSON doit contenir un tableau d'objets : [{ … }, { … }]. Pour un objet par ligne, utilisez l'extension .jsonl.",
    );
  }
  return { records: value.map((item, index) => ({ row: index + 1, value: item })), rowIssues: [] };
}

/** CSV/TSV with a header row. Delimiter is auto-detected (`,` `;` tab…). */
function parseCsv(content: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  if (!result.meta.fields || result.meta.fields.length === 0) {
    return fatal("empty_csv", "Le CSV ne contient pas de ligne d'en-tête.");
  }

  const brokenRows = new Map<number, string>();
  for (const error of result.errors) {
    // Delimiter guessing failures are harmless (single-column files fall back to ",").
    if (error.type === "Delimiter" || error.row === undefined) continue;
    brokenRows.set(
      error.row,
      error.type === "FieldMismatch"
        ? "Nombre de colonnes incorrect (une virgule non échappée ?)."
        : "Guillemets mal fermés.",
    );
  }

  const records: RawRecord[] = [];
  const rowIssues: RowIssue[] = [];
  result.data.forEach((value, index) => {
    // +2: 1-based numbering and the header line. Approximate if a cell spans several lines.
    const row = index + 2;
    const problem = brokenRows.get(index);
    if (problem)
      rowIssues.push({ severity: "error", code: "invalid_csv_row", row, message: problem });
    else records.push({ row, value });
  });

  return { records, rowIssues };
}

export function parseContent(content: string, kind: SourceKind): ParseResult {
  switch (kind) {
    case "txt":
      return parseText(content);
    case "jsonl":
      return parseJsonl(content);
    case "json":
      return parseJson(content);
    case "csv":
      return parseCsv(content);
  }
}
