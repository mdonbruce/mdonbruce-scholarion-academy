import { broker, CampusError, nowIso, sha256, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { assertAccessible, itemAccessible } from "./curriculum";
import { submit } from "./assessment";
import { audit, isStaff, notify, requireTenant, userName } from "./common";

/**
 * Help desk (Tab 27), Marketplace (Tab 29) and Offline (Tab 30).
 */

/* ---------------- Help desk ---------------- */

function canWorkTickets(a: Actor) {
  return hasAny(a, ["admin", "support"]);
}

export function myTickets(store: TenantStore, a: Actor) {
  return store.list("tickets", (t) => t.requesterId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
}

export function ticketQueue(store: TenantStore, a: Actor, f: { status?: string; tier?: string } = {}) {
  if (!canWorkTickets(a)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "tickets.queue", resource: "tickets", outcome: "denied", reason: a.roles.includes("support") ? "no_active_support_grant" : "role" });
    throw new CampusError("forbidden", a.roles.includes("support") ? "Request a support access grant to work the queue." : "Only the help desk can see the queue.", 403);
  }
  return store.list("tickets", (t) => (!f.status || t.status === f.status) && (!f.tier || t.tier === f.tier)).map((t) => ({ ...t, requester: userName(store, t.requesterId as string) }));
}

export function ticketView(store: TenantStore, a: Actor, ticketId: string) {
  const t = store.get("tickets", ticketId);
  if (!t || (t.requesterId !== a.id && !canWorkTickets(a))) throw new CampusError("not_found", "Ticket not found", 404);
  const staff = canWorkTickets(a);
  const messages = store.list("ticket_messages", (m) => m.ticketId === ticketId && (staff || !m.internal)).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt))).map((m) => ({ id: m.id, author: userName(store, m.authorId as string), body: m.body, internal: !!m.internal, at: m.createdAt }));
  return { ticket: { ...t, ...(staff ? {} : { triage: undefined }) }, messages };
}

export function replyTicket(store: TenantStore, a: Actor, ticketId: string, body: string, internal = false) {
  const t = store.get("tickets", ticketId);
  if (!t || (t.requesterId !== a.id && !canWorkTickets(a))) throw new CampusError("not_found", "Ticket not found", 404);
  if (!body.trim()) throw new CampusError("invalid", "Write a message.", 422);
  if (internal && !canWorkTickets(a)) throw new CampusError("forbidden", "Only help desk staff write internal notes.", 403);
  return store.tx(() => {
    const m = store.insert("ticket_messages", { ticketId, authorId: a.id, body: body.slice(0, 10000), internal }, "tm");
    const fromStaff = canWorkTickets(a) && t.requesterId !== a.id;
    store.update("tickets", ticketId, { status: fromStaff ? "pending" : "open" });
    if (fromStaff && !internal) notify(store, [t.requesterId as string], "support", `Reply on "${t.subject}"`, body.slice(0, 200), `/campus/{tenant}/helpdesk/${ticketId}`);
    return m;
  });
}

export function setTicket(store: TenantStore, a: Actor, ticketId: string, patch: { status?: "open" | "pending" | "solved"; tier?: "1" | "2" | "3"; assigneeId?: string }) {
  if (!canWorkTickets(a)) throw new CampusError("forbidden", "Only help desk staff can change tickets.", 403);
  const t = store.get("tickets", ticketId);
  if (!t) throw new CampusError("not_found", "Ticket not found", 404);
  return store.tx(() => {
    const row = store.update("tickets", ticketId, { ...patch, ...(patch.status === "solved" ? { solvedAt: nowIso() } : {}) });
    audit(store, a, "tickets.update", `tickets/${ticketId}`, Object.keys(patch).join(","));
    if (patch.tier && patch.tier !== t.tier) store.emit("tickets.escalated", `tickets/${ticketId}`, { id: ticketId, tier: patch.tier });
    return row;
  });
}

export function helpdeskStats(store: TenantStore, a: Actor) {
  if (!canWorkTickets(a)) throw new CampusError("forbidden", "Help desk only.", 403);
  const all = store.list("tickets");
  const solved = all.filter((t) => t.solvedAt);
  const hours = solved.map((t) => (Date.parse(String(t.solvedAt)) - Date.parse(String(t.createdAt))) / 3600_000);
  return { open: all.filter((t) => t.status === "open").length, pending: all.filter((t) => t.status === "pending").length, solved: solved.length, medianHoursToSolve: hours.length ? Math.round(hours.sort((x, y) => x - y)[Math.floor(hours.length / 2)] * 10) / 10 : null, byCategory: Object.fromEntries([...new Set(all.map((t) => String(t.category ?? "other")))].map((c) => [c, all.filter((t) => String(t.category ?? "other") === c).length])) };
}

/* ---------------- Marketplace (flagged) ---------------- */

function requireMarketplace(store: TenantStore) {
  if (!broker.tenant(store.tenantId)?.flags.marketplace) throw new CampusError("disabled", "The marketplace is turned off for this school. An admin can enable it.", 423);
}

export function catalog(store: TenantStore, a: Actor) {
  requireMarketplace(store);
  if (!hasAny(a, ["admin", "designer"]) && !Object.values(a.courseRoles).some((r) => r.includes("instructor"))) throw new CampusError("forbidden", "The marketplace is for teaching staff.", 403);
  return store.list("listings", (l) => !!l.reviewed).map((l) => ({ ...l, installed: store.list("installs", (i) => i.listingId === l.id && i.state === "approved").length > 0, requested: store.list("installs", (i) => i.listingId === l.id && i.state === "requested").length > 0 }));
}

export function requestInstall(store: TenantStore, a: Actor, listingId: string, reason: string) {
  requireMarketplace(store);
  const l = store.get("listings", listingId);
  if (!l || !l.reviewed) throw new CampusError("not_found", "Listing not found", 404);
  if (store.list("installs", (i) => i.listingId === listingId && ["requested", "approved"].includes(String(i.state))).length) throw new CampusError("conflict", "Already requested or installed.", 409);
  return store.tx(() => {
    const i = store.insert("installs", { listingId, approvedBy: null, state: "requested", requestedBy: a.id, reason: reason.slice(0, 500) }, "ins");
    notify(store, store.list("role_grants", (g) => g.role === "admin" && !g.revokedAt).map((g) => g.userId as string), "admin", `Install request: ${l.name}`, reason.slice(0, 200), `/campus/{tenant}/marketplace`);
    return i;
  });
}

/** Admin approval. LTI tools are registered DISABLED (an admin enables them after configuring keys). */
export function decideInstall(store: TenantStore, a: Actor, installId: string, approve: boolean) {
  requireTenant(store, a, ["admin"], "marketplace.decide");
  requireMarketplace(store);
  const i = store.get("installs", installId);
  if (!i || i.state !== "requested") throw new CampusError("not_found", "Pending request not found", 404);
  const l = store.get("listings", i.listingId as string)!;
  return store.tx(() => {
    let created: Row | null = null;
    if (approve && l.kind === "lti_tool") created = store.insert("tool_registrations", { name: l.name, clientId: `mkt-${l.id}`, issuer: (l.issuer as string) ?? "https://tools.example.test", launchUrl: (l.launchUrl as string) ?? "https://tools.example.test/launch", services: ["deep_linking"], enabled: false, secretRef: "pending-configuration", fromListing: l.id }, "lti");
    if (approve && l.kind === "content_pack") created = store.insert("shared_content", { kind: "modules", title: l.name, snapshot: (l.package as Record<string, unknown>) ?? {}, scope: "institution", recipientId: null, sharedBy: a.id, version: 1, tags: ["marketplace"], sourceId: l.id }, "shc");
    const row = store.update("installs", i.id, { state: approve ? "approved" : "declined", approvedBy: a.id, createdRef: created?.id ?? null });
    audit(store, a, approve ? "marketplace.approve" : "marketplace.decline", `installs/${i.id}`, String(l.name));
    return row;
  });
}

/* ---------------- Offline ---------------- */

/** Build an offline package of what this learner can open right now in a course. */
export function buildOfflinePackage(store: TenantStore, a: Actor, courseId: string) {
  if (!(a.courseRoles[courseId] ?? []).length) throw new CampusError("forbidden", "You're not in this course.", 403);
  const pages = store
    .list("pages", (p) => p.courseId === courseId && p.state === "published")
    .filter((p) => isStaff(a, courseId) || itemAccessible(store, a, "page", p.id).ok)
    .map((p) => ({ id: p.id, title: p.title, html: p.html, version: p.version }));
  const assignments = store
    .list("assignments", (x) => x.courseId === courseId && x.state === "published")
    .filter((x) => isStaff(a, courseId) || itemAccessible(store, a, "assignment", x.id).ok)
    .map((x) => ({ id: x.id, title: x.title, instructions: x.instructions, dueAt: x.dueAt ?? null, version: x.version, submissionTypes: x.submissionTypes }));
  const payload = { pages, assignments };
  return store.tx(() => {
    const prev = store.list("offline_packages", (p) => p.userId === a.id && p.courseId === courseId)[0];
    const vals = { userId: a.id, courseId, pages: payload, builtAt: nowIso(), checksum: sha256(JSON.stringify(payload)) };
    return prev ? store.update("offline_packages", prev.id, vals) : store.insert("offline_packages", vals, "op");
  });
}

/** Incremental sync: events since the device's cursor that touch my courses (ids only). */
export function syncChanges(store: TenantStore, a: Actor, deviceId: string) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(deviceId)) throw new CampusError("invalid", "Bad device id", 422);
  const mine = new Set(Object.keys(a.courseRoles));
  const cur = store.list("sync_cursors", (c) => c.userId === a.id && c.deviceId === deviceId)[0];
  const pos = Number(cur?.position ?? 0);
  const all = store.outbox();
  const changes = all.slice(pos).filter((e) => e.data.courseId && mine.has(String(e.data.courseId)) && /^(pages|assignments|announcements|modules|module_items|grades)\./.test(e.type)).map((e) => ({ type: e.type, subject: e.subject, at: e.at }));
  store.tx(() => (cur ? store.update("sync_cursors", cur.id, { position: all.length }) : store.insert("sync_cursors", { userId: a.id, deviceId, position: all.length }, "sc")));
  return { changes, cursor: all.length };
}

export function saveOfflineDraft(store: TenantStore, a: Actor, assignmentId: string, body: string, baseVersion: number) {
  const asg = store.get("assignments", assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  if (!(a.courseRoles[asg.courseId as string] ?? []).includes("student")) throw new CampusError("forbidden", "Only students save offline drafts.", 403);
  return store.tx(() => {
    const ex = store.list("offline_drafts", (d) => d.userId === a.id && d.assignmentId === assignmentId && d.state !== "submitted")[0];
    const vals = { userId: a.id, assignmentId, body: body.slice(0, 100000), baseVersion, state: "saved", conflict: null };
    return ex ? store.update("offline_drafts", ex.id, vals) : store.insert("offline_drafts", vals, "od");
  });
}

/**
 * Upload a draft made offline. If the assignment changed since the draft was based on it
 * (instructions, due date…), the draft is held as a conflict instead of being submitted
 * silently — the student decides.
 */
export function syncOfflineDraft(store: TenantStore, a: Actor, draftId: string, resolve?: "submit_anyway" | "discard") {
  const d = store.get("offline_drafts", draftId);
  if (!d || d.userId !== a.id) throw new CampusError("not_found", "Draft not found", 404);
  if (d.state === "submitted") return d;
  const asg = store.get("assignments", d.assignmentId as string);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  if (resolve === "discard") return store.tx(() => store.update("offline_drafts", d.id, { state: "discarded" }));
  const changed = Number(asg.version) !== Number(d.baseVersion);
  if (changed && resolve !== "submit_anyway") {
    return store.tx(() => store.update("offline_drafts", d.id, { state: "conflict", conflict: { serverVersion: asg.version, draftVersion: d.baseVersion, serverDueAt: asg.dueAt ?? null, serverInstructions: String(asg.instructions ?? "").slice(0, 2000) } }));
  }
  assertAccessible(store, a, "assignment", asg.id);
  const s = submit(store, a, asg.id, { mode: "text", body: String(d.body), offline: true });
  return store.tx(() => store.update("offline_drafts", d.id, { state: "submitted", submissionId: s.id, conflict: null }));
}
