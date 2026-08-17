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

import { MIN_N, MIN_N_MEDIAN } from "./constants";
import {
  getFunnel,
  getHeadline,
  getMedianGaps,
  getRoleTotal,
  getSelectivity,
  getStageActivity,
  getTimingByDay,
  getTimingByHour,
  type DayBucket,
  type Headline,
  type HourBucket,
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
    byHour: HourBucket[];
    hourN: number;
  } | null;
};

export type Pulse = {
  role: Role;
  total: number;
  headline: Headline | null;
  activity: StageActivity[];
  unlocked: Unlocked | null;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));

// Offers are excluded from every count-bearing view. Applied is kept in the
// funnel (it is the denominator) but has no meaningful "did it fire" answer.
const isOffer = (code: string) => code === "offer";

export async function getPulse(
  role: Role,
  unlock: boolean,
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

  if (!unlock) {
    return { role, total, headline, activity, unlocked: null };
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
  // Higher threshold than everything else. A median of ten values swings hard
  // enough to be actively misleading, and this is the number people will use
  // to decide whether to give up on an application.
  //
  // Note the per-row n check as well as the role-level one: applied -> OA
  // might have 40 pairs while applied -> assessment centre has 3, and the
  // second must not ride in on the first's sample size.
  const medians: MedianGapOut[] | Suppressed =
    total < MIN_N_MEDIAN
      ? { suppressed: true, n: total, threshold: MIN_N_MEDIAN }
      : medRaw
          .filter((r) => num(r.n) >= MIN_N_MEDIAN && r.median_days != null)
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
    const [byDay, byHour] = await Promise.all([
      getTimingByDay(role.id, headline.stage),
      getTimingByHour(role.id, headline.stage),
    ]);
    timing = {
      stage: headline.stage,
      stageLabel: headline.stage_label,
      byDay: byDay.map((d) => ({ ...d, n: num(d.n) })),
      byHour: byHour.map((h) => ({
        occurred_hour: num(h.occurred_hour),
        n: num(h.n),
      })),
      // The hour view has its own, smaller sample - only people who knew the
      // hour. The UI prints this separately, because "they send from 9am"
      // based on four people who happened to remember is not a finding.
      hourN: byHour.reduce((acc, h) => acc + num(h.n), 0),
    };
  }

  return {
    role,
    total,
    headline,
    activity,
    unlocked: { selectivity, funnel, medians, timing },
  };
}

export function isSuppressed<T>(v: T[] | Suppressed): v is Suppressed {
  return !Array.isArray(v);
}
