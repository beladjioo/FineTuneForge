import { Cpu, Crown, Database, Plus, Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlan } from "@/config/plans";
import { OnboardingChecklist } from "@/features/dashboard/components/onboarding-checklist";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { getDashboardData } from "@/features/dashboard/server/queries";
import { DatasetStatusBadge } from "@/features/datasets/components/dataset-status-badge";
import { FORMAT_LABELS } from "@/features/datasets/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const { user } = await requireSession();
  const plan = getPlan(user.plan);
  const data = await getDashboardData(user.id);
  const firstName = user.name.split(" ")[0] || user.name;
  const monthlyQuota = plan.limits.fineTunesPerMonth;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bonjour, ${firstName}`}
        description="Voici où en sont vos datasets et vos modèles."
        actions={
          <Button asChild>
            <Link href="/datasets/new">
              <Plus /> Importer un dataset
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Datasets prêts"
          value={formatNumber(data.datasets.ready)}
          hint={`${formatNumber(data.datasets.total)} au total · ${plan.limits.maxDatasets} max`}
          icon={Database}
        />
        <StatCard
          title="Fine-tunes ce mois-ci"
          value={
            monthlyQuota === null
              ? formatNumber(data.fineTunes.thisMonth)
              : `${data.fineTunes.thisMonth} / ${monthlyQuota}`
          }
          hint={monthlyQuota === null ? "Illimité" : "Quota mensuel"}
          icon={Cpu}
        />
        <StatCard
          title="Modèles déployés"
          value={formatNumber(data.deployments.total)}
          hint={plan.limits.privateDeployments ? "Publics ou privés" : "Publics uniquement"}
          icon={Rocket}
        />
        <StatCard title="Plan" value={plan.name} hint={plan.tagline} icon={Crown} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OnboardingChecklist
          hfConnected={data.hfConnection !== null}
          hasReadyDataset={data.datasets.ready > 0}
          hasSucceededJob={data.fineTunes.succeeded > 0}
        />

        <Card>
          <CardHeader>
            <CardTitle>Datasets récents</CardTitle>
            {data.recentDatasets.length > 0 ? (
              <CardAction>
                <Button asChild variant="link" size="sm" className="h-auto p-0">
                  <Link href="/datasets">Tout voir</Link>
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {data.recentDatasets.length === 0 ? (
              <EmptyState
                icon={Database}
                title="Aucun dataset"
                description="Importez vos premiers exemples pour préparer un fine-tuning."
                action={
                  <Button asChild size="sm">
                    <Link href="/datasets/new">Importer</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.recentDatasets.map((dataset) => (
                  <li
                    key={dataset.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="block truncate font-medium text-sm hover:underline"
                      >
                        {dataset.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {dataset.format ? FORMAT_LABELS[dataset.format] : "—"}
                        {dataset.status === "ready"
                          ? ` · ${formatNumber(dataset.sampleCount)} exemples`
                          : ""}{" "}
                        · {formatDate(dataset.createdAt)}
                      </p>
                    </div>
                    <DatasetStatusBadge status={dataset.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
