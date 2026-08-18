-- ============================================================================
-- Stagewatch: what the assessment actually consists of, migration 012
-- ============================================================================
--
-- The single most-asked question in the source group chat, by some distance:
-- "does anyone know how BTG's OA is", "any maths or just behaviorals?",
-- "anyone got MS HV questions?", "was it technical or behavioural?".
--
-- Roughly fourteen such questions in five days, against seven asking whether
-- something had fired. The site was answering the third most common question.
--
-- WHY THIS IS NOT SUPPRESSED BELOW n >= 10
--
-- Suppression exists to stop a small sample producing a misleading RATE. "78%
-- got the OA" from four people is a lie about a population. "The OA is 40
-- questions in 20 minutes" from one person is a DESCRIPTION of an artefact
-- everybody receives identically, and one credible account beats none.
--
-- The honesty mechanism here is different, and it is disagreement rather than
-- suppression: store every report separately, show how many there are, and say
-- plainly when they conflict rather than averaging the conflict away.
--
-- WHY STRUCTURED FIELDS RATHER THAN FREE TEXT
--
-- A wiki page of prose answers the question once. Structured fields answer it
-- for every role at once, and let the site say "this OA is unusually long" or
-- "every quant OA at this firm has a coding section". `notes` exists for the
-- part structure misses, capped short so it stays a footnote.
-- ============================================================================

drop table if exists assessment_formats cascade;

create table assessment_formats (
  id                bigint      generated always as identity primary key,
  role_id           bigint      not null references roles(id) on delete cascade,
  stage             text        not null references stages(code),

  -- One report per person per stage per role. Same reasoning as applications:
  -- without this, one enthusiastic person becomes a consensus.
  local_id          uuid        not null,

  duration_minutes  smallint    check (duration_minutes between 1 and 600),
  question_count    smallint    check (question_count between 1 and 500),

  -- Sections present. Nullable three-state on purpose: true, false, and "I did
  -- not say", which is not the same as "no". Averaging an unanswered question
  -- as a no is how a coding section quietly disappears.
  has_numerical     boolean,
  has_logical       boolean,
  has_verbal        boolean,
  has_situational   boolean,
  has_behavioural   boolean,
  has_coding        boolean,

  -- Video-interview specifics. "Was it technical or behavioural", "how many
  -- questions", "did you get prep time", "could you retake" are all asked
  -- directly in the chat.
  hv_question_count smallint    check (hv_question_count between 1 and 100),
  hv_prep_seconds   smallint    check (hv_prep_seconds between 0 and 3600),
  hv_retakes        boolean,
  hv_is_live        boolean,

  notes             text        check (notes is null or length(notes) <= 280),
  ip_hash           text,
  created_at        timestamptz not null default now(),

  unique (role_id, stage, local_id)
);

create index assessment_formats_role_stage_idx
  on assessment_formats (role_id, stage);
