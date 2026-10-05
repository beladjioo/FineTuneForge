import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/config/plans";
import { DatasetUploader } from "@/features/datasets/components/dataset-uploader";
import { FormatGuide } from "@/features/datasets/components/format-guide";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Importer un dataset" };

// Server-side validation of large files may take a few seconds.
export const maxDuration = 60;

export default async function NewDatasetPage() {
  const { user } = await requireSession();
  const plan = getPlan(user.plan);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/datasets">
          <ArrowLeft /> Datasets
        </Link>
      </Button>
      <PageHeader
        title="Importer un dataset"
        description="Vos données restent privées : elles servent uniquement à entraîner vos modèles."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <DatasetUploader maxBytes={plan.limits.maxDatasetBytes} planName={plan.name} />
        <FormatGuide />
      </div>
    </div>
  );
}
