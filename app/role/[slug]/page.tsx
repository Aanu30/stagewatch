import Link from "next/link";
import { notFound } from "next/navigation";
import LogStatusForm from "@/components/LogStatusForm";
import {
  Funnel,
  Medians,
  Selectivity,
  Timing,
} from "@/components/PulseNumbers";
import FormatForm from "@/components/FormatForm";
import FormatPanel from "@/components/FormatPanel";
import SetupNotice from "@/components/SetupNotice";
import { dbConfigured } from "@/lib/db";
import { dayAgo, firedAgo } from "@/lib/format";
import { readLocalId } from "@/lib/identity";
import { getFormatNotes, getFormats } from "@/lib/formats";
import { getPulse } from "@/lib/pulse";
import { getRoleBySlug, hasLogged } from "@/lib/queries";

// Numbers change constantly and the gate is decided per-visitor from a cookie,
// so there is nothing worth caching here.
export const dynamic = "force-dynamic";

export default async function RolePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!dbConfigured()) return <SetupNotice />;

  const { slug } = await params;

  const role = await getRoleBySlug(slug);
  if (!role) notFound();

  // The soft gate. Unlocked when this browser has logged its own status on
  // THIS role, per spec - not on any role.
  const localId = await readLocalId();
  const unlocked = localId ? await hasLogged(role.id, localId) : false;

  const [pulse, formats, formatNotes] = await Promise.all([
    getPulse(role, unlocked),
    getFormats(role.id),
    getFormatNotes(role.id),
  ]);

  return (
    <main className="shell">
      <header className="masthead">
        <p className="crumb">
          <Link href="/">← Fired today</Link>
        </p>
        <h1>
          {role.firm_name} · {role.division}
        </h1>
        <p>
          {role.programme_name} · {role.location} · {role.cycle}
        </p>
      </header>

      <div className="stack">
        {/* --- Headline. Free, ungated. The proof that the site is worth
            anything, shown before asking for a submission. --- */}
        <section className="panel headline">
          {pulse.headline ? (
            <>
              {/* One person reporting a stage is a report, not a fact. The
                  headline is ungated and unsuppressed by design - it is the
                  free hook that proves the site works before asking for a
                  submission - which means a single submission can make it say
                  anything. It must not sound certain when it is not. */}
              {(() => {
                const reporters =
                  pulse.activity.find((a) => a.code === pulse.headline!.stage)
                    ?.people ?? 0;
                return reporters <= 1 ? (
                  <>
                    <span className="tag">
                      {pulse.headline.stage_label} reported by 1 person
                    </span>
                    <p className="headline-text">
                      One person says this fired{" "}
                      {firedAgo(
                        pulse.headline.fired_at,
                        pulse.headline.occurred_on,
                      )}
                      .
                    </p>
                    <p className="caveat" style={{ marginTop: 8 }}>
                      A single report is not confirmation. It could be a
                      mistake, a different role, or someone testing the site.
                      Treat it as a lead, not a fact.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="tag tag-live">
                      {pulse.headline.stage_label} has fired
                    </span>
                    <p className="headline-text">
                      Most recent{" "}
                      {firedAgo(
                        pulse.headline.fired_at,
                        pulse.headline.occurred_on,
                      )}
                      <span className="dim"> · {reporters} reports</span>
                    </p>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <span className="tag">Nothing logged yet</span>
              <p className="headline-text">
                No stage has been reported for this role.
              </p>
            </>
          )}
          <p className="dim small">
            {pulse.total} {pulse.total === 1 ? "person has" : "people have"}{" "}
            logged this role.
          </p>
        </section>

        {/* --- Stage activity. Also free: whether a thing happened is a fact,
            not a rate. Offers are excluded entirely. --- */}
        <section className="panel">
          <h2>Stage activity</h2>
          <ul className="plain">
            {pulse.activity.map((a) => (
              <li key={a.code}>
                <strong>{a.label}:</strong>{" "}
                {a.people === 0 ? (
                  <span className="dim">nothing logged</span>
                ) : (
                  <>
                    <span className="mono">{a.people}</span> logged, last{" "}
                    {a.last_fired_at
                      ? firedAgo(a.last_fired_at, a.last_on)
                      : dayAgo(a.last_on)}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="faint small" style={{ marginTop: 10 }}>
            Offers never appear here. They are reported as a rate only, once
            enough people have logged this role.
          </p>
        </section>

        <FormatPanel formats={formats} notes={formatNotes} />

        {/* --- The gate --- */}
        {!unlocked && (
          <section className="panel gate">
            <h2>The numbers are one click away</h2>
            <p className="dim">
              Selectivity, the stage funnel, median timings and the histogram
              unlock once you log your own status on this role. That is what
              makes the percentages possible: without a complete denominator,
              nobody can tell you whether something was selective.
            </p>
          </section>
        )}

        {pulse.unlocked && (
          <>
            <Selectivity data={pulse.unlocked.selectivity} />
            <Funnel data={pulse.unlocked.funnel} />
            <Timing data={pulse.unlocked.timing} />
            <Medians data={pulse.unlocked.medians} />
          </>
        )}

        <section className="panel">
          <FormatForm key={`fmt-${role.slug}`} roleSlug={role.slug} />
        </section>

        <section className="panel">
          <LogStatusForm
            key={role.slug}
            roleSlug={role.slug}
            isGate={!unlocked}
          />
        </section>
      </div>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!dbConfigured()) return { title: "Stagewatch" };
  const role = await getRoleBySlug(slug).catch(() => null);
  if (!role) return { title: "Role not found · Stagewatch" };
  return {
    title: `${role.firm_name} ${role.division} · Stagewatch`,
    description: `Has it fired yet for ${role.firm_name} ${role.division}, ${role.location}, ${role.cycle}?`,
  };
}
