import { z } from "zod";

export const hfTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(
      /^hf_[A-Za-z0-9]{20,}$/,
      "Un token Hugging Face commence par « hf_ » suivi d'au moins 20 caractères.",
    ),
});
