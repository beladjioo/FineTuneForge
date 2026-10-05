import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact HMAC-signed tokens that let the local storage driver emulate S3 presigned
 * URLs: `<base64url(json payload)>.<base64url(hmac-sha256)>`.
 */

export interface StorageTokenPayload {
  op: "put" | "get";
  key: string;
  /** Expiry, unix epoch seconds. */
  exp: number;
  /** Max upload size in bytes (put only). */
  max?: number;
  /** Download file name (get only). */
  fn?: string;
}

const PURPOSE = "ftf-local-storage";

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${PURPOSE}:${data}`).digest();
}

export function signStorageToken(payload: StorageTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body, secret).toString("base64url")}`;
}

export function verifyStorageToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): StorageTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = hmac(body, secret);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as StorageTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < nowMs) return null;
    if (payload.op !== "put" && payload.op !== "get") return null;
    if (typeof payload.key !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
