import { describe, expect, it } from "vitest";
import { assertSafeKey } from "./keys";
import { signStorageToken, verifyStorageToken } from "./signed-token";

const secret = "test-secret-test-secret-test-secret";
const future = Math.floor(Date.now() / 1000) + 60;

describe("storage tokens", () => {
  it("verifies a valid token", () => {
    const token = signStorageToken(
      { op: "put", key: "users/u/a.txt", exp: future, max: 10 },
      secret,
    );
    expect(verifyStorageToken(token, secret)).toMatchObject({
      op: "put",
      key: "users/u/a.txt",
      max: 10,
    });
  });

  it("rejects an expired token", () => {
    const token = signStorageToken({ op: "get", key: "k", exp: future }, secret);
    expect(verifyStorageToken(token, secret, (future + 1) * 1000)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signStorageToken({ op: "get", key: "k", exp: future }, "other-secret");
    expect(verifyStorageToken(token, secret)).toBeNull();
  });

  it("rejects a token whose payload was modified", () => {
    const token = signStorageToken({ op: "get", key: "users/a/x", exp: future }, secret);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ op: "get", key: "users/b/x", exp: future }),
    ).toString("base64url");
    expect(verifyStorageToken(`${forged}.${signature}`, secret)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyStorageToken("not-a-token", secret)).toBeNull();
  });
});

describe("assertSafeKey", () => {
  it.each(["users/u1/datasets/d1/original.csv", "a.txt"])("accepts %s", (key) => {
    expect(() => assertSafeKey(key)).not.toThrow();
  });

  it.each([
    "../etc/passwd",
    "/abs/path",
    "users/../../x",
    "users//x",
    "users/x y",
  ])("rejects %s", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });
});
