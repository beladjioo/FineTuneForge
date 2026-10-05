import { describe, expect, it } from "vitest";
import {
  checkModelAccess,
  createModelRepo,
  HubAuthError,
  HubRepoExistsError,
  whoAmI,
} from "./hub-client";

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

describe("checkModelAccess", () => {
  const respond = (status: number) =>
    (async () => new Response(null, { status })) as unknown as typeof fetch;

  it.each([
    [200, "granted"],
    [302, "granted"],
    [403, "gated"],
    [401, "gated"],
    [404, "not_found"],
  ] as const)("maps HTTP %i to %s", async (status, expected) => {
    await expect(
      checkModelAccess("meta-llama/Llama-3.2-1B-Instruct", {
        endpoint,
        token: "hf_x",
        fetch: respond(status),
      }),
    ).resolves.toBe(expected);
  });
});

describe("createModelRepo", () => {
  it("returns the repo id and flags conflicts", async () => {
    const ok = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        type: "model",
        name: "bot",
        organization: "acme",
        private: true,
      });
      return new Response(JSON.stringify({ url: "https://huggingface.co/acme/bot" }), {
        status: 200,
      });
    }) as typeof fetch;
    await expect(
      createModelRepo(
        { name: "bot", organization: "acme", private: true },
        { endpoint, token: "t", fetch: ok },
      ),
    ).resolves.toEqual({ repoId: "acme/bot" });

    const conflict = (async () => new Response("{}", { status: 409 })) as unknown as typeof fetch;
    await expect(
      createModelRepo({ name: "bot", private: false }, { endpoint, token: "t", fetch: conflict }),
    ).rejects.toBeInstanceOf(HubRepoExistsError);
  });
});
