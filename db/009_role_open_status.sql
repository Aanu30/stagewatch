-- ============================================================================
-- Stagewatch: only claim a role is open when there is evidence, migration 009
-- ============================================================================
--
-- THE PROBLEM
--
-- The 117 seeded roles are a CATALOGUE, not a claim. They were written from
-- how these firms are usually structured - BofA has a GCM division, Optiver
-- runs quant trading in Amsterdam - and not one was checked against a live
-- Summer 2027 posting. Listing them as though they are open, in August, when
-- most Summer 2027 applications do not open until late September, tells the
-- visitor something untrue about every one of them.
--
-- "It opened last year" is not evidence that it is open now. That is precisely
-- the assumption this column exists to stop the site making.
--
-- THE FIX
--
-- opened_at is null until there is EVIDENCE, of which there are two kinds:
--
--   1. A detected posting matched to the role. Strongest: the firm is
--      advertising it right now.
--   2. Somebody logged an application against it. Weaker but real: a person
--      says they applied, which is hard to do to a closed application.
--
-- The catalogue stays - it is needed for logging, for the alias table and for
-- deduplication - but the browser separates what is known open from what is
-- merely listed, and says which is which.
-- ============================================================================

alter table roles
  add column if not exists opened_at timestamptz,
  add column if not exists opened_evidence text
    check (opened_evidence in ('posting', 'submission'));

create index if not exists roles_open_idx on roles (opened_at desc)
  where opened_at is not null;

-- Evidence type 2, applied to what is already there: any role somebody has
-- logged an application against is open enough for someone to have applied.
update roles r
   set opened_at = a.first_logged,
       opened_evidence = 'submission'
  from (select role_id, min(created_at) as first_logged
          from applications group by role_id) a
 where a.role_id = r.id
   and r.opened_at is null;
