import { Ban, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABELS } from "../lib/labels";
import type { FineTuneJobStatus } from "../types";

export function JobStatusBadge({ status }: { status: FineTuneJobStatus }) {
  const label = JOB_STATUS_LABELS[status];
  switch (status) {
    case "succeeded":
      return (
        <Badge variant="success">
          <CircleCheck /> {label}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <CircleX /> {label}
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline">
          <Ban /> {label}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <LoaderCircle className="animate-spin" /> {label}
        </Badge>
      );
  }
}
