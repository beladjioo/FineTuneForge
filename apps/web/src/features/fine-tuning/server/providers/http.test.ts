import { describe, expect, it } from "vitest";
import type { TrainingSpec } from "../../contract";
import { HttpTrainingProvider } from "./http";

const spec = { jobId: "job-1" } as unknown as TrainingSpec;

function recordingFetch(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const doFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("unexpected call");
    return response;
  }) as typeof fetch;
  return { calls, doFetch };
}

describe("HttpTrainingProvider", () => {
  it("starts a run with the spec, GPU and bearer secret", async () => {
    const { calls, doFetch } = recordingFetch([Response.json({ runId: "fc-123" })]);
    const provider = new HttpTrainingProvider(
      "modal",
      "https://trainer.test/api",
      "s3cret",
      doFetch,
    );

    await expect(provider.start(spec, { gpu: "A10G" })).resolves.toEqual({ runId: "fc-123" });
    expect(calls[0]?.url).toBe("https://trainer.test/api/jobs");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer s3cret");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ spec, gpu: "A10G" });
  });

  it("surfaces trainer errors with their status", async () => {
    const { doFetch } = recordingFetch([new Response("boom", { status: 500 })]);
    const provider = new HttpTrainingProvider("local", "http://localhost:8000", "s", doFetch);
    await expect(provider.start(spec, { gpu: "L4" })).rejects.toThrow(/HTTP 500: boom/);
  });

  it("treats unknown runs as unknown / already cancelled", async () => {
    const { doFetch } = recordingFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 404 }),
      Response.json({ status: "running" }),
    ]);
    const provider = new HttpTrainingProvider("local", "http://localhost:8000/", "s", doFetch);
    await expect(provider.getStatus("x")).resolves.toBe("unknown");
    await expect(provider.cancel("x")).resolves.toBeUndefined();
    await expect(provider.getStatus("y")).resolves.toBe("running");
  });
});
