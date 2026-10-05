/**
 * Storage key layout. Everything a user owns lives under `users/{userId}/`, which
 * makes per-user cleanup (account deletion, GDPR export) a single prefix operation.
 */

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export const storageKeys = {
  datasetOriginal: (userId: string, datasetId: string, extension: string) =>
    `users/${userId}/datasets/${datasetId}/original${extension}`,
  datasetNormalized: (userId: string, datasetId: string) =>
    `users/${userId}/datasets/${datasetId}/normalized.jsonl`,
};
