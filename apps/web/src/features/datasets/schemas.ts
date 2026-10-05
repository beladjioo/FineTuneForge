import { z } from "zod";
import { DATASET_SOURCES } from "./lib/types";

/** Server Action inputs. Shared with forms for consistent client-side hints. */

export const createDatasetUploadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Donnez un nom à votre dataset.")
    .max(100, "100 caractères maximum."),
  description: z.string().trim().max(500, "500 caractères maximum.").optional(),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive("Le fichier est vide."),
  source: z.enum(DATASET_SOURCES),
});
export type CreateDatasetUploadInput = z.infer<typeof createDatasetUploadSchema>;

export const datasetIdSchema = z.object({
  datasetId: z.uuid("Identifiant de dataset invalide."),
});
