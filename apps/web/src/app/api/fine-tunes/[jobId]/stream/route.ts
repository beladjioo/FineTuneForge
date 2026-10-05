import { z } from "zod";
import { isTerminalStatus } from "@/features/fine-tuning/lib/status";
import { getJob, listJobEvents } from "@/features/fine-tuning/server/queries";
import { toJobEventView, toJobSnapshot } from "@/features/fine-tuning/server/serializers";
import { getSession } from "@/server/auth/session";

/**
 * Live job updates over Server-Sent Events.
 *   event: job-event  (id = event id, resumable through Last-Event-ID)
 *   event: snapshot   (job status / progress / metrics)
 *   event: end        (job is final and fully delivered)
 * The stream closes after a few minutes; EventSource reconnects transparently
 * and resumes from the last event id (keeps serverless functions short).
 */

export const maxDuration = 300;

const POLL_MS = 1_000;
const HEARTBEAT_MS = 15_000;
const STREAM_LIFETIME_MS = 4 * 60 * 1000;

export async function GET(request: Request, ctx: RouteContext<"/api/fine-tunes/[jobId]/stream">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { jobId } = await ctx.params;
  if (!z.uuid().safeParse(jobId).success) return new Response("Not found", { status: 404 });
  const initial = await getJob(session.user.id, jobId);
  if (!initial) return new Response("Not found", { status: 404 });

  const lastEventId =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  let cursor = Number(lastEventId) > 0 ? Number(lastEventId) : 0;

  const encoder = new TextEncoder();
  const userId = session.user.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        const lines = [
          id === undefined ? null : `id: ${id}`,
          `event: ${event}`,
          `data: ${JSON.stringify(data)}`,
        ];
        controller.enqueue(encoder.encode(`${lines.filter(Boolean).join("\n")}\n\n`));
      };

      const deadline = Date.now() + STREAM_LIFETIME_MS;
      let lastSnapshotAt = "";
      let lastBeat = Date.now();

      try {
        // Ask the browser to wait 2 s before reconnecting after a close.
        controller.enqueue(encoder.encode("retry: 2000\n\n"));
        while (!request.signal.aborted && Date.now() < deadline) {
          const events = await listJobEvents(jobId, { afterId: cursor, limit: 500 });
          for (const event of events) {
            send("job-event", toJobEventView(event), event.id);
            cursor = event.id;
          }

          const job = await getJob(userId, jobId);
          if (!job) break;
          const snapshot = toJobSnapshot(job);
          if (snapshot.updatedAt !== lastSnapshotAt) {
            send("snapshot", snapshot);
            lastSnapshotAt = snapshot.updatedAt;
          }

          if (isTerminalStatus(job.status) && events.length < 500) {
            send("end", { status: job.status });
            break;
          }

          if (Date.now() - lastBeat > HEARTBEAT_MS) {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            lastBeat = Date.now();
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch (error) {
        if (!request.signal.aborted) console.error(`[stream] job ${jobId}`, error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
