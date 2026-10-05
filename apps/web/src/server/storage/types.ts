/**
 * Object storage abstraction. Large files never transit through our server
 * functions: the browser uploads straight to storage with a short-lived signed URL
 * (serverless platforms cap request bodies at a few MB).
 */

export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PresignUploadParams {
  key: string;
  contentType: string;
  /** Upper bound enforced by the local driver; S3 sizes are re-checked with `stat`. */
  maxBytes: number;
  expiresInSeconds?: number;
}

export interface PresignDownloadParams {
  key: string;
  /** Suggested file name for the browser download. */
  fileName?: string;
  expiresInSeconds?: number;
}

export interface ObjectStorage {
  readonly driver: "local" | "s3";
  presignUpload(params: PresignUploadParams): Promise<PresignedUpload>;
  /** Returns an absolute URL (usable by the browser and by remote GPU workers). */
  presignDownload(params: PresignDownloadParams): Promise<string>;
  stat(key: string): Promise<{ size: number } | null>;
  getText(key: string): Promise<string>;
  put(key: string, body: string | Uint8Array, contentType: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

export class StorageObjectTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Object exceeds the maximum allowed size of ${maxBytes} bytes`);
    this.name = "StorageObjectTooLargeError";
  }
}
