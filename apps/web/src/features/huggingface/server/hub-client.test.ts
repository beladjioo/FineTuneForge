import { describe, expect, it } from "vitest";
import { HubAuthError, whoAmI } from "./hub-client";

const endpoint = "https://hub.test";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://hub.test/api/whoami-v2");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer hf_test");
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("whoAmI", () => {
  it("returns the identity and token role", async () => {
    const identity = await whoAmI("hf_test", {
      endpoint,
      fetch: fakeFetch(200, {
        name: "alice",
        fullname: "Alice",
        type: "user",
        auth: { type: "access_token", accessToken: { displayName: "ftf", role: "write" } },
      }),
    });
    expect(identity).toEqual({ username: "alice", fullName: "Alice", tokenRole: "write" });
  });

  it("throws HubAuthError on 401", async () => {
    await expect(whoAmI("hf_test", { endpoint, fetch: fakeFetch(401, {}) })).rejects.toBeInstanceOf(
      HubAuthError,
    );
  });

  it.each([403, 503])("throws a generic (non-auth) error on HTTP %i", async (status) => {
    const promise = whoAmI("hf_test", { endpoint, fetch: fakeFetch(status, {}) });
    await expect(promise).rejects.toThrow(String(status));
    await expect(promise).rejects.not.toBeInstanceOf(HubAuthError);
  });
});
