"use client";
import { useState } from "react";

type Tab = "Instructions" | "Starter Code" | "Your Solution" | "Output" | "Submission";
interface Grade {
  score: number;
  max: number;
  feedback: { name: string; passed: boolean; points: number }[];
  stderr: string;
  runner: string;
}

/**
 * Mini Lab workspace (approved screen 6): Instructions · Starter Code · Your Solution ·
 * Output · Submission. Launches a Cloud Lab session through the BFF; the autograder runs
 * hidden tests server-side and posts the grade via lab.graded.
 */
export function LabWorkspace(props: {
  itemId: string;
  courseId: string;
  instructions: string[];
  starterFile: string;
  starterCode: string;
  locked: string | null;
  existingCode: string | null;
  bestScore: { score: number; max: number } | null;
}) {
  const [tab, setTab] = useState<Tab>("Instructions");
  const [session, setSession] = useState<string | null>(null);
  const [code, setCode] = useState(props.existingCode ?? props.starterCode);
  const [out, setOut] = useState<string>("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function launch() {
    setErr(null);
    setBusy("Starting your workspace…");
    try {
      const r = await fetch("/api/v1/labs/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: props.itemId }) });
      const d = (await r.json()) as { session?: { id: string; code: string }; runner?: string; error?: { message: string } };
      if (!d.session) throw new Error(d.error?.message ?? "Couldn't start the lab.");
      setSession(d.session.id);
      setCode(d.session.code);
      setTab("Your Solution");
      if (d.runner === "disabled") setErr("The Cloud Lab runner isn't connected here. You can still edit and download your code.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: "run" | "grade") {
    if (!session) return;
    setBusy(kind === "run" ? "Running…" : "Grading with hidden tests…");
    setErr(null);
    try {
      const r = await fetch(`/api/v1/labs/sessions/${session}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const d = (await r.json()) as Grade & { stdout: string; stderr: string; error?: { message: string } };
      if (d.error) throw new Error(d.error.message);
      if (kind === "run") {
        setOut([d.stdout, d.stderr].filter(Boolean).join("\n") || "(no output)");
        setTab("Output");
      } else {
        setGrade(d);
        setTab("Submission");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const tabs: Tab[] = ["Instructions", "Starter Code", "Your Solution", "Output", "Submission"];
  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="Lab sections">
        {tabs.map((t) => (
          <a
            key={t}
            href={`#${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-current={tab === t ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              setTab(t);
            }}
          >
            {t}
          </a>
        ))}
      </div>
      {err && (
        <div className="notice notice-warn" role="alert">
          {err}
        </div>
      )}
      {props.locked && (
        <div className="notice notice-info">
          <strong>Cloud Lab is locked.</strong> {props.locked}
        </div>
      )}
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="stack" aria-live="polite">
          {tab === "Instructions" && (
            <>
              <h3 style={{ fontFamily: "var(--font-sans)" }}>Lab Instructions</h3>
              <p className="muted">In this lab, follow the steps below and complete the TODO items in the starter code.</p>
              <ol className="stack" style={{ ["--gap" as string]: "10px" }}>
                {props.instructions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {tab === "Output" && <pre className="console" style={{ borderRadius: "var(--radius)" }}>{out || "Run your code to see output here."}</pre>}
          {tab === "Submission" && (
            <div className="panel">
              {grade ? (
                <>
                  <h3 style={{ fontFamily: "var(--font-sans)" }}>
                    Autograder: {grade.score}/{grade.max}
                  </h3>
                  <ul className="item-list">
                    {grade.feedback.map((f) => (
                      <li key={f.name} className="li">
                        <span className={`badge ${f.passed ? "badge-green" : "badge-red"}`}>{f.passed ? "Pass" : "Fail"}</span> {f.name} <span className="muted small">({f.points} pts)</span>
                      </li>
                    ))}
                  </ul>
                  {grade.stderr && <pre className="console">{grade.stderr}</pre>}
                  <p className="small muted">Your best score counts and is now in the gradebook. Runner: {grade.runner} (simulated).</p>
                </>
              ) : props.bestScore ? (
                <p>
                  Current grade: <strong>{props.bestScore.score}/{props.bestScore.max}</strong>. Submit again to improve it.
                </p>
              ) : (
                <p className="muted">Submit your code to run the hidden tests. You can submit as many times as you like; your best score counts.</p>
              )}
            </div>
          )}
          {(tab === "Starter Code" || tab === "Your Solution") && <p className="muted small">The editor is on the right. {tab === "Starter Code" ? "This is the original starter file." : "Edit your solution, run it, then submit for grading."}</p>}
          <div className="row">
            {!session ? (
              <button className="btn btn-primary" onClick={() => void launch()} disabled={!!props.locked || !!busy}>
                Open in Code Editor
              </button>
            ) : (
              <>
                <button className="btn btn-outline" onClick={() => void act("run")} disabled={!!busy}>
                  ▶ Run
                </button>
                <button className="btn btn-primary" onClick={() => void act("grade")} disabled={!!busy}>
                  Submit for grading
                </button>
              </>
            )}
            <a className="btn btn-ghost" href={`/api/v1/labs/starter/${props.itemId}`}>
              Download Files
            </a>
          </div>
          {busy && (
            <p className="small muted" role="status">
              {busy}
            </p>
          )}
        </section>
        <section className="code" aria-label="Code editor">
          <div className="code-tabs">
            <span className={tab === "Starter Code" ? "on" : ""}>{props.starterFile}</span>
            <span className={tab !== "Starter Code" ? "on" : ""}>solution.py</span>
          </div>
          {tab === "Starter Code" || !session ? (
            <pre>{tab === "Starter Code" ? props.starterCode : code}</pre>
          ) : (
            <>
              <label htmlFor="lab-code" className="sr-only">
                Your solution code
              </label>
              <textarea
                id="lab-code"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const s = el.selectionStart;
                    setCode(code.slice(0, s) + "    " + code.slice(el.selectionEnd));
                    requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
                  }
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
