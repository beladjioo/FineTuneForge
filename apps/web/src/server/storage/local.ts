import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { assertSafeKey } from "./keys";
import { signStorageToken } from "./signed-token";
import {
  type ObjectStorage,
  type PresignDownloadParams,
  type PresignedUpload,
  type PresignUploadParams,
  StorageObjectTooLargeError,
} from "./types";

/** Route handler that serves signed local uploads/downloads. */
export const LOCAL_STORAGE_ROUTE = "/api/storage/local";

const DEFAULT_EXPIRY_SECONDS = 15 * 60;

/**
 * Filesystem-backed storage for local development: no MinIO/S3 needed.
 * Presigned URLs point to our own route handler and carry an HMAC-signed token.
 */
export class LocalObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly appUrl: string,
    private readonly signingSecret: string,
  ) {
    this.root = path.resolve(rootDir);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const filePath = path.resolve(this.root, key);
    if (!filePath.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return filePath;
  }

  private expiry(seconds = DEFAULT_EXPIRY_SECONDS): number {
    return Math.floor(Date.now() / 1000) + seconds;
  }

  async presignUpload({
    key,
    contentType,
    maxBytes,
    expiresInSeconds,
  }: PresignUploadParams): Promise<PresignedUpload> {
    this.resolve(key);
    const exp = this.expiry(expiresInSeconds);
    const token = signStorageToken({ op: "put", key, exp, max: maxBytes }, this.signingSecret);
    return {
      // Relative on purpose: uploads always come from the app's own origin.
      url: `${LOCAL_STORAGE_ROUTE}?token=${token}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(exp * 1000),
    };
  }

  async presignDownload({ key, fileName, expiresInSeconds }: PresignDownloadParams) {
    this.resolve(key);
    const token = signStorageToken(
      { op: "get", key, exp: this.expiry(expiresInSeconds), fn: fileName },
      this.signingSecret,
    );
    return new URL(`${LOCAL_STORAGE_ROUTE}?token=${token}`, this.appUrl).toString();
  }

  async stat(key: string) {
    try {
      const info = await stat(this.resolve(key));
      return { size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async getText(key: string) {
    return readFile(this.resolve(key), "utf8");
  }

  async put(key: string, body: string | Uint8Array) {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.resolve(key), { force: true })));
  }

  /** Streams an upload to disk, aborting as soon as `maxBytes` is exceeded. */
  async writeStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
    const filePath = this.resolve(key);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.part`;
    await mkdir(path.dirname(filePath), { recursive: true });

    let written = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length;
        if (written > maxBytes) callback(new StorageObjectTooLargeError(maxBytes));
        else callback(null, chunk);
      },
    });

    try {
      // DOM and node:stream/web stream types are structurally identical at runtime.
      const source = Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>);
      await pipeline(source, limiter, createWriteStream(tempPath));
      await rename(tempPath, filePath);
      return written;
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  openReadStream(key: string): ReadableStream<Uint8Array> {
    return Readable.toWeb(createReadStream(this.resolve(key))) as ReadableStream<Uint8Array>;
  }
}
