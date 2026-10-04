import "../index";
import { broker, CampusError, log, metrics, nowIso, relay, resolveTenant, token, type TenantContext, type TenantStore } from "../core";
import { actorFor, cookieName, effectiveRoles, resolveSession, sessionRow, signIn, signOut, type Actor } from "../iam";
import { actorHas } from "../permissions";
import * as entity from "../entity";
import { ENTITY, TABS } from "../registry";
import { ensureCampusSeed } from "../seed";
import { Args, OPERATIONS } from "./ops";
import { openApi } from "./openapi";
import { executeGraphql } from "./graphql";
import { feedOwner, ics, projection } from "../services/calendar";
import { podcastFeed } from "../services/collaboration";
import { readObject, receiveUpload, scanFile, verifySignature, canDownload } from "../services/files";
import { verifyCredential } from "../services/success";
import { redeemQrLogin, startMasquerade, stopMasquerade, activeGlobalAnnouncements } from "../services/admin";
import { resolveApiToken, rateLimit, refreshToken, exchangeCode, scopeAllows } from "../services/integration";
import * as lti from "../services/lti";
import { recordRequest } from "../services/ops";
import { recordView } from "../services/dashboard";

/**
 * Campus HTTP layer. Mounted at /api/campus/*.
 *
 *   /api/campus/v1/t/:tenant/…   tenant API (REST, operations, GraphQL, OpenAPI, LTI, OAuth2)
 *   /api/campus/objects/:tenant/:fileId   signed object PUT/GET
 *   /api/campus/ical/:tenant/:token       private calendar feed
 *   /api/campus/podcast/:tenant/:courseId podcast feed
 *   /api/campus/metrics                    Prometheus text (local/staging)
 *
 * Every tenant request resolves TenantContext first (verified host or local path slug);
 * an unknown or suspended tenant is refused before any data is read. Browsers use the
 * per-tenant session cookie (CSRF-checked); integrations use Bearer tokens (scoped,
 * rate-limited). Admins may act as another user (?as_user_id=) — every request is audited.
 */

const PUBLIC_OPS = new Set(["catalog.hub", "catalog.recommender_questions", "catalog.recommend", "commerce.quote"]);

type Body = Record<string, unknown>;

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function text(body: string | Uint8Array, type: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body as BodyInit, { status, headers: { "content-type": type, "cache-control": "no-store", ...headers } });
}
function isForm(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
}
function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function safeBack(p: unknown, fallback: string) {
  const s = typeof p === "string" ? p : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : fallback;
}
function withQuery(path: string, params: Record<string, string>) {
  const u = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.pathname + u.search;
}
function redirect(to: string, cookies: string[] = []) {
  const h = new Headers({ location: to });
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status: 303, headers: h });
}
function sessionCookie(tenantId: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName(tenantId)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function readBody(req: Request): Promise<Body> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  if (isForm(req)) {
    const fd = await req.formData();
    const out: Body = {};
    fd.forEach((v, k) => {
      const val = typeof v === "string" ? v : (v as File).name;
      const key = k.endsWith("[]") ? k.slice(0, -2) : k;
      if (k.endsWith("[]")) out[key] = [...((out[key] as string[]) ?? []), val];
      else out[key] = val;
    });
    return out;
  }
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    try {
      const b = (await req.json()) as unknown;
      return b && typeof b === "object" && !Array.isArray(b) ? (b as Body) : { value: b };
    } catch {
      throw new CampusError("invalid", "Request body isn't valid JSON.", 400);
    }
  }
  return {};
}

interface Ctx {
  req: Request;
  url: URL;
  tenant: TenantContext;
  store: TenantStore;
  actor: Actor | null;
  sessionSecret?: string;
  viaToken: boolean;
  scopes?: string[];
  body: Body;
  rate?: { remaining: number; limit: number };
}

function errorOut(req: Request, err: unknown, back: string) {
  const ce = err instanceof CampusError ? err : null;
  if (!ce) log("error", "campus_unhandled", { err: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  const status = ce?.status ?? 500;
  const message = ce?.message ?? "Something went wrong. Please try again.";
  if (isForm(req)) return redirect(withQuery(back, { error: message }));
  return json({ error: { code: ce?.code ?? "internal", message, detail: ce?.detail ?? null } }, status, ce?.detail && typeof ce.detail === "object" && "retryAfter" in (ce.detail as object) ? { "retry-after": String((ce.detail as { retryAfter: number }).retryAfter) } : {});
}

function requireActor(c: Ctx): Actor {
  if (!c.actor) throw new CampusError("unauthenticated", "Please sign in.", 401);
  return c.actor;
}

function linkHeader(c: Ctx, next: string | null): Record<string, string> {
  if (!next) return {};
  const u = new URL(c.url.toString());
  u.searchParams.set("cursor", next);
  return { link: `<${u.pathname}${u.search}>; rel="next"` };
}

function ok(c: Ctx, data: unknown, status = 200, headers: Record<string, string> = {}, notice = "Saved.") {
  if (c.req.method !== "GET" && isForm(c.req)) {
    const back = safeBack(c.body.back, `/campus/${c.tenant.slug}`);
    const extra: Record<string, string> = { notice: String(c.body.notice ?? notice) };
    if (data && typeof data === "object" && c.body.show_result) extra.result = JSON.stringify(data).slice(0, 1500);
    return redirect(withQuery(back, extra));
  }
  const rate: Record<string, string> = c.rate ? { "x-rate-limit-limit": String(c.rate.limit), "x-rate-limit-remaining": String(c.rate.remaining) } : {};
  const acting: Record<string, string> = c.actor?.masqueradedBy ? { "x-acting-as": c.actor.id } : {};
  return json({ data, traceId: c.tenant.traceId }, status, { ...rate, ...headers, ...acting });
}

/* ---------------- Tenant API ---------------- */

async function tenantApi(req: Request, url: URL, slug: string, rest: string[]): Promise<Response> {
  const traceId = req.headers.get("x-trace-id") ?? token(8);
  const tenant = resolveTenant({ host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"), slug, traceId });
  const store = broker.connect(tenant);
  const body = await readBody(req);
  const method = (typeof body._method === "string" ? body._method : req.method).toUpperCase();
  const back = safeBack(body.back, `/campus/${tenant.slug}`);
  const route = rest.join("/");
  const c: Ctx = { req, url, tenant, store, actor: null, body, viaToken: false };

  // Public, unauthenticated endpoints.
  if (route === "auth/signin" && method === "POST") {
    const r = signIn(store, String(body.email ?? ""), String(body.password ?? ""), body.code ? String(body.code) : undefined);
    if (r.needsMfa) {
      if (isForm(req)) return redirect(withQuery(`/campus/${tenant.slug}/signin`, { mfa: "1", email: String(body.email ?? ""), next: safeBack(body.next, "") }));
      return json({ needsMfa: true }, 401);
    }
    const cookie = sessionCookie(tenant.tenantId, r.token, 12 * 3600);
    if (isForm(req)) return redirect(safeBack(body.next, `/campus/${tenant.slug}/dashboard`), [cookie]);
    return json({ data: { userId: r.actor.id, name: r.actor.name } }, 200, { "set-cookie": cookie });
  }
  if (route === "auth/qr" && method === "POST") {
    const r = redeemQrLogin(store, String(body.code ?? ""));
    return json({ data: { ok: true } }, 200, { "set-cookie": sessionCookie(tenant.tenantId, r.token, 12 * 3600) });
  }
  if (route === ".well-known/jwks.json") return json(lti.jwks(store));
  if (route === ".well-known/openid-configuration") return json(lti.openidConfiguration(store));
  if (route === "openapi.json") return json(openApi(tenant.slug));
  if (route === "oauth2/token" && method === "POST") {
    const gt = String(body.grant_type ?? "");
    if (gt === "authorization_code") return json(exchangeCode(store, { clientId: String(body.client_id ?? ""), clientSecret: String(body.client_secret ?? ""), code: String(body.code ?? ""), redirectUri: String(body.redirect_uri ?? "") }));
    if (gt === "refresh_token") return json(refreshToken(store, { clientId: String(body.client_id ?? ""), clientSecret: String(body.client_secret ?? ""), refreshToken: String(body.refresh_token ?? "") }));
    if (gt === "client_credentials") return json(lti.agsToken(store, String(body.client_assertion ?? ""), String(body.scope ?? "").split(/\s+/).filter(Boolean)));
    throw new CampusError("unsupported_grant_type", "Unsupported grant_type", 400);
  }
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (rest[0] === "lti" && bearer) {
    if (rest[1] === "lineitems" && rest[3] === "scores" && method === "POST") return json(lti.agsPostScore(store, bearer, rest[2], body as never));
    if (rest[1] === "courses" && rest[3] === "lineitems" && method === "GET") return json(lti.agsLineItems(store, bearer, rest[2]));
    if (rest[1] === "courses" && rest[3] === "memberships" && method === "GET") return json(lti.nrpsMembers(store, bearer, rest[2]));
  }
  if (rest[0] === "verify" && rest[1] && method === "GET") return json({ data: verifyCredential(store, rest[1]) });
  if (rest[0] === "q" && PUBLIC_OPS.has(rest[1] ?? "") && method === "GET") {
    const op = OPERATIONS[rest[1]];
    return json({ data: await op.run({ store, actor: null as unknown as Actor, args: new Args(Object.fromEntries(url.searchParams)), tenant }) });
  }

  // Authenticate.
  if (bearer) {
    const t = resolveApiToken(store, bearer);
    c.actor = t.actor;
    c.scopes = t.scopes;
    c.viaToken = true;
    c.rate = rateLimit(`${tenant.tenantId}:${t.keyId}`, t.limit);
  } else {
    c.sessionSecret = readCookie(req, cookieName(tenant.tenantId));
    c.actor = resolveSession(store, c.sessionSecret);
    if (method !== "GET" && !sameOrigin(req)) throw new CampusError("bad_origin", "Cross-site request blocked.", 403);
  }
  if (route === "auth/signout" && method === "POST") {
    if (c.sessionSecret) signOut(store, c.sessionSecret);
    return isForm(req) ? redirect(`/campus/${tenant.slug}/signin`, [sessionCookie(tenant.tenantId, "", 0)]) : json({ data: { ok: true } }, 200, { "set-cookie": sessionCookie(tenant.tenantId, "", 0) });
  }
  const actor = requireActor(c);

  // API act-as: ?as_user_id= (admins with the masquerade permission; audited per request).
  const asUser = url.searchParams.get("as_user_id");
  if (asUser && asUser !== actor.id) {
    if (!actor.roles.includes("admin") || !actorHas(store, actor, effectiveRoles(actor), "masquerade", null)) throw new CampusError("forbidden", "You can't act as other users.", 403);
    const target = actorFor(store, asUser);
    if (target.roles.includes("admin")) throw new CampusError("forbidden", "You can't act as another admin.", 403);
    store.realActorId = actor.id;
    c.actor = { ...target, masqueradedBy: { id: actor.id, name: actor.name, expiresAt: nowIso() } };
    store.audit({ actorId: target.id, actorRoles: target.roles, action: "masquerade.api", resource: `${method} ${route}`, outcome: "allowed" });
  }
  const a = c.actor!;
  if (a.masqueradedBy && method !== "GET") store.audit({ actorId: a.id, actorRoles: a.roles, action: "masquerade.write", resource: `${method} ${route}`, outcome: "allowed", reason: `by ${a.masqueradedBy.id}` });

  if (route === "auth/masquerade" && method === "POST") {
    if (!c.sessionSecret) throw new CampusError("invalid", "Act-as needs a browser session.", 400);
    const r = startMasquerade(store, a, c.sessionSecret, String(body.userId ?? ""), String(body.reason ?? ""));
    return ok(c, r, 200, {}, `Now acting as ${r.actingAs}.`);
  }
  if (route === "auth/masquerade" && (method === "DELETE" || body.stop)) {
    const r = stopMasquerade(store, c.sessionSecret ?? "");
    return ok(c, r, 200, {}, "Stopped acting as another user.");
  }
  if (route === "me" && method === "GET") {
    const real = c.sessionSecret ? sessionRow(store, c.sessionSecret) : undefined;
    return ok(c, { id: a.id, name: a.name, email: a.email, roles: a.roles, courseRoles: a.courseRoles, masqueradedBy: a.masqueradedBy ?? null, platformOperator: a.platformOperator, realUserId: real?.userId ?? a.id, announcements: activeGlobalAnnouncements(store, a) });
  }
  if (route === "tabs" && method === "GET") return ok(c, visibleTabs(store, a));
  if (route === "graphql" && method === "POST") {
    const r = executeGraphql(store, a, tenant, String(body.query ?? ""), (body.variables as Record<string, unknown>) ?? {}, c.scopes);
    return json(r, 200);
  }
  if (route === "view" && method === "POST") {
    recordView(store, a, { title: String(body.title ?? ""), href: String(body.href ?? ""), kind: String(body.kind ?? "page"), courseId: (body.courseId as string) ?? null });
    return json({ data: { ok: true } });
  }

  // Operations.
  if ((rest[0] === "a" || rest[0] === "q") && rest[1]) {
    const op = OPERATIONS[rest.slice(1).join("/")];
    if (!op) throw new CampusError("not_found", "Unknown operation", 404);
    if ((op.kind === "query") !== (method === "GET") && !(op.kind === "query" && method === "POST")) throw new CampusError("method_not_allowed", `${op.name} is a ${op.kind}.`, 405);
    if (c.scopes && !(c.scopes.includes("write") || (op.kind === "query" && c.scopes.includes("read")))) throw new CampusError("insufficient_scope", "This token's scopes don't allow that.", 403);
    const raw = method === "GET" ? Object.fromEntries(url.searchParams) : { ...Object.fromEntries(url.searchParams), ...body };
    const result = await op.run({ store, actor: a, args: new Args(raw), tenant, sessionSecret: c.sessionSecret });
    if (method === "GET" && (raw.format === "csv" || op.name.endsWith("export_csv")) && typeof result === "string") return text(result, "text/csv; charset=utf-8", 200, { "content-disposition": `attachment; filename="${op.name}.csv"` });
    return ok(c, result, 200, {}, `${op.summary.split(/[.(]/)[0]}: done.`);
  }

  // Generic resources: /r/:table[/:id[/publish|restore]]
  if (rest[0] === "r" && rest[1]) {
    const table = rest[1];
    if (!ENTITY[table]) throw new CampusError("not_found", "Unknown resource", 404);
    if (c.scopes && !scopeAllows(c.scopes, method, table)) throw new CampusError("insufficient_scope", "This token's scopes don't allow that.", 403);
    const id = rest[2];
    const ifVersion = req.headers.get("if-match") ? Number(req.headers.get("if-match")!.replace(/[^0-9]/g, "")) : body.ifVersion !== undefined && body.ifVersion !== "" ? Number(body.ifVersion) : undefined;
    const clean = Object.fromEntries(Object.entries(body).filter(([k]) => !["back", "_method", "notice", "ifVersion", "show_result"].includes(k)));
    if (!id) {
      if (method === "GET") {
        const where = Object.fromEntries([...url.searchParams].filter(([k]) => !["cursor", "limit", "q", "courseId", "includeDeleted", "as_user_id", "sort"].includes(k)));
        const r = entity.list(store, a, table, { courseId: url.searchParams.get("courseId") ?? undefined, where, search: url.searchParams.get("q") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined, limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined, includeDeleted: url.searchParams.get("includeDeleted") === "1" });
        return ok(c, r.items, 200, { ...linkHeader(c, r.next), "x-total-count": String(r.total) });
      }
      if (method === "POST") return ok(c, entity.create(store, a, table, clean), 201, {}, `${ENTITY[table].label} created.`);
    } else {
      if (rest[3] === "publish") return ok(c, entity.publish(store, a, table, id, method !== "DELETE" && body.on !== "false"), 200, {}, method === "DELETE" || body.on === "false" ? "Unpublished." : "Published.");
      if (rest[3] === "restore" && method === "POST") return ok(c, entity.restore(store, a, table, id), 200, {}, "Restored.");
      if (method === "GET") {
        const row = entity.read(store, a, table, id, { includeDeleted: url.searchParams.get("includeDeleted") === "1" });
        return ok(c, row, 200, { etag: `"${row.version}"` });
      }
      if (method === "PATCH" || method === "PUT") return ok(c, entity.update(store, a, table, id, clean, ifVersion), 200, {}, `${ENTITY[table].label} saved.`);
      if (method === "DELETE") return ok(c, entity.archive(store, a, table, id, ifVersion), 200, {}, `${ENTITY[table].label} deleted.`);
    }
    throw new CampusError("method_not_allowed", "Method not allowed", 405);
  }

  // LTI launch & tool endpoints for signed-in users.
  if (route === "lti/tool/launch" && method === "POST") return ok(c, lti.toolReceiveLaunch(store, String(body.id_token ?? "")));
  if (route === "lti/register" && method === "POST") return json(lti.dynamicRegister(store, a, body as never), 201);
  void back;
  throw new CampusError("not_found", "Not found", 404);
}

/** Tabs a person can open: role nav, tenant kind, flags and platform-only rules. */
export function visibleTabs(store: TenantStore, a: Actor) {
  const t = broker.tenant(store.tenantId)!;
  const roles = effectiveRoles(a);
  return TABS.filter((tab) => {
    if (tab.platformOnly && !a.platformOperator) return false;
    if (tab.internalOnly && t.kind !== "internal") return false;
    if (tab.flag && !t.flags[tab.flag]) return roles.includes("admin");
    return tab.nav.some((r) => roles.includes(r)) || (a.platformOperator && tab.platformOnly);
  }).map((tab) => ({ n: tab.n, slug: tab.slug, title: tab.title, group: tab.group, summary: tab.summary, disabledByFlag: !!(tab.flag && !t.flags[tab.flag]) }));
}

/* ---------------- Objects, feeds, metrics ---------------- */

async function objects(req: Request, url: URL, slug: string, fileId: string): Promise<Response> {
  const tenant = resolveTenant({ host: req.headers.get("host"), slug });
  const store = broker.connect(tenant);
  const op = req.method === "PUT" ? "put" : "get";
  verifySignature(tenant.tenantId, op, fileId, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (op === "put") {
    const bytes = Buffer.from(await req.arrayBuffer());
    receiveUpload(store, fileId, bytes);
    const f = scanFile(store, fileId);
    return json({ data: { id: fileId, state: f?.state ?? "unknown" } });
  }
  const f = store.get("files", fileId);
  if (!f) throw new CampusError("not_found", "File not found", 404);
  const actor = resolveSession(store, readCookie(req, cookieName(tenant.tenantId)));
  if (actor && !canDownload(store, actor, f)) throw new CampusError("not_found", "File not found", 404);
  const o = readObject(store, fileId);
  return text(o.bytes, o.mime, 200, { "content-disposition": `attachment; filename="${encodeURIComponent(o.name)}"`, "x-content-type-options": "nosniff" });
}

function icalFeed(req: Request, slug: string, secret: string) {
  const tenant = resolveTenant({ host: req.headers.get("host"), slug });
  const store = broker.connect(tenant);
  const owner = feedOwner(store, secret.replace(/\.ics$/, ""));
  if (!owner) throw new CampusError("not_found", "Feed not found", 404);
  const actor = actorFor(store, owner);
  const from = new Date(Date.now() - 30 * 86400_000).toISOString();
  const to = new Date(Date.now() + 180 * 86400_000).toISOString();
  return text(ics(projection(store, actor, from, to).items, `${broker.tenant(store.tenantId)!.name} calendar`), "text/calendar; charset=utf-8");
}

export async function handleCampus(req: Request, path: string): Promise<Response> {
  const started = Date.now();
  const url = new URL(req.url);
  const seg = path.split("/").filter(Boolean);
  let res: Response;
  let routeLabel = seg.slice(0, 1).join("/");
  try {
    ensureCampusSeed();
    if (seg[0] === "metrics") {
      if (process.env.NODE_ENV === "production" && req.headers.get("x-metrics-token") !== process.env.CAMPUS_METRICS_TOKEN) throw new CampusError("forbidden", "Metrics need the operator token.", 403);
      res = text(metrics.prometheus(), "text/plain; version=0.0.4");
    } else if (seg[0] === "health") {
      res = json({ ok: true, tenants: broker.tenants().filter((t) => t.kind !== "validation").length, at: nowIso() });
    } else if (seg[0] === "v1" && seg[1] === "t" && seg[2]) {
      routeLabel = `v1/${seg.slice(3, 5).join("/")}`;
      res = await tenantApi(req, url, seg[2], seg.slice(3));
      // Local/staging: deliver outbox events synchronously after writes (a worker does this in staging clusters).
      if (req.method !== "GET" && res.status < 400 && process.env.CAMPUS_SYNC_RELAY !== "0") {
        const t = broker.tenant(seg[2]);
        if (t && t.status === "active") relay(broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: "relay" }));
      }
    } else if (seg[0] === "objects" && seg[1] && seg[2]) {
      res = await objects(req, url, seg[1], seg[2]);
    } else if (seg[0] === "ical" && seg[1] && seg[2]) {
      res = icalFeed(req, seg[1], seg[2]);
    } else if (seg[0] === "podcast" && seg[1] && seg[2]) {
      const tenant = resolveTenant({ host: req.headers.get("host"), slug: seg[1] });
      res = text(podcastFeed(broker.connect(tenant), seg[2].replace(/\.xml$/, "")), "application/rss+xml; charset=utf-8");
    } else {
      res = json({ error: { code: "not_found", message: "Not found" } }, 404);
    }
  } catch (err) {
    const back = req.headers.get("referer") ? new URL(req.headers.get("referer")!).pathname : "/campus";
    res = errorOut(req, err, safeBack(back, "/campus"));
  }
  recordRequest(Date.now() - started, res.status, routeLabel.replace(/[^a-z0-9/_.-]/gi, "").slice(0, 40) || "root");
  return res;
}
