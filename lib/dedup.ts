// ============================================================================
// Deduplication pipeline, cheapest step first.
// ============================================================================
//
//   1. Normalise      - done in SQL by normalise_name(), so the seed, the
//                       alias table and this code cannot drift apart.
//   2. Alias table    - a maintained mapping. Catches most of the volume for
//                       free, with no per-row cost.
//   3. Fuzzy match    - bigram similarity against canonical names, auto-merge
//                       above a threshold.
//   4. LLM pass       - deliberately NOT implemented. See note at the foot.
//   5. Admin queue    - whatever survives 1 to 3.
//
// The ordering matters commercially, not just technically: an alias lookup is
// a single indexed query, and a fuzzy match is fifty string comparisons in
// memory. Sending every submission to a language model instead would be
// slower, cost money per row, and be less reliable than the alias table for
// exactly the cases that make up most of the traffic.

import { query } from "./db";

// ---------------------------------------------------------------------------
// Step 3: bigram (Dice) similarity.
// ---------------------------------------------------------------------------
//
// "goldman sacks" vs "goldman sachs" -> 0.87, merged.
// "citadel" vs "citadel securities"  -> 0.64, sent to the queue, which is
// correct: those are two different employers and auto-merging them would be a
// data-destroying mistake, not a tidy-up.
//
// Dice over bigrams rather than Levenshtein because it is insensitive to word
// order and length, which suits company names: "capital markets global" and
// "global capital markets" score high, as they should.
function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const aBi = bigrams(a);
  const bBi = bigrams(b);

  // Multiset intersection: each bigram in `a` may be matched at most once.
  const pool = new Map<string, number>();
  for (const g of bBi) pool.set(g, (pool.get(g) ?? 0) + 1);

  let hits = 0;
  for (const g of aBi) {
    const left = pool.get(g) ?? 0;
    if (left > 0) {
      hits++;
      pool.set(g, left - 1);
    }
  }

  return (2 * hits) / (aBi.length + bBi.length);
}

// Above this, merge without asking. Chosen so that a typo merges and a
// genuinely different firm does not. Raise it if you see a bad auto-merge:
// a false merge silently corrupts a denominator, whereas a false queue entry
// costs you one click.
export const AUTO_MERGE_THRESHOLD = 0.82;

// ---------------------------------------------------------------------------
// Steps 1 and 2, in one query each.
// ---------------------------------------------------------------------------

const NORMALISE_SQL = `select normalise_name($1::text) as norm`;

export async function normalise(input: string): Promise<string> {
  const rows = await query<{ norm: string }>(NORMALISE_SQL, [input]);
  return rows[0]?.norm ?? "";
}

const FIRM_BY_NORM_OR_ALIAS_SQL = `
select f.id, f.name, f.slug
from firms f
where f.name_norm = normalise_name($1::text)
union
select f.id, f.name, f.slug
from aliases a
join firms f on f.id = a.firm_id
where a.kind = 'firm'
  and a.alias_norm = normalise_name($1::text)
limit 1
`;

const ALL_FIRMS_SQL = `select id, name, slug, name_norm from firms`;

const PROGRAMME_BY_NORM_OR_ALIAS_SQL = `
select p.id, p.name, p.slug
from programmes p
where p.name_norm = normalise_name($1::text)
union
select p.id, p.name, p.slug
from aliases a
join programmes p on p.id = a.programme_id
where a.kind = 'programme'
  and a.alias_norm = normalise_name($1::text)
limit 1
`;

const DIVISION_ALIAS_SQL = `
select division_canon
from aliases
where kind = 'division'
  and alias_norm = normalise_name($1::text)
limit 1
`;

export type FirmMatch = { id: number; name: string; slug: string };

export type Resolution<T> =
  | { kind: "exact"; value: T }
  | { kind: "fuzzy"; value: T; score: number }
  | { kind: "unknown" };

export async function resolveFirm(
  input: string,
): Promise<Resolution<FirmMatch>> {
  const direct = await query<FirmMatch>(FIRM_BY_NORM_OR_ALIAS_SQL, [input]);
  if (direct[0]) return { kind: "exact", value: direct[0] };

  // Step 3. Fifty rows, compared in memory - cheaper than a database round
  // trip per candidate, and the firm list is bounded by design.
  const norm = await normalise(input);
  if (!norm) return { kind: "unknown" };

  const all = await query<FirmMatch & { name_norm: string }>(ALL_FIRMS_SQL);
  let best: (FirmMatch & { score: number }) | null = null;
  for (const f of all) {
    const score = similarity(norm, f.name_norm);
    if (!best || score > best.score) {
      best = { id: f.id, name: f.name, slug: f.slug, score };
    }
  }

  if (best && best.score >= AUTO_MERGE_THRESHOLD) {
    return {
      kind: "fuzzy",
      value: { id: best.id, name: best.name, slug: best.slug },
      score: best.score,
    };
  }

  return { kind: "unknown" };
}

export async function resolveProgramme(
  input: string,
): Promise<Resolution<{ id: number; name: string; slug: string }>> {
  const rows = await query<{ id: number; name: string; slug: string }>(
    PROGRAMME_BY_NORM_OR_ALIAS_SQL,
    [input],
  );
  return rows[0] ? { kind: "exact", value: rows[0] } : { kind: "unknown" };
}

// Divisions resolve to a canonical STRING, not an id, because division is
// free text on `roles`. See the migration note in db/001_schema.sql: if
// divisions ever need their own table, this is one of the three places that
// changes.
export async function resolveDivision(input: string): Promise<string> {
  const rows = await query<{ division_canon: string }>(DIVISION_ALIAS_SQL, [
    input,
  ]);
  return rows[0]?.division_canon ?? input.trim();
}

// ---------------------------------------------------------------------------
// Step 4, deliberately absent
// ---------------------------------------------------------------------------
//
// There is no LLM call in this pipeline. Steps 1 to 3 resolve the overwhelming
// majority of real submissions, and what survives them is genuinely ambiguous:
// a firm nobody has entered before, or a division name that could plausibly be
// two different teams. Those are the cases where a model is least reliable and
// a human glance is most valuable, so they go straight to the merge queue.
//
// If the queue ever becomes a daily chore, the fix is to add aliases, not to
// add a model. Every alias added is permanent and free; every model call is
// neither.
