-- ============================================================================
-- Stagewatch seed, migration 002
-- ============================================================================
--
-- Canonical firms, programmes, roles and aliases. Run after 001_schema.sql.
-- Safe to re-run: it clears the four tables it owns, and cascades will clear
-- any applications and events hanging off the roles.
--
-- Scope, per spec: IB/Markets and Quant/SWE only, Summer 2027 only. Consulting
-- is deliberately absent - see the commented block at the foot of this file.
--
-- Every _norm and slug column is computed by the SQL functions in 001, never
-- typed by hand, so the seed cannot drift from what the submission handler
-- produces at runtime.
-- ============================================================================

truncate merge_queue, aliases, events, applications, roles, programmes, firms
  restart identity cascade;


-- ============================================================================
-- programmes
-- ============================================================================
-- Global, not per-firm. "Summer Internship" means the same thing everywhere.

insert into programmes (slug, name, name_norm)
select slugify(name), name, normalise_name(name)
from (values
  ('Summer Internship'),
  ('Off-cycle Internship'),
  ('Spring Week'),
  ('Graduate Scheme'),
  ('Insight Programme')
) as v(name);

-- Shorter slugs read better in URLs than the auto-generated ones.
update programmes set slug = 'summer'     where name = 'Summer Internship';
update programmes set slug = 'off-cycle'  where name = 'Off-cycle Internship';
update programmes set slug = 'spring'     where name = 'Spring Week';
update programmes set slug = 'graduate'   where name = 'Graduate Scheme';
update programmes set slug = 'insight'    where name = 'Insight Programme';


-- ============================================================================
-- firms
-- ============================================================================

insert into firms (slug, name, name_norm, category)
select slugify(name), name, normalise_name(name), category
from (values
  -- IB / Markets: bulge bracket
  ('Goldman Sachs',                    'ib_markets'),
  ('Morgan Stanley',                   'ib_markets'),
  ('J.P. Morgan',                      'ib_markets'),
  ('Bank of America',                  'ib_markets'),
  ('Citi',                             'ib_markets'),
  ('Barclays',                         'ib_markets'),
  ('UBS',                              'ib_markets'),
  ('Deutsche Bank',                    'ib_markets'),
  ('HSBC',                             'ib_markets'),
  ('BNP Paribas',                      'ib_markets'),
  ('Santander',                        'ib_markets'),
  ('Standard Chartered',               'ib_markets'),
  ('Nomura',                           'ib_markets'),
  ('Mizuho',                           'ib_markets'),
  ('Macquarie',                        'ib_markets'),
  -- IB / Markets: elite boutiques and advisory
  ('Jefferies',                        'ib_markets'),
  ('RBC Capital Markets',              'ib_markets'),
  ('Lazard',                           'ib_markets'),
  ('Rothschild & Co',                  'ib_markets'),
  ('Evercore',                         'ib_markets'),
  ('Centerview Partners',              'ib_markets'),
  ('Qatalyst Partners',                'ib_markets'),
  ('Moelis & Company',                 'ib_markets'),
  ('PJT Partners',                     'ib_markets'),
  ('Houlihan Lokey',                   'ib_markets'),
  ('Perella Weinberg Partners',        'ib_markets'),
  -- IB / Markets: buyside
  ('Blackstone',                       'ib_markets'),
  ('KKR',                              'ib_markets'),
  -- Quant / SWE: market makers and prop
  ('Jane Street',                      'quant_swe'),
  ('Optiver',                          'quant_swe'),
  ('IMC Trading',                      'quant_swe'),
  ('Flow Traders',                     'quant_swe'),
  ('Susquehanna International Group',  'quant_swe'),
  ('Citadel',                          'quant_swe'),
  ('Citadel Securities',               'quant_swe'),
  ('Jump Trading',                     'quant_swe'),
  ('DRW',                              'quant_swe'),
  ('Hudson River Trading',             'quant_swe'),
  ('XTX Markets',                      'quant_swe'),
  ('Maven Securities',                 'quant_swe'),
  -- Quant / SWE: systematic funds
  ('Two Sigma',                        'quant_swe'),
  ('G-Research',                       'quant_swe'),
  ('Marshall Wace',                    'quant_swe'),
  ('Squarepoint Capital',              'quant_swe'),
  ('Man Group',                        'quant_swe'),
  ('Millennium',                       'quant_swe'),
  ('Point72',                          'quant_swe'),
  ('Qube Research & Technologies',     'quant_swe'),
  -- Quant / SWE: tech
  ('Bloomberg',                        'quant_swe'),
  ('Palantir',                         'quant_swe')
) as v(name, category);


-- ============================================================================
-- roles  -- firm x programme x division x location x cycle
-- ============================================================================
--
-- The slug omits the programme when it is the summer internship, since that is
-- the default and repeating it reads badly:
--   optiver-quantitative-trading-amsterdam-summer-2027
--   ubs-investment-banking-london-off-cycle-summer-2027

insert into roles
  (firm_id, programme_id, division, division_norm, location, location_norm, cycle, slug)
select
  f.id,
  p.id,
  v.division,
  normalise_name(v.division),
  v.location,
  normalise_name(v.location),
  v.cycle,
  f.slug || '-' || slugify(v.division) || '-' || slugify(v.location)
    || case when p.slug = 'summer' then '' else '-' || p.slug end
    || '-' || slugify(v.cycle)
from (values
  -- firm slug            programme    division                              location     cycle
  ('goldman-sachs',       'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('goldman-sachs',       'summer', 'Global Markets',                     'London',    'Summer 2027'),
  ('goldman-sachs',       'summer', 'Asset & Wealth Management',          'London',    'Summer 2027'),
  ('goldman-sachs',       'summer', 'Engineering',                        'London',    'Summer 2027'),
  ('goldman-sachs',       'spring', 'Investment Banking',                 'London',    'Summer 2027'),

  ('morgan-stanley',      'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('morgan-stanley',      'summer', 'Sales & Trading',                    'London',    'Summer 2027'),
  ('morgan-stanley',      'summer', 'Research',                           'London',    'Summer 2027'),
  ('morgan-stanley',      'summer', 'Technology',                         'London',    'Summer 2027'),

  ('j-p-morgan',          'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('j-p-morgan',          'summer', 'Markets',                            'London',    'Summer 2027'),
  ('j-p-morgan',          'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('j-p-morgan',          'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('j-p-morgan',          'summer', 'Software Engineering',               'Glasgow',   'Summer 2027'),

  -- Bank of America: the spec's worked example. GCM, Global IBD and Markets
  -- LevFin are three separate roles and must never be collapsed.
  ('bank-of-america',     'summer', 'Global Capital Markets',             'London',    'Summer 2027'),
  ('bank-of-america',     'summer', 'Global Investment Banking',          'London',    'Summer 2027'),
  ('bank-of-america',     'summer', 'Markets LevFin',                     'London',    'Summer 2027'),
  ('bank-of-america',     'summer', 'Global Markets',                     'London',    'Summer 2027'),
  ('bank-of-america',     'summer', 'Technology',                         'London',    'Summer 2027'),

  ('citi',                'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('citi',                'summer', 'Markets',                            'London',    'Summer 2027'),
  ('citi',                'summer', 'Technology',                         'Belfast',   'Summer 2027'),

  ('barclays',            'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('barclays',            'summer', 'Markets',                            'London',    'Summer 2027'),
  ('barclays',            'summer', 'Technology',                         'London',    'Summer 2027'),

  -- UBS: the spec's second worked example. Summer, off-cycle and private
  -- banking are three different things and applicants confuse them constantly.
  ('ubs',                 'summer',    'Investment Banking',              'London',    'Summer 2027'),
  ('ubs',                 'summer',    'Global Markets',                  'London',    'Summer 2027'),
  ('ubs',                 'summer',    'Wealth Management',               'London',    'Summer 2027'),
  ('ubs',                 'off-cycle', 'Investment Banking',              'London',    'Summer 2027'),

  ('deutsche-bank',       'summer', 'Investment Bank',                    'London',    'Summer 2027'),
  ('deutsche-bank',       'summer', 'Fixed Income & Currencies',          'London',    'Summer 2027'),
  ('deutsche-bank',       'summer', 'Technology',                         'London',    'Summer 2027'),

  ('hsbc',                'summer', 'Global Banking',                     'London',    'Summer 2027'),
  ('hsbc',                'summer', 'Global Markets',                     'London',    'Summer 2027'),

  ('bnp-paribas',         'summer', 'Global Banking',                     'London',    'Summer 2027'),
  ('bnp-paribas',         'summer', 'Global Markets',                     'London',    'Summer 2027'),

  ('santander',           'summer', 'Corporate & Investment Banking',     'London',    'Summer 2027'),
  ('santander',           'summer', 'Markets',                            'London',    'Summer 2027'),

  ('standard-chartered',  'summer', 'Corporate & Investment Banking',     'London',    'Summer 2027'),
  ('standard-chartered',  'summer', 'Financial Markets',                  'London',    'Summer 2027'),

  ('nomura',              'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('nomura',              'summer', 'Global Markets',                     'London',    'Summer 2027'),

  ('mizuho',              'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('macquarie',           'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('macquarie',           'summer', 'Commodities & Global Markets',       'London',    'Summer 2027'),

  ('jefferies',           'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('jefferies',           'summer', 'Equities',                           'London',    'Summer 2027'),

  ('rbc-capital-markets', 'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('rbc-capital-markets', 'summer', 'Global Markets',                     'London',    'Summer 2027'),

  ('lazard',              'summer', 'Financial Advisory',                 'London',    'Summer 2027'),
  ('rothschild-co',       'summer', 'Global Advisory',                    'London',    'Summer 2027'),

  ('evercore',            'summer', 'M&A',                                'London',    'Summer 2027'),
  ('evercore',            'summer', 'Restructuring',                      'London',    'Summer 2027'),

  ('centerview-partners', 'summer', 'Investment Banking',                 'London',    'Summer 2027'),
  ('qatalyst-partners',   'summer', 'M&A',                                'London',    'Summer 2027'),
  ('moelis-company',      'summer', 'Investment Banking',                 'London',    'Summer 2027'),

  ('pjt-partners',        'summer', 'Strategic Advisory',                 'London',    'Summer 2027'),
  ('pjt-partners',        'summer', 'Restructuring',                      'London',    'Summer 2027'),

  ('houlihan-lokey',      'summer', 'Corporate Finance',                  'London',    'Summer 2027'),
  ('houlihan-lokey',      'summer', 'Financial Restructuring',            'London',    'Summer 2027'),

  ('perella-weinberg-partners', 'summer', 'Advisory',                     'London',    'Summer 2027'),

  ('blackstone',          'summer', 'Private Equity',                     'London',    'Summer 2027'),
  ('blackstone',          'summer', 'Real Estate',                        'London',    'Summer 2027'),
  ('blackstone',          'summer', 'Credit & Insurance',                 'London',    'Summer 2027'),

  ('kkr',                 'summer', 'Private Equity',                     'London',    'Summer 2027'),
  ('kkr',                 'summer', 'Credit',                             'London',    'Summer 2027'),

  -- Quant / SWE
  ('jane-street',         'summer', 'Quantitative Trading',               'London',    'Summer 2027'),
  ('jane-street',         'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('jane-street',         'summer', 'Quantitative Research',              'London',    'Summer 2027'),

  ('optiver',             'summer', 'Quantitative Trading',               'Amsterdam', 'Summer 2027'),
  ('optiver',             'summer', 'Quantitative Trading',               'London',    'Summer 2027'),
  ('optiver',             'summer', 'Software Engineering',               'Amsterdam', 'Summer 2027'),
  ('optiver',             'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('optiver',             'summer', 'Quantitative Research',              'Amsterdam', 'Summer 2027'),

  ('imc-trading',         'summer', 'Trading',                            'Amsterdam', 'Summer 2027'),
  ('imc-trading',         'summer', 'Software Engineering',               'Amsterdam', 'Summer 2027'),
  ('imc-trading',         'summer', 'Quantitative Research',              'London',    'Summer 2027'),

  ('flow-traders',        'summer', 'Trading',                            'Amsterdam', 'Summer 2027'),
  ('flow-traders',        'summer', 'Technology',                         'Amsterdam', 'Summer 2027'),

  ('susquehanna-international-group', 'summer', 'Quantitative Trading',   'Dublin',    'Summer 2027'),
  ('susquehanna-international-group', 'summer', 'Software Engineering',   'Dublin',    'Summer 2027'),
  ('susquehanna-international-group', 'summer', 'Quantitative Research',  'London',    'Summer 2027'),

  ('citadel',             'summer', 'Investment & Trading',               'London',    'Summer 2027'),
  ('citadel',             'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('citadel-securities',  'summer', 'Quantitative Trading',               'London',    'Summer 2027'),
  ('citadel-securities',  'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('citadel-securities',  'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('jump-trading',        'summer', 'Quantitative Trading',               'London',    'Summer 2027'),
  ('jump-trading',        'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('drw',                 'summer', 'Trading',                            'London',    'Summer 2027'),
  ('drw',                 'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('drw',                 'summer', 'Quantitative Research',              'London',    'Summer 2027'),

  ('hudson-river-trading','summer', 'Algorithm Development',              'London',    'Summer 2027'),
  ('hudson-river-trading','summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('xtx-markets',         'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('xtx-markets',         'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('maven-securities',    'summer', 'Quantitative Trading',               'London',    'Summer 2027'),

  ('two-sigma',           'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('two-sigma',           'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('g-research',          'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('g-research',          'summer', 'Machine Learning',                   'London',    'Summer 2027'),
  ('g-research',          'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('marshall-wace',       'summer', 'Systematic Research',                'London',    'Summer 2027'),
  ('marshall-wace',       'summer', 'Technology',                         'London',    'Summer 2027'),

  ('squarepoint-capital', 'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('squarepoint-capital', 'summer', 'Software Engineering',               'London',    'Summer 2027'),

  ('man-group',           'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('man-group',           'summer', 'Technology',                         'London',    'Summer 2027'),

  ('millennium',          'summer', 'Quantitative Research',              'London',    'Summer 2027'),
  ('point72',             'summer', 'Investment Analyst',                 'London',    'Summer 2027'),
  ('point72',             'summer', 'Quantitative Research',              'London',    'Summer 2027'),

  ('qube-research-technologies', 'summer', 'Quantitative Research',       'London',    'Summer 2027'),

  ('bloomberg',           'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('bloomberg',           'summer', 'Financial Products',                 'London',    'Summer 2027'),
  ('bloomberg',           'summer', 'Data Science',                       'London',    'Summer 2027'),

  ('palantir',            'summer', 'Software Engineering',               'London',    'Summer 2027'),
  ('palantir',            'summer', 'Forward Deployed Engineering',       'London',    'Summer 2027')
) as v(firm_slug, programme_slug, division, location, cycle)
join firms      f on f.slug = v.firm_slug
join programmes p on p.slug = v.programme_slug;


-- ============================================================================
-- aliases
-- ============================================================================
--
-- Step 2 of the dedup pipeline, and the cheapest one. Seeded generously,
-- because every alias here is a submission that never reaches the merge queue
-- and never costs an LLM call.
--
-- alias_norm is always computed by normalise_name(), never typed, so an alias
-- written "BofA" here matches a user who types "b of a." at runtime.

-- Firm aliases
insert into aliases (kind, alias_norm, firm_id)
select 'firm', normalise_name(v.alias), f.id
from (values
  ('GS',                  'goldman-sachs'),
  ('Goldman',             'goldman-sachs'),
  ('MS',                  'morgan-stanley'),
  ('JPM',                 'j-p-morgan'),
  ('JP Morgan',           'j-p-morgan'),
  ('JPMorgan',            'j-p-morgan'),
  ('Chase',               'j-p-morgan'),
  ('BofA',                'bank-of-america'),
  ('BOA',                 'bank-of-america'),
  ('BAML',                'bank-of-america'),
  ('Merrill Lynch',       'bank-of-america'),
  ('Citigroup',           'citi'),
  ('Barcap',              'barclays'),
  ('UBS AG',              'ubs'),
  ('DB',                  'deutsche-bank'),
  ('Deutsche',            'deutsche-bank'),
  ('BNP',                 'bnp-paribas'),
  ('BNPP',                'bnp-paribas'),
  ('SC',                  'standard-chartered'),
  ('StanChart',           'standard-chartered'),
  ('Stan Chart',          'standard-chartered'),
  ('RBC',                 'rbc-capital-markets'),
  ('RBCCM',               'rbc-capital-markets'),
  ('Rothschild',          'rothschild-co'),
  ('EVR',                 'evercore'),
  ('Centerview',          'centerview-partners'),
  ('Qatalyst',            'qatalyst-partners'),
  ('Moelis',              'moelis-company'),
  ('PJT',                 'pjt-partners'),
  ('HL',                  'houlihan-lokey'),
  ('Houlihan',            'houlihan-lokey'),
  ('PWP',                 'perella-weinberg-partners'),
  ('Perella',             'perella-weinberg-partners'),
  ('BX',                  'blackstone'),
  ('Kohlberg Kravis Roberts', 'kkr'),
  ('JS',                  'jane-street'),
  ('Jane St',             'jane-street'),
  ('IMC',                 'imc-trading'),
  ('Flow',                'flow-traders'),
  ('SIG',                 'susquehanna-international-group'),
  ('Susquehanna',         'susquehanna-international-group'),
  ('CitSec',              'citadel-securities'),
  ('Citadel Sec',         'citadel-securities'),
  ('Jump',                'jump-trading'),
  ('HRT',                 'hudson-river-trading'),
  ('XTX',                 'xtx-markets'),
  ('Maven',               'maven-securities'),
  ('2 Sigma',             'two-sigma'),
  ('GR',                  'g-research'),
  ('G Research',          'g-research'),
  ('MW',                  'marshall-wace'),
  ('Squarepoint',         'squarepoint-capital'),
  ('AHL',                 'man-group'),
  ('Man AHL',             'man-group'),
  ('MLP',                 'millennium'),
  ('Millennium Management', 'millennium'),
  ('QRT',                 'qube-research-technologies'),
  ('Qube',                'qube-research-technologies'),
  ('Bberg',               'bloomberg'),
  ('BBG',                 'bloomberg')
) as v(alias, firm_slug)
join firms f on f.slug = v.firm_slug;

-- Programme aliases
insert into aliases (kind, alias_norm, programme_id)
select 'programme', normalise_name(v.alias), p.id
from (values
  ('Summer Analyst',       'summer'),
  ('Summer Intern',        'summer'),
  ('SA',                   'summer'),
  ('Summer 2027',          'summer'),
  ('Off Cycle',            'off-cycle'),
  ('Offcycle',             'off-cycle'),
  ('Spring Insight',       'spring'),
  ('Spring Programme',     'spring'),
  ('Insight Day',          'insight'),
  ('Grad Scheme',          'graduate'),
  ('Graduate Programme',   'graduate')
) as v(alias, programme_slug)
join programmes p on p.slug = v.programme_slug;

-- Division aliases. These map to a canonical string rather than a foreign key,
-- because division is free text on roles - see the migration note in 001.
insert into aliases (kind, alias_norm, division_canon)
select 'division', normalise_name(v.alias), v.canon
from (values
  ('GCM',              'Global Capital Markets'),
  ('Capital Markets',  'Global Capital Markets'),
  ('IBD',              'Investment Banking'),
  ('IB',               'Investment Banking'),
  ('Investment Banking Division', 'Investment Banking'),
  ('M and A',          'M&A'),
  ('MNA',              'M&A'),
  ('Mergers and Acquisitions', 'M&A'),
  ('S&T',              'Sales & Trading'),
  ('Sales and Trading','Sales & Trading'),
  ('SWE',              'Software Engineering'),
  ('SDE',              'Software Engineering'),
  ('Software Dev',     'Software Engineering'),
  ('Software Engineer','Software Engineering'),
  ('QR',               'Quantitative Research'),
  ('Quant Research',   'Quantitative Research'),
  ('QT',               'Quantitative Trading'),
  ('Quant Trading',    'Quantitative Trading'),
  ('Quant Trader',     'Quantitative Trading'),
  ('AWM',              'Asset & Wealth Management'),
  ('GM',               'Global Markets'),
  ('LevFin',           'Markets LevFin'),
  ('Leveraged Finance','Markets LevFin'),
  ('PE',               'Private Equity'),
  ('RX',               'Restructuring'),
  ('Restruc',          'Restructuring'),
  ('ML',               'Machine Learning'),
  ('FDE',              'Forward Deployed Engineering')
) as v(alias, canon);


-- ============================================================================
-- Deliberately NOT seeded: Consulting
-- ============================================================================
--
-- McKinsey appears in the source chat and in the build brief's firm list, but
-- it is a consulting firm and `firms.category` only carries 'ib_markets' and
-- 'quant_swe' in v1. The spec's own scope rule wins over its example list: do
-- not launch a category with one firm in it, because a near-empty category
-- makes the whole site look dead.
--
-- To add consulting later: extend the category CHECK on firms, then uncomment.
--
-- insert into firms (slug, name, name_norm, category)
-- select slugify(name), name, normalise_name(name), 'consulting'
-- from (values
--   ('McKinsey & Company'), ('Bain & Company'), ('Boston Consulting Group'),
--   ('Oliver Wyman'), ('Kearney'), ('LEK Consulting')
-- ) as v(name);
