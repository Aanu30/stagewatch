// ============================================================================
// Every read query in the app, as plain SQL. No imports, no side effects.
// ============================================================================
//
// Kept in its own module with nothing else in it so that scripts/verify.mjs can
// import these strings and run them against a real Postgres without pulling in
// the database client, and therefore without needing DATABASE_URL.
//
// That is the whole point: the verification pass executes character-for-
// character what production executes. A test that checks a re-typed copy of a
// query proves nothing about the query.
//
// Each constant is runnable as-is in the Supabase SQL editor once you swap the
// $1/$2 placeholders by hand.
//
// Two rules hold throughout, both consequences of the ladder being ORDERED BUT
// SPARSE (firms skip stages constantly):
//
//   1. "Reached stage S" always means "has an event at stage S". Never
//      "current_stage is at or beyond S" - that would silently assume the
//      ladder is dense, and credit somebody at first round with an OA the firm
//      never sent.
//
//   2. Stage lists always start FROM the `stages` table and LEFT JOIN the data
//      in. Starting from `events` drops any stage nobody reached, and "nobody
//      has logged an OA here" is one of the most useful answers the site gives.

export const ROLE_BY_SLUG_SQL = `
select r.id,
       r.slug,
       r.division,
       r.location,
       r.cycle,
       f.name  as firm_name,
       f.slug  as firm_slug,
       f.category,
       p.name  as programme_name,
       p.slug  as programme_slug
from roles r
join firms f      on f.id = r.firm_id
join programmes p on p.id = r.programme_id
where r.slug = $1
`;

export const ROLE_TOTAL_SQL = `
select count(*)::int as n
from applications
where role_id = $1
`;

// 'applied' is excluded because applying is the user's own action, not the
// firm firing something. "Someone applied 3 hours ago" is not news.
//
// 'offer' is excluded because this headline is ungated and unsuppressed. A
// headline reading "Offer - most recent 3 hours ago" on a role with two
// loggers is an individual offer claim wearing a timestamp. Offers surface in
// exactly one place in this app: as a rate, gated, above MIN_N.
//
// fired_at is non-null only when the user actually knew the hour. That is the
// payoff for occurred_hour being nullable: the UI says "3 hours ago" when it
// genuinely knows and "earlier today" when it does not, rather than inventing
// a midnight that never happened.
export const HEADLINE_SQL = `
select e.stage,
       st.label as stage_label,
       e.occurred_on,
       e.occurred_hour,
       e.logged_at,
       case
         when e.occurred_hour is not null
         then (e.occurred_on + make_interval(hours => e.occurred_hour))
                at time zone 'Europe/London'
       end as fired_at
from events e
join stages st on st.code = e.stage
where e.role_id = $1
  and e.stage not in ('applied', 'offer')
order by e.occurred_on desc,
         e.occurred_hour desc nulls last,
         e.logged_at desc
limit 1
`;

export const STAGE_ACTIVITY_SQL = `
select st.code,
       st.label,
       st.sort_order,
       count(distinct e.application_id)::int as people,
       max(e.occurred_on)                    as last_on,
       max(case
             when e.occurred_hour is not null
             then (e.occurred_on + make_interval(hours => e.occurred_hour))
                    at time zone 'Europe/London'
           end)                              as last_fired_at
from stages st
left join events e
       on e.stage = st.code
      and e.role_id = $1
group by st.code, st.label, st.sort_order
order by st.sort_order
`;

// The denominator is every application on the role, not "people with an
// 'applied' event". You cannot reach an OA without having applied, so counting
// applications is both simpler and a larger, safer denominator. Restricted to
// people who explicitly logged 'applied', anyone who joined the site at the OA
// stage would be missing from the bottom of the funnel and every rate above
// would read too high.
export const SELECTIVITY_SQL = `
with total as (
  select count(*)::int as n
  from applications
  where role_id = $1
)
select st.code,
       st.label,
       st.sort_order,
       (select n from total)                 as denominator,
       count(distinct e.application_id)::int as reached
from stages st
left join events e
       on e.stage = st.code
      and e.role_id = $1
where st.sort_order > 1
group by st.code, st.label, st.sort_order
order by st.sort_order
`;

// `distinct on` is Postgres-specific and exactly right here. One person can log
// the same stage twice - "waiting" on Tuesday, "progressed" on Friday - and
// only the latest is their current state at that stage. The ORDER BY inside
// the CTE picks it: sort by application and stage, newest first, and
// `distinct on` keeps the first row of each group.
//
// The tiebreak on `id desc` matters. Two events logged in the same millisecond
// would otherwise return either row at random, making the funnel flicker
// between page loads for no visible reason.
export const FUNNEL_SQL = `
with latest as (
  select distinct on (application_id, stage)
         application_id,
         stage,
         status
  from events
  where role_id = $1
  order by application_id, stage, logged_at desc, id desc
)
select st.code,
       st.label,
       st.sort_order,
       count(l.application_id)::int                          as total,
       count(*) filter (where l.status = 'waiting')::int      as waiting,
       count(*) filter (where l.status = 'progressed')::int   as progressed,
       count(*) filter (where l.status = 'rejected')::int     as rejected,
       count(*) filter (where l.status = 'withdrew')::int     as withdrew
from stages st
left join latest l on l.stage = st.code
group by st.code, st.label, st.sort_order
order by st.sort_order
`;

// Measured from 'applied' to each later stage, rather than between adjacent
// rungs. Deliberate: adjacent-rung gaps break on the sparse ladder, because a
// firm that skips the OA has no OA -> video gap and the row vanishes.
// Applied -> video still computes for everyone.
//
// `f.on_date >= a.on_date` drops rows where somebody logged a later stage as
// happening before they applied. That is a typo, not a signal, and one left in
// will drag a median negative.
export const MEDIAN_GAPS_SQL = `
with firsts as (
  select application_id,
         stage,
         min(occurred_on) as on_date
  from events
  where role_id = $1
  group by application_id, stage
),
applied as (
  select application_id, on_date
  from firsts
  where stage = 'applied'
)
select st.code,
       st.label,
       st.sort_order,
       count(*)::int as n,
       percentile_cont(0.5) within group (order by (f.on_date - a.on_date))
         as median_days
from stages st
join firsts  f on f.stage = st.code
join applied a on a.application_id = f.application_id
where st.sort_order > 1
  and f.on_date >= a.on_date
group by st.code, st.label, st.sort_order
order by st.sort_order
`;

// Two separate queries on purpose. The day view uses every event. The hour view
// uses only events where the user knew the hour, and therefore carries its own,
// smaller n - which the UI must print, because "sending gradually from 9am"
// based on four people who happened to remember the time is not a finding.
export const TIMING_BY_DAY_SQL = `
select e.occurred_on,
       count(*)::int as n
from events e
where e.role_id = $1
  and e.stage = $2
  and e.occurred_on >= current_date - 7
group by e.occurred_on
order by e.occurred_on
`;

export const TIMING_BY_HOUR_SQL = `
select e.occurred_hour,
       count(*)::int as n
from events e
where e.role_id = $1
  and e.stage = $2
  and e.occurred_hour is not null
  and e.occurred_on >= current_date - 7
group by e.occurred_hour
order by e.occurred_hour
`;

// Aggregated by role and stage rather than listed as individual events. Two
// reasons, one of them a hard safety requirement:
//
//   * 'offer' is excluded outright. A feed row reading "Jane Street - Offer -
//     2 hours ago" IS an individual offer claim, which the spec forbids
//     displaying under any circumstances. Excluding the stage in SQL is the
//     cheapest possible enforcement: there is no filter to get wrong later,
//     because the rows never leave the database.
//
//   * 'applied' is excluded because applying is the user's own action.
//
// Aggregating also makes the feed denser: "12 people logged the OA, most
// recent 20 minutes ago" beats twelve near-identical lines.
export const FIRED_FEED_SQL = `
select r.slug                                as role_slug,
       f.name                                as firm_name,
       f.category,
       p.name                                as programme_name,
       r.division,
       r.location,
       r.cycle,
       e.stage,
       st.label                              as stage_label,
       count(distinct e.application_id)::int as people,
       max(e.occurred_on)                    as last_on,
       max(case
             when e.occurred_hour is not null
             then (e.occurred_on + make_interval(hours => e.occurred_hour))
                    at time zone 'Europe/London'
           end)                              as last_fired_at,
       max(e.logged_at)                      as last_logged_at
from events e
join roles      r  on r.id = e.role_id
join firms      f  on f.id = r.firm_id
join programmes p  on p.id = r.programme_id
join stages     st on st.code = e.stage
where e.stage not in ('applied', 'offer')
  and e.logged_at >= now() - make_interval(hours => $1::int)
  and ($2::text is null or f.category = $2::text)
group by r.slug, f.name, f.category, p.name,
         r.division, r.location, r.cycle, e.stage, st.label
order by max(e.logged_at) desc
limit 100
`;

// Needed because the feed only shows roles where something has already fired,
// and on day one that is none of them.
export const SEARCH_ROLES_SQL = `
select r.slug,
       f.name as firm_name,
       f.category,
       p.name as programme_name,
       r.division,
       r.location,
       r.cycle,
       (select count(*)::int from applications a where a.role_id = r.id) as logged
from roles r
join firms f      on f.id = r.firm_id
join programmes p on p.id = r.programme_id
where ($1::text is null or f.category = $1::text)
  and (
    $2::text is null
    or f.name_norm     like '%' || $2::text || '%'
    or r.division_norm like '%' || $2::text || '%'
    or r.location_norm like '%' || $2::text || '%'
  )
order by f.name, p.name, r.division, r.location
limit 300
`;

export const HAS_LOGGED_SQL = `
select 1 as ok
from applications
where role_id = $1
  and local_id = $2::uuid
limit 1
`;

export const COUNT_BY_LOCAL_SQL = `
select count(*)::int as n
from applications
where local_id = $1::uuid
  and created_at >= now() - interval '24 hours'
`;

export const COUNT_BY_IP_SQL = `
select count(*)::int as n
from applications
where ip_hash = $1
  and created_at >= now() - interval '24 hours'
`;

export const COUNT_MERGE_BY_LOCAL_SQL = `
select count(*)::int as n
from merge_queue
where submitted_by = $1::uuid
  and created_at >= now() - interval '24 hours'
`;
