import { broker, type Tenant, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { catalogHub, offeringCard, quote, recommend, RECOMMENDER_QUESTIONS, evaluatePathway } from "../../services/academy";
import { verifyCredential } from "../../services/success";
import { DEMO_PASSWORD } from "../../seed";
import { api, Chip, Denied, Empty, fmt, Flash, Hidden } from "../kit";

type SP = Record<string, string | undefined>;

export function TenantPicker() {
  const tenants = broker.tenants().filter((t) => t.kind !== "validation" && t.status === "active");
  return (
    <main id="main" className="container campus-public-main">
      <p className="dev-banner tiny" role="note">
        Staging · demonstration data · sandbox payments only
      </p>
      <h1 className="page-title">Scholarion Campus</h1>
      <p className="lede">Multi-tenant SIS + LMS + ERP. Each school below has its own isolated data, sign-in and branding.</p>
      <ul className="grid g3">
        {tenants.map((t) => (
          <li key={t.id} className="card card-pad" style={{ borderTop: `6px solid ${t.theme.primary}` }}>
            <h2 className="card-title">
              <a href={`/campus/${t.slug}`}>{t.name}</a>
            </h2>
            <p className="small muted">
              {t.kind === "internal" ? "Internal tenant" : (broker.platform().meta?.[t.id]?.type ?? "university").replace(/^./, (c) => c.toUpperCase()) + " tenant"} · {t.domains[0]?.host}
            </p>
            <p className="row">
              <a className="btn btn-primary btn-sm" href={`/campus/${t.slug}/signin`}>
                Sign in
              </a>
              <a className="btn btn-ghost btn-sm" href={`/campus/${t.slug}/catalog`}>
                Catalog
              </a>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function TenantHome({ tenant, store }: { tenant: Tenant; store: TenantStore }) {
  const hub = catalogHub(store);
  return (
    <>
      <h1 className="page-title">{tenant.name}</h1>
      <p className="lede">{tenant.kind === "internal" ? "Internal learning and placement for TechDev Institution staff and students." : "Courses, programs and services for learners — demonstration site."}</p>
      <p className="row">
        <a className="btn btn-primary" href={`/campus/${tenant.slug}/signin`}>
          Sign in
        </a>
        {hub.items.length > 0 && (
          <a className="btn btn-outline" href={`/campus/${tenant.slug}/catalog`}>
            Browse {hub.items.length} programs
          </a>
        )}
      </p>
    </>
  );
}

export function SigninView({ tenant, sp }: { tenant: Tenant; sp: SP }) {
  const mfa = sp.mfa === "1";
  const staging = process.env.NODE_ENV !== "production" || process.env.CAMPUS_SHOW_DEMO_ACCOUNTS === "1";
  return (
    <div className="grid g2">
      <section className="card card-pad stack" aria-labelledby="si-h">
        <h1 id="si-h" className="page-title">
          Sign in to {tenant.name}
        </h1>
        <Flash sp={sp} />
        <form method="post" action={api(tenant.slug, "auth/signin")} className="stack">
          <Hidden values={{ next: sp.next ?? `/campus/${tenant.slug}/dashboard` }} />
          <div className="field">
            <label htmlFor="si-email">Email</label>
            <input id="si-email" name="email" type="email" autoComplete="username" required defaultValue={sp.email ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="si-pw">Password</label>
            <input id="si-pw" name="password" type="password" autoComplete="current-password" required />
          </div>
          <div className="field">
            <label htmlFor="si-code">Two-step code {mfa ? "" : "(staff)"}</label>
            <input id="si-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required={mfa} aria-describedby="si-code-hint" />
            <span id="si-code-hint" className="hint">
              {mfa ? "This account needs the 6-digit code from your authenticator app." : "Admins, registrars and support staff enter their 6-digit authenticator code."}
            </span>
          </div>
          <button className="btn btn-primary" type="submit">
            Sign in
          </button>
        </form>
        <p className="tiny muted">Realm: {tenant.realm.protocol.toUpperCase()} ({tenant.realm.issuer}) — federation is simulated in staging; this form signs in to the tenant's local realm.</p>
      </section>
      {staging && (
        <section className="card card-pad" aria-labelledby="demo-h">
          <h2 id="demo-h" className="card-title">
            Demo accounts (staging only)
          </h2>
          <p className="small">
            Password for all: <code>{DEMO_PASSWORD}</code>. Staff with two-step sign-in use the demo authenticator secret <code>JBSWY3DPEHPK3PXP</code> (any TOTP app).
          </p>
          <ul className="item-list small">
            {["admin", "registrar", "advisor", "support", "designer", "instructor", "ta", "student1", "student2", "parent"].map((k) => (
              <li key={k}>
                <code>
                  {k}@{tenant.slug}.scholarion.test
                </code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function CatalogView({ tenant, store, actor, sp }: { tenant: Tenant; store: TenantStore; actor: Actor | null; sp: SP }) {
  const slug = tenant.slug;
  const here = `/campus/${slug}/catalog`;
  if (sp.offering) return <OfferingView tenant={tenant} store={store} actor={actor} sp={sp} />;
  const hub = catalogHub(store, { type: sp.type, level: sp.level, skill: sp.skill, q: sp.q, maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined, compare: sp.compare ? sp.compare.split(",") : undefined });
  const answers = Object.fromEntries(RECOMMENDER_QUESTIONS.map((q) => [q.id, sp[`r_${q.id}`] ?? ""]).filter(([, v]) => v));
  const rec = Object.keys(answers).length ? recommend(store, answers) : null;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hub.structuredData).replace(/</g, "\\u003c") }} />
      <h1 className="page-title">{tenant.name} catalog</h1>
      <Flash sp={sp} />
      <div className="with-aside">
        <section aria-label="Programs">
          <form method="get" className="row campus-filters" role="search">
            <label className="sr-only" htmlFor="cat-q">
              Search programs
            </label>
            <input id="cat-q" name="q" defaultValue={sp.q} placeholder="Search programs" />
            <label className="sr-only" htmlFor="cat-type">
              Type
            </label>
            <select id="cat-type" name="type" defaultValue={sp.type ?? ""}>
              <option value="">All types</option>
              {hub.facets.type.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.count})
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="cat-level">
              Level
            </label>
            <select id="cat-level" name="level" defaultValue={sp.level ?? ""}>
              <option value="">All levels</option>
              {hub.facets.level.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="cat-skill">
              Skill
            </label>
            <select id="cat-skill" name="skill" defaultValue={sp.skill ?? ""}>
              <option value="">All skills</option>
              {hub.facets.skill.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" type="submit">
              Filter
            </button>
          </form>
          {hub.items.length ? (
            <ul className="grid g2 campus-catalog">
              {hub.items.map((o) => (
                <li key={o.id} className="card card-pad">
                  <p className="tiny muted">
                    {o.code} · {o.typeLabel} · {o.level ?? "all levels"}
                    {o.hours ? ` · ~${o.hours} h` : ""}
                  </p>
                  <h2 className="card-title">
                    <a href={`${here}?offering=${o.id}`}>{o.title}</a>
                  </h2>
                  <p className="small">{o.summary}</p>
                  <p className="small">
                    <strong>
                      {o.currency} {o.price}
                    </strong>{" "}
                    {o.earlyBird && <span className="badge badge-gold">early-bird (list {o.listPrice})</span>} {o.inPlus && <span className="badge badge-blue">in subscription</span>} {o.selfPaced && <span className="badge">self-paced</span>}
                  </p>
                  {o.nextCohort && (
                    <p className="tiny">
                      Next cohort {fmt(o.nextCohort.startsAt)} ({o.nextCohort.timeZone}) · {o.nextCohort.seatsLeft} seats left · registration closes {fmt(o.nextCohort.closesAt)}
                    </p>
                  )}
                  <p className="tiny muted">Aid: {o.aidEligible ? "eligible (approved)" : "not eligible for federal aid (non-credit)"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No programs match." />
          )}
          {hub.comparison.length > 1 && (
            <section className="card card-pad">
              <h2 className="card-title">Compare</h2>
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">—</th>
                      {hub.comparison.map((c) => (
                        <th key={c.id} scope="col">
                          {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(hub.comparison[0].rows).map((k) => (
                      <tr key={k}>
                        <th scope="row">{k}</th>
                        {hub.comparison.map((c) => (
                          <td key={c.id}>{String((c.rows as Record<string, unknown>)[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {hub.edges.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">Learning paths</h2>
              <ul className="item-list">
                {hub.edges.map((e, i) => (
                  <li key={i}>
                    {String(e.from)} → <em>{String(e.kind).replace("_", " ")}</em> → {String(e.to)}
                    {e.moduleKey ? ` (${e.moduleKey})` : ""}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="small">Diagram source (Mermaid)</summary>
                <pre className="code tiny">{hub.diagram}</pre>
              </details>
            </section>
          )}
          <form method="get" className="row">
            <label htmlFor="cat-compare">Compare (pick two or more)</label>
            <select id="cat-compare" name="compare" multiple size={Math.min(hub.items.length, 6)}>
              {hub.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} {o.title}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" type="submit">
              Compare
            </button>
          </form>
        </section>
        <aside className="card card-pad stack" aria-labelledby="rec-h">
          <h2 id="rec-h" className="card-title">
            Find your program
          </h2>
          <form method="get" className="stack">
            {RECOMMENDER_QUESTIONS.map((q) => (
              <div className="field" key={q.id}>
                <label htmlFor={`r-${q.id}`}>{q.text}</label>
                <select id={`r-${q.id}`} name={`r_${q.id}`} defaultValue={sp[`r_${q.id}`] ?? ""}>
                  <option value="">—</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button className="btn btn-primary btn-sm" type="submit">
              Recommend
            </button>
          </form>
          {rec?.top && (
            <div className="notice notice-ok" role="status">
              <strong>
                <a href={`${here}?offering=${rec.top.offering.id}`}>
                  {rec.top.offering.code} {rec.top.offering.title}
                </a>
              </strong>
              <ul className="small">
                {rec.top.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {rec.alternatives.length > 0 && <p className="tiny">Also consider: {rec.alternatives.map((a) => a.offering.code).join(", ")}</p>}
            </div>
          )}
          {rec && !rec.top && <p className="small">No match yet — try different answers.</p>}
        </aside>
      </div>
    </>
  );
}

function OfferingView({ tenant, store, actor, sp }: { tenant: Tenant; store: TenantStore; actor: Actor | null; sp: SP }) {
  const o = store.get("offerings", String(sp.offering));
  if (!o || o.state !== "published") return <Denied message="This program isn't available." />;
  const card = offeringCard(store, o);
  const here = `/campus/${tenant.slug}/catalog?offering=${o.id}`;
  let q: ReturnType<typeof quote> | null = null;
  let qErr = "";
  try {
    q = quote(store, { offeringId: o.id, coupon: sp.coupon || undefined, plan: (sp.plan as "full") || "full", installments: sp.installments ? Number(sp.installments) : undefined });
  } catch (e) {
    qErr = (e as Error).message;
  }
  const path = actor ? evaluatePathway(store, actor.id, o.id) : null;
  const cohorts = store.list("offering_sections", (s) => s.offeringId === o.id && String(s.registrationClosesAt) > new Date().toISOString());
  return (
    <article className="stack">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={`/campus/${tenant.slug}/catalog`}>Catalog</a> › <span aria-current="page">{card.code}</span>
      </nav>
      <h1 className="page-title">
        {card.code} {card.title}
      </h1>
      <Flash sp={sp} />
      <p className="lede">{card.summary}</p>
      <p className="small">
        {card.typeLabel} · {card.level ?? "all levels"} · {card.hours ? `~${card.hours} hours` : ""} · skills: {card.skills.join(", ")}
      </p>
      <div className="grid g2">
        <section className="card card-pad stack">
          <h2 className="card-title">Price (sandbox)</h2>
          <form method="get" className="row">
            <input type="hidden" name="offering" value={o.id} />
            <label htmlFor="of-coupon">Coupon</label>
            <input id="of-coupon" name="coupon" defaultValue={sp.coupon} />
            <label htmlFor="of-plan">Plan</label>
            <select id="of-plan" name="plan" defaultValue={sp.plan ?? "full"}>
              <option value="full">Pay in full</option>
              <option value="installments">Installments</option>
            </select>
            <button className="btn btn-ghost btn-sm" type="submit">
              Update quote
            </button>
          </form>
          {qErr && <p className="notice notice-err">{qErr}</p>}
          {q && (
            <dl className="campus-dl">
              <dt>Price</dt>
              <dd>
                {q.currency} {q.price} {q.earlyBird && "(early-bird)"}
              </dd>
              <dt>Discount</dt>
              <dd>{q.discount}</dd>
              <dt>Tax</dt>
              <dd>
                {q.tax} <span className="tiny muted">({q.taxNote})</span>
              </dd>
              <dt>Total</dt>
              <dd>
                <strong>
                  {q.currency} {q.total}
                </strong>
              </dd>
              {q.schedule.length > 1 && (
                <>
                  <dt>Installments</dt>
                  <dd>{q.schedule.map((s) => `${s.due}: ${s.amount}`).join(" · ")}</dd>
                </>
              )}
            </dl>
          )}
          {path && !path.allowed && <p className="notice notice-warn">{path.blockers.join(" ")}</p>}
          {path?.waivedModules.length ? <p className="notice notice-info small">Waived for you: {path.waivedModules.map((w) => `${w.moduleKey} (${w.because})`).join("; ")}</p> : null}
          {actor ? (
            <form method="post" action={api(tenant.slug, "a/commerce.checkout")} className="stack">
              <Hidden values={{ back: `/campus/${tenant.slug}/dashboard`, offeringId: o.id, coupon: sp.coupon, plan: sp.plan ?? "full", idempotencyKey: `ui:${actor.id}:${o.id}`, notice: "Enrolled (sandbox purchase)." }} />
              {cohorts.length > 0 && (
                <div className="field">
                  <label htmlFor="of-cohort">Cohort</label>
                  <select id="of-cohort" name="sectionId">
                    {cohorts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {String(s.code)} · starts {fmt(s.startsAt)} · {Math.max(0, Number(s.capacity) - Number(s.seatsTaken ?? 0))} seats left
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="of-card">Sandbox payment token</label>
                <input id="of-card" name="sandboxCard" defaultValue="tok_sandbox_visa" />
                <span className="hint">Never enter a real card — this is a sandbox.</span>
              </div>
              <button className="btn btn-primary" type="submit" disabled={!!path && !path.allowed}>
                Enroll (sandbox checkout)
              </button>
            </form>
          ) : (
            <a className="btn btn-primary" href={`/campus/${tenant.slug}/signin?next=${encodeURIComponent(here)}`}>
              Sign in to enroll
            </a>
          )}
        </section>
        <section className="card card-pad">
          <h2 className="card-title">What you'll earn</h2>
          <p className="small">{o.credentialTemplateId ? String(store.get("credential_templates", String(o.credentialTemplateId))?.wording ?? "") : "A record of completion."}</p>
          <p className="tiny muted">Credentials are Open Badges 3.0 / W3C Verifiable Credentials, verifiable on this site. No accreditation is claimed.</p>
        </section>
      </div>
    </article>
  );
}

export function VerifyView({ tenant, store, id }: { tenant: Tenant; store: TenantStore; id: string }) {
  const v = verifyCredential(store, id) as Record<string, unknown> & { status: string };
  return (
    <section className="card card-pad stack" aria-labelledby="ver-h">
      <h1 id="ver-h" className="page-title">
        Credential verification
      </h1>
      <p>
        Status: <Chip s={v.status === "valid" ? "active" : v.status} /> <strong>{v.status.replace("_", " ")}</strong>
      </p>
      {v.status !== "not_found" && (
        <dl className="campus-dl">
          <dt>Credential</dt>
          <dd>{String(v.title ?? "")}</dd>
          <dt>Issuer</dt>
          <dd>{String(v.issuer ?? tenant.name)}</dd>
          {v.holder ? (
            <>
              <dt>Holder</dt>
              <dd>{String(v.holder)}</dd>
            </>
          ) : null}
          {v.issuedAt ? (
            <>
              <dt>Issued</dt>
              <dd>{fmt(v.issuedAt)}</dd>
            </>
          ) : null}
          {v.achievement ? (
            <>
              <dt>Criteria</dt>
              <dd>{String((v.achievement as { criteria?: string }).criteria ?? "")}</dd>
            </>
          ) : null}
          {v.revokedAt ? (
            <>
              <dt>Revoked</dt>
              <dd>
                {fmt(v.revokedAt)} {v.reason ? `(${String(v.reason)})` : ""}
              </dd>
            </>
          ) : null}
        </dl>
      )}
      <p className="tiny muted">Checked against the issuer's signing key. Only fields the holder agreed to share are shown.</p>
    </section>
  );
}
