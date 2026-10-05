import { DATASET_LIMITS } from "./constants";
import { parseContent } from "./parse";
import {
  detectRecordSchema,
  isRecordObject,
  lowercaseKeys,
  RECORD_SCHEMA_ADAPTERS,
  type RecordObject,
} from "./record-schemas";
import { computeStats, sampleKey, sampleLength } from "./samples";
import { sourceKindFromFileName } from "./source";
import { splitLongText } from "./text-chunks";
import type {
  DatasetFormat,
  DatasetIssue,
  DatasetReport,
  DatasetStats,
  RecordSchema,
  RowIssue,
  SourceKind,
  TrainingSample,
} from "./types";

export interface AnalyzeInput {
  content: string;
  /** Used to pick the parser (extension) — pasted text gets a synthetic name. */
  fileName: string;
}

export interface DatasetAnalysis {
  format: DatasetFormat | null;
  /** Normalized, de-duplicated samples, ready to be written as JSONL. */
  samples: TrainingSample[];
  stats: DatasetStats | null;
  report: DatasetReport;
  canImport: boolean;
}

const error = (code: string, message: string): DatasetIssue => ({
  severity: "error",
  code,
  message,
});
const warning = (code: string, message: string): DatasetIssue => ({
  severity: "warning",
  code,
  message,
});
const info = (code: string, message: string): DatasetIssue => ({ severity: "info", code, message });

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count.toLocaleString("fr-FR")} ${count > 1 ? pluralForm : singular}`;

const ACCEPTED_LAYOUTS = RECORD_SCHEMA_ADAPTERS.map((adapter) => adapter.fields).join(" · ");

interface Normalized {
  format: DatasetFormat | null;
  recordSchema: RecordSchema | null;
  samples: TrainingSample[];
  rowIssues: RowIssue[];
  warnings: DatasetIssue[];
  fatal?: DatasetIssue;
}

function normalizeText(records: { row: number; value: unknown }[]): Normalized {
  const samples: TrainingSample[] = [];
  let splitParagraphs = 0;
  for (const record of records) {
    const chunks = splitLongText(String(record.value), DATASET_LIMITS.textChunkChars);
    if (chunks.length > 1) splitParagraphs++;
    for (const text of chunks) samples.push({ text });
  }
  return {
    format: "text",
    recordSchema: "plain_text",
    samples,
    rowIssues: [],
    warnings:
      splitParagraphs > 0
        ? [
            info(
              "long_paragraphs_split",
              `${plural(splitParagraphs, "paragraphe long a été découpé", "paragraphes longs ont été découpés")} en morceaux d'environ ${DATASET_LIMITS.textChunkChars.toLocaleString("fr-FR")} caractères.`,
            ),
          ]
        : [],
  };
}

function normalizeStructured(
  records: { row: number; value: unknown }[],
  kind: SourceKind,
): Normalized {
  const rowIssues: RowIssue[] = [];
  const objects: { row: number; record: RecordObject }[] = [];

  for (const { row, value } of records) {
    if (isRecordObject(value)) objects.push({ row, record: lowercaseKeys(value) });
    else {
      rowIssues.push({
        severity: "error",
        code: "not_an_object",
        row,
        message: "Chaque entrée doit être un objet JSON ({ … }).",
      });
    }
  }

  const adapter = detectRecordSchema(objects.map((item) => item.record));
  if (!adapter) {
    const found = [...new Set(objects.flatMap((item) => Object.keys(item.record)))].slice(0, 10);
    // "Colonnes" is feminine, "Champs" masculine: past participles must agree.
    const [label, agreement] = kind === "csv" ? ["Colonnes", "es"] : ["Champs", "s"];
    return {
      format: null,
      recordSchema: null,
      samples: [],
      rowIssues,
      warnings: [],
      fatal: error(
        "unknown_schema",
        `${label} non reconnu${agreement}${found.length ? ` (trouvé${agreement} : ${found.join(", ")})` : ""}. ${label} accepté${agreement} : ${ACCEPTED_LAYOUTS}.`,
      ),
    };
  }

  const samples: TrainingSample[] = [];
  const warningCounts = new Map<string, { message: string; count: number }>();

  for (const { row, record } of objects) {
    if (!adapter.matches(new Set(Object.keys(record)))) {
      rowIssues.push({
        severity: "error",
        code: "schema_mismatch",
        row,
        message: `Champs attendus : ${adapter.fields}.`,
      });
      continue;
    }
    const result = adapter.normalize(record);
    if (!result.ok) {
      rowIssues.push({ severity: "error", code: result.code, row, message: result.message });
      continue;
    }
    samples.push(result.sample);
    if (result.warning) {
      const entry = warningCounts.get(result.warning.code);
      if (entry) entry.count++;
      else warningCounts.set(result.warning.code, { message: result.warning.message, count: 1 });
    }
  }

  return {
    format: adapter.format,
    recordSchema: adapter.id,
    samples,
    rowIssues,
    warnings: [...warningCounts].map(([code, { message, count }]) =>
      warning(code, `${count.toLocaleString("fr-FR")} ${message}`),
    ),
  };
}

function emptyReport(sourceKind: SourceKind, fatalErrors: DatasetIssue[]): DatasetAnalysis {
  return {
    format: null,
    samples: [],
    stats: null,
    canImport: false,
    report: {
      sourceKind,
      recordSchema: null,
      totalRecords: 0,
      invalidRecords: 0,
      duplicatesRemoved: 0,
      fatalErrors,
      warnings: [],
      rowIssues: [],
    },
  };
}

/**
 * Parses, normalizes and validates a dataset. Pure and synchronous: runs identically
 * in the browser (instant feedback) and on the server (authoritative check).
 */
export function analyzeDataset({ content, fileName }: AnalyzeInput): DatasetAnalysis {
  const kind = sourceKindFromFileName(fileName);
  if (!kind) {
    return emptyReport("txt", [
      error(
        "unsupported_file_type",
        "Type de fichier non supporté. Formats acceptés : .txt, .jsonl, .json, .csv.",
      ),
    ]);
  }

  const text = content.replace(/^﻿/, "");
  if (text.includes("\u0000")) {
    return emptyReport(kind, [
      error(
        "binary_file",
        "Le fichier semble binaire. Exportez vos données en texte UTF-8 (.txt, .jsonl, .csv).",
      ),
    ]);
  }
  if (text.trim() === "") {
    return emptyReport(kind, [error("empty_file", "Le fichier est vide.")]);
  }

  const parsed = parseContent(text, kind);
  if (parsed.fatal) return emptyReport(kind, [parsed.fatal]);

  const normalized =
    kind === "txt" ? normalizeText(parsed.records) : normalizeStructured(parsed.records, kind);

  const rowIssues = [...parsed.rowIssues, ...normalized.rowIssues].sort((a, b) => a.row - b.row);
  const totalRecords = parsed.records.length + parsed.rowIssues.length;

  // De-duplicate exact copies: they only over-weight some examples.
  const seen = new Set<string>();
  const samples = normalized.samples.filter((sample) => {
    const key = sampleKey(sample);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const duplicatesRemoved = normalized.samples.length - samples.length;

  const fatalErrors: DatasetIssue[] = normalized.fatal ? [normalized.fatal] : [];
  const warnings: DatasetIssue[] = [...normalized.warnings];

  if (!normalized.fatal) {
    const count = samples.length;
    const textHint =
      kind === "txt" ? " Dans un fichier texte, séparez chaque exemple par une ligne vide." : "";

    if (count === 0) {
      fatalErrors.push(error("no_valid_samples", `Aucun exemple valide trouvé.${textHint}`));
    } else if (count < DATASET_LIMITS.minSamples) {
      fatalErrors.push(
        error(
          "too_few_samples",
          `Au moins ${DATASET_LIMITS.minSamples} exemples valides sont nécessaires (${plural(count, "trouvé")}).${textHint}`,
        ),
      );
    } else if (count > DATASET_LIMITS.maxSamples) {
      fatalErrors.push(
        error(
          "too_many_samples",
          `Maximum ${DATASET_LIMITS.maxSamples.toLocaleString("fr-FR")} exemples par dataset (${count.toLocaleString("fr-FR")} trouvés).`,
        ),
      );
    } else if (count < DATASET_LIMITS.recommendedMinSamples) {
      warnings.push(
        warning(
          "few_samples",
          `Seulement ${plural(count, "exemple")} : nous recommandons au moins ${DATASET_LIMITS.recommendedMinSamples} exemples pour un résultat convaincant.`,
        ),
      );
    }
  }

  if (rowIssues.length > 0) {
    warnings.push(
      warning(
        "invalid_records",
        `${plural(rowIssues.length, "entrée invalide sera ignorée", "entrées invalides seront ignorées")}.`,
      ),
    );
  }
  if (duplicatesRemoved > 0) {
    warnings.push(
      info(
        "duplicates_removed",
        `${plural(duplicatesRemoved, "doublon supprimé", "doublons supprimés")}.`,
      ),
    );
  }
  const longSamples = samples.filter(
    (sample) => sampleLength(sample) > DATASET_LIMITS.maxSampleChars,
  ).length;
  if (longSamples > 0) {
    warnings.push(
      warning(
        "long_samples",
        `${plural(longSamples, "exemple dépasse", "exemples dépassent")} ~8 000 tokens et ${longSamples > 1 ? "seront tronqués" : "sera tronqué"} pendant l'entraînement.`,
      ),
    );
  }

  const canImport = fatalErrors.length === 0 && normalized.format !== null;

  return {
    format: normalized.format,
    samples,
    stats: normalized.format ? computeStats(samples, normalized.format) : null,
    canImport,
    report: {
      sourceKind: kind,
      recordSchema: normalized.recordSchema,
      totalRecords,
      invalidRecords: rowIssues.length,
      duplicatesRemoved,
      fatalErrors,
      warnings,
      rowIssues: rowIssues.slice(0, DATASET_LIMITS.maxRowIssues),
    },
  };
}
