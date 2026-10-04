import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as G from "../src/campus/services/graded";
import * as W from "../src/campus/services/workspace";
import { AI801_LAB_KEY, AI801_PROJECT_KEY, ai801CourseId, submitProject } from "../src/campus/academy/ai801-seed";
import { AI801_MINILABS, AI801_QUIZ } from "../src/campus/academy/ai801";

/** Acceptance tests for the Scholarion hosted learning area (AI-801 sample course). */

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
const itemByKey = (key: string) => storeOf("academy").list("graded_items", (i) => i.courseId === COURSE && i.key === key)[0];
const minilabKey = (topic: string, n: number) => `m01-${topic}-minilab-${n}`;
const rightTasks = (topic: string, n: number) => Object.fromEntries(AI801_MINILABS[topic][n - 1].tasks.map((t) => [t.id, t.kind === "fill" ? t.key[0] : t.kind === "choose" ? t.key[0] : t.key]));
const quizPayload = (variant: number, correct: number) => Object.fromEntries(AI801_QUIZ.map((v, i) => [v[variant].id, i < correct ? v[variant].answer : [(v[variant].answer[0] + 1) % v[variant].options.length]]));

before(() => {
  freshCampus();
  COURSE = ai801CourseId(storeOf("academy"));
});

describe("AI-801 seed", () => {
  it("creates the course, module, sources and published graded items with frozen versions and gradebook columns", () => {
    const s = storeOf("academy");
    assert.equal(s.get("courses", COURSE)?.code, "AI-801");
    assert.equal(s.list("studio_sources", (x) => x.courseKey === COURSE).length, 5);
    const items = s.list("graded_items", (i) => i.courseId === COURSE);
    assert.equal(items.length, 11, "8 mini-labs + quiz + worksheet + project");
    for (const i of items) {
      assert.equal(i.published, true);
      assert.equal(i.passMark, 70);
      assert.equal(i.maxAttempts, 2);
      assert.ok(s.get("assignments", String(i.assignmentId)));
      assert.equal(s.list("graded_item_versions", (v) => v.itemId === i.id).length, 1);
    }
    const proj = items.find((i) => i.key === AI801_PROJECT_KEY)!;
    const v = s.list("graded_item_versions", (x) => x.itemId === proj.id)[0];
    assert.deepEqual((v.rubric as G.RubricCriterion[]).map((c) => c.points), [40, 20, 15, 15, 10]);
  });
});

describe("Graded engine", () => {
  it("learner views never contain answer keys", () => {
    const { store, actor } = u("student1");
    const quiz = G.itemView(store, actor, itemByKey("m01-course-quiz").id);
    const lab = G.itemView(store, actor, itemByKey(minilabKey("perception", 1)).id);
    const json = JSON.stringify([quiz, lab]);
    assert.doesNotMatch(json, /"answer"|"key"\s*:\s*\[|"explanation"/);
    assert.equal(quiz.questions.length, 10);
  });

  it("practice is unlimited and never consumes attempts or posts grades", () => {
    const { store, actor } = u("student1");
    const it1 = itemByKey(minilabKey("perception", 1));
    for (let i = 0; i < 5; i++) assert.equal(G.practice(store, actor, it1.id, {}).practice, true);
    assert.equal(G.itemView(store, actor, it1.id).attemptsUsed, 0);
    assert.equal(store.list("grades", (g) => g.assignmentId === it1.assignmentId && g.userId === actor.id).length, 0);
    assert.equal(status(() => G.practice(store, actor, itemByKey("m01-course-quiz").id, {})), 409);
  });

  it("two graded attempts; the third is rejected with 409; the highest attempt is recorded", () => {
    const { store, actor } = u("student2");
    const it1 = itemByKey(minilabKey("perception", 1));
    const a1 = G.submit(store, actor, it1.id, rightTasks("perception", 1), "k-a1");
    const a2 = G.submit(store, actor, it1.id, {}, "k-a2");
    assert.equal(a1.state, "posted");
    assert.equal(a1.passed, true);
    assert.equal(a2.passed, false);
    assert.equal(status(() => G.submit(store, actor, it1.id, {}, "k-a3")), 409);
    const g = store.list("grades", (x) => x.assignmentId === it1.assignmentId && x.userId === actor.id);
    assert.equal(g.length, 1);
    assert.equal(g[0].passFail, "pass");
    assert.equal(g[0].sourceSubmissionId, a1.id);
    const pb = store.list("passbook", (p) => p.userId === actor.id && p.itemId === it1.id)[0];
    assert.equal(pb.result, "pass");
    assert.equal(pb.threshold, 70);
    assert.ok(pb.completedAt);
  });

  it("a duplicate idempotency key returns the same submission without using an attempt", () => {
    const { store, actor } = u("student3");
    const it1 = itemByKey(minilabKey("tools", 1));
    const a = G.submit(store, actor, it1.id, rightTasks("tools", 1), "same-key");
    const b = G.submit(store, actor, it1.id, rightTasks("tools", 1), "same-key") as { id: string; duplicate?: boolean };
    assert.equal(b.id, a.id);
    assert.equal(b.duplicate, true);
    assert.equal(G.itemView(store, actor, it1.id).attemptsUsed, 1);
  });

  it("quiz attempt 2 uses different variants; Check Answers only after grading", () => {
    const { store, actor } = u("student3");
    const q = itemByKey("m01-course-quiz");
    const before = G.itemView(store, actor, q.id).questions.map((x) => x.prompt);
    const s1 = G.submit(store, actor, q.id, quizPayload(0, 6), "q-1");
    assert.equal(s1.score, 60);
    assert.equal(s1.passed, false);
    const after = G.itemView(store, actor, q.id).questions.map((x) => x.prompt);
    assert.notDeepEqual(after, before);
    const s2 = G.submit(store, actor, q.id, quizPayload(1, 9), "q-2");
    assert.equal(s2.score, 90);
    const review = G.reviewAnswers(store, actor, s2.id) as { answers: { correct: unknown }[] };
    assert.equal(review.answers.length, 10);
    // Another learner can't review it.
    const other = u("student4");
    assert.equal(status(() => G.reviewAnswers(other.store, other.actor, s2.id)), 403);
    // A submission that never graded (infra failure) is not reviewable.
    const w = itemByKey("m01-activity-worksheet");
    const r = G.submit(store, actor, w.id, {}, "w-infra", () => {
      throw new G.InfraFailure("runner down");
    });
    assert.equal(r.state, "infra_failed");
    assert.equal(status(() => G.reviewAnswers(store, actor, r.id)), 409);
  });

  it("infrastructure failure does not consume an attempt", () => {
    const { store, actor } = u("student4");
    const it1 = itemByKey(minilabKey("memory", 1));
    const r = G.submit(store, actor, it1.id, {}, "infra-1", () => {
      throw new G.InfraFailure("Grading runner unavailable");
    });
    assert.equal(r.state, "infra_failed");
    assert.equal(r.attempt, null);
    assert.equal(G.itemView(store, actor, it1.id).attemptsRemaining, 2);
  });

  it("grade posting failure is retried automatically without regrading", () => {
    const { store, actor } = u("student4");
    const it1 = itemByKey(minilabKey("reasoning", 1));
    G.postingFaults.remaining = 1;
    const r = G.submit(store, actor, it1.id, rightTasks("reasoning", 1), "post-1");
    assert.equal(r.state, "posting_failed");
    assert.equal(store.list("grades", (g) => g.assignmentId === it1.assignmentId && g.userId === actor.id).length, 0);
    const out = G.retryPostings(store);
    assert.ok(out.posted >= 1);
    const sub = store.get("graded_submissions", r.id)!;
    assert.equal(sub.state, "posted");
    assert.equal(sub.score, r.score);
    assert.equal(store.list("grades", (g) => g.assignmentId === it1.assignmentId && g.userId === actor.id).length, 1);
  });

  it("publishing a changed rubric freezes a new version; existing submissions keep theirs", () => {
    const s = storeOf("academy");
    const it1 = itemByKey(minilabKey("perception", 1));
    const subs = s.list("graded_submissions", (x) => x.itemId === it1.id);
    const v1 = s.list("graded_item_versions", (v) => v.itemId === it1.id)[0];
    G.upsertItem(s, null, { courseId: COURSE, module: "Module_01", key: String(it1.key), kind: "minilab", title: String(it1.title), instructions: "v2", rubric: (v1.rubric as G.RubricCriterion[]).map((c) => ({ ...c, description: c.description + " (rev)" })), evaluator: v1.evaluator as G.Evaluator });
    assert.equal(s.get("graded_items", it1.id)?.currentVersion, 2);
    for (const x of subs) assert.equal(s.get("graded_submissions", x.id)?.itemVersion, 1);
  });

  it("staff see the gradebook and CSV; learners see only their own row", () => {
    const inst = u("instructor");
    const gb = G.courseGradebook(inst.store, inst.actor, COURSE);
    assert.ok(gb.isStaff);
    assert.ok(gb.rows.length >= 4);
    assert.match(G.gradebookCsv(inst.store, inst.actor, COURSE), /Learner/);
    const st = u("student2");
    const mine = G.courseGradebook(st.store, st.actor, COURSE);
    assert.equal(mine.rows.length, 1);
    assert.equal(status(() => G.gradebookCsv(st.store, st.actor, COURSE)), 403);
    const outsider = u("student6");
    assert.equal(status(() => G.courseGradebook(outsider.store, outsider.actor, COURSE)), 403);
  });
});

describe("Workspace project grading", () => {
  it("save, leave and resume keeps files; the project grades a frozen snapshot", () => {
    const { store, actor } = u("student1");
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: AI801_LAB_KEY, templateId: "agent-builder" });
    W.writeFile(store, actor, ws.id, "agent/spec.yaml", "name: guest-services\ngoal: answer booking questions\nmax_steps: 6\ntools:\n  - FILE_READ\nguardrail:\n  block: [ignore previous]\n");
    W.writeFile(store, actor, ws.id, "report.md", "# Report\n## Perception\n## Memory\n## Requirements\nFinance cap.\n## Validation\nall checks passed\n");
    W.saveWorkspace(store, actor, ws.id);
    W.stopWorkspace(store, actor, ws.id);
    const again = u("student1");
    W.resumeWorkspace(again.store, again.actor, ws.id);
    assert.match(W.readFile(again.store, again.actor, ws.id, "agent/spec.yaml").content, /guardrail/);
    const item = itemByKey(AI801_PROJECT_KEY);
    const r = submitProject(again.store, again.actor, item.id, ws.id, "proj-1");
    assert.equal(r.score, 100);
    assert.equal(r.passed, true);
    const sub = again.store.get("graded_submissions", r.id)!;
    assert.ok(sub.workspaceSnapshotId);
    // Editing after submission does not change the graded snapshot.
    W.writeFile(again.store, again.actor, ws.id, "agent/spec.yaml", "broken");
    const snap = W.getSnapshot(again.store, again.actor, String(sub.workspaceSnapshotId));
    assert.match(snap.files["agent/spec.yaml"], /guardrail/);
    assert.equal(snap.intact, true);
  });

  it("missing mandatory criterion fails even with partial credit; cross-user workspaces are blocked", () => {
    const { store, actor } = u("student2");
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: AI801_LAB_KEY, templateId: "agent-builder" });
    const item = itemByKey(AI801_PROJECT_KEY);
    const r = submitProject(store, actor, item.id, ws.id, "p2-1");
    assert.equal(r.passed, false);
    assert.ok((r.mandatoryFailed as string[]).includes("Functional correctness"));
    const thief = u("student3");
    assert.equal(status(() => submitProject(thief.store, thief.actor, item.id, ws.id, "steal")), 403);
    assert.equal(G.itemView(thief.store, thief.actor, item.id).attemptsUsed, 0);
  });

  it("a paused lab is an infrastructure failure, not a used attempt", () => {
    const st = u("student4");
    const ws = W.launchWorkspace(st.store, st.actor, { courseId: COURSE, labKey: AI801_LAB_KEY, templateId: "agent-builder" });
    const inst = u("instructor");
    W.pauseWorkspaces(inst.store, inst.actor, COURSE, AI801_LAB_KEY);
    const item = itemByKey(AI801_PROJECT_KEY);
    const r = submitProject(st.store, st.actor, item.id, ws.id, "paused-1");
    assert.equal(r.state, "infra_failed");
    assert.equal(G.itemView(st.store, st.actor, item.id).attemptsRemaining, 2);
    W.resumeWorkspaces(inst.store, inst.actor, COURSE, AI801_LAB_KEY);
  });

  it("disallowed tools are blocked automatically by the lab policy", () => {
    const st = u("student1");
    const ws = W.listMyWorkspaces(st.store, st.actor, COURSE)[0];
    const out = W.runCommand(st.store, st.actor, ws.id, "cat /etc/passwd");
    assert.notEqual(out.exitCode, 0);
  });
});

/* ---------------- HTTP: forms, projection lock, protected downloads, Studio outputs ---------------- */
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";
import { advanceClock } from "../src/campus/core";
import * as P from "../src/campus/services/projection";
import * as S from "../src/campus/services/studio";

const H = "http://localhost:3000/api/campus/v1/t/academy/";
async function signIn(user: string) {
  const r = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${user}@academy.scholarion.test`, password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
  return r.headers.get("set-cookie")!.split(";")[0];
}
const get = (cookie: string, path: string) => handleCampus(new Request(`${H}${path}`, { headers: { cookie } }), `v1/t/academy/${path.split("?")[0]}`);
const form = (cookie: string, op: string, fields: Record<string, string>) =>
  handleCampus(new Request(`${H}a/${op}`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000", host: "localhost:3000" }, body: new URLSearchParams(fields) }), `v1/t/academy/a/${op}`);

describe("Learning area over HTTP", () => {
  it("a form submission with ans__ fields grades and redirects with the submission id; replaying the key is idempotent", async () => {
    const cookie = await signIn("student6");
    // student6 isn't enrolled in AI-801: forbidden.
    const it1 = itemByKey(minilabKey("tools", 2));
    const denied = await form(cookie, "graded.submit", { itemId: it1.id, idempotencyKey: "h-1", back: "/campus/academy/learn/x/mini-labs" });
    assert.match(decodeURIComponent(denied.headers.get("location") ?? ""), /error=/);
    const c3 = await signIn("student3");
    const tasks = AI801_MINILABS.tools[1].tasks;
    const fields: [string, string][] = [["itemId", it1.id], ["idempotencyKey", "h-2"], ["back", `/campus/academy/learn/${COURSE}/mini-labs?item=${it1.id}`], ["result_param", "sub"]];
    for (const t of tasks) {
      if (t.kind === "match" || t.kind === "order") for (const k of t.key) fields.push([`ans__${t.id}[]`, String(k)]);
      else fields.push([`ans__${t.id}`, String(t.key[0])]);
    }
    const body = new URLSearchParams(fields);
    const post = () => handleCampus(new Request(`${H}a/graded.submit`, { method: "POST", headers: { cookie: c3, "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000", host: "localhost:3000" }, body }), "v1/t/academy/a/graded.submit");
    const r1 = await post();
    const loc = r1.headers.get("location") ?? "";
    const sub = new URL(loc, "http://x").searchParams.get("sub");
    assert.ok(sub, loc);
    const row = storeOf("academy").get("graded_submissions", sub!)!;
    assert.equal(row.score, 100);
    const r2 = await post();
    assert.equal(new URL(r2.headers.get("location") ?? "", "http://x").searchParams.get("sub"), sub);
    assert.equal(storeOf("academy").list("graded_submissions", (s) => s.itemId === it1.id && s.userId === "usr_academy_student3").length, 1);
  });

  it("answers start locked; only the course instructor unlocks; they relock after 30 minutes", async () => {
    const s = storeOf("academy");
    assert.equal(P.answersLocked(s, COURSE), true);
    const st = u("student1");
    assert.equal(status(() => P.setProjectionLock(st.store, st.actor, COURSE, false)), 403);
    const lead = await signIn("instructor");
    const locked = await get(lead, `sim-labs/haven-guest-services/instructor.html?module=1&courseId=${COURSE}`);
    assert.equal(locked.status, 423);
    await form(lead, "projection.unlock", { courseId: COURSE, back: `/campus/academy/learn/${COURSE}/instructor` });
    const open = await get(lead, `sim-labs/haven-guest-services/instructor.html?module=1&courseId=${COURSE}`);
    assert.equal(open.status, 200);
    assert.match(await open.text(), /INSTRUCTOR MODE/);
    advanceClock(31 * 60_000);
    assert.equal(P.answersLocked(s, COURSE), true);
    // Students never get the instructor edition.
    const sc = await signIn("student1");
    assert.equal((await get(sc, `sim-labs/haven-guest-services/instructor.html?module=1`)).status, 403);
  });

  it("Studio package: 10-slide deck, folder tree, honest media status; learners never receive instructor files", async () => {
    const lead = u("lead");
    const run = S.listRuns(lead.store, lead.actor, COURSE)[0];
    const staffOut = S.listOutputs(lead.store, lead.actor, run.id);
    const deck = staffOut.find((o) => o.relPath === "03_Lecture_Deck/lecture_deck.html")!;
    assert.equal((deck.meta as { slides: number }).slides, 10);
    for (const f of ["01_Sources", "02_Overview_and_Lessons", "03_Lecture_Deck", "07_Study_Guides_and_Flashcards", "08_Practice_Quizzes", "09_Student_Labs", "10_Instructor_Resources", "11_Application_Demo", "12_Assessments_and_Rubrics", "13_Environment_Templates"]) assert.ok(staffOut.some((o) => String(o.path).includes(`/Module_01/`) && String(o.relPath).startsWith(f)), f);
    assert.ok(staffOut.some((o) => o.relPath === "03_Lecture_Deck/cover_variant_A.html") && staffOut.some((o) => o.relPath === "03_Lecture_Deck/cover_variant_B.html"));
    for (const o of staffOut.filter((x) => String(x.relPath).endsWith(".mp3"))) assert.equal(o.status, "awaiting_rendering");
    const fc = staffOut.find((o) => o.relPath === "07_Study_Guides_and_Flashcards/flashcards.json")!;
    assert.equal(fc.status, "ready");
    const st = u("student2");
    const mine = S.listOutputs(st.store, st.actor, run.id);
    assert.ok(mine.length > 0 && mine.every((o) => o.access === "learner"));
    const key = staffOut.find((o) => o.access === "instructor")!;
    const sc = await signIn("student2");
    assert.equal((await get(sc, `learn/${COURSE}/outputs/${key.id}`)).status, 403);
    const okDeck = await get(sc, `learn/${COURSE}/outputs/${deck.id}`);
    assert.equal(okDeck.status, 200);
    assert.match(okDeck.headers.get("content-type") ?? "", /text\/html/);
    const mp3 = mine.find((o) => String(o.relPath).endsWith(".mp3"))!;
    assert.equal((await get(sc, `learn/${COURSE}/outputs/${mp3.id}`)).status, 409);
    // Instructor files are behind the projection lock for staff too.
    const lc = await signIn("instructor");
    assert.equal((await get(lc, `learn/${COURSE}/outputs/${key.id}`)).status, 423);
    const zip = await get(sc, `learn/${COURSE}/studio/${run.id}/bundle.zip`);
    assert.equal(zip.status, 200);
    const bytes = Buffer.from(await zip.arrayBuffer()).toString("latin1");
    assert.doesNotMatch(bytes, /10_Instructor_Resources/);
    assert.equal((await get(sc, `learn/${COURSE}/gradebook.csv`)).status, 403);
    assert.equal((await get(lc, `learn/${COURSE}/gradebook.csv`)).status, 200);
  });
});
