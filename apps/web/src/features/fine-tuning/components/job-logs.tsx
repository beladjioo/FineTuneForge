"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { JobEventView } from "../live";

const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const MAX_LINES = 500;

/** Console-like timeline of status changes and trainer logs, auto-scrolling. */
export function JobLogs({ events }: { events: JobEventView[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = events
    .filter((event) => event.type !== "metric" && event.message)
    .slice(-MAX_LINES);
  const lastId = lines[lines.length - 1]?.id;

  // Follow new lines only when the reader is already at the bottom.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || lastId === undefined) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [lastId]);

  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun log pour l'instant.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="max-h-80 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed"
      role="log"
      aria-live="polite"
    >
      {lines.map((event) => {
        const level = typeof event.data?.level === "string" ? event.data.level : null;
        return (
          <div key={event.id} className="flex gap-3">
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {timeFormat.format(new Date(event.createdAt))}
            </span>
            <span
              className={cn(
                "whitespace-pre-wrap break-words",
                event.type === "status" && "font-semibold",
                level === "warning" && "text-amber-700 dark:text-amber-400",
                level === "error" && "text-destructive",
              )}
            >
              {event.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
