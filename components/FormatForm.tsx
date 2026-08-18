"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getLocalId } from "@/lib/localId";

// Only the stages that have a describable format. Nobody asks what "Applied"
// consists of, and offering it would make the form longer for no answer.
const DESCRIBABLE = [
  { code: "oa", label: "Online assessment" },
  { code: "video", label: "Video interview / HireVue" },
  { code: "first_round", label: "First round" },
  { code: "assessment_centre", label: "Assessment centre" },
] as const;

const SECTIONS = [
  ["numerical", "Numerical"],
  ["logical", "Logical / reasoning"],
  ["verbal", "Verbal"],
  ["situational", "Situational judgement"],
  ["behavioural", "Behavioural"],
  ["coding", "Coding"],
] as const;

export default function FormatForm({ roleSlug }: { roleSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string>("oa");
  const [duration, setDuration] = useState("");
  const [questions, setQuestions] = useState("");
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [hvQuestions, setHvQuestions] = useState("");
  const [hvRetakes, setHvRetakes] = useState<string>("");
  const [hvLive, setHvLive] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isVideo = stage === "video";
  const tri = (v: string) => (v === "" ? null : v === "yes");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: getLocalId(),
          roleSlug,
          stage,
          durationMinutes: duration === "" ? null : Number(duration),
          questionCount: questions === "" ? null : Number(questions),
          // Only ticked boxes are sent as true. An untouched box stays null -
          // "nobody mentioned it" and "everyone said no" must stay distinct,
          // or a coding section quietly disappears from the summary.
          sections: Object.fromEntries(
            SECTIONS.map(([k]) => [k, sections[k] ? true : null]),
          ),
          hvQuestionCount: hvQuestions === "" ? null : Number(hvQuestions),
          hvRetakes: tri(hvRetakes),
          hvIsLive: tri(hvLive),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <h2>Sat this assessment?</h2>
        <p className="dim small">
          Describe it and nobody has to ask the group chat again. Twenty seconds,
          and no single answer is required.
        </p>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          Describe the assessment
        </button>
      </div>
    );
  }

  return (
    <form className="logform" onSubmit={onSubmit}>
      <div className="logform-head">
        <strong>Describe the assessment</strong>
        <p className="dim" style={{ marginTop: 4 }}>
          Fill in only what you remember. Blank means &ldquo;I don&apos;t
          know&rdquo;, which is more useful than a guess.
        </p>
      </div>

      <div className="logform-grid">
        <label>
          <span>Which stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {DESCRIBABLE.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>How long (minutes)</span>
          <input
            type="number"
            min={1}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 20"
          />
        </label>

        <label>
          <span>How many questions</span>
          <input
            type="number"
            min={1}
            max={500}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="e.g. 40"
          />
        </label>

        {isVideo && (
          <>
            <label>
              <span>Video questions</span>
              <input
                type="number"
                min={1}
                max={100}
                value={hvQuestions}
                onChange={(e) => setHvQuestions(e.target.value)}
              />
            </label>
            <label>
              <span>Retakes allowed?</span>
              <select value={hvRetakes} onChange={(e) => setHvRetakes(e.target.value)}>
                <option value="">Don&apos;t know</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              <span>Live or pre-recorded?</span>
              <select value={hvLive} onChange={(e) => setHvLive(e.target.value)}>
                <option value="">Don&apos;t know</option>
                <option value="yes">Live</option>
                <option value="no">Pre-recorded</option>
              </select>
            </label>
          </>
        )}
      </div>

      <fieldset className="sections">
        <legend className="dim small">What was in it? Tick all that applied.</legend>
        {SECTIONS.map(([k, label]) => (
          <label key={k} className="tickbox">
            <input
              type="checkbox"
              checked={!!sections[k]}
              onChange={(e) =>
                setSections((s) => ({ ...s, [k]: e.target.checked }))
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <label className="logform-wide" style={{ display: "block", marginTop: 12 }}>
        <span className="dim small">
          Anything else worth knowing? <em className="faint">280 characters</em>
        </span>
        <input
          type="text"
          maxLength={280}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. timed per question, no going back"
        />
      </label>

      {error && <p className="error">{error}</p>}
      {done && !error && <p className="success">Added. Thank you.</p>}

      <button type="submit" disabled={busy} style={{ marginTop: 14 }}>
        {busy ? "Saving…" : "Submit description"}
      </button>
    </form>
  );
}
