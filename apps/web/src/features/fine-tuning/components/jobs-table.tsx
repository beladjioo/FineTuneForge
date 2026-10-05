import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBaseModel } from "@/config/models";
import { formatDate } from "@/lib/utils";
import { isActiveStatus } from "../lib/status";
import type { JobListItem } from "../server/queries";
import { JobStatusBadge } from "./job-status-badge";

export function JobsTable({ jobs }: { jobs: JobListItem[] }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Nom</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Modèle publié</TableHead>
            <TableHead className="pr-4">Créé le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="max-w-64 pl-4">
                <Link
                  href={`/fine-tunes/${job.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {job.name}
                </Link>
                <span className="block truncate text-muted-foreground text-xs">
                  {getBaseModel(job.baseModelId)?.name ?? job.baseModelId}
                </span>
              </TableCell>
              <TableCell className="max-w-48 truncate">{job.datasetName}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <JobStatusBadge status={job.status} />
                  {isActiveStatus(job.status) ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {Math.round(job.progress * 100)} %
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="max-w-56 truncate text-muted-foreground">
                {job.status === "succeeded" ? job.outputRepoId : "—"}
              </TableCell>
              <TableCell className="pr-4 text-muted-foreground">
                {formatDate(job.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
