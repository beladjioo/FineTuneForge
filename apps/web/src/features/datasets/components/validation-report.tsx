import { CircleX, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCompact, formatNumber } from "@/lib/utils";
import { FORMAT_DESCRIPTIONS, FORMAT_LABELS, RECORD_SCHEMA_LABELS } from "../lib/labels";
import type { DatasetFormat, DatasetReport, DatasetStats } from "../lib/types";

interface ValidationReportProps {
  report: DatasetReport;
  stats: DatasetStats | null;
  format: DatasetFormat | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold text-lg tabular-nums">{value}</dd>
    </div>
  );
}

/** Stats, blocking errors, warnings and skipped rows of an analyzed dataset. */
export function ValidationReport({ report, stats, format }: ValidationReportProps) {
  const rowLabel = report.sourceKind === "json" ? "Élément" : "Ligne";
  const hiddenRowIssues = report.invalidRecords - report.rowIssues.length;

  return (
    <div className="space-y-4">
      {format ? (
        <div className="space-y-0.5">
          <p className="text-sm">
            Format détecté : <span className="font-medium">{FORMAT_LABELS[format]}</span>
            {report.recordSchema ? (
              <span className="text-muted-foreground">
                {" "}
                — {RECORD_SCHEMA_LABELS[report.recordSchema]}
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm">{FORMAT_DESCRIPTIONS[format]}</p>
        </div>
      ) : null}

      {stats ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Exemples valides" value={formatNumber(stats.sampleCount)} />
          <Stat label="Tokens estimés" value={formatCompact(stats.estimatedTokens)} />
          <Stat label="Longueur moyenne" value={`${formatNumber(stats.avgChars)} car.`} />
          {stats.avgMessages !== undefined ? (
            <Stat label="Messages / conversation" value={String(stats.avgMessages)} />
          ) : (
            <Stat label="Entrées ignorées" value={formatNumber(report.invalidRecords)} />
          )}
        </dl>
      ) : null}

      {report.fatalErrors.map((issue) => (
        <Alert key={issue.code} variant="destructive">
          <CircleX />
          <AlertTitle>Import impossible</AlertTitle>
          <AlertDescription>{issue.message}</AlertDescription>
        </Alert>
      ))}

      {report.warnings.map((issue) => (
        <Alert key={issue.code} variant={issue.severity === "info" ? "info" : "warning"}>
          {issue.severity === "info" ? <Info /> : <TriangleAlert />}
          <AlertDescription>{issue.message}</AlertDescription>
        </Alert>
      ))}

      {report.rowIssues.length > 0 ? (
        <details className="group rounded-lg border">
          <summary className="cursor-pointer select-none px-4 py-2.5 font-medium text-sm">
            Voir les {formatNumber(report.invalidRecords)} entrée
            {report.invalidRecords > 1 ? "s" : ""} ignorée{report.invalidRecords > 1 ? "s" : ""}
          </summary>
          <ul className="max-h-64 divide-y overflow-y-auto border-t text-sm">
            {report.rowIssues.map((issue) => (
              <li key={`${issue.row}-${issue.code}`} className="flex gap-3 px-4 py-2">
                <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                  {rowLabel} {issue.row}
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
            {hiddenRowIssues > 0 ? (
              <li className="px-4 py-2 text-muted-foreground">
                … et {formatNumber(hiddenRowIssues)} autre{hiddenRowIssues > 1 ? "s" : ""}.
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
