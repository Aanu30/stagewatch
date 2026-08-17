import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, query } from "./db";

// Single shared password from an env var, per spec. No user accounts, because
// there is exactly one administrator and adding an auth provider for one
// person is scope that will not survive to March.
//
// The cookie is httpOnly, so page scripts cannot read it, and the comparison
// is timing-safe, so a wrong guess takes the same time as a nearly-right one.

export const ADMIN_COOKIE = "sw_admin";

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself leak the
  // length, so pad to a common size first.
  const len = Math.max(a.length, b.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  a.copy(pa);
  b.copy(pb);

  return timingSafeEqual(pa, pb) && a.length === b.length;
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  return !!value && checkPassword(value);
}

// ---------------------------------------------------------------------------
// Queue reads
// ---------------------------------------------------------------------------

export const PENDING_QUEUE_SQL = `
select q.id,
       q.raw_firm,
       q.raw_programme,
       q.raw_division,
       q.raw_location,
       q.raw_cycle,
       q.raw_stage,
       q.raw_status,
       q.raw_occurred_on,
       q.norm_firm,
       q.created_at,
       f.name as suggested_firm_name,
       f.id   as suggested_firm_id
from merge_queue q
left join firms f on f.id = q.suggested_firm_id
where q.status = 'pending'
order by q.created_at
limit 200
`;

export type QueueRow = {
  id: number;
  raw_firm: string;
  raw_programme: string | null;
  raw_division: string | null;
  raw_location: string | null;
  raw_cycle: string | null;
  raw_stage: string;
  raw_status: string;
  raw_occurred_on: string;
  norm_firm: string;
  created_at: string;
  suggested_firm_name: string | null;
  suggested_firm_id: number | null;
};

export function getPendingQueue() {
  return query<QueueRow>(PENDING_QUEUE_SQL);
}

export const ALL_ROLES_BRIEF_SQL = `
select r.slug, f.name as firm_name, r.division, r.location, p.name as programme_name
from roles r
join firms f      on f.id = r.firm_id
join programmes p on p.id = r.programme_id
order by f.name, r.division, r.location, p.name
`;

export type RoleBrief = {
  slug: string;
  firm_name: string;
  division: string;
  location: string;
  programme_name: string;
};

export function getAllRolesBrief() {
  return query<RoleBrief>(ALL_ROLES_BRIEF_SQL);
}

// ---------------------------------------------------------------------------
// Queue actions
// ---------------------------------------------------------------------------

const GET_QUEUE_ROW_SQL = `select * from merge_queue where id = $1 and status = 'pending'`;

const RESOLVE_SQL = `
update merge_queue
   set status = $2, resolved_at = now()
 where id = $1
`;

const UPSERT_FIRM_SQL = `
insert into firms (slug, name, name_norm, category)
values (slugify($1::text), $1::text, normalise_name($1::text), $2)
on conflict (name_norm) do update set name = excluded.name
returning id
`;

const FIND_PROGRAMME_SQL = `
select id from programmes
where name_norm = normalise_name($1::text)
   or slug = $1::text
limit 1
`;

const DEFAULT_PROGRAMME_SQL = `select id from programmes where slug = 'summer' limit 1`;

const UPSERT_ROLE_SQL = `
insert into roles
  (firm_id, programme_id, division, division_norm, location, location_norm, cycle, slug)
values
  ($1, $2, $3::text, normalise_name($3::text), $4::text, normalise_name($4::text), $5::text,
   slugify($6::text))
on conflict (firm_id, programme_id, division_norm, location_norm, cycle)
  do update set division = excluded.division
returning id, slug
`;

const FIND_ROLE_BY_SLUG_SQL = `select id, slug from roles where slug = $1`;

const UPSERT_APPLICATION_SQL = `
insert into applications (role_id, local_id, current_stage, current_status)
values ($1, $2::uuid, $3, $4)
on conflict (role_id, local_id) do update
  set current_stage = excluded.current_stage,
      current_status = excluded.current_status,
      updated_at = now()
returning id
`;

const INSERT_EVENT_SQL = `
insert into events (application_id, role_id, stage, status, occurred_on, occurred_hour)
values ($1, $2, $3, $4, $5::date, $6)
`;

export type AdminResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function rejectQueueItem(id: number): Promise<AdminResult> {
  await query(RESOLVE_SQL, [id, "rejected"]);
  return { ok: true, message: "Rejected." };
}

// Approve: create the firm and role if they do not exist, then replay the
// original submission against the new role so the person's data is not lost.
export async function approveQueueItem(
  id: number,
  category: string,
): Promise<AdminResult> {
  const sql = db();
  const rows = await sql.unsafe(GET_QUEUE_ROW_SQL, [id]);
  const q = rows[0];
  if (!q) return { ok: false, error: "Not found, or already resolved." };

  if (category !== "ib_markets" && category !== "quant_swe") {
    return { ok: false, error: "Unknown category." };
  }

  const division = String(q.raw_division ?? "").trim() || "General";
  const location = String(q.raw_location ?? "").trim() || "London";
  const cycle = String(q.raw_cycle ?? "").trim() || "Summer 2027";

  await sql.begin(async (tx) => {
    let firmId = q.suggested_firm_id ? Number(q.suggested_firm_id) : null;
    if (!firmId) {
      const f = await tx.unsafe(UPSERT_FIRM_SQL, [q.raw_firm, category]);
      firmId = Number(f[0].id);
    }

    let programmeId: number | null = null;
    if (q.raw_programme) {
      const p = await tx.unsafe(FIND_PROGRAMME_SQL, [String(q.raw_programme)]);
      if (p[0]) programmeId = Number(p[0].id);
    }
    if (!programmeId) {
      const p = await tx.unsafe(DEFAULT_PROGRAMME_SQL, []);
      programmeId = Number(p[0].id);
    }

    const slugSource = `${q.raw_firm} ${division} ${location} ${cycle}`;
    const r = await tx.unsafe(UPSERT_ROLE_SQL, [
      firmId,
      programmeId,
      division,
      location,
      cycle,
      slugSource,
    ]);
    const roleId = Number(r[0].id);

    const app = await tx.unsafe(UPSERT_APPLICATION_SQL, [
      roleId,
      q.submitted_by,
      q.raw_stage,
      q.raw_status,
    ]);
    await tx.unsafe(INSERT_EVENT_SQL, [
      Number(app[0].id),
      roleId,
      q.raw_stage,
      q.raw_status,
      q.raw_occurred_on,
      q.raw_occurred_hour ?? null,
    ]);

    await tx.unsafe(RESOLVE_SQL, [id, "approved"]);
  });

  return { ok: true, message: "Approved, role created and submission replayed." };
}

// Merge: attach the submission to a role that already exists.
export async function mergeQueueItem(
  id: number,
  targetSlug: string,
): Promise<AdminResult> {
  const sql = db();
  const rows = await sql.unsafe(GET_QUEUE_ROW_SQL, [id]);
  const q = rows[0];
  if (!q) return { ok: false, error: "Not found, or already resolved." };

  const target = await sql.unsafe(FIND_ROLE_BY_SLUG_SQL, [targetSlug]);
  if (!target[0]) return { ok: false, error: "Target role does not exist." };
  const roleId = Number(target[0].id);

  await sql.begin(async (tx) => {
    const app = await tx.unsafe(UPSERT_APPLICATION_SQL, [
      roleId,
      q.submitted_by,
      q.raw_stage,
      q.raw_status,
    ]);
    await tx.unsafe(INSERT_EVENT_SQL, [
      Number(app[0].id),
      roleId,
      q.raw_stage,
      q.raw_status,
      q.raw_occurred_on,
      q.raw_occurred_hour ?? null,
    ]);
    await tx.unsafe(RESOLVE_SQL, [id, "merged"]);
  });

  return { ok: true, message: `Merged into ${targetSlug}.` };
}
