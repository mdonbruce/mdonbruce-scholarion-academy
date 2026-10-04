import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError, relay } from "../src/campus/core";
import * as academy from "../src/campus/services/academy";
import * as prog from "../src/campus/services/programs";
import * as hub from "../src/campus/services/hub";
import * as asm from "../src/campus/services/assessment";
import * as lti from "../src/campus/services/lti";
import { LABS } from "../src/campus/academy/labs-data";
import { LIBRARY } from "../src/campus/academy/programs-data-2";
import type { ProgramSpec } from "../src/campus/academy/programs-data";

/** Agentic AI hub, programs #15–#25, self-paced #28–#38, module library and consolidation (Tab 52). */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};

const specOf = (offeringId: string) => storeOf("academy").list("program_pages", (p) => p.offeringId === offeringId)[0].spec as ProgramSpec;
const rightAnswers = (offeringId: string) => Object.fromEntries((specOf(offeringId).selfCheck?.questions ?? []).map((q) => [q.id, q.answer]));

/** Self-check (if any) → apply → registrar admits. */
function admit(user: string, offeringId: string, sectionId?: string) {
  const s = as("academy", user, false);
  const o = s.store.get("offerings", offeringId)!;
  if (o.selfCheckRequired) assert.equal(prog.selfCheck(s.store, s.actor, offeringId, rightAnswers(offeringId)).passed, true);
  const app = prog.applyToProgram(as("academy", user, false).store, s.actor, { offeringId, sectionId, statement: "I build services in Python and want to design reliable agent systems with evaluation." });
  const reg = as("academy", "registrar");
  prog.reviewProgramApplication(reg.store, reg.actor, app.application.id, "admit");
  return s.actor;
}

describe("Agentic AI hub and programs #15–#38 (Tab 52)", () => {
  before(() => {
    freshCampus();
  });

  it("loads every program, the shared library and the policies", () => {
    const store = storeOf("academy");
    for (const n of [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]) assert.ok(store.get("offerings", `off_academy_${n}`), `#${n} loaded`);
    assert.equal(store.get("offerings", "off_academy_27"), undefined, "#27 is proposed only");
    assert.equal(store.list("library_modules").length, LIBRARY.length);
    assert.ok(store.get("courses", "crs_academy_library")!.isBlueprint);
    assert.deepEqual(store.list("catalog_policies").map((p) => p.kind).sort(), ["batch_change", "deferral", "refund"]);
    assert.ok(store.list("catalog_policies").every((p) => p.state === "draft" && !p.approvedAt), "no policy shows before approval");
    // Legacy renumbering.
    assert.equal(store.get("offerings", "off_academy_37_2")!.code, "#37.2");
    assert.ok(store.list("modules", (m) => m.courseId === "crs_academy_p18" && m.moduleKey === "p18-w5").length === 1, "#18 Week 5 reuses the earlier deep learning module");
  });

  it("hub: tabs, filters, honest rails, paths that hide missing steps, ItemList structured data", () => {
    const store = storeOf("academy");
    const h = hub.agenticHub(store);
    assert.ok(h.total >= 20);
    assert.equal(h.structuredData["@type"], "ItemList");
    assert.equal(h.structuredData.itemListElement.length, h.items.length);
    assert.ok(!h.rails.some((r) => r.key === "popular"), "no 'Most popular' rail without real enrollment data");
    assert.ok(!h.showSocialProof, "social proof hidden until consented testimonials exist");
    assert.ok(h.tabs.find((t) => t.key === "guided_project")!.count >= 1);
    const noCode = hub.agenticHub(store, { coding: "no" }).items;
    assert.ok(noCode.length > 0 && noCode.every((c) => !c.codingRequired));
    const gp = hub.agenticHub(store, { tab: "guided_project" }).items;
    assert.ok(gp.length > 0 && gp.every((c) => c.type === "guided_project"));
    const live = hub.agenticHub(store, { tab: "live" }).items;
    assert.ok(live.some((c) => c.code === "#15"));
    const agents = hub.agenticHub(store, { skill: "agents" }).items;
    assert.ok(agents.every((c) => c.skillTags.includes("agents")));
    const cmp = hub.agenticHub(store, { compare: ["off_academy_15", "off_academy_32"] }).comparison;
    assert.equal(cmp.length, 2);
    assert.ok("Capstone" in cmp[0].rows && "Credential" in cmp[0].rows);
    for (const p of h.paths) for (const s of p.steps) assert.ok(s.title, `${p.key} only shows catalog steps`);
    assert.match(h.diagram, /^flowchart LR/);
    assert.ok(!h.faqs.some((f) => /refund/i.test(f.q)), "refund FAQ waits for the approved policy");
  });

  it("quiz: 8–10 questions; recommendations explain themselves and respect 'no coding'", () => {
    const store = storeOf("academy");
    assert.ok(hub.HUB_QUIZ.length >= 8 && hub.HUB_QUIZ.length <= 10);
    const leader = hub.hubRecommend(store, { role: "leader", coding: "none", goal: "lead", time: "2", format: "any", length: "short" });
    assert.ok(leader.top, "a recommendation");
    const top = hub.agenticHub(store).items.find((c) => c.id === leader.top!.offering.id)!;
    assert.equal(top.codingRequired, false);
    assert.ok(leader.top!.why.length > 0);
    const dev = hub.hubRecommend(store, { role: "developer", coding: "strong", goal: "build-agents", time: "9", format: "self_paced", length: "medium" });
    assert.ok(dev.top && hub.agenticHub(store).items.find((c) => c.id === dev.top!.offering.id)!.skillTags.some((s) => ["agents", "multi-agent", "MCP", "RAG"].includes(s)));
  });

  it("#15: 10-question self-check routes by band to #15, #16, or #19 then #16", () => {
    const s = as("academy", "student2", false);
    const ok = rightAnswers("off_academy_15");
    const all = prog.selfCheck(s.store, s.actor, "off_academy_15", ok);
    assert.equal(all.of, 10);
    assert.equal(all.passed, true);
    const six = Object.fromEntries(Object.entries(ok).map(([k, v], i) => [k, i < 6 ? v : "x"]));
    const mid = prog.selfCheck(as("academy", "student2", false).store, s.actor, "off_academy_15", six);
    assert.equal(mid.passed, false);
    assert.deepEqual(mid.routeTo, ["#16"]);
    const low = prog.selfCheck(as("academy", "student2", false).store, s.actor, "off_academy_15", {});
    assert.deepEqual(low.routeTo, ["#19", "#16"]);
  });

  it("#15: batches with sold-out state; enroll now, pay later; batch change only under an approved policy", () => {
    const store = storeOf("academy");
    const secs = store.list("offering_sections", (x) => x.offeringId === "off_academy_15");
    assert.deepEqual(secs.map((x) => x.code).sort(), ["AAE-AM", "AAE-NEXT", "AAE-PM"]);
    const am = secs.find((x) => x.code === "AAE-AM")!;
    const pm = secs.find((x) => x.code === "AAE-PM")!;
    const next = secs.find((x) => x.code === "AAE-NEXT")!;
    store.tx(() => store.update("offering_sections", pm.id, { seatsTaken: Number(pm.capacity) }));
    const page = prog.programPage(storeOf("academy"), null, specOf("off_academy_15").slug);
    assert.equal(page.cohorts.find((c) => c.code === "AAE-PM")!.soldOut, true);
    assert.equal(page.payLater, true);
    assert.equal(page.policies.refund, null, "policy text hidden until approved");
    const actor = admit("student3", "off_academy_15", am.id);
    const co = academy.checkout(as("academy", "student3", false).store, actor, { offeringId: "off_academy_15", sectionId: am.id, plan: "pay_later", sandboxCard: "tok_sandbox_visa" });
    assert.equal(co.order.state, "pay_later_sandbox");
    relay(storeOf("academy"));
    assert.equal(status(() => prog.requestBatchChange(as("academy", "student3", false).store, actor, String(co.order.id), next.id)), 409, "policy pending");
    const adm = as("academy", "admin");
    const pol = adm.store.list("catalog_policies", (p) => p.kind === "batch_change")[0];
    assert.equal(status(() => prog.approvePolicy(as("academy", "designer").store, as("academy", "designer").actor, String(pol.id))), 403);
    prog.approvePolicy(adm.store, adm.actor, String(pol.id));
    assert.equal(status(() => prog.requestBatchChange(as("academy", "student3", false).store, actor, String(co.order.id), pm.id)), 409, "sold out");
    const moved = prog.requestBatchChange(as("academy", "student3", false).store, actor, String(co.order.id), next.id);
    assert.equal(moved.to, "AAE-NEXT");
    assert.equal(status(() => prog.requestBatchChange(as("academy", "student3", false).store, actor, String(co.order.id), am.id)), 409, "once per program");
    // The refund FAQ appears on the hub only after the refund policy is approved.
    const refund = adm.store.list("catalog_policies", (p) => p.kind === "refund")[0];
    prog.approvePolicy(as("academy", "admin").store, adm.actor, String(refund.id));
    assert.ok(hub.agenticHub(storeOf("academy")).faqs.some((f) => /refund/i.test(f.q)));
  });

  it("#15 completion: live modules, module checks, capstone ≥ 70 with live defense, final check → certificate + Graded Performance Certificate", () => {
    const adm = as("academy", "admin");
    prog.publishProgramShells(adm.store, adm.actor, "off_academy_15");
    const uid = "usr_academy_student3";
    const reg = as("academy", "registrar");
    const pending = academy.evaluateCompletion(storeOf("academy"), reg.actor, uid, "off_academy_15");
    assert.equal(pending.completed, false);
    assert.equal(pending.checks.length, 5);
    const store = storeOf("academy");
    const c = "crs_academy_p15";
    const labs = store.list("assignments", (a) => a.courseId === c && /^Session lab /.test(String(a.title)));
    assert.equal(labs.length, 20, "20 live modules");
    store.tx(() => {
      for (const l of labs) store.insert("submissions", { assignmentId: l.id, userId: uid, state: "submitted", attempt: 1, body: "lab", submittedAt: new Date().toISOString() }, "sub");
      for (const q of store.list("quizzes", (x) => x.courseId === c && (/^Weekend \d+ check/.test(String(x.title)) || x.title === "Final knowledge check"))) store.insert("attempts", { quizId: q.id, userId: uid, state: "graded", score: Number(q.points ?? 10), attemptNo: 1 }, "att");
    });
    const cap = store.list("assignments", (a) => a.courseId === c && /^Capstone:/.test(String(a.title)))[0];
    const def = store.list("assignments", (a) => a.courseId === c && /^Capstone live demo defense/.test(String(a.title)))[0];
    assert.ok(cap && def);
    store.tx(() => store.insert("grades", { assignmentId: cap.id, userId: uid, score: 65, posted: true, status: "none" }, "grd"));
    store.tx(() => store.insert("grades", { assignmentId: def.id, userId: uid, score: Number(def.points ?? 10), posted: true, status: "none" }, "grd"));
    const notYet = academy.evaluateCompletion(storeOf("academy"), reg.actor, uid, "off_academy_15");
    assert.equal(notYet.completed, false, "capstone below 70/100");
    const g = store.list("grades", (x) => x.assignmentId === cap.id && x.userId === uid)[0];
    store.tx(() => store.update("grades", g.id, { score: 82 }));
    const done = academy.evaluateCompletion(storeOf("academy"), reg.actor, uid, "off_academy_15") as { completed: boolean; credential?: { id: string }; gradedPerformance?: { id: string; title?: string } | null };
    assert.equal(done.completed, true);
    assert.ok(done.credential);
    assert.ok(done.gradedPerformance, "Graded Performance Certificate issued");
    assert.match(String(storeOf("academy").get("credentials", done.gradedPerformance!.id)!.title), /Graded Performance Certificate/);
  });

  it("self-paced #32: free audit locks graded work (402); purchase unlocks it; Cloud Lab autogrades the agent loop", () => {
    const o = storeOf("academy").get("offerings", "off_academy_32")!;
    assert.equal(o.auditAvailable, true);
    const s = as("academy", "student4", false);
    prog.enrollAudit(s.store, s.actor, "off_academy_32");
    const fp = storeOf("academy").list("assignments", (a) => a.courseId === "crs_academy_p32" && /^Final project/.test(String(a.title)))[0];
    const auditing = as("academy", "student4", false); // fresh actor carries the new course role
    assert.equal(status(() => asm.submit(auditing.store, auditing.actor, fp.id, { mode: "url", url: "https://example.org/report" })), 402);
    academy.checkout(as("academy", "student4", false).store, s.actor, { offeringId: "off_academy_32", sandboxCard: "tok_sandbox_visa" });
    relay(storeOf("academy"));
    assert.ok(!storeOf("academy").list("enrollments", (e) => e.userId === s.actor.id && e.courseId === "crs_academy_p32" && !!e.audit).length, "audit cleared on purchase");
    const asg = storeOf("academy").list("assignments", (a) => a.courseId === "crs_academy_p32" && /^Programming assignment: Framework-free agent loop/.test(String(a.title)))[0];
    const tpl = storeOf("academy").get("lab_templates", String(asg.labTemplateId))!;
    assert.ok((tpl.notebookStarter as { cells: unknown[] }).cells.length && tpl.notebookExecuted, "starter and EXECUTED notebooks");
    const ss = as("academy", "student4", false);
    const l = lti.launch(ss.store, ss.actor, asg.id);
    const recv = lti.toolReceiveLaunch(ss.store, l.idToken);
    const starter = lti.labSubmit(ss.store, ss.actor, recv.sessionId, LABS.agent_loop.starterCode);
    assert.ok(Number(starter.score) < 10, "starter fails");
    const l2 = lti.launch(as("academy", "student4", false).store, ss.actor, asg.id);
    const recv2 = lti.toolReceiveLaunch(storeOf("academy"), l2.idToken);
    const res = lti.labSubmit(as("academy", "student4", false).store, ss.actor, recv2.sessionId, LABS.agent_loop.solution);
    assert.equal(res.ran, true, String(res.error));
    assert.equal(res.score, 10);
    // Graded quiz: 80% to pass, cooldown between attempts.
    const q = storeOf("academy").list("quizzes", (x) => x.courseId === "crs_academy_p32" && x.state === "published")[0];
    assert.equal(q.coolingMinutes, 60);
    assert.ok(storeOf("academy").list("module_items", (i) => i.refId === q.id && i.requirement === "min_score" && Number(i.minScore) === 80).length);
    // Peer-reviewed final projects take three reviews each.
    const peer = storeOf("academy").list("assignments", (a) => /^Final project/.test(String(a.title)) && Number(a.peerReviews) > 0);
    assert.ok(peer.length > 0 && peer.every((a) => a.peerReviews === 3));
  });

  it("stacking: courses issue their own certificates and stack into the specialization; pathways enroll included programs", () => {
    const store = storeOf("academy");
    const parts = store.list("pathway_edges", (e) => e.toId === "off_academy_37" && e.kind === "stacks_into");
    assert.equal(parts.length, 4);
    for (const p of parts) assert.equal(store.get("credential_templates", String(store.get("offerings", String(p.fromId))!.credentialTemplateId))!.kind, "course_certificate");
    assert.equal(store.get("credential_templates", String(store.get("offerings", "off_academy_37")!.credentialTemplateId))!.kind, "specialization_certificate");
    // #17 pathway: enrolling adds the included programs.
    const sec = store.list("offering_sections", (x) => x.offeringId === "off_academy_17")[0];
    const actor = admit("student5", "off_academy_17", sec?.id);
    academy.checkout(as("academy", "student5", false).store, actor, { offeringId: "off_academy_17", sectionId: sec?.id, sandboxCard: "tok_sandbox_visa" });
    relay(storeOf("academy"));
    const inc = storeOf("academy").list("offering_enrollments", (e) => e.userId === actor.id && e.source === "pathway").map((e) => e.offeringId).sort();
    assert.deepEqual(inc, ["off_academy_16", "off_academy_18", "off_academy_19", "off_academy_21"]);
  });

  it("consolidation report: computed overlaps, submit, product-owner decision", () => {
    const d = as("academy", "designer");
    const rep = hub.consolidationReport(d.store, d.actor);
    assert.ok(rep.programs.some((p) => p.code === "#15") && rep.programs.some((p) => p.code === "#38"));
    assert.equal(rep.proposed[0].code, "#27");
    assert.ok(Array.isArray(rep.referencedNotInCatalog));
    for (const o of rep.overlaps) assert.ok(o.overlapPct >= 40 && o.recommendation);
    assert.equal(status(() => hub.consolidationReport(as("academy", "student1", false).store, as("academy", "student1", false).actor)), 403);
    const sub = hub.submitConsolidation(as("academy", "designer").store, d.actor);
    assert.equal(sub.state, "submitted");
    assert.equal(status(() => hub.decideConsolidation(as("academy", "designer").store, d.actor, sub.id, "approved")), 403);
    const adm = as("academy", "admin");
    assert.equal(hub.decideConsolidation(adm.store, adm.actor, sub.id, "approved", "Keep both formats").state, "approved");
    assert.equal(status(() => hub.decideConsolidation(as("academy", "admin").store, adm.actor, sub.id, "approved")), 409);
  });

  it("public copy passes the honesty guard on every new program page", () => {
    const store = storeOf("academy");
    for (const p of store.list("program_pages", (x) => x.state === "published")) {
      const o = store.get("offerings", String(p.offeringId))!;
      assert.ok(prog.qualityGate(store, o.id).every((g) => g.ok), `${o.code} quality gate`);
    }
  });
});
