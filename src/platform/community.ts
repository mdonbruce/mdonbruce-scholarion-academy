import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { identity } from "./identity";
import { lms } from "./lms";
import { getDb, nowIso, save } from "./store";
import type { Post } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Course discussions (Master Prompt §6 Community). Threads live on discussion items,
 * are visible to anyone who can view the course, and are moderated by course staff:
 * learners report posts, staff hide or restore them.
 */

const MAX_BODY = 5000;

export interface ThreadView {
  id: string;
  author: string;
  authorRole: "Learner" | "Course staff";
  mine: boolean;
  body: string;
  createdAt: string;
  hidden: boolean;
  reportedByMe: boolean;
  replies: Omit<ThreadView, "replies">[];
}

function staff(userId: string): boolean {
  const u = identity.getUser(userId);
  return !!u && identity.hasRole(u, "instructor");
}

function view(p: Post, viewerId: string): Omit<ThreadView, "replies"> {
  const u = identity.getUser(p.userId);
  return {
    id: p.id,
    author: u?.name ?? "Former learner",
    authorRole: u && identity.hasRole(u, "instructor") ? "Course staff" : "Learner",
    mine: p.userId === viewerId,
    body: p.hiddenAt ? "" : p.body,
    createdAt: p.createdAt,
    hidden: !!p.hiddenAt,
    reportedByMe: p.reports.includes(viewerId),
  };
}

export const community = {
  /** Threads for a discussion item, newest first. Hidden posts show as removed to learners. */
  threads(itemId: string, viewerId: string): ThreadView[] {
    const item = catalog.item(itemId);
    if (!item) throw new PlatformError("not_found", "Discussion not found", 404);
    const isStaff = staff(viewerId);
    if (!isStaff && !entitlements.check(viewerId, "content.view", item.courseId).allow) {
      throw new PlatformError("not_enrolled", "Enroll in this course to join the discussion.", 403);
    }
    const posts = getDb().posts.filter((p) => p.itemId === itemId);
    return posts
      .filter((p) => !p.parentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({
        ...view(p, viewerId),
        body: p.hiddenAt && isStaff ? p.body : view(p, viewerId).body,
        replies: posts
          .filter((r) => r.parentId === p.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((r) => ({ ...view(r, viewerId), body: r.hiddenAt && isStaff ? r.body : view(r, viewerId).body })),
      }));
  },

  post(input: { userId: string; itemId: string; body: string; parentId?: string | null }): Post {
    const item = catalog.item(input.itemId);
    if (!item || item.kind !== "discussion") throw new PlatformError("not_found", "Discussion not found", 404);
    if (!staff(input.userId) && !entitlements.check(input.userId, "content.view", item.courseId).allow) {
      throw new PlatformError("not_enrolled", "Enroll in this course to join the discussion.", 403);
    }
    const body = input.body.trim();
    if (body.length < 2) throw new PlatformError("too_short", "Write a little more before posting.");
    if (body.length > MAX_BODY) throw new PlatformError("too_long", `Posts can be up to ${MAX_BODY} characters.`);
    const db = getDb();
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = db.posts.find((p) => p.id === input.parentId && p.itemId === item.id);
      if (!parent) throw new PlatformError("not_found", "The post you're replying to was removed.", 404);
      parentId = parent.parentId ?? parent.id; // one level of replies
    }
    const p: Post = { id: newId("pst"), courseId: item.courseId, itemId: item.id, userId: input.userId, parentId, body, createdAt: nowIso(), reports: [] };
    db.posts.push(p);
    lms.recordProgress(input.userId, item.id, "completed");
    publish("community.post.created", "community", `user/${input.userId}`, { userId: input.userId, postId: p.id, itemId: item.id, courseId: item.courseId });
    save();
    return p;
  },

  report(postId: string, userId: string): Post {
    const p = getDb().posts.find((x) => x.id === postId);
    if (!p) throw new PlatformError("not_found", "Post not found", 404);
    if (p.userId === userId) throw new PlatformError("own_post", "You can't report your own post. You can ask staff to remove it.");
    if (!p.reports.includes(userId)) p.reports.push(userId);
    publish("community.post.reported", "community", `post/${p.id}`, { postId: p.id, reports: p.reports.length });
    save();
    return p;
  },

  moderate(postId: string, staffId: string, action: "hide" | "restore" | "dismiss"): Post {
    if (!staff(staffId)) throw new PlatformError("forbidden", "Only course staff can moderate.", 403);
    const p = getDb().posts.find((x) => x.id === postId);
    if (!p) throw new PlatformError("not_found", "Post not found", 404);
    if (action === "hide") {
      p.hiddenAt = nowIso();
      p.hiddenBy = staffId;
    } else if (action === "restore") {
      delete p.hiddenAt;
      delete p.hiddenBy;
      p.reports = [];
    } else p.reports = [];
    save();
    return p;
  },

  /** Reported or hidden posts for the staff moderation queue. */
  queue() {
    const db = getDb();
    return db.posts
      .filter((p) => p.reports.length > 0 || p.hiddenAt)
      .sort((a, b) => b.reports.length - a.reports.length || b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({ ...p, author: identity.getUser(p.userId)?.name ?? "Unknown", item: catalog.item(p.itemId), course: catalog.get(p.courseId) }));
  },

  count(itemId: string): number {
    return getDb().posts.filter((p) => p.itemId === itemId && !p.hiddenAt).length;
  },
};
