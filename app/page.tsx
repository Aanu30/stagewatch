export default function Home() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1>Stagewatch</h1>
        <p>
          Has it fired yet, and was it selective. UK summer internship stages,
          Summer 2027 cycle.
        </p>
      </header>

      <div className="stack">
        <section className="panel">
          <span className="tag tag-live">Deployed</span>
          <p style={{ marginTop: 12 }}>
            Scaffold is live. Nothing is wired to a database yet.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            Next up: schema, then seed data, then the submission handler.
          </p>
        </section>

        <section className="panel">
          <p className="faint mono">
            build order: 1 scaffold · 2 schema · 3 seed · 4 submit · 5
            aggregations · 6 pulse page · 7 fired-today feed · 8 soft gate · 9
            rate limit + n≥10 · 10 admin queue · 11 verification
          </p>
        </section>
      </div>
    </main>
  );
}
