import { z } from "zod";
import type { GpuType } from "@/config/models";
import type { TrainingSpec } from "../../contract";
import type { ProviderRunStatus, TrainingProvider } from "./types";

const startResponseSchema = z.object({ runId: z.string().min(1) });
const statusResponseSchema = z.object({
  status: z.enum(["running", "finished", "failed", "unknown"]),
});

/**
 * Talks to the trainer's HTTP API. The same API is served by the local FastAPI
 * server (`local`) and by the Modal web endpoint (`modal`), see services/trainer.
 */
export class HttpTrainingProvider implements TrainingProvider {
  readonly usesHub = true;

  constructor(
    readonly id: "local" | "modal",
    private readonly baseUrl: string,
    private readonly apiSecret: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.doFetch(
      new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`),
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiSecret}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      },
    );
  }

  private async fail(response: Response, action: string): Promise<never> {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(
      `Trainer ${action} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  async start(spec: TrainingSpec, options: { gpu: GpuType }) {
    const response = await this.request("jobs", {
      method: "POST",
      body: JSON.stringify({ spec, gpu: options.gpu }),
    });
    if (!response.ok) return this.fail(response, "start");
    return startResponseSchema.parse(await response.json());
  }

  async cancel(runId: string) {
    const response = await this.request(`jobs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
    });
    if (!response.ok && response.status !== 404) await this.fail(response, "cancel");
  }

  async getStatus(runId: string): Promise<ProviderRunStatus> {
    const response = await this.request(`jobs/${encodeURIComponent(runId)}`);
    if (response.status === 404) return "unknown";
    if (!response.ok) return this.fail(response, "status");
    return statusResponseSchema.parse(await response.json()).status;
  }
}
