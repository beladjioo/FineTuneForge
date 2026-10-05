import { NextResponse } from "next/server";
import { z } from "zod";
import { getDataset } from "@/features/datasets/server/queries";
import { slugify } from "@/lib/utils";
import { getSession } from "@/server/auth/session";
import { getStorage } from "@/server/storage";

/**
 * Redirects to a short-lived signed URL for a dataset file.
 * `?variant=original` returns the uploaded file, default is the normalized JSONL.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/datasets/[datasetId]/download">,
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { datasetId } = await ctx.params;
  if (!z.uuid().safeParse(datasetId).success) return new NextResponse("Not found", { status: 404 });

  const dataset = await getDataset(session.user.id, datasetId);
  if (!dataset) return new NextResponse("Not found", { status: 404 });

  const variant = new URL(request.url).searchParams.get("variant");
  const key = variant === "original" ? dataset.originalFileKey : dataset.normalizedFileKey;
  if (!key) return new NextResponse("File not available", { status: 404 });

  const fileName =
    variant === "original"
      ? dataset.originalFilename
      : `${slugify(dataset.name) || "dataset"}.jsonl`;
  const url = await getStorage().presignDownload({ key, fileName, expiresInSeconds: 60 });
  return NextResponse.redirect(url);
}
