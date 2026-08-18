-- ============================================================================
-- Stagewatch: more vendors and more sources, migration 006
-- ============================================================================
--
-- ADDITIVE. Deliberately does not drop and recreate `sources` the way 004
-- does, because `postings.first_seen_at` IS the detection signal: dropping the
-- table would cascade the postings away and the next poll would re-report
-- every one of them as newly opened, with today's timestamp. The one real
-- opening detected so far would silently become a lie.
--
-- General rule: once a table holds data that cannot be recomputed, migrations
-- against it are ALTER and INSERT, never DROP.
-- ============================================================================

-- Widen the vendor list. Ashby and SmartRecruiters have no sources yet; the
-- fetchers exist and the constraint allows them, so adding one later is an
-- INSERT rather than a migration.
alter table sources drop constraint if exists sources_vendor_check;
alter table sources add constraint sources_vendor_check
  check (vendor in ('workday', 'greenhouse', 'lever', 'ashby', 'smartrecruiters'));


-- ============================================================================
-- Sources found by probing on 18 August 2026
-- ============================================================================
--
-- Greenhouse, Lever, Ashby and SmartRecruiters all key off a plain company
-- slug, so probing name variants finds them. Workday needs a tenant, a host
-- prefix AND a site path, which is why it took a separate hunt and still only
-- yielded three.
--
-- host_prefix and board_path are null for these vendors: the slug is the whole
-- address.

insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
select f.id, v.vendor, v.tenant, null, null
from (values
  ('jane-street',         'greenhouse', 'janestreet'),
  ('imc-trading',         'greenhouse', 'imc'),
  ('flow-traders',        'greenhouse', 'flowtraders'),
  ('jump-trading',        'greenhouse', 'jumptrading'),
  ('squarepoint-capital', 'greenhouse', 'squarepointcapital'),
  ('man-group',           'greenhouse', 'mangroup'),
  ('point72',             'greenhouse', 'point72'),
  ('palantir',            'lever',      'palantir')
) as v(firm_slug, vendor, tenant)
join firms f on f.slug = v.firm_slug
on conflict (vendor, tenant, board_path) do nothing;
