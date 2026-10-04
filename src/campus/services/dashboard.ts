import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { projection } from "./calendar";
import { isStaff, toMs, userName } from "./common";
import { itemAccessible } from "./curriculum";
import { graderQueue } from "./assessment";
import { computeTotals } from "./grading";
import { myNotifications } from "./success";

/**
 * Dashboard (Tab 35) and personal account (Tab 40): course cards, list/planner view,
 * recent activity, to-do, coming up, recent feedback, planner completion marks,
 * recently viewed history and profile/accessibility preferences.
 */

const COLORS = ["#1f4e79", "#0f766e", "#7c2d12", "#5b21b6", "#9d174d", "#155e75", "#3f6212", "#991b1b"];

function prefs(store: TenantStore, a: Actor): Row | undefined {
  return store.list("dashboard_prefs", (p) => p.userId === a.id)[0];
}

export function myCourseIds(store: TenantStore, a: Actor) {
  return Object.keys(a.courseRoles).filter((cid) => {
    const c = store.get("courses", cid);
    if (!c || c.concludedAt) return false;
    return c.state === "published" || isStaff(a, cid);
  });
}

export function cards(store: TenantStore, a: Actor) {
  const p = prefs(store, a);
  const nick = (p?.nicknames as Record<string, string>) ?? {};
  const colors = (p?.colors as Record<string, string>) ?? {};
  const favs = (p?.favorites as string[]) ?? [];
  const order = (p?.cardOrder as string[]) ?? [];
  let ids = myCourseIds(store, a);
  if (favs.length) ids = ids.filter((id) => favs.includes(id));
  ids.sort((x, y) => (order.indexOf(x) + 1 || 999) - (order.indexOf(y) + 1 || 999));
  return ids.map((cid, i) => {
    const c = store.get("courses", cid)!;
    const staff = isStaff(a, cid);
    const unreadAnn = store.list("announcements", (x) => x.courseId === cid && x.state === "published" && !((x.readBy as string[]) ?? []).includes(a.id)).length;
    const toGrade = staff ? store.list("submissions", (s) => s.courseId === cid && s.state === "submitted").length : 0;
    return {
      id: cid,
      code: c.code as string,
      title: (nick[cid] as string) || (c.title as string),
      originalTitle: c.title as string,
      color: colors[cid] ?? COLORS[i % COLORS.length],
      image: (c.image as string) ?? null,
      roles: a.courseRoles[cid] ?? [],
      published: c.state === "published",
      favorite: favs.includes(cid),
      unreadAnnouncements: unreadAnn,
      toGrade,
      href: `/campus/{tenant}/courses/${cid}`,
    };
  });
}

export function setDashboardPrefs(store: TenantStore, a: Actor, values: { view?: "cards" | "list" | "activity"; cardOrder?: string[]; favorites?: string[]; colors?: Record<string, string>; nicknames?: Record<string, string> }) {
  const mine = new Set(Object.keys(a.courseRoles));
  for (const list of [values.cardOrder ?? [], values.favorites ?? [], Object.keys(values.colors ?? {}), Object.keys(values.nicknames ?? {})]) for (const cid of list) if (!mine.has(cid)) throw new CampusError("invalid", "You can only customize your own courses.", 422);
  for (const c of Object.values(values.colors ?? {})) if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new CampusError("invalid", "Colors are hex values like #1f4e79.", 422);
  for (const n of Object.values(values.nicknames ?? {})) if (String(n).length > 60) throw new CampusError("invalid", "Nicknames are up to 60 characters.", 422);
  if (values.view && !["cards", "list", "activity"].includes(values.view)) throw new CampusError("invalid", "Unknown view", 422);
  return store.tx(() => {
    const ex = prefs(store, a);
    return ex ? store.update("dashboard_prefs", ex.id, values) : store.insert("dashboard_prefs", { userId: a.id, view: "cards", ...values }, "dp");
  });
}

/** To-do: what this person should do next (students: due soon and not submitted; staff: needs grading). */
export function todo(store: TenantStore, a: Actor) {
  const out: { kind: string; title: string; courseId: string; dueAt: string | null; href: string; count?: number }[] = [];
  const horizon = new Date(nowMs() + 7 * 86400_000).toISOString();
  const marks = new Set(store.list("planner_marks", (m) => m.userId === a.id && !!m.done).map((m) => `${m.refType}:${m.refId}`));
  for (const cid of myCourseIds(store, a)) {
    if (isStaff(a, cid)) {
      for (const asg of store.list("assignments", (x) => x.courseId === cid && x.state === "published")) {
        try {
          const n = graderQueue(store, a, asg.id, { needsGrading: true }).length;
          if (n) out.push({ kind: "grade", title: `Grade ${asg.title}`, courseId: cid, dueAt: (asg.dueAt as string) ?? null, href: `/campus/{tenant}/courses/${cid}/grader/${asg.id}`, count: n });
        } catch {
          /* grader queue not available to this role */
        }
      }
      continue;
    }
    if (!(a.courseRoles[cid] ?? []).includes("student")) continue;
    for (const asg of store.list("assignments", (x) => x.courseId === cid && x.state === "published" && !!x.dueAt && String(x.dueAt) <= horizon && String(x.dueAt) >= new Date(nowMs() - 86400_000).toISOString())) {
      if (marks.has(`assignment:${asg.id}`)) continue;
      if (!itemAccessible(store, a, "assignment", asg.id).ok) continue;
      if (store.list("submissions", (s) => s.assignmentId === asg.id && s.userId === a.id).length) continue;
      out.push({ kind: "submit", title: asg.title as string, courseId: cid, dueAt: asg.dueAt as string, href: `/campus/{tenant}/courses/${cid}/assignments/${asg.id}` });
    }
    for (const q of store.list("quizzes", (x) => x.courseId === cid && x.state === "published" && !!x.availableUntil && String(x.availableUntil) <= horizon && String(x.availableUntil) >= nowIso())) {
      if (marks.has(`quiz:${q.id}`)) continue;
      if (store.list("attempts", (t) => t.quizId === q.id && t.userId === a.id && t.state === "submitted").length) continue;
      out.push({ kind: "quiz", title: q.title as string, courseId: cid, dueAt: q.availableUntil as string, href: `/campus/{tenant}/courses/${cid}/quizzes/${q.id}` });
    }
  }
  for (const t of store.list("planner_items", (p) => p.userId === a.id && !p.done)) out.push({ kind: "todo", title: t.title as string, courseId: (t.courseId as string) ?? "", dueAt: (t.dueAt as string) ?? null, href: `/campus/{tenant}/dashboard?view=list` });
  return out.sort((x, y) => String(x.dueAt ?? "9999").localeCompare(String(y.dueAt ?? "9999")));
}

export function comingUp(store: TenantStore, a: Actor) {
  const now = nowIso();
  return projection(store, a, now, new Date(nowMs() + 7 * 86400_000).toISOString(), { courseIds: myCourseIds(store, a) }).items.slice(0, 15);
}

/** Recent feedback: posted grades and visible comments from the last two weeks. */
export function recentFeedback(store: TenantStore, a: Actor) {
  const since = new Date(nowMs() - 14 * 86400_000).toISOString();
  const grades = store
    .list("grades", (g) => g.userId === a.id && !!g.posted && String(g.postedAt ?? g.updatedAt) >= since)
    .map((g) => {
      const asg = store.get("assignments", g.assignmentId as string) ?? store.get("quizzes", g.assignmentId as string);
      return { kind: "grade", title: (asg?.title as string) ?? "Item", courseId: g.courseId as string, score: g.excused ? "Excused" : g.score, points: asg?.points ?? null, at: (g.postedAt as string) ?? (g.updatedAt as string) };
    });
  const comments = store
    .list("submission_comments", (c) => c.userId === a.id && c.authorId !== a.id && !c.hiddenUntilPosted && String(c.createdAt) >= since)
    .map((c) => ({ kind: "comment", title: String(c.body).slice(0, 120), courseId: c.courseId as string, by: userName(store, c.authorId as string), at: c.createdAt as string }));
  return [...grades, ...comments].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 20);
}

/** Activity stream: announcements, discussion replies and grade/feedback events in my courses. */
export function activity(store: TenantStore, a: Actor) {
  const ids = new Set(myCourseIds(store, a));
  const since = new Date(nowMs() - 21 * 86400_000).toISOString();
  const ann = store.list("announcements", (x) => ids.has(x.courseId as string) && x.state === "published" && String(x.updatedAt) >= since).map((x) => ({ kind: "announcement", title: x.title as string, courseId: x.courseId as string, at: x.updatedAt as string, href: `/campus/{tenant}/courses/${x.courseId}/announcements/${x.id}` }));
  const posts = store
    .list("posts", (p) => String(p.createdAt) >= since && p.authorId !== a.id)
    .map((p) => ({ p, topic: store.get("discussion_topics", p.topicId as string) }))
    .filter((x) => x.topic && ids.has(x.topic.courseId as string) && x.topic.state === "published")
    .map((x) => ({ kind: "discussion", title: `New reply in ${x.topic!.title}`, courseId: x.topic!.courseId as string, at: x.p.createdAt as string, href: `/campus/{tenant}/courses/${x.topic!.courseId}/discussions/${x.topic!.id}` }));
  return [...ann, ...posts, ...recentFeedback(store, a).map((f) => ({ kind: f.kind, title: f.title, courseId: f.courseId, at: f.at, href: `/campus/{tenant}/courses/${f.courseId}/grades` }))].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 40);
}

export function dashboard(store: TenantStore, a: Actor) {
  const p = prefs(store, a);
  const studentCourses = myCourseIds(store, a).filter((cid) => (a.courseRoles[cid] ?? []).includes("student"));
  return {
    view: (p?.view as string) ?? "cards",
    cards: cards(store, a),
    todo: todo(store, a),
    comingUp: comingUp(store, a),
    recentFeedback: recentFeedback(store, a),
    notifications: myNotifications(store, a).unread,
    grades: studentCourses.map((cid) => {
      const c = store.get("courses", cid)!;
      if (c.hideTotals) return { courseId: cid, code: c.code, hidden: true, pct: null, letter: null };
      const t = computeTotals(store, cid, a.id);
      return { courseId: cid, code: c.code, hidden: false, pct: t.finalPct, letter: t.letter };
    }),
  };
}

/** Planner view: dated items for a range, with my completion marks. */
export function planner(store: TenantStore, a: Actor, from: string, to: string) {
  if (Number.isNaN(toMs(from)) || Number.isNaN(toMs(to))) throw new CampusError("invalid", "Give a date range.", 422);
  const marks = new Map(store.list("planner_marks", (m) => m.userId === a.id).map((m) => [`${m.refType}:${m.refId}`, !!m.done]));
  const items = projection(store, a, from, to, { courseIds: myCourseIds(store, a) }).items.map((i) => ({ ...i, done: marks.get(`${i.kind}:${i.id}`) ?? false }));
  const todos = store.list("planner_items", (p) => p.userId === a.id && (!p.dueAt || (String(p.dueAt) >= from && String(p.dueAt) <= to))).map((p) => ({ id: p.id, kind: "todo" as const, title: p.title as string, start: (p.dueAt as string) ?? null, courseId: (p.courseId as string) ?? null, done: !!p.done }));
  return [...items, ...todos].sort((x, y) => String(x.start ?? "").localeCompare(String(y.start ?? "")));
}

export function markPlanner(store: TenantStore, a: Actor, refType: string, refId: string, done: boolean) {
  if (!["assignment", "quiz", "event", "todo", "announcement", "discussion", "page"].includes(refType)) throw new CampusError("invalid", "Unknown item type", 422);
  return store.tx(() => {
    if (refType === "todo") {
      const t = store.get("planner_items", refId);
      if (!t || t.userId !== a.id) throw new CampusError("not_found", "To-do not found", 404);
      return store.update("planner_items", refId, { done });
    }
    const ex = store.list("planner_marks", (m) => m.userId === a.id && m.refType === refType && m.refId === refId)[0];
    return ex ? store.update("planner_marks", ex.id, { done }) : store.insert("planner_marks", { userId: a.id, refType, refId, done }, "pm");
  });
}

/* ---------------- History & profile ---------------- */

export function recordView(store: TenantStore, a: Actor, input: { title: string; href: string; kind: string; courseId?: string | null }) {
  if (a.masqueradedBy) return; // acting-as doesn't change the person's history
  const prev = store.list("view_history", (h) => h.userId === a.id && h.href === input.href)[0];
  if (prev) store.tombstone("view_history", prev.id);
  store.insert("view_history", { userId: a.id, title: input.title.slice(0, 200), href: input.href, kind: input.kind, courseId: input.courseId ?? null }, "vh");
  const mine = store.list("view_history", (h) => h.userId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  for (const old of mine.slice(50)) store.tombstone("view_history", old.id);
}

export function viewHistory(store: TenantStore, a: Actor) {
  return store.list("view_history", (h) => h.userId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 50);
}

const PROFILE_FIELDS = ["displayName", "pronouns", "bio", "avatarUrl", "contactMethods", "language", "timeZone", "highContrast", "dyslexiaFont", "underlineLinks", "reducedMotion"];

export function profile(store: TenantStore, a: Actor) {
  const p = store.list("profiles", (x) => x.userId === a.id)[0];
  return { userId: a.id, name: a.name, email: a.email, displayName: (p?.displayName as string) ?? a.name, pronouns: p?.pronouns ?? "", bio: p?.bio ?? "", avatarUrl: p?.avatarUrl ?? null, contactMethods: p?.contactMethods ?? [], language: (p?.language as string) ?? "en", timeZone: (p?.timeZone as string) ?? "UTC", highContrast: !!p?.highContrast, dyslexiaFont: !!p?.dyslexiaFont, underlineLinks: !!p?.underlineLinks, reducedMotion: !!p?.reducedMotion };
}

export function updateProfile(store: TenantStore, a: Actor, values: Record<string, unknown>) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "Profile changes aren't allowed while acting as someone else.", 403);
  const clean = Object.fromEntries(Object.entries(values).filter(([k]) => PROFILE_FIELDS.includes(k)));
  for (const k of ["highContrast", "dyslexiaFont", "underlineLinks", "reducedMotion"]) if (k in clean) clean[k] = clean[k] === true || clean[k] === "true" || clean[k] === "on";
  if (clean.language && !["en", "es", "fr"].includes(String(clean.language))) throw new CampusError("invalid", "Language must be en, es or fr.", 422);
  if (clean.avatarUrl && !/^https:\/\//.test(String(clean.avatarUrl))) throw new CampusError("invalid", "Avatar must be an https address.", 422);
  if (clean.bio && String(clean.bio).length > 2000) throw new CampusError("invalid", "Bio is too long.", 422);
  if (clean.timeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: String(clean.timeZone) });
    } catch {
      throw new CampusError("invalid", "Unknown time zone.", 422);
    }
  }
  return store.tx(() => {
    const ex = store.list("profiles", (x) => x.userId === a.id)[0];
    return ex ? store.update("profiles", ex.id, clean) : store.insert("profiles", { userId: a.id, ...clean }, "prf");
  });
}
