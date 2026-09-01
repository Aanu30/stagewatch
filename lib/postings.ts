// ============================================================================
// Turning raw ATS postings into "this opened just now".
// ============================================================================
//
// Three jobs: decide what is relevant, diff against what we saw last time, and
// mark things closed when they stop appearing.

import { query } from "./db";
import { TARGET_CYCLE, TARGET_CYCLE_YEAR, categoriseText } from "./constants";
import type { RawPosting, SourceRow } from "./ats";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
//
// Internships and graduate roles are DIFFERENT PRODUCTS and are kept apart.
// A summer internship is a student applying in their penultimate year; a
// graduate role is full-time employment starting on graduation. Mixing them
// makes every rate on the site meaningless, because they have different
// applicant pools, different timelines and different selectivity.
//
// An earlier version of this file matched a bare "graduate" so that Flow
// Traders' "Graduate Trader" would be caught, which quietly put full-time jobs
// in a feed about internships. Widening a filter to fix one miss is how a
// dataset stops meaning one thing. They are now separated, not merged and not
// discarded.

const INTERNSHIP =
  /\b(summer analyst|summer associate|summer intern|internship|intern)\b/i;

const SPRING_WEEK = /\b(spring (week|insight|programme|program))\b/i;

const OFF_CYCLE = /\b(off[- ]cycle|industrial placement|placement year|year in industry)\b/i;

const GRADUATE =
  /\b(graduate|grad scheme|trainee|full[- ]time analyst|new grad)\b/i;

// Corporate-function traineeships. Real early-careers roles, but not in any
// category this site covers (IB/Markets, asset management, quant, software,
// data/AI, consulting). Man Group's "Trainee Company Secretarial Assistant"
// was being filed as quant purely because Man Group is a quant firm - a
// category that is wrong is worse than an absence.
const OUT_OF_REMIT =
  /\b(company secretarial|secretarial|paralegal|legal counsel|compliance officer|human resources|\bhr\b|marketing|facilities|receptionist|executive assistant)\b/i;

// The firm hiring its own recruiting staff. "Campus Recruiter" is a career,
// not a campus role, and Jane Street's board carries five of them.
const NOT_A_STUDENT_ROLE =
  /\b(recruiter|recruiting (manager|lead|coordinator)|talent acquisition|university relations|early careers (manager|lead|partner))\b/i;

export type PostingKind = "internship" | "spring_week" | "off_cycle" | "graduate";

// Order matters. "Summer Internship" wins over "graduate" when a title
// contains both, because the internship word is the more specific claim.
export function classifyKind(title: string): PostingKind | null {
  if (NOT_A_STUDENT_ROLE.test(title)) return null;
  if (OUT_OF_REMIT.test(title)) return null;
  if (SPRING_WEEK.test(title)) return "spring_week";
  if (INTERNSHIP.test(title)) return "internship";
  if (OFF_CYCLE.test(title)) return "off_cycle";
  if (GRADUATE.test(title)) return "graduate";
  return null;
}

// Kept for the pulse-page vocabulary and for callers that only care whether a
// posting is a student role at all.
export function isEarlyCareers(title: string): boolean {
  return classifyKind(title) !== null;
}

// UK first, plus the European offices UK students actually apply to. Anything
// else is dropped: Citi's 2027 summer analyst roles are currently Singapore,
// Hong Kong, Taipei, Tampa and Mississauga, none of which belong in this feed.
//
// Includes London building and district names because some employers put an
// ADDRESS in the location field rather than a city. Barclays reports
// "Canary Wharf, 1 Churchill Place", which contains neither "London" nor
// "United Kingdom" and was being silently dropped - taking their live 2027
// London summer internships with it. That is the worst failure mode this
// system has: a filter miss is indistinguishable from a firm that has not
// opened yet.
const IN_SCOPE_LOCATION =
  /\b(united kingdom|england|scotland|wales|northern ireland|london|belfast|edinburgh|glasgow|birmingham|manchester|leeds|bristol|cardiff|canary wharf|churchill place|bishopsgate|broadgate|moorgate|liverpool street|bank street|amsterdam|netherlands|dublin|ireland|frankfurt|germany|paris|france|zurich|geneva|switzerland|madrid|spain|milan|italy|luxembourg|stockholm|sweden|warsaw|poland)\b/i;

// Checks the TITLE as well as the location field. Employers who use an address
// for location almost always still name the city in the title - Barclays'
// "Banking Summer Internship Programme 2027 London" is located at
// "Canary Wharf, 1 Churchill Place". Reading only one field loses the role.
export function isInScope(
  locationRaw: string | null,
  title: string | null = null,
): boolean {
  const haystack = [locationRaw, title].filter(Boolean).join(" ");
  if (!haystack) return false;
  return IN_SCOPE_LOCATION.test(haystack);
}

// ---------------------------------------------------------------------------
// Cycle
// ---------------------------------------------------------------------------
//
// Only INTERNSHIPS are gated on the cycle, because only they have one that v1
// cares about. Three outcomes, and the middle is the interesting case:
//
//   names 2027         -> keep, confirmed
//   names no year      -> keep, ASSUMED. Summer 2026 has been and gone, so an
//                         internship still advertised now cannot be for it.
//                         Sound, but an assumption, and the UI says so.
//   names another year -> drop. "Graduate Software Engineer (2026)" is a real
//                         posting for a real cycle, just not this one.
//
// Graduate and spring roles keep whatever year they state and are never
// dropped on it: they are stored for later cycles, not shown in the v1 feed.
export function cycleVerdict(
  title: string,
  kind: PostingKind,
): { keep: boolean; cycle: string | null; confirmed: boolean } {
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));

  if (kind !== "internship") {
    return {
      keep: true,
      cycle: years.length ? `${years[0]}` : null,
      confirmed: years.length > 0,
    };
  }

  if (years.length === 0) return { keep: true, cycle: TARGET_CYCLE, confirmed: false };
  if (years.includes(TARGET_CYCLE_YEAR))
    return { keep: true, cycle: TARGET_CYCLE, confirmed: true };
  return { keep: false, cycle: null, confirmed: false };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
//
// Real Citi titles look like:
//   "Banking - Investment Banking, Summer Analyst, Singapore - APAC, 2027"
//   "Functions - Internal Audit, Summer Analyst - Mississauga, ON 2027"
//
// The division is the leading segment before the first comma, and where that
// segment itself contains " - " the more specific half is the useful one:
// "Banking - Investment Banking" means Investment Banking.
//
// Greenhouse and Lever titles usually have no such structure, so this returns
// null often. Null is correct: the UI falls back to the posting title, which
// is real, rather than to a guess.

export function parseDivision(title: string): string | null {
  const lead = title.split(",")[0]?.trim();
  if (!lead) return null;

  const parts = lead.split(/\s+[-\u2013\u2014]\s+/).map((x) => x.trim());
  const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  const looksLikeProgramme = (x: string) =>
    INTERNSHIP.test(x) || GRADUATE.test(x) || SPRING_WEEK.test(x);

  if (looksLikeProgramme(candidate) && parts.length > 1) return parts[0];
  if (looksLikeProgramme(candidate)) return null;
  return candidate || null;
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

const UPSERT_POSTING_SQL = `
insert into postings
  (source_id, external_id, url, title, title_norm, location_raw, location_norm,
   cycle_guess, division_guess, vendor_first_published, vendor_deadline,
   is_baseline, kind, cycle_confirmed, category)
values
  ($1, $2, $3, $4, normalise_name($4::text), $5, normalise_name(coalesce($5,'')::text),
   $6, $7, $8::date, $9::date, $10, $11, $12, $13)
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
  // Forces every new posting to be stored as baseline. Used after a change to
  // the relevance filters, when a posting appearing for the first time means
  // "we can finally see it" rather than "the firm just opened it".
  forceBaseline = false,
): Promise<PollOutcome> {
  const relevant = raw
    .map((p) => ({ p, kind: classifyKind(p.title) }))
    .filter((x): x is { p: RawPosting; kind: PostingKind } => x.kind !== null)
    .map((x) => ({ ...x, cyc: cycleVerdict(x.p.title, x.kind) }))
    .filter((x) => x.cyc.keep && isInScope(x.p.locationRaw, x.p.title));

  // On a source's first successful poll everything is unseen, so nothing on it
  // can honestly be called an opening. Those rows are stored as the comparison
  // set and never surfaced.
  const firstPoll =
    forceBaseline ||
    ((await query<{ first_poll: boolean }>(IS_FIRST_POLL_SQL, [src.id]))[0]
      ?.first_poll ??
      false);

  let opened = 0;
  let baselined = 0;
  for (const { p, kind, cyc } of relevant) {
    const rows = await query<{ id: number; inserted: boolean }>(
      UPSERT_POSTING_SQL,
      [
        src.id,
        p.externalId,
        p.url,
        p.title,
        p.locationRaw,
        cyc.cycle,
        parseDivision(p.title),
        p.vendorFirstPublished,
        p.vendorDeadline,
        firstPoll,
        kind,
        cyc.confirmed,
        categoriseText(`${parseDivision(p.title) ?? ""} ${p.title}`),
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
// Linking postings to catalogue roles
// ---------------------------------------------------------------------------
//
// A detected posting is the strongest evidence a role is genuinely open. This
// matches conservatively: same firm, same cycle, and the role's division named
// somewhere in the posting title. A miss leaves the role merely listed, which
// is the honest default; a false match would claim a role is open when it is
// not, which is the failure that matters.

const LINK_POSTINGS_SQL = `
with matched as (
  select p.id as posting_id, r.id as role_id
  from postings p
  join sources s on s.id = p.source_id
  join roles   r on r.firm_id = s.firm_id
  where p.kind = 'internship'
    and p.closed_at is null
    and r.cycle = $1
    and position(r.division_norm in p.title_norm) > 0
)
update postings p
   set role_id = m.role_id
  from matched m
 where p.id = m.posting_id
   and p.role_id is distinct from m.role_id
returning p.id
`;

const MARK_ROLES_OPEN_SQL = `
update roles r
   set opened_at = coalesce(r.opened_at, p.first_seen),
       opened_evidence = coalesce(r.opened_evidence, 'posting')
  from (select role_id, min(first_seen_at) as first_seen
          from postings
         where role_id is not null and closed_at is null
         group by role_id) p
 where p.role_id = r.id
   and r.opened_at is null
returning r.id
`;

// Called after every successful poll. Returns how many roles newly became
// known-open.
export async function linkAndMarkOpen(targetCycle: string): Promise<number> {
  await query(LINK_POSTINGS_SQL, [targetCycle]);
  const opened = await query(MARK_ROLES_OPEN_SQL);
  return opened.length;
}

// ---------------------------------------------------------------------------
// Reads for the UI
// ---------------------------------------------------------------------------

export const JUST_OPENED_SQL = `
select p.title,
       p.url,
       p.location_raw,
       p.cycle_guess,
       p.cycle_confirmed,
       p.division_guess,
       p.first_seen_at,
       p.vendor_first_published,
       f.name     as firm_name,
       p.category
from postings p
join sources s on s.id = p.source_id
join firms   f on f.id = s.firm_id
where p.closed_at is null
  and not p.is_baseline
  and p.kind = 'internship'
  and p.first_seen_at >= now() - make_interval(hours => $1::int)
  and ($2::text is null or p.category = $2::text)
order by p.first_seen_at desc
limit 40
`;

export type JustOpened = {
  title: string;
  url: string | null;
  location_raw: string | null;
  cycle_guess: string | null;
  cycle_confirmed: boolean;
  division_guess: string | null;
  first_seen_at: string;
  vendor_first_published: string | null;
  firm_name: string;
  category: string;
};

export function getJustOpened(windowHours: number, category: string | null) {
  return query<JustOpened>(JUST_OPENED_SQL, [windowHours, category]);
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------
//
// Salted IP hashes exist only to rate-limit, which needs a 24-hour window. Any
// hash older than the retention period has served its entire purpose and is
// nulled - keeping it would mean holding a per-person identifier indefinitely
// for no operational reason, which is exactly what a retention period is for.
//
// The hash is salted, so it was never reversible; this is about not keeping a
// stable pseudonymous identifier longer than it is used. Run from the poller,
// which already executes regularly, rather than adding scheduled infrastructure.
export const IP_RETENTION_HOURS = 48;

export const PURGE_IP_HASHES_SQL = `
with a as (
  update applications set ip_hash = null
   where ip_hash is not null
     and created_at < now() - make_interval(hours => $1::int)
  returning 1
),
m as (
  update merge_queue set ip_hash = null
   where ip_hash is not null
     and created_at < now() - make_interval(hours => $1::int)
  returning 1
),
f as (
  update assessment_formats set ip_hash = null
   where ip_hash is not null
     and created_at < now() - make_interval(hours => $1::int)
  returning 1
)
select (select count(*) from a) + (select count(*) from m) + (select count(*) from f) as purged
`;

export async function purgeOldIpHashes(): Promise<number> {
  const rows = await query<{ purged: number }>(PURGE_IP_HASHES_SQL, [
    IP_RETENTION_HOURS,
  ]);
  return Number(rows[0]?.purged ?? 0);
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

// ---------------------------------------------------------------------------
// Materialising roles from real postings
// ---------------------------------------------------------------------------
//
// The catalogue was seeded from how firms are usually structured, which was
// both wrong and incomplete - Barclays was seeded with three invented
// divisions and actually runs six, each a separate programme with its own
// timeline. This replaces guesswork with observation: every posting the
// detector finds becomes a role, so the catalogue can only contain things that
// genuinely exist.
//
// Every distinct (firm, division, programme, location, cycle) is its own row.
// Barclays Banking Summer Internship and Barclays Banking Graduate Programme
// are two roles, not one, because they open at different times and select
// different people.

const UPSERT_ROLE_FROM_POSTING_SQL = `
insert into roles
  (firm_id, programme_id, division, division_norm, location, location_norm,
   cycle, slug, category, opened_at, opened_evidence)
select $1, p.id, $2::text, normalise_name($2::text), $3::text,
       normalise_name($3::text), $4::text,
       slugify($5::text), $6::text, now(), 'posting'
from programmes p
where p.slug = $7::text
on conflict (firm_id, programme_id, division_norm, location_norm, cycle)
  do update set opened_at = coalesce(roles.opened_at, now()),
                opened_evidence = coalesce(roles.opened_evidence, 'posting')
returning id, slug
`;

const ATTACH_POSTING_SQL = `update postings set role_id = $2 where id = $1`;

export type MaterialiseResult = { created: number; matched: number; skipped: number };

export async function materialiseRolesFromPostings(): Promise<MaterialiseResult> {
  const { roleNameFromTitle, cityFrom, programmeSlugFor } = await import("./rolename");

  const postings = await query<{
    id: number; title: string; location_raw: string | null;
    kind: string; cycle_guess: string | null; category: string | null;
    firm_id: number; firm_slug: string; firm_tier: string | null;
    role_id: number | null;
  }>(`
    select p.id, p.title, p.location_raw, p.kind, p.cycle_guess, p.category,
           s.firm_id, f.slug as firm_slug, f.tier as firm_tier, p.role_id
    from postings p
    join sources s on s.id = p.source_id
    join firms f on f.id = s.firm_id
    where p.closed_at is null
  `);

  let created = 0, matched = 0, skipped = 0;

  for (const p of postings) {
    const division = roleNameFromTitle(p.title);
    const location = cityFrom(p.location_raw, p.title);

    // No usable division or an out-of-scope city: leave it unattached rather
    // than invent a role. An unattached posting is visible in the admin queue;
    // a wrong role is invisible and permanent.
    if (!division || !location) { skipped++; continue; }

    const rows = await query<{ id: number; slug: string }>(
      UPSERT_ROLE_FROM_POSTING_SQL,
      [
        p.firm_id,
        division,
        location,
        p.cycle_guess ?? "Summer 2027",
        `${p.firm_slug} ${division} ${location} ${programmeSlugFor(p.kind)} ${p.cycle_guess ?? "Summer 2027"}`,
        // Recategorised here with the firm as context, because the value
        // stored at ingest was computed without it.
        categoriseText(`${division} ${p.title}`, p.firm_tier),
        programmeSlugFor(p.kind),
      ],
    );

    const role = rows[0];
    if (!role) { skipped++; continue; }

    if (p.role_id !== role.id) await query(ATTACH_POSTING_SQL, [p.id, role.id]);
    if (p.role_id == null) created++; else matched++;
  }

  return { created, matched, skipped };
}
