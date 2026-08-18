-- ============================================================================
-- Stagewatch: asset management as a function, firm tier as a separate axis
-- ============================================================================
--
-- TWO DIFFERENT THINGS, DELIBERATELY NOT MERGED INTO ONE LIST.
--
--   category (on the ROLE)  = what the job is.
--                             ib_markets, asset_management, quant, swe, data_ai
--   tier     (on the FIRM)  = what kind of firm it is.
--                             bulge_bracket, elite_boutique, middle_market,
--                             buyside, prop_quant, tech
--
-- Collapsing these into a single enum would have been simpler and wrong. A
-- "bulge bracket" filter that lived in the category list would make Goldman
-- IBD and Evercore IBD different KINDS OF JOB, which they are not - they are
-- the same job at different tiers of firm. Keeping them apart is what lets the
-- site answer "has the OA fired for bulge bracket IBD" and "has it fired for
-- boutique IBD" as separate questions, which is how applicants actually think.
-- ============================================================================

alter table roles drop constraint if exists roles_category_check;
alter table roles add constraint roles_category_check
  check (category in ('ib_markets', 'asset_management', 'quant', 'swe', 'data_ai'));

alter table postings drop constraint if exists postings_category_check;
alter table postings add constraint postings_category_check
  check (category in ('ib_markets', 'asset_management', 'quant', 'swe', 'data_ai'));

alter table firms
  add column if not exists tier text
    check (tier in ('bulge_bracket', 'elite_boutique', 'middle_market',
                    'buyside', 'prop_quant', 'tech'));

-- Asset and wealth management, pulled out of the ib_markets bucket it was
-- hiding in. Tested before nothing else because "Asset & Wealth Management"
-- contains no word the other rules look for.
update roles set category = 'asset_management'
where division_norm ~ '(asset management|wealth management|investment management|private bank)';

update firms set tier = v.tier
from (values
  ('goldman-sachs','bulge_bracket'), ('morgan-stanley','bulge_bracket'),
  ('j-p-morgan','bulge_bracket'),    ('bank-of-america','bulge_bracket'),
  ('citi','bulge_bracket'),          ('barclays','bulge_bracket'),
  ('ubs','bulge_bracket'),           ('deutsche-bank','bulge_bracket'),
  ('hsbc','bulge_bracket'),          ('bnp-paribas','bulge_bracket'),

  ('evercore','elite_boutique'),     ('centerview-partners','elite_boutique'),
  ('qatalyst-partners','elite_boutique'), ('moelis-company','elite_boutique'),
  ('pjt-partners','elite_boutique'), ('perella-weinberg-partners','elite_boutique'),
  ('lazard','elite_boutique'),       ('rothschild-co','elite_boutique'),

  ('jefferies','middle_market'),     ('houlihan-lokey','middle_market'),
  ('rbc-capital-markets','middle_market'), ('nomura','middle_market'),
  ('mizuho','middle_market'),        ('macquarie','middle_market'),
  ('santander','middle_market'),     ('standard-chartered','middle_market'),

  ('blackstone','buyside'),          ('kkr','buyside'),

  ('jane-street','prop_quant'),      ('optiver','prop_quant'),
  ('imc-trading','prop_quant'),      ('flow-traders','prop_quant'),
  ('susquehanna-international-group','prop_quant'), ('citadel','prop_quant'),
  ('citadel-securities','prop_quant'), ('jump-trading','prop_quant'),
  ('drw','prop_quant'),              ('hudson-river-trading','prop_quant'),
  ('xtx-markets','prop_quant'),      ('maven-securities','prop_quant'),
  ('two-sigma','prop_quant'),        ('g-research','prop_quant'),
  ('marshall-wace','prop_quant'),    ('squarepoint-capital','prop_quant'),
  ('man-group','prop_quant'),        ('millennium','prop_quant'),
  ('point72','prop_quant'),          ('qube-research-technologies','prop_quant'),

  ('bloomberg','tech'),              ('palantir','tech')
) as v(slug, tier)
where firms.slug = v.slug;

create index if not exists firms_tier_idx on firms (tier);
