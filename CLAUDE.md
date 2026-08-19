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

Applied in production: `001_schema.sql`, `002_seed.sql`, `004_sources.sql`.
**Never** `003_test_fixture.sql` or `005_test_postings.sql` — invented data. `npm run
migrate` applies only the three safe ones, so there is no path by which fixtures reach a
real database.

Production env vars are set in Vercel as **Sensitive**, which means they cannot be read
back — only overwritten. The admin password is in `.env.local` if it is ever lost.

### Application-open detection

`db/004_sources.sql`, `lib/ats.ts`, `lib/postings.ts`, `scripts/poll.ts`.

Polls the firms' own Workday/Greenhouse endpoints, which are public and need no API key.
Detection is by **diffing** — Workday reports `postedOn` as "Posted 26 Days Ago", capped
at "30+ Days Ago", so an exact time is not available. A posting absent from the last poll
is a posting that just opened.

**It cannot backfill.** Only openings after the poller starts are ever caught.

Firm-side postings are kept strictly out of `events`, which requires an `application_id`.
A firm opening a posting has no applicant, and forcing it in would mean a nullable FK
breaking every distinct-applicant count, or a fake application poisoning every
denominator.

**Sources are data, not code.** Adding a firm is an INSERT — no deploy. Only three are
seeded (Citi, Morgan Stanley, Santander) because Workday tenant ids are not derivable:
blind probing found those three and missed seventeen others. The rest must be read off
each firm's careers page.

**Scheduling is not yet running.** `.github/workflows/poll.yml` needs a GitHub remote,
which does not exist yet. Until then `npm run poll` is manual. `gh` is installed at
`~/.local/bin/gh` but not authenticated.

### Commands

```
npm run dev               # uses DATABASE_URL from .env.local (points at Supabase)
npm run migrate           # applies 001, 002, 004 to DATABASE_URL
npm run poll              # one polling pass
npm run poll:dry          # fetch and report, write nothing
npm run verify            # 66 assertions against a real Postgres (PGlite), no setup
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
- `withdrew` — self-withdrawn

`waiting` existing at every stage is what makes the funnel computable **without anyone
ever logging a rejection**. It is the rejection-equivalent data point people will actually
submit.

### Event log

Append-only, alongside current state:

```
(application_id, stage, status, occurred_at, logged_at)
```

`occurred_at` captures date **and hour where known** — "are they sending gradually?" needs
sub-day granularity. Hour is optional so it never blocks a submission.

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

---

## Views — v1 is TWO PAGES ONLY

### 1. Firm pulse page (the product)

For one `firm × programme × role × location`:

- Status line: "OA fired · most recent 3 hours ago" / "Nothing logged yet"
- Selectivity: % of people who logged `applied` who logged reaching each later stage.
  Suppressed below n = 10.
- Timing histogram: when this stage fired, bucketed by hour/day over the last 7 days.
- Stage funnel: counts at each stage, split waiting / progressed / rejected.
- Median gaps: "Applied → OA: 6 days median."

### 2. "Fired today" feed (homepage)

Everything that fired across all roles in the last 24–48h, newest first, filterable by
category. This is the page people refresh, and refresh is what makes it a habit rather
than a one-off form fill.

### Deferred to v2+ — do not build now

"My applications" dashboard with notifications · per-firm wiki pages · open/closed board ·
uni and course breakdowns · outcomes dataset · historical cycle comparison.

When uni breakdowns eventually ship: `uni × course × role` is identifying at small n, and
four offers from one university is not evidence of anything. Bucket coarsely, enforce a
high minimum sample.

---

## Scope at launch

- **Sectors:** IB/Markets and Quant/SWE only. Structure supports more categories, but do
  not ship empty Law/Consulting tabs — an empty category makes the site look dead. Add a
  category when two people ask.
- **Cycle:** Summer 2027 only. Schema carries a `cycle` field so spring weeks and grad
  schemes can be added later without migration.
- **Geography:** UK primarily, plus Amsterdam (Optiver) and other European offices UK
  students commonly apply to.
- **Level:** undergrad and Master's.

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
- [x] **11. Verification pass** — `npm run verify`. 66 assertions against a real
      Postgres. Confirms the sparse ladder, `distinct on`, suppression thresholds, and
      that no individual offer escapes by any route.

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
