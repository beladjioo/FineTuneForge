"use client";

import { ExternalLink, Info, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDateTime } from "@/lib/utils";
import { formatDuration } from "../lib/estimate";
import { isActiveStatus } from "../lib/status";
import { type JobEventView, type JobSnapshot, metricPoints } from "../live";
import type { FineTuneJobStatus, LoraHyperparameters } from "../types";
import { CancelJobButton } from "./cancel-job-button";
import { JobLogs } from "./job-logs";
import { JobStatusBadge } from "./job-status-badge";
import { LossChart } from "./loss-chart";
import { UsageSnippet } from "./usage-snippet";
import { useJobStream } from "./use-job-stream";

export interface JobStaticInfo {
  id: string;
  name: string;
  createdAt: string;
  modelId: string;
  modelName: string;
  datasetId: string;
  datasetName: string;
  presetLabel: string;
  hyperparameters: LoraHyperparameters;
  provider: string;
  outputRepoPrivate: boolean;
  hubEndpoint: string;
}

const STATUS_HINTS: Partial<Record<FineTuneJobStatus, string>> = {
  queued: "En attente de démarrage…",
  preparing: "Vérification de l'accès au modèle et préparation du dépôt Hugging Face…",
  training: "Entraînement en cours.",
  evaluating: "Évaluation du modèle sur le jeu de validation…",
  uploading: "Publication de l'adapter LoRA sur Hugging Face…",
  succeeded: "Votre modèle est prêt.",
  cancelled: "Ce fine-tuning a été annulé.",
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function JobLiveView({
  info,
  initialSnapshot,
  initialEvents,
}: {
  info: JobStaticInfo;
  initialSnapshot: JobSnapshot;
  initialEvents: JobEventView[];
}) {
  const { snapshot, events, state } = useJobStream(info.id, initialSnapshot, initialEvents);
  const active = isActiveStatus(snapshot.status);
  const now = useNow(active);
  const points = metricPoints(events);
  const metrics = snapshot.metrics;
  const simulated = info.provider === "simulated";
  const hp = info.hyperparameters;

  const startedAt = new Date(snapshot.startedAt ?? info.createdAt).getTime();
  const endedAt = snapshot.finishedAt ? new Date(snapshot.finishedAt).getTime() : now;
  const elapsedSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const remainingSeconds =
    snapshot.status === "training" && metrics?.step && metrics.totalSteps && snapshot.startedAt
      ? Math.round(((now - startedAt) / 1000 / metrics.step) * (metrics.totalSteps - metrics.step))
      : null;
  const repoUrl =
    snapshot.outputRepoId && !simulated ? `${info.hubEndpoint}/${snapshot.outputRepoId}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={info.name}
        description={`${info.modelName} · ${info.datasetName}`}
        actions={
          <>
            {repoUrl && snapshot.status === "succeeded" ? (
              <Button asChild>
                <a href={repoUrl} target="_blank" rel="noreferrer">
                  Voir sur Hugging Face <ExternalLink />
                </a>
              </Button>
            ) : null}
            {active ? <CancelJobButton jobId={info.id} /> : null}
          </>
        }
      />

      {simulated ? (
        <Alert variant="info">
          <Info />
          <AlertTitle>Mode simulation</AlertTitle>
          <AlertDescription>
            Ce job utilise l'entraîneur simulé (développement) : la progression est factice et aucun
            modèle n'est publié.
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Le fine-tuning a échoué</AlertTitle>
          <AlertDescription>{snapshot.error ?? "Erreur inconnue."}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <JobStatusBadge status={snapshot.status} />
            {state === "reconnecting" ? (
              <span className="flex items-center gap-1 font-normal text-muted-foreground text-xs">
                <WifiOff className="size-3" /> Reconnexion…
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>{STATUS_HINTS[snapshot.status] ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={Math.round(snapshot.progress * 100)} aria-label="Progression" />
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-muted-foreground text-sm">
            <span className="tabular-nums">{Math.round(snapshot.progress * 100)} %</span>
            {metrics?.step && metrics.totalSteps ? (
              <span className="tabular-nums">
                Step {metrics.step} / {metrics.totalSteps}
                {metrics.epoch !== undefined
                  ? ` · epoch ${metrics.epoch.toLocaleString("fr-FR")}`
                  : ""}
              </span>
            ) : null}
            <span className="tabular-nums">
              Durée : {formatDuration(elapsedSeconds).replace("~", "")}
              {remainingSeconds !== null && remainingSeconds > 0
                ? ` · reste ${formatDuration(remainingSeconds)}`
                : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Courbe de loss</CardTitle>
              <CardDescription>
                {points.some((point) => point.evalLoss !== undefined)
                  ? "Plus c'est bas, mieux le modèle reproduit vos exemples. Si la validation remonte alors que l'entraînement baisse, le modèle sur-apprend."
                  : "Loss d'entraînement : plus c'est bas, mieux le modèle reproduit vos exemples."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {points.length > 0 ? (
                <LossChart points={points} totalSteps={metrics?.totalSteps} />
              ) : (
                <p className="py-10 text-center text-muted-foreground text-sm">
                  La courbe apparaîtra dès les premiers steps d'entraînement.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <JobLogs events={events} />
            </CardContent>
          </Card>

          {snapshot.status === "succeeded" && snapshot.outputRepoId && !simulated ? (
            <Card>
              <CardHeader>
                <CardTitle>Utiliser votre modèle</CardTitle>
                <CardDescription>
                  L'adapter LoRA est publié sur{" "}
                  <a href={repoUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">
                    {snapshot.outputRepoId}
                  </a>
                  {info.outputRepoPrivate ? " (privé)" : ""}. Le déploiement en un clic arrive
                  bientôt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageSnippet repoId={snapshot.outputRepoId} baseModelId={info.modelId} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Detail label="Modèle" value={info.modelName} />
              <Detail
                label="Dataset"
                value={
                  <Link href={`/datasets/${info.datasetId}`} className="hover:underline">
                    {info.datasetName}
                  </Link>
                }
              />
              <Detail label="Preset" value={info.presetLabel} />
              <Detail label="LoRA rank / alpha" value={`${hp.loraRank} / ${hp.loraAlpha}`} />
              <Detail label="Learning rate" value={hp.learningRate.toExponential(0)} />
              <Detail label="Epochs" value={hp.epochs} />
              <Detail label="Batch effectif" value={hp.batchSize * hp.gradientAccumulationSteps} />
              <Detail label="Longueur max" value={`${hp.maxSeqLength} tokens`} />
              <Detail
                label="Dépôt de sortie"
                value={
                  <span className="break-all">
                    {snapshot.outputRepoId ?? "—"}
                    {info.outputRepoPrivate ? " (privé)" : ""}
                  </span>
                }
              />
              <Detail label="Lancé le" value={formatDateTime(info.createdAt)} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
