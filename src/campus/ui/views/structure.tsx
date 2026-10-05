import type { TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { outcomeTree } from "../../services/outcomes";
import { periodsForCourse, termAccessSummary } from "../../services/terms";
import { PLACEMENTS, placementsFor } from "../../services/apps";
import { api, Chip, Hidden } from "../kit";
import { groupQuota } from "../../services/files";
import { groupHome, myGroups } from "../../services/groupspace";
import { myLibrary } from "../../services/medialib";
import MediaRecorderForm from "../client/MediaRecorderForm";

type P = { store: TenantStore; actor: Actor; slug: string; here: string; sp: Record<string, string | undefined> };

type Node = { id: string | null; title: string; scope: string; groups: Node[]; outcomes: { id: string; code: string; title: string; scope: string; scale: string | null; method: string; vendorGuid: string | null }[] };

function Tree({ n, depth = 0 }: { n: Node; depth?: number }) {
  return (
    <ul className={depth ? "outcome-tree nested" : "outcome-tree"}>
      {n.groups.map((g) => (
        <li key={String(g.id)}>
          <details open={depth < 1}>
            <summary>
              📁 {g.title} {g.scope === "course" && <span className="badge">course</span>}
            </summary>
            <Tree n={g} depth={depth + 1} />
          </details>
        </li>
      ))}
      {n.outcomes.map((o) => (
        <li key={o.id} className="small">
          <strong>{o.code}</strong> {o.title} {o.scope === "course" && <span className="badge">course</span>} {o.scale && <span className="tiny muted">· scale: {o.scale}</span>} <span className="tiny muted">· {o.method.replace(/_/g, " ")}</span>
        </li>
      ))}
    </ul>
  );
}

export function OutcomesPanel({ store, actor, slug, here, sp }: P) {
  const courseId = sp.courseId || null;
  const t = outcomeTree(store, actor, courseId);
  const author = courseId ? hasAny(actor, ["admin", "designer", "instructor"], courseId) : hasAny(actor, ["admin", "designer"]);
  const courses = store.list("courses", (c) => hasAny(actor, ["admin", "designer", "instructor"], c.id)).slice(0, 50);
  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="oc-tree">
        <div className="between">
          <h2 id="oc-tree" className="card-title">
            Outcome folders {courseId ? "(account + this course)" : "(account)"}
          </h2>
          <form method="get" action={here} className="row">
            <label>
              Scope
              <select name="courseId" defaultValue={courseId ?? ""}>
                <option value="">Account</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.code)} {String(c.title)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-ghost btn-sm">Show</button>
          </form>
        </div>
        <p className="tiny muted">
          {t.counts.groups} folders · {t.counts.outcomes} outcomes ·{" "}
          <a href={api(slug, `q/outcomes.export_csv${courseId ? `?courseId=${courseId}` : ""}`)}>export CSV</a>
        </p>
        {t.counts.groups + t.counts.outcomes === 0 ? <p className="small">No outcomes in this scope yet.</p> : <Tree n={t.tree as Node} />}
        {author && (
          <form method="post" action={api(slug, "a/outcomes.group_create")} className="row">
            <Hidden values={{ back: here, notice: "Folder created.", ...(courseId ? { courseId } : {}) }} />
            <label>
              New folder
              <input name="title" required maxLength={200} />
            </label>
            <button className="btn btn-outline btn-sm">Add folder</button>
          </form>
        )}
      </section>
      <section className="card card-pad stack" aria-labelledby="oc-sc">
        <h2 id="oc-sc" className="card-title">
          Mastery scales
        </h2>
        {t.scales.length === 0 ? (
          <p className="small">No scales yet — outcomes use a single mastery threshold.</p>
        ) : (
          <ul className="small">
            {t.scales.map((s) => (
              <li key={String(s.id)}>
                <strong>{s.title}</strong>: {s.ratings.map((r) => `${r.label} (${r.points})`).join(" · ")} — mastery at {s.masteryPoints}
              </li>
            ))}
          </ul>
        )}
        {author && (
          <form method="post" action={api(slug, "a/outcomes.scale_create")} className="row">
            <Hidden values={{ back: here, notice: "Scale created.", ratings: JSON.stringify([{ label: "Exceeds", points: 4 }, { label: "Mastery", points: 3 }, { label: "Near mastery", points: 2 }, { label: "Below", points: 1 }]), masteryPoints: "3", ...(courseId ? { courseId } : {}) }} />
            <label>
              Title
              <input name="title" required defaultValue="Four-level scale" />
            </label>
            <button className="btn btn-outline btn-sm">Add the four-level scale (Exceeds 4 · Mastery 3 · Near 2 · Below 1)</button>
          </form>
        )}
      </section>
      {author && (
        <section className="card card-pad stack" aria-labelledby="oc-imp">
          <h2 id="oc-imp" className="card-title">
            Import standards (CSV)
          </h2>
          <p className="small">
            Columns: <code>vendor_guid, object_type (group|outcome), title, description, display_name, calculation_method, calculation_int, parent_guids, mastery_points, ratings</code> — rating points and labels alternate from the <code>ratings</code> column on. Re-importing updates by <code>vendor_guid</code>; nothing is deleted. Try a dry run first.
          </p>
          <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row">
            <Hidden values={{ back: here, purpose: "outcomes_import", ...(courseId ? { courseId } : {}) }} />
            <label>
              Standards CSV
              <input type="file" name="file" accept=".csv,text/csv" required />
            </label>
            <label>
              <input type="checkbox" name="dryRun" defaultChecked /> Dry run
            </label>
            <button className="btn btn-primary btn-sm">Import</button>
          </form>
        </section>
      )}
    </div>
  );
}

export function TermAccessPanel({ store, actor, slug, here, sp }: P) {
  if (!hasAny(actor, ["admin", "registrar", "advisor"])) return null;
  const terms = store.list("terms").sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const termId = sp.termId && terms.some((t) => t.id === sp.termId) ? sp.termId : terms[0]?.id;
  if (!termId) return null;
  const s = termAccessSummary(store, actor, termId);
  const edit = hasAny(actor, ["admin", "registrar"]);
  return (
    <section className="card card-pad stack" aria-labelledby="ta-h">
      <div className="between">
        <h2 id="ta-h" className="card-title">
          Term access by role
        </h2>
        <form method="get" action={here} className="row">
          <label>
            Term
            <select name="termId" defaultValue={termId}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.name)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost btn-sm">Show</button>
        </form>
      </div>
      <p className="small">
        {s.term.name}: {s.term.startsAt.slice(0, 10)} → {s.term.endsAt.slice(0, 10)} · enforcement {s.term.enforceAccess ? <span className="badge badge-green">on</span> : <span className="badge">off</span>}. When on, submissions and quiz attempts outside a role's window are refused and the course is read-only for that role.
      </p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Access windows">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Access starts</th>
              <th scope="col">Access ends</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {s.roles.map((r) => (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td>{r.startsAt?.slice(0, 10) ?? "any time"}</td>
                <td>{r.endsAt?.slice(0, 10) ?? "any time"}</td>
                <td>
                  <Chip s={r.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="row">
          <form method="post" action={api(slug, "a/terms.enforce")}>
            <Hidden values={{ back: `${here}?termId=${termId}`, termId, enforce: s.term.enforceAccess ? "false" : "true", notice: "Term access updated." }} />
            <button className="btn btn-outline btn-sm">{s.term.enforceAccess ? "Turn enforcement off" : "Turn enforcement on"}</button>
          </form>
          <form method="post" action={api(slug, "a/terms.role_override")} className="row">
            <Hidden values={{ back: `${here}?termId=${termId}`, termId, notice: "Role access saved." }} />
            <label>
              Role
              <select name="role">
                {s.roles.map((r) => (
                  <option key={r.role}>{r.role}</option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <input type="date" name="startsAt" />
            </label>
            <label>
              Ends
              <input type="date" name="endsAt" />
            </label>
            <button className="btn btn-outline btn-sm">Save override</button>
          </form>
        </div>
      )}
      {s.gradingPeriodSet && (
        <p className="small">
          Grading periods ({s.gradingPeriodSet.title}{s.gradingPeriodSet.weighted ? ", weighted" : ""}): {s.gradingPeriodSet.periods.map((p) => `${p.name} ${p.startsAt.slice(0, 10)}–${p.endsAt.slice(0, 10)}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

export function AppsPanel({ store, actor, slug, here, sp }: P) {
  const courses = store.list("courses", (c) => hasAny(actor, ["admin", "designer", "instructor"], c.id)).slice(0, 50);
  const courseId = sp.courseId && courses.some((c) => c.id === sp.courseId) ? sp.courseId : courses[0]?.id;
  if (!courseId) return null;
  const p = placementsFor(store, actor, { courseId });
  const tools = store.list("tool_registrations", (t) => t.enabled !== false);
  const accounts = store.list("accounts");
  return (
    <section className="card card-pad stack" aria-labelledby="ap-h">
      <div className="between">
        <h2 id="ap-h" className="card-title">
          Apps & placements
        </h2>
        <form method="get" action={here} className="row">
          <label>
            Course
            <select name="courseId" defaultValue={courseId}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.code)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost btn-sm">Show</button>
        </form>
      </div>
      {p.apps.length === 0 ? (
        <p className="small">No apps appear in this course yet.</p>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Placements">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">App</th>
                <th scope="col">Placement</th>
                <th scope="col">Label</th>
                <th scope="col">From</th>
              </tr>
            </thead>
            <tbody>
              {p.apps.map((x) => (
                <tr key={`${x.toolId}${x.placement}`}>
                  <td>{x.tool}</td>
                  <td>{x.placementLabel}</td>
                  <td>{x.label}</td>
                  <td className="small">{x.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tools.length > 0 && (
        <form method="post" action={api(slug, "a/apps.install")} className="row">
          <Hidden values={{ back: `${here}?courseId=${courseId}`, notice: "App installed.", ...(hasAny(actor, ["admin"]) && accounts[0] ? {} : { scope: "course", courseId }), placements: JSON.stringify([{ key: "course_navigation" }]) }} />
          <label>
            Tool
            <select name="toolId">
              {tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.name)}
                </option>
              ))}
            </select>
          </label>
          {hasAny(actor, ["admin"]) && accounts[0] ? (
            <>
              <label>
                Install for
                <select name="scope" defaultValue="course">
                  <option value="course">This course</option>
                  <option value="account">Account: {String(accounts[0].name)} (inherited)</option>
                </select>
              </label>
              <input type="hidden" name="courseId" value={courseId} />
              <input type="hidden" name="accountId" value={accounts[0].id} />
            </>
          ) : null}
          <button className="btn btn-outline btn-sm">Add to course navigation</button>
          <span className="tiny muted">Placements available: {PLACEMENTS.map((x) => x.label).join(", ")}.</span>
        </form>
      )}
    </section>
  );
}

export function ForeignImportPanel({ store, actor, slug, here }: P) {
  const courses = store.list("courses", (c) => hasAny(actor, ["admin", "designer", "instructor"], c.id)).slice(0, 50);
  if (!courses.length) return null;
  const jobs = store
    .list("content_jobs", (j) => j.kind === "import")
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
    .slice(0, 5);
  return (
    <section className="card card-pad stack" aria-labelledby="fi-h">
      <h2 id="fi-h" className="card-title">
        Import from another platform
      </h2>
      <p className="small">Moodle backups (.mbz), Blackboard Learn exports, D2L Brightspace exports, or any IMS package. Pages and quizzes are converted into an unpublished “Imported content” module; anything that can't be converted is listed in the import report, and executable files are quarantined.</p>
      <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row">
        <Hidden values={{ back: here, purpose: "lms_import" }} />
        <label>
          Course
          <select name="courseId">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.code)} {String(c.title)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Package
          <input type="file" name="file" accept=".mbz,.zip,.imscc,.gz" required />
        </label>
        <button className="btn btn-primary btn-sm">Import</button>
      </form>
      {jobs.length > 0 && (
        <ul className="small">
          {jobs.map((j) => (
            <li key={j.id}>
              <Chip s={String(j.state)} /> {String(j.sourcePlatform ?? "package")} {j.sourceTitle ? `“${String(j.sourceTitle)}”` : ""} · {Object.entries((j.output as { created?: Record<string, number> })?.created ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing created"} · {((j.issues as unknown[]) ?? []).length} issue(s)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CoursePeriodsNote({ store, courseId }: { store: TenantStore; courseId: string }) {
  const r = periodsForCourse(store, courseId);
  return r.periods.length ? (
    <p className="tiny muted">
      Grading periods ({r.source}): {r.periods.map((p) => String(p.name)).join(" · ")}
    </p>
  ) : null;
}

/** My groups: shared group files with the group's storage quota. */
export function GroupFilesPanel({ store, actor, slug, here }: P) {
  const mine = store.list("groups", (g) => ((g.memberIds as string[]) ?? []).includes(actor.id) || hasAny(actor, ["admin", "instructor", "ta"], String(g.courseId)));
  if (!mine.length) return null;
  return (
    <section className="card card-pad stack" aria-labelledby="gf-h">
      <h2 id="gf-h" className="card-title">
        Group files
      </h2>
      {mine.slice(0, 20).map((g) => {
        const q = groupQuota(store, g.id);
        const files = store.list("files", (f) => f.groupId === g.id && f.state === "available");
        const pct = Math.min(100, Math.round((q.used / q.limit) * 100));
        return (
          <details key={g.id}>
            <summary>
              {String(g.name)} <span className="tiny muted">· {String(store.get("courses", String(g.courseId))?.code ?? "")} · {files.length} file(s) · {pct}% of {Math.round(q.limit / 1024 / 1024)} MB</span>
            </summary>
            <div className="stack">
              <progress max={100} value={pct} aria-label={`${String(g.name)} storage used`} />
              <ul className="item-list small">
                {files.map((f) => (
                  <li key={f.id}>
                    <a href={api(slug, `files/${f.id}/preview`)}>{String(f.name)}</a> <span className="tiny muted">{Math.ceil(Number(f.size ?? 0) / 1024)} KB · {String(store.get("users", String(f.ownerId))?.name ?? "")}</span>
                  </li>
                ))}
              </ul>
              <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row wrap">
                <Hidden values={{ back: here, groupId: g.id, purpose: "group" }} />
                <label className="sr-only" htmlFor={`gf-${g.id}`}>
                  Add a file to {String(g.name)}
                </label>
                <input id={`gf-${g.id}`} type="file" name="file" required />
                <button className="btn btn-outline btn-sm" type="submit">
                  Upload
                </button>
              </form>
            </div>
          </details>
        );
      })}
    </section>
  );
}

/** Group spaces: my groups across courses, and a group's home (pages, discussion, files, members). */
export function GroupSpacesPanel({ store, actor, slug, here, sp }: P) {
  const g = myGroups(store, actor);
  if (sp.group) {
    let h: ReturnType<typeof groupHome> | null = null;
    try {
      h = groupHome(store, actor, sp.group);
    } catch {
      h = null;
    }
    if (!h) return <p className="notice notice-info">That group isn't available to you.</p>;
    const back = `${here}?group=${h.group.id}`;
    const pct = Math.min(100, Math.round((h.quota.usedBytes / h.quota.limitBytes) * 100));
    return (
      <div className="stack">
        <p>
          <a href={here}>← All my groups</a>
        </p>
        <section className="card card-pad stack" aria-labelledby="gh-h">
          <h2 id="gh-h" className="card-title">
            {h.group.name} <span className="tiny muted">· {h.group.course}</span>
          </h2>
          {h.group.description && <p className="small">{h.group.description}</p>}
          <p className="small">Members: {h.members.map((m) => m.name).join(", ") || "none yet"}</p>
        </section>
        <div className="grid g2">
          <section className="card card-pad stack" aria-labelledby="gh-pages">
            <h3 id="gh-pages" className="card-title">
              Pages
            </h3>
            {h.pages.map((p) => (
              <details key={p.id}>
                <summary>
                  {p.title} <span className="tiny muted">· edited by {p.editedBy}</span>
                </summary>
                <div className="prose" dangerouslySetInnerHTML={{ __html: p.html }} />
              </details>
            ))}
            <form method="post" action={api(slug, "a/groups.save_page")} className="stack">
              <Hidden values={{ back, groupId: h.group.id, notice: "Page saved." }} />
              <label htmlFor="gp-title">New page title</label>
              <input id="gp-title" name="title" required maxLength={120} />
              <label htmlFor="gp-text">Content (## heading, - list, [link](https://…))</label>
              <textarea id="gp-text" name="text" rows={4} required />
              <button className="btn btn-outline btn-sm" type="submit">
                Add page
              </button>
            </form>
          </section>
          <section className="card card-pad stack" aria-labelledby="gh-files">
            <h3 id="gh-files" className="card-title">
              Files <span className="tiny muted">· {pct}% of {Math.round(h.quota.limitBytes / 1024 / 1024)} MB</span>
            </h3>
            <ul className="item-list small">
              {h.files.map((f) => (
                <li key={f.id}>
                  <a href={api(slug, `files/${f.id}/preview`)}>{f.name}</a> <span className="tiny muted">· {f.owner}</span>
                </li>
              ))}
            </ul>
            <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row wrap">
              <Hidden values={{ back, groupId: h.group.id, purpose: "group" }} />
              <label className="sr-only" htmlFor="gh-file">
                Add a group file
              </label>
              <input id="gh-file" type="file" name="file" required />
              <button className="btn btn-outline btn-sm" type="submit">
                Upload
              </button>
            </form>
          </section>
        </div>
        <section className="card card-pad stack" aria-labelledby="gh-disc">
          <h3 id="gh-disc" className="card-title">
            Discussion
          </h3>
          {h.threads.map((t) => (
            <article key={t.id} className="stack">
              <h4>
                {t.title} <span className="tiny muted">· {t.author}</span>
              </h4>
              <p className="small" style={{ whiteSpace: "pre-wrap" }}>
                {t.body}
              </p>
              <ul className="item-list small">
                {t.replies.map((r) => (
                  <li key={r.id}>
                    <strong>{r.author}:</strong> {r.body}
                  </li>
                ))}
              </ul>
              <form method="post" action={api(slug, "a/groups.post")} className="row wrap">
                <Hidden values={{ back, groupId: h.group.id, parentId: t.id, notice: "Reply posted." }} />
                <label className="sr-only" htmlFor={`gr-${t.id}`}>
                  Reply to {t.title}
                </label>
                <input id={`gr-${t.id}`} name="body" required placeholder="Reply…" />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Reply
                </button>
              </form>
            </article>
          ))}
          <form method="post" action={api(slug, "a/groups.post")} className="stack">
            <Hidden values={{ back, groupId: h.group.id, notice: "Thread started." }} />
            <label htmlFor="gt-title">New thread</label>
            <input id="gt-title" name="title" required maxLength={120} />
            <label htmlFor="gt-body">Message</label>
            <textarea id="gt-body" name="body" rows={3} required />
            <button className="btn btn-outline btn-sm" type="submit">
              Post
            </button>
          </form>
        </section>
      </div>
    );
  }
  return (
    <section className="card card-pad stack" aria-labelledby="mg-h">
      <h2 id="mg-h" className="card-title">
        My groups
      </h2>
      {g.mine.length ? (
        <ul className="item-list">
          {g.mine.map((x) => (
            <li key={x.id}>
              <a href={`${here}?group=${x.id}`}>{x.name}</a> <span className="tiny muted">· {x.course} · {x.members} members · {x.pages} pages · {x.posts} posts</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">You're not in any groups yet.</p>
      )}
      {g.joinable.length > 0 && (
        <>
          <h3 className="h4">Account groups you can join</h3>
          <ul className="item-list">
            {g.joinable.map((x) => (
              <li key={x.id} className="row wrap">
                {x.name} <span className="tiny muted">· {x.members} members</span>
                <form method="post" action={api(slug, "a/groups.join_account_group")}>
                  <Hidden values={{ back: here, groupId: x.id, notice: "Joined." }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Join
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
      {hasAny(actor, ["admin"]) && (
        <details>
          <summary className="small">Create an account group (spans courses)</summary>
          <form method="post" action={api(slug, "a/groups.create_account_group")} className="stack">
            <Hidden values={{ back: here, notice: "Group created." }} />
            <label htmlFor="ag-name">Name</label>
            <input id="ag-name" name="name" required />
            <label>
              <input type="checkbox" name="selfJoin" value="true" /> Anyone can join
            </label>
            <button className="btn btn-outline btn-sm" type="submit">
              Create
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

/** Personal media library: record in the browser or upload, caption, and share. */
export function MediaLibraryPanel({ store, actor, slug, here }: P) {
  const lib = myLibrary(store, actor);
  const teaching = Object.entries(actor.courseRoles ?? {}).filter(([, r]) => r.some((x) => ["instructor", "ta", "designer"].includes(x))).map(([id]) => ({ id, code: String(store.get("courses", id)?.code ?? id) }));
  const Item = ({ m }: { m: (typeof lib.mine)[number] }) => (
    <li className="stack">
      <div>
        <strong>{m.title}</strong> <span className="tiny muted">{m.mine ? `· shared with ${m.sharedWith}` : `· from ${m.owner}`} · {m.captions.length ? m.captions.map((c) => `${c.kind} (${c.language})`).join(", ") : "no captions yet"}</span>
      </div>
      <a className="small" href={api(slug, `files/${m.fileId}/preview`)}>
        Play
      </a>
      {m.mine && (
        <details>
          <summary className="small">Captions and sharing</summary>
          <form method="post" action={api(slug, "a/media.captions")} className="stack">
            <Hidden values={{ back: here, mediaId: m.id, notice: "Captions added." }} />
            <label htmlFor={`cap-l-${m.id}`}>Language</label>
            <input id={`cap-l-${m.id}`} name="language" defaultValue="en" required />
            <label htmlFor={`cap-t-${m.id}`}>WebVTT</label>
            <textarea id={`cap-t-${m.id}`} name="text" rows={3} defaultValue={"WEBVTT\n\n00:00.000 --> 00:04.000\n"} required />
            <button className="btn btn-ghost btn-sm" type="submit">
              Add captions
            </button>
          </form>
          <form method="post" action={api(slug, "a/media.share")} className="stack">
            <Hidden values={{ back: here, mediaId: m.id, notice: "Shared." }} />
            {teaching.length > 0 && (
              <>
                <label htmlFor={`sh-c-${m.id}`}>Into a course I teach</label>
                <select id={`sh-c-${m.id}`} name="courseId" defaultValue="">
                  <option value="">—</option>
                  {teaching.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label htmlFor={`sh-u-${m.id}`}>With people (user ids, comma-separated)</label>
            <input id={`sh-u-${m.id}`} name="userIds" />
            <button className="btn btn-ghost btn-sm" type="submit">
              Share
            </button>
          </form>
        </details>
      )}
    </li>
  );
  return (
    <section className="card card-pad stack" aria-labelledby="ml-h">
      <h2 id="ml-h" className="card-title">
        My media library
      </h2>
      <MediaRecorderForm action={api(slug, "upload")} back={here} />
      <form method="post" action={api(slug, "upload")} encType="multipart/form-data" className="row wrap">
        <Hidden values={{ back: here, purpose: "media", notice: "Saved to your media library." }} />
        <label htmlFor="ml-file">Or upload audio/video</label>
        <input id="ml-file" type="file" name="file" accept="audio/*,video/*" required />
        <button className="btn btn-outline btn-sm" type="submit">
          Upload
        </button>
      </form>
      {lib.mine.length ? (
        <ul className="item-list">
          {lib.mine.map((m) => (
            <Item key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <p className="small muted">Nothing in your library yet.</p>
      )}
      {lib.sharedWithMe.length > 0 && (
        <>
          <h3 className="h4">Shared with me</h3>
          <ul className="item-list">
            {lib.sharedWithMe.map((m) => (
              <Item key={m.id} m={m} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
