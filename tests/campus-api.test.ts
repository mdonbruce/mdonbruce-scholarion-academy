import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type http2 from "node:http2";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { handleCampus } from "../src/campus/http/router";
import { grpcCall, startGrpcServer, encode, decode, MESSAGES } from "../src/campus/http/grpc";
import { demoTotp } from "../src/campus/iam";
import { DEMO_MFA_SECRET, DEMO_PASSWORD } from "../src/campus/seed";
import * as integration from "../src/campus/services/integration";
import * as lti from "../src/campus/services/lti";
import { allOperations } from "../src/campus/http/ops";

const BASE = "http://localhost:3000/api/campus/";

async function call(path: string, init: RequestInit & { cookie?: string; bearer?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.bearer) headers.set("authorization", `Bearer ${init.bearer}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const req = new Request(BASE + path, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  const res = await handleCampus(req, path.split("?")[0]);
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { res, data: data as any };
}

async function signin(slug: string, key: string, mfa = false) {
  const json: Record<string, string> = { email: `${key}@${slug}.scholarion.test`, password: DEMO_PASSWORD };
  if (mfa) json.code = demoTotp(DEMO_MFA_SECRET);
  const r = await call(`v1/t/${slug}/auth/signin`, { json });
  assert.equal(r.res.status, 200, JSON.stringify(r.data));
  return r.res.headers.get("set-cookie")!.split(";")[0];
}

describe("Campus HTTP API", () => {
  let grpc: http2.Http2Server;
  let port = 0;
  before(async () => {
    freshCampus();
    port = 50000 + Math.floor(Math.random() * 5000);
    grpc = await startGrpcServer(port);
  });
  after(() => grpc.close());

  it("staff sign-in needs the TOTP code; the session cookie is per tenant", async () => {
    const first = await call("v1/t/demo/auth/signin", { json: { email: "admin@demo.scholarion.test", password: DEMO_PASSWORD } });
    assert.equal(first.res.status, 401);
    assert.equal(first.data.needsMfa, true);
    const cookie = await signin("demo", "admin", true);
    assert.match(cookie, /^scc_tn_demo=/);
    const me = await call("v1/t/demo/me", { cookie });
    assert.equal(me.data.data.name, "Avery Admin");
    // The same cookie means nothing in another tenant.
    const other = await call("v1/t/techdev/me", { cookie: cookie.replace("scc_tn_demo", "scc_tn_techdev") });
    assert.equal(other.res.status, 401);
  });

  it("unknown tenants are refused before any data access; host and slug must agree", async () => {
    assert.equal((await call("v1/t/nope/me")).res.status, 404);
    const r = await call("v1/t/techdev/me", { headers: { host: "demo.campus.scholarion.localhost" } });
    assert.equal(r.res.status, 403);
  });

  it("REST: Link-header pagination, ETag + If-Match (412), form posts redirect with a notice", async () => {
    const cookie = await signin("demo", "instructor");
    const p1 = await call("v1/t/demo/r/pages?courseId=crs_demo_cs101&limit=2", { cookie });
    assert.equal(p1.data.data.length, 2);
    const link = p1.res.headers.get("link")!;
    assert.match(link, /rel="next"/);
    const next = link.slice(link.indexOf("<") + 1, link.indexOf(">")).replace("/api/campus/", "");
    const p2 = await call(next, { cookie });
    assert.ok(p2.data.data.length >= 1);
    assert.notEqual(p2.data.data[0].id, p1.data.data[0].id);
    const one = await call("v1/t/demo/r/pages/pg_demo_variables", { cookie });
    const etag = one.res.headers.get("etag")!;
    const upd = await call("v1/t/demo/r/pages/pg_demo_variables", { cookie, method: "PATCH", json: { title: "Variables and data types" }, headers: { "if-match": etag } });
    assert.equal(upd.res.status, 200, JSON.stringify(upd.data));
    const stale = await call("v1/t/demo/r/pages/pg_demo_variables", { cookie, method: "PATCH", json: { title: "Stale edit" }, headers: { "if-match": etag } });
    assert.equal(stale.res.status, 412);
    const form = new URLSearchParams({ courseId: "crs_demo_cs101", title: "Exam tips", body: "Bring a pencil.", back: "/campus/demo/courses/crs_demo_cs101/announcements" });
    const f = await call("v1/t/demo/r/announcements", { cookie, method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000", host: "localhost:3000" } });
    assert.equal(f.res.status, 303);
    assert.match(f.res.headers.get("location")!, /notice=/);
  });

  it("cross-site form posts are blocked", async () => {
    const cookie = await signin("demo", "instructor");
    const r = await call("v1/t/demo/a/discussion.post", { cookie, method: "POST", body: new URLSearchParams({ topicId: "dt_demo_intro", body: "x" }), headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", host: "localhost:3000" } });
    assert.equal(r.res.status, 303);
    assert.match(decodeURIComponent(r.res.headers.get("location")!), /Cross-site/);
  });

  it("tokens: scopes enforced, rate limits return 429 with Retry-After", async () => {
    const { store, actor } = as("demo", "instructor");
    const ro = integration.createPersonalToken(store, actor, { purpose: "test", scopes: ["read"] });
    const list = await call("v1/t/demo/r/courses", { bearer: ro.access_token });
    assert.equal(list.res.status, 200);
    assert.ok(list.res.headers.get("x-rate-limit-remaining"));
    const w = await call("v1/t/demo/r/announcements", { bearer: ro.access_token, json: { courseId: "crs_demo_cs101", title: "t", body: "b" } });
    assert.equal(w.res.status, 403);
    const adm = as("demo", "admin");
    const key = integration.createDeveloperKey(adm.store, adm.actor, { name: "Tight", scopes: ["read"], redirectUri: "https://app.example.test/cb", rateLimitPerMin: 2 });
    const auth = integration.authorize(storeOf("demo"), actor, { clientId: key.clientId as string, redirectUri: "https://app.example.test/cb", scopes: ["read"], state: "s1" });
    const code = new URL(auth.redirect).searchParams.get("code")!;
    const tok = await call("v1/t/demo/oauth2/token", { json: { grant_type: "authorization_code", client_id: key.clientId, client_secret: key.clientSecret, code, redirect_uri: "https://app.example.test/cb" } });
    assert.ok(tok.data.access_token, JSON.stringify(tok.data));
    const reuse = await call("v1/t/demo/oauth2/token", { json: { grant_type: "authorization_code", client_id: key.clientId, client_secret: key.clientSecret, code, redirect_uri: "https://app.example.test/cb" } });
    assert.equal(reuse.res.status, 400, "codes are single-use");
    let limited: Response | null = null;
    for (let i = 0; i < 4; i++) {
      const r = await call("v1/t/demo/me", { bearer: tok.data.access_token });
      if (r.res.status === 429) limited = r.res;
    }
    assert.ok(limited, "rate limited");
    assert.ok(Number(limited!.headers.get("retry-after")) >= 1);
  });

  it("admins can act as a user via ?as_user_id=; every request is audited with the real admin", async () => {
    const { store, actor } = as("demo", "admin");
    const pat = integration.createPersonalToken(store, actor, { purpose: "support", scopes: ["read", "write"] });
    const r = await call("v1/t/demo/me?as_user_id=usr_demo_student1", { bearer: pat.access_token });
    assert.equal(r.data.data.id, "usr_demo_student1");
    assert.equal(r.data.data.masqueradedBy.id, "usr_demo_admin");
    const log = storeOf("demo").auditLog(50);
    assert.ok(log.some((x) => x.action === "masquerade.api" && x.realActorId === "usr_demo_admin"));
    const t = as("demo", "instructor");
    const ipat = integration.createPersonalToken(t.store, t.actor, { purpose: "x", scopes: ["read"] });
    assert.equal((await call("v1/t/demo/me?as_user_id=usr_demo_student1", { bearer: ipat.access_token })).res.status, 403);
  });

  it("operations: queries via GET, commands via POST, CSV export", async () => {
    const cookie = await signin("demo", "instructor");
    const grid = await call("v1/t/demo/q/gradebook.grid?courseId=crs_demo_cs101", { cookie });
    assert.equal(grid.res.status, 200);
    assert.ok(grid.data.data.rows.length >= 4);
    const csv = await call("v1/t/demo/q/grades.export_csv?courseId=crs_demo_cs101", { cookie });
    assert.match(String(csv.res.headers.get("content-type")), /text\/csv/);
    const wrong = await call("v1/t/demo/q/grades.set", { cookie });
    assert.equal(wrong.res.status, 405, "commands aren't reachable with GET");
    assert.ok(allOperations().length > 150);
  });

  it("GraphQL: nested resources with the same authorization; mutations; errors are partial", async () => {
    const cookie = await signin("demo", "student1");
    const q = await call("v1/t/demo/graphql", { cookie, json: { query: `query Q($id: String!) { coursesById(id: $id) { title modules { title module_items { title kind } } } me { name } }`, variables: { id: "crs_demo_cs101" } } });
    assert.equal(q.data.data.coursesById.title, "Foundations of Programming");
    assert.ok(q.data.data.coursesById.modules.length >= 2);
    assert.equal(q.data.data.me.name, "Kofi Mensah");
    const forbidden = await call("v1/t/demo/graphql", { cookie, json: { query: `mutation { create(table: "announcements", input: { courseId: "crs_demo_cs101", title: "x", body: "y" }) }` } });
    assert.equal(forbidden.data.data.create, null);
    assert.match(forbidden.data.errors[0].message, /permission/i);
    const other = await call("v1/t/demo/graphql", { cookie, json: { query: `{ coursesById(id: "crs_techdev_cs101") { title } }` } });
    assert.equal(other.data.data.coursesById, null, "another tenant's id doesn't exist here");
  });

  it("OpenAPI documents every resource and operation", async () => {
    const r = await call("v1/t/demo/openapi.json");
    assert.equal(r.data.openapi, "3.1.0");
    assert.ok(r.data.paths["/r/courses"].get);
    assert.ok(r.data.paths["/a/grades.set"].post);
    assert.ok(r.data.paths["/q/gradebook.grid"].get);
    assert.ok(Object.keys(r.data.paths).length > 400);
  });

  it("gRPC: Health, ListCourses with a bearer token, auth errors map to gRPC codes", async () => {
    const h = await grpcCall(port, "Health", {});
    assert.equal(h.status, 0);
    assert.equal(h.response!.status, "SERVING");
    const { store, actor } = as("demo", "instructor");
    const pat = integration.createPersonalToken(store, actor, { purpose: "grpc", scopes: ["read"] });
    const r = await grpcCall(port, "ListCourses", { tenant: "demo", page_size: 50 }, `Bearer ${pat.access_token}`);
    assert.equal(r.status, 0, r.message);
    assert.ok((r.response!.courses as { code: string }[]).some((c) => c.code === "CS-101"));
    const unauth = await grpcCall(port, "ListCourses", { tenant: "demo" });
    assert.equal(unauth.status, 16);
    const cross = await grpcCall(port, "ListCourses", { tenant: "techdev" }, `Bearer ${pat.access_token}`);
    assert.equal(cross.status, 16, "a demo token is meaningless in techdev");
    const ev = await grpcCall(port, "ListEvents", { tenant: "demo", limit: 5 }, `Bearer ${pat.access_token}`);
    assert.equal(ev.status, 7, "admin token required");
    const msg = { courses: [{ id: "a", code: "B", title: "C", state: "D" }], next_page_token: "n" };
    assert.deepEqual(decode(MESSAGES.ListCoursesResponse, encode(MESSAGES.ListCoursesResponse, msg)), msg);
  });

  it("LTI over HTTP: JWKS, client-credentials token, AGS score (unposted), NRPS", async () => {
    const jw = await call("v1/t/academy/.well-known/jwks.json");
    assert.equal(jw.data.keys[0].kty, "RSA");
    const s = storeOf("academy");
    lti.ensureCloudLabTool(s);
    const assertion = lti.toolClientAssertion(s);
    const tok = await call("v1/t/academy/oauth2/token", { json: { grant_type: "client_credentials", client_assertion: assertion, scope: `${lti.SCOPES.score} ${lti.SCOPES.nrps}` } });
    assert.ok(tok.data.access_token, JSON.stringify(tok.data));
    const st = as("academy", "student4", false);
    // enroll student4 in #37.2 via sandbox checkout so AGS can score them
    const { checkout } = await import("../src/campus/services/academy");
    checkout(st.store, st.actor, { offeringId: "off_academy_37_2", sandboxCard: "tok_sandbox_visa" });
    const { pseudonym } = await import("../src/campus/services/success");
    const score = await call("v1/t/academy/lti/lineitems/asg_academy_p32_lab/scores", { bearer: tok.data.access_token, json: { userId: pseudonym("tn_academy", "usr_academy_student4"), scoreGiven: 7, scoreMaximum: 10, activityProgress: "Completed", gradingProgress: "FullyGraded", timestamp: new Date().toISOString() } });
    assert.equal(score.res.status, 200, JSON.stringify(score.data));
    const g = storeOf("academy").list("grades", (x) => x.assignmentId === "asg_academy_p32_lab" && x.userId === "usr_academy_student4")[0];
    assert.equal(g.score, 7);
    assert.equal(g.posted, false);
    const nrps = await call("v1/t/academy/lti/courses/crs_academy_p37_2/memberships", { bearer: tok.data.access_token });
    assert.ok(nrps.data.members.length >= 2);
    assert.ok(!JSON.stringify(nrps.data).includes("usr_academy"), "pseudonymous ids only");
  });

  it("webhooks are signed, retried, dead-lettered and replayable", async () => {
    const { store, actor } = as("demo", "admin");
    const wh = integration.createWebhook(store, actor, { url: "https://sink.scholarion.local/hooks", events: ["announcements.*"] });
    const bad = integration.createWebhook(as("demo", "admin").store, actor, { url: "https://sink.scholarion.local/broken", events: ["announcements.published"] });
    const inst = as("demo", "instructor");
    const { create, publish } = await import("../src/campus/entity");
    void create;
    const ann = inst.store.list("announcements", (x) => x.state === "scheduled")[0];
    inst.store.update("announcements", ann.id, { publishAt: new Date(Date.now() - 1000).toISOString() });
    const { announcementJob } = await import("../src/campus/services/collaboration");
    announcementJob(inst.store);
    const { relay } = await import("../src/campus/core");
    relay(inst.store);
    const s = storeOf("demo");
    const failing = integration.sinkTransport(s, ["/broken"]);
    for (let i = 0; i < 6; i++) {
      for (const d of s.list("webhook_deliveries", (x) => x.state === "pending")) s.update("webhook_deliveries", d.id, { nextAttemptAt: new Date(0).toISOString() });
      await integration.deliverWebhooks(s, failing);
    }
    const sink = s.list("webhook_sink");
    assert.ok(sink.length >= 1);
    assert.ok(integration.verifyWebhookSignature(wh.secret, String(sink[0].signature), String(sink[0].body)));
    const dead = s.list("webhook_deliveries", (d) => d.webhookId === bad.id && d.state === "dead");
    assert.equal(dead.length, 1);
    integration.replayWebhook(s, actor, dead[0].id);
    assert.equal(s.get("webhook_deliveries", dead[0].id)!.state, "pending");
    void publish;
  });

  it("OneRoster 1.2 export → import round-trips into another tenant", async () => {
    const d = as("demo", "registrar");
    const ex = integration.oneRosterExport(d.store, d.actor);
    assert.ok(ex.files["users.csv"].includes("sourcedId"));
    const corp = as("techdev", "registrar");
    const r = integration.oneRosterImport(corp.store, corp.actor, ex.files) as Record<string, { counts: { created: number } }>;
    assert.ok(r.users.counts.created >= 1);
  });

  it("iCal feed, Prometheus metrics, health", async () => {
    const st = as("demo", "student1", false);
    const { issueFeed } = await import("../src/campus/services/calendar");
    const feed = issueFeed(st.store, st.actor) as { url: string };
    const path = feed.url.replace(/^.*\/api\/campus\//, "");
    const ics = await call(path);
    assert.match(String(ics.data), /BEGIN:VCALENDAR/);
    const m = await call("metrics");
    assert.match(String(m.data), /campus_api_requests_total/);
    assert.equal((await call("health")).data.ok, true);
  });
});
