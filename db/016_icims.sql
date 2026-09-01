-- ============================================================================
-- Stagewatch: iCIMS vendor and SIG, migration 016
-- ============================================================================
--
-- ADDITIVE.
--
-- iCIMS is the only supported vendor without a JSON API, so its fetcher parses
-- HTML. That is fragile by nature and deliberately last-resort - included
-- because Susquehanna uses it, SIG is squarely in scope for this audience, and
-- the alternative was no coverage at all.
--
-- The fetcher fails LOUDLY if the markup changes: no matching job cards throws
-- rather than returning an empty list, so sources.last_error records it. A
-- scraper that silently returns zero is indistinguishable from a firm with
-- nothing open, which is the failure mode that matters here.
--
-- Probed twenty other firms for iCIMS boards and found none, so this is a
-- one-firm vendor for now.
-- ============================================================================

alter table sources drop constraint if exists sources_vendor_check;
alter table sources add constraint sources_vendor_check
  check (vendor in ('workday', 'greenhouse', 'lever', 'ashby',
                    'smartrecruiters', 'eightfold', 'icims'));

insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
select f.id, 'icims', 'sig', null, null
from firms f where f.slug = 'susquehanna-international-group'
on conflict (vendor, tenant, board_path) do nothing;
