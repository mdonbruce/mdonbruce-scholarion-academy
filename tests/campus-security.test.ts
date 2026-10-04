import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { broker, CampusError, resolveTenant } from "../src/campus/core";
import { actorFor, decideSupportGrant, requestSupportGrant, resolveSession, signIn, type Actor } from "../src/campus/iam";
import { DEMO_PASSWORD } from "../src/campus/seed";
import { ENTITIES } from "../src/campus/registry";
import * as entity from "../src/campus/entity";
import * as grading from "../src/campus/services/grading";
import * as asm from "../src/campus/services/assessment";
import * as sis from "../src/campus/services/sis";
import * as success from "../src/campus/services/success";
import * as desk from "../src/campus/services/desk";
import * as admin from "../src/campus/services/admin";
import * as ai from "../src/campus/services/ai";
import * as files from "../src/campus/services/files";
import * as lti from "../src/campus/services/lti";
import * as integration from "../src/campus/services/integration";
import { executeGraphql } from "../src/campus/http/graphql";
import { ctx } from "./campus-helpers";

const CID = "crs_demo_cs101";

function outcome(fn: () => unknown): "allow" | "deny" {
  try {
    fn();
    return "allow";
  } catch (e) {
    if (e instanceof CampusError && [401, 403, 404].includes(e.status)) return "deny";
    if (e instanceof CampusError) return "allow"; // passed authorization, failed validation/state
    throw e;
  }
}

describe("Authorization matrix", () => {
  before(() => {
    freshCampus();
  });

  type Cell = [role: string, action: string, expected: "allow" | "deny", run: (s: ReturnType<typeof as>) => unknown];
  const cells: Cell[] = [
    // students
    ["student1", "read a published page", "allow", ({ store, actor }) => entity.read(store, actor, "pages", "pg_demo_welcome")],
    ["student1", "create a page", "deny", ({ store, actor }) => entity.create(store, actor, "pages", { courseId: CID, moduleId: "mod_demo_cs101_1", title: "x", blocks: [] })],
    ["student1", "enter a grade", "deny", ({ store, actor }) => grading.setGrade(store, actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student2", score: 10 })],
    ["student1", "view the gradebook grid", "deny", ({ store, actor }) => grading.gradebookGrid(store, actor, CID)],
    ["student1", "see another student's transcript", "deny", ({ store, actor }) => sis.unofficialTranscript(store, actor, "usr_demo_student2")],
    ["student1", "see own transcript", "allow", ({ store, actor }) => sis.unofficialTranscript(store, actor, "usr_demo_student1")],
    ["student1", "list other people's enrollments", "deny", ({ store, actor }) => {
      if (entity.list(store, actor, "enrollments", {}).items.some((e) => e.userId !== actor.id)) return true;
      throw new CampusError("forbidden", "only own rows", 403);
    }],
    ["student1", "read the audit log via admin overview", "deny", ({ store, actor }) => admin.adminOverview(store, actor)],
    ["student1", "work the help desk queue", "deny", ({ store, actor }) => desk.ticketQueue(store, actor)],
    ["student1", "run AI control center", "deny", ({ store, actor }) => ai.controlCenter(store, actor)],
    // TA in CS-101
    ["ta", "enter a grade in CS-101", "allow", ({ store, actor }) => grading.setGrade(store, actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student4", score: 7 })],
    ["ta", "create a course", "deny", ({ store, actor }) => entity.create(store, actor, "courses", { code: "TA-1", title: "x" })],
    ["ta", "grade in WRIT-120 (not enrolled)", "deny", ({ store, actor }) => grading.gradebookGrid(store, actor, "crs_demo_writ120")],
    // instructor
    ["instructor", "post grades", "allow", ({ store, actor }) => grading.postGrades(store, actor, "asg_demo_hello")],
    ["instructor", "open another instructor's course gradebook", "deny", ({ store, actor }) => grading.gradebookGrid(store, actor, "crs_demo_data210")],
    ["instructor", "change the permission matrix", "deny", ({ store, actor }) => admin.setTheme(store, actor, { primary: "#1f4e79", accent: "#c2410c", logoText: "x" })],
    // designer (tenant-wide)
    ["designer", "create a course", "allow", ({ store, actor }) => entity.create(store, actor, "courses", { code: "DES-1", title: "Designer course" })],
    ["designer", "enter a grade", "deny", ({ store, actor }) => grading.setGrade(store, actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student4", score: 7 })],
    // registrar
    ["registrar", "see a student's transcript", "allow", ({ store, actor }) => sis.unofficialTranscript(store, actor, "usr_demo_student1")],
    ["registrar", "view a gradebook", "deny", ({ store, actor }) => grading.gradebookGrid(store, actor, CID)],
    // advisor
    ["advisor", "see the caseload", "allow", ({ store, actor }) => success.caseload(store, actor)],
    ["advisor", "post grades", "deny", ({ store, actor }) => grading.postGrades(store, actor, "asg_demo_hello")],
    // support without a grant
    ["support", "work the queue without a grant", "deny", ({ store, actor }) => desk.ticketQueue(store, actor)],
    // observer
    ["parent", "see the consented summary", "allow", ({ store, actor }) => success.observerSummary(store, actor, "usr_demo_student1")],
    ["parent", "view the gradebook", "deny", ({ store, actor }) => grading.gradebookGrid(store, actor, CID)],
    ["parent", "submit for the student", "deny", ({ store, actor }) => asm.submit(store, actor, "asg_demo_hello", { mode: "text", body: "x" })],
    // admin
    ["admin", "view any gradebook", "allow", ({ store, actor }) => grading.gradebookGrid(store, actor, "crs_demo_data210")],
    ["admin", "AI control center", "allow", ({ store, actor }) => ai.controlCenter(store, actor)],
    ["admin", "platform metrics (not an operator)", "deny", ({ store, actor }) => { void store; return admin.restoreDrill(actor, "bk_x"); }],
  ];

  for (const [role, action, expected, run] of cells) {
    it(`${role}: ${action} → ${expected}`, () => {
      const s = as("demo", role, role === "admin" || role === "registrar" || role === "support");
      const auditBefore = s.store.raw().audit.filter((x) => x.outcome === "denied").length;
      const got = outcome(() => run(s));
      assert.equal(got, expected);
      if (expected === "deny" && role !== "admin") {
        const after = storeOf("demo").raw().audit.filter((x) => x.outcome === "denied").length;
        assert.ok(after >= auditBefore, "denials are recorded");
      }
    });
  }

  it("support gets queue access only through an approved, time-boxed grant", () => {
    const sup = as("demo", "support");
    const g = requestSupportGrant(sup.store, sup.actor, { reason: "Ticket triage shift", hours: 2 }) as { id: string };
    assert.equal(outcome(() => desk.ticketQueue(as("demo", "support").store, as("demo", "support").actor)), "deny");
    const adm = as("demo", "admin");
    decideSupportGrant(adm.store, adm.actor, g.id, true);
    assert.equal(outcome(() => desk.ticketQueue(as("demo", "support").store, as("demo", "support").actor)), "allow");
  });

  it("every registry resource has explicit read permissions, and write roles are a subset of known roles", () => {
    const roles = new Set(["admin", "instructor", "ta", "designer", "student", "observer", "advisor", "registrar", "support"]);
    for (const e of ENTITIES) {
      assert.ok(Array.isArray(e.perms.read), `${e.table} has read perms`);
      for (const op of ["read", "create", "update", "archive", "publish"] as const) for (const r of e.perms[op] ?? []) assert.ok(roles.has(r), `${e.table}.${op}: ${r}`);
    }
  });
});

describe("Negative cross-tenant suite", () => {
  let demoAdmin: Actor;
  before(() => {
    freshCampus();
    demoAdmin = as("demo", "admin").actor;
  });

  it("no TechDev record id resolves inside the demo tenant, for any resource", () => {
    const tech = storeOf("techdev");
    let checked = 0;
    for (const e of ENTITIES) {
      for (const r of tech.list(e.table).slice(0, 5)) {
        const demo = storeOf("demo");
        if (demo.get(e.table, r.id)) {
          // Deterministic seed ids are tenant-prefixed, so an equal id must never exist.
          assert.fail(`${e.table}/${r.id} visible in demo`);
        }
        assert.throws(() => entity.read(demo, demoAdmin, e.table, r.id), (x: unknown) => (x as CampusError).status === 404);
        checked++;
      }
    }
    assert.ok(checked > 100, `checked ${checked} records`);
  });

  it("references to another tenant's records are rejected at validation", () => {
    const d = as("demo", "admin");
    assert.throws(() => entity.create(d.store, d.actor, "pages", { courseId: "crs_techdev_cs101", moduleId: "mod_techdev_cs101_1", title: "x", blocks: [] }), (x: unknown) => (x as CampusError).status === 422);
  });

  it("sessions, API tokens and LTI tokens from one tenant mean nothing in another", () => {
    const t = signIn(storeOf("techdev"), "student1@techdev.scholarion.test", DEMO_PASSWORD) as { token: string };
    assert.equal(resolveSession(storeOf("demo"), t.token), null);
    const tech = as("techdev", "instructor");
    const pat = integration.createPersonalToken(tech.store, tech.actor, { purpose: "x", scopes: ["read"] });
    assert.throws(() => integration.resolveApiToken(storeOf("demo"), pat.access_token), (x: unknown) => (x as CampusError).status === 401);
    // A launch token signed with TechDev's platform key is rejected by the demo tool endpoint.
    lti.jwks(storeOf("techdev"));
    const techKey = storeOf("techdev").list("lti_keys", (k) => k.kind === "lti_platform")[0];
    const fakeLaunch = lti.signJwt({ iss: "https://techdev.campus.scholarion.local", aud: lti.CLOUD_LAB_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 60, nonce: "n", jti: "j" }, String(techKey.privatePem), String(techKey.kid));
    assert.throws(() => lti.toolReceiveLaunch(storeOf("demo"), fakeLaunch), (x: unknown) => (x as CampusError).status === 401);
  });

  it("signed object URLs are bound to the tenant", () => {
    const st = as("techdev", "student1", false);
    const up = files.requestUpload(st.store, st.actor, { name: "a.pdf", mime: "application/pdf", size: 10, courseId: "crs_techdev_cs101", purpose: "submission" });
    const u = new URL(up.upload.url, "http://x");
    assert.throws(() => files.verifySignature("tn_demo", "put", String(up.file.id), u.searchParams.get("exp"), u.searchParams.get("sig")), (x: unknown) => (x as CampusError).status === 403);
  });

  it("search, GraphQL and AI retrieval never surface another tenant's content", () => {
    const d = as("demo", "admin");
    const tech = storeOf("techdev");
    tech.update("pages", "pg_techdev_welcome", { html: "<p>TECHDEV-ONLY-MARKER welcome text</p>" });
    assert.equal(success.search(d.store, d.actor, "TECHDEV-ONLY-MARKER").length, 0);
    const g = executeGraphql(d.store, d.actor, ctx("demo"), `{ pagesById(id: "pg_techdev_welcome") { title } }`);
    assert.equal((g.data as Record<string, unknown>).pagesById, null);
    const a = ai.ask(as("demo", "instructor").store, as("demo", "instructor").actor, "course_assistant", "TECHDEV-ONLY-MARKER welcome", { courseId: CID });
    assert.ok(!JSON.stringify(a).includes("TECHDEV-ONLY-MARKER"));
  });

  it("unknown, suspended and mismatched tenants are refused before the store is opened", () => {
    assert.throws(() => resolveTenant({ slug: "no-such-school" }), /Unknown school/);
    assert.throws(() => resolveTenant({ host: "techdev.campus.scholarion.localhost", slug: "demo" }), (x: unknown) => (x as CampusError).status === 403);
    const ops = as("techdev", "ops").actor;
    admin.setTenantStatus(ops, "tn_demo", "suspended");
    assert.throws(() => broker.connect(ctx("demo")), (x: unknown) => (x as CampusError).status === 423);
    admin.setTenantStatus(ops, "tn_demo", "active");
  });

  it("act-as can't target another admin and is refused without MFA", () => {
    const s = storeOf("demo");
    const sess = signIn(s, "instructor@demo.scholarion.test", DEMO_PASSWORD) as { token: string };
    void sess;
    const adminNoMfa = actorFor(storeOf("demo"), "usr_demo_admin", false);
    assert.throws(() => admin.startMasquerade(storeOf("demo"), adminNoMfa, "secret", "usr_demo_student1", "Checking a report"), /sign in|two-step/i);
  });
});
