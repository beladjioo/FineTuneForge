import "server-only";
import { and, asc, count, desc, eq, gt, gte, inArray, notInArray } from "drizzle-orm";
import { db, type Executor } from "@/server/db";
import { datasets, fineTuneJobEvents, fineTuneJobs } from "@/server/db/schema";
import { TERMINAL_STATUSES } from "../lib/status";

/** Read-side data access for fine-tuning jobs, always scoped by `userId`. */

export async function listJobs(userId: string, options: { limit?: number } = {}) {
  return db
    .select({
      id: fineTuneJobs.id,
      name: fineTuneJobs.name,
      status: fineTuneJobs.status,
      progress: fineTuneJobs.progress,
      baseModelId: fineTuneJobs.baseModelId,
      preset: fineTuneJobs.preset,
      outputRepoId: fineTuneJobs.outputRepoId,
      createdAt: fineTuneJobs.createdAt,
      finishedAt: fineTuneJobs.finishedAt,
      datasetId: fineTuneJobs.datasetId,
      datasetName: datasets.name,
    })
    .from(fineTuneJobs)
    .innerJoin(datasets, eq(datasets.id, fineTuneJobs.datasetId))
    .where(eq(fineTuneJobs.userId, userId))
    .orderBy(desc(fineTuneJobs.createdAt))
    .limit(options.limit ?? 100);
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>[number];

export async function getJob(userId: string, jobId: string) {
  const [row] = await db
    .select({
      job: fineTuneJobs,
      datasetName: datasets.name,
      datasetSampleCount: datasets.sampleCount,
    })
    .from(fineTuneJobs)
    .innerJoin(datasets, eq(datasets.id, fineTuneJobs.datasetId))
    .where(and(eq(fineTuneJobs.id, jobId), eq(fineTuneJobs.userId, userId)))
    .limit(1);
  return row
    ? { ...row.job, datasetName: row.datasetName, datasetSampleCount: row.datasetSampleCount }
    : null;
}

export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJob>>>;

/** Unscoped lookup for trusted server code (workflow, trainer callbacks). */
export async function getJobById(jobId: string) {
  const [job] = await db.select().from(fineTuneJobs).where(eq(fineTuneJobs.id, jobId)).limit(1);
  return job ?? null;
}

export async function listJobEvents(
  jobId: string,
  options: { afterId?: number; limit?: number } = {},
) {
  return db
    .select({
      id: fineTuneJobEvents.id,
      type: fineTuneJobEvents.type,
      message: fineTuneJobEvents.message,
      data: fineTuneJobEvents.data,
      createdAt: fineTuneJobEvents.createdAt,
    })
    .from(fineTuneJobEvents)
    .where(
      options.afterId
        ? and(eq(fineTuneJobEvents.jobId, jobId), gt(fineTuneJobEvents.id, options.afterId))
        : eq(fineTuneJobEvents.jobId, jobId),
    )
    .orderBy(asc(fineTuneJobEvents.id))
    .limit(options.limit ?? 2000);
}

export type JobEventRow = Awaited<ReturnType<typeof listJobEvents>>[number];

export async function countActiveJobs(userId: string, executor: Executor = db) {
  const [row] = await executor
    .select({ value: count() })
    .from(fineTuneJobs)
    .where(
      and(eq(fineTuneJobs.userId, userId), notInArray(fineTuneJobs.status, [...TERMINAL_STATUSES])),
    );
  return row?.value ?? 0;
}

/** Jobs counted against the monthly quota: failures and cancellations are free. */
export async function countBillableJobsSince(userId: string, since: Date, executor: Executor = db) {
  const [row] = await executor
    .select({ value: count() })
    .from(fineTuneJobs)
    .where(
      and(
        eq(fineTuneJobs.userId, userId),
        gte(fineTuneJobs.createdAt, since),
        notInArray(fineTuneJobs.status, ["failed", "cancelled"]),
      ),
    );
  return row?.value ?? 0;
}

export async function listReadyDatasets(userId: string) {
  return db
    .select({
      id: datasets.id,
      name: datasets.name,
      format: datasets.format,
      sampleCount: datasets.sampleCount,
      stats: datasets.stats,
    })
    .from(datasets)
    .where(and(eq(datasets.userId, userId), inArray(datasets.status, ["ready"])))
    .orderBy(desc(datasets.createdAt));
}
