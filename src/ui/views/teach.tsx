import type { ReactNode } from "react";
import type { courseReviewsVM, teachAnalyticsVM, teachCourseVM, teachHomeVM, teachItemVM, Viewer } from "@/bff/views";
import { fmtDateTime } from "../components/cards";
import { AppShell, Flash } from "../components/chrome";

type V = NonNullable<Viewer>;
type FlashProps = { notice?: string; error?: string };
const h2 = { fontFamily: "var(--font-sans)", fontSize: "1.1rem" } as const;
const KIND_LABEL: Record<string, string> = { reading: "Reading", video: "Video", quiz: "Quiz", lab: "Lab", project: "Project", discussion: "Discussion", summary: "Summary", capstone: "Capstone" };
const gap = (px: number) => ({ ["--gap" as string]: `${px}px` });

function StateBadge({ status, review }: { status: string; review?: { state: string } }) {
  if (status === "published") return <span className="badge badge-green">Published</span>;
  if (review?.state === "submitted") return <span className="badge badge-blue">In review</span>;
  if (review?.state === "changes_requested") return <span className="badge badge-amber">Changes requested</span>;
  return <span className="badge">Draft</span>;
}

function TeachShell({ viewer, title, crumbs, flash, children }: { viewer: V; title: string; crumbs?: ReactNode; flash?: FlashProps; children: ReactNode }) {
  return (
    <AppShell viewer={viewer} current="/teach">
      {crumbs && (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs}
        </nav>
      )}
      <h1 className="page-title">{title}</h1>
      {flash && <Flash {...flash} />}
      {children}
    </AppShell>
  );
}

/* ---------------- /teach ---------------- */

export function TeachHomeView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof teachHomeVM>; flash: FlashProps }) {
  return (
    <TeachShell viewer={viewer} title="Teach" flash={flash}>
      <p className="muted">Build a course, check it against the publishing checklist, and send it to a reviewer. Nothing is public until a reviewer approves it.</p>
      <div className="with-aside">
        <div className="stack">
          {vm.length === 0 && <div className="panel muted">No courses yet. Start one on the right.</div>}
          {vm.map((c) => (
            <section key={c.course.id} className="card card-pad">
              <div className="row between" style={{ flexWrap: "wrap" }}>
                <a href={`/teach/${c.course.id}`} style={{ fontWeight: 700 }}>
                  {c.course.title}
                </a>
                <StateBadge status={c.course.status} review={c.course.review} />
              </div>
              <p className="small muted" style={{ margin: "6px 0" }}>
                {c.modules} module{c.modules === 1 ? "" : "s"} · {c.items} item{c.items === 1 ? "" : "s"} · {c.course.level}
                {c.course.status === "published" ? ` · ${c.learners} learner${c.learners === 1 ? "" : "s"}` : ""}
              </p>
              <div className="row small">
                <a href={`/teach/${c.course.id}`}>Edit</a>
                {c.course.status !== "published" && <span className={c.issues ? "muted" : ""}>{c.issues ? `${c.issues} checklist item${c.issues === 1 ? "" : "s"} left` : "Ready for review"}</span>}
                {c.course.status === "published" && (
                  <>
                    <a href={`/teach/${c.course.id}/analytics`}>Analytics</a>
                    <a href={`/learn/${c.course.slug}`}>View live page</a>
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
        <aside>
          <form method="post" action="/api/v1/teach/courses" className="panel">
            <h2 style={h2}>New course</h2>
            <div className="field">
              <label htmlFor="nc-title">Title</label>
              <input id="nc-title" name="title" required minLength={4} maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="nc-tagline">One-line tagline</label>
              <input id="nc-tagline" name="tagline" maxLength={140} />
            </div>
            <div className="field">
              <label htmlFor="nc-level">Level</label>
              <select id="nc-level" name="level" defaultValue="Beginner">
                {["Beginner", "Foundational", "Intermediate", "Advanced"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nc-skills">
                Skills <span className="hint">(comma-separated)</span>
              </label>
              <input id="nc-skills" name="skills" />
            </div>
            <button className="btn btn-primary btn-block">Create draft</button>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Courses are non-credit professional training. Don't mention credit, salaries, job outcomes or institutions; the checklist blocks them.
            </p>
          </form>
        </aside>
      </div>
    </TeachShell>
  );
}

/* ---------------- /teach/[id] ---------------- */

export function TeachCourseView({ viewer, vm, flash }: { viewer: V; vm: NonNullable<ReturnType<typeof teachCourseVM>>; flash: FlashProps }) {
  const p = vm.course;
  const inReview = p.review?.state === "submitted";
  const published = p.status === "published";
  return (
    <TeachShell viewer={viewer} title={p.title} crumbs={<a href="/teach">Teach</a>} flash={flash}>
      <div className="row" style={{ ...gap(8), marginTop: -8, marginBottom: 12, flexWrap: "wrap" }}>
        <StateBadge status={p.status} review={p.review} />
        <span className="small muted">
          {p.level} · about {p.hours} hour{p.hours === 1 ? "" : "s"}
        </span>
        {published && (
          <>
            <a className="small" href={`/teach/${p.id}/analytics`}>
              Analytics
            </a>
            <a className="small" href={`/learn/${p.slug}`}>
              Live page
            </a>
          </>
        )}
      </div>
      {p.review?.state === "changes_requested" && p.review.note && (
        <div className="notice notice-warn" role="status">
          <strong>Reviewer's note:</strong> {p.review.note}
        </div>
      )}
      {inReview && (
        <div className="notice notice-ok" role="status" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Submitted {fmtDateTime(p.review!.submittedAt)}. Editing is locked while a reviewer looks at it.</span>
          <form method="post" action={`/api/v1/teach/courses/${p.id}/withdraw`}>
            <button className="btn btn-outline btn-sm">Withdraw from review</button>
          </form>
        </div>
      )}
      <div className="with-aside">
        <div className="stack">
          <details className="card card-pad" open={!p.description}>
            <summary style={{ fontWeight: 700, cursor: "pointer" }}>Course details</summary>
            <form method="post" action={`/api/v1/teach/courses/${p.id}`} className="stack" style={{ ...gap(10), marginTop: 12 }}>
              <fieldset disabled={inReview} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="c-title">Title</label>
                  <input id="c-title" name="title" defaultValue={p.title} required minLength={4} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="c-tagline">Tagline</label>
                  <input id="c-tagline" name="tagline" defaultValue={p.tagline} maxLength={140} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="c-desc">
                    Description <span className="hint">(at least 80 characters)</span>
                  </label>
                  <textarea id="c-desc" name="description" defaultValue={p.description} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="c-wyl">
                    What learners will be able to do <span className="hint">(one per line, at least 3)</span>
                  </label>
                  <textarea id="c-wyl" name="whatYoullLearn" defaultValue={p.whatYoullLearn.join("\n")} />
                </div>
                <div className="grid g2">
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="c-level">Level</label>
                    <select id="c-level" name="level" defaultValue={p.level}>
                      {["Beginner", "Foundational", "Intermediate", "Advanced"].map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="c-skills">Skills (comma-separated)</label>
                    <input id="c-skills" name="skills" defaultValue={p.skills.join(", ")} />
                  </div>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="small" style={{ fontWeight: 700 }}>
                    Access
                  </legend>
                  <input type="hidden" name="freeToAudit" value="false" />
                  <label className="check small">
                    <input type="checkbox" name="freeToAudit" defaultChecked={p.freeToAudit} /> Free to audit (videos and readings at no cost)
                  </label>
                  <input type="hidden" name="plusEligible" value="false" />
                  <label className="check small">
                    <input type="checkbox" name="plusEligible" defaultChecked={p.plusEligible} /> Included in Scholarion Plus
                  </label>
                  <p className="hint tiny" style={{ margin: "4px 0 0" }}>
                    Off: Plus subscribers need to buy this course separately. Existing purchases are not affected.
                  </p>
                </fieldset>
                <div>
                  <button className="btn btn-primary btn-sm">Save details</button>
                </div>
              </fieldset>
            </form>
          </details>

          <section id="modules" className="stack" aria-labelledby="mods-h">
            <h2 id="mods-h" style={h2}>
              Modules and items
            </h2>
            {vm.modules.length === 0 && <div className="panel muted small">Add your first module below.</div>}
            {vm.modules.map((m) => (
              <section key={m.no} className="card card-pad">
                <div className="row between" style={{ flexWrap: "wrap" }}>
                  <strong>
                    Module {m.no}: {m.title}
                  </strong>
                  {!inReview && (
                    <form method="post" action={`/api/v1/teach/courses/${p.id}/modules/${m.no}/delete`}>
                      <button className="linkish tiny">Delete module</button>
                    </form>
                  )}
                </div>
                {m.overview && (
                  <p className="small muted" style={{ margin: "4px 0 8px" }}>
                    {m.overview}
                  </p>
                )}
                <ol className="item-list" style={{ margin: "8px 0" }}>
                  {m.items.map((i, idx) => (
                    <li key={i.id} className="li row between" style={{ flexWrap: "wrap" }}>
                      <span>
                        <span className="badge">{KIND_LABEL[i.kind]}</span> <a href={`/teach/${p.id}/item/${i.id}`}>{i.title}</a>
                        <span className="tiny muted">
                          {" "}
                          · {i.minutes} min{i.graded ? ` · graded${published ? ` ${i.weight}%` : ""}` : ""}
                        </span>
                      </span>
                      {!inReview && (
                        <span className="row" style={gap(4)}>
                          <form method="post" action={`/api/v1/teach/items/${i.id}/move`}>
                            <input type="hidden" name="dir" value="up" />
                            <button className="btn btn-ghost btn-sm" disabled={idx === 0} aria-label={`Move ${i.title} up`}>
                              ↑
                            </button>
                          </form>
                          <form method="post" action={`/api/v1/teach/items/${i.id}/move`}>
                            <input type="hidden" name="dir" value="down" />
                            <button className="btn btn-ghost btn-sm" disabled={idx === m.items.length - 1} aria-label={`Move ${i.title} down`}>
                              ↓
                            </button>
                          </form>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {!inReview && (
                  <form method="post" action={`/api/v1/teach/courses/${p.id}/items`} className="row" style={{ ...gap(8), flexWrap: "wrap" }}>
                    <input type="hidden" name="moduleNo" value={m.no} />
                    <label className="sr-only" htmlFor={`k-${m.no}`}>
                      Item type
                    </label>
                    <select id={`k-${m.no}`} name="kind" defaultValue="reading" style={{ maxWidth: 150 }}>
                      {vm.kinds.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`t-${m.no}`}>
                      Item title
                    </label>
                    <input id={`t-${m.no}`} name="title" placeholder="Item title" required minLength={3} style={{ flex: 1, minWidth: 160 }} />
                    <button className="btn btn-outline btn-sm">Add item</button>
                  </form>
                )}
              </section>
            ))}
            {!inReview && (
              <form method="post" action={`/api/v1/teach/courses/${p.id}/modules`} className="panel">
                <h3 style={{ ...h2, fontSize: "1rem" }}>Add a module</h3>
                <div className="field">
                  <label htmlFor="m-title">Module title</label>
                  <input id="m-title" name="title" required minLength={3} />
                </div>
                <div className="field">
                  <label htmlFor="m-ov">Overview</label>
                  <textarea id="m-ov" name="overview" rows={2} />
                </div>
                <div className="field">
                  <label htmlFor="m-obj">
                    Objectives <span className="hint">(one per line)</span>
                  </label>
                  <textarea id="m-obj" name="objectives" rows={3} />
                </div>
                <button className="btn btn-outline btn-sm">Add module</button>
              </form>
            )}
          </section>
        </div>

        <aside className="card card-pad stack" aria-labelledby="check-h" style={{ alignSelf: "start" }}>
          <h2 id="check-h" style={h2}>
            Publishing checklist
          </h2>
          {published ? (
            <p className="small" style={{ margin: 0 }}>
              Published{p.review?.decidedAt ? ` ${fmtDateTime(p.review.decidedAt)}` : ""}. Changes you make now go live straight away; quizzes with learner attempts are locked.
            </p>
          ) : vm.checklist.length === 0 ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                <span className="badge badge-green">All clear</span> Captions, quizzes, labs, rubrics and claims all check out.
              </p>
              {!inReview && (
                <form method="post" action={`/api/v1/teach/courses/${p.id}/submit`}>
                  <button className="btn btn-primary btn-block">Submit for review</button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                {vm.checklist.length} thing{vm.checklist.length === 1 ? "" : "s"} to fix before review:
              </p>
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {vm.checklist.map((c, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{c.where}:</strong> {c.href ? <a href={c.href}>{c.message}</a> : c.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </TeachShell>
  );
}

/* ---------------- /teach/[id]/item/[itemId] ---------------- */

export function TeachItemView({ viewer, vm, flash }: { viewer: V; vm: NonNullable<ReturnType<typeof teachItemVM>>; flash: FlashProps }) {
  const { course: p, item: i } = vm;
  const ro = vm.locked;
  return (
    <TeachShell
      viewer={viewer}
      title={i.title}
      flash={flash}
      crumbs={
        <>
          <a href="/teach">Teach</a> › <a href={`/teach/${p.id}`}>{p.title}</a> › Module {i.moduleNo}
        </>
      }
    >
      <p className="small muted" style={{ marginTop: -8 }}>
        <span className="badge">{KIND_LABEL[i.kind]}</span> {i.graded ? "Graded" : "Not graded"} · AI Tutor: {i.aiUsePolicy === "closed" ? "off" : i.aiUsePolicy === "hints_only" ? "hints only" : "on"}
      </p>
      {vm.issues.length > 0 && (
        <div className="notice notice-warn" role="status">
          <strong>Before publishing:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {vm.issues.map((x, k) => (
              <li key={k}>{x.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="stack">
        <form method="post" action={`/api/v1/teach/items/${i.id}`} className="card card-pad stack" style={gap(10)}>
          <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <div className="grid g2">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="i-title">Title</label>
                <input id="i-title" name="title" defaultValue={i.title} required minLength={3} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="i-min">Estimated minutes</label>
                <input id="i-min" name="minutes" type="number" min={1} max={600} defaultValue={i.minutes} />
              </div>
            </div>
            <div className="grid g2">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="i-ai">AI Tutor on this item</label>
                <select id="i-ai" name="aiUsePolicy" defaultValue={i.aiUsePolicy}>
                  <option value="open">On</option>
                  <option value="hints_only">Hints only (no answers or code)</option>
                  <option value="closed">Off (graded assessment)</option>
                </select>
              </div>
              {i.graded ? (
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="i-w">
                    Weight <span className="hint">(relative; normalised to 100% on publish)</span>
                  </label>
                  <input id="i-w" name="weight" type="number" min={0} max={100} defaultValue={i.weight} />
                </div>
              ) : (
                <label className="check" style={{ alignSelf: "end" }}>
                  <input type="hidden" name="auditVisible" value="false" />
                  <input type="checkbox" name="auditVisible" defaultChecked={i.auditVisible} /> Free auditors can see this
                </label>
              )}
            </div>

            {(i.kind === "reading" || i.kind === "discussion") && (
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="i-body">{i.kind === "reading" ? "Reading" : "Discussion prompt"}</label>
                <textarea id="i-body" name="body" rows={10} defaultValue={i.body ?? ""} />
              </div>
            )}

            {i.kind === "video" && i.video && (
              <>
                <div className="grid g2">
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="v-src">Video file or stream URL</label>
                    <input id="v-src" name="src" type="url" defaultValue={i.video.src ?? ""} placeholder="https://" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="v-dur">Length (minutes)</label>
                    <input id="v-dur" name="durationMin" type="number" min={0} step={0.5} defaultValue={i.video.durationSec / 60 || ""} />
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="v-cap">
                    Caption languages <span className="hint">(language codes, comma-separated, e.g. en, es, fr; required)</span>
                  </label>
                  <input id="v-cap" name="captions" defaultValue={i.video.captions.join(", ")} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="v-tr">
                    Transcript <span className="hint">(required; also grounds the AI Tutor)</span>
                  </label>
                  <textarea id="v-tr" name="transcript" rows={8} defaultValue={i.video.transcript} />
                </div>
              </>
            )}

            {i.kind === "quiz" && i.quiz && (
              <div className="grid g2">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="q-pass">Pass mark (%)</label>
                  <input id="q-pass" name="passPercent" type="number" min={1} max={100} defaultValue={i.quiz.passPercent} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="q-time">Time limit (minutes)</label>
                  <input id="q-time" name="timeLimit" type="number" min={1} max={240} defaultValue={i.quiz.timeLimitMinutes} />
                </div>
              </div>
            )}

            {i.kind === "lab" && i.lab && (
              <>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="l-ins">
                    Instructions <span className="hint">(one step per line)</span>
                  </label>
                  <textarea id="l-ins" name="instructions" rows={4} defaultValue={i.lab.instructions.join("\n")} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="l-file">Starter file name</label>
                  <input id="l-file" name="starterFile" defaultValue={i.lab.starterFile} pattern="[\w.\-]+\.py" />
                </div>
                <div className="field code" style={{ margin: 0 }}>
                  <label htmlFor="l-start">Starter code (learners see this)</label>
                  <textarea id="l-start" name="starterCode" rows={8} className="mono" spellCheck={false} defaultValue={i.lab.starterCode} />
                </div>
                <div className="field code" style={{ margin: 0 }}>
                  <label htmlFor="l-sol">Reference solution (never shown to learners)</label>
                  <textarea id="l-sol" name="solution" rows={8} className="mono" spellCheck={false} defaultValue={i.lab.solution ?? ""} />
                </div>
              </>
            )}

            {i.kind === "project" && i.project && (
              <>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="p-sc">Scenario</label>
                  <textarea id="p-sc" name="scenario" rows={5} defaultValue={i.project.scenario} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="p-del">
                    Deliverables <span className="hint">(one per line)</span>
                  </label>
                  <textarea id="p-del" name="deliverables" rows={3} defaultValue={i.project.deliverables.join("\n")} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="p-rub">
                    Rubric <span className="hint">(one per line: Criterion | points)</span>
                  </label>
                  <textarea id="p-rub" name="rubric" rows={4} className="mono" defaultValue={i.project.rubric.map((r) => `${r.criterion} | ${r.points}`).join("\n")} />
                </div>
                <label className="check">
                  <input type="hidden" name="peerReview" value="off" />
                  <input type="checkbox" name="peerReview" defaultChecked={!!i.project.peerReview} /> Peer reviewed (two classmates review each submission)
                </label>
              </>
            )}
            <div>
              <button className="btn btn-primary btn-sm">Save</button>
            </div>
          </fieldset>
        </form>

        {i.kind === "quiz" && i.quiz && (
          <section id="questions" className="card card-pad stack" aria-labelledby="qs-h">
            <h2 id="qs-h" style={h2}>
              Questions ({i.quiz.questions.length})
            </h2>
            <ol className="stack small" style={{ paddingLeft: 18, margin: 0 }}>
              {i.quiz.questions.map((q) => (
                <li key={q.id}>
                  <div className="row between">
                    <strong>{q.prompt}</strong>
                    {!ro && (
                      <form method="post" action={`/api/v1/teach/items/${i.id}/questions/${q.id}/delete`}>
                        <button className="linkish tiny">Remove</button>
                      </form>
                    )}
                  </div>
                  <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                    {q.options.map((o) => (
                      <li key={o.id}>
                        {o.text} {o.id === q.answer && <span className="badge badge-green">Correct</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="tiny muted">Explanation: {q.explanation}</div>
                </li>
              ))}
            </ol>
            {!ro && (
              <form method="post" action={`/api/v1/teach/items/${i.id}/questions`} className="panel">
                <h3 style={{ ...h2, fontSize: "1rem" }}>Add a question</h3>
                <div className="field">
                  <label htmlFor="nq-p">Question</label>
                  <input id="nq-p" name="prompt" required minLength={5} />
                </div>
                <div className="field">
                  <label htmlFor="nq-o">
                    Answer options <span className="hint">(2 to 6, one per line)</span>
                  </label>
                  <textarea id="nq-o" name="options" rows={4} required />
                </div>
                <div className="grid g2">
                  <div className="field">
                    <label htmlFor="nq-a">Correct option number</label>
                    <input id="nq-a" name="answer" type="number" min={1} max={6} required />
                  </div>
                  <div className="field">
                    <label htmlFor="nq-e">Explanation (shown after submitting)</label>
                    <input id="nq-e" name="explanation" required minLength={5} />
                  </div>
                </div>
                <button className="btn btn-outline btn-sm">Add question</button>
              </form>
            )}
          </section>
        )}

        {i.kind === "lab" && i.lab && (
          <section id="tests" className="card card-pad stack" aria-labelledby="ts-h">
            <div className="row between" style={{ flexWrap: "wrap" }}>
              <h2 id="ts-h" style={h2}>
                Autograder tests ({i.lab.tests.length})
              </h2>
              {i.lab.verified && (
                <span className={`badge ${i.lab.verified.score === i.lab.verified.max ? "badge-green" : "badge-red"}`}>
                  Reference solution: {i.lab.verified.score}/{i.lab.verified.max} ({fmtDateTime(i.lab.verified.at)})
                </span>
              )}
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Tests run after the learner's code in the same namespace. Hidden from learners. Each test needs at least one <code>assert</code>.
            </p>
            {i.lab.tests.map((t, k) => (
              <div key={k} className="panel" style={{ padding: 10 }}>
                <div className="row between small">
                  <strong>
                    {t.name} · {t.points} pt{t.points === 1 ? "" : "s"}
                  </strong>
                  {!ro && (
                    <form method="post" action={`/api/v1/teach/items/${i.id}/tests/${k}/delete`}>
                      <button className="linkish tiny">Remove</button>
                    </form>
                  )}
                </div>
                <pre className="mono tiny" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                  {t.code}
                </pre>
              </div>
            ))}
            {!ro && (
              <>
                <form method="post" action={`/api/v1/teach/items/${i.id}/tests`} className="panel">
                  <h3 style={{ ...h2, fontSize: "1rem" }}>Add a test</h3>
                  <div className="grid g2">
                    <div className="field">
                      <label htmlFor="nt-n">What it checks</label>
                      <input id="nt-n" name="name" required minLength={3} />
                    </div>
                    <div className="field">
                      <label htmlFor="nt-p">Points</label>
                      <input id="nt-p" name="points" type="number" min={1} max={100} defaultValue={5} />
                    </div>
                  </div>
                  <div className="field code">
                    <label htmlFor="nt-c">Python</label>
                    <textarea id="nt-c" name="code" rows={4} className="mono" spellCheck={false} placeholder="assert add(1, 2) == 3" required />
                  </div>
                  <button className="btn btn-outline btn-sm">Add test</button>
                </form>
                <form method="post" action={`/api/v1/teach/items/${i.id}/verify`}>
                  <button className="btn btn-primary btn-sm" disabled={!vm.runner}>
                    Run tests against my solution
                  </button>
                  {!vm.runner && <span className="tiny muted"> The lab runner isn't connected in this environment.</span>}
                </form>
              </>
            )}
          </section>
        )}

        {!ro && (
          <form method="post" action={`/api/v1/teach/items/${i.id}/delete`}>
            <button className="btn btn-ghost btn-sm">Delete this item</button>
          </form>
        )}
      </div>
    </TeachShell>
  );
}

/* ---------------- /teach/[id]/analytics ---------------- */

export function TeachAnalyticsView({ viewer, vm }: { viewer: V; vm: NonNullable<ReturnType<typeof teachAnalyticsVM>> }) {
  const p = vm.course;
  const stats: [string, string][] = [
    ["Learners", String(vm.learners)],
    ["Active this week", String(vm.activeThisWeek)],
    ["Earned the certificate", `${vm.completed} (${vm.completionRate}%)`],
    ["Rating", vm.rating ? `${vm.rating.toFixed(1)} from ${vm.reviewCount} review${vm.reviewCount === 1 ? "" : "s"}` : "No reviews yet"],
  ];
  return (
    <TeachShell
      viewer={viewer}
      title={`Analytics: ${p.title}`}
      crumbs={
        <>
          <a href="/teach">Teach</a> › <a href={`/teach/${p.id}`}>{p.title}</a>
        </>
      }
    >
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {stats.map(([k, v]) => (
          <div key={k} className="card card-pad">
            <div className="tiny muted">{k}</div>
            <strong style={{ fontSize: "1.3rem" }}>{v}</strong>
          </div>
        ))}
      </div>
      <section className="card table-wrap">
        <table className="table">
          <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Items: where learners finish and where they struggle</caption>
          <thead>
            <tr>
              <th>Item</th>
              <th>Completed</th>
              <th>Average score</th>
            </tr>
          </thead>
          <tbody>
            {vm.items.map((i) => (
              <tr key={i.id}>
                <td className="small">
                  <span className="badge">{KIND_LABEL[i.kind]}</span> M{i.moduleNo} · {i.title}
                  {i.questions.length > 0 && (
                    <ul className="tiny muted" style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                      {i.questions.map((q, k) => (
                        <li key={k}>
                          {q.prompt}: {q.correctPct === null ? "no answers yet" : `${q.correctPct}% correct of ${q.answered}`}
                          {q.correctPct !== null && q.answered >= 5 && q.correctPct < 40 ? " — review this question" : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="small">
                  {i.completed} ({i.completionPct}%)
                </td>
                <td className="small">{i.averagePct === null ? "—" : `${i.averagePct}% (${i.graded})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Counts are from this platform's records only. Small groups are shown as-is; don't publish these numbers as outcome statistics.
      </p>
    </TeachShell>
  );
}

/* ---------------- /admin/course-reviews ---------------- */

export function CourseReviewQueue({ vm }: { vm: ReturnType<typeof courseReviewsVM> }) {
  if (vm.length === 0) return <div className="panel muted">No courses waiting for review.</div>;
  return (
    <div className="stack">
      {vm.map((c) => (
        <section key={c.course.id} className="card card-pad stack" style={gap(8)}>
          <div className="row between" style={{ flexWrap: "wrap" }}>
            <strong>{c.course.title}</strong>
            <span className="small muted">
              by {c.authors.join(", ")} · submitted {fmtDateTime(c.course.review!.submittedAt)}
            </span>
          </div>
          <p className="small" style={{ margin: 0 }}>
            {c.course.tagline}
          </p>
          <details className="acc">
            <summary>Outline ({c.modules.length} modules)</summary>
            <ol className="small" style={{ paddingLeft: 18 }}>
              {c.modules.map((m) => (
                <li key={m.no}>
                  {m.title}
                  <ul className="tiny muted" style={{ paddingLeft: 16 }}>
                    {m.items.map((i) => (
                      <li key={i.id}>
                        {KIND_LABEL[i.kind]}: {i.title}
                        {i.video ? ` · captions: ${i.video.captions.join(", ")}` : ""}
                        {i.quiz ? ` · ${i.quiz.questions.length} questions` : ""}
                        {i.lab ? ` · ${i.lab.tests.length} tests${i.lab.verified ? `, solution ${i.lab.verified.score}/${i.lab.verified.max}` : ""}` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </details>
          {c.checklist.length > 0 && (
            <div className="notice notice-warn small">
              The checklist no longer passes: {c.checklist.map((x) => x.message).join(" ")}
            </div>
          )}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <form method="post" action={`/api/v1/admin/course-reviews/${c.course.id}/approve`}>
              <button className="btn btn-primary btn-sm" disabled={c.checklist.length > 0}>
                Approve and publish
              </button>
            </form>
            <form method="post" action={`/api/v1/admin/course-reviews/${c.course.id}/changes`} className="row" style={{ ...gap(6), flex: 1 }}>
              <label className="sr-only" htmlFor={`cr-${c.course.id}`}>
                What to change
              </label>
              <input id={`cr-${c.course.id}`} name="note" placeholder="What should the author change?" required style={{ flex: 1, minWidth: 200 }} />
              <button className="btn btn-outline btn-sm">Request changes</button>
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}
