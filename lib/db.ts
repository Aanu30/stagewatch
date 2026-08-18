// ============================================================================
// Database access. Two backends behind one interface.
// ============================================================================
//
//   1. Supabase Postgres, via the `postgres` client, when DATABASE_URL is set.
//      This is production.
//
//   2. PGlite - real Postgres compiled to WASM - running inside the server
//      process, when DEMO_MODE is set and DATABASE_URL is not. This exists so
//      the deployed site is clickable and browsable before a Supabase project
//      exists. Schema, seed and fixture are applied at cold start.
//
// Demo mode is genuinely the same Postgres engine, so every query behaves
// identically. What differs is durability: each serverless instance holds its
// own copy in memory, so writes survive only until that instance recycles and
// are invisible to other instances. The UI says so plainly - see
// components/DemoBanner.tsx. Never point real users at demo mode and let them
// believe their submission was kept.
//
// Everything goes through query() and transaction(). Nothing outside this file
// touches a driver, which is what lets the two backends coexist without the
// call sites knowing which one they are on.

import postgres from "postgres";

export type Row = Record<string, unknown>;

export interface Tx {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL || demoMode();
}

export function demoMode(): boolean {
  return !process.env.DATABASE_URL && process.env.DEMO_MODE === "1";
}

// --- Backend 1: Supabase --------------------------------------------------

let pg: ReturnType<typeof postgres> | null = null;

function client() {
  if (pg) return pg;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Put the Supabase transaction-pooler string " +
        "(port 6543) in .env.local, and in the Vercel project's env vars.",
    );
  }

  pg = postgres(url, {
    // Required for Supabase's transaction pooler. PgBouncer in transaction
    // mode hands each query a different backend connection, so a prepared
    // statement created on one is missing on the next. Without this you get
    // intermittent "prepared statement does not exist" errors that only
    // appear under concurrency, which is the worst kind of bug to find in
    // production.
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return pg;
}

// --- Backend 2: PGlite, demo only -----------------------------------------

type PGliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<unknown>;
};

let litePromise: Promise<PGliteLike> | null = null;

async function lite(): Promise<PGliteLike> {
  if (litePromise) return litePromise;

  litePromise = (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const db = new PGlite();
    const dir = join(process.cwd(), "db");
    for (const file of ["001_schema.sql", "002_seed.sql", "003_test_fixture.sql"]) {
      await db.exec(await readFile(join(dir, file), "utf8"));
    }
    return db as unknown as PGliteLike;
  })();

  return litePromise;
}

// --- The interface everything else uses -----------------------------------
//
// Queries are plain SQL strings with $1/$2 placeholders (see lib/sql.ts), so
// the same text runs on both backends and in scripts/verify.mjs.
//
// `.unsafe(text, params)` still binds parameters properly - "unsafe" refers to
// the SQL text being dynamic, not to skipping parameter binding. Every string
// in this app is a module-level constant, never built from user input.

export async function query<T = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (demoMode()) {
    const db = await lite();
    const res = await db.query(sql, params);
    return res.rows as T[];
  }
  const rows = await client().unsafe(sql, params as never[]);
  return rows as unknown as T[];
}

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (demoMode()) {
    // PGlite is single-connection and serialises statements, so the sequence
    // runs without interleaving. It is not a real rollback boundary, which is
    // acceptable here and nowhere else: demo data is disposable.
    const db = await lite();
    return fn({
      async query<R = Row>(sql: string, params: unknown[] = []) {
        const res = await db.query(sql, params);
        return res.rows as R[];
      },
    });
  }

  return client().begin(async (sql) =>
    fn({
      async query<R = Row>(text: string, params: unknown[] = []) {
        const rows = await sql.unsafe(text, params as never[]);
        return rows as unknown as R[];
      },
    }),
  ) as Promise<T>;
}
