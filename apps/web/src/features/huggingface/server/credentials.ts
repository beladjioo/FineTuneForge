import "server-only";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, secretHint } from "@/server/crypto/secrets";
import { db } from "@/server/db";
import { hfCredentials } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { HubAuthError, type HubIdentity, whoAmI } from "./hub-client";

/** Binds each ciphertext to its owner (AES-GCM additional authenticated data). */
const encryptionContext = (userId: string) => `hf_token:${userId}`;

export interface HuggingFaceConnection {
  hfUsername: string;
  tokenHint: string;
  tokenRole: string;
  validatedAt: Date;
}

/** Public view of the connection: never includes the token itself. */
export async function getHuggingFaceConnection(
  userId: string,
): Promise<HuggingFaceConnection | null> {
  const [row] = await db
    .select({
      hfUsername: hfCredentials.hfUsername,
      tokenHint: hfCredentials.tokenHint,
      tokenRole: hfCredentials.tokenRole,
      validatedAt: hfCredentials.validatedAt,
    })
    .from(hfCredentials)
    .where(eq(hfCredentials.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Decrypted token, for server-side Hub calls only (training uploads, Spaces…). */
export async function getHuggingFaceToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ encryptedToken: hfCredentials.encryptedToken })
    .from(hfCredentials)
    .where(eq(hfCredentials.userId, userId))
    .limit(1);
  return row ? decryptSecret(row.encryptedToken, encryptionContext(userId)) : null;
}

/** Validates the token against the Hub, then stores it encrypted. */
export async function connectHuggingFace(
  userId: string,
  token: string,
): Promise<HuggingFaceConnection> {
  let identity: HubIdentity;
  try {
    identity = await whoAmI(token, { endpoint: env.HF_ENDPOINT });
  } catch (error) {
    if (error instanceof HubAuthError) {
      throw new AppError("Ce token Hugging Face est invalide ou a été révoqué.");
    }
    console.error("[huggingface] whoami failed", error);
    throw new AppError("Impossible de joindre Hugging Face pour vérifier le token. Réessayez.");
  }

  if (identity.tokenRole === "read") {
    throw new AppError(
      "Ce token est en lecture seule. Créez un token avec le rôle « Write » pour pouvoir publier vos modèles et Spaces.",
    );
  }

  const values = {
    encryptedToken: encryptSecret(token, encryptionContext(userId)),
    tokenHint: secretHint(token),
    tokenRole: identity.tokenRole,
    hfUsername: identity.username,
    validatedAt: new Date(),
  };

  await db
    .insert(hfCredentials)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: hfCredentials.userId, set: values });

  return {
    hfUsername: values.hfUsername,
    tokenHint: values.tokenHint,
    tokenRole: values.tokenRole,
    validatedAt: values.validatedAt,
  };
}

export async function disconnectHuggingFace(userId: string): Promise<void> {
  await db.delete(hfCredentials).where(eq(hfCredentials.userId, userId));
}
