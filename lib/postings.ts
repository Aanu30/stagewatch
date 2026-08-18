// ============================================================================
// Turning raw ATS postings into "this opened just now".
// ============================================================================
//
// Three jobs: decide what is relevant, diff against what we saw last time, and
// mark things closed when they stop appearing.

import { query } from "./db";
import type { RawPosting, SourceRow } from "./ats";

// ---------------------------------------------------------------------------
// Relevance
// ---------------------------------------------------------------------------
//
// Citi's board has 2000 postings and roughly 30 are student roles, so filtering
// is most of the value. Two gates, both deliberately conservative: a posting we
// wrongly drop is invisible, but a posting we wrongly keep pollutes the feed
// that is supposed to be the reason people come back.

// "graduate" is matched on its own, not only when followed by
// programme/analyst/scheme. Requiring the suffix silently dropped Flow
// Traders' "Graduate Trader" in Amsterdam - a role squarely in scope - along
// with every other firm that names the job rather than the scheme.
const EARLY_CAREERS =
  /\b(summer analyst|summer associate|summer intern|internship|intern|graduate|grad scheme|placement|spring (week|insight)|off[- ]cycle|campus|undergraduate|penultimate|trainee)\b/i;

// The exclusion carries more weight now that "graduate" and "campus" match on
// their own. Jane Street's board contains five "Campus Recruiter" roles and no
// student roles at all - their campus hiring runs through a separate portal -
// so without this every one of them would be announced as an opening.
const NOT_A_STUDENT_ROLE =
  /\b(recruiter|recruiting (manager|lead|coordinator)|talent acquisition|university relations|early careers (manager|lead|partner))\b/i;

export function isEarlyCareers(title: string): boolean {
  return EARLY_CAREERS.test(title) && !NOT_A_STUDENT_ROLE.test(title);
}

// UK first, plus the European offices UK students actually apply to. Anything
// else is dropped: Citi's 2027 summer analyst roles are currently Singapore,
// Hong Kong, Taipei, Tampa and Mississauga, none of which belong in this feed.
const IN_SCOPE_LOCATION =
  /\b(united kingdom|england|scotland|wales|northern ireland|london|belfast|edinburgh|glasgow|birmingham|manchester|leeds|bristol|cardiff|amsterdam|netherlands|dublin|ireland|frankfurt|germany|paris|france|zurich|geneva|switzerland|madrid|spain|milan|italy|luxembourg|stockholm|sweden|warsaw|poland)\b/i;

export function isInScope(locationRaw: string | null): boolean {
  if (!locationRaw) return false;
  return IN_SCOPE_LOCATION.test(locationRaw);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
//
// Real Citi titles look like:
//   "Banking - Investment Banking, Summer Analyst, Singapore - APAC, 2027"
//   "Markets - Sales and Trading, Summer Analyst, Singapore - 2027"
//   "Functions - Internal Audit, Summer Analyst - Mississauga, ON 2027"
//
// The division is the leading segment before the first comma, and where that
// segment itself contains " - " the more specific half is the useful one:
// "Banking - Investment Banking" means Investment Banking.

export function parseDivision(title: string): string | null {
  const lead = title.split(",")[0]?.trim();
  if (!lead) return null;

  const parts = lead.split(/\s+[-–—]\s+/).map((s) => s.trim());
  const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  // If the specific half is just the programme name, fall back to the general
  // half: "Summer Analyst" is not a division.
  if (EARLY_CAREERS.test(candidate) && parts.length > 1) return parts[0];
  if (EARLY_CAREERS.test(candidate)) return null;

  return candidate || null;
}

// A four-digit year in the title is the cycle. Absent is left null: a guessed
// cycle is worse than no cycle, because it silently files a posting under the
// wrong year.
export function parseCycle(title: string): string | null {
  const m = title.match(/\b(20\d{2})\b/);
  if (!m) return null;
  if (/spring/i.test(title)) return `Spring ${m[1]}`;
  return `Summer ${m[1]}`;
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

const UPSERT_POSTING_SQL = `
insert into postings
  (source_id, external_id, url, title, title_norm, location_raw, location_norm,
   cycle_guess, division_guess, vendor_first_published, vendor_deadline,
   is_baseline)
values
  ($1, $2, $3, $4, normalise_name($4::text), $5, normalise_name(coalesce($5,'')::text),
   $6, $7, $8::date, $9::date, $10)
on conflict (source_id, external_id) do update
  set last_seen_at = now(),
      title        = excluded.title,
      closed_at    = null
returning id, (xmax = 0) as inserted
`;

// True when this source has never completed a poll, so nothing on it can be
// called new. See db/007_baseline.sql.
const IS_FIRST_POLL_SQL = `
select last_ok_at is null as first_poll from sources where id = $1
`;

// `xmax = 0` is the Postgres trick for "this row was INSERTed, not UPDATEd" on
// an upsert. It is what tells us an opening just happened, without a second
// round trip to check whether the row existed.

const MARK_CLOSED_SQL = `
update postings
   set closed_at = now()
 where source_id = $1
   and closed_at is null
   and last_seen_at < now() - make_interval(hours => $2::int)
returning id
`;

export type PollOutcome = {
  fetched: number;
  relevant: number;
  opened: number;
  /** Recorded on a source's first poll: exists, but not known to be new. */
  baselined: number;
  closed: number;
};

// Closure is only inferred after this long without a sighting. A single failed
// poll must never close anything: one Workday outage would otherwise mark every
// bank closed at once, and a false "closed" is worse than a late one because
// somebody decides not to apply.
const CLOSE_AFTER_HOURS = 72;

export async function ingest(
  src: SourceRow,
  raw: RawPosting[],
): Promise<PollOutcome> {
  const relevant = raw.filter(
    (p) => isEarlyCareers(p.title) && isInScope(p.locationRaw),
  );

  // On a source's first successful poll everything is unseen, so nothing on it
  // can honestly be called an opening. Those rows are stored as the comparison
  // set and never surfaced.
  const firstPoll =
    (await query<{ first_poll: boolean }>(IS_FIRST_POLL_SQL, [src.id]))[0]
      ?.first_poll ?? false;

  let opened = 0;
  let baselined = 0;
  for (const p of relevant) {
    const rows = await query<{ id: number; inserted: boolean }>(
      UPSERT_POSTING_SQL,
      [
        src.id,
        p.externalId,
        p.url,
        p.title,
        p.locationRaw,
        parseCycle(p.title),
        parseDivision(p.title),
        p.vendorFirstPublished,
        p.vendorDeadline,
        firstPoll,
      ],
    );
    if (rows[0]?.inserted) {
      if (firstPoll) baselined++;
      else opened++;
    }
  }

  // Only ever close on a poll that actually succeeded, which is why this lives
  // here rather than in the runner.
  const closed = await query(MARK_CLOSED_SQL, [src.id, CLOSE_AFTER_HOURS]);

  return {
    fetched: raw.length,
    relevant: relevant.length,
    opened,
    baselined,
    closed: closed.length,
  };
}

// ---------------------------------------------------------------------------
// Reads for the UI
// ---------------------------------------------------------------------------

export const JUST_OPENED_SQL = `
select p.title,
       p.url,
       p.location_raw,
       p.cycle_guess,
       p.division_guess,
       p.first_seen_at,
       p.vendor_first_published,
       f.name     as firm_name,
       f.category
from postings p
join sources s on s.id = p.source_id
join firms   f on f.id = s.firm_id
where p.closed_at is null
  and not p.is_baseline
  and p.first_seen_at >= now() - make_interval(hours => $1::int)
  and ($2::text is null or f.category = $2::text)
order by p.first_seen_at desc
limit 40
`;

export type JustOpened = {
  title: string;
  url: string | null;
  location_raw: string | null;
  cycle_guess: string | null;
  division_guess: string | null;
  first_seen_at: string;
  vendor_first_published: string | null;
  firm_name: string;
  category: string;
};

export function getJustOpened(windowHours: number, category: string | null) {
  return query<JustOpened>(JUST_OPENED_SQL, [windowHours, category]);
}

export const ENABLED_SOURCES_SQL = `
select id, vendor, tenant, host_prefix, board_path
from sources
where enabled
order by id
`;

export const SOURCE_OK_SQL = `
update sources
   set last_polled_at = now(), last_ok_at = now(),
       last_error = null, consecutive_failures = 0
 where id = $1
`;

export const SOURCE_FAIL_SQL = `
update sources
   set last_polled_at = now(), last_error = $2,
       consecutive_failures = consecutive_failures + 1
 where id = $1
`;
