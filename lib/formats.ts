// ============================================================================
// "What is the OA actually like?" - the most-asked question in the source chat.
// ============================================================================
//
// Aggregation here is deliberately unlike the rest of the site. Everywhere else
// a small sample is suppressed, because a rate from four people misleads about
// a population. An assessment format is not a rate: everyone sitting the same
// OA receives the same artefact, so one account is genuinely informative.
//
// The honesty mechanism is DISAGREEMENT, not suppression. Conflicting reports
// are surfaced as a range and labelled, never averaged into a single confident
// number that no respondent actually gave.

import { query } from "./db";

export const FORMAT_SUMMARY_SQL = `
select f.stage,
       st.label                                              as stage_label,
       count(*)::int                                         as reports,

       -- Median rather than mean: one person mistyping 400 for 40 should not
       -- drag the answer, and with three reports a mean is barely a statistic.
       percentile_cont(0.5) within group (order by f.duration_minutes)
         filter (where f.duration_minutes is not null)       as duration_median,
       min(f.duration_minutes)                               as duration_min,
       max(f.duration_minutes)                               as duration_max,
       count(f.duration_minutes)::int                        as duration_reports,

       percentile_cont(0.5) within group (order by f.question_count)
         filter (where f.question_count is not null)         as questions_median,
       min(f.question_count)                                 as questions_min,
       max(f.question_count)                                 as questions_max,
       count(f.question_count)::int                          as questions_reports,

       -- Sections: yes-count over answered-count, so "nobody mentioned it" and
       -- "everybody said no" stay distinguishable.
       count(*) filter (where f.has_numerical)::int          as numerical_yes,
       count(f.has_numerical)::int                           as numerical_said,
       count(*) filter (where f.has_logical)::int            as logical_yes,
       count(f.has_logical)::int                             as logical_said,
       count(*) filter (where f.has_verbal)::int             as verbal_yes,
       count(f.has_verbal)::int                              as verbal_said,
       count(*) filter (where f.has_situational)::int        as situational_yes,
       count(f.has_situational)::int                         as situational_said,
       count(*) filter (where f.has_behavioural)::int        as behavioural_yes,
       count(f.has_behavioural)::int                         as behavioural_said,
       count(*) filter (where f.has_coding)::int             as coding_yes,
       count(f.has_coding)::int                              as coding_said,

       percentile_cont(0.5) within group (order by f.hv_question_count)
         filter (where f.hv_question_count is not null)      as hv_questions_median,
       count(*) filter (where f.hv_retakes)::int             as hv_retakes_yes,
       count(f.hv_retakes)::int                              as hv_retakes_said,
       count(*) filter (where f.hv_is_live)::int             as hv_live_yes,
       count(f.hv_is_live)::int                              as hv_live_said
from assessment_formats f
join stages st on st.code = f.stage
where f.role_id = $1
group by f.stage, st.label, st.sort_order
order by st.sort_order
`;

export const FORMAT_NOTES_SQL = `
select stage, notes, created_at
from assessment_formats
where role_id = $1 and notes is not null and length(trim(notes)) > 0
order by created_at desc
limit 6
`;

export const HAS_REPORTED_FORMAT_SQL = `
select 1 as ok from assessment_formats
where role_id = $1 and stage = $2 and local_id = $3::uuid limit 1
`;

const UPSERT_FORMAT_SQL = `
insert into assessment_formats
  (role_id, stage, local_id, duration_minutes, question_count,
   has_numerical, has_logical, has_verbal, has_situational, has_behavioural,
   has_coding, hv_question_count, hv_prep_seconds, hv_retakes, hv_is_live,
   notes, ip_hash)
values
  ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
on conflict (role_id, stage, local_id) do update
  set duration_minutes  = excluded.duration_minutes,
      question_count    = excluded.question_count,
      has_numerical     = excluded.has_numerical,
      has_logical       = excluded.has_logical,
      has_verbal        = excluded.has_verbal,
      has_situational   = excluded.has_situational,
      has_behavioural   = excluded.has_behavioural,
      has_coding        = excluded.has_coding,
      hv_question_count = excluded.hv_question_count,
      hv_prep_seconds   = excluded.hv_prep_seconds,
      hv_retakes        = excluded.hv_retakes,
      hv_is_live        = excluded.hv_is_live,
      notes             = excluded.notes,
      created_at        = now()
returning id
`;

export type FormatRow = {
  stage: string;
  stage_label: string;
  reports: number;
  duration_median: number | null;
  duration_min: number | null;
  duration_max: number | null;
  duration_reports: number;
  questions_median: number | null;
  questions_min: number | null;
  questions_max: number | null;
  questions_reports: number;
  numerical_yes: number; numerical_said: number;
  logical_yes: number; logical_said: number;
  verbal_yes: number; verbal_said: number;
  situational_yes: number; situational_said: number;
  behavioural_yes: number; behavioural_said: number;
  coding_yes: number; coding_said: number;
  hv_questions_median: number | null;
  hv_retakes_yes: number; hv_retakes_said: number;
  hv_live_yes: number; hv_live_said: number;
};

export type FormatNote = { stage: string; notes: string; created_at: string };

export function getFormats(roleId: number) {
  return query<FormatRow>(FORMAT_SUMMARY_SQL, [roleId]);
}

export function getFormatNotes(roleId: number) {
  return query<FormatNote>(FORMAT_NOTES_SQL, [roleId]);
}

// A range wider than this means the reports genuinely disagree and the UI must
// say so rather than presenting the median as settled. 25% chosen so that
// "20 vs 25 minutes" reads as agreement and "20 vs 45" does not.
const DISAGREEMENT_RATIO = 1.25;

export function spread(
  median: number | null,
  min: number | null,
  max: number | null,
): { value: number; conflicted: boolean; min: number; max: number } | null {
  if (median == null || min == null || max == null) return null;
  return {
    value: Math.round(median),
    min,
    max,
    conflicted: min > 0 && max / min > DISAGREEMENT_RATIO,
  };
}

// A section counts as present when a clear majority of people who answered say
// it was. Reported alongside the denominator so "2 of 2" is never mistaken for
// "2 of 20".
export function section(yes: number, said: number) {
  if (said === 0) return null;
  return { present: yes / said > 0.5, yes, said, unanimous: yes === said || yes === 0 };
}

export type FormatInput = {
  roleSlug: string;
  localId: string;
  ipHash: string | null;
  stage: string;
  durationMinutes?: number | null;
  questionCount?: number | null;
  sections?: Record<string, boolean | null>;
  hvQuestionCount?: number | null;
  hvPrepSeconds?: number | null;
  hvRetakes?: boolean | null;
  hvIsLive?: boolean | null;
  notes?: string | null;
};

const FIND_ROLE_SQL = `select id from roles where slug = $1`;

export async function submitFormat(
  input: FormatInput,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const role = await query<{ id: number }>(FIND_ROLE_SQL, [input.roleSlug]);
  if (!role[0]) return { ok: false, error: "That role no longer exists.", status: 404 };

  const s = input.sections ?? {};
  const num = (v: unknown) =>
    v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

  await query(UPSERT_FORMAT_SQL, [
    role[0].id,
    input.stage,
    input.localId,
    num(input.durationMinutes),
    num(input.questionCount),
    s.numerical ?? null,
    s.logical ?? null,
    s.verbal ?? null,
    s.situational ?? null,
    s.behavioural ?? null,
    s.coding ?? null,
    num(input.hvQuestionCount),
    num(input.hvPrepSeconds),
    input.hvRetakes ?? null,
    input.hvIsLive ?? null,
    input.notes?.slice(0, 280) || null,
    input.ipHash,
  ]);

  return { ok: true };
}
