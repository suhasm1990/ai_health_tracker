import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __ghDb?: Db };

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Drizzle instance, or null when DATABASE_URL is unset (persistence is optional). */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.__ghDb) {
    // prepare:false keeps transaction-mode poolers (Supabase, Neon) working.
    globalForDb.__ghDb = drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
  }
  return globalForDb.__ghDb;
}
