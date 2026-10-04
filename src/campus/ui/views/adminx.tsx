import { broker, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { OPERATIONS } from "../../http/ops";
import * as acfg from "../../services/accountcfg";
import { api, Chip, fmt, Hidden, OpForm } from "../kit";

type P = { store: TenantStore; actor: Actor; slug: string; here: string; sp: Record<string, string | undefined> };

/** Admin Console additions: filtered audit and sign-in logs, account settings, themes, background jobs, IdPs, sub-account admins. */
export function AccountAdminPanel({ store, actor, slug, here, sp }: P) {
  const filters = { type: sp.au_type, courseId: sp.au_course, userId: sp.au_user, outcome: sp.au_outcome, from: sp.au_from, to: sp.au_to, text: sp.au_text };
  const audit = acfg.auditSearch(store, actor, { ...filters, limit: 50 });
  const auth = acfg.authLog(store, actor, { limit: 15 });
  const settings = acfg.accountSettings(store);
  const jobs = acfg.jobStatus(store, actor);
  const pending = store.list("self_registrations", (r) => r.state === "pending");
  const idps = store.list("identity_providers");
  const subAdmins = acfg.accountAdmins(store, actor);
  const theme = broker.tenant(store.tenantId)!.theme;
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="ax-audit">
        <h2 id="ax-audit" className="card-title">
          Audit log
        </h2>
        <form method="get" action={here} className="row wrap" aria-label="Filter the audit log">
          <div className="field">
            <label htmlFor="au-type">Type</label>
            <select id="au-type" name="au_type" defaultValue={filters.type ?? "all"}>
              {acfg.AUDIT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-course">Course</label>
            <select id="au-course" name="au_course" defaultValue={filters.courseId ?? ""}>
              <option value="">Any</option>
              {store.list("courses").map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.code)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-user">User</label>
            <select id="au-user" name="au_user" defaultValue={filters.userId ?? ""}>
              <option value="">Anyone</option>
              {store.list("users").slice(0, 300).map((u) => (
                <option key={u.id} value={u.id}>
                  {String(u.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-outcome">Outcome</label>
            <select id="au-outcome" name="au_outcome" defaultValue={filters.outcome ?? ""}>
              <option value="">Any</option>
              <option value="allowed">allowed</option>
              <option value="denied">denied</option>
              <option value="error">error</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-from">From</label>
            <input id="au-from" name="au_from" type="date" defaultValue={filters.from} />
          </div>
          <div className="field">
            <label htmlFor="au-to">To</label>
            <input id="au-to" name="au_to" type="date" defaultValue={filters.to} />
          </div>
          <div className="field">
            <label htmlFor="au-text">Contains</label>
            <input id="au-text" name="au_text" defaultValue={filters.text} />
          </div>
          <button className="btn btn-outline btn-sm" type="submit">
            Filter
          </button>
          <a className="btn btn-ghost btn-sm" href={`${api(slug, "q/audit.search_export_csv")}${qs ? `?${qs}` : ""}`}>
            Download CSV
          </a>
        </form>
        <p className="tiny muted">
          {audit.total} matching record{audit.total === 1 ? "" : "s"}; showing the newest {Math.min(50, audit.total)}.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit records">
          <table className="table small">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.at, true)}</td>
                  <td>
                    {r.actorName}
                    {r.realActorName && <span className="tiny muted"> (by {r.realActorName})</span>}
                  </td>
                  <td>{r.action}</td>
                  <td className="tiny">{r.resource}</td>
                  <td>
                    <Chip s={r.outcome} />
                    {r.reason && <span className="tiny muted"> {r.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid g2">
        <section className="card card-pad stack" aria-labelledby="ax-auth">
          <h2 id="ax-auth" className="card-title">
            Sign-in log
          </h2>
          <p className="tiny muted">{auth.failures24h} failed sign-in{auth.failures24h === 1 ? "" : "s"} in the last 24 hours.</p>
          <ul className="item-list small">
            {auth.rows.map((r, i) => (
              <li key={i}>
                {fmt(r.at, true)} · {r.who} · {r.action} · <Chip s={r.outcome} /> {r.reason && <span className="tiny muted">{r.reason}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-pad stack" aria-labelledby="ax-jobs">
          <h2 id="ax-jobs" className="card-title">
            Background jobs
          </h2>
          <OpForm slug={slug} op={OPERATIONS["jobs.enqueue_report"]} back={here} label="Queue report" uid="jq" />
          {jobs.length ? (
            <ul className="item-list small">
              {jobs.slice(0, 10).map((j) => (
                <li key={j.id}>
                  {j.kind} {j.detail && `(${j.detail})`} · <Chip s={j.state} /> {j.progress}%
                  {j.resultRef?.startsWith("report_runs/") && (
                    <>
                      {" "}
                      · <a href={`${api(slug, "q/reports.result_export_csv")}?reportId=${j.resultRef.split("/")[1]}`}>download CSV</a>
                    </>
                  )}
                  {j.issues.length > 0 && <span className="tiny muted"> · {j.issues.length} issue(s)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="tiny muted">No jobs yet.</p>
          )}
        </section>
      </div>

      <section className="card card-pad stack" aria-labelledby="ax-settings">
        <h2 id="ax-settings" className="card-title">
          Account settings
        </h2>
        <p className="tiny muted">
          Trusted domains decide which outside sites can be embedded in pages. Quizzes can refer to an IP filter as <code>@Name</code>. Self-registration requests always wait for approval.
        </p>
        <OpForm
          slug={slug}
          op={OPERATIONS["admin.account_settings.set"]}
          back={here}
          uid="as"
          values={{
            trustedDomains: settings.trustedDomains.join("\n"),
            ipFilters: settings.ipFilters.map((f) => `${f.name}: ${f.ranges.join(", ")}`).join("\n"),
            termsUrl: settings.termsUrl ?? "",
            privacyUrl: settings.privacyUrl ?? "",
            selfRegistration: settings.selfRegistration,
            selfRegistrationDomains: settings.selfRegistrationDomains.join("\n"),
          }}
        />
        {pending.length > 0 && (
          <>
            <h3 className="h4">Account requests</h3>
            <ul className="item-list small">
              {pending.map((r) => (
                <li key={r.id} className="row wrap">
                  {String(r.name)} · {String(r.email)}
                  {[true, false].map((ok) => (
                    <form key={String(ok)} method="post" action={api(slug, "a/self_registrations.decide")}>
                      <Hidden values={{ back: here, id: r.id, approve: ok ? "true" : "false", notice: ok ? "Approved — the account was created." : "Declined." }} />
                      <button className={`btn btn-sm ${ok ? "btn-primary" : "btn-ghost"}`} type="submit">
                        {ok ? "Approve" : "Decline"}
                      </button>
                    </form>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid g2">
        <section className="card card-pad stack" aria-labelledby="ax-theme">
          <h2 id="ax-theme" className="card-title">
            Logo image and custom CSS
          </h2>
          <p className="tiny muted">CSS is limited to plain rules, scoped to the campus, with no @-rules, url(), content: or fixed positioning.</p>
          <OpForm slug={slug} op={OPERATIONS["admin.theme_extras"]} back={here} uid="tx" values={{ logoUrl: theme.logoUrl ?? "", customCss: theme.customCss ? theme.customCss.replace(/\.campus-custom /g, "") : "" }} />
        </section>
        <section className="card card-pad stack" aria-labelledby="ax-idp">
          <h2 id="ax-idp" className="card-title">
            Identity providers
          </h2>
          <p className="notice notice-info tiny">Configuration records only. SAML, OIDC and LDAP are not connected in this environment; people sign in with campus passwords and MFA.</p>
          <ul className="item-list small">
            {idps.map((p) => (
              <li key={p.id} className="row wrap">
                {String(p.name)} · {String(p.kind).toUpperCase()} · <Chip s={String(p.state)} />
                <form method="post" action={api(slug, "a/identity_providers.test")}>
                  <Hidden values={{ back: here, id: p.id, notice: "Configuration checked." }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Check configuration
                  </button>
                </form>
                {Boolean(p.lastTest) && <span className="tiny muted">{(p.lastTest as { configComplete: boolean }).configComplete ? "complete" : `missing ${(p.lastTest as { missing: string[] }).missing.join(", ")}`}</span>}
              </li>
            ))}
          </ul>
          <OpForm slug={slug} op={OPERATIONS["identity_providers.configure"]} back={here} uid="idp" label="Save provider" values={{ config: '{"entityId":"","ssoUrl":"https://"}' }} />
        </section>
      </div>

      <section className="card card-pad stack" aria-labelledby="ax-sub">
        <h2 id="ax-sub" className="card-title">
          Sub-account admins
        </h2>
        <p className="tiny muted">A sub-account admin has admin rights only in courses under that account and its sub-accounts.</p>
        <ul className="item-list small">
          {subAdmins.map((g) => (
            <li key={g.id}>
              {g.user} → {g.account}
              {g.expiresAt && <span className="tiny muted"> until {fmt(g.expiresAt)}</span>}
            </li>
          ))}
        </ul>
        <OpForm slug={slug} op={OPERATIONS["roles.grant_account_admin"]} back={here} uid="sa" label="Grant" />
      </section>
    </div>
  );
}
