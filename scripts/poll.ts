// ============================================================================
// The poller. Run on a schedule by .github/workflows/poll.yml
// ============================================================================
//
//   npm run poll         (DATABASE_URL must be set)
//   npm run poll:dry     fetch and report, write nothing
//
// Run through tsx rather than node: these modules import each other without
// file extensions, which Next's bundler resolves and plain Node ESM does not.
//
// Detection is by diffing: a posting that was not in the database before is a
// posting that just opened. That means this CANNOT BACKFILL - it only ever
// catches openings that happen after it is switched on. Switching it on early
// matters more than building it early.
//
// One source failing must never stop the others, and must never close
// anything. A false "closed" is worse than a late one: somebody reads it and
// decides not to apply.

import { query } from "../lib/db";
import { fetchSource, type SourceRow } from "../lib/ats";
import {
  ENABLED_SOURCES_SQL,
  SOURCE_FAIL_SQL,
  SOURCE_OK_SQL,
  ingest,
  linkAndMarkOpen,
  isInScope,
  cycleVerdict,
  classifyKind,
} from "../lib/postings";

const dry = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. The poller needs a persistent database:");
  console.error("detection is a diff against what was seen last time, and demo");
  console.error("mode forgets everything between runs.");
  process.exit(1);
}

const sources = await query<SourceRow>(ENABLED_SOURCES_SQL);
console.log(`polling ${sources.length} source${sources.length === 1 ? "" : "s"}${dry ? " (dry run)" : ""}\n`);

let totalOpened = 0;
let failures = 0;

for (const src of sources) {
  const label = `${src.vendor}:${src.tenant}`;
  try {
    const raw = await fetchSource(src);

    if (dry) {
      const relevant = raw.filter((p) => {
        const kind = classifyKind(p.title);
        return (
          kind !== null &&
          isInScope(p.locationRaw) &&
          cycleVerdict(p.title, kind).keep
        );
      });
      console.log(`  ${label}: ${raw.length} fetched, ${relevant.length} in scope`);
      for (const p of relevant.slice(0, 8)) {
        console.log(
          `      ${(classifyKind(p.title) ?? "?").padEnd(12)}` +
            `${(cycleVerdict(p.title, classifyKind(p.title)!).cycle ?? "?").padEnd(12)}` +
            `${p.title.slice(0, 44)}`,
        );
      }
      continue;
    }

    const out = await ingest(src, raw);
    totalOpened += out.opened;
    await query(SOURCE_OK_SQL, [src.id]);
    console.log(
      `  ${label}: ${out.fetched} fetched, ${out.relevant} in scope, ` +
        `${out.opened} OPENED, ${out.baselined} baselined, ${out.closed} closed`,
    );
  } catch (err) {
    failures++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${label}: FAILED - ${msg}`);
    // Recorded rather than thrown, so one broken tenant does not hide the rest.
    // sources.last_error is what makes a silently-dead source visible: a source
    // returning nothing looks exactly like a firm that has not opened yet.
    if (!dry) await query(SOURCE_FAIL_SQL, [src.id, msg.slice(0, 500)]);
  }
}

// Matching postings to catalogue roles is what lets the site say "this role is
// open" with evidence rather than assumption.
const nowOpen = dry ? 0 : await linkAndMarkOpen("Summer 2027");

console.log(
  `\ndone. ${totalOpened} newly opened, ${nowOpen} role${nowOpen === 1 ? "" : "s"} ` +
    `newly confirmed open, ${failures} source${failures === 1 ? "" : "s"} failing.`,
);
process.exit(0);
