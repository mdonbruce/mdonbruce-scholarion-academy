import "../index";
import { broker, CampusError, log, metrics, nowIso, relay, resolveTenant, token, type Row, type TenantContext, type TenantStore } from "../core";
import { actorFor, cookieName, effectiveRoles, hasAny, resolveSession, sessionRow, signIn, signOut, type Actor } from "../iam";
import { actorHas } from "../permissions";
import * as entity from "../entity";
import { ENTITY, TABS } from "../registry";
import { ensureCampusSeed } from "../seed";
import { Args, OPERATIONS } from "./ops";
import { openApi } from "./openapi";
import { executeGraphql } from "./graphql";
import { feedOwner, ics, projection } from "../services/calendar";
import { podcastFeed } from "../services/collaboration";
import { readObject, receiveUpload, requestUpload, scanFile, verifySignature, canDownload, zipFiles } from "../services/files";
import { exportCourse } from "../services/content";
import { submit } from "../services/assessment";
import { verifyCredential } from "../services/success";
import { brochureDoc, brochurePdf } from "../services/programs";
import { simLabFileName, simLabHtml } from "../services/simlab";
import { answersLocked, pinFor } from "../services/projection";
import { gradebookCsv as gradedCsv } from "../services/graded";
import { bundleZip, moduleStudioBundle, readOutput } from "../services/studio";
import * as camp from "../services/campaigns";
import * as designPkg from "../services/design";
import { attachDoc, officeResponse } from "../../documents/http";
import * as eco from "../services/ecosystem";
import * as wsp from "../services/workspace";
import { draftView, qtiXml } from "../services/assess";
import { coverHtml, type CoverKind } from "../services/covers";
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

const PUBLIC_OPS = new Set(["catalog.hub", "catalog.recommender_questions", "catalog.recommend", "commerce.quote", "programs.index", "programs.page", "programs.self_check_questions", "agentic.hub", "agentic.quiz_questions", "agentic.recommend", "eco.changelog", "plans.options", "plans.quote", "plans.settings_view"]);
/** Commands anyone may send (same-origin forms or JSON); the signed-in user is attached when present. */
const PUBLIC_CMDS = new Set(["programs.inquire", "programs.self_check", "campaign.subscribe"]);

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
      const val: unknown = v;
      const key = k.endsWith("[]") ? k.slice(0, -2) : k;
      if (k.endsWith("[]")) out[key] = [...((out[key] as unknown[]) ?? []), val];
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
    // Forms can ask for the new record's id in the redirect (e.g. to show the reply on the page).
    const rp = typeof c.body.result_param === "string" && /^[a-z_]{1,24}$/.test(c.body.result_param) ? c.body.result_param : null;
    if (rp && data && typeof data === "object" && typeof (data as { id?: unknown }).id === "string") extra[rp] = (data as { id: string }).id;
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

  if (rest[0] === "programs" && rest[2] === "brochure.pdf" && method === "GET") {
    const pdf = await brochurePdf(store, decodeURIComponent(rest[1] ?? ""));
    return attachDoc(new Response(Buffer.from(pdf), { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${(rest[1] ?? "program").replace(/[^a-z0-9-]/gi, "")}-brochure.pdf"`, "cache-control": "no-store" } }), brochureDoc(store, decodeURIComponent(rest[1] ?? "")));
  }
  if (rest[0] === "campaigns" && rest[1] === "unsubscribe" && method === "GET") {
    camp.unsubscribe(store, url.searchParams.get("token") ?? "");
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title></head><body style="font:16px system-ui;margin:40px"><h1>You're unsubscribed</h1><p>Scholarion Academy won't email you about this program again. <a href="/campus/${tenant.slug}/programs">Back to programs</a></p></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (rest[0] === "a" && PUBLIC_CMDS.has(rest[1] ?? "") && method === "POST" && !bearer) {
    if (!sameOrigin(req)) throw new CampusError("bad_origin", "Cross-site request blocked.", 403);
    const secret = readCookie(req, cookieName(tenant.tenantId));
    let who: Actor | null = null;
    try {
      who = secret ? resolveSession(store, secret) : null;
    } catch {
      who = null;
    }
    c.actor = who;
    const raw: Record<string, unknown> = { ...body };
    const ans = Object.entries(raw).filter(([k]) => k.startsWith("ans__"));
    if (ans.length && raw.answers === undefined) raw.answers = Object.fromEntries(ans.map(([k, v]) => [k.slice(5), v]));
    const op = OPERATIONS[rest[1]];
    const result = await op.run({ store, actor: who as Actor, args: new Args(raw), tenant });
    return ok(c, result, 200, {}, `${op.summary.split(/[.(]/)[0]}: done.`);
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
  if (rest[0] === "programs" && rest[1] && rest[2] === "design-package.zip" && method === "GET") {
    const pk = designPkg.designPackage(store, requireActor(c), decodeURIComponent(rest[1]));
    return new Response(new Uint8Array(pk.zip), { status: 200, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${pk.root}.zip"`, "cache-control": "no-store" } });
  }
  if (rest[0] === "campaigns" && rest[1] && method === "GET") {
    const a0 = requireActor(c);
    if (rest[2] === "program-folder.zip") {
      const pf = camp.programFolder(store, a0);
      return new Response(new Uint8Array(pf.zip), { status: 200, headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="Scholarion_GenAI_Agentic_Program.zip"', "cache-control": "no-store" } });
    }
    if (rest[2] === "assets" && rest[3]) {
      const asset = camp.assetFile(store, a0, rest[1], decodeURIComponent(rest.slice(3).join("/")));
      const type = { html: "text/html", md: "text/markdown", txt: "text/plain", csv: "text/csv", ics: "text/calendar" }[asset.kind];
      return new Response(asset.body, { status: 200, headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "x-content-type-options": "nosniff", ...(asset.kind === "html" ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self'" } : { "content-disposition": `inline; filename="${asset.path}"` }) } });
    }
  }

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
  if (route === "upload" && method === "POST") {
    // Browser upload: signed-upload flow done server-side (quarantine → scan → promote), optional submission.
    const file = body.file as File | undefined;
    if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") throw new CampusError("invalid", "Choose a file to upload.", 422);
    const bytes = Buffer.from(await (file as Blob).arrayBuffer());
    const purpose = (String(body.purpose ?? "") || (body.assignmentId ? "submission" : body.courseId ? "course" : "personal")) as "course" | "submission" | "personal";
    const r = requestUpload(store, a, { name: file.name, mime: file.type || "application/octet-stream", size: bytes.length, courseId: (body.courseId as string) || null, folderId: (body.folderId as string) || null, purpose });
    receiveUpload(store, String(r.file.id), bytes);
    const scanned = scanFile(store, String(r.file.id));
    if (scanned?.state !== "available") throw new CampusError("blocked", `The file didn't pass the safety scan (${scanned?.state ?? "unknown"}).`, 422);
    if (body.assignmentId) {
      const sub = submit(store, a, String(body.assignmentId), { mode: "file", fileId: String(r.file.id) });
      return ok(c, { fileId: r.file.id, submissionId: sub.id }, 201, {}, "Submitted.");
    }
    return ok(c, { fileId: r.file.id }, 201, {}, "Uploaded and scanned.");
  }
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
    const raw: Record<string, unknown> = method === "GET" ? Object.fromEntries(url.searchParams) : { ...Object.fromEntries(url.searchParams), ...body };
    // The client address comes from the proxy, never from the request body (IP-filtered quizzes).
    raw.__clientIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
    // HTML forms: ans__<questionId> fields become `answers`; rating__<criterion> become a rubric assessment.
    const ans = Object.entries(raw).filter(([k]) => k.startsWith("ans__"));
    if (ans.length && raw.answers === undefined) raw.answers = Object.fromEntries(ans.map(([k, v]) => [k.slice(5), v]));
    const ratings = Object.entries(raw).filter(([k, v]) => k.startsWith("rating__") && v !== "");
    if (ratings.length && raw.rubric === undefined) raw.rubric = { ratings: Object.fromEntries(ratings.map(([k, v]) => [k.slice(8), Number(v)])) };
    const result = await op.run({ store, actor: a, args: new Args(raw), tenant, sessionSecret: c.sessionSecret });
    if (method === "GET" && (raw.format === "csv" || op.name.endsWith("export_csv")) && typeof result === "string") return text(result, "text/csv; charset=utf-8", 200, { "content-disposition": `attachment; filename="${op.name}.csv"` });
    return ok(c, result, 200, {}, `${op.summary.split(/[.(]/)[0]}: done.`);
  }

  // Downloads: selected files as a zip; course export package (Common Cartridge + QTI).
  if (route === "files/zip" && method === "GET") {
    const ids = [...url.searchParams.getAll("ids[]"), ...(url.searchParams.get("ids")?.split(",") ?? [])].filter(Boolean).slice(0, 200);
    if (!ids.length) throw new CampusError("invalid", "Choose files to download.", 422);
    return new Response(new Uint8Array(zipFiles(store, a, ids)), { status: 200, headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="files.zip"', "cache-control": "no-store" } });
  }
  // Simulated Module labs as downloadable/viewable HTML (instructor edition is staff-only).
  if (rest[0] === "sim-labs" && rest[1] && rest[2] && method === "GET") {
    const edition = rest[2].replace(/\.html$/, "") as "student" | "instructor" | "app";
    if (!["student", "instructor", "app"].includes(edition)) throw new CampusError("not_found", "Unknown edition", 404);
    const teaches = Object.values(a.courseRoles ?? {}).some((r) => r.includes("instructor") || r.includes("ta"));
    if (edition === "instructor" && !teaches && !hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "The instructor edition contains answer keys and is for course staff.", 403);
    const lockCourse = url.searchParams.get("courseId");
    if (edition === "instructor" && lockCourse && answersLocked(store, lockCourse)) throw new CampusError("projection_locked", "Answer keys are hidden by the projection lock. Unlock them in the Instructor Control Panel first.", 423);
    const moduleNo = url.searchParams.get("module") ?? "";
    const html = simLabHtml(rest[1], edition, { module: moduleNo, program: url.searchParams.get("program") ?? undefined, pin: edition === "instructor" && lockCourse ? pinFor(store, lockCourse) : undefined });
    const name = simLabFileName(rest[1], edition, moduleNo);
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`, "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'", "x-content-type-options": "nosniff" } });
  }
  // Scholarion API integration layer (v1): REST aliases for the ecosystem operations.
  {
    const idem = req.headers.get("idempotency-key") ?? (body.idempotencyKey as string | undefined);
    const q = Object.fromEntries(url.searchParams);
    const page = (r: { items: unknown[]; total: number; page: number; pageSize: number }) => json({ data: r.items, page: { number: r.page, size: r.pageSize, total: r.total } });
    const filt = { q: q.q, subject: q.subject, category: q.category, status: q.status, connection: q.connection, freeOnly: q.free === "true" || q.freeOnly === "true", noCard: q.noCard === "true", api: q.api === "true", selfHosted: q.selfHosted === "true", accessible: q.accessible === "true", page: q.page ? Number(q.page) : undefined, pageSize: q.pageSize ? Number(q.pageSize) : undefined };
    if (method === "GET" && route === "resources") return page(eco.listResources(store, a, filt));
    if (method === "GET" && rest[0] === "resources" && rest[1] && rest.length === 2) return json({ data: eco.getResource(store, a, rest[1]) });
    if (method === "GET" && route === "tools") return page(eco.listResources(store, a, { ...filt, kind: "tool" }));
    if (method === "GET" && route === "courses/free") return page(eco.listResources(store, a, { ...filt, group: "library" }));
    if (method === "GET" && route === "employers") return json({ data: eco.listEmployers(store, a) });
    if (method === "GET" && route === "opportunities") return json({ data: eco.listOpportunities(store, { q: q.q, type: q.type, remote: q.remote }) });
    if (method === "GET" && route === "integrations") return page(eco.listResources(store, a, { ...filt, pageSize: filt.pageSize ?? 100 }));
    if (method === "POST" && rest[0] === "integrations" && rest[1] && rest[2] === "connections") return json({ data: eco.connect(store, a, rest[1], { credentialRef: body.credentialRef as string | undefined, scopes: (body.scopes as string[]) ?? [], eligibilityConfirmed: body.eligibilityConfirmed === true }, idem) }, 201);
    if (method === "GET" && rest[0] === "connections" && rest[1] && rest[2] === "health") return json({ data: eco.connectionHealth(store, a, rest[1]) });
    if (method === "DELETE" && rest[0] === "connections" && rest[1] && rest.length === 2) return json({ data: eco.disconnect(store, a, rest[1]) });
    if (method === "POST" && route === "discovery/jobs") return json({ data: eco.createJob(store, a, String(body.kind ?? ""), idem) }, 202);
    if (method === "GET" && rest[0] === "discovery" && rest[1] === "jobs" && rest[2]) return json({ data: eco.getJob(store, a, rest[2]) });
    if (method === "GET" && route === "schedules") {
      if (!a.roles.includes("admin")) throw new CampusError("forbidden", "Administrators only.", 403);
      return json({ data: eco.listSchedules(store) });
    }
    if (method === "POST" && route === "schedules") return json({ data: eco.upsertSchedule(store, a, body as never) }, 201);
    if (method === "PATCH" && rest[0] === "schedules" && rest[1]) return json({ data: eco.upsertSchedule(store, a, { ...(body as object), id: rest[1] } as never) });
    if (method === "GET" && rest[0] === "courses" && rest[1] && rest[2] === "resources") return json({ data: eco.courseResources(store, a, rest[1]) });
    if (method === "POST" && rest[0] === "courses" && rest[1] && rest[2] === "resource-mappings") return json({ data: eco.mapToCourse(store, a, { courseId: rest[1], resourceId: String(body.resourceId ?? ""), topic: body.topic as string | undefined, note: body.note as string | undefined }, idem) }, 201);
    if (method === "GET" && route === "me/career-profile") return json({ data: eco.myProfile(store, a) });
    if (method === "PATCH" && route === "me/career-profile") return json({ data: eco.saveProfile(store, a, body) });
    if (method === "GET" && route === "me/opportunity-matches") return json({ data: eco.myMatches(store, a) });
    if (method === "POST" && rest[0] === "opportunities" && rest[1] && rest[2] === "applications") {
      if (!idem) throw new CampusError("invalid", "Send an Idempotency-Key header.", 422);
      return json({ data: eco.apply(store, a, rest[1], { share: (body.share as string[]) ?? [], note: body.note as string | undefined }, idem) }, 201);
    }
  }
  // Hosted learning area downloads: Studio outputs, bundles and the gradebook CSV (access enforced by the services).
  if (rest[0] === "learn" && rest[1] && method === "GET") {
    const courseId = rest[1];
    if (rest[2] === "gradebook.csv") return new Response(gradedCsv(store, a, courseId), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${courseId}-gradebook.csv"`, "cache-control": "no-store" } });
    if (rest[2] === "outputs" && rest[3]) {
      const o = readOutput(store, a, rest[3]);
      if (o.access === "instructor" && answersLocked(store, courseId)) throw new CampusError("projection_locked", "Instructor files are hidden by the projection lock. Unlock them in the Instructor Control Panel first.", 423);
      const ext = String(o.relPath).split(".").pop()!.toLowerCase();
      const types: Record<string, string> = { html: "text/html; charset=utf-8", md: "text/markdown; charset=utf-8", txt: "text/plain; charset=utf-8", json: "application/json; charset=utf-8", csv: "text/csv; charset=utf-8", vtt: "text/vtt; charset=utf-8", svg: "image/svg+xml", png: "image/png", mp4: "video/mp4", mp3: "audio/mpeg", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", yaml: "text/plain; charset=utf-8", yml: "text/plain; charset=utf-8" };
      if (o.status === "awaiting_rendering" && !o.content.length) throw new CampusError("awaiting_rendering", `${o.relPath} is awaiting rendering: ${o.reason ?? "no media renderer is configured"}.`, 409);
      const body = typeof o.content === "string" ? o.content : new Uint8Array(o.content);
      const name = String(o.relPath).split("/").pop();
      return new Response(body, { status: 200, headers: { "content-type": types[ext] ?? "application/octet-stream", "content-disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'" } });
    }
    if (rest[2] === "runs" && rest[3] && /\.(json|html)$/.test(rest[3])) {
      const runId = rest[3].replace(/\.(json|html)$/, "");
      const run = wsp.getAgentRun(store, a, runId);
      if (rest[3].endsWith(".json")) return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), note: "Operational run log: actions, arguments, policy results and usage. No model reasoning is recorded.", run }, null, 2), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="run-${runId}.json"`, "cache-control": "no-store" } });
      const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
      const rows = run.steps.map((st) => `<tr><td>${st.index + 1}</td><td>${esc(st.tool)}</td><td><code>${esc(JSON.stringify(st.args))}</code></td><td>${st.ok ? "ok" : "blocked/failed"}</td><td>${esc(st.blockedReason ?? st.resultSummary)}</td><td>${esc(st.at)}</td></tr>`).join("");
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Run log ${esc(run.name)}</title><style>body{font:14px system-ui;margin:24px;color:#0f1a33}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:6px;text-align:left;vertical-align:top}code{font-size:12px}</style></head><body><h1>Run log: ${esc(run.name)}</h1><p>Status ${esc(run.status)}${run.stopReason ? ` — ${esc(run.stopReason)}` : ""} · policy v${run.policyVersion} · started ${esc(run.startedAt)} · simulated sandbox</p><p>Usage: ${esc(JSON.stringify(run.budget.used))} of ${esc(JSON.stringify(run.budget.limit))}</p><table><caption>Actions and policy results (no model reasoning is recorded)</caption><thead><tr><th scope="col">#</th><th scope="col">Tool</th><th scope="col">Arguments</th><th scope="col">Result</th><th scope="col">Detail</th><th scope="col">At</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff" } });
    }
    if (rest[2] === "studio-module" && rest[3] && rest[4] === "bundle.zip") {
      const b = moduleStudioBundle(store, a, courseId, Number(rest[3]));
      return new Response(new Uint8Array(b.zip), { status: 200, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${b.root}.zip"`, "cache-control": "no-store" } });
    }
    if (rest[2] === "studio" && rest[3] && rest[4] === "bundle.zip") {
      const z = bundleZip(store, a, rest[3]);
      return new Response(new Uint8Array(z), { status: 200, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="studio-${rest[3]}.zip"`, "cache-control": "no-store" } });
    }
  }
  // Lecture cover slides and video title cards for any program module.
  if (rest[0] === "covers" && rest[1] && rest[2] && rest[3] && method === "GET") {
    const kind = rest[3].replace(/\.html$/, "") as CoverKind;
    if (kind !== "slide" && kind !== "title-card") throw new CampusError("not_found", "Unknown cover type", 404);
    return new Response(coverHtml(store, rest[1], decodeURIComponent(rest[2]), kind), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self'; base-uri 'none'; form-action 'none'", "x-content-type-options": "nosniff" } });
  }
  if (rest[0] === "assess" && rest[1] && (rest[2] === "qti.xml" || rest[2] === "item-bank.json") && method === "GET") {
    if (rest[2] === "qti.xml") return new Response(qtiXml(store, a, rest[1]), { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${rest[1]}-qti21.xml"`, "cache-control": "no-store" } });
    const v = draftView(store, a, rest[1], "instructor");
    if (!v.bank) throw new CampusError("not_found", "This draft has no item bank.", 404);
    return new Response(JSON.stringify(v.bank, null, 2), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${rest[1]}-item-bank.json"`, "cache-control": "no-store" } });
  }
  if (rest[0] === "courses" && rest[2] === "export" && method === "GET") {
    const bytes = exportCourse(store, a, rest[1]);
    return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${rest[1].replace(/[^a-z0-9_-]/gi, "")}-export.imscc"`, "cache-control": "no-store" } });
  }

  // Generic resources: /r/:table[/:id[/publish|restore]]
  if (rest[0] === "r" && rest[1]) {
    const table = rest[1];
    if (!ENTITY[table]) throw new CampusError("not_found", "Unknown resource", 404);
    if (c.scopes && !scopeAllows(c.scopes, method, table)) throw new CampusError("insufficient_scope", "This token's scopes don't allow that.", 403);
    const id = rest[2];
    const ifVersion = req.headers.get("if-match") ? Number(req.headers.get("if-match")!.replace(/[^0-9]/g, "")) : body.ifVersion !== undefined && body.ifVersion !== "" ? Number(body.ifVersion) : undefined;
    const clean = Object.fromEntries(Object.entries(body).filter(([k, v]) => !["back", "_method", "notice", "ifVersion", "show_result"].includes(k) && typeof v !== "object" || Array.isArray(v)));
    if (!id) {
      if (method === "GET") {
        const where = Object.fromEntries([...url.searchParams].filter(([k]) => !["cursor", "limit", "q", "courseId", "includeDeleted", "as_user_id", "sort", "include[]", "exclude[]", "include", "exclude"].includes(k)));
        const r = entity.list(store, a, table, { courseId: url.searchParams.get("courseId") ?? undefined, where, search: url.searchParams.get("q") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined, limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined, includeDeleted: url.searchParams.get("includeDeleted") === "1" });
        return ok(c, r.items.map((row) => shape(store, a, table, row as Row, url)), 200, { ...linkHeader(c, r.next), "x-total-count": String(r.total) });
      }
      if (method === "POST") return ok(c, entity.create(store, a, table, clean), 201, {}, `${ENTITY[table].label} created.`);
    } else {
      if (rest[3] === "publish") return ok(c, entity.publish(store, a, table, id, method !== "DELETE" && body.on !== "false"), 200, {}, method === "DELETE" || body.on === "false" ? "Unpublished." : "Published.");
      if (rest[3] === "restore" && method === "POST") return ok(c, entity.restore(store, a, table, id), 200, {}, "Restored.");
      if (method === "GET") {
        const row = entity.read(store, a, table, id, { includeDeleted: url.searchParams.get("includeDeleted") === "1" });
        return ok(c, shape(store, a, table, row as Row, url), 200, { etag: `"${row.version}"` });
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

/**
 * REST include/exclude: `exclude[]=field` drops fields; `include[]=course` embeds the row a
 * reference field points to (courseId → course), read with the caller's own permissions.
 */
function shape(store: TenantStore, a: Actor, table: string, row: Row, url: URL): Row {
  const list = (k: string) => [...url.searchParams.getAll(`${k}[]`), ...(url.searchParams.get(k)?.split(",") ?? [])].map((x) => x.trim()).filter(Boolean);
  const exclude = list("exclude");
  const include = list("include");
  if (!exclude.length && !include.length) return row;
  const out: Row = { ...row };
  for (const f of exclude) if (!["id", "version"].includes(f)) delete out[f];
  for (const name of include) {
    const field = ENTITY[table].fields.find((f) => f.type === "ref" && (f.name === `${name}Id` || f.name === name));
    if (!field?.ref || !row[field.name]) continue;
    try {
      out[name] = entity.read(store, a, field.ref, String(row[field.name]));
    } catch {
      out[name] = null;
    }
  }
  return out;
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

/** Every campus download can be fetched as PDF, Word or Excel (?format=pdf|docx|xlsx); bundles carry office copies. */
export async function handleCampus(req: Request, path: string): Promise<Response> {
  const res = await handleCampusInner(req, path);
  try {
    return await officeResponse(req, res, path.split("/").filter(Boolean).slice(-1)[0] ?? "document");
  } catch (e) {
    return json({ error: { code: "conversion_failed", message: `The document couldn't be converted: ${(e as Error).message}` } }, 500);
  }
}

async function handleCampusInner(req: Request, path: string): Promise<Response> {
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
