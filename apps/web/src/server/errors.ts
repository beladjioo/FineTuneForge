/**
 * An expected, user-facing failure (quota reached, resource not found…).
 * Its message is safe to show; any other error is logged and replaced by a
 * generic message so internals never leak to the client.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}
