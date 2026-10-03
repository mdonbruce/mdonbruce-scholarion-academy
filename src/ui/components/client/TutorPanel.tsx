"use client";
import { useState } from "react";
import type { TutorReply } from "@/platform/types";

/**
 * AI Tutor panel (Spec §9). Every answer shows its citations; graded items show a
 * policy notice instead of an input. "Ask an instructor" opens a HavenConnect ticket.
 */
export function TutorPanel({ courseId, itemId, policy, enabled, disabledReason }: { courseId: string; itemId?: string; policy: "open" | "hints_only" | "closed"; enabled: boolean; disabledReason?: string }) {
  const [msgs, setMsgs] = useState<({ who: "me"; text: string } | ({ who: "ai" } & TutorReply))[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState<string | null>(null);

  async function ask(mode: "explain" | "quiz_me" | "summarize" | "hint", message: string) {
    setBusy(true);
    if (message) setMsgs((m) => [...m, { who: "me", text: message }]);
    try {
      const r = await fetch("/api/v1/tutor/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, itemId, mode, message }) });
      const d = (await r.json()) as TutorReply & { error?: { message: string } };
      if (d.error) setMsgs((m) => [...m, { who: "ai", kind: "unavailable", text: d.error!.message, citations: [], policy, canEscalate: false }]);
      else setMsgs((m) => [...m, { who: "ai", ...d }]);
    } catch {
      setMsgs((m) => [...m, { who: "ai", kind: "unavailable", text: "The AI Tutor is unavailable right now. You can still ask an instructor.", citations: [], policy, canEscalate: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    const r = await fetch("/api/v1/tutor/escalate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, itemId, message: msgs.filter((m) => m.who === "me").map((m) => m.text).join("\n") || "Learner asked for help." }) });
    const d = (await r.json()) as { message?: string };
    setEscalated(d.message ?? "Sent to course staff.");
  }

  return (
    <aside className="card tutor" aria-label="AI Tutor">
      <div className="card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="row between">
          <strong>AI Tutor</strong>
          <span className="badge badge-amber">Simulated</span>
        </div>
        <p className="tiny muted" style={{ margin: "4px 0 0" }}>
          Answers only from this course's materials, with sources. {policy === "hints_only" ? "Hints only on this activity." : ""}
        </p>
      </div>
      {!enabled ? (
        <div className="card-pad small">{disabledReason}</div>
      ) : policy === "closed" ? (
        <div className="card-pad small">
          <div className="notice notice-info" style={{ margin: 0 }}>
            AI help is turned off for graded assessments. After you submit, I can go over the concepts with you.
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ padding: "12px 16px 0", ["--gap" as string]: "6px" }}>
            {policy === "hints_only" ? (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void ask("hint", "Give me a hint for the step I'm on.")}>
                Hint
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void ask("explain", "Explain the key idea of this lesson.")}>
                Explain
              </button>
            )}
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void ask("quiz_me", "Quiz me")}>
              Quiz me
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void ask("summarize", "Summarize this module")}>
              Summarize
            </button>
          </div>
          <div className="stack" style={{ padding: 16, maxHeight: 380, overflowY: "auto", ["--gap" as string]: "10px" }} aria-live="polite">
            {msgs.length === 0 && <p className="small muted">Ask a question about this lesson.</p>}
            {msgs.map((m, i) =>
              m.who === "me" ? (
                <div key={i} className="bubble me">
                  {m.text}
                </div>
              ) : (
                <div key={i} className={`bubble ${m.kind === "refusal" || m.kind === "quota" ? "refusal" : "ai"}`}>
                  {m.text}
                  {m.citations.map((c) => (
                    <a key={c.itemId + c.excerpt} className="cite" href={`/app/course/${courseId}/item/${c.itemId}`}>
                      <strong>{c.title}</strong> — {c.excerpt}
                    </a>
                  ))}
                </div>
              ),
            )}
            {busy && <p className="tiny muted">Thinking…</p>}
          </div>
          <form
            className="row"
            style={{ padding: "0 16px 12px", flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              const t = text.trim();
              if (!t) return;
              setText("");
              void ask(policy === "hints_only" ? "hint" : "explain", t);
            }}
          >
            <label htmlFor="tutor-input" className="sr-only">
              Ask the AI Tutor
            </label>
            <input id="tutor-input" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this lesson…" />
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Ask
            </button>
          </form>
        </>
      )}
      <div className="card-pad" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        {escalated ? (
          <p className="small" role="status" style={{ margin: 0 }}>
            {escalated}
          </p>
        ) : (
          <button className="linkish small" onClick={() => void escalate()}>
            Ask an instructor instead
          </button>
        )}
      </div>
    </aside>
  );
}
