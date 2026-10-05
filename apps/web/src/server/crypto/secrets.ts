import "server-only";
import { env } from "../env";
import { decrypt, encrypt } from "./aes-gcm";

/** Secret encryption bound to the application key (ENCRYPTION_KEY). */

const key = (): Buffer => Buffer.from(env.ENCRYPTION_KEY, "base64");

export function encryptSecret(plaintext: string, context: string): string {
  return encrypt(plaintext, key(), context);
}

export function decryptSecret(payload: string, context: string): string {
  return decrypt(payload, key(), context);
}

/** "hf_abcdefgh1234" → "hf_…1234": safe to display, useless to an attacker. */
export function secretHint(secret: string): string {
  const prefix = secret.startsWith("hf_") ? "hf_" : "";
  return `${prefix}…${secret.slice(-4)}`;
}
