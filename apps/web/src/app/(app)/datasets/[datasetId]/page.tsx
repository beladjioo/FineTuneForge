import { ArrowLeft, Cpu, Download, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatasetStatusBadge } from "@/features/datasets/components/dataset-status-badge";
import { DeleteDatasetButton } from "@/features/datasets/components/delete-dataset-button";
import { SampleList } from "@/features/datasets/components/sample-list";
import { ValidationReport } from "@/features/datasets/components/validation-report";
import { FORMAT_LABELS } from "@/features/datasets/lib/labels";
import { getDataset } from "@/features/datasets/server/queries";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dataset" };

const PREVIEW_DISPLAY_COUNT = 8;

export default async function DatasetPage(props: PageProps<"/datasets/[datasetId]">) {
  const { user } = await requireSession();
  const { datasetId } = await props.params;
  if (!z.uuid().safeParse(datasetId).success) notFound();

  const dataset = await getDataset(user.id, datasetId);
  if (!dataset) notFound();

  const isPending = dataset.status === "uploading" || dataset.status === "processing";
  const downloadHref = `/api/datasets/${dataset.id}/download`;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/datasets">
          <ArrowLeft /> Datasets
        </Link>
      </Button>

      <PageHeader
        title={dataset.name}
        description={dataset.description ?? undefined}
        actions={
          <>
            {dataset.status === "ready" ? (
              <Button asChild variant="outline">
                {/* Route handler redirecting to a signed URL: a plain anchor, not a client navigation. */}
                <a href={downloadHref}>
                  <Download /> JSONL normalisé
                </a>
              </Button>
            ) : null}
            <DeleteDatasetButton datasetId={dataset.id} name={dataset.name} />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
        <DatasetStatusBadge status={dataset.status} />
        {dataset.format ? <Badge variant="outline">{FORMAT_LABELS[dataset.format]}</Badge> : null}
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3.5" aria-hidden />
          {dataset.status === "uploading" ? (
            dataset.originalFilename
          ) : (
            <a href={`${downloadHref}?variant=original`} className="hover:underline">
              {dataset.originalFilename}
            </a>
          )}
        </span>
        <span>· {formatBytes(dataset.sizeBytes)}</span>
        <span>· importé le {formatDateTime(dataset.createdAt)}</span>
      </div>

      {isPending ? (
        <Alert variant="info">
          <AlertTitle>Import non terminé</AlertTitle>
          <AlertDescription>
            Ce dataset n'a pas fini d'être importé. Si l'import a été interrompu, supprimez-le et
            recommencez.
          </AlertDescription>
        </Alert>
      ) : null}

      {dataset.status === "failed" && dataset.error ? (
        <Alert variant="destructive">
          <AlertTitle>Échec de l'import</AlertTitle>
          <AlertDescription>{dataset.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {dataset.report ? (
            <Card>
              <CardHeader>
                <CardTitle>Validation</CardTitle>
              </CardHeader>
              <CardContent>
                <ValidationReport
                  report={dataset.report}
                  stats={dataset.stats}
                  format={dataset.format}
                />
              </CardContent>
            </Card>
          ) : null}

          {dataset.preview && dataset.preview.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Aperçu</CardTitle>
                <CardDescription>
                  Les premiers exemples, tels que le modèle les verra.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SampleList samples={dataset.preview} limit={PREVIEW_DISPLAY_COUNT} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prochaine étape</CardTitle>
            <CardDescription>
              Choisissez un modèle et un preset LoRA pour entraîner votre modèle sur ce dataset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dataset.status === "ready" ? (
              <Button asChild className="w-full">
                <Link href={{ pathname: "/fine-tunes/new", query: { datasetId: dataset.id } }}>
                  <Cpu /> Lancer un fine-tuning
                </Link>
              </Button>
            ) : (
              <Button disabled className="w-full">
                <Cpu /> Lancer un fine-tuning
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
