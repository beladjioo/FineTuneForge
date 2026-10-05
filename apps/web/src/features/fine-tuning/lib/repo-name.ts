/**
 * Hugging Face repo names: letters, digits, "-", "_" and ".", at most 96 characters,
 * no leading/trailing separator.
 */
const MAX_LENGTH = 96;

export function toRepoName(value: string): string {
  const name = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/[-._]+$/g, "");
  return name || "mon-modele";
}

export const REPO_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,94}[a-z0-9])?$/;

/** "-2", "-3"… suffix used when the repo name is already taken on the Hub. */
export function withSuffix(name: string, suffix: string): string {
  return `${name.slice(0, MAX_LENGTH - suffix.length - 1)}-${suffix}`;
}
