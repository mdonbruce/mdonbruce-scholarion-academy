import type { ReactNode } from "react";
import { FacultyCard } from "../../../ui/components/faculty";
import { broker, CampusError, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import * as entity from "../../entity";
import { ENTITY, TAB } from "../../registry";
import { Args, OPERATIONS, operationsForTab } from "../../http/ops";
import { permissionMatrix } from "../../permissions";
import { controlCenter, reviewQueue } from "../../services/ai";
import { adminOverview } from "../../services/admin";
import { capabilityBoard, connectorList, platformMetrics, TENANT_TEMPLATES } from "../../services/platform";
import { opsOverview } from "../../services/ops";
import { validateRegistration } from "../../services/sis";
import { groupSetView, myObservees } from "../../services/people";
import { myTickets } from "../../services/desk";
import { labNotebook } from "../../services/tutor";
import { ProctorPanel } from "./proctor";
import { studioOverview, programIndex } from "../../services/programs";
import { PARITY, paritySummary, SECTION_TITLES } from "../../parity";
import { consolidationReport } from "../../services/hub";
import * as assess from "../../services/assess";
import * as alabs from "../../services/agentlabs";
import { simScenarios } from "../../services/simlab";
import { LIBRARY } from "../../academy/programs-data-2";
import { api, Chip, Denied, Empty, EntityForm, EntityTable, fmt, Hidden, OpForm, PageHead, Result } from "../kit";

type SP = Record<string, string | undefined>;
interface T {
  store: TenantStore;
  actor: Actor;
  slug: string;
  sp: SP;
  here: string;
}

/** Every tab: bespoke workflow panel (where one exists), its resources, its operations, runbook and threat model. */
export function TabPage({ store, actor, slug, tabSlug, sp }: { store: TenantStore; actor: Actor; slug: string; tabSlug: string; sp: SP }) {
  const tab = TAB[tabSlug];
  if (!tab) return <Denied message="Unknown area." />;
  const tenant = broker.tenant(store.tenantId)!;
  if (tab.platformOnly && !actor.platformOperator) return <Denied message="Platform operators only." />;
  if (tab.internalOnly && tenant.kind !== "internal") return <Denied message="This area is only available to the internal tenant." />;
  const t: T = { store, actor, slug, sp, here: `/campus/${slug}/t/${tabSlug}` };
  const ops = operationsForTab(tabSlug);
  let ran: ReactNode = null;
  if (sp.run && OPERATIONS[sp.run]?.kind === "query") {
    try {
      const value = OPERATIONS[sp.run].run({ store, actor, args: new Args(sp), tenant: { tenantId: tenant.id, slug, via: "path", traceId: "ui" } });
      ran = (
        <section className="card card-pad" aria-live="polite">
          <h2 className="card-title">{OPERATIONS[sp.run].summary}</h2>
          <Result value={value instanceof Promise ? "Running…" : value} />
        </section>
      );
    } catch (e) {
      ran = <Denied message={e instanceof CampusError ? e.message : String(e)} />;
    }
  }
  const flagOff = tab.flag && !tenant.flags[tab.flag];
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <span>{tab.group}</span> › <span aria-current="page">{tab.title}</span>
      </nav>
      <PageHead title={tab.title} sub={tab.summary}>
        <span className="badge">Tab {tab.n}</span>
      </PageHead>
      {flagOff && <p className="notice notice-warn">This area is turned off for {tenant.name}. An admin can enable “{tab.flag}” in the Admin Console.</p>}
      {ran}
      <Bespoke t={t} tab={tabSlug} />
      {tab.entities.map((table) => (
        <Resource key={table} t={t} table={table} />
      ))}
      {ops.length > 0 && (
        <section className="card card-pad" aria-labelledby="ops-h">
          <h2 id="ops-h" className="card-title">
            Actions
          </h2>
          <div className="grid g2">
            {ops.map((op) => (
              <details key={op.name} className="campus-opcard">
                <summary>
                  {op.summary} <span className="tiny muted">({op.kind === "query" ? "view" : "action"})</span>
                </summary>
                <OpForm slug={slug} op={op} back={t.here} uid="act" values={Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined)) as Record<string, string>} />
              </details>
            ))}
          </div>
        </section>
      )}
      <details className="card card-pad">
        <summary>Runbook and threat model</summary>
        <dl className="campus-dl">
          <dt>Purpose</dt>
          <dd>{tab.runbook.purpose}</dd>
          <dt>Depends on</dt>
          <dd>{tab.runbook.deps}</dd>
          <dt>Typical failures</dt>
          <dd>{tab.runbook.failure}</dd>
          <dt>Recovery</dt>
          <dd>{tab.runbook.recovery}</dd>
          <dt>Threats and mitigations</dt>
          <dd>
            <ul>
              {tab.threats.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </dd>
        </dl>
      </details>
    </>
  );
}

function Resource({ t, table }: { t: T; table: string }) {
  const d = ENTITY[table];
  let rows: Record<string, unknown>[] = [];
  try {
    rows = entity.list(t.store, t.actor, table, { limit: 50 }).items;
  } catch {
    rows = [];
  }
  const canCreate = !d.workflow && entity.canOp(t.store, t.actor, d, "create", {});
  const canManage = rows.length > 0 && entity.canOp(t.store, t.actor, d, d.publishable ? "publish" : "archive", rows[0]);
  if (!rows.length && !canCreate) return null;
  const selected = t.sp.id && rows.find((r) => r.id === t.sp.id);
  const canEdit = selected && !d.workflow && entity.canOp(t.store, t.actor, d, "update", selected);
  return (
    <section className="card card-pad stack" aria-labelledby={`res-${table}`}>
      <div className="between">
        <h2 id={`res-${table}`} className="card-title">
          {d.plural}
        </h2>
        <span className="tiny muted">{rows.length} shown</span>
      </div>
      <EntityTable slug={t.slug} table={table} rows={rows} back={t.here} manage={{ publish: canManage && !!d.publishable, archive: canManage && entity.canOp(t.store, t.actor, d, "archive", rows[0]) }} />
      {selected && (
        <details open className="card card-pad">
          <summary>
            {String(selected[d.titleField] ?? selected.id)} <span className="tiny muted">v{String(selected.version)}</span>
          </summary>
          {canEdit ? <EntityForm slug={t.slug} table={table} back={`${t.here}?id=${selected.id}`} row={selected as Row} /> : <Result value={selected} />}
        </details>
      )}
      {canCreate && (
        <details className="card card-pad">
          <summary>New {d.label.toLowerCase()}</summary>
          <EntityForm slug={t.slug} table={table} back={t.here} />
        </details>
      )}
    </section>
  );
}

function Bespoke({ t, tab }: { t: T; tab: string }) {
  try {
    switch (tab) {
      case "registration":
        return <Registration t={t} />;
      case "tenant-admin":
        return hasAny(t.actor, ["admin"]) ? <AdminConsole t={t} /> : null;
      case "ai-control":
        return <AiControl t={t} />;
      case "status-board":
        return <StatusBoard t={t} />;
      case "tenant-console":
        return <TenantConsole t={t} />;
      case "connectors":
        return hasAny(t.actor, ["admin"]) ? <Connectors t={t} /> : null;
      case "cloud-lab":
        return <CloudLab t={t} />;
      case "groups":
        return t.sp.setId ? <GroupSet t={t} /> : null;
      case "observers":
        return <Observers t={t} />;
      case "helpdesk":
        return <Helpdesk t={t} />;
      case "program-studio":
        return <ProgramStudio t={t} />;
      case "parity-status":
        return <ParityStatus t={t} />;
      case "module-library":
        return <ModuleLibrary t={t} />;
      case "assessment-studio":
        return <AssessmentStudio t={t} />;
      case "agentic-cloud-labs":
        return <AgenticLabsPanel t={t} />;
      case "proctor-support":
        return <ProctorPanel store={t.store} actor={t.actor} slug={t.slug} sp={t.sp} here={t.here} />;
      case "catalog":
        return (
          <p className="notice notice-info">
            The public catalog is generated from this data: <a href={`/campus/${t.slug}/catalog`}>open the catalog page</a>.
          </p>
        );
      case "dashboard":
        return (
          <p>
            <a className="btn btn-primary btn-sm" href={`/campus/${t.slug}/dashboard`}>
              Open my dashboard
            </a>
          </p>
        );
      case "operations":
        return <Result value={opsOverview(t.actor)} />;
      default:
        return null;
    }
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
}

function Registration({ t }: { t: T }) {
  const terms = t.store.list("terms").filter((x) => String(x.registrationCloses) >= new Date().toISOString());
  const mine = t.store.list("registrations", (r) => r.userId === t.actor.id);
  const isStudent = Object.values(t.actor.courseRoles).some((r) => r.includes("student")) || !hasAny(t.actor, ["admin", "registrar"]);
  return (
    <section className="card card-pad stack">
      <h2 className="card-title">Register for classes</h2>
      {terms.map((term) => (
        <div key={term.id} className="stack">
          <h3 className="small">
            {String(term.name)} · registration {fmt(term.registrationOpens)} – {fmt(term.registrationCloses)}
          </h3>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Course</th>
                  <th scope="col">Meets</th>
                  <th scope="col">Can I register?</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {t.store
                  .list("sections", (s) => s.termId === term.id)
                  .map((s) => {
                    const v = isStudent ? validateRegistration(t.store, t.actor.id, s.id) : null;
                    const blocked = v?.checks.filter((x) => !x.ok) ?? [];
                    return (
                      <tr key={s.id}>
                        <td>{String(s.code)}</td>
                        <td>{String(t.store.get("courses", String(s.courseId))?.title ?? "")}</td>
                        <td>{String(s.meetingPattern ?? "—")}</td>
                        <td>{v ? (blocked.length ? <span className="small">{blocked.map((b) => b.message).join(" ")}</span> : v.full ? "Waitlist only" : "Yes") : "—"}</td>
                        <td>
                          {v && !blocked.length && (
                            <form method="post" action={api(t.slug, "a/registration.register")}>
                              <Hidden values={{ back: t.here, sectionId: s.id, idempotencyKey: `ui:${t.actor.id}:${s.id}` }} />
                              <button className="btn btn-primary btn-sm" type="submit">
                                {v.full ? "Join waitlist" : "Register"}
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
          {isStudent && (
            <form method="get" action={t.here}>
              <Hidden values={{ run: "ai.registration_guide", termId: term.id }} />
              <button className="btn btn-ghost btn-sm" type="submit">
                Ask the registration guide (explains each rule)
              </button>
            </form>
          )}
        </div>
      ))}
      {mine.length > 0 && (
        <>
          <h3 className="small">My registrations</h3>
          <ul className="item-list">
            {mine.map((r) => (
              <li key={r.id}>
                {String(t.store.get("sections", String(r.sectionId))?.code ?? "")} — <Chip s={String(r.state)} />
                {r.state === "registered" && (
                  <form method="post" action={api(t.slug, "a/registration.drop")} className="inline">
                    <Hidden values={{ back: t.here, registrationId: r.id }} />
                    <button className="btn btn-ghost btn-sm" type="submit">
                      Drop
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function AdminConsole({ t }: { t: T }) {
  const o = adminOverview(t.store, t.actor);
  const accountId = t.sp.accountId ?? `acc_${t.slug}_root`;
  const matrix = permissionMatrix(t.store, accountId);
  const roles = matrix.roles;
  return (
    <div className="stack">
      <section className="card card-pad">
        <h2 className="card-title">{o.tenant.name}</h2>
        <p className="small">
          {o.counts.users} users · {o.counts.courses} courses ({o.counts.publishedCourses} published) · {o.counts.activeEnrollments} active enrollments · outbox {o.outbox.pending} pending / {o.outbox.dead} dead
        </p>
        <p className="small">
          Domains: {o.tenant.domains.map((d) => `${d.host}${d.verified ? " ✓" : " (unverified)"}`).join(", ")} · Realm: {o.tenant.realm.protocol}, staff MFA {o.tenant.realm.mfaRequiredForStaff ? "required" : "optional"}
        </p>
      </section>
      <section className="card card-pad stack">
        <h2 className="card-title">Permissions</h2>
        <form method="get" className="row">
          <label htmlFor="pm-acc">Account</label>
          <select id="pm-acc" name="accountId" defaultValue={accountId}>
            {t.store.list("accounts").map((a) => (
              <option key={a.id} value={a.id}>
                {String(a.name)}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" type="submit">
            Show
          </button>
        </form>
        <div className="table-wrap" role="region" aria-label="Permission matrix" tabIndex={0}>
          <table className="table campus-matrix">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {roles.map((r) => (
                  <th scope="col" key={r}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((p) => (
                <tr key={p.key}>
                  <th scope="row">{p.label}</th>
                  {p.cells.map((cv) => (
                    <td key={cv.role}>
                      <form method="post" action={api(t.slug, "a/permissions.set")} className="inline">
                        <Hidden values={{ back: `${t.here}?accountId=${accountId}`, accountId, role: cv.role, permission: p.key, enabled: cv.enabled ? "false" : "true" }} />
                        <button className="btn btn-ghost btn-sm" type="submit" aria-label={`${cv.enabled ? "Disable" : "Enable"} ${p.label} for ${cv.role}`} disabled={!!cv.lockedAt && cv.lockedAt !== accountId}>
                          {cv.enabled ? "✓" : "—"}
                          {cv.lockedAt ? " 🔒" : ""}
                        </button>
                      </form>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">🔒 = locked by a parent account; sub-accounts can't change it. Use the action below to lock.</p>
        <OpForm slug={t.slug} op={OPERATIONS["permissions.set"]} back={t.here} label="Set (and optionally lock) a permission" />
      </section>
      <section className="card card-pad stack">
        <h2 className="card-title">Act as a user</h2>
        <p className="small muted">You'll see exactly what they see. Every action is recorded with your name. Requires two-step sign-in.</p>
        <form method="post" action={api(t.slug, "auth/masquerade")} className="stack">
          <Hidden values={{ back: `/campus/${t.slug}/dashboard` }} />
          <div className="field">
            <label htmlFor="mq-user">User</label>
            <select id="mq-user" name="userId" required>
              {t.store
                .list("users", (u) => u.id !== t.actor.id && !u.testStudentOf)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)} ({String(u.email)})
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mq-reason">Reason</label>
            <input id="mq-reason" name="reason" required minLength={5} />
          </div>
          <button className="btn btn-outline btn-sm" type="submit">
            Act as user
          </button>
        </form>
      </section>
      <div className="grid g2">
        <section className="card card-pad">
          <h2 className="card-title">Branding</h2>
          <OpForm slug={t.slug} op={OPERATIONS["admin.theme"]} back={t.here} values={{ primary: o.tenant.theme.primary, accent: o.tenant.theme.accent, logoText: o.tenant.theme.logoText }} />
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Feature flags</h2>
          <ul className="item-list">
            {Object.entries(o.tenant.flags).map(([k, v]) => (
              <li key={k}>
                {k}: {v ? "on" : "off"}
              </li>
            ))}
          </ul>
          <OpForm slug={t.slug} op={OPERATIONS["admin.flag"]} back={t.here} />
        </section>
      </div>
      <section className="card card-pad">
        <h2 className="card-title">Recent audit</h2>
        <Result value={t.store.auditLog(25).map((a) => ({ at: fmt(a.at, true), actor: a.actorId, realActor: a.realActorId ?? "", action: a.action, resource: a.resource, outcome: a.outcome }))} />
      </section>
    </div>
  );
}

function AiControl({ t }: { t: T }) {
  const queue = reviewQueue(t.store, t.actor, { state: "pending" });
  return (
    <div className="stack">
      {hasAny(t.actor, ["admin"]) && (
        <section className="card card-pad">
          <h2 className="card-title">Agents</h2>
          <Result value={controlCenter(t.store, t.actor).map((a) => ({ agent: a.name, enabled: a.enabled, policy: a.policy ? `${a.policy.label} v${a.policy.version}` : "none", lastEval: a.lastEval ? (a.lastEval.passed ? "passed" : "FAILED") : "—", requests: a.requests, refusals: a.refusals, pendingDrafts: a.pendingDrafts }))} />
          <p className="tiny muted">Model: local extractive retrieval — no external model is called. Policies go live only after their evaluation run passes.</p>
        </section>
      )}
      <section className="card card-pad stack">
        <h2 className="card-title">AI drafts waiting for review</h2>
        {queue.length ? (
          queue.map((q) => (
            <article key={q.id} className="card card-pad">
              <h3 className="small">{String(q.summary)}</h3>
              <details>
                <summary className="small">Draft</summary>
                <pre className="code tiny campus-json" tabIndex={0}>{JSON.stringify(q.draft, null, 2).slice(0, 4000)}</pre>
              </details>
              <div className="row">
                <form method="post" action={api(t.slug, "a/ai.review")}>
                  <Hidden values={{ back: t.here, draftId: q.id, decision: "approve" }} />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Approve
                  </button>
                </form>
                <form method="post" action={api(t.slug, "a/ai.review")}>
                  <Hidden values={{ back: t.here, draftId: q.id, decision: "reject" }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </article>
          ))
        ) : (
          <Empty title="Nothing waiting." />
        )}
      </section>
    </div>
  );
}

function StatusBoard({ t }: { t: T }) {
  const board = capabilityBoard(t.store);
  const counts = board.reduce<Record<string, number>>((m, b) => ({ ...m, [b.status]: (m[b.status] ?? 0) + 1 }), {});
  return (
    <section className="card card-pad stack">
      <p className="row">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k}>
            <Chip s={k} /> {v}
          </span>
        ))}
      </p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Area</th>
              <th scope="col">Capability</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence</th>
              <th scope="col">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {board.map((b, i) => (
              <tr key={i}>
                <td>{b.area}</td>
                <td>{b.capability}</td>
                <td>
                  <Chip s={b.status} />
                </td>
                <td className="small">{b.evidence}</td>
                <td className="small">{b.blockers ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TenantConsole({ t }: { t: T }) {
  const o = opsOverview(t.actor);
  const licenses = broker.platform().licenses ?? [];
  return (
    <div className="stack">
      <section className="card card-pad">
        <h2 className="card-title">Tenants</h2>
        <Result value={o.tenants.map((x) => ({ name: x.name, slug: x.slug, kind: x.kind, status: x.status, type: broker.platform().meta?.[x.id]?.type ?? "", region: broker.platform().meta?.[x.id]?.region ?? "", host: x.domains[0]?.host ?? "" }))} />
      </section>
      <section className="card card-pad">
        <h2 className="card-title">Templates</h2>
        <ul className="item-list">
          {Object.entries(TENANT_TEMPLATES).map(([k, v]) => (
            <li key={k}>
              <strong>{v.label}</strong> — {v.description}
            </li>
          ))}
        </ul>
      </section>
      <section className="card card-pad">
        <h2 className="card-title">Content licenses</h2>
        <Result value={licenses.map((l) => ({ id: l.id, from: `${l.sourceTenantId}/${l.sourceCourseId}`, to: `${l.targetTenantId}/${l.targetCourseId}`, syncs: l.syncs, lastSync: fmt(l.lastSyncAt, true) }))} />
      </section>
      <section className="card card-pad">
        <h2 className="card-title">De-identified platform metrics</h2>
        <Result value={platformMetrics(t.actor)} />
      </section>
      <section className="card card-pad">
        <h2 className="card-title">SLOs</h2>
        <Result value={o.slos.current} />
      </section>
    </div>
  );
}

function Connectors({ t }: { t: T }) {
  return (
    <section className="card card-pad stack">
      {connectorList(t.store, t.actor).map((c) => (
        <article key={c.key} className="between campus-connector">
          <div>
            <strong>{c.name}</strong> <Chip s={c.status} />
            <p className="small muted">{c.note}</p>
          </div>
          {c.external && (
            <form method="post" action={api(t.slug, "a/connectors.configure")} className="row">
              <Hidden values={{ back: t.here, key: c.key }} />
              <label className="sr-only" htmlFor={`cn-${c.key}`}>
                Mode for {c.name}
              </label>
              <select id={`cn-${c.key}`} name="mode" defaultValue={c.status === "SIMULATED" ? "simulated" : "disabled"}>
                <option value="disabled">Disabled</option>
                <option value="simulated">Simulated (staging)</option>
                <option value="connected">Connected</option>
              </select>
              <label className="check small">
                <input type="checkbox" name="consent" value="true" /> Institution consent recorded
              </label>
              <button className="btn btn-outline btn-sm" type="submit">
                Save
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}

function CloudLab({ t }: { t: T }) {
  const sessions = t.store.list("lab_sessions", (s) => s.userId === t.actor.id && (!t.sp.assignmentId || s.assignmentId === t.sp.assignmentId)).sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
  const s = sessions[0];
  if (!s) return t.sp.assignmentId ? <Empty title="No lab session yet.">Open the lab from the assignment.</Empty> : null;
  const tpl = t.store.get("lab_templates", String(s.templateId));
  const back = `${t.here}?assignmentId=${s.assignmentId}`;
  const keys = t.store.list("lab_keys", (k) => k.userId === t.actor.id && k.assignmentId === s.assignmentId && !k.revokedAt);
  return (
    <section className="card card-pad stack campus-lab">
      <h2 className="card-title">{String(tpl?.title ?? "Lab")}</h2>
      <p className="small">{String(tpl?.instructions ?? "")}</p>
      <p className="tiny muted">
        Image {String(tpl?.image ?? "python (pinned)")} · runner {process.env.CLOUDLAB_LOCAL_RUNNER === "1" ? "local sandbox (time/memory limits, no network)" : "not connected in this environment"} · state <Chip s={String(s.state)} />
        {s.score !== null && s.score !== undefined ? ` · last score ${String(s.score)} (sent to the gradebook unposted)` : ""}
      </p>
      {s.state === "launched" ? (
        <form method="post" action={api(t.slug, "a/lab.open")}>
          <Hidden values={{ back, assignmentId: String(s.assignmentId) }} />
          <button className="btn btn-primary btn-sm" type="submit">
            Open lab
          </button>
        </form>
      ) : (
        <form method="post" action={api(t.slug, "a/lab.submit")} className="stack">
          <Hidden values={{ back, sessionId: s.id, show_result: "1" }} />
          <label htmlFor="lab-code">Code</label>
          <textarea id="lab-code" name="code" rows={14} className="mono" defaultValue={String(s.code ?? "")} spellCheck={false} />
          <button className="btn btn-primary btn-sm" type="submit">
            Run hidden tests and submit
          </button>
        </form>
      )}
      {s.similarity ? <p className="tiny muted">Similarity signal: {String((s.similarity as { maxPct: number }).maxPct)}% (signal only; a person decides).</p> : null}
      <div className="row">
        <a className="btn btn-ghost btn-sm" href={`${t.here}?run=lab.notebook&templateId=${s.templateId}&which=starter`}>
          Starter notebook (.ipynb)
        </a>
        <form method="post" action={api(t.slug, "a/lab_keys.issue")}>
          <Hidden values={{ back, assignmentId: String(s.assignmentId), show_result: "1" }} />
          <button className="btn btn-ghost btn-sm" type="submit">
            {keys.length ? "Replace my lab API key" : "Get a lab API key"}
          </button>
        </form>
      </div>
      {keys.map((k) => (
        <p key={k.id} className="tiny muted">
          Key: spent {String(k.spentCents)}¢ of {String(k.spendCapCents)}¢ · expires {fmt(k.expiresAt, true)}
        </p>
      ))}
      {t.sp.run === "lab.notebook" && tpl ? <p className="tiny">Notebook file name: {labNotebook(t.store, t.actor, tpl.id, "starter").filename}</p> : null}
    </section>
  );
}

function GroupSet({ t }: { t: T }) {
  const v = groupSetView(t.store, t.actor, String(t.sp.setId));
  const back = `${t.here}?setId=${t.sp.setId}`;
  return (
    <section className="card card-pad stack">
      <h2 className="card-title">{String(v.set.name)}</h2>
      <ul className="item-list">
        {v.groups.map((g) => (
          <li key={g.id}>
            <strong>{g.name}</strong> ({g.size}
            {g.maxSize ? `/${g.maxSize}` : ""}) {g.members.map((m) => m.name).join(", ")}{" "}
            {v.set.selfSignup && (
              <form method="post" action={api(t.slug, g.mine ? "a/groups.leave" : "a/groups.join")} className="inline">
                <Hidden values={{ back, groupId: g.id }} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  {g.mine ? "Leave" : "Join"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {v.unassigned.length > 0 && <p className="small">Unassigned: {v.unassigned.map((u) => u.name).join(", ")}</p>}
    </section>
  );
}

function Observers({ t }: { t: T }) {
  const mine = myObservees(t.store, t.actor);
  if (!mine.length) return null;
  return (
    <section className="card card-pad">
      <h2 className="card-title">Students I observe</h2>
      <ul className="item-list">
        {mine.map((m) => (
          <li key={m.linkId}>
            <a href={`${t.here}?run=privacy.observer_summary&studentId=${m.studentId}`}>{m.name}</a> {m.alerts > 0 && <span className="badge badge-amber">{m.alerts} alert(s)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Helpdesk({ t }: { t: T }) {
  const mine = myTickets(t.store, t.actor);
  return (
    <section className="card card-pad stack">
      <h2 className="card-title">My requests</h2>
      {mine.length ? (
        <ul className="item-list">
          {mine.map((x) => (
            <li key={x.id}>
              <a href={`${t.here}?run=helpdesk.ticket&ticketId=${x.id}`}>{String(x.subject)}</a> <Chip s={String(x.status ?? "open")} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">You haven't asked for help yet.</p>
      )}
    </section>
  );
}

function ProgramStudio({ t }: { t: T }) {
  const ov = studioOverview(t.store, t.actor);
  const pages = new Map(programIndex(t.store).map((p) => [p.code, p.slug]));
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="ps-h">
        <h2 id="ps-h" className="card-title">
          Program design packages
        </h2>
        <p className="small">Status is computed from what is actually loaded: complete / drafted / needs SME review / blocked / not started.</p>
        {ov.programs.map((p) => (
          <details key={p.code} className="card card-pad">
            <summary>
              <strong>
                {p.code} {p.title}
              </strong>{" "}
              <span className="badge">overall: {p.overall}</span>
            </summary>
            <p className="small">
              {pages.get(p.code) ? (
                <>
                  <a href={`/campus/${t.slug}/programs/${pages.get(p.code)}`}>Public page</a> · <a href={`/api/campus/v1/t/${t.slug}/programs/${pages.get(p.code)}/brochure.pdf`}>Brochure PDF</a>
                </>
              ) : (
                "Page not published"
              )}
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label={`${p.code} deliverables`}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Deliverable</th>
                    <th scope="col">Status</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((i) => (
                    <tr key={i.deliverable}>
                      <td>{i.deliverable}</td>
                      <td>{i.status}</td>
                      <td className="small">{i.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="small">Quality gate</h3>
            <ul className="small">
              {p.gate.map((g) => (
                <li key={g.gate}>
                  {g.ok ? "✓" : "✗"} {g.gate} <span className="muted">({g.detail})</span>
                </li>
              ))}
            </ul>
            <h3 className="small">Risks</h3>
            <ul className="small">
              {p.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      {(ov.applications.length > 0 || ov.inquiries.length > 0) && (
        <section className="card card-pad stack" aria-labelledby="ps-q">
          <h2 id="ps-q" className="card-title">
            Applications and inquiries
          </h2>
          <ul className="item-list">
            {ov.applications.map((a) => (
              <li key={String(a.id)}>
                {String(a.program)} <Chip s={String(a.state)} />
              </li>
            ))}
            {ov.inquiries.map((q) => (
              <li key={String(q.id)}>
                {String(q.kind) === "team" ? "Team inquiry" : "Advisor call"}: {String(q.name)} {q.organization ? `(${String(q.organization)})` : ""} <span className="tiny muted">{fmt(q.createdAt)}</span>
              </li>
            ))}
          </ul>
          {ov.selfChecks && (
            <p className="small">
              Prerequisite self-checks: {ov.selfChecks.passed} passed of {ov.selfChecks.total}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function ModuleLibrary({ t }: { t: T }) {
  const rep = consolidationReport(t.store, t.actor);
  const isOwner = hasAny(t.actor, ["admin"]);
  const policies = t.store.list("catalog_policies", () => true);
  const reports = t.store.list("consolidation_reports", () => true).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const libRows = t.store.list("library_modules", () => true);
  const libCount = (key: string) => libRows.find((r) => r.key === key);
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="ml-pol">
        <h2 id="ml-pol" className="card-title">
          Refund, deferral and batch-change policies
        </h2>
        <p className="small">Learner pages show a policy only while it is approved. A policy sent back for revision disappears from learner pages until it is approved again.</p>
        <ul className="item-list">
          {policies.map((p) => (
            <li key={String(p.id)} className="stack">
              <p>
                <strong>{String(p.kind).replace("_", " ")}</strong> <Chip s={p.approvedAt ? "published" : "draft"} />
              </p>
              <p className="small">{String(p.text)}</p>
              <p className="tiny muted">
                Window {String(p.windowDays)} days · processing {String(p.processingDays)} business days · escalation {String(p.escalationContact)}
                {p.approvedAt ? ` · approved ${fmt(p.approvedAt)}` : ""}
              </p>
              {p.approvalNote ? <p className="tiny">{String(p.approvalNote)}</p> : null}
              {isOwner && !!p.approvedAt && (
                <form method="post" action={api(t.slug, "a/policies.reopen")} className="row">
                  <Hidden values={{ back: t.here, policyId: String(p.id), notice: "Policy sent back to draft; learner pages say it's being finalized until you approve it again." }} />
                  <label className="small">
                    Reason <input name="reason" required maxLength={300} />
                  </label>
                  <button className="btn btn-sm" type="submit">
                    Send back for revision
                  </button>
                </form>
              )}
              {isOwner && !p.approvedAt && (
                <form method="post" action={api(t.slug, "a/policies.approve")}>
                  <Hidden values={{ back: t.here, policyId: String(p.id), notice: "Policy approved — it now shows on program pages." }} />
                  <button className="btn btn-primary btn-sm" type="submit">
                    Approve {String(p.kind).replace("_", " ")} policy
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad stack" aria-labelledby="ml-lib">
        <h2 id="ml-lib" className="card-title">
          Shared module library ({LIBRARY.length})
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Library modules">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col">Version</th>
                <th scope="col">Used by</th>
                <th scope="col">Frameworks</th>
                <th scope="col">Loaded</th>
              </tr>
            </thead>
            <tbody>
              {LIBRARY.map((l) => (
                <tr key={l.key}>
                  <td>{l.title}</td>
                  <td>{l.version}</td>
                  <td className="small">{l.usedBy.join(", ")}</td>
                  <td className="small">{l.dualFramework ? "PyTorch + TensorFlow" : "—"}</td>
                  <td>{libCount(l.key) ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="ml-rep">
        <h2 id="ml-rep" className="card-title">
          Catalog consolidation report
        </h2>
        <p className="small">
          {rep.scope}. {rep.programs.length} programs, {rep.overlaps.length} overlaps of 40% or more, {rep.mergeOrRetire.length} merge-or-retire candidates.
        </p>
        <form method="post" action={api(t.slug, "a/catalog.consolidation_submit")}>
          <Hidden values={{ back: t.here, notice: "Report submitted for product-owner approval." }} />
          <button className="btn btn-primary btn-sm" type="submit">
            Submit report for approval
          </button>
        </form>
        {reports.length > 0 && (
          <ul className="item-list" aria-label="Submitted reports">
            {reports.map((r) => (
              <li key={String(r.id)} className="stack">
                <p>
                  Report {String(r.id)} <Chip s={String(r.state)} /> <span className="tiny muted">{fmt(r.createdAt)}</span>
                  {r.decisionNote ? <span className="small"> — {String(r.decisionNote)}</span> : null}
                </p>
                {isOwner && r.state === "submitted" && (
                  <form method="post" action={api(t.slug, "a/catalog.consolidation_decide")} className="row">
                    <Hidden values={{ back: t.here, reportId: String(r.id), notice: "Decision recorded." }} />
                    <label className="small">
                      Decision{" "}
                      <select name="decision">
                        <option value="approved">Approve</option>
                        <option value="changes_requested">Request changes</option>
                      </select>
                    </label>
                    <label className="small">
                      Note <input name="note" maxLength={500} />
                    </label>
                    <button className="btn btn-sm" type="submit">
                      Record decision
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <h3 className="small">Overlaps</h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Program overlaps">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Program A</th>
                <th scope="col">Program B</th>
                <th scope="col">Overlap</th>
                <th scope="col">Recorded relation</th>
                <th scope="col">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rep.overlaps.map((o) => (
                <tr key={o.a + o.b}>
                  <td className="small">{o.a}</td>
                  <td className="small">{o.b}</td>
                  <td>{o.overlapPct}%</td>
                  <td className="small">{o.relation}</td>
                  <td className="small">{o.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="small">Programs</h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Programs in scope">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Transfers out</th>
                <th scope="col">Stacks into</th>
              </tr>
            </thead>
            <tbody>
              {rep.programs.map((p) => (
                <tr key={p.code}>
                  <td>{p.code}</td>
                  <td className="small">{p.title}</td>
                  <td className="small">{p.type}</td>
                  <td className="small">{p.status}</td>
                  <td className="small">{p.transfersOut.join("; ") || "—"}</td>
                  <td className="small">{p.stacksInto.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          <strong>Referenced but not in the catalog:</strong> {rep.referencedNotInCatalog.join(", ") || "none"}
        </p>
        <p className="small">
          <strong>Proposed:</strong> {rep.proposed.length ? rep.proposed.map((p) => `${p.code} ${p.title} (${p.status})`).join("; ") : "none — every proposed program has been decided"}
        </p>
        <h3 className="small">Decisions recorded</h3>
        <ul className="small">
          {rep.decisionsRecorded.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <h3 className="small">Legacy changes</h3>
        <ul className="small">
          {rep.legacyChanges.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <h3 className="small">Decisions pending</h3>
        <ul className="small">
          {rep.decisionsPending.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function slotPaths(v: unknown, base = ""): string[] {
  if (typeof v === "string") return v.includes("[SME:") ? [base] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => slotPaths(x, `${base}.${i}`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => slotPaths(x, base ? `${base}.${k}` : k));
  return [];
}

function Tree({ v, depth = 0 }: { v: unknown; depth?: number }) {
  if (v === null || v === undefined || v === "") return <span className="muted">—</span>;
  if (typeof v !== "object") {
    const s = String(v);
    return s.includes("\n") ? <pre className="small mono">{s}</pre> : <span className={s.includes("[SME:") ? "campus-sme" : undefined}>{s}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x)) && depth > 0) return <Result value={v} />;
    return (
      <ul className="small">
        {v.map((x, i) => (
          <li key={i}>
            <Tree v={x} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="campus-dl small">
      {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
        <div key={k}>
          <dt>{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt>
          <dd>
            <Tree v={x} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AssessmentStudio({ t }: { t: T }) {
  const programs = assess.studioPrograms(t.store);
  const prog = programs.find((p) => p.offeringId === t.sp.program) ?? null;
  const drafts = assess.draftsList(t.store, t.actor, prog?.offeringId);
  const view = t.sp.draft ? (() => {
    try {
      return assess.draftView(t.store, t.actor, t.sp.draft!, t.sp.edition === "student" ? "student" : "instructor");
    } catch {
      return null;
    }
  })() : null;
  const api1 = `/api/campus/v1/t/${t.slug}`;
  const slots = view ? slotPaths({ student: view.student, instructor: view.instructor }) : [];
  const scen = simScenarios();
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="as-gen">
        <h2 id="as-gen" className="card-title">
          Generate for a module
        </h2>
        <p className="small">Everything generated is labelled “AI DRAFT — requires SME and instructional-designer approval”. Parts that need expert writing are marked [SME] and block approval until filled. Publishing creates unpublished course items for an instructor to schedule.</p>
        <form method="get" action={t.here} className="row">
          <label className="small">
            Program{" "}
            <select name="program" defaultValue={prog?.offeringId ?? ""}>
              <option value="">Choose…</option>
              {programs.map((p) => (
                <option key={p.offeringId} value={p.offeringId}>
                  {p.code} {p.title}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost btn-sm" type="submit">
            Choose
          </button>
        </form>
        {prog && (
          <form method="post" action={api(t.slug, "a/assess.generate")} className="row">
            <Hidden values={{ back: `${t.here}?program=${prog.offeringId}`, offeringId: prog.offeringId, result_param: "draft", notice: "Draft generated." }} />
            <label className="small">
              Module{" "}
              <select name="week">
                {prog.weeks.map((w) => (
                  <option key={w.week} value={w.week}>
                    {w.week}: {w.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="small">
              Generate{" "}
              <select name="kind">
                {assess.KINDS.map((k) => (
                  <option key={k} value={k}>
                    {assess.KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="small">
              Quiz items <input name="n" type="number" min={5} max={30} defaultValue={10} style={{ width: "5em" }} />
            </label>
            <button className="btn btn-primary btn-sm" type="submit">
              Generate draft
            </button>
          </form>
        )}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Four Project Pillars">
          <table className="table">
            <caption className="small">Four Project Pillars — intensity by type</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Problem</th>
                <th scope="col">Constraints</th>
                <th scope="col">Tools</th>
                <th scope="col">Definition of done</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(assess.PILLARS).map(([k, p]) => (
                <tr key={k}>
                  <td>{assess.KIND_LABEL[k as assess.DraftKind] ?? k}</td>
                  <td className="small">{p.problem}</td>
                  <td className="small">{p.constraints}</td>
                  <td className="small">{p.tools}</td>
                  <td className="small">{p.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad stack" aria-labelledby="as-sim">
        <h2 id="as-sim" className="card-title">
          Simulated labs and demo apps
        </h2>
        <p className="small">Each scenario has a Student Lab (worksheet of 10 questions, no answers), an Instructor Lab (INSTRUCTOR MODE banner, answer keys, control panel, Switch to Student View) and a Simulated Application Demo of a working agent for class.</p>
        <ul className="item-list">
          {scen.map((s) => (
            <li key={s.key}>
              <strong>{s.title}</strong> <span className="tiny muted">{s.org} · fits {s.programs.join(", ")}</span>
              <br />
              <a href={`${api1}/sim-labs/${s.key}/student.html`}>Student Lab</a> · <a href={`${api1}/sim-labs/${s.key}/instructor.html`}>Instructor Lab</a> · <a href={`${api1}/sim-labs/${s.key}/app.html`}>Application Demo</a> · <a href={`${api1}/sim-labs/${s.key}/student.html?download=1`}>download</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad stack" aria-labelledby="as-drafts">
        <h2 id="as-drafts" className="card-title">
          Drafts{prog ? ` — ${prog.code}` : ""}
        </h2>
        {drafts.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Drafts">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Draft</th>
                  <th scope="col">State</th>
                  <th scope="col">[SME] slots</th>
                  <th scope="col">Approvals</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td className="small">{d.title}</td>
                    <td>
                      <Chip s={d.state} />
                    </td>
                    <td>{d.smeSlots}</td>
                    <td className="small">
                      SME {d.sme ? "✓" : "—"} · Designer {d.designer ? "✓" : "—"}
                    </td>
                    <td className="small">
                      <a href={`${t.here}?${prog ? `program=${prog.offeringId}&` : ""}draft=${d.id}`}>Instructor edition</a> · <a href={`${t.here}?${prog ? `program=${prog.offeringId}&` : ""}draft=${d.id}&edition=student`}>Student edition</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No drafts yet.">Choose a program and module above.</Empty>
        )}
      </section>

      {view && (
        <section className="card card-pad stack" aria-labelledby="as-view">
          <h2 id="as-view" className="card-title">
            {String(view.title)} — {t.sp.edition === "student" ? "student edition" : "instructor edition"}
          </h2>
          <p className="draft-label">{String(view.label)}</p>
          <FacultyCard compact note="Lab guides, worksheets, cover slides and video title cards carry this approved photo." />
          {(() => {
            const cv = (view.context as { covers?: { slide: string; titleCard: string } }).covers;
            return cv ? (
              <p className="small">
                <a href={`${api1}/${cv.slide}`}>Lecture cover slide</a> · <a href={`${api1}/${cv.titleCard}`}>Video title card</a>
              </p>
            ) : null;
          })()}
          <div className="row">
            {view.kind === "quiz" && (
              <>
                <a className="btn btn-ghost btn-sm" href={`${api1}/assess/${view.id}/item-bank.json`}>
                  Item bank JSON
                </a>
                <a className="btn btn-ghost btn-sm" href={`${api1}/assess/${view.id}/qti.xml`}>
                  QTI 2.1 export
                </a>
              </>
            )}
            {(["sme", "id"] as const).map((as) => (
              <form key={as} method="post" action={api(t.slug, "a/assess.approve")}>
                <Hidden values={{ back: `${t.here}?draft=${view.id}`, id: String(view.id), as, notice: as === "sme" ? "SME approval recorded." : "Designer approval recorded." }} />
                <button className="btn btn-sm" type="submit">
                  Approve as {as === "sme" ? "SME" : "instructional designer"}
                </button>
              </form>
            ))}
            <form method="post" action={api(t.slug, "a/assess.publish")}>
              <Hidden values={{ back: `${t.here}?draft=${view.id}`, id: String(view.id), notice: "Published into the course (unpublished for scheduling)." }} />
              <button className="btn btn-primary btn-sm" type="submit" disabled={view.state !== "approved"}>
                Publish to course
              </button>
            </form>
          </div>
          {slots.length > 0 && view.state !== "published" && (
            <details>
              <summary className="small">Fill {slots.length} [SME] slot(s)</summary>
              <form method="post" action={api(t.slug, "a/assess.fill")} className="stack">
                <Hidden values={{ back: `${t.here}?draft=${view.id}`, id: String(view.id), notice: "Saved. Approvals were cleared so the new text gets reviewed." }} />
                <label className="small" htmlFor="as-patch">
                  JSON of path → text (replace each placeholder with expert content)
                </label>
                <textarea id="as-patch" name="patch" rows={10} className="mono" defaultValue={JSON.stringify(Object.fromEntries(slots.slice(0, 40).map((p) => [p, ""])), null, 2)} />
                <button className="btn btn-sm" type="submit">
                  Save content
                </button>
              </form>
            </details>
          )}
          <h3 className="small">Context header</h3>
          <Tree v={view.context} />
          {view.blueprint ? (
            <>
              <h3 className="small">Blueprint</h3>
              <Result value={view.blueprint} />
            </>
          ) : null}
          <h3 className="small">Alignment</h3>
          <Result value={view.alignment} />
          <h3 className="small">Student edition</h3>
          <Tree v={view.student} />
          {view.instructor ? (
            <>
              <h3 className="small">Instructor edition</h3>
              <Tree v={view.instructor} />
            </>
          ) : null}
        </section>
      )}
    </>
  );
}

function AgenticLabsPanel({ t }: { t: T }) {
  const labs = alabs.myLabs(t.store, t.actor).filter((l) => l.role === "staff");
  const sel = labs.find((l) => l.id === t.sp.lab) ?? labs[0];
  const roster = sel ? alabs.labRoster(t.store, t.actor, sel.id) : [];
  let check: { reference: number; starter: number; ok: boolean } | null = null;
  try {
    check = sel && t.sp.verify ? alabs.verifyLab(t.store, t.actor, sel.id) : null;
  } catch {
    check = null;
  }
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="acl-h">
        <h2 id="acl-h" className="card-title">
          Labs you teach
        </h2>
        <p className="small">Agents run autonomously — no approval gates — inside a bounded runner: per-tool allow/deny, per-task call caps, and step and tool-call budgets. Learners get {alabs.DEFAULT_MAX_ATTEMPTS} graded attempts; the best posts to the gradebook with a pass/no-pass mark (pass at {alabs.PASS_MARK}).</p>
        {labs.length ? (
          <nav className="row" aria-label="Labs">
            {labs.map((l) => (
              <a key={l.id} className="btn btn-ghost btn-sm" aria-current={sel?.id === l.id ? "page" : undefined} href={`${t.here}?lab=${l.id}`}>
                {l.title.replace(/^Agentic Cloud Lab: /, "")}
              </a>
            ))}
          </nav>
        ) : (
          <Empty title="No labs in courses you teach." />
        )}
      </section>
      {sel && (
        <section className="card card-pad stack" aria-labelledby="acl-r">
          <div className="between">
            <h2 id="acl-r" className="card-title">
              {sel.title} — {sel.course}
            </h2>
            <span className="row">
              <a className="btn btn-sm" href={`/campus/${t.slug}/agent-labs/${sel.id}`}>
                Open workspace
              </a>
              <a className="btn btn-ghost btn-sm" href={`${t.here}?lab=${sel.id}&verify=1`}>
                Verify reference vs starter
              </a>
            </span>
          </div>
          {check && (
            <p className={`notice ${check.ok ? "notice-ok" : "notice-warn"}`} role="status">
              Reference agent {check.reference}/100 · starter {check.starter}/100 — {check.ok ? "lab is calibrated" : "check the lab"}
            </p>
          )}
          {roster.length ? (
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Learner roster">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Practice runs</th>
                    <th scope="col">Graded attempts</th>
                    <th scope="col">Best</th>
                    <th scope="col">Violations</th>
                    <th scope="col">Run log</th>
                    <th scope="col">Extra attempt</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.name}</td>
                      <td>{r.practiceRuns}</td>
                      <td>
                        {r.attemptsUsed} / {r.allowed}
                      </td>
                      <td>{r.best === null ? "—" : r.best}</td>
                      <td>{r.violations}</td>
                      <td>{r.lastRunId ? <a href={`/campus/${t.slug}/agent-labs/${sel.id}?run=${r.lastRunId}`}>Latest</a> : "—"}</td>
                      <td>
                        <form method="post" action={api(t.slug, "a/agentlabs.grant_attempt")} className="row">
                          <Hidden values={{ back: `${t.here}?lab=${sel.id}`, labId: sel.id, userId: r.userId, notice: "Extra attempt granted." }} />
                          <label className="sr-only" htmlFor={`gr-${r.userId}`}>
                            Reason
                          </label>
                          <input id={`gr-${r.userId}`} name="reason" required placeholder="Reason" maxLength={300} />
                          <button className="btn btn-ghost btn-sm" type="submit">
                            Grant
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No learners enrolled yet." />
          )}
        </section>
      )}
    </>
  );
}

function ParityStatus({ t }: { t: T }) {
  const s = paritySummary();
  const filter = t.sp.status as "DONE" | "PARTIAL" | "NOT_STARTED" | undefined;
  const rows = PARITY.filter((r) => !filter || r.status === filter);
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="par-h">
        <h2 id="par-h" className="card-title">
          Parity summary
        </h2>
        <p>
          <strong>{s.done}</strong> done · <strong>{s.partial}</strong> partial · <strong>{s.notStarted}</strong> not started — {s.total} features ({s.closedThisBuild} closed in the latest build).
        </p>
        <nav className="row" aria-label="Filter by status">
          {[undefined, "DONE", "PARTIAL", "NOT_STARTED"].map((st) => (
            <a key={st ?? "all"} className="btn btn-ghost btn-sm" aria-current={filter === st ? "page" : undefined} href={st ? `${t.here}?status=${st}` : t.here}>
              {st ? st.replace("_", " ").toLowerCase() : "all"}
            </a>
          ))}
        </nav>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Parity by section">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Done</th>
                <th scope="col">Partial</th>
                <th scope="col">Not started</th>
              </tr>
            </thead>
            <tbody>
              {s.sections.map((x) => (
                <tr key={x.section}>
                  <td>
                    {x.section} {x.title}
                  </td>
                  <td>{x.done}</td>
                  <td>{x.partial}</td>
                  <td>{x.notStarted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card-pad stack" aria-labelledby="par-f">
        <h2 id="par-f" className="card-title">
          Features {filter ? `(${filter.replace("_", " ").toLowerCase()})` : ""}
        </h2>
        <div className="table-wrap campus-parity" tabIndex={0} role="region" aria-label="Feature parity">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Feature</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
                <th scope="col">Gap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.section + r.feature}>
                  <td>{SECTION_TITLES[r.section] ?? r.section}</td>
                  <td>{r.feature}</td>
                  <td>
                    <Chip s={r.status === "DONE" ? "published" : r.status === "PARTIAL" ? "pending" : "locked"} /> <span className="tiny">{r.status.replace("_", " ")}</span>
                  </td>
                  <td className="tiny">{r.evidence}</td>
                  <td className="tiny">{r.gap || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card-pad stack" aria-labelledby="par-a">
        <h2 id="par-a" className="card-title">
          Acceptance tests (15/15 passing in CI)
        </h2>
        <ol>
          {s.acceptance.map((x) => (
            <li key={x.n}>
              {x.test} <span className="tiny muted">{x.file}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
