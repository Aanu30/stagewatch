# Stagewatch

Crowdsourced tracker for UK summer internship application stages.

Two questions, answered from voluntary applicant submissions:

1. **Has this stage fired yet for this role?**
2. **Was it selective, or did everyone get it?**

The second one is the product. Nobody in a group chat can answer it, because it needs an
aggregated denominator. Read `CLAUDE.md` for the full spec and conventions.

## Quick start, no Supabase needed

```bash
npm install
npm run verify              # 66 assertions against a real Postgres. No setup, no network.
npm run db:local:fixture    # Postgres in-process on :5433, seeded with 50 fake applications
npm run dev                 # in another terminal
```

`.env.local` needs:

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
ADMIN_PASSWORD=anything
IP_HASH_SALT=anything
```

## Production setup

1. Create a Supabase project.
2. Take the **transaction pooler** string (port `6543`). Not the direct connection — that
   is IPv6-only on the free tier and Vercel cannot reach it.
3. Set `DATABASE_URL`, `ADMIN_PASSWORD` and `IP_HASH_SALT` in Vercel.
4. Run `db/001_schema.sql`, then `db/002_seed.sql`, in the Supabase SQL editor.

Never run `db/003_test_fixture.sql` against production. Without `DATABASE_URL` the site
shows setup instructions rather than erroring.

## Layout

```
db/001_schema.sql     8 tables, with the reasoning inline
db/002_seed.sql       50 firms, 117 roles, 99 aliases
db/003_test_fixture.sql   verification fixture. Dev only.
lib/sql.ts            every read query, as plain SQL
lib/pulse.ts          suppression layer. The only route numbers take to a component.
lib/submit.ts         submission handler
lib/dedup.ts          normalise -> alias -> fuzzy -> merge queue
app/page.tsx          "fired today" feed + role browser
app/role/[slug]/      firm pulse page
app/admin/            merge queue, single env-var password
scripts/verify.mjs    the verification pass
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Postgres on Supabase · raw SQL, no ORM ·
plain CSS · Vercel.
