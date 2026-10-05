import "server-only";
import type { TrainingSpec } from "../../contract";
import { evalSplitSize } from "../../lib/estimate";
import { simulatedEvalLoss, simulatedTotalSteps, simulatedTrainLoss } from "../../lib/simulation";
import { ingestTrainerEvent } from "../ingest";
import type { ProviderRunStatus, TrainingProvider } from "./types";

/**
 * Fake trainer for local development: no GPU, no Python, no Hugging Face. It
 * emits the same events as the real trainer, through the same ingestion code,
 * so the whole pipeline (workflow, live UI) can be exercised end to end.
 * Runs inside the Node.js server process — development and demos only.
 */

const STEP_MS = 800;
/** Lets the workflow register its `waitForEvent` before the run can finish. */
const START_DELAY_MS = 2_000;

// Survives hot reloads in `next dev`.
const globalForSim = globalThis as unknown as { ftfSimulations?: Map<string, AbortController> };
if (!globalForSim.ftfSimulations) globalForSim.ftfSimulations = new Map();
const runs = globalForSim.ftfSimulations;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

async function simulate(spec: TrainingSpec, signal: AbortSignal): Promise<void> {
  let seq = 0;
  // Returns false once the job is no longer active (e.g. cancelled by the user).
  const emit = async (event: Record<string, unknown>) => {
    if (signal.aborted) return false;
    const result = await ingestTrainerEvent({ jobId: spec.jobId, seq: seq++, ...event } as never);
    return result.outcome === "accepted" || result.outcome === "duplicate";
  };
  const log = (message: string) => emit({ type: "log", level: "info", message });

  const { hyperparameters: hp, dataset } = spec;
  const evalSamples = evalSplitSize(dataset.sampleCount);
  const trainSamples = dataset.sampleCount - evalSamples;
  const realSteps =
    Math.max(1, Math.ceil(trainSamples / (hp.batchSize * hp.gradientAccumulationSteps))) *
    hp.epochs;
  const totalSteps = simulatedTotalSteps(realSteps);
  const stepsPerEpoch = totalSteps / hp.epochs;

  await sleep(START_DELAY_MS, signal);
  if (!(await emit({ type: "status", status: "preparing", message: "Préparation (simulation)" })))
    return;
  await log(`Téléchargement du modèle ${spec.baseModel.id} (simulé)`);
  await sleep(STEP_MS, signal);
  await log(`Dataset : ${trainSamples} exemples d'entraînement, ${evalSamples} d'évaluation`);
  await log(
    `LoRA r=${hp.loraRank}, alpha=${hp.loraAlpha}, lr=${hp.learningRate}, ${hp.epochs} epochs, ${totalSteps} steps`,
  );
  if (!(await emit({ type: "status", status: "training", message: "Entraînement en cours" })))
    return;

  for (let step = 1; step <= totalSteps; step++) {
    await sleep(STEP_MS, signal);
    const epoch = Math.round((step / stepsPerEpoch) * 100) / 100;
    const endOfEpoch = Number.isInteger(step / stepsPerEpoch);
    const ok = await emit({
      type: "metric",
      step,
      totalSteps,
      epoch,
      trainLoss: simulatedTrainLoss(step, totalSteps),
      learningRate: hp.learningRate * (1 - step / totalSteps),
      ...(endOfEpoch && evalSamples > 0 ? { evalLoss: simulatedEvalLoss(epoch, hp.epochs) } : {}),
    });
    if (!ok) return;
    if (endOfEpoch) await log(`Epoch ${Math.round(epoch)}/${hp.epochs} terminée`);
  }

  if (!(await emit({ type: "status", status: "uploading", message: "Publication (simulée)" })))
    return;
  await sleep(STEP_MS, signal);
  await emit({
    type: "status",
    status: "succeeded",
    message: "Simulation terminée — aucun modèle n'a été publié sur Hugging Face.",
    result: {
      repoId: spec.output.repoId,
      trainLoss: simulatedTrainLoss(totalSteps, totalSteps),
      ...(evalSamples > 0 ? { evalLoss: simulatedEvalLoss(hp.epochs, hp.epochs) } : {}),
    },
  });
}

export class SimulatedTrainingProvider implements TrainingProvider {
  readonly id = "simulated" as const;
  readonly usesHub = false;

  async start(spec: TrainingSpec) {
    const runId = `sim-${spec.jobId}`;
    if (!runs.has(runId)) {
      const controller = new AbortController();
      runs.set(runId, controller);
      simulate(spec, controller.signal)
        .catch((error) => console.error(`[simulated-trainer] run ${runId} crashed`, error))
        .finally(() => runs.delete(runId));
    }
    return { runId };
  }

  async cancel(runId: string) {
    runs.get(runId)?.abort();
  }

  async getStatus(runId: string): Promise<ProviderRunStatus> {
    return runs.has(runId) ? "running" : "unknown";
  }
}
