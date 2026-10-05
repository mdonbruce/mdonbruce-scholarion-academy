import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, isStaff, notify } from "./common";
import { markupToBlocks, renderBlocks, validateBlocks } from "./curriculum";
import { groupQuota } from "./files";

/**
 * Group spaces (parity §2): every group — course groups and account-level groups that span
 * courses (clubs, cohorts, study teams) — has a home with members, pages, a discussion and
 * shared files. Only members, the course's staff (course groups) and admins can see a space.
 */

export function canUseGroup(store: TenantStore, a: Actor, g: Row) {
  if (((g.memberIds as string[]) ?? []).includes(a.id)) return true;
  if (g.courseId) return isStaff(a, String(g.courseId));
  return hasAny(a, ["admin"]);
}

function group(store: TenantStore, a: Actor, groupId: string) {
  const g = store.get("groups", groupId);
  if (!g || !canUseGroup(store, a, g)) throw new CampusError("not_found", "Group not found", 404);
  return g;
}

/** Every group I belong to, across all my courses, plus account groups I can join. */
export function myGroups(store: TenantStore, a: Actor) {
  const mine = store.list("groups", (g) => ((g.memberIds as string[]) ?? []).includes(a.id));
  const joinable = store.list("groups", (g) => !g.courseId && !!g.selfJoin && !((g.memberIds as string[]) ?? []).includes(a.id));
  const view = (g: Row) => ({ id: g.id, name: String(g.name), course: g.courseId ? String(store.get("courses", String(g.courseId))?.code ?? "") : "Account group", members: ((g.memberIds as string[]) ?? []).length, posts: store.list("group_posts", (p) => p.groupId === g.id).length, pages: store.list("group_pages", (p) => p.groupId === g.id).length });
  return { mine: mine.map(view), joinable: joinable.map(view) };
}

export function createAccountGroup(store: TenantStore, a: Actor, input: { name: string; accountId?: string; selfJoin?: boolean; description?: string }) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Admins create account groups.", 403);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new CampusError("invalid", "Name the group.", 422);
  return store.tx(() => {
    const g = store.insert("groups", { courseId: null, accountId: input.accountId ?? store.list("accounts", (x) => !x.parentId)[0]?.id ?? null, name, description: input.description ?? null, memberIds: [], selfJoin: !!input.selfJoin }, "grp");
    audit(store, a, "groups.create_account_group", `groups/${g.id}`, name);
    return g;
  });
}

export function joinAccountGroup(store: TenantStore, a: Actor, groupId: string, join = true) {
  const g = store.get("groups", groupId);
  if (!g || g.courseId) throw new CampusError("not_found", "Group not found", 404);
  const members = new Set((g.memberIds as string[]) ?? []);
  if (join && !g.selfJoin && !hasAny(a, ["admin"])) throw new CampusError("forbidden", "This group is invitation only.", 403);
  if (join) members.add(a.id);
  else members.delete(a.id);
  return store.tx(() => store.update("groups", g.id, { memberIds: [...members] }));
}

export function addGroupMembers(store: TenantStore, a: Actor, groupId: string, userIds: string[]) {
  const g = store.get("groups", groupId);
  if (!g) throw new CampusError("not_found", "Group not found", 404);
  if (g.courseId ? !isStaff(a, String(g.courseId)) : !hasAny(a, ["admin"])) throw new CampusError("forbidden", "Course staff (or admins for account groups) manage members.", 403);
  const valid = userIds.filter((u) => store.get("users", u));
  return store.tx(() => store.update("groups", g.id, { memberIds: [...new Set([...((g.memberIds as string[]) ?? []), ...valid])] }));
}

/* ---------------- pages ---------------- */

export function saveGroupPage(store: TenantStore, a: Actor, groupId: string, input: { pageId?: string; title: string; text: string }) {
  const g = group(store, a, groupId);
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) throw new CampusError("invalid", "Give the page a title.", 422);
  const blocks = validateBlocks(markupToBlocks(String(input.text ?? "")));
  const html = renderBlocks(store, blocks, (g.courseId as string) ?? undefined);
  return store.tx(() => {
    if (input.pageId) {
      const p = store.get("group_pages", input.pageId);
      if (!p || p.groupId !== g.id) throw new CampusError("not_found", "Page not found", 404);
      const revisions = [...((p.revisions as unknown[]) ?? []), { at: nowIso(), by: p.lastEditedBy ?? p.authorId, title: p.title, blocks: p.blocks }].slice(-20);
      return store.update("group_pages", p.id, { title, blocks, html, lastEditedBy: a.id, revisions });
    }
    return store.insert("group_pages", { groupId: g.id, title, blocks, html, authorId: a.id, lastEditedBy: a.id, revisions: [] }, "gpg");
  });
}

/* ---------------- discussion ---------------- */

export function postInGroup(store: TenantStore, a: Actor, groupId: string, input: { body: string; title?: string; parentId?: string }) {
  const g = group(store, a, groupId);
  const body = String(input.body ?? "").trim();
  if (!body || body.length > 10_000) throw new CampusError("invalid", "Write a message (up to 10,000 characters).", 422);
  if (input.parentId) {
    const parent = store.get("group_posts", input.parentId);
    if (!parent || parent.groupId !== g.id) throw new CampusError("not_found", "Thread not found", 404);
  } else if (!String(input.title ?? "").trim()) throw new CampusError("invalid", "A new thread needs a title.", 422);
  return store.tx(() => {
    const p = store.insert("group_posts", { groupId: g.id, parentId: input.parentId ?? null, title: input.parentId ? null : String(input.title).trim().slice(0, 120), body, authorId: a.id }, "gps");
    notify(store, ((g.memberIds as string[]) ?? []).filter((m) => m !== a.id), "groups", `${String(g.name)}: new ${input.parentId ? "reply" : "thread"}`, body.slice(0, 160), `/campus/{tenant}/t/groups?group=${g.id}`, (g.courseId as string) ?? null);
    return p;
  });
}

export function groupHome(store: TenantStore, a: Actor, groupId: string) {
  const g = group(store, a, groupId);
  const name = (id: string) => String(store.get("users", id)?.name ?? "Former member");
  const posts = store.list("group_posts", (p) => p.groupId === g.id).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  const threads = posts.filter((p) => !p.parentId).map((t) => ({ id: t.id, title: String(t.title), body: String(t.body), author: name(String(t.authorId)), at: String(t.createdAt), replies: posts.filter((r) => r.parentId === t.id).map((r) => ({ id: r.id, body: String(r.body), author: name(String(r.authorId)), at: String(r.createdAt) })) }));
  const q = groupQuota(store, g.id);
  return {
    group: { id: g.id, name: String(g.name), course: g.courseId ? String(store.get("courses", String(g.courseId))?.code ?? "") : "Account group", description: (g.description as string) ?? null },
    members: ((g.memberIds as string[]) ?? []).map((m) => ({ id: m, name: name(m) })),
    pages: store.list("group_pages", (p) => p.groupId === g.id).map((p) => ({ id: p.id, title: String(p.title), html: String(p.html ?? ""), editedBy: name(String(p.lastEditedBy ?? p.authorId)), at: String(p.updatedAt ?? p.createdAt), revisions: ((p.revisions as unknown[]) ?? []).length })),
    threads,
    files: store.list("files", (f) => f.groupId === g.id && f.state === "available").map((f) => ({ id: f.id, name: String(f.name), size: Number(f.size ?? 0), owner: name(String(f.ownerId)) })),
    quota: { usedBytes: q.used, limitBytes: q.limit },
  };
}
