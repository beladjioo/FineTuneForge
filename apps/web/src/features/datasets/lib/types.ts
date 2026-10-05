/**
 * Dataset domain types. This module is isomorphic (no Node/browser APIs) because the
 * same analysis code runs in the browser (instant preview) and on the server (source of truth).
 */

/** Canonical training formats, aligned with what TRL's SFTTrainer consumes natively. */
export const DATASET_FORMATS = ["text", "prompt_completion", "chat"] as const;
export type DatasetFormat = (typeof DATASET_FORMATS)[number];

export const DATASET_STATUSES = ["uploading", "processing", "ready", "failed"] as const;
export type DatasetStatus = (typeof DATASET_STATUSES)[number];

export const DATASET_SOURCES = ["file", "paste"] as const;
export type DatasetSource = (typeof DATASET_SOURCES)[number];

/** How the raw content is parsed (derived from the file extension). */
export const SOURCE_KINDS = ["txt", "jsonl", "json", "csv"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TextSample {
  text: string;
}

export interface PromptCompletionSample {
  prompt: string;
  completion: string;
}

export interface ChatSample {
  messages: ChatMessage[];
}

/** One line of the normalized JSONL file handed to the trainer. */
export type TrainingSample = TextSample | PromptCompletionSample | ChatSample;

/** The input layout that was recognized in the user's file. */
export const RECORD_SCHEMAS = [
  "plain_text",
  "text_field",
  "openai_messages",
  "sharegpt",
  "prompt_completion",
  "alpaca",
  "question_answer",
  "input_output",
] as const;
export type RecordSchema = (typeof RECORD_SCHEMAS)[number];

export type IssueSeverity = "error" | "warning" | "info";

export interface DatasetIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

/** A problem tied to one record of the source file (the record is skipped). */
export interface RowIssue extends DatasetIssue {
  /** 1-based line number (txt/jsonl/csv) or element index (json). */
  row: number;
}

export interface DatasetStats {
  sampleCount: number;
  totalChars: number;
  avgChars: number;
  minChars: number;
  maxChars: number;
  /** Rough estimate (~4 chars/token), good enough to size a training run. */
  estimatedTokens: number;
  /** Average number of messages per conversation (chat format only). */
  avgMessages?: number;
}

/** Persisted validation report (stored as JSONB on the dataset). */
export interface DatasetReport {
  sourceKind: SourceKind;
  recordSchema: RecordSchema | null;
  totalRecords: number;
  invalidRecords: number;
  duplicatesRemoved: number;
  fatalErrors: DatasetIssue[];
  warnings: DatasetIssue[];
  /** Capped list; `invalidRecords` holds the real total. */
  rowIssues: RowIssue[];
}
