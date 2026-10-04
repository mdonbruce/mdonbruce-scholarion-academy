import { CampusError, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import * as prc from "../../services/proctor";
import { api, Chip, Denied, fmt, Hidden } from "../kit";

type SP = Record<string, string | undefined>;

function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((l, i) => (
        <p key={i}>
          {l}
        </p>
      ))}
    </>
  );
}

/** Pre-test checklist for one proctored assessment (student). */
export function PretestChecklist({ slug, store, actor, quizId, back }: { slug: string; store: TenantStore; actor: Actor; quizId: string; back: string }) {
  const r = prc.readiness(store, actor, quizId);
  const id = `pt-${quizId.replace(/\W/g, "")}`;
  return (
    <section className="card card-pad stack" aria-labelledby={`${id}-h`}>
      <div className="between">
        <h3 id={`${id}-h`} className="card-title">
          Pre-test checklist
        </h3>
        <Chip s={r.complete ? "complete" : "not_started"} />
      </div>
      <p className="small">
        This is a proctored assessment. Confirm your setup before you start — it helps avoid delays and interruptions on test day. The full requirements are in the{" "}
        <a href={r.policyLink}>Assessment Policy</a>.
      </p>
      <form method="post" action={api(slug, "a/proctor.save_readiness")} className="stack">
        <Hidden values={{ back, quizId, notice: "Checklist saved." }} />
        <fieldset className="stack">
          <legend className="small">Check each item when it's ready</legend>
          {r.items.map((it) => (
            <label key={it.key} className="check">
              <input type="checkbox" name="checks[]" value={it.key} defaultChecked={it.done} /> {it.label}
            </label>
          ))}
        </fieldset>
        <div>
          <button className="btn btn-outline btn-sm" type="submit">
            Save checklist
          </button>
        </div>
      </form>
      <p className="tiny muted">You can still use tools built into the testing platform when they're available, including highlighting.</p>
    </section>
  );
}

function ReplyCard({ reply }: { reply: prc.ProctorReply }) {
  return (
    <section className="card card-pad stack" aria-live="polite" aria-labelledby="pr-reply-h">
      <div className="between">
        <h3 id="pr-reply-h" className="card-title">
          Setup assistant
        </h3>
        <Chip s={reply.decision} />
      </div>
      <Lines text={reply.text} />
      {reply.focus && (
        <ul>
          {reply.focus.map((f) => (
            <li key={f.key}>
              <strong>{f.label}:</strong> {f.text}
            </li>
          ))}
        </ul>
      )}
      {reply.checklist && (
        <>
          <h4>Quick pre-test checklist</h4>
          <ul>
            {reply.checklist.map((c) => (
              <li key={c.key}>{c.label}</li>
            ))}
          </ul>
        </>
      )}
      {reply.escalation && (
        <p className="notice notice-info">
          Forwarded to {reply.escalation.team} · response expected {reply.escalation.responseTime} · reference {reply.escalation.ticketId}
        </p>
      )}
      <p className="tiny muted">
        {reply.disclosure} <a href={reply.policyLink}>Assessment Policy</a>
      </p>
    </section>
  );
}

/** Tab 49 workflow panel. */
export function ProctorPanel({ store, actor, slug, sp, here }: { store: TenantStore; actor: Actor; slug: string; sp: SP; here: string }) {
  const s = prc.proctorSettings(store);
  let reply: prc.ProctorReply | null = null;
  let replyErr = "";
  if (sp.reply) {
    try {
      reply = prc.proctorReply(store, actor, sp.reply);
    } catch (e) {
      replyErr = e instanceof CampusError ? e.message : String(e);
    }
  }
  const staff = hasAny(actor, ["admin", "support", "advisor", "instructor", "ta"]) || Object.values(actor.courseRoles).some((r) => r.includes("instructor") || r.includes("ta"));
  const mine = prc.myProctoredAssessments(store, actor);
  const approvedQs = prc.DEFAULT_TALKING_POINTS.map((t) => t.question);
  return (
    <>
      <section className="card card-pad stack" id="ask" aria-labelledby="pr-ask-h">
        <h2 id="pr-ask-h" className="card-title">
          Ask the setup assistant
        </h2>
        <p className="small">
          Questions about your webcam view, ID, testing area or tools for a proctored assessment at {s.institution}. The assistant shares approved guidance only; the{" "}
          <a href={s.assessmentPolicyUrl}>Assessment Policy</a> is the source of truth. Please don't send photos of IDs or documents here.
        </p>
        <form method="post" action={api(slug, "a/proctor.ask")} className="stack">
          <Hidden values={{ back: here, result_param: "reply", notice: "Answered." }} />
          <div className="field">
            <label htmlFor="pr-q">Your question</label>
            <textarea id="pr-q" name="question" rows={3} required maxLength={1000} />
          </div>
          <div>
            <button className="btn btn-primary btn-sm" type="submit">
              Ask
            </button>
          </div>
        </form>
        <div className="stack">
          <p className="tiny muted">Common questions</p>
          <div className="row">
            {approvedQs.map((q, i) => (
              <form key={q} method="post" action={api(slug, "a/proctor.ask")}>
                <Hidden values={{ back: here, result_param: "reply", notice: "Answered.", question: q }} />
                <button className="btn btn-outline btn-sm" type="submit" aria-label={`Ask: ${q}`} id={`pr-common-${i}`}>
                  {q}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>
      {reply && <ReplyCard reply={reply} />}
      {replyErr && <Denied message={replyErr} />}

      <section className="card card-pad stack" aria-labelledby="pr-exp-h">
        <h2 id="pr-exp-h" className="card-title">
          What to expect during a proctored assessment
        </h2>
        <div className="grid g3">
          {prc.FOCUS.map((f) => (
            <div key={f.key} className="card card-pad">
              <strong>{f.label}</strong>
              <p className="small">{f.text}</p>
            </div>
          ))}
        </div>
        <ul>
          {prc.EXPECTATIONS.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <h3>What isn't changing</h3>
        <ul>
          {prc.NOT_CHANGING.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p className="small">
          If you rely on assistive technology or a setup these expectations would affect, contact {s.accessibilityOffice} through the <a href={s.accommodationsUrl}>accommodations process</a> well before your assessment date.
        </p>
      </section>

      {mine.length > 0 && (
        <section className="card card-pad stack" aria-labelledby="pr-mine-h">
          <h2 id="pr-mine-h" className="card-title">
            My proctored assessments
          </h2>
          <ul className="item-list">
            {mine.map((m) => (
              <li key={m.quizId}>
                <a href={`/campus/${slug}/courses/${m.courseId}/quizzes/${m.quizId}`}>{m.title}</a> <Chip s={m.complete ? "complete" : "not_started"} />{" "}
                <span className="tiny muted">
                  checklist {m.checked}/{m.of}
                  {m.availableFrom ? ` · opens ${fmt(m.availableFrom)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {staff && <StaffPanel store={store} actor={actor} slug={slug} here={here} />}
    </>
  );
}

function StaffPanel({ store, actor, slug, here }: { store: TenantStore; actor: Actor; slug: string; here: string }) {
  const guide = prc.staffGuide(store, actor);
  const ov = prc.proctorOverview(store, actor);
  return (
    <section className="card card-pad stack" aria-labelledby="pr-staff-h">
      <h2 id="pr-staff-h" className="card-title">
        Staff guidance and follow-up
      </h2>
      <ul>
        {guide.staffNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <details>
        <summary>Approved answers ({guide.approvedAnswers.length})</summary>
        <dl className="campus-dl">
          {guide.approvedAnswers.map((x) => (
            <div key={String(x.key)}>
              <dt>{String(x.question)}</dt>
              <dd>{x.answer}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="small">
        {ov.questions} question(s) logged · {ov.escalations} escalated to {guide.settings.escalationTeam} (response {guide.settings.responseSla})
      </p>
      {ov.readiness.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Checklist completion by assessment">
          <table className="table">
            <caption className="sr-only">Pre-test checklist completion</caption>
            <thead>
              <tr>
                <th scope="col">Proctored assessment</th>
                <th scope="col">Students</th>
                <th scope="col">Checklist complete</th>
              </tr>
            </thead>
            <tbody>
              {ov.readiness.map((r) => (
                <tr key={String(r.quizId)}>
                  <td>{r.title}</td>
                  <td>{r.students}</td>
                  <td>
                    {r.complete} ({r.pct}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ov.awaitingApprovedAnswer.length > 0 && (
        <>
          <h3>Questions awaiting an approved answer</h3>
          <ul className="stack">
            {ov.awaitingApprovedAnswer.map((q) => (
              <li key={String(q.id)}>
                <p>
                  “{String(q.question)}” <span className="tiny muted">{q.ticketId ? `ticket ${String(q.ticketId)}` : ""}</span>
                </p>
                <details>
                  <summary>Draft a talking point</summary>
                  <form method="post" action={api(slug, "a/proctor.promote")} className="stack">
                    <Hidden values={{ back: here, logId: String(q.id), notice: "Draft talking point created. An admin reviews and publishes it." }} />
                    <div className="field">
                      <label htmlFor={`pk-${String(q.id)}`}>Key</label>
                      <input id={`pk-${String(q.id)}`} name="key" required />
                    </div>
                    <div className="field">
                      <label htmlFor={`pa-${String(q.id)}`}>Approved answer</label>
                      <textarea id={`pa-${String(q.id)}`} name="answer" rows={3} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`pt-${String(q.id)}`}>Trigger phrases (comma separated)</label>
                      <input id={`pt-${String(q.id)}`} name="triggers" />
                    </div>
                    <div>
                      <button className="btn btn-outline btn-sm" type="submit">
                        Create draft
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
