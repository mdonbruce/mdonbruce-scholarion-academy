"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Q {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
}
interface Review {
  id: string;
  correct: boolean;
  chosen: string | null;
  answer: string;
  explanation: string;
}

/**
 * Timed quiz player (Spec §7): question navigator, autosave every 15 s, offline-tolerant
 * (answers stay in memory and are re-sent), review after submission. Answers never ship
 * to the browser before submission.
 */
export function QuizPlayer({ itemId, title, questions, timeLimitMinutes, passPercent, best }: { itemId: string; title: string; questions: Q[]; timeLimitMinutes: number; passPercent: number; best: { score: number; max: number } | null }) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [left, setLeft] = useState(timeLimitMinutes * 60);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "offline">("idle");
  const [result, setResult] = useState<{ percent: number; passed: boolean; review: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);

  async function start() {
    setError(null);
    const r = await fetch("/api/v1/lms/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
    const d = (await r.json()) as { attempt?: { id: string; answers: Record<string, string>; startedAt: string }; error?: { message: string } };
    if (!d.attempt) return setError(d.error?.message ?? "Couldn't start the quiz.");
    setAttemptId(d.attempt.id);
    setAnswers(d.attempt.answers);
    setDeadline(Date.parse(d.attempt.startedAt) + timeLimitMinutes * 60_000);
  }

  const save = useCallback(async () => {
    if (!attemptId || !dirty.current) return;
    try {
      const r = await fetch(`/api/v1/lms/attempts/${attemptId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
      if (!r.ok) throw new Error();
      dirty.current = false;
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  }, [attemptId, answers]);

  const submit = useCallback(async () => {
    if (!attemptId) return;
    const r = await fetch(`/api/v1/lms/attempts/${attemptId}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
    const d = (await r.json()) as { percent?: number; passed?: boolean; review?: Review[]; error?: { message: string } };
    if (d.review) setResult({ percent: d.percent!, passed: d.passed!, review: d.review });
    else setError(d.error?.message ?? "Couldn't submit. Your answers are kept — try again.");
  }, [attemptId, answers]);

  useEffect(() => {
    if (!attemptId || result) return;
    const t = setInterval(() => void save(), 15_000);
    return () => clearInterval(t);
  }, [attemptId, result, save]);

  useEffect(() => {
    if (!deadline || result) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submit();
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, result, submit]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  if (result) {
    return (
      <div className="panel">
        <div className={`notice ${result.passed ? "notice-ok" : "notice-warn"}`} role="status">
          You scored <strong>{result.percent}%</strong>. {result.passed ? "Passed — nice work." : `The passing score is ${passPercent}%. Review the explanations and try again.`}
        </div>
        <ol className="stack">
          {questions.map((q) => {
            const rv = result.review.find((x) => x.id === q.id)!;
            return (
              <li key={q.id}>
                <strong>{q.prompt}</strong>
                <div className="small">
                  {rv.correct ? <span className="badge badge-green">Correct</span> : <span className="badge badge-red">Incorrect</span>} Correct answer: {q.options.find((o) => o.id === rv.answer)?.text}
                </div>
                <div className="small muted">{rv.explanation}</div>
              </li>
            );
          })}
        </ol>
        <a className="btn btn-outline" href="?retake=1">
          Retake quiz
        </a>
      </div>
    );
  }

  if (!attemptId) {
    return (
      <div className="panel stack">
        <p>
          {questions.length} questions · {timeLimitMinutes} minutes · passing score {passPercent}%. Answers save automatically every 15 seconds. AI help is turned off for graded quizzes.
        </p>
        {best && (
          <p className="small">
            Best score so far: <strong>{Math.round((best.score / best.max) * 100)}%</strong>. Your best attempt counts.
          </p>
        )}
        {error && (
          <div className="notice notice-err" role="alert">
            {error}
          </div>
        )}
        <div>
          <button className="btn btn-primary" onClick={() => void start()}>
            {best ? "Start a new attempt" : "Start quiz"}
          </button>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  return (
    <div className="two-col" style={{ gridTemplateColumns: "200px 1fr" }}>
      <nav aria-label="Questions" className="panel" style={{ padding: 10 }}>
        <ol className="qnav">
          {questions.map((x, i) => (
            <li key={x.id}>
              <button className={`${i === idx ? "on" : ""} ${answers[x.id] ? "done" : ""}`} onClick={() => setIdx(i)} aria-current={i === idx ? "step" : undefined}>
                <span>{i + 1}</span> Question {i + 1} {answers[x.id] ? "✓" : ""}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section className="panel" aria-labelledby="qtitle">
        <div className="row between">
          <span className="muted small">
            {title} · Question {idx + 1} of {questions.length}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <span className="tiny muted" aria-live="polite">
              {saveState === "saved" ? "Saved" : saveState === "offline" ? "Offline — answers kept, retrying" : ""}
            </span>
            <span className="badge badge-blue" aria-label={`Time remaining ${mm} minutes ${ss} seconds`}>
              ⏱ {mm}:{ss}
            </span>
          </span>
        </div>
        <h2 id="qtitle" style={{ fontFamily: "var(--font-sans)", fontSize: "1.15rem", margin: "16px 0" }}>
          {q.prompt}
        </h2>
        <div role="group" aria-labelledby="qtitle">
          {q.options.map((o) => (
            <button
              key={o.id}
              className="option"
              aria-pressed={answers[q.id] === o.id}
              onClick={() => {
                setAnswers((a) => ({ ...a, [q.id]: o.id }));
                dirty.current = true;
                setSaveState("idle");
              }}
            >
              <span className="letter">{o.id.toUpperCase()}</span>
              {o.text}
            </button>
          ))}
        </div>
        {error && (
          <div className="notice notice-err" role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
        <div className="row between" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            ← Previous
          </button>
          {idx < questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => (void save(), setIdx((i) => i + 1))}>
              Next →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void submit()}>
              Submit quiz ({Object.keys(answers).length}/{questions.length} answered)
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
