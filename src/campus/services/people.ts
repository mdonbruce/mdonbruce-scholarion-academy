import { CampusError, hmac, nowIso, nowMs, sha256, token, type Role, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { actorHas } from "../permissions";
import { accountOf } from "../entity";
import { activeStudents, audit, course, isStaff, notify, requireCourse, userName } from "./common";
import { csv, parseCsv } from "./sis";
import { pseudonym } from "./success";

/**
 * People & Groups (Tab 32), observers (Tab 39) and accommodations (Tab 31):
 * course roster with activity, manual enrollment for non-SIS roles, group sets with
 * self sign-up, auto-assign, CSV import/export and clone; observer pairing codes.
 */

const COURSE_ROLES: Role[] = ["student", "instructor", "ta", "designer", "observer"];

export function roster(store: TenantStore, a: Actor, courseId: string, f: { role?: string; sectionId?: string; q?: string; includeInactive?: boolean } = {}) {
  course(store, courseId);
  const member = (a.courseRoles[courseId] ?? []).length > 0 || a.roles.includes("admin");
  if (!member) throw new CampusError("forbidden", "You're not in this course.", 403);
  const staff = isStaff(a, courseId) || a.roles.includes("admin");
  const events = staff ? store.list("learning_events", (e) => e.courseId === courseId) : [];
  const rows = store
    .list("enrollments", (e) => e.courseId === courseId && (f.includeInactive && staff ? true : e.state === "active") && (!f.role || e.role === f.role) && (!f.sectionId || e.sectionId === f.sectionId))
    .filter((e) => staff || e.role !== "observer")
    .map((e) => {
      const u = store.get("users", e.userId as string);
      const ref = pseudonym(store.tenantId, e.userId as string);
      const mine = events.filter((x) => x.actorRef === ref).sort((x, y) => String(y.at).localeCompare(String(x.at)));
      return {
        enrollmentId: e.id,
        userId: e.userId as string,
        name: (u?.name as string) ?? "Former user",
        pronouns: store.list("profiles", (p) => p.userId === e.userId)[0]?.pronouns ?? null,
        role: e.role as string,
        section: e.sectionId ? ((store.get("sections", e.sectionId as string)?.code as string) ?? null) : null,
        sectionId: (e.sectionId as string) ?? null,
        state: e.state as string,
        source: e.source as string,
        ...(staff ? { email: u?.email, lastActivity: mine[0]?.at ?? null, activityEvents: mine.length } : {}),
      };
    })
    .filter((r) => !f.q || `${r.name} ${"email" in r ? r.email : ""}`.toLowerCase().includes(f.q.toLowerCase()));
  return rows.sort((x, y) => x.role.localeCompare(y.role) || x.name.localeCompare(y.name));
}

/** Add people by email. Students normally come from SIS; staff can add TAs, designers, observers (and students in non-SIS courses). */
export function addPeople(store: TenantStore, a: Actor, courseId: string, input: { emails: string[]; role: Role; sectionId?: string }) {
  requireCourse(store, a, courseId, ["admin", "instructor"], "people.add");
  if (!COURSE_ROLES.includes(input.role)) throw new CampusError("invalid", "Choose a course role.", 422);
  if (!actorHas(store, a, [...(a.courseRoles[courseId] ?? []), ...a.roles], "manage_users", accountOf(store, courseId))) throw new CampusError("forbidden", "Your role can't add people here.", 403);
  if (input.role === "instructor" && !a.roles.includes("admin")) throw new CampusError("forbidden", "Only admins add instructors.", 403);
  if (input.sectionId && store.get("sections", input.sectionId)?.courseId !== courseId) throw new CampusError("invalid", "That section isn't in this course.", 422);
  const results: { email: string; status: "added" | "already_enrolled" | "not_found" }[] = [];
  return store.tx(() => {
    for (const raw of input.emails.slice(0, 200)) {
      const email = raw.trim().toLowerCase();
      if (!email) continue;
      const u = store.list("users", (x) => x.email === email)[0];
      if (!u) {
        results.push({ email, status: "not_found" });
        continue;
      }
      if (store.list("enrollments", (e) => e.userId === u.id && e.courseId === courseId && e.role === input.role && e.state === "active").length) {
        results.push({ email, status: "already_enrolled" });
        continue;
      }
      store.insert("enrollments", { userId: u.id, courseId, sectionId: input.sectionId ?? null, role: input.role, state: "active", source: "manual", addedBy: a.id }, "enr");
      notify(store, [u.id], "course_invitations", `You were added to ${course(store, courseId).title}`, `Role: ${input.role}`, `/campus/{tenant}/courses/${courseId}`, courseId);
      results.push({ email, status: "added" });
    }
    audit(store, a, "people.add", `courses/${courseId}`, `${results.filter((r) => r.status === "added").length} added as ${input.role}`);
    return results;
  });
}

export function setEnrollmentState(store: TenantStore, a: Actor, enrollmentId: string, state: "active" | "inactive" | "concluded" | "deleted") {
  const e = store.get("enrollments", enrollmentId);
  if (!e) throw new CampusError("not_found", "Enrollment not found", 404);
  requireCourse(store, a, e.courseId as string, ["admin", "instructor"], "people.state");
  if (e.source === "sis" && e.role === "student" && !a.roles.includes("admin")) throw new CampusError("sis_managed", "This enrollment comes from the SIS. Drop it in Registration instead.", 409);
  return store.tx(() => {
    const row = state === "deleted" ? store.tombstone("enrollments", e.id) : store.update("enrollments", e.id, { state });
    audit(store, a, `people.${state}`, `enrollments/${e.id}`);
    return row;
  });
}

/* ---------------- Group sets ---------------- */

function groupsOf(store: TenantStore, setId: string) {
  return store.list("groups", (g) => g.setId === setId);
}

export function joinGroup(store: TenantStore, a: Actor, groupId: string) {
  const g = store.get("groups", groupId);
  if (!g) throw new CampusError("not_found", "Group not found", 404);
  const set = g.setId ? store.get("group_sets", g.setId as string) : undefined;
  if (!set?.selfSignup) throw new CampusError("forbidden", "This group set doesn't allow self sign-up.", 403);
  if (!(a.courseRoles[g.courseId as string] ?? []).includes("student")) throw new CampusError("forbidden", "Only students in this course can join.", 403);
  const max = Number(g.maxSize ?? set.maxSize ?? 0);
  const members = (g.memberIds as string[]) ?? [];
  if (members.includes(a.id)) return g;
  if (max && members.length >= max) throw new CampusError("group_full", "That group is full.", 409);
  if (set.bySection) {
    const mySections = store.list("enrollments", (e) => e.userId === a.id && e.courseId === g.courseId && e.state === "active").map((e) => e.sectionId);
    const other = members.find((m) => !store.list("enrollments", (e) => e.userId === m && e.courseId === g.courseId && mySections.includes(e.sectionId)).length);
    if (other) throw new CampusError("section_mismatch", "This group is for a different section.", 409);
  }
  return store.tx(() => {
    for (const other of groupsOf(store, set.id)) if (((other.memberIds as string[]) ?? []).includes(a.id)) store.update("groups", other.id, { memberIds: (other.memberIds as string[]).filter((m) => m !== a.id) });
    const row = store.update("groups", g.id, { memberIds: [...members, a.id] });
    store.emit("groups.joined", `groups/${g.id}`, { id: g.id, userId: a.id, courseId: g.courseId });
    return row;
  });
}

export function leaveGroup(store: TenantStore, a: Actor, groupId: string) {
  const g = store.get("groups", groupId);
  if (!g) throw new CampusError("not_found", "Group not found", 404);
  const set = g.setId ? store.get("group_sets", g.setId as string) : undefined;
  if (!set?.selfSignup) throw new CampusError("forbidden", "Ask your instructor to change groups.", 403);
  return store.tx(() => store.update("groups", g.id, { memberIds: ((g.memberIds as string[]) ?? []).filter((m) => m !== a.id), leaderId: g.leaderId === a.id ? null : g.leaderId }));
}

/** Create `count` groups (if needed) and spread unassigned students evenly; keeps sections together when required. */
export function autoAssign(store: TenantStore, a: Actor, setId: string, opts: { groupCount?: number; seed?: string } = {}) {
  const set = store.get("group_sets", setId);
  if (!set) throw new CampusError("not_found", "Group set not found", 404);
  requireCourse(store, a, set.courseId as string, ["admin", "instructor", "ta", "designer"], "groups.auto_assign");
  return store.tx(() => {
    let groups = groupsOf(store, setId);
    const need = opts.groupCount ?? 0;
    for (let i = groups.length; i < need; i++) store.insert("groups", { courseId: set.courseId, setId, name: `${set.name} ${i + 1}`, memberIds: [], maxSize: set.maxSize ?? null }, "grp");
    groups = groupsOf(store, setId);
    if (!groups.length) throw new CampusError("invalid", "Create at least one group first (or give a group count).", 422);
    const assigned = new Set(groups.flatMap((g) => (g.memberIds as string[]) ?? []));
    const seed = opts.seed ?? token(6);
    const pool = activeStudents(store, set.courseId as string)
      .filter((e) => !assigned.has(e.userId as string))
      .sort((x, y) => hmac(seed, String(x.userId)).localeCompare(hmac(seed, String(y.userId))));
    const bySection = !!set.bySection;
    const members = new Map(groups.map((g) => [g.id, [...((g.memberIds as string[]) ?? [])]]));
    const sectionOf = new Map<string, string | null>();
    for (const g of groups) {
      const first = members.get(g.id)![0];
      sectionOf.set(g.id, first ? ((store.list("enrollments", (e) => e.userId === first && e.courseId === set.courseId)[0]?.sectionId as string) ?? null) : null);
    }
    let placed = 0;
    let unplaced = 0;
    for (const e of pool) {
      const sec = (e.sectionId as string) ?? null;
      const candidates = groups
        .filter((g) => !set.maxSize || members.get(g.id)!.length < Number(set.maxSize))
        .filter((g) => !bySection || sectionOf.get(g.id) === null || sectionOf.get(g.id) === sec)
        .sort((x, y) => members.get(x.id)!.length - members.get(y.id)!.length);
      const g = candidates[0];
      if (!g) {
        unplaced++;
        continue;
      }
      members.get(g.id)!.push(e.userId as string);
      if (bySection && sectionOf.get(g.id) === null) sectionOf.set(g.id, sec);
      placed++;
    }
    for (const g of groups) store.update("groups", g.id, { memberIds: members.get(g.id) });
    audit(store, a, "groups.auto_assign", `group_sets/${setId}`, `${placed} placed`);
    return { placed, unplaced, groups: groups.length };
  });
}

export function cloneGroupSet(store: TenantStore, a: Actor, setId: string, name: string) {
  const set = store.get("group_sets", setId);
  if (!set) throw new CampusError("not_found", "Group set not found", 404);
  requireCourse(store, a, set.courseId as string, ["admin", "instructor", "designer"], "groups.clone");
  return store.tx(() => {
    const copy = store.insert("group_sets", { courseId: set.courseId, name, selfSignup: set.selfSignup, maxSize: set.maxSize, bySection: set.bySection }, "gs");
    for (const g of groupsOf(store, setId)) store.insert("groups", { courseId: set.courseId, setId: copy.id, name: g.name, memberIds: g.memberIds, maxSize: g.maxSize ?? null, leaderId: g.leaderId ?? null }, "grp");
    audit(store, a, "groups.clone", `group_sets/${copy.id}`, setId);
    return copy;
  });
}

export function exportGroupsCsv(store: TenantStore, a: Actor, setId: string) {
  const set = store.get("group_sets", setId);
  if (!set) throw new CampusError("not_found", "Group set not found", 404);
  requireCourse(store, a, set.courseId as string, ["admin", "instructor", "ta", "designer"], "groups.export");
  const rows = groupsOf(store, setId).flatMap((g) => ((g.memberIds as string[]) ?? []).map((m) => ({ group_name: g.name, email: store.get("users", m)?.email ?? "", name: userName(store, m) })));
  return csv(rows, ["group_name", "email", "name"]);
}

/** CSV: group_name,email. Creates missing groups; members must be active students. */
export function importGroupsCsv(store: TenantStore, a: Actor, setId: string, text: string) {
  const set = store.get("group_sets", setId);
  if (!set) throw new CampusError("not_found", "Group set not found", 404);
  requireCourse(store, a, set.courseId as string, ["admin", "instructor", "designer"], "groups.import");
  const rows = parseCsv(text);
  const errors: { row: number; message: string }[] = [];
  return store.tx(() => {
    const students = new Map(activeStudents(store, set.courseId as string).map((e) => [String(store.get("users", e.userId as string)?.email), e.userId as string]));
    const plan = new Map<string, string[]>();
    rows.forEach((r, i) => {
      const uid = students.get(String(r.email ?? "").trim().toLowerCase());
      if (!r.group_name) errors.push({ row: i + 2, message: "group_name is required" });
      else if (!uid) errors.push({ row: i + 2, message: `${r.email} isn't an active student in this course` });
      else plan.set(r.group_name, [...(plan.get(r.group_name) ?? []), uid]);
    });
    const all = [...plan.values()].flat();
    if (new Set(all).size !== all.length) errors.push({ row: 0, message: "A student appears in more than one group." });
    if (errors.length) throw new CampusError("invalid", "The CSV has problems; nothing was changed.", 422, { errors });
    for (const [name, ids] of plan) {
      const g = groupsOf(store, setId).find((x) => x.name === name) ?? store.insert("groups", { courseId: set.courseId, setId, name, memberIds: [], maxSize: set.maxSize ?? null }, "grp");
      store.update("groups", g.id, { memberIds: ids });
    }
    for (const g of groupsOf(store, setId)) if (!plan.has(g.name as string)) store.update("groups", g.id, { memberIds: ((g.memberIds as string[]) ?? []).filter((m) => !all.includes(m)) });
    audit(store, a, "groups.import", `group_sets/${setId}`, `${plan.size} groups`);
    return { groups: plan.size, members: all.length };
  });
}

export function groupSetView(store: TenantStore, a: Actor, setId: string) {
  const set = store.get("group_sets", setId);
  if (!set) throw new CampusError("not_found", "Group set not found", 404);
  const cid = set.courseId as string;
  if (!(a.courseRoles[cid] ?? []).length && !a.roles.includes("admin")) throw new CampusError("forbidden", "You're not in this course.", 403);
  const staff = isStaff(a, cid) || a.roles.includes("admin");
  const groups = groupsOf(store, setId).map((g) => ({ id: g.id, name: g.name as string, size: ((g.memberIds as string[]) ?? []).length, maxSize: (g.maxSize as number) ?? (set.maxSize as number) ?? null, mine: ((g.memberIds as string[]) ?? []).includes(a.id), members: staff || ((g.memberIds as string[]) ?? []).includes(a.id) ? ((g.memberIds as string[]) ?? []).map((m) => ({ id: m, name: userName(store, m) })) : [] }));
  const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));
  return { set: { id: set.id, name: set.name, selfSignup: !!set.selfSignup, maxSize: set.maxSize ?? null, bySection: !!set.bySection }, groups, unassigned: staff ? activeStudents(store, cid).filter((e) => !assigned.has(e.userId as string)).map((e) => ({ id: e.userId as string, name: userName(store, e.userId as string) })) : [] };
}

/* ---------------- Observers: pairing codes ---------------- */

/** A student makes a short-lived pairing code to share with a parent/guardian/mentor. */
export function pairingCode(store: TenantStore, a: Actor) {
  if (!Object.values(a.courseRoles).some((r) => r.includes("student"))) throw new CampusError("forbidden", "Only students can create pairing codes.", 403);
  const code = token(5).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase().padEnd(6, "7");
  return store.tx(() => {
    store.insert("pairing_codes", { studentId: a.id, codeHash: sha256(code), expiresAt: new Date(nowMs() + 24 * 3600_000).toISOString(), usedAt: null }, "pc");
    audit(store, a, "observers.pairing_code", `users/${a.id}`);
    return { code, expiresAt: new Date(nowMs() + 24 * 3600_000).toISOString() };
  });
}

/** An observer redeems the code: creates the link and observer enrollments in the student's courses. */
export function redeemPairing(store: TenantStore, a: Actor, code: string) {
  const p = store.list("pairing_codes", (x) => x.codeHash === sha256(code.trim().toUpperCase()))[0];
  if (!p || p.usedAt || String(p.expiresAt) < nowIso()) throw new CampusError("invalid_code", "That code is invalid or expired. Ask the student for a new one.", 422);
  if (p.studentId === a.id) throw new CampusError("invalid", "You can't observe yourself.", 422);
  return store.tx(() => {
    store.update("pairing_codes", p.id, { usedAt: nowIso() });
    const link = store.list("observer_links", (l) => l.observerId === a.id && l.studentId === p.studentId)[0] ?? store.insert("observer_links", { observerId: a.id, studentId: p.studentId, alertGradeBelow: null, alertMissing: true, alertAnnouncements: false }, "obl");
    for (const e of store.list("enrollments", (x) => x.userId === p.studentId && x.role === "student" && x.state === "active")) {
      if (!store.list("enrollments", (x) => x.userId === a.id && x.courseId === e.courseId && x.role === "observer" && x.observingId === p.studentId).length) store.insert("enrollments", { userId: a.id, courseId: e.courseId, sectionId: e.sectionId ?? null, role: "observer", state: "active", source: "pairing", observingId: p.studentId }, "enr");
    }
    audit(store, a, "observers.paired", `users/${p.studentId}`);
    return link;
  });
}

export function myObservees(store: TenantStore, a: Actor) {
  return store.list("observer_links", (l) => l.observerId === a.id).map((l) => ({ linkId: l.id, studentId: l.studentId as string, name: userName(store, l.studentId as string), alertGradeBelow: l.alertGradeBelow ?? null, alertMissing: !!l.alertMissing, alertAnnouncements: !!l.alertAnnouncements, alerts: store.list("observer_alerts", (x) => x.observerId === a.id && x.studentId === l.studentId && !x.readAt).length }));
}

/* ---------------- Accommodations ---------------- */

export function accommodationsFor(store: TenantStore, a: Actor, userId: string, courseId?: string) {
  const allowed = userId === a.id || hasAny(a, ["admin", "advisor"]) || (courseId ? hasAny(a, ["instructor", "ta"], courseId) : false);
  if (!allowed) throw new CampusError("forbidden", "You can't see these accommodations.", 403);
  const now = nowIso().slice(0, 10);
  return store
    .list("accommodations", (x) => x.userId === userId && (!x.courseId || !courseId || x.courseId === courseId) && (!x.expiresAt || String(x.expiresAt) >= now))
    .map((x) => ({ id: x.id, kind: x.kind as string, multiplier: x.multiplier ?? null, days: x.days ?? null, courseId: (x.courseId as string) ?? null, expiresAt: x.expiresAt ?? null }));
}

export function courseAccommodations(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "accommodations.course");
  const students = activeStudents(store, courseId).map((e) => e.userId as string);
  return students.map((u) => ({ userId: u, name: userName(store, u), accommodations: accommodationsFor(store, a, u, courseId) })).filter((x) => x.accommodations.length);
}

