"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAGES, STATUSES } from "@/lib/constants";
import { getLocalId } from "@/lib/localId";

type Props = {
  roleSlug: string;
  // Rendered differently when it is acting as the gate rather than as an
  // update to something already logged.
  isGate: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function LogStatusForm({ roleSlug, isGate }: Props) {
  const router = useRouter();

  const [stage, setStage] = useState<string>("applied");
  const [status, setStatus] = useState<string>("waiting");
  const [occurredOn, setOccurredOn] = useState<string>(today());
  const [occurredHour, setOccurredHour] = useState<string>("");
  const [appliedOn, setAppliedOn] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // No effect resets `done` when the role changes. The caller passes
  // key={role.slug}, which remounts this component on navigation and gives us
  // fresh state for free - cheaper and less error-prone than synchronising it.

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: getLocalId(),
          roleSlug,
          stage,
          status,
          occurredOn,
          occurredHour: occurredHour === "" ? null : Number(occurredHour),
          appliedOn: appliedOn === "" ? null : appliedOn,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setDone(true);
      // Re-render the server component so the gate opens and the numbers
      // appear without a full page reload.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="logform" onSubmit={onSubmit}>
      <div className="logform-head">
        <strong>{isGate ? "Log your status to see the numbers" : "Update your status"}</strong>
        {isGate && (
          <p className="dim" style={{ marginTop: 4 }}>
            One click. Nothing is shown publicly, and you never have to log a
            rejection.
          </p>
        )}
      </div>

      <div className="logform-grid">
        <label>
          <span>Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>When</span>
          <input
            type="date"
            value={occurredOn}
            max={today()}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />
        </label>

        <label>
          <span>
            Hour <em className="faint">optional</em>
          </span>
          <select
            value={occurredHour}
            onChange={(e) => setOccurredHour(e.target.value)}
          >
            <option value="">Don&apos;t know</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        {stage !== "applied" && (
          <label className="logform-wide">
            <span>
              When did you apply? <em className="faint">optional, improves the median gaps</em>
            </span>
            <input
              type="date"
              value={appliedOn}
              max={occurredOn}
              onChange={(e) => setAppliedOn(e.target.value)}
            />
          </label>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {done && !error && <p className="success">Logged. Thank you.</p>}

      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : isGate ? "Log status and unlock" : "Save"}
      </button>

      <p className="faint" style={{ marginTop: 10, fontSize: 12 }}>
        Only observed facts are collected: what happened, and when. You are
        never asked whether you think something was selective, because that is
        a guess. Selectivity is worked out from the ratio.
      </p>
    </form>
  );
}
