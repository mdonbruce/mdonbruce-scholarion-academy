import { getProfile, REBUILD_TARGETS } from "../../services/studio";
import crypto from "node:crypto";
import { downloadUrl } from "../../services/files";
import { acceptAttr, attachmentsFor, formatList, formatsFor } from "../../services/uploads";
import { Formats } from "../../../ui/components/formats";
import { CampusError, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { FacultyCard } from "../../../ui/components/faculty";
import { AI801_ACTIVITY, AI801_TOPICS } from "../../academy/ai801";
import { AI801_LAB_KEY, AI801_PROJECT_KEY, AI801_RUNNER_ITEM_KEY, AI801_RUNNER_LAB_KEY } from "../../academy/ai801-seed";
import * as G from "../../services/graded";
import * as studio from "../../services/studio";
import * as W from "../../services/workspace";
import { runnerStatus } from "../../services/runnerclient";
import * as eco from "../../services/ecosystem";
import { hasPin } from "../../services/projection";
import { LEARN_SECTIONS, learnOverview, type LearnOverview, type LearnSection } from "../../services/learnarea";
import { api, Chip, Denied, Empty, fmt, Hidden, PageHead } from "../kit";

type SP = Record<string, string | undefined>;
interface Ctx {
  store: TenantStore;
  actor: Actor;
  slug: string;
  sp: SP;
  v: LearnOverview;
  base: string;
  here: string;
}

export const INSTRUCTOR_BANNER = "INSTRUCTOR MODE — Answer keys and control panel are visible. Switch to Student View before projecting student work.";

const key = () => crypto.randomUUID();
const parse = <T,>(s: string | undefined): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** The Scholarion hosted learning area for one course. */
export function LearnArea({ store, actor, slug, courseId, section, sp }: { store: TenantStore; actor: Actor; slug: string; courseId: string; section: string; sp: SP }) {
  let v: LearnOverview;
  try {
    v = learnOverview(store, actor, courseId);
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  const sec = (LEARN_SECTIONS.find((s) => s.slug === section)?.slug ?? "dashboard") as LearnSection;
  const base = `/campus/${slug}/learn/${courseId}`;
  const t: Ctx = { store, actor, slug, sp, v, base, here: `${base}/${sec}` };
  const visible = LEARN_SECTIONS.filter((s) => !("staff" in s) || v.staff);
  const title = LEARN_SECTIONS.find((s) => s.slug === sec)!.title;
  return (
    <div className="stack campus-learn">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={`/campus/${slug}/courses`}>Courses</a> › <a href={`/campus/${slug}/courses/${courseId}`}>{v.course.code}</a> › <span aria-current="page">Learning area</span>
      </nav>
      <PageHead title={`${v.course.code} ${v.course.title}`} sub={v.course.program && v.course.program !== "Scholarion Agentic Cloud Labs" ? `${v.course.program} · Scholarion Agentic Cloud Labs` : "Scholarion Agentic Cloud Labs · Hosted learning area"}>
        <a className="btn btn-ghost btn-sm" href={`/campus/${slug}/courses/${courseId}`}>
          Course home
        </a>
      </PageHead>
      {v.staff && sec === "instructor" && !v.lock.locked && (
        <p className="notice notice-warn learn-instructor-banner" role="alert">
          <strong>{INSTRUCTOR_BANNER}</strong>
        </p>
      )}
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
        <nav className="learn-nav" aria-label="Learning area">
          <ol>
            {visible.map((s) => (
              <li key={s.slug}>
                <a href={`${base}/${s.slug}`} aria-current={s.slug === sec ? "page" : undefined}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <main className="stack learn-main" aria-labelledby="learn-h">
          <h2 id="learn-h" className="section-title">
            {title}
          </h2>
          <Section t={t} sec={sec} />
        </main>
      </div>
    </div>
  );
}

function Section({ t, sec }: { t: Ctx; sec: LearnSection }) {
  switch (sec) {
    case "dashboard":
      return <Dashboard t={t} />;
    case "modules":
      return <Modules t={t} />;
    case "sources":
      return <Sources t={t} />;
    case "lecture-studio":
      return <LectureStudio t={t} />;
    case "cloud-labs":
      return <CloudLabs t={t} />;
    case "mini-labs":
      return <ItemsSection t={t} kinds={["minilab"]} intro="Short, scaffolded labs — two per topic. Practise as often as you like; two graded attempts per mini-lab, best counts." />;
    case "activities":
      return <Activities t={t} />;
    case "assignments":
      return <ItemsSection t={t} kinds={["project", "worksheet"]} intro="Graded assignments and projects. Rubrics, mandatory criteria and the pass mark are published before you start." />;
    case "quizzes":
      return <Quizzes t={t} />;
    case "workspaces":
      return <Workspaces t={t} />;
    case "demos":
      return <Demos t={t} />;
    case "gradebook":
      return <Gradebook t={t} />;
    case "instructor":
      return <Instructor t={t} />;
    case "environment":
      return <Environment t={t} />;
    case "outputs":
      return <Outputs t={t} />;
  }
}

/* ---------------- dashboard & modules ---------------- */

function Dashboard({ t }: { t: Ctx }) {
  const { v, base } = t;
  const passed = v.items.filter((i) => i.best?.passed).length;
  const next = v.items.find((i) => !i.best?.passed && i.attemptsRemaining > 0);
  return (
    <>
      <div className="grid g2">
        <section className="card card-pad stack" aria-labelledby="ld-fac">
          <h3 id="ld-fac" className="card-title">
            Lead faculty
          </h3>
          <FacultyCard compact />
        </section>
        <section className="card card-pad stack" aria-labelledby="ld-prog">
          <h3 id="ld-prog" className="card-title">
            {v.staff ? "Course at a glance" : "Your progress"}
          </h3>
          {v.staff ? (
            <p className="small">
              {v.items.length} graded items · {v.gradebook.rows.length} learners · {v.gradebook.failedPostings} failed postings · answers {v.lock.locked ? "locked" : "unlocked"}
            </p>
          ) : (
            <>
              <p className="big-num">
                {passed} / {v.items.length}
              </p>
              <p className="small">graded items passed (pass mark 70%)</p>
              {next && (
                <p className="small">
                  Next: <a href={`${base}/${sectionFor(next.kind)}?item=${next.id}`}>{next.title}</a>
                </p>
              )}
            </>
          )}
        </section>
      </div>
      {v.module && (
        <section className="card card-pad stack" aria-labelledby="ld-mod">
          <h3 id="ld-mod" className="card-title">
            Module {v.module.number}: {v.module.title}
          </h3>
          <ul className="small">
            {v.module.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="card card-pad stack" aria-labelledby="ld-how">
        <h3 id="ld-how" className="card-title">
          How this course works
        </h3>
        <ul className="small">
          <li>Practice is unlimited and never uses an attempt or posts a grade.</li>
          <li>Each graded item allows two attempts. Your highest valid attempt is recorded; quiz attempt 2 uses different question variants.</li>
          <li>If the grading environment fails, the attempt is not counted — submit again.</li>
          <li>Labs run autonomously in a simulated sandbox. There are no approval gates; the lab policy blocks anything outside the permitted tools, files, network and budget.</li>
          <li>Results post automatically to the gradebook and your competency passbook.</li>
        </ul>
      </section>
    </>
  );
}

const sectionFor = (kind: string) => (kind === "minilab" ? "mini-labs" : kind === "quiz" ? "quizzes" : "assignments");

function Modules({ t }: { t: Ctx }) {
  const { v, base } = t;
  if (!v.module) return <Empty title="No modules in the learning area yet." />;
  return (
    <>
      <section className="card card-pad stack">
        <h3 className="card-title">
          Module {v.module.number}: {v.module.title}
        </h3>
        <p className="small muted">Folder: Scholarion_Academy/{v.course.program.replace(/\W+/g, "_")}/{v.course.code.replace(/\W+/g, "_")}/Module_01/</p>
      </section>
      {v.topics.map((tp) => (
        <section key={tp.key} className="card card-pad stack" aria-label={tp.title}>
          <h3 className="card-title">{tp.title}</h3>
          <p className="small">
            {tp.lo} · Competency {tp.competency}
          </p>
          <ul className="small">
            {v.items
              .filter((i) => i.topic === tp.title)
              .map((i) => (
                <li key={i.id}>
                  <a href={`${base}/mini-labs?item=${i.id}`}>{i.title}</a> {i.best ? <Chip s={i.best.passed ? "pass" : "not_yet"} /> : null}
                </li>
              ))}
            {v.runs
              .filter((r) => r.topic === tp.title)
              .map((r) => (
                <li key={r.id}>
                  <a href={`${base}/outputs?run=${r.id}`}>Studio package (notes, deck, flashcards, practice quiz)</a> <Chip s={r.reviewState} />
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section className="card card-pad stack">
        <h3 className="card-title">Module assessments</h3>
        <ul className="small">
          {v.items
            .filter((i) => !i.topic)
            .map((i) => (
              <li key={i.id}>
                <a href={`${base}/${sectionFor(i.kind)}?item=${i.id}`}>{i.title}</a> {i.best ? <Chip s={i.best.passed ? "pass" : "not_yet"} /> : null}
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}

function Sources({ t }: { t: Ctx }) {
  const { v, slug, here } = t;
  return (
    <>
      <FreeResources t={t} />
      <p className="small">Instructor-supplied sources ground every Studio output. Anything added beyond them is marked “[Supplemental — verify]”. Source text is data and never changes settings.</p>
      {v.sources.length ? (
        <ul className="stack" aria-label="Sources">
          {v.sources.map((s) => (
            <li key={s.id} className="card card-pad stack">
              <p className="card-title">
                {s.title} <Chip s={s.status} />
              </p>
              <p className="tiny muted">
                {s.topic} · {s.kind}
                {s.author ? ` · ${s.author}` : ""}
                {s.year ? ` (${s.year})` : ""}
              </p>
              {s.reason ? <p className="small">Unavailable: {s.reason}</p> : <p className="small">{s.excerpt}…</p>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No sources yet." />
      )}
      {v.staff && (
        <form method="post" action={api(slug, "a/studio.add_source")} className="card card-pad stack" aria-label="Add a source">
          <h3 className="card-title">Add a source</h3>
          <Hidden values={{ back: here, notice: "Source added.", courseKey: v.course.id, module: "1" }} />
          <label>
            Topic
            <select name="topic">
              {v.topics.map((tp) => (
                <option key={tp.key}>{tp.title}</option>
              ))}
              <option>Module overview</option>
            </select>
          </label>
          <label>
            Kind
            <select name="kind">
              <option value="text">Pasted notes</option>
              <option value="url">Web page (URL)</option>
            </select>
          </label>
          <label>
            Title
            <input name="title" />
          </label>
          <label>
            URL (for web pages)
            <input name="url" type="url" />
          </label>
          <label>
            Text (for pasted notes)
            <textarea name="body" rows={5} />
          </label>
          <button className="btn btn-primary btn-sm" type="submit">
            Add source
          </button>
        </form>
      )}
    </>
  );
}

function FreeResources({ t }: { t: Ctx }) {
  let rows: ReturnType<typeof eco.courseResources> = [];
  try {
    rows = eco.courseResources(t.store, t.actor, t.v.course.id);
  } catch {
    rows = [];
  }
  if (!rows.length) return null;
  return (
    <section className="card card-pad stack" aria-labelledby="fr-h">
      <h3 id="fr-h" className="card-title">
        Free external resources for this course
      </h3>
      <ul className="small">
        {rows.map((m) => (
          <li key={m.mappingId}>
            <a href={`/campus/${t.slug}/hub/tools?r=${m.resource.id}`}>{m.resource.name}</a> {m.topic ? `· ${m.topic}` : ""} — {m.resource.classificationLabel}, {m.resource.status === "verified" ? `verified ${fmt(m.resource.verifiedAt)}` : m.resource.status}
            {m.flagged ? ` ⚠ ${m.flagReason}` : ""}
            {m.note && <span className="tiny muted"> — {m.note}</span>}
          </li>
        ))}
      </ul>
      <p className="tiny muted">External resources never change grading, use assessment attempts or grant Scholarion certificates. Opening one isn't recorded as completion.</p>
    </section>
  );
}

/* ---------------- Studio ---------------- */

function runOf(t: Ctx, runId: string | undefined) {
  if (!runId) return null;
  try {
    return { status: t.v.staff ? studio.getRunStatus(t.store, t.actor, runId) : null, outputs: studio.listOutputs(t.store, t.actor, runId) };
  } catch {
    return null;
  }
}

function LectureStudio({ t }: { t: Ctx }) {
  const { v, slug, here, base } = t;
  return (
    <>
      <p className="small">One source-grounded package per topic: a 10-slide deck with speaker notes, cover variants A and B with the approved faculty photograph, notes, study guide, mind map, infographic, flashcards, practice quiz, two mini-labs, environment templates, rubrics, audio and video scripts. Every file is labelled “AI DRAFT — requires instructor review before release.” Learners see a package only after an instructor releases it.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Topic packages">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Package</th>
              <th scope="col">Review</th>
              {v.staff && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {v.topics.map((tp) => {
              const r = v.runs.find((x) => x.topic === tp.title);
              return (
                <tr key={tp.key}>
                  <td>{tp.title}</td>
                  <td>{r ? <a href={`${base}/outputs?run=${r.id}`}>v{r.version} · {r.state.replace(/_/g, " ")}</a> : <span className="muted">Not generated</span>}</td>
                  <td>{r ? <Chip s={r.reviewState} /> : "—"}</td>
                  {v.staff && (
                    <td className="row">
                      {!r && (
                        <form method="post" action={api(slug, "a/studio.start")}>
                          <Hidden values={{ back: here, notice: `Generated the ${tp.title} package.`, courseId: v.course.id, topicKey: tp.key }} />
                          <button className="btn btn-primary btn-sm">Generate</button>
                        </form>
                      )}
                      {r && r.state === "failed" && (
                        <form method="post" action={api(slug, "a/studio.resume")}>
                          <Hidden values={{ back: here, notice: "Resumed from the failed step.", runId: r.id }} />
                          <button className="btn btn-outline btn-sm">Resume</button>
                        </form>
                      )}
                      {r && (
                        <form method="post" action={api(slug, "a/studio.regenerate")}>
                          <Hidden values={{ back: here, notice: "New version generated (your edits were kept).", runId: r.id }} />
                          <button className="btn btn-ghost btn-sm">Regenerate</button>
                        </form>
                      )}
                      {r && r.state !== "failed" && (
                        <form method="post" action={api(slug, "a/studio.render_media")}>
                          <Hidden values={{ back: here, notice: "Narration is rendering in the background (about a minute or two). Review the media, then release.", runId: r.id }} />
                          <button className="btn btn-ghost btn-sm">Render narration</button>
                        </form>
                      )}
                      {r && r.reviewState !== "released" && (
                        <form method="post" action={api(slug, "a/studio.release")}>
                          <Hidden values={{ back: here, notice: "Released to learners.", runId: r.id }} />
                          <button className="btn btn-outline btn-sm">Release</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {v.staff &&
        (() => {
          const runIds = new Set(v.runs.map((x) => x.id));
          const jobs = t.store.list("async_jobs", (j) => j.kind === "studio_narration" && runIds.has(String((j.params as { runId?: string })?.runId))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
          return jobs.length ? (
            <section className="card card-pad stack" aria-labelledby="ls-nar" aria-live="polite">
              <h3 id="ls-nar" className="card-title">
                Narration rendering
              </h3>
              <ul className="small">
                {jobs.map((j) => (
                  <li key={j.id}>
                    {String(v.runs.find((x) => x.id === (j.params as { runId: string }).runId)?.topic ?? "")}: <Chip s={String(j.state)} /> {j.state === "running" ? "synthesizing and encoding — refresh in a minute or two" : ((j.issues as { path?: string; message?: string }[]) ?? []).map((x) => `${x.path ?? ""} ${x.message ?? ""}`).join("; ")}
                  </li>
                ))}
              </ul>
              <p className="tiny muted">Voices are synthetic (offline text-to-speech) and labelled as such; they never imitate a real person.</p>
            </section>
          ) : null;
        })()}
      {v.staff && (
        <section className="card card-pad stack" aria-labelledby="ls-up">
          <h3 id="ls-up" className="card-title">
            Design samples (configuration required)
          </h3>
          <p className="small">No Scholarion cover samples, video sample or logo have been supplied, so covers use a provisional Scholarion design and say so. Upload them here to replace it; they are stored as course files and used on the next regeneration.</p>
          <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row">
            <Hidden values={{ back: here, courseId: v.course.id, purpose: "studio_design_sample" }} />
            <label>
              Cover sample, video sample or logo
              <input type="file" name="file" accept="image/png,image/jpeg,image/svg+xml,video/mp4" />
            </label>
            <button className="btn btn-outline btn-sm">Upload sample</button>
          </form>
        </section>
      )}
      {v.staff && <BrandingProfile t={t} />}
    </>
  );
}

function Outputs({ t }: { t: Ctx }) {
  const { v, slug, sp } = t;
  const runId = sp.run ?? v.runs[0]?.id;
  const r = runOf(t, runId);
  if (!v.runs.length) return <Empty title="No released Studio packages yet.">{v.staff ? "Generate one in the Lecture Studio." : "Your instructor releases packages after review."}</Empty>;
  const groups = new Map<string, NonNullable<typeof r>["outputs"]>();
  for (const o of r?.outputs ?? []) {
    const folder = String(o.relPath).includes("/") ? String(o.relPath).split("/")[0] : "Package";
    groups.set(folder, [...(groups.get(folder) ?? []), o]);
  }
  return (
    <>
      <nav className="row" aria-label="Packages">
        {v.runs.map((x) => (
          <a key={x.id} className="btn btn-ghost btn-sm" aria-current={x.id === runId ? "page" : undefined} href={`${t.here}?run=${x.id}`}>
            {x.topic}
          </a>
        ))}
      </nav>
      {r ? (
        <>
          <p className="row">
            <a className="btn btn-outline btn-sm" href={api(slug, `learn/${v.course.id}/studio/${runId}/bundle.zip`)}>
              Download {v.staff ? "full" : "learner"} bundle (.zip)
            </a>
            <a className="btn btn-ghost btn-sm" href={api(slug, `learn/${v.course.id}/studio-module/1/bundle.zip`)}>
              Module folder (00_Cover … 17_Requirements_Videos + manifest)
            </a>
            {v.staff && (
              <a className="btn btn-ghost btn-sm" href={api(slug, `learn/${v.course.id}/studio/${runId}/lms.imscc`)}>
                Export LMS package (.imscc)
              </a>
            )}
            {v.staff && <span className="small">Instructor files: {v.lock.locked ? "locked by the projection lock" : "unlocked"}</span>}
          </p>
          {v.staff && (
            <form method="post" action={api(slug, "a/studio.rebuild")} className="row" aria-label="Rebuild part of this package">
              <Hidden values={{ back: `${t.here}?run=${runId}`, notice: "Rebuilt. The QA report and manifest were refreshed.", runId: String(runId) }} />
              <label>
                Rebuild only
                <select name="target" defaultValue="cover_b">
                  {Object.entries(REBUILD_TARGETS).map(([k, x]) => (
                    <option key={k} value={k}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-outline btn-sm">Rebuild</button>
              <span className="tiny muted">Edited files are kept; released versions are never changed in place.</span>
            </form>
          )}
          {[...groups.entries()].map(([folder, files]) => (
            <section key={folder} className="card card-pad stack" aria-label={folder}>
              <h3 className="card-title">{folder.replace(/_/g, " ")}</h3>
              <ul className="small learn-files">
                {files.map((o) => (
                  <li key={String(o.id)}>
                    <a href={api(slug, `learn/${v.course.id}/outputs/${o.id}`)}>{String(o.relPath).split("/").slice(1).join("/") || String(o.relPath)}</a> <Chip s={String(o.status)} />{/\.(html?|md|csv|txt|json)$/i.test(String(o.relPath)) && String(o.status) === "ready" && <Formats href={api(slug, `learn/${v.course.id}/outputs/${o.id}`)} name={String(o.relPath).split("/").pop() ?? "Output"} label="" />} {o.access === "instructor" && <span className="badge">instructor</span>}
                    {o.reason ? <span className="tiny muted"> — {String(o.reason)}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <Empty title="This package isn't available to you." />
      )}
    </>
  );
}

/* ---------------- graded items ---------------- */

function ItemsSection({ t, kinds, intro }: { t: Ctx; kinds: string[]; intro: string }) {
  const { v, sp } = t;
  const items = v.items.filter((i) => kinds.includes(i.kind));
  const sel = sp.item ? items.find((i) => i.id === sp.item) : null;
  return (
    <>
      <p className="small">{intro}</p>
      <ItemList t={t} items={items} />
      {sel && <ItemPanel t={t} itemId={sel.id} />}
    </>
  );
}

function ItemList({ t, items }: { t: Ctx; items: LearnOverview["items"] }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Graded items">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Topic</th>
            <th scope="col">Attempts</th>
            <th scope="col">Best</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <a href={`${t.here}?item=${i.id}`} aria-current={t.sp.item === i.id ? "true" : undefined}>
                  {i.title}
                </a>
              </td>
              <td>{i.topic ?? "Module"}</td>
              <td>
                {i.attemptsUsed} of {i.maxAttempts}
              </td>
              <td>{i.best ? <>{i.best.score}% <Chip s={i.best.passed ? "pass" : "not_yet"} /></> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemPanel({ t, itemId }: { t: Ctx; itemId: string }) {
  const { store, actor, slug, sp } = t;
  let it: ReturnType<typeof G.itemView>;
  try {
    it = G.itemView(store, actor, itemId);
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : String(e)} />;
  }
  const here = `${t.here}?item=${it.id}`;
  const practice = parse<{ score: number; results: { id: string; ok: boolean; hint: string | null }[]; note: string }>(sp.result);
  const lastSub = sp.sub ? it.submissions.find((s) => s.id === sp.sub) : null;
  let review: ReturnType<typeof G.reviewAnswers> | null = null;
  let reviewErr: string | null = null;
  if (sp.review) {
    try {
      review = G.reviewAnswers(store, actor, sp.review);
    } catch (e) {
      reviewErr = e instanceof CampusError ? e.message : String(e);
    }
  }
  const learner = !it.isStaff;
  const isProject = it.kind === "project";
  const labKeyFor = it.key === AI801_RUNNER_ITEM_KEY ? AI801_RUNNER_LAB_KEY : AI801_LAB_KEY;
  const workspaces = isProject ? W.listMyWorkspaces(store, actor, t.v.course.id).filter((w) => w.labKey === labKeyFor) : [];
  const fb = (id: string) => practice?.results.find((r) => r.id === id);
  return (
    <section className="card card-pad stack learn-item" aria-labelledby="li-h">
      <h3 id="li-h" className="card-title">
        {it.title}
      </h3>
      <p className="small">{it.instructions}</p>
      <p className="small">
        Pass mark <strong>{it.passMark}%</strong>
        {it.mandatory.length ? (
          <>
            {" "}
            · Mandatory: <strong>{it.mandatory.join(", ")}</strong>
          </>
        ) : null}{" "}
        · Attempts {it.attemptsUsed} of {it.maxAttempts} · Counts: {it.gradingPolicy === "latest" ? "latest attempt" : "highest attempt"}
        {it.dueAt ? ` · Due ${fmt(it.dueAt, true)}` : ""} · Version {it.version} · AI use: {it.aiPolicy}
      </p>
      <details>
        <summary>Rubric</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Rubric">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Points</th>
                <th scope="col">Levels</th>
                <th scope="col">Evidence</th>
                <th scope="col">LO</th>
              </tr>
            </thead>
            <tbody>
              {it.rubric.map((c) => (
                <tr key={c.key}>
                  <td>
                    <strong>{c.label}</strong>
                    {c.mandatory ? " (mandatory)" : ""}
                    <br />
                    <span className="tiny">{c.description}</span>
                  </td>
                  <td>{c.points}</td>
                  <td className="tiny">{c.levels.map((l) => `${l.label} (≥${l.pct}%): ${l.descriptor}`).join(" · ")}</td>
                  <td className="tiny">{c.evidence}</td>
                  <td>{c.lo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {practice && (
        <p className="notice notice-info" role="status">
          Practice score {practice.score}%. {practice.note}
        </p>
      )}
      {lastSub && (
        <div className={`notice ${lastSub.passed ? "notice-ok" : "notice-info"}`} role="status">
          Attempt {lastSub.attempt ?? "—"}: <Chip s={lastSub.state} /> {lastSub.score !== null && <strong>{lastSub.score}%</strong>} {lastSub.passed !== null && (lastSub.passed ? "— passed" : "— not yet passing")}
          {lastSub.infraReason && <> — {lastSub.infraReason} This did not use an attempt.</>}
        </div>
      )}
      <WorkUpload t={t} itemId={it.id} kind={it.kind} courseId={t.v.course.id} learner={learner} here={here} />
      {isProject ? (
        <ProjectSubmit t={t} it={it} workspaces={workspaces} here={here} />
      ) : (
        <form method="post" action={api(slug, "a/graded.submit")} className="stack" aria-label={`${it.title} answers`}>
          <Hidden values={{ back: here, itemId: it.id, idempotencyKey: key(), result_param: "sub", notice: "Submitted and graded." }} />
          {it.questions.map((q, n) => (
            <fieldset key={q.id} className="learn-q">
              <legend>
                {n + 1}. {q.prompt}
              </legend>
              {q.scenario && <p className="small muted">{q.scenario}</p>}
              {q.options.map((o, oi) => (
                <label key={oi} className="row">
                  <input type={q.type === "multiple" ? "checkbox" : "radio"} name={q.type === "multiple" ? `ans__${q.id}[]` : `ans__${q.id}`} value={String(oi)} /> {o}
                </label>
              ))}
              {fb(q.id) && <Feedback r={fb(q.id)!} />}
            </fieldset>
          ))}
          {it.tasks.map((tk, n) => (
            <fieldset key={tk.id} className="learn-q">
              <legend>
                Task {n + 1}. {tk.prompt}
              </legend>
              <TaskInput tk={tk} />
              {fb(tk.id) && <Feedback r={fb(tk.id)!} />}
            </fieldset>
          ))}
          {it.shortAnswers.map((q, n) => (
            <label key={q.id} className="stack">
              {it.questions.length + n + 1}. {q.prompt} ({q.points} pts)
              <textarea name={`ans__${q.id}`} rows={3} />
              {fb(q.id) && <Feedback r={fb(q.id)!} />}
            </label>
          ))}
          <div className="row">
            {it.kind !== "quiz" && (
              <button className="btn btn-outline btn-sm" type="submit" formAction={api(slug, "a/graded.practice")} name="show_result" value="1">
                Check (practice — no attempt used)
              </button>
            )}
            {learner && (
              <button className="btn btn-primary btn-sm" type="submit" disabled={it.attemptsRemaining === 0}>
                Submit graded attempt ({it.attemptsRemaining} left)
              </button>
            )}
          </div>
          {!learner && <p className="tiny muted">Staff can practise to check the item; graded attempts are for enrolled learners.</p>}
        </form>
      )}
      {it.submissions.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="My submissions">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Attempt</th>
                <th scope="col">State</th>
                <th scope="col">Score</th>
                <th scope="col">Submitted</th>
                <th scope="col">Check Answers</th>
              </tr>
            </thead>
            <tbody>
              {it.submissions.map((s) => (
                <tr key={s.id}>
                  <td>{s.attempt ?? "not counted"}</td>
                  <td>
                    <Chip s={s.state} />
                  </td>
                  <td>{s.score === null ? "—" : `${s.score}%`}</td>
                  <td>{fmt(s.createdAt, true)}</td>
                  <td>{["graded", "posted", "posting_failed"].includes(s.state) ? <a href={`${here}&review=${s.id}`}>Check Answers</a> : <span className="muted">after grading</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {it.best && (
        <p className="small">
          Recorded (highest valid attempt): <strong>{it.best.score}%</strong> <Chip s={it.best.passed ? "pass" : "not_yet"} />
        </p>
      )}
      {reviewErr && <p className="notice notice-err">{reviewErr}</p>}
      {review && <Review r={review} />}
      {review && it.isStaff && (
        <form method="post" action={api(slug, "a/graded.regrade")} className="row card card-pad" aria-label="Regrade">
          <Hidden values={{ back: here, notice: "Regraded and reposted; the learner was notified.", submissionId: String(review.id) }} />
          <label>
            New score (0–100)
            <input name="score" type="number" min={0} max={100} required />
          </label>
          <label>
            Reason (required)
            <input name="reason" required />
          </label>
          <button className="btn btn-outline btn-sm">Regrade</button>
        </form>
      )}
    </section>
  );
}

function Feedback({ r }: { r: { ok: boolean; hint: string | null } }) {
  return <p className={`small ${r.ok ? "learn-ok" : "learn-no"}`}>{r.ok ? "✓ Correct" : `✗ Not yet${r.hint ? ` — hint: ${r.hint}` : ""}`}</p>;
}

function TaskInput({ tk }: { tk: ReturnType<typeof G.itemView>["tasks"][number] }) {
  if (tk.kind === "match")
    return (
      <>
        {tk.items.map((item, i) => (
          <label key={i} className="row">
            {item} →
            <select name={`ans__${tk.id}[]`} defaultValue="">
              <option value="">Choose…</option>
              {(tk.targets ?? []).map((tg, ti) => (
                <option key={ti} value={String(ti)}>
                  {tg}
                </option>
              ))}
            </select>
          </label>
        ))}
      </>
    );
  if (tk.kind === "order")
    return (
      <>
        {tk.items.map((_, pos) => (
          <label key={pos} className="row">
            Position {pos + 1}
            <select name={`ans__${tk.id}[]`} defaultValue="">
              <option value="">Choose…</option>
              {tk.items.map((it, ii) => (
                <option key={ii} value={String(ii)}>
                  {it}
                </option>
              ))}
            </select>
          </label>
        ))}
      </>
    );
  if (tk.kind === "choose")
    return (
      <>
        {tk.items.map((o, oi) => (
          <label key={oi} className="row">
            <input type="radio" name={`ans__${tk.id}`} value={String(oi)} /> {o}
          </label>
        ))}
      </>
    );
  return <input name={`ans__${tk.id}`} aria-label="Your answer" />;
}

function Review({ r }: { r: ReturnType<typeof G.reviewAnswers> }) {
  const answers = (r.answers as { id: string; prompt: string; response: unknown; correct: unknown; earned: number; points: number; explanation: string; lo: string; reading?: string }[]) ?? [];
  const criteria = (r.criteria as { key: string; label: string; earned: number; points: number; feedback: string; mandatory: boolean; met: boolean }[]) ?? [];
  const show = (x: unknown) => (Array.isArray(x) ? x.join(" → ") : String(x ?? "—"));
  return (
    <section className="stack learn-review" aria-labelledby="rv-h">
      <h4 id="rv-h">
        Check Answers — attempt {String(r.attempt)} · {String(r.score)}% (version {String(r.version)})
      </h4>
      <ul className="small">
        {criteria.map((c) => (
          <li key={c.key}>
            <strong>{c.label}</strong>: {c.earned}/{c.points} {c.mandatory && !c.met ? "(mandatory — not met)" : ""} — {c.feedback}
          </li>
        ))}
      </ul>
      {answers.length > 0 && (
        <ol className="small">
          {answers.map((x) => (
            <li key={x.id}>
              <p>
                <strong>{x.prompt}</strong> ({x.earned}/{x.points}) {x.earned >= x.points ? "✓" : "✗"}
              </p>
              <p>Your answer: {show(x.response)}</p>
              <p>Correct: {show(x.correct)}</p>
              <p className="muted">
                {x.explanation} · {x.lo}
                {x.reading ? ` · Review: ${x.reading}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProjectSubmit({ t, it, workspaces, here }: { t: Ctx; it: ReturnType<typeof G.itemView>; workspaces: ReturnType<typeof W.listMyWorkspaces>; here: string }) {
  const { slug } = t;
  return (
    <div className="stack">
      <p className="small">Required files (graded from a frozen snapshot of your workspace):</p>
      <ul className="small">
        {[...new Set(it.artifacts.map((a) => a.path))].map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
      {workspaces.length ? (
        it.isStaff ? (
          <p className="tiny muted">Graded submissions are for enrolled learners.</p>
        ) : (
          <form method="post" action={api(slug, "a/graded.submit_project")} className="row">
            <Hidden values={{ back: here, itemId: it.id, workspaceId: String(workspaces[0].id), idempotencyKey: key(), result_param: "sub", notice: "Snapshot frozen and graded." }} />
            <button className="btn btn-primary btn-sm" disabled={it.attemptsRemaining === 0}>
              Submit workspace ({it.attemptsRemaining} attempts left)
            </button>
            <a className="btn btn-ghost btn-sm" href={`${t.base}/workspaces?ws=${workspaces[0].id}`}>
              Open workspace
            </a>
          </form>
        )
      ) : (
        <p className="small">
          Launch your workspace in <a href={`${t.base}/cloud-labs`}>Agentic Cloud Labs</a> first.
        </p>
      )}
    </div>
  );
}

function Activities({ t }: { t: Ctx }) {
  const { v, base } = t;
  if (!v.activity) return <Empty title="No in-class activities yet." />;
  const a = v.activity;
  const ws = v.items.find((i) => i.kind === "worksheet");
  const proj = v.items.find((i) => i.key === AI801_PROJECT_KEY);
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="ac-h">
        <h3 id="ac-h" className="card-title">
          {a.title}
        </h3>
        <p className="small">{a.context}</p>
        <h4>Stakeholders</h4>
        <ul className="small">
          {a.stakeholders.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <h4>Steps</h4>
        <ol className="small">
          {a.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="small">
          <strong>Sample data:</strong> {a.sampleData}
        </p>
        <p className="small">
          <strong>Deliverables:</strong> {a.deliverables.join(", ")} · <strong>Testing:</strong> {a.testing}
        </p>
        <p className="row">
          {ws && (
            <a className="btn btn-outline btn-sm" href={`${base}/assignments?item=${ws.id}`}>
              10-question worksheet
            </a>
          )}
          {proj && (
            <a className="btn btn-outline btn-sm" href={`${base}/assignments?item=${proj.id}`}>
              Workspace project
            </a>
          )}
          <a className="btn btn-ghost btn-sm" href={`${base}/cloud-labs`}>
            Launch the lab
          </a>
        </p>
      </section>
      {v.staff && (
        <section className="card card-pad stack">
          <h3 className="card-title">Instructor solution</h3>
          {v.lock.locked ? <p className="small">Hidden by the projection lock. Unlock in the Instructor Control Panel.</p> : <p className="small">{AI801_ACTIVITY.instructorSolution}</p>}
        </section>
      )}
    </>
  );
}

function Quizzes({ t }: { t: Ctx }) {
  const { v, base } = t;
  return (
    <>
      <ItemsSection t={t} kinds={["quiz"]} intro="The graded module quiz has ten questions and two attempts; attempt 2 uses different variants. Check Answers opens after grading." />
      <section className="card card-pad stack">
        <h3 className="card-title">Topic practice quizzes (unlimited, ungraded)</h3>
        <ul className="small">
          {v.topics.map((tp) => {
            const r = v.runs.find((x) => x.topic === tp.title);
            return <li key={tp.key}>{r ? <a href={`${base}/outputs?run=${r.id}`}>{tp.title}: 10 practice questions</a> : <span className="muted">{tp.title}: not released yet</span>}</li>;
          })}
        </ul>
      </section>
    </>
  );
}

/* ---------------- workspaces & labs ---------------- */

const DEFAULT_PLAN = JSON.stringify({ name: "read-schedule", onBlocked: "continue", steps: [{ tool: "FILE_READ", args: { path: "/workspace/data/schedule.csv" } }, { tool: "HTTP_REQUEST", args: { url: "sim://api.scholarion.local/v1/schedule" } }, { tool: "FILE_READ", args: { path: "/etc/passwd" } }] }, null, 2);

/** Graded Agentic Cloud Lab: implement a bounded tool runner (rubric 30/30/30/10, two attempts, never executes learner code). */
function RunnerLab({ t }: { t: Ctx }) {
  const { v, slug, here, actor } = t;
  const item = v.items.find((i) => i.key === AI801_RUNNER_ITEM_KEY);
  if (!item) return null;
  const ws = v.workspaces.find((w) => w.labKey === AI801_RUNNER_LAB_KEY);
  const isLearner = !v.staff || !!actor.courseRoles?.[v.course.id]?.includes("student");
  return (
    <section className="card card-pad stack" aria-labelledby="rl-h">
      <h3 id="rl-h" className="card-title">
        Graded lab: implement a bounded tool runner
      </h3>
      <p className="small">Make the runner keep EXECUTE_BASH and FILE_WRITE inside /workspace, block traversal, allow HTTP only to the simulated API, and finish a log-summary task within its step budget. Practice is unlimited and ungraded; two graded submissions, the highest counts. Your code is never executed on the server — its structure is checked and your plan is replayed against your bounds.</p>
      <p className="row">
        {ws ? (
          <>
            <Chip s={String(ws.status)} />
            <a className="btn btn-outline btn-sm" href={`${t.base}/workspaces?ws=${ws.id}`}>
              Open workspace
            </a>
            {isLearner && (
              <form method="post" action={api(slug, "a/graded.practice_runner_lab")}>
                <Hidden values={{ back: here, notice: "Practice checked — no attempt used.", itemId: item.id, workspaceId: String(ws.id) }} />
                <button className="btn btn-ghost btn-sm">Run practice check</button>
              </form>
            )}
          </>
        ) : isLearner ? (
          <form method="post" action={api(slug, "a/workspace.launch")}>
            <Hidden values={{ back: here, notice: "Workspace launched.", courseId: v.course.id, labKey: AI801_RUNNER_LAB_KEY, templateId: "bounded-runner" }} />
            <button className="btn btn-primary btn-sm">Launch lab workspace</button>
          </form>
        ) : (
          <span className="small muted">Staff: class progress is in the Instructor Control Panel.</span>
        )}
        <a className="btn btn-ghost btn-sm" href={`${t.base}/assignments?item=${item.id}`}>
          Rubric and graded submission
        </a>
      </p>
    </section>
  );
}

function CloudLabs({ t }: { t: Ctx }) {
  const { v, slug, here, store, actor } = t;
  const ws = v.workspaces.find((w) => w.labKey === AI801_LAB_KEY);
  let runs: ReturnType<typeof W.listAgentRuns> = [];
  try {
    runs = ws ? W.listAgentRuns(store, actor, String(ws.id)) : [];
  } catch {
    runs = [];
  }
  const lastRun = runs[runs.length - 1] ?? null;
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="cl-h">
        <h3 id="cl-h" className="card-title">
          Guest services agent lab (Haven Hospitality sandbox)
        </h3>
        <p className="small">{AI801_ACTIVITY.context}</p>
        <p className="small">The agent runs autonomously — no approval gates. The lab policy (tools, filesystem, network, credentials, step and cost budgets) is enforced outside the model; blocked actions fail automatically with an explanation and you can stop a run at any time. Run logs record actions and policy results only.</p>
        {ws ? (
          <p className="row">
            <Chip s={String(ws.status)} /> <a className="btn btn-outline btn-sm" href={`${t.base}/workspaces?ws=${ws.id}`}>Open workspace</a>
          </p>
        ) : !v.staff || actor.courseRoles?.[v.course.id]?.includes("student") ? (
          <form method="post" action={api(slug, "a/workspace.launch")}>
            <Hidden values={{ back: here, notice: "Workspace launched.", courseId: v.course.id, labKey: AI801_LAB_KEY, templateId: "agent-builder" }} />
            <button className="btn btn-primary btn-sm">Launch workspace</button>
          </form>
        ) : (
          <p className="small muted">Staff: see class progress in the Instructor Control Panel.</p>
        )}
        <p className="small">
          Also available: <a href={`/campus/${slug}/agent-labs`}>declarative agent labs</a> with hidden test tasks.
        </p>
      </section>
      <RunnerLab t={t} />
      {ws && (
        <section className="card card-pad stack" aria-labelledby="cl-run">
          <h3 id="cl-run" className="card-title">
            Run a bounded agent plan
          </h3>
          <form method="post" action={api(slug, "a/workspace.agent_run")} className="stack">
            <Hidden values={{ back: here, notice: "Agent run finished — see the run log.", wsId: String(ws.id) }} />
            <label>
              Plan (JSON: steps of FILE_READ, FILE_WRITE, HTTP_REQUEST, EXECUTE_BASH)
              <textarea name="plan" rows={10} defaultValue={DEFAULT_PLAN} className="mono" />
            </label>
            <button className="btn btn-primary btn-sm">Run autonomously</button>
          </form>
          {lastRun && (
            <div className="stack">
              <p className="small">
                Last run <strong>{lastRun.name}</strong>: <Chip s={lastRun.status} /> {lastRun.stopReason ?? ""} · steps {lastRun.budget.used.steps}/{lastRun.budget.limit.steps} · cost {lastRun.budget.used.costUnits}/{lastRun.budget.limit.costUnits}
              </p>
              <p className="small">
                Export the run log: <a href={api(slug, `learn/${v.course.id}/runs/${lastRun.id}.json`)}>JSON</a> · <a href={api(slug, `learn/${v.course.id}/runs/${lastRun.id}.html`)}>readable HTML</a> <Formats href={api(slug, `learn/${v.course.id}/runs/${lastRun.id}.html`)} name="Run log" label="·" />
              </p>
              <ol className="small learn-runlog" aria-label="Run log">
                {lastRun.steps.map((s) => (
                  <li key={s.index}>
                    {s.ok ? "✓" : "✗"} {s.tool} {Object.values(s.args).join(" ").slice(0, 80)} — {s.blockedReason ? `blocked: ${s.blockedReason}` : s.resultSummary}
                  </li>
                ))}
              </ol>
              {lastRun.status === "running" && (
                <form method="post" action={api(slug, "a/workspace.agent_stop")}>
                  <Hidden values={{ back: here, runId: lastRun.id }} />
                  <button className="btn btn-outline btn-sm">Stop run</button>
                </form>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Workspaces({ t }: { t: Ctx }) {
  const { v, slug, sp, store, actor } = t;
  const wsId = sp.ws ?? (v.workspaces[0]?.id as string | undefined);
  let ws: ReturnType<typeof W.getWorkspace> | null = null;
  try {
    ws = wsId ? W.getWorkspace(store, actor, wsId) : null;
  } catch {
    ws = null;
  }
  const here = `${t.here}${ws ? `?ws=${ws.id}` : ""}`;
  const file = sp.file ?? (ws ? Object.keys(ws.files)[0] : undefined);
  const term = parse<{ output: string; exitCode: number; sandbox?: string }>(sp.result);
  const runner = runnerStatus();
  let snaps: ReturnType<typeof W.listSnapshots> = [];
  try {
    snaps = ws ? W.listSnapshots(store, actor, ws.id) : [];
  } catch {
    snaps = [];
  }
  return (
    <>
      <ul className="row" aria-label="My workspaces">
        {v.workspaces.map((w) => (
          <li key={String(w.id)}>
            <a className="btn btn-ghost btn-sm" aria-current={w.id === ws?.id ? "page" : undefined} href={`${t.here}?ws=${w.id}`}>
              {String(w.labKey)} · {String(w.templateId)}
            </a>
          </li>
        ))}
      </ul>
      <form method="post" action={api(slug, "a/workspace.launch")} className="row card card-pad" aria-label="Launch a practice workspace">
        <Hidden values={{ back: t.here, notice: "Workspace ready.", courseId: v.course.id }} />
        <label>
          Template
          <select name="templateId">
            {v.templates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lab key
          <input name="labKey" defaultValue="practice-sandbox" pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,79}" />
        </label>
        <button className="btn btn-outline btn-sm">Launch or resume</button>
      </form>
      {!ws ? (
        <Empty title="No workspace open.">Launch one above or from Agentic Cloud Labs.</Empty>
      ) : (
        <section className="card card-pad stack" aria-labelledby="ws-h">
          <h3 id="ws-h" className="card-title">
            {ws.title}
          </h3>
          <p className="small">
            <Chip s={ws.status} /> Save status: {ws.saveStatus} · saved {fmt(ws.savedAt, true)} · revision {ws.revision} · policy v{ws.budget.policyVersion}
          </p>
          <p className="small">
            Budget: steps {ws.budget.used.steps}/{ws.budget.limit.steps} · CPU {ws.budget.used.cpuUnits}/{ws.budget.limit.cpuUnits} · cost {ws.budget.used.costUnits}/{ws.budget.limit.costUnits} · storage {ws.budget.memory.usedKb}/{ws.budget.memory.limitKb} KB
          </p>
          <div className="row">
            {(
              [
                ["workspace.save", "Save", "Saved."],
                [ws.status === "running" ? "workspace.stop" : "workspace.resume", ws.status === "running" ? "Stop" : "Resume", ws.status === "running" ? "Stopped — your files are kept." : "Resumed."],
              ] as const
            ).map(([op, label, notice]) => (
              <form key={op} method="post" action={api(slug, `a/${op}`)}>
                <Hidden values={{ back: here, notice, wsId: ws!.id }} />
                <button className="btn btn-outline btn-sm">{label}</button>
              </form>
            ))}
            <form method="post" action={api(slug, "a/workspace.reset")}>
              <Hidden values={{ back: here, notice: "Reset to the template.", wsId: ws.id, confirm: "true" }} />
              <button className="btn btn-ghost btn-sm">Reset to template</button>
            </form>
          </div>
          <div className="learn-editor">
            <nav aria-label="Files">
              <ul className="small">
                {Object.keys(ws.files).map((p) => (
                  <li key={p}>
                    <a href={`${here}&file=${encodeURIComponent(p)}`} aria-current={p === file ? "true" : undefined}>
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <form method="post" action={api(slug, "a/workspace.write")} className="stack">
              <Hidden values={{ back: `${here}&file=${encodeURIComponent(file ?? "")}`, notice: "Saved (autosave).", wsId: ws.id }} />
              <label>
                Path
                <input name="path" defaultValue={file ?? "notes.md"} />
              </label>
              <label>
                Editor
                <textarea name="content" rows={12} className="mono" defaultValue={file ? ws.files[file] ?? "" : ""} />
              </label>
              <button className="btn btn-primary btn-sm">Save file</button>
            </form>
          </div>
          <form method="post" action={api(slug, "a/workspace.command")} className="stack learn-terminal">
            <Hidden values={{ back: here, wsId: ws.id, show_result: "1", notice: "Command finished." }} />
            <label>
              Terminal (simulated shell over your saved files — try <code>ls</code>, <code>cat README.md</code>, <code>scholarion validate</code>)
              <input name="command" className="mono" autoComplete="off" />
            </label>
            <div className="row">
              <button className="btn btn-outline btn-sm">Run (simulated)</button>
              {runner.configured && (
                <button className="btn btn-primary btn-sm" type="submit" formAction={api(slug, "a/workspace.exec")}>
                  Run in container
                </button>
              )}
            </div>
            <p className="small muted">{runner.configured ? runner.note : "Container runs aren't configured on this campus; the simulated shell works over your saved files."}</p>
            {term && (
              <pre className="mono learn-term-out" aria-label={term.sandbox === "container" ? "Container output" : "Terminal output"}>
                {term.output}
                {`\n[exit ${term.exitCode}]`}
              </pre>
            )}
          </form>
          {ws.lastValidation && (
            <p className="small">
              Last validation: {ws.lastValidation.passed}/{ws.lastValidation.total} checks passing
            </p>
          )}
          {snaps.length > 0 && (
            <p className="small">
              Frozen submission snapshots: {snaps.map((s) => `${String(s.assessmentKey)} (rev ${String(s.revision)}, ${fmt(s.createdAt, true)})`).join("; ")}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function Environment({ t }: { t: Ctx }) {
  const { v, slug, here } = t;
  const p = v.policy;
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="env-h">
        <h3 id="env-h" className="card-title">
          Lab policy v{p.version} (enforced outside the model)
        </h3>
        <dl className="kv small">
          <dt>Tools</dt>
          <dd>
            {Object.entries(p.tools)
              .map(([k, on]) => `${k} ${on ? "allowed" : "blocked"}`)
              .join(" · ")}
          </dd>
          <dt>Filesystem boundary</dt>
          <dd>
            <code>{p.fsBoundary}</code>
          </dd>
          <dt>Network allowlist</dt>
          <dd>{p.network.allowedHosts.join(", ")} (simulated endpoints only)</dd>
          <dt>Credentials</dt>
          <dd>
            {p.credentials.scope}: {p.credentials.names.join(", ")}
          </dd>
          <dt>Budgets</dt>
          <dd>
            {p.limits.maxSteps} steps · {p.limits.costUnits} cost units · {Math.round(p.limits.runtimeMs / 60000)} min runtime · {p.limits.tokens.toLocaleString("en")} tokens · {p.limits.maxRetries} retries
          </dd>
          <dt>When an action is blocked</dt>
          <dd>It fails automatically with an explanation ({p.stopConditions.onBlocked === "stop" ? "the run stops" : "the run continues"}); no approval request is created.</dd>
        </dl>
      </section>
      <section className="card card-pad stack">
        <h3 className="card-title">Environment templates</h3>
        <ul className="small">
          {v.templates.map((tp) => (
            <li key={tp.id}>
              <strong>{tp.title}</strong> ({tp.kind}) — {tp.description}
            </li>
          ))}
        </ul>
        <p className="tiny muted">All environments are simulated: the terminal runs over a virtual filesystem and nothing learners type is executed on a server. Real container execution is a configuration requirement.</p>
      </section>
      {v.staff && (
        <form method="post" action={api(slug, "a/workspace.set_policy")} className="card card-pad stack" aria-label="Change the policy">
          <h3 className="card-title">Change the policy (future runs only)</h3>
          <Hidden values={{ back: here, notice: "Policy saved as a new version.", courseId: v.course.id, labKey: AI801_LAB_KEY }} />
          <label>
            Patch (JSON)
            <textarea name="patch" rows={4} className="mono" defaultValue={JSON.stringify({ tools: { EXECUTE_BASH: false }, limits: { maxSteps: 100 } })} />
          </label>
          <button className="btn btn-primary btn-sm">Save new version</button>
        </form>
      )}
    </>
  );
}

function Demos({ t }: { t: Ctx }) {
  const { v, slug } = t;
  const a1 = api(slug, "sim-labs");
  const r = v.runs[0];
  let demo: string | null = null;
  try {
    demo = r ? String(studio.listOutputs(t.store, t.actor, r.id).find((o) => String(o.relPath) === "11_Application_Demo/agentic_demo.html")?.id ?? "") || null : null;
  } catch {
    demo = null;
  }
  return (
    <>
      {demo && (
        <section className="card card-pad stack">
          <h3 className="card-title">Working agentic demo (perception, planning, memory, tools)</h3>
          <p className="small">Generated from this course's sources; runs entirely in your browser with simulated data.</p>
          <p>
            <a className="btn btn-primary btn-sm" href={api(slug, `learn/${v.course.id}/outputs/${demo}`)}>
              Open the demo
            </a>
          </p>
        </section>
      )}
      <ul className="grid g2" aria-label="Simulated applications">
        {v.demos.map((d) => (
          <li key={d.key} className="card card-pad stack">
            <p className="card-title">{d.title}</p>
            <p className="tiny muted">{d.org} (fictional sandbox)</p>
            <p className="small">
              <a href={`${a1}/${d.key}/app.html?module=1`}>Simulated Application Demo</a> · <a href={`${a1}/${d.key}/student.html?module=1`}>Student Lab</a>
              {v.staff && (
                <>
                  {" "}
                  · <a href={`${a1}/${d.key}/instructor.html?module=1&courseId=${v.course.id}`}>Instructor Lab {v.lock.locked ? "(locked)" : ""}</a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------------- grades & instructor ---------------- */

function Gradebook({ t }: { t: Ctx }) {
  const { v, slug, here } = t;
  const g = v.gradebook;
  return (
    <>
      {g.isStaff && (
        <p className="row">
          <a className="btn btn-outline btn-sm" href={api(slug, `learn/${v.course.id}/gradebook.csv`)}>
            Export CSV
          </a>
          <Formats href={api(slug, `learn/${v.course.id}/gradebook.csv`)} name="Gradebook" />
          {g.failedPostings > 0 && (
            <form method="post" action={api(slug, "a/graded.retry")}>
              <Hidden values={{ back: here, notice: "Retried failed postings.", courseId: v.course.id }} />
              <button className="btn btn-primary btn-sm">Retry {g.failedPostings} failed postings</button>
            </form>
          )}
        </p>
      )}
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Gradebook">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Learner</th>
              {g.items.map((i) => (
                <th key={i.id} scope="col" className="tiny">
                  {i.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.userId}>
                <th scope="row">{r.name}</th>
                {r.items.map((i) => (
                  <td key={i.itemId} className="tiny">
                    {i.best === null ? <Chip s={i.state} /> : <>{i.best}% {i.passed ? "✓" : ""}</>}
                    <br />
                    <span className="muted">
                      {i.attemptsUsed}/{i.maxAttempts}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card card-pad stack" aria-labelledby="pb-h">
        <h3 id="pb-h" className="card-title">
          Competency passbook
        </h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Passbook">
          <table className="table">
            <thead>
              <tr>
                {g.isStaff && <th scope="col">Learner</th>}
                <th scope="col">Competency</th>
                <th scope="col">Assessment</th>
                <th scope="col">Score</th>
                <th scope="col">Threshold</th>
                <th scope="col">Result</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.flatMap((r) =>
                r.passbook.map((p, i) => (
                  <tr key={`${r.userId}-${i}`}>
                    {g.isStaff && <td>{r.name}</td>}
                    <td>{p.competency}</td>
                    <td>{p.item}</td>
                    <td>{p.score}%</td>
                    <td>{p.threshold}%</td>
                    <td>
                      <Chip s={p.result} />
                    </td>
                    <td>{fmt(p.completedAt)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        {v.course.competencies.length > 0 && (
          <ul className="tiny muted">
            {v.course.competencies.map((c) => (
              <li key={c.id}>
                {c.id}: {c.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Instructor({ t }: { t: Ctx }) {
  const { v, slug, here, store, actor } = t;
  if (!v.staff) return <Denied message="The Instructor Control Panel is for course staff." />;
  let progress: ReturnType<typeof W.classProgress> | null = null;
  try {
    progress = W.classProgress(store, actor, v.course.id, AI801_LAB_KEY);
  } catch {
    progress = null;
  }
  const rows = progress?.learners ?? [];
  return (
    <>
      <section className="card card-pad stack" aria-labelledby="ip-lock">
        <h3 id="ip-lock" className="card-title">
          Projection lock
        </h3>
        <p className="small">
          Answer keys, instructor lab editions and instructor Studio files are <strong>{v.lock.locked ? "hidden" : `visible until ${fmt(v.lock.unlockedUntil, true)}`}</strong>. They lock again automatically after 30 minutes.
        </p>
        <form method="post" action={api(slug, `a/${v.lock.locked ? "projection.unlock" : "projection.lock"}`)}>
          <Hidden values={{ back: here, notice: v.lock.locked ? "Answers unlocked for 30 minutes." : "Answers hidden.", courseId: v.course.id }} />
          <button className={`btn btn-sm ${v.lock.locked ? "btn-outline" : "btn-primary"}`} disabled={v.lock.locked && !v.canUnlock}>
            {v.lock.locked ? "Unlock answer keys" : "Switch to Student View (lock now)"}
          </button>
        </form>
      </section>
      <section className="card card-pad stack" aria-labelledby="ip-pin">
        <h3 id="ip-pin" className="card-title">
          Instructor lab PIN
        </h3>
        <p className="small">Downloaded Instructor Lab files keep their answer keys encrypted with this PIN. They open behind a lock screen, and Switch to Student View removes the keys from the page. {hasPin(t.store, v.course.id) ? "A PIN is set." : "No PIN set yet — instructor files rely on the projection lock above."}</p>
        <form method="post" action={api(slug, "a/projection.set_pin")} className="row">
          <Hidden values={{ back: here, notice: "PIN saved. New instructor downloads use it.", courseId: v.course.id }} />
          <label>
            New PIN (4–8 digits)
            <input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" required autoComplete="off" />
          </label>
          <button className="btn btn-outline btn-sm" disabled={!v.canUnlock}>
            Save PIN
          </button>
        </form>
      </section>
      <section className="card card-pad stack" aria-labelledby="ip-lab">
        <h3 id="ip-lab" className="card-title">
          Lab control
        </h3>
        <div className="row">
          <form method="post" action={api(slug, "a/workspace.pause")}>
            <Hidden values={{ back: here, notice: "Lab paused — files kept; commands and agent runs disabled.", courseId: v.course.id, labKey: AI801_LAB_KEY }} />
            <button className="btn btn-outline btn-sm">Pause lab</button>
          </form>
          <form method="post" action={api(slug, "a/workspace.unpause")}>
            <Hidden values={{ back: here, notice: "Lab resumed.", courseId: v.course.id, labKey: AI801_LAB_KEY }} />
            <button className="btn btn-ghost btn-sm">Resume lab</button>
          </form>
          <a className="btn btn-ghost btn-sm" href={`${t.base}/environment`}>
            Change policy
          </a>
        </div>
        {rows.length ? (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Class progress">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">Validation</th>
                  <th scope="col">Steps used</th>
                  <th scope="col">Snapshots</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>{r.name}</td>
                    <td>{r.started ? <Chip s={r.status} /> : <Chip s="not_started" />}</td>
                    <td>{r.started ? fmt(r.lastActivityAt, true) : "—"}</td>
                    <td>{r.started ? `${r.validation.passed}/${r.validation.total}` : "—"}</td>
                    <td>{r.started ? `${r.budget.used.steps}/${r.budget.limit.steps}` : "—"}</td>
                    <td>{r.started ? r.snapshots : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">No learners enrolled yet.</p>
        )}
      </section>
      <section className="card card-pad stack">
        <h3 className="card-title">Grading health</h3>
        <p className="small">
          {v.gradebook.failedPostings} failed gradebook postings (retried automatically; <a href={`${t.base}/gradebook`}>retry now</a>). Submissions hit by an infrastructure failure never count as attempts.
        </p>
      </section>
    </>
  );
}

export { AI801_TOPICS };


/** Upload work for any item (mini lab, worksheet, quiz or project): files or a Colab/Codelab/GitHub link. */
function WorkUpload({ t, itemId, kind, courseId, learner, here }: { t: { store: TenantStore; actor: Actor; slug: string }; itemId: string; kind: string; courseId: string; learner: boolean; here: string }) {
  const k = String(kind).replace(/[^a-z]/g, "");
  const exts = formatsFor(k === "minilab" ? "minilab" : k === "project" ? "project" : "assignment");
  const mine = attachmentsFor(t.store, t.actor, itemId);
  return (
    <section className="card card-pad stack work-upload" aria-labelledby={`wu-${itemId}`}>
      <h4 id={`wu-${itemId}`}>Upload your work</h4>
      <p className="tiny muted">
        Accepted: {formatList(exts)} (up to 10 MB), or a link to a Google Colab notebook, Codelab, GitHub repository or shared document. Uploads go to your instructor as evidence; they don't use an attempt or change an automatic score.
      </p>
      {learner && (
        <div className="grid g2">
          <form method="post" action={api(t.slug, "upload")} encType="multipart/form-data" className="stack">
            <Hidden values={{ back: here, gradedItemId: itemId, courseId, notice: "Work uploaded for your instructor." }} />
            <label htmlFor={`wu-file-${itemId}`}>File</label>
            <input id={`wu-file-${itemId}`} name="file" type="file" required accept={acceptAttr(exts)} />
            <label htmlFor={`wu-note-${itemId}`}>Note (optional)</label>
            <input id={`wu-note-${itemId}`} name="note" />
            <div>
              <button className="btn btn-outline btn-sm" type="submit">
                Upload file
              </button>
            </div>
          </form>
          <form method="post" action={api(t.slug, "a/graded.attach_link")} className="stack">
            <Hidden values={{ back: here, itemId, notice: "Link submitted for your instructor." }} />
            <label htmlFor={`wu-url-${itemId}`}>Colab, Codelab, GitHub or document link</label>
            <input id={`wu-url-${itemId}`} name="url" type="url" required placeholder="https://colab.research.google.com/…" />
            <div>
              <button className="btn btn-outline btn-sm" type="submit">
                Submit link
              </button>
            </div>
          </form>
        </div>
      )}
      {mine.length > 0 && (
        <ul className="small">
          {mine.map((m) => (
            <li key={m.id}>
              {m.learner ? `${m.learner}: ` : ""}
              {m.fileId ? (
                <>
                  <a href={signedLink(t.store, t.actor, m.fileId)}>{m.fileName}</a> (<a href={api(t.slug, `files/${m.fileId}/preview`)}>preview</a>)
                </>
              ) : (
                <a href={String(m.url)}>{m.linkKind}</a>
              )} · {fmt(m.at, true)}
              {m.note ? ` — ${m.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function signedLink(store: TenantStore, actor: Actor, fileId: string) {
  try {
    return downloadUrl(store, actor, fileId).url;
  } catch {
    return "#";
  }
}

function BrandingProfile({ t }: { t: Ctx }) {
  const { v, slug, here, store } = t;
  const p = getProfile(store, v.course.id) ?? {};
  return (
    <section className="card card-pad stack" aria-labelledby="ls-brand">
      <h3 id="ls-brand" className="card-title">
        Course branding profile
      </h3>
      <p className="small">Used by the 1920×1080 covers (A and B) and the PowerPoint deck: wordmark, motto band, two-tone course code, module banner and the six-cell footer bar. Cover B adds key topics, a process strip and an outcomes checklist. Leave a field blank to use the Scholarion default. Changes apply on the next generation or a targeted rebuild.</p>
      <form method="post" action={api(slug, "a/studio.profile_set")} className="stack brand-form">
        <Hidden values={{ back: here, notice: "Branding profile saved. Rebuild the covers to apply it.", courseKey: v.course.id }} />
        <label>
          Institution
          <input name="institution" defaultValue={p.institution ?? ""} placeholder="Scholarion Academy" maxLength={80} />
        </label>
        <label>
          Motto
          <input name="motto" defaultValue={p.motto ?? ""} placeholder="Learn by building. Lead with integrity." maxLength={120} />
        </label>
        <label>
          Primary colour
          <input name="primary" defaultValue={p.primary ?? ""} placeholder="#0b1f4d" pattern="#[0-9a-fA-F]{6}" />
        </label>
        <label>
          Accent colour
          <input name="accent" defaultValue={p.accent ?? ""} placeholder="#f2c66d" pattern="#[0-9a-fA-F]{6}" />
        </label>
        <label>
          Light background
          <input name="light" defaultValue={p.light ?? ""} placeholder="#f7f5ef" pattern="#[0-9a-fA-F]{6}" />
        </label>
        <label>
          Delivery format (footer)
          <input name="format" defaultValue={p.format ?? ""} placeholder="Online lecture + labs" maxLength={60} />
        </label>
        <label>
          Key topics (comma-separated, cover B)
          <input name="keyTopics" defaultValue={(p.keyTopics ?? []).join(", ")} placeholder="From the sources when blank" />
        </label>
        <label>
          Process steps (comma-separated, cover B)
          <input name="process" defaultValue={(p.process ?? []).join(", ")} placeholder="Read, Lecture, Mini-labs, Practice quiz, Project" />
        </label>
        <button className="btn btn-primary btn-sm">Save profile</button>
      </form>
    </section>
  );
}
