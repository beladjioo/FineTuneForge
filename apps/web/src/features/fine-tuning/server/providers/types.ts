import type { GpuType } from "@/config/models";
import type { TrainingSpec } from "../../contract";

export type ProviderRunStatus = "running" | "finished" | "failed" | "unknown";

/** Where the GPU work runs. Implementations must be safe to call repeatedly. */
export interface TrainingProvider {
  readonly id: "simulated" | "local" | "modal";
  /** Whether runs talk to the Hugging Face Hub (gated-model check, repo creation, upload). */
  readonly usesHub: boolean;
  start(spec: TrainingSpec, options: { gpu: GpuType }): Promise<{ runId: string }>;
  cancel(runId: string): Promise<void>;
  getStatus(runId: string): Promise<ProviderRunStatus>;
}
