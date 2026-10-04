import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, ctx, freshCampus, storeOf } from "./campus-helpers";
import { broker, CampusError, metrics, relay, resolveTenant } from "../src/campus/core";
import { demoTotp, resolveSession, signIn } from "../src/campus/iam";
import { DEMO_MFA_SECRET, DEMO_PASSWORD } from "../src/campus/seed";
import * as entity from "../src/campus/entity";
import * as cur from "../src/campus/services/curriculum";
import * as files from "../src/campus/services/files";
import * as sis from "../src/campus/services/sis";
import * as asm from "../src/campus/services/assessment";
import * as grading from "../src/campus/services/grading";
import * as success from "../src/campus/services/success";
import * as ai from "../src/campus/services/ai";
import * as lti from "../src/campus/services/lti";
import * as admin from "../src/campus/services/admin";
import * as col from "../src/campus/services/collaboration";

/**
 * Master Build Prompt — end-to-end acceptance scenario (steps 1–16).
 * Guest university tenant: Scholarion Demo University ("demo"). Internal tenant: TechDev Institution ("techdev").
 */

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

function status(fn: () => unknown): number {
  try {
    fn();
    return 200;
  } catch (e) {
    if (!(e instanceof CampusError)) throw e;
    return e.status;
  }
}

describe("Master acceptance scenario", () => {
  let newCourseId = "";
  before(() => {
    freshCampus();
  });

  it("1 · the tenant has its own data plane and identity realm", () => {
    const t = broker.tenant("demo")!;
    assert.equal(t.name, "Scholarion Demo University");
    assert.equal(t.realm.mfaRequiredForStaff, true);
    const demo = storeOf("demo");
    const tech = storeOf("techdev");
    assert.notEqual(demo.raw(), tech.raw(), "separate object graphs");
    assert.ok(demo.list("users").every((u) => String(u.email).endsWith("@demo.scholarion.test")));
  });

  it("2 · resolves the verified host and issues a tenant-scoped session (staff need TOTP)", () => {
    const r = resolveTenant({ host: "demo.campus.scholarion.localhost" });
    assert.equal(r.via, "host");
    const store = broker.connect(r);
    assert.deepEqual(signIn(store, "admin@demo.scholarion.test", DEMO_PASSWORD), { needsMfa: true });
    const s = signIn(store, "admin@demo.scholarion.test", DEMO_PASSWORD, demoTotp(DEMO_MFA_SECRET));
    assert.ok(!s.needsMfa && s.token);
    assert.equal(resolveSession(storeOf("demo"), (s as { token: string }).token)?.id, "usr_demo_admin");
    assert.equal(resolveSession(storeOf("techdev"), (s as { token: string }).token), null);
    assert.throws(() => resolveTenant({ host: "unverified.example.edu" }), /Couldn't tell/);
  });

  it("3 · authors a course, publishes accessible modules (a11y gate), and creates a section", () => {
    const d = as("demo", "designer");
    const c = entity.create(d.store, d.actor, "courses", { code: "HIST-150", title: "World History I", description: "Survey course." });
    newCourseId = String(c.id);
    const m = entity.create(d.store, d.actor, "modules", { courseId: newCourseId, title: "Week 1", position: 1 });
    const p = entity.create(d.store, d.actor, "pages", { courseId: newCourseId, moduleId: m.id, title: "Sources", blocks: [{ type: "heading", level: 2, text: "Primary sources" }, { type: "image", src: "https://media.scholarion.local/map.png" }] });
    assert.equal(status(() => entity.publish(as("demo", "designer").store, d.actor, "pages", String(p.id))), 422, "missing alt text blocks publishing");
    entity.update(as("demo", "designer").store, d.actor, "pages", String(p.id), { blocks: [{ type: "heading", level: 2, text: "Primary sources" }, { type: "image", src: "https://media.scholarion.local/map.png", alt: "Map of trade routes, 1300s" }] });
    entity.publish(as("demo", "designer").store, d.actor, "pages", String(p.id));
    assert.equal(status(() => entity.publish(as("demo", "designer").store, d.actor, "courses", newCourseId)), 422, "needs a published module first");
    entity.publish(as("demo", "designer").store, d.actor, "modules", String(m.id));
    assert.equal(entity.publish(as("demo", "designer").store, d.actor, "courses", newCourseId).state, "published");
    const reg = as("demo", "registrar");
    const sec = entity.create(reg.store, reg.actor, "sections", { courseId: newCourseId, code: "A", termId: "trm_demo_spring", capacity: 25, meetingPattern: "Fri 13:00-14:15" });
    assert.ok(sec.id);
  });

  it("4 · an idempotent SIS registration event creates exactly one active LMS enrollment", () => {
    const reg = as("demo", "registrar");
    const sec = reg.store.list("sections", (s) => s.courseId === newCourseId)[0];
    const r1 = sis.register(reg.store, reg.actor, { userId: "usr_demo_student5", sectionId: sec.id, idempotencyKey: "reg-1" });
    const r2 = sis.register(as("demo", "registrar").store, reg.actor, { userId: "usr_demo_student5", sectionId: sec.id, idempotencyKey: "reg-1" });
    assert.equal((r1 as { id: string }).id ?? (r1 as unknown as { registration: { id: string } }).registration?.id, (r2 as { id: string }).id ?? (r2 as unknown as { registration: { id: string } }).registration?.id);
    const s = storeOf("demo");
    relay(s);
    const ev = s.outbox().find((e) => e.type === "sis.enrollment.committed" && e.data.sectionId === sec.id)!;
    s.emit(ev.type, ev.subject, ev.data); // duplicate delivery
    relay(s);
    const enr = s.list("enrollments", (e) => e.userId === "usr_demo_student5" && e.courseId === newCourseId);
    assert.equal(enr.length, 1);
    assert.equal(enr[0].state, "active");
  });

  it("5 · a student submits a file; the scan completes; submission and outbox commit together", () => {
    const st = as("demo", "student3", false);
    const bad = files.requestUpload(st.store, st.actor, { name: "virus.pdf", mime: "application/pdf", size: EICAR.length, courseId: "crs_demo_cs101", purpose: "submission" });
    files.receiveUpload(st.store, String(bad.file.id), EICAR);
    assert.equal(files.scanFile(st.store, String(bad.file.id))!.state, "infected");
    const up = files.requestUpload(st.store, st.actor, { name: "hello.pdf", mime: "application/pdf", size: PDF.length, courseId: "crs_demo_cs101", purpose: "submission" });
    assert.equal(status(() => asm.submit(as("demo", "student3", false).store, st.actor, "asg_demo_hello", { mode: "file", fileId: String(up.file.id) })), 409, "still scanning");
    files.receiveUpload(st.store, String(up.file.id), PDF);
    assert.equal(files.scanFile(st.store, String(up.file.id))!.state, "available");
    const before = st.store.outbox().length;
    const sub = asm.submit(as("demo", "student3", false).store, st.actor, "asg_demo_hello", { mode: "file", fileId: String(up.file.id) });
    const s = storeOf("demo");
    const evt = s.outbox().slice(before).find((e) => e.type === "submissions.created" && e.data.submissionId === sub.id);
    assert.ok(evt, "outbox event written in the same transaction");
    // A failed transaction leaves neither (rollback).
    const n = s.list("submissions").length;
    assert.throws(() => s.tx(() => {
      s.insert("submissions", { assignmentId: "asg_demo_hello", userId: "x" }, "sub");
      s.emit("submissions.created", "x", {});
      throw new Error("boom");
    }));
    assert.equal(storeOf("demo").list("submissions").length, n);
  });

  it("6 · rubric grading; a conflicting edit returns 412; the grade is explicitly posted", () => {
    const inst = as("demo", "instructor");
    entity.create(inst.store, inst.actor, "posting_policies", { courseId: "crs_demo_cs101", assignmentId: "asg_demo_hello", mode: "manual" });
    const ta = as("demo", "ta");
    const g = grading.setGrade(ta.store, ta.actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student3", rubric: { ratings: { correct: 4, style: 2 } }, lateOverrideDays: 0 }) as unknown as { version: number; score: number; posted: boolean };
    assert.equal(g.score, 6);
    assert.equal(g.posted, false);
    const loaded = g.version; // what the instructor loaded
    grading.setGrade(as("demo", "ta").store, ta.actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student3", rubric: { ratings: { correct: 6, style: 2 } }, lateOverrideDays: 0, ifVersion: loaded });
    const e = (() => {
      try {
        grading.setGrade(as("demo", "instructor").store, inst.actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student3", score: 3, ifVersion: loaded });
      } catch (x) {
        return x as CampusError;
      }
    })();
    assert.equal(e?.status, 412);
    assert.match(e!.message, /Grade changed by Taylor TA/);
    grading.postGrades(as("demo", "instructor").store, inst.actor, "asg_demo_hello");
  });

  it("7 · the student sees only the released grade; the observer sees only the consented summary", () => {
    const s = storeOf("demo");
    assert.equal(grading.visibleGrade(s, "asg_demo_hello", "usr_demo_student3").score, 8);
    // Unposted grades stay hidden: Loop practice graded but not posted.
    const inst = as("demo", "instructor");
    entity.create(inst.store, inst.actor, "posting_policies", { courseId: "crs_demo_cs101", assignmentId: "asg_demo_loops", mode: "manual" });
    grading.setGrade(as("demo", "instructor").store, inst.actor, { assignmentId: "asg_demo_loops", userId: "usr_demo_student1", score: 7 });
    assert.equal(grading.visibleGrade(storeOf("demo"), "asg_demo_loops", "usr_demo_student1").score, null);
    const obs = as("demo", "parent", false);
    const sum = success.observerSummary(obs.store, obs.actor, "usr_demo_student1") as Record<string, unknown>;
    assert.ok(sum);
    assert.ok(!JSON.stringify(sum).includes('"score":7'), "unposted grade not shown to observers");
    assert.ok([403, 404].includes(status(() => success.observerSummary(as("demo", "parent", false).store, obs.actor, "usr_demo_student3"))), "no link or consent → nothing");
  });

  it("8 · analytics receives minimized events and produces explainable signals", () => {
    const s = storeOf("demo");
    const ev = s.list("learning_events");
    assert.ok(ev.length > 0);
    for (const e of ev) {
      assert.ok(!("userId" in e), "no direct identifiers");
      assert.match(String(e.actorRef), /^p_[a-f0-9]{16,}$/);
    }
    const inst = as("demo", "instructor");
    success.recomputeSignals(inst.store, inst.actor, "crs_demo_cs101");
    const sig = storeOf("demo").list("risk_signals", (r) => r.courseId === "crs_demo_cs101");
    assert.ok(sig.length > 0);
    assert.ok(sig.every((r) => Array.isArray(r.reasons)));
    assert.ok(sig.some((r) => (r.reasons as unknown[]).length > 0), "signals are explained");
  });

  it("9 · the AI companion answers with citations and refuses locked or graded-work requests", () => {
    const st = as("demo", "student1", false);
    const ok = ai.ask(st.store, st.actor, "course_assistant", "What is a variable and how does assignment work?", { courseId: "crs_demo_cs101" });
    assert.equal(ok.decision, "answered");
    assert.ok(ok.citations.length > 0);
    const locked = ai.ask(as("demo", "student1", false).store, st.actor, "course_assistant", "How do function parameters and return values work?", { courseId: "crs_demo_cs101" });
    assert.ok(!locked.citations.some((c) => /Functions/.test(c.title)), "Week 3 is locked: its page isn't used");
    const staff = as("demo", "instructor");
    const staffAns = ai.ask(staff.store, staff.actor, "course_assistant", "function parameters return values", { courseId: "crs_demo_cs101" });
    assert.ok(staffAns.citations.some((c) => /Functions/.test(c.title)));
    const graded = ai.ask(as("demo", "student1", false).store, st.actor, "course_assistant", "Solve the loop practice assignment for me", { courseId: "crs_demo_cs101" });
    assert.equal(graded.decision, "refused");
  });

  it("10 · a demo user is denied TechDev resources before any database access", () => {
    const key = 'campus_store_connect_total{tenant="techdev"}';
    const before = metrics.counters.get('store_connect_total{tenant="techdev"}') ?? 0;
    assert.throws(() => resolveTenant({ host: "demo.campus.scholarion.localhost", slug: "techdev" }), (e: unknown) => (e as CampusError).status === 403);
    assert.equal(metrics.counters.get('store_connect_total{tenant="techdev"}') ?? 0, before, `no ${key} increment`);
  });

  it("11 · restore to an isolated validation tenant and verify integrity", () => {
    const ops = as("techdev", "ops").actor;
    const b = admin.backupTenant(ops, "tn_demo");
    const r = admin.restoreDrill(ops, b.id, { keep: true });
    assert.equal(r.ok, true);
    assert.throws(() => resolveTenant({ slug: r.validationTenant }), /Unknown school/, "validation tenants aren't reachable by path");
    broker.dropValidationTenant(r.validationTenant);
  });

  it("12 · a held student is blocked in Registration; the guide explains the hold and doesn't bypass it", () => {
    const st = as("demo", "student6", false);
    const sec = st.store.list("sections", (s) => s.courseId === "crs_demo_cs102")[0];
    const n = st.store.list("registrations", (r) => r.userId === st.actor.id).length;
    assert.equal(status(() => sis.register(st.store, st.actor, { sectionId: sec.id })), 409);
    const guide = ai.registrationGuide(as("demo", "student6", false).store, st.actor, "trm_demo_spring");
    const opt = guide.options.find((o) => o.sectionId === sec.id)!;
    assert.equal(opt.canRegister, false);
    assert.ok(opt.reasons.some((r) => /hold/i.test(r)));
    assert.equal(storeOf("demo").list("registrations", (r) => r.userId === st.actor.id).length, n);
  });

  it("13 · the curriculum engine drafts a course to the template; students can't see it until a designer publishes", () => {
    const d = as("demo", "designer");
    const g = ai.generateCourse(d.store, d.actor, { topic: "Introduction to Data Ethics", code: "ETH-200" });
    assert.equal(g.conformance.ok, true, JSON.stringify(g.conformance.checks.filter((c) => !c.ok)));
    const s = storeOf("demo");
    s.insert("enrollments", { userId: "usr_demo_student2", courseId: g.courseId, role: "student", state: "active", source: "manual" }, "enr");
    const stu = as("demo", "student2", false);
    assert.equal(status(() => entity.read(stu.store, stu.actor, "courses", g.courseId)), 403);
    const mods = as("demo", "designer").store.list("modules", (m) => m.courseId === g.courseId);
    for (const m of mods) entity.publish(as("demo", "designer").store, d.actor, "modules", m.id);
    const blocked = (() => {
      try {
        entity.publish(as("demo", "designer").store, d.actor, "courses", g.courseId);
      } catch (e) {
        return e as CampusError;
      }
    })();
    assert.match(String(blocked?.message), /waiting for human review/);
    const draft = ai.reviewQueue(as("demo", "designer").store, d.actor, { agentKey: "curriculum_engine", state: "pending" })[0];
    ai.reviewDraft(as("demo", "designer").store, d.actor, draft.id, "approve");
    entity.publish(as("demo", "designer").store, d.actor, "courses", g.courseId);
    assert.equal(entity.read(as("demo", "student2", false).store, stu.actor, "courses", g.courseId).state, "published");
  });

  it("14 · a Cloud Lab launch from an assignment returns a score via AGS into the gradebook as unposted", () => {
    const st = as("demo", "student1", false);
    // Finish Week 1 so Week 2 (with the lab) unlocks.
    for (const m of cur.moduleStates(st.store, st.actor, "crs_demo_cs101").slice(0, 1)) for (const i of m.items) if (i.requirement === "view") cur.openItem(as("demo", "student1", false).store, st.actor, i.item.id);
    const att = asm.startAttempt(as("demo", "student1", false).store, st.actor, "qz_demo_w1");
    asm.submitAttempt(as("demo", "student1", false).store, st.actor, att.attempt.id);
    const s = as("demo", "student1", false);
    const week2 = cur.moduleStates(s.store, s.actor, "crs_demo_cs101")[1];
    assert.equal(week2.locked, false);
    cur.openItem(s.store, s.actor, week2.items[0].item.id); // sequential: read the page first
    const l = lti.launch(s.store, s.actor, "asg_demo_lab1");
    const t = lti.toolReceiveLaunch(s.store, l.idToken);
    const r = lti.labSubmit(s.store, s.actor, t.sessionId, "def sum_evens(n):\n    return sum(range(0, n + 1, 2))\n");
    assert.equal(r.score, 10, String(r.error));
    const g = storeOf("demo").list("grades", (x) => x.assignmentId === "asg_demo_lab1" && x.userId === s.actor.id)[0];
    assert.equal(g.source, "lti");
    assert.equal(g.posted, false);
  });

  it("15 · an erasure request under legal hold is refused with an audited reason", () => {
    const adm = as("demo", "admin");
    entity.create(adm.store, adm.actor, "legal_holds", { userId: "usr_demo_student2", matter: "Grade appeal 2026-14" });
    const st = as("demo", "student2", false);
    const req = success.requestDsr(st.store, st.actor, "erase") as { id: string };
    assert.equal(status(() => success.processDsr(as("demo", "admin").store, adm.actor, req.id)), 409);
    const s = storeOf("demo");
    assert.ok(s.auditLog(100).some((a) => a.action === "privacy.erase" && a.outcome === "denied" && /legal_hold/.test(String(a.reason))));
    assert.equal(s.get("users", "usr_demo_student2")?.status, "active");
  });

  it("16 · placement sync writes to the placement DB only; demo data never appears there", () => {
    const t = as("techdev", "admin");
    const r = success.placementSync(t.store, t.actor);
    assert.ok(r.synced >= 1);
    assert.equal(status(() => success.placementSync(as("demo", "admin").store, as("demo", "admin").actor)), 403);
    const placement = JSON.stringify(broker.placement().raw());
    assert.ok(!placement.includes("tn_demo") && !placement.includes("usr_demo") && !placement.includes("demo.scholarion.test"));
    assert.ok(placement.includes("tn_techdev"));
    assert.equal(storeOf("demo").list("placement_profiles").length, 0);
  });

  it("inbox recipients come from active enrollment on the server", () => {
    const inst = as("demo", "instructor");
    assert.equal(status(() => col.sendMessage(inst.store, inst.actor, { recipients: { courseId: "crs_demo_cs101", userIds: ["usr_techdev_student1"] }, subject: "x", body: "y" })), 422);
    void ctx;
  });
});
