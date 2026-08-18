-- ============================================================================
-- Stagewatch: distinguish "was already there" from "just opened", migration 007
-- ============================================================================
--
-- ADDITIVE. `postings.first_seen_at` cannot be recomputed, so this ALTERs.
--
-- THE PROBLEM THIS FIXES
--
-- Detection works by diffing, so the first time a source is polled EVERY
-- posting on it is unseen, and every one of them looks new. Adding eight
-- sources and polling would have announced 51 applications as "opened in the
-- last 72 hours" when in truth they had been open for weeks and we had merely
-- started watching.
--
-- That is not a cosmetic problem. The entire promise of the feed is "this
-- fired just now"; a feed that cries wolf on day one is worse than no feed,
-- because the one time it is right nobody believes it.
--
-- THE FIX
--
-- A posting seen on a source's FIRST successful poll is a baseline: it tells
-- us the posting exists, not when it opened. Baseline rows are stored (they
-- are needed as the comparison set) but never surfaced as openings.
--
-- The cost is honest and unavoidable: for each newly added source, its
-- currently-open roles are never announced. Only the next genuine opening is.
-- ============================================================================

alter table postings
  add column if not exists is_baseline boolean not null default false;

-- Every posting recorded so far was a first sighting, including the Citi Paris
-- role that the very first poll reported as "OPENED". It was not - it was
-- simply the first thing we ever saw. Correcting it rather than leaving a
-- known-false row in the feed.
update postings set is_baseline = true;

-- The partial index that backs the feed must match the feed's filter, or
-- Postgres cannot use it.
drop index if exists postings_open_idx;
create index postings_open_idx
  on postings (first_seen_at desc)
  where closed_at is null and not is_baseline;
