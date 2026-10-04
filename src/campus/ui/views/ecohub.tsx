import crypto from "node:crypto";
import { CampusError, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { FacultyCard } from "../../../ui/components/faculty";
import * as eco from "../../services/ecosystem";
import { api, Chip, Denied, Empty, fmt, Hidden, PageHead } from "../kit";

type SP = Record<string, string | undefined>;
interface Ctx {
  store: TenantStore;
  actor: Actor;
  slug: string;
  sp: SP;
  base: string;
  here: string;
}

export const HUB_SECTIONS = [
  { slug: "overview", title: "Overview" },
  { slug: "tools", title: "Free Tools Directory" },
  { slug: "ai", title: "AI & Machine Intelligence" },
  { slug: "agentic", title: "Agentic AI Tools & Templates" },
  { slug: "avatar", title: "Virtual Instructor & Avatar Studio" },
  { slug: "live", title: "Live Classroom Hub" },
  { slug: "media", title: "Video & Audio Studio" },
  { slug: "library", title: "Open Courses & Reading Library" },
  { slug: "recommendations", title: "Course Resource Recommendations" },
  { slug: "whats-new", title: "What's New" },
  { slug: "career", title: "Career Connect" },
  { slug: "board", title: "Internship & Employment Board" },
  { slug: "employer", title: "Employer Portal" },
  { slug: "integrations", title: "Integration Connections", admin: true },
  { slug: "employers", title: "Employer Verification", admin: true },
  { slug: "automation", title: "Discovery & Update Settings", admin: true },
  { slug: "schema", title: "Integration JSON Schema", admin: true },
] as const;

const idem = () => crypto.randomUUID();

const STATUS_NOTE: Record<string, string> = {
  verified: "Verified on the official source",
  pending: "Verification pending",
  stale: "Verification out of date",
  unavailable: "Unavailable",
  archived: "Archived",
};

export function EcoHub({ store, actor, slug, section, sp }: { store: TenantStore; actor: Actor; slug: string; section: string; sp: SP }) {
  const admin = hasAny(actor, ["admin"]);
  const sec = HUB_SECTIONS.find((s) => s.slug === section && (!("admin" in s) || admin))?.slug ?? "overview";
  const base = `/campus/${slug}/hub`;
  const t: Ctx = { store, actor, slug, sp, base, here: `${base}/${sec}` };
  const title = HUB_SECTIONS.find((s) => s.slug === sec)!.title;
  return (
    <div className="stack campus-hub">
      <PageHead title="Scholarion Free Education Resource Hub & Career Connect" sub="Verified free tools, open courses and career opportunities — every listing shows its source, availability and last verification." />
      {sp.notice && (
        <p className="notice notice-ok" role="status">
          {sp.notice}
        </p>
      )}
      {sp.error && (
        <p className="notice notice-err" role="alert">
          {sp.error}
        </p>
      )}
      <div className="learn-layout">
        <nav className="learn-nav" aria-label="Resource hub">
          <ol>
            {HUB_SECTIONS.filter((s) => !("admin" in s) || admin).map((s) => (
              <li key={s.slug}>
                <a href={`${base}/${s.slug}`} aria-current={s.slug === sec ? "page" : undefined}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <main className="stack learn-main" aria-labelledby="hub-h">
          <h2 id="hub-h" className="section-title">
            {title}
          </h2>
          <Body t={t} sec={sec} />
        </main>
      </div>
    </div>
  );
}

function Body({ t, sec }: { t: Ctx; sec: string }) {
  try {
    switch (sec) {
      case "overview":
        return <Overview t={t} />;
      case "tools":
      case "ai":
      case "agentic":
      case "library":
        return <Catalog t={t} group={sec} />;
      case "avatar":
        return <Avatar t={t} />;
      case "media":
        return <Catalog t={t} group="media" />;
      case "live":
        return <Live t={t} />;
      case "recommendations":
        return <Recommendations t={t} />;
      case "whats-new":
        return <WhatsNew t={t} />;
      case "career":
        return <Career t={t} />;
      case "board":
        return <Board t={t} />;
      case "employer":
        return <EmployerPortal t={t} />;
      case "integrations":
        return <Integrations t={t} />;
      case "employers":
        return <EmployerAdmin t={t} />;
      case "automation":
        return <Automation t={t} />;
      case "schema":
        return <Schema t={t} />;
    }
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  return null;
}

/* ---------------- overview ---------------- */

function Overview({ t }: { t: Ctx }) {
  const { store, actor, base } = t;
  const s = eco.hubSummary(store, actor);
  const learner = Object.values(actor.courseRoles ?? {}).some((r) => r.includes("student"));
  const teaches = Object.entries(actor.courseRoles ?? {}).filter(([, r]) => r.includes("instructor")).map(([c]) => c);
  const marks = learner ? eco.myBookmarks(store, actor) : [];
  const matches = learner ? eco.myMatches(store, actor).slice(0, 3) : [];
  return (
    <>
      <ul className="grid g4 eco-cards" aria-label="Summary">
        <li className="card card-pad">
          <p className="tiny muted">Verified resources</p>
          <p className="big-num">{s.verified}</p>
        </li>
        <li className="card card-pad">
          <p className="tiny muted">Connected services</p>
          <p className="big-num">{s.connected}</p>
        </li>
        <li className="card card-pad">
          <p className="tiny muted">Active opportunities</p>
          <p className="big-num">{s.activeOpportunities}</p>
        </li>
        <li className="card card-pad">
          <p className="tiny muted">Stale or pending records</p>
          <p className="big-num">{s.stale + s.pending}</p>
        </li>
      </ul>
      <div className="grid g2">
        <section className="card card-pad stack" aria-labelledby="ov-act">
          <h3 id="ov-act" className="card-title">
            Recent activity
          </h3>
          {s.feed.length ? (
            <ul className="small">
              {s.feed.slice(0, 8).map((f, i) => (
                <li key={i}>
                  <Chip s={f.kind} /> {f.title} <span className="tiny muted">{fmt(f.at, true)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No changes yet. Discovery runs on its schedule.</p>
          )}
          {s.jobs.length > 0 && (
            <>
              <h4>Jobs</h4>
              <ul className="small">
                {s.jobs.slice(0, 5).map((j) => (
                  <li key={j.id}>
                    <Chip s={j.state} /> {j.kind.replace(/_/g, " ")} — {j.summary}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="card card-pad stack" aria-labelledby="ov-me">
          <h3 id="ov-me" className="card-title">
            For you
          </h3>
          <FacultyCard compact note="Curated under the direction of the Lead Faculty." />
          {learner && (
            <>
              <p className="small">
                <strong>Bookmarks:</strong> {marks.length ? marks.map((m) => m.name).join(", ") : "none yet"}
              </p>
              <p className="small">
                <strong>Top matches:</strong> {matches.length ? matches.map((m) => `${m.title} (${m.match.score}%)`).join(", ") : "complete your career profile to see matches"} — <a href={`${base}/career`}>Career Connect</a>
              </p>
            </>
          )}
          {teaches.length > 0 && (
            <p className="small">
              Map verified resources to your courses in <a href={`${base}/recommendations?course=${teaches[0]}`}>Course Resource Recommendations</a> and schedule sessions in the <a href={`${base}/live`}>Live Classroom Hub</a>.
            </p>
          )}
          <p className="tiny muted">Availability labels: ongoing free plan · open-source/self-hosted · open educational resource · education benefit · limited free credits · time-limited trial. A free app doesn't imply a free API.</p>
        </section>
      </div>
    </>
  );
}

/* ---------------- catalog ---------------- */

function Catalog({ t, group }: { t: Ctx; group: string }) {
  const { store, actor, sp, here, slug } = t;
  const f = { group, q: sp.q, subject: sp.subject, freeOnly: sp.free === "1", noCard: sp.nocard === "1", api: sp.api === "1", selfHosted: sp.self === "1", accessible: sp.a11y === "1", status: sp.status, connection: sp.conn, page: sp.page ? Number(sp.page) : 1 };
  const r = eco.listResources(store, actor, f);
  const sel = sp.r ? r.items.find((x) => x.id === sp.r) ?? (() => {
    try {
      return eco.getResource(store, actor, sp.r!);
    } catch {
      return null;
    }
  })() : null;
  return (
    <>
      <p className="small">{eco.GROUPS[group]?.title ?? ""}: {r.total} listing(s). Pending records are visible to curators only.</p>
      <form method="get" action={here} className="row card card-pad eco-filters" aria-label="Filters">
        <label>
          Search
          <input name="q" defaultValue={sp.q ?? ""} />
        </label>
        <label>
          Subject
          <input name="subject" defaultValue={sp.subject ?? ""} />
        </label>
        {(
          [
            ["free", "Genuinely free"],
            ["nocard", "No payment card"],
            ["api", "Has an API"],
            ["self", "Self-hostable"],
            ["a11y", "Accessibility info"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="row">
            <input type="checkbox" name={k} value="1" defaultChecked={sp[k] === "1"} /> {l}
          </label>
        ))}
        <button className="btn btn-outline btn-sm">Apply</button>
      </form>
      {r.items.length ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Catalog">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                <th scope="col">Availability</th>
                <th scope="col">Verified limits</th>
                <th scope="col">Connection</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((x) => (
                <tr key={x.id}>
                  <td>
                    <a href={`${here}?r=${x.id}`}>{x.name}</a>
                    <br />
                    <span className="tiny muted">{x.provider}</span>
                  </td>
                  <td className="small">
                    {x.classificationLabel}
                    {x.apiAccess !== "unknown" && <span className="tiny muted"> · API: {x.apiAccess}</span>}
                  </td>
                  <td className="tiny">{x.limits.length ? x.limits.map((l) => `${String(l.value)} ${l.unit}${l.reset_period ? ` ${l.reset_period}` : ""}`).join("; ") : "—"}</td>
                  <td className="small">{x.connectionLabel}</td>
                  <td>
                    <Chip s={x.status} />
                    <br />
                    <span className="tiny muted">{fmt(x.verifiedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Nothing matches these filters.">Clear a filter, or wait for the next discovery run.</Empty>
      )}
      {sel && <Detail t={t} r={sel} />}
      {hasAny(actor, ["admin", "designer"]) && (
        <form method="post" action={api(slug, "a/eco.curate")} className="card card-pad stack" aria-label="Suggest a resource">
          <h3 className="card-title">Add a resource (stays pending until official evidence verifies it)</h3>
          <Hidden values={{ back: here, notice: "Added as pending — attach official evidence to verify it." }} />
          <div className="grid g2">
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Provider
              <input name="provider" required />
            </label>
            <label>
              Official URL
              <input name="officialUrl" type="url" required />
            </label>
            <label>
              Category
              <select name="category">
                {eco.CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn btn-primary btn-sm">Add</button>
        </form>
      )}
    </>
  );
}

function Detail({ t, r }: { t: Ctx; r: eco.ResourceView | ReturnType<typeof eco.getResource> }) {
  const { slug, here, actor } = t;
  const curator = hasAny(actor, ["admin", "designer"]);
  return (
    <section className="card card-pad stack eco-detail" aria-labelledby="d-h">
      <h3 id="d-h" className="card-title">
        {r.name} <Chip s={r.status} />
      </h3>
      <p className="small">{r.description}</p>
      <dl className="kv small">
        <dt>Official source</dt>
        <dd>
          <a href={r.officialUrl} rel="noopener noreferrer">
            {r.officialUrl}
          </a>
        </dd>
        <dt>Availability</dt>
        <dd>
          {r.classificationLabel} — {STATUS_NOTE[r.status] ?? r.status}
          {r.statusReason ? ` (${r.statusReason})` : ""}
        </dd>
        <dt>Last verified</dt>
        <dd>
          {fmt(r.verifiedAt)} · next review {fmt(r.nextReviewAt)}
        </dd>
        <dt>Free limits</dt>
        <dd>{r.limits.length ? r.limits.map((l) => `${l.metric.replace(/_/g, " ")}: ${String(l.value)} ${l.unit}${l.reset_period ? ` (${l.reset_period})` : ""}`).join("; ") : "No numeric limits recorded"}</dd>
        <dt>Account / card</dt>
        <dd>
          Account {r.accountRequired === null ? "unknown" : r.accountRequired ? "required" : "not required"} · payment card {r.cardRequired === null ? "unknown" : r.cardRequired ? "required" : "not required"}
        </dd>
        <dt>API access</dt>
        <dd>{r.apiAccess} (tracked separately from the free app)</dd>
        <dt>License and use</dt>
        <dd>
          {r.license ?? "not recorded"} · embedding {r.embedding} · redistribution {r.redistribution}
          {r.attributionRequired ? " · attribution required" : ""}
        </dd>
        {r.certificate && (
          <>
            <dt>Certificate</dt>
            <dd>{r.certificate === "paid" ? "Costs extra (issued by the provider, not Scholarion)" : r.certificate === "free" ? "Free certificate from the provider (not a Scholarion certificate)" : r.certificate}</dd>
          </>
        )}
        <dt>Connection method</dt>
        <dd>
          {r.integrationMethod} — {r.connectionLabel}
        </dd>
        <dt>Course mappings</dt>
        <dd>{r.mappings.length ? r.mappings.map((m) => `${m.course}${m.topic ? ` · ${m.topic}` : ""}`).join("; ") : "none"}</dd>
      </dl>
      {r.notes && <p className="tiny muted">Notes: {r.notes}</p>}
      <h4>Evidence</h4>
      <ul className="small">
        {r.evidence.map((e, i) => (
          <li key={i}>
            <a href={e.url} rel="noopener noreferrer">
              {e.url}
            </a>{" "}
            — {e.claims.join("; ")} <span className="tiny muted">({e.confirmed ? "confirmed" : "unconfirmed"}, {fmt(e.retrievedAt)})</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <form method="post" action={api(slug, "a/eco.bookmark")}>
          <Hidden values={{ back: `${here}?r=${r.id}`, notice: r.bookmarked ? "Bookmark removed." : "Bookmarked.", resourceId: r.id }} />
          <button className="btn btn-outline btn-sm">{r.bookmarked ? "Remove bookmark" : "Bookmark"}</button>
        </form>
        <a className="btn btn-ghost btn-sm" href={r.officialUrl} rel="noopener noreferrer">
          Open on {new URL(r.officialUrl).hostname}
        </a>
      </div>
      {r.kind === "course" && (
        <form method="post" action={api(slug, "a/eco.report_completion")} className="row" aria-label="Report completion">
          <Hidden values={{ back: `${here}?r=${r.id}`, notice: "Recorded as self-reported with your evidence.", resourceId: r.id }} />
          <label>
            Completed it? Evidence link (e.g. your certificate page)
            <input name="evidenceUrl" type="url" required />
          </label>
          <button className="btn btn-ghost btn-sm">Record completion</button>
        </form>
      )}
      {curator && (
        <form method="post" action={api(slug, "a/eco.add_evidence")} className="stack" aria-label="Add evidence">
          <Hidden values={{ back: `${here}?r=${r.id}`, notice: "Evidence added — the next verification run checks it.", resourceId: r.id }} />
          <label>
            Official evidence URL
            <input name="url" type="url" required />
          </label>
          <label>
            Claims it supports (comma-separated)
            <input name="claims" />
          </label>
          <label>
            Terms that must appear on the page (comma-separated)
            <input name="checkTerms" />
          </label>
          <button className="btn btn-outline btn-sm">Add evidence</button>
        </form>
      )}
    </section>
  );
}

function Avatar({ t }: { t: Ctx }) {
  return (
    <>
      <section className="card card-pad stack">
        <h3 className="card-title">Faculty likeness</h3>
        <FacultyCard compact />
        <p className="small">Dr. Martins Idahosa's approved photograph is used for profile and title-card branding only. Animating his likeness or synthesizing his voice needs his explicit authorization for that use; none has been recorded, so avatar tools here are listed for other presenters and generic narration.</p>
        <p className="tiny muted">A browser-based talking avatar is not hardware holographic projection; listings say which they are.</p>
      </section>
      <Catalog t={t} group="avatar" />
    </>
  );
}

/* ---------------- live classroom ---------------- */

function Live({ t }: { t: Ctx }) {
  const { store, actor, slug, here, sp } = t;
  const providers = eco.listResources(store, actor, { group: "live", pageSize: 50 }).items;
  const sessions = eco.liveSessions(store, actor, sp.course);
  const teaches = Object.entries(actor.courseRoles ?? {}).filter(([, r]) => r.includes("instructor") || r.includes("ta")).map(([c]) => c);
  return (
    <>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Meeting providers">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Verified free limits</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`${t.base}/tools?r=${p.id}`}>{p.name}</a>
                </td>
                <td className="small">{p.limits.length ? p.limits.map((l) => `${l.metric.replace(/_/g, " ")}: ${String(l.value)} ${l.unit}`).join("; ") : p.classificationLabel}</td>
                <td>
                  <Chip s={p.status} /> <span className="tiny muted">{fmt(p.verifiedAt)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Limits change; these are the terms verified on each provider's official page on the date shown. Sessions longer than a free limit are split into labelled teaching blocks with breaks. Recording is never assumed.</p>
      {teaches.length > 0 && (
        <form method="post" action={api(slug, "a/eco.live_schedule")} className="card card-pad stack" aria-label="Schedule a live session">
          <h3 className="card-title">Schedule a live session</h3>
          <Hidden values={{ back: here, notice: "Session scheduled — calendar entries and reminders created." }} />
          <div className="grid g2">
            <label>
              Course
              <select name="courseId">
                {teaches.map((c) => (
                  <option key={c} value={c}>
                    {String(store.get("courses", c)?.code ?? c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input name="title" defaultValue="Live lecture" />
            </label>
            <label>
              Provider
              <select name="providerId">
                {providers.filter((p) => p.status === "verified").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts (UTC)
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              Total minutes
              <input name="totalMinutes" type="number" min={10} max={480} defaultValue={90} />
            </label>
            <label>
              Join link (from your meeting account; optional for Jitsi)
              <input name="joinUrl" type="url" />
            </label>
          </div>
          <button className="btn btn-primary btn-sm">Schedule</button>
        </form>
      )}
      <section className="stack" aria-label="Sessions">
        {sessions.length ? (
          sessions.map((s) => (
            <article key={s.id} className="card card-pad stack">
              <h3 className="card-title">
                {s.course} · {s.title}
              </h3>
              <p className="small">
                {s.provider} · {s.totalMinutes} min{s.limit ? ` · verified free limit ${s.limit} min` : ""}
              </p>
              <ol className="small">
                {s.blocks.map((b) => (
                  <li key={b.n}>
                    {fmt(b.startsAt, true)} — {b.label} {b.joinUrl ? <a href={b.joinUrl} rel="noopener noreferrer">Join</a> : <span className="muted">join link to be added</span>}
                  </li>
                ))}
              </ol>
              <p className="tiny muted">{s.recordingNote} Lecture materials stay available in the learning area.</p>
            </article>
          ))
        ) : (
          <Empty title="No live sessions scheduled." />
        )}
      </section>
    </>
  );
}

/* ---------------- recommendations ---------------- */

function Recommendations({ t }: { t: Ctx }) {
  const { store, actor, sp, slug, here } = t;
  const courses = Object.keys(actor.courseRoles ?? {}).filter((c) => store.get("courses", c));
  const courseId = sp.course ?? courses.find((c) => c.endsWith("ai801")) ?? courses[0];
  if (!courseId) return <Empty title="Enroll in or teach a course to see recommendations." />;
  const mapped = eco.courseResources(store, actor, courseId);
  const canMap = hasAny(actor, ["admin", "designer"]) || hasAny(actor, ["instructor"], courseId);
  const recs = eco.recommendForCourse(store, actor, courseId);
  return (
    <>
      <nav className="row" aria-label="Courses">
        {courses.slice(0, 12).map((c) => (
          <a key={c} className="btn btn-ghost btn-sm" aria-current={c === courseId ? "page" : undefined} href={`${here}?course=${c}`}>
            {String(store.get("courses", c)?.code ?? c)}
          </a>
        ))}
      </nav>
      <section className="card card-pad stack" aria-labelledby="rc-m">
        <h3 id="rc-m" className="card-title">
          Mapped to {String(store.get("courses", courseId)?.code ?? "")}
        </h3>
        {mapped.length ? (
          <ul className="small">
            {mapped.map((m) => (
              <li key={m.mappingId}>
                <a href={`${t.base}/tools?r=${m.resource.id}`}>{m.resource.name}</a> {m.topic ? `· ${m.topic}` : ""} — {m.resource.classificationLabel} <Chip s={m.resource.status} />
                {m.flagged && <span className="small"> ⚠ {m.flagReason}</span>}
                {m.note && <span className="tiny muted"> — {m.note}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">Nothing mapped yet.</p>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="rc-r">
        <h3 id="rc-r" className="card-title">
          Recommended (verified, not yet mapped)
        </h3>
        {recs.length ? (
          <ul className="small">
            {recs.map((r) => (
              <li key={r.resource.id}>
                <strong>{r.resource.name}</strong> — {r.why}
                {canMap && (
                  <form method="post" action={api(slug, "a/eco.map_course")} className="inline-form">
                    <Hidden values={{ back: `${here}?course=${courseId}`, notice: "Mapped to the course.", courseId, resourceId: r.resource.id, idempotencyKey: idem() }} />
                    <button className="btn btn-ghost btn-sm">Map to course</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No further recommendations.</p>
        )}
      </section>
    </>
  );
}

function WhatsNew({ t }: { t: Ctx }) {
  const { store, actor, slug, here } = t;
  const items = eco.whatsNew(store);
  const subs = eco.mySubscriptions(store, actor);
  return (
    <>
      <form method="post" action={api(slug, "a/eco.subscribe")} className="row card card-pad" aria-label="Subscribe">
        <Hidden values={{ back: here, notice: "Subscribed (in-site notifications)." }} />
        <label>
          Notify me about
          <select name="kind">
            <option value="subject">a subject</option>
            <option value="career">new opportunities</option>
            <option value="all">everything</option>
          </select>
        </label>
        <label>
          Subject (for subject alerts)
          <input name="value" placeholder="e.g. agents" />
        </label>
        <button className="btn btn-outline btn-sm">Subscribe</button>
      </form>
      {subs.length > 0 && <p className="small">Your subscriptions: {subs.map((s) => `${s.kind}${s.value ? `: ${s.value}` : ""}`).join(", ")} (in-site only; email needs a configured service).</p>}
      {items.length ? (
        <ul className="stack" aria-label="What's New">
          {items.map((f) => (
            <li key={f.id} className="card card-pad">
              <Chip s={f.kind} /> {f.title} <span className="tiny muted">{fmt(f.at, true)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing new yet." />
      )}
    </>
  );
}

/* ---------------- career ---------------- */

function Career({ t }: { t: Ctx }) {
  const { store, actor, slug, here } = t;
  const p = eco.myProfile(store, actor);
  const matches = eco.myMatches(store, actor);
  const apps = eco.myApplications(store, actor);
  const contacts = eco.myContactRequests(store, actor);
  return (
    <>
      <form method="post" action={api(slug, "a/eco.profile_save")} className="card card-pad stack" aria-label="Career profile">
        <h3 className="card-title">My career profile</h3>
        <Hidden values={{ back: here, notice: "Profile saved." }} />
        <div className="grid g2">
          <label>
            Headline
            <input name="headline" defaultValue={p.headline} />
          </label>
          <label>
            Skills I'd add (comma-separated; shown as self-reported)
            <input name="statedSkills" defaultValue={p.statedSkills.join(", ")} />
          </label>
          <label>
            Interests (e.g. intern, data)
            <input name="interests" defaultValue={p.interests.join(", ")} />
          </label>
          <label>
            Portfolio URL
            <input name="portfolioUrl" type="url" defaultValue={p.portfolioUrl ?? ""} />
          </label>
          <label>
            Contact email for employers
            <input name="contactEmail" type="email" defaultValue={p.contactEmail ?? ""} />
          </label>
          <label>
            Discoverable by verified employers
            <select name="discoverable" defaultValue={p.discoverable ? "true" : "false"}>
              <option value="false">No (private)</option>
              <option value="true">Yes</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="small">What verified employers may see</legend>
          {eco.PROFILE_FIELDS.map((f) => (
            <label key={f} className="row small">
              {f}
              <select name={`show_${f}`} defaultValue={p.visible[f] ? "true" : "false"}>
                <option value="false">Hidden</option>
                <option value="true">Visible</option>
              </select>
            </label>
          ))}
        </fieldset>
        <button className="btn btn-primary btn-sm">Save profile</button>
        <p className="small">
          <strong>Evidence-backed skills:</strong> {p.demonstrated.length ? [...new Set(p.demonstrated.map((d) => d.skill))].join(", ") : "none yet — pass graded work to add evidence"}
        </p>
      </form>
      {contacts.length > 0 && (
        <section className="card card-pad stack" aria-labelledby="cc-h">
          <h3 id="cc-h" className="card-title">
            Contact requests
          </h3>
          {contacts.map((c) => (
            <div key={c.id} className="row small">
              <span>
                {c.employer}: “{c.message}” <Chip s={c.state} />
              </span>
              {c.state === "requested" &&
                (["true", "false"] as const).map((v) => (
                  <form key={v} method="post" action={api(slug, "a/eco.answer_contact")}>
                    <Hidden values={{ back: here, notice: v === "true" ? "Accepted — your visible contact details are shared with this employer." : "Declined.", id: c.id, accept: v }} />
                    <button className={`btn btn-sm ${v === "true" ? "btn-primary" : "btn-ghost"}`}>{v === "true" ? "Accept" : "Decline"}</button>
                  </form>
                ))}
            </div>
          ))}
        </section>
      )}
      <section className="stack" aria-labelledby="cm-h">
        <h3 id="cm-h" className="section-title">
          Matches
        </h3>
        {matches.length ? (
          matches.map((m) => (
            <article key={m.id} className="card card-pad stack">
              <h4 className="card-title">
                {m.title} — {m.employer} <span className="badge">{m.match.score}% match</span>
              </h4>
              <p className="tiny muted">{m.employerLabel}</p>
              <ul className="small">
                {m.match.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {m.match.missing.length > 0 && <li>Not yet shown: {m.match.missing.join(", ")}</li>}
              </ul>
              <ApplyForm t={t} o={m} />
            </article>
          ))
        ) : (
          <Empty title="No matches yet.">Add skills or pass graded work; matches use published requirements and your evidence.</Empty>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="ca-h">
        <h3 id="ca-h" className="card-title">
          My applications
        </h3>
        {apps.length ? (
          <ul className="small">
            {apps.map((a) => (
              <li key={a.id}>
                {a.opportunity?.title ?? "—"} <Chip s={a.state} /> {fmt(a.at)} {a.sharedFields.length ? `· shared: ${a.sharedFields.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">None yet.</p>
        )}
      </section>
    </>
  );
}

function ApplyForm({ t, o }: { t: Ctx; o: ReturnType<typeof eco.opportunityView> }) {
  const { slug, here } = t;
  if (o.source !== "employer_posted")
    return (
      <form method="post" action={api(slug, "a/eco.apply")} className="row">
        <Hidden values={{ back: here, notice: "Recorded. Finish your application on the employer's site.", opportunityId: o.id, idempotencyKey: idem() }} />
        {o.applicationUrl && (
          <a className="btn btn-outline btn-sm" href={o.applicationUrl} rel="noopener noreferrer">
            Apply on the official site
          </a>
        )}
        <button className="btn btn-ghost btn-sm">I applied — track it</button>
      </form>
    );
  return (
    <form method="post" action={api(slug, "a/eco.apply")} className="row">
      <Hidden values={{ back: here, notice: "Application sent with the fields you chose.", opportunityId: o.id, idempotencyKey: idem() }} />
      <span className="small">Share:</span>
      {eco.PROFILE_FIELDS.map((f) => (
        <label key={f} className="row small">
          <input type="checkbox" name="share[]" value={f} defaultChecked={f === "headline" || f === "skills"} /> {f}
        </label>
      ))}
      <button className="btn btn-primary btn-sm">Apply</button>
    </form>
  );
}

function Board({ t }: { t: Ctx }) {
  const { store, sp, here } = t;
  const list = eco.listOpportunities(store, { q: sp.q, type: sp.type, remote: sp.remote });
  return (
    <>
      <form method="get" action={here} className="row card card-pad" aria-label="Filter opportunities">
        <label>
          Search
          <input name="q" defaultValue={sp.q ?? ""} />
        </label>
        <label>
          Type
          <select name="type" defaultValue={sp.type ?? ""}>
            <option value="">Any</option>
            {["internship", "apprenticeship", "graduate", "entry_level", "full_time"].map((x) => (
              <option key={x} value={x}>
                {x.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-outline btn-sm">Filter</button>
      </form>
      {list.length ? (
        <ul className="stack" aria-label="Opportunities">
          {list.map((o) => (
            <li key={o.id} className="card card-pad stack">
              <h3 className="card-title">
                {o.title} — {o.employer}
              </h3>
              <p className="tiny muted">
                {o.employerLabel} · {o.type.replace("_", " ")} · {o.location ?? "location not stated"} ({o.remote}) · {o.workEligibility ?? "work eligibility not stated"} · {o.compensation ?? "compensation not published"} · closes {fmt(o.closesAt)} · last verified {fmt(o.lastVerifiedAt)}
              </p>
              {o.skills.length > 0 && <p className="small">Skills: {o.skills.join(", ")}</p>}
              <ApplyForm t={t} o={o} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No open opportunities match.">Closed listings drop out automatically.</Empty>
      )}
    </>
  );
}

function EmployerPortal({ t }: { t: Ctx }) {
  const { store, actor, slug, here, sp } = t;
  const p = eco.employerPortal(store, actor);
  if (!p.employer)
    return (
      <form method="post" action={api(slug, "a/eco.employer_register")} className="card card-pad stack" aria-label="Register your organization">
        <h3 className="card-title">Register your organization</h3>
        <p className="small">Scholarion verifies every employer before it can search learner profiles. Learners decide what you can see.</p>
        <Hidden values={{ back: here, notice: "Registered — Scholarion will verify your organization." }} />
        <label>
          Organization name
          <input name="name" required />
        </label>
        <label>
          Official website
          <input name="website" type="url" required />
        </label>
        <button className="btn btn-primary btn-sm">Register</button>
      </form>
    );
  const verified = p.employer.verification === "verified";
  let talent: ReturnType<typeof eco.talentSearch> = [];
  try {
    talent = verified ? eco.talentSearch(store, actor, { skill: sp.skill }) : [];
  } catch {
    talent = [];
  }
  return (
    <>
      <section className="card card-pad stack">
        <h3 className="card-title">
          {p.employer.name} <span className="badge">{p.employer.label}</span>
        </h3>
        {!verified && <p className="notice notice-info">Verification pending — talent search and applications open once Scholarion verifies your organization.</p>}
      </section>
      {verified && (
        <form method="post" action={api(slug, "a/eco.post_opportunity")} className="card card-pad stack" aria-label="Post an opportunity">
          <h3 className="card-title">Post an opportunity</h3>
          <Hidden values={{ back: here, notice: "Published to the board." }} />
          <div className="grid g2">
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Type
              <select name="type">
                {["internship", "apprenticeship", "graduate", "entry_level", "full_time"].map((x) => (
                  <option key={x} value={x}>
                    {x.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Skills (comma-separated)
              <input name="skills" />
            </label>
            <label>
              Location
              <input name="location" />
            </label>
            <label>
              Compensation (if published)
              <input name="compensation" />
            </label>
            <label>
              Closes
              <input name="closesAt" type="date" />
            </label>
          </div>
          <button className="btn btn-primary btn-sm">Publish</button>
        </form>
      )}
      <section className="card card-pad stack" aria-labelledby="ep-o">
        <h3 id="ep-o" className="card-title">
          Your opportunities
        </h3>
        <ul className="small">
          {p.opportunities.map((o) => (
            <li key={o.id}>
              {o.title} <Chip s={o.status} /> {o.status === "open" && (
                <form method="post" action={api(slug, "a/eco.close_opportunity")} className="inline-form">
                  <Hidden values={{ back: here, notice: "Closed.", id: o.id, reason: "Position filled." }} />
                  <button className="btn btn-ghost btn-sm">Close</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      {verified && (
        <section className="card card-pad stack" aria-labelledby="ep-a">
          <h3 id="ep-a" className="card-title">
            Applications (only the fields each learner chose to share)
          </h3>
          {p.applications.length ? (
            <ul className="small">
              {p.applications.map((a) => (
                <li key={a.id}>
                  {a.opportunity}: {a.headline ?? "headline not shared"} · skills {a.skills ? a.skills.join(", ") : "not shared"} · contact {a.contact ?? "not shared"} <Chip s={a.state} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No applications yet.</p>
          )}
        </section>
      )}
      {verified && (
        <section className="card card-pad stack" aria-labelledby="ep-t">
          <h3 id="ep-t" className="card-title">
            Talent search (opted-in learners only)
          </h3>
          <form method="get" action={here} className="row">
            <label>
              Skill
              <input name="skill" defaultValue={sp.skill ?? ""} />
            </label>
            <button className="btn btn-outline btn-sm">Search</button>
          </form>
          {talent.length ? (
            <ul className="small">
              {talent.map((c) => (
                <li key={c.ref}>
                  <strong>{c.ref}</strong> — {c.headline ?? "headline hidden"} · skills {c.skills ? c.skills.join(", ") : "hidden"} · contact {c.contact ?? "shared only after the learner accepts"}
                  {!c.contact && (
                    <form method="post" action={api(slug, "a/eco.request_contact")} className="inline-form">
                      <Hidden values={{ back: here, notice: "Request sent — the learner decides.", ref: c.ref, message: `${p.employer!.name} would like to discuss an opportunity with you.` }} />
                      <button className="btn btn-ghost btn-sm">Request contact</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No opted-in learners match.</p>
          )}
        </section>
      )}
    </>
  );
}

/* ---------------- admin ---------------- */

function Integrations({ t }: { t: Ctx }) {
  const { store, actor, slug, here } = t;
  const conns = eco.listConnections(store, actor);
  const candidates = eco.listResources(store, actor, { pageSize: 100 }).items;
  return (
    <>
      <p className="small">A catalog listing is not an integration. Connections hold a key-vault reference (never a secret), and health checks run every six hours. Paid services are never enabled automatically.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Connections">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">State</th>
              <th scope="col">Credential</th>
              <th scope="col">Health</th>
            </tr>
          </thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.id}>
                <td>{c.resource}</td>
                <td>{c.label}</td>
                <td>{c.hasCredential ? "key-vault reference" : "none"}</td>
                <td>{c.lastHealthAt ? `${c.lastHealthOk ? "OK" : "failing"} · ${fmt(c.lastHealthAt, true)}` : "not checked yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="post" action={api(slug, "a/eco.connect")} className="card card-pad stack" aria-label="Connect a service">
        <h3 className="card-title">Connect a service</h3>
        <Hidden values={{ back: here, notice: "Connection recorded with its real state.", idempotencyKey: idem() }} />
        <label>
          Service
          <select name="resourceId">
            {candidates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.integrationMethod})
              </option>
            ))}
          </select>
        </label>
        <label>
          Key-vault reference (name only)
          <input name="credentialRef" pattern="[a-z0-9][a-z0-9_.\-]{2,63}" />
        </label>
        <button className="btn btn-primary btn-sm">Connect</button>
      </form>
    </>
  );
}

function EmployerAdmin({ t }: { t: Ctx }) {
  const { store, actor, slug, here } = t;
  const list = eco.listEmployers(store, actor);
  return (
    <ul className="stack" aria-label="Employers">
      {list.map((e) => (
        <li key={e.id} className="card card-pad stack">
          <h3 className="card-title">
            {e.name} <span className="badge">{e.label}</span>
          </h3>
          <p className="small">
            {e.website} · verification <Chip s={e.verification} />
          </p>
          <div className="row">
            {e.verification !== "verified" && (
              <form method="post" action={api(slug, "a/eco.employer_verify")}>
                <Hidden values={{ back: here, notice: "Employer verified.", employerId: e.id, decision: "verified", note: "Website and contact checked by an administrator." }} />
                <button className="btn btn-primary btn-sm">Verify</button>
              </form>
            )}
            {e.verification === "verified" && e.relationship !== "partner" && (
              <form method="post" action={api(slug, "a/eco.employer_partner")} className="row">
                <Hidden values={{ back: here, notice: "Partnership recorded.", employerId: e.id }} />
                <label>
                  Established relationship
                  <input name="note" required placeholder="Agreement, date, contact" />
                </label>
                <button className="btn btn-outline btn-sm">Record partnership</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Automation({ t }: { t: Ctx }) {
  const { store, actor, slug, here } = t;
  const o = eco.automationOverview(store, actor);
  return (
    <>
      <p className="small">Network mode: {o.network}. Jobs run inside fixed permissions without approval gates; they can't add credentials, enable billing or share learner information. Dead-lettered jobs: {o.dead}.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Schedules">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Schedule</th>
              <th scope="col">Cron (time zone)</th>
              <th scope="col">Last success</th>
              <th scope="col">Next run</th>
              <th scope="col">Controls</th>
            </tr>
          </thead>
          <tbody>
            {o.schedules.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.title} {s.paused && <Chip s="paused" />}
                </td>
                <td className="mono small">
                  {s.cron} ({s.timeZone})
                </td>
                <td>{fmt(s.lastSuccessAt, true)}</td>
                <td>{fmt(s.nextRunAt, true)}</td>
                <td className="row">
                  <form method="post" action={api(slug, "a/eco.run_now")}>
                    <Hidden values={{ back: here, notice: "Run started.", id: s.id }} />
                    <button className="btn btn-outline btn-sm">Run now</button>
                  </form>
                  <form method="post" action={api(slug, `a/${s.paused ? "eco.schedule_resume" : "eco.schedule_pause"}`)}>
                    <Hidden values={{ back: here, notice: s.paused ? "Resumed." : "Paused.", id: s.id }} />
                    <button className="btn btn-ghost btn-sm">{s.paused ? "Resume" : "Pause"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card card-pad stack" aria-labelledby="au-j">
        <h3 id="au-j" className="card-title">
          Recent jobs
        </h3>
        {o.jobs.length ? (
          <ul className="small">
            {o.jobs.map((j) => (
              <li key={j.id}>
                <Chip s={j.state} /> {j.kind.replace(/_/g, " ")} ({j.trigger}) · attempt {j.attempts}/{j.maxAttempts} · {j.summary}
                {j.errors.length > 0 && <span className="tiny muted"> — {j.errors.at(-1)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No jobs yet; the first runs at the next scheduled time.</p>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="au-s">
        <h3 id="au-s" className="card-title">
          Trusted sources ({o.sources.length})
        </h3>
        <ul className="small eco-sources">
          {o.sources.map((s) => (
            <li key={s.id}>
              {s.name} <span className="tiny muted">({s.kind}{s.purpose ? `, ${s.purpose}` : ""})</span> {s.enabled ? "" : "— disabled"} {s.lastError ? <span className="tiny muted">— {s.lastError}</span> : null}
            </li>
          ))}
        </ul>
        <form method="post" action={api(slug, "a/eco.source_add")} className="grid g2" aria-label="Add a source">
          <Hidden values={{ back: here, notice: "Source added." }} />
          <label>
            Key
            <input name="key" required />
          </label>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Kind
            <select name="kind">
              <option value="rss">RSS/Atom feed</option>
              <option value="greenhouse">Public Greenhouse job board</option>
              <option value="official_page">Official page</option>
            </select>
          </label>
          <label>
            URL
            <input name="url" type="url" required />
          </label>
          <button className="btn btn-outline btn-sm">Add source</button>
        </form>
      </section>
      <section className="card card-pad stack" aria-labelledby="au-x">
        <h3 id="au-x" className="card-title">
          Verification exceptions ({o.exceptions.length})
        </h3>
        <ul className="small">
          {o.exceptions.map((x) => (
            <li key={x.id}>
              <a href={`${t.base}/tools?r=${x.id}`}>{x.name}</a> <Chip s={x.status} /> {x.reason ?? ""}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Schema({ t }: { t: Ctx }) {
  const { store, sp } = t;
  const first = store.list(eco.T.resources, (r) => r.status === "verified")[0];
  const def = first ? eco.definitionOf(store, first) : null;
  const v = def ? eco.validateDefinition(def) : null;
  return (
    <>
      <p className="small">Versioned schemas (JSON Schema Draft 2020-12, format validation on): {Object.keys(eco.SCHEMAS).join(", ")}. Semantic rules: verified entries need evidence and a date; trials need an expiry or stay pending; API connections need documentation; unknown redistribution blocks full-content import; provider hosts must be trusted; credentials never appear in a definition.</p>
      {def && (
        <section className="card card-pad stack">
          <h3 className="card-title">
            Example: {String(def.name)} — {v?.valid ? "valid" : "invalid"}
          </h3>
          <pre className="mono learn-term-out" tabIndex={0}>
            {JSON.stringify(def, null, 2)}
          </pre>
        </section>
      )}
      <details>
        <summary>Integration Definition schema 1.0.0</summary>
        <pre className="mono learn-term-out" tabIndex={0}>
          {JSON.stringify(eco.SCHEMAS["integration-definition@1.0.0"], null, 2)}
        </pre>
      </details>
      {sp.validated && <p className="notice notice-info">{sp.validated}</p>}
    </>
  );
}
