// ============================================================================
// The suppression layer.
// ============================================================================
//
// This module is the ONLY route by which pulse-page numbers reach a component.
// Suppression happens here, in the data layer, not in JSX. A component cannot
// render a sub-threshold number because it is never handed one: the shape it
// receives is either the numbers or `{ suppressed: true }`, and the raw counts
// stay on the server.
//
// That is what "the n >= 10 suppression cannot be bypassed" means in practice.
// There is no query string, no API route and no prop that produces the
// underlying rows, because assembling them and discarding them happens before
// the response is serialised.
//
// Two rules on offers, both from the spec, both enforced here:
//
//   1. Offers are NEVER a count. Only a rate.
//   2. That rate only exists at n >= MIN_N.
//
// This is the anti-abuse design: faking a Jane Street offer moves a percentage
// by a fraction and earns no visible glory, so there is no reason to bother.

import { MIN_N } from "./constants";
import {
  getFunnel,
  getHeadline,
  getMedianGaps,
  getRoleTotal,
  getSelectivity,
  getStageActivity,
  getTimingByDay,
  type DayBucket,
  type Headline,
  type Role,
  type StageActivity,
} from "./queries";

export type Suppressed = { suppressed: true; n: number; threshold: number };

export type SelectivityOut = {
  code: string;
  label: string;
  reached: number | null; // null for the offer stage - never a count
  denominator: number;
  percent: number;
};

export type FunnelOut = {
  code: string;
  label: string;
  total: number;
  waiting: number;
  progressed: number;
  rejected: number;
  withdrew: number;
};

export type MedianGapOut = {
  code: string;
  label: string;
  n: number;
  medianDays: number;
};

export type Unlocked = {
  selectivity: SelectivityOut[] | Suppressed;
  funnel: FunnelOut[] | Suppressed;
  medians: MedianGapOut[] | Suppressed;
  timing: {
    stage: string;
    stageLabel: string;
    byDay: DayBucket[];
  } | null;
};

export type Pulse = {
  role: Role;
  total: number;
  headline: Headline | null;
  activity: StageActivity[];
  /** True only when the visitor is being asked to log before seeing numbers
   *  that genuinely exist. False on a quiet role, where there is nothing to
   *  withhold and asking would be a toll for nothing. */
  gateEngaged: boolean;
  unlocked: Unlocked | null;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));

// Offers are excluded from every count-bearing view. Applied is kept in the
// funnel (it is the denominator) but has no meaningful "did it fire" answer.
const isOffer = (code: string) => code === "offer";

// `hasOwnLog` is whether this visitor has logged their own status on the role.
// Whether the panels actually open is decided HERE rather than by the caller,
// because the rule depends on the sample size, which only this module knows.
//
// THE GATE ONLY ENGAGES WHEN THERE IS SOMETHING BEHIND IT.
//
// Below MIN_N every panel says "not enough data yet". Gating that costs the
// visitor a submission and returns nothing - the site makes a promise
// ("selectivity, the funnel and timings unlock") that it then cannot keep. On
// a role with zero logs that is the worst possible first interaction, and at
// launch every role has zero logs.
//
// The spec's own instruction was that if too few people log, the gate should be
// LOOSENED. This is that, made automatic: gate what has value, never gate an
// empty room.
export async function getPulse(
  role: Role,
  hasOwnLog: boolean,
): Promise<Pulse> {
  const [total, headline, activityRaw] = await Promise.all([
    getRoleTotal(role.id),
    getHeadline(role.id),
    getStageActivity(role.id),
  ]);

  // Ungated view. Offers stripped entirely: "1 person has an offer here" is an
  // individual offer claim even without a name attached to it.
  const activity = activityRaw
    .filter((a) => !isOffer(a.code))
    .map((a) => ({ ...a, people: num(a.people) }));

  const worthGating = total >= MIN_N;
  const unlock = hasOwnLog || !worthGating;

  if (!unlock) {
    return { role, total, headline, activity, gateEngaged: true, unlocked: null };
  }

  const [selRaw, funnelRaw, medRaw] = await Promise.all([
    getSelectivity(role.id),
    getFunnel(role.id),
    getMedianGaps(role.id),
  ]);

  // --- Selectivity ---------------------------------------------------------
  // Suppressed as a whole below MIN_N. Above it, every row carries its
  // denominator so the UI can print the sample beside the percentage. The
  // offer row reports a percentage with `reached` nulled out, so the count
  // never crosses the wire.
  const selectivity: SelectivityOut[] | Suppressed =
    total < MIN_N
      ? { suppressed: true, n: total, threshold: MIN_N }
      : selRaw.map((r) => {
          const denominator = num(r.denominator);
          const reached = num(r.reached);
          return {
            code: r.code,
            label: r.label,
            reached: isOffer(r.code) ? null : reached,
            denominator,
            percent:
              denominator > 0
                ? Math.round((reached / denominator) * 1000) / 10
                : 0,
          };
        });

  // --- Funnel --------------------------------------------------------------
  // Counts, so the offer stage is dropped outright rather than nulled.
  const funnel: FunnelOut[] | Suppressed =
    total < MIN_N
      ? { suppressed: true, n: total, threshold: MIN_N }
      : funnelRaw
          .filter((r) => !isOffer(r.code))
          .map((r) => ({
            code: r.code,
            label: r.label,
            total: num(r.total),
            waiting: num(r.waiting),
            progressed: num(r.progressed),
            rejected: num(r.rejected),
            withdrew: num(r.withdrew),
          }));

  // --- Median gaps ---------------------------------------------------------
  // Threshold is MIN_N, not the old higher MIN_N_MEDIAN. The panel no longer
  // prints a precise median; it answers "is it instant, or roughly how long",
  // which is what the source chat actually asks and which survives a sample of
  // ten far better than "6.4 days" does.
  //
  // The per-row n check still matters as much as the role-level one: applied
  // -> OA might have 40 pairs while applied -> assessment centre has 3, and the
  // second must not ride in on the first's sample size.
  const medians: MedianGapOut[] | Suppressed =
    total < MIN_N
      ? { suppressed: true, n: total, threshold: MIN_N }
      : medRaw
          .filter((r) => num(r.n) >= MIN_N && r.median_days != null)
          .map((r) => ({
            code: r.code,
            label: r.label,
            n: num(r.n),
            medianDays: Math.round(num(r.median_days) * 10) / 10,
          }));

  // --- Timing histogram ----------------------------------------------------
  // Drawn for the most recent stage that actually fired, which is the one
  // people are asking about. Suppressed with everything else below MIN_N.
  let timing: Unlocked["timing"] = null;
  if (total >= MIN_N && headline) {
    // Day only. The hour-of-day chart was removed: it answered a question
    // nobody in the source chat asks, on the weakest data on the site.
    const byDay = await getTimingByDay(role.id, headline.stage);
    timing = {
      stage: headline.stage,
      stageLabel: headline.stage_label,
      byDay: byDay.map((d) => ({ ...d, n: num(d.n) })),
    };
  }

  return {
    role,
    total,
    headline,
    activity,
    gateEngaged: false,
    unlocked: { selectivity, funnel, medians, timing },
  };
}

export function isSuppressed<T>(v: T[] | Suppressed): v is Suppressed {
  return !Array.isArray(v);
}
