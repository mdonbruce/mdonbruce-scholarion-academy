import { CampusError, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import * as al from "../../services/agentlabs";
import { api, Chip, Denied, Empty, fmt, Hidden, PageHead } from "../kit";

type SP = Record<string, string | undefined>;

function Notices({ sp }: { sp: SP }) {
  return (
    <>
      {sp.notice && (
        <p className="notice notice-ok" role="status">
          {sp.notice}
        </p>
      )}
      {sp.error && (
        <p className="notice notice-err" role="alert">
          {sp.error}
        </p>
      )}
    </>
  );
}

/** My Agentic Cloud Labs. */
export function AgentLabsList({ store, actor, slug, sp }: { store: TenantStore; actor: Actor; slug: string; sp: SP }) {
  const labs = al.myLabs(store, actor);
  return (
    <div className="stack">
      <PageHead title="Agentic Cloud Labs" sub="Scholarion's hosted agent-building area. Your agents run autonomously inside a bounded runner with tool permissions; every run leaves an evaluation trace." />
      <Notices sp={sp} />
      {labs.length ? (
        <ul className="grid g2 campus-cards" aria-label="Labs">
          {labs.map((l) => (
            <li key={l.id} className="card card-pad stack">
              <p className="tiny muted">{l.course}</p>
              <h2 className="card-title">
                <a href={`/campus/${slug}/agent-labs/${l.id}`}>{l.title}</a>
              </h2>
              {l.role === "learner" ? (
                <p className="small">
                  Graded attempts {l.attemptsUsed} of {l.maxAttempts} · Best {l.best === null ? "—" : `${l.best}/100`} {l.best !== null && <Chip s={l.passed ? "complete" : "in_progress"} />}
                </p>
              ) : (
                <p className="small">Course staff view — practice runs, learner roster and traces.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No Agentic Cloud Labs yet.">Labs appear here when you're enrolled in a course that includes one.</Empty>
      )}
    </div>
  );
}

/** One lab: brief, permissions, budget, rubric, workspace, runs and traces. */
export function AgentLabWorkspace({ store, actor, slug, labId, sp }: { store: TenantStore; actor: Actor; slug: string; labId: string; sp: SP }) {
  let v: ReturnType<typeof al.openLab>;
  try {
    v = al.openLab(store, actor, labId);
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  const here = `/campus/${slug}/agent-labs/${labId}`;
  const runId = sp.run ?? v.runs[0]?.id;
  let detail: ReturnType<typeof al.runDetail> | null = null;
  try {
    detail = runId ? al.runDetail(store, actor, runId) : null;
  } catch {
    detail = null;
  }
  const learner = v.role === "learner";
  return (
    <div className="stack campus-agentlab">
      <PageHead title={v.lab.title} sub={`${v.lab.course} · ${v.lab.org}`}>
        <a className="btn btn-ghost btn-sm" href={`/campus/${slug}/agent-labs`}>
          All labs
        </a>
      </PageHead>
      <Notices sp={sp} />
      <section className="card card-pad stack" aria-labelledby="al-brief">
        <h2 id="al-brief" className="card-title">
          Brief
        </h2>
        <p className="small">{v.lab.orgNote}</p>
        <p className="small">
          <strong>Autonomous agent.</strong> Your agent runs end to end with no human approval steps. The lab enforces each tool's permission and per-task cap, plus a budget of {v.brief.budget.maxSteps} steps and {v.brief.budget.maxToolCalls} tool calls per task. You write the agent as a JSON spec: routes (keywords → tool steps), a guardrail, what to do when a tool errors, and how to answer. Scholarion's engine runs it; nothing you write is executed as code.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tools and permissions">
          <table className="table">
            <caption className="sr-only">Tools and permissions</caption>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Kind</th>
                <th scope="col">What it does</th>
                <th scope="col">Permission</th>
              </tr>
            </thead>
            <tbody>
              {v.brief.tools.map((t) => (
                <tr key={t.name}>
                  <td>
                    <code>{t.name}</code>
                  </td>
                  <td>{t.kind}</td>
                  <td className="small">{t.description}</td>
                  <td className="small">{t.allowed ? `Allowed${t.maxCallsPerTask ? ` (max ${t.maxCallsPerTask} per task)` : ""}` : "Denied"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          IDs look like {v.brief.idLabel}. Search values: {Object.entries(v.brief.fieldValues).map(([k, vals]) => `${k}: ${(vals as unknown[]).join(", ")}`).join(" · ") || "—"}
        </p>
        <h3 className="small">Practice tasks</h3>
        <ul className="small">
          {v.visibleTasks.map((t) => (
            <li key={t.id}>
              <strong>{t.id}</strong> {t.request}
            </li>
          ))}
        </ul>
        <p className="tiny muted">Graded attempts add {v.hiddenTaskCount} hidden task(s) that vary the records.</p>
      </section>

      <section className="card card-pad stack" aria-labelledby="al-ws">
        <div className="between">
          <h2 id="al-ws" className="card-title">
            Workspace
          </h2>
          <span className="tiny muted">Saved {fmt(v.workspace.savedAt)}</span>
        </div>
        {v.workspace.errors.length > 0 && (
          <div className="notice notice-warn" role="status">
            <strong>Spec problems:</strong>
            <ul className="small">
              {v.workspace.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <form method="post" action={api(slug, "a/agentlabs.run")} className="stack">
          <Hidden values={{ back: here, labId, result_param: "run" }} />
          <label htmlFor="al-code" className="small">
            agent.json
          </label>
          <textarea id="al-code" name="code" rows={22} defaultValue={v.workspace.code} spellCheck={false} className="mono" />
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit" name="mode" value="practice">
              Save and run practice
            </button>
            {learner && (
              <button className="btn btn-sm" type="submit" name="mode" value="graded" disabled={v.attempts.remaining === 0}>
                Submit for grade ({v.attempts.remaining} of {v.attempts.allowed} attempts left)
              </button>
            )}
          </div>
        </form>
        <div className="row">
          <form method="post" action={api(slug, "a/agentlabs.reset")}>
            <Hidden values={{ back: here, labId, notice: "Workspace reset to the starter spec; your previous version is in history." }} />
            <button className="btn btn-ghost btn-sm" type="submit">
              Reset to starter
            </button>
          </form>
          {v.workspace.versions.length > 0 && (
            <form method="post" action={api(slug, "a/agentlabs.restore")} className="row">
              <Hidden values={{ back: here, labId, notice: "Version restored." }} />
              <label className="small">
                Version{" "}
                <select name="index">
                  {v.workspace.versions.map((x) => (
                    <option key={x.index} value={x.index}>
                      {fmt(x.at)} ({x.chars} chars)
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-ghost btn-sm" type="submit">
                Restore
              </button>
            </form>
          )}
        </div>
        {learner && (
          <p className="small">
            Best graded score: {v.best === null ? "none yet" : `${v.best}/100`}
            {v.gradebook ? ` · Gradebook: ${v.gradebook.score} (${v.gradebook.passFail === "pass" ? "pass" : "not yet passing"}, posted)` : ""} · Pass mark {v.lab.passMark}. The best of your graded attempts counts.
          </p>
        )}
        {v.referenceCode && (
          <details>
            <summary className="small">Reference agent (staff only)</summary>
            <pre className="small mono">{v.referenceCode}</pre>
          </details>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="al-rubric">
        <h2 id="al-rubric" className="card-title">
          Rubric
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Rubric">
          <table className="table">
            <caption className="sr-only">Grading rubric</caption>
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Points</th>
                <th scope="col">How it's scored</th>
                {detail && <th scope="col">Latest run</th>}
              </tr>
            </thead>
            <tbody>
              {v.rubric.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{r.points}</td>
                  <td className="small">{r.description}</td>
                  {detail && <td>{detail.criteria.find((c) => c.key === r.key)?.earned ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <section className="card card-pad stack" aria-labelledby="al-run">
          <h2 id="al-run" className="card-title">
            {detail.mode === "graded" ? `Graded attempt ${detail.attempt}` : "Practice run"} — {detail.score}/100 <Chip s={detail.passed ? "complete" : "in_progress"} />
          </h2>
          <p className="tiny muted">
            {fmt(detail.createdAt)} · {detail.violations} permission violation(s) · autonomous run, no approval gates
          </p>
          {detail.traces.map((t) => {
            const res = detail!.tasks.find((x) => x.id === t.id);
            return (
              <details key={t.id} open={!res?.success}>
                <summary>
                  <strong>{t.id}</strong> {res?.success ? "passed" : "not yet"} · {t.status.replace(/_/g, " ")}
                  {t.hidden ? " · hidden task" : ""}
                </summary>
                {res && res.why.length > 0 && <p className="small">{res.why.join("; ")}</p>}
                {t.trace.length > 0 ? (
                  <ol className="small campus-trace">
                    {t.trace.map((row, i) => (
                      <li key={i}>
                        <span className="badge">{row.type}</span> {row.msg}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="tiny muted">Trace hidden for hidden tasks.</p>
                )}
                {t.answer && <p className="small">Answer: {t.answer}</p>}
              </details>
            );
          })}
        </section>
      )}

      {v.runs.length > 0 && (
        <section className="card card-pad stack" aria-labelledby="al-hist">
          <h2 id="al-hist" className="card-title">
            Run history
          </h2>
          <ul className="item-list">
            {v.runs.map((r) => (
              <li key={r.id}>
                <a href={`${here}?run=${r.id}`}>
                  {r.mode === "graded" ? `Graded attempt ${r.attempt}` : "Practice"} · {r.score}/100
                </a>{" "}
                <span className="tiny muted">{fmt(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
