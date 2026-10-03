import { publish } from "./bus";
import { identity } from "./identity";
import { cloudlab } from "./cloudlab";
import { checkClaims } from "./partners";
import { getDb, nowIso, save } from "./store";
import type { Item, ItemKind, Level, Module, Product, QuizQuestion } from "./types";
import { newId, PlatformError, sha256, slugify } from "./util";

/**
 * Instructor course builder (Master Prompt §7 Studio/authoring). Instructors draft a course
 * as a real catalog product in `draft` status, add modules and items, and submit it for
 * review. A reviewer approves (publishes) or requests changes. Publishing is blocked until
 * the checklist passes: captions and transcripts on every video, complete quizzes, tested
 * labs, rubrics, and no unverified claims anywhere in the copy.
 */

export type BuilderKind = Extract<ItemKind, "reading" | "video" | "quiz" | "lab" | "project" | "discussion">;
export const BUILDER_KINDS: BuilderKind[] = ["reading", "video", "quiz", "lab", "project", "discussion"];
const LEVELS: Level[] = ["Beginner", "Foundational", "Intermediate", "Advanced"];

export interface ChecklistIssue {
  where: string;
  href: string | null;
  message: string;
}

function user(userId: string) {
  const u = identity.getUser(userId);
  if (!u) throw new PlatformError("not_found", "User not found", 404);
  return u;
}

function isInstructor(userId: string): boolean {
  return identity.hasRole(user(userId), "instructor");
}

/** The course, if this user may edit it. Admins may edit any instructor-built course. */
function editable(userId: string, courseId: string): Product {
  const p = getDb().products.find((x) => x.id === courseId);
  if (!p || !p.authorIds) throw new PlatformError("not_found", "Course not found", 404);
  const u = user(userId);
  if (!p.authorIds.includes(userId) && !u.roles.includes("platform_admin")) throw new PlatformError("not_found", "Course not found", 404);
  if (p.review?.state === "submitted") throw new PlatformError("in_review", "This course is waiting for review. Withdraw it from review to make changes.", 409);
  return p;
}

function readable(userId: string, courseId: string): Product {
  const p = getDb().products.find((x) => x.id === courseId);
  const u = user(userId);
  if (!p || !p.authorIds || !(p.authorIds.includes(userId) || identity.hasRole(u, "reviewer"))) throw new PlatformError("not_found", "Course not found", 404);
  return p;
}

function itemOf(userId: string, itemId: string): { course: Product; item: Item } {
  const item = getDb().items.find((i) => i.id === itemId);
  if (!item) throw new PlatformError("not_found", "Item not found", 404);
  return { course: editable(userId, item.courseId), item };
}

function hasLearnerData(itemId: string): boolean {
  const db = getDb();
  return db.grades.some((g) => g.itemId === itemId) || db.attempts.some((a) => a.itemId === itemId) || db.submissions.some((s) => s.itemId === itemId);
}

function lines(s: string | undefined): string[] {
  return (s ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueSlug(title: string): string {
  const base = slugify(title) || "course";
  const taken = new Set(getDb().products.map((p) => p.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

function defaults(kind: BuilderKind): Partial<Item> {
  switch (kind) {
    case "reading":
      return { minutes: 10, graded: false, aiUsePolicy: "open", body: "" };
    case "video":
      return { minutes: 8, graded: false, aiUsePolicy: "open", video: { src: null, durationSec: 0, captions: [], transcript: "" } };
    case "quiz":
      return { minutes: 15, graded: true, weight: 10, aiUsePolicy: "closed", quiz: { timeLimitMinutes: 20, passPercent: 70, questions: [] } };
    case "lab":
      return { minutes: 45, graded: true, weight: 20, aiUsePolicy: "hints_only", lab: { templateId: "python-3.12", instructions: [], starterFile: "main.py", starterCode: "", tests: [], resourceClass: "cpu-small", timeLimitMinutes: 60 } };
    case "project":
      return { minutes: 120, graded: true, weight: 30, aiUsePolicy: "hints_only", project: { scenario: "", deliverables: [], rubric: [] } };
    case "discussion":
      return { minutes: 15, graded: false, aiUsePolicy: "open", body: "" };
  }
}

function labHash(i: Item): string {
  return sha256(JSON.stringify([i.lab?.solution ?? "", i.lab?.tests ?? []]));
}

function recompute(p: Product): void {
  const db = getDb();
  const items = db.items.filter((i) => i.courseId === p.id);
  p.hours = Math.max(1, Math.round(items.reduce((s, i) => s + i.minutes, 0) / 60));
  p.durationLabel = `${p.hours} hour${p.hours === 1 ? "" : "s"}`;
}

export const authoring = {
  BUILDER_KINDS,

  myCourses(userId: string): Product[] {
    const u = user(userId);
    return getDb()
      .products.filter((p) => p.authorIds && (p.authorIds.includes(userId) || u.roles.includes("platform_admin")))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createCourse(userId: string, input: { title: string; tagline?: string; level?: string; description?: string; skills?: string }): Product {
    if (!isInstructor(userId)) throw new PlatformError("forbidden", "Only instructors can create courses.", 403);
    const title = input.title.trim();
    if (title.length < 4) throw new PlatformError("title_required", "Give the course a title of at least 4 characters.");
    const level = LEVELS.includes(input.level as Level) ? (input.level as Level) : "Beginner";
    const p: Product = {
      id: newId("prd"),
      slug: uniqueSlug(title),
      type: "course",
      title,
      tagline: (input.tagline ?? "").trim(),
      description: (input.description ?? "").trim(),
      level,
      durationLabel: "1 hour",
      hours: 1,
      language: "English",
      subtitles: [],
      skills: (input.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      roles: [],
      whatYoullLearn: [],
      freeToAudit: true,
      plusEligible: true,
      format: "self_paced",
      status: "draft",
      courseIds: [],
      educator: "Scholarion Academy",
      partnerIds: [],
      createdAt: nowIso(),
      credential: { kind: "certificate", title: `${title} certificate`, criteria: ["Complete all graded work", "Score 70% or higher overall"] },
      faq: [],
      authorIds: [userId],
    };
    p.courseIds = [p.id];
    getDb().products.push(p);
    save();
    publish("authoring.course.created", "authoring", `product/${p.id}`, { productId: p.id, userId });
    return p;
  },

  updateCourse(userId: string, courseId: string, f: Record<string, string | undefined>): Product {
    const p = editable(userId, courseId);
    if (f.title !== undefined) {
      if (f.title.trim().length < 4) throw new PlatformError("title_required", "Give the course a title of at least 4 characters.");
      p.title = f.title.trim();
      if (p.status === "draft") p.credential.title = `${p.title} certificate`;
    }
    if (f.tagline !== undefined) p.tagline = f.tagline.trim();
    if (f.description !== undefined) p.description = f.description.trim();
    if (f.level !== undefined && LEVELS.includes(f.level as Level)) p.level = f.level as Level;
    if (f.skills !== undefined) p.skills = f.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (f.roles !== undefined) p.roles = f.roles.split(",").map((s) => s.trim()).filter(Boolean);
    if (f.whatYoullLearn !== undefined) p.whatYoullLearn = lines(f.whatYoullLearn);
    if (f.freeToAudit !== undefined) p.freeToAudit = f.freeToAudit === "on" || f.freeToAudit === "true";
    if (p.review?.state === "changes_requested") {
      /* keep the note visible until resubmitted */
    }
    save();
    return p;
  },

  addModule(userId: string, courseId: string, input: { title: string; overview?: string; objectives?: string }): Module {
    const p = editable(userId, courseId);
    const title = input.title.trim();
    if (title.length < 3) throw new PlatformError("title_required", "Give the module a title.");
    const db = getDb();
    const no = Math.max(0, ...db.modules.filter((m) => m.courseId === p.id).map((m) => m.no)) + 1;
    const m: Module = { courseId: p.id, no, title, week: no, estimate: "", overview: (input.overview ?? "").trim(), objectives: lines(input.objectives), keyTopics: [] };
    db.modules.push(m);
    save();
    return m;
  },

  updateModule(userId: string, courseId: string, no: number, f: { title?: string; overview?: string; objectives?: string }): Module {
    const p = editable(userId, courseId);
    const m = getDb().modules.find((x) => x.courseId === p.id && x.no === no);
    if (!m) throw new PlatformError("not_found", "Module not found", 404);
    if (f.title !== undefined && f.title.trim().length >= 3) m.title = f.title.trim();
    if (f.overview !== undefined) m.overview = f.overview.trim();
    if (f.objectives !== undefined) m.objectives = lines(f.objectives);
    save();
    return m;
  },

  deleteModule(userId: string, courseId: string, no: number): void {
    const p = editable(userId, courseId);
    const db = getDb();
    const items = db.items.filter((i) => i.courseId === p.id && i.moduleNo === no);
    if (items.some((i) => hasLearnerData(i.id))) throw new PlatformError("has_learner_data", "Learners have work in this module, so it can't be deleted.", 409);
    db.items = db.items.filter((i) => !(i.courseId === p.id && i.moduleNo === no));
    db.modules = db.modules.filter((m) => !(m.courseId === p.id && m.no === no));
    // Renumber so modules stay 1..n.
    const rest = db.modules.filter((m) => m.courseId === p.id).sort((a, b) => a.no - b.no);
    rest.forEach((m, idx) => {
      const newNo = idx + 1;
      if (m.no !== newNo) {
        for (const i of db.items) if (i.courseId === p.id && i.moduleNo === m.no) i.moduleNo = newNo;
        m.no = newNo;
        m.week = newNo;
      }
    });
    recompute(p);
    save();
  },

  addItem(userId: string, courseId: string, moduleNo: number, kind: string, title: string): Item {
    const p = editable(userId, courseId);
    if (!BUILDER_KINDS.includes(kind as BuilderKind)) throw new PlatformError("bad_kind", "Choose an item type.");
    const db = getDb();
    if (!db.modules.some((m) => m.courseId === p.id && m.no === moduleNo)) throw new PlatformError("not_found", "Module not found", 404);
    const t = title.trim();
    if (t.length < 3) throw new PlatformError("title_required", "Give the item a title.");
    const order = Math.max(0, ...db.items.filter((i) => i.courseId === p.id && i.moduleNo === moduleNo).map((i) => i.order)) + 1;
    const item: Item = { id: newId("itm"), courseId: p.id, moduleNo, order, kind: kind as BuilderKind, title: t, minutes: 10, graded: false, weight: 0, aiUsePolicy: "open", auditVisible: true, ...defaults(kind as BuilderKind) } as Item;
    if (item.graded) item.auditVisible = false;
    db.items.push(item);
    recompute(p);
    save();
    return item;
  },

  moveItem(userId: string, itemId: string, dir: "up" | "down"): void {
    const { course, item } = itemOf(userId, itemId);
    const siblings = getDb()
      .items.filter((i) => i.courseId === course.id && i.moduleNo === item.moduleNo)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.id === item.id);
    const swap = siblings[dir === "up" ? idx - 1 : idx + 1];
    if (!swap) return;
    [item.order, swap.order] = [swap.order, item.order];
    save();
  },

  deleteItem(userId: string, itemId: string): void {
    const { course, item } = itemOf(userId, itemId);
    if (hasLearnerData(item.id)) throw new PlatformError("has_learner_data", "Learners have work on this item, so it can't be deleted.", 409);
    const db = getDb();
    db.items = db.items.filter((i) => i.id !== item.id);
    recompute(course);
    save();
  },

  /** Updates an item from a flat form. Fields depend on the kind. */
  updateItem(userId: string, itemId: string, f: Record<string, string | undefined>): Item {
    const { course, item } = itemOf(userId, itemId);
    if (f.title !== undefined && f.title.trim().length >= 3) item.title = f.title.trim();
    if (f.minutes !== undefined) item.minutes = Math.max(1, Math.min(600, Math.round(Number(f.minutes) || item.minutes)));
    if (f.aiUsePolicy !== undefined && ["open", "hints_only", "closed"].includes(f.aiUsePolicy)) item.aiUsePolicy = f.aiUsePolicy as Item["aiUsePolicy"];
    if (f.weight !== undefined && item.graded) item.weight = Math.max(0, Math.min(100, Number(f.weight) || 0));
    if (f.auditVisible !== undefined) item.auditVisible = !item.graded && (f.auditVisible === "on" || f.auditVisible === "true");
    if ((item.kind === "reading" || item.kind === "discussion") && f.body !== undefined) item.body = f.body.trim();
    if (item.kind === "video" && item.video) {
      if (f.src !== undefined) item.video.src = f.src.trim() || null;
      if (f.durationMin !== undefined) item.video.durationSec = Math.max(0, Math.round((Number(f.durationMin) || 0) * 60));
      if (f.captions !== undefined) item.video.captions = f.captions.split(",").map((c) => c.trim().toLowerCase()).filter((c) => /^[a-z]{2}(-[a-z]{2})?$/.test(c));
      if (f.transcript !== undefined) {
        item.video.transcript = f.transcript.trim();
        item.body = item.video.transcript; // grounds the AI Tutor
      }
    }
    if (item.kind === "quiz" && item.quiz) {
      if (hasLearnerData(item.id) && (f.passPercent !== undefined || f.timeLimit !== undefined)) throw new PlatformError("has_learner_data", "Learners have attempted this quiz. Settings are locked; add a new quiz instead.", 409);
      if (f.passPercent !== undefined) item.quiz.passPercent = Math.max(1, Math.min(100, Number(f.passPercent) || 70));
      if (f.timeLimit !== undefined) item.quiz.timeLimitMinutes = Math.max(1, Math.min(240, Number(f.timeLimit) || 20));
    }
    if (item.kind === "lab" && item.lab) {
      if (f.instructions !== undefined) item.lab.instructions = lines(f.instructions);
      if (f.starterFile !== undefined && /^[\w.-]+\.py$/.test(f.starterFile.trim())) item.lab.starterFile = f.starterFile.trim();
      if (f.starterCode !== undefined) item.lab.starterCode = f.starterCode.replace(/\r\n/g, "\n");
      if (f.solution !== undefined) item.lab.solution = f.solution.replace(/\r\n/g, "\n");
    }
    if (item.kind === "project" && item.project) {
      if (f.scenario !== undefined) item.project.scenario = f.scenario.trim();
      if (f.deliverables !== undefined) item.project.deliverables = lines(f.deliverables);
      if (f.rubric !== undefined) {
        // One criterion per line: "Criterion name | points"
        item.project.rubric = lines(f.rubric)
          .map((l) => {
            const [criterion, pts] = l.split("|").map((x) => x.trim());
            return { criterion, points: Math.max(1, Math.round(Number(pts) || 0)) };
          })
          .filter((r) => r.criterion && r.points > 0);
      }
      if (f.peerReview !== undefined) item.project.peerReview = f.peerReview === "on" ? { required: 2 } : undefined;
    }
    recompute(course);
    save();
    return item;
  },

  addQuestion(userId: string, itemId: string, q: { prompt: string; options: string; answer: string; explanation: string }): QuizQuestion {
    const { item } = itemOf(userId, itemId);
    if (!item.quiz) throw new PlatformError("not_quiz", "This item isn't a quiz.");
    if (hasLearnerData(item.id)) throw new PlatformError("has_learner_data", "Learners have attempted this quiz, so its questions are locked.", 409);
    const opts = lines(q.options);
    if (q.prompt.trim().length < 5) throw new PlatformError("prompt_required", "Write the question.");
    if (opts.length < 2 || opts.length > 6) throw new PlatformError("options", "Give 2 to 6 answer options, one per line.");
    const answerIdx = Number(q.answer) - 1;
    if (!(answerIdx >= 0 && answerIdx < opts.length)) throw new PlatformError("answer", "Choose which option is correct.");
    if (q.explanation.trim().length < 5) throw new PlatformError("explanation", "Explain the correct answer; learners see it after submitting.");
    const letters = "abcdef";
    const question: QuizQuestion = {
      id: newId("q"),
      prompt: q.prompt.trim(),
      options: opts.map((text, i) => ({ id: letters[i], text })),
      answer: letters[answerIdx],
      explanation: q.explanation.trim(),
    };
    item.quiz.questions.push(question);
    save();
    return question;
  },

  removeQuestion(userId: string, itemId: string, questionId: string): void {
    const { item } = itemOf(userId, itemId);
    if (!item.quiz) throw new PlatformError("not_quiz", "This item isn't a quiz.");
    if (hasLearnerData(item.id)) throw new PlatformError("has_learner_data", "Learners have attempted this quiz, so its questions are locked.", 409);
    item.quiz.questions = item.quiz.questions.filter((q) => q.id !== questionId);
    save();
  },

  addTest(userId: string, itemId: string, t: { name: string; code: string; points: string }): void {
    const { item } = itemOf(userId, itemId);
    if (!item.lab) throw new PlatformError("not_lab", "This item isn't a lab.");
    const name = t.name.trim();
    const code = t.code.replace(/\r\n/g, "\n").trim();
    if (name.length < 3) throw new PlatformError("name_required", "Name the test so learners know what it checks.");
    if (!/\bassert\b/.test(code)) throw new PlatformError("assert_required", "A test needs at least one Python assert statement.");
    item.lab.tests.push({ name, code, points: Math.max(1, Math.min(100, Math.round(Number(t.points) || 5))) });
    save();
  },

  /** Runs the reference solution against the tests. A lab publishes only when it scores full marks. */
  verifyLab(userId: string, itemId: string) {
    const { item } = itemOf(userId, itemId);
    if (!item.lab) throw new PlatformError("not_lab", "This item isn't a lab.");
    if (!item.lab.solution?.trim()) throw new PlatformError("solution_required", "Add a reference solution first.");
    if (!item.lab.tests.length) throw new PlatformError("tests_required", "Add at least one test first.");
    const r = cloudlab.check(item.lab.solution, item.lab.tests);
    if (r.ran) item.lab.verified = { at: nowIso(), hash: labHash(item), score: r.score, max: r.max };
    save();
    return r;
  },

  removeTest(userId: string, itemId: string, index: number): void {
    const { item } = itemOf(userId, itemId);
    if (!item.lab) throw new PlatformError("not_lab", "This item isn't a lab.");
    item.lab.tests.splice(index, 1);
    save();
  },

  /** Everything that blocks publishing. Empty list = ready for review. */
  checklist(userId: string, courseId: string): ChecklistIssue[] {
    const p = readable(userId, courseId);
    const db = getDb();
    const base = `/teach/${p.id}`;
    const issues: ChecklistIssue[] = [];
    const add = (where: string, message: string, href: string | null = base) => issues.push({ where, message, href });
    if (p.description.length < 80) add("Course details", "Write a description of at least 80 characters.");
    if (p.tagline.length < 10) add("Course details", "Add a one-line tagline.");
    if (p.whatYoullLearn.length < 3) add("Course details", "List at least 3 things learners will be able to do.");
    const modules = db.modules.filter((m) => m.courseId === p.id);
    if (modules.length === 0) add("Modules", "Add at least one module.");
    const items = db.items.filter((i) => i.courseId === p.id);
    for (const m of modules) if (!items.some((i) => i.moduleNo === m.no)) add(`Module ${m.no}`, "Add at least one item.");
    if (!items.some((i) => i.graded)) add("Grading", "Add at least one graded quiz, lab or project so learners can earn the certificate.");
    for (const i of items) {
      const where = `M${i.moduleNo} · ${i.title}`;
      const href = `${base}/item/${i.id}`;
      if ((i.kind === "reading" || i.kind === "discussion") && (i.body ?? "").length < 50) add(where, i.kind === "reading" ? "Write the reading (at least 50 characters)." : "Write the discussion prompt (at least 50 characters).", href);
      if (i.kind === "video" && i.video) {
        if (!i.video.src) add(where, "Add the video file or stream URL.", href);
        if (i.video.captions.length === 0) add(where, "Add captions (at least one language). Videos can't publish without them.", href);
        if (i.video.transcript.length < 50) add(where, "Add the transcript. It also grounds the AI Tutor.", href);
      }
      if (i.kind === "quiz" && i.quiz && i.quiz.questions.length < 3) add(where, `Add at least 3 questions (has ${i.quiz.questions.length}).`, href);
      if (i.kind === "lab" && i.lab) {
        if (!i.lab.starterCode.trim()) add(where, "Add starter code.", href);
        if (i.lab.tests.length === 0) add(where, "Add at least one autograder test.", href);
        if (i.lab.instructions.length === 0) add(where, "Add instructions.", href);
        if (!i.lab.solution?.trim()) add(where, "Add a reference solution so the tests can be checked.", href);
        else if (cloudlab.runnerEnabled()) {
          const v = i.lab.verified;
          if (!v || v.hash !== labHash(i)) add(where, "Run the tests against your reference solution.", href);
          else if (v.score < v.max) add(where, `Your reference solution scores ${v.score}/${v.max}. Fix the tests or the solution.`, href);
        }
      }
      if (i.kind === "project" && i.project) {
        if (i.project.scenario.length < 50) add(where, "Describe the project scenario (at least 50 characters).", href);
        if (i.project.rubric.length === 0) add(where, "Add a rubric (one criterion per line).", href);
      }
    }
    const copy = [p.title, p.tagline, p.description, ...p.whatYoullLearn, ...modules.flatMap((m) => [m.title, m.overview, ...m.objectives]), ...items.flatMap((i) => [i.title, i.body ?? "", i.project?.scenario ?? ""])].join("\n");
    for (const c of checkClaims(copy)) add("Claims check", `“${c.match}”: ${c.message}`, null);
    return issues;
  },

  submitForReview(userId: string, courseId: string): Product {
    const p = editable(userId, courseId);
    const issues = this.checklist(userId, courseId);
    if (issues.length) throw new PlatformError("checklist", `Fix ${issues.length} item${issues.length === 1 ? "" : "s"} on the checklist first.`, 409);
    p.review = { state: "submitted", submittedAt: nowIso(), submittedBy: userId };
    save();
    publish("authoring.course.submitted", "authoring", `product/${p.id}`, { productId: p.id, userId });
    return p;
  },

  withdraw(userId: string, courseId: string): void {
    const p = getDb().products.find((x) => x.id === courseId);
    if (!p?.authorIds?.includes(userId) || p.review?.state !== "submitted") throw new PlatformError("not_found", "Nothing to withdraw", 404);
    p.review = { ...p.review, state: "changes_requested", note: "Withdrawn by the author." };
    save();
  },

  reviewQueue(): Product[] {
    return getDb().products.filter((p) => p.review?.state === "submitted");
  },

  decide(reviewerId: string, courseId: string, decision: "approve" | "changes", note?: string): Product {
    const r = user(reviewerId);
    if (!identity.hasRole(r, "reviewer")) throw new PlatformError("forbidden", "Only reviewers can approve courses.", 403);
    const p = getDb().products.find((x) => x.id === courseId);
    if (!p || p.review?.state !== "submitted") throw new PlatformError("not_found", "Course isn't waiting for review", 404);
    if (p.authorIds?.includes(reviewerId) || p.review.submittedBy === reviewerId) throw new PlatformError("own_course", "Someone else has to review your course.", 403);
    if (decision === "changes" && !(note ?? "").trim()) throw new PlatformError("note_required", "Tell the author what to change.");
    if (decision === "approve") {
      const issues = this.checklist(reviewerId, courseId);
      if (issues.length) throw new PlatformError("checklist", "The checklist no longer passes.", 409);
      // Normalise graded weights to 100%.
      const graded = getDb().items.filter((i) => i.courseId === p.id && i.graded);
      const total = graded.reduce((s, i) => s + i.weight, 0) || graded.length;
      for (const i of graded) i.weight = Math.round(((i.weight || 1) / total) * 1000) / 10;
      recompute(p);
      p.status = "published";
    }
    p.review = { ...p.review, state: decision === "approve" ? "approved" : "changes_requested", decidedAt: nowIso(), decidedBy: reviewerId, note: note?.trim() || undefined };
    save();
    publish(decision === "approve" ? "authoring.course.published" : "authoring.course.changes_requested", "authoring", `product/${p.id}`, { productId: p.id, reviewerId });
    return p;
  },

  /** Instructor analytics for one of their courses. */
  analytics(userId: string, courseId: string) {
    const p = readable(userId, courseId);
    const db = getDb();
    const items = db.items.filter((i) => i.courseId === p.id).sort((a, b) => a.moduleNo - b.moduleNo || a.order - b.order);
    const learners = new Set(db.enrollments.filter((e) => e.courseId === p.id || e.productId === p.id).map((e) => e.userId));
    const weekAgo = new Date(Date.parse(nowIso()) - 7 * 86400_000).toISOString();
    const active = new Set(db.progress.filter((x) => learners.has(x.userId) && items.some((i) => i.id === x.itemId) && x.updatedAt >= weekAgo).map((x) => x.userId));
    const completed = db.credentials.filter((c) => c.productId === p.id && !c.revokedAt).length;
    const perItem = items.map((i) => {
      const done = db.progress.filter((x) => x.itemId === i.id && x.status === "completed" && learners.has(x.userId)).length;
      const grades = db.grades.filter((g) => g.itemId === i.id);
      const avg = grades.length ? Math.round((grades.reduce((s, g) => s + g.score / g.max, 0) / grades.length) * 1000) / 10 : null;
      let questions: { prompt: string; correctPct: number | null; answered: number }[] = [];
      if (i.quiz) {
        const attempts = db.attempts.filter((a) => a.itemId === i.id && a.submittedAt);
        questions = i.quiz.questions.map((q) => {
          const answered = attempts.filter((a) => a.answers[q.id] !== undefined);
          return { prompt: q.prompt, answered: answered.length, correctPct: answered.length ? Math.round((answered.filter((a) => a.answers[q.id] === q.answer).length / answered.length) * 100) : null };
        });
      }
      return { id: i.id, title: i.title, kind: i.kind, moduleNo: i.moduleNo, completed: done, completionPct: learners.size ? Math.round((done / learners.size) * 100) : 0, averagePct: avg, graded: grades.length, questions };
    });
    const reviewsPub = db.reviews.filter((r) => r.productId === p.id && r.status === "published");
    return {
      course: p,
      learners: learners.size,
      activeThisWeek: active.size,
      completed,
      completionRate: learners.size ? Math.round((completed / learners.size) * 100) : 0,
      rating: reviewsPub.length ? Math.round((reviewsPub.reduce((s, r) => s + r.rating, 0) / reviewsPub.length) * 10) / 10 : null,
      reviewCount: reviewsPub.length,
      items: perItem,
    };
  },

  /** Read-only full view for the builder and reviewers (includes answers and tests). */
  outline(userId: string, courseId: string) {
    const p = readable(userId, courseId);
    const db = getDb();
    const modules = db.modules.filter((m) => m.courseId === p.id).sort((a, b) => a.no - b.no);
    return {
      course: p,
      modules: modules.map((m) => ({ ...m, items: db.items.filter((i) => i.courseId === p.id && i.moduleNo === m.no).sort((a, b) => a.order - b.order) })),
    };
  },

  item(userId: string, itemId: string): { course: Product; item: Item } {
    const item = getDb().items.find((i) => i.id === itemId);
    if (!item) throw new PlatformError("not_found", "Item not found", 404);
    return { course: readable(userId, item.courseId), item };
  },
};
