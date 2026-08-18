-- ============================================================================
-- Stagewatch: split quant / SWE / data-AI, and move category to the role
-- ============================================================================
--
-- TWO CHANGES, THE SECOND MORE IMPORTANT THAN THE FIRST.
--
-- 1. `quant_swe` becomes three: quant, swe, data_ai. Lumping them together
--    was always wrong for this product - somebody asking "has the Optiver SWE
--    OA fired" does not care about the quant trading OA, and the two fire
--    weeks apart.
--
-- 2. Category moves from `firms` to `roles`, which is where it belongs.
--    Optiver runs quant trading AND software engineering. Jane Street runs
--    quant trading, software engineering and quantitative research. A label on
--    the firm cannot express that, so filtering by it put SWE roles under a
--    quant filter and vice versa. The unit of record is the role; so is the
--    category.
--
-- `firms.category` is kept as a coarse descriptor - it is still the sensible
-- default when a brand-new firm arrives through the merge queue with one role
-- - but nothing filters on it any more.
-- ============================================================================

alter table firms drop constraint if exists firms_category_check;
alter table firms add constraint firms_category_check
  check (category in ('ib_markets', 'quant_swe', 'quant', 'swe', 'data_ai'));

alter table roles
  add column if not exists category text
    check (category in ('ib_markets', 'quant', 'swe', 'data_ai'));

alter table postings
  add column if not exists category text
    check (category in ('ib_markets', 'quant', 'swe', 'data_ai'));

-- Backfill from the division, which is the only place the information lives.
-- Order matters: "Machine Learning" must be tested before "Research", and
-- "Trading Infrastructure" is engineering rather than trading.
update roles set category = case
  when division_norm ~ '(machine learning|data science|artificial intelligence|\mai\M|deep learning)'
    then 'data_ai'
  when division_norm ~ '(software|engineering|technology|developer|infrastructure|forward deployed)'
    then 'swe'
  when division_norm ~ '(quantitative|quant|systematic|algorithm|trading|markets levfin)'
    then 'quant'
  else null
end
where category is null;

-- Anything the division did not settle falls back to the firm's coarse label.
-- For the IB list that is right; for the few quant firms it lands on 'quant',
-- which is the better guess than 'ib_markets' for a firm like Millennium.
update roles r set category = case
  when f.category = 'ib_markets' then 'ib_markets'
  else 'quant'
end
from firms f
where f.id = r.firm_id and r.category is null;

alter table roles alter column category set not null;

create index if not exists roles_category_idx on roles (category);
create index if not exists postings_category_idx on postings (category);
