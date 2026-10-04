import { ReviewsSection, Stars } from "../components/reviews";
import { formatMoney } from "@/platform/pricing";
import { t } from "@/i18n";
import type { aidApplyVM, checkoutVM, educatorVM, exploreVM, homeVM, pathwayVM, productVM, verifyVM, Viewer } from "@/bff/views";
import type { HelpArticle, Product } from "@/platform/types";
import { fmtDate, fmtDateTime, ProductCard, TYPE_LABEL } from "../components/cards";
import { Flash, PublicPage } from "../components/chrome";
import { EnrollModal } from "../components/client/EnrollModal";
import { PricingCalculator } from "../components/client/PricingCalculator";
import { Icon, KIND_ICON } from "../components/icons";
import { BuySeatsPanel } from "./teams";
import type { teamsQuote } from "@/bff/views";

type FlashProps = { notice?: string; error?: string };
const money = (n: number, currency = "USD") => formatMoney(n, currency);

/* ======================= Home ======================= */

export function HomeView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof homeVM> }) {
  return (
    <PublicPage viewer={viewer} current="/">
      <section className="hero" aria-labelledby="hero-title">
        <div className="container">
          <div>
            <div className="eyebrow">{t("home.eyebrow")}</div>
            <h1 id="hero-title">
              Scholarion
              <br />
              <em>AI</em> Academy
            </h1>
            <div className="tag">
              Learn AI. <b>Earn</b> Credentials. Build Your Future.
            </div>
            <p>{t("home.lede")}</p>
            <form className="hero-search" action="/explore" role="search">
              <label htmlFor="hero-q" className="sr-only">
                {t("hdr.search")}
              </label>
              <input id="hero-q" name="q" type="search" placeholder={t("home.searchPh")} />
              <button className="btn btn-primary">{t("home.search")}</button>
            </form>
            <div className="row">
              <a className="btn btn-primary" href="/programs">
                {t("home.explore")} <Icon name="arrow" size={18} />
              </a>
              <a className="btn btn-on-dark" href="/explore?free=1">
                {t("home.free")}
              </a>
            </div>
            <div className="hero-facts">
              <span>
                <strong>{vm.programCount} certificate programs</strong>on four pathways
              </span>
              <span>
                <strong>Flexible learning</strong>self-paced + live
              </span>
              <span>
                <strong>Verifiable credentials</strong>signed, shareable
              </span>
              <span>
                <strong>Real-world projects</strong>&amp; career support
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="glass" style={{ top: 10, right: 0, width: 300 }}>
              <div className="row between small">
                <strong>Mini Lab 2: Working with Functions</strong>
                <span className="badge badge-green">Passed</span>
              </div>
              <pre className="mono tiny" style={{ background: "#0d1530", color: "#dbe4ff", padding: 10, borderRadius: 8, margin: "10px 0 0" }}>{`def format_name(first, last):\n    return f"{last}, {first}"`}</pre>
            </div>
            <div className="glass" style={{ top: 200, left: 0, width: 250 }}>
              <div className="tiny muted">Learning path</div>
              <strong className="small">Foundation → Builder → Advanced</strong>
              <div className="progress" style={{ marginTop: 10 }}>
                <span style={{ width: "62%" }} />
              </div>
            </div>
            <div className="glass" style={{ bottom: 0, right: 30, width: 260, display: "flex", gap: 12, alignItems: "center" }}>
              <span className="seal">VERIFIED</span>
              <span className="small">
                <strong>Certificate of Completion</strong>
                <br />
                <span className="muted tiny">Open Badges 3.0 · scan to verify</span>
              </span>
            </div>
          </div>
        </div>
        <div className="hero-strip">
          <div className="container">
            {[
              ["globe", "Global learning community", "Join learners worldwide"],
              ["chart", "Industry-relevant skills", "Tools, projects, portfolio"],
              ["live", "Learn from anywhere", "On your schedule"],
              ["shield", "Responsible AI", "Ethical, safe, human-centered"],
              ["star", "Make an impact", "People, organizations, communities"],
            ].map(([i, a, b]) => (
              <div className="row" key={a} style={{ flexWrap: "nowrap" }}>
                <Icon name={i} size={26} />
                <span>
                  <strong>{a}</strong>
                  {b}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">Where do you want to go?</h2>
        <p className="lede">Pick a goal and we'll show you a path.</p>
        <div className="grid g3" style={{ marginTop: 20 }}>
          {[
            ["Start a new career", "Job-role certificates with applied projects and a capstone.", "/explore?type=professional_certificate", "award"],
            ["Build AI skills", "From prompt engineering to multi-agent systems.", "/explore?q=ai", "sparkle"],
            ["Learn for free", "Audit eligible courses: videos and readings at no cost.", "/explore?free=1", "book"],
          ].map(([t, d, h, i]) => (
            <a key={t} className="card card-pad" href={h} style={{ textDecoration: "none", color: "inherit" }}>
              <span className="stat">
                <span className="ico">
                  <Icon name={i} />
                </span>
                <span>
                  <strong style={{ fontSize: "1.1rem" }}>{t}</strong>
                  <span className="small muted">{d}</span>
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <Rail title="Free to audit" href="/explore?free=1" items={vm.free} />
      <Rail title="Professional certificates" href="/explore?type=professional_certificate" items={vm.certificates} />
      <Rail title="Agentic AI" href="/explore?q=agentic" items={vm.agentic} />
      <Rail title="Guided projects" href="/explore?type=guided_project" items={vm.guided} />

      <section className="section" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="container">
          <h2 className="section-title">How it works</h2>
          <div className="grid g3" style={{ marginTop: 20 }}>
            {[
              ["1", "Learn", "Short videos with captions and transcripts, readings, and an AI Tutor that answers from your course materials."],
              ["2", "Practice", "Mini labs in the Cloud Lab, scenario quizzes and projects that are graded the moment you submit."],
              ["3", "Earn", "A signed, verifiable credential you can share to LinkedIn — then the next step on your pathway."],
            ].map(([n, t, d]) => (
              <div key={n} className="stack" style={{ ["--gap" as string]: "6px" }}>
                <span className="badge badge-gold">Step {n}</span>
                <h3 style={{ fontFamily: "var(--font-sans)" }}>{t}</h3>
                <p className="muted">{d}</p>
              </div>
            ))}
          </div>
          <a className="btn btn-outline" href="/programs">
            See how the programs stack
          </a>
        </div>
      </section>

      <section className="section container" aria-labelledby="paths-title">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <h2 id="paths-title" className="section-title">
              Learning paths
            </h2>
            <p className="lede" style={{ margin: 0 }}>
              Four pathways. Programs stack from foundations to advanced and leadership certificates. All are non-credit professional training.
            </p>
          </div>
          <a href="/programs">Open the full program map</a>
        </div>
        <PathwayDiagram vm={vm.pathway} />
      </section>

      <section className="section container grid g2">
        <div className="card card-pad">
          <span className="badge badge-blue">Scholarion Plus</span>
          <h2 style={{ marginTop: 10 }}>One subscription, every self-paced program</h2>
          <p className="muted">
            {money(vm.plans.plusMonthly, vm.plans.currency)}/month after a {vm.plans.trialDays}-day free trial, or {money(vm.plans.plusAnnual, vm.plans.currency)}/year. Cancel any time in one step. <span className="tiny">(Sandbox placeholder prices.)</span>
          </p>
          <a className="btn btn-primary" href="/plus">
            Learn about Plus
          </a>
        </div>
        <div className="card card-pad">
          <span className="badge badge-gold">Financial aid</span>
          <h2 style={{ marginTop: 10 }}>Cost shouldn't decide who learns</h2>
          <p className="muted">Apply for up to 100% off a course or program. A person reads every application.</p>
          <a className="btn btn-outline" href="/financial-aid">
            How financial aid works
          </a>
        </div>
      </section>

      <section className="section container">
        <div className="card card-pad row between" style={{ background: "var(--hero)", color: "#fff" }}>
          <div>
            <h2 style={{ color: "#fff", margin: 0 }}>Scholarion for Teams</h2>
            <p style={{ color: "#d5def5", margin: "6px 0 0" }}>Seats, curated academies, SSO and progress reporting for your organization.</p>
          </div>
          <a className="btn btn-gold" href="/teams">
            Request a demo
          </a>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">Questions</h2>
        <div style={{ maxWidth: 760, marginTop: 16 }}>
          {[
            ["Are Scholarion credentials accredited or for college credit?", "No. Scholarion Academy credentials are non-credit professional training certificates. Each one is digitally signed and can be verified by anyone."],
            ["What's free?", "Courses marked “Free to audit” include videos and readings at no cost. Graded work, labs, the AI Tutor and certificates need a paid option or approved financial aid."],
            ["Can I cancel?", "Yes — in one step from Account → Billing. You keep access until the end of the period you paid for and your progress is saved."],
          ].map(([q, a]) => (
            <details key={q} className="acc">
              <summary>{q}</summary>
              <div className="muted">{a}</div>
            </details>
          ))}
        </div>
      </section>
    </PublicPage>
  );
}

function Rail({ title, href, items }: { title: string; href: string; items: Product[] }) {
  if (!items.length) return null;
  return (
    <section className="container" style={{ paddingBottom: 40 }} aria-labelledby={`rail-${title}`}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 id={`rail-${title}`} className="section-title">
          {title}
        </h2>
        <a href={href}>See all</a>
      </div>
      <div className="rail">
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

/* ======================= Explore ======================= */

export function ExploreView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof exploreVM> }) {
  const { filters: f, result: r } = vm;
  const checked = (k: string, v: string) => (k === "type" ? f.type?.includes(v as never) : k === "level" ? f.level?.includes(v as never) : k === "track" ? f.track?.includes(v as never) : false);
  const facet = (k: "type" | "level" | "track", counts: Record<string, number>, label: (v: string) => string) => (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
      <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
        {k === "type" ? "Product type" : k === "level" ? "Level" : "Pathway"}
      </legend>
      {Object.entries(counts).map(([v, n]) => (
        <label key={v} className="check small" style={{ marginBottom: 6 }}>
          <input type="checkbox" name={k} value={v} defaultChecked={checked(k, v)} /> {label(v)} <span className="muted">({n})</span>
        </label>
      ))}
    </fieldset>
  );
  // Multi-select facets (OR within a facet); counts are before that facet's own filter.
  const multi = (name: string, legend: string, counts: Record<string, number>, selected: string[], label: (v: string) => string) =>
    Object.keys(counts).length === 0 && selected.length === 0 ? null : (
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
        <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
          {legend}
        </legend>
        {[...new Set([...selected, ...Object.keys(counts)])].map((v) => (
          <label key={v} className="check small" style={{ marginBottom: 6 }}>
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} /> {label(v)} <span className="muted">({counts[v] ?? 0})</span>
          </label>
        ))}
      </fieldset>
    );
  // Most common skills first; anything already selected always stays visible.
  const topSkills = Object.fromEntries(Object.entries(r.facets.skills).slice(0, 12));
  return (
    <PublicPage viewer={viewer} current="/explore">
      <div className="container section" style={{ paddingTop: 32 }}>
        <h1 className="page-title">{f.q ? `Results for “${f.q}”` : "Explore the catalog"}</h1>
        {r.expandedTerms.length > 0 && <p className="small muted">Also searching: {r.expandedTerms.slice(0, 5).join(", ")}</p>}
        <form method="get" action="/explore" className="two-col" style={{ marginTop: 16 }}>
          <aside className="panel" aria-label="Filters">
            <div className="field">
              <label htmlFor="q">Search</label>
              <input id="q" name="q" type="search" defaultValue={f.q} />
            </div>
            <label className="check small">
              <input type="checkbox" name="free" value="1" defaultChecked={f.freeToAudit} /> Free to audit ({r.facets.freeToAudit})
            </label>
            <label className="check small">
              <input type="checkbox" name="plus" value="1" defaultChecked={f.plusEligible} /> Included in Plus ({r.facets.plusEligible})
            </label>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="format">Format</label>
              <select id="format" name="format" defaultValue={f.format ?? ""}>
                <option value="">Any</option>
                <option value="self_paced">Self-paced</option>
                <option value="live">Live</option>
              </select>
            </div>
            {facet("type", r.facets.type, (v) => TYPE_LABEL[v] ?? v)}
            {facet("level", r.facets.level, (v) => v)}
            {facet("track", r.facets.track, (v) => v)}
            {multi("duration", "Duration", r.facets.duration, f.duration ?? [], (v) => vm.durationLabels[v] ?? v)}
            {multi("skill", "Skills", topSkills, f.skills ?? [], (v) => v)}
            <div className="field">
              <label htmlFor="language">Language</label>
              <select id="language" name="language" defaultValue={f.language ?? ""}>
                <option value="">Any</option>
                {Object.entries(r.facets.language).map(([v, n]) => (
                  <option key={v} value={v}>
                    {v} ({n})
                  </option>
                ))}
              </select>
            </div>
            {multi("subtitles", "Subtitles", r.facets.subtitles, f.subtitles ?? [], (v) => v)}
            <button className="btn btn-primary btn-block">Apply filters</button>
            <a className="btn btn-ghost btn-block" href="/explore" style={{ marginTop: 8 }}>
              Clear
            </a>
          </aside>
          <div>
            <div className="row between" style={{ marginBottom: 12 }}>
              <span className="muted" role="status">
                {r.total} result{r.total === 1 ? "" : "s"}
              </span>
              <span className="row small">
                <label htmlFor="sort" style={{ margin: 0 }}>
                  Sort
                </label>
                <select id="sort" name="sort" defaultValue={f.sort} style={{ width: 160, minHeight: 36 }}>
                  <option value="relevance">Relevance</option>
                  <option value="newest">Newest</option>
                  <option value="shortest">Shortest</option>
                </select>
              </span>
            </div>
            {r.total === 0 ? (
              <div className="panel">
                <h2 style={{ fontSize: "1.2rem" }}>No matches</h2>
                {r.didYouMean && (
                  <p>
                    Did you mean <a href={`/explore?q=${encodeURIComponent(r.didYouMean)}`}>{r.didYouMean}</a>?
                  </p>
                )}
                <p className="muted">Try fewer filters, a broader term, or browse the programs below.</p>
                <a href="/programs">See all programs</a>
              </div>
            ) : (
              <div className="grid g3">
                {r.items.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </div>
        </form>
      </div>
    </PublicPage>
  );
}

/* ======================= Product page ======================= */

export function ProductView({ viewer, vm, flash, openEnroll }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof productVM>>; flash: FlashProps; openEnroll?: boolean }) {
  const p = vm.product;
  const program = p.type !== "course" && p.type !== "guided_project";
  return (
    <PublicPage viewer={viewer}>
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="container" style={{ display: "block", paddingTop: 32, paddingBottom: 32 }}>
          <nav className="crumbs" aria-label="Breadcrumb" style={{ color: "#c9d4f0" }}>
            <a href="/explore" style={{ color: "#dbe4fb" }}>
              Explore
            </a>{" "}
            › {TYPE_LABEL[p.type]}
          </nav>
          <div className="row" style={{ ["--gap" as string]: "8px" }}>
            <span className="badge badge-gold">{TYPE_LABEL[p.type]}</span>
            {p.code && <span className="badge">{p.code}</span>}
            {p.freeToAudit && <span className="badge badge-green">Free to audit</span>}
            {p.plusEligible && <span className="badge badge-blue">Included in Plus</span>}
            {vm.reviews.summary.count > 0 && (
              <a href="#reviews" className="row" style={{ ["--gap" as string]: "6px", color: "#fff", alignItems: "center" }}>
                <Stars rating={vm.reviews.summary.average!} size=".95rem" />
                <span className="small">
                  {vm.reviews.summary.average!.toFixed(1)} ({vm.reviews.summary.count} verified review{vm.reviews.summary.count === 1 ? "" : "s"})
                </span>
              </a>
            )}
          </div>
          <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)", margin: "12px 0 6px" }}>{p.title}</h1>
          <p style={{ fontSize: "1.1rem" }}>{p.tagline}</p>
          <p className="small" style={{ color: "#c9d4f0" }}>
            By{" "}
            <a href={vm.educatorHref} className="on-dark-link">
              {p.educator}
            </a>{" "}
            · {p.level} · {p.durationLabel} · {p.language} · Subtitles: {p.subtitles.join(", ")}
            {vm.reviews.summary.count === 0 ? " · No ratings yet" : ""}
          </p>
        </div>
      </section>
      <div className="container section" style={{ paddingTop: 28 }}>
        <Flash {...flash} />
        <div className="with-aside">
          <div className="stack" style={{ ["--gap" as string]: "28px" }}>
            <section>
              <h2 className="section-title">What you'll learn</h2>
              <ul className="grid g2" style={{ listStyle: "none", padding: 0, ["--gap" as string]: "10px" }}>
                {p.whatYoullLearn.map((w) => (
                  <li key={w} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--green-600)" }}>
                      <Icon name="check" />
                    </span>
                    {w}
                  </li>
                ))}
              </ul>
            </section>
            {vm.guided && <GuidedProjectPanel p={p} g={vm.guided} signedIn={!!viewer} />}
            <section>
              <h2 className="section-title">About</h2>
              <p>{p.description}</p>
              <div className="row" style={{ ["--gap" as string]: "6px" }}>
                {p.skills.map((s) => (
                  <span key={s} className="badge">
                    {s}
                  </span>
                ))}
              </div>
            </section>
            <section className="grid g4">
              {[
                ["Level", p.level],
                ["Time", p.format === "live" ? p.livePlan?.schedule ?? p.durationLabel : `${p.hours} hours · ${vm.pace}`],
                ["Schedule", p.format === "live" ? "Cohort-based, live" : "Flexible — reset deadlines any time"],
                ["Assessments", p.type === "guided_project" ? "Autograded lab" : "Quizzes, labs and projects"],
              ].map(([k, v]) => (
                <div key={k} className="card card-pad small">
                  <div className="muted tiny">{k}</div>
                  <strong>{v}</strong>
                </div>
              ))}
            </section>
            {program && p.roles.length > 0 && (
              <section>
                <h2 className="section-title">Roles this prepares you for</h2>
                <p className="small muted">Skills mapped to these roles. We don't promise job outcomes.</p>
                <div className="row">
                  {p.roles.map((r) => (
                    <span key={r} className="badge badge-blue">
                      {r}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {vm.courses.length > 0 && (
              <section>
                <h2 className="section-title">Course series</h2>
                <ol className="stack">
                  {vm.courses.map((c) => (
                    <li key={c.id}>
                      <a href={`/learn/${c.slug}`}>
                        <strong>
                          {c.code} {c.title}
                        </strong>
                      </a>{" "}
                      <span className="muted small">· {c.hours} hours</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {vm.modules.length > 0 ? (
              <section>
                <h2 className="section-title">Syllabus</h2>
                {vm.modules.map((m) => (
                  <details key={m.no} className="acc">
                    <summary>
                      <span>
                        Module {m.no}: {m.title}
                      </span>
                      <span className="small muted">{m.items.reduce((a, i) => a + i.minutes, 0)} min</span>
                    </summary>
                    <div>
                      <p className="small muted">{m.overview}</p>
                      <ul className="item-list">
                        {m.items.map((i) => (
                          <li key={i.id} className="li small">
                            <span className="kind">
                              <Icon name={KIND_ICON[i.kind]} size={16} />
                            </span>
                            {i.title} <span className="muted">· {i.minutes} min</span>
                            {i.graded && <span className="badge">Graded</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </section>
            ) : (
              program && (
                <section className="panel">
                  <h2 className="section-title">Syllabus</h2>
                  <p className="muted">The detailed module-by-module syllabus for this program is being published. The outline above shows what it covers.</p>
                </section>
              )
            )}
            {vm.sessions.length > 0 && (
              <section>
                <h2 className="section-title">Upcoming cohort</h2>
                <p className="small muted">Each session runs as 40-minute segments with short breaks. Times shown in Eastern Time.</p>
                <ul className="item-list">
                  {vm.sessions.map((s) => (
                    <li key={s.id} className="li small">
                      <span className="kind">
                        <Icon name="live" size={16} />
                      </span>
                      <span>
                        <strong>{s.title}</strong> · {fmtDateTime(s.startsAt)} · {s.segments.length} × {s.segments[0].minutes} min
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(vm.edges.length > 0 || vm.includedIn.length > 0) && (
              <section>
                <h2 className="section-title">Where this fits</h2>
                <ul>
                  {vm.includedIn.map((x) => (
                    <li key={x.id}>
                      Included in <a href={`/learn/${x.slug}`}>{x.title}</a>
                    </li>
                  ))}
                  {vm.edges.map((e, i) => (
                    <li key={i} className="small">
                      {e.type.replace("_", " ")} {e.from === p.id ? "→" : "←"} {e.note ?? ""}
                    </li>
                  ))}
                </ul>
                <a href="/programs">See the full program map</a>
              </section>
            )}
            <section>
              <h2 className="section-title">Credential</h2>
              <div className="certificate" style={{ maxWidth: 520 }}>
                <div className="tiny" style={{ letterSpacing: ".2em" }}>
                  SCHOLARION ACADEMY
                </div>
                <h3>{p.credential.kind === "badge" ? "Digital Badge" : "Certificate of Completion"}</h3>
                <div className="small">{p.credential.title}</div>
                <div className="holder">Your Name</div>
                <div className="tiny muted">Non-credit professional training · digitally signed · verifiable by QR</div>
              </div>
              <ul className="small" style={{ marginTop: 12 }}>
                {p.credential.criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
            <ReviewsSection vm={vm.reviews} slug={p.slug} productId={p.id} signedIn={!!viewer} />
            <section>
              <h2 className="section-title">FAQ</h2>
              {p.faq.map((f) => (
                <details key={f.q} className="acc">
                  <summary>{f.q}</summary>
                  <div className="muted">{f.a}</div>
                </details>
              ))}
            </section>
          </div>
          <aside className="card card-pad sticky-enroll stack" aria-label="Enroll">
            {vm.aidDiscount !== null && (
              <div className="notice notice-ok small" role="status" style={{ margin: 0 }}>
                Your approved financial aid: <strong>{vm.aidDiscount}% off</strong>. It's applied automatically at checkout.
              </div>
            )}
            {vm.guided?.canLaunch && (
              <form method="post" action="/api/v1/labs/launch">
                <input type="hidden" name="productId" value={p.id} />
                <button className="btn btn-primary btn-block">Launch Cloud Lab</button>
              </form>
            )}
            {vm.continueHref ? (
              <>
                <span className={`badge ${vm.access === "full" ? "badge-green" : "badge-blue"}`}>{vm.access === "full" ? "Full access" : vm.access === "audit" ? "Auditing" : "Enrolled"}</span>
                <a className="btn btn-primary btn-block" href={vm.continueHref}>
                  Go to course
                </a>
                {vm.access !== "full" && <EnrollModal productId={p.id} slug={p.slug} offers={vm.offers.filter((o) => o.code !== "audit")} signedIn={!!viewer} label="Upgrade for full access" primary={false} />}
              </>
            ) : (
              <>
                <EnrollModal productId={p.id} slug={p.slug} offers={vm.offers} signedIn={!!viewer} label={p.format === "live" ? "Apply for this cohort" : p.freeToAudit ? "Enroll for free" : "Enroll"} startOpen={openEnroll} />
                <p className="small muted" style={{ margin: 0 }}>
                  {p.freeToAudit ? "Audit free, or choose full access with graded work, labs, the AI Tutor and a certificate." : p.format === "live" ? "Apply, get accepted, then reserve your seat." : `Included in Scholarion Plus. ${vm.plans.trialDays}-day free trial.`}
                </p>
              </>
            )}
            {viewer ? (
              <form method="post" action={vm.saved ? `/api/v1/me/saved/${p.id}/remove` : "/api/v1/me/saved"}>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="back" value={`/learn/${p.slug}`} />
                <button className="btn btn-ghost btn-sm btn-block">
                  <Icon name="star" size={16} /> {vm.saved ? "Saved — remove from My Learning" : "Save for later"}
                </button>
              </form>
            ) : (
              <a className="btn btn-ghost btn-sm btn-block" href={`/login?next=${encodeURIComponent(`/learn/${p.slug}`)}`}>
                Sign in to save for later
              </a>
            )}
            <hr className="divider" style={{ margin: "4px 0" }} />
            <a href={`/financial-aid/apply?product=${p.slug}`} className="small">
              Financial aid available
            </a>
            <div className="tiny muted">Sandbox placeholder prices. No real payments.</div>
          </aside>
        </div>
      </div>
    </PublicPage>
  );
}

/** Guided project specifics: what you'll build, a split-screen preview of the lab workspace, time, prerequisites and launch. */
function GuidedProjectPanel({ p, g, signedIn }: { p: Product; g: NonNullable<NonNullable<ReturnType<typeof productVM>>["guided"]>; signedIn: boolean }) {
  return (
    <section className="stack guided" aria-labelledby="gp-build">
      <h2 id="gp-build" className="section-title">
        What you'll build
      </h2>
      <p style={{ margin: 0 }}>{p.whatYoullLearn.length ? `${p.whatYoullLearn.join(", ")}.` : p.tagline}</p>
      {g.steps.length > 0 && (
        <ol className="gp-steps">
          {g.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      <figure className="lab-preview" aria-labelledby="gp-preview-cap">
        <figcaption id="gp-preview-cap" className="small">
          <strong>Cloud Lab workspace preview.</strong> The lab opens in your browser as a split screen. Nothing to install.
        </figcaption>
        <div className="lab-split">
          <div className="lab-pane">
            <div className="lab-pane-head">Left: task instructions</div>
            <p className="small" style={{ margin: 0 }}>
              The steps above, one at a time, with the AI Tutor available for hints (it won't write the graded code for you).
            </p>
          </div>
          <div className="lab-pane lab-pane-code">
            <div className="lab-pane-head">Right: code editor{g.starterFile ? ` — ${g.starterFile}` : ""}</div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Starter file with the functions to complete</li>
              <li>
                <strong>Run</strong> shows your program's output
              </li>
              {g.autograded && (
                <li>
                  <strong>Grade</strong> runs the autograder and shows which checks pass
                </li>
              )}
              <li>Your code saves as you go</li>
            </ul>
          </div>
        </div>
      </figure>
      <dl className="grid g3 gp-facts">
        <div className="card card-pad small">
          <dt className="muted tiny">Time</dt>
          <dd>About {g.minutes >= 60 ? `${Math.round((g.minutes / 60) * 10) / 10} hours` : `${g.minutes} minutes`} in the lab</dd>
        </div>
        <div className="card card-pad small">
          <dt className="muted tiny">Prerequisites</dt>
          <dd>
            {g.prerequisites.length
              ? g.prerequisites.map((x, i) => (
                  <span key={x.slug}>
                    {i > 0 && ", "}
                    <a href={`/learn/${x.slug}`}>{x.title}</a>
                  </span>
                ))
              : `None recorded. Level: ${p.level}.`}
          </dd>
        </div>
        <div className="card card-pad small">
          <dt className="muted tiny">Assessment</dt>
          <dd>{g.autograded ? "Autograded lab; pass to earn the badge" : "Instructor-reviewed"}</dd>
        </div>
      </dl>
      <div className="row">
        {g.canLaunch ? (
          <form method="post" action="/api/v1/labs/launch">
            <input type="hidden" name="productId" value={p.id} />
            <button className="btn btn-primary">Launch Cloud Lab</button>
          </form>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {signedIn ? "Launching needs full access: buy this project, use Scholarion Plus, or check the options in the Enroll panel." : "Sign in and choose an access option to launch the Cloud Lab."}
          </p>
        )}
      </div>
    </section>
  );
}

/* ======================= Programs stack ======================= */

/** The "How the programs stack" lanes, shared by /programs and the home page. */
export function PathwayDiagram({ vm, headingLevel = 3 }: { vm: ReturnType<typeof pathwayVM>; headingLevel?: 2 | 3 }) {
  const lanes: [string, string, string, Product[], string[]][] = [
    ["Foundation path", "Build core skills in data, AI and prompting.", "lane-foundation", vm.foundation, ["Work with data confidently", "Build and evaluate AI models", "Design effective prompts", "Prepare for agentic development"]],
    ["Builder path", "Develop, design and deploy agentic systems.", "lane-builder", vm.builder, ["Build single and multi-agent systems", "Integrate tools and external APIs", "Work with enterprise data platforms", "Deploy, monitor and secure AI systems"]],
    ["Advanced path", "Specialize and scale with production, data and product skills.", "lane-advanced", vm.advanced, ["End-to-end agentic solutions", "Production-grade development", "MLOps, observability and security", "Portfolio-ready capstone project"]],
    ["Leadership path", "Apply AI to business and lead teams.", "lane-leadership", vm.leadership, ["Lead AI-driven transformation", "Align AI with organizational goals", "Manage risk, ethics and governance", "Deliver a real implementation plan"]],
  ];
  const edgesFrom = (id: string) => vm.edges.filter((e) => e.from === id && e.type !== "includes");
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="stack" style={{ marginTop: 24, ["--gap" as string]: "14px" }}>
      {lanes.map(([title, sub, cls, nodes, outcomes]) => (
        <section key={title} className={`pathway ${cls}`} style={{ padding: 10, borderRadius: "var(--radius)" }} aria-label={title}>
          <div className="lane">
            <H className="lane-title" style={{ color: "var(--lane)", textTransform: "uppercase", fontSize: "1rem", margin: 0, fontFamily: "var(--font-sans)" }}>
              {title}
            </H>
            <div className="small">{sub}</div>
          </div>
          {nodes.slice(0, 3).map((n) => (
            <a key={n.id} href={`/learn/${n.slug}`} className={`node ${n.status === "legacy" ? "legacy" : ""}`}>
              <span>
                <span className="no">{n.code}</span> <strong>{n.title}</strong>
              </span>
              <span className="tiny muted">{n.whatYoullLearn.join(" · ")}</span>
              <span className="tiny">
                {n.durationLabel} · {n.level}
              </span>
              {edgesFrom(n.id).map((e, i) => (
                <span key={i} className="tiny" style={{ color: "var(--lane)" }}>
                  → {vm.products[e.to]?.code}
                  {e.note ? ` · ${e.note}` : e.type === "stacks_into" ? " · stacks into" : ` · ${e.type.replace("_", " ")}`}
                </span>
              ))}
            </a>
          ))}
          {Array.from({ length: Math.max(0, 3 - nodes.length) }).map((_, i) => (
            <div key={i} aria-hidden="true" />
          ))}
          <div className="lane" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <strong className="small">{title.replace(" path", "")} outcomes</strong>
            <ul className="tiny" style={{ paddingLeft: 16, margin: "6px 0 0" }}>
              {outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}
      {vm.advanced.length > 3 && (
        <div className="grid g3 lane-advanced" style={{ padding: 10, borderRadius: "var(--radius)" }}>
          {vm.advanced.slice(3).map((n) => (
            <a key={n.id} href={`/learn/${n.slug}`} className="card card-pad" style={{ textDecoration: "none", color: "inherit", border: "2px solid var(--lane)" }}>
              <strong>
                <span style={{ color: "var(--lane)" }}>{n.code}</span> {n.title}
              </strong>
              <div className="tiny muted">
                {n.durationLabel} · {n.level} {n.status === "legacy" ? "· legacy" : ""}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgramsView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof pathwayVM> }) {
  return (
    <PublicPage viewer={viewer} current="/programs">
      <div className="container section" style={{ paddingTop: 32 }}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <h1 className="page-title" style={{ fontSize: "2.4rem", marginBottom: 4 }}>
              Scholaris AI Academy
              <br />
              <span style={{ fontWeight: 400 }}>How the Programs Stack</span>
            </h1>
            <p className="lede">Programs stack on three foundations and one flagship. Build your skills, earn stackable credentials, advance your career.</p>
          </div>
          <span className="small muted">Powered by Scholarion · All programs are non-credit professional training.</span>
        </div>
        <PathwayDiagram vm={vm} headingLevel={2} />
      </div>
    </PublicPage>
  );
}

/* ======================= Plus, Pricing, Aid, Teams ======================= */

export function PlusView({ viewer, plans }: { viewer: Viewer; plans: ReturnType<typeof homeVM>["plans"] }) {
  return (
    <PublicPage viewer={viewer} current="/plus">
      <div className="container section">
        <span className="badge badge-blue">Scholarion Plus</span>
        <h1 style={{ fontSize: "2.4rem", marginTop: 10 }}>Unlimited access to every Plus-eligible program</h1>
        <p className="lede">Self-paced courses, professional certificates and guided projects — with graded work, Cloud Lab, the AI Tutor and certificates. Live programs aren't included unless marked.</p>
        <div className="grid g2" style={{ marginTop: 24 }}>
          {[
            { code: "plus_monthly", name: "Monthly", price: `${money(plans.plusMonthly, plans.currency)}/month`, sub: `${plans.trialDays}-day free trial · reminder ${plans.reminderDays} days before the first charge · cancel any time` },
            { code: "plus_annual", name: "Annual", price: `${money(plans.plusAnnual, plans.currency)}/year`, sub: `${plans.annualSavings > 0 ? `${money(plans.annualSavings, plans.currency)} less than 12 monthly payments · ` : ""}${plans.refundDays}-day money-back guarantee` },
          ].map((o) => (
            <div key={o.code} className="card card-pad stack">
              <h2 style={{ margin: 0 }}>{o.name}</h2>
              <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>{o.price}</div>
              <p className="small muted">{o.sub}</p>
              {viewer ? (
                <form method="post" action="/api/v1/commerce/checkout-sessions">
                  <input type="hidden" name="plan" value={o.code} />
                  <button className="btn btn-primary btn-block">{o.code === "plus_monthly" ? "Start free trial" : "Choose annual"}</button>
                </form>
              ) : (
                <a className="btn btn-primary btn-block" href="/signup?next=/plus">
                  Join to start
                </a>
              )}
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 12 }}>
          Sandbox placeholder prices; taxes calculated at checkout where applicable. You'll see the renewal date, price and how to cancel before you confirm.
        </p>
        <div className="grid g2" style={{ marginTop: 28 }}>
          <div className="panel">
            <h3>Included</h3>
            <ul className="small">
              <li>All Plus-eligible courses, certificates and guided projects</li>
              <li>Graded quizzes, labs and projects</li>
              <li>Cloud Lab workspaces and the AI Tutor</li>
              <li>Shareable, verifiable credentials</li>
            </ul>
          </div>
          <div className="panel">
            <h3>Not included</h3>
            <ul className="small">
              <li>Live programs (apply separately)</li>
              <li>Degrees (not offered)</li>
            </ul>
          </div>
        </div>
      </div>
    </PublicPage>
  );
}

export function PricingView({ viewer, plans }: { viewer: Viewer; plans: ReturnType<typeof homeVM>["plans"] }) {
  const rows: [string, string, string][] = [
    ["Audit", "Free", "Videos and readings; no graded work, labs, AI Tutor or certificate"],
    ["Program subscription", `${money(plans.programMonthly, plans.currency)}/month`, "One professional certificate or specialization while subscribed"],
    ["Scholarion Plus — monthly", `${money(plans.plusMonthly, plans.currency)}/month`, `${plans.trialDays}-day free trial; all Plus-eligible self-paced programs`],
    ["Scholarion Plus — annual", `${money(plans.plusAnnual, plans.currency)}/year`, `${plans.refundDays}-day money-back guarantee`],
    ["One-time purchase", "Varies", "Guided projects, single courses, live program seats"],
    ["Teams", "Per seat", "Contact us for organization pricing"],
    ["Financial aid", "Up to 100% off", "Application reviewed by a person"],
  ];
  return (
    <PublicPage viewer={viewer} current="/pricing">
      <div className="container section">
        <h1 className="page-title" style={{ fontSize: "2.2rem" }}>
          Plans and pricing
        </h1>
        <p className="lede">Clear prices, no fake discounts. All prices below are sandbox placeholders set by the product owner.</p>
        <div className="card table-wrap" style={{ marginTop: 20 }}>
          <table className="table">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Price</th>
                <th scope="col">What you get</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([a, b, c]) => (
                <tr key={a}>
                  <th scope="row" style={{ textAlign: "left" }}>
                    {a}
                  </th>
                  <td className="mono">{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Monthly vs annual</h2>
          <p className="muted">
            12 months of Plus monthly costs {money(plans.plusMonthly * 12, plans.currency)}. Annual costs {money(plans.plusAnnual, plans.currency)}
            {plans.annualSavings > 0 ? ` — ${money(plans.annualSavings, plans.currency)} less.` : "."}
          </p>
          <PricingCalculator plusMonthly={plans.plusMonthly} plusAnnual={plans.plusAnnual} currency={plans.currency} trialDays={plans.trialDays} refundDays={plans.refundDays} />
        </div>
      </div>
    </PublicPage>
  );
}

export function FinancialAidView({ viewer, decisionDays }: { viewer: Viewer; decisionDays: number }) {
  return (
    <PublicPage viewer={viewer} current="/financial-aid">
      <div className="container section" style={{ maxWidth: 860 }}>
        <span className="badge badge-gold">Financial aid</span>
        <h1 style={{ fontSize: "2.2rem", marginTop: 10 }}>Up to 100% off a course or program</h1>
        <p className="lede">If cost is a barrier, apply from any course or program page. A person reads every application — AI may summarise, but never decides.</p>
        <ol className="stack" style={{ marginTop: 20 }}>
          <li>
            <strong>Open the course or program</strong> and choose “Apply for financial aid”.
          </li>
          <li>
            <strong>Tell us about yourself:</strong> your background, your financial need and your goals (about 150–500 words each), and confirm you'll complete the coursework.
          </li>
          <li>
            <strong>We review it</strong> and email you a decision, usually within {decisionDays} days. You can audit while you wait.
          </li>
          <li>
            <strong>If approved</strong>, you get full access at the approved discount — graded work, labs, AI Tutor and certificate.
          </li>
        </ol>
        <p className="small muted">We only ask for what we need. We don't ask for documents unless the policy requires it.</p>
        <a className="btn btn-primary" href="/explore">
          Find a program
        </a>
      </div>
    </PublicPage>
  );
}

export function AidApplyView({ viewer, vm, flash }: { viewer: Viewer; vm: ReturnType<typeof aidApplyVM>; flash: FlashProps }) {
  const g = vm.guidance;
  return (
    <PublicPage viewer={viewer} current="/financial-aid">
      <div className="container section" style={{ maxWidth: 760 }}>
        <h1 className="page-title">Apply for financial aid</h1>
        {vm.product ? <p className="lede">For {vm.product.title}</p> : <p className="lede">Choose a program from the catalog first.</p>}
        <Flash {...flash} />
        {vm.product && (
          <form method="post" action="/api/v1/commerce/aid-applications" className="panel">
            <input type="hidden" name="productId" value={vm.product.id} />
            <input type="hidden" name="back" value={`/financial-aid/apply?product=${vm.product.slug}`} />
            <div className="field">
              <label htmlFor="background">Your background</label>
              <input id="background" name="background" type="text" placeholder="e.g. Self-taught developer moving into AI" required />
            </div>
            <div className="field">
              <label htmlFor="need">
                Your financial need <span className="hint">({g.needMin}–{g.needMax} words)</span>
              </label>
              <textarea id="need" name="need" required />
            </div>
            <div className="field">
              <label htmlFor="goals">
                Your goals <span className="hint">({g.goalsMin}–{g.goalsMax} words)</span>
              </label>
              <textarea id="goals" name="goals" required />
            </div>
            <label className="check field">
              <input type="checkbox" name="commitment" required /> I'll complete the coursework, including graded assignments.
            </label>
            <button className="btn btn-primary">Submit application</button>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              We use this only to decide your application. Decisions within {g.decisionDays} days.
            </p>
          </form>
        )}
      </div>
    </PublicPage>
  );
}

export function TeamsView({ viewer, flash, partner, quote }: { viewer: Viewer; flash: FlashProps; partner?: boolean; quote: ReturnType<typeof teamsQuote> }) {
  return (
    <PublicPage viewer={viewer} current="/teams">
      <div className="container section grid g2" style={{ alignItems: "start" }}>
        <div>
          <span className="badge badge-blue">{partner ? "Partner with us" : "Scholarion for Teams"}</span>
          <h1 style={{ fontSize: "2.2rem", marginTop: 10 }}>{partner ? "Build programs with Scholarion Academy" : "Upskill your team with applied AI"}</h1>
          <ul className="stack">
            {(partner
              ? ["Co-develop programs under a signed agreement", "Your name and logo appear only once the agreement is recorded", "Shared curriculum and quality review"]
              : ["Buy seats and choose the programs your people get", "Invite by email, or let anyone with your email domain sign in and take a seat", "See progress, completions, credentials and skills; export to CSV", "Your organization's data is never visible to other organizations"]
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {!partner && (
            <p className="small muted">Want a walkthrough first, or more than 5,000 seats? Request a demo and our team will contact you. SAML/OIDC single sign-on and SCIM provisioning are on the roadmap.</p>
          )}
          {!partner && (
            <div style={{ marginTop: 20 }}>
              <BuySeatsPanel signedIn={!!viewer} quote={quote} error={flash.error} />
            </div>
          )}
        </div>
        <form method="post" action="/api/v1/cx/leads" className="panel">
          {partner ? <Flash {...flash} /> : flash.notice && <Flash notice={flash.notice} />}
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "1.1rem" }}>{partner ? "Contact partnerships" : "Request a demo"}</h2>
          <input type="hidden" name="kind" value={partner ? "partner" : "teams_demo"} />
          <input type="hidden" name="back" value={partner ? "/teams?kind=partner" : "/teams"} />
          <div className="field">
            <label htmlFor="ln">Name</label>
            <input id="ln" name="name" type="text" required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="le">Work email</label>
            <input id="le" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="lo">Organization</label>
            <input id="lo" name="organization" type="text" required autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor="lm">What do you need?</label>
            <textarea id="lm" name="message" />
          </div>
          <button className="btn btn-primary btn-block">{partner ? "Contact partnerships" : "Request a demo"}</button>
        </form>
      </div>
    </PublicPage>
  );
}

/* ======================= Verify ======================= */

export function VerifyLookupView({ viewer }: { viewer: Viewer }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 640 }}>
        <h1 className="page-title">Verify a credential</h1>
        <p className="lede">Enter the credential ID from the certificate, or scan its QR code.</p>
        <form method="get" action="/verify/lookup" className="panel row" style={{ flexWrap: "nowrap" }}>
          <label htmlFor="cid" className="sr-only">
            Credential ID
          </label>
          <input id="cid" name="id" type="text" placeholder="crd_…" required />
          <button className="btn btn-primary">Verify</button>
        </form>
      </div>
    </PublicPage>
  );
}

export function VerifyView({ viewer, vm }: { viewer: Viewer; vm: ReturnType<typeof verifyVM> }) {
  const c = vm.credential;
  const tone = vm.status === "valid" ? "notice-ok" : vm.status === "not_found" ? "notice-warn" : "notice-err";
  const msg = { valid: "Valid credential — the digital signature checks out and it hasn't been revoked.", revoked: "This credential was revoked by Scholarion Academy.", invalid_signature: "This record failed signature verification. Do not rely on it.", not_found: "We couldn't find a credential with that ID." }[vm.status];
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 820 }}>
        <h1 className="page-title">Credential verification</h1>
        <div className={`notice ${tone}`} role="status">
          <strong>{msg}</strong> <span className="small">Checked {fmtDateTime(vm.checkedAt)}.</span>
        </div>
        {c && (
          <div className="grid g2" style={{ alignItems: "start" }}>
            <div className="certificate">
              <div className="tiny" style={{ letterSpacing: ".2em" }}>
                SCHOLARION ACADEMY
              </div>
              <h3>{vm.product?.credential.kind === "badge" ? "Digital Badge" : "Certificate of Completion"}</h3>
              <div className="small">This certifies that</div>
              <div className="holder">{c.holderName}</div>
              <div className="small">has successfully completed</div>
              <strong>{vm.product?.title ?? c.title}</strong>
              <div className="small" style={{ marginTop: 8 }}>
                Issued {fmtDate(c.issuedAt, { dateStyle: "long" })}
              </div>
            </div>
            <dl className="panel small" style={{ margin: 0 }}>
              <dt className="muted">Credential</dt>
              <dd style={{ margin: "0 0 10px" }}>{c.title}</dd>
              <dt className="muted">Credential ID</dt>
              <dd className="mono" style={{ margin: "0 0 10px" }}>
                {c.id}
              </dd>
              <dt className="muted">Issuer</dt>
              <dd style={{ margin: "0 0 10px" }}>Scholarion Academy (Ed25519-signed Open Badges 3.0 credential)</dd>
              <dt className="muted">Type</dt>
              <dd style={{ margin: "0 0 10px" }}>Non-credit professional training</dd>
              <img src={`/api/v1/credentials/${c.id}/qr`} alt="QR code linking to this verification page" width={120} height={120} />
            </dl>
          </div>
        )}
      </div>
    </PublicPage>
  );
}

/* ======================= Help ======================= */

export function HelpView({ viewer, articles, q, flash }: { viewer: Viewer; articles: HelpArticle[]; q?: string; flash: FlashProps }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 900 }}>
        <h1 className="page-title">Help Center</h1>
        <Flash {...flash} />
        <form method="get" className="row" style={{ flexWrap: "nowrap", maxWidth: 520 }}>
          <label htmlFor="hq" className="sr-only">
            Search help
          </label>
          <input id="hq" name="q" type="search" defaultValue={q} placeholder="Search help articles" />
          <button className="btn btn-primary">Search</button>
        </form>
        <div className="stack" style={{ marginTop: 20 }}>
          {articles.length === 0 && <p className="muted">No articles match. Try other words, or contact support below.</p>}
          {articles.map((a) => (
            <details key={a.id} id={a.id} className="acc" open={!!q}>
              <summary>{a.title}</summary>
              <div>{a.body}</div>
            </details>
          ))}
        </div>
        <section id="accessibility" className="panel" style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Accessibility</h2>
          <p className="small">We design to WCAG 2.2 AA: captions on every video, keyboard-operable players, visible focus, dark and high-contrast themes. Request accommodations below.</p>
        </section>
        <section id="refunds" className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Refund policy</h2>
          <p className="small">Annual plans: full refund within the money-back window shown at checkout. Monthly plans: no refunds; cancel any time and keep access to the end of the month.</p>
        </section>
        <section id="privacy" className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Privacy and cookies</h2>
          <p className="small">We use only essential cookies for sign-in. You can export or delete your data from Account settings. Events between our services carry IDs, not your name or email.</p>
        </section>
        <form method="post" action="/api/v1/cx/tickets" className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Contact support</h2>
          <input type="hidden" name="redirect" value="/help" />
          <div className="grid g2">
            <div className="field">
              <label htmlFor="cat">Topic</label>
              <select id="cat" name="category">
                <option value="general">General</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical problem</option>
                <option value="accommodations">Accommodations</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sub">Subject</label>
              <input id="sub" name="subject" type="text" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="bd">How can we help?</label>
            <textarea id="bd" name="body" required />
          </div>
          <button className="btn btn-primary">Open a ticket</button>
        </form>
      </div>
    </PublicPage>
  );
}

/* ======================= Auth ======================= */

export function LoginView({ next, error, notice, demo }: { next?: string; error?: string; notice?: string; demo: { email: string; password: string; label: string }[] | null }) {
  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#eef3ff,#f9f6ee)", padding: 16 }}>
      <div className="card card-pad" style={{ width: "min(440px,100%)", padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <img src="/brand/scholarion-emblem.png" alt="" width={86} height={60} />
          <div className="serif" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--navy-900)", letterSpacing: ".05em" }}>
            SCHOLARION
          </div>
          <div className="small muted">Learn. Earn. Build Your Future.</div>
        </div>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1.4rem", textAlign: "center", margin: "16px 0 4px" }}>{t("login.title")}</h1>
        <p className="small muted" style={{ textAlign: "center" }}>
          {t("login.sub")}
        </p>
        <Flash error={error} notice={notice} />
        <form method="post" action="/api/v1/auth/signin">
          <input type="hidden" name="redirect" value={next ?? "/app"} />
          <div className="field">
            <label htmlFor="email">{t("login.email")}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <div className="row between">
              <label htmlFor="password" style={{ margin: 0 }}>
                {t("login.password")}
              </label>
              <a className="small" href="/forgot-password">
                {t("login.forgot")}
              </a>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" required style={{ marginTop: 6 }} />
          </div>
          <button className="btn btn-primary btn-block">{t("login.submit")}</button>
        </form>
        <p className="small" style={{ textAlign: "center", marginTop: 14 }}>
          {t("login.new")} <a href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("login.create")}</a>
        </p>
        <div className="small muted" style={{ textAlign: "center", margin: "12px 0" }}>
          or continue with
        </div>
        <div className="stack" style={{ ["--gap" as string]: "8px" }}>
          <button className="btn btn-ghost btn-block" disabled title="Google sign-in connects when Scholarion Identity (OIDC) is CONNECTED">
            Continue with Google
          </button>
          <button className="btn btn-ghost btn-block" disabled title="Microsoft sign-in connects when Scholarion Identity (OIDC) is CONNECTED">
            Continue with Microsoft
          </button>
          <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>
            Social and organization SSO arrive when Scholarion Identity is connected.
          </p>
        </div>
        {demo && (
          <div className="dev-banner" style={{ marginTop: 16 }}>
            <strong>Development demo accounts</strong> (hidden in production)
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {demo.map((d) => (
                <li key={d.email}>
                  {d.label}: <span className="mono">{d.email}</span> / <span className="mono">{d.password}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>
          <a href="/help#privacy">Privacy</a> · <a href="/help">Terms</a> · <a href="/help">Support</a>
        </p>
      </div>
    </main>
  );
}

export function SignupView({ next, error }: { next?: string; error?: string }) {
  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#eef3ff,#f9f6ee)", padding: 16 }}>
      <div className="card card-pad" style={{ width: "min(460px,100%)", padding: 32 }}>
        <a href="/" className="row" style={{ justifyContent: "center", textDecoration: "none" }}>
          <img src="/brand/scholarion-emblem.png" alt="Scholarion Academy" width={72} height={50} />
        </a>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1.4rem", textAlign: "center", margin: "12px 0" }}>{t("signup.title")}</h1>
        <Flash error={error} />
        <form method="post" action="/api/v1/auth/signup">
          <input type="hidden" name="redirect" value={next ?? "/app/onboarding"} />
          <div className="field">
            <label htmlFor="name">{t("signup.name")}</label>
            <input id="name" name="name" type="text" autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">{t("login.email")}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">
              {t("signup.password")} <span className="hint">{t("signup.passwordHint")}</span>
            </label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <label className="check field small">
            <input type="checkbox" name="acceptTerms" required /> I'm 16 or older and I agree to the <a href="/help">Terms</a> and <a href="/help#privacy">Privacy Policy</a>.
          </label>
          <button className="btn btn-primary btn-block">{t("signup.submit")}</button>
        </form>
        <p className="small" style={{ textAlign: "center", marginTop: 14 }}>
          {t("signup.have")} <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("signup.signin")}</a>
        </p>
      </div>
    </main>
  );
}

/* ======================= Checkout (sandbox) ======================= */

export function CheckoutView({ viewer, vm, flash = {} }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof checkoutVM>>; flash?: FlashProps }) {
  const { cs, product } = vm;
  const title = cs.plan === "plus_monthly" ? "Scholarion Plus — monthly" : cs.plan === "plus_annual" ? "Scholarion Plus — annual" : product?.title ?? "Purchase";
  const firstPayment = cs.trialEndsAt ? 0 : cs.installmentAmount ?? cs.amount;
  const dueToday = cs.dueToday ?? firstPayment;
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 760 }}>
        <div className="dev-banner" style={{ marginBottom: 16 }}>
          <strong>Sandbox checkout.</strong> No card is collected and nothing is charged. In staging this page hands off to a PCI-compliant processor's hosted checkout.
        </div>
        <h1 className="page-title">Review and confirm</h1>
        <Flash {...flash} />
        <div className="card card-pad">
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Plan</th>
                <td>{title}</td>
              </tr>
              {cs.aidDiscountPercent && cs.listAmount !== undefined && (
                <tr>
                  <th scope="row">Financial aid</th>
                  <td>
                    Approved: <strong>{cs.aidDiscountPercent}% off</strong>. List price {money(cs.listAmount, cs.currency)}
                    {cs.plan === "program_monthly" ? "/month" : ""}; your price is below{cs.plan === "program_monthly" ? " for every monthly payment" : ""}.
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">Price</th>
                <td className="mono">
                  {money(cs.amount, cs.currency)}
                  {cs.plan === "plus_annual" ? "/year" : cs.plan.endsWith("monthly") ? "/month" : " one-time"}
                </td>
              </tr>
              {cs.trialEndsAt && (
                <tr>
                  <th scope="row">Free trial ends</th>
                  <td>{fmtDate(cs.trialEndsAt, { dateStyle: "long" })} — we'll email you before then</td>
                </tr>
              )}
              {cs.installmentAmount && cs.installments && cs.renewsAt && (
                <tr>
                  <th scope="row">Payment plan</th>
                  <td>
                    {cs.installments} payments of {money(cs.installmentAmount, cs.currency)}: today, {fmtDate(cs.renewsAt, { dateStyle: "long" })} and {fmtDate(new Date(Date.parse(cs.renewsAt) + 30 * 86400000).toISOString(), { dateStyle: "long" })}
                  </td>
                </tr>
              )}
              {cs.renewsAt && !cs.installmentAmount && (
                <tr>
                  <th scope="row">{cs.trialEndsAt ? "First charge" : "Renews"}</th>
                  <td>
                    {fmtDate(cs.renewsAt, { dateStyle: "long" })} at {money(cs.amount, cs.currency)} until you cancel
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">{cs.plan === "live_seat" ? "Your seat" : "How to cancel"}</th>
                <td>{cs.plan === "live_seat" ? "Reserved for you as soon as you confirm. Contact support to cancel under the refund policy." : "Account → Billing → Cancel. One step, any time."}</td>
              </tr>
              <tr>
                <th scope="row">Refunds</th>
                <td>{cs.refundPolicy}</td>
              </tr>
              {!!cs.discount && (
                <tr>
                  <th scope="row">Code {cs.couponCode}</th>
                  <td className="mono">
                    −{money(cs.discount, cs.currency)} ({cs.couponPercent}% off today's payment only)
                  </td>
                </tr>
              )}
              <tr>
                <th scope="row">Tax</th>
                <td>
                  {cs.taxRate ? (
                    <>
                      <span className="mono">{money(cs.tax ?? 0, cs.currency)}</span> — simulated {cs.taxRate}% rate for your region ({cs.region ?? "US"}), set by staff in the sandbox
                    </>
                  ) : (
                    `Simulated rate for your region (${cs.region ?? "US"}): 0% — no tax configured in the sandbox`
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Due today</th>
                <td className="mono">
                  <strong>{money(dueToday, cs.currency)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          {vm.canUseCoupon && (
            <div className="coupon-box">
              {cs.couponCode ? (
                <form method="post" action={`/api/v1/commerce/checkout-sessions/${cs.id}/coupon`} className="row">
                  <span className="small">
                    Code <strong>{cs.couponCode}</strong> applied.
                  </span>
                  <input type="hidden" name="remove" value="1" />
                  <button className="btn btn-ghost btn-sm">Remove code</button>
                </form>
              ) : (
                <form method="post" action={`/api/v1/commerce/checkout-sessions/${cs.id}/coupon`} className="row" style={{ alignItems: "flex-end" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="coupon">Have a code?</label>
                    <input id="coupon" name="code" autoComplete="off" style={{ textTransform: "uppercase", width: 200 }} />
                  </div>
                  <button className="btn btn-outline btn-sm">Apply</button>
                </form>
              )}
            </div>
          )}
          <form method="post" action={`/api/v1/commerce/checkout-sessions/${cs.id}/confirm`} style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-block" disabled={cs.status === "paid"}>
              {cs.status === "paid" ? "Already confirmed" : cs.trialEndsAt ? "Start free trial (sandbox)" : `Pay ${money(dueToday, cs.currency)} (sandbox)`}
            </button>
          </form>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Nothing else is added to your order. By confirming you agree to the renewal terms above.
          </p>
        </div>
      </div>
    </PublicPage>
  );
}

/* ======================= Educator profile ======================= */

export function EducatorView({ viewer, vm }: { viewer: Viewer; vm: NonNullable<ReturnType<typeof educatorVM>> }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ paddingTop: 32, maxWidth: 980 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Home</a> › <a href="/explore">Explore</a> › <span aria-current="page">{vm.name}</span>
        </nav>
        <span className="badge badge-blue">Educator</span>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          {vm.name}
        </h1>
        {vm.bio ? <p className="lede">{vm.bio}</p> : <p className="muted">No biography has been confirmed for this educator yet.</p>}
        <p className="small muted">
          In the current catalog: {vm.courses.length} course{vm.courses.length === 1 ? "" : "s"} or guided project{vm.courses.length === 1 ? "" : "s"} · {vm.programs.length} program{vm.programs.length === 1 ? "" : "s"}.
        </p>
        {vm.qualifications.length > 0 && (
          <section style={{ marginTop: 20 }} aria-labelledby="edu-quals">
            <h2 id="edu-quals" className="section-title">
              Confirmed qualifications
            </h2>
            <ul>
              {vm.qualifications.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </section>
        )}
        {vm.courses.length > 0 && (
          <section style={{ marginTop: 24 }} aria-labelledby="edu-courses">
            <h2 id="edu-courses" className="section-title">
              Courses and guided projects
            </h2>
            <div className="grid g3" style={{ marginTop: 12 }}>
              {vm.courses.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}
        {vm.programs.length > 0 && (
          <section style={{ marginTop: 24 }} aria-labelledby="edu-programs">
            <h2 id="edu-programs" className="section-title">
              Programs
            </h2>
            <div className="grid g3" style={{ marginTop: 12 }}>
              {vm.programs.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}
        <section style={{ marginTop: 24 }} aria-labelledby="edu-creds">
          <h2 id="edu-creds" className="section-title">
            Credentials awarded through these courses
          </h2>
          <p className="small muted">Non-credit professional training credentials, digitally signed and verifiable.</p>
          <ul className="item-list">
            {vm.credentials.map((c) => (
              <li key={c.title} className="li small">
                <span className="kind">
                  <Icon name="award" size={16} />
                </span>
                <a href={`/learn/${c.productSlug}`}>{c.title}</a> <span className="muted">· {c.kind === "badge" ? "Digital badge" : "Certificate"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PublicPage>
  );
}

export function NotFoundView({ viewer }: { viewer: Viewer }) {
  return (
    <PublicPage viewer={viewer}>
      <div className="container section" style={{ maxWidth: 640, textAlign: "center" }}>
        <h1 className="page-title">We couldn't find that page</h1>
        <p className="muted">It may have moved, or it isn't available yet.</p>
        <a className="btn btn-primary" href="/explore">
          Explore the catalog
        </a>
      </div>
    </PublicPage>
  );
}
