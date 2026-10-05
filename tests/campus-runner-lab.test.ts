import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as G from "../src/campus/services/graded";
import * as W from "../src/campus/services/workspace";
import { AI801_RUNNER_ITEM_KEY, AI801_RUNNER_LAB_KEY, ai801CourseId, ensureRunnerLab, practiceRunnerLab, submitProject } from "../src/campus/academy/ai801-seed";
import { BOUNDS_VECTORS, decide, gradeBoundedRunner, parseBounds } from "../src/campus/services/labgrade";

/** Graded Agentic Cloud Lab "Implement a bounded tool runner" (AI-801 Module 1, rubric 30/30/30/10). */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string) => as("academy", k, false);
let COURSE = "";
const item = () => storeOf("academy").list("graded_items", (i) => i.courseId === COURSE && i.key === AI801_RUNNER_ITEM_KEY)[0];

const GOOD_PY = `import logging
logger = logging.getLogger("runner")

def perceive(event):
    return {"path": "/workspace/system.log", "raw": event}

def plan(record):
    return [{"tool": "FILE_READ"}, {"tool": "FILE_WRITE"}]

def remember(key, value, memory={}):
    memory[key] = value
    return memory

def run(event):
    try:
        return plan(perceive(event))
    except Exception as exc:
        logger.error("run failed: %s", exc)
        raise
`;
const GOOD_BOUNDS = JSON.stringify({ allowed_root: "/workspace", deny_traversal: true, tools: ["EXECUTE_BASH", "FILE_READ", "FILE_WRITE", "HTTP_REQUEST"], http_allowlist: ["api.scholarion.local"], max_steps: 8 });
const GOOD_PLAN = JSON.stringify({ steps: [{ tool: "FILE_READ", args: { path: "/workspace/system.log" } }, { tool: "FILE_WRITE", args: { path: "/workspace/summary.txt" } }] });

before(() => {
  freshCampus();
  COURSE = ai801CourseId(storeOf("academy"));
});

describe("Bounded tool runner lab", () => {
  it("is seeded once with the published 30/30/30/10 rubric and a mandatory bounds criterion", () => {
    ensureRunnerLab(storeOf("academy"), COURSE);
    assert.equal(storeOf("academy").list("graded_items", (i) => i.courseId === COURSE && i.key === AI801_RUNNER_ITEM_KEY).length, 1);
    const v = G.itemView(u("student1").store, u("student1").actor, item().id);
    assert.deepEqual(v.rubric.map((c) => c.points), [30, 30, 30, 10]);
    assert.ok(v.rubric.find((c) => c.key === "bounds")?.mandatory);
    assert.equal(JSON.stringify(v).includes("/workspace-evil"), false, "hidden vectors never reach the learner");
  });

  it("the starter fails the bounds checks; traversal is only blocked when deny_traversal is on", () => {
    const starter = parseBounds(W.TEMPLATES["bounded-runner"].files["runner/bounds.json"])!;
    assert.equal(decide(starter, { tool: "FILE_WRITE", path: "/workspace/../etc/hosts" }), true);
    const good = parseBounds(GOOD_BOUNDS)!;
    for (const v of BOUNDS_VECTORS) assert.equal(decide(good, v.call), v.allow, v.label);
    const g = gradeBoundedRunner(W.TEMPLATES["bounded-runner"].files);
    assert.equal(g.architecture.share, 0.5);
    assert.ok(g.bounds.share < 1);
    assert.equal(g.code.share, 0);
  });

  it("practice is ungraded; two graded attempts; the highest counts; a third is refused", () => {
    const { store, actor } = u("student2");
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: AI801_RUNNER_LAB_KEY, templateId: "bounded-runner" });
    const p = practiceRunnerLab(store, actor, item().id, ws.id);
    assert.equal(p.practice, true);
    assert.ok(p.score < 70);
    assert.equal(storeOf("academy").list("graded_submissions", (s) => s.itemId === item().id && s.userId === actor.id).length, 0);
    const first = submitProject(u("student2").store, actor, item().id, ws.id, "rl-1");
    assert.equal(first.passed, false);
    W.writeFile(u("student2").store, actor, ws.id, "runner/agent.py", GOOD_PY);
    W.writeFile(u("student2").store, actor, ws.id, "runner/bounds.json", GOOD_BOUNDS);
    W.writeFile(u("student2").store, actor, ws.id, "runner/plan.json", GOOD_PLAN);
    assert.equal(practiceRunnerLab(u("student2").store, actor, item().id, ws.id).score, 100);
    const second = submitProject(u("student2").store, actor, item().id, ws.id, "rl-2");
    assert.equal(second.score, 100);
    assert.equal(second.passed, true);
    assert.equal(status(() => submitProject(u("student2").store, actor, item().id, ws.id, "rl-3")), 409);
    const grade = storeOf("academy").list("grades", (g) => g.assignmentId === item().assignmentId && g.userId === actor.id)[0];
    assert.ok(grade && Number(grade.score) > 0, "posted to the gradebook");
  });

  it("good everything except traversal still fails the mandatory bounds criterion", () => {
    const { store, actor } = u("student3");
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: AI801_RUNNER_LAB_KEY, templateId: "bounded-runner" });
    W.writeFile(store, actor, ws.id, "runner/agent.py", GOOD_PY);
    W.writeFile(store, actor, ws.id, "runner/bounds.json", GOOD_BOUNDS.replace('"deny_traversal":true', '"deny_traversal":false'));
    W.writeFile(store, actor, ws.id, "runner/plan.json", GOOD_PLAN);
    const r = submitProject(u("student3").store, actor, item().id, ws.id, "rl-x");
    assert.ok(r.score >= 70);
    assert.equal(r.passed, false, "mandatory criterion not met");
  });

  it("another learner's workspace can't be practiced or submitted", () => {
    const owner = u("student4");
    const ws = W.launchWorkspace(owner.store, owner.actor, { courseId: COURSE, labKey: AI801_RUNNER_LAB_KEY, templateId: "bounded-runner" });
    assert.equal(status(() => practiceRunnerLab(u("student1").store, u("student1").actor, item().id, ws.id)), 403);
    assert.equal(status(() => submitProject(u("student1").store, u("student1").actor, item().id, ws.id, "steal")), 403);
  });
});
