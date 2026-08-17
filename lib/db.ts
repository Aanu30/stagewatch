import postgres from "postgres";

// Is there a database to talk to at all? Checked by every page so that a
// deployment without DATABASE_URL shows setup instructions instead of a stack
// trace. The site is live on Vercel before Supabase exists, deliberately, so
// this is the normal state on day one rather than an exotic failure.
export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// Lazy singleton. Created on first use rather than at import time, so that
// `next build` can render pages that never touch the database without
// DATABASE_URL being present.
let client: ReturnType<typeof postgres> | null = null;

export function db() {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Put the Supabase transaction-pooler string " +
        "(port 6543) in .env.local, and in the Vercel project's env vars.",
    );
  }

  client = postgres(url, {
    // Required for Supabase's transaction pooler. PgBouncer in transaction
    // mode hands each query a different backend connection, so a prepared
    // statement created on one is missing on the next. Without this you get
    // intermittent "prepared statement does not exist" errors that only show
    // up under concurrency, which is the worst kind of bug to find in
    // production.
    prepare: false,
    // Serverless functions are short-lived and numerous. One connection each
    // keeps us inside Supabase's free-tier pool limit.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return client;
}

// Every read in this app goes through here.
//
// The queries live in lib/queries.ts as plain SQL strings with $1, $2
// placeholders rather than tagged templates, for two reasons:
//
//   1. They can be pasted straight into the Supabase SQL editor to experiment
//      with, replacing $1 by hand. Tagged templates cannot.
//   2. The same string is executed by the PGlite test harness in scripts/, so
//      what gets verified is character-for-character what runs in production.
//
// `.unsafe(sql, params)` still parameterises properly - "unsafe" refers to the
// SQL text being dynamic, not to skipping parameter binding. Every SQL string
// in this app is a module-level constant and is never built from user input.
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await db().unsafe(sql, params as never[]);
  return rows as unknown as T[];
}
