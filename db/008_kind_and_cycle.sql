-- ============================================================================
-- Stagewatch: separate internships from graduate roles, migration 008
-- ============================================================================
--
-- ADDITIVE on structure, DESTRUCTIVE on postings - deliberately, and safe only
-- because of a specific fact: every posting currently stored is `is_baseline`,
-- meaning it has never been shown to anyone as an opening. Baseline rows carry
-- no information beyond "this existed when we started looking", and that is
-- rebuilt by the next poll. Nothing observable is lost.
--
-- This would NOT be safe once real openings have been recorded, because
-- first_seen_at is the detection signal and cannot be recomputed. If you re-run
-- this later, you are deleting history. Don't.
--
-- WHY THE RESET OF last_ok_at MATTERS
--
-- Baseline status is decided by "has this source ever completed a poll".
-- Deleting the postings without clearing last_ok_at would make the next poll
-- treat all 51 pre-existing roles as brand new openings - the exact false claim
-- 007 was written to prevent.
-- ============================================================================

alter table postings
  add column if not exists kind text
    check (kind in ('internship', 'spring_week', 'off_cycle', 'graduate')),
  add column if not exists cycle_confirmed boolean not null default false;

-- Re-evaluate from scratch under the new rules: internships and graduate roles
-- are now separate, and internships are gated to the target cycle.
delete from postings;
update sources set last_ok_at = null, last_polled_at = null;

-- The feed only ever shows internships, so the index that backs it should too.
drop index if exists postings_open_idx;
create index postings_open_idx
  on postings (first_seen_at desc)
  where closed_at is null and not is_baseline;

create index postings_kind_idx on postings (kind, first_seen_at desc);
