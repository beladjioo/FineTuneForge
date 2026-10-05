import { z } from "zod";
import { hyperparametersSchema } from "./lib/presets";
import { REPO_NAME_PATTERN } from "./lib/repo-name";
import { OUTPUT_DESTINATIONS, TRAINING_PRESETS } from "./types";

export const createFineTuneJobSchema = z
  .object({
    datasetId: z.uuid("Choisissez un dataset."),
    baseModelId: z.string().min(1, "Choisissez un modèle."),
    preset: z.enum(TRAINING_PRESETS),
    hyperparameters: hyperparametersSchema.optional(),
    name: z
      .string()
      .trim()
      .min(1, "Donnez un nom à votre modèle.")
      .max(80, "80 caractères maximum."),
    repoName: z
      .string()
      .trim()
      .regex(
        REPO_NAME_PATTERN,
        "Nom de dépôt invalide : minuscules, chiffres, « - », « _ » ou « . » (96 caractères max).",
      ),
    private: z.boolean(),
    destination: z.enum(OUTPUT_DESTINATIONS),
  })
  .refine((input) => input.preset !== "custom" || input.hyperparameters !== undefined, {
    message: "Renseignez les paramètres personnalisés.",
    path: ["hyperparameters"],
  });

export type CreateFineTuneJobInput = z.infer<typeof createFineTuneJobSchema>;

export const jobIdSchema = z.object({ jobId: z.uuid("Identifiant de job invalide.") });
