import { eventType } from "inngest";
import { z } from "zod";

/** Typed workflow events (validated by the Inngest SDK with these schemas). */

export const fineTuneRequested = eventType("fine-tune/job.requested", {
  schema: z.object({ jobId: z.uuid(), userId: z.uuid() }),
});

export const fineTuneCancelRequested = eventType("fine-tune/job.cancel-requested", {
  schema: z.object({ jobId: z.uuid() }),
});

/** Emitted when the trainer reports a terminal status (see trainer events route). */
export const trainerFinished = eventType("fine-tune/trainer.finished", {
  schema: z.object({ jobId: z.uuid(), status: z.enum(["succeeded", "failed"]) }),
});
