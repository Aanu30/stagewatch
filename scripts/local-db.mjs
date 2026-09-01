// Runs PGlite as a real Postgres server over TCP, so `npm run dev` can talk to
// a live database without a Supabase project.
//
//   npm run db:local
//
// Then point .env.local at it:
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
//
// Dev only. The data lives in memory and vanishes when this process exits.
// Nothing in app/ or lib/ imports this file.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { repoRoot } from "./harness.mjs";

const withFixture = process.argv.includes("--fixture");
const files = ["001_schema.sql", "002_seed.sql", "004_sources.sql", "006_more_sources.sql", "007_baseline.sql", "008_kind_and_cycle.sql", "009_role_open_status.sql", "010_categories.sql", "011_am_and_tier.sql", "012_assessment_formats.sql", "013_more_firms.sql", "014_more_sources.sql", "015_eightfold.sql", "016_icims.sql", "017_catalogue_breadth.sql", "018_accents_and_alias_search.sql"];
if (withFixture) files.push("003_test_fixture.sql", "005_test_postings.sql");

const db = await PGlite.create();
for (const file of files) {
  const sql = await readFile(join(repoRoot, "db", file), "utf8");
  await db.exec(sql);
  console.log(`applied db/${file}`);
}

// maxConnections defaults to 1, which is not enough: Next opens separate
// connections for page renders and for route handlers, and the second one gets
// dropped with ECONNRESET. Real Postgres has no such limit.
const server = new PGLiteSocketServer({
  db,
  port: 5433,
  host: "127.0.0.1",
  maxConnections: 20,
});
await server.start();

console.log("\nPostgres (PGlite) listening on 127.0.0.1:5433");
console.log("DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres");
if (withFixture) console.log("Test fixture loaded: 50 fake applications.");
console.log("In-memory. Ctrl-C to stop and discard.\n");

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
