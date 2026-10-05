import { describe, expect, it } from "vitest";
import { signTrainerPayload, verifyTrainerSignature } from "./trainer-signature";

const secret = "callback-secret";
const body = '{"jobId":"x","seq":1}';
const now = 1_800_000_000;

describe("trainer signatures", () => {
  it("accepts a fresh, correctly signed payload", () => {
    const signature = signTrainerPayload(body, secret, now);
    expect(
      verifyTrainerSignature({
        body,
        secret,
        signature,
        timestamp: String(now),
        nowMs: now * 1000,
      }),
    ).toBe(true);
  });

  it("matches the Python implementation's format", () => {
    // hmac.new(b"callback-secret", b'1800000000.{"jobId":"x","seq":1}', sha256).hexdigest()
    expect(signTrainerPayload(body, secret, now)).toBe(
      "sha256=b69517110157ca68f39179c47756c7ee7014e5e9f714b7497c954b010775490b",
    );
  });

  it("rejects a modified body, a wrong secret or a stale timestamp", () => {
    const signature = signTrainerPayload(body, secret, now);
    const base = { secret, signature, timestamp: String(now), nowMs: now * 1000 };
    expect(verifyTrainerSignature({ ...base, body: `${body} ` })).toBe(false);
    expect(verifyTrainerSignature({ ...base, body, secret: "other" })).toBe(false);
    expect(verifyTrainerSignature({ ...base, body, nowMs: (now + 301) * 1000 })).toBe(false);
    expect(verifyTrainerSignature({ ...base, body, timestamp: null })).toBe(false);
  });
});
