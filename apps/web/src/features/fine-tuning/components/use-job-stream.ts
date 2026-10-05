"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isTerminalStatus } from "../lib/status";
import { type JobEventView, type JobSnapshot, mergeEvents } from "../live";

export type StreamState = "live" | "reconnecting" | "closed";

/**
 * Subscribes to the job's SSE stream. EventSource reconnects on its own and resumes
 * from the last received event id (Last-Event-ID), so no event is lost or duplicated.
 */
export function useJobStream(
  jobId: string,
  initialSnapshot: JobSnapshot,
  initialEvents: JobEventView[],
) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [events, setEvents] = useState(initialEvents);
  const [state, setState] = useState<StreamState>(
    isTerminalStatus(initialSnapshot.status) ? "closed" : "live",
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: opened once per job, updates then arrive through the stream
  useEffect(() => {
    if (isTerminalStatus(initialSnapshot.status)) return;

    const after = initialEvents[initialEvents.length - 1]?.id ?? 0;
    const source = new EventSource(`/api/fine-tunes/${jobId}/stream?after=${after}`);

    source.addEventListener("job-event", (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as JobEventView;
      setEvents((current) => mergeEvents(current, [event]));
    });
    source.addEventListener("snapshot", (message) => {
      setSnapshot(JSON.parse((message as MessageEvent<string>).data) as JobSnapshot);
      setState("live");
    });
    source.addEventListener("end", () => {
      source.close();
      setState("closed");
      router.refresh();
    });
    source.onerror = () =>
      setState(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");

    return () => source.close();
  }, [jobId]);

  return { snapshot, events, state };
}
