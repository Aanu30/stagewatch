import { MIN_N, MIN_N_MEDIAN } from "@/lib/constants";
import { hourLabel, pct, shortDate } from "@/lib/format";
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
          No stage yet has {MIN_N_MEDIAN} people who logged both their
          application date and a later stage.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>How long it takes</h2>
      <p className="dim small">Median days from applying to each stage.</p>

      <ul className="plain">
        {data.map((row) => (
          <li key={row.code}>
            <strong>Applied → {row.label}:</strong>{" "}
            <span className="mono">{row.medianDays} days</span>{" "}
            <span className="faint">median, n = {row.n}</span>
          </li>
        ))}
      </ul>

      <p className="caveat">
        A median moves a lot at these sample sizes. Treat it as a rough
        expectation, not a deadline after which you have been rejected.
      </p>
    </section>
  );
}

export function Timing({ data }: { data: Unlocked["timing"] }) {
  if (!data) return null;

  const maxDay = Math.max(1, ...data.byDay.map((d) => d.n));
  const maxHour = Math.max(1, ...data.byHour.map((h) => h.n));

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

      <h3 style={{ marginTop: 20 }}>By hour</h3>
      {data.byHour.length === 0 ? (
        <p className="dim small">
          Nobody who logged this knew the hour, so there is nothing to plot.
        </p>
      ) : (
        <>
          <div className="hist hist-hours">
            {data.byHour.map((h) => (
              <div className="hist-col" key={h.occurred_hour}>
                <div className="hist-bar-wrap">
                  <div
                    className="hist-bar"
                    style={{ height: `${(h.n / maxHour) * 100}%` }}
                    title={`${h.n}`}
                  />
                </div>
                <div className="hist-tick faint">
                  {hourLabel(h.occurred_hour)}
                </div>
              </div>
            ))}
          </div>
          <p className="caveat">
            Based on {data.hourN}{" "}
            {data.hourN === 1 ? "person who" : "people who"} knew the hour, not
            on everyone who logged this stage. That is a smaller sample than the
            daily chart above.
          </p>
        </>
      )}
    </section>
  );
}
