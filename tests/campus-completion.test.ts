import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError, relay, type TenantStore } from "../src/campus/core";
import type { Actor } from "../src/campus/iam";
import * as entity from "../src/campus/entity";
import * as asm from "../src/campus/services/assessment";
import * as sim from "../src/campus/services/similarity";
import * as gsp from "../src/campus/services/groupspace";
import * as mlib from "../src/campus/services/medialib";
import * as fil from "../src/campus/services/files";
import * as oidc from "../src/campus/services/oidc";
import { configureIdp } from "../src/campus/services/accountcfg";
import { htmlToBlocks, htmlToValidBlocks } from "../src/campus/services/htmlimport";
import { validateBlocks } from "../src/campus/services/curriculum";
import { Args, OPERATIONS } from "../src/campus/http/ops";
import { asLocale, dirFor, formatDate, LOCALES, missingKeys, t } from "../src/campus/i18n";
import { PARITY, paritySummary } from "../src/campus/parity";

/** Closing the last partial parity items: similarity, group spaces, media library, OIDC, HTML view, keyboard gradebook, localization. */

const status = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const d = (k: string, mfa = true) => as("demo", k, mfa);
const C1 = "crs_demo_cs101";
const run = (name: string, store: TenantStore, actor: Actor, raw: Record<string, unknown>) => OPERATIONS[name].run({ store, actor, args: new Args(raw), tenant: {} as never });

before(() => {
  freshCampus();
});

describe("Similarity review", () => {
  const ESSAY = "Loops repeat a block of statements while a condition stays true and a for loop walks through every item in a sequence one at a time until the sequence ends";
  it("the built-in provider scores overlap after submission and notifies staff", () => {
    const inst = d("instructor");
    const asg = entity.create(inst.store, inst.actor, "assignments", { courseId: C1, title: "Essay on loops", points: 10, submissionTypes: ["text"], groupId: storeOf("demo").list("assignment_groups", (g) => g.courseId === C1)[0].id });
    entity.publish(d("instructor").store, inst.actor, "assignments", String(asg.id));
    run("similarity.use_builtin", d("instructor").store, inst.actor, { assignmentId: asg.id });
    asm.submit(d("student1", false).store, d("student1", false).actor, String(asg.id), { mode: "text", body: ESSAY });
    const s2 = asm.submit(d("student2", false).store, d("student2", false).actor, String(asg.id), { mode: "text", body: ESSAY + " and that is all" });
    relay(storeOf("demo"));
    const got = storeOf("demo").get("submissions", s2.id)!.similarity as { status: string; score: number; matches: unknown[] };
    assert.equal(got.status, "scored");
    assert.ok(got.score >= 80, String(got.score));
    const mine = sim.similarityFor(d("student2", false).store, d("student2", false).actor, s2.id) as Record<string, unknown>;
    assert.equal("matches" in mine, false, "learners never see other submissions");
  });

  it("an external tool posts a signed report; unsigned or foreign reports are refused", async () => {
    const store = storeOf("demo");
    const tool = store.insert("tool_registrations", { name: "Example similarity", clientId: "example-sim", enabled: true, services: ["similarity"] }, "lti");
    // The tool's key: reuse the sandbox tool key for signing in this test.
    const { rsaKey } = await import("../src/campus/services/lti");
    store.update("tool_registrations", tool.id, { publicPem: String(rsaKey(store, "lti_tool").publicPem) });
    const sub = store.insert("submissions", { assignmentId: "asg_demo_hello", userId: "usr_demo_student3", courseId: C1, mode: "text", body: "x", attempt: 9, state: "submitted", similarity: { toolId: tool.id, status: "requested" } }, "sub");
    const jwt = sim.signToolReport(store, "example-sim", { submission_id: sub.id, score: 12, report_url: "https://reports.example.edu/r/1", status: "scored" });
    const r = sim.receiveReport(storeOf("demo"), jwt);
    assert.equal(r.score, 12);
    assert.equal((storeOf("demo").get("submissions", sub.id)!.similarity as { reportUrl: string }).reportUrl, "https://reports.example.edu/r/1");
    assert.equal(await status(() => sim.receiveReport(storeOf("demo"), `${jwt.slice(0, -4)}AAAA`)), 401);
    const other = store.insert("submissions", { assignmentId: "asg_demo_hello", userId: "usr_demo_student4", courseId: C1, mode: "text", body: "x", attempt: 9, state: "submitted" }, "sub");
    assert.equal(await status(() => sim.receiveReport(storeOf("demo"), sim.signToolReport(store, "example-sim", { submission_id: other.id, score: 5 }))), 404);
  });
});

describe("Group spaces across courses", () => {
  it("members get pages, a discussion and files; outsiders get nothing", async () => {
    const adm = d("admin");
    const g = gsp.createAccountGroup(adm.store, adm.actor, { name: "Robotics club", selfJoin: true });
    gsp.joinAccountGroup(d("student1", false).store, d("student1", false).actor, g.id);
    gsp.joinAccountGroup(d("student5", false).store, d("student5", false).actor, g.id);
    const s1 = d("student1", false);
    gsp.saveGroupPage(s1.store, s1.actor, g.id, { title: "Meeting notes", text: "## Agenda\n- Build a line follower" });
    const th = gsp.postInGroup(d("student1", false).store, s1.actor, g.id, { title: "Parts list", body: "Who has motors?" });
    gsp.postInGroup(d("student5", false).store, d("student5", false).actor, g.id, { parentId: th.id, body: "I do." });
    const home = gsp.groupHome(d("student5", false).store, d("student5", false).actor, g.id);
    assert.equal(home.pages[0].title, "Meeting notes");
    assert.match(home.pages[0].html, /Agenda/);
    assert.equal(home.threads[0].replies.length, 1);
    assert.equal(await status(() => gsp.groupHome(d("student2", false).store, d("student2", false).actor, g.id)), 404);
    const f = fil.requestUpload(d("student1", false).store, s1.actor, { name: "plan.txt", mime: "text/plain", size: 100, groupId: g.id, purpose: "group" });
    assert.ok(f.file.id);
    const mine = gsp.myGroups(d("student1", false).store, s1.actor);
    assert.ok(mine.mine.some((x) => x.id === g.id && x.course === "Account group"));
  });
});

describe("Personal media library", () => {
  it("recognizes recordings, keeps them personal, adds captions and shares into a course", async () => {
    assert.equal(fil.sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), "video/webm");
    assert.equal(fil.sniff(Buffer.from("OggS\0\0\0\0")), "audio/ogg");
    const inst = d("instructor");
    const up = fil.requestUpload(inst.store, inst.actor, { name: "intro.webm", mime: "video/webm", size: 8, purpose: "personal" });
    fil.receiveUpload(storeOf("demo"), String(up.file.id), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]));
    fil.scanFile(storeOf("demo"), String(up.file.id));
    const m = mlib.addToLibrary(d("instructor").store, inst.actor, { fileId: String(up.file.id), title: "Welcome" });
    assert.equal(await status(() => mlib.addCaptions(d("instructor").store, inst.actor, m.id, { language: "en", text: "not vtt" })), 422);
    mlib.addCaptions(d("instructor").store, inst.actor, m.id, { language: "en", text: "WEBVTT\n\n00:00.000 --> 00:02.000\nWelcome" });
    const r = mlib.shareMedia(d("instructor").store, inst.actor, m.id, { userIds: ["usr_demo_student1"], courseId: C1 });
    assert.ok(r.courseMediaId);
    assert.equal(storeOf("demo").list("caption_tracks", (c) => c.mediaId === r.courseMediaId).length, 1);
    assert.equal(mlib.myLibrary(d("student1", false).store, d("student1", false).actor).sharedWithMe.length, 1);
    assert.equal(await status(() => mlib.mediaForPlayback(d("student2", false).store, d("student2", false).actor, m.id)), 404);
    assert.equal(await status(() => mlib.shareMedia(d("student1", false).store, d("student1", false).actor, m.id, { userIds: ["usr_demo_student2"] })), 404);
  });
});

describe("OpenID Connect sign-in", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid: "k1", alg: "RS256", use: "sig" };
  const ISS = "https://id.example.edu";
  let claimsOverride: Record<string, unknown> = {};
  let lastNonce = "";
  const signIdToken = (claims: Record<string, unknown>) => {
    const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${h}.${p}.${cryptoSign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`;
  };
  before(() => {
    oidc.setOidcFetcher(async (url) => {
      const body = url.endsWith("/.well-known/openid-configuration")
        ? { issuer: ISS, authorization_endpoint: `${ISS}/authorize`, token_endpoint: `${ISS}/token`, jwks_uri: `${ISS}/jwks` }
        : url.endsWith("/jwks")
          ? { keys: [jwk] }
          : url.endsWith("/token")
            ? { id_token: signIdToken({ iss: ISS, aud: "campus-client", sub: "u-1", email: "kofi.sso@example.edu", email_verified: true, name: "Kofi SSO", nonce: lastNonce, exp: Math.floor(Date.now() / 1000) + 600, amr: ["pwd", "mfa"], ...claimsOverride }) }
            : {};
      return { ok: true, status: 200, json: async () => body };
    });
  });

  it("checks, enables, signs in with PKCE and verifies the ID token; JIT only when allowed", async () => {
    const adm = d("admin");
    const p = configureIdp(adm.store, adm.actor, { kind: "oidc", name: "Example ID", config: { issuer: ISS, clientId: "campus-client", scopes: "openid email profile", clientSecretEnv: "CAMPUS_OIDC_SECRET" }, jitProvisioning: true });
    assert.equal(await status(() => oidc.setOidcEnabled(storeOf("demo"), String(p.id), true)), 409, "must pass a check first");
    const chk = await oidc.checkOidc(storeOf("demo"), String(p.id));
    assert.equal(chk.connected, true);
    oidc.setOidcEnabled(storeOf("demo"), String(p.id), true);
    assert.deepEqual(oidc.enabledOidc(storeOf("demo")).map((x) => x.name), ["Example ID"]);
    const url = new URL(await oidc.startOidc(storeOf("demo"), String(p.id), "https://campus.example.edu", "/campus/demo/dashboard"));
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    lastNonce = String(url.searchParams.get("nonce"));
    const r = await oidc.finishOidc(storeOf("demo"), { state: String(url.searchParams.get("state")), code: "abc", base: "https://campus.example.edu" });
    assert.ok(r.token);
    const u = storeOf("demo").get("users", r.userId)!;
    assert.equal(u.email, "kofi.sso@example.edu");
    assert.equal(storeOf("demo").list("sessions", (s) => s.userId === r.userId)[0].mfa, true, "amr mfa carried into the session");
    // The state is single use.
    assert.equal(await status(() => oidc.finishOidc(storeOf("demo"), { state: String(url.searchParams.get("state")), code: "abc", base: "https://campus.example.edu" })), 401);
  });

  it("rejects a wrong nonce, a wrong audience, and unknown users when JIT is off", async () => {
    const store = storeOf("demo");
    const p = store.list("identity_providers", (x) => x.name === "Example ID")[0];
    const begin = async () => {
      const url = new URL(await oidc.startOidc(storeOf("demo"), p.id, "https://campus.example.edu", ""));
      lastNonce = String(url.searchParams.get("nonce"));
      return String(url.searchParams.get("state"));
    };
    let st = await begin();
    lastNonce = "tampered";
    assert.equal(await status(() => oidc.finishOidc(storeOf("demo"), { state: st, code: "c", base: "https://campus.example.edu" })), 401);
    st = await begin();
    claimsOverride = { aud: "someone-else" };
    assert.equal(await status(() => oidc.finishOidc(storeOf("demo"), { state: st, code: "c", base: "https://campus.example.edu" })), 401);
    claimsOverride = { email: "stranger@example.edu" };
    store.update("identity_providers", p.id, { jitProvisioning: false });
    st = await begin();
    assert.equal(await status(() => oidc.finishOidc(storeOf("demo"), { state: st, code: "c", base: "https://campus.example.edu" })), 403);
    claimsOverride = {};
    assert.equal(await status(() => configureIdp(d("admin").store, d("admin").actor, { kind: "oidc", name: "Bad", config: { issuer: ISS, clientId: "x", clientSecretEnv: "actual-secret-value!" } })), 422);
  });
});

describe("HTML view, keyboard gradebook", () => {
  it("HTML is converted through an allow-list and never stored raw", () => {
    const r = htmlToBlocks(`<h1>Title</h1><p onclick="steal()">Hi <script>alert(1)</script>there</p><img src="javascript:alert(1)"><a href="javascript:x">x</a><ul><li>a</li></ul>`);
    assert.deepEqual(r.blocks.map((b) => b.type), ["heading", "paragraph", "paragraph", "list"]);
    assert.ok(["script", "event handler", "unsafe link", "image with unsafe source"].every((x) => r.removed.includes(x)));
    assert.equal(JSON.stringify(r.blocks).includes("alert"), false);
    const v = htmlToValidBlocks(`<iframe src="https://evil.test/x" title="x"></iframe><p>ok</p>`, validateBlocks);
    assert.deepEqual(v.blocks.map((b) => b.type), ["paragraph"]);
    assert.ok(v.removed.some((x) => /embed/.test(x)));
  });

  it("saves only changed cells, accepts EX, and reports bad cells", async () => {
    const inst = d("instructor");
    const r = (await run("grades.set_many", inst.store, inst.actor, { courseId: C1, g__asg_demo_hello__usr_demo_student6: "9", o__asg_demo_hello__usr_demo_student6: "", g__asg_demo_hello__usr_demo_student5: "EX", o__asg_demo_hello__usr_demo_student5: "", g__asg_demo_hello__usr_demo_student4: "abc", o__asg_demo_hello__usr_demo_student4: "" })) as { saved: number; errors: unknown[] };
    assert.equal(r.saved, 2);
    assert.equal(r.errors.length, 1);
    const g6 = storeOf("demo").list("grades", (g) => g.assignmentId === "asg_demo_hello" && g.userId === "usr_demo_student6")[0];
    assert.equal(Number(g6.score), 9);
    assert.equal(!!storeOf("demo").list("grades", (g) => g.assignmentId === "asg_demo_hello" && g.userId === "usr_demo_student5")[0].excused, true);
    assert.equal(await status(() => run("grades.set_many", d("student1", false).store, d("student1", false).actor, { courseId: C1 })), 403);
  });
});

describe("Localization", () => {
  it("every catalog covers every key; Arabic is right-to-left; dates follow the person's zone", () => {
    for (const [l, keys] of Object.entries(missingKeys())) assert.deepEqual(keys, [], l);
    assert.equal(LOCALES.length, 5);
    assert.equal(dirFor("ar"), "rtl");
    assert.equal(dirFor(asLocale("xx")), "ltr");
    assert.equal(t("es", "nav.courses"), "Cursos");
    assert.equal(t("fr", "no.such.key"), "no.such.key");
    const iso = "2026-10-05T03:30:00.000Z";
    assert.match(formatDate(iso, true, { tz: "UTC", locale: "en" }), /5 Oct 2026, 03:30 UTC/);
    assert.match(formatDate(iso, true, { tz: "America/New_York", locale: "en" }), /4 Oct 2026, 23:30 EDT/);
    assert.match(formatDate(iso, false, { tz: "Africa/Lagos", locale: "fr" }), /5 oct\.? 2026/);
  });
});

describe("Parity ledger", () => {
  it("every row is done, each with evidence", () => {
    const s = paritySummary();
    assert.equal(s.notStarted, 0);
    assert.equal(s.partial, 0);
    assert.deepEqual(PARITY.filter((r) => r.status !== "DONE").map((r) => r.feature), []);
    for (const r of PARITY) assert.ok(r.evidence.trim().length > 0, r.feature);
  });
});
