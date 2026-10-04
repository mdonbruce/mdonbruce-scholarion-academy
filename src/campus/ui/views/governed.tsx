import type { TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { bridgeStatus } from "../../services/bridge";
import { departmentStatus } from "../../services/departments";
import { CONSENT_CHECKS, CREDIT_RATES, LANGUAGES, PERSONAS, PLANS, personaReply, listStories, voiceOverview } from "../../services/voice";
import { acceptanceStatus, AREAS, SIGNOFF_ROLES } from "../../services/acceptance";
import { api, Chip, Hidden } from "../kit";

type P = { store: TenantStore; actor: Actor; slug: string; here: string; sp: Record<string, string | undefined> };

const LABEL_CLASS: Record<string, string> = { LIVE: "badge badge-green", CONNECTED: "badge badge-blue", DISABLED: "badge badge-amber", SIMULATED: "badge badge-blue", PLANNED: "badge" };
const Label = ({ l }: { l: string }) => <span className={LABEL_CLASS[l] ?? "badge"}>{l}</span>;

/* ---------------- 63 Governed Service Bridge ---------------- */

export function BridgePanel({ store, actor, slug, here }: P) {
  const s = bridgeStatus(store, actor);
  const probeOk = hasAny(actor, ["admin", "support"]);
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="br-svc">
        <h2 id="br-svc" className="card-title">
          Companion services
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Companion services">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Address</th>
                <th scope="col">Last probe</th>
                <th scope="col">Run it</th>
                {probeOk && <th scope="col">Probe</th>}
              </tr>
            </thead>
            <tbody>
              {s.services.map((x) => (
                <tr key={x.key}>
                  <td>{x.name}</td>
                  <td>
                    <code>{x.url ?? "not configured"}</code>
                  </td>
                  <td>{x.last ? <>{x.last.ok ? <span className="badge badge-green">up</span> : <span className="badge badge-red">down</span>} <span className="tiny muted">{x.last.error ?? `HTTP ${x.last.status} · ${x.last.ms} ms`} · {x.last.at.slice(0, 16).replace("T", " ")}</span></> : <span className="tiny muted">not probed</span>}</td>
                  <td>
                    <code className="tiny">{x.run}</code>
                  </td>
                  {probeOk && (
                    <td>
                      <form method="post" action={api(slug, "a/bridge.probe")}>
                        <Hidden values={{ back: here, target: x.key, notice: "Probe recorded." }} />
                        <button className="btn btn-outline btn-sm">Probe</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="small">
          {s.boundaries.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p className="tiny muted">
          Source bundle SHA-256 <code>{s.bundle.sha256}</code>
          {s.bundle.present ? ` · ${s.bundle.files ?? "?"} files · created ${String(s.bundle.created ?? "").slice(0, 10)}` : " · bundle manifest not found in this deployment"}
        </p>
      </section>
      <section className="card card-pad stack" aria-labelledby="br-map">
        <h2 id="br-map" className="card-title">
          Module crosswalk
        </h2>
        <p className="small">
          {s.counts.both} capabilities exist in both builds · {s.counts.ported} ported to this campus this round · {s.counts.python_only} run only in the Python service.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Module crosswalk">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Python module</th>
                <th scope="col">Capability</th>
                <th scope="col">Campus tab</th>
                <th scope="col">Relation</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {s.crosswalk.map((c) => (
                <tr key={c.module}>
                  <td>
                    <code className="tiny">{c.module}</code>
                  </td>
                  <td>{c.area}</td>
                  <td>{c.tab ? <a href={`/campus/${slug}/t/${c.tab}`}>{c.tab}</a> : "—"}</td>
                  <td>
                    <Chip s={c.relation} />
                  </td>
                  <td className="small">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------------- 64 Departments & Policy Rules ---------------- */

export function DepartmentsPanel({ store, actor, slug, here }: P) {
  const s = departmentStatus(store, actor);
  const loader = hasAny(actor, ["admin", "registrar"]);
  const day = 86400;
  const now = Math.floor(Date.now() / 1000);
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="dp-st">
        <h2 id="dp-st" className="card-title">
          Department readiness <span className="badge">sandbox</span>
        </h2>
        <p className="small">
          Policy: {s.policyVersion ? <strong>{s.policyVersion}</strong> : <span className="badge badge-amber">none loaded — rules fail closed</span>} · financial execution: <strong>off</strong> · identity provider: <strong>not connected</strong>
        </p>
        {s.missing.length > 0 && <p className="notice notice-warn small">Missing: {s.missing.join(", ")}</p>}
        <ul className="small">
          {s.departments.map((d) => (
            <li key={d.name}>
              <strong>{d.name}:</strong> {d.status}
            </li>
          ))}
        </ul>
        {loader && (
          <form method="post" action={api(slug, "a/departments.policy_set")} className="row">
            <Hidden values={{ back: here, example: "true", notice: "Synthetic example policy loaded as a new version." }} />
            <label>
              Version label
              <input name="versionLabel" defaultValue={`synthetic-${new Date().toISOString().slice(0, 10)}`} maxLength={60} />
            </label>
            <button className="btn btn-outline btn-sm">Load the synthetic example policy</button>
            <span className="tiny muted">Or post your own policy JSON to departments.policy_set.</span>
          </form>
        )}
      </section>
      {s.policyVersion && (
        <section className="card card-pad stack" aria-labelledby="dp-pv">
          <h2 id="dp-pv" className="card-title">
            Previews on synthetic data (never executed)
          </h2>
          <form method="post" action={api(slug, "a/departments.preview")} className="row">
            <Hidden values={{ back: here, kind: "holds", synthetic: "true", invoice: JSON.stringify({ balance_minor: 125000, due_at: now - 20 * day, announcements: {} }), notice: "Hold preview recorded (not executed)." }} />
            <button className="btn btn-outline btn-sm">Preview holds: balance 1,250.00, 20 days past due</button>
          </form>
          <form method="post" action={api(slug, "a/departments.preview")} className="row">
            <Hidden values={{ back: here, kind: "refund", synthetic: "true", elapsedDays: "10", purchase: JSON.stringify({ model: "pay_in_full", scope: "program", scope_id: "synthetic-program", paid_minor: 120000, refunded_minor: 0 }), notice: "Refund preview recorded (not executed)." }} />
            <button className="btn btn-outline btn-sm">Preview refund: program paid in full, day 10</button>
          </form>
          <form method="post" action={api(slug, "a/departments.preview")} className="row">
            <Hidden values={{ back: here, kind: "identity", synthetic: "true", priorFailures: "0", identity: JSON.stringify({ result: "failed", provider_reference: "synthetic-ref-001", verified_at: new Date().toISOString() }), notice: "Identity preview recorded." }} />
            <button className="btn btn-outline btn-sm">Preview identity: provider says failed (first try)</button>
          </form>
          {s.previews.length > 0 && (
            <ul className="small">
              {s.previews.map((p) => (
                <li key={String(p.id)}>
                  <Chip s={String(p.kind)} /> {String(p.summary)} · policy {String(p.policyVersion)} · <span className="tiny muted">{String(p.at).slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------------- 65 Voice & Digital Human Studio ---------------- */

export function VoicePanel({ store, actor, slug, here, sp }: P) {
  const v = voiceOverview(store, actor);
  const admin = hasAny(actor, ["admin"]);
  const persona = sp.persona === "tunde" ? "tunde" : "amara";
  const lang = LANGUAGES.some((l) => l.code === sp.lang) ? (sp.lang as string) : "en";
  let reply: ReturnType<typeof personaReply> | null = null;
  try {
    reply = sp.msg ? personaReply(persona, lang, sp.msg) : null;
  } catch {
    reply = null;
  }
  const stories = listStories(store, actor);
  return (
    <div className="stack">
      <p className="notice notice-info small">{v.disclosure} No audio, video, cloning or training runs here: no model is served. Every capability below carries exactly one status label.</p>
      <section className="card card-pad stack" aria-labelledby="vs-chat">
        <h2 id="vs-chat" className="card-title">
          Amara & Tunde — persona chat (text)
        </h2>
        <form method="get" action={here} className="row">
          <label>
            Persona
            <select name="persona" defaultValue={persona}>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select name="lang" defaultValue={lang}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message
            <input name="msg" defaultValue={sp.msg ?? ""} maxLength={1000} placeholder="Which programs can I join?" />
          </label>
          <button className="btn btn-primary btn-sm">Ask</button>
        </form>
        <p className="small">
          <strong>{PERSONAS.find((p) => p.id === persona)!.name}:</strong> {PERSONAS.find((p) => p.id === persona)!.openers[lang as "en"]}
        </p>
        {reply && (
          <div className="card card-pad" aria-live="polite">
            <p>
              <strong>{reply.persona}</strong> ({LANGUAGES.find((l) => l.code === reply!.language)?.label}): {reply.reply}
            </p>
            {reply.note && <p className="small">{reply.note}</p>}
            <p className="tiny muted">
              {reply.disclosure} Voice playback: <Label l={reply.voicePlayback} /> {reply.handoff ? "· Passed to a person." : ""}
            </p>
          </div>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="vs-cap">
        <h2 id="vs-cap" className="card-title">
          Platform status
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Capability status">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Capability</th>
                <th scope="col">Status</th>
                <th scope="col">Blocking reason</th>
              </tr>
            </thead>
            <tbody>
              {v.capabilities.map((c) => (
                <tr key={c.capability}>
                  <td>{c.group}</td>
                  <td>{c.capability}</td>
                  <td>
                    <Label l={c.label} />
                  </td>
                  <td className="small">{c.blocker || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card-pad stack" aria-labelledby="vs-cc">
        <h2 id="vs-cc" className="card-title">
          Consent & Identity Center
        </h2>
        <p className="small">A real person's voice or likeness can't be used until all {CONSENT_CHECKS.length} checks have evidence and two different reviewers approve. People who record evidence can't approve. Revocation blocks generation immediately.</p>
        {v.consent.length === 0 ? (
          <p className="small">No consent cases.</p>
        ) : (
          <ul className="small">
            {v.consent.map((c) => (
              <li key={String(c.id)}>
                <strong>{c.subjectName}</strong> ({c.kind.replace("_", " ")}) <Chip s={c.state} /> · {c.checks}/{c.total} checks · expires {c.expiresOn}
              </li>
            ))}
          </ul>
        )}
        {hasAny(actor, ["admin", "designer"]) && (
          <details>
            <summary>Open a consent case</summary>
            <form method="post" action={api(slug, "a/voice.consent_open")} className="stack">
              <Hidden values={{ back: here, notice: "Consent case opened." }} />
              <label>
                Subject name
                <input name="subjectName" required maxLength={120} />
              </label>
              <label>
                Kind
                <select name="kind">
                  <option value="voice">Voice</option>
                  <option value="digital_double">Digital double</option>
                </select>
              </label>
              <label>
                Approved purposes, audiences and geography
                <textarea name="purposes" required maxLength={1000} />
              </label>
              <label>
                Expires on
                <input name="expiresOn" type="date" required />
              </label>
              <button className="btn btn-outline btn-sm">Open case</button>
            </form>
          </details>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="vs-mr">
        <h2 id="vs-mr" className="card-title">
          Model registry & licence gate {v.gate.passed ? <span className="badge badge-green">gate passes</span> : <span className="badge badge-red">gate fails</span>}
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Model registry">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Capability</th>
                <th scope="col">Code / weights licence</th>
                <th scope="col">Commercial use</th>
                <th scope="col">Licence verified</th>
                <th scope="col">Served</th>
              </tr>
            </thead>
            <tbody>
              {v.models.map((m) => (
                <tr key={String(m.id)}>
                  <td>{m.name}</td>
                  <td>{m.capability}</td>
                  <td className="small">
                    {m.codeLicense} / {m.weightsLicense}
                  </td>
                  <td>{m.commercialUse ? "yes" : <span className="badge badge-amber">non-commercial</span>}</td>
                  <td>{m.verified ? "yes" : "not yet"}</td>
                  <td>no</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">Licences are recorded as published by each project; a person verifies each one (with a reference) before any paid route. Non-commercial weights can never route to Starter, Creator, Pro, Business or Enterprise.</p>
        {admin && (
          <form method="post" action={api(slug, "a/voice.route_set")} className="row">
            <Hidden values={{ back: here, notice: "Route saved." }} />
            <label>
              Plan
              <select name="plan">
                {PLANS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select name="modelId">
                {v.models.map((m) => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {m.name} ({m.capability})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Capability
              <input name="capability" defaultValue="tts" />
            </label>
            <button className="btn btn-outline btn-sm">Route</button>
          </form>
        )}
        {v.routes.length > 0 && (
          <p className="small">
            Routes: {v.routes.map((r) => `${r.plan}/${r.capability} → ${r.model}`).join(" · ")}
          </p>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="vs-gen">
        <h2 id="vs-gen" className="card-title">
          Generation requests
        </h2>
        <p className="small">Every request is moderated (impersonation, political persuasion, authentication use, sexual content and deceptive calls are blocked) and costed in credits. With no served model, requests stop at “not operational” and nothing is charged.</p>
        <form method="post" action={api(slug, "a/voice.generate")} className="row">
          <Hidden values={{ back: here, notice: "Request recorded." }} />
          <label>
            Capability
            <select name="capability">
              {Object.entries(CREDIT_RATES).map(([k, r]) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")} ({r.credits} credits / {r.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Text
            <input name="text" required maxLength={10000} placeholder="Welcome to Module 1." />
          </label>
          <button className="btn btn-outline btn-sm">Request</button>
        </form>
        {v.jobs.length > 0 && (
          <ul className="small">
            {v.jobs.map((j) => (
              <li key={String(j.id)}>
                <Chip s={j.state} /> {j.capability} · {j.estimatedCredits} credits estimated · {j.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="vs-sb">
        <h2 id="vs-sb" className="card-title">
          Storyboards
        </h2>
        <form method="post" action={api(slug, "a/voice.story_create")} className="row">
          <Hidden values={{ back: here, notice: "Project created." }} />
          <label>
            Title
            <input name="title" required maxLength={160} placeholder="Module 1 welcome" />
          </label>
          <button className="btn btn-outline btn-sm">New project</button>
        </form>
        {stories.map((s) => (
          <article key={s.id} className="card card-pad stack">
            <p>
              <strong>{s.title}</strong> <span className="tiny muted">revision {s.revision}</span> {s.archived && <span className="badge">archived</span>}
            </p>
            {s.scenes.length > 0 && (
              <ol className="small">
                {s.scenes.map((sc) => (
                  <li key={sc.id}>
                    {sc.speaker} ({sc.avatar}, {sc.language}): {sc.script}
                  </li>
                ))}
              </ol>
            )}
            {!s.archived && (
              <form method="post" action={api(slug, "a/voice.story")} className="row">
                <Hidden values={{ back: here, id: s.id, action: "scene", revision: String(s.revision), notice: "Scene added (draft only)." }} />
                <label>
                  Speaker
                  <input name="speaker" required maxLength={80} defaultValue="Host" />
                </label>
                <label>
                  Persona
                  <select name="avatar">
                    {PERSONAS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <input type="hidden" name="voice" value="" />
                <label>
                  Language
                  <select name="language">
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Script
                  <input name="script" required maxLength={4000} />
                </label>
                <button className="btn btn-outline btn-sm">Add scene</button>
              </form>
            )}
          </article>
        ))}
      </section>
      {v.pronunciations.length > 0 && (
        <section className="card card-pad" aria-labelledby="vs-pr">
          <h2 id="vs-pr" className="card-title">
            Pronunciation dictionary
          </h2>
          <ul className="small">
            {v.pronunciations.map((p) => (
              <li key={String(p.id)}>
                {p.term} → {p.say} ({p.language})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ---------------- 66 Operational Acceptance ---------------- */

export function AcceptancePanel({ store, actor, slug, here }: P) {
  const s = acceptanceStatus(store, actor);
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="oa-st">
        <h2 id="oa-st" className="card-title">
          Readiness: <Chip s={s.readiness} /> <span className="badge badge-red">production not allowed by this register</span>
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Acceptance areas">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {s.areas.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>
                    <Chip s={x.status} />
                  </td>
                  <td>{x.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Blockers ({s.blockers.length})</summary>
          <ul className="small">
            {s.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </details>
      </section>
      <section className="card card-pad stack" aria-labelledby="oa-ev">
        <h2 id="oa-ev" className="card-title">
          Submit evidence
        </h2>
        <form method="post" action={api(slug, "a/acceptance.record")} className="stack">
          <Hidden values={{ back: here, notice: "Evidence submitted (unverified until a different admin verifies it)." }} />
          <label>
            Area
            <select name="area">
              {Object.entries(AREAS).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Release
            <input name="release" required maxLength={120} defaultValue="campus-staging" />
          </label>
          <label>
            Owner
            <input name="owner" required maxLength={120} />
          </label>
          <label>
            Reference (link to the run, report or ticket)
            <input name="reference" required maxLength={1000} />
          </label>
          <label>
            Note
            <textarea name="note" required maxLength={2000} />
          </label>
          <button className="btn btn-primary btn-sm">Submit evidence</button>
        </form>
        <p className="tiny muted">Restore drills run from the Admin Console (backup → drill into a validation tenant). Sign-offs needed: {SIGNOFF_ROLES.join(", ")} — three different people.</p>
        {s.evidence.length > 0 && (
          <ul className="small">
            {s.evidence.map((e) => (
              <li key={String(e.id)}>
                {AREAS[e.area]} · {e.release} · <Chip s={e.state} /> · {e.reference}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
