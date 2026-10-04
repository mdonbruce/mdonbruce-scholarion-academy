import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { broker, CampusError, id, metrics, nowIso, nowMs, sha256, token, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { cloudlab } from "../../platform/cloudlab";
import { assertAccessible } from "./curriculum";
import { audit, isStaff, requireTenant } from "./common";
import { setGrade } from "./grading";
import { pseudonym } from "./success";
import { similaritySignal } from "./tutor";

/**
 * LTI 1.3 / Advantage, implemented in-house on both sides:
 *  - Platform: OIDC-style launch id_token (RS256, per-tenant key, JWKS), Assignment & Grade
 *    Services (scores arrive UNPOSTED for teacher review), Names & Role Provisioning,
 *    Deep Linking responses and Dynamic Registration.
 *  - Tool: the Scholarion Cloud Lab, which verifies the launch, runs code in the local
 *    sandbox runner (Python, time/memory limits, no network) and passes the score back.
 * External tools use the same endpoints with their own registered keys.
 */

export const LTI_VERSION = "1.3.0";
const CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";
const AGS = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";
const NRPS = "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice";
const DL = "https://purl.imsglobal.org/spec/lti-dl/claim/";
export const SCOPES = {
  lineitem: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  score: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
  result: "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  nrps: "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
};
const ROLE_URI: Record<string, string> = {
  student: "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner",
  instructor: "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
  ta: "http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant",
  designer: "http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper",
  observer: "http://purl.imsglobal.org/vocab/lis/v2/membership#Mentor",
  admin: "http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator",
};
export const CLOUD_LAB_CLIENT_ID = "scholarion-cloud-lab";

/* ---------------- JWT (RS256) ---------------- */

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function signJwt(payload: Record<string, unknown>, privatePem: string, kid: string): string {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = b64(JSON.stringify(payload));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), createPrivateKey(privatePem));
  return `${head}.${body}.${b64(sig)}`;
}

export function decodeJwt(jwt: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signed: string; sig: Buffer } {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new CampusError("invalid_token", "Malformed token", 401);
  try {
    return { header: JSON.parse(unb64(parts[0]).toString()), payload: JSON.parse(unb64(parts[1]).toString()), signed: `${parts[0]}.${parts[1]}`, sig: unb64(parts[2]) };
  } catch {
    throw new CampusError("invalid_token", "Malformed token", 401);
  }
}

export function verifyJwt(jwt: string, publicPem: string, opts: { aud?: string; iss?: string } = {}): Record<string, unknown> {
  const d = decodeJwt(jwt);
  if (d.header.alg !== "RS256") throw new CampusError("invalid_token", "Unsupported algorithm", 401);
  if (!verify("sha256", Buffer.from(d.signed), createPublicKey(publicPem), d.sig)) throw new CampusError("invalid_token", "Bad signature", 401);
  const p = d.payload;
  const now = Math.floor(nowMs() / 1000);
  if (typeof p.exp !== "number" || p.exp < now) throw new CampusError("invalid_token", "Token expired", 401);
  if (typeof p.iat === "number" && p.iat > now + 60) throw new CampusError("invalid_token", "Token issued in the future", 401);
  if (opts.aud && !(Array.isArray(p.aud) ? p.aud.includes(opts.aud) : p.aud === opts.aud)) throw new CampusError("invalid_token", "Wrong audience", 401);
  if (opts.iss && p.iss !== opts.iss) throw new CampusError("invalid_token", "Wrong issuer", 401);
  return p;
}

/* ---------------- Keys ---------------- */

function rsaKey(store: TenantStore, kind: "lti_platform" | "lti_tool"): Row {
  let k = store.list("lti_keys", (x) => x.kind === kind && !x.retiredAt)[0];
  if (!k) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    k = store.insert("lti_keys", { kind, kid: `${kind}-${id("k").slice(-8)}`, publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, "lk");
  }
  return k;
}

export function platformIssuer(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  return `https://${t.slug}.campus.scholarion.local`;
}

/** Public JWKS for this tenant's platform key (tools verify launches with it). */
export function jwks(store: TenantStore) {
  const k = rsaKey(store, "lti_platform");
  const jwk = createPublicKey(String(k.publicPem)).export({ format: "jwk" }) as Record<string, unknown>;
  return { keys: [{ ...jwk, kid: k.kid, alg: "RS256", use: "sig" }] };
}

/** Rotate the platform key; the previous key stays in JWKS until retired. */
export function rotatePlatformKey(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "lti.key.rotate");
  return store.tx(() => {
    for (const k of store.list("lti_keys", (x) => x.kind === "lti_platform" && !x.retiredAt)) store.update("lti_keys", k.id, { retiredAt: nowIso() });
    const k = rsaKey(store, "lti_platform");
    audit(store, a, "lti.key.rotate", `lti_keys/${k.id}`);
    return { kid: k.kid };
  });
}

/** The built-in Cloud Lab tool registration (created on first use, using the tool key). */
export function ensureCloudLabTool(store: TenantStore): Row {
  const existing = store.list("tool_registrations", (t) => t.clientId === CLOUD_LAB_CLIENT_ID)[0];
  if (existing) return existing;
  rsaKey(store, "lti_tool");
  return store.insert("tool_registrations", { name: "Scholarion Cloud Lab", clientId: CLOUD_LAB_CLIENT_ID, issuer: "https://cloudlab.scholarion.local", launchUrl: "https://cloudlab.scholarion.local/lti/launch", jwksUrl: "https://cloudlab.scholarion.local/.well-known/jwks.json", services: ["ags", "nrps", "deep_linking"], enabled: true, secretRef: "internal://cloud-lab-key", deploymentId: "dep-cloudlab", builtIn: true }, "lti");
}

function toolPublicPem(store: TenantStore, tool: Row): string {
  if (tool.clientId === CLOUD_LAB_CLIENT_ID) return String(rsaKey(store, "lti_tool").publicPem);
  if (!tool.publicPem) throw new CampusError("tool_key_missing", "This tool has no registered public key.", 409);
  return String(tool.publicPem);
}

/* ---------------- Launch ---------------- */

function ltiRoles(a: Actor, courseId: string) {
  const roles = new Set<string>();
  for (const r of a.courseRoles[courseId] ?? []) if (ROLE_URI[r]) roles.add(ROLE_URI[r]);
  if (a.roles.includes("admin")) roles.add(ROLE_URI.admin);
  return [...roles];
}

/** Build and sign a resource-link launch for an assignment backed by an LTI tool or a Cloud Lab template. */
export function launch(store: TenantStore, a: Actor, assignmentId: string) {
  const asg = store.get("assignments", assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  const courseId = asg.courseId as string;
  if (!isStaff(a, courseId)) assertAccessible(store, a, "assignment", assignmentId);
  if (!(a.courseRoles[courseId] ?? []).length && !a.roles.includes("admin")) throw new CampusError("forbidden", "You're not in this course.", 403);
  const tool = asg.ltiToolId ? store.get("tool_registrations", asg.ltiToolId as string) : asg.labTemplateId ? ensureCloudLabTool(store) : undefined;
  if (!tool) throw new CampusError("invalid", "This assignment doesn't launch a tool.", 422);
  if (!tool.enabled) throw new CampusError("tool_disabled", `${tool.name} is turned off for this school.`, 423);
  const key = rsaKey(store, "lti_platform");
  const iss = platformIssuer(store);
  const nonce = token(12);
  const jti = id("jti");
  const now = Math.floor(nowMs() / 1000);
  const c = store.get("courses", courseId)!;
  const base = `${iss}/api/campus/v1/t/${broker.tenant(store.tenantId)!.slug}/lti`;
  const claims: Record<string, unknown> = {
    iss,
    aud: tool.clientId,
    sub: pseudonym(store.tenantId, a.id),
    iat: now,
    exp: now + 300,
    nonce,
    jti,
    [`${CLAIM}message_type`]: "LtiResourceLinkRequest",
    [`${CLAIM}version`]: LTI_VERSION,
    [`${CLAIM}deployment_id`]: tool.deploymentId ?? `dep-${tool.id}`,
    [`${CLAIM}target_link_uri`]: tool.launchUrl,
    [`${CLAIM}resource_link`]: { id: assignmentId, title: asg.title },
    [`${CLAIM}context`]: { id: courseId, label: c.code, title: c.title, type: ["http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering"] },
    [`${CLAIM}roles`]: ltiRoles(a, courseId),
    [`${CLAIM}custom`]: asg.labTemplateId ? { lab_template_id: asg.labTemplateId } : {},
    [AGS]: { scope: [SCOPES.lineitem, SCOPES.score, SCOPES.result], lineitem: `${base}/lineitems/${assignmentId}`, lineitems: `${base}/courses/${courseId}/lineitems` },
    [NRPS]: { context_memberships_url: `${base}/courses/${courseId}/memberships`, service_versions: ["2.0"] },
  };
  const idToken = signJwt(claims, String(key.privatePem), String(key.kid));
  return store.tx(() => {
    store.insert("lti_launches", { jti, nonce, userId: a.id, toolId: tool.id, assignmentId, courseId, expiresAt: new Date((now + 300) * 1000).toISOString(), usedAt: null }, "ll");
    let session: Row | undefined;
    if (asg.labTemplateId) {
      const lt = store.get("lab_templates", asg.labTemplateId as string);
      if (!lt) throw new CampusError("not_found", "Lab template not found", 404);
      session = store.list("lab_sessions", (s) => s.userId === a.id && s.assignmentId === assignmentId)[0];
      session = session ? store.update("lab_sessions", session.id, { launchJti: jti, state: "launched" }) : store.insert("lab_sessions", { userId: a.id, templateId: lt.id, assignmentId, courseId, launchJti: jti, state: "launched", code: lt.starterCode, score: null }, "ls");
    }
    audit(store, a, "lti.launch", `assignments/${assignmentId}`, String(tool.clientId));
    metrics.inc("lti_launch_total", { tool: String(tool.clientId) });
    return { idToken, launchUrl: tool.launchUrl as string, state: token(8), sessionId: session?.id ?? null };
  });
}

/* ---------------- Cloud Lab (the tool side) ---------------- */

/** The Cloud Lab verifies the launch: signature (platform JWKS), audience, expiry and single-use nonce. */
export function toolReceiveLaunch(store: TenantStore, idToken: string) {
  const d = decodeJwt(idToken);
  const key = store.list("lti_keys", (k) => k.kind === "lti_platform" && k.kid === d.header.kid)[0];
  if (!key) throw new CampusError("invalid_token", "Unknown signing key", 401);
  const p = verifyJwt(idToken, String(key.publicPem), { aud: CLOUD_LAB_CLIENT_ID, iss: platformIssuer(store) });
  if (p[`${CLAIM}message_type`] !== "LtiResourceLinkRequest" || p[`${CLAIM}version`] !== LTI_VERSION) throw new CampusError("invalid_token", "Not an LTI 1.3 resource link launch", 401);
  const rec = store.list("lti_launches", (l) => l.jti === p.jti)[0];
  if (!rec || rec.nonce !== p.nonce) throw new CampusError("invalid_token", "Unknown launch", 401);
  if (rec.usedAt) throw new CampusError("replay", "This launch was already used. Launch again from the course.", 401);
  return store.tx(() => {
    store.update("lti_launches", rec.id, { usedAt: nowIso() });
    const session = store.list("lab_sessions", (s) => s.launchJti === p.jti)[0];
    if (!session) throw new CampusError("not_found", "Lab session not found", 404);
    const tpl = store.get("lab_templates", session.templateId as string)!;
    store.update("lab_sessions", session.id, { state: "running" });
    return { sessionId: session.id, title: tpl.title, instructions: tpl.instructions, code: session.code, roles: p[`${CLAIM}roles`], lineitem: (p[AGS] as { lineitem: string }).lineitem, runner: cloudlab.runnerName() };
  });
}

function ownSession(store: TenantStore, a: Actor, sessionId: string): Row {
  const s = store.get("lab_sessions", sessionId);
  if (!s || s.userId !== a.id) throw new CampusError("not_found", "Lab session not found", 404);
  if (s.state === "launched") throw new CampusError("not_launched", "Open the lab from the course first.", 409);
  return s;
}

export function labSave(store: TenantStore, a: Actor, sessionId: string, code: string) {
  const s = ownSession(store, a, sessionId);
  if (code.length > 100_000) throw new CampusError("too_large", "Code is too large for this lab.", 413);
  return store.tx(() => store.update("lab_sessions", s.id, { code }));
}

/** Run the hidden tests in the sandbox; on success the tool passes the score back through AGS. */
export function labSubmit(store: TenantStore, a: Actor, sessionId: string, code?: string) {
  const s = ownSession(store, a, sessionId);
  if (code !== undefined) labSave(store, a, sessionId, code);
  const tpl = store.get("lab_templates", s.templateId as string)!;
  const tests = (tpl.tests as { name: string; code: string; points: number }[]) ?? [];
  const r = cloudlab.check(String(store.get("lab_sessions", s.id)!.code), tests);
  if (!r.ran) return { ran: false, score: null, max: r.max, feedback: [], error: r.error, passedBack: false };
  const scaled = r.max ? Math.round((r.score / r.max) * Number(tpl.maxScore ?? r.max) * 100) / 100 : 0;
  // Tool side: get an AGS token with a signed client assertion, then post the score.
  const assertion = toolClientAssertion(store);
  const tok = agsToken(store, assertion, [SCOPES.score]);
  const posted = agsPostScore(store, tok.access_token, s.assignmentId as string, { userId: pseudonym(store.tenantId, a.id), scoreGiven: scaled, scoreMaximum: Number(tpl.maxScore ?? r.max), activityProgress: "Completed", gradingProgress: "FullyGraded", timestamp: nowIso() });
  store.tx(() => {
    store.update("lab_sessions", s.id, { score: scaled, state: "graded", agsPostedAt: nowIso() });
    const prior = store.list("submissions", (x) => x.assignmentId === s.assignmentId && x.userId === a.id).length;
    store.insert("submissions", { assignmentId: s.assignmentId, userId: a.id, courseId: s.courseId, mode: "lti", body: null, url: null, attempt: prior + 1, state: "graded", late: false, groupId: null, groupMemberIds: [a.id], labSessionId: s.id }, "sub");
    similaritySignal(store, s.id);
  });
  return { ran: true, score: scaled, max: Number(tpl.maxScore ?? r.max), feedback: r.feedback, error: r.error, passedBack: true, gradeId: posted.gradeId, posted: false };
}

/** Client-credentials assertion signed with the tool's key (as an external tool would do). */
export function toolClientAssertion(store: TenantStore, clientId = CLOUD_LAB_CLIENT_ID) {
  const k = rsaKey(store, "lti_tool");
  const now = Math.floor(nowMs() / 1000);
  return signJwt({ iss: clientId, sub: clientId, aud: `${platformIssuer(store)}/oauth2/token`, iat: now, exp: now + 300, jti: id("ca") }, String(k.privatePem), String(k.kid));
}

/* ---------------- OAuth2 for LTI services ---------------- */

/** POST /oauth2/token (client_credentials + JWT client assertion). */
export function agsToken(store: TenantStore, clientAssertion: string, scopes: string[]) {
  const d = decodeJwt(clientAssertion);
  const tool = store.list("tool_registrations", (t) => t.clientId === d.payload.iss)[0];
  if (!tool || !tool.enabled) throw new CampusError("invalid_client", "Unknown or disabled tool", 401);
  verifyJwt(clientAssertion, toolPublicPem(store, tool), { aud: `${platformIssuer(store)}/oauth2/token` });
  if (store.list("lti_tokens", (t) => t.assertionJti === d.payload.jti).length) throw new CampusError("replay", "Client assertion already used", 401);
  const allowed = new Set<string>([...(((tool.services as string[]) ?? []).includes("ags") ? [SCOPES.lineitem, SCOPES.score, SCOPES.result] : []), ...(((tool.services as string[]) ?? []).includes("nrps") ? [SCOPES.nrps] : [])]);
  const granted = scopes.filter((s) => allowed.has(s));
  if (!granted.length) throw new CampusError("invalid_scope", "None of the requested scopes are enabled for this tool.", 400);
  const secret = token(24);
  store.tx(() => store.insert("lti_tokens", { toolId: tool.id, tokenHash: sha256(secret), scopes: granted, expiresAt: new Date(nowMs() + 3600_000).toISOString(), assertionJti: d.payload.jti }, "ltk"));
  return { access_token: secret, token_type: "Bearer", expires_in: 3600, scope: granted.join(" ") };
}

function bearer(store: TenantStore, secret: string, scope: string): Row {
  const t = store.list("lti_tokens", (x) => x.tokenHash === sha256(secret))[0];
  if (!t || String(t.expiresAt) < nowIso()) throw new CampusError("invalid_token", "Invalid or expired access token", 401);
  if (!((t.scopes as string[]) ?? []).includes(scope)) throw new CampusError("insufficient_scope", "Token lacks the required scope", 403);
  return store.get("tool_registrations", t.toolId as string)!;
}

function userFromSub(store: TenantStore, sub: string): Row | undefined {
  return store.list("users", (u) => pseudonym(store.tenantId, u.id) === sub)[0];
}

/** AGS score service. Scores are written as UNPOSTED grades so the teacher reviews before release. */
export function agsPostScore(store: TenantStore, secret: string, assignmentId: string, score: { userId: string; scoreGiven: number; scoreMaximum: number; activityProgress: string; gradingProgress: string; timestamp: string; comment?: string }) {
  const tool = bearer(store, secret, SCOPES.score);
  const asg = store.get("assignments", assignmentId);
  if (!asg) throw new CampusError("not_found", "Line item not found", 404);
  const ownsLineItem = asg.ltiToolId === tool.id || (tool.clientId === CLOUD_LAB_CLIENT_ID && !!asg.labTemplateId);
  if (!ownsLineItem) throw new CampusError("forbidden", "This tool doesn't own that line item.", 403);
  const u = userFromSub(store, score.userId);
  if (!u) throw new CampusError("not_found", "Unknown user", 404);
  if (score.gradingProgress !== "FullyGraded") return { gradeId: null, note: "Progress recorded; no grade until FullyGraded." };
  const pts = Number(asg.points ?? score.scoreMaximum);
  const value = score.scoreMaximum ? Math.round((score.scoreGiven / score.scoreMaximum) * pts * 100) / 100 : 0;
  const g = setGrade(store, null, { assignmentId, userId: u.id, score: value, source: "lti", holdForReview: true, comment: score.comment });
  metrics.inc("lti_ags_scores_total", { tool: String(tool.clientId) });
  return { gradeId: (g as { id?: string }).id ?? null };
}

/** AGS line items for a course (assignments owned by the tool). */
export function agsLineItems(store: TenantStore, secret: string, courseId: string) {
  const tool = bearer(store, secret, SCOPES.lineitem);
  return store
    .list("assignments", (x) => x.courseId === courseId && (x.ltiToolId === tool.id || (tool.clientId === CLOUD_LAB_CLIENT_ID && !!x.labTemplateId)))
    .map((x) => ({ id: x.id, label: x.title, scoreMaximum: x.points, resourceLinkId: x.id }));
}

/** NRPS membership: pseudonymous ids, names only if the tool is trusted with them. */
export function nrpsMembers(store: TenantStore, secret: string, courseId: string) {
  const tool = bearer(store, secret, SCOPES.nrps);
  const share = !!tool.shareNames || tool.clientId === CLOUD_LAB_CLIENT_ID;
  const c = store.get("courses", courseId);
  if (!c) throw new CampusError("not_found", "Context not found", 404);
  const members = store
    .list("enrollments", (e) => e.courseId === courseId && e.state === "active")
    .map((e) => ({ user_id: pseudonym(store.tenantId, e.userId as string), roles: ROLE_URI[e.role as string] ? [ROLE_URI[e.role as string]] : [], status: "Active", ...(share ? { name: store.get("users", e.userId as string)?.name } : {}) }));
  return { id: `${platformIssuer(store)}/courses/${courseId}/memberships`, context: { id: courseId, label: c.code, title: c.title }, members };
}

/* ---------------- Deep linking ---------------- */

export function deepLinkRequest(store: TenantStore, a: Actor, toolId: string, courseId: string, moduleId: string) {
  if (!isStaff(a, courseId)) throw new CampusError("forbidden", "Only course staff can add tool content.", 403);
  const tool = store.get("tool_registrations", toolId);
  if (!tool?.enabled || !((tool.services as string[]) ?? []).includes("deep_linking")) throw new CampusError("invalid", "This tool doesn't support content selection.", 422);
  const key = rsaKey(store, "lti_platform");
  const now = Math.floor(nowMs() / 1000);
  const data = token(10);
  store.tx(() => store.insert("lti_dl_requests", { data, toolId, courseId, moduleId, userId: a.id, expiresAt: new Date((now + 600) * 1000).toISOString() }, "dl"));
  return {
    idToken: signJwt({ iss: platformIssuer(store), aud: tool.clientId, sub: pseudonym(store.tenantId, a.id), iat: now, exp: now + 600, nonce: token(8), [`${CLAIM}message_type`]: "LtiDeepLinkingRequest", [`${CLAIM}version`]: LTI_VERSION, [`${CLAIM}deployment_id`]: tool.deploymentId ?? `dep-${tool.id}`, [`${DL}deep_linking_settings`]: { deep_link_return_url: `${platformIssuer(store)}/lti/deep_link_return`, accept_types: ["ltiResourceLink", "link"], accept_multiple: true, data } }, String(key.privatePem), String(key.kid)),
  };
}

/** The tool returns a signed LtiDeepLinkingResponse; selected items become module items. */
export function deepLinkReturn(store: TenantStore, a: Actor, jwt: string) {
  const d = decodeJwt(jwt);
  const tool = store.list("tool_registrations", (t) => t.clientId === d.payload.iss)[0];
  if (!tool) throw new CampusError("invalid_token", "Unknown tool", 401);
  const p = verifyJwt(jwt, toolPublicPem(store, tool), { aud: platformIssuer(store) });
  if (p[`${CLAIM}message_type`] !== "LtiDeepLinkingResponse") throw new CampusError("invalid_token", "Not a deep linking response", 401);
  const req = store.list("lti_dl_requests", (r) => r.data === p[`${DL}data`] && r.toolId === tool.id)[0];
  if (!req || req.userId !== a.id || String(req.expiresAt) < nowIso() || req.usedAt) throw new CampusError("invalid_token", "Content selection expired or was already used.", 401);
  const items = (p[`${DL}content_items`] as { type: string; title?: string; url?: string }[]) ?? [];
  return store.tx(() => {
    store.update("lti_dl_requests", req.id, { usedAt: nowIso() });
    let pos = store.list("module_items", (m) => m.moduleId === req.moduleId).length;
    const created = items.slice(0, 20).map((it) =>
      store.insert("module_items", { courseId: req.courseId, moduleId: req.moduleId, kind: it.type === "link" ? "url" : "lti", refId: tool.id, title: String(it.title ?? tool.name).slice(0, 200), url: it.url ?? tool.launchUrl, position: ++pos, indent: 0, requirement: "view", state: "unpublished" }, "mi"),
    );
    audit(store, a, "lti.deep_link", `modules/${req.moduleId}`, `${created.length} item(s)`);
    return { created: created.map((c) => c.id) };
  });
}

/** Sign a deep-linking response as the Cloud Lab tool (used by the built-in tool UI and tests). */
export function cloudLabDeepLinkResponse(store: TenantStore, requestToken: string, items: { type: string; title: string; url?: string }[]) {
  const req = decodeJwt(requestToken).payload;
  const k = rsaKey(store, "lti_tool");
  const now = Math.floor(nowMs() / 1000);
  return signJwt({ iss: CLOUD_LAB_CLIENT_ID, aud: platformIssuer(store), iat: now, exp: now + 300, nonce: token(8), [`${CLAIM}message_type`]: "LtiDeepLinkingResponse", [`${CLAIM}version`]: LTI_VERSION, [`${DL}data`]: (req[`${DL}deep_linking_settings`] as { data: string }).data, [`${DL}content_items`]: items }, String(k.privatePem), String(k.kid));
}

/* ---------------- Dynamic registration ---------------- */

/** Accept a tool's registration request. The tool starts disabled until an admin enables it. */
export function dynamicRegister(store: TenantStore, a: Actor, reg: { client_name: string; initiate_login_uri?: string; redirect_uris?: string[]; jwks_uri?: string; public_pem?: string; scope?: string; target_link_uri: string }) {
  requireTenant(store, a, ["admin"], "lti.dynamic_register");
  if (!/^https:\/\//.test(reg.target_link_uri)) throw new CampusError("invalid", "target_link_uri must be https.", 422);
  if (!reg.public_pem && !reg.jwks_uri) throw new CampusError("invalid", "A public key (jwks_uri or public_pem) is required.", 422);
  if (reg.public_pem) {
    try {
      createPublicKey(reg.public_pem);
    } catch {
      throw new CampusError("invalid", "public_pem isn't a valid public key.", 422);
    }
  }
  const scopes = (reg.scope ?? "").split(/\s+/).filter(Boolean);
  const services = [scopes.some((s) => s.includes("lti-ags")) ? "ags" : null, scopes.some((s) => s.includes("lti-nrps")) ? "nrps" : null, "deep_linking"].filter(Boolean) as string[];
  return store.tx(() => {
    const clientId = `tool-${token(9)}`;
    const t = store.insert("tool_registrations", { name: reg.client_name.slice(0, 120), clientId, issuer: reg.target_link_uri, launchUrl: reg.target_link_uri, jwksUrl: reg.jwks_uri ?? null, publicPem: reg.public_pem ?? null, services, enabled: false, secretRef: "jwks", deploymentId: `dep-${token(6)}` }, "lti");
    audit(store, a, "lti.dynamic_register", `tool_registrations/${t.id}`, reg.client_name);
    return { client_id: clientId, registration_client_uri: `${platformIssuer(store)}/lti/registrations/${t.id}`, "https://purl.imsglobal.org/spec/lti-tool-configuration": { domain: new URL(reg.target_link_uri).host, target_link_uri: reg.target_link_uri, deployment_id: t.deploymentId }, enabled: false, note: "An admin must enable the tool before it can launch." };
  });
}

/** Platform OpenID configuration for dynamic registration. */
export function openidConfiguration(store: TenantStore) {
  const iss = platformIssuer(store);
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/lti/authorize`,
    token_endpoint: `${iss}/oauth2/token`,
    jwks_uri: `${iss}/.well-known/jwks.json`,
    registration_endpoint: `${iss}/lti/register`,
    scopes_supported: ["openid", ...Object.values(SCOPES)],
    token_endpoint_auth_methods_supported: ["private_key_jwt"],
    id_token_signing_alg_values_supported: ["RS256"],
    "https://purl.imsglobal.org/spec/lti-platform-configuration": { product_family_code: "scholarion", version: LTI_VERSION, messages_supported: [{ type: "LtiResourceLinkRequest" }, { type: "LtiDeepLinkingRequest" }] },
  };
}

export function labSessionsFor(store: TenantStore, a: Actor, courseId: string) {
  if (!hasAny(a, ["admin", "instructor", "ta"], courseId)) throw new CampusError("forbidden", "Only graders can see lab sessions.", 403);
  return store.list("lab_sessions", (s) => s.courseId === courseId);
}
