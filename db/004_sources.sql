-- ============================================================================
-- Stagewatch: application-open detection, migration 004
-- ============================================================================
--
-- Detects the moment a firm's application goes live, by polling the applicant
-- tracking systems the firms already publish to. Run after 003.
--
-- WHY THIS IS NOT IN `events`
--
-- `events` requires an application_id: it records what happened to A PERSON.
-- A firm opening a posting has no applicant attached to it. Forcing it into
-- events would mean either a nullable application_id (breaking every
-- aggregation that counts distinct applicants) or a fake application row
-- (poisoning every denominator on the site). So firm-side facts live here, in
-- their own two tables, and never mix with applicant-side ones.
--
-- HOW DETECTION ACTUALLY WORKS
--
-- Not by reading a "posted at" field. Workday reports `postedOn` as the string
-- "Posted 26 Days Ago", capped at "30+ Days Ago" - relative and useless for
-- an exact time. So detection is by DIFFING: a posting we have not seen before
-- is a posting that just opened.
--
-- The consequence is that this cannot backfill. It only ever catches opens
-- that happen after the poller is switched on, which is why switching it on
-- early matters more than building it early.
-- ============================================================================

drop table if exists postings cascade;
drop table if exists sources  cascade;


-- ============================================================================
-- sources
-- ============================================================================
--
-- One row per firm job board. This table is DATA, not code: adding a firm is
-- an INSERT, never a deploy. That matters because the tenant identifiers
-- cannot be derived - they have to be found by hand, one firm at a time - and
-- because they rot. Firms move tenants and switch vendors.
--
-- last_ok_at and last_error exist so a broken source is visible rather than
-- silently returning nothing. A source that quietly stops matching is
-- indistinguishable from a firm that has not opened yet, which is the failure
-- mode most likely to go unnoticed for weeks.

create table sources (
  id                   bigint      generated always as identity primary key,
  firm_id              bigint      not null references firms(id) on delete cascade,
  vendor               text        not null check (vendor in ('workday', 'greenhouse', 'lever')),

  -- Workday: tenant='citi', host_prefix='wd5', board_path='2'
  --   -> https://citi.wd5.myworkdayjobs.com/wday/cxs/citi/2/jobs
  -- Greenhouse: tenant is the board token, host_prefix and board_path unused.
  tenant               text        not null,
  host_prefix          text,
  board_path           text,

  enabled              boolean     not null default true,
  last_polled_at       timestamptz,
  last_ok_at           timestamptz,
  last_error           text,
  consecutive_failures int         not null default 0,
  created_at           timestamptz not null default now(),

  unique (vendor, tenant, board_path)
);


-- ============================================================================
-- postings
-- ============================================================================
--
-- One row per external posting ever seen. Append-mostly: rows are created on
-- first sight and touched on every subsequent sight.
--
--   opened = the row was created. first_seen_at IS the signal.
--   closed = last_seen_at has fallen behind several SUCCESSFUL polls.
--
-- Closure is deliberately not inferred from a single absence. One Workday
-- outage would otherwise mark forty firms closed at once, and a false "closed"
-- is far worse than a late one: somebody decides not to apply.
--
-- vendor_first_published is preferred over first_seen_at when the vendor
-- supplies it (Greenhouse does, Workday does not), because it is true rather
-- than merely observed.

create table postings (
  id                     bigint      generated always as identity primary key,
  source_id              bigint      not null references sources(id) on delete cascade,

  -- Stable id from the vendor. The unique constraint on it is what makes the
  -- poller idempotent: polling twice in a minute must not invent two openings.
  external_id            text        not null,

  url                    text,
  title                  text        not null,
  title_norm             text        not null,
  location_raw           text,
  location_norm          text,

  -- Parsed out of the title where possible. Nullable because plenty of titles
  -- do not say, and a guessed cycle is worse than an absent one.
  cycle_guess            text,
  division_guess         text,

  -- Set once the dedup pipeline matches this to a canonical role. Null means
  -- unmatched, which is not an error - it is a merge queue entry waiting.
  role_id                bigint      references roles(id) on delete set null,

  first_seen_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  closed_at              timestamptz,
  vendor_first_published date,
  vendor_deadline        date,

  unique (source_id, external_id)
);

create index postings_open_idx    on postings (first_seen_at desc) where closed_at is null;
create index postings_source_idx  on postings (source_id);
create index postings_role_idx    on postings (role_id) where role_id is not null;


-- ============================================================================
-- Seed: sources confirmed live by probing on 17 August 2026
-- ============================================================================
--
-- Only three, and that is honest rather than lazy. Workday tenant identifiers
-- are not derivable: guessing tenant x host x site found Citi, Morgan Stanley
-- and Santander, and blind-probing seventeen other firms found nothing. The
-- rest have to be read off each firm's careers page by hand.
--
-- Adding one is an INSERT. No deploy, no code change:
--
--   insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
--   select id, 'workday', 'barclays', 'wd3', 'External'
--   from firms where slug = 'barclays';
--
-- To find the values: open the firm's job search, and read the URL. A Workday
-- one looks like
--   https://TENANT.HOSTPREFIX.myworkdayjobs.com/BOARDPATH/...
-- A Greenhouse one looks like
--   https://boards.greenhouse.io/TENANT

insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
select f.id, v.vendor, v.tenant, v.host_prefix, v.board_path
from (values
  ('citi',           'workday', 'citi',          'wd5', '2'),
  ('morgan-stanley', 'workday', 'ms',            'wd5', 'External'),
  ('santander',      'workday', 'santander',     'wd3', 'SantanderCareers')
) as v(firm_slug, vendor, tenant, host_prefix, board_path)
join firms f on f.slug = v.firm_slug;
