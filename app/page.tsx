import Link from "next/link";
import NewRoleForm from "@/components/NewRoleForm";
import SetupNotice from "@/components/SetupNotice";
import { dbConfigured } from "@/lib/db";
import {
  CATEGORIES,
  FEED_WINDOW_HOURS,
  OPEN_WINDOW_HOURS,
  TIERS,
} from "@/lib/constants";
import { dayAgo, firedAgo, timeAgo } from "@/lib/format";
import { getJustOpened } from "@/lib/postings";
import { getFiredFeed, searchRoles } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Search = { cat?: string; q?: string; tier?: string };

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
  const tier =
    sp.tier && TIERS.some((t) => t.code === sp.tier) ? sp.tier : null;

  const [feed, roles, opened] = await Promise.all([
    getFiredFeed(FEED_WINDOW_HOURS, category),
    searchRoles(category, term, tier),
    getJustOpened(OPEN_WINDOW_HOURS, category),
  ]);

  const open = roles.filter((r) => r.opened_at !== null);
  const unopened = roles.filter((r) => r.opened_at === null);

  const qs = (next: Partial<Search>) => {
    const p = new URLSearchParams();
    const cat = next.cat !== undefined ? next.cat : (category ?? "");
    const q = next.q !== undefined ? next.q : (sp.q ?? "");
    const tr = next.tier !== undefined ? next.tier : (tier ?? "");
    if (cat) p.set("cat", cat);
    if (q) p.set("q", q);
    if (tr) p.set("tier", tr);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Heard Back</h1>
        <p>
          Has anyone heard back yet, and was it selective. UK summer internship
          stages, Summer 2027.
        </p>
      </header>

      {/* Two independent filters. Category is what the job is; tier is what
          kind of firm it is. They are separate rows because they are separate
          questions - "bulge bracket IBD" is a combination of the two, not a
          single option in one list. */}
      <nav className="filters" aria-label="Function">
        <span className="filter-label">Function</span>
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

      <nav className="filters" aria-label="Firm type">
        <span className="filter-label">Firm</span>
        <Link className={!tier ? "chip chip-on" : "chip"} href={qs({ tier: "" })}>
          All
        </Link>
        {TIERS.map((t) => (
          <Link
            key={t.code}
            className={tier === t.code ? "chip chip-on" : "chip"}
            href={qs({ tier: t.code })}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="stack">
        {/* ------------------------------------------------------------------
            Just opened. Firm-side, not applicant-side: detected by polling the
            firms' own job boards, not submitted by anyone. It sits above the
            fired feed because an application opening is the earliest rung of
            the ladder and the most time-critical thing on the page.

            Deliberately NOT a list of what is open - that is a deadline
            aggregator, which others already do well. This only ever shows what
            opened inside the window, and disappears after it.
        ------------------------------------------------------------------ */}
        {opened.length > 0 && (
          <section className="panel">
            <h2>Applications opened in the last {OPEN_WINDOW_HOURS} hours</h2>
            <ul className="feed">
              {opened.map((o) => (
                <li key={`${o.firm_name}-${o.title}`}>
                  <div className="feed-row">
                    <span className="feed-stage tag tag-open">Opened</span>
                    <span className="feed-main">
                      <strong>{o.firm_name}</strong>
                      {" · "}
                      {/* Greenhouse and Lever titles have no comma structure
                          to parse a division out of, so division_guess is
                          often null. The raw title is real data and always
                          present - better than rendering nothing. */}
                      {o.division_guess ?? o.title}
                      <span className="dim">
                        {o.location_raw ? ` · ${o.location_raw.trim()}` : ""}
                        {o.cycle_guess ? ` · ${o.cycle_guess}` : ""}
                      </span>
                    </span>
                    <span className="feed-meta faint mono">
                      detected {timeAgo(o.first_seen_at)}
                      {o.url && (
                        <>
                          {" · "}
                          <a href={o.url} target="_blank" rel="noopener noreferrer">
                            apply
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="faint small" style={{ marginTop: 10 }}>
              Detected automatically from the firms&apos; own job boards.
              Nobody logged these. &ldquo;Detected&rdquo; is when this site
              first saw the posting, which can be several hours after the firm
              actually opened it — the check runs roughly hourly and is not
              guaranteed. Anything that opened before this was switched on will
              not appear at all.
            </p>
          </section>
        )}

        {/* ------------------------------------------------------------------
            Who has heard back. Aggregated by role and stage rather than listed as
            individual events, which is both denser and the cheapest possible
            enforcement of "never display an individual offer claim": offers
            are excluded in SQL, so the rows never leave the database.
        ------------------------------------------------------------------ */}
        <section className="panel">
          <h2>Heard back in the last {FEED_WINDOW_HOURS} hours</h2>

          {feed.length === 0 ? (
            <p className="dim">
              Nobody has reported hearing back in the last {FEED_WINDOW_HOURS}
              hours. Find your role below and log where you are — that is what
              makes this work.
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

          {/* Open vs catalogued. The 117 seeded roles were written from how
              these firms are usually structured, not from checking a live
              posting, and most Summer 2027 applications do not open until late
              September. Presenting them as one list tells the visitor
              something untrue about most of them. "It opened last year" is not
              evidence it is open now. */}
          {open.length > 0 && (
            <>
              <p className="dim small">
                {open.length} confirmed open — either a live posting was
                detected, or somebody logged an application.
              </p>
              <ul className="rolelist">
                {open.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/role/${r.slug}`}>
                      <span className="rolelist-main">
                        <strong>{r.firm_name}</strong> · {r.division}
                      </span>
                      <span className="dim small">
                        {r.location} · {r.programme_name}
                      </span>
                      <span className="tag tag-live">
                        {r.opened_evidence === "posting" ? "open" : "reported"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="dim small" style={{ marginTop: open.length ? 18 : 0 }}>
            {unopened.length} listed but <strong>not confirmed open</strong>
            {term ? ` matching “${sp.q}”` : ""}. These are roles these firms
            usually run. Nothing here says they are accepting applications yet.
          </p>
          <ul className="rolelist rolelist-muted">
            {unopened.map((r) => (
              <li key={r.slug}>
                <Link href={`/role/${r.slug}`}>
                  <span className="rolelist-main">
                    <strong>{r.firm_name}</strong> · {r.division}
                  </span>
                  <span className="dim small">
                    {r.location} · {r.programme_name}
                  </span>
                  <span className="faint mono small">
                    {/* The heading above says "not confirmed open", which is
                        a claim about our evidence. "not open yet" was a claim
                        about the world, repeated on every one of these rows,
                        and we do not know it. */}
                    {r.logged === 0 ? "no opening date" : `${r.logged} logged`}
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
          <p>
            <Link href="/privacy">What this site stores</Link> ·{" "}
            <a
              href="https://github.com/Aanu30/stagewatch"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
