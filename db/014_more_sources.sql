-- ============================================================================
-- Stagewatch: seven verified detection sources, migration 014
-- ============================================================================
--
-- ADDITIVE. Does not touch `postings`, whose first_seen_at is the detection
-- signal and cannot be recomputed.
--
-- HOW THESE WERE FOUND, AND WHAT WAS REJECTED
--
-- Two passes. Slug-probing found the Greenhouse/Lever ones; scraping each
-- firm's careers page for an ATS URL found the Workday ones, since a Workday
-- source needs tenant + host prefix + site path and none of those are
-- guessable.
--
-- Every candidate was then opened and READ before being accepted here, which
-- rejected four of eleven:
--
--   bcg (greenhouse)          - contains "Test Job Live" and "Voice AI Test"
--                               in Bronx and Tampa. Not Boston Consulting
--                               Group; somebody's abandoned test board.
--   oliverwyman (lever)       - Account Executive and Software Engineer in San
--                               Francisco. Not the management consultancy.
--   ghr/Lateral-US (workday)  - is Bank of America, but returns 0 results for
--                               "summer analyst 2027". It is the US lateral
--                               board; campus hiring lives elsewhere. A source
--                               that can never fire is worse than none, because
--                               last_error stays clean and it looks healthy.
--   hrttalentcommunity        - three placeholder rows ("HRT Talent
--                               Community"), not a job board.
--
-- The lesson is that a responding endpoint is not a valid source. Slug
-- collisions are common and a wrong board silently pollutes the feed with
-- another company's jobs.
-- ============================================================================

insert into sources (firm_id, vendor, tenant, host_prefix, board_path)
select f.id, v.vendor, v.tenant, v.host_prefix, v.board_path
from (values
  -- Workday. Verified by reading the board, not merely by a 200 response.
  -- Barclays is the find of this pass: 19 live 2027 internships including
  -- "Banking Summer Internship Programme 2027 London".
  ('barclays',       'workday',    'barclays',                 'wd3', 'External_Career_Site_Barclays'),
  ('pjt-partners',   'workday',    'pjtpartners',              'wd1', 'Careers'),
  ('moelis-company', 'workday',    'moelis',                   'wd1', 'Experienced-Hires'),
  ('mizuho',         'workday',    'mizuho',                   'wd1', 'mizuhoamericas'),
  -- Greenhouse.
  ('xtx-markets',    'greenhouse', 'xtxmarketstechnologies',   null,  null),
  ('btg-pactual',    'greenhouse', 'btgpactual',               null,  null),
  ('five-rings',     'greenhouse', 'fiveringsllc',             null,  null)
) as v(firm_slug, vendor, tenant, host_prefix, board_path)
join firms f on f.slug = v.firm_slug
on conflict (vendor, tenant, board_path) do nothing;

-- Still without a source, and why, so a later session does not re-probe them:
--   Bank of America, Goldman Sachs, J.P. Morgan, HSBC, UBS, Deutsche Bank,
--   BNP Paribas  - Workday or bespoke, campus site path not yet located
--   McKinsey, Bain, Kearney            - bespoke portals
--   Millennium, BCG                    - Eightfold (no fetcher yet)
--   Bank of America (also)             - Avature (no fetcher yet)
--   Castleton Commodities              - osv-cci.wd1/CCICareers did not respond
--   Citadel, Citadel Securities, DRW, G-Research, Marshall Wace, Maven,
--   Optiver, QRT, SIG, Two Sigma, Jefferies, Nomura, Macquarie, RBC, SMBC,
--   Standard Chartered, Evercore, Lazard, Centerview, Qatalyst, Rothschild,
--   Houlihan Lokey, Perella Weinberg, Blackstone, KKR, BlackRock, EDF Trading,
--   Bloomberg                          - no ATS URL found in the careers page
--                                        HTML; likely JS-rendered or bespoke
