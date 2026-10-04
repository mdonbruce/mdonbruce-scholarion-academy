import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { advanceClock, CampusError } from "../src/campus/core";
import * as E from "../src/campus/services/ecosystem";
import type { FetchedResponse, Fetcher } from "../src/campus/services/studio/types";
import { ECO_CATALOG } from "../src/campus/academy/eco-catalog";

/** Free Education Resource Hub, Auto-Discovery, Integration Schema and Career Connect. */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string) => as("academy", k, true);

/** A fake network keyed by URL. Unknown URLs fail like a DNS error. */
const pages = new Map<string, { status: number; type: string; body: string }>();
let calls: string[] = [];
const fake: Fetcher = async (url) => {
  calls.push(url);
  const p = pages.get(url);
  if (!p) throw new Error("getaddrinfo ENOTFOUND");
  const buf = Buffer.from(p.body);
  return { ok: p.status < 400, status: p.status, headers: { get: (k: string) => (k === "content-type" ? p.type : k === "content-length" ? String(buf.length) : null) }, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) } as unknown as FetchedResponse;
};
const html = (s: string) => ({ status: 200, type: "text/html", body: `<html><body>${s}</body></html>` });
const schedule = (kind: string) => storeOf("academy").list(E.T.schedules, (s) => s.kind === kind)[0];
const res = (key: string) => storeOf("academy").list(E.T.resources, (r) => r.key === key)[0];

before(() => {
  freshCampus();
  E.ecoNet.fetcher = fake;
});

describe("Catalog seed and the Integration JSON Schema", () => {
  it("seeds the researched catalog: verified records carry evidence; pending ones stay pending", () => {
    const s = storeOf("academy");
    const all = s.list(E.T.resources, () => true);
    assert.equal(all.length, ECO_CATALOG.length);
    for (const r of all) {
      const ev = s.list(E.T.evidence, (e) => e.resourceId === r.id);
      if (r.status === "verified") assert.ok(ev.length && r.verifiedAt, `${r.key} verified without evidence`);
    }
    assert.equal(res("zoom-basic").status, "verified");
    assert.deepEqual((res("zoom-basic").limits as { value: number }[]).map((l) => l.value), [40, 100]);
    assert.equal(res("elevenlabs-free").status, "pending");
  });

  it("every published record validates against schema 1.1.0 and the semantic rules", () => {
    const s = storeOf("academy");
    for (const r of s.list(E.T.resources, () => true)) {
      const v = E.validateDefinition(E.definitionOf(s, r));
      assert.deepEqual(v.structural, [], `${r.key}: ${v.structural.join("; ")}`);
      assert.deepEqual(v.semantic, [], `${r.key}: ${v.semantic.join("; ")}`);
    }
  });

  it("schema rejects bad structure, credentials, unverified claims, trials without expiry, and untrusted hosts", () => {
    const base = E.definitionOf(storeOf("academy"), res("zoom-basic")) as Record<string, any>;
    assert.ok(E.validateDefinition({ ...base, extra: 1 }).structural.some((e) => /not allowed/.test(e)));
    assert.ok(E.validateDefinition({ ...base, provider: { name: "x", official_url: "not a url" } }).structural.some((e) => /URI/.test(e)));
    assert.ok(E.validateDefinition({ ...base, verification: { status: "verified", evidence: [] } }).semantic.some((e) => /evidence/.test(e)));
    assert.ok(E.validateDefinition({ ...base, access: { ...base.access, classification: "trial", expires_at: null } }).semantic.some((e) => /Trial/.test(e)));
    assert.ok(E.validateDefinition({ ...base, connection: { method: "api", auth: "api_key", allowed_operations: [] } }).semantic.some((e) => /documented API/.test(e)));
    assert.ok(E.validateDefinition({ ...base, connection: { ...base.connection, allowed_hosts: ["evil.example"] } }).semantic.some((e) => /trusted/.test(e)));
    assert.ok(E.validateDefinition({ ...base, description: "sk-ABCDEFGHIJKLMNOPQRSTUV" }).semantic.some((e) => /credential/.test(e)));
    assert.equal(E.validate(E.SCHEMAS["schedule@1.0.0"], { schema_version: "1.0.0", key: "x", kind: "nope", cron: "1", time_zone: "", enabled: 1 }).length >= 4, true);
  });
});

describe("Cron in America/New_York", () => {
  it("computes fire times in the configured zone, across DST", () => {
    const at = Date.parse("2026-10-04T16:30:00Z");
    assert.equal(new Date(E.nextFire("0 6 * * *", "America/New_York", at)!).toISOString(), "2026-10-05T10:00:00.000Z");
    assert.equal(new Date(E.nextFire("0 8 1 * *", "America/New_York", at)!).toISOString(), "2026-11-01T13:00:00.000Z");
    assert.equal(new Date(E.nextFire("0 7 * * 1", "America/New_York", at)!).toISOString(), "2026-10-05T11:00:00.000Z");
    assert.throws(() => E.parseCron("61 * * * *"));
  });
});

describe("Auto-discovery jobs", () => {
  it("terms review re-verifies against official pages; a missing limit drops the record to pending and notifies the course", async () => {
    const s = storeOf("academy");
    const admin = u("admin");
    // Official pages: Zoom no longer shows "40"; Webex still shows its limits.
    for (const e of s.list(E.T.evidence, () => true)) pages.set(String(e.url), html(((e.checkTerms as string[]) ?? []).join(" ") + " plan details"));
    pages.set("https://zoom.us/pricing", html("Basic: meetings up to 60 minutes, 100 participants"));
    E.runNow(s, admin.actor, schedule("terms_review").id);
    let out = await E.workJobs(s);
    // Large catalog + per-job request budget: run until complete (checkpoints resume).
    for (let i = 0; i < 5 && out.some((o) => o.state === "partial"); i++) out = await E.workJobs(s);
    const job = s.list(E.T.jobs, (j) => j.kind === "terms_review")[0];
    assert.match(String(job.state), /^succeeded/);
    assert.equal(res("zoom-basic").status, "pending");
    assert.match(String(res("zoom-basic").statusReason), /40/);
    assert.equal(res("webex-free").status, "verified");
    assert.ok(s.list(E.T.feed, (f) => f.kind === "limits_changed" && String(f.title).includes("Zoom")).length);
    assert.ok(s.list(E.T.versions, (v) => v.resourceId === res("zoom-basic").id && (v.changedFields as string[]).includes("status")).length);
  });

  it("a scheduled period creates exactly one job, even if the tick runs twice; missed runs catch up once", async () => {
    const s = storeOf("academy");
    const before = s.list(E.T.jobs, (j) => j.kind === "link_check").length;
    advanceClock(2 * 86_400_000);
    E.planDueJobs(s);
    E.planDueJobs(s);
    const linkJobs = s.list(E.T.jobs, (j) => j.kind === "link_check");
    assert.equal(linkJobs.length, before + 1);
    assert.equal(linkJobs.at(-1)!.trigger, "missed_run_catch_up");
  });

  it("link check: 404 makes a resource unavailable; past-deadline opportunities close", async () => {
    const s = storeOf("academy");
    pages.set(String(res("anki").officialUrl), { status: 404, type: "text/html", body: "gone" });
    let out = await E.workJobs(s);
    for (let i = 0; i < 5 && out.some((o) => o.state === "partial"); i++) out = await E.workJobs(s);
    assert.equal(res("anki").status, "unavailable");
    assert.ok(s.list(E.T.feed, (f) => f.kind === "discontinued").length);
    assert.ok(s.list(E.T.opportunities, (o) => o.title === "Data Apprentice (demo)" && o.status === "closed").length);
  });

  it("failed jobs retry with backoff and go to dead-letter after the limit", async () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const src = E.addSource(s, admin.actor, { key: "board-x", name: "Example board", kind: "greenhouse", url: "https://boards-api.greenhouse.io/v1/boards/examplex/jobs" });
    const sch = schedule("job_discovery");
    E.upsertSchedule(s, admin.actor, { id: sch.id, budget: { max_retries: 1 } });
    const j = E.runNow(s, admin.actor, sch.id);
    await E.workJobs(s);
    assert.equal(s.get(E.T.jobs, j.id)!.state, "retrying");
    advanceClock(3 * 3600_000);
    await E.workJobs(s);
    assert.equal(s.get(E.T.jobs, j.id)!.state, "dead");
    E.setSourceEnabled(s, admin.actor, src.id, false);
  });

  it("job discovery ingests a public job board, dedupes on re-run and closes listings that disappear", async () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const url = "https://boards-api.greenhouse.io/v1/boards/exampleco/jobs?content=true";
    const board = (ids: number[]) => ({ status: 200, type: "application/json", body: JSON.stringify({ jobs: ids.map((id) => ({ id, title: id === 1 ? "AI Agents Intern" : "Graduate Data Analyst", absolute_url: `https://boards.greenhouse.io/exampleco/jobs/${id}`, location: { name: "Remote" }, updated_at: "2026-10-01T00:00:00Z", content: "Python, SQL and evaluation of LLM agents" })) }) });
    pages.set(url, board([1, 2]));
    E.addSource(s, admin.actor, { key: "exampleco", name: "ExampleCo careers", kind: "greenhouse", url });
    const sch = schedule("job_discovery");
    E.upsertSchedule(s, admin.actor, { id: sch.id, budget: { max_retries: 3 } });
    E.runNow(s, admin.actor, sch.id);
    await E.workJobs(s);
    const opps = () => s.list(E.T.opportunities, (o) => String(o.externalId ?? "").startsWith("gh:"));
    assert.equal(opps().length, 2);
    E.runNow(s, admin.actor, sch.id);
    await E.workJobs(s);
    assert.equal(opps().length, 2, "re-run doesn't duplicate");
    pages.set(url, board([1]));
    E.runNow(s, admin.actor, sch.id);
    await E.workJobs(s);
    assert.equal(opps().filter((o) => o.status === "open").length, 1);
    assert.ok(E.listOpportunities(s).every((o) => o.status === "open"));
    const ext = E.listOpportunities(s).find((o) => o.title === "AI Agents Intern")!;
    assert.match(ext.employerLabel, /External listing/);
  });

  it("resource discovery: feed items publish only with source-level evidence; others stay pending", async () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const feed = (title: string) => `<rss><channel><item><title>${title}</title><link>https://oer.example.org/${encodeURIComponent(title)}</link><description>Open course</description></item></channel></rss>`;
    pages.set("https://oer.example.org/feed.xml", { status: 200, type: "application/rss+xml", body: feed("Intro to Agents") });
    pages.set("https://feeds.example.net/new.xml", { status: 200, type: "application/rss+xml", body: feed("Unknown Course") });
    E.addSource(s, admin.actor, { key: "oer", name: "Example OER", kind: "rss", url: "https://oer.example.org/feed.xml", evidenceUrl: "https://oer.example.org/license", defaults: { classification: "open_resource", license: "CC BY 4.0", redistribution: "allowed" }, purpose: "resources" });
    E.addSource(s, admin.actor, { key: "unknown", name: "Unknown feed", kind: "rss", url: "https://feeds.example.net/new.xml", purpose: "resources" });
    E.runNow(s, admin.actor, schedule("resource_discovery").id);
    await E.workJobs(s);
    const a = s.list(E.T.resources, (r) => r.name === "Intro to Agents")[0];
    const b = s.list(E.T.resources, (r) => r.name === "Unknown Course")[0];
    assert.equal(a.status, "verified");
    assert.equal(b.status, "pending");
    const st = u("student3");
    assert.ok(!E.listResources(s, st.actor, { q: "Unknown Course" }).items.length, "learners don't see pending records");
  });

  it("fetching is limited to trusted hosts — no arbitrary-URL proxy", async () => {
    const s = storeOf("academy");
    calls = [];
    const admin = u("admin");
    assert.equal(status(() => E.addSource(s, admin.actor, { key: "loc", name: "x", kind: "rss", url: "http://127.0.0.1/feed" })), 422);
    assert.equal(status(() => E.addSource(s, u("student1").actor, { key: "y", name: "y", kind: "rss", url: "https://ok.example/feed" })), 403);
  });
});

describe("Hub features", () => {
  it("filters: genuinely free excludes credits/trials; API filter; self-hosted", () => {
    const s = storeOf("academy");
    const st = u("student1");
    const free = E.listResources(s, st.actor, { freeOnly: true, pageSize: 100 }).items;
    assert.ok(free.length && free.every((r) => ["ongoing_free", "open_source", "open_resource"].includes(r.classification) && r.status === "verified"));
    assert.ok(!free.some((r) => r.key === "hugging-face-hub"), "limited credits aren't 'genuinely free'");
    assert.ok(E.listResources(s, st.actor, { selfHosted: true, pageSize: 100 }).items.some((r) => r.key === "ollama"));
  });

  it("live classroom splits a 90-minute lecture into blocks within a verified 40-minute limit; unverified providers are refused", () => {
    const s = storeOf("academy");
    const inst = u("instructor");
    const webex = res("webex-free");
    const live = E.scheduleLiveSession(s, inst.actor, { courseId: "crs_academy_ai801", title: "Module 1 live lecture", providerId: webex.id, startsAt: "2026-10-10T14:00:00Z", totalMinutes: 90, joinUrl: "https://example.webex.com/meet/scholarion" });
    const blocks = live.blocks as { minutes: number }[];
    assert.equal(blocks.length, 3);
    assert.ok(blocks.every((b) => b.minutes <= 38));
    assert.equal(blocks.reduce((t, b) => t + b.minutes, 0), 90);
    assert.equal(status(() => E.scheduleLiveSession(s, inst.actor, { courseId: "crs_academy_ai801", title: "x", providerId: res("zoom-basic").id, startsAt: "2026-10-10T14:00:00Z", totalMinutes: 60 })), 409);
    assert.equal(status(() => E.scheduleLiveSession(s, u("student1").actor, { courseId: "crs_academy_ai801", title: "x", providerId: webex.id, startsAt: "2026-10-10T14:00:00Z", totalMinutes: 60 })), 403);
  });

  it("course mappings are idempotent and recommendations exclude mapped and unverified resources", () => {
    const s = storeOf("academy");
    const inst = u("instructor");
    const r = res("obs-studio");
    const m1 = E.mapToCourse(s, inst.actor, { courseId: "crs_academy_ai801", resourceId: r.id, topic: "Lecture recording" }, "map-1");
    const m2 = E.mapToCourse(s, inst.actor, { courseId: "crs_academy_ai801", resourceId: r.id, topic: "Lecture recording" }, "map-1");
    assert.equal(m1.id, m2.id);
    const recs = E.recommendForCourse(s, inst.actor, "crs_academy_ai801");
    assert.ok(recs.every((x) => x.resource.status === "verified" && x.resource.key !== "obs-studio"));
    assert.equal(status(() => E.mapToCourse(s, u("student1").actor, { courseId: "crs_academy_ai801", resourceId: r.id })), 403);
  });

  it("connections store only a key-vault reference and report accurate states", () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const hf = res("hugging-face-hub");
    assert.equal(status(() => E.connect(s, admin.actor, hf.id, { credentialRef: "hf_ABCDEFGHIJKLMNOP secret value!" })), 422);
    const c1 = E.connect(s, admin.actor, hf.id, {});
    assert.equal(c1.state, "account_required");
    const c2 = E.connect(s, admin.actor, hf.id, { credentialRef: "vault.huggingface.readonly" }, "conn-1");
    assert.equal(c2.state, "connected");
    assert.equal(JSON.stringify(E.listConnections(s, admin.actor)).includes("vault.huggingface"), false, "references aren't echoed");
    assert.equal(E.connect(s, admin.actor, res("zoom-basic").id, {}).state, "link", "a catalog listing isn't an integration");
    assert.equal(status(() => E.connect(s, u("instructor").actor, hf.id, {})), 403);
  });

  it("external completion needs learner evidence; bookmarks toggle", () => {
    const s = storeOf("academy");
    const st = u("student1");
    const r = res("freecodecamp");
    assert.equal(E.toggleBookmark(s, st.actor, r.id).bookmarked, true);
    assert.equal(E.myBookmarks(s, st.actor).length, 1);
    const c = E.reportExternalCompletion(s, st.actor, r.id, "https://www.freecodecamp.org/certification/example", "Finished");
    assert.equal(c.status, "self_reported");
  });
});

describe("Career Connect and Employer Portal", () => {
  it("matching explains itself from passbook evidence and stated skills", async () => {
    const s = storeOf("academy");
    const st = u("student1");
    // Earn passbook evidence: pass the tools mini-lab (C2 → guardrails).
    const G = await import("../src/campus/services/graded");
    const { AI801_MINILABS } = await import("../src/campus/academy/ai801");
    const item = s.list("graded_items", (i) => i.key === "m01-tools-minilab-1")[0];
    G.submit(s, st.actor, item.id, Object.fromEntries(AI801_MINILABS.tools[0].tasks.map((t) => [t.id, t.kind === "match" || t.kind === "order" ? t.key : t.key[0]])), "eco-ml");
    const m = E.myMatches(s, st.actor);
    const intern = m.find((x) => x.title === "Agentic AI Intern (demo)")!;
    assert.ok(intern.match.score > 0);
    assert.ok(intern.match.reasons.some((r) => /guardrails: demonstrated — AI-801 passbook C2/.test(r)));
    assert.ok(intern.match.reasons.some((r) => /python: self-reported/.test(r)));
    assert.ok(!m.some((x) => x.title === "Data Apprentice (demo)"), "closed listings drop out");
  });

  it("talent search shows only opted-in learners and only their visible fields; unverified employers are blocked", () => {
    const s = storeOf("academy");
    const emp = u("employer1");
    const rows = E.talentSearch(s, emp.actor);
    assert.equal(rows.length, 1, "student2 is private");
    assert.equal(rows[0].portfolio, null);
    assert.equal(rows[0].contact, null, "contact only after the learner accepts");
    assert.ok(!JSON.stringify(rows).includes("usr_academy"));
    assert.equal(status(() => E.talentSearch(s, u("employer2").actor)), 403);
    assert.equal(status(() => E.talentSearch(s, u("student1").actor)), 403);
  });

  it("contact requests wait for the learner; nothing is shared or sent before that", () => {
    const s = storeOf("academy");
    const emp = u("employer1");
    const ref = E.talentSearch(s, emp.actor)[0].ref;
    const req = E.requestContact(s, emp.actor, ref, "We'd like to talk about the internship.");
    assert.equal(req.state, "requested");
    assert.equal(E.talentSearch(s, emp.actor)[0].contact, null);
    const st = u("student1");
    E.answerContact(s, st.actor, req.id, true);
    assert.equal(E.talentSearch(s, emp.actor)[0].contact, "student1@academy.scholarion.test");
  });

  it("applications are learner-initiated, idempotent, and share only chosen fields", () => {
    const s = storeOf("academy");
    const st = u("student1");
    const o = s.list(E.T.opportunities, (x) => x.title === "Agentic AI Intern (demo)")[0];
    const a1 = E.apply(s, st.actor, o.id, { share: ["headline", "skills"] }, "app-1");
    const a2 = E.apply(s, st.actor, o.id, { share: ["headline", "skills"] }, "app-1") as { id: string; duplicate?: boolean };
    assert.equal(a2.id, a1.id);
    const portal = E.employerPortal(s, u("employer1").actor);
    const app = portal.applications[0];
    assert.ok(app.headline && app.skills);
    assert.equal(app.contact, null);
    assert.equal(app.portfolio, null);
    const ext = s.list(E.T.opportunities, (x) => String(x.externalId ?? "").startsWith("gh:") && x.status === "open")[0];
    assert.equal((E.apply(s, st.actor, ext.id, {}, "app-ext") as { state?: string }).state, "applied_externally");
    const closed = s.list(E.T.opportunities, (x) => x.title === "Data Apprentice (demo)")[0];
    assert.equal(status(() => E.apply(s, st.actor, closed.id, {}, "app-closed") as never), 409);
  });

  it("employers are partners only after verification and a recorded relationship", () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const nw = s.list(E.T.employers, (e) => String(e.name).startsWith("Northwind"))[0];
    assert.equal(status(() => E.markPartner(s, admin.actor, nw.id, "agreement")), 409);
    E.verifyEmployer(s, admin.actor, nw.id, "verified", "Domain and contact checked");
    assert.equal(status(() => E.markPartner(s, admin.actor, nw.id, "")), 422);
    E.markPartner(s, admin.actor, nw.id, "Internship agreement signed 2026-10-04");
    assert.equal(E.employerView(s.get(E.T.employers, nw.id)!).label, "Scholarion partner");
  });
});

/* ---------------- API integration layer (v1) ---------------- */
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";

const H = "http://localhost:3000/api/campus/v1/t/academy/";
async function signIn(user: string) {
  const r = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${user}@academy.scholarion.test`, password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
  return r.headers.get("set-cookie")!.split(";")[0];
}
const call = (cookie: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handleCampus(new Request(`${H}${path}`, { method, headers: { cookie, origin: "http://localhost:3000", host: "localhost:3000", ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }), `v1/t/academy/${path.split("?")[0]}`);

describe("Scholarion API v1", () => {
  it("lists resources with pagination and filters, without secrets", async () => {
    const c = await signIn("student3");
    const r = await call(c, "GET", "resources?free=true&pageSize=5");
    assert.equal(r.status, 200);
    const j = (await r.json()) as { data: { classification: string }[]; page: { total: number; size: number } };
    assert.equal(j.page.size, 5);
    assert.ok(j.page.total >= j.data.length);
    assert.ok(j.data.every((x) => ["ongoing_free", "open_source", "open_resource"].includes(x.classification)));
    const one = await call(c, "GET", "resources/webex-free");
    assert.equal(one.status, 200);
    assert.equal((await call(c, "GET", "courses/free")).status, 200);
    assert.equal((await call(c, "GET", "opportunities")).status, 200);
  });

  it("career profile PATCH, matches, and idempotent applications", async () => {
    const c = await signIn("student4");
    const p = await call(c, "PATCH", "me/career-profile", { headline: "Data-minded builder", statedSkills: ["sql", "python"], discoverable: false });
    assert.equal(p.status, 200);
    const prof = (await p.json()) as { data: { discoverable: boolean; headline: string } };
    assert.equal(prof.data.discoverable, false);
    const m = await call(c, "GET", "me/opportunity-matches");
    const matches = (await m.json()) as { data: { id: string; source: string }[] };
    const target = matches.data.find((x) => x.source === "employer_posted")!;
    assert.equal((await call(c, "POST", `opportunities/${target.id}/applications`, { share: ["headline"] })).status, 422, "idempotency key required");
    const a1 = await call(c, "POST", `opportunities/${target.id}/applications`, { share: ["headline"] }, { "idempotency-key": "api-app-1" });
    const a2 = await call(c, "POST", `opportunities/${target.id}/applications`, { share: ["headline"] }, { "idempotency-key": "api-app-1" });
    assert.equal(((await a1.json()) as { data: { id: string } }).data.id, ((await a2.json()) as { data: { id: string } }).data.id);
  });

  it("admin-only endpoints refuse learners; jobs and schedules work for admins", async () => {
    const st = await signIn("student3");
    assert.equal((await call(st, "GET", "schedules")).status, 403);
    assert.equal((await call(st, "POST", "discovery/jobs", { kind: "link_check" })).status, 403);
    const s = storeOf("academy");
    const sch = s.list(E.T.schedules, (x) => x.kind === "integration_health")[0];
    const admin = u("admin");
    assert.equal(status(() => E.upsertSchedule(s, admin.actor, { id: sch.id, cron: "0 */6 * *" })), 422);
    assert.equal(status(() => E.upsertSchedule(s, admin.actor, { id: sch.id, timeZone: "Mars/Olympus" })), 422);
    const j1 = E.createJob(s, admin.actor, "integration_health", "api-job-1");
    const j2 = E.createJob(s, admin.actor, "integration_health", "api-job-1");
    assert.equal(j1.id, j2.id);
  });
});

describe("Prompt 4 acceptance: catalog size, licensing, employer checks, adapters, digest", () => {
  it("seed catalog: 40+ verified tools and a mapped free-course library", () => {
    const s = storeOf("academy");
    const tools = s.list(E.T.resources, (r) => r.kind === "tool" && r.status !== "archived");
    const verifiedTools = ECO_CATALOG.filter((r) => r.kind === "tool" && r.status === "verified").length;
    assert.ok(verifiedTools >= 40, `verified tools ${verifiedTools}`);
    assert.ok(tools.length >= 50);
    const lib = E.libraryByCourse(s, u("admin").actor);
    const courses = lib.map((g) => g.course);
    for (const c of ["CAI 4510C Machine Learning", "Python Programming (Gaddis 6th ed.)", "CTS2314 Network Security", "Advanced Artificial Intelligence"]) assert.ok(courses.includes(c), c);
    assert.ok(ECO_CATALOG.filter((r) => r.kind !== "tool").length >= 40);
  });

  it("non-openly-licensed courses are linked, not copied; open licenses may be imported with attribution", () => {
    const s = storeOf("academy");
    for (const r of s.list(E.T.resources, (x) => x.kind !== "tool")) {
      if (r.redistribution !== "allowed" || !r.license) assert.equal(r.contentUse, "link_only", String(r.key));
    }
    assert.ok(s.list(E.T.resources, (x) => x.contentUse === "import_with_attribution").length > 0);
  });

  it("employers are verified automatically by domain; a free-mail or mismatched domain stays hidden", () => {
    const s = storeOf("academy");
    assert.equal(E.employerChecks({ name: "Acme", website: "https://acme.example", contactEmail: "hr@acme.example" }).ok, true);
    assert.equal(E.employerChecks({ name: "Acme", website: "https://acme.example", contactEmail: "acme.hr@gmail.com" }).ok, false);
    assert.equal(E.employerChecks({ name: "Acme", website: "https://acme.example", contactEmail: "hr@other.example" }).ok, false);
    const st = u("student5");
    const e = E.registerEmployer(s, st.actor, { name: "Shady Hiring", website: "https://shady-hiring.example", contactEmail: "boss@gmail.com" });
    assert.equal(e.verification, "pending");
    assert.ok(!E.listEmployers(s, u("student3").actor).some((x) => x.id === e.id), "unverified employers are hidden");
    assert.equal(status(() => E.postOpportunity(s, st.actor, { title: "Intern", type: "internship" })), 403);
  });

  it("scam patterns, upfront fees and duplicates hide a posting automatically and log why", () => {
    const s = storeOf("academy");
    const emp = u("employer1");
    const bad = E.postOpportunity(s, emp.actor, { title: "Remote Data Intern", type: "internship", description: "Pay a $150 training fee before you start. Interview on Telegram only." });
    assert.equal(bad.status, "pending");
    assert.match(String(bad.hiddenReason), /fee/);
    assert.ok(!E.listOpportunities(s).some((o) => o.id === bad.id));
    const dup = E.postOpportunity(s, emp.actor, { title: "Agentic AI Intern (demo)", type: "internship" });
    assert.equal(dup.status, "pending");
    assert.ok(E.flaggedPostings(s, u("admin").actor).length >= 2);
  });

  it("Lever postings ingest; USAJOBS without keys reports configuration required (not an error)", async () => {
    const s = storeOf("academy");
    const admin = u("admin");
    const lever = "https://api.lever.co/v0/postings/exampleorg?mode=json";
    pages.set(lever, { status: 200, type: "application/json", body: JSON.stringify([{ id: "abc", text: "Machine Learning Intern", hostedUrl: "https://jobs.lever.co/exampleorg/abc", categories: { location: "Remote" }, createdAt: Date.parse("2026-10-01"), descriptionPlain: "Python, PyTorch, evaluation" }]) });
    E.addSource(s, admin.actor, { key: "exampleorg", name: "ExampleOrg careers", kind: "lever", url: lever });
    const usa = E.addSource(s, admin.actor, { key: "usajobs-it", name: "USAJOBS IT internships", kind: "usajobs", url: "https://data.usajobs.gov/api/search?Keyword=machine%20learning" });
    assert.equal(status(() => E.addSource(s, admin.actor, { key: "adz", name: "x", kind: "adzuna", url: "https://api.adzuna.com/v1/api/jobs/us/search/1?app_key=SECRET" })), 422);
    E.runNow(s, admin.actor, schedule("job_discovery").id);
    await E.workJobs(s);
    assert.ok(s.list(E.T.opportunities, (o) => o.externalId === "lever:abc" && o.status === "open").length);
    assert.match(String(s.get(E.T.sources, usa.id)!.lastError), /Configuration required/);
  });

  it("weekly digest reaches admins and opted-in learners only; withdrawing consent hides the learner at once", async () => {
    const s = storeOf("academy");
    const st = u("student3");
    E.subscribe(s, st.actor, "digest", "");
    E.runNow(s, u("admin").actor, schedule("digest").id);
    await E.workJobs(s);
    const d = s.list(E.T.digests, () => true).at(-1)!;
    assert.equal(d.learnerRecipients, 1);
    const st1 = u("student1");
    E.withdrawConsent(s, st1.actor);
    assert.equal(E.talentSearch(s, u("employer1").actor).length, 0);
  });
});
