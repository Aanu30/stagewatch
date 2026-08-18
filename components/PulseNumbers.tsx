import { MIN_N } from "@/lib/constants";
import { pct, shortDate } from "@/lib/format";
import { isSuppressed, type Unlocked } from "@/lib/pulse";

// Every number on this page arrives already suppressed. These components can
// only render what lib/pulse.ts chose to hand them, which is why there is no
// threshold logic in here beyond deciding what wording to show.

function NotEnough({ n, threshold }: { n: number; threshold: number }) {
  return (
    <p className="dim">
      Not enough data yet. {n} {n === 1 ? "person has" : "people have"} logged
      this role; breakdowns appear at {threshold}.
    </p>
  );
}

export function Selectivity({ data }: { data: Unlocked["selectivity"] }) {
  if (isSuppressed(data)) {
    return (
      <section className="panel">
        <h2>Selectivity</h2>
        <NotEnough n={data.n} threshold={data.threshold} />
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Selectivity</h2>
      <p className="dim small">
        Share of everyone who logged this role who have logged reaching each
        stage.
      </p>

      <div className="bars">
        {data.map((row) => (
          <div className="bar-row" key={row.code}>
            <div className="bar-label">{row.label}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${Math.min(row.percent, 100)}%` }}
              />
            </div>
            <div className="bar-value mono">
              {pct(row.percent)}
              <span className="faint">
                {" "}
                {row.reached === null
                  ? `of ${row.denominator}`
                  : `(${row.reached}/${row.denominator})`}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="faint small" style={{ marginTop: 14 }}>
        Offer figures are shown as a rate only, never as a count, and never
        below n = {MIN_N}.
      </p>
      <p className="caveat">
        Read these as an upper bound. People who have just heard something have
        more reason to visit and log than people who have heard nothing, so the
        denominator under-counts the silent and every rate here reads higher
        than reality.
      </p>
    </section>
  );
}

export function Funnel({ data }: { data: Unlocked["funnel"] }) {
  if (isSuppressed(data)) {
    return (
      <section className="panel">
        <h2>Stage funnel</h2>
        <NotEnough n={data.n} threshold={data.threshold} />
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Stage funnel</h2>
      <p className="dim small">
        Where people stand at each stage. The ladder is sparse: firms skip
        stages, so a gap means nobody logged it, not that nobody reached it.
      </p>

      <table className="grid">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Waiting</th>
            <th>Progressed</th>
            <th>Rejected</th>
            <th>Withdrew</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.code}>
              <td>{row.label}</td>
              <td className="mono">{row.waiting}</td>
              <td className="mono">{row.progressed}</td>
              <td className="mono">{row.rejected}</td>
              <td className="mono">{row.withdrew}</td>
              <td className="mono strong">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="faint small" style={{ marginTop: 12 }}>
        &quot;Waiting&quot; is the point of this table. The funnel is computable
        without anybody ever logging a rejection.
      </p>
    </section>
  );
}

export function Medians({ data }: { data: Unlocked["medians"] }) {
  if (isSuppressed(data)) {
    return (
      <section className="panel">
        <h2>How long it takes</h2>
        <NotEnough n={data.n} threshold={data.threshold} />
      </section>
    );
  }

  if (data.length === 0) {
    return (
      <section className="panel">
        <h2>How long it takes</h2>
        <p className="dim">
          Nobody has yet logged both an application date and a later stage.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>How long it takes</h2>
      <p className="dim small">
        Measured from the day people applied.
      </p>

      <ul className="plain">
        {data.map((row) => {
          // "Is it instant?" is asked directly and repeatedly in the source
          // chat; "what is the median gap" is asked by nobody. Same number,
          // and the sentence is the product rather than the statistic.
          const instant = row.medianDays < 1;
          return (
            <li key={row.code}>
              {instant ? (
                <>
                  <strong>{row.label} is instant</strong> — it arrives the same
                  day you apply.{" "}
                  <span className="faint">n = {row.n}</span>
                </>
              ) : (
                <>
                  <strong>{row.label}:</strong> most people had it within{" "}
                  <span className="mono">{Math.ceil(row.medianDays)} days</span>{" "}
                  of applying. <span className="faint">n = {row.n}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <p className="caveat">
        Half of people waited longer than this, so being past it is not a
        rejection. It moves a lot at these sample sizes.
      </p>
    </section>
  );
}

export function Timing({ data }: { data: Unlocked["timing"] }) {
  if (!data) return null;

  const maxDay = Math.max(1, ...data.byDay.map((d) => d.n));

  return (
    <section className="panel">
      <h2>When {data.stageLabel.toLowerCase()} fired</h2>
      <p className="dim small">Last 7 days.</p>

      {data.byDay.length === 0 ? (
        <p className="dim">Nothing in the last 7 days.</p>
      ) : (
        <div className="hist">
          {data.byDay.map((d) => (
            <div className="hist-col" key={String(d.occurred_on)}>
              <div className="hist-bar-wrap">
                <div
                  className="hist-bar"
                  style={{ height: `${(d.n / maxDay) * 100}%` }}
                  title={`${d.n}`}
                />
              </div>
              <div className="hist-tick faint">{shortDate(d.occurred_on)}</div>
              <div className="hist-n mono">{d.n}</div>
            </div>
          ))}
        </div>
      )}

      {/* The hour-of-day chart was removed deliberately. It was built for the
          spec's "are they sending gradually?", a question nobody in five days
          of the source chat ever asked - and it ran on the weakest data on the
          site, since only the subset of people who remembered the hour appear
          in it. What people actually ask is whether it has fired and whether
          it is instant, both answered elsewhere on this page. */}
    </section>
  );
}
