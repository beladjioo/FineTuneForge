import { Cpu, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { JobsTable } from "@/features/fine-tuning/components/jobs-table";
import { listJobs } from "@/features/fine-tuning/server/queries";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Fine-tunes" };

export default async function FineTunesPage() {
  const { user } = await requireSession();
  const jobs = await listJobs(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fine-tunes"
        description="Vos entraînements LoRA, en cours et terminés."
        actions={
          <Button asChild>
            <Link href="/fine-tunes/new">
              <Plus /> Nouveau fine-tune
            </Link>
          </Button>
        }
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title="Aucun fine-tune pour l'instant"
          description="Choisissez un dataset et un modèle : on s'occupe de l'entraînement."
          action={
            <Button asChild>
              <Link href="/fine-tunes/new">Lancer mon premier fine-tune</Link>
            </Button>
          }
        />
      ) : (
        <JobsTable jobs={jobs} />
      )}
    </div>
  );
}
