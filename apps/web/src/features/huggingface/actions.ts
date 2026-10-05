"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedAction } from "@/server/action";
import { hfTokenSchema } from "./schemas";
import { connectHuggingFace, disconnectHuggingFace } from "./server/credentials";

export const connectHuggingFaceAction = authedAction(hfTokenSchema, async ({ token }, { user }) => {
  const connection = await connectHuggingFace(user.id, token);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { hfUsername: connection.hfUsername };
});

export const disconnectHuggingFaceAction = authedAction(z.object({}), async (_input, { user }) => {
  await disconnectHuggingFace(user.id);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
});
