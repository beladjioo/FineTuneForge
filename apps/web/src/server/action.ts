import "server-only";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { getSession, type SessionUser } from "./auth/session";
import { AppError } from "./errors";

interface ActionContext {
  user: SessionUser;
}

/**
 * Wraps a Server Action with the three things every mutation needs:
 * authentication, input validation (zod) and error normalization.
 *
 *   export const renameDataset = authedAction(schema, async (input, { user }) => { … });
 */
export function authedAction<Schema extends z.ZodType, Output>(
  schema: Schema,
  handler: (input: z.output<Schema>, context: ActionContext) => Promise<Output>,
): (input: z.input<Schema>) => Promise<ActionResult<Output>> {
  return async (input) => {
    const session = await getSession();
    if (!session) return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Données invalides.",
        fieldErrors: fieldErrors as Record<string, string[] | undefined>,
      };
    }

    try {
      return { ok: true, data: await handler(parsed.data, { user: session.user }) };
    } catch (error) {
      if (error instanceof AppError) return { ok: false, error: error.message };
      console.error("[action] unexpected error", error);
      return { ok: false, error: "Une erreur inattendue est survenue. Réessayez." };
    }
  };
}
