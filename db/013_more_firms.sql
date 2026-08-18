-- ============================================================================
-- Stagewatch: firms and a category the source chat asked for, migration 013
-- ============================================================================
--
-- ADDITIVE. Every firm below was named in the source group chat and was absent
-- from the seed, which was written from the build brief rather than from what
-- people actually apply to.
--
-- CONSULTING REVERSES AN EARLIER DECISION, on the spec's own rule.
--
-- The seed deliberately omitted consulting, citing "add a category when two
-- people ask". In five days of chat, McKinsey, Bain, BCG and "MBB" come up
-- five or more times, with real answers ("mckinsey opens on 1st September",
-- "Bain is open year round for some of the European offices but don't think
-- that's the case for London"). The rule has been met several times over, so
-- the omission is now the thing that makes the site look incomplete.
-- ============================================================================

alter table firms drop constraint if exists firms_category_check;
alter table firms add constraint firms_category_check
  check (category in ('ib_markets', 'quant_swe', 'quant', 'swe', 'data_ai',
                      'asset_management', 'consulting'));

alter table roles drop constraint if exists roles_category_check;
alter table roles add constraint roles_category_check
  check (category in ('ib_markets', 'asset_management', 'quant', 'swe',
                      'data_ai', 'consulting'));

alter table postings drop constraint if exists postings_category_check;
alter table postings add constraint postings_category_check
  check (category in ('ib_markets', 'asset_management', 'quant', 'swe',
                      'data_ai', 'consulting'));

alter table firms drop constraint if exists firms_tier_check;
alter table firms add constraint firms_tier_check
  check (tier in ('bulge_bracket', 'elite_boutique', 'middle_market',
                  'buyside', 'prop_quant', 'tech', 'consulting'));

insert into firms (slug, name, name_norm, category, tier)
select slugify(v.name), v.name, normalise_name(v.name), v.category, v.tier
from (values
  -- Named in the chat, missing from the seed.
  ('BlackRock',                    'asset_management', 'buyside'),
  ('SMBC',                         'ib_markets',       'middle_market'),
  ('BTG Pactual',                  'ib_markets',       'middle_market'),
  ('Castleton Commodities',        'quant',            'prop_quant'),
  ('EDF Trading',                  'quant',            'prop_quant'),
  ('Five Rings',                   'quant',            'prop_quant'),
  -- Consulting, per the two-people-asked rule.
  ('McKinsey & Company',           'consulting',       'consulting'),
  ('Bain & Company',               'consulting',       'consulting'),
  ('Boston Consulting Group',      'consulting',       'consulting'),
  ('Oliver Wyman',                 'consulting',       'consulting'),
  ('Kearney',                      'consulting',       'consulting')
) as v(name, category, tier)
on conflict (name_norm) do nothing;

insert into roles
  (firm_id, programme_id, division, division_norm, location, location_norm,
   cycle, slug, category)
select f.id, p.id, v.division, normalise_name(v.division),
       'London', normalise_name('London'), 'Summer 2027',
       f.slug || '-' || slugify(v.division) || '-london-summer-2027',
       v.category
from (values
  ('blackrock',               'Investment Management',        'asset_management'),
  ('blackrock',               'Aladdin Engineering',          'swe'),
  ('smbc',                    'Corporate & Investment Banking','ib_markets'),
  ('btg-pactual',             'Investment Banking',           'ib_markets'),
  ('castleton-commodities',   'Commodities Trading',          'quant'),
  ('edf-trading',             'Trading',                      'quant'),
  ('five-rings',              'Quantitative Trading',         'quant'),
  ('five-rings',              'Software Engineering',         'swe'),
  ('mckinsey-company',        'Business Analyst',             'consulting'),
  ('bain-company',            'Associate Consultant',         'consulting'),
  ('boston-consulting-group', 'Associate',                    'consulting'),
  ('oliver-wyman',            'Consulting',                   'consulting'),
  ('kearney',                 'Consulting',                   'consulting')
) as v(firm_slug, division, category)
join firms f      on f.slug = v.firm_slug
join programmes p on p.slug = 'summer'
on conflict (firm_id, programme_id, division_norm, location_norm, cycle)
  do nothing;

-- Aliases for the abbreviations people actually type.
insert into aliases (kind, alias_norm, firm_id)
select 'firm', normalise_name(v.alias), f.id
from (values
  ('BLK',   'blackrock'),
  ('Black Rock', 'blackrock'),
  ('Sumitomo Mitsui', 'smbc'),
  ('BTG',   'btg-pactual'),
  ('CCI',   'castleton-commodities'),
  ('Castleton', 'castleton-commodities'),
  ('5R',    'five-rings'),
  ('Five Rings Capital', 'five-rings'),
  ('Mck',   'mckinsey-company'),
  ('McKinsey', 'mckinsey-company'),
  ('Bain',  'bain-company'),
  ('BCG',   'boston-consulting-group'),
  ('OW',    'oliver-wyman')
) as v(alias, firm_slug)
join firms f on f.slug = v.firm_slug
on conflict (kind, alias_norm) do nothing;
