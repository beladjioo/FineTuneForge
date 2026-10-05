import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * One connection pool per server process. In development, Next.js hot reload
 * re-evaluates modules, so the pool is cached on `globalThis` to avoid leaking
 * connections on every edit.
 */
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client =
  globalForDb.pgClient ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 10 : 5,
    // Required for transaction-mode poolers (Supabase/PgBouncer :6543).
    prepare: false,
  });

if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type Database = typeof db;
