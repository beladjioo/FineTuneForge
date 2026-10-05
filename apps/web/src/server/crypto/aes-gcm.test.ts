import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./aes-gcm";

const key = randomBytes(32);

describe("aes-gcm secrets", () => {
  it("round-trips a secret", () => {
    const payload = encrypt("hf_super_secret_token", key, "hf:user-1");
    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("hf_super_secret_token");
    expect(decrypt(payload, key, "hf:user-1")).toBe("hf_super_secret_token");
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encrypt("same", key, "ctx")).not.toBe(encrypt("same", key, "ctx"));
  });

  it("rejects a payload bound to another context", () => {
    const payload = encrypt("secret", key, "hf:user-1");
    expect(() => decrypt(payload, key, "hf:user-2")).toThrow();
  });

  it("rejects a tampered payload", () => {
    const [v, iv, tag, data] = encrypt("secret", key, "ctx").split(".");
    const tampered = [v, iv, tag, `${data?.slice(0, -2)}AA`].join(".");
    expect(() => decrypt(tampered, key, "ctx")).toThrow();
  });

  it("rejects the wrong key", () => {
    const payload = encrypt("secret", key, "ctx");
    expect(() => decrypt(payload, randomBytes(32), "ctx")).toThrow();
  });

  it("validates key length", () => {
    expect(() => encrypt("secret", randomBytes(16), "ctx")).toThrow(/32 bytes/);
  });
});
