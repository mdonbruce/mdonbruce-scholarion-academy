import { broker, CampusError, nowIso, type Row, type TenantStore } from "../core";
import { actorFor, createUser, hasAny, type Actor } from "../iam";
import { audit, course, requireTenant } from "./common";
import { REPORT_KINDS, runReport } from "./success";
import { sisImport } from "./sis";

/**
 * Account administration (parity §6):
 *  - Account settings: trusted embed domains, named IP filters (CIDR), terms and privacy links,
 *    and self-registration (off / with admin approval), stored in tenant_settings.
 *  - Audit search: by type (grade changes, sign-ins, enrollments, courses…), course, user,
 *    outcome and date; plus a sign-in (authentication) log.
 *  - Themes: an optional logo image and custom CSS that is sanitized and scoped to the campus.
 *  - Background jobs: reports and SIS imports queue, run with progress, and keep an issue list.
 *  - Identity providers: SAML / OIDC / LDAP configuration records. Nothing is connected from
 *    here — every provider stays "not_connected" until a deployment wires it up.
 */

/* ---------------- account settings ---------------- */

export type IpFilter = { name: string; ranges: string[] };
export type AccountSettings = {
  trustedDomains: string[];
  ipFilters: IpFilter[];
  termsUrl: string | null;
  privacyUrl: string | null;
  selfRegistration: "off" | "approval";
  selfRegistrationDomains: string[];
};

const DEFAULTS: AccountSettings = { trustedDomains: [], ipFilters: [], termsUrl: null, privacyUrl: null, selfRegistration: "off", selfRegistrationDomains: [] };
const KEY = "account_settings";
const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function accountSettings(store: TenantStore): AccountSettings {
  const row = store.list("tenant_settings", (x) => x.key === KEY)[0];
  return { ...DEFAULTS, ...((row?.value as Partial<AccountSettings>) ?? {}) };
}

function parseIpv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim().replace(/^::ffff:/, ""));
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function validRange(r: string) {
  const [base, bits] = r.split("/");
  if (parseIpv4(base) === null) return false;
  return bits === undefined || (/^\d{1,2}$/.test(bits) && Number(bits) <= 32);
}

export function ipInRange(ip: string, range: string): boolean {
  const addr = parseIpv4(ip);
  const [base, bitsRaw] = range.split("/");
  const net = parseIpv4(base);
  if (addr === null || net === null) return false;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (addr & mask) >>> 0 === (net & mask) >>> 0;
}

/**
 * Quiz IP restriction. Each entry is "@Filter name" (a named account filter), a CIDR range,
 * or (legacy) an address prefix like "10.1.".
 */
export function ipAllowed(store: TenantStore, entries: string[], ip: string): boolean {
  if (!entries.length) return true;
  if (!ip) return false;
  const named = accountSettings(store).ipFilters;
  return entries.some((e) => {
    if (e.startsWith("@")) return (named.find((f) => f.name.toLowerCase() === e.slice(1).toLowerCase())?.ranges ?? []).some((r) => ipInRange(ip, r));
    if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(e)) return ipInRange(ip, e);
    return ip.startsWith(e);
  });
}

/** Whether an embed URL may render as an iframe: site-relative, or https on a trusted domain (when any are set). */
export function embedAllowed(store: TenantStore, src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const trusted = accountSettings(store).trustedDomains;
  if (!trusted.length) return true;
  const host = u.hostname.toLowerCase();
  return trusted.some((d) => (d.startsWith("*.") ? host === d.slice(2) || host.endsWith(d.slice(1)) : host === d));
}

export function setAccountSettings(store: TenantStore, a: Actor, input: Partial<AccountSettings>) {
  requireTenant(store, a, ["admin"], "tenant.account_settings");
  const cur = accountSettings(store);
  const next: AccountSettings = { ...cur };
  if (input.trustedDomains !== undefined) {
    const list = [...new Set(input.trustedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
    const bad = list.find((d) => !HOST.test(d));
    if (bad) throw new CampusError("invalid", `"${bad}" isn't a domain. Use hosts like video.example.edu or *.example.edu.`, 422);
    if (list.length > 50) throw new CampusError("invalid", "Up to 50 trusted domains.", 422);
    next.trustedDomains = list;
  }
  if (input.ipFilters !== undefined) {
    const filters = input.ipFilters.map((f) => ({ name: String(f.name ?? "").trim().slice(0, 60), ranges: (f.ranges ?? []).map((r) => String(r).trim()).filter(Boolean) }));
    for (const f of filters) {
      if (!f.name) throw new CampusError("invalid", "Every IP filter needs a name.", 422);
      if (!f.ranges.length) throw new CampusError("invalid", `IP filter "${f.name}" has no ranges.`, 422);
      const bad = f.ranges.find((r) => !validRange(r));
      if (bad) throw new CampusError("invalid", `"${bad}" isn't an IPv4 address or CIDR range like 192.168.10.0/24.`, 422);
    }
    if (new Set(filters.map((f) => f.name.toLowerCase())).size !== filters.length) throw new CampusError("invalid", "IP filter names must be unique.", 422);
    next.ipFilters = filters;
  }
  for (const k of ["termsUrl", "privacyUrl"] as const) {
    if (input[k] === undefined) continue;
    const v = input[k] ? String(input[k]).trim() : "";
    if (v && !/^(https:\/\/[^\s]+|\/[^\s]*)$/.test(v)) throw new CampusError("invalid", `${k === "termsUrl" ? "Terms" : "Privacy policy"} link must be https:// or site-relative.`, 422);
    next[k] = v || null;
  }
  if (input.selfRegistration !== undefined) {
    if (!["off", "approval"].includes(input.selfRegistration)) throw new CampusError("invalid", "Self-registration is off or approval.", 422);
    next.selfRegistration = input.selfRegistration;
  }
  if (input.selfRegistrationDomains !== undefined) {
    const list = [...new Set(input.selfRegistrationDomains.map((d) => String(d).trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
    const bad = list.find((d) => !HOST.test(d));
    if (bad) throw new CampusError("invalid", `"${bad}" isn't an email domain.`, 422);
    next.selfRegistrationDomains = list;
  }
  return store.tx(() => {
    const ex = store.list("tenant_settings", (x) => x.key === KEY)[0];
    if (ex) store.update("tenant_settings", ex.id, { value: next });
    else store.insert("tenant_settings", { key: KEY, value: next }, "ts");
    audit(store, a, "tenant.account_settings", "account_settings", Object.keys(input).join(","));
    return next;
  });
}

/** Public: links shown in every footer and on sign-in. */
export function legalLinks(store: TenantStore) {
  const s = accountSettings(store);
  return { termsUrl: s.termsUrl, privacyUrl: s.privacyUrl, selfRegistration: s.selfRegistration !== "off" };
}

/* ---------------- self-registration ---------------- */

export function selfRegister(store: TenantStore, input: { name: string; email: string }) {
  const s = accountSettings(store);
  if (s.selfRegistration === "off") throw new CampusError("closed", "This school doesn't accept self-registration. Ask your administrator for an account.", 403);
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!name || name.length > 120) throw new CampusError("invalid", "Enter your name.", 422);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CampusError("invalid_email", "Enter a valid email address.", 422);
  if (s.selfRegistrationDomains.length && !s.selfRegistrationDomains.includes(email.split("@")[1])) throw new CampusError("domain", `Use an email address at ${s.selfRegistrationDomains.join(" or ")}.`, 422);
  // Same answer whether or not the email exists, so the form can't be used to discover accounts.
  const generic = { received: true, message: "Thanks — an administrator will review your request. You'll get an email when it's decided." };
  if (store.list("users", (u) => u.email === email).length || store.list("self_registrations", (r) => r.email === email && r.state === "pending").length) return generic;
  if (store.list("self_registrations", (r) => r.state === "pending").length >= 500) throw new CampusError("busy", "Too many pending requests. Try again later.", 429);
  store.tx(() => {
    const r = store.insert("self_registrations", { name, email, state: "pending" }, "sreg");
    store.emit("identity.self_registration.requested", `self_registrations/${r.id}`, { email });
  });
  return generic;
}

export function decideSelfRegistration(store: TenantStore, a: Actor, id: string, approve: boolean) {
  requireTenant(store, a, ["admin", "registrar"], "self_registration.decide");
  const r = store.get("self_registrations", id);
  if (!r || r.state !== "pending") throw new CampusError("not_found", "Pending request not found", 404);
  return store.tx(() => {
    let userId: string | null = null;
    if (approve) userId = createUser(store, { name: String(r.name), email: String(r.email), roles: [] }).id;
    const row = store.update("self_registrations", id, { state: approve ? "approved" : "declined", userId, decidedBy: a.id });
    store.emit(`identity.self_registration.${approve ? "approved" : "declined"}`, `self_registrations/${id}`, { email: r.email, userId });
    audit(store, a, "self_registration.decide", `self_registrations/${id}`, approve ? "approved" : "declined");
    return row;
  });
}

/* ---------------- audit search & auth log ---------------- */

export const AUDIT_TYPES = ["all", "grade_change", "auth", "enrollment", "course", "content", "admin", "denied"] as const;
const TYPE_TEST: Record<(typeof AUDIT_TYPES)[number], (action: string, outcome: string) => boolean> = {
  all: () => true,
  grade_change: (x) => /^(grades?|grading|gradebook|submissions?\.grade|quiz\.(regrade|grade)|attempts?\.grade)/.test(x) || x.includes("grade"),
  auth: (x) => /^(session|mfa|login|password|sso|masquerade|act_as|self_registration)/.test(x),
  enrollment: (x) => /^(enroll|registration|sis\.)/.test(x),
  course: (x) => /^(course|section|term|blueprint)/.test(x),
  content: (x) => /^(pages?|modules?|files?|assignments?|quiz|discussion|announcement|content)/.test(x),
  admin: (x) => /^(tenant|role_grant|custom_role|permission|admin|account)/.test(x),
  denied: (_x, o) => o === "denied",
};

export function auditSearch(store: TenantStore, a: Actor, q: { type?: string; courseId?: string; userId?: string; outcome?: string; from?: string; to?: string; text?: string; limit?: number }) {
  requireTenant(store, a, ["admin"], "audit.read");
  const type = (AUDIT_TYPES as readonly string[]).includes(q.type ?? "all") ? ((q.type ?? "all") as (typeof AUDIT_TYPES)[number]) : "all";
  const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 1000);
  const courseOf = (resource: string) => {
    if (!q.courseId) return true;
    if (resource.includes(q.courseId)) return true;
    const [table, id] = resource.split("/");
    if (!table || !id) return false;
    try {
      const row = store.get(table, id);
      return !!row && (row.courseId === q.courseId || row.id === q.courseId);
    } catch {
      return false;
    }
  };
  const all = store.auditLog(100_000);
  const rows = all.filter((r) => TYPE_TEST[type](r.action, r.outcome) && (!q.userId || r.actorId === q.userId || r.realActorId === q.userId || r.resource.includes(q.userId)) && (!q.outcome || r.outcome === q.outcome) && (!q.from || r.at >= q.from) && (!q.to || r.at <= `${q.to}￿`) && (!q.text || `${r.action} ${r.resource} ${r.reason ?? ""}`.toLowerCase().includes(q.text.toLowerCase())) && courseOf(r.resource));
  const names = new Map<string, string>();
  const nameOf = (id: string) => {
    if (!names.has(id)) names.set(id, String(store.get("users", id)?.name ?? id));
    return names.get(id)!;
  };
  return { type, total: rows.length, rows: rows.slice(0, limit).map((r) => ({ ...r, actorName: nameOf(r.actorId), realActorName: r.realActorId ? nameOf(r.realActorId) : undefined })) };
}

export function auditSearchCsv(store: TenantStore, a: Actor, q: Parameters<typeof auditSearch>[2]) {
  const r = auditSearch(store, a, { ...q, limit: 1000 });
  const c = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${["at", "actor", "acting_as_for", "action", "resource", "outcome", "reason", "trace_id"].join(",")}\n${r.rows.map((x) => [x.at, x.actorName, x.realActorName ?? "", x.action, x.resource, x.outcome, x.reason ?? "", x.traceId].map(c).join(",")).join("\n")}\n`;
}

/** Sign-in log: successes and failures, newest first, with a per-user summary. */
export function authLog(store: TenantStore, a: Actor, q: { userId?: string; limit?: number } = {}) {
  const r = auditSearch(store, a, { type: "auth", userId: q.userId, limit: q.limit ?? 300 });
  const failures24h = store.list("login_failures", (f) => String(f.createdAt) > new Date(Date.now() - 86_400_000).toISOString()).length;
  return { total: r.total, failures24h, rows: r.rows.map((x) => ({ at: x.at, who: x.actorName, action: x.action, outcome: x.outcome, reason: x.reason ?? "" })) };
}

/* ---------------- themes: logo image + sandboxed CSS ---------------- */

const CSS_BANNED = [/@/, /url\s*\(/i, /expression\s*\(/i, /javascript:/i, /behavior\s*:/i, /-moz-binding/i, /</, /\\/, /\bcontent\s*:/i, /position\s*:\s*fixed/i, /\bimport\b/i];

/**
 * Accepts plain `selector { property: value; }` rules only. Every selector is scoped under
 * `.campus-custom` so school CSS can restyle the campus but can't escape it, load resources,
 * inject text, or cover the screen.
 */
export function sanitizeCss(css: string): string {
  const src = String(css ?? "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!src) return "";
  if (src.length > 20_000) throw new CampusError("invalid", "Custom CSS can be up to 20,000 characters.", 422);
  const hit = CSS_BANNED.find((re) => re.test(src));
  if (hit) throw new CampusError("css_blocked", "Custom CSS can't use @-rules, url(), imports, content:, fixed positioning, escapes or markup.", 422);
  const rules: string[] = [];
  let rest = src;
  const re = /^\s*([^{}]+)\{([^{}]*)\}/;
  while (rest.trim()) {
    const m = re.exec(rest);
    if (!m) throw new CampusError("css_invalid", "Custom CSS must be plain rules like `.card { border-radius: 12px; }`.", 422);
    const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (!selectors.length || selectors.some((s) => /^(html|body|:root)\b/i.test(s))) throw new CampusError("css_invalid", "Selectors are scoped to the campus; html, body and :root aren't allowed.", 422);
    const decls = m[2].split(";").map((d) => d.trim()).filter(Boolean);
    for (const d of decls) if (!/^-?[a-z-]+\s*:\s*[^:;]+$/i.test(d)) throw new CampusError("css_invalid", `Declaration "${d.slice(0, 40)}" isn't property: value.`, 422);
    rules.push(`${selectors.map((s) => `.campus-custom ${s}`).join(", ")} { ${decls.join("; ")}; }`);
    rest = rest.slice(m[0].length);
  }
  return rules.join("\n");
}

export function setThemeExtras(store: TenantStore, a: Actor, input: { logoUrl?: string; customCss?: string }) {
  requireTenant(store, a, ["admin"], "tenant.theme");
  const t = broker.tenant(store.tenantId)!;
  const theme = { ...t.theme } as typeof t.theme & { logoUrl?: string | null; customCss?: string | null };
  if (input.logoUrl !== undefined) {
    const v = input.logoUrl.trim();
    if (v && !/^(https:\/\/[^\s"'<>]+|\/campus\/[^\s"'<>]+|\/api\/campus\/[^\s"'<>]+)$/.test(v)) throw new CampusError("invalid", "Logo must be an https:// image or a campus file link.", 422);
    theme.logoUrl = v || null;
  }
  if (input.customCss !== undefined) theme.customCss = sanitizeCss(input.customCss) || null;
  broker.updateTenant(store.tenantId, { theme });
  audit(store, a, "tenant.theme", "theme", Object.keys(input).join(","));
  return theme;
}

/* ---------------- background jobs ---------------- */

export const JOB_KINDS = ["report", "sis_import"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export function enqueueJob(store: TenantStore, a: Actor, kind: JobKind, params: Record<string, unknown>) {
  if (!JOB_KINDS.includes(kind)) throw new CampusError("invalid", "Unknown job kind", 422);
  requireTenant(store, a, ["admin", "registrar"], `jobs.${kind}`);
  if (kind === "report" && !(REPORT_KINDS as readonly string[]).includes(String(params.kind))) throw new CampusError("invalid", `Report must be one of ${REPORT_KINDS.join(", ")}.`, 422);
  if (kind === "sis_import" && (!params.kind || typeof params.csv !== "string")) throw new CampusError("invalid", "SIS import needs kind and csv.", 422);
  return store.tx(() => {
    const j = store.insert("async_jobs", { kind, params, state: "queued", progress: 0, issues: [], requestedBy: a.id }, "job");
    audit(store, a, "jobs.enqueue", `async_jobs/${j.id}`, kind);
    return j;
  });
}

/** Run queued jobs (the scheduler calls this; status checks also drain the queue so nothing waits forever). */
export function runQueuedJobs(store: TenantStore, max = 5) {
  const queued = store.list("async_jobs", (j) => j.state === "queued").sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt))).slice(0, max);
  const done: Row[] = [];
  for (const j of queued) {
    store.tx(() => store.update("async_jobs", j.id, { state: "running", progress: 10, startedAt: nowIso() }));
    const requester = store.get("users", String(j.requestedBy));
    try {
      if (!requester) throw new Error("The person who queued this job no longer exists.");
      const actor = actorFor(store, requester.id, true);
      const p = (j.params as Record<string, unknown>) ?? {};
      let resultRef = "";
      let issues: unknown[] = [];
      if (j.kind === "report") {
        const run = runReport(store, actor, p.kind as never);
        resultRef = `report_runs/${run.id}`;
      } else {
        store.tx(() => store.update("async_jobs", j.id, { progress: 50 }));
        const imp = sisImport(store, actor, p.kind as never, String(p.csv), !!p.diffing);
        resultRef = `sis_imports/${imp.id}`;
        issues = (imp.errors as unknown[]) ?? [];
      }
      done.push(store.tx(() => store.update("async_jobs", j.id, { state: issues.length ? "completed_with_errors" : "completed", progress: 100, resultRef, issues, finishedAt: nowIso(), params: j.kind === "sis_import" ? { ...p, csv: `[${String(p.csv).length} characters]` } : p })));
    } catch (e) {
      done.push(store.tx(() => store.update("async_jobs", j.id, { state: "failed", progress: 100, issues: [{ message: (e as Error).message }], finishedAt: nowIso() })));
    }
  }
  return done;
}

export function jobStatus(store: TenantStore, a: Actor, jobId?: string) {
  requireTenant(store, a, ["admin", "registrar"], "jobs.read");
  runQueuedJobs(store);
  const view = (j: Row) => ({ id: j.id, kind: String(j.kind), detail: String((j.params as Record<string, unknown>)?.kind ?? ""), state: String(j.state), progress: Number(j.progress ?? 0), resultRef: (j.resultRef as string) || null, issues: (j.issues as unknown[]) ?? [], requestedAt: String(j.createdAt), finishedAt: (j.finishedAt as string) ?? null });
  if (jobId) {
    const j = store.get("async_jobs", jobId);
    if (!j) throw new CampusError("not_found", "Job not found", 404);
    return [view(j)];
  }
  return store.list("async_jobs").sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 50).map(view);
}

/* ---------------- identity providers ---------------- */

const IDP_FIELDS: Record<string, string[]> = { saml: ["entityId", "ssoUrl", "metadataUrl", "certificateFingerprint", "nameIdFormat"], oidc: ["issuer", "clientId", "authorizationEndpoint", "tokenEndpoint", "scopes"], ldap: ["host", "port", "baseDn", "userFilter", "useTls"] };

export function configureIdp(store: TenantStore, a: Actor, input: { kind: string; name: string; config: Record<string, unknown>; jitProvisioning?: boolean; id?: string }) {
  requireTenant(store, a, ["admin"], "identity_providers.configure");
  const fields = IDP_FIELDS[input.kind];
  if (!fields) throw new CampusError("invalid", "Kind must be saml, oidc or ldap.", 422);
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) throw new CampusError("invalid", "Name the provider.", 422);
  const raw = input.config ?? {};
  if (Object.keys(raw).some((k) => /secret|password|private/i.test(k))) throw new CampusError("no_secrets", "Don't store secrets here. Client secrets and bind passwords belong in the deployment's secret manager.", 422);
  const config: Record<string, unknown> = {};
  for (const k of fields) if (raw[k] !== undefined && raw[k] !== "") config[k] = raw[k];
  for (const k of ["ssoUrl", "metadataUrl", "issuer", "authorizationEndpoint", "tokenEndpoint"]) if (config[k] !== undefined && !/^https:\/\//.test(String(config[k]))) throw new CampusError("invalid", `${k} must be an https:// address.`, 422);
  if (input.kind === "ldap" && config.useTls === false) throw new CampusError("invalid", "LDAP must use TLS (ldaps or StartTLS).", 422);
  return store.tx(() => {
    const vals = { kind: input.kind, name, config, state: "not_connected", jitProvisioning: !!input.jitProvisioning };
    const row = input.id ? store.update("identity_providers", input.id, vals) : store.insert("identity_providers", vals, "idp");
    audit(store, a, "identity_providers.configure", `identity_providers/${row.id}`, input.kind);
    return row;
  });
}

/** Configuration check only — there is no live connection from this environment. */
export function testIdp(store: TenantStore, a: Actor, id: string) {
  requireTenant(store, a, ["admin"], "identity_providers.test");
  const idp = store.get("identity_providers", id);
  if (!idp) throw new CampusError("not_found", "Provider not found", 404);
  const need = { saml: ["entityId", "ssoUrl"], oidc: ["issuer", "clientId"], ldap: ["host", "baseDn"] }[String(idp.kind) as "saml"] ?? [];
  const missing = need.filter((k) => !(idp.config as Record<string, unknown>)?.[k]);
  const result = { at: nowIso(), configComplete: !missing.length, missing, connected: false, note: "Not connected in this environment. Sign-in still uses campus passwords and MFA." };
  store.tx(() => store.update("identity_providers", id, { lastTest: result }));
  return result;
}

/** Sub-account admin helper for the admin screen: who administers which account. */
export function accountAdmins(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "role_grant.read");
  return store.list("role_grants", (g) => g.scope === "account" && !g.revokedAt).map((g) => ({ id: g.id, user: String(store.get("users", String(g.userId))?.name ?? g.userId), userId: String(g.userId), accountId: String(g.accountId), account: String(store.get("accounts", String(g.accountId))?.name ?? g.accountId), expiresAt: (g.expiresAt as string) ?? null }));
}

/** True when this actor administers the course only through a sub-account grant. */
export function isSubAccountAdmin(a: Actor, store: TenantStore, courseId: string) {
  return !!a.accountAdminOf?.length && !a.roles.includes("admin") && hasAny(a, ["admin"], courseId) && !!course(store, courseId);
}
