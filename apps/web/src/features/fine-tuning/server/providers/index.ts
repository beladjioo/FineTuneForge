import "server-only";
import { env } from "@/server/env";
import type { TrainingProvider as ProviderId } from "../../types";
import { HttpTrainingProvider } from "./http";
import { SimulatedTrainingProvider } from "./simulated";
import type { TrainingProvider } from "./types";

export type { ProviderRunStatus, TrainingProvider } from "./types";

/** Provider used for new jobs (TRAINING_PROVIDER). */
export function defaultProviderId(): "simulated" | "local" | "modal" {
  return env.TRAINING_PROVIDER;
}

/** Provider of an existing job: a job keeps the provider it was created with. */
export function getTrainingProvider(id: ProviderId): TrainingProvider {
  switch (id) {
    case "simulated":
      return new SimulatedTrainingProvider();
    case "local":
    case "modal":
      if (!env.TRAINER_URL || !env.TRAINER_API_SECRET) {
        throw new Error(`TRAINER_URL and TRAINER_API_SECRET are required for the ${id} provider`);
      }
      return new HttpTrainingProvider(id, env.TRAINER_URL, env.TRAINER_API_SECRET);
    case "runpod":
      throw new Error("The RunPod provider is not implemented yet");
  }
}
