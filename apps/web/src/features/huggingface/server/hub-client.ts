import { z } from "zod";

/**
 * Minimal Hugging Face Hub HTTP client. Phase 2 will add repo creation and
 * uploads; for now we only need to validate a token and read its identity.
 */

export class HubAuthError extends Error {
  constructor() {
    super("Invalid or revoked Hugging Face token");
    this.name = "HubAuthError";
  }
}

const whoAmISchema = z.object({
  name: z.string(),
  fullname: z.string().optional(),
  type: z.string(),
  auth: z
    .object({
      accessToken: z.object({ role: z.string() }).partial().optional(),
    })
    .optional(),
});

export interface HubIdentity {
  username: string;
  fullName?: string;
  /** "read" | "write" | "fineGrained" (or "unknown" if the Hub didn't say). */
  tokenRole: string;
}

export async function whoAmI(
  token: string,
  options: { endpoint: string; fetch?: typeof fetch; timeoutMs?: number },
): Promise<HubIdentity> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(new URL("/api/whoami-v2", options.endpoint), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    cache: "no-store",
  });

  // 401 is the Hub's answer for an unknown/revoked token; anything else is an outage.
  if (response.status === 401) throw new HubAuthError();
  if (!response.ok) throw new Error(`Hugging Face whoami failed with HTTP ${response.status}`);

  const data = whoAmISchema.parse(await response.json());
  return {
    username: data.name,
    fullName: data.fullname,
    tokenRole: data.auth?.accessToken?.role ?? "unknown",
  };
}
