import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC signature of trainer → web callbacks (mirrored in services/trainer).
 *   X-FTF-Timestamp: unix seconds
 *   X-FTF-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
 * The timestamp is signed too, and old requests are rejected (replay protection).
 */

export const SIGNATURE_HEADER = "x-ftf-signature";
export const TIMESTAMP_HEADER = "x-ftf-timestamp";
const MAX_SKEW_SECONDS = 300;

export function signTrainerPayload(body: string, secret: string, timestamp: number): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyTrainerSignature(input: {
  body: string;
  secret: string;
  signature: string | null;
  timestamp: string | null;
  nowMs?: number;
}): boolean {
  const { body, secret, signature, timestamp } = input;
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;

  const ts = Number(timestamp);
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;

  const expected = Buffer.from(signTrainerPayload(body, secret, ts));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
