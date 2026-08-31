import { MIN_N } from "@/lib/constants";
import type { WhereYouStand as Stand } from "@/lib/queries";

// The panel the whole site exists for. Everything else here is aggregate and
// leaves the visitor to do the comparison themselves; this does it for them.
//
// It is also the most consequential thing on the site, because somebody may
// stop chasing an application on the strength of it. Three rules follow:
//
//   1. Never say "you are rejected". The site cannot know that. It can only
//      say what proportion of people have moved past where you are.
//   2. Say nothing at all below MIN_N. "3 of 4 people are ahead of you" is
//      noise dressed as a verdict.
//   3. Weigh people LEVEL with you as heavily as those ahead. If most are
//      still waiting too, silence means nothing yet - and saying so is as
//      valuable as the warning.

export default function WhereYouStand({ stand }: { stand: Stand | null }) {
  if (!stand) return null;

  const others = Number(stand.others_total ?? 0);
  const ahead = Number(stand.ahead_of_you ?? 0);
  const level = Number(stand.level_with_you ?? 0);
  const days = stand.days_since_first_event;
  const waiting = stand.my_status === "waiting";

  // Below the threshold this is guesswork, and guesswork here changes what
  // somebody does about a real application.
  if (others + 1 < MIN_N) {
    return (
      <section className="panel">
        <h2>Where you stand</h2>
        <p className="dim">
          Only {others + 1} {others + 1 === 1 ? "person has" : "people have"}{" "}
          logged this role. That is too few to tell you anything about your own
          position — with numbers this small, whoever happens to have logged
          decides the answer.
        </p>
      </section>
    );
  }

  const pctAhead = Math.round((ahead / others) * 100);
  const pctLevel = Math.round((level / others) * 100);

  // Only a clear majority moving past you is worth a warning. Below that, the
  // honest reading is that it is still in progress.
  const mostHaveMoved = pctAhead >= 60;
  const manyStillWaiting = pctLevel >= 40;

  return (
    <section className="panel stand">
      <h2>Where you stand</h2>

      <p className="stand-line">
        {waiting ? (
          <>
            You are waiting at <strong>{labelFor(stand.my_stage)}</strong>
            {days != null && days > 0 ? `, ${days} days in` : ""}.
          </>
        ) : (
          <>
            You logged <strong>{stand.my_status}</strong> at{" "}
            <strong>{labelFor(stand.my_stage)}</strong>.
          </>
        )}
      </p>

      <ul className="plain" style={{ marginTop: 10 }}>
        <li>
          {ahead === 0 ? (
            <>
              <strong>Nobody</strong> of {others} others has got further than you
            </>
          ) : (
            <>
              <span className="mono">{ahead}</span> of {others}{" "}
              {others === 1 ? "other has" : "others have"} got further than you{" "}
              <span className="faint">({pctAhead}%)</span>
            </>
          )}
        </li>
        <li>
          <span className="mono">{level}</span>{" "}
          {level === 1 ? "is" : "are"} at the same point as you{" "}
          <span className="faint">({pctLevel}%)</span>
        </li>
      </ul>

      {waiting && mostHaveMoved && (
        <p className="caveat stand-warn">
          Most people who logged this role have moved past where you are. That
          is a genuine signal, but it is not a rejection: firms send in batches,
          and this site only sees people who chose to log. Treat it as a reason
          to stop refreshing, not as an answer.
        </p>
      )}

      {waiting && manyStillWaiting && !mostHaveMoved && (
        <p className="caveat stand-ok">
          Plenty of people are still waiting at the same stage as you, so
          hearing nothing yet tells you very little. Nothing to read into.
        </p>
      )}

      <p className="faint small" style={{ marginTop: 12 }}>
        Based only on people who logged here, who are more likely to be those
        with news. The real share still waiting is probably higher than this
        shows.
      </p>
    </section>
  );
}

function labelFor(code: string): string {
  const map: Record<string, string> = {
    applied: "applied",
    oa: "the online assessment",
    video: "the video interview",
    first_round: "first round",
    assessment_centre: "the assessment centre",
    offer: "offer",
  };
  return map[code] ?? code;
}
