import type { TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { dashboard, activity, planner, profile, viewHistory } from "../../services/dashboard";
import { projection } from "../../services/calendar";
import { inbox, conversationView } from "../../services/collaboration";
import { myNotifications, search } from "../../services/success";
import { myTokens } from "../../services/integration";
import { OPERATIONS } from "../../http/ops";
import { api, Chip, Empty, fmt, Hidden, OpForm, PageHead } from "../kit";

type SP = Record<string, string | undefined>;
const t = (s: string, slug: string) => s.replace("{tenant}", slug);

export function DashboardView({ store, actor, slug, sp }: { store: TenantStore; actor: Actor; slug: string; sp: SP }) {
  const d = dashboard(store, actor);
  const view = sp.view ?? d.view;
  const here = `/campus/${slug}/dashboard`;
  return (
    <>
      <PageHead title="Dashboard" sub={`Welcome, ${actor.name.split(" ")[0]}.`}>
        <nav className="tabs" aria-label="Dashboard view">
          {(["cards", "list", "activity"] as const).map((v) => (
            <a key={v} href={`${here}?view=${v}`} aria-current={view === v ? "page" : undefined}>
              {v === "cards" ? "Card view" : v === "list" ? "List view" : "Recent activity"}
            </a>
          ))}
        </nav>
      </PageHead>
      <div className="with-aside campus-dash">
        <section aria-labelledby="dash-main">
          <h2 id="dash-main" className="sr-only">
            {view === "cards" ? "Courses" : view === "list" ? "Planner" : "Activity"}
          </h2>
          {view === "cards" &&
            (d.cards.length ? (
              <ul className="grid g3 campus-cards">
                {d.cards.map((c) => (
                  <li key={c.id} className="card campus-card">
                    <div className="campus-card-band" style={{ background: c.color }} aria-hidden="true" />
                    <div className="card-pad">
                      <a href={`/campus/${slug}/courses/${c.id}`} className="card-title">
                        {c.title}
                      </a>
                      <p className="tiny muted">
                        {c.code} · {c.roles.join(", ")}
                        {!c.published && (
                          <>
                            {" "}
                            · <Chip s="unpublished" />
                          </>
                        )}
                      </p>
                      <p className="small">
                        {c.unreadAnnouncements > 0 && <a href={`/campus/${slug}/courses/${c.id}/announcements`}>{c.unreadAnnouncements} new announcement(s)</a>}
                        {c.toGrade > 0 && (
                          <>
                            {" "}
                            <a href={`/campus/${slug}/courses/${c.id}/grades`}>{c.toGrade} to grade</a>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No courses yet.">When you're enrolled, your courses appear here.</Empty>
            ))}
          {view === "list" && <PlannerList store={store} actor={actor} slug={slug} back={`${here}?view=list`} />}
          {view === "activity" && (
            <ul className="item-list">
              {activity(store, actor).map((x, i) => (
                <li key={i}>
                  <a href={t(x.href, slug)}>{x.title}</a> <span className="tiny muted">{fmt(x.at, true)}</span>
                </li>
              ))}
            </ul>
          )}
          <details className="card card-pad">
            <summary>Customize dashboard</summary>
            <form method="post" action={api(slug, "a/dashboard.prefs")} className="stack">
              <Hidden values={{ back: here }} />
              <div className="field">
                <label htmlFor="dash-view">Default view</label>
                <select id="dash-view" name="view" defaultValue={d.view}>
                  <option value="cards">Card view</option>
                  <option value="list">List view</option>
                  <option value="activity">Recent activity</option>
                </select>
              </div>
              <fieldset>
                <legend>Favorite courses (only favorites show as cards)</legend>
                {d.cards.length === 0 && <p className="tiny muted">No courses.</p>}
                {dashboard(store, actor).cards.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" name="favorites[]" value={c.id} defaultChecked={c.favorite} /> {c.originalTitle}
                  </label>
                ))}
              </fieldset>
              <button className="btn btn-outline btn-sm" type="submit">
                Save
              </button>
            </form>
          </details>
        </section>
        <aside className="stack" aria-label="To do and upcoming">
          <section className="card card-pad">
            <h2 className="card-title">To do</h2>
            {d.todo.length ? (
              <ul className="item-list">
                {d.todo.slice(0, 8).map((x, i) => (
                  <li key={i}>
                    <a href={t(x.href, slug)}>{x.title}</a>
                    <span className="tiny muted"> {x.count ? `${x.count} to grade` : x.dueAt ? `due ${fmt(x.dueAt, true)}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Nothing for now.</p>
            )}
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Coming up</h2>
            {d.comingUp.length ? (
              <ul className="item-list">
                {d.comingUp.slice(0, 6).map((x) => (
                  <li key={x.id}>
                    {x.title} <span className="tiny muted">{fmt(x.start, true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Nothing in the next week.</p>
            )}
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Recent feedback</h2>
            {d.recentFeedback.length ? (
              <ul className="item-list">
                {d.recentFeedback.slice(0, 5).map((x, i) => (
                  <li key={i}>
                    <strong>{x.title}</strong> {"score" in x ? <span className="small">— {String(x.score)}{"points" in x && x.points ? ` / ${x.points}` : ""}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No new feedback.</p>
            )}
          </section>
          {d.grades.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">Grades</h2>
              <ul className="item-list">
                {d.grades.map((g) => (
                  <li key={g.courseId}>
                    <a href={`/campus/${slug}/courses/${g.courseId}/grades`}>{String(g.code)}</a> — {g.hidden ? "hidden by instructor" : g.pct === null ? "no grades yet" : `${g.pct}% ${g.letter ?? ""}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function PlannerList({ store, actor, slug, back }: { store: TenantStore; actor: Actor; slug: string; back: string }) {
  const from = new Date(Date.now() - 2 * 86400_000).toISOString();
  const to = new Date(Date.now() + 21 * 86400_000).toISOString();
  const items = planner(store, actor, from, to);
  return (
    <div className="stack">
      {items.length ? (
        <ul className="item-list campus-planner">
          {items.map((x) => (
            <li key={`${x.kind}:${x.id}`} className={x.done ? "done" : undefined}>
              <form method="post" action={api(slug, "a/planner.mark")} className="inline">
                <Hidden values={{ back, refType: x.kind, refId: x.id, done: x.done ? "false" : "true" }} />
                <button className="btn btn-ghost btn-sm" type="submit" aria-pressed={x.done}>
                  {x.done ? "✓ Done" : "Mark done"}
                </button>
              </form>{" "}
              <span>{x.title}</span> <span className="tiny muted">{x.kind} · {fmt(x.start, true)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nothing planned in the next three weeks." />
      )}
      <form method="post" action={api(slug, "r/planner_items")} className="row">
        <Hidden values={{ back }} />
        <label className="sr-only" htmlFor="todo-title">
          New to-do
        </label>
        <input id="todo-title" name="title" placeholder="Add a to-do" required />
        <label className="sr-only" htmlFor="todo-date">
          Date
        </label>
        <input id="todo-date" name="dueAt" type="datetime-local" />
        <button className="btn btn-outline btn-sm" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}

export function CalendarView({ store, actor, slug, sp }: { store: TenantStore; actor: Actor; slug: string; sp: SP }) {
  const start = sp.from ? new Date(sp.from) : new Date(Date.now() - 3 * 86400_000);
  const from = start.toISOString();
  const to = new Date(start.getTime() + 35 * 86400_000).toISOString();
  const { items, undated } = projection(store, actor, from, to);
  const days = new Map<string, typeof items>();
  for (const i of items) {
    const k = String(i.start).slice(0, 10);
    days.set(k, [...(days.get(k) ?? []), i]);
  }
  const here = `/campus/${slug}/calendar`;
  const prev = new Date(start.getTime() - 28 * 86400_000).toISOString().slice(0, 10);
  const next = new Date(start.getTime() + 28 * 86400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHead title="Calendar" sub="Assignments, quizzes, class meetings, live sessions, office hours and your to-dos.">
        <a className="btn btn-ghost btn-sm" href={`${here}?from=${prev}`}>
          ← Earlier
        </a>
        <a className="btn btn-ghost btn-sm" href={`${here}?from=${next}`}>
          Later →
        </a>
      </PageHead>
      <div className="with-aside">
        <section aria-label="Agenda">
          {[...days.entries()].length ? (
            <ol className="campus-agenda">
              {[...days.entries()].map(([day, list]) => (
                <li key={day}>
                  <h2 className="small">{fmt(day)}</h2>
                  <ul className="item-list">
                    {list.map((i) => (
                      <li key={`${i.kind}:${i.id}:${i.start}`}>
                        <span className="dot" style={{ background: i.color ?? "var(--primary)" }} aria-hidden="true" /> {i.href ? <a href={t(i.href, slug)}>{i.title}</a> : i.title} <span className="tiny muted">{i.kind} · {String(i.start).slice(11, 16)} UTC</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <Empty title="Nothing in this range." />
          )}
          {undated.length > 0 && (
            <section className="card card-pad">
              <h2 className="card-title">Undated</h2>
              <ul className="item-list">
                {undated.map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
              </ul>
            </section>
          )}
        </section>
        <aside className="stack">
          <section className="card card-pad">
            <h2 className="card-title">Add an event</h2>
            <form method="post" action={api(slug, "r/calendar_events")} className="stack">
              <Hidden values={{ back: here }} />
              <div className="field">
                <label htmlFor="ev-title">Title</label>
                <input id="ev-title" name="title" required />
              </div>
              <div className="field">
                <label htmlFor="ev-start">Starts</label>
                <input id="ev-start" name="startsAt" type="datetime-local" required />
              </div>
              <button className="btn btn-outline btn-sm" type="submit">
                Add event
              </button>
            </form>
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Calendar feed</h2>
            <p className="small muted">Subscribe in another calendar app with a private link.</p>
            <OpForm slug={slug} op={OPERATIONS["calendar.feed"]} back={here} label="Create feed link" />
          </section>
        </aside>
      </div>
    </>
  );
}

export function InboxView({ store, actor, slug, sp }: { store: TenantStore; actor: Actor; slug: string; sp: SP }) {
  const folder = (sp.folder as "inbox") ?? "inbox";
  const here = `/campus/${slug}/inbox`;
  const list = inbox(store, actor, { folder, courseId: sp.courseId, q: sp.q }) as { id: string; subject: unknown; unread?: boolean; last?: unknown; at?: unknown; participants?: string[]; courseId?: unknown }[];
  const open = sp.id ? conversationView(store, actor, sp.id) : null;
  const courses = Object.keys(actor.courseRoles);
  return (
    <>
      <PageHead title="Inbox" />
      <nav className="tabs" aria-label="Folders">
        {(["inbox", "unread", "starred", "sent", "archived", "submission_comments"] as const).map((f) => (
          <a key={f} href={`${here}?folder=${f}`} aria-current={folder === f ? "page" : undefined}>
            {f.replace("_", " ")}
          </a>
        ))}
      </nav>
      <div className="with-aside">
        <section aria-label="Conversations">
          {list.length ? (
            <ul className="item-list">
              {list.map((c) => (
                <li key={c.id} className={c.unread ? "unread" : undefined}>
                  <a href={`${here}?folder=${folder}&id=${c.id}`}>{String(c.subject || "(no subject)")}</a> {c.unread && <span className="badge badge-blue">new</span>} <span className="tiny muted">{fmt(c.at, true)}</span>
                  <p className="small muted">{String(c.last ?? "").slice(0, 140)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No messages here." />
          )}
          {open && (
            <article className="card card-pad stack" aria-label="Conversation">
              <h2 className="card-title">{String((open as { subject?: string }).subject ?? "")}</h2>
              {((open as unknown as { messages?: { id: string; author: string; body: string; at: string }[] }).messages ?? []).map((m) => (
                <div key={m.id} className="bubble">
                  <strong>{m.author}</strong> <span className="tiny muted">{fmt(m.at, true)}</span>
                  <p>{m.body}</p>
                </div>
              ))}
              <form method="post" action={api(slug, "a/inbox.reply")} className="stack">
                <Hidden values={{ back: `${here}?id=${sp.id}`, conversationId: sp.id }} />
                <label htmlFor="reply-body">Reply</label>
                <textarea id="reply-body" name="body" required rows={3} />
                <button className="btn btn-primary btn-sm" type="submit">
                  Send reply
                </button>
              </form>
              <form method="post" action={api(slug, "a/inbox.state")}>
                <Hidden values={{ back: here, conversationId: sp.id, folder: "archived" }} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Archive
                </button>
              </form>
            </article>
          )}
        </section>
        <aside className="card card-pad">
          <h2 className="card-title">New message</h2>
          {courses.length ? (
            <form method="post" action={api(slug, "a/inbox.send")} className="stack">
              <Hidden values={{ back: here }} />
              <div className="field">
                <label htmlFor="msg-course">Course</label>
                <select id="msg-course" name="courseId" required>
                  {courses.map((c) => (
                    <option key={c} value={c}>
                      {String(store.get("courses", c)?.title ?? c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="msg-role">To</label>
                <select id="msg-role" name="role">
                  <option value="instructor">Teachers</option>
                  <option value="ta">TAs</option>
                  <option value="student">Students</option>
                  <option value="all">Everyone</option>
                </select>
                <span className="hint">Recipients are checked on the server against active enrollment.</span>
              </div>
              <div className="field">
                <label htmlFor="msg-subj">Subject</label>
                <input id="msg-subj" name="subject" required />
              </div>
              <div className="field">
                <label htmlFor="msg-body">Message</label>
                <textarea id="msg-body" name="body" rows={4} required />
              </div>
              <label className="check">
                <input type="checkbox" name="individual" value="true" /> Send individual messages
              </label>
              <button className="btn btn-primary btn-sm" type="submit">
                Send
              </button>
            </form>
          ) : (
            <p className="small muted">You're not in any courses.</p>
          )}
        </aside>
      </div>
    </>
  );
}

export function NotificationsView({ store, actor, slug }: { store: TenantStore; actor: Actor; slug: string }) {
  const n = myNotifications(store, actor);
  const here = `/campus/${slug}/notifications`;
  return (
    <>
      <PageHead title="Notifications" sub={`${n.unread} unread`}>
        <form method="post" action={api(slug, "a/notifications.read")}>
          <Hidden values={{ back: here, deliveryId: "all" }} />
          <button className="btn btn-outline btn-sm" type="submit">
            Mark all read
          </button>
        </form>
      </PageHead>
      {n.items.length ? (
        <ul className="item-list">
          {n.items.map((d) => (
            <li key={d.id} className={d.state === "unread" ? "unread" : undefined}>
              <a href={t(String(d.href ?? here), slug)}>{String(d.title)}</a> <span className="tiny muted">{String(d.category)} · {fmt(d.createdAt, true)}</span>
              <p className="small">{String(d.body ?? "")}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No notifications." />
      )}
      <section className="card card-pad">
        <h2 className="card-title">Notification preferences</h2>
        <p className="small muted">Choose channels, a digest, quiet hours and per-category frequency.</p>
        <OpForm slug={slug} op={OPERATIONS["notifications.prefs"]} back={here} label="Save preferences" />
      </section>
    </>
  );
}

export function SearchView({ store, actor, slug, sp }: { store: TenantStore; actor: Actor; slug: string; sp: SP }) {
  const q = sp.q ?? "";
  const results = q ? search(store, actor, q) : [];
  return (
    <>
      <PageHead title="Search" sub="Results respect your role, enrollment and what's published." />
      <form method="get" className="row" role="search">
        <label className="sr-only" htmlFor="search-q">
          Search
        </label>
        <input id="search-q" name="q" defaultValue={q} required />
        <button className="btn btn-primary btn-sm" type="submit">
          Search
        </button>
      </form>
      {q && (results.length ? (
        <ul className="item-list">
          {results.map((r, i) => (
            <li key={i}>
              <a href={`/campus/${slug}/${r.href}`}>{r.title}</a> <span className="tiny muted">{r.kind}</span>
              <p className="small muted">{r.snippet}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={`No results for “${q}”.`} />
      ))}
    </>
  );
}

export function AccountView({ store, actor, slug }: { store: TenantStore; actor: Actor; slug: string }) {
  const p = profile(store, actor);
  const here = `/campus/${slug}/account`;
  return (
    <>
      <PageHead title="Account & profile" sub={actor.email} />
      <div className="grid g2">
        <section className="card card-pad">
          <h2 className="card-title">Profile and accessibility</h2>
          <form method="post" action={api(slug, "a/account.profile.update")} className="stack">
            <Hidden values={{ back: here }} />
            {(
              [
                ["displayName", "Display name"],
                ["pronouns", "Pronouns"],
                ["timeZone", "Time zone"],
              ] as const
            ).map(([k, l]) => (
              <div className="field" key={k}>
                <label htmlFor={`p-${k}`}>{l}</label>
                <input id={`p-${k}`} name={k} defaultValue={String(p[k] ?? "")} />
              </div>
            ))}
            <div className="field">
              <label htmlFor="p-bio">Bio</label>
              <textarea id="p-bio" name="bio" defaultValue={String(p.bio ?? "")} rows={3} />
            </div>
            <div className="field">
              <label htmlFor="p-lang">Language</label>
              <select id="p-lang" name="language" defaultValue={p.language}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <fieldset>
              <legend>Display</legend>
              {(
                [
                  ["highContrast", "High-contrast interface"],
                  ["dyslexiaFont", "Dyslexia-friendly font"],
                  ["underlineLinks", "Underline links"],
                  ["reducedMotion", "Reduce motion"],
                ] as const
              ).map(([k, l]) => (
                <label className="check" key={k}>
                  <input type="hidden" name={k} value="false" />
                  <input type="checkbox" name={k} value="true" defaultChecked={p[k]} /> {l}
                </label>
              ))}
            </fieldset>
            <button className="btn btn-primary btn-sm" type="submit">
              Save profile
            </button>
          </form>
        </section>
        <div className="stack">
          <section className="card card-pad">
            <h2 className="card-title">Mobile sign-in</h2>
            <p className="small muted">Create a one-time code (10 minutes) to sign in on the mobile app.</p>
            <OpForm slug={slug} op={OPERATIONS["account.qr_login"]} back={here} label="Create QR login code" />
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Access tokens</h2>
            <ul className="item-list">
              {myTokens(store, actor).map((tk) => (
                <li key={tk.id}>
                  {String(tk.purpose ?? "App")} · {(tk.scopes as string[]).join(", ")} {tk.revokedAt ? <Chip s="revoked" /> : <span className="tiny muted">expires {fmt(tk.expiresAt)}</span>}
                </li>
              ))}
            </ul>
            <OpForm slug={slug} op={OPERATIONS["tokens.create"]} back={here} label="Create token" />
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Recently viewed</h2>
            <ul className="item-list">
              {viewHistory(store, actor).slice(0, 10).map((h) => (
                <li key={h.id}>
                  <a href={String(h.href)}>{String(h.title)}</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
