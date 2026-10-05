/** First instant of the current calendar month (UTC): monthly quotas reset then. */
export function startOfCurrentMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
