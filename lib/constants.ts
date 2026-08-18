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

export const STATUSES = [
  { code: "waiting", label: "Waiting, no outcome yet" },
  { code: "progressed", label: "Progressed to the next stage" },
  { code: "rejected", label: "Rejected at this stage" },
  { code: "withdrew", label: "I withdrew" },
] as const;

export type StatusCode = (typeof STATUSES)[number]["code"];

export const CATEGORIES = [
  { code: "ib_markets", label: "IB & Markets" },
  { code: "quant_swe", label: "Quant & SWE" },
] as const;

// ---------------------------------------------------------------------------
// Suppression thresholds
// ---------------------------------------------------------------------------
//
// Nothing below these ever leaves the server. See lib/pulse.ts - suppression
// happens in the data layer, not in a component, so there is no route by which
// a raw sub-threshold number reaches a browser.

// Every rate, percentage and breakdown.
export const MIN_N = 10;

// Median gaps specifically. A median of ten values swings hard: one person who
// applied in July and logged their OA in October moves it by days. Twenty is
// still noisy but no longer actively misleading.
export const MIN_N_MEDIAN = 20;

// ---------------------------------------------------------------------------
// Rate limits, per rolling 24 hours
// ---------------------------------------------------------------------------

export const MAX_APPLICATIONS_PER_DAY_LOCAL = 40;
export const MAX_APPLICATIONS_PER_DAY_IP = 60;
export const MAX_MERGE_SUBMISSIONS_PER_DAY_LOCAL = 10;

// The window the "fired today" feed covers.
export const FEED_WINDOW_HOURS = 48;

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
