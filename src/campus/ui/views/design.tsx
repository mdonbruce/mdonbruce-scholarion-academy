import type { TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { designSummary } from "../../services/design";
import { BLOOM } from "../../academy/design";
import { api, Chip, Hidden } from "../kit";

const GATE_CLASS: Record<string, string> = { pass: "badge badge-green", needs_action: "badge badge-amber", needs_review: "badge badge-blue", fail: "badge badge-red" };

/** Program design package (#1–#11): course standard, alignment, workload, gate and sign-offs. */
export function DesignPanel({ store, actor, slug, code, here }: { store: TenantStore; actor: Actor; slug: string; code: string; here: string }) {
  const d = designSummary(store, actor, code);
  const id = d.code.replace("#", "p");
  return (
    <section className="stack design-panel" aria-labelledby={`dz-${id}`}>
      <h3 id={`dz-${id}`} className="card-title">
        Design package · {d.track} track · {d.notebooks ? "notebook labs" : "no-code walkthroughs"}
      </h3>
      <p className="small muted">{d.status}</p>
      <p className="row">
        <a className="btn btn-primary btn-sm" href={api(slug, `programs/${d.slug}/design-package.zip`)}>
          Download design package (.zip, with PDF, Word and Excel copies)
        </a>
      </p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={`${d.code} course standard`}>
        <table className="table">
          <caption className="small">Course standard per block</caption>
          <thead>
            <tr>
              <th scope="col">Block</th>
              <th scope="col">Standard</th>
              <th scope="col">Modules</th>
              <th scope="col">Assignments</th>
              <th scope="col">Labs</th>
              <th scope="col">Projects</th>
              <th scope="col">Quizzes</th>
              <th scope="col">Midterm</th>
              <th scope="col">Final</th>
            </tr>
          </thead>
          <tbody>
            {d.blocks.map((b) => (
              <tr key={b.key}>
                <td>{b.key}</td>
                <td>{b.standard}</td>
                <td>{b.counts.modules}</td>
                <td>{b.counts.assignments}</td>
                <td>{b.counts.labs}</td>
                <td>{b.counts.projects}</td>
                <td>{b.counts.quizzes}</td>
                <td>{b.counts.midterm ? "yes" : "—"}</td>
                <td>{b.counts.final.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={`${d.code} alignment`}>
        <table className="table">
          <caption className="small">Alignment: competencies, Bloom level and scaffolding</caption>
          <thead>
            <tr>
              <th scope="col">Competency</th>
              <th scope="col">Bloom</th>
              <th scope="col">Introduced</th>
              <th scope="col">Developed</th>
              <th scope="col">Mastered</th>
              <th scope="col">Assessments</th>
              <th scope="col">Highest level evidenced</th>
            </tr>
          </thead>
          <tbody>
            {d.outcomes.map((o) => {
              const m = d.matrix.find((x) => x.outcome === o.id)!;
              return (
                <tr key={o.id}>
                  <th scope="row">
                    {o.id} <span className="small">{o.text}</span>
                  </th>
                  <td>{o.bloomName}</td>
                  <td>{m.introduced ? `W${m.introduced}` : "—"}</td>
                  <td>{m.developed ? `W${m.developed}` : "—"}</td>
                  <td>{m.mastered ? `W${m.mastered}` : "—"}</td>
                  <td>{m.assessments.length}</td>
                  <td>{BLOOM[m.maxCap] ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {d.issues.length > 0 && (
        <>
          <h4 className="small">Alignment issues ({d.issues.length})</h4>
          <ul className="small">
            {d.issues.map((i, k) => (
              <li key={k}>
                <strong>{i.kind.replace(/_/g, " ")}</strong> {i.target}: {i.detail} <span className="muted">{i.fix}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="small">
        Planned items: {Object.entries(d.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(" · ")}. Each graded item states its AI-use policy.
      </p>
      <h4 className="small">Quality gate</h4>
      <ul className="small design-gate">
        {d.gate.checks.map((c) => (
          <li key={c.key}>
            <span className={GATE_CLASS[c.status]}>{c.status.replace(/_/g, " ")}</span> {c.label} <span className="muted">— {c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="small">
        <strong>Publishable:</strong> {d.gate.publishable ? "yes" : "not yet"} · Sign-offs: {d.signoffs.length ? d.signoffs.map((s) => `${s.kind === "sme" ? "SME" : "Designer"} ${s.byName} (${String(s.at).slice(0, 10)})`).join("; ") : "none yet"}
      </p>
      {hasAny(actor, ["designer", "instructor", "admin"]) && (
        <form method="post" action={api(slug, "a/programs.design_signoff")} className="row">
          <Hidden values={{ back: here, program: d.code }} />
          <label htmlFor={`so-kind-${id}`}>Sign off as</label>
          <select id={`so-kind-${id}`} name="kind" defaultValue={hasAny(actor, ["designer"]) ? "designer" : "sme"}>
            <option value="designer">Instructional designer</option>
            <option value="sme">Subject-matter expert</option>
          </select>
          <label className="sr-only" htmlFor={`so-note-${id}`}>
            Review note
          </label>
          <input id={`so-note-${id}`} name="note" placeholder="What you reviewed" required />
          <button className="btn btn-outline btn-sm" type="submit">
            Sign off
          </button>
        </form>
      )}
      <details>
        <summary className="small">Credential rules, career hooks and evaluation plan</summary>
        <ul className="small">
          {d.credential.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="small">
          <strong>Roles where these skills are used:</strong> {d.career.roles.join(", ")}. {d.career.note}
        </p>
        <p className="small">
          <strong>Evaluation:</strong> {d.evaluation.analytics.join("; ")}. {d.evaluation.remediation}
        </p>
        <p className="small">
          <strong>Workload:</strong>{" "}
          {d.workload.filter((w) => w.flag).length ? d.workload.filter((w) => w.flag).map((w) => `W${w.week} ${w.estimated}h (${w.flag})`).join(", ") : "every week within ±15% of the stated hours"}
        </p>
        <p className="small">
          <strong>Datasets:</strong> {d.datasets.map((x) => `${x.name} (${x.rows} rows)`).join("; ")} <Chip s="complete" />
        </p>
      </details>
    </section>
  );
}
