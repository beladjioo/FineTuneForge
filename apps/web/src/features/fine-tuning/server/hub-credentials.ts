import "server-only";
import {
  getHuggingFaceConnection,
  getHuggingFaceToken,
} from "@/features/huggingface/server/credentials";
import { env } from "@/server/env";
import type { OutputDestination } from "../types";

/** A job cannot run because of the account's setup (shown to the user as-is). */
export class HubCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubCredentialsError";
  }
}

export interface HubCredentials {
  token: string;
  /** User name or organization that owns the output repo. */
  namespace: string;
}

export function isPlatformDestinationAvailable(): boolean {
  return Boolean(env.HF_PLATFORM_TOKEN && env.HF_PLATFORM_ORG);
}

/** Token and namespace used to publish a job's adapter. Never leaves the server. */
export async function resolveHubCredentials(job: {
  userId: string;
  outputDestination: OutputDestination;
}): Promise<HubCredentials> {
  if (job.outputDestination === "platform") {
    if (!env.HF_PLATFORM_TOKEN || !env.HF_PLATFORM_ORG) {
      throw new HubCredentialsError(
        "La publication sur le compte FineTuneForge n'est pas disponible.",
      );
    }
    return { token: env.HF_PLATFORM_TOKEN, namespace: env.HF_PLATFORM_ORG };
  }

  const [connection, token] = await Promise.all([
    getHuggingFaceConnection(job.userId),
    getHuggingFaceToken(job.userId),
  ]);
  if (!connection || !token) {
    throw new HubCredentialsError(
      "Votre compte Hugging Face n'est plus connecté. Reconnectez-le dans les paramètres puis relancez.",
    );
  }
  return { token, namespace: connection.hfUsername };
}
