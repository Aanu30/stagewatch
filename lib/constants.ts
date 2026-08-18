// Shared vocabulary. Mirrors the `stages` table and the CHECK constraints in
// db/001_schema.sql. If you change one, change the other.

export const STAGES = [
  { code: "applied", label: "Applied", order: 1 },
  { code: "oa", label: "Online assessment", order: 2 },
  { code: "video", label: "Video interview", order: 3 },
  { code: "first_round", label: "First round", order: 4 },
  { code: "assessment_centre", label: "Assessment centre", order: 5 },
  { code: "offer", label: "Offer", order: 6 },
] as const;

export type StageCode = (typeof STAGES)[number]["code"];

// `withdrew` is still a valid value in the database and in the funnel - the
// column and the CHECK constraint keep it - but it is no longer offered in the
// form. Five days of the source chat contains not one mention of withdrawing,
// and every extra option costs submissions at the one place where friction
// directly reduces the denominator the whole product depends on.
export const STATUSES = [
  { code: "waiting", label: "Waiting, no outcome yet" },
  { code: "progressed", label: "Progressed to the next stage" },
  { code: "rejected", label: "Rejected at this stage" },
] as const;

export const ALL_STATUS_CODES = [
  "waiting",
  "progressed",
  "rejected",
  "withdrew",
] as const;

export type StatusCode = (typeof STATUSES)[number]["code"];

// Four, not two. Quant, software and data/AI fire on different timetables and
// draw different applicants - somebody asking about the Optiver SWE OA does
// not care about the quant trading one. Category lives on the ROLE, not the
// firm: Optiver runs both, Jane Street runs all three.
export const CATEGORIES = [
  { code: "ib_markets", label: "IB & Markets" },
  { code: "asset_management", label: "Asset Management" },
  { code: "quant", label: "Quant" },
  { code: "swe", label: "Software" },
  { code: "data_ai", label: "Data & AI" },
  { code: "consulting", label: "Consulting" },
] as const;

// A SEPARATE AXIS from category, on purpose. Category is what the job is; tier
// is what kind of firm it is. Goldman IBD and Evercore IBD are the same job at
// different tiers, not different jobs - so "bulge bracket" must not sit in the
// category list, or the site could no longer tell those two apart.
export const TIERS = [
  { code: "bulge_bracket", label: "Bulge bracket" },
  { code: "elite_boutique", label: "Elite boutique" },
  { code: "middle_market", label: "Middle market" },
  { code: "buyside", label: "Buyside" },
  { code: "prop_quant", label: "Prop & quant" },
  { code: "tech", label: "Tech" },
  { code: "consulting", label: "Consulting" },
] as const;

// Same rules as the SQL backfill in db/010_categories.sql, applied to postings
// at ingest. Order matters: machine learning before research, and trading
// infrastructure is engineering rather than trading.
export function categoriseText(text: string): string {
  const t = text.toLowerCase();
  if (/asset management|wealth management|investment management|private bank/.test(t))
    return "asset_management";
  if (/machine learning|data scien|artificial intelligence|deep learning|\bai\b/.test(t))
    return "data_ai";
  if (/software|engineer|technolog|developer|infrastructure|forward deployed/.test(t))
    return "swe";
  if (/quantitative|quant|systematic|algorithm|trading|trader|markets/.test(t))
    return "quant";
  return "ib_markets";
}

// ---------------------------------------------------------------------------
// Suppression thresholds
// ---------------------------------------------------------------------------
//
// Nothing below these ever leaves the server. See lib/pulse.ts - suppression
// happens in the data layer, not in a component, so there is no route by which
// a raw sub-threshold number reaches a browser.

// Every rate, percentage and breakdown.
export const MIN_N = 10;

// There is deliberately no separate median threshold any more. The timings
// panel reports "instant" or "within about N days" rather than a precise
// median, and that claim survives a sample of ten. If it ever goes back to
// printing an exact median, reintroduce a higher threshold with it.

// ---------------------------------------------------------------------------
// Rate limits, per rolling 24 hours
// ---------------------------------------------------------------------------

export const MAX_APPLICATIONS_PER_DAY_LOCAL = 40;
export const MAX_APPLICATIONS_PER_DAY_IP = 60;
export const MAX_MERGE_SUBMISSIONS_PER_DAY_LOCAL = 10;

// The window the "fired today" feed covers.
export const FEED_WINDOW_HOURS = 48;

// The only cycle v1 covers. Postings naming a different year are dropped;
// postings naming none are assumed to be this one and flagged as assumed,
// because a summer internship advertised after summer 2026 has begun can only
// be for the following year.
export const TARGET_CYCLE = "Summer 2027";
export const TARGET_CYCLE_YEAR = 2027;

// The window the "just opened" strip covers. Longer than the fired feed
// because applications open far less often than assessments fire, so a 48-hour
// window would leave the strip empty most days.
export const OPEN_WINDOW_HOURS = 72;

// Cookie mirroring the localStorage anonymous id, so the server can decide
// whether the soft gate is unlocked without a client round-trip.
export const LOCAL_ID_COOKIE = "sw_uid";

export function stageLabel(code: string): string {
  return STAGES.find((s) => s.code === code)?.label ?? code;
}

export function stageOrder(code: string): number {
  return STAGES.find((s) => s.code === code)?.order ?? 0;
}
