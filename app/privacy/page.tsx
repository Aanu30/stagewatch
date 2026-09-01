import Link from "next/link";
import { IP_RETENTION_HOURS } from "@/lib/postings";
import { MAX_APPLICATIONS_PER_DAY_IP, MAX_APPLICATIONS_PER_DAY_LOCAL } from "@/lib/constants";

// Written to match what the code actually does, not what is convenient to
// claim. Every statement here is checkable against a named file, and the file
// is named so it can be checked. If the code changes, this page is wrong until
// it is changed too.

export const metadata = {
  title: "Privacy · Heard Back",
  description: "What Heard Back stores, why, and for how long.",
};

export default function PrivacyPage() {
  return (
    <main className="shell prose">
      <header className="masthead">
        <p className="crumb">
          <Link href="/">← Heard Back</Link>
        </p>
        <h1>Privacy</h1>
        <p>
          What this site stores, why it stores it, and how long it keeps it.
        </p>
      </header>

      <div className="stack">
        <section className="panel">
          <h2>The short version</h2>
          <p>
            No account, no email address, no name, no password. You are never
            asked who you are and there is no way to tell the site.
          </p>
          <p style={{ marginTop: 10 }}>
            Two things identify your browser rather than you: a random
            identifier generated on your device, and a one-way hash of your IP
            address kept for {IP_RETENTION_HOURS} hours. Both exist so the site
            can work at all. Details below.
          </p>
        </section>

        <section className="panel">
          <h2>What is stored</h2>

          <h3 style={{ marginTop: 14 }}>A random identifier for your browser</h3>
          <p className="dim">
            When you first log a status, your browser generates a random
            identifier — the kind of value that looks like{" "}
            <span className="mono">3e624d7e-6d66-4eec-a1f0-b56b61498bb3</span> —
            and stores it locally. It is not derived from anything about you or
            your device; it is random.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            It does three jobs: it lets you update an entry you made earlier, it
            stops one person being counted as several (which would make every
            percentage on the site wrong), and it caps submissions at{" "}
            {MAX_APPLICATIONS_PER_DAY_LOCAL} a day.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            <strong>It is never shown to anyone.</strong> No page displays it,
            and nothing links your entries together publicly.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            The same value is also written to a cookie named{" "}
            <span className="mono">sw_uid</span>. That is not tracking — the
            server needs to know whether you have logged a status on the role
            you are looking at, in order to decide what to show you, and it
            cannot read your browser&apos;s local storage. No other cookie is
            set. There is no analytics, no advertising, and no third-party
            script on this site.
          </p>

          <h3 style={{ marginTop: 18 }}>A hash of your IP address</h3>
          <p className="dim">
            When you submit something, your IP address is combined with a secret
            value and put through a one-way hash. The result is stored; your
            actual IP address is not, at any point.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            It exists only to cap submissions at {MAX_APPLICATIONS_PER_DAY_IP} a
            day from one network, so a single person cannot manufacture a
            consensus. It is deleted after {IP_RETENTION_HOURS} hours, which is
            longer than the limit it enforces and no longer than that.
          </p>

          <h3 style={{ marginTop: 18 }}>What you tell us</h3>
          <p className="dim">
            The role, the stage, whether you are waiting or progressed or
            rejected, and the dates. Optionally a description of what an
            assessment consisted of. That is the entire dataset.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            You are never asked for an opinion. Whether something was selective
            is worked out from the ratio of people who reached each stage — it
            is never a question on a form, because a guess presented as data is
            worse than no data.
          </p>
        </section>

        <section className="panel">
          <h2>What is shown to other people</h2>
          <p className="dim">
            Only aggregates. Individual entries are never displayed, and three
            rules protect that:
          </p>
          <ul className="plain" style={{ marginTop: 8 }}>
            <li className="dim">
              Percentages and breakdowns appear only once at least ten people
              have logged a role. Below that the site says it does not have
              enough data, and the underlying numbers are discarded on the
              server before the page is built.
            </li>
            <li className="dim">
              <strong>Offers are never shown as a count</strong>, only ever as a
              rate, and only above that same threshold. A role where one person
              has an offer shows nothing about it anywhere on the site.
            </li>
            <li className="dim">
              Where a single person has reported something, the site says so
              rather than presenting it as established.
            </li>
          </ul>
        </section>

        <section className="panel">
          <h2>Deleting your data</h2>
          <p className="dim">
            Clearing your browser storage for this site removes the identifier,
            after which nothing connects you to what you submitted — including
            for us.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            That also means we cannot then find your entries to remove them. If
            you want them deleted, ask <strong>before</strong> clearing your
            browser, and include the identifier so the right rows can be found.
            Because there is no account system, that identifier is the only
            handle that exists.
          </p>
        </section>

        <section className="panel">
          <h2>Being straight about the legal position</h2>
          <p className="dim">
            A random identifier that persists and is tied to behaviour is
            probably <em>pseudonymous</em> rather than anonymous under UK GDPR,
            and pseudonymous data is still personal data. A hashed IP address is
            arguably the same. This site is run by one student and is not backed
            by a legal review — that assessment could be wrong in either
            direction, and it is stated plainly rather than glossed over.
          </p>
          <p className="dim" style={{ marginTop: 8 }}>
            What follows from it is the design above: collect the least that
            makes the thing work, never display an individual, delete the IP
            hash quickly, and add no analytics or third-party scripts.
          </p>
        </section>

        <section className="panel">
          <h2>Where the data lives</h2>
          <p className="dim">
            A Postgres database hosted by Supabase in the EU (eu-west-1), and
            the site itself on Vercel. The source code is public at{" "}
            <a
              href="https://github.com/Aanu30/stagewatch"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/Aanu30/stagewatch
            </a>
            , so every claim on this page can be checked against the code rather
            than taken on trust.
          </p>
        </section>

        <section className="panel">
          <h2>Where job openings come from</h2>
          <p className="dim">
            Some entries are not submitted by anyone. The site checks the
            firms&apos; own public job boards on a schedule and records when a
            posting appears. That involves no personal data — it reads public
            listings, the same ones anyone can see on a careers page.
          </p>
        </section>
      </div>
    </main>
  );
}
