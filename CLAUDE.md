@AGENTS.md

# Stagewatch

Crowdsourced, real-time tracker for UK summer internship application stages.

Answers the two questions that dominate applicant group chats:

1. **Has this thing fired yet?** ("are hvs out already?", "anyone recieve optiver swe oa?")
2. **Was it selective, or did everyone get it?** — this one is the product. Nobody in a
   group chat can answer it, because it needs an aggregated denominator.

**Not** a deadline aggregator. The-trackr, Intervyo and Bright Network already do that.
This is applicant-side signal, not firm-side listings.

---

## Working conventions (non-negotiable)

- **UK English** everywhere: copy, comments, commit messages. "organise", "programme",
  "centre", "analyse".
- **No classes.** Plain functions. React function components and hooks only. If a class is
  genuinely unavoidable, it gets a comment explaining why.
- **No ORM.** Raw SQL only, so the queries stay legible and Aarin learns them.
- Direct, no preamble, no filler. Say when something is wrong.

### Division of labour — SUPERSEDED 17 Aug 2026

The original brief reserved three parts for Aarin as guided exercises: the schema, the
submission handler and the aggregation queries. **On 17 August 2026 he explicitly
overrode that** ("just make the full website") and Claude wrote all of it.

That trade was flagged before it was taken, and it is worth knowing what was given up:
those three were the parts an interviewer would probe, and the reason for building this
rather than buying it. The teaching comments were left in `db/001_schema.sql`,
`lib/sql.ts` and `lib/submit.ts`, so each can still be read as the walkthrough it was
meant to be, and re-derived on request.

If he asks to learn a piece rather than change it, revert to the original mode: explain
the goal, show a worked example, let him write it, review what he produces.

### Task discipline

Small bounded tasks with a clear start, end and method. One at a time. Stop and report
after each before starting the next. No open-ended work.

---

## Tech stack

- **Next.js 16.3.1** (App Router), React 19.2.8, TypeScript
- **Postgres via Supabase** free tier — chosen partly for the table UI, since Aarin is new
  to databases and wants to inspect rows directly
- **Vercel** free tier for hosting — live at <https://stagewatch-green.vercel.app>
  (Vercel project `stagewatch` under scope `aanu30s-projects`; the plain
  `stagewatch.vercel.app` subdomain was already taken by someone else)
- **GitHub**: <https://github.com/Aanu30/stagewatch>, public, pushed 19 Aug 2026. This is
  what `.github/workflows/poll.yml` runs against — no remote, no scheduled poller.
- **Plain CSS**, single `app/globals.css`, no Tailwind, no CSS modules. Reason: one
  vocabulary to remember when debugging alone in November.
- No auth provider. No ORM.

**Next.js 16 has breaking changes vs. older training data.** Read
`node_modules/next/dist/docs/` before writing route handlers, params handling, or caching
code. `params` and `searchParams` are Promises now.

### Environment

Node is installed userland at `~/.local/node`, symlinked into `~/.local/bin` (already on
PATH). No Homebrew on this machine, no sudo available to Claude.

Repo lives at `~/Projects/stagewatch` — deliberately **outside** iCloud Drive.
`node_modules` inside `~/Library/Mobile Documents` gets synced and evicted by iCloud and
breaks builds with confusing ENOENT errors.

### Database conventions

- Migrations are plain numbered SQL files in `db/` (`001_schema.sql`, `002_seed.sql`, …),
  run by hand in the Supabase SQL editor. No migration tool — Aarin should watch the SQL
  execute and the tables appear.
- Postgres client is **`postgres`** (porsager), not `pg`.
- **Reads do not use tagged templates.** Every read query is a plain SQL string constant
  in `lib/sql.ts` with `$1`/`$2` placeholders, executed via `query()` in `lib/db.ts`,
  which calls `sql.unsafe(text, params)`. Two reasons: the strings paste straight into
  the Supabase SQL editor for experimenting, and `scripts/verify.mjs` imports and runs
  the *same* strings, so the tests exercise production SQL rather than a re-typed copy.
  `.unsafe(text, params)` still binds parameters properly — "unsafe" refers to the SQL
  text being dynamic. Every string is a module-level constant, never built from input.
- Writes (`lib/submit.ts`, `lib/admin.ts`) use `sql.unsafe(...)` inside `sql.begin(...)`
  transactions, for the same single-source-of-SQL reason.
- `prepare: false` is mandatory — Supabase's transaction pooler hands each query a
  different backend, so prepared statements vanish between calls.
- `timestamptz` never `timestamp`. `text` never `varchar(n)`.
- `text` + `CHECK (x IN (...))` rather than Postgres enums — adding a stage later is a
  one-line `ALTER`.
- `*_norm` columns hold the normalised twin of the column beside them (lowercased,
  punctuation and corporate suffixes stripped, whitespace collapsed). **Uniqueness is
  enforced on the `_norm` column**, since that is the one that catches `BofA ` and `bofa`.
- All times are Europe/London.
- An 8th table beyond the spec's list: **`stages`** (6 rows, `code`/`label`/`sort_order`).
  It earns its place because the funnel must show stages with *zero* rows, which is a
  clean `LEFT JOIN` off this table and a hand-written `VALUES` list without it.

### Connection string — LIVE as of 18 Aug 2026

Supabase project `qzvykmzvsuvpdjmlkuyj`, region **eu-west-1**, Postgres 17.6.
Connected via the **transaction pooler**, `aws-1-eu-west-1.pooler.supabase.com:6543`.
Not the direct connection — that is IPv6-only on the free tier and Vercel cannot reach it.
(The pooler host itself resolves to IPv4, so the "enable IPv4 add-on" upsell in the
Supabase panel does not apply and should not be bought.)

Applied in production: `001`, `002`, `004`, `006`–`013` (every migration except the two
fixtures). **Never** `003_test_fixture.sql` or `005_test_postings.sql` — invented data.
`npm run migrate` lists the safe files explicitly, so there is no path by which fixtures
reach a real database.

Production env vars are set in Vercel as **Sensitive**, which means they cannot be read
back — only overwritten. The admin password is in `.env.local` if it is ever lost.

### Application-open detection

`db/004_sources.sql`, `lib/ats.ts`, `lib/postings.ts`, `scripts/poll.ts`.

Polls the firms' own Workday/Greenhouse endpoints, which are public and need no API key.
Detection is by **diffing** — Workday reports `postedOn` as "Posted 26 Days Ago", capped
at "30+ Days Ago", so an exact time is not available. A posting absent from the last poll
is a posting that just opened.

**It cannot backfill.** Only openings after the poller starts are ever caught.

**After changing a relevance filter in `lib/postings.ts`, run
`npm run poll:rebaseline` once.** Widening a filter makes previously-invisible
postings appear, which from inside a diff is indistinguishable from the firm having
just opened them. This is not hypothetical: teaching `isInScope()` to read the job
title (Barclays reports location as "Canary Wharf, 1 Churchill Place", naming no
city) made four long-live London internships report as newly opened. Losing one
genuine notification is far cheaper than publishing four false ones.

Firm-side postings are kept strictly out of `events`, which requires an `application_id`.
A firm opening a posting has no applicant, and forcing it in would mean a nullable FK
breaking every distinct-applicant count, or a fake application poisoning every
denominator.

**Sources are data, not code.** Adding a firm is an INSERT — no deploy. 18 sources live
as of 29 Aug 2026: Workday (Citi, Morgan Stanley, Santander, Barclays, PJT, Moelis,
Mizuho), Greenhouse (Jane Street, IMC, Flow Traders, Jump Trading, Squarepoint, Man
Group, Point72, XTX, BTG Pactual, Five Rings), Lever (Palantir).

**A responding endpoint is not a valid source — open it and read it first.** Probing
rejected four of eleven candidates on 29 Aug: `bcg` on Greenhouse is somebody's test
board ("Test Job Live", Bronx/Tampa), `oliverwyman` on Lever is a different company in
San Francisco, BofA's `ghr/Lateral-US` is real but returns zero campus roles, and
`hrttalentcommunity` is three placeholder rows. A wrong board silently fills the feed
with another company's jobs; a source that can never fire looks healthy because
`last_error` stays clean.
Workday tenant ids are not derivable by probing — the three above were found by guessing,
seventeen others were not — so new Workday sources must be read off the firm's careers
page. Greenhouse/Lever/Ashby/SmartRecruiters key off a plain company slug and *are*
discoverable by probing name variants.

**Scheduling is live.** Repo is public at github.com/Aanu30/stagewatch. `.github/
workflows/poll.yml` runs on a 30-minute cron via GitHub Actions, `DATABASE_URL` set as a
repo secret. Confirmed working end to end on 19 Aug — a manual trigger caught a genuine
new Citi posting. `gh` is authenticated as `Aanu30`.

### Commands

```
npm run dev               # uses DATABASE_URL from .env.local (points at Supabase)
npm run migrate           # applies 001, 002, 004 to DATABASE_URL
npm run poll              # one polling pass
npm run poll:dry          # fetch and report, write nothing
npm run poll:rebaseline   # after ANY filter change - see below
npm run verify            # 114 assertions against a real Postgres (PGlite), no setup
npm run db:local          # runs Postgres in-process on 127.0.0.1:5433, schema + seed
npm run db:local:fixture  # same, plus 50 fake applications for manual poking
npm run build
npm run lint
```

`npm run verify` needs no database and no network. It boots PGlite (real Postgres
compiled to WASM), applies `db/*.sql`, and executes the exact SQL strings from
`lib/sql.ts` — so what is verified is character-for-character what production runs.

Without `DATABASE_URL` every page renders `components/SetupNotice.tsx` instead of
throwing. With `DEMO_MODE=1` and no `DATABASE_URL`, the app runs on in-process PGlite so
the deployment is browsable without Supabase — no longer used in production, kept for
preview deployments.

**Local work now hits production.** `.env.local` points at Supabase. To test against a
throwaway database instead, run `npm run db:local:fixture` and override on the command
line: `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run dev`.

### Secrets

`.env*` is gitignored (`.gitignore:34`). The Supabase connection string goes in
`.env.local` as `DATABASE_URL` and in Vercel's env vars. **Never commit it.** Never write
it into any file that is not `.env.local`.

---

## The core mechanic

**To see aggregate numbers on a role, you must first log your own status on that role.**

This works because logging is what people already want to do — "I applied to Evercore M&A
and have heard nothing" is the thing they post anyway. One click. Nobody has to admit a
rejection.

Result: a complete denominator at every stage, so selectivity is computable.

**The gate is soft, not hard.** A cold visitor sees the headline free:

> "OA has fired for this role — most recent 3 hours ago."

Unlocking percentages and the timing histogram requires logging a status. Enough to prove
the site is worth something before asking for anything.

---

## Data model

### Unit of record

Not the firm. The composite key:

```
firm × programme × division/role × location × cycle
```

**This is the most important decision in the spec.** In the source group chat, six times
in five hours someone posted a signal that was useless until another person asked "which
role?". BofA GCM ≠ BofA Global IBD ≠ BofA Markets LevFin. UBS Summer ≠ UBS Off-cycle ≠
UBS Private Banking.

### Stages (ordered, sparse)

1. `applied`
2. `oa` — online assessment
3. `video` — video interview / HireVue
4. `first_round` — first round / phone screen
5. `assessment_centre` — AC / superday / final round
6. `offer`

Firms skip stages. **The ladder is ordered but sparse.** Never assume stage *n* implies
stage *n−1* was logged.

### Status per stage

Every application carries a status **per stage**, not one overall status:

- `waiting` — reached this stage, no outcome yet
- `progressed` — moved to the next stage
- `rejected` — rejected at this stage
- `withdrew` — self-withdrawn (kept in the schema and the funnel; **removed from the
  submission form** — zero mentions in five days of the source chat, and every extra
  option costs submissions at the one place friction directly shrinks the denominator)

`waiting` existing at every stage is what makes the funnel computable **without anyone
ever logging a rejection**. It is the rejection-equivalent data point people will actually
submit.

### Event log

Append-only, alongside current state:

```
(application_id, stage, status, occurred_at, logged_at)
```

`occurred_at` captures date **and hour where known**. Originally justified by an
hour-of-day histogram; that chart was removed (nobody in the source chat asks "are they
sending gradually?" — see Build order, step 13), but the hour is still captured and still
earns its place: it is what lets the free headline say "3 hours ago" instead of just
"today". Hour is optional so it never blocks a submission.

### Identity

Anonymous. Random ID generated client-side, stored in `localStorage`. No accounts, no
email, no verification.

Used for: the "my applications" view (v2), letting people update their own rows, and rate
limiting. **Never displayed publicly.**

---

## Anti-abuse

No verification of any kind. Requiring it would kill submissions, and the marginal entry
is worth more than the marginal fake. Design is **junk-tolerant, not moderated**.

- **Never display individual offer claims.** Only offer *rates*, and only at n ≥ 10. This
  removes the incentive to fake a Jane Street offer: a fake moves a percentage by a
  fraction and earns no visible glory.
- **Suppress every breakdown below n ≥ 10.** Show "not enough data yet". This is both
  anti-abuse and anti-misinformation.
- **Rate limit** by local ID and IP. Cap applications logged per day.
- **Only collect observed events.** "I received X at time T" is a fact. "I think it was
  selective" is a guess. Never collect opinion fields and present them as data.
  Selectivity is *derived from the ratio*, never asked.
- **Assessment format is the deliberate exception to n ≥ 10.** A format describes an
  artefact everyone receives identically — it is not a rate over a population, so one
  credible account is informative where one person's "78% got the OA" would be a lie.
  The honesty mechanism there is *disagreement*, not suppression: conflicting reports
  surface as a labelled range rather than being averaged into a number nobody gave. See
  `lib/formats.ts`.

---

## Views

v1 shipped as specified: two pages. Both since gained one addition apiece — noted inline
below, and in full in Build order step 13.

### 1. Firm pulse page (the product)

For one `firm × programme × role × location`:

- Status line: "OA fired · most recent 3 hours ago" / "Nothing logged yet". A single
  report reads as tentative ("one person says this fired…") rather than confirmed — see
  Anti-abuse.
- **Assessment format** — what the OA/HV/AC actually consists of, crowdsourced,
  structured. Unlike every other panel here, **not** suppressed below n = 10, and
  ungated (shown even before the visitor has logged a status). See Anti-abuse for why.
- Selectivity: % of people who logged `applied` who logged reaching each later stage.
  Suppressed below n = 10.
- Timing histogram: when this stage fired, bucketed by **day** over the last 7 days. (Was
  hour/day; the hour view was cut — see step 13.)
- Stage funnel: counts at each stage, split waiting / progressed / rejected.
- "How long it takes": reframed from a raw median into a sentence — "OA is instant" or
  "most people had it within N days" — because that is the question actually asked, and
  it survives a small sample better than a precise median does.

### 2. "Fired today" feed (homepage)

Everything that fired across all roles in the last 24–48h, newest first, filterable by
category. This is the page people refresh, and refresh is what makes it a habit rather
than a one-off form fill.

### Also live, outside the original two pages

- **Admin merge queue** (`app/admin/`) — build order step 10, single env-var password.
- **Application-open detection strip** — firm-side, not applicant-side. Shows postings
  the poller confirmed just opened. See "Application-open detection" above.

### Deferred to v2+ — do not build now

"My applications" dashboard with notifications · per-firm wiki pages · open/closed board ·
uni and course breakdowns · outcomes dataset · historical cycle comparison.

When uni breakdowns eventually ship: `uni × course × role` is identifying at small n, and
four offers from one university is not evidence of anything. Bucket coarsely, enforce a
high minimum sample.

---

## Scope at launch

- **Sectors:** originally IB/Markets and Quant/SWE only, on the rule "add a category
  when two people ask". **Consulting was added 19 Aug** — MBB comes up five-plus times
  in five days of the source chat, so the rule was met several times over; the omission
  had become the thing making the site look incomplete.
- **Category lives on the ROLE, not the firm** (migration 010) — a firm-level label
  cannot express that Optiver runs both quant and software roles. Five categories:
  `ib_markets`, `asset_management`, `quant`, `swe`, `data_ai`, plus `consulting`.
- **Firm tier is a separate axis** (migration 011) — `bulge_bracket`, `elite_boutique`,
  `middle_market`, `buyside`, `prop_quant`, `tech`, `consulting`. Deliberately not merged
  into category: Goldman IBD and Evercore IBD are the same job at different tiers, not
  different jobs, and folding tier into the category list would destroy that distinction.
- **Cycle:** Summer 2027 only. Schema carries a `cycle` field so spring weeks and grad
  schemes can be added later without migration. Internship postings naming a different
  year are dropped by the detector; naming no year is *assumed* to be 2027 (summer 2026
  has already passed) and flagged as assumed, not confirmed.
- **Internships and graduate roles are separate**, not one bucket — different applicant
  pools and timelines. Graduate/spring/off-cycle postings are detected and stored but
  only internships appear in the v1 "just opened" feed.
- **Geography:** UK primarily, plus Amsterdam (Optiver) and other European offices UK
  students commonly apply to.
- **Level:** undergrad and Master's.
- **Roles do not claim to be open without evidence** (migration 009). The seed catalogue
  was written from how firms are usually structured, not checked against a live posting.
  `roles.opened_at` is set only by a matched detected posting or a real submission; the
  role browser separates confirmed-open from merely-catalogued and says so in the copy.

---

## Firm/role deduplication pipeline

Users can submit roles that aren't listed — necessary, since new roles open weekly through
autumn. Cheapest step first:

1. **Normalise** — lowercase, strip punctuation, strip corporate suffixes (plc, ltd, & co),
   collapse whitespace.
2. **Alias table** — maintained mapping: `bofa`, `bank of america`, `boa` → `Bank of
   America`. Same for programmes: `gcm` → `Global Capital Markets`. Seed generously; this
   catches most volume for free.
3. **Fuzzy match** against canonical entries above a similarity threshold, auto-merge.
4. **LLM pass** only on what survives 1–3.
5. **Admin queue** for genuinely ambiguous cases and new canonical entries. One click to
   approve, merge or reject. Protected by a single env-var password.

**Do not send every submission to an LLM.** Slower, costs money per row, less reliable
than an alias table for the common cases.

---

## Build order

Bounded tasks. One at a time. Don't move on until the current one runs.

- [x] **1. Scaffold + deploy empty page to Vercel.** Finish line: a live URL. First, so
      deployment is never a late blocker.
- [x] **2. Schema design** — `db/001_schema.sql`. **Aarin overrode the guided-exercise
      structure on 17 Aug and asked Claude to write everything.** The teaching comments
      are still in the file, so it can be read as the exercise it was meant to be.
- [x] **3. Seed data** — *Claude generates.* 30–40 firms across IB/Markets and Quant/SWE
      with common programmes and divisions. From the source chat: Standard Chartered,
      Evercore, UBS, BofA, Blackstone, Qatalyst, Santander, McKinsey, Jane Street,
      Optiver, Bloomberg, plus the obvious others.
- [x] **4. Submission handler** — `lib/submit.ts`.
- [x] **5. Aggregation queries** — `lib/sql.ts`, wrapped in `lib/queries.ts`.
- [x] **6. Firm pulse page** — `app/role/[slug]/page.tsx`.
- [x] **7. "Fired today" feed** — `app/page.tsx`, plus the role browser.
- [x] **8. Soft gate** — cookie-mirrored local id, decided server-side, per role.
- [x] **9. Rate limiting and n ≥ 10 suppression** — `lib/pulse.ts` is the only path.
- [x] **10. Admin merge queue page** — `app/admin/`.
- [x] **11. Verification pass** — `npm run verify`. 114 assertions against a real
      Postgres. Confirms the sparse ladder, `distinct on`, suppression thresholds, that
      no individual offer escapes by any route, application-open detection (baseline vs
      genuine opening, internship/graduate separation, cycle gating), and the assessment
      format aggregation's disagreement handling.
- [x] **12. Application-open detection** — `db/004`, `006`–`009`, `lib/ats.ts`,
      `lib/postings.ts`, `scripts/poll.ts`. Polls public ATS endpoints, diffs against the
      previous poll, distinguishes a source's first-sighting baseline from a genuine
      opening. Scheduled live via GitHub Actions.
- [x] **13. Reworked around what the source chat actually asks** — added crowdsourced
      assessment-format reporting (`lib/formats.ts`, not suppressed below n ≥ 10, unlike
      everything else — see Anti-abuse), reframed median gaps as an "is it instant"
      sentence, removed the hour-of-day histogram and the `withdrew` form option, added
      firms named in the chat, reversed the earlier no-consulting decision, and moved
      category from firm to role with firm tier as a separate axis. See git log
      `95ef206` for the reasoning in full.

---

## Launch notes

- Seed with Aarin's own real applications first, so the site isn't empty on day one.
- **Do not scrape or import the WhatsApp group chat.** Real names attached to real
  application statuses, and those people were never asked. Everything comes from voluntary
  submissions.
- Post in the summer internship WhatsApp GC first — warm audience, and the reason cold
  start isn't fatal. Discord and other GCs second. LinkedIn is weak here: people won't
  attach their real name publicly to a rejection tracker.
- **Watch one number in week one:** percentage of visitors who log a status. Under ~20%
  means the gate is mispositioned and should be *loosened*, not tightened.

---

## Standing instructions — flag these when spotted

- Any point where the schema will need migrating later. **Flag before he writes it, not
  after.**
- Any place where a computed number could mislead at small sample sizes.
- Any UK GDPR issue with what's being collected. Neither of us is a lawyer — flag it,
  don't rule on it.
- Any over-scoping. The version of this that survives to March is the small one.
