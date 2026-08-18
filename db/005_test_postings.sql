-- Demo/verification postings. Dev only, never production.
-- Requires 004. Loaded by `npm run db:local:fixture` and by the verify pass.
--
-- Four rows, each testing one thing:
--   25 min ago, open    -> appears in every window
--   190 min ago, open   -> appears in the 72h window, not the 1h one
--   6000 min ago, open  -> 100 hours, OUTSIDE the 72h window. Exercises the
--                          window boundary, which nothing else here does.
--   4000 min ago, CLOSED-> must never appear, however wide the window.

insert into postings
  (source_id, external_id, url, title, title_norm, location_raw, location_norm,
   cycle_guess, division_guess, first_seen_at, last_seen_at, closed_at,
   is_baseline)
select s.id, v.ext, v.url, v.title, normalise_name(v.title),
       v.loc, normalise_name(v.loc), v.cycle, v.division,
       now() - make_interval(mins => v.mins),
       now() - make_interval(mins => v.seen),
       case when v.closed then now() - interval '2 hours' end,
       false   -- these are genuine openings, not first-sighting baseline
from (values
  ('citi',      '/job/London/IBD-Summer-Analyst-2027', 'https://example.invalid/1',
   'Banking - Investment Banking, Summer Analyst, London - EMEA, 2027',
   'London  United Kingdom', 'Summer 2027', 'Investment Banking', 25,  0, false),
  ('citi',      '/job/London/Markets-Summer-Analyst-2027', 'https://example.invalid/2',
   'Markets - Sales and Trading, Summer Analyst, London - EMEA, 2027',
   'London  United Kingdom', 'Summer 2027', 'Sales and Trading', 190, 0, false),
  ('ms',        '/job/London/MS-IBD-Summer-2027', 'https://example.invalid/3',
   'Investment Banking Summer Analyst Programme - London - 2027',
   'London  United Kingdom', 'Summer 2027', 'Investment Banking', 6000, 0, false),
  ('santander', '/job/London/Closed-Role', 'https://example.invalid/4',
   'Corporate & Investment Banking Summer Internship 2027 - London',
   'London  United Kingdom', 'Summer 2027', 'Corporate & Investment Banking', 4000, 4000, true)
) as v(tenant, ext, url, title, loc, cycle, division, mins, seen, closed)
join sources s on s.tenant = v.tenant;
