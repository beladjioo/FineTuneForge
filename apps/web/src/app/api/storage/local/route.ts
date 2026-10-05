import type { NextRequest } from "next/server";
import { env } from "@/server/env";
import { getStorage } from "@/server/storage";
import { LocalObjectStorage } from "@/server/storage/local";
import { verifyStorageToken } from "@/server/storage/signed-token";
import { StorageObjectTooLargeError } from "@/server/storage/types";

/**
 * Emulates S3 presigned URLs for the local storage driver. Access is granted by
 * the HMAC-signed token alone (like S3), so no session lookup is needed here.
 */

function localStorageOr404(): LocalObjectStorage | Response {
  const storage = getStorage();
  return storage instanceof LocalObjectStorage
    ? storage
    : new Response("Not found", { status: 404 });
}

function readToken(request: NextRequest, op: "put" | "get") {
  const token = request.nextUrl.searchParams.get("token");
  const payload = token ? verifyStorageToken(token, env.BETTER_AUTH_SECRET) : null;
  return payload?.op === op ? payload : null;
}

export async function PUT(request: NextRequest) {
  const storage = localStorageOr404();
  if (storage instanceof Response) return storage;

  const payload = readToken(request, "put");
  if (!payload) return new Response("Invalid or expired upload URL", { status: 403 });

  const maxBytes = payload.max ?? 0;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) return new Response("Payload too large", { status: 413 });
  if (!request.body) return new Response("Missing body", { status: 400 });

  try {
    await storage.writeStream(payload.key, request.body, maxBytes);
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof StorageObjectTooLargeError) {
      return new Response("Payload too large", { status: 413 });
    }
    console.error("[storage] local upload failed", error);
    return new Response("Upload failed", { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const storage = localStorageOr404();
  if (storage instanceof Response) return storage;

  const payload = readToken(request, "get");
  if (!payload) return new Response("Invalid or expired download URL", { status: 403 });

  const object = await storage.stat(payload.key);
  if (!object) return new Response("Not found", { status: 404 });

  const fileName = (payload.fn ?? payload.key.split("/").pop() ?? "download").replace(/"/g, "");
  return new Response(storage.openReadStream(payload.key), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
