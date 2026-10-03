import type { accountVM, calendarVM, courseHomeVM, credentialsVM, dashboardVM, gradebookVM, gradesOverviewVM, itemVM, liveVM, moduleVM, Viewer } from "@/bff/views";
import type { OutboxEmail, Product } from "@/platform/types";
import { fmtDate, fmtDateTime, Progress, Stat, StatusBadge } from "../components/cards";
import { AppShell, Crumbs, Flash } from "../components/chrome";
import { LabWorkspace } from "../components/client/LabWorkspace";
import { QuizPlayer } from "../components/client/QuizPlayer";
import { TutorPanel } from "../components/client/TutorPanel";
import { VideoPlayer } from "../components/client/VideoPlayer";
import { Icon, KIND_ICON } from "../components/icons";

type V = NonNullable<Viewer>;
type FlashProps = { notice?: string; error?: string };
const ART: Record<string, string> = { prd_cop1047c: "", prd_cai4505c: "ai", prd_cgs1540c: "db" };

function greeting(name: string) {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}, ${name.split(" ")[0]}!`;
}

/* ======================= Dashboard ======================= */

export function DashboardView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof dashboardVM>; flash: FlashProps }) {
  return (
    <AppShell viewer={viewer} current="/app">
      <Flash {...flash} />
      <h1 className="page-title">{greeting(viewer.name)}</h1>
      <p className="muted">Keep going. Your goals are within reach.</p>
      <div className="grid g4" style={{ margin: "18px 0 26px" }}>
        <Stat icon="book" value={vm.stats.activeCourses} label="Active courses" />
        <Stat icon="calendar" value={vm.stats.assignmentsDue} label="Assignments due" />
        <Stat icon="flask" value={vm.stats.labsInProgress} label="Labs in progress" />
        <Stat icon="award" value={vm.stats.credentialsInProgress} label="Credentials in progress" />
      </div>
      {vm.next?.item && (
        <a className="card card-pad row between" href={`/app/course/${vm.next.course.id}/item/${vm.next.item.id}`} style={{ textDecoration: "none", color: "inherit", marginBottom: 24, borderLeft: "4px solid var(--accent)" }}>
          <span>
            <span className="tiny muted">Resume</span>
            <br />
            <strong>
              {vm.next.course.code} · Module {vm.next.item.moduleNo}: {vm.next.item.title}
            </strong>
          </span>
          <span className="btn btn-primary btn-sm">Continue</span>
        </a>
      )}
      <div className="row between">
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem", margin: 0 }}>My Courses</h2>
        <a href="/app/courses">View all</a>
      </div>
      <div className="grid g3" style={{ margin: "12px 0 28px" }}>
        {vm.courses.map((c) => (
          <a key={c.course.id} className="card course-tile" href={`/app/course/${c.course.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className={`art ${ART[c.course.id] ?? ""}`} aria-hidden="true" />
            <div className="card-pad stack" style={{ ["--gap" as string]: "8px" }}>
              <strong>
                {c.course.code}
                <br />
                <span style={{ fontWeight: 600 }}>{c.course.title}</span>
              </strong>
              <Progress value={c.progress.percent} label={`${c.course.title} progress`} />
              <div className="row between tiny muted">
                <span>
                  Module {c.progress.currentModule} of {c.progress.totalModules}
                </span>
                <span>{c.progress.percent}%</span>
              </div>
              {c.access !== "full" && <span className="badge">Auditing</span>}
            </div>
          </a>
        ))}
        {vm.courses.length === 0 && (
          <div className="panel">
            <p>You're not enrolled in anything yet.</p>
            <a className="btn btn-primary" href="/explore">
              Explore courses
            </a>
          </div>
        )}
      </div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="card card-pad">
          <div className="row between">
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem", margin: 0 }}>Upcoming Deadlines</h2>
            <a href="/app/calendar">View calendar</a>
          </div>
          {vm.deadlines.length === 0 ? (
            <p className="muted small" style={{ marginTop: 12 }}>
              Nothing due in the next three weeks.
            </p>
          ) : (
            <ul className="item-list" style={{ marginTop: 8 }}>
              {vm.deadlines.map((d) => (
                <li key={d.item.id} className="li" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="kind">
                    <Icon name={KIND_ICON[d.item.kind]} size={16} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong className="small">{d.item.title}</strong>
                    <br />
                    <span className="tiny muted">
                      {d.course.code} · Module {d.item.moduleNo} · due {fmtDateTime(d.due!)}
                    </span>
                  </span>
                  <a className="btn btn-outline btn-sm" href={`/app/course/${d.course.id}/item/${d.item.id}`}>
                    {d.item.kind === "lab" ? "Open" : "Start"}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="stack">
          {vm.live.length > 0 && (
            <section className="card card-pad">
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Next live session</h2>
              {vm.live.map((s) => (
                <div key={s.session.id} className="small">
                  <strong>{s.session.title}</strong>
                  <div className="muted">
                    {s.productTitle} · {fmtDateTime(s.session.startsAt)} · {s.session.segments.length} × 40-min segments
                  </div>
                </div>
              ))}
              <a className="btn btn-outline btn-sm" href="/app/live" style={{ marginTop: 10 }}>
                Session cards
              </a>
            </section>
          )}
          {vm.recommendations.length > 0 && (
            <section className="card card-pad">
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Recommended next</h2>
              <ul className="item-list">
                {vm.recommendations.map((r) => (
                  <li key={r.product.id}>
                    <a href={`/learn/${r.product.slug}`}>
                      <span>
                        <strong className="small">
                          {r.product.code} {r.product.title}
                        </strong>
                        <br />
                        <span className="tiny muted">{r.because}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="tiny muted" style={{ margin: 0 }}>
                Based on your enrollments and the program map. Turn off in Account settings.
              </p>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export function MyCoursesView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof dashboardVM> }) {
  return (
    <AppShell viewer={viewer} current="/app/courses">
      <h1 className="page-title">My Courses</h1>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Access</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vm.courses.map((c) => (
              <tr key={c.course.id}>
                <td>
                  <strong>
                    {c.course.code} {c.course.title}
                  </strong>
                </td>
                <td>{c.access === "full" ? <span className="badge badge-green">Full access</span> : <span className="badge">Auditing</span>}</td>
                <td style={{ minWidth: 180 }}>
                  <Progress value={c.progress.percent} label={`${c.course.title} progress`} />
                  <span className="tiny muted">{c.progress.percent}%</span>
                </td>
                <td className="num">
                  <a className="btn btn-outline btn-sm" href={`/app/course/${c.course.id}`}>
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

/* ======================= Course home ======================= */

function CourseTabs({ courseId, current }: { courseId: string; current: string }) {
  const t = (href: string, label: string) => (
    <a href={href} aria-current={current === href ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <nav className="tabs" aria-label="Course sections">
      {t(`/app/course/${courseId}`, "Home")}
      {t(`/app/course/${courseId}/modules`, "Modules")}
      {t(`/app/course/${courseId}/grades`, "Grades")}
      {t(`/app/course/${courseId}/resources`, "Resources")}
    </nav>
  );
}

export function CourseHomeView({ viewer, vm, flash, tab = "home" }: { viewer: V; vm: NonNullable<ReturnType<typeof courseHomeVM>>; flash: FlashProps; tab?: "home" | "modules" }) {
  const c = vm.course;
  return (
    <AppShell viewer={viewer} current="/app/courses">
      <Crumbs items={[["My Courses", "/app/courses"], [`${c.code} – ${c.title}`, null]]} />
      <Flash {...flash} />
      <div className="course-banner">
        <span className="logo-sq" aria-hidden="true">
          <Icon name={c.id === "prd_cop1047c" ? "code" : c.id === "prd_cgs1540c" ? "folder" : "sparkle"} size={34} />
        </span>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: "#fff", margin: 0, fontSize: "1.6rem" }}>
            {c.code} – {c.title}
          </h1>
          <div style={{ color: "#d5def5" }}>{c.tagline}</div>
        </div>
        <div style={{ minWidth: 160 }}>
          <div className="small" style={{ color: "#d5def5" }}>
            {vm.progress.percent}% complete
          </div>
          <Progress value={vm.progress.percent} label="Course progress" green />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <CourseTabs courseId={c.id} current={tab === "home" ? `/app/course/${c.id}` : `/app/course/${c.id}/modules`} />
      </div>
      {vm.denyCopy && (
        <div className="notice notice-info row between">
          <span>{vm.denyCopy}</span>
          <a className="btn btn-primary btn-sm" href={`/learn/${c.slug}?enroll=1`}>
            See options
          </a>
        </div>
      )}
      {tab === "home" && (
        <div className="grid g2" style={{ alignItems: "start", marginBottom: 20 }}>
          <section>
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem" }}>Course Overview</h2>
            <p className="muted">{c.description}</p>
            <div className="row">
              <a className="btn btn-outline btn-sm" href={`/learn/${c.slug}`}>
                View Syllabus
              </a>
              <a className="btn btn-outline btn-sm" href={`/app/course/${c.id}/resources`}>
                Course Resources
              </a>
              {vm.enrollment && (
                <form method="post" action="/api/v1/lms/deadlines/reset">
                  <input type="hidden" name="courseId" value={c.id} />
                  <input type="hidden" name="back" value={`/app/course/${c.id}`} />
                  <button className="btn btn-ghost btn-sm">Reset deadlines</button>
                </form>
              )}
            </div>
            {vm.program && vm.program.id !== c.id && (
              <p className="small" style={{ marginTop: 12 }}>
                Part of <a href={`/learn/${vm.program.slug}`}>{vm.program.title}</a>
              </p>
            )}
          </section>
          {vm.intro && (
            <a href={`/app/course/${c.id}/item/${vm.intro.id}`} className="card" style={{ textDecoration: "none", color: "inherit", overflow: "hidden" }}>
              <div className="video" style={{ borderRadius: 0 }}>
                <span className="play" aria-hidden="true">
                  ▶
                </span>
              </div>
              <div className="card-pad small">
                <strong>Welcome to {c.title}</strong>
                <div className="muted">Watch the course introduction ({Math.round((vm.intro.video?.durationSec ?? 0) / 60)} min)</div>
              </div>
            </a>
          )}
        </div>
      )}
      <div className="grid g4" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))", marginBottom: 24 }}>
        {(
          [
            ["book", vm.counts.modules, "Modules"],
            ["calendar", vm.counts.assignments, "Assignments"],
            ["flask", vm.counts.labs, "Labs"],
            ["project", vm.counts.projects, "Projects"],
            ["award", vm.counts.capstone, "Capstone"],
          ] as const
        ).map(([i, n, l]) => (
          <div key={l} className="card card-pad" style={{ textAlign: "center" }}>
            <Icon name={i} />
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{n}</div>
            <div className="small muted">{l}</div>
          </div>
        ))}
      </div>
      <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem" }}>Modules</h2>
      <div className="stack" style={{ ["--gap" as string]: "8px" }}>
        {vm.modules.map((m) => (
          <a key={m.no} href={`/app/course/${c.id}/module/${m.no}`} className="card card-pad row between" style={{ textDecoration: "none", color: "inherit", padding: 14 }}>
            <span>
              <strong>
                Module {m.no}: {m.title}
              </strong>
              <br />
              <span className="tiny muted">
                Week {m.week} · {m.estimate}
              </span>
            </span>
            <span className="row" style={{ ["--gap" as string]: "10px" }}>
              <span className="tiny muted">
                {m.done}/{m.total} done
              </span>
              {m.done === m.total ? <span className="badge badge-green">Complete</span> : m.done > 0 ? <span className="badge badge-amber">In progress</span> : null}
            </span>
          </a>
        ))}
      </div>
    </AppShell>
  );
}

/* ======================= Module view ======================= */

export function ModuleView({ viewer, vm }: { viewer: V; vm: NonNullable<ReturnType<typeof moduleVM>> }) {
  const { course: c, mod } = vm;
  const done = vm.items.filter((i) => i.status === "completed").length;
  return (
    <AppShell viewer={viewer} current="/app/courses">
      <Crumbs items={[[c.code ?? c.title, `/app/course/${c.id}`], [`Module ${mod.no}`, null]]} />
      <div className="row between" style={{ marginBottom: 8 }}>
        <span />
        <span className="row small">
          {mod.no > 1 && <a href={`/app/course/${c.id}/module/${mod.no - 1}`}>‹ Previous</a>}
          {mod.no < vm.total && <a href={`/app/course/${c.id}/module/${mod.no + 1}`}>Next ›</a>}
        </span>
      </div>
      <div className="with-aside">
        <div>
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <span className="kind" style={{ width: 52, height: 52, background: "var(--accent-soft)", color: "var(--gold-600)" }}>
              <Icon name="book" size={28} />
            </span>
            <div style={{ flex: 1 }}>
              <h1 className="page-title" style={{ fontFamily: "var(--font-sans)", fontSize: "1.45rem", margin: 0 }}>
                Module {mod.no}
                <br />
                {mod.title}
              </h1>
              <div className="small muted">
                Week {mod.week} of {vm.total} · Estimated time: {mod.estimate}
              </div>
            </div>
            <span className={`badge ${done === vm.items.length ? "badge-green" : done ? "badge-amber" : ""} dot`}>{done === vm.items.length ? "Complete" : done ? "In Progress" : "Not started"}</span>
          </div>
          <div className="two-col" style={{ gridTemplateColumns: "240px 1fr", marginTop: 20 }}>
            <nav aria-label="Module items">
              <ol className="item-list">
                {vm.items.map((i, n) => (
                  <li key={i.id}>
                    <a href={`/app/course/${c.id}/item/${i.id}`}>
                      <span className="kind">{i.status === "completed" ? <Icon name="check" size={16} /> : i.locked ? <Icon name="lock" size={16} /> : <Icon name={KIND_ICON[i.kind]} size={16} />}</span>
                      <span className="small">
                        {n + 1}. {i.title}
                        {i.grade && (
                          <span className="tiny muted">
                            {" "}
                            · {i.grade.score}/{i.grade.max}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <section className="stack">
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem" }}>1. Overview</h2>
              <p>{mod.overview}</p>
              {mod.scenario && (
                <div className="panel" style={{ background: "var(--blue-50)" }}>
                  <strong>Real-World Scenario</strong>
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    {mod.scenario}
                  </p>
                </div>
              )}
              <h3 style={{ fontFamily: "var(--font-sans)" }}>Key Topics</h3>
              <ul>
                {mod.keyTopics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {vm.extras.length > 0 && (
                <div className="panel">
                  <strong>Study extras</strong> <span className="tiny muted">AI-generated study aids, reviewed by course staff</span>
                  <div className="grid g2" style={{ marginTop: 10 }}>
                    {vm.extras.map((x) => (
                      <details key={x.id} className="acc">
                        <summary>{x.title}</summary>
                        <div className="small">
                          {x.kind === "flashcards" ? (
                            <dl>
                              {(x.content as { front: string; back: string }[]).map((f) => (
                                <div key={f.front} style={{ marginBottom: 8 }}>
                                  <dt>
                                    <strong>{f.front}</strong>
                                  </dt>
                                  <dd style={{ margin: 0 }} className="muted">
                                    {f.back}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            (x.content as { sections: { heading: string; text: string }[] }).sections.map((s) => (
                              <p key={s.heading}>
                                <strong>{s.heading}.</strong> {s.text}
                              </p>
                            ))
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
              {vm.items[0] && (
                <a className="btn btn-primary" href={`/app/course/${c.id}/item/${(vm.items.find((i) => i.status !== "completed") ?? vm.items[0]).id}`}>
                  {done ? "Continue module" : "Start module"}
                </a>
              )}
            </section>
          </div>
        </div>
        <TutorPanel courseId={c.id} itemId={vm.items[0]?.id} policy="open" enabled={vm.tutorEnabled} disabledReason="Enroll to use the AI Tutor." />
      </div>
    </AppShell>
  );
}

/* ======================= Item view ======================= */

export function ItemView({ viewer, vm, flash, retake }: { viewer: V; vm: NonNullable<ReturnType<typeof itemVM>>; flash: FlashProps; retake?: boolean }) {
  const { course: c, item: i } = vm;
  const back = `/app/course/${c.id}/item/${i.id}`;
  // Audit learners can read lab instructions and download starter files; launching is locked.
  const labReadOnly = i.kind === "lab" && !!i.lab && vm.canView && !!vm.locked;
  const completeForm = (
    <form method="post" action="/api/v1/lms/progress">
      <input type="hidden" name="itemId" value={i.id} />
      <input type="hidden" name="status" value="completed" />
      <input type="hidden" name="redirect" value={vm.next ? `/app/course/${c.id}/item/${vm.next.id}` : `/app/course/${c.id}`} />
      <button className="btn btn-primary">{vm.status === "completed" ? "Next" : "Mark complete & continue"}</button>
    </form>
  );
  return (
    <AppShell viewer={viewer} current="/app/courses">
      <Crumbs items={[[c.code ?? c.title, `/app/course/${c.id}`], [`Module ${i.moduleNo}`, `/app/course/${c.id}/module/${i.moduleNo}`], [i.title, null]]} />
      <Flash {...flash} />
      <div className="with-aside">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="kind" style={{ width: 48, height: 48, background: "var(--primary-soft)", color: "var(--primary)" }}>
                <Icon name={KIND_ICON[i.kind]} size={26} />
              </span>
              <div>
                <h1 className="page-title" style={{ fontFamily: "var(--font-sans)", fontSize: "1.45rem", margin: 0 }}>
                  {i.title}
                </h1>
                <div className="small muted">
                  {i.minutes} min{i.graded ? ` · graded (${i.weight}% of course grade)` : ""}
                  {vm.dueDate && i.graded ? ` · due ${fmtDateTime(vm.dueDate)}` : ""}
                </div>
              </div>
            </div>
            <StatusBadge status={vm.best ? "Graded" : vm.status === "completed" ? "Graded" : vm.status === "started" ? "In Progress" : "Not Started"} />
          </div>

          {vm.locked && !labReadOnly ? (
            <div className="panel stack">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <Icon name="lock" />
                <strong>This is locked for you right now.</strong>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {vm.locked}
              </p>
              <div>
                <a className="btn btn-primary" href={`/learn/${c.slug}?enroll=1`}>
                  See access options
                </a>
              </div>
            </div>
          ) : i.kind === "video" ? (
            <>
              <VideoPlayer itemId={i.id} title={i.title} durationSec={i.video!.durationSec} transcript={i.video!.transcript} captions={i.video!.captions} resumeSec={vm.resumeSec} completed={vm.status === "completed"} />
              {completeForm}
            </>
          ) : i.kind === "lab" && i.lab ? (
            <LabWorkspace itemId={i.id} courseId={c.id} instructions={i.lab.instructions} starterFile={i.lab.starterFile} starterCode={i.lab.starterCode} locked={vm.locked} existingCode={vm.labCode} bestScore={vm.best} />
          ) : i.kind === "quiz" && vm.quiz ? (
            <QuizPlayer key={retake ? "r" : "q"} itemId={i.id} title={i.title} questions={vm.quiz.questions} timeLimitMinutes={vm.quiz.timeLimitMinutes} passPercent={vm.quiz.passPercent} best={vm.best} />
          ) : (i.kind === "project" || i.kind === "capstone") && i.project ? (
            <ProjectPanel vm={vm} back={back} />
          ) : (
            <>
              <article className="panel" style={{ whiteSpace: "pre-line" }}>
                {i.body}
              </article>
              {i.kind === "discussion" && (
                <p className="small muted">Course discussion forums open in Phase 3 (moderated). For now, share your reply with course staff through the AI Tutor's “Ask an instructor”.</p>
              )}
              {completeForm}
            </>
          )}
          <div className="row between" style={{ marginTop: 8 }}>
            {vm.prev ? <a href={`/app/course/${c.id}/item/${vm.prev.id}`}>‹ {vm.prev.title}</a> : <span />}
            {vm.next ? <a href={`/app/course/${c.id}/item/${vm.next.id}`}>{vm.next.title} ›</a> : <span />}
          </div>
        </div>
        <TutorPanel courseId={c.id} itemId={i.id} policy={i.aiUsePolicy} enabled={vm.tutorEnabled} disabledReason="Enroll to use the AI Tutor." />
      </div>
    </AppShell>
  );
}

function ProjectPanel({ vm, back }: { vm: NonNullable<ReturnType<typeof itemVM>>; back: string }) {
  const p = vm.item.project!;
  const last = vm.submissions.at(-1);
  return (
    <div className="stack">
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="panel">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Project Scenario</h2>
          <p className="small">{p.scenario}</p>
          <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "1rem" }}>Deliverables</h3>
          <ul className="small">
            {p.deliverables.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
        <section className="stack">
          {p.milestones && (
            <div className="panel">
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Milestones</h2>
              <ol className="item-list">
                {p.milestones.map((m) => (
                  <li key={m.title} className="li small" style={{ justifyContent: "space-between" }}>
                    <span>
                      <strong>{m.title}</strong>
                      <br />
                      <span className="muted tiny">Due {fmtDate(m.due)}</span>
                    </span>
                    <span className="badge">Not Started</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="panel">
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Rubric</h2>
            <table className="table">
              <tbody>
                {p.rubric.map((r) => (
                  <tr key={r.criterion}>
                    <td>{r.criterion}</td>
                    <td className="num">{r.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {last && (
        <div className={`notice ${last.status === "graded" ? "notice-ok" : "notice-info"}`}>
          Last submission {fmtDate(last.createdAt)} — {last.status === "graded" ? `graded ${last.score}/${last.max}. ${last.feedback ?? ""}` : "waiting for course staff to grade it."}
        </div>
      )}
      <form method="post" action="/api/v1/lms/submissions" className="panel">
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Submission</h2>
        <input type="hidden" name="itemId" value={vm.item.id} />
        <input type="hidden" name="back" value={back} />
        <div className="field">
          <label htmlFor="file">
            Files <span className="hint">(.py and a short PDF report; file storage connects with the LMS)</span>
          </label>
          <input id="file" name="file" type="file" accept=".py,.pdf,.zip,.csv" />
        </div>
        <div className="field">
          <label htmlFor="text">Notes for the grader</label>
          <textarea id="text" name="text" required minLength={20} placeholder="What you built, how to run it, anything the grader should know." />
        </div>
        <button className="btn btn-primary">Submit project</button>
      </form>
    </div>
  );
}

/* ======================= Grades ======================= */

export function GradebookView({ viewer, vm }: { viewer: V; vm: NonNullable<ReturnType<typeof gradebookVM>> }) {
  return (
    <AppShell viewer={viewer} current="/app/grades">
      <Crumbs items={[["Grades", "/app/grades"], [vm.course.code ?? vm.course.title, null]]} />
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title" style={{ fontFamily: "var(--font-sans)" }}>
            Gradebook – {vm.course.code}
          </h1>
          <p className="muted">Your progress at a glance. Passing grade: {vm.passPercent}%.</p>
        </div>
        <div className="card card-pad" style={{ textAlign: "right" }}>
          <div className="small muted">Current Grade</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>
            {vm.letter ?? "—"} <span style={{ fontSize: "1.1rem", fontWeight: 600 }}>{vm.current !== null ? `${vm.current}%` : ""}</span>
          </div>
        </div>
      </div>
      <div className="card table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <caption className="sr-only">Graded items</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Type</th>
              <th scope="col">Due Date</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Score
              </th>
              <th scope="col" className="num">
                Weight
              </th>
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((r) => (
              <tr key={r.item.id}>
                <td>
                  <a href={`/app/course/${vm.course.id}/item/${r.item.id}`}>{r.item.title}</a>
                  <div className="tiny muted">Module {r.item.moduleNo}</div>
                </td>
                <td>{r.type}</td>
                <td>{fmtDate(r.due)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="num">{r.score !== null ? `${r.score}/${r.max}` : "—"}</td>
                <td className="num">{r.item.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

export function GradesOverviewView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof gradesOverviewVM> }) {
  return (
    <AppShell viewer={viewer} current="/app/grades">
      <h1 className="page-title">Grades</h1>
      <div className="grid g3">
        {vm.map(({ course, gb }) => (
          <a key={course.id} className="card card-pad" href={`/app/course/${course.id}/grades`} style={{ textDecoration: "none", color: "inherit" }}>
            <strong>
              {course.code} {course.title}
            </strong>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: 8 }}>{gb.letter ?? "—"}</div>
            <div className="small muted">{gb.current !== null ? `${gb.current}% from ${gb.rows.filter((r) => r.status === "Graded").length} graded items` : "No graded items yet"}</div>
          </a>
        ))}
      </div>
    </AppShell>
  );
}

/* ======================= Credentials ======================= */

export function CredentialsView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof credentialsVM> }) {
  return (
    <AppShell viewer={viewer} current="/app/credentials">
      <h1 className="page-title">Credentials</h1>
      <p className="muted">Showcase your skills. Open new opportunities.</p>
      <div className="with-aside">
        <div className="stack">
          {vm.issued.length === 0 && (
            <div className="panel">
              <p style={{ margin: 0 }}>No credentials yet. They're issued automatically the moment you meet a program's requirements.</p>
            </div>
          )}
          {vm.issued.map((c) => (
            <section key={c.id} className="card card-pad">
              <div className="certificate">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <span className="seal">
                    SCHOLARION
                    <br />
                    VERIFIED
                  </span>
                  <img src={`/api/v1/credentials/${c.id}/qr`} alt="QR code to verify this credential" width={84} height={84} />
                </div>
                <div className="tiny" style={{ letterSpacing: ".2em" }}>
                  SCHOLARION ACADEMY
                </div>
                <h3>{c.product?.credential.kind === "badge" ? "Digital Badge" : "Certificate of Completion"}</h3>
                <div className="small">This certifies that</div>
                <div className="holder">{c.holderName}</div>
                <div className="small">has successfully completed the</div>
                <strong>{c.product?.title ?? c.title}</strong>
                <div className="small" style={{ marginTop: 6 }}>
                  {fmtDate(c.issuedAt, { dateStyle: "long" })} · {c.revokedAt ? "Revoked" : "Non-credit professional training"}
                </div>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <a className="btn btn-primary btn-sm" href={c.linkedIn} target="_blank" rel="noopener noreferrer">
                  Share on LinkedIn
                </a>
                <a className="btn btn-outline btn-sm" href={`/verify/${c.id}?print=1`}>
                  Download certificate
                </a>
                <a className="btn btn-ghost btn-sm" href={`/api/v1/credentials/${c.id}/vc`}>
                  Wallet file (VC JSON)
                </a>
                <a className="btn btn-ghost btn-sm" href={`mailto:?subject=${encodeURIComponent("My Scholarion credential")}&body=${encodeURIComponent(c.verifyUrl)}`}>
                  Email copy
                </a>
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Verify: <a href={c.verifyUrl}>{c.verifyUrl}</a>
              </p>
            </section>
          ))}
          {vm.inProgress.length > 0 && (
            <section className="card card-pad">
              <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>In progress</h2>
              <ul className="item-list">
                {vm.inProgress.map((x) => (
                  <li key={x.product.id} className="li" style={{ display: "block" }}>
                    <div className="row between small">
                      <strong>{x.product.title}</strong>
                      <span>{x.percent}%</span>
                    </div>
                    <Progress value={x.percent} label={`${x.product.title} progress`} />
                    {!x.canEarn && <div className="tiny muted">Auditing — upgrade to earn this credential.</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card card-pad">
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Career Pathways</h2>
            <ul className="item-list">
              {vm.pathways.map((p: Product) => (
                <li key={p.id}>
                  <a href={`/learn/${p.slug}`}>
                    <span className="kind">
                      <Icon name="arrow" size={16} />
                    </span>
                    <span className="small">
                      <strong>{p.roles[0] ?? p.track}</strong>
                      <br />
                      <span className="tiny muted">
                        Next: {p.code} {p.title}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <a href="/programs" className="small">
              View all pathways →
            </a>
          </section>
          <section className="card card-pad small">
            <strong>About your credentials</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Each credential is an Open Badges 3.0 verifiable credential, signed with Scholarion's Ed25519 key. Anyone can check it with the QR code.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

/* ======================= Account & billing ======================= */

export function AccountView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof accountVM>; flash: FlashProps }) {
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const planName: Record<string, string> = { plus_monthly: "Scholarion Plus — monthly", plus_annual: "Scholarion Plus — annual", program_monthly: "Program subscription" };
  return (
    <AppShell viewer={viewer} current="/app/account">
      <h1 className="page-title">Account & Billing</h1>
      <Flash {...flash} />
      <div className="dev-banner" style={{ marginBottom: 16 }}>
        Sandbox billing. No real payments are taken. Use Staff → Sandbox clock to fast-forward trials and renewals.
      </div>
      <section className="card card-pad">
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Subscriptions</h2>
        {vm.subscriptions.length === 0 && (
          <p className="muted small">
            No subscriptions. <a href="/plus">See Scholarion Plus</a>
          </p>
        )}
        {vm.subscriptions.map((s) => (
          <div key={s.id} className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
            <div>
              <strong>
                {planName[s.plan] ?? s.plan}
                {s.product ? `: ${s.product.title}` : ""}
              </strong>{" "}
              <StatusBadge status={s.status === "trialing" ? "Trial" : s.status[0].toUpperCase() + s.status.slice(1)} />
              <div className="small muted">
                {s.status === "trialing" && s.trialEnd && `Free trial ends ${fmtDate(s.trialEnd, { dateStyle: "long" })}, then ${money(s.amount)}/${s.plan === "plus_annual" ? "year" : "month"}. `}
                {s.status === "active" && `Renews ${fmtDate(s.currentPeriodEnd, { dateStyle: "long" })} at ${money(s.amount)}. `}
                {s.status === "canceled" && `Canceled — access until ${fmtDate(s.currentPeriodEnd, { dateStyle: "long" })}. Progress saved. `}
                {s.status === "paused" && "Paused — progress saved. "}
                {s.status === "refunded" && "Refunded. "}
                {s.status === "expired" && "Ended. Progress saved. "}
              </div>
            </div>
            <div className="row">
              {(s.status === "active" || s.status === "trialing") && (
                <form method="post" action={`/api/v1/commerce/subscriptions/${s.id}/cancel`}>
                  <button className="btn btn-danger btn-sm">Cancel subscription</button>
                </form>
              )}
              {s.status === "active" && s.plan !== "plus_annual" && (
                <form method="post" action={`/api/v1/commerce/subscriptions/${s.id}/pause`}>
                  <button className="btn btn-ghost btn-sm">Pause</button>
                </form>
              )}
              {s.status === "paused" && (
                <form method="post" action={`/api/v1/commerce/subscriptions/${s.id}/resume`}>
                  <button className="btn btn-primary btn-sm">Resume</button>
                </form>
              )}
              {s.plan === "plus_annual" && (s.status === "active" || s.status === "canceled") && (
                <form method="post" action={`/api/v1/commerce/subscriptions/${s.id}/refund`}>
                  <button className="btn btn-ghost btn-sm">Request refund</button>
                </form>
              )}
            </div>
          </div>
        ))}
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Canceling takes one click. You keep access until the end of the period you paid for.
        </p>
      </section>
      <div className="grid g2" style={{ marginTop: 20, alignItems: "start" }}>
        <section className="card card-pad">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Receipts</h2>
          <table className="table">
            <tbody>
              {vm.orders.map((o) => (
                <tr key={o.id}>
                  <td className="small">
                    {o.description}
                    <div className="tiny muted">
                      {fmtDate(o.createdAt)} · {o.id}
                    </div>
                  </td>
                  <td className="num mono">
                    {money(o.amount)}
                    {o.status === "refunded" && <div className="tiny">refunded</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card card-pad">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Financial aid</h2>
          {vm.aid.length === 0 ? (
            <p className="small muted">
              No applications. <a href="/financial-aid">How financial aid works</a>
            </p>
          ) : (
            <ul className="item-list">
              {vm.aid.map((a) => (
                <li key={a.id} className="li small" style={{ justifyContent: "space-between" }}>
                  <span>{a.product?.title}</span>
                  <StatusBadge status={a.status === "submitted" ? "In review" : a.status === "approved" ? `Approved ${a.discountPercent}%` : "Declined"} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="card card-pad" style={{ marginTop: 20 }}>
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Profile & privacy</h2>
        <p className="small">
          {vm.user.name} · {vm.user.email}
        </p>
        <p className="small muted">Data export and deletion requests are handled by Scholarion Identity; until it's connected, use the Help Center to request them.</p>
      </section>
    </AppShell>
  );
}

/* ======================= Live, calendar, notifications ======================= */

export function LiveView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof liveVM>; flash: FlashProps }) {
  return (
    <AppShell viewer={viewer} current="/app/live">
      <h1 className="page-title">Live Sessions</h1>
      <Flash {...flash} />
      <p className="muted">Each session is split into 40-minute segments with its own join link. Links open 10 minutes before each segment. Times in Eastern Time.</p>
      {vm.sessions.length === 0 && (
        <div className="panel">
          You don't have a live program seat. <a href="/explore?format=live">Browse live programs</a>
        </div>
      )}
      <div className="stack">
        {vm.sessions.map(({ session: s, productTitle, attended }) => (
          <section key={s.id} className="card card-pad">
            <div className="row between">
              <div>
                <strong>{s.title}</strong>
                <div className="small muted">
                  {productTitle} · {s.cohort} · {fmtDateTime(s.startsAt)}
                </div>
              </div>
              {attended !== null ? <span className="badge badge-green">Attended {attended} min</span> : s.startsAt < vm.now ? <span className="badge">Attendance pending</span> : <span className="badge badge-blue">Upcoming</span>}
            </div>
            <div className="grid g3" style={{ marginTop: 12 }}>
              {s.segments.map((g) => (
                <div key={g.id} className="panel small" style={{ padding: 12 }}>
                  <strong>
                    Segment {g.index} of {s.segments.length}
                  </strong>
                  <div className="muted">
                    {fmtDateTime(g.startsAt)} · {g.minutes} min · {g.provider === "zoom" ? "Zoom" : "Webex"}
                  </div>
                  <a className="btn btn-outline btn-sm" href={`/api/v1/live/segments/${g.id}/join`} style={{ marginTop: 8 }}>
                    Join segment
                  </a>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

export function CalendarView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof calendarVM> }) {
  return (
    <AppShell viewer={viewer} current="/app/calendar">
      <h1 className="page-title">Calendar</h1>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="card table-wrap">
          <table className="table">
            <caption style={{ textAlign: "left", padding: "12px 12px 0", fontWeight: 700 }}>Suggested deadlines</caption>
            <tbody>
              {vm.rows.map((r) => (
                <tr key={r.item.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {fmtDate(r.due, { weekday: "short", month: "short", day: "numeric" })}
                  </td>
                  <td>
                    <a href={`/app/course/${r.course.id}/item/${r.item.id}`}>{r.item.title}</a>
                    <div className="tiny muted">
                      {r.course.code} · Module {r.item.moduleNo}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card card-pad">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Live sessions</h2>
          <ul className="small">
            {vm.sessions.map((s) => (
              <li key={s.startsAt}>
                {fmtDateTime(s.startsAt)} — {s.title}
              </li>
            ))}
          </ul>
          {vm.sessions.length === 0 && <p className="small muted">None scheduled.</p>}
        </section>
      </div>
    </AppShell>
  );
}

export function NotificationsView({ viewer, emails }: { viewer: V; emails: OutboxEmail[] }) {
  return (
    <AppShell viewer={viewer} current="/app/notifications">
      <h1 className="page-title">Notifications</h1>
      <p className="muted small">Messages sent to you by email through HavenRoute (simulated — shown here instead of being delivered).</p>
      <div className="stack">
        {emails.length === 0 && <div className="panel muted">No notifications yet.</div>}
        {emails.map((e) => (
          <details key={e.id} className="acc">
            <summary>
              <span>{e.subject}</span>
              <span className="tiny muted">{fmtDateTime(e.createdAt)}</span>
            </summary>
            <div className="small" style={{ whiteSpace: "pre-line" }}>
              {e.body}
            </div>
          </details>
        ))}
      </div>
    </AppShell>
  );
}

export function OnboardingView({ viewer }: { viewer: V }) {
  return (
    <AppShell viewer={viewer} current="/app">
      <div style={{ maxWidth: 640 }}>
        <h1 className="page-title">Welcome, {viewer.name.split(" ")[0]}! Let's personalise your learning.</h1>
        <form method="post" action="/api/v1/me/onboarding" className="panel">
          <div className="field">
            <label htmlFor="goal">Your main goal</label>
            <select id="goal" name="goal">
              <option>Start a new career</option>
              <option>Grow in my current role</option>
              <option>Build AI skills</option>
              <option>Learn for fun</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="level">Experience level</label>
            <select id="level" name="level">
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="topics">
              Topics <span className="hint">(comma-separated, e.g. Python, agentic AI)</span>
            </label>
            <input id="topics" name="topics" type="text" />
          </div>
          <div className="field">
            <label htmlFor="hours">Hours per week</label>
            <input id="hours" name="hoursPerWeek" type="number" min={1} max={40} defaultValue={5} />
          </div>
          <div className="row">
            <button className="btn btn-primary">Save and continue</button>
            <a href="/app">Skip for now</a>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export function TutorHubView({ viewer, courses }: { viewer: V; courses: { id: string; code?: string; title: string }[] }) {
  return (
    <AppShell viewer={viewer} current="/app/tutor">
      <h1 className="page-title">AI Tutor</h1>
      <p className="muted">The tutor lives inside each course so it can answer from that course's materials, with sources. Pick a course:</p>
      <div className="grid g3">
        {courses.map((c) => (
          <a key={c.id} className="card card-pad" href={`/app/course/${c.id}/module/1`} style={{ textDecoration: "none", color: "inherit" }}>
            <Icon name="sparkle" />
            <div>
              <strong>
                {c.code} {c.title}
              </strong>
            </div>
          </a>
        ))}
      </div>
    </AppShell>
  );
}

export function ProctoringView({ viewer }: { viewer: V }) {
  const checklist = ["Current government-issued photo ID ready", "Webcam shows face, hands and workspace", "Microphone on and working", "Unapproved devices removed; no music", "No smart glasses", "No head/face-movement mouse control (unless approved)", "Appropriate attire", "System check completed"];
  return (
    <AppShell viewer={viewer} current="/app/proctoring">
      <h1 className="page-title">Proctored Assessment Setup</h1>
      <p className="muted">Prepare for success. Follow the checklist and get support if needed.</p>
      <div className="notice notice-info">Remote proctoring is PLANNED. No proctored exams are scheduled in this environment; this page shows the preparation flow.</div>
      <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Three Key Requirements</h2>
      <div className="grid g3">
        {[
          ["Webcam View", "Show your face, hands and workspace."],
          ["Valid ID", "Current government-issued photo ID."],
          ["Testing Area", "Remove unapproved devices."],
        ].map(([t, d]) => (
          <div key={t} className="card card-pad" style={{ background: "var(--green-100)" }}>
            <strong>{t}</strong>
            <div className="small">{d}</div>
          </div>
        ))}
      </div>
      <div className="with-aside" style={{ marginTop: 20 }}>
        <section className="panel">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Pre-Test Readiness Checklist</h2>
          {checklist.map((c) => (
            <label key={c} className="check small">
              <input type="checkbox" /> {c}
            </label>
          ))}
        </section>
        <section className="panel">
          <strong>Need an accommodation?</strong>
          <p className="small muted">If you use assistive technology or need a testing accommodation, contact us before your assessment date.</p>
          <a className="btn btn-outline btn-block btn-sm" href="/help?q=accommodation">
            Go to Accommodations
          </a>
          <a className="btn btn-ghost btn-block btn-sm" href="/help" style={{ marginTop: 8 }}>
            Contact Support
          </a>
        </section>
      </div>
    </AppShell>
  );
}

export function ResourcesView({ viewer, course, labs }: { viewer: V; course: Product; labs: { id: string; title: string; file: string }[] }) {
  return (
    <AppShell viewer={viewer} current="/app/courses">
      <Crumbs items={[[course.code ?? course.title, `/app/course/${course.id}`], ["Resources", null]]} />
      <h1 className="page-title">Course Resources</h1>
      <section className="card card-pad">
        <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Lab starter files</h2>
        {labs.length === 0 && <p className="small muted">This course has no downloadable lab files.</p>}
        <ul className="item-list">
          {labs.map((l) => (
            <li key={l.id} className="li small" style={{ justifyContent: "space-between" }}>
              <span>
                {l.title} <span className="mono tiny">{l.file}</span>
              </span>
              <a className="btn btn-ghost btn-sm" href={`/api/v1/labs/starter/${l.id}`}>
                <Icon name="download" size={16} /> Download
              </a>
            </li>
          ))}
        </ul>
      </section>
      {course.id === "prd_cop1047c" && (
        <section className="card card-pad" style={{ marginTop: 16 }}>
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Textbook</h2>
          <p className="small">Readings align with Gaddis, <em>Starting Out with Python</em> (6th ed.). Chapter references appear in each module's Reading &amp; Resources.</p>
        </section>
      )}
    </AppShell>
  );
}
