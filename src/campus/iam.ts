import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { totp as totpNow, verifyTotp } from "@/platform/totp";
import { broker, CampusError, metrics, nowIso, nowMs, ROLES, sha256, token, type Role, type Row, type TenantContext, type TenantStore } from "./core";

/**
 * Tab 1 — Identity & Access. Users, realms, role grants, support grants, sessions and the
 * policy engine (RBAC + attribute checks). Sessions live in the tenant's own store, so a
 * session from one tenant can never resolve in another.
 */

export interface Actor {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  /** Tenant-wide roles from RoleGrants. */
  roles: Role[];
  /** courseId → roles from the enrollment projection (student, instructor, ta, designer, observer). */
  courseRoles: Record<string, Role[]>;
  /** Active support grant (support role only). */
  supportGrant?: { id: string; expiresAt: string; scope: string; targetUserId?: string };
  platformOperator: boolean;
  mfa: boolean;
  /** Custom role keys (permission-matrix overrides apply to them). */
  customRoles: string[];
  /** Set while an admin is acting as this user. */
  masqueradedBy?: { id: string; name: string; expiresAt: string };
  /** The Student View test student for a course. */
  testStudentOf?: string;
}

export const ANONYMOUS_ID = "anonymous";

export function hashPassword(pw: string, salt = randomBytes(16).toString("hex")): string {
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, salt, hash] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- Actors ---------------- */

export function actorFor(store: TenantStore, userId: string, mfa = false): Actor {
  const u = store.get("users", userId);
  if (!u || u.status !== "active") throw new CampusError("unauthenticated", "Please sign in.", 401);
  const grants = store.list("role_grants", (g) => g.userId === userId && !g.revokedAt && (!g.expiresAt || String(g.expiresAt) > nowIso()));
  const roles = grants.map((g) => g.role as Role);
  const customRoles = grants.filter((g) => g.customRole).map((g) => g.customRole as string);
  const courseRoles: Record<string, Role[]> = {};
  for (const e of store.list("enrollments", (e) => e.userId === userId && e.state === "active")) {
    const start = e.startAt as string | undefined;
    const end = e.endAt as string | undefined;
    if ((start && start > nowIso()) || (end && end < nowIso())) continue;
    (courseRoles[e.courseId as string] ??= []).push(e.role as Role);
  }
  let supportGrant: Actor["supportGrant"];
  if (roles.includes("support")) {
    const g = store.list("support_grants", (g) => g.supportUserId === userId && g.status === "approved" && String(g.expiresAt) > nowIso())[0];
    if (g) supportGrant = { id: g.id, expiresAt: g.expiresAt as string, scope: g.scope as string, targetUserId: g.targetUserId as string | undefined };
  }
  return {
    id: u.id,
    tenantId: store.tenantId,
    name: u.name as string,
    email: u.email as string,
    roles: [...new Set(roles)],
    courseRoles,
    supportGrant,
    platformOperator: broker.platform().operators.includes(`${store.tenantId}:${u.id}`),
    mfa,
    customRoles,
    testStudentOf: (u.testStudentOf as string | undefined) ?? undefined,
  };
}

/** Roles that apply tenant-wide. Teaching roles (student, instructor, ta, observer) only apply inside a course they are enrolled in. */
const TENANT_WIDE: Role[] = ["admin", "registrar", "advisor", "support", "designer"];

/** Effective roles for an action, optionally scoped to a course. */
export function effectiveRoles(a: Actor, courseId?: string | null): Role[] {
  const r = new Set<Role>();
  if (courseId) {
    for (const x of a.roles) if (TENANT_WIDE.includes(x)) r.add(x);
    for (const x of a.courseRoles[courseId] ?? []) r.add(x);
  } else {
    for (const x of a.roles) r.add(x);
    for (const list of Object.values(a.courseRoles)) for (const x of list) r.add(x);
  }
  // Support staff only gain access while a time-boxed grant is active.
  if (r.has("support") && !a.supportGrant) r.delete("support");
  return [...r];
}

export function hasAny(a: Actor, roles: readonly Role[], courseId?: string | null): boolean {
  const eff = effectiveRoles(a, courseId);
  return roles.some((x) => eff.includes(x));
}

/**
 * Policy decision. Every command and query calls this (directly or via the entity layer),
 * and every denial is audited.
 */
export function authorize(store: TenantStore, a: Actor, action: string, allowed: readonly Role[], opts: { courseId?: string | null; resource?: string; abac?: () => boolean; reason?: string } = {}) {
  const ok = hasAny(a, allowed, opts.courseId) && (opts.abac ? opts.abac() : true);
  metrics.inc("authz_decisions_total", { action, outcome: ok ? "allow" : "deny" });
  if (!ok) {
    store.audit({ actorId: a.id, actorRoles: effectiveRoles(a, opts.courseId), action, resource: opts.resource ?? action, outcome: "denied", reason: opts.reason ?? "role_or_policy" });
    throw new CampusError("forbidden", "You don't have permission to do that.", 403);
  }
}

/* ---------------- Users, grants ---------------- */

export function createUser(store: TenantStore, input: { name: string; email: string; password?: string; passwordHash?: string; roles?: Role[]; id?: string; mfaSecret?: string }): Row {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CampusError("invalid_email", "Enter a valid email address.");
  if (store.list("users", (u) => u.email === email).length) throw new CampusError("conflict", "That email is already in use in this school.", 409);
  const u = store.insert("users", {
    id: input.id,
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash ?? (input.password ? hashPassword(input.password) : null),
    status: "active",
    mfaSecret: input.mfaSecret ?? null,
  }, "usr");
  for (const role of input.roles ?? []) store.insert("role_grants", { userId: u.id, role, scope: "tenant", grantedBy: "seed" }, "rg");
  return u;
}

export function grantRole(store: TenantStore, by: Actor, userId: string, role: Role, expiresAt?: string) {
  authorize(store, by, "role_grant.create", ["admin"], { resource: `user/${userId}` });
  if (!ROLES.includes(role)) throw new CampusError("bad_role", "Unknown role");
  if (!store.get("users", userId)) throw new CampusError("not_found", "User not found", 404);
  return store.tx(() => {
    const g = store.insert("role_grants", { userId, role, scope: "tenant", grantedBy: by.id, expiresAt: expiresAt ?? null }, "rg");
    store.emit("identity.role.granted", `user/${userId}`, { userId, role });
    store.audit({ actorId: by.id, actorRoles: by.roles, action: "role_grant.create", resource: `user/${userId}`, outcome: "allowed", reason: role });
    return g;
  });
}

export function revokeRole(store: TenantStore, by: Actor, grantId: string) {
  authorize(store, by, "role_grant.revoke", ["admin"], { resource: `role_grant/${grantId}` });
  return store.tx(() => {
    const g = store.update("role_grants", grantId, { revokedAt: nowIso(), revokedBy: by.id });
    store.emit("identity.role.revoked", `user/${g.userId}`, { userId: g.userId, role: g.role });
    store.audit({ actorId: by.id, actorRoles: by.roles, action: "role_grant.revoke", resource: `role_grant/${grantId}`, outcome: "allowed" });
    return g;
  });
}

/** Support asks; a tenant admin approves a time-boxed, scoped grant. */
export function requestSupportGrant(store: TenantStore, by: Actor, input: { reason: string; ticketId?: string; targetUserId?: string; hours?: number }) {
  if (!by.roles.includes("support")) throw new CampusError("forbidden", "Only support staff can request access.", 403);
  if (input.reason.trim().length < 10) throw new CampusError("reason_required", "Explain why access is needed.");
  const hours = Math.min(8, Math.max(1, input.hours ?? 2));
  return store.tx(() => {
    const g = store.insert("support_grants", { supportUserId: by.id, reason: input.reason.trim(), ticketId: input.ticketId ?? null, targetUserId: input.targetUserId ?? null, scope: "read", hours, status: "requested", expiresAt: null }, "sg");
    store.audit({ actorId: by.id, actorRoles: by.roles, action: "support_grant.request", resource: `support_grant/${g.id}`, outcome: "allowed" });
    return g;
  });
}

export function decideSupportGrant(store: TenantStore, by: Actor, grantId: string, approve: boolean) {
  authorize(store, by, "support_grant.decide", ["admin"], { resource: `support_grant/${grantId}` });
  return store.tx(() => {
    const g = store.get("support_grants", grantId);
    if (!g || g.status !== "requested") throw new CampusError("not_found", "No pending request", 404);
    const patch = approve ? { status: "approved", approvedBy: by.id, expiresAt: new Date(nowMs() + Number(g.hours) * 3600_000).toISOString() } : { status: "denied", approvedBy: by.id };
    const out = store.update("support_grants", grantId, patch);
    store.emit(approve ? "identity.support_grant.approved" : "identity.support_grant.denied", `user/${g.supportUserId}`, { grantId, supportUserId: g.supportUserId });
    store.audit({ actorId: by.id, actorRoles: by.roles, action: approve ? "support_grant.approve" : "support_grant.deny", resource: `support_grant/${grantId}`, outcome: "allowed" });
    return out;
  });
}

/* ---------------- Sessions + MFA ---------------- */

const SESSION_HOURS = 12;
export function cookieName(tenantId: string) {
  return `scc_${tenantId}`;
}

export function signIn(store: TenantStore, email: string, password: string, code?: string): { token: string; needsMfa: false; actor: Actor } | { needsMfa: true } {
  const u = store.list("users", (x) => x.email === email.trim().toLowerCase() && x.status === "active")[0];
  const fails = store.list("login_failures", (f) => f.email === email.trim().toLowerCase() && String(f.createdAt) > new Date(nowMs() - 15 * 60_000).toISOString()).length;
  if (fails >= 8) throw new CampusError("locked", "Too many attempts. Wait 15 minutes.", 429);
  if (!u || !u.passwordHash || !verifyPassword(password, u.passwordHash as string)) {
    store.insert("login_failures", { email: email.trim().toLowerCase() }, "lf");
    store.audit({ actorId: ANONYMOUS_ID, actorRoles: [], action: "session.create", resource: "session", outcome: "denied", reason: "bad_credentials" });
    throw new CampusError("bad_credentials", "Email or password is incorrect.", 401);
  }
  const realm = broker.tenant(store.tenantId)!.realm;
  const staff = store.list("role_grants", (g) => g.userId === u.id && !g.revokedAt && ["admin", "registrar", "support"].includes(g.role as string)).length > 0;
  if (u.mfaSecret || (staff && realm.mfaRequiredForStaff)) {
    if (!u.mfaSecret) throw new CampusError("mfa_setup_required", "Staff accounts need two-step sign-in. Ask your tenant admin to enroll you.", 403);
    if (!code) return { needsMfa: true };
    if (!verifyTotp(u.mfaSecret as string, code)) throw new CampusError("bad_code", "That code didn't work.", 401);
  }
  const secret = token(32);
  store.tx(() => {
    store.insert("sessions", { tokenHash: sha256(secret), userId: u.id, mfa: !!u.mfaSecret, expiresAt: new Date(nowMs() + SESSION_HOURS * 3600_000).toISOString() }, "ses");
    store.audit({ actorId: u.id, actorRoles: [], action: "session.create", resource: "session", outcome: "allowed" });
  });
  return { token: secret, needsMfa: false, actor: actorFor(store, u.id, !!u.mfaSecret) };
}

export function resolveSession(store: TenantStore, secret: string | null | undefined): Actor | null {
  if (!secret) return null;
  const s = store.list("sessions", (x) => x.tokenHash === sha256(secret) && !x.revokedAt && String(x.expiresAt) > nowIso())[0];
  if (!s) return null;
  try {
    const real = actorFor(store, s.userId as string, !!s.mfa);
    const mq = s.masqueradeId ? store.get("masquerades", s.masqueradeId as string) : undefined;
    if (mq && !mq.endedAt && String(mq.expiresAt) > nowIso() && real.roles.includes("admin")) {
      // Acting as another user: their permissions, with every audit record stamped with the admin.
      const target = actorFor(store, mq.targetUserId as string, false);
      store.realActorId = real.id;
      return { ...target, masqueradedBy: { id: real.id, name: real.name, expiresAt: String(mq.expiresAt) } };
    }
    return real;
  } catch {
    return null;
  }
}

/** The signed-in person behind a session, ignoring any act-as (used to stop acting). */
export function sessionRow(store: TenantStore, secret: string | null | undefined): Row | undefined {
  if (!secret) return undefined;
  return store.list("sessions", (x) => x.tokenHash === sha256(secret) && !x.revokedAt && String(x.expiresAt) > nowIso())[0];
}

export function signOut(store: TenantStore, secret: string) {
  for (const s of store.list("sessions", (x) => x.tokenHash === sha256(secret))) store.update("sessions", s.id, { revokedAt: nowIso() });
}

/** Test/demo helper: current TOTP code for a seeded secret. */
export const demoTotp = totpNow;

/** Convenience: connect + resolve an actor by user id (jobs, tests). */
export function asUser(ctx: TenantContext, userId: string): { store: TenantStore; actor: Actor } {
  const store = broker.connect(ctx);
  return { store, actor: actorFor(store, userId, true) };
}
