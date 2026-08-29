-- ============================================================================
-- Stagewatch: Eightfold vendor and two sources, migration 015
-- ============================================================================
--
-- ADDITIVE.
--
-- Eightfold keys on the firm's DOMAIN, not a slug, so `tenant` holds e.g.
-- "mlp.com". host_prefix and board_path are unused.
--
-- BCG appears here having been REJECTED from Greenhouse in migration 014. The
-- `bcg` Greenhouse board is somebody's abandoned test board ("Test Job Live",
-- Bronx and Tampa); bcg.com on Eightfold is genuinely Boston Consulting Group,
-- with real entries like "Consulting Full-time, Europe Campus" and "Forward
-- Deployed AI Scientist, Internship, United Kingdom". Same firm name, two
-- endpoints, one real. This is exactly why a candidate is opened and read
-- before it is trusted.
--
-- Avature was probed for Bank of America and returns HTTP 403 to
-- unauthenticated requests, so BofA remains without a source.
-- ============================================================================

alter table sources drop constraint if exists sources_vendor_check;
alter table sources add constraint sources_vendor_check
  check (vendor in ('workday', 'greenhouse', 'lever', 'ashby',
                    'smartrecruiters', 'eightfold'));

insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
select f.id, 'eightfold', v.domain, null, null
from (values
  ('millennium',              'mlp.com'),
  ('boston-consulting-group', 'bcg.com')
) as v(firm_slug, domain)
join firms f on f.slug = v.firm_slug
on conflict (vendor, tenant, board_path) do nothing;
