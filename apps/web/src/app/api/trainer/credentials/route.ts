import { z } from "zod";
import {
  HubCredentialsError,
  resolveHubCredentials,
} from "@/features/fine-tuning/server/hub-credentials";
import { getJobById } from "@/features/fine-tuning/server/queries";
import type { FineTuneJobStatus } from "@/features/fine-tuning/types";
import { env } from "@/server/env";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyTrainerSignature,
} from "@/server/trainer-signature";

/** The token is only handed out while a GPU run is legitimately in progress. */
const ACTIVE_STATUSES: readonly FineTuneJobStatus[] = [
  "preparing",
  "training",
  "evaluating",
  "uploading",
];

const requestSchema = z.object({ jobId: z.uuid() });

/**
 * Just-in-time Hugging Face credentials for the trainer (HMAC-signed request).
 * Keeping the token out of the training spec means neither the orchestrator nor
 * the GPU provider ever persists it.
 */
export async function POST(request: Request) {
  const secret = env.TRAINER_CALLBACK_SECRET;
  if (!secret) return Response.json({ error: "callbacks_disabled" }, { status: 404 });

  const body = await request.text();
  const signed = verifyTrainerSignature({
    body,
    secret,
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });
  if (!signed) return Response.json({ error: "invalid_signature" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const job = await getJobById(parsed.data.jobId);
  if (!job) return Response.json({ error: "job_not_found" }, { status: 404 });
  if (!ACTIVE_STATUSES.includes(job.status)) {
    return Response.json({ error: "job_inactive", status: job.status }, { status: 409 });
  }

  try {
    const { token, namespace } = await resolveHubCredentials(job);
    return Response.json(
      { hfToken: token, namespace },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HubCredentialsError) {
      return Response.json(
        { error: "credentials_unavailable", message: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
}
