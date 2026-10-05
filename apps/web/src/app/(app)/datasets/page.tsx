import { Database, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/config/plans";
import { DatasetsTable } from "@/features/datasets/components/datasets-table";
import { listDatasets } from "@/features/datasets/server/queries";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Datasets" };

export default async function DatasetsPage() {
  const { user } = await requireSession();
  const plan = getPlan(user.plan);
  const datasets = await listDatasets(user.id);
  const limitReached = datasets.length >= plan.limits.maxDatasets;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datasets"
        description={`${datasets.length} / ${plan.limits.maxDatasets} datasets utilisés (plan ${plan.name}).`}
        actions={
          limitReached ? (
            <Button disabled>
              <Plus /> Limite atteinte
            </Button>
          ) : (
            <Button asChild>
              <Link href="/datasets/new">
                <Plus /> Importer un dataset
              </Link>
            </Button>
          )
        }
      />

      {datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Aucun dataset pour l'instant"
          description="Un dataset, ce sont les exemples dont votre modèle va s'inspirer : conversations, FAQ, textes…"
          action={
            <Button asChild>
              <Link href="/datasets/new">Importer mon premier dataset</Link>
            </Button>
          }
        />
      ) : (
        <DatasetsTable datasets={datasets} />
      )}
    </div>
  );
}
