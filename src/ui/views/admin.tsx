import type { ReactNode } from "react";
import type { adminVM, aidQueueVM, claimsVM, gradingVM, liveAdminVM, studioVM, supportVM, Viewer } from "@/bff/views";
import { fmtDateTime, StatusBadge } from "../components/cards";
import { AppShell, Flash } from "../components/chrome";

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
      {t("/admin/grading", "Grading")}
      {t("/admin/studio", "Studio review")}
      {t("/admin/live", "Live sessions")}
      {t("/admin/support", "Support & leads")}
      {t("/admin/claims", "Claims checker")}
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
            <pre className="tiny" style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", background: "var(--surface-2)", padding: 10, borderRadius: 6 }}>
              {JSON.stringify(d.content, null, 2)}
            </pre>
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
