// ============================================================================
// The submission handler.
// ============================================================================
//
// One entry point, two paths:
//
//   Known role   -> upsert an application, append an event.
//   Unknown role -> run the dedup pipeline; if it still cannot be resolved,
//                   drop it in the merge queue and tell the user it is pending.
//
// The application is UPSERTED, the event is INSERTED. That asymmetry is the
// whole data model in one line: `applications` is current state and there is
// exactly one row per person per role, while `events` is an append-only log
// and gets a new row every time anything happens.

import { query, transaction } from "./db";
import {
  MAX_APPLICATIONS_PER_DAY_IP,
  MAX_APPLICATIONS_PER_DAY_LOCAL,
  MAX_MERGE_SUBMISSIONS_PER_DAY_LOCAL,
  ALL_STATUS_CODES,
  STAGES,
} from "./constants";
import {
  countRecentByIp,
  countRecentByLocal,
  countRecentMergeByLocal,
} from "./queries";
import { normalise, resolveDivision, resolveFirm, resolveProgramme } from "./dedup";

export type SubmitInput = {
  localId: string;
  ipHash: string | null;
  // Known-role path
  roleSlug?: string | null;
  // Unknown-role path
  firmName?: string | null;
  programmeName?: string | null;
  division?: string | null;
  location?: string | null;
  cycle?: string | null;
  // The event itself
  stage: string;
  status: string;
  occurredOn: string; // YYYY-MM-DD
  occurredHour?: number | null;
  // Optional, so median gaps have something to measure from when somebody
  // joins the site at the OA stage rather than at application.
  appliedOn?: string | null;
};

export type SubmitResult =
  | { ok: true; outcome: "logged"; roleSlug: string }
  | { ok: true; outcome: "queued"; queueId: number }
  | { ok: false; error: string; status: number };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string, status = 400): SubmitResult {
  return { ok: false, error, status };
}

// ---------------------------------------------------------------------------
// Validation. Everything is checked here rather than trusted from the client,
// because "the form only offers valid values" stops being true the moment
// somebody opens a terminal.
// ---------------------------------------------------------------------------

function validate(input: SubmitInput): string | null {
  if (!UUID_RE.test(input.localId)) return "Invalid identifier.";

  if (!STAGES.some((s) => s.code === input.stage)) return "Unknown stage.";
  if (!ALL_STATUS_CODES.some((c) => c === input.status)) return "Unknown status.";

  if (!DATE_RE.test(input.occurredOn)) return "Date must be YYYY-MM-DD.";

  const on = new Date(`${input.occurredOn}T00:00:00Z`);
  if (Number.isNaN(on.getTime())) return "Date is not a real date.";

  // A day of slack on the upper bound, because the user's clock and ours may
  // disagree across a timezone boundary and rejecting a same-day submission
  // would be maddening.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (on > tomorrow) return "That date is in the future.";

  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
  if (on < twoYearsAgo) return "That date is too far in the past.";

  const hour = input.occurredHour;
  if (hour != null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
    return "Hour must be between 0 and 23.";
  }

  if (input.appliedOn != null && input.appliedOn !== "") {
    if (!DATE_RE.test(input.appliedOn)) return "Applied date must be YYYY-MM-DD.";
    if (input.appliedOn > input.occurredOn) {
      return "You cannot have applied after the thing you are logging happened.";
    }
  }

  if (!input.roleSlug && !input.firmName) {
    return "Pick a role, or tell us the firm.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// SQL for the write path.
// ---------------------------------------------------------------------------

const FIND_ROLE_BY_SLUG_SQL = `select id, slug from roles where slug = $1`;

// Resolve a role from its component parts, using the normalised columns so
// "M&A" and "m & a" land on the same row.
const FIND_ROLE_BY_PARTS_SQL = `
select r.id, r.slug
from roles r
where r.firm_id = $1
  and r.programme_id = $2
  and r.division_norm = normalise_name($3::text)
  and r.location_norm = normalise_name($4::text)
  and r.cycle = $5
limit 1
`;

// One person, one row per role. `on conflict` turns a second submission into
// an update instead of a duplicate, which is what keeps the denominator a
// count of people rather than a count of clicks.
const UPSERT_APPLICATION_SQL = `
insert into applications
  (role_id, local_id, current_stage, current_status, ip_hash)
values
  ($1, $2::uuid, $3, $4, $5)
on conflict (role_id, local_id) do update
  set current_stage  = excluded.current_stage,
      current_status = excluded.current_status,
      updated_at     = now()
returning id
`;

const INSERT_EVENT_SQL = `
insert into events
  (application_id, role_id, stage, status, occurred_on, occurred_hour)
values
  ($1, $2, $3, $4, $5::date, $6)
`;

// Only inserted if the person has no 'applied' event yet. Without this,
// somebody who joins the site at the OA stage contributes nothing to the
// median-gap numbers, because there is no start date to measure from.
const INSERT_APPLIED_IF_MISSING_SQL = `
insert into events
  (application_id, role_id, stage, status, occurred_on)
select $1, $2, 'applied', 'progressed', $3::date
where not exists (
  select 1 from events
  where application_id = $1 and stage = 'applied'
)
`;

// The stage/status/date are stored alongside the raw role strings so that
// approving the queue entry can replay the person's actual submission against
// the role it creates. Without them, approval would produce an empty role and
// throw away the only thing the user came to log.
const INSERT_MERGE_QUEUE_SQL = `
insert into merge_queue
  (raw_firm, raw_programme, raw_division, raw_location, raw_cycle,
   raw_stage, raw_status, raw_occurred_on, raw_occurred_hour,
   norm_firm, suggested_firm_id, submitted_by, ip_hash)
values
  ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12::uuid, $13)
returning id
`;

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export async function submit(input: SubmitInput): Promise<SubmitResult> {
  const invalid = validate(input);
  if (invalid) return fail(invalid);

  // --- Rate limiting ------------------------------------------------------
  // Checked before any write. Both counters are on rolling 24-hour windows.
  // The IP counter is skipped entirely when IP_HASH_SALT is unset, because we
  // store null rather than an unsalted hash - see lib/hash.ts.
  const byLocal = await countRecentByLocal(input.localId);
  if (byLocal >= MAX_APPLICATIONS_PER_DAY_LOCAL) {
    return fail("Daily limit reached. Try again tomorrow.", 429);
  }
  if (input.ipHash) {
    const byIp = await countRecentByIp(input.ipHash);
    if (byIp >= MAX_APPLICATIONS_PER_DAY_IP) {
      return fail("Daily limit reached. Try again tomorrow.", 429);
    }
  }

  // --- Resolve the role ---------------------------------------------------
  let roleId: number | null = null;
  let roleSlug: string | null = null;

  if (input.roleSlug) {
    const found = await query(FIND_ROLE_BY_SLUG_SQL, [input.roleSlug]);
    if (!found[0]) return fail("That role no longer exists.", 404);
    roleId = Number(found[0].id);
    roleSlug = String(found[0].slug);
  } else {
    // Unknown-role path: run the dedup pipeline over what they typed.
    const firm = await resolveFirm(input.firmName ?? "");
    const programme = await resolveProgramme(
      input.programmeName ?? "Summer Internship",
    );

    if (firm.kind !== "unknown" && programme.kind !== "unknown") {
      const division = await resolveDivision(input.division ?? "");
      const found = await query(FIND_ROLE_BY_PARTS_SQL, [
        firm.value.id,
        programme.value.id,
        division,
        input.location ?? "London",
        input.cycle ?? "Summer 2027",
      ]);
      if (found[0]) {
        roleId = Number(found[0].id);
        roleSlug = String(found[0].slug);
      }
    }

    // Still unresolved. This is a genuinely new firm, or a division nobody has
    // entered before. It goes to a human, not to a model.
    if (roleId == null) {
      const queued = await countRecentMergeByLocal(input.localId);
      if (queued >= MAX_MERGE_SUBMISSIONS_PER_DAY_LOCAL) {
        return fail("Too many new roles submitted today.", 429);
      }

      const normFirm = await normalise(input.firmName ?? "");
      const rows = await query(INSERT_MERGE_QUEUE_SQL, [
        input.firmName ?? "",
        input.programmeName ?? null,
        input.division ?? null,
        input.location ?? null,
        input.cycle ?? null,
        input.stage,
        input.status,
        input.occurredOn,
        input.occurredHour ?? null,
        normFirm,
        firm.kind === "unknown" ? null : firm.value.id,
        input.localId,
        input.ipHash,
      ]);
      return { ok: true, outcome: "queued", queueId: Number(rows[0].id) };
    }
  }

  // --- Write --------------------------------------------------------------
  // In a transaction, because an application without its event is a row that
  // inflates every denominator while contributing to no numerator. A partial
  // write here is worse than no write.
  await transaction(async (tx) => {
    const app = await tx.query(UPSERT_APPLICATION_SQL, [
      roleId,
      input.localId,
      input.stage,
      input.status,
      input.ipHash,
    ]);
    const applicationId = Number(app[0].id);

    await tx.query(INSERT_EVENT_SQL, [
      applicationId,
      roleId,
      input.stage,
      input.status,
      input.occurredOn,
      input.occurredHour ?? null,
    ]);

    // No-op when the event just written was itself the 'applied' one, since
    // the guard inside the statement checks for an existing applied event.
    if (input.appliedOn) {
      await tx.query(INSERT_APPLIED_IF_MISSING_SQL, [
        applicationId,
        roleId,
        input.appliedOn,
      ]);
    }
  });

  return { ok: true, outcome: "logged", roleSlug: roleSlug ?? "" };
}
