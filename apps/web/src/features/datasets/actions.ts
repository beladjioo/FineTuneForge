"use server";

import { revalidatePath } from "next/cache";
import { authedAction } from "@/server/action";
import { createDatasetUploadSchema, datasetIdSchema } from "./schemas";
import { createDatasetUpload, deleteDataset, finalizeDatasetUpload } from "./server/service";

export const createDatasetUploadAction = authedAction(
  createDatasetUploadSchema,
  async (input, { user }) => createDatasetUpload(user, input),
);

export const finalizeDatasetUploadAction = authedAction(
  datasetIdSchema,
  async ({ datasetId }, { user }) => {
    const result = await finalizeDatasetUpload(user, datasetId);
    revalidatePath("/datasets");
    revalidatePath("/dashboard");
    return result;
  },
);

export const deleteDatasetAction = authedAction(
  datasetIdSchema,
  async ({ datasetId }, { user }) => {
    await deleteDataset(user.id, datasetId);
    revalidatePath("/datasets");
    revalidatePath("/dashboard");
  },
);
