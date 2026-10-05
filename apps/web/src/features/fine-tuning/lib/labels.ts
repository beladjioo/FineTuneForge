import type { FineTuneJobStatus, TrainingPreset } from "../types";

export const JOB_STATUS_LABELS: Record<FineTuneJobStatus, string> = {
  queued: "En file d'attente",
  preparing: "Préparation",
  training: "Entraînement",
  evaluating: "Évaluation",
  uploading: "Publication",
  succeeded: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};

export const PRESET_LABELS: Record<TrainingPreset, string> = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
  custom: "Personnalisé",
};
