import { demoMode } from "@/lib/db";

// Renders only in demo mode. The site is otherwise indistinguishable from
// production - same engine, same queries, same numbers - so the difference has
// to be stated rather than inferred. Somebody who logs a status and later finds
// it gone should have been told first.

export default function DemoBanner() {
  if (!demoMode()) return null;

  return (
    <div className="demobar">
      <strong>Demo.</strong> Real application, real Postgres, seeded with 50
      invented applications. Nothing you submit is kept — the database lives in
      memory and resets. No real data here, and none collected.
    </div>
  );
}
