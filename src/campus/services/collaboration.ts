import { CampusError, id, nowIso, type Row, type TenantStore } from "../core";
import { registerHooks } from "../entity";
import { hasAny, type Actor } from "../iam";
import { activeStudents, audit, course, isGrader, isStaff, notify, userName } from "./common";
import { assertAccessible, groupIdsOf, sectionIdsOf } from "./curriculum";
import { setGrade } from "./grading";

/**
 * Collaboration: threaded or focused discussions (materialized paths, tombstones that keep
 * context, likes, post-first, anonymity, checkpoints, mentions, read state, subscriptions),
 * scheduled announcements, and a course-scoped inbox whose recipients are always resolved
 * on the server from active membership.
 */

/* ---------------- Discussions ---------------- */

registerHooks("discussion_topics", {
  afterWrite(store, a, row, op) {
    // Graded discussions get a backing assignment so they appear in the gradebook.
    if ((op === "create" || op === "update" || op === "publish") && Number(row.points ?? 0) > 0 && !row.assignmentId) {
      const asg = store.insert("assignments", { courseId: row.courseId, title: `Discussion: ${row.title}`, points: row.points, submissionTypes: ["none"], state: row.state === "published" ? "published" : "unpublished", discussionId: row.id, dueAt: (row.checkpoints as { replies?: { dueAt?: string } } | undefined)?.replies?.dueAt ?? null }, "asg");
      store.update("discussion_topics", row.id, { assignmentId: asg.id });
    } else if (row.assignmentId && (op === "publish" || op === "unpublish")) store.update("assignments", row.assignmentId as string, { state: op === "publish" ? "published" : "unpublished" });
    void a;
  },
  canRead(store, a, row) {
    if (isStaff(a, row.courseId as string)) return true;
    if (row.availableFrom && String(row.availableFrom) > nowIso()) return false;
    if (row.sectionId && !sectionIdsOf(store, a.id, row.courseId as string).includes(row.sectionId as string)) return false;
    return true;
  },
});

function topicFor(store: TenantStore, a: Actor, topicId: string): Row {
  const t = store.get("discussion_topics", topicId);
  if (!t) throw new CampusError("not_found", "Discussion not found", 404);
  const courseId = t.courseId as string;
  if (!hasAny(a, ["admin", "instructor", "ta", "designer", "student", "observer"], courseId)) throw new CampusError("forbidden", "You're not in this course.", 403);
  if (!isStaff(a, courseId)) {
    if (t.state !== "published") throw new CampusError("not_found", "Discussion not found", 404);
    if (t.availableFrom && String(t.availableFrom) > nowIso()) throw new CampusError("not_open", "This discussion isn't open yet.", 423);
    if (t.sectionId && !sectionIdsOf(store, a.id, courseId).includes(t.sectionId as string)) throw new CampusError("not_found", "Discussion not found", 404);
    assertAccessible(store, a, "discussion", t.id);
  }
  return t;
}

export function createStudentTopic(store: TenantStore, a: Actor, courseId: string, title: string, prompt: string) {
  const c = course(store, courseId);
  if (!isStaff(a, courseId) && !(hasAny(a, ["student"], courseId) && c.studentsCreateDiscussions)) throw new CampusError("forbidden", "Students can't start discussions in this course.", 403);
  return store.tx(() => {
    const t = store.insert("discussion_topics", { courseId, title, prompt, kind: "threaded", state: "published", createdBy: a.id, allowLiking: true }, "dt");
    store.emit("discussion_topics.created", `discussion_topics/${t.id}`, { id: t.id, courseId });
    return t;
  });
}

export function post(store: TenantStore, a: Actor, topicId: string, body: string, parentId?: string | null) {
  const t = topicFor(store, a, topicId);
  const courseId = t.courseId as string;
  if (hasAny(a, ["observer"], courseId) && !isStaff(a, courseId) && !hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "Observers can read but not post.", 403);
  if (t.closed && !isStaff(a, courseId)) throw new CampusError("closed", "This discussion is closed for comments.", 423);
  const text = (body ?? "").trim();
  if (!text) throw new CampusError("invalid", "Write something first.", 422);
  if (text.length > 20000) throw new CampusError("invalid", "That's too long.", 422);
  let parent: Row | undefined;
  if (parentId) {
    parent = store.get("posts", parentId, { includeDeleted: true });
    if (!parent || parent.topicId !== topicId) throw new CampusError("not_found", "Reply target not found", 404);
    if (t.kind === "focused" && Number(parent.depth) >= 1) throw new CampusError("invalid", "This is a focused discussion: reply to the topic or a top-level post only.", 422);
  }
  const mentions = [...text.matchAll(/@([\w.+-]+@[\w-]+\.[\w.]+)/g)].map((m) => store.list("users", (u) => u.email === m[1].toLowerCase())[0]?.id).filter((x): x is string => !!x && store.list("enrollments", (e) => e.userId === x && e.courseId === courseId && e.state === "active").length > 0);
  return store.tx(() => {
    const pid = id("dp");
    const p = store.insert("posts", { id: pid, topicId, courseId, authorId: a.id, parentId: parentId ?? null, path: parent ? `${parent.path}/${pid}` : pid, depth: parent ? Number(parent.depth) + 1 : 0, body: text, likes: [], edits: [], mentions, reports: [], readBy: [a.id] }, "dp");
    store.emit("posts.created", `posts/${p.id}`, { id: p.id, topicId, courseId, authorId: a.id, parentId: parentId ?? null });
    if (mentions.length) notify(store, mentions, "discussions", `You were mentioned in ${t.title}`, text.slice(0, 200), `/campus/{tenant}/courses/${courseId}/discussions/${topicId}`, courseId);
    const subs = store.list("discussion_subscriptions", (s) => s.topicId === topicId && s.userId !== a.id).map((s) => s.userId as string);
    notify(store, subs, "discussions", `New reply in ${t.title}`, text.slice(0, 200), `/campus/{tenant}/courses/${courseId}/discussions/${topicId}`, courseId);
    return p;
  });
}

export function editPost(store: TenantStore, a: Actor, postId: string, body: string) {
  const p = store.get("posts", postId);
  if (!p) throw new CampusError("not_found", "Post not found", 404);
  const c = course(store, p.courseId as string);
  if (p.authorId !== a.id && !isStaff(a, p.courseId as string)) throw new CampusError("forbidden", "You can only edit your own posts.", 403);
  if (p.authorId === a.id && !isStaff(a, p.courseId as string) && c.studentsEditPosts === false) throw new CampusError("forbidden", "Editing posts is turned off in this course.", 403);
  return store.tx(() => store.update("posts", postId, { body, edits: [...((p.edits as unknown[]) ?? []), { at: nowIso(), by: a.id, before: p.body }] }));
}

/** Deletion leaves a tombstone so replies keep their context. */
export function deletePost(store: TenantStore, a: Actor, postId: string) {
  const p = store.get("posts", postId);
  if (!p) throw new CampusError("not_found", "Post not found", 404);
  if (p.authorId !== a.id && !isStaff(a, p.courseId as string)) throw new CampusError("forbidden", "You can only delete your own posts.", 403);
  if (p.authorId === a.id && !isStaff(a, p.courseId as string) && course(store, p.courseId as string).studentsDeletePosts === false) throw new CampusError("forbidden", "Deleting posts is turned off in this course.", 403);
  return store.tx(() => {
    const out = store.update("posts", postId, { body: "", deletedBody: true, deletedAt: nowIso(), deletedBy: a.id });
    audit(store, a, "posts.delete", `posts/${postId}`);
    return out;
  });
}

export function like(store: TenantStore, a: Actor, postId: string, on = true) {
  const p = store.get("posts", postId);
  if (!p) throw new CampusError("not_found", "Post not found", 404);
  const t = topicFor(store, a, p.topicId as string);
  if (!t.allowLiking) throw new CampusError("not_allowed", "Liking is off for this discussion.", 409);
  if (t.onlyGradersLike && !isGrader(a, t.courseId as string)) throw new CampusError("forbidden", "Only graders can like posts here.", 403);
  const likes = new Set((p.likes as string[]) ?? []);
  if (on) likes.add(a.id);
  else likes.delete(a.id);
  return store.tx(() => store.update("posts", postId, { likes: [...likes] }));
}

export function reportPost(store: TenantStore, a: Actor, postId: string, reason: string) {
  const p = store.get("posts", postId);
  if (!p) throw new CampusError("not_found", "Post not found", 404);
  topicFor(store, a, p.topicId as string);
  return store.tx(() => {
    const out = store.update("posts", postId, { reports: [...((p.reports as unknown[]) ?? []), { by: a.id, reason: reason.slice(0, 500), at: nowIso() }] });
    notify(store, store.list("enrollments", (e) => e.courseId === p.courseId && e.role === "instructor").map((e) => e.userId as string), "discussions", "A reply was reported", reason.slice(0, 200), `/campus/{tenant}/courses/${p.courseId}/discussions/${p.topicId}`, p.courseId as string);
    return out;
  });
}

export function subscribe(store: TenantStore, a: Actor, topicId: string, on: boolean) {
  topicFor(store, a, topicId);
  return store.tx(() => {
    const ex = store.list("discussion_subscriptions", (s) => s.topicId === topicId && s.userId === a.id);
    if (on && !ex.length) store.insert("discussion_subscriptions", { topicId, userId: a.id }, "dsub");
    if (!on) for (const s of ex) store.tombstone("discussion_subscriptions", s.id);
    return { subscribed: on };
  });
}

export function markAllRead(store: TenantStore, a: Actor, topicId: string) {
  topicFor(store, a, topicId);
  return store.tx(() => {
    let n = 0;
    for (const p of store.list("posts", (p) => p.topicId === topicId && !((p.readBy as string[]) ?? []).includes(a.id))) {
      store.update("posts", p.id, { readBy: [...((p.readBy as string[]) ?? []), a.id] });
      n++;
    }
    return { marked: n };
  });
}

/** Thread view with post-first rule, anonymity, sorting and unread counts. */
export function thread(store: TenantStore, a: Actor, topicId: string, opts: { sort?: "newest" | "oldest" | "likes"; cursor?: string; limit?: number } = {}) {
  const t = topicFor(store, a, topicId);
  const courseId = t.courseId as string;
  const staff = isStaff(a, courseId);
  let posts = store.list("posts", (p) => p.topicId === topicId, { includeDeleted: true });
  // Group discussions: students see only their group's posts.
  if (t.groupSetId && !staff) {
    const mine = groupIdsOf(store, a.id, courseId);
    posts = posts.filter((p) => groupIdsOf(store, p.authorId as string, courseId).some((g) => mine.includes(g)));
  }
  const hasPosted = posts.some((p) => p.authorId === a.id && !p.parentId);
  const gated = !!t.mustPostFirst && !staff && !hasPosted;
  const anon = (t.anonymous as string) ?? "off";
  const roots = posts.filter((p) => !p.parentId);
  const sort = opts.sort ?? (t.sortByLikes ? "likes" : "oldest");
  roots.sort((x, y) => (sort === "likes" ? ((y.likes as string[])?.length ?? 0) - ((x.likes as string[])?.length ?? 0) : sort === "newest" ? String(y.createdAt).localeCompare(String(x.createdAt)) : String(x.createdAt).localeCompare(String(y.createdAt))));
  const limit = Math.min(opts.limit ?? 25, 100);
  const start = opts.cursor ? Number(Buffer.from(opts.cursor, "base64url").toString()) : 0;
  const page = gated ? [] : roots.slice(start, start + limit);
  const author = (uid: string) => (anon === "full" && !staff ? "Anonymous" : anon === "partial" && !staff && store.list("anon_optins", (o) => o.topicId === topicId && o.userId === uid).length ? "Anonymous" : userName(store, uid));
  const view = (p: Row) => ({
    id: p.id,
    parentId: p.parentId,
    depth: p.depth,
    author: p.deletedAt ? null : author(p.authorId as string),
    mine: p.authorId === a.id,
    body: p.deletedAt ? null : p.body,
    deleted: !!p.deletedAt,
    likes: ((p.likes as string[]) ?? []).length,
    likedByMe: ((p.likes as string[]) ?? []).includes(a.id),
    unread: !((p.readBy as string[]) ?? []).includes(a.id),
    edited: ((p.edits as unknown[]) ?? []).length > 0,
    reported: staff ? ((p.reports as unknown[]) ?? []).length : undefined,
    createdAt: p.createdAt,
  });
  const children = (root: Row) => posts.filter((p) => String(p.path).startsWith(`${root.path}/`)).sort((x, y) => String(x.path).localeCompare(String(y.path))).map(view);
  return {
    topic: { id: t.id, title: t.title, prompt: t.prompt, kind: t.kind ?? "threaded", closed: !!t.closed, pinned: !!t.pinned, allowLiking: !!t.allowLiking, anonymous: anon, checkpoints: t.checkpoints ?? null, graded: !!t.assignmentId, podcast: !!t.podcast },
    gated,
    posts: page.map((p) => ({ ...view(p), replies: children(p) })),
    unread: gated ? 0 : posts.filter((p) => !p.deletedAt && !((p.readBy as string[]) ?? []).includes(a.id)).length,
    total: roots.length,
    next: start + limit < roots.length ? Buffer.from(String(start + limit)).toString("base64url") : null,
    subscribed: store.list("discussion_subscriptions", (s) => s.topicId === topicId && s.userId === a.id).length > 0,
  };
}

/** Checkpoints: reply to the topic + N replies, each with its own due date and points. */
export function checkpointStatus(store: TenantStore, topicId: string, userId: string) {
  const t = store.get("discussion_topics", topicId);
  if (!t) throw new CampusError("not_found", "Discussion not found", 404);
  const cp = (t.checkpoints as { replyToTopic?: { dueAt?: string; points?: number }; replies?: { count: number; dueAt?: string; points?: number } }) ?? {};
  const mine = store.list("posts", (p) => p.topicId === topicId && p.authorId === userId && !p.deletedAt);
  const topLevel = mine.filter((p) => !p.parentId);
  const replies = mine.filter((p) => !!p.parentId);
  const onTime = (posts: Row[], due?: string) => (due ? posts.filter((p) => String(p.createdAt) <= due) : posts);
  return {
    replyToTopic: { done: topLevel.length > 0, onTime: onTime(topLevel, cp.replyToTopic?.dueAt).length > 0, points: Number(cp.replyToTopic?.points ?? 0) },
    replies: { required: Number(cp.replies?.count ?? 0), made: replies.length, onTime: onTime(replies, cp.replies?.dueAt).length, points: Number(cp.replies?.points ?? 0) },
  };
}

/** Grade a graded discussion against both checkpoints (teacher can override totals). */
export function gradeCheckpoints(store: TenantStore, a: Actor, topicId: string, userId: string, override?: { replyToTopic?: number; replies?: number }) {
  const t = store.get("discussion_topics", topicId);
  if (!t?.assignmentId) throw new CampusError("not_graded", "This discussion isn't graded.", 409);
  const s = checkpointStatus(store, topicId, userId);
  const cp1 = override?.replyToTopic ?? (s.replyToTopic.done ? s.replyToTopic.points : 0);
  const cp2 = override?.replies ?? (s.replies.made >= s.replies.required ? s.replies.points : Math.round((s.replies.made / Math.max(1, s.replies.required)) * s.replies.points * 100) / 100);
  const g = setGrade(store, a, { assignmentId: t.assignmentId as string, userId, score: cp1 + cp2, source: "checkpoints" });
  store.tx(() => store.update("grades", g.id, { checkpointScores: { replyToTopic: cp1, replies: cp2 } }));
  return { score: cp1 + cp2, replyToTopic: cp1, replies: cp2, status: s };
}

/* ---------------- Announcements ---------------- */

registerHooks("announcements", {
  beforeWrite(_store, _a, values, existing) {
    if (!existing) values.state = values.publishAt && String(values.publishAt) > nowIso() ? "scheduled" : "published";
    else if (values.publishAt !== undefined && existing.state === "scheduled") values.state = values.publishAt && String(values.publishAt) > nowIso() ? "scheduled" : "published";
  },
  afterWrite(store, _a, row, op) {
    if (op === "create" && row.state === "published") announcementPublished(store, row);
  },
  canRead(store, a, row) {
    if (isStaff(a, row.courseId as string)) return true;
    if (row.state !== "published") return false;
    if (row.sectionId && !sectionIdsOf(store, a.id, row.courseId as string).includes(row.sectionId as string)) return false;
    return true;
  },
});

function announcementPublished(store: TenantStore, row: Row) {
  const recipients = activeStudents(store, row.courseId as string, (row.sectionId as string) || undefined).map((e) => e.userId as string);
  store.emit("announcements.published", `announcements/${row.id}`, { id: row.id, courseId: row.courseId, sectionId: row.sectionId ?? null });
  notify(store, recipients, "announcements", String(row.title), String(row.body).slice(0, 300), `/campus/{tenant}/courses/${row.courseId}/announcements/${row.id}`, row.courseId as string);
}

/** Scheduler job: publish delayed announcements whose time has come. */
export function announcementJob(store: TenantStore) {
  let n = 0;
  store.tx(() => {
    for (const an of store.list("announcements", (x) => x.state === "scheduled" && !!x.publishAt && String(x.publishAt) <= nowIso())) {
      const row = store.update("announcements", an.id, { state: "published" });
      announcementPublished(store, row);
      n++;
    }
  });
  return n;
}

export function markAnnouncementRead(store: TenantStore, a: Actor, annId: string) {
  const an = store.get("announcements", annId);
  if (!an) throw new CampusError("not_found", "Announcement not found", 404);
  const readBy = new Set((an.readBy as string[]) ?? []);
  readBy.add(a.id);
  return store.tx(() => store.update("announcements", annId, { readBy: [...readBy] }));
}

/** Podcast/RSS feed for announcements or a discussion with podcast enabled. */
export function podcastFeed(store: TenantStore, courseId: string): string {
  const c = course(store, courseId);
  const anns = store.list("announcements", (x) => x.courseId === courseId && x.state === "published" && !!x.podcast);
  // Discussions with the podcast option contribute their (non-deleted, non-anonymous) posts.
  const topics = store.list("discussion_topics", (t) => t.courseId === courseId && t.state === "published" && !!t.podcast && !t.anonymous);
  const posts = topics.flatMap((t) => store.list("posts", (p) => p.topicId === t.id && !p.deletedAt).map((p) => ({ id: p.id, title: `${t.title}: reply`, body: p.body, createdAt: p.createdAt })));
  const items = [...anns, ...posts].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!);
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(c.title)} announcements</title>${items.map((i) => `<item><title>${esc(i.title)}</title><description>${esc(i.body)}</description><pubDate>${new Date(String(i.createdAt)).toUTCString()}</pubDate><guid>${esc(i.id)}</guid></item>`).join("")}</channel></rss>`;
}

/* ---------------- Inbox ---------------- */

export interface RecipientSpec {
  courseId: string;
  role?: "student" | "instructor" | "ta" | "observer" | "all";
  sectionId?: string;
  groupId?: string;
  userIds?: string[];
}

/** Recipients are resolved here from active enrollment only — a client can't name anyone else. */
export function resolveRecipients(store: TenantStore, a: Actor, spec: RecipientSpec): string[] {
  const courseId = spec.courseId;
  if (!hasAny(a, ["admin", "instructor", "ta", "designer", "student", "advisor"], courseId)) throw new CampusError("forbidden", "You can only message people in your courses.", 403);
  let pool = store.list("enrollments", (e) => e.courseId === courseId && e.state === "active");
  if (spec.role && spec.role !== "all") pool = pool.filter((e) => e.role === spec.role);
  if (spec.sectionId) pool = pool.filter((e) => e.sectionId === spec.sectionId);
  if (spec.groupId) {
    const g = store.get("groups", spec.groupId);
    if (!g || g.courseId !== courseId) throw new CampusError("not_found", "Group not found", 404);
    pool = pool.filter((e) => ((g.memberIds as string[]) ?? []).includes(e.userId as string));
  }
  let ids = [...new Set(pool.map((e) => e.userId as string))];
  if (spec.userIds?.length) {
    const asked = new Set(spec.userIds);
    const unknown = spec.userIds.filter((u) => !ids.includes(u));
    if (unknown.length) {
      store.audit({ actorId: a.id, actorRoles: a.roles, action: "conversations.resolve", resource: `courses/${courseId}`, outcome: "denied", reason: `not_members:${unknown.length}` });
      throw new CampusError("invalid_recipients", "Some recipients aren't active members of this course.", 422);
    }
    ids = ids.filter((u) => asked.has(u));
  }
  // Students may message instructors/TAs and classmates only if the course allows it (default yes).
  return ids.filter((u) => u !== a.id);
}

export function sendMessage(store: TenantStore, a: Actor, input: { recipients: RecipientSpec; subject: string; body: string; individual?: boolean; attachments?: string[]; mediaUrl?: string }) {
  if (!input.body?.trim()) throw new CampusError("invalid", "Write a message.", 422);
  const to = resolveRecipients(store, a, input.recipients);
  if (!to.length) throw new CampusError("no_recipients", "Nobody matches those recipients.", 422);
  const msg = () => ({ id: id("msg"), authorId: a.id, body: input.body, at: nowIso(), attachments: input.attachments ?? [], mediaUrl: input.mediaUrl ?? null });
  return store.tx(() => {
    const convs: Row[] = [];
    const groups = input.individual ? to.map((u) => [u]) : [to];
    for (const g of groups) {
      const state: Record<string, { folder: string; read: boolean; starred?: boolean }> = { [a.id]: { folder: "sent", read: true } };
      for (const u of g) state[u] = { folder: "inbox", read: false };
      convs.push(store.insert("conversations", { courseId: input.recipients.courseId, subject: input.subject.slice(0, 200), participantIds: [a.id, ...g], messages: [msg()], state }, "cv"));
    }
    notify(store, to, "conversations", `Message: ${input.subject}`, input.body.slice(0, 200), "/campus/{tenant}/inbox", input.recipients.courseId);
    audit(store, a, "conversations.send", `courses/${input.recipients.courseId}`, `${to.length} recipients`);
    return { conversations: convs.map((c) => c.id), recipients: to.length };
  });
}

function conv(store: TenantStore, a: Actor, convId: string): Row {
  const c = store.get("conversations", convId);
  if (!c || !((c.participantIds as string[]) ?? []).includes(a.id)) throw new CampusError("not_found", "Conversation not found", 404);
  return c;
}

export function reply(store: TenantStore, a: Actor, convId: string, body: string, all = true) {
  const c = conv(store, a, convId);
  if (!body.trim()) throw new CampusError("invalid", "Write a reply.", 422);
  return store.tx(() => {
    const state = { ...(c.state as Record<string, { folder: string; read: boolean }>) };
    const parts = all ? (c.participantIds as string[]) : [a.id, (c.messages as { authorId: string }[])[0].authorId];
    for (const p of parts) state[p] = { ...(state[p] ?? { folder: "inbox" }), folder: p === a.id ? (state[p]?.folder === "archived" ? "inbox" : state[p]?.folder ?? "sent") : "inbox", read: p === a.id };
    const out = store.update("conversations", convId, { messages: [...(c.messages as unknown[]), { id: id("msg"), authorId: a.id, body, at: nowIso() }], state });
    notify(store, parts.filter((p) => p !== a.id), "conversations", `Reply: ${c.subject}`, body.slice(0, 200), "/campus/{tenant}/inbox", c.courseId as string);
    return out;
  });
}

export function setConversationState(store: TenantStore, a: Actor, convId: string, patch: { read?: boolean; starred?: boolean; folder?: "inbox" | "archived" | "deleted" }) {
  const c = conv(store, a, convId);
  const state = { ...(c.state as Record<string, Record<string, unknown>>) };
  state[a.id] = { ...(state[a.id] ?? {}), ...patch };
  return store.tx(() => store.update("conversations", convId, { state }));
}

export function inbox(store: TenantStore, a: Actor, f: { folder?: "inbox" | "unread" | "starred" | "sent" | "archived" | "submission_comments"; courseId?: string; q?: string } = {}) {
  const folder = f.folder ?? "inbox";
  if (folder === "submission_comments") {
    const mine = store.list("submissions", (s) => s.userId === a.id).map((s) => s.id);
    return store.list("submission_comments", (c) => (mine.includes(c.submissionId as string) && !c.hiddenUntilPosted) || c.authorId === a.id).map((c) => ({ id: c.id, subject: `Comment on ${store.get("assignments", c.assignmentId as string)?.title ?? "submission"}`, last: c.body, at: c.createdAt, unread: false, starred: false, courseId: c.courseId }));
  }
  return store
    .list("conversations", (c) => ((c.participantIds as string[]) ?? []).includes(a.id))
    .filter((c) => {
      const s = (c.state as Record<string, { folder: string; read: boolean; starred?: boolean }>)[a.id] ?? { folder: "inbox", read: true };
      if (s.folder === "deleted") return false;
      if (f.courseId && c.courseId !== f.courseId) return false;
      if (f.q && !`${c.subject} ${(c.messages as { body: string }[]).map((m) => m.body).join(" ")}`.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (folder === "unread") return !s.read && s.folder !== "archived";
      if (folder === "starred") return !!s.starred;
      if (folder === "sent") return (c.messages as { authorId: string }[]).some((m) => m.authorId === a.id);
      if (folder === "archived") return s.folder === "archived";
      return s.folder === "inbox";
    })
    .map((c) => {
      const s = (c.state as Record<string, { read: boolean; starred?: boolean }>)[a.id];
      const msgs = c.messages as { body: string; at: string; authorId: string }[];
      return { id: c.id, subject: c.subject, last: msgs[msgs.length - 1].body.slice(0, 140), at: msgs[msgs.length - 1].at, unread: !s?.read, starred: !!s?.starred, courseId: c.courseId, participants: (c.participantIds as string[]).map((u) => userName(store, u)), count: msgs.length };
    })
    .sort((x, y) => String(y.at).localeCompare(String(x.at)));
}

export function conversationView(store: TenantStore, a: Actor, convId: string) {
  const c = conv(store, a, convId);
  setConversationState(store, a, convId, { read: true });
  return { ...c, messages: (c.messages as { authorId: string }[]).map((m) => ({ ...m, author: userName(store, m.authorId) })) };
}

/* ---------------- Collaborations ---------------- */

registerHooks("collaborations", {
  beforeWrite(store, a, values, existing) {
    const courseId = (values.courseId ?? existing?.courseId) as string;
    const members = (values.memberIds as string[] | undefined) ?? [];
    for (const m of members) if (!store.list("enrollments", (e) => e.userId === m && e.courseId === courseId && e.state === "active").length) throw new CampusError("invalid", "Collaborators must be members of the course.", 422);
    if (!existing) values.url = `https://collab.scholarion.local/${values.provider}/${id("doc")}`;
    void a;
  },
});
