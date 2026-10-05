import "server-only";
import { count, eq, gte, type SQL, sql } from "drizzle-orm";
import { listDatasets } from "@/features/datasets/server/queries";
import { getHuggingFaceConnection } from "@/features/huggingface/server/credentials";
import { startOfCurrentMonthUtc } from "@/lib/dates";
import { db } from "@/server/db";
import { datasets, deployedModels, fineTuneJobs } from "@/server/db/schema";

/**
 * `count(*) filter (where …)`. The condition must be built with Drizzle operators
 * (eq, gte…) so values go through the column's driver mapping (e.g. Date → timestamptz).
 */
const countWhere = (condition: SQL | undefined) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/** Everything the dashboard needs, fetched in parallel. */
export async function getDashboardData(userId: string) {
  const [datasetCounts, jobCounts, deploymentCounts, hfConnection, recentDatasets] =
    await Promise.all([
      db
        .select({
          total: count(),
          ready: countWhere(eq(datasets.status, "ready")),
        })
        .from(datasets)
        .where(eq(datasets.userId, userId)),
      db
        .select({
          total: count(),
          thisMonth: countWhere(gte(fineTuneJobs.createdAt, startOfCurrentMonthUtc())),
        })
        .from(fineTuneJobs)
        .where(eq(fineTuneJobs.userId, userId)),
      db.select({ total: count() }).from(deployedModels).where(eq(deployedModels.userId, userId)),
      getHuggingFaceConnection(userId),
      listDatasets(userId, { limit: 5 }),
    ]);

  return {
    datasets: { total: datasetCounts[0]?.total ?? 0, ready: datasetCounts[0]?.ready ?? 0 },
    fineTunes: { total: jobCounts[0]?.total ?? 0, thisMonth: jobCounts[0]?.thisMonth ?? 0 },
    deployments: { total: deploymentCounts[0]?.total ?? 0 },
    hfConnection,
    recentDatasets,
  };
}
