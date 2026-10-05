import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { getBaseModel } from "@/config/models";
import { JobLiveView } from "@/features/fine-tuning/components/job-live-view";
import { PRESET_LABELS } from "@/features/fine-tuning/lib/labels";
import { getJob, listJobEvents } from "@/features/fine-tuning/server/queries";
import { toJobEventView, toJobSnapshot } from "@/features/fine-tuning/server/serializers";
import { requireSession } from "@/server/auth/session";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Fine-tune" };

export default async function FineTunePage(props: PageProps<"/fine-tunes/[jobId]">) {
  const { user } = await requireSession();
  const { jobId } = await props.params;
  if (!z.uuid().safeParse(jobId).success) notFound();

  const job = await getJob(user.id, jobId);
  if (!job) notFound();
  const events = await listJobEvents(job.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/fine-tunes">
          <ArrowLeft /> Fine-tunes
        </Link>
      </Button>
      <JobLiveView
        info={{
          id: job.id,
          name: job.name,
          createdAt: job.createdAt.toISOString(),
          modelId: job.baseModelId,
          modelName: getBaseModel(job.baseModelId)?.name ?? job.baseModelId,
          datasetId: job.datasetId,
          datasetName: job.datasetName,
          presetLabel: PRESET_LABELS[job.preset],
          hyperparameters: job.hyperparameters,
          provider: job.provider,
          outputRepoPrivate: job.outputRepoPrivate,
          hubEndpoint: env.HF_ENDPOINT,
        }}
        initialSnapshot={toJobSnapshot(job)}
        initialEvents={events.map(toJobEventView)}
      />
    </div>
  );
}
