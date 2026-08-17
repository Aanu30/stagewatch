"use client";

import { useState } from "react";
import { STAGES, STATUSES } from "@/lib/constants";
import { getLocalId } from "@/lib/localId";

// The unknown-role path. New roles open weekly through autumn, so this has to
// exist - but everything submitted here runs the dedup pipeline first
// (normalise, alias table, fuzzy match) and only reaches the merge queue if
// all three fail.

const today = () => new Date().toISOString().slice(0, 10);

export default function NewRoleForm() {
  const [open, setOpen] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [programmeName, setProgrammeName] = useState("Summer Internship");
  const [division, setDivision] = useState("");
  const [location, setLocation] = useState("London");
  const [stage, setStage] = useState("applied");
  const [status, setStatus] = useState("waiting");
  const [occurredOn, setOccurredOn] = useState(today());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"logged" | "queued" | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: getLocalId(),
          firmName,
          programmeName,
          division,
          location,
          cycle: "Summer 2027",
          stage,
          status,
          occurredOn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data.outcome);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <h2>Role not listed?</h2>
        <p className="dim small">
          New roles open every week through the autumn. Add one and it will be
          matched against existing firms first.
        </p>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          Add a role
        </button>
      </div>
    );
  }

  return (
    <form className="logform" onSubmit={onSubmit}>
      <div className="logform-head">
        <strong>Add a role</strong>
        <p className="dim" style={{ marginTop: 4 }}>
          Abbreviations are fine — &quot;BofA&quot;, &quot;GCM&quot;,
          &quot;SWE&quot; all resolve automatically.
        </p>
      </div>

      <div className="logform-grid">
        <label>
          <span>Firm</span>
          <input
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            placeholder="e.g. Qatalyst"
            required
          />
        </label>

        <label>
          <span>Programme</span>
          <input
            value={programmeName}
            onChange={(e) => setProgrammeName(e.target.value)}
            placeholder="Summer Internship"
          />
        </label>

        <label>
          <span>Division or role</span>
          <input
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            placeholder="e.g. M&A"
            required
          />
        </label>

        <label>
          <span>Location</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="London"
          />
        </label>

        <label>
          <span>Your stage</span>
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
      </div>

      {error && <p className="error">{error}</p>}
      {result === "logged" && (
        <p className="success">
          Matched to a role that already existed, and your status was logged.
        </p>
      )}
      {result === "queued" && (
        <p className="success">
          Submitted. It needs one manual check before it appears, because
          nothing matched an existing firm.
        </p>
      )}

      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Submit role"}
      </button>
    </form>
  );
}
