-- ============================================================================
-- Stagewatch schema, migration 001
-- ============================================================================
--
-- Run this in the Supabase SQL editor, top to bottom, in one go.
--
-- Two tables below are written out in full as worked examples: `stages` and
-- `firms`. The remaining six are specified in comment blocks and you write the
-- CREATE TABLE statements yourself. Write them directly underneath each spec.
--
-- Conventions used throughout, so you only have to learn them once:
--
--   * `bigint generated always as identity primary key`
--       Postgres' modern auto-incrementing id. "generated always" means you
--       cannot accidentally insert your own value into it.
--
--   * `timestamptz`, never `timestamp`
--       timestamptz stores an absolute moment. timestamp stores a wall-clock
--       reading with no timezone, so 09:00 in London and 09:00 in Amsterdam
--       are indistinguishable. Always use timestamptz.
--
--   * `text`, never `varchar(n)`
--       In Postgres they are the same type internally. varchar(50) just adds a
--       length check you will eventually regret.
--
--   * `text` + `check (x in (...))` instead of Postgres enums
--       Adding a new stage later is then a one-line ALTER rather than enum
--       ceremony, and the values read plainly in the Supabase table UI.
--
--   * `*_norm` columns hold the normalised form of the column next to them:
--       lowercased, punctuation stripped, corporate suffixes stripped,
--       whitespace collapsed. "Bank of America plc" -> "bank of america".
--       The app writes both. Uniqueness is enforced on the _norm column,
--       because that is the one that catches "BofA " and "bofa".
--
-- ============================================================================


-- ============================================================================
-- WORKED EXAMPLE 1 of 2: stages
-- ============================================================================
--
-- The six-rung ladder. A tiny lookup table, six rows, never grows in v1.
--
-- Why this exists as a table at all, when the stages could just be strings in
-- the app: the stage funnel on the pulse page has to show every stage even
-- when a stage has zero rows. "Nobody has logged an OA for this role" is a
-- real and important answer, and you cannot GROUP BY your way to a row that
-- does not exist. With this table you LEFT JOIN off it and every stage appears
-- whether or not anyone reached it. Without it you would hand-write a VALUES
-- list into every aggregation query.
--
-- `sort_order` is what makes "ordered but sparse" work. The ladder has an
-- order, but an application can appear at stage 4 having never logged stage 2,
-- because plenty of firms skip the OA. Nothing in this schema assumes stage n
-- implies stage n-1.

create table stages (
  code        text     primary key,
  label       text     not null,
  sort_order  smallint not null unique
);

insert into stages (code, label, sort_order) values
  ('applied',           'Applied',                  1),
  ('oa',                'Online assessment',        2),
  ('video',             'Video interview',          3),
  ('first_round',       'First round',              4),
  ('assessment_centre', 'Assessment centre',        5),
  ('offer',             'Offer',                    6);


-- ============================================================================
-- WORKED EXAMPLE 2 of 2: firms
-- ============================================================================
--
-- Why firms is its own table rather than a text column on every application:
--
-- Say you skip this table and store the firm name directly on each of 400
-- application rows. Someone types "Bank of America". Someone else types
-- "BofA". Someone else types "bofa". You now have three firms where there is
-- one, and your denominator has been cut into three pieces. Every percentage
-- on the pulse page is now wrong, and quietly wrong, which is worse.
--
-- The general rule: a fact lives in exactly one place, and everything else
-- points at it by id. The firm's name is stored once, here. Change it here
-- and it changes everywhere, because nothing else has a copy.
--
-- `name_norm` is unique, `name` is not. That is deliberate. It means the
-- database itself refuses a second "bank of america" no matter how it was
-- capitalised or punctuated on the way in. Constraints that stop bad data at
-- the door are worth ten times a cleanup script.
--
-- `category` is checked rather than free text because an unchecked category
-- column is how you end up with 'quant', 'Quant', 'quant/swe' and a filter
-- that silently drops rows.

create table firms (
  id          bigint      generated always as identity primary key,
  slug        text        not null unique,
  name        text        not null,
  name_norm   text        not null unique,
  category    text        not null check (category in ('ib_markets', 'quant_swe')),
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- YOUR TURN. Six tables. Roughly 90 lines.
-- ============================================================================
--
-- Each block below gives you every column, its type, whether it is nullable,
-- and the constraints. Write the CREATE TABLE underneath. Order matters: a
-- table cannot reference another that does not exist yet, so go top to bottom.


-- ----------------------------------------------------------------------------
-- 2.1  programmes
-- ----------------------------------------------------------------------------
--
-- The kind of scheme: Summer Internship, Off-cycle, Spring Week, Graduate
-- Scheme, Insight Programme. Roughly five rows.
--
-- This is a GLOBAL table, not per-firm. "Summer Internship" means the same
-- thing at UBS as it does at Optiver, so it is one row that forty firms point
-- at. If it were per-firm you would have forty rows all saying "Summer
-- Internship", and the alias table would have to dedupe within each firm
-- separately, which is forty times the work for no gain.
--
-- Columns:
--   id          bigint       identity, primary key
--   slug        text         not null, unique
--   name        text         not null
--   name_norm   text         not null, unique
--   created_at  timestamptz  not null, default now()
--
-- Same shape as `firms` minus the category. Copy it and adapt.

-- write it here


-- ----------------------------------------------------------------------------
-- 2.2  roles   <-- THE UNIT OF RECORD. The most important table in the schema.
-- ----------------------------------------------------------------------------
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
-- was useless until somebody asked "which role?". If you collapse these into
-- one row you have rebuilt the group chat, with worse formatting.
--
-- The unique constraint across all five columns is what enforces it. Without
-- it, two people submitting the same role create two roles, and your
-- denominator splits again.
--
-- Columns:
--   id             bigint       identity, primary key
--   firm_id        bigint       not null, references firms(id)
--   programme_id   bigint       not null, references programmes(id)
--   division       text         not null   -- "Global Capital Markets"
--   division_norm  text         not null   -- "global capital markets"
--   location       text         not null   -- "London"
--   location_norm  text         not null   -- "london"
--   cycle          text         not null   -- "Summer 2027"
--   slug           text         not null, unique   -- used in the page URL
--   created_at     timestamptz  not null, default now()
--
-- Constraint:
--   unique (firm_id, programme_id, division_norm, location_norm, cycle)
--
-- Note it is the _norm columns in the unique constraint, not the display ones.
-- "M&A" and "m & a" must collide. `cycle` needs no _norm because it comes from
-- a fixed dropdown, never free text.
--
-- MIGRATION RISK, flagged before you write it: `division` is free text. If you
-- later want to browse "all M&A roles across every firm", or need the alias
-- pipeline to merge divisions with real foreign keys, that becomes a genuine
-- migration - backfill a divisions table, add a column, rewrite every query
-- that touches it. Free text is still the right call for v1, because a
-- divisions table adds a join to every query for a feature that is not in v1.
-- Write it knowing that, rather than finding out in November.

-- write it here


-- ----------------------------------------------------------------------------
-- 2.3  applications
-- ----------------------------------------------------------------------------
--
-- One row per person per role. This table IS the denominator.
--
-- `unique (role_id, local_id)` is the single most important line in this file
-- after the roles unique constraint. It guarantees that when you count rows in
-- applications, you are counting PEOPLE, not submissions. Without it, one
-- person clicking twice becomes two applicants, and "78% received the OA"
-- becomes a number about button presses.
--
-- On current_stage / current_status being stored here at all: this is
-- deliberately duplicated information, because it is derivable from the events
-- table. The trade is one extra UPDATE per submission, against running a
-- window function over the entire events table on every single page load. Take
-- the UPDATE.
--
-- Columns:
--   id              bigint       identity, primary key
--   role_id         bigint       not null, references roles(id)
--   local_id        uuid         not null   -- the anonymous browser id
--   current_stage   text         not null, references stages(code)
--   current_status  text         not null,
--                     check (current_status in
--                       ('waiting','progressed','rejected','withdrew'))
--   ip_hash         text         NULLABLE   -- see note below
--   created_at      timestamptz  not null, default now()
--   updated_at      timestamptz  not null, default now()
--
-- Constraint:
--   unique (role_id, local_id)
--
-- On `ip_hash`: salted SHA-256 of the request IP, never the raw IP. It is here
-- rather than in task 9 because it is a column, and adding columns later to a
-- live table is exactly the migration you were told to avoid. Nullable because
-- the header is occasionally absent. Retention gets handled in task 9.
--
-- On `updated_at`: this is your only defence against survivorship drift.
-- People who get rejected stop updating their row, so `waiting` counts inflate
-- over time and progression rates drift upward. You cannot fix that in v1, but
-- storing this means you can at least show staleness later without a
-- migration.
--
-- On indexes: you do NOT need a separate index on role_id. The unique
-- constraint above creates an index with role_id as the leading column, and
-- Postgres will use it for `where role_id = ...` queries. Adding a second one
-- costs you write speed for nothing. General rule: check what your constraints
-- already gave you before adding an index.

-- write it here


-- ----------------------------------------------------------------------------
-- 2.4  events
-- ----------------------------------------------------------------------------
--
-- Append-only. Never updated, never deleted. One row every time somebody says
-- "this happened to me at this stage on this date".
--
-- Why separate from applications: applications answers "where is this person
-- now", events answers "when did each thing fire". The timing histogram and
-- the median-gap numbers are impossible without a history, and you cannot keep
-- a history in a table you overwrite.
--
-- Columns:
--   id              bigint       identity, primary key
--   application_id  bigint       not null, references applications(id)
--                                on delete cascade
--   role_id         bigint       not null, references roles(id)
--   stage           text         not null, references stages(code)
--   status          text         not null,
--                     check (status in
--                       ('waiting','progressed','rejected','withdrew'))
--   occurred_on     date         not null
--   occurred_hour   smallint     NULLABLE,
--                     check (occurred_hour between 0 and 23)
--   logged_at       timestamptz  not null, default now()
--
-- Indexes:
--   index on (role_id, stage)          -- the pulse page reads by role + stage
--   index on (logged_at desc)          -- the "fired today" feed
--
-- WHY occurred_on AND occurred_hour, RATHER THAN ONE NULLABLE TIMESTAMP:
--
-- Half your users will know "the OA landed Tuesday afternoon" and not the
-- hour. If you stored a single timestamp you would have to write midnight in
-- for them. Then the "are they sending gradually?" histogram shows a fake
-- spike at 00:00 every day, made entirely of people who did not know the time,
-- and there is no way to tell those rows apart from a genuine midnight send.
--
-- Two columns make "I don't know the hour" explicit and unfakeable. The
-- day-level histogram uses every row; the hour-level one filters to
-- `occurred_hour is not null` and reports its own smaller n.
--
-- General rule: when a value can be genuinely unknown, give the unknown its
-- own representation. Never encode it as a plausible-looking real value.
--
-- Times are Europe/London throughout. Written down here because it is the kind
-- of assumption that is invisible until it is wrong.
--
-- ON role_id BEING DUPLICATED HERE: yes, you could reach it by joining through
-- applications. Carrying it directly removes a join from every aggregation
-- query in task 5, which is the task you most need to be able to read. It is
-- safe to duplicate because an application's role never changes, unlike
-- current_stage which changes constantly. The residual risk is the submission
-- handler writing a role_id that disagrees with the parent application, so
-- task 11's verification pass includes a query that hunts for exactly that.

-- write it here


-- ----------------------------------------------------------------------------
-- 2.5  aliases
-- ----------------------------------------------------------------------------
--
-- Step 2 of the dedup pipeline, and the step that does most of the work for
-- free: "bofa" -> Bank of America, "boa" -> Bank of America, "gcm" -> Global
-- Capital Markets.
--
-- Columns:
--   id              bigint       identity, primary key
--   kind            text         not null,
--                     check (kind in ('firm','programme','division'))
--   alias_norm      text         not null   -- always the normalised form
--   firm_id         bigint       NULLABLE, references firms(id)
--   programme_id    bigint       NULLABLE, references programmes(id)
--   division_canon  text         NULLABLE   -- canonical division string
--   created_at      timestamptz  not null, default now()
--
-- Constraints:
--   unique (kind, alias_norm)
--
--   check ( exactly one of the three target columns is set, matching `kind` ):
--     (kind = 'firm'      and firm_id is not null
--                         and programme_id is null and division_canon is null)
--     or
--     (kind = 'programme' and programme_id is not null
--                         and firm_id is null and division_canon is null)
--     or
--     (kind = 'division'  and division_canon is not null
--                         and firm_id is null and programme_id is null)
--
-- That CHECK looks fussy and it is worth it. The obvious alternative is two
-- columns, `entity_type` and `entity_id`, pointing at whichever table
-- entity_type names. That is called a polymorphic foreign key, and Postgres
-- cannot enforce it: nothing stops entity_id pointing at a firm that was
-- deleted, because the database has no idea which table to check. Three
-- separate nullable foreign keys plus one CHECK gives you real referential
-- integrity for about four extra lines.
--
-- unique is on (kind, alias_norm) rather than alias_norm alone, so the same
-- string can legitimately be a firm alias and a division alias.

-- write it here


-- ----------------------------------------------------------------------------
-- 2.6  merge_queue
-- ----------------------------------------------------------------------------
--
-- Step 5 of the dedup pipeline. Whatever survives normalise, alias lookup and
-- fuzzy match lands here for one human click.
--
-- Both the raw and the normalised strings are kept. The raw one is what you
-- read when deciding; the normalised one is what you compare.
--
-- Columns:
--   id                 bigint       identity, primary key
--   raw_firm           text         not null
--   raw_programme      text         NULLABLE
--   raw_division       text         NULLABLE
--   raw_location       text         NULLABLE
--   raw_cycle          text         NULLABLE
--   norm_firm          text         not null
--   suggested_firm_id  bigint       NULLABLE, references firms(id)
--   suggested_role_id  bigint       NULLABLE, references roles(id)
--   status             text         not null, default 'pending',
--                        check (status in
--                          ('pending','approved','merged','rejected'))
--   submitted_by       uuid         not null   -- the local_id
--   ip_hash            text         NULLABLE
--   created_at         timestamptz  not null, default now()
--   resolved_at        timestamptz  NULLABLE
--
-- Index:
--   create index merge_queue_pending_idx
--     on merge_queue (created_at) where status = 'pending';
--
-- That WHERE clause makes it a partial index: it only indexes pending rows.
-- The admin page only ever reads pending rows, and resolved rows will
-- eventually outnumber pending ones a hundred to one. A partial index stays
-- small and fast forever instead of growing with your rejects pile.

-- write it here
