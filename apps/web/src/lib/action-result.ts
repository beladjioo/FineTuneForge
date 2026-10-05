/**
 * Uniform return type of every Server Action: never throw across the network
 * boundary, return a typed result the UI can render.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
