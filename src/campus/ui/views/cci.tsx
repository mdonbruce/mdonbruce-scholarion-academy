import { CampusError, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import * as C from "../../services/cci";
import { isDesignProgram } from "../../academy/design";
import { programIndex } from "../../services/programs";
import { api, Chip, Denied, Hidden, PageHead } from "../kit";
import { Formats } from "../../../ui/components/formats";

type SP = Record<string, string | undefined>;
interface Ctx {
  store: TenantStore;
  actor: Actor;
  slug: string;
  sp: SP;
  here: string;
}

export const CCI_SECTIONS = [
  { slug: "dashboard", title: "Dashboard" },
  { slug: "programs", title: "Programs & Design Studio" },
  { slug: "course-studio", title: "Course Studio" },
  { slug: "alignment", title: "Alignment Matrix" },
  { slug: "skills", title: "Skills & Roles Map" },
  { slug: "standards", title: "Standards Mapper" },
  { slug: "pathways", title: "Pathways & Consolidation" },
  { slug: "health", title: "Course Health" },
  { slug: "assessment", title: "Assessment Lab" },
  { slug: "freshness", title: "Freshness" },
  { slug: "accessibility", title: "Accessibility" },
  { slug: "proposals", title: "Proposals & Approvals" },
  { slug: "exchange", title: "Curriculum Exchange" },
  { slug: "reports", title: "Reports" },
] as const;

const programs = (t: Ctx) => programIndex(t.store).map((p) => ({ code: p.code, title: p.title }));
const courses = (t: Ctx) => t.store.list("courses", (c) => !!c.code && t.store.list("enrollments", (e) => e.courseId === c.id && e.role === "student").length > 0).slice(0, 40);

export function CciWorkspace({ store, actor, slug, section, sp }: { store: TenantStore; actor: Actor; slug: string; section: string; sp: SP }) {
  if (!hasAny(actor, ["admin", "designer", "instructor", "registrar"])) return <Denied message="Curriculum Intelligence is for curriculum staff." />;
  const sec = CCI_SECTIONS.find((s) => s.slug === section)?.slug ?? "dashboard";
  const base = `/campus/${slug}/cci`;
  const t: Ctx = { store, actor, slug, sp, here: `${base}/${sec}` };
  return (
    <div className="stack campus-hub campus-cci">
      <PageHead title="Curriculum & Course Intelligence" sub="AI drafts, humans decide. Every generated artifact is an AI DRAFT until a reviewer approves it; standards outputs are evidence for review, never compliance claims." />
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
        <nav className="learn-nav" aria-label="Curriculum Intelligence">
          <ol>
            {CCI_SECTIONS.map((s) => (
              <li key={s.slug}>
                <a href={`${base}/${s.slug}`} aria-current={s.slug === sec ? "page" : undefined}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <section className="stack learn-main" aria-labelledby="cci-h">
          <h2 id="cci-h" className="section-title">
            {CCI_SECTIONS.find((s) => s.slug === sec)!.title}
          </h2>
          <Body t={t} sec={sec} />
        </section>
      </div>
    </div>
  );
}

function Body({ t, sec }: { t: Ctx; sec: string }) {
  try {
    switch (sec) {
      case "programs":
        return <Programs t={t} />;
      case "course-studio":
        return <CourseStudio t={t} />;
      case "alignment":
        return <Alignment t={t} />;
      case "skills":
        return <Skills t={t} />;
      case "standards":
        return <Standards t={t} />;
      case "pathways":
        return <Pathways t={t} />;
      case "health":
        return <Health t={t} />;
      case "assessment":
        return <AssessmentLab t={t} />;
      case "freshness":
        return <Freshness t={t} />;
      case "accessibility":
        return <Accessibility t={t} />;
      case "proposals":
        return <Proposals t={t} />;
      case "exchange":
        return <Exchange t={t} />;
      case "reports":
        return <Reports t={t} />;
      default:
        return <Dashboard t={t} />;
    }
  } catch (e) {
    if (e instanceof CampusError) return <p className="notice notice-err">{e.message}</p>;
    throw e;
  }
}

function ProgramPicker({ t, name = "program", label = "Program", value }: { t: Ctx; name?: string; label?: string; value?: string }) {
  return (
    <div className="field">
      <label htmlFor={`pp-${name}`}>{label}</label>
      <select id={`pp-${name}`} name={name} defaultValue={value}>
        {programs(t).map((p) => (
          <option key={p.code} value={p.code}>
            {p.code} {p.title}
          </option>
        ))}
      </select>
    </div>
  );
}

function Dashboard({ t }: { t: Ctx }) {
  const d = C.dashboard(t.store, t.actor);
  const g = C.graph(t.store, t.actor);
  return (
    <>
      <div className="grid g3">
        {[
          ["Programs", d.programs],
          ["Proposals awaiting review", d.proposalsAwaiting],
          ["Open freshness tickets", d.freshnessOpen],
          ["Exchange packages awaiting approval", d.packagesAwaiting],
          ["Framework packs loaded", d.frameworkPacks],
          ["Program drafts", d.drafts],
        ].map(([l, v]) => (
          <div key={String(l)} className="card card-pad">
            <p className="small muted">{l}</p>
            <p className="stat">{v}</p>
          </div>
        ))}
      </div>
      <section className="card card-pad">
        <h3 className="card-title">Knowledge graph</h3>
        <p className="small">
          {g.nodes} nodes and {g.edges} edges: {Object.entries(g.byType).map(([k, v]) => `${v} ${k}`).join(" · ")}.
        </p>
      </section>
      <div className="table-wrap" role="region" aria-label="Design gate summary" tabIndex={0}>
        <table className="table">
          <caption>Design quality gates (#1–#11)</caption>
          <thead>
            <tr>
              <th scope="col">Program</th>
              <th scope="col">Passing</th>
              <th scope="col">Open</th>
              <th scope="col">Failing</th>
            </tr>
          </thead>
          <tbody>
            {d.designGates.map((x) => (
              <tr key={x.code}>
                <th scope="row">
                  {x.code} {x.title}
                </th>
                <td>{x.pass}</td>
                <td>{x.open}</td>
                <td>{x.fail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Programs({ t }: { t: Ctx }) {
  const drafts = t.store.list("cci_drafts", (d) => d.kind === "program").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const latest = drafts[0]?.payload as ReturnType<typeof C.draftProgram> | undefined;
  return (
    <>
      {hasAny(t.actor, ["admin", "designer"]) && (
        <form method="post" action={api(t.slug, "a/cci.draft_program")} className="card card-pad stack">
          <h3 className="card-title">Program Design Studio</h3>
          <Hidden values={{ back: t.here, notice: "Draft created (AI DRAFT). Review it below." }} />
          <div className="grid g2">
            <div className="field">
              <label htmlFor="pd-title">Working title</label>
              <input id="pd-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="pd-aud">Audience</label>
              <input id="pd-aud" name="audience" required placeholder="e.g. operations analysts new to AI" />
            </div>
            <div className="field">
              <label htmlFor="pd-weeks">Length (weeks)</label>
              <input id="pd-weeks" name="weeks" type="number" min={4} max={52} defaultValue={12} />
            </div>
            <div className="field">
              <label htmlFor="pd-del">Delivery</label>
              <select id="pd-del" name="delivery">
                <option>live cohort</option>
                <option>self-paced</option>
                <option>blended</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="pd-skills">Target skills (comma-separated, at least three)</label>
            <input id="pd-skills" name="skills" required />
          </div>
          <div>
            <button className="btn btn-primary btn-sm" type="submit">
              Draft the program
            </button>
          </div>
        </form>
      )}
      {latest && (
        <section className="card card-pad stack">
          <h3 className="card-title">
            {latest.title} <span className="badge badge-amber">AI DRAFT</span>
          </h3>
          <p className="small">
            {latest.standard} · {latest.weeks} weeks · {latest.delivery} · {latest.workload.hoursPerWeek.join("–")} h/week
          </p>
          <ol className="small">
            {latest.outcomes.map((o) => (
              <li key={o.id}>
                {o.text} <span className="muted">({o.bloom})</span>
              </li>
            ))}
          </ol>
          <p className="small">{latest.capstone}</p>
          {latest.overlapFlag && <p className="notice notice-info">{latest.overlapFlag}</p>}
          <p className="small">
            Overlap: {latest.overlap.map((o) => `${o.code} ${o.pct}%`).join(" · ")}. Pathway: {latest.pathway}
          </p>
          <p className="small">
            <strong>Catalog draft:</strong> {latest.catalogDraft}
          </p>
          <p className="small">Claims check: {latest.claims.length ? latest.claims.join("; ") : "passed"}</p>
        </section>
      )}
      <ul className="small">
        {programs(t).map((p) => (
          <li key={p.code}>
            {p.code} {p.title} {isDesignProgram(p.code) && <span className="badge">design package</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function CourseStudio({ t }: { t: Ctx }) {
  return (
    <section className="card card-pad stack">
      <p>Generate courses to the Scholaris course standard and per-module packages:</p>
      <ul>
        <li>
          <a href={`/campus/${t.slug}/t/program-studio`}>Program Studio</a> — design packages for #1–#11 (course standard, editions, notebooks, datasets, quality gate, sign-offs, downloadable package).
        </li>
        <li>
          <a href={`/campus/${t.slug}/t/course-studio`}>Course Studio</a> — source-grounded module outputs (deck, notes, quizzes, mini labs, environments, rubrics, requirement videos).
        </li>
      </ul>
      <p className="small muted">Notebooks are generated here and executed in the Scholarion Cloud Lab; a notebook that hasn't run cleanly keeps the gate open.</p>
    </section>
  );
}

function Alignment({ t }: { t: Ctx }) {
  const code = t.sp.program ?? "#2";
  const al = C.alignment(t.store, t.actor, code);
  const weeks = al.heat[0]?.weeks.map((w) => w.week) ?? [];
  const cell = ["", "I", "D", "M"];
  return (
    <>
      <form method="get" className="row">
        <ProgramPicker t={t} value={code} />
        <button className="btn btn-outline btn-sm" type="submit">
          Show
        </button>
      </form>
      <div className="table-wrap" role="region" aria-label="Coverage heatmap" tabIndex={0}>
        <table className="table cci-heat">
          <caption>Coverage: I = introduced, D = developed, M = mastered (assessed at the competency's Bloom level)</caption>
          <thead>
            <tr>
              <th scope="col">Competency</th>
              {weeks.map((w) => (
                <th scope="col" key={w}>
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {al.heat.map((h) => (
              <tr key={h.outcome}>
                <th scope="row">
                  {h.outcome} <span className="tiny muted">{al.outcomes.find((o) => o.id === h.outcome)?.bloom}</span>
                </th>
                {h.weeks.map((w) => (
                  <td key={w.week} className={`heat-${w.level}`}>
                    {cell[w.level] ?? "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="small">Issues ({al.issues.length})</h3>
      <ul className="small">
        {al.issues.map((i, k) => (
          <li key={k}>
            <strong>{i.kind.replace(/_/g, " ")}</strong> {i.target}: {i.detail} <span className="muted">{i.fix}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Skills({ t }: { t: Ctx }) {
  const m = C.skillsMap(t.store, t.actor);
  return (
    <>
      <p className="small">{m.note}</p>
      <div className="table-wrap" role="region" aria-label="Skills coverage" tabIndex={0}>
        <table className="table">
          <caption>Skills practiced in projects, by program</caption>
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col">Programs</th>
            </tr>
          </thead>
          <tbody>
            {m.skills.slice(0, 60).map((s) => (
              <tr key={s.skill}>
                <th scope="row">{s.skill}</th>
                <td>{s.programs.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="small">Roles where these skills are used</h3>
      <ul className="small">
        {m.roles.map((r) => (
          <li key={r.role}>
            {r.role}: {r.programs.join(", ")}
          </li>
        ))}
      </ul>
      <h3 className="small">Skills taxonomies</h3>
      <ul className="small">
        {m.taxonomies.map((x) => (
          <li key={x.name}>
            {x.name} <Chip s={x.status === "not loaded" ? "pending" : "complete"} /> {x.note}
          </li>
        ))}
      </ul>
    </>
  );
}

function Standards({ t }: { t: Ctx }) {
  const packs = t.store.list("cci_framework_packs");
  const sel = t.sp.packId ?? packs[0]?.id;
  const ev = sel ? C.evidencePack(t.store, t.actor, t.sp.program ?? "#1", String(sel)) : null;
  return (
    <>
      <p className="notice notice-info">Framework packs are loaded and verified by a person from the official source. CCI never invents framework text, and its outputs are evidence for review — never a compliance or accreditation determination.</p>
      {packs.length === 0 ? (
        <p className="small">No framework packs loaded yet.</p>
      ) : (
        <ul className="small">
          {packs.map((p) => (
            <li key={String(p.id)}>
              {String(p.name)} {String(p.version)} ({String(p.publishedOn)}) — verified by {String(p.verifiedBy)} · <a href={String(p.source)}>source</a>
            </li>
          ))}
        </ul>
      )}
      {hasAny(t.actor, ["admin", "registrar"]) && (
        <form method="post" action={api(t.slug, "a/cci.load_framework")} className="card card-pad stack">
          <h3 className="card-title">Load a framework pack</h3>
          <Hidden values={{ back: t.here, notice: "Framework pack loaded." }} />
          <div className="grid g2">
            {(
              [
                ["name", "Name"],
                ["source", "Official source (https://)"],
                ["version", "Version"],
                ["publishedOn", "Published (YYYY-MM-DD)"],
                ["verifiedBy", "Verified by"],
              ] as const
            ).map(([k, l]) => (
              <div className="field" key={k}>
                <label htmlFor={`fp-${k}`}>{l}</label>
                <input id={`fp-${k}`} name={k} required />
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor="fp-items">Items, one per line, as "ID: text" exactly as published</label>
            <textarea id="fp-items" name="items" rows={6} required />
          </div>
          <div>
            <button className="btn btn-outline btn-sm" type="submit">
              Load pack
            </button>
          </div>
        </form>
      )}
      {ev && (
        <section className="card card-pad stack">
          <form method="get" className="row">
            <ProgramPicker t={t} value={t.sp.program ?? "#1"} />
            <input type="hidden" name="packId" value={String(sel)} />
            <button className="btn btn-outline btn-sm" type="submit">
              Crosswalk
            </button>
          </form>
          <p className="small">
            <strong>{ev.label}</strong> {ev.program} × {ev.framework}
          </p>
          <ul className="small">
            {ev.crosswalk.map((c) => (
              <li key={c.item}>
                {c.item}: {c.candidate ?? "no candidate"} ({c.strength})
              </li>
            ))}
          </ul>
          <p className="small">Gaps: {ev.gaps.length ? ev.gaps.join("; ") : "none"}</p>
          <p className="small">{ev.learningHours.note} Estimated learning hours: {ev.learningHours.estimatedTotal}.</p>
        </section>
      )}
    </>
  );
}

function Pathways({ t }: { t: Ctx }) {
  const pairs = C.overlapMatrix(t.store, t.actor, 35);
  return (
    <>
      <p className="small">
        Overlap is measured on titles, outcomes, weekly topics and projects. The full consolidation report and pathway graph are in <a href={`/campus/${t.slug}/t/pathways?run=pathways.consolidation_report`}>Pathways & Transfer</a>.
      </p>
      <div className="table-wrap" role="region" aria-label="Overlap" tabIndex={0}>
        <table className="table">
          <caption>Program pairs overlapping by 35% or more</caption>
          <thead>
            <tr>
              <th scope="col">Programs</th>
              <th scope="col">Overlap</th>
              <th scope="col">Shared terms</th>
              <th scope="col">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {pairs.slice(0, 40).map((p, i) => (
              <tr key={i}>
                <td>
                  {p.a}
                  <br />
                  {p.b}
                </td>
                <td>{p.pct}%</td>
                <td className="small">{p.shared.join(", ")}</td>
                <td>{p.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CoursePicker({ t, value }: { t: Ctx; value?: string }) {
  return (
    <form method="get" className="row">
      <label htmlFor="cp-c">Course</label>
      <select id="cp-c" name="courseId" defaultValue={value}>
        {courses(t).map((c) => (
          <option key={String(c.id)} value={String(c.id)}>
            {String(c.code)} {String(c.title)}
          </option>
        ))}
      </select>
      <button className="btn btn-outline btn-sm" type="submit">
        Show
      </button>
    </form>
  );
}

function Health({ t }: { t: Ctx }) {
  const cid = t.sp.courseId ?? String(courses(t)[0]?.id ?? "");
  if (!cid) return <p className="small">No courses with learners yet.</p>;
  const h = C.courseHealth(t.store, t.actor, cid);
  return (
    <>
      <CoursePicker t={t} value={cid} />
      <p>
        <strong>{h.course}</strong> · {h.learners} learners · health score {h.score ?? "not enough data"}
      </p>
      <p className="small muted">{h.explanation}</p>
      {h.alerts.length > 0 && (
        <ul className="small">
          {h.alerts.map((x) => (
            <li key={x}>
              <span className="badge badge-amber">alert</span> {x}
            </li>
          ))}
        </ul>
      )}
      <div className="table-wrap" role="region" aria-label="Module completion" tabIndex={0}>
        <table className="table">
          <caption>Module completion and drop-off</caption>
          <thead>
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Completed</th>
              <th scope="col">Drop-off</th>
            </tr>
          </thead>
          <tbody>
            {h.completion.map((m, i) => (
              <tr key={m.module}>
                <th scope="row">{m.module}</th>
                <td>{m.completed}</td>
                <td>{h.dropOff[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">Mastery: {h.mastery.length ? h.mastery.map((m) => `${m.competency} ${m.masteryPct}% (${m.learnersAttempts})`).join(" · ") : "no graded competency data yet"}. Not measured: {h.notMeasured.join("; ")}.</p>
    </>
  );
}

function AssessmentLab({ t }: { t: Ctx }) {
  const cid = t.sp.courseId ?? String(courses(t)[0]?.id ?? "");
  if (!cid) return <p className="small">No courses with learners yet.</p>;
  const r = C.itemAnalysis(t.store, t.actor, cid);
  return (
    <>
      <CoursePicker t={t} value={cid} />
      <p className="small">
        {r.attempts} graded attempts · AI-use policy stated on {r.aiUsePolicyCoverage ?? "—"}% of items · authentic-assessment ratio {r.authenticRatio ?? "—"}%. {r.method}
      </p>
      {r.items.length === 0 ? (
        <p className="small">No graded quiz attempts yet.</p>
      ) : (
        <div className="table-wrap" role="region" aria-label="Item analysis" tabIndex={0}>
          <table className="table">
            <caption>Item analysis</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Responses</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Discrimination</th>
                <th scope="col">Flag</th>
              </tr>
            </thead>
            <tbody>
              {r.items.slice(0, 50).map((i) => (
                <tr key={i.questionId}>
                  <th scope="row" className="small">
                    {i.prompt}
                  </th>
                  <td>{i.responses}</td>
                  <td>{i.difficulty ?? "—"}</td>
                  <td>{i.discrimination ?? "—"}</td>
                  <td>{i.flag ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Freshness({ t }: { t: Ctx }) {
  const open = t.store.list("cci_freshness_tickets", (x) => x.state === "open");
  return (
    <>
      <form method="post" action={api(t.slug, "a/cci.freshness_scan")}>
        <Hidden values={{ back: t.here, notice: "Freshness scan complete." }} />
        <button className="btn btn-outline btn-sm" type="submit">
          Run the Freshness Sentinel
        </button>
      </form>
      <p className="small muted">Uses the Free Education Resource Hub's verification dates and status. Pinned lab environments are never updated automatically.</p>
      {open.length === 0 ? (
        <p className="small">No open tickets.</p>
      ) : (
        <ul className="small">
          {open.map((x) => (
            <li key={String(x.id)}>
              <strong>{String(x.subject)}</strong> — {String(x.reason)}. Impact: {((x.impact as { program: string }[]) ?? []).map((i) => i.program).join(", ") || "no program names it"}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Accessibility({ t }: { t: Ctx }) {
  const r = C.accessibilityAudit(t.store, t.actor, t.sp.courseId);
  return (
    <>
      <p className="small">
        {r.checked} pages and media checked · pass rate {r.score ?? "—"}%. {r.note}
      </p>
      <ul className="small">
        {r.issues.slice(0, 60).map((i, k) => (
          <li key={k}>
            {i.where}: {i.issue} — <span className="muted">{i.fix}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Proposals({ t }: { t: Ctx }) {
  const ps = t.store.list("cci_proposals").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return (
    <>
      <p className="small">
        States: {C.STATES.join(" → ")}. The person or agent that created a proposal can't approve it; a different reviewer approves each stage. Changes apply to the next cohort unless marked urgent.
      </p>
      <form method="post" action={api(t.slug, "a/cci.propose_from_signals")}>
        <Hidden values={{ back: t.here, show_result: "1" }} />
        <button className="btn btn-outline btn-sm" type="submit">
          Draft proposals from signals
        </button>
      </form>
      {ps.length === 0 ? (
        <p className="small">No proposals yet.</p>
      ) : (
        ps.slice(0, 40).map((p) => (
          <article key={String(p.id)} className="card card-pad stack">
            <p>
              <strong>{String(p.title)}</strong> <Chip s={String(p.state) === "Published" ? "published" : String(p.state) === "AI Draft" ? "draft" : "pending"} /> <span className="small">{String(p.state)}</span> {p.releaseVersion ? <span className="badge">{String(p.releaseVersion)}</span> : null}
            </p>
            <p className="small">{String(p.rationale)}</p>
            <p className="tiny muted">
              Created by {String(p.createdBy)} · history: {((p.history as { state: string; by: string }[]) ?? []).map((h) => `${h.state} (${h.by})`).join(" → ")}
            </p>
            {!["Published", "Retired"].includes(String(p.state)) && (
              <form method="post" action={api(t.slug, "a/cci.advance")} className="row">
                <Hidden values={{ back: t.here, proposalId: String(p.id) }} />
                <label className="sr-only" htmlFor={`pn-${p.id}`}>
                  Review note
                </label>
                <input id={`pn-${p.id}`} name="note" placeholder="Review note" />
                <button className="btn btn-primary btn-sm" type="submit" name="action" value="approve">
                  Approve stage
                </button>
                <button className="btn btn-ghost btn-sm" type="submit" name="action" value="return">
                  Return for revision
                </button>
              </form>
            )}
          </article>
        ))
      )}
    </>
  );
}

function Exchange({ t }: { t: Ctx }) {
  const ex = C.exchangeAudit(t.store, t.actor);
  return (
    <>
      <p className="notice notice-info">{ex.statement} Packages carry curriculum only — never learner data, grades, identities, analytics, tutor memory or issued credentials. Credit status stays explicit; Academy content is non-credit.</p>
      {hasAny(t.actor, ["admin", "designer", "registrar"]) && (
        <div className="grid g2">
          <form method="post" action={api(t.slug, "a/cci.exchange_import")} className="card card-pad stack">
            <h3 className="card-title">Import a package</h3>
            <Hidden values={{ back: t.here, show_result: "1" }} />
            <div className="field">
              <label htmlFor="ex-man">Package manifest (JSON)</label>
              <textarea id="ex-man" name="manifest" rows={6} required />
            </div>
            <div>
              <button className="btn btn-outline btn-sm" type="submit">
                Run the import pipeline
              </button>
            </div>
          </form>
          <form method="post" action={api(t.slug, "a/cci.exchange_export")} className="card card-pad stack">
            <h3 className="card-title">Export an Academy program</h3>
            <Hidden values={{ back: t.here, keepScholarionBranding: "true", show_result: "1" }} />
            <ProgramPicker t={t} />
            <div className="field">
              <label htmlFor="ex-partner">Partner institution</label>
              <input id="ex-partner" name="partnerLabel" placeholder="Partner institution" />
            </div>
            <div>
              <button className="btn btn-outline btn-sm" type="submit">
                Prepare export (needs approval)
              </button>
            </div>
          </form>
        </div>
      )}
      {ex.packages.map((p) => (
        <article key={String(p.id)} className="card card-pad stack">
          <p>
            <strong>{String(p.title)}</strong> {String(p.version ?? "")} · {String(p.direction)} · {String(p.credit ?? "—")} <Chip s={p.state === "approved" ? "approved" : p.state === "rejected" ? "rejected" : "pending"} />
          </p>
          <ul className="tiny">
            {((p.steps as { step: string; ok: boolean; detail: string }[]) ?? []).map((s) => (
              <li key={s.step}>
                {s.ok ? "✓" : "✗"} {s.step}: {s.detail}
              </li>
            ))}
          </ul>
          {p.state === "awaiting_approval" && hasAny(t.actor, ["admin"]) && (
            <form method="post" action={api(t.slug, "a/cci.exchange_approve")}>
              <Hidden values={{ back: t.here, packageId: String(p.id) }} />
              <button className="btn btn-primary btn-sm" type="submit">
                Approve as Exchange Approver
              </button>
            </form>
          )}
        </article>
      ))}
    </>
  );
}

function Reports({ t }: { t: Ctx }) {
  return (
    <>
      <p className="small">Program review reports combine competencies, alignment issues, the quality gate, overlap and credit status. Each downloads as PDF, Word or Excel.</p>
      <ul className="small">
        {programs(t).map((p) => {
          const href = api(t.slug, `cci/reports/${p.code.replace("#", "")}.html`);
          return (
            <li key={p.code}>
              <a href={href}>
                {p.code} {p.title} — program review
              </a>{" "}
              <Formats href={href} name={`${p.code} program review`} label="" />
            </li>
          );
        })}
      </ul>
    </>
  );
}
