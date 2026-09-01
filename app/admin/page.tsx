import SetupNotice from "@/components/SetupNotice";
import { CATEGORIES } from "@/lib/constants";
import { dbConfigured } from "@/lib/db";
import { shortDate, timeAgo } from "@/lib/format";
import { getAllRolesBrief, getPendingQueue, isAdmin } from "@/lib/admin";
import {
  approveAction,
  logoutAction,
  loginAction,
  mergeAction,
  rejectAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Merge queue · Heard Back", robots: "noindex" };

export default async function AdminPage() {
  if (!dbConfigured()) return <SetupNotice />;

  if (!(await isAdmin())) {
    return (
      <main className="shell">
        <header className="masthead">
          <h1>Merge queue</h1>
        </header>
        <section className="panel">
          <form action={loginAction} className="logform">
            <label>
              <span>Password</span>
              <input type="password" name="password" required autoFocus />
            </label>
            <button type="submit">Sign in</button>
          </form>
          {!process.env.ADMIN_PASSWORD && (
            <p className="error" style={{ marginTop: 12 }}>
              ADMIN_PASSWORD is not set, so no password can succeed. Set it in
              .env.local and in the Vercel project&apos;s environment variables.
            </p>
          )}
        </section>
      </main>
    );
  }

  const [queue, roles] = await Promise.all([
    getPendingQueue(),
    getAllRolesBrief(),
  ]);

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Merge queue</h1>
        <p>
          {queue.length} pending. Only submissions that survived normalising,
          the alias table and fuzzy matching reach this page.
        </p>
      </header>

      <div className="stack">
        {queue.length === 0 && (
          <section className="panel">
            <p className="dim">
              Nothing pending. If this page is busy every day, add aliases
              rather than checking it more often — an alias is permanent and
              free.
            </p>
          </section>
        )}

        {queue.map((q) => (
          <section className="panel" key={q.id}>
            <div className="queue-head">
              <strong>{q.raw_firm}</strong>
              <span className="faint mono small">
                #{q.id} · {timeAgo(q.created_at)}
              </span>
            </div>

            <table className="grid" style={{ marginTop: 12 }}>
              <tbody>
                <tr>
                  <td className="dim">Normalised</td>
                  <td className="mono">{q.norm_firm}</td>
                </tr>
                <tr>
                  <td className="dim">Programme</td>
                  <td>{q.raw_programme ?? "—"}</td>
                </tr>
                <tr>
                  <td className="dim">Division</td>
                  <td>{q.raw_division ?? "—"}</td>
                </tr>
                <tr>
                  <td className="dim">Location</td>
                  <td>{q.raw_location ?? "—"}</td>
                </tr>
                <tr>
                  <td className="dim">Their submission</td>
                  <td>
                    {q.raw_stage} · {q.raw_status} ·{" "}
                    {shortDate(q.raw_occurred_on)}
                  </td>
                </tr>
                {q.suggested_firm_name && (
                  <tr>
                    <td className="dim">Fuzzy suggestion</td>
                    <td>{q.suggested_firm_name}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="queue-actions">
              <form action={approveAction}>
                <input type="hidden" name="id" value={q.id} />
                <select name="category" defaultValue="ib_markets">
                  {CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button type="submit">Approve as new role</button>
              </form>

              <form action={mergeAction}>
                <input type="hidden" name="id" value={q.id} />
                <select name="target" defaultValue="">
                  <option value="" disabled>
                    Merge into…
                  </option>
                  {/* The programme belongs in this label. Without it, UBS
                      summer IB and UBS off-cycle IB render as two identical
                      lines and the merge becomes a coin flip - which is the
                      precise confusion this whole product exists to remove. */}
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.firm_name} · {r.division} · {r.location} ·{" "}
                      {r.programme_name}
                    </option>
                  ))}
                </select>
                <button type="submit">Merge</button>
              </form>

              <form action={rejectAction}>
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="ghost">
                  Reject
                </button>
              </form>
            </div>
          </section>
        ))}

        <section className="panel">
          <form action={logoutAction}>
            <button type="submit" className="ghost">
              Sign out
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
