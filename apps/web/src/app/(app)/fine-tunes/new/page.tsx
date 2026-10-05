import { ArrowLeft, Database } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { listBaseModels } from "@/config/models";
import { getPlan } from "@/config/plans";
import { FineTuneWizard } from "@/features/fine-tuning/components/fine-tune-wizard";
import { isPlatformDestinationAvailable } from "@/features/fine-tuning/server/hub-credentials";
import { defaultProviderId } from "@/features/fine-tuning/server/providers";
import {
  countActiveJobs,
  countBillableJobsSince,
  listReadyDatasets,
} from "@/features/fine-tuning/server/queries";
import { getHuggingFaceConnection } from "@/features/huggingface/server/credentials";
import { startOfCurrentMonthUtc } from "@/lib/dates";
import { requireSession } from "@/server/auth/session";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Nouveau fine-tune" };

export default async function NewFineTunePage(props: PageProps<"/fine-tunes/new">) {
  const { user } = await requireSession();
  const plan = getPlan(user.plan);
  const { datasetId } = await props.searchParams;

  const [datasets, hfConnection, activeJobs, usedThisMonth] = await Promise.all([
    listReadyDatasets(user.id),
    getHuggingFaceConnection(user.id),
    countActiveJobs(user.id),
    countBillableJobsSince(user.id, startOfCurrentMonthUtc()),
  ]);

  const monthlyLimit = plan.limits.fineTunesPerMonth;
  const remainingThisMonth =
    monthlyLimit === null ? null : Math.max(0, monthlyLimit - usedThisMonth);
  const blockedReason =
    remainingThisMonth === 0
      ? `Quota atteint : ${monthlyLimit} fine-tune par mois avec le plan ${plan.name}.`
      : activeJobs >= plan.limits.maxConcurrentJobs
        ? "Un fine-tuning est déjà en cours. Attendez qu'il se termine pour en lancer un autre."
        : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/fine-tunes">
          <ArrowLeft /> Fine-tunes
        </Link>
      </Button>
      <PageHeader
        title="Nouveau fine-tune"
        description="Quatre choix, et c'est parti : on gère le GPU, l'entraînement et la publication."
      />
      {datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Importez d'abord un dataset"
          description="Il faut au moins un dataset validé pour lancer un fine-tuning."
          action={
            <Button asChild>
              <Link href="/datasets/new">Importer un dataset</Link>
            </Button>
          }
        />
      ) : (
        <FineTuneWizard
          datasets={datasets.map((dataset) => ({
            id: dataset.id,
            name: dataset.name,
            format: dataset.format,
            sampleCount: dataset.sampleCount,
            avgChars: dataset.stats?.avgChars ?? 400,
          }))}
          models={listBaseModels({ includeDevOnly: env.NODE_ENV !== "production" })}
          defaultDatasetId={typeof datasetId === "string" ? datasetId : undefined}
          hfUsername={hfConnection?.hfUsername ?? null}
          platformNamespace={
            isPlatformDestinationAvailable() ? (env.HF_PLATFORM_ORG ?? null) : null
          }
          simulated={defaultProviderId() === "simulated"}
          privateAllowed={plan.limits.privateDeployments}
          remainingThisMonth={remainingThisMonth}
          blockedReason={blockedReason}
        />
      )}
    </div>
  );
}
