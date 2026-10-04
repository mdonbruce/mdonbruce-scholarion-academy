import { createHash } from "node:crypto";
import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { getDb, now, nowIso, save } from "./store";
import type { Attempt, Enrollment, GradeRecord, Item, Product, Submission } from "./types";
import { addDays, DAY, newId, PlatformError } from "./util";

/** Scholarion LMS (Integration Spec §7): enrollment, progress, assessments and grades. */

export const PASS_PERCENT = 70;

export type GradebookStatus = "Graded" | "Submitted" | "In Progress" | "Not Started" | "Locked";

export interface GradebookRow {
  item: Pick<Item, "id" | "title" | "kind" | "moduleNo" | "weight">;
  type: string;
  due: string | null;
  status: GradebookStatus;
  score: number | null;
  max: number | null;
}

function typeLabel(i: Item): string {
  return { quiz: "Quiz", lab: "Lab", project: "Project", capstone: "Capstone", discussion: "Participation", video: "Video", reading: "Reading", summary: "Reading" }[i.kind];
}

function letter(pct: number): string {
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

/** Strip answers before anything reaches the browser. */
export function publicQuiz(item: Item) {
  if (!item.quiz) return null;
  return {
    timeLimitMinutes: item.quiz.timeLimitMinutes,
    passPercent: item.quiz.passPercent,
    questions: item.quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options })),
  };
}

export const lms = {
  /** POST /v1/lms/enrollments — checked against Entitlements. */
  enroll(userId: string, productId: string, level: "audit" | "full"): Enrollment[] {
    const product = catalog.get(productId);
    if (!product) throw new PlatformError("not_found", "Product not found", 404);
    if (level === "audit") {
      if (!product.freeToAudit) throw new PlatformError("audit_unavailable", "This program can't be audited. Choose a paid option or apply for financial aid.");
      const has = entitlements.check(userId, "content.view", productId);
      if (!has.allow) entitlements.grant({ userId, resource: { kind: "product", id: productId }, level: "audit", source: "audit_enrollment" });
    } else {
      const d = entitlements.check(userId, "item.graded", productId);
      if (!d.allow) throw new PlatformError(d.reason ?? "needs_upgrade", "A paid option or approved financial aid is needed for full access.", 403);
    }
    const db = getDb();
    const courseIds = product.courseIds.length ? product.courseIds : [product.id];
    const out: Enrollment[] = [];
    for (const courseId of courseIds) {
      let e = db.enrollments.find((x) => x.userId === userId && x.courseId === courseId);
      if (!e) {
        e = { id: newId("enr"), userId, productId, courseId, level, createdAt: nowIso(), deadlineAnchor: nowIso() };
        db.enrollments.push(e);
        publish("lms.enrollment.created", "lms", `user/${userId}`, { userId, enrollmentId: e.id, courseId, productId, level });
      } else if (e.level === "audit" && level === "full") {
        e.level = "full";
      }
      out.push(e);
    }
    save();
    return out;
  },

  enrollmentsFor(userId: string): Enrollment[] {
    return getDb().enrollments.filter((e) => e.userId === userId);
  },

  enrollment(userId: string, courseId: string): Enrollment | undefined {
    return getDb().enrollments.find((e) => e.userId === userId && e.courseId === courseId);
  },

  /** Effective access level right now (entitlements can lapse after enrollment). */
  accessLevel(userId: string, courseId: string): "full" | "audit" | "none" {
    if (entitlements.check(userId, "item.graded", courseId).allow) return "full";
    if (entitlements.check(userId, "content.view", courseId).allow) return "audit";
    return "none";
  },

  itemStatus(userId: string, itemId: string): "completed" | "started" | "none" {
    const p = getDb().progress.find((x) => x.userId === userId && x.itemId === itemId);
    return p?.status ?? "none";
  },

  /** POST /v1/lms/progress — xAPI-style statements. */
  recordProgress(userId: string, itemId: string, status: "started" | "completed", resumeSec?: number): void {
    const db = getDb();
    const item = catalog.item(itemId);
    if (!item) throw new PlatformError("not_found", "Item not found", 404);
    let p = db.progress.find((x) => x.userId === userId && x.itemId === itemId);
    if (!p) {
      p = { userId, itemId, status, updatedAt: nowIso(), resumeSec };
      db.progress.push(p);
    } else {
      if (p.status !== "completed") p.status = status;
      p.updatedAt = nowIso();
      if (resumeSec !== undefined) p.resumeSec = resumeSec;
    }
    const enr = this.enrollment(userId, item.courseId);
    if (enr) enr.lastItemId = itemId;
    if (status === "completed") publish("lms.item.completed", "lms", `user/${userId}`, { userId, itemId, courseId: item.courseId });
    save();
  },

  courseProgress(userId: string, courseId: string): { percent: number; currentModule: number; totalModules: number; nextItem: Item | null } {
    const items = catalog.items(courseId).filter((i) => i.kind !== "capstone" && !(i.kind === "discussion" && i.graded));
    const done = items.filter((i) => this.itemStatus(userId, i.id) === "completed");
    const percent = items.length ? Math.round((done.length / items.length) * 100) : 0;
    const next = items.find((i) => this.itemStatus(userId, i.id) !== "completed") ?? null;
    return { percent, currentModule: next?.moduleNo ?? catalog.modules(courseId).length, totalModules: catalog.modules(courseId).length, nextItem: next };
  },

  dueDate(userId: string, item: Item): string | null {
    const e = this.enrollment(userId, item.courseId);
    if (!e || item.dueOffsetDays === undefined) return null;
    const d = new Date(Date.parse(e.deadlineAnchor) + item.dueOffsetDays * DAY);
    d.setUTCHours(3, 59, 0, 0); // 11:59 PM America/New_York (EDT)
    return d.toISOString();
  },

  /** Self-paced deadline reset, no penalty: shift the schedule so the current module is due next week. */
  resetDeadlines(userId: string, courseId: string): Enrollment {
    const e = this.enrollment(userId, courseId);
    if (!e) throw new PlatformError("not_enrolled", "You're not enrolled in this course.", 404);
    const { currentModule } = this.courseProgress(userId, courseId);
    e.deadlineAnchor = addDays(nowIso(), -(currentModule - 1) * 7);
    publish("lms.deadlines.reset", "lms", `user/${userId}`, { userId, courseId });
    save();
    return e;
  },

  /* ---------------- Quizzes ---------------- */

  startAttempt(userId: string, itemId: string): Attempt {
    const item = catalog.item(itemId);
    if (!item?.quiz) throw new PlatformError("not_found", "Quiz not found", 404);
    const d = entitlements.check(userId, "item.graded", item.courseId);
    if (!d.allow) throw new PlatformError(d.reason ?? "needs_upgrade", "Graded quizzes need full access.", 403);
    const db = getDb();
    const open = db.attempts.find((a) => a.userId === userId && a.itemId === itemId && !a.submittedAt);
    if (open) return open;
    const a: Attempt = { id: newId("att"), userId, itemId, answers: {}, startedAt: nowIso() };
    db.attempts.push(a);
    this.recordProgress(userId, itemId, "started");
    save();
    return a;
  },

  /** Autosave (every 15 s from the player). */
  saveAnswers(userId: string, attemptId: string, answers: Record<string, string>): Attempt {
    const a = getDb().attempts.find((x) => x.id === attemptId && x.userId === userId);
    if (!a) throw new PlatformError("not_found", "Attempt not found", 404);
    if (a.submittedAt) throw new PlatformError("already_submitted", "This attempt was already submitted.", 409);
    a.answers = { ...a.answers, ...answers };
    save();
    return a;
  },

  submitAttempt(userId: string, attemptId: string, answers?: Record<string, string>) {
    const a = getDb().attempts.find((x) => x.id === attemptId && x.userId === userId);
    if (!a) throw new PlatformError("not_found", "Attempt not found", 404);
    if (a.submittedAt) throw new PlatformError("already_submitted", "This attempt was already submitted.", 409);
    if (answers) a.answers = { ...a.answers, ...answers };
    const item = catalog.item(a.itemId)!;
    const qs = item.quiz!.questions;
    const correct = qs.filter((q) => a.answers[q.id] === q.answer).length;
    a.submittedAt = nowIso();
    a.score = correct;
    a.max = qs.length;
    this.postGrade({ userId, itemId: item.id, score: correct, max: qs.length, source: "quiz" });
    this.recordProgress(userId, item.id, "completed");
    return {
      attempt: a,
      percent: Math.round((correct / qs.length) * 100),
      passed: (correct / qs.length) * 100 >= item.quiz!.passPercent,
      review: qs.map((q) => ({ id: q.id, correct: a.answers[q.id] === q.answer, chosen: a.answers[q.id] ?? null, answer: q.answer, explanation: q.explanation })),
    };
  },

  attemptsFor(userId: string, itemId: string): Attempt[] {
    return getDb().attempts.filter((a) => a.userId === userId && a.itemId === itemId);
  },

  /* ---------------- Projects ---------------- */

  submitProject(userId: string, itemId: string, text: string, fileName?: string, upload?: { name: string; type: string; bytes: Buffer }, url?: string): Submission {
    const item = catalog.item(itemId);
    if (!item?.project) throw new PlatformError("not_found", "Project not found", 404);
    const d = entitlements.check(userId, "item.graded", item.courseId);
    if (!d.allow) throw new PlatformError(d.reason ?? "needs_upgrade", "Projects need full access.", 403);
    if (text.trim().length < 20) throw new PlatformError("too_short", "Add a short description of your submission (at least 20 characters).");
    let file: Submission["file"];
    if (upload && upload.bytes.length) {
      const ext = upload.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SITE_FORMATS.includes(ext)) throw new PlatformError("type_not_allowed", `Accepted files: ${SITE_FORMATS.map((x) => `.${x}`).join(", ")}.`, 422);
      if (upload.bytes.length > 10 * 1024 * 1024) throw new PlatformError("too_large", "Files must be under 10 MB.", 413);
      if (upload.bytes.subarray(0, 2).toString("latin1") === "MZ") throw new PlatformError("blocked", "Executable files can't be uploaded.", 422);
      if (ext === "pdf" && upload.bytes.subarray(0, 4).toString("latin1") !== "%PDF") throw new PlatformError("blocked", "That file isn't a real PDF.", 422);
      file = { name: upload.name.slice(0, 200), type: upload.type || "application/octet-stream", size: upload.bytes.length, sha256: createHash("sha256").update(upload.bytes).digest("hex"), dataB64: upload.bytes.toString("base64") };
    }
    if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new PlatformError("invalid", "Use a full https:// link (Google Colab, Codelab, GitHub or a shared document).", 422);
    const s: Submission = { id: newId("sbm"), userId, itemId, text: text.trim(), fileName: file?.name ?? fileName, ...(file ? { file } : {}), ...(url ? { url } : {}), createdAt: nowIso(), status: "submitted" };
    getDb().submissions.push(s);
    this.recordProgress(userId, itemId, "completed");
    publish("lms.submission.created", "lms", `user/${userId}`, { userId, itemId, submissionId: s.id });
    save();
    return s;
  },

  submissionsFor(userId: string, itemId?: string): Submission[] {
    return getDb().submissions.filter((s) => s.userId === userId && (!itemId || s.itemId === itemId));
  },

  /** Staff grading queue: instructor-graded work, plus peer-reviewed work whose reviews disagreed. */
  pendingSubmissions(): Submission[] {
    return getDb().submissions.filter((s) => s.status === "submitted" && (!catalog.item(s.itemId)?.project?.peerReview || s.needsStaff));
  },

  /* ---------------- Peer review ---------------- */

  latestSubmission(userId: string, itemId: string): Submission | undefined {
    return this.submissionsFor(userId, itemId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },

  /** Next classmate submission to review: fewest reviews first, never your own or one you've reviewed. */
  reviewQueue(userId: string, itemId: string): { next: Submission | null; available: number } {
    const item = catalog.item(itemId);
    if (!item?.project?.peerReview) return { next: null, available: 0 };
    if (!this.latestSubmission(userId, itemId)) return { next: null, available: 0 };
    const db = getDb();
    const latestByAuthor = new Map<string, Submission>();
    for (const s of db.submissions.filter((x) => x.itemId === itemId && x.userId !== userId)) {
      const cur = latestByAuthor.get(s.userId);
      if (!cur || s.createdAt > cur.createdAt) latestByAuthor.set(s.userId, s);
    }
    const reviewedAuthors = new Set(db.peerReviews.filter((r) => r.reviewerId === userId && r.itemId === itemId).map((r) => db.submissions.find((s) => s.id === r.submissionId)?.userId));
    const candidates = [...latestByAuthor.values()]
      .filter((s) => !reviewedAuthors.has(s.userId))
      .map((s) => ({ s, n: db.peerReviews.filter((r) => r.submissionId === s.id).length }))
      .sort((a, b) => a.n - b.n || a.s.createdAt.localeCompare(b.s.createdAt));
    return { next: candidates[0]?.s ?? null, available: candidates.length };
  },

  submitPeerReview(input: { reviewerId: string; submissionId: string; scores: Record<string, number>; comment: string }) {
    const db = getDb();
    const sub = db.submissions.find((s) => s.id === input.submissionId);
    if (!sub) throw new PlatformError("not_found", "Submission not found", 404);
    const item = catalog.item(sub.itemId);
    if (!item?.project?.peerReview) throw new PlatformError("not_peer_reviewed", "This project isn't peer reviewed.");
    if (sub.userId === input.reviewerId) throw new PlatformError("own_submission", "You can't review your own work.");
    if (!entitlements.check(input.reviewerId, "item.graded", item.courseId).allow) throw new PlatformError("needs_upgrade", "Peer review needs full access.", 403);
    if (!this.latestSubmission(input.reviewerId, item.id)) throw new PlatformError("submit_first", "Submit your own project before reviewing classmates.");
    if (db.peerReviews.some((r) => r.reviewerId === input.reviewerId && db.submissions.find((s) => s.id === r.submissionId)?.userId === sub.userId && r.itemId === item.id)) {
      throw new PlatformError("already_reviewed", "You've already reviewed this classmate's work.", 409);
    }
    const scores: Record<string, number> = {};
    let total = 0;
    for (const c of item.project.rubric) {
      const v = Math.round(Number(input.scores[c.criterion]));
      if (!Number.isFinite(v) || v < 0 || v > c.points) throw new PlatformError("invalid_score", `Score "${c.criterion}" from 0 to ${c.points}.`);
      scores[c.criterion] = v;
      total += v;
    }
    const comment = input.comment.trim();
    if (comment.length < 20) throw new PlatformError("comment_required", "Add at least a sentence of feedback (20 characters or more).");
    const max = item.project.rubric.reduce((a, c) => a + c.points, 0);
    const review = { id: newId("prv"), submissionId: sub.id, itemId: item.id, reviewerId: input.reviewerId, scores, total, max, comment, createdAt: nowIso() };
    db.peerReviews.push(review);
    publish("lms.peer_review.created", "lms", `user/${input.reviewerId}`, { reviewerId: input.reviewerId, submissionId: sub.id, itemId: item.id });
    this.finalizePeerGrade(sub);
    const own = this.latestSubmission(input.reviewerId, item.id);
    if (own) this.finalizePeerGrade(own);
    save();
    return review;
  },

  /**
   * A peer grade posts once the work has `required` reviews and its author has given
   * `required` reviews. Calibration: if reviewers disagree by more than 25% of the
   * maximum, course staff grade it instead.
   */
  finalizePeerGrade(sub: Submission): void {
    const item = catalog.item(sub.itemId);
    const req = item?.project?.peerReview?.required;
    if (!item || !req || sub.status === "graded" || sub.needsStaff) return;
    if (this.latestSubmission(sub.userId, sub.itemId)?.id !== sub.id) return;
    const db = getDb();
    const received = db.peerReviews.filter((r) => r.submissionId === sub.id);
    const given = db.peerReviews.filter((r) => r.reviewerId === sub.userId && r.itemId === sub.itemId).length;
    if (received.length < req || given < req) return;
    const max = received[0].max;
    const totals = received.map((r) => r.total);
    if (Math.max(...totals) - Math.min(...totals) > 0.25 * max) {
      sub.needsStaff = true;
      publish("lms.peer_review.disputed", "lms", `user/${sub.userId}`, { userId: sub.userId, submissionId: sub.id, itemId: sub.itemId });
      save();
      return;
    }
    const score = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    sub.status = "graded";
    sub.score = score;
    sub.max = max;
    sub.feedback = received.map((r, i) => `Reviewer ${i + 1}: ${r.comment}`).join("\n");
    this.postGrade({ userId: sub.userId, itemId: sub.itemId, score, max, source: "peer", feedback: sub.feedback });
  },

  peerStatus(userId: string, itemId: string) {
    const item = catalog.item(itemId);
    const required = item?.project?.peerReview?.required ?? 0;
    const db = getDb();
    const own = this.latestSubmission(userId, itemId);
    const received = own ? db.peerReviews.filter((r) => r.submissionId === own.id) : [];
    return {
      required,
      given: db.peerReviews.filter((r) => r.reviewerId === userId && r.itemId === itemId).length,
      received: received.map((r) => ({ total: r.total, max: r.max, comment: r.comment, scores: r.scores })),
      needsStaff: !!own?.needsStaff,
    };
  },

  peerReviewsOf(submissionId: string) {
    return getDb().peerReviews.filter((r) => r.submissionId === submissionId);
  },

  gradeSubmission(submissionId: string, score: number, max: number, feedback: string): Submission {
    const s = getDb().submissions.find((x) => x.id === submissionId);
    if (!s) throw new PlatformError("not_found", "Submission not found", 404);
    s.status = "graded";
    s.score = score;
    s.max = max;
    s.feedback = feedback;
    s.needsStaff = false;
    this.postGrade({ userId: s.userId, itemId: s.itemId, score, max, source: "instructor", feedback });
    return s;
  },

  /* ---------------- Grades ---------------- */

  postGrade(g: Omit<GradeRecord, "postedAt">): GradeRecord {
    const db = getDb();
    const rec: GradeRecord = { ...g, postedAt: nowIso() };
    const existing = db.grades.findIndex((x) => x.userId === g.userId && x.itemId === g.itemId);
    // Keep the best score (multiple attempts allowed on self-paced work).
    if (existing >= 0) {
      const old = db.grades[existing];
      if (old.score / old.max <= g.score / g.max) db.grades[existing] = rec;
    } else db.grades.push(rec);
    const item = catalog.item(g.itemId);
    publish("lms.grade.posted", "lms", `user/${g.userId}`, { userId: g.userId, itemId: g.itemId, courseId: item?.courseId, score: g.score, max: g.max });
    if (item) this.checkCompletion(g.userId, item.courseId);
    save();
    return rec;
  },

  grade(userId: string, itemId: string): GradeRecord | undefined {
    return getDb().grades.find((g) => g.userId === userId && g.itemId === itemId);
  },

  gradebook(userId: string, courseId: string): { rows: GradebookRow[]; current: number | null; letter: string | null; passPercent: number; allGraded: boolean } {
    const access = this.accessLevel(userId, courseId);
    const items = catalog.items(courseId).filter((i) => i.graded);
    const db = getDb();
    const rows: GradebookRow[] = items.map((i) => {
      const g = this.grade(userId, i.id);
      const submitted = db.submissions.some((s) => s.userId === userId && s.itemId === i.id && s.status === "submitted");
      const started = this.itemStatus(userId, i.id) === "started" || db.labSessions.some((l) => l.userId === userId && l.itemId === i.id);
      const status: GradebookStatus = access !== "full" ? "Locked" : g ? "Graded" : submitted ? "Submitted" : started ? "In Progress" : "Not Started";
      return { item: { id: i.id, title: i.title, kind: i.kind, moduleNo: i.moduleNo, weight: i.weight }, type: typeLabel(i), due: this.dueDate(userId, i), status, score: g?.score ?? null, max: g?.max ?? null };
    });
    const graded = rows.filter((r) => r.status === "Graded");
    const w = graded.reduce((s, r) => s + r.item.weight, 0);
    const current = w ? Math.round((graded.reduce((s, r) => s + (r.score! / r.max!) * r.item.weight, 0) / w) * 1000) / 10 : null;
    return { rows, current, letter: current === null ? null : letter(current), passPercent: PASS_PERCENT, allGraded: rows.length > 0 && graded.length === rows.length };
  },

  /** Emits lms.course.passed / lms.program.completed exactly once per learner. */
  checkCompletion(userId: string, courseId: string): void {
    const db = getDb();
    const gb = this.gradebook(userId, courseId);
    if (!gb.allGraded || gb.current === null || gb.current < PASS_PERCENT) return;
    const already = db.events.some((e) => e.type === "lms.course.passed" && e.data.userId === userId && e.data.courseId === courseId);
    if (already) return;
    publish("lms.course.passed", "lms", `user/${userId}`, { userId, courseId, grade: gb.current });
    for (const prog of db.products.filter((p) => p.id !== courseId && p.courseIds.includes(courseId))) {
      const allPassed = prog.courseIds.every((cid) => db.events.some((e) => e.type === "lms.course.passed" && e.data.userId === userId && e.data.courseId === cid));
      const done = db.events.some((e) => e.type === "lms.program.completed" && e.data.userId === userId && e.data.productId === prog.id);
      const enrolled = db.enrollments.some((e) => e.userId === userId && e.productId === prog.id) || entitlements.check(userId, "credential.earn", prog.id).allow;
      if (allPassed && !done && enrolled) publish("lms.program.completed", "lms", `user/${userId}`, { userId, productId: prog.id });
    }
  },

  /* ---------------- Dashboard ---------------- */

  dashboard(userId: string) {
    const db = getDb();
    const enrolls = this.enrollmentsFor(userId);
    const courses = enrolls
      .map((e) => {
        const course = catalog.get(e.courseId);
        if (!course) return null;
        return { enrollment: e, course, progress: this.courseProgress(userId, e.courseId), access: this.accessLevel(userId, e.courseId) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const horizon = addDays(nowIso(), 21);
    const deadlines = courses
      .filter((c) => c.access === "full")
      .flatMap((c) =>
        catalog
          .items(c.course.id)
          .filter((i) => (i.graded || i.kind === "discussion") && !this.grade(userId, i.id) && this.itemStatus(userId, i.id) !== "completed")
          .map((i) => ({ item: i, course: c.course, due: this.dueDate(userId, i) })),
      )
      .filter((d) => d.due && d.due >= addDays(nowIso(), -3) && d.due <= horizon)
      .sort((a, b) => a.due!.localeCompare(b.due!))
      .slice(0, 6);

    const labsInProgress = db.labSessions.filter((l) => l.userId === userId && !this.grade(userId, l.itemId)).length;
    const credentialProducts = new Set<string>();
    for (const e of enrolls) credentialProducts.add(e.productId);
    const issued = new Set(db.credentials.filter((c) => c.userId === userId).map((c) => c.productId));
    const credentialsInProgress = [...credentialProducts].filter((p) => !issued.has(p) && courses.some((c) => c.enrollment.productId === p && c.access === "full")).length;

    return {
      courses,
      stats: {
        activeCourses: courses.length,
        assignmentsDue: deadlines.filter((d) => d.item.graded).length,
        labsInProgress,
        credentialsInProgress,
      },
      deadlines,
    };
  },

  /** Scheduler: deadline reminders for items due within 48 hours (sent once). */
  tick(): number {
    const db = getDb();
    let n = 0;
    const soon = new Date(now().getTime() + 2 * DAY).toISOString();
    for (const e of db.enrollments) {
      if (this.accessLevel(e.userId, e.courseId) !== "full") continue;
      for (const i of catalog.items(e.courseId).filter((x) => x.graded)) {
        const due = this.dueDate(e.userId, i);
        if (!due || due < nowIso() || due > soon || this.grade(e.userId, i.id)) continue;
        const key = `deadline:${e.userId}:${i.id}:${due}`;
        if (db.processed.includes(key)) continue;
        db.processed.push(key);
        publish("lms.deadline.approaching", "lms", `user/${e.userId}`, { userId: e.userId, itemId: i.id, courseId: i.courseId, due });
        n++;
      }
    }
    save();
    return n;
  },

  productsWithProgress(userId: string): Product[] {
    return [...new Set(this.enrollmentsFor(userId).map((e) => e.productId))].map((id) => catalog.get(id)).filter((p): p is Product => !!p);
  },
};

/** Files accepted for project and lab submissions on the site. */
export const SITE_FORMATS = ["docx", "doc", "xlsx", "xls", "pptx", "pdf", "ipynb", "py", "r", "sql", "csv", "json", "md", "txt", "zip", "png", "jpg"];
