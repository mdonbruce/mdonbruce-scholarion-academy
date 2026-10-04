import { CampusError, id, nowIso, nowMs, type Row, type TenantStore } from "../core";
import * as entity from "../entity";
import { hasAny, type Actor } from "../iam";
import { audit, course, notify, requireCourse } from "./common";
import { courseAnalytics } from "./success";
import { computeTotals, history, setGrade, type SetGradeInput } from "./grading";
import { resolveRecipients, type RecipientSpec } from "./collaboration";
import { wordCount, type Block } from "./curriculum";

/**
 * LMS parity gap closures (tracked on the LMS Parity Status tab): announcement replies and
 * likes, bulk date editing, the gradebook detail tray, enrollment edits, inbox forwarding,
 * analytics CSV, course statistics, conclude/reset, group grading, page to-dos and grade
 * display formats.
 */

const TEACH = ["admin", "instructor", "designer"] as const;

/* ---------------- Announcements: replies, likes, lock ---------------- */

type Reply = { id: string; authorId: string; body: string; at: string; likes: string[] };

export function replyAnnouncement(store: TenantStore, a: Actor, annId: string, body: string) {
  const an = entity.read(store, a, "announcements", annId) as Row;
  if (!an.allowReplies) throw new CampusError("replies_off", "Replies aren't turned on for this announcement.", 409);
  if (an.lockReplies) throw new CampusError("replies_locked", "Replies are locked.", 423);
  const text = String(body ?? "").trim();
  if (!text) throw new CampusError("invalid", "Write a reply.", 422);
  if (a.masqueradedBy) throw new CampusError("forbidden", "Reply as yourself.", 403);
  const r: Reply = { id: id("arp"), authorId: a.id, body: text.slice(0, 5000), at: nowIso(), likes: [] };
  return store.tx(() => {
    const row = store.update("announcements", annId, { replies: [...((an.replies as Reply[]) ?? []), r] });
    if (an.authorId && an.authorId !== a.id) notify(store, [String(an.authorId)], "announcements", `Reply to: ${an.title}`, text.slice(0, 200), `/campus/{tenant}/courses/${an.courseId}/announcements`, an.courseId as string);
    audit(store, a, "announcements.reply", `announcements/${annId}`);
    return { reply: r, count: ((row.replies as Reply[]) ?? []).length };
  });
}

export function likeAnnouncement(store: TenantStore, a: Actor, annId: string, replyId?: string) {
  const an = entity.read(store, a, "announcements", annId) as Row;
  if (!an.allowLikes) throw new CampusError("likes_off", "Likes aren't turned on for this announcement.", 409);
  return store.tx(() => {
    if (replyId) {
      const replies = ((an.replies as Reply[]) ?? []).map((r) => (r.id === replyId ? { ...r, likes: r.likes.includes(a.id) ? r.likes.filter((x) => x !== a.id) : [...r.likes, a.id] } : r));
      if (!replies.some((r) => r.id === replyId)) throw new CampusError("not_found", "Reply not found", 404);
      store.update("announcements", annId, { replies });
      return { liked: replies.find((r) => r.id === replyId)!.likes.includes(a.id) };
    }
    const likes = new Set((an.likes as string[]) ?? []);
    if (likes.has(a.id)) likes.delete(a.id);
    else likes.add(a.id);
    store.update("announcements", annId, { likes: [...likes] });
    return { liked: likes.has(a.id), count: likes.size };
  });
}

export function announcementReplies(store: TenantStore, a: Actor, annId: string) {
  const an = entity.read(store, a, "announcements", annId) as Row;
  const names = new Map(store.list("users").map((u) => [u.id, String(u.name)]));
  return { locked: !!an.lockReplies, likes: ((an.likes as string[]) ?? []).length, replies: ((an.replies as Reply[]) ?? []).map((r) => ({ ...r, author: names.get(r.authorId) ?? "Someone", likes: r.likes.length })) };
}

/* ---------------- Bulk edit dates ---------------- */

export function bulkEditDates(store: TenantStore, a: Actor, courseId: string, input: { items?: { kind: "assignment" | "quiz"; id: string; dueAt?: string | null; unlockAt?: string | null; lockAt?: string | null }[]; shiftDays?: number; removeDates?: boolean }) {
  requireCourse(store, a, courseId, [...TEACH], "assignments.bulk_dates");
  const shift = (v: unknown) => (v ? new Date(new Date(String(v)).getTime() + Number(input.shiftDays) * 86400_000).toISOString() : v);
  const changed: string[] = [];
  return store.tx(() => {
    if (input.items?.length) {
      for (const it of input.items) {
        const table = it.kind === "quiz" ? "quizzes" : "assignments";
        const row = store.get(table, it.id);
        if (!row || row.courseId !== courseId) throw new CampusError("not_found", `${it.kind} ${it.id} isn't in this course.`, 404);
        const patch: Record<string, unknown> = table === "quizzes" ? { availableFrom: it.unlockAt, availableUntil: it.lockAt ?? it.dueAt } : { dueAt: it.dueAt, unlockAt: it.unlockAt, lockAt: it.lockAt };
        for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
        entity.update(store, a, table, it.id, patch);
        changed.push(it.id);
      }
    } else if (input.shiftDays !== undefined || input.removeDates) {
      for (const row of store.list("assignments", (x) => x.courseId === courseId)) {
        entity.update(store, a, "assignments", row.id, input.removeDates ? { dueAt: null, unlockAt: null, lockAt: null } : { dueAt: shift(row.dueAt), unlockAt: shift(row.unlockAt), lockAt: shift(row.lockAt) });
        changed.push(row.id);
      }
      for (const row of store.list("quizzes", (x) => x.courseId === courseId && x.state !== "published")) {
        entity.update(store, a, "quizzes", row.id, input.removeDates ? { availableFrom: null, availableUntil: null } : { availableFrom: shift(row.availableFrom), availableUntil: shift(row.availableUntil) });
        changed.push(row.id);
      }
    } else throw new CampusError("invalid", "Give items with new dates, a day shift, or removeDates.", 422);
    audit(store, a, "assignments.bulk_dates", `courses/${courseId}`, `${changed.length} items`);
    return { changed: changed.length, ids: changed };
  });
}

/* ---------------- Gradebook detail tray ---------------- */

export function gradeDetail(store: TenantStore, a: Actor, assignmentId: string, userId: string) {
  const asg = store.get("assignments", assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, asg.courseId as string, ["admin", "instructor", "ta"], "gradebook.cell");
  const grade = store.list("grades", (g) => g.assignmentId === assignmentId && g.userId === userId)[0] ?? null;
  const subs = store.list("submissions", (s) => s.assignmentId === assignmentId && s.userId === userId).sort((x, y) => Number(y.attempt ?? 0) - Number(x.attempt ?? 0));
  const item = computeTotals(store, asg.courseId as string, userId, { includeUnposted: true }).items.find((i) => i.id === assignmentId) ?? null;
  return {
    assignment: { id: asg.id, title: asg.title, points: asg.points, dueAt: asg.dueAt ?? null },
    grade,
    status: item?.status ?? "none",
    latestSubmission: subs[0] ? { id: subs[0].id, attempt: subs[0].attempt, submittedAt: subs[0].createdAt, late: !!subs[0].late, href: `/campus/{tenant}/courses/${asg.courseId}/grader?assignmentId=${assignmentId}&userId=${userId}` } : null,
    attempts: subs.length,
    comments: store.list("submission_comments", (c) => subs.some((s) => s.id === c.submissionId)).map((c) => ({ id: c.id, authorId: c.authorId, body: c.body, at: c.createdAt })),
    history: history(store, a, asg.courseId as string, { userId, assignmentId }),
    statusOptions: ["none", "late", "missing", "excused"],
  };
}

/* ---------------- People: edit section / role ---------------- */

export function editEnrollment(store: TenantStore, a: Actor, enrollmentId: string, patch: { sectionId?: string; role?: "student" | "ta" | "instructor" | "designer" | "observer" }) {
  const e = store.get("enrollments", enrollmentId);
  if (!e) throw new CampusError("not_found", "Enrollment not found", 404);
  requireCourse(store, a, e.courseId as string, ["admin", "instructor"], "people.edit_enrollment");
  if (patch.role && !hasAny(a, ["admin"]) && ["instructor", "designer"].includes(patch.role)) throw new CampusError("forbidden", "Only admins can make someone a teacher or designer.", 403);
  if (patch.sectionId) {
    const sec = store.get("sections", patch.sectionId);
    if (!sec || sec.courseId !== e.courseId) throw new CampusError("invalid", "That section isn't part of this course.", 422);
  }
  return store.tx(() => {
    const row = store.update("enrollments", enrollmentId, { ...(patch.sectionId ? { sectionId: patch.sectionId } : {}), ...(patch.role ? { role: patch.role } : {}) });
    store.emit("enrollments.updated", `enrollments/${enrollmentId}`, { id: enrollmentId, courseId: e.courseId, userId: e.userId, ...patch });
    audit(store, a, "people.edit_enrollment", `enrollments/${enrollmentId}`, JSON.stringify(patch));
    return row;
  });
}

/* ---------------- Inbox: forward ---------------- */

export function forwardConversation(store: TenantStore, a: Actor, convId: string, to: RecipientSpec, note?: string) {
  const c = store.get("conversations", convId);
  if (!c || !((c.participantIds as string[]) ?? []).includes(a.id)) throw new CampusError("not_found", "Conversation not found", 404);
  const recipients = resolveRecipients(store, a, to);
  if (!recipients.length) throw new CampusError("no_recipients", "Nobody matches those recipients.", 422);
  const quoted = ((c.messages as { authorId: string; body: string; at: string; attachments?: string[] }[]) ?? []).map((m) => `> ${m.at.slice(0, 16)} ${m.body.replace(/\n/g, "\n> ")}`).join("\n");
  return store.tx(() => {
    const state: Record<string, { folder: string; read: boolean }> = { [a.id]: { folder: "sent", read: true } };
    for (const u of recipients) state[u] = { folder: "inbox", read: false };
    const attachments = ((c.messages as { attachments?: string[] }[]) ?? []).flatMap((m) => m.attachments ?? []);
    const row = store.insert("conversations", { courseId: to.courseId, subject: `Fwd: ${c.subject}`, participantIds: [a.id, ...recipients], messages: [{ id: id("msg"), authorId: a.id, body: `${note ? `${note}\n\n` : ""}${quoted}`, at: nowIso(), attachments }], state, forwardedFrom: convId }, "cv");
    notify(store, recipients, "conversations", `Fwd: ${c.subject}`, (note ?? "").slice(0, 200), "/campus/{tenant}/inbox", to.courseId);
    audit(store, a, "conversations.forward", `conversations/${convId}`, `${recipients.length} recipients`);
    return { conversation: row.id, recipients: recipients.length };
  });
}

/* ---------------- Analytics CSV, statistics ---------------- */

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function courseAnalyticsCsv(store: TenantStore, a: Actor, courseId: string) {
  const an = courseAnalytics(store, a, courseId);
  const lines = [["section", "item", "metric", "value"].join(",")];
  for (const w of an.weekly) lines.push(["weekly", w.week, "page_views", w.views].map(csvCell).join(","), ["weekly", w.week, "participations", w.participations].map(csvCell).join(","));
  for (const x of an.assignments) {
    lines.push(["assignment", x.title, "avg_pct", x.avgPct].map(csvCell).join(","), ["assignment", x.title, "on_time", x.onTime].map(csvCell).join(","), ["assignment", x.title, "late", x.late].map(csvCell).join(","), ["assignment", x.title, "missing", x.missing].map(csvCell).join(","));
    for (const s of x.bySection) lines.push(["assignment_section", `${x.title} · ${s.section}`, "avg_pct", s.avg].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function courseStatistics(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "designer", "ta"], "course.statistics");
  const c = course(store, courseId);
  const count = (t: string, f: (r: Row) => boolean = () => true) => store.list(t, (r) => r.courseId === courseId && f(r)).length;
  const bytes = store.list("files", (f) => f.courseId === courseId).reduce((s, f) => s + Number(f.size ?? 0), 0);
  return {
    course: { id: c.id, code: c.code, title: c.title, state: c.state, concludedAt: c.concludedAt ?? null },
    students: store.list("enrollments", (e) => e.courseId === courseId && e.role === "student" && e.state === "active").length,
    items: { modules: count("modules"), pages: count("pages"), assignments: count("assignments"), quizzes: count("quizzes"), discussions: count("discussion_topics"), announcements: count("announcements"), files: count("files") },
    submissions: count("submissions"),
    discussionPosts: store.list("posts", (p) => store.get("discussion_topics", String(p.topicId))?.courseId === courseId).length,
    storageMb: Math.round((bytes / 1048576) * 100) / 100,
  };
}

/* ---------------- Conclude / reset ---------------- */

export function concludeCourse(store: TenantStore, a: Actor, courseId: string, conclude = true) {
  requireCourse(store, a, courseId, ["admin", "instructor"], "course.conclude");
  return store.tx(() => {
    const row = store.update("courses", courseId, { concludedAt: conclude ? nowIso() : null });
    store.emit(conclude ? "courses.concluded" : "courses.unconcluded", `courses/${courseId}`, { id: courseId });
    audit(store, a, conclude ? "course.conclude" : "course.unconclude", `courses/${courseId}`);
    return row;
  });
}

const RESET_TABLES = ["module_items", "modules", "pages", "assignments", "quizzes", "discussion_topics", "announcements", "assignment_groups", "rubrics", "question_banks", "questions"];

export function resetCourseContent(store: TenantStore, a: Actor, courseId: string, confirm: string) {
  requireCourse(store, a, courseId, ["admin", "instructor"], "course.reset");
  const c = course(store, courseId);
  if (confirm !== String(c.code)) throw new CampusError("confirm", `Type the course code (${c.code}) to confirm.`, 422);
  if (store.list("submissions", (s) => s.courseId === courseId).length || store.list("grades", (g) => store.get("assignments", String(g.assignmentId))?.courseId === courseId).length) throw new CampusError("has_student_work", "This course has student work. Copy the course to a new shell instead of resetting it.", 409);
  return store.tx(() => {
    let n = 0;
    for (const t of RESET_TABLES) for (const r of store.list(t, (x) => x.courseId === courseId)) {
      store.tombstone(t, r.id);
      n++;
    }
    audit(store, a, "course.reset", `courses/${courseId}`, `${n} items archived (restorable)`);
    return { archived: n, note: "Items were archived and can be restored from Admin → Restore." };
  });
}

/* ---------------- Group assignments: grade the whole group ---------------- */

export function gradeGroup(store: TenantStore, a: Actor, input: SetGradeInput) {
  const asg = store.get("assignments", input.assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  if (!asg.groupSetId || asg.gradeIndividually) return { graded: [setGrade(store, a, input)] };
  const grp = store.list("groups", (g) => g.setId === asg.groupSetId && ((g.memberIds as string[]) ?? []).includes(input.userId))[0];
  if (!grp) return { graded: [setGrade(store, a, input)] };
  const members = (grp.memberIds as string[]) ?? [];
  const graded = members.map((uid) => setGrade(store, a, { ...input, userId: uid, ifVersion: uid === input.userId ? input.ifVersion : undefined }));
  audit(store, a, "grades.group", `assignments/${asg.id}`, `${members.length} members of ${grp.name}`);
  return { group: grp.name, graded };
}

/* ---------------- Grade display formats ---------------- */

export function displayGrade(score: number | null, points: number, as: string | undefined, bands?: { label: string; min: number; gpa?: number }[]) {
  if (score === null || score === undefined) return "–";
  const pct = points ? (score / points) * 100 : 0;
  const scheme = bands?.length ? bands : [{ label: "A", min: 90, gpa: 4 }, { label: "B", min: 80, gpa: 3 }, { label: "C", min: 70, gpa: 2 }, { label: "D", min: 60, gpa: 1 }, { label: "F", min: 0, gpa: 0 }];
  const band = [...scheme].sort((x, y) => y.min - x.min).find((b) => pct >= b.min) ?? scheme[scheme.length - 1];
  switch (as) {
    case "percent":
    case "percentage":
      return `${Math.round(pct * 10) / 10}%`;
    case "complete_incomplete":
      return score > 0 ? "Complete" : "Incomplete";
    case "letter":
      return band.label;
    case "gpa":
      return (band.gpa ?? Math.max(0, Math.min(4, (pct - 50) / 10))).toFixed(1);
    case "not_graded":
      return "Not graded";
    default:
      return `${score}/${points}`;
  }
}

/* ---------------- Word count ---------------- */

export function pageWordCount(store: TenantStore, a: Actor, pageId: string) {
  const p = entity.read(store, a, "pages", pageId) as Row;
  return { pageId, words: wordCount((p.blocks as Block[]) ?? []) };
}

/** Is a course concluded (read-only for students)? */
export function concluded(store: TenantStore, courseId: string) {
  const c = store.get("courses", courseId);
  return !!c?.concludedAt && String(c.concludedAt) <= new Date(nowMs()).toISOString();
}
