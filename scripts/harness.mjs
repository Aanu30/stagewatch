// Test harness: runs the real Postgres engine in-process via PGlite (Postgres
// compiled to WASM), so the schema, seed and every aggregation query can be
// executed and checked without a Supabase project.
//
// This is a dev tool only. Nothing in app/ or lib/ imports it.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..");

// Applies the given db/*.sql files in order to a fresh in-memory database.
export async function freshDb(files = ["001_schema.sql", "002_seed.sql"]) {
  const db = new PGlite();
  for (const file of files) {
    const sql = await readFile(join(repoRoot, "db", file), "utf8");
    await db.exec(sql);
  }
  return db;
}

// Small assertion helpers. Plain functions, no test framework.
let passed = 0;
let failed = 0;

export function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

export function checkEqual(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, a === e ? "" : `expected ${e}\n        got      ${a}`);
}

// Asserts that a statement is rejected by the database.
export async function checkRejects(db, label, sql) {
  try {
    await db.exec(sql);
    check(label, false, "statement succeeded but should have been rejected");
  } catch {
    check(label, true);
  }
}

export function section(name) {
  console.log(`\n${name}`);
}

export function report() {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
  return failed === 0;
}
