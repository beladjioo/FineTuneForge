import "server-only";
import { Inngest } from "inngest";

/**
 * Durable workflow engine for long-running jobs (fine-tuning runs last minutes to
 * hours, far beyond a serverless request). Locally, `pnpm inngest:dev` runs the dev
 * server; in production the SDK reads INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({ id: "finetuneforge" });
