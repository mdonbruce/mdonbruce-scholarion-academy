import { timingSafeEqual } from "node:crypto";
import { broker, CampusError, hmac, metrics, nowIso, nowMs, registerConsumer, sha256, token, type OutboxEvent, type Row, type TenantStore } from "../core";
import { actorFor, type Actor } from "../iam";
import { audit, requireTenant } from "./common";
import { zip } from "./files";
import { csv, parseCsv, sisImport } from "./sis";

/**
 * Integration (Tab 9) and Developer (Tab 38): OneRoster 1.2 CSV in/out, signed webhooks
 * with retry, dead-letter and replay, developer keys, OAuth2 (authorization code +
 * refresh), personal access tokens, scopes and per-key rate limits.
 */

const signingKey = () => process.env.CAMPUS_SIGNING_KEY || "local-dev-campus-signing-key";

/* ---------------- OneRoster 1.2 (CSV binding) ---------------- */

export function oneRosterExport(store: TenantStore, a: Actor): { files: Record<string, string>; zip: Buffer } {
  requireTenant(store, a, ["admin", "registrar"], "oneroster.export");
  const t = broker.tenant(store.tenantId)!;
  const ts = nowIso();
  const users = store.list("users").map((u) => {
    const grants = store.list("role_grants", (g) => g.userId === u.id).map((g) => g.role as string);
    const role = grants.includes("admin") ? "administrator" : store.list("enrollments", (e) => e.userId === u.id && (e.role === "instructor" || e.role === "ta")).length ? "teacher" : "student";
    const [given, ...rest] = String(u.name).split(" ");
    return { sourcedId: u.sisId ?? u.id, status: u.status === "suspended" ? "tobedeleted" : "active", dateLastModified: u.updatedAt, enabledUser: u.status !== "suspended", orgSourcedIds: t.id, role, username: u.email, userIds: "", givenName: given, familyName: rest.join(" "), middleName: "", identifier: "", email: u.email, sms: "", phone: "", agentSourcedIds: "", grades: "", password: "" };
  });
  const files: Record<string, string> = {
    "manifest.csv": csv([
      { propertyName: "manifest.version", value: "1.0" },
      { propertyName: "oneroster.version", value: "1.2" },
      ...["orgs", "academicSessions", "courses", "classes", "users", "enrollments"].map((f) => ({ propertyName: `file.${f}`, value: "bulk" })),
    ]),
    "orgs.csv": csv([{ sourcedId: t.id, status: "active", dateLastModified: ts, name: t.name, type: "school", identifier: t.slug, parentSourcedId: "" }]),
    "academicSessions.csv": csv(store.list("terms").map((x) => ({ sourcedId: x.sisId ?? x.id, status: "active", dateLastModified: x.updatedAt, title: x.name, type: "term", startDate: String(x.startsAt).slice(0, 10), endDate: String(x.endsAt).slice(0, 10), parentSourcedId: "", schoolYear: String(x.startsAt).slice(0, 4) }))),
    "courses.csv": csv(store.list("courses").map((c) => ({ sourcedId: c.sisId ?? c.id, status: "active", dateLastModified: c.updatedAt, schoolYearSourcedId: "", title: c.title, courseCode: c.code, grades: "", orgSourcedId: t.id, subjects: "", subjectCodes: "" }))),
    "classes.csv": csv(store.list("sections").map((s) => {
      const c = store.get("courses", s.courseId as string);
      const term = store.get("terms", s.termId as string);
      return { sourcedId: s.sisId ?? s.id, status: "active", dateLastModified: s.updatedAt, title: `${c?.code ?? ""} ${s.code}`.trim(), grades: "", courseSourcedId: c?.sisId ?? c?.id ?? "", classCode: s.code, classType: "scheduled", location: "", schoolSourcedId: t.id, termSourcedIds: term?.sisId ?? term?.id ?? "", subjects: "", subjectCodes: "", periods: "" };
    })),
    "users.csv": csv(users),
    "enrollments.csv": csv(store.list("enrollments", (e) => !!e.sectionId && e.state === "active").map((e) => {
      const u = store.get("users", e.userId as string);
      const s = store.get("sections", e.sectionId as string);
      return { sourcedId: e.id, status: "active", dateLastModified: e.updatedAt, classSourcedId: s?.sisId ?? s?.id ?? "", schoolSourcedId: t.id, userSourcedId: u?.sisId ?? u?.id ?? "", role: e.role === "instructor" || e.role === "ta" ? "teacher" : "student", primary: e.role === "instructor", beginDate: "", endDate: "" };
    })),
  };
  audit(store, a, "oneroster.export", "oneroster");
  return { files, zip: zip(Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) }))) };
}

/** Import a OneRoster CSV set. Maps to the SIS import pipeline (which owns diffing and events). */
export function oneRosterImport(store: TenantStore, a: Actor, files: Record<string, string>) {
  requireTenant(store, a, ["admin", "registrar"], "oneroster.import");
  const need = ["users.csv", "academicSessions.csv", "courses.csv", "classes.csv", "enrollments.csv"];
  const missing = need.filter((f) => !files[f]);
  if (missing.length) throw new CampusError("invalid", `Missing OneRoster files: ${missing.join(", ")}`, 422);
  const results: Record<string, unknown> = {};
  const users = parseCsv(files["users.csv"]).map((u) => ({ sis_id: u.sourcedId, email: u.email, name: `${u.givenName ?? ""} ${u.familyName ?? ""}`.trim(), status: u.status === "tobedeleted" ? "deleted" : "active", role: u.role === "administrator" ? "admin" : u.role === "teacher" ? "instructor" : "student" }));
  results.users = sisImport(store, a, "users", csv(users));
  const terms = parseCsv(files["academicSessions.csv"]).filter((x) => !x.type || x.type === "term" || x.type === "semester").map((x) => ({ term_id: x.sourcedId, name: x.title, start_date: x.startDate, end_date: x.endDate }));
  results.terms = sisImport(store, a, "terms", csv(terms));
  const courses = parseCsv(files["courses.csv"]).map((c) => ({ course_id: c.sourcedId, code: c.courseCode || c.sourcedId, title: c.title }));
  results.courses = sisImport(store, a, "courses", csv(courses));
  const classes = parseCsv(files["classes.csv"]).map((c) => ({ section_id: c.sourcedId, course_id: c.courseSourcedId, term_id: (c.termSourcedIds || "").split(",")[0], code: c.classCode || c.sourcedId }));
  results.sections = sisImport(store, a, "sections", csv(classes));
  const enr = parseCsv(files["enrollments.csv"]).map((e) => ({ user_id: e.userSourcedId, section_id: e.classSourcedId, role: e.role === "teacher" ? "instructor" : "student", status: e.status === "tobedeleted" ? "deleted" : "active" }));
  results.enrollments = sisImport(store, a, "enrollments", csv(enr));
  return results;
}

/* ---------------- Webhooks ---------------- */

export const WEBHOOK_EVENTS = ["courses.published", "grades.posted", "sis.enrollment.committed", "sis.enrollment.dropped", "submissions.created", "announcements.published", "users.created", "credentials.issued", "tickets.created"];
const BACKOFF_MIN = [1, 5, 25, 120, 600];
const MAX_ATTEMPTS = 6;

export function webhookSecret(webhookId: string) {
  return hmac(signingKey(), `webhook:${webhookId}`);
}

export function createWebhook(store: TenantStore, a: Actor, input: { url: string; events: string[] }) {
  requireTenant(store, a, ["admin"], "webhooks.create");
  if (!/^https:\/\/[^\s]+$/.test(input.url)) throw new CampusError("invalid", "Webhook endpoints must use https.", 422);
  const bad = input.events.filter((e) => !WEBHOOK_EVENTS.includes(e) && !/^[a-z_.]+\.\*$/.test(e));
  if (bad.length || !input.events.length) throw new CampusError("invalid", `Unknown event types: ${bad.join(", ") || "(none chosen)"}`, 422);
  return store.tx(() => {
    const w = store.insert("webhooks", { url: input.url, events: input.events, secretRef: "derived:hmac", enabled: true }, "wh");
    audit(store, a, "webhooks.create", `webhooks/${w.id}`);
    // The signing secret is shown once.
    return { ...w, secret: webhookSecret(w.id) };
  });
}

function matches(patterns: string[], type: string) {
  return patterns.some((p) => p === type || (p.endsWith(".*") && type.startsWith(p.slice(0, -1))));
}

registerConsumer({
  name: "webhook-fanout",
  types: "*",
  handle(store, e) {
    for (const w of store.list("webhooks", (x) => !!x.enabled && matches((x.events as string[]) ?? [], e.type))) {
      if (store.list("webhook_deliveries", (d) => d.webhookId === w.id && d.eventId === e.id).length) continue;
      store.insert("webhook_deliveries", { webhookId: w.id, eventId: e.id, eventType: e.type, state: "pending", attempts: 0, nextAttemptAt: nowIso(), signature: null, lastStatus: null }, "whd");
    }
  },
});

export function webhookPayload(store: TenantStore, e: OutboxEvent) {
  const t = broker.tenant(store.tenantId)!;
  // Ids and event data only — never secrets or full personal records.
  return JSON.stringify({ id: e.id, type: e.type, tenant: t.slug, occurredAt: e.at, subject: e.subject, data: e.data });
}

export function signWebhook(secret: string, timestamp: string, body: string) {
  return `t=${timestamp},v1=${hmac(secret, `${timestamp}.${body}`)}`;
}

export function verifyWebhookSignature(secret: string, header: string, body: string, toleranceSec = 300) {
  const m = header.match(/^t=(\d+),v1=([0-9a-f]{64})$/);
  if (!m) return false;
  if (Math.abs(Math.floor(nowMs() / 1000) - Number(m[1])) > toleranceSec) return false;
  const expect = Buffer.from(hmac(secret, `${m[1]}.${body}`));
  const got = Buffer.from(m[2]);
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export type Transport = (url: string, body: string, headers: Record<string, string>) => Promise<number>;

/** Local receiver for staging/tests: https://sink.scholarion.local/<name> records deliveries in the tenant store. */
export function sinkTransport(store: TenantStore, failFor: string[] = []): Transport {
  return async (url, body, headers) => {
    if (failFor.some((f) => url.includes(f))) return 503;
    store.insert("webhook_sink", { url, body, signature: headers["X-Scholarion-Signature"], at: nowIso() }, "wsk");
    return 200;
  };
}

function defaultTransport(store: TenantStore): Transport {
  const sink = sinkTransport(store);
  return async (url, body, headers) => {
    if (url.startsWith("https://sink.scholarion.local/")) return sink(url, body, headers);
    if (process.env.CAMPUS_WEBHOOK_HTTP !== "1") return 0; // outbound HTTP is off in local/staging unless enabled
    try {
      const res = await fetch(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers }, signal: AbortSignal.timeout(5000) });
      return res.status;
    } catch {
      return 0;
    }
  };
}

/** Delivery job: sends due deliveries, retries with backoff, dead-letters after 6 attempts. */
export async function deliverWebhooks(store: TenantStore, transport: Transport = defaultTransport(store)) {
  const due = store.list("webhook_deliveries", (d) => d.state === "pending" && String(d.nextAttemptAt) <= nowIso());
  let ok = 0;
  for (const d of due) {
    const w = store.get("webhooks", d.webhookId as string);
    const e = store.outbox().find((x) => x.id === d.eventId);
    if (!w || !e) {
      store.update("webhook_deliveries", d.id, { state: "dead", lastStatus: 410 });
      continue;
    }
    const body = webhookPayload(store, e);
    const ts = String(Math.floor(nowMs() / 1000));
    const signature = signWebhook(webhookSecret(w.id), ts, body);
    const status = await transport(String(w.url), body, { "X-Scholarion-Signature": signature, "X-Scholarion-Event": e.type, "X-Scholarion-Delivery": d.id });
    const attempts = Number(d.attempts) + 1;
    if (status >= 200 && status < 300) {
      store.update("webhook_deliveries", d.id, { state: "delivered", attempts, lastStatus: status, signature, deliveredAt: nowIso() });
      metrics.inc("webhook_delivered_total", { event: e.type });
      ok++;
    } else if (attempts >= MAX_ATTEMPTS) {
      store.update("webhook_deliveries", d.id, { state: "dead", attempts, lastStatus: status, signature });
      metrics.inc("webhook_dead_total", { event: e.type });
    } else {
      store.update("webhook_deliveries", d.id, { attempts, lastStatus: status, signature, nextAttemptAt: new Date(nowMs() + BACKOFF_MIN[attempts - 1] * 60_000).toISOString() });
      metrics.inc("webhook_retry_total", { event: e.type });
    }
  }
  broker.persist(store.tenantId);
  return { attempted: due.length, delivered: ok };
}

export function replayWebhook(store: TenantStore, a: Actor, deliveryId: string) {
  requireTenant(store, a, ["admin"], "webhooks.replay");
  const d = store.get("webhook_deliveries", deliveryId);
  if (!d) throw new CampusError("not_found", "Delivery not found", 404);
  if (d.state !== "dead") throw new CampusError("conflict", "Only dead-lettered deliveries can be replayed.", 409);
  return store.tx(() => {
    audit(store, a, "webhooks.replay", `webhook_deliveries/${d.id}`);
    return store.update("webhook_deliveries", d.id, { state: "pending", attempts: 0, nextAttemptAt: nowIso() });
  });
}

/* ---------------- Developer keys & OAuth2 ---------------- */

export const API_SCOPES = ["read", "write", "courses:read", "courses:write", "users:read", "grades:read", "grades:write", "enrollments:read", "submissions:read", "calendar:read", "inbox:write"];

export function createDeveloperKey(store: TenantStore, a: Actor, input: { name: string; scopes: string[]; redirectUri?: string; rateLimitPerMin?: number }) {
  requireTenant(store, a, ["admin"], "developer_keys.create");
  const bad = input.scopes.filter((s) => !API_SCOPES.includes(s));
  if (bad.length || !input.scopes.length) throw new CampusError("invalid", `Unknown scopes: ${bad.join(", ") || "(none)"}`, 422);
  if (input.redirectUri && !/^https:\/\/|^http:\/\/localhost(:\d+)?\//.test(input.redirectUri)) throw new CampusError("invalid", "Redirect URI must be https (or http://localhost).", 422);
  const secret = token(24);
  return store.tx(() => {
    const k = store.insert("developer_keys", { name: input.name, kind: "api", clientId: `ck_${token(9)}`, secretHash: sha256(secret), scopes: input.scopes, enabled: true, redirectUri: input.redirectUri ?? null, rateLimitPerMin: input.rateLimitPerMin ?? 120 }, "dk");
    audit(store, a, "developer_keys.create", `developer_keys/${k.id}`);
    return { id: k.id, clientId: k.clientId, clientSecret: secret, scopes: k.scopes, note: "Copy the secret now — it isn't shown again." };
  });
}

export function setDeveloperKeyEnabled(store: TenantStore, a: Actor, keyId: string, enabled: boolean) {
  requireTenant(store, a, ["admin"], "developer_keys.toggle");
  return store.tx(() => {
    const k = store.update("developer_keys", keyId, { enabled });
    if (!enabled) for (const t of store.list("access_tokens", (x) => x.keyId === keyId && !x.revokedAt)) store.update("access_tokens", t.id, { revokedAt: nowIso() });
    audit(store, a, enabled ? "developer_keys.enable" : "developer_keys.disable", `developer_keys/${keyId}`);
    return k;
  });
}

/** Step 1: the signed-in user approves the app; returns a one-time code (10 minutes). */
export function authorize(store: TenantStore, a: Actor, input: { clientId: string; redirectUri: string; scopes: string[]; state: string }) {
  const k = store.list("developer_keys", (x) => x.clientId === input.clientId)[0];
  if (!k || !k.enabled) throw new CampusError("invalid_client", "Unknown or disabled app", 400);
  if (k.redirectUri !== input.redirectUri) throw new CampusError("invalid_request", "redirect_uri doesn't match the registered URI", 400);
  const scopes = input.scopes.filter((s) => ((k.scopes as string[]) ?? []).includes(s));
  if (!scopes.length) throw new CampusError("invalid_scope", "No permitted scopes requested", 400);
  const code = token(18);
  store.tx(() => store.insert("oauth_codes", { codeHash: sha256(code), keyId: k.id, userId: a.id, scopes, redirectUri: input.redirectUri, expiresAt: new Date(nowMs() + 600_000).toISOString(), usedAt: null }, "oc"));
  audit(store, a, "oauth.authorize", `developer_keys/${k.id}`);
  return { redirect: `${input.redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(input.state)}` };
}

function checkClient(store: TenantStore, clientId: string, clientSecret: string): Row {
  const k = store.list("developer_keys", (x) => x.clientId === clientId)[0];
  if (!k || !k.enabled) throw new CampusError("invalid_client", "Unknown or disabled client", 401);
  const a = Buffer.from(sha256(clientSecret));
  const b = Buffer.from(String(k.secretHash));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new CampusError("invalid_client", "Bad client secret", 401);
  return k;
}

function issueTokens(store: TenantStore, keyId: string | null, userId: string, scopes: string[], ttlSec = 3600, purpose?: string) {
  const access = token(24);
  const refresh = keyId ? token(24) : null;
  const row = store.insert("access_tokens", { keyId, userId, tokenHash: sha256(access), refreshHash: refresh ? sha256(refresh) : null, scopes, expiresAt: new Date(nowMs() + ttlSec * 1000).toISOString(), revokedAt: null, purpose: purpose ?? null }, "at");
  return { id: row.id, access_token: access, token_type: "Bearer", expires_in: ttlSec, refresh_token: refresh, scope: scopes.join(" ") };
}

/** Step 2: exchange the code (single use) for tokens. */
export function exchangeCode(store: TenantStore, input: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  const k = checkClient(store, input.clientId, input.clientSecret);
  const c = store.list("oauth_codes", (x) => x.codeHash === sha256(input.code) && x.keyId === k.id)[0];
  if (!c || c.usedAt || String(c.expiresAt) < nowIso() || c.redirectUri !== input.redirectUri) throw new CampusError("invalid_grant", "Code is invalid, expired or already used", 400);
  return store.tx(() => {
    store.update("oauth_codes", c.id, { usedAt: nowIso() });
    return issueTokens(store, k.id, c.userId as string, c.scopes as string[]);
  });
}

export function refreshToken(store: TenantStore, input: { clientId: string; clientSecret: string; refreshToken: string }) {
  const k = checkClient(store, input.clientId, input.clientSecret);
  const t = store.list("access_tokens", (x) => x.refreshHash === sha256(input.refreshToken) && x.keyId === k.id && !x.revokedAt)[0];
  if (!t) throw new CampusError("invalid_grant", "Refresh token is invalid or revoked", 400);
  return store.tx(() => {
    store.update("access_tokens", t.id, { revokedAt: nowIso() }); // rotation
    return issueTokens(store, k.id, t.userId as string, t.scopes as string[]);
  });
}

export function createPersonalToken(store: TenantStore, a: Actor, input: { purpose: string; scopes: string[]; days?: number }) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "Tokens can't be created while acting as someone else.", 403);
  const scopes = input.scopes.filter((s) => API_SCOPES.includes(s));
  if (!scopes.length || !input.purpose.trim()) throw new CampusError("invalid", "Give a purpose and at least one scope.", 422);
  const days = Math.min(Math.max(input.days ?? 30, 1), 365);
  return store.tx(() => {
    const out = issueTokens(store, null, a.id, scopes, days * 86400, input.purpose.trim());
    audit(store, a, "access_tokens.create", `access_tokens/${out.id}`, input.purpose);
    return { ...out, note: "Copy the token now — it isn't shown again." };
  });
}

export function revokeToken(store: TenantStore, a: Actor, tokenId: string) {
  const t = store.get("access_tokens", tokenId);
  if (!t || (t.userId !== a.id && !a.roles.includes("admin"))) throw new CampusError("not_found", "Token not found", 404);
  return store.tx(() => {
    audit(store, a, "access_tokens.revoke", `access_tokens/${tokenId}`);
    return store.update("access_tokens", tokenId, { revokedAt: nowIso() });
  });
}

export function myTokens(store: TenantStore, a: Actor) {
  return store.list("access_tokens", (t) => t.userId === a.id).map((t) => ({ id: t.id, purpose: t.purpose ?? (t.keyId ? store.get("developer_keys", t.keyId as string)?.name : null), scopes: t.scopes, expiresAt: t.expiresAt, revokedAt: t.revokedAt, createdAt: t.createdAt }));
}

/** Resolve a bearer token for the REST API: the user it acts for, its scopes and rate limit. */
export function resolveApiToken(store: TenantStore, secret: string): { actor: Actor; scopes: string[]; keyId: string | null; limit: number } {
  const t = store.list("access_tokens", (x) => x.tokenHash === sha256(secret))[0];
  if (!t || t.revokedAt || String(t.expiresAt) < nowIso()) throw new CampusError("invalid_token", "Invalid, expired or revoked token", 401);
  const k = t.keyId ? store.get("developer_keys", t.keyId as string) : undefined;
  if (t.keyId && (!k || !k.enabled)) throw new CampusError("invalid_token", "The app for this token is disabled", 401);
  return { actor: actorFor(store, t.userId as string, true), scopes: (t.scopes as string[]) ?? [], keyId: (t.keyId as string) ?? `pat:${t.id}`, limit: Number(k?.rateLimitPerMin ?? 120) };
}

/** Scope check: "read"/"write" cover everything; "<resource>:read|write" covers one resource. */
export function scopeAllows(scopes: string[], method: string, resource: string) {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const base = resource.replace(/_.*$/, "").replace(/s$/, "") + "s";
  return scopes.includes(write ? "write" : "read") || scopes.includes(`${base}:${write ? "write" : "read"}`) || (!write && scopes.includes(`${base}:write`));
}

/* ---------------- Rate limits (token bucket per key) ---------------- */

const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMin: number): { remaining: number; limit: number } {
  const now = nowMs();
  const b = buckets.get(key) ?? { tokens: perMin, at: now };
  b.tokens = Math.min(perMin, b.tokens + ((now - b.at) / 60_000) * perMin);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    metrics.inc("api_rate_limited_total", { key: key.slice(0, 12) });
    throw new CampusError("rate_limited", "Too many requests. Slow down and retry shortly.", 429, { retryAfter: Math.ceil(((1 - b.tokens) / perMin) * 60) });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { remaining: Math.floor(b.tokens), limit: perMin };
}
export function resetRateLimits() {
  buckets.clear();
}
