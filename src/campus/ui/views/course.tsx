import type { ReactNode } from "react";
import { CampusError, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import * as entity from "../../entity";
import { ENTITY } from "../../registry";
import * as cur from "../../services/curriculum";
import * as grading from "../../services/grading";
import * as asm from "../../services/assessment";
import * as col from "../../services/collaboration";
import { roster } from "../../services/people";
import { tutor, tutorMemory, type TutorLanguage, type TutorMode } from "../../services/tutor";
import { courseAnalytics, studentAnalytics } from "../../services/success";
import { isGrader, isStaff } from "../../services/common";
import { OPERATIONS } from "../../http/ops";
import { PretestChecklist } from "./proctor";
import { api, Chip, Denied, Empty, EntityForm, EntityTable, fmt, Hidden, OpForm, PageHead, Result } from "../kit";

type SP = Record<string, string | undefined>;
interface C {
  store: TenantStore;
  actor: Actor;
  slug: string;
  course: Row;
  sp: SP;
  rest: string[];
}

const base = (c: C) => `/campus/${c.slug}/courses/${c.course.id}`;

export function CoursesList({ store, actor, slug }: { store: TenantStore; actor: Actor; slug: string }) {
  const mine = entity.list(store, actor, "courses", { limit: 200 }).items.filter((c) => (actor.courseRoles[String(c.id)] ?? []).length || actor.roles.includes("admin") || actor.roles.includes("designer"));
  return (
    <>
      <PageHead title="Courses" sub="Courses you teach, take, design or administer." />
      {mine.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Code</th>
                <th scope="col">Your role</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((c) => (
                <tr key={String(c.id)}>
                  <td>
                    <a href={`/campus/${slug}/courses/${c.id}`}>{String(c.title)}</a>
                  </td>
                  <td>{String(c.code)}</td>
                  <td>{(actor.courseRoles[String(c.id)] ?? actor.roles).join(", ")}</td>
                  <td>
                    <Chip s={String(c.state)} />
                    {c.isBlueprint ? <span className="badge badge-blue"> blueprint</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No courses." />
      )}
      {hasAny(actor, ["admin", "designer"]) && (
        <section className="card card-pad">
          <h2 className="card-title">Create a course</h2>
          <EntityForm slug={slug} table="courses" back={`/campus/${slug}/courses`} />
        </section>
      )}
    </>
  );
}

/** Course frame: course navigation for the viewer's role, then the sub-view. */
export function CourseView({ store, actor, slug, courseId, rest, sp }: { store: TenantStore; actor: Actor; slug: string; courseId: string; rest: string[]; sp: SP }) {
  let course: Row;
  try {
    course = entity.read(store, actor, "courses", courseId) as Row;
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : "This course isn't available."} />;
  }
  const c: C = { store, actor, slug, course, sp, rest };
  const nav = cur.courseNav(store, actor, courseId);
  const tab = rest[0] ?? (course.homeType === "syllabus" ? "syllabus" : course.homeType === "assignments" ? "assignments" : "modules");
  const staff = isStaff(actor, courseId);
  let body: ReactNode;
  try {
    body = renderTab(c, tab, staff);
  } catch (e) {
    body = <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={`/campus/${slug}/courses`}>Courses</a> › <span aria-current="page">{String(course.code)}</span>
      </nav>
      <PageHead title={String(course.title)} sub={<>{String(course.code)} {course.state !== "published" && <Chip s={String(course.state)} />}</>}>
        {staff && (
          <form method="post" action={api(slug, "a/course.student_view")}>
            <Hidden values={{ back: `${base(c)}/student-view`, courseId }} />
            <button className="btn btn-outline btn-sm" type="submit">
              Student View
            </button>
          </form>
        )}
        <a className="btn btn-ghost btn-sm" href={`${base(c)}/tutor`}>
          AI tutor
        </a>
      </PageHead>
      <div className="campus-course">
        <nav className="campus-coursenav" aria-label="Course">
          <ul>
            {nav.map((n) => (
              <li key={n.tab}>
                <a href={`${base(c)}/${n.tab === "home" ? "modules" : n.tab}`} aria-current={tab === n.tab || (n.tab === "home" && tab === "modules") ? "page" : undefined} className={n.hidden ? "muted" : undefined}>
                  {n.label}
                  {n.hidden && <span className="sr-only"> (hidden from students)</span>}
                </a>
              </li>
            ))}
            {isGrader(actor, courseId) && (
              <li>
                <a href={`${base(c)}/grader`} aria-current={tab === "grader" ? "page" : undefined}>
                  Grader
                </a>
              </li>
            )}
          </ul>
        </nav>
        <section className="campus-course-body" aria-label="Course content">
          {body}
        </section>
      </div>
    </>
  );
}

function renderTab(c: C, tab: string, staff: boolean): ReactNode {
  switch (tab) {
    case "home":
    case "modules":
      return <Modules c={c} staff={staff} />;
    case "items":
      return <ItemRedirect c={c} />;
    case "pages":
      return c.rest[1] ? <PageDetail c={c} staff={staff} /> : <ListOf c={c} table="pages" staff={staff} />;
    case "assignments":
      return c.rest[1] ? <AssignmentDetail c={c} staff={staff} /> : <ListOf c={c} table="assignments" staff={staff} />;
    case "quizzes":
      return c.rest[1] ? <QuizDetail c={c} staff={staff} /> : <ListOf c={c} table="quizzes" staff={staff} />;
    case "discussions":
      return c.rest[1] ? <Discussion c={c} staff={staff} /> : <ListOf c={c} table="discussion_topics" staff={staff} />;
    case "announcements":
      return <Announcements c={c} staff={staff} />;
    case "syllabus":
      return <Syllabus c={c} staff={staff} />;
    case "grades":
      return staff ? <Gradebook c={c} /> : <StudentGrades c={c} />;
    case "grader":
      return <Grader c={c} />;
    case "people":
      return <People c={c} staff={staff} />;
    case "files":
      return <Files c={c} staff={staff} />;
    case "outcomes":
      return staff ? <Result value={grading.masteryGradebook(c.store, c.actor, String(c.course.id))} /> : <Result value={grading.outcomeResults(c.store, String(c.course.id), c.actor.id)} />;
    case "rubrics":
      return <ListOf c={c} table="rubrics" staff={staff} />;
    case "collaborations":
      return <ListOf c={c} table="collaborations" staff={staff} />;
    case "live":
      return <ListOf c={c} table="live_sessions" staff={staff} />;
    case "library":
      return <ListOf c={c} table="reading_items" staff={staff} />;
    case "analytics":
      return staff ? <Result value={courseAnalytics(c.store, c.actor, String(c.course.id))} /> : <Result value={studentAnalytics(c.store, c.actor, String(c.course.id), c.actor.id)} />;
    case "settings":
      return <Settings c={c} />;
    case "tutor":
      return <Tutor c={c} />;
    case "student-view":
      return <StudentViewInfo c={c} />;
    default:
      return <Denied message="Unknown course page." />;
  }
}

function ItemRedirect({ c }: { c: C }) {
  const r = cur.openItem(c.store, c.actor, String(c.rest[1]));
  const it = r.item;
  const path = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussions" }[String(it.kind)];
  return (
    <div className="stack">
      <p>
        {path ? <a href={`${base(c)}/${path}/${it.refId}`}>Open {String(it.title)}</a> : it.url ? <a href={String(it.url)}>Open {String(it.title)}</a> : String(it.title)}
      </p>
      <ItemPager c={c} prev={r.prev} next={r.next} />
    </div>
  );
}

function ItemPager({ c, prev, next }: { c: C; prev: { id: string; title: unknown } | null; next: { id: string; title: unknown; locked?: boolean; reason?: string } | null }) {
  return (
    <nav className="between campus-pager" aria-label="Module navigation">
      {prev ? <a href={`${base(c)}/items/${prev.id}`}>← Previous: {String(prev.title)}</a> : <span />}
      {next ? next.locked ? <span className="muted">Next: {String(next.title)} (locked — {next.reason})</span> : <a href={`${base(c)}/items/${next.id}`}>Next: {String(next.title)} →</a> : <span />}
    </nav>
  );
}

function Modules({ c, staff }: { c: C; staff: boolean }) {
  const states = cur.moduleStates(c.store, c.actor, String(c.course.id));
  const here = `${base(c)}/modules`;
  return (
    <div className="stack">
      {staff && (
        <details className="card card-pad">
          <summary>Add a module</summary>
          <EntityForm slug={c.slug} table="modules" back={here} fixed={{ courseId: String(c.course.id) }} />
        </details>
      )}
      {!states.length && <Empty title="No modules yet." />}
      {states.map((m) => (
        <section key={m.module.id} className={`card campus-module ${m.locked ? "locked" : ""}`} aria-labelledby={`m-${m.module.id}`}>
          <header className="between card-pad">
            <h2 id={`m-${m.module.id}`} className="card-title">
              {String(m.module.title)}
            </h2>
            <span className="row">
              {m.waived && <span className="badge badge-blue">Waived</span>}
              {m.locked ? <span className="badge badge-amber">Locked</span> : m.complete ? <span className="badge badge-green">Complete</span> : null}
              {staff && <Chip s={String(m.module.state)} />}
              {staff && (
                <form method="post" action={api(c.slug, `r/modules/${m.module.id}/publish`)}>
                  <Hidden values={{ back: here, ...(m.module.state === "published" ? { _method: "DELETE" } : {}) }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    {m.module.state === "published" ? "Unpublish" : "Publish"}
                  </button>
                </form>
              )}
            </span>
          </header>
          {m.reason && <p className="small muted card-pad">{m.reason}</p>}
          <ul className="item-list campus-items">
            {m.items.map((s) => (
              <li key={s.item.id} style={{ paddingLeft: `${Number(s.item.indent ?? 0) * 20}px` }} className={s.locked ? "locked" : undefined}>
                <span className="kind">{String(s.item.kind)}</span>{" "}
                {s.locked ? <span>{String(s.item.title)} <span className="tiny muted">({s.reason})</span></span> : <a href={`${base(c)}/items/${s.item.id}`}>{String(s.item.title)}</a>}{" "}
                {s.requirement !== "none" && <span className={`badge ${s.done ? "badge-green" : ""}`}>{s.done ? "✓ " : ""}{s.requirement.replace("_", " ")}</span>}
                {s.requirement === "mark_done" && !s.done && !s.locked && (
                  <form method="post" action={api(c.slug, "a/module.mark_done")} className="inline">
                    <Hidden values={{ back: here, itemId: s.item.id }} />
                    <button className="btn btn-ghost btn-sm" type="submit">
                      Mark as done
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {staff && (
            <details className="card-pad">
              <summary className="small">Add an item to this module</summary>
              <EntityForm slug={c.slug} table="module_items" back={here} fixed={{ courseId: String(c.course.id), moduleId: m.module.id }} />
            </details>
          )}
        </section>
      ))}
    </div>
  );
}

function ListOf({ c, table, staff }: { c: C; table: string; staff: boolean }) {
  const d = ENTITY[table];
  const here = `${base(c)}/${c.rest[0]}`;
  const rows = entity.list(c.store, c.actor, table, { courseId: String(c.course.id), limit: 200 }).items;
  const link = { pages: "pages", assignments: "assignments", quizzes: "quizzes", discussion_topics: "discussions" }[table];
  return (
    <div className="stack">
      {link ? (
        rows.length ? (
          <ul className="item-list">
            {rows.map((r) => (
              <li key={String(r.id)}>
                <a href={`${base(c)}/${link}/${r.id}`}>{String(r[d.titleField] ?? r.id)}</a> {staff && r.state !== undefined && <Chip s={String(r.state)} />}{" "}
                {r.dueAt || r.availableUntil ? <span className="tiny muted">due {fmt(r.dueAt ?? r.availableUntil, true)}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={`No ${d.plural.toLowerCase()} yet.`} />
        )
      ) : (
        <EntityTable slug={c.slug} table={table} rows={rows} back={here} manage={{ publish: staff, archive: staff }} />
      )}
      {(staff || (table === "discussion_topics" && !!c.course.studentsCreateDiscussions)) && (
        <details className="card card-pad">
          <summary>New {d.label.toLowerCase()}</summary>
          {table === "discussion_topics" && !staff ? <OpForm slug={c.slug} op={OPERATIONS["discussion.create_student_topic"]} back={here} values={{ courseId: String(c.course.id) }} hide={["courseId"]} /> : <EntityForm slug={c.slug} table={table} back={here} fixed={{ courseId: String(c.course.id) }} />}
        </details>
      )}
    </div>
  );
}

function PageDetail({ c, staff }: { c: C; staff: boolean }) {
  const p = entity.read(c.store, c.actor, "pages", String(c.rest[1])) as Row;
  const here = `${base(c)}/pages/${p.id}`;
  const issues = staff ? cur.a11yCheck(c.store, (p.blocks as cur.Block[]) ?? []) : [];
  return (
    <article className="stack">
      <h2>{String(p.title)}</h2>
      {/* HTML is produced by renderBlocks from validated blocks (escaped text, allow-listed embeds). */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: String(p.html ?? "") }} />
      {staff && (
        <>
          <section className="card card-pad">
            <h3 className="card-title">Accessibility check</h3>
            {issues.length ? (
              <ul className="item-list">
                {issues.map((i, k) => (
                  <li key={k}>
                    <strong>{i.issue}</strong> — {i.fix}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">No problems found.</p>
            )}
          </section>
          <details className="card card-pad" open={!!c.sp.edit}>
            <summary>Edit page</summary>
            <form method="post" action={api(c.slug, "a/page.save_text")} className="stack">
              <Hidden values={{ back: here, pageId: p.id, ifVersion: String(p.version) }} />
              <div className="field">
                <label htmlFor="pg-title">Title</label>
                <input id="pg-title" name="title" defaultValue={String(p.title)} />
              </div>
              <div className="field">
                <label htmlFor="pg-text">Content</label>
                <textarea id="pg-text" name="text" rows={14} defaultValue={cur.blocksToMarkup((p.blocks as cur.Block[]) ?? [])} />
                <span className="hint">## Heading · - list · ![alt text](https://…) · [text](page:id) · | table | rows | · ``` code ``` · &gt; callout</span>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Save page
              </button>
            </form>
            <h3 className="small">Revisions</h3>
            <ul className="item-list">
              {c.store.list("page_revisions", (r) => r.pageId === p.id).map((r) => (
                <li key={r.id}>
                  Revision {String(r.revision)} · {fmt(r.createdAt, true)}{" "}
                  <form method="post" action={api(c.slug, "a/page.restore_revision")} className="inline">
                    <Hidden values={{ back: here, revisionId: r.id }} />
                    <button className="btn btn-ghost btn-sm" type="submit">
                      Restore
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </article>
  );
}

function AssignmentDetail({ c, staff }: { c: C; staff: boolean }) {
  const a = entity.read(c.store, c.actor, "assignments", String(c.rest[1])) as Row;
  const here = `${base(c)}/assignments/${a.id}`;
  const dates = cur.effectiveDates(c.store, a, c.actor.id);
  const mySubs = !staff ? asm.mySubmissions(c.store, c.actor, String(a.id)) : [];
  const vis = !staff ? grading.visibleGrade(c.store, String(a.id), c.actor.id) : null;
  const types = ((a.submissionTypes as string[]) ?? ["text"]).map((t) => (t === "online_text" ? "text" : t));
  const access = staff ? { ok: true } : cur.itemAccessible(c.store, c.actor, "assignment", String(a.id));
  return (
    <article className="stack">
      <h2>{String(a.title)}</h2>
      <p className="small">
        {Number(a.points ?? 0)} points · due {fmt(dates.dueAt, true)} {dates.source !== "everyone" && <span className="badge badge-blue">your date</span>}
      </p>
      <div className="prose">
        <p>{String(a.instructions ?? "")}</p>
      </div>
      {staff ? (
        <div className="row">
          <a className="btn btn-primary btn-sm" href={`${base(c)}/grader?assignmentId=${a.id}`}>
            Open grader
          </a>
          <a className="btn btn-outline btn-sm" href={`${base(c)}/grades`}>
            Gradebook
          </a>
        </div>
      ) : !access.ok ? (
        <Denied message={access.reason ?? "Locked."} />
      ) : !dates.assigned ? (
        <Denied message="This assignment isn't assigned to you." />
      ) : (
        <>
          {vis && (
            <p>
              Grade: {vis.hidden ? <em>hidden until your instructor posts grades</em> : vis.score === null ? "not graded yet" : <strong>{vis.score} / {Number(a.points)}</strong>}
            </p>
          )}
          {a.labTemplateId || types.includes("lti") ? (
            <form method="post" action={api(c.slug, "a/lab.open")}>
              <Hidden values={{ back: `/campus/${c.slug}/t/cloud-lab?assignmentId=${a.id}`, assignmentId: String(a.id), notice: "Cloud Lab opened." }} />
              <button className="btn btn-primary" type="submit">
                Launch Cloud Lab
              </button>
            </form>
          ) : (
            <section className="card card-pad stack">
              <h3 className="card-title">Submit</h3>
              {types.includes("text") && (
                <form method="post" action={api(c.slug, "a/submission.create")} className="stack">
                  <Hidden values={{ back: here, assignmentId: String(a.id), mode: "text" }} />
                  <label htmlFor="sub-body">Your answer</label>
                  <textarea id="sub-body" name="body" rows={8} required />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Submit text
                  </button>
                </form>
              )}
              {types.includes("url") && (
                <form method="post" action={api(c.slug, "a/submission.create")} className="row">
                  <Hidden values={{ back: here, assignmentId: String(a.id), mode: "url" }} />
                  <label htmlFor="sub-url">Website address</label>
                  <input id="sub-url" name="url" type="url" required />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Submit link
                  </button>
                </form>
              )}
              {types.includes("file") && (
                <form method="post" action={api(c.slug, "upload")} encType="multipart/form-data" className="row">
                  <Hidden values={{ back: here, assignmentId: String(a.id), courseId: String(c.course.id) }} />
                  <label htmlFor="sub-file">File</label>
                  <input id="sub-file" name="file" type="file" required />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Upload and submit
                  </button>
                </form>
              )}
            </section>
          )}
          {mySubs.length > 0 && (
            <section className="card card-pad">
              <h3 className="card-title">Your submissions</h3>
              <ul className="item-list">
                {mySubs.map((s) => (
                  <li key={s.id}>
                    Attempt {String(s.attempt)} · {fmt(s.createdAt, true)} {s.late ? <Chip s="late" /> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}

function QuizDetail({ c, staff }: { c: C; staff: boolean }) {
  const q = entity.read(c.store, c.actor, "quizzes", String(c.rest[1])) as Row;
  const here = `${base(c)}/quizzes/${q.id}`;
  if (staff)
    return (
      <div className="stack">
        <h2>{String(q.title)}</h2>
        <p className="small">
          {String(q.questionCount)} questions · {String(q.timeLimitMin)} minutes · {String(q.allowedAttempts)} attempt(s) <Chip s={String(q.state)} />
        </p>
        <h3>Item analysis</h3>
        <Result value={asm.itemAnalysis(c.store, c.actor, String(q.id))} />
        <h3>Moderate</h3>
        <OpForm slug={c.slug} op={OPERATIONS["quiz.moderate"]} back={here} values={{ quizId: String(q.id) }} hide={["quizId"]} />
      </div>
    );
  const attempts = c.store.list("attempts", (x) => x.quizId === q.id && x.userId === c.actor.id);
  const open = attempts.find((x) => x.state === "in_progress");
  const view = open ? asm.attemptView(c.store, c.actor, open.id) : null;
  return (
    <div className="stack">
      <h2>{String(q.title)}</h2>
      <p className="small">
        {String(q.timeLimitMin)} minutes · {String(q.allowedAttempts)} attempt(s) · you've used {attempts.filter((x) => x.state !== "in_progress").length}
      </p>
      {view && view.attempt.state === "in_progress" ? (
        <form method="post" action={api(c.slug, "a/quiz.finish")} className="stack campus-quiz">
          <Hidden values={{ back: here, attemptId: view.attempt.id, version: String(view.attempt.version) }} />
          <p className="notice notice-info" role="status">
            Time limit {String(view.attempt.timeLimitMin)} minutes · submit by {fmt(view.attempt.deadline, true)}
          </p>
          {view.questions.map((qq, i) => (
            <fieldset key={qq.id} className="card card-pad">
              <legend>
                Question {i + 1} <span className="tiny muted">({String(qq.points)} pt)</span>
              </legend>
              <p>{String(qq.prompt)}</p>
              {"choices" in qq && Array.isArray((qq as { choices?: string[] }).choices) ? (
                (qq as { choices: string[] }).choices.map((ch) => (
                  <label key={ch} className="check">
                    <input type={qq.kind === "multiple_answer" ? "checkbox" : "radio"} name={qq.kind === "multiple_answer" ? `ans__${qq.id}[]` : `ans__${qq.id}`} value={ch} defaultChecked={String((view.attempt.answers as Record<string, unknown>)?.[qq.id] ?? "") === ch} /> {ch}
                  </label>
                ))
              ) : (
                <>
                  <label className="sr-only" htmlFor={`ans-${qq.id}`}>
                    Your answer
                  </label>
                  {qq.kind === "essay" ? <textarea id={`ans-${qq.id}`} name={`ans__${qq.id}`} rows={5} defaultValue={String((view.attempt.answers as Record<string, unknown>)?.[qq.id] ?? "")} /> : <input id={`ans-${qq.id}`} name={`ans__${qq.id}`} defaultValue={String((view.attempt.answers as Record<string, unknown>)?.[qq.id] ?? "")} />}
                </>
              )}
            </fieldset>
          ))}
          <button className="btn btn-primary" type="submit">
            Submit quiz
          </button>
        </form>
      ) : (
        <>
        {q.proctored ? <PretestChecklist slug={c.slug} store={c.store} actor={c.actor} quizId={String(q.id)} back={here} /> : null}
        <form method="post" action={api(c.slug, "a/quiz.start")}>
          <Hidden values={{ back: here, quizId: String(q.id) }} />
          {q.accessCode ? (
            <div className="field">
              <label htmlFor="qz-code">Access code</label>
              <input id="qz-code" name="accessCode" />
            </div>
          ) : null}
          <button className="btn btn-primary" type="submit">
            {attempts.length ? "Take again" : "Take the quiz"}
          </button>
          {q.proctored ? (
            <p className="tiny muted">
              Questions about your setup? <a href={`/campus/${c.slug}/t/proctor-support#ask`}>Ask the setup assistant</a>.
            </p>
          ) : null}
        </form>
        </>
      )}
      {attempts.filter((x) => x.state !== "in_progress").length > 0 && (
        <ul className="item-list">
          {attempts
            .filter((x) => x.state !== "in_progress")
            .map((x) => (
              <li key={x.id}>
                Attempt {String(x.attemptNo)}: {x.state === "pending_review" ? "waiting for manual grading" : `${String(x.score)} points`}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Discussion({ c, staff }: { c: C; staff: boolean }) {
  const th = col.thread(c.store, c.actor, String(c.rest[1]), { sort: (c.sp.sort as "newest") ?? "oldest" });
  const here = `${base(c)}/discussions/${th.topic.id}`;
  type P = { id: string; author: string | null; body: string | null; createdAt: unknown; likes?: number; likedByMe?: boolean; replies?: P[]; mine?: boolean };
  const renderPost = (p: P, depth = 0): ReactNode => (
    <li key={p.id} className="bubble" style={{ marginLeft: depth * 16 }}>
      <strong>{p.author ?? "[deleted]"}</strong> <span className="tiny muted">{fmt(p.createdAt, true)}</span>
      <p>{p.body ?? <em>This reply was deleted.</em>}</p>
      <div className="row">
        {th.topic.allowLiking && (
          <form method="post" action={api(c.slug, "a/discussion.like")} className="inline">
            <Hidden values={{ back: here, postId: p.id, on: p.likedByMe ? "false" : "true" }} />
            <button className="btn btn-ghost btn-sm" type="submit" aria-pressed={!!p.likedByMe}>
              ♥ {p.likes ?? 0}
            </button>
          </form>
        )}
        {!th.topic.closed && (
          <details>
            <summary className="small">Reply</summary>
            <form method="post" action={api(c.slug, "a/discussion.post")} className="stack">
              <Hidden values={{ back: here, topicId: String(th.topic.id), parentId: p.id }} />
              <label className="sr-only" htmlFor={`r-${p.id}`}>
                Reply to {p.author}
              </label>
              <textarea id={`r-${p.id}`} name="body" rows={3} required />
              <button className="btn btn-primary btn-sm" type="submit">
                Post reply
              </button>
            </form>
          </details>
        )}
      </div>
      {p.replies?.length ? <ul className="item-list">{p.replies.map((r) => renderPost(r, 1))}</ul> : null}
    </li>
  );
  return (
    <article className="stack">
      <h2>{String(th.topic.title)}</h2>
      <p>{String(th.topic.prompt)}</p>
      {th.topic.checkpoints ? <p className="small muted">Checkpoints: reply to the topic, then reply to classmates.</p> : null}
      {th.gated ? <p className="notice notice-info">Post your reply first to see your classmates' replies.</p> : null}
      {!th.topic.closed && (
        <form method="post" action={api(c.slug, "a/discussion.post")} className="stack card card-pad">
          <Hidden values={{ back: here, topicId: String(th.topic.id) }} />
          <label htmlFor="topic-reply">Your reply</label>
          <textarea id="topic-reply" name="body" rows={4} required />
          <button className="btn btn-primary btn-sm" type="submit">
            Post
          </button>
        </form>
      )}
      <ul className="item-list">{(th.posts as unknown as P[]).map((p) => renderPost(p))}</ul>
      {staff && th.topic.graded && (
        <section className="card card-pad">
          <h3 className="card-title">Grade checkpoints</h3>
          <OpForm slug={c.slug} op={OPERATIONS["discussion.grade_checkpoints"]} back={here} values={{ topicId: String(th.topic.id) }} hide={["topicId", "override"]} />
        </section>
      )}
    </article>
  );
}

function Announcements({ c, staff }: { c: C; staff: boolean }) {
  const rows = entity.list(c.store, c.actor, "announcements", { courseId: String(c.course.id), limit: 100 }).items.sort((x, y) => String(y.publishAt ?? y.createdAt).localeCompare(String(x.publishAt ?? x.createdAt)));
  const here = `${base(c)}/announcements`;
  return (
    <div className="stack">
      {staff && (
        <details className="card card-pad">
          <summary>New announcement</summary>
          <EntityForm slug={c.slug} table="announcements" back={here} fixed={{ courseId: String(c.course.id) }} />
        </details>
      )}
      {rows.length ? (
        rows.map((a) => (
          <article key={String(a.id)} className="card card-pad">
            <h2 className="card-title">{String(a.title)}</h2>
            <p className="tiny muted">
              {fmt(a.publishAt ?? a.createdAt, true)} {staff && <Chip s={String(a.state)} />}
            </p>
            <p>{String(a.body)}</p>
          </article>
        ))
      ) : (
        <Empty title="No announcements." />
      )}
    </div>
  );
}

function Syllabus({ c, staff }: { c: C; staff: boolean }) {
  const s = cur.syllabus(c.store, c.actor, String(c.course.id));
  return (
    <div className="stack">
      <div className="prose">
        <p>{s.description || String(c.course.description ?? "")}</p>
      </div>
      <h2>Course summary</h2>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Item</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={`${i.kind}-${i.id}`}>
                <td>{fmt(i.date, true)}</td>
                <td>
                  <a href={`${base(c)}/${i.href}`}>{i.title}</a>
                </td>
                <td>{i.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {staff && <p className="small muted">The summary is generated from dated items and updates automatically.</p>}
    </div>
  );
}

function StudentGrades({ c }: { c: C }) {
  const whatIf = Object.fromEntries(Object.entries(c.sp).filter(([k, v]) => k.startsWith("wi_") && v !== "").map(([k, v]) => [k.slice(3), Number(v)]));
  if (c.course.hideTotals) return <p>Your instructor has hidden course totals.</p>;
  const t = grading.computeTotals(c.store, String(c.course.id), c.actor.id, Object.keys(whatIf).length ? { whatIf } : {});
  return (
    <form method="get" className="stack">
      <p>
        Total: <strong>{t.finalPct === null ? "—" : `${t.finalPct}%`}</strong> {t.letter && <span className="badge">{t.letter}</span>} {Object.keys(whatIf).length > 0 && <span className="badge badge-blue">What-If (not saved)</span>}
      </p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              <th scope="col">Score</th>
              <th scope="col">What-If</th>
            </tr>
          </thead>
          <tbody>
            {t.items.map((i) => (
              <tr key={i.id} className={i.dropped ? "muted" : undefined}>
                <td>
                  {i.title}
                  {i.dropped ? " (dropped)" : ""}
                </td>
                <td>{fmt(i.dueAt, true)}</td>
                <td>{i.hidden ? "hidden" : <Chip s={i.status} />}</td>
                <td>{i.hidden ? "—" : i.score === null ? "—" : `${i.score} / ${i.points}`}</td>
                <td>
                  <label className="sr-only" htmlFor={`wi-${i.id}`}>
                    What-If score for {i.title}
                  </label>
                  <input id={`wi-${i.id}`} name={`wi_${i.id}`} type="number" step="any" min={0} max={i.points} defaultValue={whatIf[i.id] ?? ""} style={{ width: 90 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn btn-outline btn-sm" type="submit">
          Calculate What-If
        </button>
        <a className="btn btn-ghost btn-sm" href={`${base(c)}/grades`}>
          Reset
        </a>
      </div>
      <ul className="item-list">
        {t.groups.map((g) => (
          <li key={g.id}>
            {g.name} ({g.weight}%): {g.pct === null ? "—" : `${g.pct}%`}
          </li>
        ))}
      </ul>
    </form>
  );
}

function Gradebook({ c }: { c: C }) {
  const cid = String(c.course.id);
  const g = grading.gradebookGrid(c.store, c.actor, cid, { sectionId: c.sp.sectionId });
  const here = `${base(c)}/grades`;
  const sections = c.store.list("sections", (s) => s.courseId === cid);
  return (
    <div className="stack">
      <div className="row">
        <form method="get" className="row">
          <label htmlFor="gb-sec">Section</label>
          <select id="gb-sec" name="sectionId" defaultValue={c.sp.sectionId ?? ""}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.code)}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" type="submit">
            Filter
          </button>
        </form>
        <a className="btn btn-outline btn-sm" href={api(c.slug, `q/grades.export_csv?courseId=${cid}`)}>
          Export CSV
        </a>
      </div>
      <div className="table-wrap campus-gradebook" role="region" aria-label="Gradebook" tabIndex={0}>
        <table className="table">
          <caption className="sr-only">Gradebook for {String(c.course.title)}</caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              {g.columns.map((col) => (
                <th scope="col" key={col.id}>
                  <a href={`${base(c)}/grader?assignmentId=${col.id}`}>{col.title}</a>
                  <span className="tiny muted"> /{col.points} · {col.posting}</span>
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.userId}>
                <th scope="row">
                  {r.name} <span className="tiny muted">{String(r.section ?? "")}</span>
                </th>
                {g.columns.map((col) => {
                  const cell = r.cells[col.id] as { score: number | null; status: string; posted: boolean; assigned?: boolean };
                  return (
                    <td key={col.id} className={`gb-${cell.status}`}>
                      {cell.assigned === false ? <span className="muted">n/a</span> : cell.score ?? "—"} {cell.status !== "none" && <span className="tiny">{cell.status}</span>} {cell.score !== null && !cell.posted && <span className="tiny" title="Not posted">◌</span>}
                    </td>
                  );
                })}
                <td>
                  {r.finalPct === null ? "—" : `${r.finalPct}%`} {r.letter ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">◌ = graded but not posted. Columns show each assignment's posting policy.</p>
      <div className="grid g2">
        <section className="card card-pad">
          <h2 className="card-title">Post grades</h2>
          <OpForm slug={c.slug} op={OPERATIONS["grades.post"]} back={here} />
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Import grades (CSV)</h2>
          <OpForm slug={c.slug} op={OPERATIONS["grades.import_csv"]} back={here} values={{ courseId: cid }} hide={["courseId"]} />
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Message students who…</h2>
          <OpForm slug={c.slug} op={OPERATIONS["grades.message_students_who"]} back={here} />
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Gradebook history</h2>
          <Result value={(grading.history(c.store, c.actor, cid) as unknown as Record<string, unknown>[]).slice(0, 15).map((h) => ({ when: fmt(h.createdAt, true), student: h.student, item: h.assignment, grader: h.grader, reason: h.reason }))} />
        </section>
      </div>
    </div>
  );
}

function Grader({ c }: { c: C }) {
  const cid = String(c.course.id);
  const assignments = c.store.list("assignments", (a) => a.courseId === cid);
  const aid = c.sp.assignmentId ?? assignments[0]?.id;
  if (!aid) return <Empty title="No assignments to grade." />;
  const asg = c.store.get("assignments", aid)!;
  const queue = asm.graderQueue(c.store, c.actor, aid) as unknown as { userId: string; display: string }[];
  const idx = Math.min(Math.max(Number(c.sp.i ?? 0), 0), Math.max(queue.length - 1, 0));
  const cur0 = queue[idx];
  const here = `${base(c)}/grader?assignmentId=${aid}&i=${idx}`;
  const sub = cur0 ? c.store.list("submissions", (s) => s.assignmentId === aid && s.userId === cur0.userId).sort((x, y) => Number(y.attempt) - Number(x.attempt))[0] : undefined;
  const grade = cur0 ? c.store.list("grades", (g) => g.assignmentId === aid && g.userId === cur0.userId)[0] : undefined;
  const rubric = asg.rubricId ? c.store.get("rubrics", String(asg.rubricId)) : undefined;
  return (
    <div className="stack campus-grader">
      <form method="get" className="row">
        <input type="hidden" name="i" value="0" />
        <label htmlFor="gr-asg">Assignment</label>
        <select id="gr-asg" name="assignmentId" defaultValue={aid}>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {String(a.title)}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" type="submit">
          Open
        </button>
      </form>
      {!cur0 ? (
        <Empty title="No submissions yet." />
      ) : (
        <>
          <nav className="between" aria-label="Students">
            {idx > 0 ? <a href={`${base(c)}/grader?assignmentId=${aid}&i=${idx - 1}`}>← Previous student</a> : <span />}
            <strong>
              {cur0.display} ({idx + 1} of {queue.length})
            </strong>
            {idx < queue.length - 1 ? <a href={`${base(c)}/grader?assignmentId=${aid}&i=${idx + 1}`}>Next student →</a> : <span />}
          </nav>
          <div className="grid g2">
            <section className="card card-pad" aria-label="Submission">
              <h2 className="card-title">Submission</h2>
              {sub ? (
                <>
                  <p className="tiny muted">
                    Attempt {String(sub.attempt)} · {fmt(sub.createdAt, true)} {sub.late ? <Chip s="late" /> : null}
                  </p>
                  {sub.body ? <pre className="code small campus-submission" tabIndex={0}>{String(sub.body)}</pre> : sub.fileId ? <p>File submission ({String(sub.fileId)})</p> : sub.mode === "lti" ? <p>Cloud Lab submission (score passed back by the tool).</p> : null}
                  <details>
                    <summary className="small">Annotate</summary>
                    <OpForm slug={c.slug} op={OPERATIONS["submission.annotate"]} back={here} values={{ submissionId: sub.id, page: "1", coords: "[0,0,100,20]" }} hide={["submissionId"]} />
                  </details>
                  <h3 className="small">Annotations</h3>
                  <ul className="item-list">
                    {c.store.list("annotations", (x) => x.submissionId === sub.id).map((x) => (
                      <li key={x.id} className="small">
                        {String(x.type)}: {String(x.comment ?? "")} {x.quote ? <q>{String(x.quote)}</q> : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted">No submission.</p>
              )}
            </section>
            <section className="card card-pad stack" aria-label="Grade">
              <h2 className="card-title">Grade</h2>
              <p className="small">
                Current: {grade?.score === undefined || grade?.score === null ? "—" : String(grade.score)} / {Number(asg.points)} {grade && !grade.posted && <span className="badge badge-amber">not posted</span>}
              </p>
              <form method="post" action={api(c.slug, "a/grades.set")} className="stack">
                <Hidden values={{ back: here, assignmentId: aid, userId: cur0.userId, ifVersion: grade ? String(grade.version) : undefined }} />
                {rubric ? (
                  ((rubric.criteria as { id: string; name: string; bands: { label: string; points: number }[] }[]) ?? []).map((cr) => (
                    <div className="field" key={cr.id}>
                      <label htmlFor={`rt-${cr.id}`}>{cr.name}</label>
                      <select id={`rt-${cr.id}`} name={`rating__${cr.id}`} defaultValue={String(((grade?.rubricAssessment as { ratings?: Record<string, number> } | null)?.ratings ?? {})[cr.id] ?? "")}>
                        <option value="">—</option>
                        {cr.bands.map((b) => (
                          <option key={b.label} value={b.points}>
                            {b.label} ({b.points})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                ) : (
                  <div className="field">
                    <label htmlFor="gr-score">Score</label>
                    <input id="gr-score" name="score" type="number" step="any" min={0} defaultValue={grade?.score === null || grade?.score === undefined ? "" : String(grade.score)} />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="gr-comment">Comment (visible after posting)</label>
                  <textarea id="gr-comment" name="comment" rows={3} />
                </div>
                <button className="btn btn-primary btn-sm" type="submit">
                  Save grade
                </button>
              </form>
              {sub && (
                <form method="post" action={api(c.slug, "a/ai.draft_feedback")}>
                  <Hidden values={{ back: here, submissionId: sub.id }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Draft feedback with AI (for review)
                  </button>
                </form>
              )}
              <form method="post" action={api(c.slug, "a/grades.post")}>
                <Hidden values={{ back: here, assignmentId: aid }} />
                <button className="btn btn-outline btn-sm" type="submit">
                  Post grades for this assignment
                </button>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function People({ c, staff }: { c: C; staff: boolean }) {
  const cid = String(c.course.id);
  const here = `${base(c)}/people`;
  const r = roster(c.store, c.actor, cid, { q: c.sp.q });
  const sets = c.store.list("group_sets", (g) => g.courseId === cid);
  return (
    <div className="stack">
      <form method="get" className="row" role="search">
        <label className="sr-only" htmlFor="ppl-q">
          Search people
        </label>
        <input id="ppl-q" name="q" defaultValue={c.sp.q} placeholder="Search people" />
        <button className="btn btn-ghost btn-sm" type="submit">
          Search
        </button>
      </form>
      <Result value={r.map((p) => ({ name: p.name, role: p.role, section: p.section, ...(staff ? { email: "email" in p ? p.email : "", lastActivity: "lastActivity" in p ? fmt(p.lastActivity, true) : "" } : {}) }))} />
      {staff && (
        <section className="card card-pad">
          <h2 className="card-title">Add people</h2>
          <OpForm slug={c.slug} op={OPERATIONS["people.add"]} back={here} values={{ courseId: cid }} hide={["courseId"]} />
        </section>
      )}
      <section className="card card-pad">
        <h2 className="card-title">Groups</h2>
        {sets.length ? (
          <ul className="item-list">
            {sets.map((s) => (
              <li key={s.id}>
                <a href={`/campus/${c.slug}/t/groups?setId=${s.id}`}>{String(s.name)}</a> {s.selfSignup ? <span className="badge">self sign-up</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No group sets.</p>
        )}
      </section>
    </div>
  );
}

function Files({ c, staff }: { c: C; staff: boolean }) {
  const cid = String(c.course.id);
  const here = `${base(c)}/files`;
  const rows = staff ? entity.list(c.store, c.actor, "files", { courseId: cid, limit: 200 }).items : c.store.list("files", (f) => f.courseId === cid && !!f.published && f.state === "available");
  return (
    <div className="stack">
      {staff ? <EntityTable slug={c.slug} table="files" rows={rows} back={here} manage={{ publish: false, archive: true }} columns={["name", "state", "mime", "size", "published", "usageRights"]} /> : rows.length ? (
        <ul className="item-list">
          {rows.map((f) => (
            <li key={String(f.id)}>{String(f.name)}</li>
          ))}
        </ul>
      ) : (
        <Empty title="No files." />
      )}
      {staff && (
        <section className="card card-pad">
          <h2 className="card-title">Upload</h2>
          <form method="post" action={api(c.slug, "upload")} encType="multipart/form-data" className="row">
            <Hidden values={{ back: here, courseId: cid, purpose: "course" }} />
            <label htmlFor="fl-file">File</label>
            <input id="fl-file" name="file" type="file" required />
            <button className="btn btn-primary btn-sm" type="submit">
              Upload
            </button>
          </form>
          <p className="tiny muted">Files go to quarantine, are scanned and type-checked, then become available. Set usage rights before publishing.</p>
          <OpForm slug={c.slug} op={OPERATIONS["files.publish"]} back={here} />
        </section>
      )}
    </div>
  );
}

function Settings({ c }: { c: C }) {
  if (!isStaff(c.actor, String(c.course.id))) return <Denied message="Course staff only." />;
  const here = `${base(c)}/settings`;
  return (
    <div className="stack">
      <section className="card card-pad">
        <h2 className="card-title">Course details</h2>
        <EntityForm slug={c.slug} table="courses" back={here} row={c.course} />
      </section>
      <section className="card card-pad">
        <h2 className="card-title">Publish</h2>
        <form method="post" action={api(c.slug, `r/courses/${c.course.id}/publish`)}>
          <Hidden values={{ back: here, ...(c.course.state === "published" ? { _method: "DELETE" } : {}) }} />
          <button className="btn btn-primary btn-sm" type="submit">
            {c.course.state === "published" ? "Unpublish course" : "Publish course"}
          </button>
        </form>
        <h3 className="small">Setup checklist</h3>
        <Result value={cur.setupChecklist(c.store, String(c.course.id))} />
      </section>
      <section className="card card-pad">
        <h2 className="card-title">Feature options</h2>
        <OpForm slug={c.slug} op={OPERATIONS["features.set"]} back={here} values={{ courseId: String(c.course.id) }} hide={["courseId", "accountId", "locked"]} />
      </section>
    </div>
  );
}

function StudentViewInfo({ c }: { c: C }) {
  const u = c.store.list("users", (x) => x.testStudentOf === c.course.id)[0];
  if (!u) return <p>Press Student View to create the test student.</p>;
  const states = cur.moduleStates(c.store, { ...c.actor, id: u.id, courseRoles: { [String(c.course.id)]: ["student"] }, roles: [] }, String(c.course.id));
  return (
    <div className="stack">
      <p className="notice notice-info">Student View: what a new student sees. Locks and requirements apply.</p>
      <ul className="item-list">
        {states.map((m) => (
          <li key={m.module.id}>
            <strong>{String(m.module.title)}</strong> — {m.locked ? `locked (${m.reason})` : m.complete ? "complete" : "open"}
            <ul>
              {m.items.map((i) => (
                <li key={i.item.id} className="small">
                  {String(i.item.title)} {i.locked ? `(locked: ${i.reason})` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <form method="post" action={api(c.slug, "a/course.student_view")}>
        <Hidden values={{ back: `${base(c)}/student-view`, courseId: String(c.course.id), reset: "true" }} />
        <button className="btn btn-outline btn-sm" type="submit">
          Reset test student
        </button>
      </form>
    </div>
  );
}

function Tutor({ c }: { c: C }) {
  const cid = String(c.course.id);
  const mode = (c.sp.mode as TutorMode) ?? "explain";
  const lang = (c.sp.lang as TutorLanguage) ?? "en";
  let reply: ReturnType<typeof tutor> | null = null;
  let err: string | null = null;
  if (c.sp.ask) {
    try {
      reply = tutor(c.store, c.actor, { courseId: cid, mode, question: c.sp.q, language: lang, avatar: (c.sp.avatar as "amara") || undefined });
    } catch (e) {
      err = e instanceof CampusError ? e.message : String(e);
    }
  }
  const here = `${base(c)}/tutor`;
  return (
    <div className="stack campus-tutor">
      <p className="small muted">The tutor answers from this course's published material with citations. It won't do graded work — it gives hints and can pass your question to your instructor.</p>
      <form method="get" className="stack card card-pad">
        <input type="hidden" name="ask" value="1" />
        <div className="grid g3">
          <div className="field">
            <label htmlFor="tu-mode">Mode</label>
            <select id="tu-mode" name="mode" defaultValue={mode}>
              <option value="explain">Explain</option>
              <option value="hint">Hint</option>
              <option value="quiz">Practice questions</option>
              <option value="study_plan">Study plan</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tu-lang">Language</label>
            <select id="tu-lang" name="lang" defaultValue={lang}>
              <option value="en">English</option>
              <option value="en-NG">Nigerian English</option>
              <option value="pcm">Pidgin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tu-avatar">Presenter</label>
            <select id="tu-avatar" name="avatar" defaultValue={c.sp.avatar ?? ""}>
              <option value="">Text</option>
              <option value="amara">Amara (avatar)</option>
              <option value="tunde">Tunde (avatar)</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="tu-q">Your question</label>
          <textarea id="tu-q" name="q" rows={3} defaultValue={c.sp.q ?? ""} />
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          Ask
        </button>
      </form>
      {err && <Denied message={err} />}
      {reply && (
        <section className="card card-pad" aria-live="polite">
          <p className="tiny muted">{reply.disclosure}</p>
          {reply.avatar && <p className="notice notice-info small">{reply.avatar.note}</p>}
          <pre className="campus-tutor-text" tabIndex={0}>{reply.text}</pre>
          {reply.citations.length > 0 && (
            <ol className="small">
              {reply.citations.map((ci) => (
                <li key={ci.n}>
                  <a href={`/campus/${c.slug}/${ci.href}`}>{ci.title}</a>
                </li>
              ))}
            </ol>
          )}
          {reply.uncertainty && <p className="tiny muted">{reply.uncertainty}</p>}
          {reply.avatar && (
            <details>
              <summary className="small">Captions (WebVTT)</summary>
              <pre className="code tiny" tabIndex={0}>{reply.avatar.captionsVtt}</pre>
            </details>
          )}
          {(c.actor.courseRoles[cid] ?? []).includes("student") && (
            <form method="post" action={api(c.slug, "a/tutor.escalate")}>
              <Hidden values={{ back: here, courseId: cid, question: c.sp.q ?? "" }} />
              <button className="btn btn-ghost btn-sm" type="submit">
                Ask my instructor instead
              </button>
            </form>
          )}
        </section>
      )}
      <details className="card card-pad">
        <summary>What the tutor remembers</summary>
        <Result value={tutorMemory(c.store, c.actor, cid).map((m) => ({ topic: m.topic, mode: m.mode, at: fmt(m.at, true) }))} />
        <form method="post" action={api(c.slug, "a/tutor.erase_memory")}>
          <Hidden values={{ back: here, courseId: cid }} />
          <button className="btn btn-outline btn-sm" type="submit">
            Erase tutor memory for this course
          </button>
        </form>
      </details>
    </div>
  );
}
