-- ============================================================================
-- Verification fixture. NEVER run this against production.
-- ============================================================================
--
-- 50 fake applications built to break things, spanning the edge cases in the
-- spec's verification step:
--
--   A. bank-of-america-global-capital-markets-london-summer-2027
--      24 applicants, above every threshold. The "normal" case, and the one
--      where the hand-computed numbers in scripts/verify.mjs are checked.
--      Includes a SKIPPED STAGE: some applicants go applied -> first_round
--      with no OA, because BofA does not always send one. Includes a person
--      who logged the same stage twice (waiting, then progressed) to exercise
--      `distinct on`. Includes two offers, which must never appear as a count.
--
--   B. optiver-software-engineering-amsterdam-summer-2027
--      9 applicants. Deliberately one BELOW the n >= 10 threshold, so every
--      breakdown must be suppressed while the free headline still works.
--
--   C. qatalyst-partners-m-a-london-summer-2027
--      1 applicant, who has an offer. The single-response case. If any route
--      exposes this person's offer, the site has failed its core anti-abuse
--      promise.
--
--   D. jane-street-quantitative-trading-london-summer-2027
--      12 applicants, ALL still waiting at 'applied'. Nothing has fired.
--      Exercises the "nothing logged yet" path at a healthy sample size.
--
--   E. evercore-m-a-london-summer-2027
--      4 applicants with deliberately dirty data: an event dated before the
--      application date (a typo), and applicants with no 'applied' event at
--      all (someone who found the site at the OA stage).
--
-- Dates are relative to current_date so the 7-day histogram window and the
-- 48-hour feed window are always exercised no matter when this is run.
-- ============================================================================

-- Deterministic uuids, so a failing assertion names a specific person.
create or replace function test_uid(n int) returns uuid
language sql immutable as $$
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- Helper: log one applicant's whole journey in one call.
create or replace function test_log(
  p_slug        text,
  p_person      int,
  p_applied_ago int,          -- days ago they applied
  p_stage       text,         -- stage they are currently at
  p_status      text,
  p_stage_ago   int,          -- days ago that stage happened
  p_hour        smallint default null
) returns void
language plpgsql as $$
declare
  v_role_id bigint;
  v_app_id  bigint;
begin
  select id into v_role_id from roles where slug = p_slug;
  if v_role_id is null then
    raise exception 'no such role: %', p_slug;
  end if;

  insert into applications (role_id, local_id, current_stage, current_status)
  values (v_role_id, test_uid(p_person), p_stage, p_status)
  on conflict (role_id, local_id) do update
    set current_stage = excluded.current_stage,
        current_status = excluded.current_status
  returning id into v_app_id;

  -- The 'applied' event. Skipped when p_applied_ago is null, which models
  -- somebody who found the site partway through and never logged applying.
  if p_applied_ago is not null then
    insert into events (application_id, role_id, stage, status, occurred_on)
    select v_app_id, v_role_id, 'applied', 'progressed',
           current_date - p_applied_ago
    where not exists (
      select 1 from events where application_id = v_app_id and stage = 'applied'
    );
  end if;

  if p_stage <> 'applied' then
    insert into events (application_id, role_id, stage, status,
                        occurred_on, occurred_hour)
    values (v_app_id, v_role_id, p_stage, p_status,
            current_date - p_stage_ago, p_hour);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- A. Bank of America GCM. 24 people, above every threshold.
-- ---------------------------------------------------------------------------
-- Composition, hand-counted so verify.mjs can assert against it:
--   24 applications total
--   12 have an OA event      -> selectivity oa = 12/24
--      (persons 11-18 waiting, 19-22 progressed; person 21 logged it twice)
--    6 have a video event    -> selectivity video = 6/24
--    3 have first_round      -> of which 2 SKIPPED the OA entirely, so a
--                              dense-ladder query would wrongly report 14 OAs
--    2 have an offer         -> selectivity offer = 2/24, never shown as count

do $$
declare i int;
begin
  -- 10 applicants who only ever applied and are still waiting.
  for i in 1..10 loop
    perform test_log('bank-of-america-global-capital-markets-london-summer-2027',
                     i, 30, 'applied', 'waiting', 30);
  end loop;

  -- 8 who got the OA and are waiting on it. Hours spread across a morning to
  -- give the hour histogram something real to show.
  for i in 11..18 loop
    perform test_log('bank-of-america-global-capital-markets-london-summer-2027',
                     i, 30, 'oa', 'waiting', 3, (8 + (i % 4))::smallint);
  end loop;

  -- 4 who got the OA and progressed. Two of these also logged a video.
  for i in 19..22 loop
    perform test_log('bank-of-america-global-capital-markets-london-summer-2027',
                     i, 30, 'oa', 'progressed', 5, 9::smallint);
  end loop;
end $$;

-- Two of the progressed group went on to a video interview.
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                19, 30, 'video', 'waiting', 2, 14::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                20, 30, 'video', 'progressed', 2, 15::smallint);

-- Person 21 logged the OA twice: waiting first, then progressed. Only the
-- later status should count in the funnel. This is what `distinct on` is for.
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                21, 30, 'oa', 'waiting', 6, 10::smallint);

-- SKIPPED STAGE: persons 23 and 24 went straight from applied to first round.
-- They must NOT be counted as having reached the OA.
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                23, 28, 'first_round', 'waiting', 4, 11::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                24, 28, 'first_round', 'progressed', 4, 11::smallint);

-- Person 20 reached first round too, then took an offer. Person 22 also has an
-- offer. Two offers on a 24-person role: a rate of 8.3%, never a count.
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                20, 30, 'first_round', 'progressed', 1, 10::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                20, 30, 'offer', 'progressed', 0, 16::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                22, 30, 'offer', 'progressed', 0, 16::smallint);

-- Also give persons 11..18 a video? No. Deliberately not: the video count must
-- stay at 6 (persons 19, 20, plus four below) to catch an off-by-one.
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                15, 30, 'video', 'waiting', 2, 13::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                16, 30, 'video', 'rejected', 2, 13::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                17, 30, 'video', 'waiting', 1, 9::smallint);
select test_log('bank-of-america-global-capital-markets-london-summer-2027',
                18, 30, 'video', 'waiting', 1, null);


-- ---------------------------------------------------------------------------
-- B. Optiver SWE Amsterdam. 9 people: one below the threshold.
-- ---------------------------------------------------------------------------

do $$
declare i int;
begin
  for i in 101..105 loop
    perform test_log('optiver-software-engineering-amsterdam-summer-2027',
                     i, 20, 'applied', 'waiting', 20);
  end loop;
  for i in 106..109 loop
    perform test_log('optiver-software-engineering-amsterdam-summer-2027',
                     i, 20, 'oa', 'waiting', 2, 10::smallint);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- C. Qatalyst M&A. One person, who has an offer.
-- ---------------------------------------------------------------------------
-- The single most dangerous row in the database. If any page, feed, API route
-- or headline reveals it, the anti-abuse design has failed.

select test_log('qatalyst-partners-m-a-london-summer-2027',
                201, 40, 'offer', 'progressed', 1, 12::smallint);


-- ---------------------------------------------------------------------------
-- D. Jane Street QT. 12 people, all waiting at 'applied'. Nothing has fired.
-- ---------------------------------------------------------------------------

do $$
declare i int;
begin
  for i in 301..312 loop
    perform test_log('jane-street-quantitative-trading-london-summer-2027',
                     i, 15, 'applied', 'waiting', 15);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- E. Evercore M&A. Dirty data.
-- ---------------------------------------------------------------------------

-- Two people who never logged applying - they found the site at the OA stage.
-- They must still count in the denominator, but contribute no median gap.
select test_log('evercore-m-a-london-summer-2027', 401, null, 'oa', 'waiting', 3, 9::smallint);
select test_log('evercore-m-a-london-summer-2027', 402, null, 'oa', 'waiting', 3, 9::smallint);

-- A normal one.
select test_log('evercore-m-a-london-summer-2027', 403, 20, 'oa', 'waiting', 5, 9::smallint);

-- A typo: applied 10 days ago, but claims the OA arrived 20 days ago. The
-- median-gap query must drop this rather than let a negative gap in.
select test_log('evercore-m-a-london-summer-2027', 404, 10, 'oa', 'waiting', 20, 9::smallint);

drop function test_log(text, int, int, text, text, int, smallint);
drop function test_uid(int);
