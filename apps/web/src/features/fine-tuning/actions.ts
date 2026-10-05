"use server";

import { revalidatePath } from "next/cache";
import { authedAction } from "@/server/action";
import { createFineTuneJobSchema, jobIdSchema } from "./schemas";
import { cancelFineTuneJob, createFineTuneJob } from "./server/service";

export const createFineTuneJobAction = authedAction(
  createFineTuneJobSchema,
  async (input, { user }) => {
    const result = await createFineTuneJob(user, input);
    revalidatePath("/fine-tunes");
    revalidatePath("/dashboard");
    return result;
  },
);

export const cancelFineTuneJobAction = authedAction(jobIdSchema, async ({ jobId }, { user }) => {
  await cancelFineTuneJob(user.id, jobId);
  revalidatePath("/fine-tunes");
  revalidatePath(`/fine-tunes/${jobId}`);
});
