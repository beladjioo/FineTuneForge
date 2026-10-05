import type { ChatMessage, ChatRole, DatasetFormat, RecordSchema, TrainingSample } from "./types";

/**
 * Recognized input layouts and how each one maps to a canonical training sample.
 * Field names are matched case-insensitively (records are lower-cased beforehand).
 */

export type RecordObject = Record<string, unknown>;

export type NormalizeResult =
  | { ok: true; sample: TrainingSample; warning?: { code: string; message: string } }
  | { ok: false; code: string; message: string };

export interface RecordSchemaAdapter {
  id: RecordSchema;
  format: DatasetFormat;
  /** Human-readable field list, used in error messages. */
  fields: string;
  matches(keys: ReadonlySet<string>): boolean;
  normalize(record: RecordObject): NormalizeResult;
}

const invalid = (code: string, message: string): NormalizeResult => ({ ok: false, code, message });

export function lowercaseKeys(value: RecordObject): RecordObject {
  const result: RecordObject = {};
  for (const [key, item] of Object.entries(value)) result[key.trim().toLowerCase()] = item;
  return result;
}

export function isRecordObject(value: unknown): value is RecordObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerces scalar values to trimmed strings; anything else is rejected. */
function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function requireText(record: RecordObject, field: string): string | NormalizeResult {
  const text = asText(record[field]);
  if (text === null || text === "") {
    return invalid("missing_field", `Le champ « ${field} » est vide ou manquant.`);
  }
  return text;
}

function firstKey(record: RecordObject, candidates: readonly string[]): string | undefined {
  return candidates.find((key) => record[key] !== undefined && record[key] !== null);
}

/** Builds a prompt/completion adapter from alternative field names. */
function promptCompletionAdapter(options: {
  id: RecordSchema;
  fields: string;
  prompt: readonly string[];
  completion: readonly string[];
  /** Optional extra context appended to the prompt (Alpaca `input`, Dolly `context`). */
  context?: readonly string[];
}): RecordSchemaAdapter {
  const hasAny = (keys: ReadonlySet<string>, names: readonly string[]) =>
    names.some((name) => keys.has(name));

  return {
    id: options.id,
    format: "prompt_completion",
    fields: options.fields,
    matches: (keys) => hasAny(keys, options.prompt) && hasAny(keys, options.completion),
    normalize(record) {
      const promptKey = firstKey(record, options.prompt) ?? options.prompt[0] ?? "prompt";
      const completionKey =
        firstKey(record, options.completion) ?? options.completion[0] ?? "completion";

      const prompt = requireText(record, promptKey);
      if (typeof prompt !== "string") return prompt;
      const completion = requireText(record, completionKey);
      if (typeof completion !== "string") return completion;

      const contextKey = options.context ? firstKey(record, options.context) : undefined;
      const context = contextKey ? asText(record[contextKey]) : null;

      return {
        ok: true,
        sample: { prompt: context ? `${prompt}\n\n${context}` : prompt, completion },
      };
    },
  };
}

const ROLE_ALIASES: Record<string, ChatRole> = {
  system: "system",
  user: "user",
  human: "user",
  assistant: "assistant",
  gpt: "assistant",
  bot: "assistant",
  model: "assistant",
  ai: "assistant",
  chatgpt: "assistant",
};

/** Message content may be a string or OpenAI-style parts: [{ type: "text", text }]. */
function messageContent(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value
      .filter(isRecordObject)
      .map((part) => (typeof part.text === "string" ? part.text : null))
      .filter((text): text is string => text !== null);
    return parts.length > 0 ? parts.join("\n").trim() : null;
  }
  return asText(value);
}

/** Validates a conversation (OpenAI `{role, content}` or ShareGPT `{from, value}` messages). */
function normalizeConversation(raw: unknown, field: string): NormalizeResult {
  if (!Array.isArray(raw)) return invalid("invalid_messages", `« ${field} » doit être une liste.`);

  const messages: ChatMessage[] = [];
  for (const [index, item] of raw.entries()) {
    const position = index + 1;
    if (!isRecordObject(item)) {
      return invalid("invalid_message", `Le message n°${position} n'est pas un objet.`);
    }
    const entry = lowercaseKeys(item);
    const rawRole = asText(entry.role ?? entry.from)?.toLowerCase() ?? "";
    const role = ROLE_ALIASES[rawRole];
    if (!role) {
      return invalid(
        "invalid_role",
        `Rôle « ${rawRole || "?"} » non supporté (message n°${position}). Rôles acceptés : system, user, assistant.`,
      );
    }
    const content = messageContent(entry.content ?? entry.value);
    if (!content) return invalid("empty_message", `Le message n°${position} est vide.`);
    if (role === "system" && index !== 0) {
      return invalid(
        "system_position",
        "Le message « system » doit être le premier de la conversation.",
      );
    }
    messages.push({ role, content });
  }

  if (!messages.some((message) => message.role === "user")) {
    return invalid("missing_user", "La conversation ne contient aucun message « user ».");
  }
  if (!messages.some((message) => message.role === "assistant")) {
    return invalid(
      "missing_assistant",
      "La conversation ne contient aucune réponse « assistant ».",
    );
  }

  const turns = messages.filter((message) => message.role !== "system");
  const alternates = turns.every(
    (message, index) => index === 0 || message.role !== turns[index - 1]?.role,
  );

  return {
    ok: true,
    sample: { messages },
    ...(alternates
      ? {}
      : {
          warning: {
            code: "chat_not_alternating",
            message:
              "conversation(s) avec deux messages consécutifs du même rôle (certains modèles exigent une alternance user/assistant).",
          },
        }),
  };
}

function chatAdapter(id: RecordSchema, field: string): RecordSchemaAdapter {
  return {
    id,
    format: "chat",
    fields: field,
    matches: (keys) => keys.has(field),
    normalize: (record) => normalizeConversation(record[field], field),
  };
}

/** Ordered by priority: on equal match counts, the first adapter wins. */
export const RECORD_SCHEMA_ADAPTERS: readonly RecordSchemaAdapter[] = [
  chatAdapter("openai_messages", "messages"),
  chatAdapter("sharegpt", "conversations"),
  promptCompletionAdapter({
    id: "prompt_completion",
    fields: "prompt + completion",
    prompt: ["prompt"],
    completion: ["completion", "response"],
  }),
  promptCompletionAdapter({
    id: "alpaca",
    fields: "instruction + output (+ input)",
    prompt: ["instruction"],
    completion: ["output", "response"],
    context: ["input", "context"],
  }),
  promptCompletionAdapter({
    id: "question_answer",
    fields: "question + answer",
    prompt: ["question"],
    completion: ["answer"],
  }),
  promptCompletionAdapter({
    id: "input_output",
    fields: "input + output",
    prompt: ["input"],
    completion: ["output"],
  }),
  {
    id: "text_field",
    format: "text",
    fields: "text",
    matches: (keys) => keys.has("text"),
    normalize(record) {
      const text = requireText(record, "text");
      return typeof text === "string" ? { ok: true, sample: { text } } : text;
    },
  },
];

const DETECTION_SAMPLE_SIZE = 200;

/** Picks the adapter matching the most records among the first ones. */
export function detectRecordSchema(records: readonly RecordObject[]): RecordSchemaAdapter | null {
  const sample = records
    .slice(0, DETECTION_SAMPLE_SIZE)
    .map((record) => new Set(Object.keys(record)));
  let best: RecordSchemaAdapter | null = null;
  let bestCount = 0;

  for (const adapter of RECORD_SCHEMA_ADAPTERS) {
    const count = sample.filter((keys) => adapter.matches(keys)).length;
    if (count > bestCount) {
      best = adapter;
      bestCount = count;
    }
  }
  return best;
}
