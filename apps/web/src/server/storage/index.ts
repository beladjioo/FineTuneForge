import "server-only";
import { env } from "../env";
import { LocalObjectStorage } from "./local";
import { S3ObjectStorage } from "./s3";
import type { ObjectStorage } from "./types";

export { storageKeys } from "./keys";
export type { ObjectStorage, PresignedUpload } from "./types";

let instance: ObjectStorage | undefined;

/** Storage driver selected by STORAGE_DRIVER (lazy singleton). */
export function getStorage(): ObjectStorage {
  if (instance) return instance;

  if (env.STORAGE_DRIVER === "s3") {
    instance = new S3ObjectStorage({
      bucket: env.S3_BUCKET ?? "",
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    });
  } else {
    instance = new LocalObjectStorage(env.STORAGE_LOCAL_DIR, env.APP_URL, env.BETTER_AUTH_SECRET);
  }
  return instance;
}
