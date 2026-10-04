import { promises as dns } from "node:dns";
import { broker, CampusError, hmac, metrics, nowIso, nowMs, sha256, token, type Role, type Row, type Tenant, type TenantData, type TenantStore } from "../core";
import { actorFor, effectiveRoles, hasAny, sessionRow, type Actor } from "../iam";
import { accountChain } from "../permissions";
import { audit, requireTenant } from "./common";

/**
 * Tenant admin console (Tab 25), tenant lifecycle and Operations (Tab 28):
 * provisioning, suspension, export, backups and restore drills into validation tenants,
 * domain verification, themes, flags, feature options with inheritance and locks,
 * global announcements, act-as (masquerade), QR login and help links.
 */

const signingKey = () => process.env.CAMPUS_SIGNING_KEY || "local-dev-campus-signing-key";

function requireOperator(a: Actor) {
  if (!a.platformOperator) throw new CampusError("forbidden", "Platform operators only.", 403);
}

/* ---------------- Tenant lifecycle (platform operators) ---------------- */

export function exportTenant(tenantId: string): { tenant: Tenant; data: TenantData; checksum: string; rows: number; exportedAt: string } {
  const t = broker.tenant(tenantId);
  if (!t) throw new CampusError("not_found", "Tenant not found", 404);
  const data = JSON.parse(JSON.stringify(broker.rawData(t.id))) as TenantData;
  const body = JSON.stringify(data.tables);
  const rows = Object.values(data.tables).reduce((s, tb) => s + Object.keys(tb).length, 0);
  return { tenant: t, data, checksum: sha256(body), rows, exportedAt: nowIso() };
}

const BACKUPS = new Map<string, TenantData>();

export function backupTenant(a: Actor | null, tenantId: string) {
  if (a) requireOperator(a);
  const ex = exportTenant(tenantId);
  const id = `bk_${token(6)}`;
  BACKUPS.set(id, ex.data);
  const rec = { id, tenantId, at: ex.exportedAt, checksum: ex.checksum, rows: ex.rows };
  broker.platform().backups.push(rec);
  metrics.inc("backups_total", { tenant: ex.tenant.slug });
  return rec;
}

/**
 * Restore drill: restore a backup into a fresh VALIDATION tenant (never over the live
 * tenant), verify checksum and row counts, and report. Validation tenants can't be
 * reached by path and are dropped after the drill unless kept.
 */
export function restoreDrill(a: Actor | null, backupId: string, opts: { keep?: boolean } = {}) {
  if (a) requireOperator(a);
  const rec = broker.platform().backups.find((b) => b.id === backupId);
  const data = BACKUPS.get(backupId);
  if (!rec || !data) throw new CampusError("not_found", "Backup not found", 404);
  const src = broker.tenant(rec.tenantId)!;
  const started = nowMs();
  const vid = `${src.id}-validation-${token(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const v = broker.provision({ id: vid, slug: vid, name: `${src.name} (restore drill)`, kind: "validation", domains: [], realm: src.realm, theme: src.theme, flags: {}, restoredFrom: { tenantId: src.id, snapshotAt: rec.at } });
  broker.installData(v.id, JSON.parse(JSON.stringify(data)));
  const restored = broker.rawData(v.id);
  const checksum = sha256(JSON.stringify(restored.tables));
  const rows = Object.values(restored.tables).reduce((s, tb) => s + Object.keys(tb).length, 0);
  const tables = Object.keys(data.tables).map((name) => ({ name, expected: Object.keys(data.tables[name]).length, restored: Object.keys(restored.tables[name] ?? {}).length }));
  const ok = checksum === rec.checksum && rows === rec.rows && tables.every((t) => t.expected === t.restored);
  const report = { backupId, sourceTenant: src.id, validationTenant: v.id, checksumMatches: checksum === rec.checksum, rows, expectedRows: rec.rows, tables, ok, seconds: Math.round((nowMs() - started) / 100) / 10, at: nowIso() };
  if (!opts.keep) broker.dropValidationTenant(v.id);
  metrics.inc("restore_drills_total", { ok: String(ok) });
  return report;
}

export function setTenantStatus(a: Actor, tenantId: string, status: "active" | "suspended") {
  requireOperator(a);
  const t = broker.setStatus(tenantId, status);
  metrics.inc("tenant_status_changes_total", { status });
  return t;
}

/* ---------------- Domains ---------------- */

export function domainChallenge(tenantId: string, host: string) {
  return `scholarion-verify=${hmac(signingKey(), `${tenantId}:${host.toLowerCase()}`).slice(0, 32)}`;
}

export function addDomain(store: TenantStore, a: Actor, host: string) {
  requireTenant(store, a, ["admin"], "tenant.domain.add");
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) throw new CampusError("invalid", "Enter a host name like learn.example.edu.", 422);
  if (broker.tenants().some((t) => t.domains.some((d) => d.host === h))) throw new CampusError("conflict", "That host is already registered.", 409);
  const t = broker.tenant(store.tenantId)!;
  broker.updateTenant(t.id, { domains: [...t.domains, { host: h, verified: false }] });
  audit(store, a, "tenant.domain.add", `domains/${h}`);
  return { host: h, txtRecord: `_scholarion.${h}`, value: domainChallenge(t.id, h), note: "Add this TXT record, then press Verify. Until verified the host does not resolve to your school." };
}

export type TxtResolver = (name: string) => Promise<string[][]>;

/** Verify ownership via DNS TXT. Only verified hosts resolve to a tenant. */
export async function verifyDomain(store: TenantStore, a: Actor, host: string, resolver: TxtResolver = (n) => dns.resolveTxt(n)) {
  requireTenant(store, a, ["admin"], "tenant.domain.verify");
  const t = broker.tenant(store.tenantId)!;
  const h = host.trim().toLowerCase();
  const d = t.domains.find((x) => x.host === h);
  if (!d) throw new CampusError("not_found", "Add the host first.", 404);
  let records: string[][] = [];
  try {
    records = await resolver(`_scholarion.${h}`);
  } catch {
    records = [];
  }
  const ok = records.some((r) => r.join("") === domainChallenge(t.id, h));
  if (ok) broker.updateTenant(t.id, { domains: t.domains.map((x) => (x.host === h ? { ...x, verified: true } : x)) });
  audit(store, a, ok ? "tenant.domain.verified" : "tenant.domain.verify_failed", `domains/${h}`);
  return { host: h, verified: ok, message: ok ? "Verified. This host now opens your school." : "The TXT record wasn't found yet. DNS can take a while — try again later." };
}

/* ---------------- Theme & flags ---------------- */

function luminance(hex: string) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Branding is checked for WCAG AA contrast before it's saved. */
export function setTheme(store: TenantStore, a: Actor, theme: { primary: string; accent: string; logoText: string }) {
  requireTenant(store, a, ["admin"], "tenant.theme");
  for (const k of ["primary", "accent"] as const) if (!/^#[0-9a-fA-F]{6}$/.test(theme[k])) throw new CampusError("invalid", `${k} must be a hex color like #1f4e79.`, 422);
  const ratio = contrast(theme.primary, "#ffffff");
  if (ratio < 4.5) throw new CampusError("contrast", `White text on ${theme.primary} has contrast ${ratio}:1 — it must be at least 4.5:1.`, 422, { ratio });
  const logoText = theme.logoText.trim().slice(0, 40);
  if (!logoText) throw new CampusError("invalid", "Logo text is required.", 422);
  const t = broker.updateTenant(store.tenantId, { theme: { primary: theme.primary, accent: theme.accent, logoText } });
  audit(store, a, "tenant.theme", "theme");
  return t.theme;
}

export const TENANT_FLAGS = ["live_connectors", "marketplace", "ai_course_assistant", "offline_mode", "sms_channel"];
export function setTenantFlag(store: TenantStore, a: Actor, flag: string, on: boolean) {
  requireTenant(store, a, ["admin"], "tenant.flags");
  if (!TENANT_FLAGS.includes(flag)) throw new CampusError("invalid", "Unknown flag", 422);
  const t = broker.tenant(store.tenantId)!;
  broker.updateTenant(t.id, { flags: { ...t.flags, [flag]: on } });
  audit(store, a, on ? "tenant.flag.on" : "tenant.flag.off", `flags/${flag}`);
  return broker.tenant(t.id)!.flags;
}

/* ---------------- Feature options (inherit root → sub-account → course; locks) ---------------- */

export const FEATURE_DEFAULTS: Record<string, boolean> = { course_pacing: false, mastery_paths: true, faculty_journal: false, sms_notifications: false, student_annotation: true, podcast_feeds: false };

export function resolveFeature(store: TenantStore, key: string, opts: { accountId?: string | null; courseId?: string | null } = {}) {
  if (!(key in FEATURE_DEFAULTS)) throw new CampusError("invalid", "Unknown feature", 422);
  const courseAccount = opts.courseId ? ((store.get("courses", opts.courseId)?.accountId as string) ?? null) : null;
  const chain = accountChain(store, opts.accountId ?? courseAccount);
  let enabled = FEATURE_DEFAULTS[key];
  let source = "default";
  let lockedAt: string | undefined;
  for (const acc of chain) {
    const o = store.list("feature_options", (x) => x.key === key && x.accountId === acc && !x.courseId)[0];
    if (!o) continue;
    enabled = !!o.enabled;
    source = `account:${acc}`;
    if (o.locked) {
      lockedAt = acc;
      return { key, enabled, source, lockedAt };
    }
  }
  if (opts.courseId) {
    const o = store.list("feature_options", (x) => x.key === key && x.courseId === opts.courseId)[0];
    if (o) {
      enabled = !!o.enabled;
      source = `course:${opts.courseId}`;
    }
  }
  return { key, enabled, source, lockedAt };
}

export function setFeature(store: TenantStore, a: Actor, input: { key: string; accountId?: string; courseId?: string; enabled: boolean; locked?: boolean }) {
  if (input.courseId) {
    if (!hasAny(a, ["admin", "instructor", "designer"], input.courseId)) throw new CampusError("forbidden", "Only course staff can change course features.", 403);
  } else requireTenant(store, a, ["admin"], "feature_options.set");
  const current = resolveFeature(store, input.key, { accountId: input.accountId, courseId: input.courseId });
  if (current.lockedAt && current.lockedAt !== input.accountId) {
    store.audit({ actorId: a.id, actorRoles: effectiveRoles(a, input.courseId), action: "feature_options.set", resource: `features/${input.key}`, outcome: "denied", reason: "locked" });
    throw new CampusError("feature_locked", "This feature is locked by a parent account.", 409, { lockedAt: current.lockedAt });
  }
  return store.tx(() => {
    const ex = store.list("feature_options", (x) => x.key === input.key && (input.courseId ? x.courseId === input.courseId : x.accountId === (input.accountId ?? null) && !x.courseId))[0];
    const vals = { key: input.key, accountId: input.courseId ? null : (input.accountId ?? null), courseId: input.courseId ?? null, enabled: input.enabled, locked: input.courseId ? false : !!input.locked };
    const row = ex ? store.update("feature_options", ex.id, vals) : store.insert("feature_options", vals, "fo");
    audit(store, a, "feature_options.set", `features/${input.key}`, `${input.enabled ? "on" : "off"}${input.locked ? " locked" : ""}`);
    return row;
  });
}

export function featureMatrix(store: TenantStore, opts: { accountId?: string; courseId?: string } = {}) {
  return Object.keys(FEATURE_DEFAULTS).map((k) => resolveFeature(store, k, opts));
}

/* ---------------- Global announcements ---------------- */

export function activeGlobalAnnouncements(store: TenantStore, a: Actor) {
  const now = nowIso();
  const mine = effectiveRoles(a);
  return store
    .list("global_announcements", (g) => String(g.startsAt) <= now && String(g.endsAt) >= now)
    .filter((g) => !((g.roles as string[]) ?? []).length || ((g.roles as string[]) ?? []).some((r) => mine.includes(r as Role)))
    .filter((g) => !((g.dismissedBy as string[]) ?? []).includes(a.id))
    .map((g) => ({ id: g.id, title: g.title, body: g.body }));
}

export function dismissGlobalAnnouncement(store: TenantStore, a: Actor, id: string) {
  const g = store.get("global_announcements", id);
  if (!g) throw new CampusError("not_found", "Announcement not found", 404);
  return store.tx(() => store.update("global_announcements", id, { dismissedBy: [...new Set([...((g.dismissedBy as string[]) ?? []), a.id])] }));
}

/* ---------------- Act as (masquerade) ---------------- */

export function startMasquerade(store: TenantStore, a: Actor, sessionSecret: string, targetUserId: string, reason: string) {
  if (a.masqueradedBy) throw new CampusError("conflict", "Stop acting as the current user first.", 409);
  const s = sessionRow(store, sessionSecret);
  if (!s) throw new CampusError("unauthenticated", "Please sign in.", 401);
  // Student View: course staff may act as their course's test student (no other user), no MFA needed.
  const tsu = store.get("users", targetUserId);
  if (tsu?.testStudentOf && hasAny(a, ["admin", "instructor", "designer", "ta"], String(tsu.testStudentOf))) {
    return store.tx(() => {
      const m = store.insert("masquerades", { adminId: a.id, targetUserId, reason: "Student View", studentView: true, expiresAt: new Date(nowMs() + 60 * 60_000).toISOString(), endedAt: null }, "mq");
      store.update("sessions", s.id, { masqueradeId: m.id });
      audit(store, a, "masquerade.student_view", `users/${targetUserId}`, `course ${String(tsu.testStudentOf)}`);
      return { masqueradeId: m.id, actingAs: String(tsu.name), expiresAt: m.expiresAt };
    });
  }
  const perm = hasAny(a, ["admin"]);
  if (!perm || !a.mfa) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "masquerade.start", resource: `users/${targetUserId}`, outcome: "denied", reason: perm ? "mfa" : "role" });
    throw new CampusError("forbidden", "Only admins who signed in with two-step verification can act as another user.", 403);
  }
  if (targetUserId === a.id) throw new CampusError("invalid", "You can't act as yourself.", 422);
  const target = actorFor(store, targetUserId);
  if (target.roles.includes("admin") || target.platformOperator) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "masquerade.start", resource: `users/${targetUserId}`, outcome: "denied", reason: "target_admin" });
    throw new CampusError("forbidden", "You can't act as another admin.", 403);
  }
  if (reason.trim().length < 5) throw new CampusError("invalid", "Give a reason (it goes in the audit log).", 422);
  return store.tx(() => {
    const m = store.insert("masquerades", { adminId: a.id, targetUserId, reason: reason.trim(), expiresAt: new Date(nowMs() + 60 * 60_000).toISOString(), endedAt: null }, "mq");
    store.update("sessions", s.id, { masqueradeId: m.id });
    audit(store, a, "masquerade.start", `users/${targetUserId}`, reason.trim());
    return { masqueradeId: m.id, actingAs: target.name, expiresAt: m.expiresAt };
  });
}

export function stopMasquerade(store: TenantStore, sessionSecret: string) {
  const s = sessionRow(store, sessionSecret);
  if (!s?.masqueradeId) return { stopped: false };
  return store.tx(() => {
    const m = store.update("masquerades", s.masqueradeId as string, { endedAt: nowIso() });
    store.update("sessions", s.id, { masqueradeId: null });
    store.audit({ actorId: s.userId as string, actorRoles: m.studentView ? [] : ["admin"], action: "masquerade.stop", resource: `users/${m.targetUserId}`, outcome: "allowed" });
    return { stopped: true };
  });
}

/* ---------------- QR login (mobile) ---------------- */

export function createQrLogin(store: TenantStore, a: Actor) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "QR login isn't available while acting as someone else.", 403);
  const code = token(16);
  return store.tx(() => {
    for (const q of store.list("qr_logins", (x) => x.userId === a.id && !x.usedAt)) store.update("qr_logins", q.id, { usedAt: "superseded" });
    const q = store.insert("qr_logins", { userId: a.id, codeHash: sha256(code), expiresAt: new Date(nowMs() + 10 * 60_000).toISOString(), usedAt: null }, "qr");
    audit(store, a, "qr_login.create", `qr_logins/${q.id}`);
    return { code, expiresAt: q.expiresAt, payload: `scholarion-login:${broker.tenant(store.tenantId)!.slug}:${code}` };
  });
}

/** Redeem on the mobile app: single use, ten minutes. Returns a new session secret. */
export function redeemQrLogin(store: TenantStore, code: string) {
  const q = store.list("qr_logins", (x) => x.codeHash === sha256(code))[0];
  if (!q || q.usedAt || String(q.expiresAt) < nowIso()) throw new CampusError("invalid_code", "This code has expired or was already used. Make a new one.", 401);
  const secret = token(32);
  store.tx(() => {
    store.update("qr_logins", q.id, { usedAt: nowIso() });
    store.insert("sessions", { tokenHash: sha256(secret), userId: q.userId, mfa: false, via: "qr", expiresAt: new Date(nowMs() + 12 * 3600_000).toISOString() }, "ses");
    store.audit({ actorId: q.userId as string, actorRoles: [], action: "session.create", resource: "session", outcome: "allowed", reason: "qr_login" });
  });
  return { token: secret };
}

/* ---------------- Help links & custom roles ---------------- */

const DEFAULT_HELP = [
  { label: "Help desk", href: "/campus/{tenant}/helpdesk" },
  { label: "Knowledge base", href: "/campus/{tenant}/helpdesk?tab=kb" },
  { label: "Accessibility", href: "/accessibility" },
];
export function helpLinks(store: TenantStore) {
  const row = store.list("tenant_settings", (x) => x.key === "help_links")[0];
  return (row?.value as { label: string; href: string }[]) ?? DEFAULT_HELP;
}
export function setHelpLinks(store: TenantStore, a: Actor, links: { label: string; href: string }[]) {
  requireTenant(store, a, ["admin"], "tenant.help_links");
  if (links.length > 10 || links.some((l) => !l.label?.trim() || !/^(https:\/\/|\/)/.test(l.href ?? ""))) throw new CampusError("invalid", "Up to 10 links, each with a label and an https:// or site-relative address.", 422);
  return store.tx(() => {
    const ex = store.list("tenant_settings", (x) => x.key === "help_links")[0];
    const value = links.map((l) => ({ label: l.label.trim().slice(0, 60), href: l.href.trim() }));
    audit(store, a, "tenant.help_links", "help_links");
    return ex ? store.update("tenant_settings", ex.id, { value }) : store.insert("tenant_settings", { key: "help_links", value }, "ts");
  });
}

/** Assign a custom role: the user gets the base role plus the custom role's matrix overrides. */
export function grantCustomRole(store: TenantStore, a: Actor, userId: string, customRoleKey: string) {
  requireTenant(store, a, ["admin"], "custom_roles.grant");
  const cr = store.list("custom_roles", (x) => x.key === customRoleKey)[0];
  if (!cr) throw new CampusError("not_found", "Custom role not found", 404);
  if (!store.get("users", userId)) throw new CampusError("not_found", "User not found", 404);
  return store.tx(() => {
    const g = store.insert("role_grants", { userId, role: cr.baseRole, customRole: cr.key, scope: "tenant", grantedBy: a.id }, "rg");
    audit(store, a, "custom_roles.grant", `users/${userId}`, String(cr.key));
    return g;
  });
}

/** Admin console overview numbers. */
export function adminOverview(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "admin.overview");
  const t = broker.tenant(store.tenantId)!;
  const count = (table: string, f?: (r: Row) => boolean) => store.list(table, f).length;
  return {
    tenant: { id: t.id, name: t.name, kind: t.kind, status: t.status, domains: t.domains, theme: t.theme, flags: t.flags, realm: t.realm },
    counts: { users: count("users"), courses: count("courses"), publishedCourses: count("courses", (c) => c.state === "published"), accounts: count("accounts"), activeEnrollments: count("enrollments", (e) => e.state === "active") },
    outbox: { pending: store.outbox().filter((e) => e.status === "pending").length, dead: store.outbox().filter((e) => e.status === "dead").length },
    masquerades: store.list("masquerades").slice(-10).reverse(),
    features: featureMatrix(store),
    helpLinks: helpLinks(store),
  };
}
