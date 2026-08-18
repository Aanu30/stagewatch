import { section, spread, type FormatNote, type FormatRow } from "@/lib/formats";

// Renders what the assessment actually consists of. Unlike every other panel on
// this page there is no n >= 10 gate: a format is a description of an artefact
// everyone receives identically, not a rate over a population, so one account
// is informative. The honesty mechanism is showing disagreement instead.

const SECTION_LABELS: Array<[keyof FormatRow, keyof FormatRow, string]> = [
  ["numerical_yes", "numerical_said", "Numerical"],
  ["logical_yes", "logical_said", "Logical"],
  ["verbal_yes", "verbal_said", "Verbal"],
  ["situational_yes", "situational_said", "Situational"],
  ["behavioural_yes", "behavioural_said", "Behavioural"],
  ["coding_yes", "coding_said", "Coding"],
];

function Figure({
  label,
  data,
  unit,
  reports,
}: {
  label: string;
  data: ReturnType<typeof spread>;
  unit: string;
  reports: number;
}) {
  if (!data) return null;
  return (
    <li>
      <strong>{label}:</strong>{" "}
      {data.conflicted ? (
        <>
          <span className="mono">
            {data.min}–{data.max} {unit}
          </span>{" "}
          <span className="warnish">reports disagree</span>
        </>
      ) : (
        <span className="mono">
          {data.value} {unit}
        </span>
      )}{" "}
      <span className="faint">
        from {reports} {reports === 1 ? "report" : "reports"}
      </span>
    </li>
  );
}

export default function FormatPanel({
  formats,
  notes,
}: {
  formats: FormatRow[];
  notes: FormatNote[];
}) {
  if (formats.length === 0) {
    return (
      <section className="panel">
        <h2>What the assessment is like</h2>
        <p className="dim">
          Nobody has described it yet. If you have sat it, the form below takes
          about twenty seconds and is the single most useful thing you can add —
          it is the question people ask most and the one nobody can answer from
          a group chat.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>What the assessment is like</h2>
      <p className="dim small">
        Described by people who sat it. Not suppressed at low numbers, because
        this is a description rather than a rate — but the report count is
        always shown, and disagreement is flagged rather than averaged away.
      </p>

      {formats.map((f) => {
        const dur = spread(f.duration_median, f.duration_min, f.duration_max);
        const qs = spread(f.questions_median, f.questions_min, f.questions_max);
        const sections = SECTION_LABELS.map(([y, s, label]) => ({
          label,
          data: section(f[y] as number, f[s] as number),
        })).filter((x) => x.data !== null);

        return (
          <div key={f.stage} className="fmt">
            <h3>
              {f.stage_label}{" "}
              <span className="faint">
                · {f.reports} {f.reports === 1 ? "report" : "reports"}
              </span>
            </h3>

            <ul className="plain">
              <Figure label="Length" data={dur} unit="min" reports={f.duration_reports} />
              <Figure label="Questions" data={qs} unit="" reports={f.questions_reports} />

              {sections.length > 0 && (
                <li>
                  <strong>Sections:</strong>{" "}
                  {sections.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 && " · "}
                      <span className={s.data!.present ? "" : "faint strike"}>
                        {s.label}
                      </span>
                      {!s.data!.unanimous && (
                        <span className="faint">
                          {" "}
                          ({s.data!.yes}/{s.data!.said})
                        </span>
                      )}
                    </span>
                  ))}
                </li>
              )}

              {f.hv_questions_median != null && (
                <li>
                  <strong>Video questions:</strong>{" "}
                  <span className="mono">{Math.round(f.hv_questions_median)}</span>
                </li>
              )}
              {f.hv_retakes_said > 0 && (
                <li>
                  <strong>Retakes:</strong>{" "}
                  {f.hv_retakes_yes / f.hv_retakes_said > 0.5 ? "allowed" : "not allowed"}{" "}
                  <span className="faint">
                    ({f.hv_retakes_yes}/{f.hv_retakes_said})
                  </span>
                </li>
              )}
              {f.hv_live_said > 0 && (
                <li>
                  <strong>Format:</strong>{" "}
                  {f.hv_live_yes / f.hv_live_said > 0.5 ? "live" : "pre-recorded"}{" "}
                  <span className="faint">
                    ({f.hv_live_yes}/{f.hv_live_said})
                  </span>
                </li>
              )}
            </ul>
          </div>
        );
      })}

      {notes.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Notes</h3>
          <ul className="plain">
            {notes.map((n, i) => (
              <li key={i}>
                <span className="dim small">{n.notes}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
