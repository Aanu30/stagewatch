# Stagewatch

Crowdsourced tracker for UK summer internship application stages.

Two questions, aggregated from voluntary applicant submissions:

1. Has this stage fired yet for this role?
2. Was it selective, or did everyone get it?

Read `CLAUDE.md` for the full spec, data model, conventions and build order.

## Running locally

```bash
npm install
npm run dev
```

Needs `.env.local` with the Supabase connection string. Never commit it.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Postgres on Supabase · raw SQL, no ORM · plain CSS · deployed on Vercel.
