// Shown when DATABASE_URL is absent. The site is deployed to Vercel before the
// Supabase project exists (deployment was de-risked first, on purpose), so this
// is the expected day-one state rather than an error.

export default function SetupNotice() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1>Stagewatch</h1>
        <p>
          Has it fired yet, and was it selective. UK summer internship stages,
          Summer 2027.
        </p>
      </header>

      <section className="panel">
        <span className="tag">Not connected to a database yet</span>
        <p style={{ marginTop: 12 }}>
          The application is deployed and working. It has nowhere to read from
          or write to.
        </p>

        <h3 style={{ marginTop: 20 }}>To finish setup</h3>
        <ol className="plain" style={{ marginTop: 8 }}>
          <li>Create a Supabase project.</li>
          <li>
            Copy the <strong>transaction pooler</strong> connection string, port{" "}
            <span className="mono">6543</span>. Not the direct connection — that
            is IPv6-only on the free tier and Vercel cannot reach it.
          </li>
          <li>
            Set it as <span className="mono">DATABASE_URL</span> in the Vercel
            project, and in <span className="mono">.env.local</span> for local
            work.
          </li>
          <li>
            Run <span className="mono">db/001_schema.sql</span> then{" "}
            <span className="mono">db/002_seed.sql</span> in the Supabase SQL
            editor.
          </li>
          <li>
            Set <span className="mono">ADMIN_PASSWORD</span> and{" "}
            <span className="mono">IP_HASH_SALT</span> too. Without the salt,
            IP-based rate limiting is skipped and only the per-browser limit
            applies.
          </li>
        </ol>

        <p className="faint small" style={{ marginTop: 16 }}>
          To run everything locally without Supabase:{" "}
          <span className="mono">npm run db:local:fixture</span>, then point{" "}
          <span className="mono">DATABASE_URL</span> at{" "}
          <span className="mono">127.0.0.1:5433</span>.
        </p>
      </section>
    </main>
  );
}
