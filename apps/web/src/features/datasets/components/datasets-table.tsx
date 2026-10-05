import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";
import { FORMAT_LABELS } from "../lib/labels";
import type { DatasetListItem } from "../server/queries";
import { DatasetStatusBadge } from "./dataset-status-badge";

export function DatasetsTable({ datasets }: { datasets: DatasetListItem[] }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Nom</TableHead>
            <TableHead>Format</TableHead>
            <TableHead className="text-right">Exemples</TableHead>
            <TableHead className="text-right">Taille</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="pr-4">Créé le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((dataset) => (
            <TableRow key={dataset.id}>
              <TableCell className="max-w-64 pl-4">
                <Link
                  href={`/datasets/${dataset.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {dataset.name}
                </Link>
                <span className="block truncate text-muted-foreground text-xs">
                  {dataset.originalFilename}
                </span>
              </TableCell>
              <TableCell>{dataset.format ? FORMAT_LABELS[dataset.format] : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {dataset.status === "ready" ? formatNumber(dataset.sampleCount) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBytes(dataset.sizeBytes)}
              </TableCell>
              <TableCell>
                <DatasetStatusBadge status={dataset.status} />
              </TableCell>
              <TableCell className="pr-4 text-muted-foreground">
                {formatDate(dataset.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
