import type { ReactNode } from "react";
import type { adminVM, commerceAdminVM, admissionsVM, courseReviewsVM, aidQueueVM, claimsVM, gradingVM, liveAdminVM, moderationVM, studioVM, supportVM, Viewer } from "@/bff/views";
import { fmtDate, fmtDateTime, StatusBadge } from "../components/cards";
import { formatMoney } from "@/platform/pricing";
import { AppShell, Flash } from "../components/chrome";
import { CourseReviewQueue } from "./teach";
import { StudioOutputView } from "../components/studio";

type V = NonNullable<Viewer>;
type FlashProps = { notice?: string; error?: string };

function AdminTabs({ current }: { current: string }) {
  const t = (href: string, label: string) => (
    <a href={href} aria-current={current === href ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <nav className="tabs" aria-label="Admin sections">
      {t("/admin", "Status & events")}
      {t("/admin/aid", "Financial aid")}
      {t("/admin/commerce", "Commerce (sandbox)")}
      {t("/admin/admissions", "Admissions")}
      {t("/admin/grading", "Grading")}
      {t("/admin/studio", "Studio review")}
      {t("/admin/course-reviews", "Course reviews")}
      {t("/admin/moderation", "Moderation")}
      {t("/admin/live", "Live sessions")}
      {t("/admin/support", "Support & leads")}
      {t("/admin/claims", "Claims checker")}
      {t("/admin/blog", "Blog")}
    </nav>
  );
}

function Shell({ viewer, current, title, flash, children }: { viewer: V; current: string; title: string; flash?: FlashProps; children: ReactNode }) {
  return (
    <AppShell viewer={viewer} current={current}>
      <h1 className="page-title">{title}</h1>
      <AdminTabs current={current} />
      {flash && <Flash {...flash} />}
      {children}
    </AppShell>
  );
}

export function AdminHomeView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof adminVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin" title="Staff & Admin" flash={flash}>
      <section className="card table-wrap">
        <table className="table">
          <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Capability status board</caption>
          <thead>
            <tr>
              <th>Connection</th>
              <th>Phase</th>
              <th>Status</th>
              <th>Implementation here</th>
              <th>Fallback when down</th>
            </tr>
          </thead>
          <tbody>
            {vm.capabilities.map((c) => (
              <tr key={c.key}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td>{c.phase}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td className="small">{c.implementation}</td>
                <td className="small muted">{c.fallback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid g2" style={{ marginTop: 20, alignItems: "start" }}>
        <section className="card card-pad">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Sandbox clock</h2>
          <p className="small muted">
            Platform time: {fmtDateTime(vm.now)} ({vm.clockOffsetDays >= 0 ? "+" : ""}
            {vm.clockOffsetDays} days). Advancing runs the scheduler: trial reminders, conversions, renewals, expiries, deadline and live reminders.
          </p>
          <form method="post" action="/api/v1/admin/clock" className="row">
            <label htmlFor="days" className="sr-only">
              Days
            </label>
            <input id="days" name="days" type="number" min={0} max={400} defaultValue={1} style={{ width: 100 }} />
            <button className="btn btn-primary btn-sm">Advance & run scheduler</button>
          </form>
        </section>
        <section className="card card-pad">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Queues</h2>
          <ul className="small">
            <li>
              <a href="/admin/aid">Financial aid in review: {vm.counts.aidPending}</a>
            </li>
            <li>
              <a href="/admin/grading">Submissions to grade: {vm.counts.submissions}</a>
            </li>
            <li>
              <a href="/admin/studio">Studio drafts awaiting review: {vm.counts.studioDrafts}</a>
            </li>
            <li>
              <a href="/admin/moderation">Reported discussion posts: {vm.counts.reported}</a>
            </li>
            <li>
              <a href="/admin/support">Open tickets: {vm.counts.tickets}</a>
            </li>
            <li>
              Users {vm.counts.users} · enrollments {vm.counts.enrollments} · credentials {vm.counts.credentials}
            </li>
          </ul>
        </section>
      </div>
      <div className="grid g2" style={{ marginTop: 20, alignItems: "start" }}>
        <section className="card table-wrap">
          <table className="table">
            <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Event bus (latest 40, CloudEvents)</caption>
            <tbody>
              {vm.events.length === 0 && (
                <tr>
                  <td className="muted small">No events yet — sign in as a learner and do something.</td>
                </tr>
              )}
              {vm.events.map((e) => (
                <tr key={e.id}>
                  <td className="mono tiny" style={{ whiteSpace: "nowrap" }}>
                    {e.type}
                  </td>
                  <td className="tiny muted">{e.source}</td>
                  <td className="tiny muted">{fmtDateTime(e.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="stack">
          <div className="card table-wrap">
            <table className="table">
              <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>HavenRoute outbox (simulated)</caption>
              <tbody>
                {vm.outbox.map((m) => (
                  <tr key={m.id}>
                    <td className="small">
                      <strong>{m.subject}</strong>
                      <div className="tiny muted">
                        to {m.to} · {m.template}
                      </div>
                      {vm.showEmailBodies && (
                        <details className="tiny">
                          <summary>Show email (sandbox)</summary>
                          <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{m.body}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
                {vm.outbox.length === 0 && (
                  <tr>
                    <td className="muted small">No emails yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card table-wrap">
            <table className="table">
              <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Recently issued credentials</caption>
              <tbody>
                {vm.credentials.map((c) => (
                  <tr key={c.id}>
                    <td className="small">
                      <a href={`/verify/${c.id}`}>{c.title}</a>
                      <div className="tiny muted">{c.holderName}</div>
                    </td>
                    <td className="num">
                      {c.revokedAt ? (
                        <span className="badge badge-red">Revoked</span>
                      ) : (
                        <form method="post" action={`/api/v1/admin/credentials/${c.id}/revoke`}>
                          <button className="btn btn-ghost btn-sm">Revoke</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {vm.credentials.length === 0 && (
                  <tr>
                    <td className="muted small">None yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}

export function AdminAidView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof aidQueueVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/aid" title="Financial aid review" flash={flash}>
      <p className="small muted">A person decides every application. The summary is extractive and only helps you read faster.</p>
      {vm.length === 0 && <div className="panel muted">The queue is empty.</div>}
      <div className="stack">
        {vm.map((a) => (
          <section key={a.id} className="card card-pad">
            <div className="row between">
              <strong>{a.product?.title}</strong>
              <span className="tiny muted">Submitted {fmtDateTime(a.createdAt)}</span>
            </div>
            <p className="small">
              <strong>Summary:</strong> {a.summary}
            </p>
            <details className="acc">
              <summary>Full application</summary>
              <div className="small">
                <p>
                  <strong>Background:</strong> {a.background}
                </p>
                <p>
                  <strong>Need:</strong> {a.need}
                </p>
                <p>
                  <strong>Goals:</strong> {a.goals}
                </p>
              </div>
            </details>
            <form method="post" action={`/api/v1/commerce/aid-applications/${a.id}/decision`} className="row" style={{ marginTop: 12 }}>
              <label htmlFor={`d-${a.id}`} className="small" style={{ margin: 0 }}>
                Discount %
              </label>
              <input id={`d-${a.id}`} name="discountPercent" type="number" min={1} max={100} defaultValue={100} style={{ width: 90 }} />
              <button className="btn btn-primary btn-sm" name="decision" value="approved">
                Approve
              </button>
              <button className="btn btn-danger btn-sm" name="decision" value="declined">
                Decline
              </button>
            </form>
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminGradingView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof gradingVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/grading" title="Project grading" flash={flash}>
      {vm.length === 0 && <div className="panel muted">Nothing waiting for a grade.</div>}
      <div className="stack">
        {vm.map((s) => (
          <section key={s.id} className="card card-pad">
            <strong>{s.item?.title}</strong>
            <div className="tiny muted">
              {s.learner} · {fmtDateTime(s.createdAt)} {s.fileName ? `· ${s.fileName}` : ""}
            </div>
            <p className="small">{s.text}</p>
            {s.needsStaff && (
              <div className="notice notice-warn small">
                Peer reviewers disagreed by more than 25% of the maximum, so this needs a staff grade.
                <ul style={{ margin: "6px 0 0" }}>
                  {s.peerReviews.map((r) => (
                    <li key={r.id}>
                      {r.total}/{r.max} — {r.comment}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form method="post" action={`/api/v1/admin/submissions/${s.id}/grade`} className="row">
              <input name="score" type="number" min={0} max={100} required placeholder="Score" style={{ width: 100 }} aria-label="Score" />
              <input name="max" type="number" min={1} max={100} defaultValue={s.item?.project?.rubric.reduce((a, r) => a + r.points, 0) ?? 50} style={{ width: 90 }} aria-label="Out of" />
              <input name="feedback" type="text" placeholder="Feedback for the learner" style={{ flex: 1, minWidth: 200 }} aria-label="Feedback" />
              <button className="btn btn-primary btn-sm">Post grade</button>
            </form>
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminStudioView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof studioVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/studio" title="Studio outputs — staff review" flash={flash}>
      <p className="small muted">Learners only see study aids after a staff member approves them.</p>
      <form method="post" action="/api/v1/admin/studio/generate" className="panel row" style={{ marginBottom: 16 }}>
        <label htmlFor="sc" className="small" style={{ margin: 0 }}>
          Generate drafts for
        </label>
        <select id="sc" name="courseId" style={{ width: 260 }}>
          {vm.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ?? ""} {c.title}
            </option>
          ))}
        </select>
        <label htmlFor="sm" className="small" style={{ margin: 0 }}>
          Module
        </label>
        <input id="sm" name="moduleNo" type="number" min={1} max={10} defaultValue={7} style={{ width: 80 }} />
        <button className="btn btn-outline btn-sm">Generate</button>
      </form>
      {vm.drafts.length === 0 && <div className="panel muted">No drafts waiting.</div>}
      <div className="stack">
        {vm.drafts.map((d) => (
          <section key={d.id} className="card card-pad">
            <div className="row between">
              <span>
                <strong>{d.title}</strong> <span className="tiny muted">· {d.course?.code} · {d.kind.replace("_", " ")}</span>
              </span>
              <form method="post" action={`/api/v1/admin/studio/${d.id}/approve`}>
                <button className="btn btn-primary btn-sm">Approve & publish</button>
              </form>
            </div>
            <div className="small studio-preview">
              <StudioOutputView o={d} />
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminLiveView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof liveAdminVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/live" title="Live sessions" flash={flash}>
      <p className="small muted">Attendance normally arrives from Zoom/Webex participant webhooks. Here you can record it manually (simulated webhook, audit-logged as an event).</p>
      <div className="stack">
        {vm.map((s) => (
          <section key={s.id} className="card card-pad">
            <div className="row between">
              <span>
                <strong>{s.title}</strong>
                <div className="tiny muted">
                  {s.product} · {fmtDateTime(s.startsAt)} · {s.segments.length} segments on {s.segments[0].provider}
                </div>
              </span>
              <form method="post" action={`/api/v1/admin/live/${s.id}/failover`}>
                <button className="btn btn-ghost btn-sm">Fail over to {s.segments[0].provider === "zoom" ? "Webex" : "Zoom"}</button>
              </form>
            </div>
            {s.seats.map((seat) => (
              <form key={seat.userId} method="post" action={`/api/v1/admin/live/${s.id}/attendance`} className="row small" style={{ marginTop: 8 }}>
                <input type="hidden" name="userId" value={seat.userId} />
                <span style={{ minWidth: 160 }}>{seat.name}</span>
                <input name="minutes" type="number" min={0} max={240} defaultValue={seat.minutes ?? 120} style={{ width: 90 }} aria-label={`Minutes attended by ${seat.name}`} />
                <button className="btn btn-outline btn-sm">{seat.minutes === null ? "Record attendance" : "Update"}</button>
              </form>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminSupportView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof supportVM> }) {
  return (
    <Shell viewer={viewer} current="/admin/support" title="HavenConnect — tickets & leads">
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="card table-wrap">
          <table className="table">
            <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Tickets</caption>
            <tbody>
              {vm.tickets.map((t) => (
                <tr key={t.id}>
                  <td className="small">
                    <strong>{t.subject}</strong> <span className="badge">{t.category.replace("_", " ")}</span>
                    <div className="tiny muted">{t.body}</div>
                    <div className="tiny muted mono">context: {JSON.stringify(t.context).slice(0, 120)}</div>
                  </td>
                  <td className="num">
                    {t.status === "open" ? (
                      <form method="post" action={`/api/v1/admin/tickets/${t.id}/resolve`}>
                        <button className="btn btn-ghost btn-sm">Resolve</button>
                      </form>
                    ) : (
                      <span className="badge badge-green">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
              {vm.tickets.length === 0 && (
                <tr>
                  <td className="small muted">No tickets.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="card table-wrap">
          <table className="table">
            <caption style={{ textAlign: "left", padding: "14px 12px 4px", fontWeight: 700 }}>Leads</caption>
            <tbody>
              {vm.leads.map((l) => (
                <tr key={l.id}>
                  <td className="small">
                    <strong>{l.organization}</strong> <span className="badge">{l.kind.replace("_", " ")}</span>
                    <div className="tiny muted">
                      {l.name} · {l.email}
                    </div>
                  </td>
                </tr>
              ))}
              {vm.leads.length === 0 && (
                <tr>
                  <td className="small muted">No leads.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}

export function AdminClaimsView({ viewer, vm }: { viewer: V; vm: ReturnType<typeof claimsVM> }) {
  return (
    <Shell viewer={viewer} current="/admin/claims" title="Claims checker">
      <p className="small muted">Paste draft page copy. Partner names, accreditation, credit, degree, salary, outcome, learner-count and rating claims are blocked unless they trace to the Partner Registry or a cited source.</p>
      <form method="post" action="/api/v1/admin/claims" className="panel">
        <label htmlFor="ct">Draft copy</label>
        <textarea id="ct" name="text" defaultValue={vm.text} placeholder="e.g. Earn an accredited degree with transferable college credit…" />
        <button className="btn btn-primary" style={{ marginTop: 10 }}>
          Check
        </button>
      </form>
      {vm.text && (
        <div className={`notice ${vm.issues.length ? "notice-err" : "notice-ok"}`} style={{ marginTop: 16 }} role="status">
          {vm.issues.length ? `Blocked: ${vm.issues.length} issue${vm.issues.length > 1 ? "s" : ""}.` : "No issues — this copy can be published."}
        </div>
      )}
      {vm.issues.length > 0 && (
        <table className="table card">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Matched text</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {vm.issues.map((i, n) => (
              <tr key={n}>
                <td>
                  <span className="badge badge-red">{i.rule.replace("_", " ")}</span>
                </td>
                <td className="mono small">{i.match}</td>
                <td className="small">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}

export function AdminModerationView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof moderationVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/moderation" title="Moderation" flash={flash}>
      <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Learner reviews on hold ({vm.reviews.length})</h2>
      <p className="small muted">Reviews with links, contact details or claims the claims checker flags wait here, as do reviews three learners reported. Only credential holders can write reviews.</p>
      {vm.reviews.length === 0 && <div className="panel muted">No reviews waiting.</div>}
      <div className="stack" style={{ marginBottom: 28 }}>
        {vm.reviews.map((r) => (
          <section key={r.id} className="card card-pad">
            <div className="row between">
              <span className="small">
                <strong>{r.author}</strong> on {r.productTitle} · {fmtDateTime(r.updatedAt ?? r.createdAt)}
              </span>
              <span className="row" style={{ ["--gap" as string]: "6px" }}>
                <span className="badge" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                {r.moderationNote && <span className="badge badge-amber">{r.moderationNote}</span>}
              </span>
            </div>
            <p className="small" style={{ margin: "8px 0 2px" }}>
              <strong>{r.title}</strong>
            </p>
            <p className="small" style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
              {r.body}
            </p>
            <div className="row">
              <form method="post" action={`/api/v1/admin/reviews/${r.id}/publish`}>
                <button className="btn btn-primary btn-sm">Publish</button>
              </form>
              <form method="post" action={`/api/v1/admin/reviews/${r.id}/hide`} className="row" style={{ ["--gap" as string]: "6px" }}>
                <label className="sr-only" htmlFor={`note-${r.id}`}>Reason for removing</label>
                <input id={`note-${r.id}`} name="note" placeholder="Reason (shown to staff)" style={{ maxWidth: 220 }} />
                <button className="btn btn-danger btn-sm">Remove</button>
              </form>
            </div>
          </section>
        ))}
      </div>
      <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>Discussions ({vm.posts.length})</h2>
      <p className="small muted">Posts learners reported, and posts staff have hidden. Hidden posts show as removed to learners.</p>
      {vm.posts.length === 0 && <div className="panel muted">Nothing to review.</div>}
      <div className="stack">
        {vm.posts.map((p) => (
          <section key={p.id} className="card card-pad">
            <div className="row between">
              <span className="small">
                <strong>{p.author}</strong> in {p.course?.code} · {p.item?.title} · {fmtDateTime(p.createdAt)}
              </span>
              <span className="row" style={{ ["--gap" as string]: "6px" }}>
                {p.reports.length > 0 && <span className="badge badge-red">{p.reports.length} report{p.reports.length > 1 ? "s" : ""}</span>}
                {p.hiddenAt && <span className="badge">Hidden</span>}
              </span>
            </div>
            <p className="small" style={{ margin: "8px 0" }}>
              {p.body}
            </p>
            <div className="row">
              {p.hiddenAt ? (
                <form method="post" action={`/api/v1/admin/community/posts/${p.id}/restore`}>
                  <button className="btn btn-outline btn-sm">Restore</button>
                </form>
              ) : (
                <form method="post" action={`/api/v1/admin/community/posts/${p.id}/hide`}>
                  <button className="btn btn-danger btn-sm">Hide post</button>
                </form>
              )}
              {p.reports.length > 0 && !p.hiddenAt && (
                <form method="post" action={`/api/v1/admin/community/posts/${p.id}/dismiss`}>
                  <button className="btn btn-ghost btn-sm">Dismiss reports</button>
                </form>
              )}
              <a className="small" href={`/app/course/${p.courseId}/item/${p.itemId}`}>
                Open discussion
              </a>
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminAdmissionsView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof admissionsVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/admissions" title="Live program admissions" flash={flash}>
      <p className="small muted">Accepting holds a seat until the applicant reserves it. When a cohort is full, waitlist instead.</p>
      {vm.length === 0 && <div className="panel muted">No applications waiting.</div>}
      <div className="stack">
        {vm.map((a) => (
          <section key={a.id} className="card card-pad stack" style={{ ["--gap" as string]: "8px" }}>
            <div className="row between">
              <span>
                <strong>{a.applicant}</strong> · {a.product?.code} {a.product?.title} · {a.cohort}
              </span>
              <span className="row" style={{ ["--gap" as string]: "6px" }}>
                <span className={`badge ${a.capacity.free > 0 ? "badge-green" : "badge-red"}`}>
                  {a.capacity.free} of {a.capacity.total} seats open
                </span>
                {a.status === "waitlisted" && <span className="badge badge-amber">Waitlisted</span>}
              </span>
            </div>
            <p className="small" style={{ margin: 0 }}>
              <strong>Experience:</strong> {a.experience}
            </p>
            <p className="small" style={{ margin: 0 }}>
              <strong>Motivation:</strong> {a.motivation}
            </p>
            <span className="tiny muted">Applied {fmtDateTime(a.createdAt)}</span>
            <form method="post" action={`/api/v1/admin/admissions/${a.id}/decide`} className="row">
              <label htmlFor={`note-${a.id}`} className="sr-only">
                Note to applicant
              </label>
              <input id={`note-${a.id}`} name="note" type="text" placeholder="Optional note to the applicant" style={{ flex: 1, minWidth: 220 }} />
              <button className="btn btn-primary btn-sm" name="decision" value="accepted" disabled={a.capacity.free <= 0}>
                Accept
              </button>
              <button className="btn btn-ghost btn-sm" name="decision" value="waitlisted" disabled={a.status === "waitlisted"}>
                Waitlist
              </button>
              <button className="btn btn-danger btn-sm" name="decision" value="declined">
                Decline
              </button>
            </form>
          </section>
        ))}
      </div>
    </Shell>
  );
}

export function AdminCourseReviewsView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof courseReviewsVM>; flash: FlashProps }) {
  return (
    <Shell viewer={viewer} current="/admin/course-reviews" title="Course reviews" flash={flash}>
      <p className="small muted">Instructor-built courses waiting to publish. They passed the checklist when submitted; check the teaching quality and that nothing promises credit, jobs or partner endorsements.</p>
      <CourseReviewQueue vm={vm} />
    </Shell>
  );
}

/* ======================= Commerce (sandbox) ======================= */

export function AdminCommerceView({ viewer, vm, flash }: { viewer: V; vm: ReturnType<typeof commerceAdminVM>; flash: FlashProps }) {
  const st = vm.settings;
  const now = vm.now;
  return (
    <Shell viewer={viewer} current="/admin/commerce" title="Commerce — sandbox" flash={flash}>
      <div className="dev-banner" style={{ marginBottom: 16 }}>
        <strong>Sandbox.</strong> All prices are placeholders, tax rates are simulated, and no money moves. Changes apply to new checkouts; existing subscriptions keep their price until they change plan.
      </div>
      <section className="card card-pad" aria-labelledby="ca-prices">
        <h2 id="ca-prices" className="ca-h">
          Plans, prices and billing rules
        </h2>
        <p className="small muted">Base prices are in USD; other regions are derived from the regional price book.{st.updatedAt ? ` Last saved ${fmtDateTime(st.updatedAt)}.` : ""}</p>
        <form method="post" action="/api/v1/admin/commerce/settings" className="stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="grid g3">
            {(
              [
                ["programMonthly", "Program subscription (per month, USD)", st.programMonthly],
                ["plusMonthly", "Scholarion Plus monthly (USD)", st.plusMonthly],
                ["plusAnnual", "Scholarion Plus annual (USD)", st.plusAnnual],
              ] as const
            ).map(([k, label, v]) => (
              <div key={k} className="field" style={{ margin: 0 }}>
                <label htmlFor={`ca-${k}`}>{label}</label>
                <input id={`ca-${k}`} name={k} type="number" min={1} max={10000} step="0.01" defaultValue={v} required />
              </div>
            ))}
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ca-trial">Plus free trial (days)</label>
              <input id="ca-trial" name="trialDays" type="number" min={1} max={30} defaultValue={st.trialDays} required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="ca-notice">Pre-renewal notice (days before charge)</label>
              <input id="ca-notice" name="renewalNoticeDays" type="number" min={1} max={30} defaultValue={st.renewalNoticeDays} required />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <span className="label-like">Refund window</span>
              <p className="small" style={{ margin: "6px 0 0" }}>
                {st.refundDays} days (set by environment)
              </p>
            </div>
          </div>
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
            <legend className="small" style={{ fontWeight: 700, padding: "0 6px" }}>
              Simulated tax rate by price-book region (%)
            </legend>
            <div className="grid g4">
              {vm.regions.map((r) => (
                <div key={r.code} className="field" style={{ margin: 0 }}>
                  <label htmlFor={`tax-${r.code}`}>
                    {r.name} ({r.currency})
                  </label>
                  <input id={`tax-${r.code}`} name={`tax_${r.code}`} type="number" min={0} max={30} step="0.01" defaultValue={st.taxRates[r.code] ?? 0} />
                </div>
              ))}
            </div>
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              Shown as a separate “simulated tax” line at checkout and on receipts. Not a tax calculation.
            </p>
          </fieldset>
          <div>
            <button className="btn btn-primary btn-sm">Save sandbox settings</button>
          </div>
        </form>
      </section>

      <section id="coupons" className="card card-pad" style={{ marginTop: 20 }} aria-labelledby="ca-coupons">
        <h2 id="ca-coupons" className="ca-h">
          Coupons
        </h2>
        <p className="small muted">A code takes a percentage off today's payment for paid checkouts. It can't be combined with a free trial or financial aid.</p>
        <form method="post" action="/api/v1/admin/commerce/coupons" className="row" style={{ alignItems: "flex-end", ["--gap" as string]: "10px" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cp-code">Code</label>
            <input id="cp-code" name="code" required pattern="[A-Za-z0-9-]{3,24}" style={{ width: 170, textTransform: "uppercase" }} aria-describedby="cp-code-hint" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cp-pct">Percent off</label>
            <input id="cp-pct" name="percentOff" type="number" min={1} max={100} required style={{ width: 100 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cp-days">Expires in (days, optional)</label>
            <input id="cp-days" name="expiresInDays" type="number" min={1} max={730} style={{ width: 120 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="cp-max">Max redemptions (optional)</label>
            <input id="cp-max" name="maxRedemptions" type="number" min={1} style={{ width: 120 }} />
          </div>
          <button className="btn btn-primary btn-sm">Create code</button>
        </form>
        <p id="cp-code-hint" className="tiny muted">
          3–24 letters, numbers or hyphens.
        </p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Coupon codes</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Off</th>
                <th scope="col">Redeemed</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vm.coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted small">
                    No codes yet.
                  </td>
                </tr>
              )}
              {vm.coupons.map((c) => {
                const expired = !!c.expiredAt || (!!c.expiresAt && now >= c.expiresAt);
                const usedUp = c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions;
                return (
                  <tr key={c.code}>
                    <td className="mono">{c.code}</td>
                    <td>{c.percentOff}%</td>
                    <td>
                      {c.redemptions}
                      {c.maxRedemptions !== null ? ` of ${c.maxRedemptions}` : ""}
                    </td>
                    <td>{c.expiredAt ? `Expired ${fmtDate(c.expiredAt)}` : c.expiresAt ? fmtDate(c.expiresAt) : "No expiry"}</td>
                    <td>
                      <StatusBadge status={expired ? "Expired" : usedUp ? "Used up" : "Active"} />
                    </td>
                    <td className="num">
                      {!expired && (
                        <form method="post" action={`/api/v1/admin/commerce/coupons/${c.code}/expire`}>
                          <button className="btn btn-ghost btn-sm" aria-label={`Expire code ${c.code} now`}>
                            Expire now
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section id="refunds" className="card card-pad" style={{ marginTop: 20 }} aria-labelledby="ca-refunds">
        <h2 id="ca-refunds" className="ca-h">
          Refund requests
        </h2>
        <p className="small muted">One-time purchases within the refund window. Policy: refunds if the learner hasn't completed graded work. Annual Plus refunds inside the window are automatic.</p>
        {vm.refunds.length === 0 && <div className="panel muted small">No refund requests waiting.</div>}
        <div className="stack">
          {vm.refunds.map((r) => (
            <div key={r.id} className="panel stack" style={{ ["--gap" as string]: "6px" }}>
              <div className="row between">
                <strong>
                  {r.learner} · {r.product?.title ?? r.order?.description ?? r.orderId}
                </strong>
                <span className="mono">{formatMoney(r.amount, r.currency)}</span>
              </div>
              <div className="tiny muted">
                Order {r.orderId} · paid {r.order ? fmtDateTime(r.order.createdAt) : "—"} · requested {fmtDateTime(r.createdAt)}
              </div>
              <div className="small">
                Graded work recorded for this purchase: <strong>{r.gradedItems}</strong> item{r.gradedItems === 1 ? "" : "s"}
              </div>
              {r.reason && (
                <p className="small" style={{ margin: 0 }}>
                  <strong>Reason:</strong> {r.reason}
                </p>
              )}
              <form method="post" action={`/api/v1/admin/commerce/refunds/${r.id}/approve`} className="row" style={{ ["--gap" as string]: "8px" }}>
                <label htmlFor={`rn-${r.id}`} className="sr-only">
                  Note to the learner
                </label>
                <input id={`rn-${r.id}`} name="note" placeholder="Note to the learner (optional)" style={{ flex: 1, minWidth: 200 }} />
                <button className="btn btn-primary btn-sm">Approve refund</button>
                <button className="btn btn-danger btn-sm" formAction={`/api/v1/admin/commerce/refunds/${r.id}/deny`}>
                  Deny
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
