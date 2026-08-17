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
- **Aarin has no prior SQL/database experience.** Explain schema and query decisions:
  concrete example first, general rule after.
- Direct, no preamble, no filler. Say when something is wrong.

### Division of labour

Aarin is learning this stack. Some parts are his to write, as guided exercises.

| Part | Who writes it |
|---|---|
| Frontend (pages, components, styling) | Claude |
| Config, deployment, tooling | Claude |
| Canonical firm/role seed data | Claude |
| **Database schema** | **Aarin** (Claude explains) |
| **Submission handler** | **Aarin** (Claude explains) |
| **Aggregation queries** | **Aarin** (Claude explains) |

For Aarin's three: explain the goal, show a worked example of something similar, let him
write it, then review. **Do not just hand over finished code for those.** Roughly 150
lines total across all three.

### Task discipline

Small bounded tasks with a clear start, end and method. One at a time. Stop and report
after each before starting the next. No open-ended work.

---

## Tech stack

- **Next.js 16.3.1** (App Router), React 19.2.8, TypeScript
- **Postgres via Supabase** free tier — chosen partly for the table UI, since Aarin is new
  to databases and wants to inspect rows directly
- **Vercel** free tier for hosting
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

### Secrets

`.env*` is gitignored. The Supabase connection string goes in `.env.local` and in Vercel's
env vars. **Never commit it.** Never paste it into a file that is not `.env.local`.

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
- [ ] **2. Schema design** — *Aarin writes, Claude explains.* Tables: `firms`,
      `programmes`, `roles`, `applications`, `events`, `aliases`, `merge_queue`. Walk
      through keys and relationships before he writes.
- [ ] **3. Seed data** — *Claude generates.* 30–40 firms across IB/Markets and Quant/SWE
      with common programmes and divisions. From the source chat: Standard Chartered,
      Evercore, UBS, BofA, Blackstone, Qatalyst, Santander, McKinsey, Jane Street,
      Optiver, Bloomberg, plus the obvious others.
- [ ] **4. Submission handler** — *Aarin writes, Claude explains.* Insert application,
      insert event, handle unknown-role path into merge queue.
- [ ] **5. Aggregation queries** — *Aarin writes, Claude explains.* Selectivity ratio,
      stage funnel counts, median stage gaps, recent-events feed. The part he most needs
      to understand.
- [ ] **6. Firm pulse page** — Claude, wired to Aarin's queries.
- [ ] **7. "Fired today" feed** — Claude.
- [ ] **8. Soft gate** — headline visible, numbers unlocked by logging a status.
- [ ] **9. Rate limiting and n ≥ 10 suppression.**
- [ ] **10. Admin merge queue page.**
- [ ] **11. Verification pass** — seed 50 fake applications spanning edge cases (skipped
      stages, all-waiting, single-response roles, sub-threshold samples). Confirm every
      number on the pulse page. Confirm n ≥ 10 suppression cannot be bypassed. Confirm no
      individual offer is exposed via any route.

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
