import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { authoring, catalog, lms } from "../src/platform";
import { getDb } from "../src/platform/store";
import type { PlatformError } from "../src/platform/util";
import { fresh } from "./helpers";

const FAC = "usr_faculty";
const ADMIN = "usr_admin";

beforeEach(() => fresh());

/** Builds a course that passes the checklist. */
function buildCompleteCourse() {
  const c = authoring.createCourse(FAC, { title: "Prompt Design Basics", level: "Beginner" });
  authoring.updateCourse(FAC, c.id, {
    tagline: "Write prompts that work the first time",
    description: "A short, hands-on course on structuring prompts, giving examples and checking model output before you rely on it at work.",
    whatYoullLearn: "Structure a prompt\nUse examples\nCheck output",
  });
  authoring.addModule(FAC, c.id, { title: "Prompt structure", overview: "Roles, context and format." });
  const reading = authoring.addItem(FAC, c.id, 1, "reading", "Anatomy of a prompt");
  authoring.updateItem(FAC, reading.id, { body: "A good prompt states the task, the context, the format and an example of the output you want." });
  const video = authoring.addItem(FAC, c.id, 1, "video", "Walkthrough");
  authoring.updateItem(FAC, video.id, { src: "https://media.example/walkthrough.mp4", captions: "en, es", transcript: "In this walkthrough we rewrite a vague prompt into a structured one, step by step." });
  const quiz = authoring.addItem(FAC, c.id, 1, "quiz", "Check your understanding");
  for (let n = 1; n <= 3; n++) authoring.addQuestion(FAC, quiz.id, { prompt: `Question ${n}: which part sets the output format?`, options: "The format line\nThe greeting", answer: "1", explanation: "The format line tells the model how to answer." });
  return { course: c, reading, video, quiz };
}

describe("Course builder", () => {
  it("only instructors can create courses", () => {
    assert.throws(() => authoring.createCourse("usr_amara", { title: "My course" }), (e: PlatformError) => e.code === "forbidden");
  });

  it("drafts are private to authors and hidden from the public catalog", () => {
    const { course } = buildCompleteCourse();
    assert.equal(catalog.get(course.id), undefined);
    assert.equal(catalog.get(course.slug), undefined);
    assert.ok(!catalog.all().some((p) => p.id === course.id));
    assert.throws(() => authoring.outline("usr_amara", course.id), /not found/i);
    assert.equal(authoring.myCourses(FAC)[0].id, course.id);
  });

  it("the checklist blocks videos without captions, short quizzes and unverified claims", () => {
    const c = authoring.createCourse(FAC, { title: "Thin Course" });
    authoring.addModule(FAC, c.id, { title: "One" });
    const v = authoring.addItem(FAC, c.id, 1, "video", "Clip");
    authoring.addItem(FAC, c.id, 1, "quiz", "Quiz");
    authoring.updateCourse(FAC, c.id, { description: "Earn transferable college credit and a guaranteed job. ".repeat(3) });
    const issues = authoring.checklist(FAC, c.id).map((i) => i.message).join(" | ");
    assert.match(issues, /captions/i);
    assert.match(issues, /transcript/i);
    assert.match(issues, /at least 3 questions/);
    assert.match(issues, /Credit statements/);
    assert.throws(() => authoring.submitForReview(FAC, c.id), (e: PlatformError) => e.code === "checklist");
    authoring.updateItem(FAC, v.id, { captions: "en" });
    assert.ok(!authoring.checklist(FAC, c.id).some((i) => /captions/.test(i.message)));
  });

  it("validates quiz questions and keeps answers server-side", () => {
    const { quiz } = buildCompleteCourse();
    assert.throws(() => authoring.addQuestion(FAC, quiz.id, { prompt: "Which?", options: "Only one", answer: "1", explanation: "Because." }), /2 to 6/);
    assert.throws(() => authoring.addQuestion(FAC, quiz.id, { prompt: "Which one?", options: "A\nB", answer: "3", explanation: "Because." }), /correct/);
    const q = getDb().items.find((i) => i.id === quiz.id)!.quiz!.questions[0];
    assert.equal(q.answer, "a");
  });

  it("submit → reviewer approves → published, weights normalised, authors emailed", () => {
    const { course, quiz } = buildCompleteCourse();
    authoring.submitForReview(FAC, course.id);
    assert.throws(() => authoring.updateCourse(FAC, course.id, { title: "Changed while in review" }), /waiting for review/);
    assert.throws(() => authoring.decide(FAC, course.id, "approve"), (e: PlatformError) => e.code === "forbidden");
    authoring.decide(ADMIN, course.id, "approve");
    const pub = catalog.get(course.slug)!;
    assert.equal(pub.status, "published");
    assert.equal(getDb().items.find((i) => i.id === quiz.id)!.weight, 100);
    assert.ok(getDb().outbox.some((e) => e.template === "course_published"));
    assert.ok(lms.enroll("usr_amara", course.id, "audit"));
  });

  it("changes requested need a note and reach the author", () => {
    const { course } = buildCompleteCourse();
    authoring.submitForReview(FAC, course.id);
    assert.throws(() => authoring.decide(ADMIN, course.id, "changes", " "), /what to change/);
    authoring.decide(ADMIN, course.id, "changes", "Add a second example to the reading.");
    assert.equal(getDb().products.find((p) => p.id === course.id)!.review!.state, "changes_requested");
    assert.match(getDb().outbox.find((e) => e.template === "course_changes")!.body, /second example/);
    authoring.updateCourse(FAC, course.id, { tagline: "Write prompts that work the first time, every time" });
  });

  it("locks quizzes once learners have attempted them", () => {
    const { course, quiz } = buildCompleteCourse();
    authoring.submitForReview(FAC, course.id);
    authoring.decide(ADMIN, course.id, "approve");
    getDb().attempts.push({ id: "att_x", userId: "usr_amara", itemId: quiz.id, answers: {}, startedAt: new Date().toISOString() });
    assert.throws(() => authoring.addQuestion(FAC, quiz.id, { prompt: "One more?", options: "A\nB", answer: "1", explanation: "Because." }), /locked/);
    assert.throws(() => authoring.deleteItem(FAC, quiz.id), /can't be deleted/);
  });

  it("labs need a reference solution that passes its own tests", () => {
    const c = authoring.createCourse(FAC, { title: "Lab Course" });
    authoring.addModule(FAC, c.id, { title: "Functions" });
    const lab = authoring.addItem(FAC, c.id, 1, "lab", "Write add()");
    authoring.updateItem(FAC, lab.id, { instructions: "Write add(a, b).", starterCode: "def add(a, b):\n    pass\n", solution: "def add(a, b):\n    return a - b\n" });
    assert.throws(() => authoring.addTest(FAC, lab.id, { name: "adds", code: "add(1, 2)", points: "5" }), /assert/);
    authoring.addTest(FAC, lab.id, { name: "adds two numbers", code: "assert add(1, 2) == 3", points: "5" });
    const bad = authoring.verifyLab(FAC, lab.id);
    assert.equal(bad.score, 0);
    assert.ok(authoring.checklist(FAC, c.id).some((i) => /scores 0\/5/.test(i.message)));
    authoring.updateItem(FAC, lab.id, { solution: "def add(a, b):\n    return a + b\n" });
    assert.ok(authoring.checklist(FAC, c.id).some((i) => /Run the tests/.test(i.message)), "changing the solution needs a re-check");
    assert.equal(authoring.verifyLab(FAC, lab.id).score, 5);
    assert.ok(!authoring.checklist(FAC, c.id).some((i) => i.where.includes("Write add()")));
  });

  it("analytics show completion and per-question difficulty", () => {
    const { course, quiz } = buildCompleteCourse();
    authoring.submitForReview(FAC, course.id);
    authoring.decide(ADMIN, course.id, "approve");
    lms.enroll("usr_amara", course.id, "audit");
    const qs = getDb().items.find((i) => i.id === quiz.id)!.quiz!.questions;
    getDb().attempts.push({ id: "att_a", userId: "usr_amara", itemId: quiz.id, answers: { [qs[0].id]: "a", [qs[1].id]: "b" }, startedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), score: 1, max: 3 });
    const a = authoring.analytics(FAC, course.id);
    assert.equal(a.learners, 1);
    const qa = a.items.find((i) => i.id === quiz.id)!.questions;
    assert.equal(qa[0].correctPct, 100);
    assert.equal(qa[1].correctPct, 0);
    assert.equal(qa[2].correctPct, null);
    assert.throws(() => authoring.analytics("usr_amara", course.id), /not found/i);
  });

  it("removing modules renumbers the rest", () => {
    const c = authoring.createCourse(FAC, { title: "Renumber" });
    authoring.addModule(FAC, c.id, { title: "First" });
    authoring.addModule(FAC, c.id, { title: "Second" });
    const it2 = authoring.addItem(FAC, c.id, 2, "reading", "Second reading");
    authoring.deleteModule(FAC, c.id, 1);
    const o = authoring.outline(FAC, c.id);
    assert.deepEqual(o.modules.map((m) => [m.no, m.title]), [[1, "Second"]]);
    assert.equal(o.modules[0].items[0].id, it2.id);
  });
});
