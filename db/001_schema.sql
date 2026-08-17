-- ============================================================================
-- Stagewatch schema, migration 001
-- ============================================================================
--
-- Run in the Supabase SQL editor, top to bottom, in one go. Safe to re-run:
-- it drops everything first.
--
-- Conventions, so you only learn them once:
--
--   * `bigint generated always as identity primary key`
--       Postgres' modern auto-incrementing id. "generated always" means you
--       cannot accidentally insert your own value into it.
--
--   * `timestamptz`, never `timestamp`
--       timestamptz stores an absolute moment. timestamp stores a wall-clock
--       reading with no timezone, so 09:00 in London and 09:00 in Amsterdam
--       become indistinguishable.
--
--   * `text`, never `varchar(n)`
--       Same type internally in Postgres. varchar(50) only adds a length limit
--       you will eventually regret.
--
--   * `text` + `check (x in (...))` instead of Postgres enums
--       Adding a stage later is then a one-line ALTER instead of enum
--       ceremony, and values read plainly in the Supabase table UI.
--
--   * `*_norm` columns hold the normalised twin of the column beside them.
--       "Bank of America plc" -> "bank of america". The database computes them
--       via normalise_name() below, so the app cannot drift from the SQL.
--       Uniqueness is enforced on the _norm column, because that is the one
--       that catches "BofA " and "bofa".
--
--   * All times are Europe/London.
--
-- ============================================================================

drop table if exists merge_queue    cascade;
drop table if exists aliases        cascade;
drop table if exists events         cascade;
drop table if exists applications   cascade;
drop table if exists roles          cascade;
drop table if exists programmes     cascade;
drop table if exists firms          cascade;
drop table if exists stages         cascade;
drop function if exists slugify(text)        cascade;
drop function if exists normalise_name(text) cascade;


-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
--
-- These live in SQL rather than TypeScript on purpose. Normalisation is used
-- by the seed, by the submission handler and by the dedup pipeline. Written
-- once here, all three call the same code and cannot drift apart. Written in
-- TypeScript instead, you would have two implementations that agree until the
-- day they quietly don't.

-- "Global Capital Markets" -> "global-capital-markets"
create function slugify(input text) returns text
language sql immutable strict as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

-- Step 1 of the dedup pipeline.
-- "Rothschild & Co" -> "rothschild",  "Bank of America plc" -> "bank of america"
--
-- Note what is deliberately NOT stripped: "group", "holdings", "partners",
-- "capital". Stripping "group" would collapse "Man Group" to "man", and
-- stripping "partners" would make Qatalyst Partners and Perella Weinberg
-- Partners both lose the word that distinguishes them from other entities.
-- Only unambiguous legal-entity suffixes come off.
create function normalise_name(input text) returns text
language sql immutable strict as $$
  select trim(both ' ' from
    regexp_replace(
      regexp_replace(
        -- punctuation to spaces, so "M&A" and "M & A" both become "m a"
        regexp_replace(lower(input), '[^a-z0-9]+', ' ', 'g'),
        -- drop legal-entity suffixes as whole words only
        '\y(plc|ltd|limited|llc|llp|inc|incorporated|corp|corporation|co)\y',
        ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;


-- ============================================================================
-- stages
-- ============================================================================
--
-- The six-rung ladder. Six rows, never grows in v1.
--
-- Why a table and not just strings in the app: the stage funnel has to show
-- every stage even when a stage has zero rows. "Nobody has logged an OA for
-- this role" is a real and important answer, and you cannot GROUP BY your way
-- to a row that does not exist. With this table you LEFT JOIN off it and every
-- stage appears whether or not anyone reached it.
--
-- `sort_order` is what makes "ordered but sparse" work. The ladder has an
-- order, but nothing anywhere assumes stage n implies stage n-1 was logged,
-- because plenty of firms skip the OA outright.

create table stages (
  code        text     primary key,
  label       text     not null,
  sort_order  smallint not null unique
);

insert into stages (code, label, sort_order) values
  ('applied',           'Applied',           1),
  ('oa',                'Online assessment', 2),
  ('video',             'Video interview',   3),
  ('first_round',       'First round',       4),
  ('assessment_centre', 'Assessment centre', 5),
  ('offer',             'Offer',             6);


-- ============================================================================
-- firms
-- ============================================================================
--
-- Why this is a table and not a text column on every application row:
--
-- Skip it, and 400 application rows each carry a firm name. Someone types
-- "Bank of America", someone "BofA", someone "bofa". You now have three firms
-- where there is one, and your denominator is in three pieces. Every
-- percentage on the pulse page is wrong, and quietly wrong, which is worse.
--
-- General rule: a fact lives in exactly one place, everything else points at
-- it by id.
--
-- name_norm is unique, name is not. The database itself then refuses a second
-- "bank of america" however it was capitalised on the way in. Constraints that
-- stop bad data at the door beat cleanup scripts every time.

create table firms (
  id          bigint      generated always as identity primary key,
  slug        text        not null unique,
  name        text        not null,
  name_norm   text        not null unique,
  category    text        not null check (category in ('ib_markets', 'quant_swe')),
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- programmes
-- ============================================================================
--
-- The kind of scheme. Roughly five rows.
--
-- GLOBAL, not per-firm. "Summer Internship" means the same thing at UBS as at
-- Optiver, so it is one row that forty firms point at. Per-firm you would have
-- forty rows all saying "Summer Internship", and the alias table would have to
-- dedupe within each firm separately: forty times the work for no gain.

create table programmes (
  id          bigint      generated always as identity primary key,
  slug        text        not null unique,
  name        text        not null,
  name_norm   text        not null unique,
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- roles   <-- THE UNIT OF RECORD. The most important table in the schema.
-- ============================================================================
--
-- One row per firm x programme x division x location x cycle.
--
-- Concretely, these are three separate rows, not one:
--
--   Bank of America | Summer Internship | Global Capital Markets | London | Summer 2027
--   Bank of America | Summer Internship | Global IBD             | London | Summer 2027
--   Bank of America | Summer Internship | Markets LevFin         | London | Summer 2027
--
-- and this is a fourth, distinct from all of them:
--
--   Bank of America | Off-cycle         | Global Capital Markets | London | Summer 2027
--
-- This is the decision the entire product rests on. In the source group chat,
-- six times in five hours someone posted "has the HV gone out" and the answer
-- was useless until somebody asked "which role?". Collapse these into one row
-- and you have rebuilt the group chat, with worse formatting.
--
-- The unique constraint is on the _norm columns, not the display ones, so
-- "M&A" and "m & a" collide. `cycle` needs no _norm: it comes from a fixed
-- dropdown, never free text.
--
-- MIGRATION RISK, flagged deliberately: `division` is free text. If you later
-- want to browse "all M&A roles across every firm", or need the alias pipeline
-- to merge divisions via real foreign keys, that is a genuine migration -
-- backfill a divisions table, add a column, rewrite every query touching it.
-- Free text is still right for v1, because a divisions table adds a join to
-- every query for a feature that is not in v1.

create table roles (
  id             bigint      generated always as identity primary key,
  firm_id        bigint      not null references firms(id) on delete cascade,
  programme_id   bigint      not null references programmes(id) on delete cascade,
  division       text        not null,
  division_norm  text        not null,
  location       text        not null,
  location_norm  text        not null,
  cycle          text        not null,
  slug           text        not null unique,
  created_at     timestamptz not null default now(),
  unique (firm_id, programme_id, division_norm, location_norm, cycle)
);

create index roles_firm_idx on roles (firm_id);


-- ============================================================================
-- applications
-- ============================================================================
--
-- One row per person per role. This table IS the denominator.
--
-- `unique (role_id, local_id)` is the most important line in this file after
-- the roles unique constraint. It guarantees that counting rows here counts
-- PEOPLE, not submissions. Without it, one person clicking twice becomes two
-- applicants and "78% received the OA" turns into a statistic about button
-- presses.
--
-- current_stage / current_status are deliberately duplicated information: both
-- are derivable from the events table. The trade is one extra UPDATE per
-- submission, against running a window function over the whole events table on
-- every page load. Take the UPDATE.
--
-- ip_hash is a salted SHA-256 of the request IP, never the raw IP. It sits
-- here rather than arriving with rate limiting later because it is a column,
-- and adding columns to a live table is exactly the migration to avoid.
-- Nullable, because the header is occasionally absent.
--
-- updated_at is the only defence against survivorship drift: people who get
-- rejected stop updating, so `waiting` counts inflate over time and
-- progression rates drift upward. That is not fixable in v1, but storing this
-- means it is fixable later without a migration.
--
-- No separate index on role_id. The unique constraint below already creates
-- one with role_id leading, and Postgres will use it for `where role_id = ...`.
-- A second index would cost write speed for nothing. General rule: check what
-- your constraints already gave you before adding an index.

create table applications (
  id              bigint      generated always as identity primary key,
  role_id         bigint      not null references roles(id) on delete cascade,
  local_id        uuid        not null,
  current_stage   text        not null references stages(code),
  current_status  text        not null check (
                    current_status in ('waiting', 'progressed', 'rejected', 'withdrew')
                  ),
  ip_hash         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (role_id, local_id)
);

create index applications_local_idx on applications (local_id);
create index applications_ip_idx    on applications (ip_hash, created_at);


-- ============================================================================
-- events
-- ============================================================================
--
-- Append-only. Never updated, never deleted. One row every time somebody says
-- "this happened to me at this stage on this date".
--
-- Why separate from applications: applications answers "where is this person
-- now", events answers "when did each thing fire". The timing histogram and
-- the median-gap numbers are impossible without a history, and you cannot keep
-- a history in a table you overwrite.
--
-- WHY occurred_on AND occurred_hour, RATHER THAN ONE NULLABLE TIMESTAMP:
--
-- Half your users will know "the OA landed Tuesday afternoon" and not the
-- hour. With a single timestamp you would have to write midnight in for them.
-- The "are they sending gradually?" histogram then shows a fake 00:00 spike
-- made entirely of people who did not know the time, indistinguishable from a
-- genuine midnight send.
--
-- Two columns make "I don't know the hour" explicit and unfakeable. The
-- day-level histogram uses every row; the hour-level one filters to
-- `occurred_hour is not null` and reports its own smaller n.
--
-- General rule: when a value can be genuinely unknown, give the unknown its
-- own representation. Never encode it as a plausible-looking real value.
--
-- ON role_id BEING DUPLICATED HERE: you could reach it by joining through
-- applications. Carrying it directly removes a join from every aggregation
-- query, and it is safe to duplicate because an application's role never
-- changes (unlike current_stage, which changes constantly). The residual risk
-- is the handler writing a role_id that disagrees with its parent, so the
-- verification pass hunts for exactly that.

create table events (
  id              bigint      generated always as identity primary key,
  application_id  bigint      not null references applications(id) on delete cascade,
  role_id         bigint      not null references roles(id) on delete cascade,
  stage           text        not null references stages(code),
  status          text        not null check (
                    status in ('waiting', 'progressed', 'rejected', 'withdrew')
                  ),
  occurred_on     date        not null,
  occurred_hour   smallint    check (occurred_hour between 0 and 23),
  logged_at       timestamptz not null default now()
);

create index events_role_stage_idx on events (role_id, stage);
create index events_recent_idx     on events (logged_at desc);
create index events_app_idx        on events (application_id);


-- ============================================================================
-- aliases
-- ============================================================================
--
-- Step 2 of the dedup pipeline, and the step that does most of the work for
-- free: "bofa" -> Bank of America, "gcm" -> Global Capital Markets.
--
-- The CHECK below looks fussy and earns it. The obvious alternative is two
-- columns, entity_type and entity_id, pointing at whichever table entity_type
-- names. That is a polymorphic foreign key, and Postgres cannot enforce it:
-- nothing stops entity_id pointing at a firm that was deleted, because the
-- database has no idea which table to look in. Three nullable foreign keys
-- plus one CHECK buys real referential integrity for four extra lines.
--
-- unique is on (kind, alias_norm) rather than alias_norm alone, so the same
-- string can legitimately be both a firm alias and a division alias.

create table aliases (
  id              bigint      generated always as identity primary key,
  kind            text        not null check (kind in ('firm', 'programme', 'division')),
  alias_norm      text        not null,
  firm_id         bigint      references firms(id) on delete cascade,
  programme_id    bigint      references programmes(id) on delete cascade,
  division_canon  text,
  created_at      timestamptz not null default now(),
  unique (kind, alias_norm),
  check (
    (kind = 'firm'
      and firm_id is not null and programme_id is null and division_canon is null)
    or
    (kind = 'programme'
      and programme_id is not null and firm_id is null and division_canon is null)
    or
    (kind = 'division'
      and division_canon is not null and firm_id is null and programme_id is null)
  )
);


-- ============================================================================
-- merge_queue
-- ============================================================================
--
-- Step 5 of the dedup pipeline. Whatever survives normalise, alias lookup and
-- fuzzy match lands here for one human click.
--
-- Both raw and normalised strings are kept. The raw one is what you read when
-- deciding; the normalised one is what the pipeline compared.
--
-- The raw_stage / raw_status / raw_occurred_* columns matter more than they
-- look. A queued submission has no application row yet, because the role it
-- refers to does not exist. Without these, approving a queue entry would
-- create the role and silently discard what the person actually told you,
-- which is the one thing they came to the site to do. With them, approving
-- creates the role AND replays their submission against it.

create table merge_queue (
  id                 bigint      generated always as identity primary key,
  raw_firm           text        not null,
  raw_programme      text,
  raw_division       text,
  raw_location       text,
  raw_cycle          text,
  raw_stage          text        not null references stages(code),
  raw_status         text        not null check (
                       raw_status in ('waiting', 'progressed', 'rejected', 'withdrew')
                     ),
  raw_occurred_on    date        not null,
  raw_occurred_hour  smallint    check (raw_occurred_hour between 0 and 23),
  norm_firm          text        not null,
  suggested_firm_id  bigint      references firms(id) on delete set null,
  suggested_role_id  bigint      references roles(id) on delete set null,
  status             text        not null default 'pending' check (
                       status in ('pending', 'approved', 'merged', 'rejected')
                     ),
  submitted_by       uuid        not null,
  ip_hash            text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

-- Partial index: only pending rows are indexed. The admin page only ever reads
-- pending rows, and resolved rows will eventually outnumber pending ones a
-- hundred to one. This index stays small and fast forever instead of growing
-- with the rejects pile.
create index merge_queue_pending_idx
  on merge_queue (created_at) where status = 'pending';

create index merge_queue_ip_idx on merge_queue (ip_hash, created_at);
