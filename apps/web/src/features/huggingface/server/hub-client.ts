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

export interface HubRequestOptions {
  endpoint: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function hubFetch(path: string, init: RequestInit, options: HubRequestOptions) {
  const doFetch = options.fetch ?? fetch;
  return doFetch(new URL(path, options.endpoint), {
    ...init,
    headers: { Authorization: `Bearer ${options.token}`, ...init.headers },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    cache: "no-store",
  });
}

export type ModelAccess = "granted" | "gated" | "not_found";

/**
 * Checks that `token` can download `modelId` — gated models (Llama, Gemma…) require
 * the account to accept the license on huggingface.co first.
 */
export async function checkModelAccess(
  modelId: string,
  options: HubRequestOptions,
): Promise<ModelAccess> {
  const response = await hubFetch(
    `/${modelId}/resolve/main/config.json`,
    { method: "HEAD", redirect: "manual" },
    options,
  );
  if (response.ok || (response.status >= 300 && response.status < 400)) return "granted";
  if (response.status === 401 || response.status === 403) return "gated";
  if (response.status === 404) return "not_found";
  throw new Error(`Hugging Face model access check failed with HTTP ${response.status}`);
}

export class HubRepoExistsError extends Error {
  constructor(readonly repoId: string) {
    super(`Repository ${repoId} already exists`);
    this.name = "HubRepoExistsError";
  }
}

/** Creates a model repo. `organization` is omitted to create it under the token owner. */
export async function createModelRepo(
  input: { name: string; organization?: string; private: boolean },
  options: HubRequestOptions,
): Promise<{ repoId: string }> {
  const response = await hubFetch(
    "/api/repos/create",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "model",
        name: input.name,
        organization: input.organization,
        private: input.private,
      }),
    },
    options,
  );

  if (response.status === 409) {
    throw new HubRepoExistsError(
      input.organization ? `${input.organization}/${input.name}` : input.name,
    );
  }
  if (response.status === 401 || response.status === 403) throw new HubAuthError();
  if (!response.ok)
    throw new Error(`Hugging Face repo creation failed with HTTP ${response.status}`);

  const data = z.object({ url: z.string() }).parse(await response.json());
  // url: https://huggingface.co/<namespace>/<name>
  return { repoId: new URL(data.url).pathname.replace(/^\/+/, "") };
}
