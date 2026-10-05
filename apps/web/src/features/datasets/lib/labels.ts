import type { DatasetFormat, DatasetStatus, RecordSchema } from "./types";

/** User-facing labels (French UI). */

export const FORMAT_LABELS: Record<DatasetFormat, string> = {
  text: "Texte brut",
  prompt_completion: "Instruction → Réponse",
  chat: "Conversations",
};

export const FORMAT_DESCRIPTIONS: Record<DatasetFormat, string> = {
  text: "Le modèle apprend le style et le vocabulaire de vos textes.",
  prompt_completion: "Le modèle apprend à répondre à une consigne comme dans vos exemples.",
  chat: "Le modèle apprend à converser comme l'assistant de vos conversations.",
};

export const RECORD_SCHEMA_LABELS: Record<RecordSchema, string> = {
  plain_text: "paragraphes séparés par une ligne vide",
  text_field: "champ « text »",
  openai_messages: "format OpenAI « messages »",
  sharegpt: "format ShareGPT « conversations »",
  prompt_completion: "prompt / completion",
  alpaca: "format Alpaca (instruction / input / output)",
  question_answer: "question / answer",
  input_output: "input / output",
};

export const STATUS_LABELS: Record<DatasetStatus, string> = {
  uploading: "Import en cours",
  processing: "Analyse en cours",
  ready: "Prêt",
  failed: "Échec",
};
