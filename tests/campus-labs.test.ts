import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import vm from "node:vm";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError, relay } from "../src/campus/core";
import * as academy from "../src/campus/services/academy";
import * as assess from "../src/campus/services/assess";
import * as al from "../src/campus/services/agentlabs";
import { DRAFT_LABEL, simLabHtml } from "../src/campus/services/simlab";
import { SIM_SCENARIOS } from "../src/campus/academy/sim-scenarios";

/** Tab 53 (Assessment & Project Studio, simulated labs) and Tab 54 (Agentic Cloud Labs). */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};

function engineFor(html: string) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const win: Record<string, unknown> = {};
  const ctx = vm.createContext({ window: win, document: { getElementById: () => null } });
  vm.runInContext(scripts[0], ctx);
  vm.runInContext(scripts[1], ctx);
  return win.SimEngine as { runAuto: (t: string, o: object) => { status: string; calls: string[] }; check: (t: object, r: object) => { pass: boolean; why: string[] } };
}

describe("Simulated Student/Instructor labs and the application demo", () => {
  it("student edition has the worksheet without answers; instructor edition adds the banner, controls and key", () => {
    for (const s of SIM_SCENARIOS) {
      assert.equal(s.worksheet.length, 10, `${s.key} worksheet has 10 questions`);
      const student = simLabHtml(s.key, "student", { module: "3" });
      const inst = simLabHtml(s.key, "instructor", { module: "3" });
      assert.match(student, new RegExp(DRAFT_LABEL.replace(/[—]/g, ".")));
      assert.doesNotMatch(student, /INSTRUCTOR MODE/);
      for (const w of s.worksheet) assert.ok(!student.includes(w.explanation.replace(/"/g, "&quot;")) && !student.includes(JSON.stringify(w.explanation).slice(1, -1)), `${s.key}: explanation leaked to students`);
      assert.match(inst, /INSTRUCTOR MODE — answer keys and control panel are visible on this screen; Switch to Student View before projecting student work\./);
      assert.match(inst, /id="toStudent"/);
      assert.match(inst, /Run reference solution/);
      assert.equal((inst.match(/class="key instructor-only"/g) ?? []).length, 10);
      assert.equal((student.match(/data-ws /g) ?? []).length, 10);
      const app = simLabHtml(s.key, "app");
      assert.match(app, /Evaluation suite/);
      assert.match(app, /Simulated Application Demo/);
    }
  });

  it("the agent engine in the pages passes every task in every scenario", () => {
    for (const s of SIM_SCENARIOS) {
      const E = engineFor(simLabHtml(s.key, "instructor"));
      for (const t of s.tasks) {
        const r = E.runAuto(t.request, { policy: "auto", guard: true, limit: s.stepLimit, autoApprove: true });
        const c = E.check(t, r);
        assert.ok(c.pass, `${s.key} ${t.id}: ${c.why.join("; ")}`);
      }
      // With the guardrail off, the injection task no longer passes (the demo's teaching point).
      const inj = s.tasks.find((t) => t.expectBlocked)!;
      assert.equal(E.check(inj, E.runAuto(inj.request, { policy: "auto", guard: false, limit: s.stepLimit, autoApprove: true })).pass, false);
    }
  });
});

describe("Assessment & Project Studio (Tab 53)", () => {
  before(() => {
    freshCampus();
  });

  it("generates every kind for a module, with pillars, alignment and the AI DRAFT label", () => {
    const d = as("academy", "designer");
    for (const kind of assess.KINDS) {
      const r = assess.generateDraft(d.store, d.actor, { offeringId: "off_academy_15", week: "3", kind });
      assert.equal(r.label, DRAFT_LABEL);
      const v = assess.draftView(as("academy", "designer").store, d.actor, r.id, "instructor");
      assert.ok(v.student && v.alignment, kind);
      assert.match(JSON.stringify(v.context), /Scholaris Course Standard/);
    }
    assert.equal(status(() => assess.generateDraft(as("academy", "student1", false).store, as("academy", "student1", false).actor, { offeringId: "off_academy_15", week: "3", kind: "lab" })), 403);
  });

  it("quiz: 3× item bank in the schema, blueprint, Bloom mix; student edition hides answers; QTI export", () => {
    const d = as("academy", "designer");
    const r = assess.generateDraft(d.store, d.actor, { offeringId: "off_academy_15", week: "3", kind: "quiz", n: 10 });
    const v = assess.draftView(as("academy", "designer").store, d.actor, r.id, "instructor") as unknown as { bank: { items: Record<string, unknown>[] }; blueprint: unknown[]; student: { items: Record<string, unknown>[] } };
    assert.equal(v.bank.items.length, 30);
    for (const k of ["id", "type", "lo", "competency", "bloom", "difficulty", "stem", "options", "correct", "points", "rationale_correct", "rationale_distractors", "feedback_correct", "feedback_incorrect", "tags"]) assert.ok(k in v.bank.items[0], k);
    assert.ok(v.bank.items.some((i) => i.origin === "module quiz"), "reuses the module's existing questions");
    assert.equal(v.student.items.length, 10);
    assert.ok(v.student.items.every((i) => !("correct" in i) && !("rationale_correct" in i)));
    assert.ok(v.blueprint.length >= 3);
    const qti = assess.qtiXml(as("academy", "designer").store, d.actor, r.id);
    assert.equal((qti.match(/<assessmentItem /g) ?? []).length, 30);
    assert.equal(status(() => assess.qtiXml(as("academy", "student1", false).store, as("academy", "student1", false).actor, r.id)), 403);
  });

  it("approval needs filled [SME] slots and two different people; publishing creates unpublished course items", () => {
    const d = as("academy", "designer");
    const r = assess.generateDraft(d.store, d.actor, { offeringId: "off_academy_15", week: "3", kind: "mini_project" });
    assert.ok(r.smeSlots > 0);
    assert.equal(status(() => assess.approveDraft(as("academy", "designer").store, d.actor, r.id, "id")), 409, "slots open");
    // Fill every slot.
    const view = assess.draftView(as("academy", "designer").store, d.actor, r.id, "instructor");
    const paths: string[] = [];
    const walk = (v: unknown, base: string) => {
      if (typeof v === "string") v.includes("[SME:") && paths.push(base);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${base}.${i}`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, base ? `${base}.${k}` : k);
    };
    walk({ student: view.student, instructor: view.instructor }, "");
    assess.fillDraft(as("academy", "designer").store, d.actor, r.id, Object.fromEntries(paths.map((p) => [p, "Written by the course SME for this module."])));
    assert.equal(storeOf("academy").get("assessment_drafts", r.id)!.smeSlots, 0);
    const inst = as("academy", "instructor");
    assess.approveDraft(inst.store, inst.actor, r.id, "sme");
    assert.equal(status(() => assess.publishDraft(as("academy", "designer").store, d.actor, r.id)), 409, "needs both approvals");
    assess.approveDraft(as("academy", "designer").store, d.actor, r.id, "id");
    const pub = assess.publishDraft(as("academy", "designer").store, d.actor, r.id);
    const asg = storeOf("academy").get("assignments", pub.created.split("/")[1])!;
    assert.equal(asg.state, "unpublished");
    assert.ok(asg.rubricId);
    // Editing clears approvals.
    const r2 = assess.generateDraft(d.store, d.actor, { offeringId: "off_academy_15", week: "3", kind: "simulated_lab" });
    assert.equal(r2.smeSlots, 0);
    assess.approveDraft(as("academy", "designer").store, d.actor, r2.id, "id");
    assert.equal(status(() => assess.approveDraft(as("academy", "admin").store, as("academy", "designer").actor, r2.id, "sme")), 403);
  });
});

describe("Agentic Cloud Labs (Tab 54)", () => {
  let labId = "";
  before(() => {
    freshCampus();
    labId = storeOf("academy").list("agent_labs", (l) => l.scenario === "haven-guest-services")[0].id;
    const s = as("academy", "student2", false);
    academy.checkout(s.store, s.actor, { offeringId: "off_academy_32", sandboxCard: "tok_sandbox_visa" });
    relay(storeOf("academy"));
  });

  it("each lab is calibrated: the reference agent scores 100, the starter scores below the pass mark", () => {
    const adm = as("academy", "admin");
    for (const l of storeOf("academy").list("agent_labs")) {
      const v = al.verifyLab(adm.store, adm.actor, l.id);
      assert.ok(v.ok, `${l.id}: ${JSON.stringify(v)}`);
      assert.equal(l.autonomous, true);
    }
  });

  it("workspace saves with history; practice is unlimited; graded attempts post the best score to the gradebook; two attempts", () => {
    const s = as("academy", "student2", false);
    const v = al.openLab(s.store, s.actor, labId);
    assert.equal(v.role, "learner");
    assert.equal(v.attempts.allowed, 2);
    assert.equal(v.referenceCode, null, "learners never see the reference");
    const starter = al.runLab(as("academy", "student2", false).store, s.actor, labId, "practice");
    assert.ok(starter.score < al.PASS_MARK);
    const lab = storeOf("academy").get("agent_labs", labId)!;
    al.saveWorkspace(as("academy", "student2", false).store, s.actor, labId, String(lab.referenceCode));
    assert.ok(al.openLab(as("academy", "student2", false).store, s.actor, labId).workspace.versions.length >= 1, "version history");
    const practice = al.runLab(as("academy", "student2", false).store, s.actor, labId, "practice");
    assert.equal(practice.score, 100);
    assert.equal(practice.attempt, null);
    const g1 = al.runLab(as("academy", "student2", false).store, s.actor, labId, "graded");
    assert.equal(g1.attempt, 1);
    assert.equal(g1.score, 100);
    assert.ok(g1.tasks.some((t) => t.hidden), "graded runs include hidden tasks");
    const grade = storeOf("academy").list("grades", (x) => x.assignmentId === lab.assignmentId && x.userId === s.actor.id)[0];
    assert.equal(grade.posted, true);
    assert.equal(grade.passFail, "pass");
    assert.equal(grade.score, 100);
    // A worse second attempt doesn't lower the posted best.
    al.saveWorkspace(as("academy", "student2", false).store, s.actor, labId, String(lab.starterCode));
    const g2 = al.runLab(as("academy", "student2", false).store, s.actor, labId, "graded");
    assert.equal(g2.attempt, 2);
    assert.equal(storeOf("academy").list("grades", (x) => x.assignmentId === lab.assignmentId && x.userId === s.actor.id)[0].score, 100);
    assert.equal(status(() => al.runLab(as("academy", "student2", false).store, s.actor, labId, "graded")), 409, "two attempts only");
    // Staff can grant one more, with a reason.
    const inst = as("academy", "instructor");
    assert.equal(status(() => al.grantAttempt(inst.store, inst.actor, labId, s.actor.id, "")), 422);
    al.grantAttempt(as("academy", "instructor").store, inst.actor, labId, s.actor.id, "Runner outage during attempt 2");
    assert.equal(al.openLab(as("academy", "student2", false).store, s.actor, labId).attempts.remaining, 1);
  });

  it("runs autonomously with permissions, budgets and traces; hidden-task traces stay hidden from learners", () => {
    const s = as("academy", "student2", false);
    const greedy = JSON.stringify({ routes: [{ intent: "all", whenAny: ["booking", "reservation", "hv-"], steps: [{ tool: "lookup_booking", arg: "id" }, { tool: "delete_booking", arg: "id" }, { tool: "draft_reply", arg: "text" }] }], onToolError: "continue", answerFrom: "last_result" });
    const r = al.runLab(as("academy", "student2", false).store, s.actor, labId, "practice", greedy);
    assert.ok(r.violations > 0, "denied tool was blocked and counted");
    assert.ok(r.criteria.find((c) => c.key === "permissions")!.earned < 15);
    const detail = al.runDetail(as("academy", "student2", false).store, s.actor, r.runId);
    assert.ok(detail.traces.some((t) => t.trace.some((row) => row.type === "violation")));
    assert.ok(detail.traces.every((t) => t.trace.every((row) => (row.type as string) !== "approval")), "no approval gates");
    const looping = JSON.stringify({ routes: [{ intent: "x", whenAny: ["hv-"], steps: Array.from({ length: 8 }, () => ({ tool: "lookup_booking", arg: "id" })) }] });
    const b = al.runLab(as("academy", "student2", false).store, s.actor, labId, "practice", looping);
    assert.ok(b.criteria.find((c) => c.key === "budget")!.earned < 15, "budget enforced");
    assert.equal(status(() => al.runLab(as("academy", "student2", false).store, s.actor, labId, "practice", "{not json")), 422);
    // Learners can't see each other's runs; staff can.
    const other = as("academy", "student3", false);
    assert.equal(status(() => al.runDetail(other.store, other.actor, r.runId)), 403);
    assert.ok(al.runDetail(as("academy", "instructor").store, as("academy", "instructor").actor, r.runId));
    // Staff practice only.
    assert.equal(status(() => al.runLab(as("academy", "instructor").store, as("academy", "instructor").actor, labId, "graded")), 403);
    const roster = al.labRoster(as("academy", "instructor").store, as("academy", "instructor").actor, labId);
    assert.ok(roster.some((x) => x.userId === s.actor.id && x.attemptsUsed === 2));
  });
});
