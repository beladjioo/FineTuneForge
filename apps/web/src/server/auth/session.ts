import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from ".";

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];

/**
 * Data Access Layer entry point for authentication. Memoized per request with
 * React `cache`, so layouts, pages and actions can all call it freely.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** For pages and layouts: redirects anonymous visitors to the sign-in page. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
