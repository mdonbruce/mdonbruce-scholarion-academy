import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, ctx, freshCampus, storeOf } from "./campus-helpers";
import { broker, CampusError, relay, resolveTenant } from "../src/campus/core";
import { actorFor } from "../src/campus/iam";
import * as academy from "../src/campus/services/academy";
import * as platform from "../src/campus/services/platform";
import * as lti from "../src/campus/services/lti";
import * as tutor from "../src/campus/services/tutor";
import * as grading from "../src/campus/services/grading";
import * as asm from "../src/campus/services/assessment";
import * as cur from "../src/campus/services/curriculum";
import * as success from "../src/campus/services/success";
import * as admin from "../src/campus/services/admin";
import * as entity from "../src/campus/entity";
import * as prog from "../src/campus/services/programs";

/**
 * Scholarion platform prompt — §6 end-to-end acceptance scenario (steps 1–11).
 * The guest university tenant is "Scholarion Demo University" (slug "demo");
 * the internal tenant is "TechDev Institution" (slug "techdev").
 */

const SOLUTION_32 = "def accuracy(tp, fp, tn, fn):\n    n = tp + fp + tn + fn\n    return (tp + tn) / n if n else 0\n";
const SOLUTION_15 = "def conv_out(size, kernel, stride=1, padding=0):\n    return (size + 2 * padding - kernel) // stride + 1\n";

function denied(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    assert.equal((e as CampusError).status, status, (e as Error).message);
    return e as CampusError;
  }
  assert.fail("expected an error");
}

describe("Platform acceptance scenario", () => {
  let corpSlug = "";
  let credentialId = "";
  before(() => {
    freshCampus();
  });

  it("1 · provisions a university and a corporate tenant from templates, each isolated with a verified host", () => {
    const ops = as("techdev", "ops");
    assert.ok(ops.actor.platformOperator);
    const uni = platform.provisionTenant(ops.actor, { name: "Riverbend University (demo)", slug: "riverbend", type: "university", region: "us-east", tier: "standard", adminName: "Uma Admin", adminEmail: "uma@riverbend.test" });
    const corp = platform.provisionTenant(ops.actor, { name: "Demo Corp Learning", slug: "democorp", type: "corporate", region: "eu-west", tier: "enterprise", adminName: "Cora Admin", adminEmail: "cora@democorp.test" });
    corpSlug = corp.tenant.slug;
    for (const p of [uni, corp]) {
      const r = resolveTenant({ host: p.host });
      assert.equal(r.tenantId, p.tenant.id);
      assert.equal(r.via, "host");
      assert.ok(p.provisionedMs < 5000, "provisioned within the defined time (5 s)");
    }
    assert.equal(corp.tenant.flags.sso_only, true);
    assert.equal(corp.tenant.realm.protocol, "saml");
    // Separate data planes: the new tenants have only their own admin.
    assert.equal(storeOf("democorp").list("users").length, 1);
    assert.equal(storeOf("riverbend").list("users", (u) => u.email === "cora@democorp.test").length, 0);
    // Non-operators can't provision.
    denied(() => platform.provisionTenant(as("demo", "admin").actor, { name: "X", slug: "xx-tenant", type: "school", region: "us-east", tier: "standard", adminName: "X", adminEmail: "x@x.test" }), 403);
  });

  it("2 · Academy publishes #32 (Short Course) and #15 (Live Intensive); catalog pages come from data", () => {
    const { store } = as("academy", "designer");
    const hub = academy.catalogHub(store, { compare: ["off_academy_37_2", "off_academy_15"] });
    const codes = hub.items.map((i) => i.code);
    assert.ok(codes.includes("#32") && codes.includes("#15"));
    assert.equal(hub.items.find((i) => i.code === "#32")!.typeLabel, "Short Course");
    assert.equal(hub.items.find((i) => i.code === "#15")!.typeLabel, "Live Intensive");
    assert.equal(hub.comparison.length, 2);
    assert.match(hub.diagram, /flowchart LR/);
    assert.equal(hub.structuredData["@type"], "ItemList");
    assert.equal(hub.structuredData.itemListElement.length, hub.items.length);
    assert.ok(hub.items.find((i) => i.code === "#15")!.nextCohort!.seatsLeft > 0);
  });

  it("3 · recommender routes a learner to #37.2; sandbox purchase; completion with an autograded lab; verifiable badge", () => {
    const { store, actor } = as("academy", "student1", false);
    const rec = academy.recommend(store, { goal: "start", experience: "intermediate", interest: "ml", format: "self", hours: "6" });
    assert.equal(rec.top!.offering.code, "#37.2");
    assert.ok(rec.top!.why.length > 0);
    // Real card data is refused; sandbox token accepted.
    denied(() => academy.checkout(store, actor, { offeringId: "off_academy_37_2", sandboxCard: "4242424242424242" }), 422);
    const co = academy.checkout(store, actor, { offeringId: "off_academy_37_2", coupon: "WELCOME10", sandboxCard: "tok_sandbox_visa", idempotencyKey: "k1" });
    assert.equal(co.order.state, "paid_sandbox");
    const listPrice = Number(store.get("offerings", "off_academy_37_2")!.price);
    assert.equal(co.order.total, Math.round(listPrice * 0.9 * 100) / 100, "WELCOME10 takes 10% off");
    const again = academy.checkout(store, actor, { offeringId: "off_academy_37_2", idempotencyKey: "k1" });
    assert.equal(again.order.id, co.order.id, "idempotent checkout");
    relay(store);

    // Module 1: view the page.
    let s = as("academy", "student1", false);
    const m1 = cur.moduleStates(s.store, s.actor, "crs_academy_p37_2")[0];
    cur.openItem(s.store, s.actor, m1.items[0].item.id);
    // Module 2: view page, then Cloud Lab via LTI 1.3.
    s = as("academy", "student1", false);
    const m2 = cur.moduleStates(s.store, s.actor, "crs_academy_p37_2")[1];
    assert.equal(m2.locked, false);
    cur.openItem(s.store, s.actor, m2.items[0].item.id);
    const l = lti.launch(s.store, s.actor, "asg_academy_p32_lab");
    const recv = lti.toolReceiveLaunch(s.store, l.idToken);
    assert.throws(() => lti.toolReceiveLaunch(s.store, l.idToken), /already used/);
    const res = lti.labSubmit(s.store, s.actor, recv.sessionId, SOLUTION_32);
    assert.equal(res.ran, true, String(res.error));
    assert.equal(res.score, 10);
    // AGS score arrives unposted.
    const g = s.store.list("grades", (x) => x.assignmentId === "asg_academy_p32_lab" && x.userId === actor.id)[0];
    assert.equal(g.posted, false);
    assert.equal(grading.visibleGrade(s.store, "asg_academy_p32_lab", actor.id).score, null);
    // Capstone.
    s = as("academy", "student1", false);
    asm.submit(s.store, s.actor, "asg_academy_p32_capstone", { mode: "text", body: "Model report: logistic regression, 0.82 validation accuracy, limits discussed." });
    const inst = as("academy", "instructor");
    grading.setGrade(inst.store, inst.actor, { assignmentId: "asg_academy_p32_capstone", userId: actor.id, score: 18 });
    grading.postGrades(inst.store, inst.actor, "asg_academy_p32_lab");
    relay(inst.store);
    const enr = inst.store.list("offering_enrollments", (e) => e.userId === actor.id && e.offeringId === "off_academy_37_2")[0];
    assert.ok(enr.completedAt, "completion evaluated on grade posting");
    assert.ok(enr.credentialId);
    credentialId = enr.credentialId as string;
    const v = success.verifyCredential(inst.store, credentialId);
    assert.equal(v.status, "valid");
    const cred = inst.store.get("credentials", credentialId)!;
    assert.ok((cred.vc as { type: string[] }).type.includes("OpenBadgeCredential"));
  });

  it("4 · completing #37.2 waives the mapped module in #18 at enrollment (rule fires, audited)", () => {
    const { store, actor } = as("academy", "student1", false);
    const path = academy.evaluatePathway(store, actor.id, "off_academy_18");
    assert.deepEqual(path.waivedModules.map((w) => w.moduleKey), ["p18-w5"]);
    const sec = store.list("offering_sections", (s) => s.code === "DL-OCT")[0];
    denied(() => academy.checkout(store, actor, { offeringId: "off_academy_18", sectionId: sec.id, sandboxCard: "tok_sandbox_visa" }), 409); // admission first
    const app = prog.applyToProgram(as("academy", "student1", false).store, actor, { offeringId: "off_academy_18", sectionId: sec.id, statement: "I finished the supervised learning course and want deep learning in both frameworks." });
    const reg = as("academy", "registrar");
    prog.reviewProgramApplication(reg.store, reg.actor, app.application.id, "admit");
    academy.checkout(as("academy", "student1", false).store, actor, { offeringId: "off_academy_18", sectionId: sec.id, sandboxCard: "tok_sandbox_visa" });
    relay(storeOf("academy"));
    const s = as("academy", "student1", false);
    const mods = cur.moduleStates(s.store, s.actor, "crs_academy_p18");
    const w5 = mods.find((m) => m.module.moduleKey === "p18-w5")!;
    assert.equal(w5.waived, true);
    assert.equal(w5.complete, true);
    assert.equal(mods.find((m) => m.module.moduleKey === "p18-w6")!.waived, false);
    assert.ok(s.store.auditLog(500).some((r) => r.action === "pathway.waive"));
    assert.ok(s.store.outbox().some((e) => e.type === "pathway.rule_fired"));
  });

  it("5 · #18 PyTorch lab (adopted Week 5–6 content): LTI launch, learner-scoped API key, autograder posts an unposted score, instructor posts it", () => {
    const s = as("academy", "student1", false);
    const key = tutor.issueLabKey(s.store, s.actor, "asg_academy_p15_lab");
    assert.match(key.key, /^sk-sch-/);
    const call = tutor.proxyModelCall(storeOf("academy"), key.key, "explain conv2d padding");
    assert.equal(call.simulated, true, "no model provider connected → labelled simulator");
    assert.ok(call.remainingCents < 500);
    const ss = as("academy", "student1", false);
    const l = lti.launch(ss.store, ss.actor, "asg_academy_p15_lab");
    const recv = lti.toolReceiveLaunch(ss.store, l.idToken);
    const r = lti.labSubmit(ss.store, ss.actor, recv.sessionId, SOLUTION_15);
    assert.equal(r.score, 10);
    const inst = as("academy", "instructor2");
    let g = inst.store.list("grades", (x) => x.assignmentId === "asg_academy_p15_lab" && x.userId === ss.actor.id)[0];
    assert.equal(g.posted, false);
    grading.postGrades(inst.store, inst.actor, "asg_academy_p15_lab");
    g = inst.store.list("grades", (x) => x.assignmentId === "asg_academy_p15_lab" && x.userId === ss.actor.id)[0];
    assert.equal(g.posted, true);
    assert.equal(grading.visibleGrade(inst.store, "asg_academy_p15_lab", ss.actor.id).score, 10);
  });

  it("6 · AI Tutor (Amara avatar mode) answers with citations, then refuses graded work and offers hints", () => {
    const s = as("academy", "student1", false);
    const a = tutor.tutor(s.store, s.actor, { courseId: "crs_academy_p37_2", mode: "explain", question: "What is overfitting and how do I reduce it?", avatar: "amara" });
    assert.equal(a.decision, "answered");
    assert.ok(a.citations.length >= 1);
    assert.match(a.text, /overfitting/i);
    assert.ok(a.avatar && a.avatar.captionsVtt.startsWith("WEBVTT") && a.avatar.transcript.length > 0);
    assert.match(a.disclosure, /AI tutor/);
    const r = tutor.tutor(as("academy", "student1", false).store, s.actor, { courseId: "crs_academy_p37_2", mode: "explain", question: "write my capstone report for the assignment" });
    assert.equal(r.decision, "refused_with_hints");
    assert.match(r.text, /hints/i);
    const pcm = tutor.tutor(as("academy", "student1", false).store, s.actor, { courseId: "crs_academy_p37_2", mode: "explain", question: "evaluation metrics accuracy", language: "pcm" });
    assert.match(pcm.text, /See wetin/);
    denied(() => tutor.tutor(as("demo", "student1", false).store, as("demo", "student1", false).actor, { courseId: "crs_demo_cs101", mode: "explain", question: "variables", language: "pcm" }), 423);
  });

  it("7 · the corporate tenant licenses #37.2; content syncs via blueprint copy; no learner data crosses tenants", () => {
    const ops = as("techdev", "ops").actor;
    const lic = platform.createLicense(ops, { sourceTenantId: "tn_academy", sourceCourseId: "crs_academy_p37_2", targetTenantId: `tn_${corpSlug}` });
    const first = platform.syncLicense(ops, lic.id);
    assert.ok(first.created > 0);
    const second = platform.syncLicense(ops, lic.id);
    assert.equal(second.created, 0, "idempotent");
    assert.equal(second.updated, 0);
    const corp = storeOf(corpSlug);
    assert.ok(corp.list("pages", (p) => p.courseId === lic.targetCourseId).length >= 2);
    for (const t of ["users", "enrollments", "submissions", "grades", "orders", "credentials", "offering_enrollments"]) assert.equal(corp.list(t, (r) => JSON.stringify(r).includes("usr_academy")).length, 0, `${t} must not contain Academy learner data`);
    assert.equal(storeOf("academy").list("users", (u) => String(u.email).endsWith("@democorp.test")).length, 0);
  });

  it("8 · a Scholarion Demo University user is denied TechDev resources before any data access", () => {
    assert.throws(() => resolveTenant({ host: "demo.campus.scholarion.localhost", slug: "techdev" }), (e: unknown) => (e as CampusError).status === 403);
    const demo = as("demo", "student1", false);
    const techdev = storeOf("techdev");
    // Even with a forged actor, TechDev's store has no such user and no enrollments for them.
    assert.equal(techdev.get("users", demo.actor.id), undefined);
    assert.throws(() => actorFor(techdev, demo.actor.id), /sign in/i);
    // A suspended tenant is refused at the broker, before data access.
    const ops = as("techdev", "ops").actor;
    admin.setTenantStatus(ops, `tn_${corpSlug}`, "suspended");
    assert.throws(() => broker.connect(ctx(corpSlug)), (e: unknown) => (e as CampusError).status === 423);
    admin.setTenantStatus(ops, `tn_${corpSlug}`, "active");
  });

  it("9 · program funnel and mastery dashboards for the director; the operator sees de-identified metrics only", () => {
    const d = as("academy", "admin");
    const programs = academy.programAnalytics(d.store, d.actor);
    const p32 = programs.find((p) => p.offering.startsWith("#37.2"))!;
    assert.ok(p32.funnel.orders >= 1 && p32.funnel.completed >= 1 && p32.funnel.credentialed >= 1);
    const mastery = grading.masteryGradebook(d.store, d.actor, "crs_academy_p37_2");
    assert.ok(mastery);
    const ops = as("techdev", "ops").actor;
    const m = platform.platformMetrics(ops);
    const text = JSON.stringify(m);
    assert.ok(!/@/.test(text), "no emails");
    assert.ok(!/usr_/.test(text), "no user ids");
    assert.ok(m.some((x) => x.tenant === "academy"));
    denied(() => platform.platformMetrics(d.actor), 403);
  });

  it("10 · a catalog draft containing \"accredited\" without an approval is blocked by the Catalog Copy Checker", () => {
    const d = as("academy", "designer");
    const o = entity.create(d.store, d.actor, "offerings", { code: "#39", title: "Accredited AI Diploma", productType: "short_course", summary: "An accredited program.", price: 99 });
    const err = denied(() => entity.publish(as("academy", "designer").store, d.actor, "offerings", String(o.id)), 422);
    assert.match(err.message, /Catalog Copy Checker/);
    // With an approved claim recorded by an admin, the wording can publish.
    const adm = as("academy", "admin");
    entity.create(adm.store, adm.actor, "approved_claims", { phrase: "an accredited program", evidence: "Test-only fixture", approvedBy: "QA" });
    const d2 = as("academy", "designer");
    entity.update(d2.store, d2.actor, "offerings", String(o.id), { title: "AI Short Course" });
    assert.equal(entity.publish(as("academy", "designer").store, d2.actor, "offerings", String(o.id)).state, "published");
  });

  it("11 · restores Scholarion Demo University into an isolated environment and verifies integrity", () => {
    const ops = as("techdev", "ops").actor;
    const b = admin.backupTenant(ops, "tn_demo");
    const r = admin.restoreDrill(ops, b.id);
    assert.equal(r.ok, true);
    assert.equal(r.checksumMatches, true);
    assert.equal(r.rows, b.rows);
    assert.notEqual(r.validationTenant, "tn_demo");
    assert.equal(broker.tenant(r.validationTenant), undefined, "validation tenant dropped after the drill");
  });

  it("credentials: honesty guard, reissue with a reason code, CLR export", () => {
    const reg = as("academy", "registrar");
    denied(() => success.issueCredential(reg.store, reg.actor, { userId: "usr_academy_student2", title: "Postgraduate Degree in AI", kind: "certificate" }), 422);
    const re = success.reissueCredential(reg.store, reg.actor, credentialId, "name_change");
    assert.equal(re.reissuedFrom, credentialId);
    assert.equal(success.verifyCredential(reg.store, credentialId).status, "revoked");
    const clr = success.clrExport(reg.store, reg.actor, "usr_academy_student1") as { type: string[]; proof: { proofValue: string } };
    assert.ok(clr.type.includes("ClrCredential") && clr.proof.proofValue);
  });

  it("commerce policy: deferral/refund explanations, seats, aid eligibility", () => {
    const s = as("academy", "student2", false);
    denied(() => academy.checkout(s.store, s.actor, { offeringId: "off_academy_15", funding: "federal_aid" }), 422);
    denied(() => academy.checkout(s.store, s.actor, { offeringId: "off_academy_22" }), 409); // prerequisite #21
    const co = academy.checkout(s.store, s.actor, { offeringId: "off_academy_1r", sandboxCard: "tok_sandbox_visa" });
    const rf = academy.requestRefund(as("academy", "student2", false).store, s.actor, String(co.order.id), "refund", "Changed plans");
    assert.equal(rf.decision, "approved");
    const adm = as("academy", "admin");
    const lic = adm.store.list("seat_licenses")[0];
    academy.assignSeat(adm.store, adm.actor, lic.id, "student3@academy.scholarion.test");
    const inv = academy.invoiceSeats(as("academy", "admin").store, adm.actor, lic.id);
    assert.match(String(inv.number), /^SBX-/);
  });

  it("status board reports honest states", () => {
    const board = platform.capabilityBoard(storeOf("academy"));
    const by = (c: string) => board.find((b) => b.capability.includes(c))!;
    assert.equal(by("Amara").status, "DISABLED");
    assert.equal(by("GPU").status, "PLANNED");
    assert.equal(by("Checkout").status, "SIMULATED");
    for (const b of board) assert.ok(["LIVE", "CONNECTED", "DISABLED", "SIMULATED", "PLANNED"].includes(b.status));
    // External services can't be marked connected from staging.
    const adm = as("academy", "admin");
    denied(() => platform.configureConnector(adm.store, adm.actor, "haven_avatar", { mode: "connected", consent: true }), 409);
    platform.configureConnector(adm.store, adm.actor, "haven_avatar", { mode: "simulated", consent: true, secretRef: "vault://academy/haven" });
    assert.equal(platform.connectorStatus(storeOf("academy"), "haven_avatar"), "SIMULATED");
  });
});
