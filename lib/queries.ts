// Typed wrappers around the SQL in lib/sql.ts.
//
// The SQL itself lives in its own module so scripts/verify.mjs can execute the
// exact same strings against a real Postgres without importing the database
// client. Read lib/sql.ts for the reasoning behind each query.

import { query } from "./db";
import {
  COUNT_BY_IP_SQL,
  COUNT_BY_LOCAL_SQL,
  COUNT_MERGE_BY_LOCAL_SQL,
  FIRED_FEED_SQL,
  FUNNEL_SQL,
  HAS_LOGGED_SQL,
  HEADLINE_SQL,
  MEDIAN_GAPS_SQL,
  ROLE_BY_SLUG_SQL,
  ROLE_TOTAL_SQL,
  SEARCH_ROLES_SQL,
  SELECTIVITY_SQL,
  STAGE_ACTIVITY_SQL,
  TIMING_BY_DAY_SQL,
  TIMING_BY_HOUR_SQL,
  WHERE_YOU_STAND_SQL,
} from "./sql";

export type Role = {
  id: number;
  slug: string;
  division: string;
  location: string;
  cycle: string;
  firm_name: string;
  firm_slug: string;
  category: string;
  programme_name: string;
  programme_slug: string;
};

export type Headline = {
  stage: string;
  stage_label: string;
  occurred_on: string;
  occurred_hour: number | null;
  logged_at: string;
  fired_at: string | null;
};

export type StageActivity = {
  code: string;
  label: string;
  sort_order: number;
  people: number;
  last_on: string | null;
  last_fired_at: string | null;
};

export type SelectivityRow = {
  code: string;
  label: string;
  sort_order: number;
  denominator: number;
  reached: number;
};

export type FunnelRow = {
  code: string;
  label: string;
  sort_order: number;
  total: number;
  waiting: number;
  progressed: number;
  rejected: number;
  withdrew: number;
};

export type MedianGapRow = {
  code: string;
  label: string;
  sort_order: number;
  n: number;
  median_days: number | null;
};

export type DayBucket = { occurred_on: string; n: number };
export type HourBucket = { occurred_hour: number; n: number };

export type FeedRow = {
  role_slug: string;
  firm_name: string;
  category: string;
  programme_name: string;
  division: string;
  location: string;
  cycle: string;
  stage: string;
  stage_label: string;
  people: number;
  last_on: string;
  last_fired_at: string | null;
  last_logged_at: string;
};

export type SearchRow = {
  slug: string;
  tier: string | null;
  opened_at: string | null;
  opened_evidence: string | null;
  firm_name: string;
  category: string;
  programme_name: string;
  division: string;
  location: string;
  cycle: string;
  logged: number;
};

export async function getRoleBySlug(slug: string): Promise<Role | null> {
  const rows = await query<Role>(ROLE_BY_SLUG_SQL, [slug]);
  return rows[0] ?? null;
}

export async function getRoleTotal(roleId: number): Promise<number> {
  const rows = await query<{ n: number }>(ROLE_TOTAL_SQL, [roleId]);
  return Number(rows[0]?.n ?? 0);
}

export async function getHeadline(roleId: number): Promise<Headline | null> {
  const rows = await query<Headline>(HEADLINE_SQL, [roleId]);
  return rows[0] ?? null;
}

export function getStageActivity(roleId: number) {
  return query<StageActivity>(STAGE_ACTIVITY_SQL, [roleId]);
}

export function getSelectivity(roleId: number) {
  return query<SelectivityRow>(SELECTIVITY_SQL, [roleId]);
}

export function getFunnel(roleId: number) {
  return query<FunnelRow>(FUNNEL_SQL, [roleId]);
}

export function getMedianGaps(roleId: number) {
  return query<MedianGapRow>(MEDIAN_GAPS_SQL, [roleId]);
}

export function getTimingByDay(roleId: number, stage: string) {
  return query<DayBucket>(TIMING_BY_DAY_SQL, [roleId, stage]);
}

export function getTimingByHour(roleId: number, stage: string) {
  return query<HourBucket>(TIMING_BY_HOUR_SQL, [roleId, stage]);
}

export function getFiredFeed(windowHours: number, category: string | null) {
  return query<FeedRow>(FIRED_FEED_SQL, [windowHours, category]);
}

export function searchRoles(
  category: string | null,
  term: string | null,
  tier: string | null = null,
) {
  return query<SearchRow>(SEARCH_ROLES_SQL, [category, term, tier]);
}

export type WhereYouStand = {
  my_stage: string;
  my_status: string;
  my_logged_at: string;
  my_order: number;
  others_total: number;
  ahead_of_you: number;
  level_with_you: number;
  days_since_first_event: number | null;
};

export async function getWhereYouStand(roleId: number, localId: string) {
  const rows = await query<WhereYouStand>(WHERE_YOU_STAND_SQL, [roleId, localId]);
  return rows[0] ?? null;
}

export async function hasLogged(roleId: number, localId: string) {
  const rows = await query<{ ok: number }>(HAS_LOGGED_SQL, [roleId, localId]);
  return rows.length > 0;
}

export async function countRecentByLocal(localId: string) {
  const rows = await query<{ n: number }>(COUNT_BY_LOCAL_SQL, [localId]);
  return Number(rows[0]?.n ?? 0);
}

export async function countRecentByIp(ipHash: string) {
  const rows = await query<{ n: number }>(COUNT_BY_IP_SQL, [ipHash]);
  return Number(rows[0]?.n ?? 0);
}

export async function countRecentMergeByLocal(localId: string) {
  const rows = await query<{ n: number }>(COUNT_MERGE_BY_LOCAL_SQL, [localId]);
  return Number(rows[0]?.n ?? 0);
}
