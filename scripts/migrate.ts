// Applies db/*.sql to whatever DATABASE_URL points at.
//
//   npm run migrate
//
// Only ever applies 001, 002 and 004. The 003 and 005 fixtures are invented
// data for the verification pass and must never reach a real database - which
// is why they are excluded here rather than merely "not usually run".

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const FILES = ["001_schema.sql", "002_seed.sql", "004_sources.sql", "006_more_sources.sql", "007_baseline.sql", "008_kind_and_cycle.sql", "009_role_open_status.sql", "010_categories.sql", "011_am_and_tier.sql", "012_assessment_formats.sql", "013_more_firms.sql", "014_more_sources.sql", "015_eightfold.sql"];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 20,
  idle_timeout: 20,
});

try {
  for (const file of FILES) {
    const text = await readFile(join(process.cwd(), "db", file), "utf8");
    process.stdout.write(`  ${file} ... `);
    await sql.unsafe(text);
    console.log("ok");
  }

  const counts = await sql`
    select
      (select count(*) from firms)      as firms,
      (select count(*) from programmes) as programmes,
      (select count(*) from roles)      as roles,
      (select count(*) from aliases)    as aliases,
      (select count(*) from stages)     as stages,
      (select count(*) from sources)    as sources`;
  console.log("\n ", counts[0]);
} catch (err) {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
