import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "../lib/labels";
import type { DatasetStatus } from "../lib/types";

export function DatasetStatusBadge({ status }: { status: DatasetStatus }) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="success">
          <CircleCheck /> {STATUS_LABELS.ready}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <CircleX /> {STATUS_LABELS.failed}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <LoaderCircle className="animate-spin" /> {STATUS_LABELS[status]}
        </Badge>
      );
  }
}
