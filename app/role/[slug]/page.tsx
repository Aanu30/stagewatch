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
import WhereYouStand from "@/components/WhereYouStand";
import { dbConfigured } from "@/lib/db";
import { dayAgo, firedAgo } from "@/lib/format";
import { readLocalId } from "@/lib/identity";
import { getFormatNotes, getFormats } from "@/lib/formats";
import { getPulse } from "@/lib/pulse";
import { getRoleBySlug, getWhereYouStand, hasLogged } from "@/lib/queries";

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

  // Whether this browser has logged on THIS role, per spec - not on any role.
  // Whether that actually gates anything is decided in lib/pulse.ts, which
  // knows the sample size: a role with nothing to show is never gated.
  const localId = await readLocalId();
  const hasOwnLog = localId ? await hasLogged(role.id, localId) : false;

  const [pulse, formats, formatNotes, stand] = await Promise.all([
    getPulse(role, hasOwnLog),
    getFormats(role.id),
    getFormatNotes(role.id),
    // Only meaningful once they have logged - it compares them to everyone
    // else, and there is nothing to compare without their own row.
    hasOwnLog && localId ? getWhereYouStand(role.id, localId) : null,
  ]);

  return (
    <main className="shell">
      <header className="masthead">
        <p className="crumb">
          <Link href="/">← Heard Back</Link>
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

        {/* --- The gate, which only appears when there is genuinely
            something behind it. See lib/pulse.ts. --- */}
        {pulse.gateEngaged && (
          <section className="panel gate">
            <h2>The numbers are one click away</h2>
            <p className="dim">
              {pulse.total} people have logged this role, so there are real
              percentages here: selectivity, the stage funnel and how long each
              stage took. Log your own status to see them. That is what makes
              them possible — without a complete denominator, nobody can tell
              you whether something was selective.
            </p>
          </section>
        )}

        {pulse.unlocked && (
          <>
            <WhereYouStand stand={stand} />
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
            isGate={pulse.gateEngaged}
            hasLogged={hasOwnLog}
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
  if (!dbConfigured()) return { title: "Heard Back" };
  const role = await getRoleBySlug(slug).catch(() => null);
  if (!role) return { title: "Role not found · Heard Back" };
  return {
    title: `${role.firm_name} ${role.division} · Heard Back`,
    description: `Has anyone heard back for ${role.firm_name} ${role.division}, ${role.location}, ${role.cycle}?`,
  };
}
