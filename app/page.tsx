import Link from "next/link";
import NewRoleForm from "@/components/NewRoleForm";
import SetupNotice from "@/components/SetupNotice";
import { dbConfigured } from "@/lib/db";
import { CATEGORIES, FEED_WINDOW_HOURS } from "@/lib/constants";
import { dayAgo, firedAgo, timeAgo } from "@/lib/format";
import { getFiredFeed, searchRoles } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Search = { cat?: string; q?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (!dbConfigured()) return <SetupNotice />;

  const sp = await searchParams;

  const category =
    sp.cat && CATEGORIES.some((c) => c.code === sp.cat) ? sp.cat : null;
  const term = sp.q?.trim().toLowerCase() || null;

  const [feed, roles] = await Promise.all([
    getFiredFeed(FEED_WINDOW_HOURS, category),
    searchRoles(category, term),
  ]);

  const qs = (next: Partial<Search>) => {
    const p = new URLSearchParams();
    const cat = next.cat !== undefined ? next.cat : (category ?? "");
    const q = next.q !== undefined ? next.q : (sp.q ?? "");
    if (cat) p.set("cat", cat);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Stagewatch</h1>
        <p>
          Has it fired yet, and was it selective. UK summer internship stages,
          Summer 2027.
        </p>
      </header>

      <nav className="filters">
        <Link className={!category ? "chip chip-on" : "chip"} href={qs({ cat: "" })}>
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.code}
            className={category === c.code ? "chip chip-on" : "chip"}
            href={qs({ cat: c.code })}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <div className="stack">
        {/* ------------------------------------------------------------------
            Fired today. Aggregated by role and stage rather than listed as
            individual events, which is both denser and the cheapest possible
            enforcement of "never display an individual offer claim": offers
            are excluded in SQL, so the rows never leave the database.
        ------------------------------------------------------------------ */}
        <section className="panel">
          <h2>Fired in the last {FEED_WINDOW_HOURS} hours</h2>

          {feed.length === 0 ? (
            <p className="dim">
              Nothing logged in the last {FEED_WINDOW_HOURS} hours. Find your
              role below and log where you are — that is what makes this work.
            </p>
          ) : (
            <ul className="feed">
              {feed.map((row) => (
                <li key={`${row.role_slug}-${row.stage}`}>
                  <Link href={`/role/${row.role_slug}`} className="feed-row">
                    <span className="feed-stage tag tag-live">
                      {row.stage_label}
                    </span>
                    <span className="feed-main">
                      <strong>{row.firm_name}</strong> · {row.division}
                      <span className="dim">
                        {" "}
                        · {row.location} · {row.programme_name}
                      </span>
                    </span>
                    <span className="feed-meta faint mono">
                      {row.people} logged ·{" "}
                      {row.last_fired_at
                        ? firedAgo(row.last_fired_at, row.last_on)
                        : dayAgo(row.last_on)}
                      <span className="feed-logged">
                        {" "}
                        · last update {timeAgo(row.last_logged_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------------------
            Role browser. Not a third page - the feed only shows roles where
            something has already fired, which on day one is none of them.
            Without this there is no way to log anything and the site cannot
            bootstrap.
        ------------------------------------------------------------------ */}
        <section className="panel">
          <h2>Find your role</h2>

          <form className="search" method="get" action="/">
            {category && <input type="hidden" name="cat" value={category} />}
            <input
              type="search"
              name="q"
              placeholder="Firm, division or location — try bofa, m&a, amsterdam"
              defaultValue={sp.q ?? ""}
            />
            <button type="submit">Search</button>
          </form>

          <p className="dim small">
            {roles.length} role{roles.length === 1 ? "" : "s"}
            {term ? ` matching “${sp.q}”` : ""}.
          </p>

          <ul className="rolelist">
            {roles.map((r) => (
              <li key={r.slug}>
                <Link href={`/role/${r.slug}`}>
                  <span className="rolelist-main">
                    <strong>{r.firm_name}</strong> · {r.division}
                  </span>
                  <span className="dim small">
                    {r.location} · {r.programme_name}
                  </span>
                  <span className="faint mono small">
                    {r.logged === 0 ? "none logged" : `${r.logged} logged`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {roles.length === 0 && (
            <p className="dim">
              Nothing matched. If your role genuinely is not listed, add it
              below.
            </p>
          )}
        </section>

        <section className="panel">
          <NewRoleForm />
        </section>

        <footer className="footnote faint small">
          <p>
            Anonymous. No accounts, no email, no verification. An identifier is
            generated in your browser so you can update your own entries; it is
            never shown publicly.
          </p>
          <p>
            Percentages are suppressed below 10 responses, and individual offers
            are never displayed — only offer rates. Numbers here are
            crowdsourced and self-selected, so treat progression rates as an
            upper bound.
          </p>
        </footer>
      </div>
    </main>
  );
}
