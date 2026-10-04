import type { ReactNode } from "react";
import { CampusError, nowMs, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import * as M from "../../services/comms";
import { api, Chip, Hidden, PageHead } from "../kit";

type SP = Record<string, string | undefined>;
interface Ctx {
  store: TenantStore;
  actor: Actor;
  slug: string;
  sp: SP;
  here: string;
  staff: boolean;
  admin: boolean;
}

export const COMMS_SECTIONS = [
  { slug: "help", title: "Get help (support assistant)", learner: true },
  { slug: "connectors", title: "Connector Hub" },
  { slug: "planner", title: "Session Planner" },
  { slug: "monitor", title: "Live Session Monitor" },
  { slug: "recordings", title: "Recordings & Transcripts" },
  { slug: "attendance", title: "Attendance" },
  { slug: "inbox", title: "CX Inbox" },
  { slug: "knowledge", title: "Knowledge Base & Setup Guides", learner: true },
  { slug: "genesys", title: "Genesys Cloud", admin: true },
  { slug: "analytics", title: "Analytics" },
  { slug: "audit", title: "Audit", admin: true },
] as const;

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export function CommsHub({ store, actor, slug, path, sp }: { store: TenantStore; actor: Actor; slug: string; path: string[]; sp: SP }) {
  const staff = hasAny(actor, ["admin", "instructor", "ta", "support", "advisor"]);
  const admin = hasAny(actor, ["admin"]);
  const base = `/campus/${slug}/comms`;
  const t: Ctx = { store, actor, slug, sp, here: `${base}/${path.join("/") || "help"}`, staff, admin };
  if (path[0] === "card" && path[1]) return <Frame t={t} title="Session Card" base={base} current="">{<Card t={t} id={path[1]} />}</Frame>;
  if (path[0] === "join" && path[1] && path[2]) return <Frame t={t} title="Join this part" base={base} current="">{<Join t={t} id={path[1]} n={Number(path[2])} />}</Frame>;
  const allowed = COMMS_SECTIONS.filter((s) => ("learner" in s && s.learner) || (staff && !("admin" in s && s.admin)) || admin);
  const sec = allowed.find((s) => s.slug === path[0])?.slug ?? allowed[0].slug;
  return (
    <Frame t={t} title={COMMS_SECTIONS.find((s) => s.slug === sec)!.title} base={base} current={sec} sections={allowed}>
      <Body t={t} sec={sec} />
    </Frame>
  );
}

function Frame({ t, title, base, current, sections, children }: { t: Ctx; title: string; base: string; current: string; sections?: readonly { slug: string; title: string }[]; children: ReactNode }) {
  return (
    <div className="stack campus-hub campus-comms">
      <PageHead title="CX & Live Sessions Hub" sub="Live classes on free meeting plans without losing a minute of learning, and help that knows where your class is." />
      {t.sp.notice && (
        <p className="notice notice-ok" role="status">
          {t.sp.notice}
        </p>
      )}
      {t.sp.error && (
        <p className="notice notice-err" role="alert">
          {t.sp.error}
        </p>
      )}
      <div className="learn-layout">
        <nav className="learn-nav" aria-label="CX and live sessions">
          <ol>
            {(sections ?? COMMS_SECTIONS.filter((s) => "learner" in s && s.learner)).map((s) => (
              <li key={s.slug}>
                <a href={`${base}/${s.slug}`} aria-current={s.slug === current ? "page" : undefined}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <section className="stack learn-main" aria-labelledby="comms-h">
          <h2 id="comms-h" className="section-title">
            {title}
          </h2>
          {children}
        </section>
      </div>
    </div>
  );
}

function Body({ t, sec }: { t: Ctx; sec: string }) {
  try {
    switch (sec) {
      case "connectors":
        return <Connectors t={t} />;
      case "planner":
        return <Planner t={t} />;
      case "monitor":
        return <Monitor t={t} />;
      case "recordings":
        return <Recordings t={t} />;
      case "attendance":
        return <Attendance t={t} />;
      case "inbox":
        return <Inbox t={t} />;
      case "knowledge":
        return <Knowledge t={t} />;
      case "genesys":
        return <Genesys t={t} />;
      case "analytics":
        return <Analytics t={t} />;
      case "audit":
        return <Audit t={t} />;
      default:
        return <Help t={t} />;
    }
  } catch (e) {
    if (e instanceof CampusError) return <p className="notice notice-err">{e.message}</p>;
    throw e;
  }
}

const sessions = (t: Ctx) => t.store.list("comms_sessions").sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

function Help({ t }: { t: Ctx }) {
  const mine = t.store.list("cx_conversations", (c) => c.userId === t.actor.id).slice(-3).reverse();
  return (
    <>
      <form method="post" action={api(t.slug, "a/comms.ask")} className="card card-pad stack">
        <Hidden values={{ back: t.here, show_result: "1" }} />
        <div className="field">
          <label htmlFor="ask-q">What do you need?</label>
          <input id="ask-q" name="question" required placeholder="e.g. My class ended — where do I go?" />
        </div>
        <div>
          <button className="btn btn-primary btn-sm" type="submit">
            Ask
          </button>
        </div>
        <p className="tiny muted">You're talking to an automated assistant. It can resend links and point you to guides; a person takes over anything else.</p>
      </form>
      {mine.map((c) => (
        <article key={String(c.id)} className="card card-pad stack">
          {((c.messages as { from: string; text: string }[]) ?? []).map((m, i) => (
            <p key={i} className="small">
              <strong>{m.from === "learner" ? "You" : m.from.startsWith("agent") ? "Assistant" : "Support"}:</strong> {m.text}
            </p>
          ))}
        </article>
      ))}
    </>
  );
}

function Card({ t, id }: { t: Ctx; id: string }) {
  const c = M.sessionCard(t.store, t.actor, id);
  return (
    <section className="card card-pad stack session-card">
      <h3 className="card-title">{c.title}</h3>
      <p className="small">{c.rule}</p>
      <ol>
        {c.parts.map((p) => (
          <li key={p.n}>
            <strong>{p.label}</strong> · {fmt(p.startsAt)} · {p.minutes} min · {p.platform === "zoom" ? "Zoom" : "Webex"} · <a href={p.joinPath}>Join part {p.n}</a>
            {p.simulated && <span className="badge badge-blue">simulated meeting</span>}
          </li>
        ))}
      </ol>
      {c.asyncMinutes > 0 && <p className="small">Plus a {c.asyncMinutes}-minute async micro-lecture on the course page.</p>}
      <p className="small">{c.help}</p>
      <p className="tiny muted">{c.recordingNotice}</p>
    </section>
  );
}

function Join({ t, id, n }: { t: Ctx; id: string; n: number }) {
  const c = M.sessionCard(t.store, t.actor, id);
  const p = c.parts.find((x) => x.n === n);
  if (!p) return <p className="notice notice-err">That part doesn't exist.</p>;
  return (
    <section className="card card-pad stack">
      <h3 className="card-title">
        {c.title} — {p.label}
      </h3>
      <p className="notice notice-info">{c.recordingNotice}</p>
      <dl className="campus-dl">
        <dt>Platform</dt>
        <dd>{p.platform === "zoom" ? "Zoom" : "Webex"}</dd>
        <dt>Meeting ID</dt>
        <dd>{p.meetingId}</dd>
        <dt>Passcode</dt>
        <dd>{p.passcode}</dd>
        <dt>Starts</dt>
        <dd>{fmt(p.startsAt)}</dd>
      </dl>
      {p.simulated && <p className="small">This staging site creates meetings in a simulator, so these details don't open a real meeting. When the platform account is connected, this page opens the meeting directly.</p>}
      <p className="small">
        <a href={`/campus/${t.slug}/comms/card/${id}`}>Back to the Session Card</a>
      </p>
    </section>
  );
}

function Connectors({ t }: { t: Ctx }) {
  return (
    <div className="stack">
      {M.connectorHub(t.store, t.actor).map((c) => (
        <article key={c.key} className="card card-pad between">
          <div>
            <strong>{c.name}</strong> <Chip s={String(c.status)} />
            <p className="small">{c.note}</p>
            <p className="tiny muted">
              {c.plan}
              {c.verifiedAt ? ` · plan limits verified ${String(c.verifiedAt).slice(0, 10)}` : ""} · re-verify: {c.reverify}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Planner({ t }: { t: Ctx }) {
  const total = Number(t.sp.total ?? 90);
  const preview = M.segmentPlan(total, { kind: (t.sp.kind as "class") ?? "class", licensedHost: t.sp.licensed === "1" });
  const courses = t.store.list("courses", (c) => t.store.list("enrollments", (e) => e.courseId === c.id && e.userId === t.actor.id && ["instructor", "ta"].includes(String(e.role))).length > 0 || hasAny(t.actor, ["admin"])).slice(0, 40);
  return (
    <>
      <form method="get" className="row">
        <label htmlFor="pl-total">Class length (minutes)</label>
        <input id="pl-total" name="total" type="number" min={10} max={480} defaultValue={total} />
        <label htmlFor="pl-kind">Kind</label>
        <select id="pl-kind" name="kind" defaultValue={t.sp.kind ?? "class"}>
          <option value="class">Class</option>
          <option value="office_hours">Office hours (1-on-1)</option>
        </select>
        <label className="check small">
          <input type="checkbox" name="licensed" value="1" defaultChecked={t.sp.licensed === "1"} /> Licensed host
        </label>
        <button className="btn btn-outline btn-sm" type="submit">
          Preview
        </button>
      </form>
      <p className="small">
        <strong>{preview.rule}</strong>
      </p>
      <ol className="small">
        {preview.segments.map((s, i) => (
          <li key={i}>
            {s.label}: {s.teach} min teaching{s.buffer ? ` + ${s.buffer} min buffer` : ""}
          </li>
        ))}
      </ol>
      {t.staff && (
        <form method="post" action={api(t.slug, "a/comms.plan")} className="card card-pad stack">
          <h3 className="card-title">Create the session</h3>
          <Hidden values={{ back: t.here, notice: "Session planned: meetings pre-created and the Session Card published." }} />
          <div className="grid g2">
            <div className="field">
              <label htmlFor="pl-course">Course</label>
              <select id="pl-course" name="courseId">
                {courses.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {String(c.code)} {String(c.title)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pl-title">Title</label>
              <input id="pl-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="pl-start">Starts (ISO, UTC)</label>
              <input id="pl-start" name="startsAt" required placeholder="2027-01-16T11:00:00Z" />
            </div>
            <div className="field">
              <label htmlFor="pl-min">Minutes</label>
              <input id="pl-min" name="totalMinutes" type="number" defaultValue={total} />
            </div>
            <div className="field">
              <label htmlFor="pl-plat">Platform</label>
              <select id="pl-plat" name="platform">
                <option value="zoom">Zoom (backup: Webex)</option>
                <option value="webex">Webex (backup: Zoom)</option>
              </select>
            </div>
          </div>
          <div>
            <button className="btn btn-primary btn-sm" type="submit">
              Plan session
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function Monitor({ t }: { t: Ctx }) {
  const list = sessions(t);
  if (!list.length) return <p className="small">No sessions planned yet.</p>;
  return (
    <div className="stack">
      {list.slice(0, 20).map((s) => {
        const st = M.liveState(t.store, s.id, nowMs());
        return (
          <article key={String(s.id)} className="card card-pad stack">
            <p>
              <strong>{String(s.title)}</strong> · {(s.segments as M.Segment[]).length} part(s) · {String(s.platform)} · <a href={`/campus/${t.slug}/comms/card/${s.id}`}>Session Card</a>
            </p>
            <p className="small">{st.current ? `Now: Part ${st.current.n} (${st.current.label}), ${st.current.minutesIn} min in, ends in ${st.current.endsIn} min.` : st.ended ? "Ended." : `Next: Part ${st.next?.n} at ${fmt(String(st.next?.startsAt))}.`}</p>
            {st.warning && <p className="notice notice-info">{st.warning}</p>}
            <div className="row">
              <form method="post" action={api(t.slug, "a/comms.failover")}>
                <Hidden values={{ back: t.here, sessionId: String(s.id), reason: "Primary platform unavailable", notice: "Moved to the backup platform; new links broadcast." }} />
                <button className="btn btn-outline btn-sm" type="submit">
                  Fail over to {String(s.backupPlatform) === "webex" ? "Webex" : "Zoom"}
                </button>
              </form>
              <form method="post" action={api(t.slug, "a/comms.regenerate")}>
                <Hidden values={{ back: t.here, sessionId: String(s.id), segment: String(st.current?.n ?? st.next?.n ?? 1), notice: "Link regenerated and rebroadcast." }} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Regenerate leaked link
                </button>
              </form>
            </div>
            <ul className="tiny muted">
              {((s.events as { kind: string; text: string; at: string }[]) ?? []).slice(-6).map((e, i) => (
                <li key={i}>
                  {fmt(e.at)} — {e.text}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function Recordings({ t }: { t: Ctx }) {
  const recs = t.store.list("comms_recordings");
  const recaps = t.store.list("comms_recaps", (r) => r.state === "awaiting_approval");
  return (
    <>
      <h3 className="small">Recap drafts awaiting approval ({recaps.length})</h3>
      {recaps.map((r) => (
        <form key={String(r.id)} method="post" action={api(t.slug, "a/comms.recap_approve")} className="card card-pad stack">
          <Hidden values={{ back: t.here, recapId: String(r.id), notice: "Recap posted to the course." }} />
          <label htmlFor={`rc-${r.id}`}>Part {String(r.segment)} recap</label>
          <textarea id={`rc-${r.id}`} name="text" rows={4} defaultValue={String(r.text)} />
          <div>
            <button className="btn btn-primary btn-sm" type="submit">
              Approve and post
            </button>
          </div>
        </form>
      ))}
      <h3 className="small">Recordings</h3>
      {recs.length === 0 ? (
        <p className="small">No recordings uploaded.</p>
      ) : (
        <ul className="small">
          {recs.map((r) => (
            <li key={String(r.id)}>
              {String(r.fileName)} (Part {String(r.segment)}) <Chip s={String(r.state) === "published" ? "published" : "pending"} /> {String(r.note ?? "")}
              {r.state === "captions_ready_for_review" && (
                <form method="post" action={api(t.slug, "a/comms.recording_publish")} className="inline">
                  <Hidden values={{ back: t.here, recordingId: String(r.id) }} />
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Approve captions and publish
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Attendance({ t }: { t: Ctx }) {
  const list = sessions(t);
  const id = t.sp.sessionId ?? String(list[0]?.id ?? "");
  if (!id) return <p className="small">No sessions yet.</p>;
  const r = M.reconcile(t.store, t.actor, id);
  return (
    <>
      <p className="small">
        {r.session} · scheduled teaching {r.scheduledMinutes} min. {r.note} {r.confirmedBy ? "Confirmed by the instructor." : ""}
      </p>
      <div className="table-wrap" role="region" aria-label="Attendance by part" tabIndex={0}>
        <table className="table">
          <caption>Attendance by part</caption>
          <thead>
            <tr>
              <th scope="col">Learner</th>
              {r.learners[0]?.parts.map((p) => (
                <th scope="col" key={p.n}>
                  Part {p.n}
                </th>
              ))}
              <th scope="col">Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {r.learners.map((l) => (
              <tr key={l.userId}>
                <th scope="row">{l.name}</th>
                {l.parts.map((p) => (
                  <td key={p.n}>{p.minutes}</td>
                ))}
                <td>{l.totalMinutes}</td>
                <td>
                  <Chip s={l.status === "present" ? "complete" : l.status === "partial" ? "pending" : "missing"} /> {l.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasAny(t.actor, ["admin", "instructor"]) && (
        <form method="post" action={api(t.slug, "a/comms.attendance_confirm")}>
          <Hidden values={{ back: t.here, sessionId: id, notice: "Attendance confirmed." }} />
          <button className="btn btn-primary btn-sm" type="submit">
            Confirm attendance
          </button>
        </form>
      )}
    </>
  );
}

function Inbox({ t }: { t: Ctx }) {
  const rows = M.cxInbox(t.store, t.actor);
  return rows.length === 0 ? (
    <p className="small">No conversations yet.</p>
  ) : (
    <ul className="stack">
      {rows.map((c) => (
        <li key={String(c.id)} className="card card-pad">
          <p>
            <strong>{c.learner}</strong> · {String(c.channel)} · {String(c.intent)} <Chip s={c.state === "escalated" ? "escalated" : "complete"} /> {c.breached && <span className="badge badge-red">SLA breached</span>}
          </p>
          <p className="small">{c.last}</p>
        </li>
      ))}
    </ul>
  );
}

function Knowledge({ t }: { t: Ctx }) {
  const kb = t.store.list("kb_articles", (k) => k.state === "published");
  return (
    <div className="stack">
      {kb.map((k) => (
        <article key={String(k.id)} className="card card-pad">
          <h3 className="card-title">{String(k.title)}</h3>
          <p className="small">{String(k.body)}</p>
        </article>
      ))}
    </div>
  );
}

function Genesys({ t }: { t: Ctx }) {
  const g = M.genesysStatus(t.store);
  return (
    <>
      <p className="notice notice-info">{g.anyConnected ? `Sandbox org: ${g.connected.join(", ")} connected. All other modules stay disabled.` : "DISABLED — awaiting subscription. The connector is built and tested in mock mode; no Genesys API is called."}</p>
      <h3 className="small">Activation checklist</h3>
      <ul className="small">
        {g.checklist.map((c) => (
          <li key={c.key}>
            {c.done ? "✓" : "○"} {c.label}
            {!c.done && (
              <form method="post" action={api(t.slug, "a/comms.genesys_checklist")} className="inline">
                <Hidden values={{ back: t.here, key: c.key, done: "true" }} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Record done
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <div className="table-wrap" role="region" aria-label="Genesys modules" tabIndex={0}>
        <table className="table">
          <caption>Capability modules (each toggled separately)</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Use</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {g.modules.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.name}</th>
                <td className="small">{m.use}</td>
                <td>
                  <Chip s={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="post" action={api(t.slug, "a/comms.genesys_mock")}>
        <Hidden values={{ back: t.here, show_result: "1" }} />
        <button className="btn btn-outline btn-sm" type="submit">
          Run mock-mode tests
        </button>
      </form>
    </>
  );
}

function Analytics({ t }: { t: Ctx }) {
  const rows = M.sessionAnalytics(t.store, t.actor);
  return rows.length === 0 ? (
    <p className="small">No sessions yet.</p>
  ) : (
    <ul className="small">
      {rows.map((r, i) => (
        <li key={i}>
          <strong>{r.session}</strong>: {r.parts} parts · attendees {r.attendees.map((x) => `P${x.part} ${x.learners}`).join(", ")} · rejoin within 3 min {r.rejoin.map((x) => `P${x.part} ${x.rejoinRate ?? "—"}%`).join(", ") || "—"} · {r.minutesAttended} learner-minutes
        </li>
      ))}
    </ul>
  );
}

function Audit({ t }: { t: Ctx }) {
  const rows = M.commsAudit(t.store, t.actor);
  return rows.length === 0 ? (
    <p className="small">No communications actions yet.</p>
  ) : (
    <ul className="tiny">
      {rows.map((r) => (
        <li key={r.id}>
          {r.at.slice(0, 19)} · {r.action} · {r.resource} · {r.reason ?? ""}
        </li>
      ))}
    </ul>
  );
}
