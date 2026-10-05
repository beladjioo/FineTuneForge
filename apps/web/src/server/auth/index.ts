import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { SocialProvider } from "@/features/auth/providers";
import { db } from "../db";
import { accounts, sessions, users, verifications } from "../db/schema";
import { env } from "../env";

/**
 * Better Auth: self-hosted, sessions and users live in our own Postgres, so the
 * whole product runs locally without any third-party auth account.
 */

const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
};

/** OAuth providers configured in this environment (drives which buttons are shown). */
export const enabledSocialProviders = Object.keys(socialProviders) as SocialProvider[];

export const auth = betterAuth({
  appName: "FineTuneForge",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  advanced: {
    // Postgres generates UUIDs (gen_random_uuid()), consistent with our domain tables.
    database: { generateId: "uuid" },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders,
  user: {
    additionalFields: {
      // Read-only from the client (`input: false`): only billing code may change it.
      plan: { type: "string", required: false, defaultValue: "free", input: false },
    },
  },
  session: {
    // Short-lived signed cookie cache: avoids a DB round-trip on every request.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Must stay last: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
