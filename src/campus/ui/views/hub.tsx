import type { Tenant, TenantStore } from "../../core";
import { agenticHub, HUB_QUIZ, hubRecommend, type HubFilters } from "../../services/hub";
import { api, Chip, Empty, Hidden } from "../kit";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Agentic AI Courses & Certifications — the catalog hub page. Everything renders from the catalog. */
export function AgenticHubView({ tenant, store, sp }: { tenant: Tenant; store: TenantStore; sp: SP }) {
  const f: HubFilters = {
    tab: one(sp.tab),
    track: one(sp.track),
    level: one(sp.level),
    coding: one(sp.coding) as HubFilters["coding"],
    duration: one(sp.duration),
    format: one(sp.format),
    credential: one(sp.credential),
    skill: one(sp.skill),
    access: one(sp.access),
    q: one(sp.q),
    compare: many(sp.compare),
  };
  const h = agenticHub(store, f);
  const here = `/campus/${tenant.slug}/agentic-ai`;
  const answers = Object.fromEntries(HUB_QUIZ.map((q) => [q.id, one(sp[`ans_${q.id}`])]).filter(([, v]) => !!v)) as Record<string, string>;
  const quizDone = Object.keys(answers).length >= 3;
  const rec = quizDone ? hubRecommend(store, answers) : null;
  const tabHref = (t?: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (k !== "tab" && k !== "compare" && v) u.set(k, String(v));
    if (t) u.set("tab", t);
    const s = u.toString();
    return `${here}${s ? `?${s}` : ""}#programs`;
  };
  const sel = (name: keyof HubFilters, label: string, opts: { value: string; label: string }[]) => (
    <label className="stack small">
      {label}
      <select name={name} defaultValue={String(f[name] ?? "")}>
        <option value="">Any</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <article className="stack campus-program campus-hub" aria-labelledby="hub-title">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(h.structuredData).replace(/</g, "\\u003c") }} />
      {one(sp.notice) && (
        <p className="notice notice-ok" role="status">
          {one(sp.notice)}
        </p>
      )}
      {one(sp.error) && (
        <p className="notice notice-err" role="alert">
          {one(sp.error)}
        </p>
      )}
      <header className="card card-pad stack campus-program-hero">
        <p className="eyebrow">Scholaris AI Academy</p>
        <h1 id="hub-title" className="page-title">
          {h.title}
        </h1>
        {h.intro.map((p, i) => (
          <p key={i} className={i === 0 ? "lead" : ""}>
            {p}
          </p>
        ))}
        <div className="row">
          <a className="btn btn-primary" href="#programs">
            Browse {h.total} programs
          </a>
          <a className="btn" href="#quiz">
            Which program is right for me?
          </a>
          <a className="btn" href="#teams">
            Train a team
          </a>
        </div>
      </header>

      <section aria-labelledby="hub-rails" className="stack">
        <h2 id="hub-rails" className="card-title">
          Where to start
        </h2>
        {h.rails.map((r) => (
          <div key={r.key} className="stack">
            <h3 className="card-title">{r.title}</h3>
            <ul className="campus-rail" aria-label={r.title}>
              {r.items.map((c) => (
                <li key={c!.id} className="card card-pad stack">
                  <p className="tiny muted">
                    {c!.code} · {c!.typeLabel}
                  </p>
                  {c!.href ? <a href={c!.href}>{c!.title}</a> : <span>{c!.title}</span>}
                  <p className="tiny">{c!.durationText}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section id="programs" aria-labelledby="hub-progs" className="stack">
        <h2 id="hub-progs" className="card-title">
          Programs
        </h2>
        <nav className="campus-hub-tabs" aria-label="Program types">
          <a className={`btn btn-sm${!f.tab ? " btn-primary" : ""}`} href={tabHref()} aria-current={!f.tab ? "page" : undefined}>
            All ({h.total})
          </a>
          {h.tabs.map((t) => (
            <a key={t.key} className={`btn btn-sm${f.tab === t.key ? " btn-primary" : ""}`} href={tabHref(t.key)} aria-current={f.tab === t.key ? "page" : undefined}>
              {t.label} ({t.count})
            </a>
          ))}
        </nav>
        <form method="get" action={`${here}#programs`} className="card card-pad stack" aria-label="Filter programs">
          {f.tab && <input type="hidden" name="tab" value={f.tab} />}
          <div className="campus-hub-filters">
            <label className="stack small">
              Search
              <input type="search" name="q" defaultValue={f.q ?? ""} />
            </label>
            {sel("track", "Track", h.facets.track.map((t) => ({ value: t, label: t })))}
            {sel("level", "Level", h.facets.level.map((l) => ({ value: l, label: sentence(l) })))}
            {sel("coding", "Coding required", [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No coding" },
            ])}
            {sel("duration", "Duration", h.facets.duration)}
            {sel("format", "Format", h.facets.format)}
            {sel("credential", "Credential", h.facets.credential)}
            {sel("skill", "Skill", h.facets.skill.map((s) => ({ value: s, label: s })))}
            {sel("access", "Access", h.facets.access)}
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit">
              Apply filters
            </button>
            <a className="btn btn-sm" href={`${here}#programs`}>
              Clear
            </a>
          </div>
        </form>
        <p className="small muted" role="status">
          Showing {h.items.length} of {h.total}.
        </p>
        {h.items.length ? (
          <form method="get" action={`${here}#compare`}>
            <ul className="grid g2 campus-cards" aria-label="Matching programs">
              {h.items.map((c) => (
                <li key={c.id} className="card card-pad stack">
                  <p className="tiny muted">
                    {c.code} · {c.typeLabel} · {c.track}
                    {c.isNew ? " · New" : ""}
                  </p>
                  <h3 className="card-title">{c.href ? <a href={c.href}>{c.title}</a> : c.title}</h3>
                  <p className="small">{c.summary}</p>
                  <p className="tiny">
                    {c.durationText} · {c.formatKind.replace(/_/g, " ")} · {c.codingRequired ? "Coding" : "No coding"} · {c.level ? sentence(c.level) : "All levels"}
                  </p>
                  <p className="tiny">
                    Credential: {c.credential} · Access: {c.accessModels.join(", ")} · {c.currency} {c.price} <span className="muted">(sandbox)</span>
                  </p>
                  {c.transfers.length > 0 && <p className="tiny">Transfers into {c.transfers.join(", ")}</p>}
                  {c.skillTags.length > 0 && (
                    <p className="tiny">
                      {c.skillTags.map((s) => (
                        <span key={s} className="badge">
                          {s}
                        </span>
                      ))}
                    </p>
                  )}
                  <label className="tiny">
                    <input type="checkbox" name="compare" value={c.id} defaultChecked={f.compare?.includes(c.id)} /> Compare
                  </label>
                </li>
              ))}
            </ul>
            <button className="btn btn-sm" type="submit">
              Compare selected (up to 4)
            </button>
          </form>
        ) : (
          <Empty title="No programs match these filters.">Try clearing a filter or two.</Empty>
        )}
      </section>

      {h.comparison.length > 0 && (
        <section id="compare" aria-labelledby="hub-cmp" className="card card-pad stack">
          <h2 id="hub-cmp" className="card-title">
            Comparison
          </h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Selected programs compared</caption>
              <thead>
                <tr>
                  <th scope="col">Attribute</th>
                  {h.comparison.map((c) => (
                    <th key={c.id} scope="col">
                      {c.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(h.comparison[0].rows).map((k) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    {h.comparison.map((c) => (
                      <td key={c.id}>{String((c.rows as Record<string, string>)[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="hub-paths" className="card card-pad stack">
        <h2 id="hub-paths" className="card-title">
          Learning paths
        </h2>
        <p className="small muted">Each path shows only programs that are in the catalog today.</p>
        {h.paths.map((p) => (
          <div key={p.key} className="stack">
            <h3 className="card-title">{p.title}</h3>
            <ol className="campus-path" aria-label={p.title}>
              {p.steps.map((s) => (
                <li key={s.code}>{s.href ? <a href={s.href}>{`${s.code} ${s.title}`}</a> : `${s.code} ${s.title}`}</li>
              ))}
            </ol>
            {p.note && <p className="tiny muted">{p.note}</p>}
          </div>
        ))}
        <details>
          <summary className="small">Path diagram (Mermaid source)</summary>
          <pre className="small" aria-label="Learning path diagram source">
            {h.diagram}
          </pre>
        </details>
      </section>

      <section id="quiz" aria-labelledby="hub-quiz" className="card card-pad stack">
        <h2 id="hub-quiz" className="card-title">
          Which program is right for me?
        </h2>
        <p className="small muted">Nine quick questions. Answer at least three; we explain every recommendation.</p>
        {rec && (
          <div className="card card-pad stack" role="status" aria-live="polite">
            {rec.top ? (
              <>
                <p>
                  <strong>Our suggestion:</strong> {rec.top.offering.href ? <a href={rec.top.offering.href}>{`${rec.top.offering.code} ${rec.top.offering.title}`}</a> : `${rec.top.offering.code} ${rec.top.offering.title}`}
                </p>
                <ul className="small">
                  {rec.top.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                {rec.alternatives.length > 0 && (
                  <p className="small">
                    Also consider:{" "}
                    {rec.alternatives.map((a, i) => (
                      <span key={a.offering.id}>
                        {i > 0 && ", "}
                        {a.offering.href ? <a href={a.offering.href}>{`${a.offering.code} ${a.offering.title}`}</a> : a.offering.title} ({a.why[0] ?? "a good fit"})
                      </span>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <p>No single program stands out from these answers — talk to an advisor below.</p>
            )}
            <p className="tiny muted">{rec.note}</p>
          </div>
        )}
        <form method="get" action={`${here}#quiz`} className="stack">
          {HUB_QUIZ.map((q) => (
            <fieldset key={q.id} className="stack">
              <legend className="small">
                <strong>{q.text}</strong>
              </legend>
              <div className="row">
                {q.options.map((o) => (
                  <label key={o.value} className="small">
                    <input type="radio" name={`ans_${q.id}`} value={o.value} defaultChecked={answers[q.id] === o.value} /> {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="btn btn-primary" type="submit">
            See my recommendation
          </button>
        </form>
      </section>

      <section aria-labelledby="hub-learn" className="card card-pad stack">
        <h2 id="hub-learn" className="card-title">
          What you'll learn across the catalog
        </h2>
        <ul className="campus-path" aria-label="Topics">
          {h.learnAcross.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hub-cred" className="card card-pad stack">
        <h2 id="hub-cred" className="card-title">
          Credentials explained
        </h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Credential types</caption>
            <thead>
              <tr>
                <th scope="col">Credential</th>
                <th scope="col">From</th>
                <th scope="col">How you earn it</th>
              </tr>
            </thead>
            <tbody>
              {h.credentialTypes.map((c) => (
                <tr key={c.type}>
                  <th scope="row">{c.type}</th>
                  <td>{c.from}</td>
                  <td>{c.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">{h.stacking}</p>
        <form method="get" action={`/campus/${tenant.slug}/verify`} className="row" aria-label="Verify a credential">
          <label className="small">
            Credential ID <input name="id" required />
          </label>
          <button className="btn btn-sm" type="submit">
            Verify
          </button>
        </form>
      </section>

      <section id="teams" aria-labelledby="hub-teams" className="card card-pad stack">
        <h2 id="hub-teams" className="card-title">
          Teams and organizations
        </h2>
        <p className="small">Private cohorts, seat bundles and leadership briefings. Tell us about your team and an advisor will follow up.</p>
        <form method="post" action={api(tenant.slug, "a/programs.inquire")} className="stack">
          <Hidden values={{ back: `${here}#teams`, offeringId: "catalog", kind: "team", notice: "Thanks — an advisor will contact you about team training within 2 business days." }} />
          <div className="campus-hub-filters">
            <label className="stack small">
              Name <input name="name" required autoComplete="name" />
            </label>
            <label className="stack small">
              Work email <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="stack small">
              Organization <input name="organization" />
            </label>
            <label className="stack small">
              Seats <input name="seats" type="number" min={2} max={1000} required />
            </label>
          </div>
          <label className="stack small">
            What should your team be able to do?
            <textarea name="message" rows={3} />
          </label>
          <button className="btn btn-primary" type="submit">
            Send inquiry
          </button>
        </form>
      </section>

      <section aria-labelledby="hub-career" className="card card-pad stack">
        <h2 id="hub-career" className="card-title">
          Career services
        </h2>
        <ul className="small">
          {h.careerServices.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="tiny muted">{h.careerNote}</p>
      </section>

      {h.showSocialProof && (
        <section aria-labelledby="hub-voices" className="card card-pad stack">
          <h2 id="hub-voices" className="card-title">
            Learner voices
          </h2>
          {h.testimonials.map((t) => (
            <blockquote key={t.name + t.quote} className="small">
              “{t.quote}” — {t.name}
            </blockquote>
          ))}
        </section>
      )}

      <section aria-labelledby="hub-faq" className="card card-pad stack">
        <h2 id="hub-faq" className="card-title">
          Frequently asked questions
        </h2>
        {h.faqs.map((q) => (
          <details key={q.q}>
            <summary>{q.q}</summary>
            <p className="small">{q.a}</p>
          </details>
        ))}
        <p className="tiny muted">
          All fees on this staging site are sandbox prices. <Chip s="sandbox" />
        </p>
      </section>
    </article>
  );
}
