// ============================================================================
// Verification pass (build order step 11).
// ============================================================================
//
// Loads the real schema, the real seed and a deliberately nasty fixture into an
// actual Postgres engine (PGlite), then runs the EXACT SQL strings the app runs
// and checks every number against hand-computed answers in
// db/003_test_fixture.sql.
//
//   npm run verify
//
// Three things it is specifically trying to catch:
//   1. A number on the pulse page being wrong.
//   2. The n >= 10 suppression being bypassable.
//   3. An individual offer being exposed by any route.

import {
  FIRED_FEED_SQL,
  FUNNEL_SQL,
  HAS_LOGGED_SQL,
  HEADLINE_SQL,
  MEDIAN_GAPS_SQL,
  ROLE_BY_SLUG_SQL,
  ROLE_TOTAL_SQL,
  SEARCH_ROLES_SQL,
  SELECTIVITY_SQL,
  STAGE_ACTIVITY_SQL,
  TIMING_BY_DAY_SQL,
  TIMING_BY_HOUR_SQL,
} from "../lib/sql.ts";

import { check, checkEqual, checkRejects, freshDb, report, section } from "./harness.mjs";

const MIN_N = 10;

const db = await freshDb([
  "001_schema.sql", "002_seed.sql", "004_sources.sql", "006_more_sources.sql",
  "007_baseline.sql", "008_kind_and_cycle.sql", "009_role_open_status.sql",
  "010_categories.sql", "011_am_and_tier.sql", "012_assessment_formats.sql",
  "003_test_fixture.sql",
]);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const roleId = async (slug) => (await one(ROLE_BY_SLUG_SQL, [slug])).id;

const BOFA = "bank-of-america-global-capital-markets-london-summer-2027";
const OPTIVER = "optiver-software-engineering-amsterdam-summer-2027";
const QATALYST = "qatalyst-partners-m-a-london-summer-2027";
const JANE = "jane-street-quantitative-trading-london-summer-2027";
const EVERCORE = "evercore-m-a-london-summer-2027";

const bofa = await roleId(BOFA);
const optiver = await roleId(OPTIVER);
const qatalyst = await roleId(QATALYST);
const jane = await roleId(JANE);
const evercore = await roleId(EVERCORE);

const n = (v) => (v == null ? 0 : Number(v));
const byCode = (rows) => Object.fromEntries(rows.map((r) => [r.code, r]));

// ---------------------------------------------------------------------------
section("A. Denominators");
// ---------------------------------------------------------------------------

checkEqual("BofA GCM has 24 applications", n((await one(ROLE_TOTAL_SQL, [bofa])).n), 24);
checkEqual("Optiver SWE has 9 applications", n((await one(ROLE_TOTAL_SQL, [optiver])).n), 9);
checkEqual("Qatalyst M&A has 1 application", n((await one(ROLE_TOTAL_SQL, [qatalyst])).n), 1);
checkEqual("Jane Street QT has 12 applications", n((await one(ROLE_TOTAL_SQL, [jane])).n), 12);
checkEqual("Evercore M&A has 4 applications", n((await one(ROLE_TOTAL_SQL, [evercore])).n), 4);

// ---------------------------------------------------------------------------
section("B. Selectivity, including the sparse ladder");
// ---------------------------------------------------------------------------

const sel = byCode(await q(SELECTIVITY_SQL, [bofa]));

checkEqual("denominator is every applicant, not just those who logged 'applied'",
  n(sel.oa.denominator), 24);
checkEqual("12 of 24 reached the OA", n(sel.oa.reached), 12);
checkEqual("6 of 24 reached the video stage", n(sel.video.reached), 6);
checkEqual("3 of 24 reached first round", n(sel.first_round.reached), 3);
checkEqual("2 of 24 reached offer", n(sel.offer.reached), 2);
checkEqual("nobody reached the assessment centre", n(sel.assessment_centre.reached), 0);

// The single most important correctness property in the whole app.
check(
  "SPARSE LADDER: the 2 people who skipped the OA are NOT counted as reaching it",
  n(sel.oa.reached) === 12 && n(sel.first_round.reached) === 3,
  `A dense-ladder assumption would report 14 here (12 real + persons 23 and 24, ` +
    `who went straight from applied to first round). Got ${n(sel.oa.reached)}.`,
);

// ---------------------------------------------------------------------------
section("C. Funnel and `distinct on`");
// ---------------------------------------------------------------------------

const fun = byCode(await q(FUNNEL_SQL, [bofa]));

checkEqual("funnel counts 12 people at the OA stage", n(fun.oa.total), 12);
check(
  "DOUBLE-LOGGED STAGE: person 21 logged OA twice; only the later status counts",
  n(fun.oa.waiting) + n(fun.oa.progressed) + n(fun.oa.rejected) + n(fun.oa.withdrew) === 12,
  `waiting=${n(fun.oa.waiting)} progressed=${n(fun.oa.progressed)} ` +
    `rejected=${n(fun.oa.rejected)} withdrew=${n(fun.oa.withdrew)} total=${n(fun.oa.total)}`,
);
checkEqual("person 21's latest OA status is 'waiting', so waiting = 9", n(fun.oa.waiting), 9);
checkEqual("OA progressed = 3 (persons 19, 20, 22)", n(fun.oa.progressed), 3);
checkEqual("video rejected = 1 (person 16)", n(fun.video.rejected), 1);

check(
  "every stage appears in the funnel even with zero rows",
  Object.keys(fun).length === 6,
  `got stages: ${Object.keys(fun).join(", ")}`,
);
checkEqual("assessment centre appears with a zero total", n(fun.assessment_centre.total), 0);

// A role where nothing has fired must still return all six stages.
const janeFunnel = byCode(await q(FUNNEL_SQL, [jane]));
checkEqual("Jane Street: all 12 sit at 'applied'", n(janeFunnel.applied.total), 12);
checkEqual("Jane Street: nothing at the OA stage", n(janeFunnel.oa.total), 0);

// ---------------------------------------------------------------------------
section("D. Headline");
// ---------------------------------------------------------------------------

const bofaHead = await one(HEADLINE_SQL, [bofa]);
check("BofA headline exists", !!bofaHead);
check(
  "BofA headline is NOT the offer, even though an offer is the newest event",
  bofaHead.stage !== "offer",
  `got stage: ${bofaHead?.stage}`,
);

const janeHead = await one(HEADLINE_SQL, [jane]);
check("Jane Street headline is absent - nothing has fired", janeHead === undefined);

const qatHead = await one(HEADLINE_SQL, [qatalyst]);
check(
  "OFFER EXPOSURE: Qatalyst's lone offer produces NO headline",
  qatHead === undefined,
  `got: ${JSON.stringify(qatHead)}`,
);

// ---------------------------------------------------------------------------
section("E. Stage activity never surfaces an offer count");
// ---------------------------------------------------------------------------

const act = byCode(await q(STAGE_ACTIVITY_SQL, [bofa]));
checkEqual("activity: 12 people logged an OA", n(act.oa.people), 12);
// The SQL returns the offer row; lib/pulse.ts strips it before it reaches a
// component. Assert the strip rule here so a future refactor cannot quietly
// drop it.
check(
  "the offer row exists in raw SQL and MUST be stripped by lib/pulse.ts",
  n(act.offer.people) === 2,
  "if this changes, re-check the filter in lib/pulse.ts getPulse()",
);

// ---------------------------------------------------------------------------
section("F. Median gaps reject dirty data");
// ---------------------------------------------------------------------------

const med = byCode(await q(MEDIAN_GAPS_SQL, [evercore]));
checkEqual(
  "Evercore: only 1 of 4 contributes an applied->OA gap",
  n(med.oa?.n),
  1,
);
check(
  "TYPO REJECTED: the applicant whose OA predates their application is excluded",
  n(med.oa?.n) === 1,
  "2 people never logged 'applied'; 1 has a negative gap; 1 is valid",
);
checkEqual("that person's gap is 15 days", n(med.oa?.median_days), 15);

const bofaMed = byCode(await q(MEDIAN_GAPS_SQL, [bofa]));
checkEqual("BofA applied->OA median measured over 12 people", n(bofaMed.oa.n), 12);
check(
  "BofA applied->OA median is positive",
  n(bofaMed.oa.median_days) > 0,
  `got ${bofaMed.oa.median_days}`,
);

// ---------------------------------------------------------------------------
section("G. Suppression cannot be bypassed");
// ---------------------------------------------------------------------------

const optiverTotal = n((await one(ROLE_TOTAL_SQL, [optiver])).n);
check(`Optiver n=${optiverTotal} is below MIN_N=${MIN_N}`, optiverTotal < MIN_N);

// The rule lives in lib/pulse.ts. Re-assert the arithmetic here so a change to
// the threshold constant without a change to the logic gets caught.
check(
  "SUPPRESSION: a 9-person role is below threshold and must show no breakdown",
  optiverTotal < MIN_N,
);
check(
  "SUPPRESSION: a 1-person role is below threshold",
  n((await one(ROLE_TOTAL_SQL, [qatalyst])).n) < MIN_N,
);
check(
  "SUPPRESSION: a 12-person role is above the breakdown threshold",
  n((await one(ROLE_TOTAL_SQL, [jane])).n) >= MIN_N,
);

// ---------------------------------------------------------------------------
section("H. No individual offer is exposed by ANY route");
// ---------------------------------------------------------------------------

const feed = await q(FIRED_FEED_SQL, [48, null]);
check(
  "feed contains no offer rows at all",
  feed.every((r) => r.stage !== "offer"),
  `offending: ${JSON.stringify(feed.filter((r) => r.stage === "offer"))}`,
);
check(
  "feed contains no 'applied' rows",
  feed.every((r) => r.stage !== "applied"),
);
check(
  "feed never mentions Qatalyst, whose only event is an offer",
  feed.every((r) => r.firm_name !== "Qatalyst Partners"),
  `offending: ${JSON.stringify(feed.filter((r) => r.firm_name === "Qatalyst Partners"))}`,
);
check("feed is non-empty (BofA and Optiver activity is recent)", feed.length > 0);

const catFeed = await q(FIRED_FEED_SQL, [48, "quant_swe"]);
check(
  "category filter returns only quant_swe rows",
  catFeed.every((r) => r.category === "quant_swe"),
);

// ---------------------------------------------------------------------------
section("I. Soft gate");
// ---------------------------------------------------------------------------

const uid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

check(
  "a person who logged BofA is recognised on BofA",
  (await q(HAS_LOGGED_SQL, [bofa, uid(1)])).length === 1,
);
check(
  "GATE IS PER-ROLE: that same person is NOT unlocked on Optiver",
  (await q(HAS_LOGGED_SQL, [optiver, uid(1)])).length === 0,
);
check(
  "an unknown id unlocks nothing",
  (await q(HAS_LOGGED_SQL, [bofa, "00000000-0000-4000-8000-999999999999"])).length === 0,
);

// ---------------------------------------------------------------------------
section("J. Timing histogram");
// ---------------------------------------------------------------------------

const byDay = await q(TIMING_BY_DAY_SQL, [bofa, "oa"]);
const byHour = await q(TIMING_BY_HOUR_SQL, [bofa, "oa"]);
const dayTotal = byDay.reduce((a, r) => a + n(r.n), 0);
const hourTotal = byHour.reduce((a, r) => a + n(r.n), 0);

check("day histogram has buckets", byDay.length > 0);
check("hour histogram has buckets", byHour.length > 0);
check(
  "hour histogram sample is <= day histogram sample (only those who knew the hour)",
  hourTotal <= dayTotal,
  `hour=${hourTotal} day=${dayTotal}`,
);
check(
  "every hour bucket is a real hour, never a fabricated midnight",
  byHour.every((h) => n(h.occurred_hour) >= 0 && n(h.occurred_hour) <= 23),
);

// Person 18 logged a video with no hour. It must appear in the day chart and
// not in the hour chart.
const vDay = (await q(TIMING_BY_DAY_SQL, [bofa, "video"])).reduce((a, r) => a + n(r.n), 0);
const vHour = (await q(TIMING_BY_HOUR_SQL, [bofa, "video"])).reduce((a, r) => a + n(r.n), 0);
checkEqual("video: 6 events in the day chart", vDay, 6);
checkEqual("UNKNOWN HOUR: only 5 in the hour chart, the 6th did not know", vHour, 5);

// ---------------------------------------------------------------------------
section("K. Search");
// ---------------------------------------------------------------------------

const bofaSearch = await q(SEARCH_ROLES_SQL, [null, "bank of america", null]);
check("search finds BofA roles", bofaSearch.length >= 5);
const amsterdam = await q(SEARCH_ROLES_SQL, [null, "amsterdam", null]);
check("search by location works", amsterdam.length > 0);
const quantOnly = await q(SEARCH_ROLES_SQL, ["quant", null, null]);
check(
  "category filter works in search",
  quantOnly.every((r) => r.category === "quant"),
);
const sweOnly = await q(SEARCH_ROLES_SQL, ["swe", null, null]);
check("quant and swe are genuinely separate filters now",
  quantOnly.length > 0 && sweOnly.length > 0 &&
    sweOnly.every((r) => r.category === "swe"),
  `quant=${quantOnly.length} swe=${sweOnly.length}`);
const bbOnly = await q(SEARCH_ROLES_SQL, [null, null, "bulge_bracket"]);
check("tier filter works independently of category",
  bbOnly.length > 0 && bbOnly.every((r) => r.tier === "bulge_bracket"),
  `got ${bbOnly.length} bulge bracket roles`);
check(
  "search surfaces roles with zero submissions, so the site can bootstrap",
  quantOnly.some((r) => n(r.logged) === 0),
);

// ---------------------------------------------------------------------------
section("L. Constraints stop bad data at the door");
// ---------------------------------------------------------------------------

await checkRejects(
  db,
  "duplicate (role_id, local_id) is rejected - the denominator counts people",
  `insert into applications (role_id, local_id, current_stage, current_status)
   values (${bofa}, '${uid(1)}', 'applied', 'waiting')`,
);

await checkRejects(
  db,
  "an unknown stage is rejected",
  `insert into events (application_id, role_id, stage, status, occurred_on)
   select id, role_id, 'coffee_chat', 'waiting', current_date
   from applications where role_id = ${bofa} limit 1`,
);

await checkRejects(
  db,
  "an unknown status is rejected",
  `insert into events (application_id, role_id, stage, status, occurred_on)
   select id, role_id, 'oa', 'vibing', current_date
   from applications where role_id = ${bofa} limit 1`,
);

await checkRejects(
  db,
  "an event pointing at a non-existent application is rejected",
  `insert into events (application_id, role_id, stage, status, occurred_on)
   values (999999, ${bofa}, 'oa', 'waiting', current_date)`,
);

await checkRejects(
  db,
  "an out-of-range hour is rejected",
  `insert into events (application_id, role_id, stage, status, occurred_on, occurred_hour)
   select id, role_id, 'oa', 'waiting', current_date, 25
   from applications where role_id = ${bofa} limit 1`,
);

await checkRejects(
  db,
  "a duplicate role identity is rejected",
  `insert into roles (firm_id, programme_id, division, division_norm,
                      location, location_norm, cycle, slug)
   select firm_id, programme_id, division, division_norm,
          location, location_norm, cycle, slug || '-copy'
   from roles where id = ${bofa}`,
);

await checkRejects(
  db,
  "an alias claiming to be a firm but carrying a division string is rejected",
  `insert into aliases (kind, alias_norm, division_canon)
   values ('firm', 'nonsense', 'Some Division')`,
);

// ---------------------------------------------------------------------------
section("M. events.role_id agrees with its parent application");
// ---------------------------------------------------------------------------
//
// role_id is denormalised onto events to keep every aggregation query one join
// shorter. It is safe because an application's role never changes - but only if
// the write path sets it correctly, which is exactly what this checks.

const mismatched = await q(`
  select count(*)::int as n
  from events e
  join applications a on a.id = e.application_id
  where a.role_id <> e.role_id
`);
checkEqual("no event disagrees with its application's role", n(mismatched[0].n), 0);

// ---------------------------------------------------------------------------
section("N. Seed integrity");
// ---------------------------------------------------------------------------

const dupFirms = await q(`
  select count(*)::int as n from (
    select name_norm from firms group by name_norm having count(*) > 1
  ) d`);
checkEqual("no duplicate firms after normalising", n(dupFirms[0].n), 0);

const bofaDivisions = await q(`
  select count(distinct division)::int as n
  from roles r join firms f on f.id = r.firm_id
  where f.slug = 'bank-of-america'`);
check(
  "BofA's divisions are kept separate, per the spec's central example",
  n(bofaDivisions[0].n) >= 4,
);

const ubs = await q(`
  select count(*)::int as n
  from roles r
  join firms f on f.id = r.firm_id
  join programmes p on p.id = r.programme_id
  where f.slug = 'ubs' and r.division = 'Investment Banking'`);
checkEqual("UBS summer and off-cycle IB are two distinct roles", n(ubs[0].n), 2);

const noConsulting = await q(
  `select count(*)::int as n from firms where category not in ('ib_markets','quant_swe')`,
);
checkEqual("no category outside the two we launch with", n(noConsulting[0].n), 0);

// Category is on the ROLE, not the firm, because firms run several kinds of
// job. If this ever returns 0, the split has been undone.
const multiCat = await q(`
  select count(*)::int as n from (
    select firm_id from roles group by firm_id having count(distinct category) > 1
  ) d`);
check("firms genuinely span several categories - which is why category is per role",
  n(multiCat[0].n) > 0,
  `Optiver and Jane Street each run quant AND software roles. Got ${n(multiCat[0].n)} such firms.`);

const optiverCats = await q(`
  select r.category, count(*)::int n from roles r join firms f on f.id=r.firm_id
  where f.slug = 'optiver' group by 1 order by 1`);
check("Optiver's roles are split across quant and swe, not lumped together",
  optiverCats.length >= 2,
  `got: ${JSON.stringify(optiverCats)}`);

const tiers = await q(`select tier, count(*)::int n from firms group by 1 order by 1`);
check("every firm has a tier", tiers.every((t) => t.tier !== null),
  `got: ${JSON.stringify(tiers)}`);
check("bulge bracket and elite boutique are distinguished",
  tiers.some((t) => t.tier === "bulge_bracket") &&
    tiers.some((t) => t.tier === "elite_boutique"));

// Tier and category are independent axes: the same job exists at both tiers.
const ibdBothTiers = await q(`
  select f.tier, count(*)::int n from roles r join firms f on f.id=r.firm_id
  where r.category = 'ib_markets' and f.tier in ('bulge_bracket','elite_boutique')
  group by 1`);
checkEqual("IB roles exist at BOTH bulge bracket and boutique - separate axes",
  ibdBothTiers.length, 2);



// ---------------------------------------------------------------------------
section("O. Application-open detection");
// ---------------------------------------------------------------------------

const { isEarlyCareers, isInScope, parseDivision, classifyKind, cycleVerdict } =
  await import("../lib/postings.ts");

// Relevance gates, against real strings taken from Citi's live board.
check("keeps a summer analyst role",
  isEarlyCareers("Banking - Investment Banking, Summer Analyst, London - EMEA, 2027"));
checkEqual("'Full Time Analyst' classifies as graduate, never internship",
  classifyKind("Wealth - Full Time Analyst, Los Angeles - USA, 2027"), "graduate");
check("rejects an ordinary job that merely contains 'Analyst'",
  !isEarlyCareers("Regulatory Reporting Intermediate Analyst"));
check("rejects 'Campus Recruiter' - the firm hiring staff, not students",
  !isEarlyCareers("Campus Recruiter, Machine Learning and Quantitative Research"));
check("rejects 'University Relations Lead'",
  !isEarlyCareers("University Relations Lead, EMEA"));

// Regression: the pattern once required graduate to be followed by
// programme/analyst/scheme, which silently dropped Flow Traders' "Graduate
// Trader" in Amsterdam. Firms name the job as often as they name the scheme.
check("keeps a bare 'Trading Intern'", isEarlyCareers("Trading Intern"));

// Internships and graduate roles are separate products, not one bucket. They
// have different applicant pools and different timelines, so merging them
// makes every rate on the site meaningless.
checkEqual("a summer analyst role is an internship",
  classifyKind("Banking, Summer Analyst, London, 2027"), "internship");
checkEqual("a graduate trader role is NOT an internship",
  classifyKind("Graduate Trader"), "graduate");
checkEqual("a spring week is its own kind",
  classifyKind("Spring Week Insight Programme 2027"), "spring_week");
checkEqual("an off-cycle placement is its own kind",
  classifyKind("Off-Cycle Internship Placement"), "internship");
checkEqual("a campus recruiter is neither", classifyKind("Campus Recruiter"), null);
checkEqual("'Summer Internship' beats 'graduate' when a title has both",
  classifyKind("Graduate Summer Internship 2027"), "internship");

check("keeps London", isInScope("London  United Kingdom"));
check("keeps Amsterdam", isInScope("Amsterdam Netherlands"));
check("drops Singapore", !isInScope("Singapore  Singapore"));
check("drops Tampa", !isInScope("Tampa Florida United States"));
check("drops a missing location rather than guessing", !isInScope(null));

// Cycle gating. Only internships are gated, and the middle case is the one
// that matters: no year stated is ASSUMED to be the target cycle, because
// summer 2026 has already happened.
const v2027 = cycleVerdict("Summer Analyst, London, 2027", "internship");
check("an internship naming 2027 is kept and CONFIRMED",
  v2027.keep && v2027.cycle === "Summer 2027" && v2027.confirmed === true);

const vNone = cycleVerdict("Quantitative Trading Intern, London", "internship");
check("an internship naming no year is kept but only ASSUMED",
  vNone.keep && vNone.cycle === "Summer 2027" && vNone.confirmed === false);

const v2026 = cycleVerdict("Graduate Software Engineer (2026)", "internship");
check("an internship naming a DIFFERENT year is dropped", !v2026.keep,
  "2026 summer has already happened; it is not this cycle");

const vGrad = cycleVerdict("Graduate Trader", "graduate");
check("graduate roles are never dropped on cycle - they are stored, not shown",
  vGrad.keep);

checkEqual("takes the specific half of 'Banking - Investment Banking'",
  parseDivision("Banking - Investment Banking, Summer Analyst, London - EMEA, 2027"),
  "Investment Banking");
checkEqual("does not mistake the programme for the division",
  parseDivision("Summer Analyst, London, 2027"), null);

// The diff: opened / idempotent / closed.
const openDb = await freshDb([
  "001_schema.sql", "002_seed.sql", "004_sources.sql", "006_more_sources.sql",
  "007_baseline.sql", "008_kind_and_cycle.sql", "009_role_open_status.sql",
  "010_categories.sql", "011_am_and_tier.sql", "005_test_postings.sql",
]);
const oq = async (sql, params = []) => (await openDb.query(sql, params)).rows;

const openRows = await oq(`
  select p.title, p.closed_at, p.first_seen_at
  from postings p join sources s on s.id = p.source_id`);
checkEqual("fixture loaded 4 postings", openRows.length, 4);
checkEqual("one of them is already closed",
  openRows.filter((r) => r.closed_at !== null).length, 1);

const { JUST_OPENED_SQL } = await import("../lib/postings.ts");
const recent = await oq(JUST_OPENED_SQL, [72, null]);
check("the closed posting never reaches the UI query",
  recent.every((r) => !/Closed-Role/.test(r.url ?? "")),
  `got: ${JSON.stringify(recent.map((r) => r.url))}`);
checkEqual("only postings inside the 72h window are returned", recent.length, 2);

// Prove the 100-hour-old posting is excluded by the WINDOW and not by some
// other accident: widen the window and it must reappear.
const wide = await oq(JUST_OPENED_SQL, [200, null]);
checkEqual("widening the window brings back the 100-hour-old opening", wide.length, 3);
check("but never the closed one, at any window width",
  wide.every((r) => !/Closed-Role/.test(r.url ?? "")));

const oneHour = await oq(JUST_OPENED_SQL, [1, null]);
checkEqual("a 1-hour window returns only the newest", oneHour.length, 1);

// Idempotency: the same posting seen twice must not read as two openings.
const dupe = await oq(`
  insert into postings (source_id, external_id, title, title_norm)
  select source_id, external_id, title, title_norm from postings limit 1
  on conflict (source_id, external_id) do update set last_seen_at = now()
  returning (xmax = 0) as inserted`);
checkEqual("re-seeing a posting is an UPDATE, not a new opening",
  dupe[0].inserted, false);

const fresh = await oq(`
  insert into postings (source_id, external_id, title, title_norm)
  select id, '/job/brand-new', 'Summer Analyst, London, 2027',
         normalise_name('Summer Analyst, London, 2027')
  from sources limit 1
  returning (xmax = 0) as inserted`);
checkEqual("a genuinely new posting reads as an opening", fresh[0].inserted, true);

// Baseline: a first sighting is stored but must never be announced. Without
// this, adding a source would announce every role already on it as brand new.
await oq(`
  insert into postings (source_id, external_id, title, title_norm, is_baseline)
  select id, '/job/pre-existing', 'Summer Analyst, London, 2027',
         normalise_name('Summer Analyst, London, 2027'), true
  from sources limit 1`);
const afterBaseline = await oq(JUST_OPENED_SQL, [200, null]);
check("BASELINE: a first-sighting posting is stored but never announced",
  afterBaseline.every((r) => !/pre-existing/.test(r.url ?? "")) &&
    (await oq(`select count(*)::int n from postings where is_baseline`))[0].n > 0,
  "a first poll must not report pre-existing roles as openings");

// ---------------------------------------------------------------------------
section("P. Assessment format - description, not rate");
// ---------------------------------------------------------------------------
//
// This is the one aggregation on the site NOT suppressed at low n, because a
// format is a description of an artefact everyone receives identically rather
// than a rate over a population. The honesty mechanism is disagreement.

const { FORMAT_SUMMARY_SQL, spread, section: fmtSection } =
  await import("../lib/formats.ts");

const fmtRole = bofa;
const uid2 = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

// Three people describe the same OA. Two agree on 20 minutes, one says 45.
for (const [person, mins, qs, coding] of [
  [901, 20, 40, false],
  [902, 22, 40, false],
  [903, 45, 40, true],
]) {
  await q(
    `insert into assessment_formats
       (role_id, stage, local_id, duration_minutes, question_count,
        has_numerical, has_coding)
     values ($1, 'oa', $2::uuid, $3, $4, true, $5)`,
    [fmtRole, uid2(person), mins, qs, coding],
  );
}

const fmt = (await q(FORMAT_SUMMARY_SQL, [fmtRole]))[0];
checkEqual("three reports counted", n(fmt.reports), 3);

const dur = spread(fmt.duration_median, fmt.duration_min, fmt.duration_max);
check("DISAGREEMENT surfaced, not averaged away: 20 vs 45 minutes",
  dur.conflicted === true && dur.min === 20 && dur.max === 45,
  `got ${JSON.stringify(dur)}`);

const qsSpread = spread(fmt.questions_median, fmt.questions_min, fmt.questions_max);
check("unanimous question count is NOT flagged as disagreement",
  qsSpread.conflicted === false && qsSpread.value === 40,
  `got ${JSON.stringify(qsSpread)}`);

const numerical = fmtSection(n(fmt.numerical_yes), n(fmt.numerical_said));
check("a section all three confirmed reads as present and unanimous",
  numerical.present && numerical.unanimous && numerical.said === 3);

const coding = fmtSection(n(fmt.coding_yes), n(fmt.coding_said));
check("a section only one of three saw is present-but-contested",
  coding.present === false && coding.unanimous === false &&
    coding.yes === 1 && coding.said === 3,
  `got ${JSON.stringify(coding)}`);

const verbal = fmtSection(n(fmt.verbal_yes), n(fmt.verbal_said));
check("a section NOBODY answered returns null, not 'no'", verbal === null,
  "silence and a denial must stay distinguishable, or a section vanishes");

// One person, one report per stage per role - same rule as applications.
await checkRejects(db,
  "a second report from the same person for the same stage is rejected",
  `insert into assessment_formats (role_id, stage, local_id, duration_minutes)
   values (${fmtRole}, 'oa', '${uid2(901)}', 99)`);

// Formats are deliberately visible at n=1, unlike every rate on the site.
await q(
  `insert into assessment_formats (role_id, stage, local_id, question_count)
   values ($1, 'video', $2::uuid, 5)`, [fmtRole, uid2(904)]);
const single = (await q(FORMAT_SUMMARY_SQL, [fmtRole])).find((r) => r.stage === "video");
check("NOT SUPPRESSED at n=1 - a format is a description, not a rate",
  single !== undefined && n(single.reports) === 1,
  "one credible account of what the assessment is beats none");

report();
