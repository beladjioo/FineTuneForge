import { z } from "zod";
import { trainerEventSchema } from "@/features/fine-tuning/contract";
import { ingestTrainerEvent } from "@/features/fine-tuning/server/ingest";
import { env } from "@/server/env";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyTrainerSignature,
} from "@/server/trainer-signature";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Trainer → web progress callbacks (HMAC-signed, see trainer-signature.ts).
 * 409 tells the trainer the job is no longer active (e.g. cancelled): it must stop.
 */
export async function POST(request: Request) {
  const secret = env.TRAINER_CALLBACK_SECRET;
  if (!secret) return Response.json({ error: "callbacks_disabled" }, { status: 404 });

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

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
  const parsed = trainerEventSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_event", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const result = await ingestTrainerEvent(parsed.data);
  switch (result.outcome) {
    case "accepted":
    case "duplicate":
      return Response.json({ ok: true, outcome: result.outcome });
    case "not_found":
      return Response.json({ error: "job_not_found" }, { status: 404 });
    case "inactive":
      return Response.json({ error: "job_inactive", status: result.jobStatus }, { status: 409 });
  }
}
