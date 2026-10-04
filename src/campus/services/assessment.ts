import { CampusError, hmac, nowIso, nowMs, type Row, type TenantStore } from "../core";
import { registerHooks } from "../entity";
import { hasAny, type Actor } from "../iam";
import { activeStudents, audit, isGrader, isStaff, notify, requireCourse, toMs, userName } from "./common";
import { assertAccessible, effectiveDates, groupIdsOf } from "./curriculum";
import { dueFor, setGrade } from "./grading";

/**
 * Assessment: submissions (all modes, allowlists, attempts, groups, scanned files),
 * peer review assignment, and the quiz engine (publication snapshots, reproducible
 * seeded selection, accommodations, access controls, autosave with versions, idempotent
 * submit, auto-grading for objective items, manual queue, moderation, regrade, analysis).
 */

const SEED_KEY = process.env.CAMPUS_SIGNING_KEY ?? "campus-quiz-seed";

/* ---------------- Submissions ---------------- */

export type SubmissionMode = "text" | "file" | "url" | "media" | "annotation" | "lti" | "on_paper" | "none";

export function submit(store: TenantStore, a: Actor, assignmentId: string, input: { mode: SubmissionMode; body?: string; url?: string; fileId?: string; mediaUrl?: string; offline?: boolean }) {
  const asg = store.get("assignments", assignmentId);
  if (!asg || asg.state !== "published") throw new CampusError("not_found", "Assignment not found", 404);
  const courseId = asg.courseId as string;
  if (!hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "Only students in this course can submit.", 403);
  assertAccessible(store, a, "assignment", asg.id);
  const dates = effectiveDates(store, asg, a.id);
  if (!dates.assigned) throw new CampusError("not_assigned", "This assignment isn't assigned to you.", 403);
  const now = nowIso();
  if (dates.unlockAt && dates.unlockAt > now) throw new CampusError("not_open", "This assignment isn't open yet.", 423);
  if (dates.lockAt && dates.lockAt < now) throw new CampusError("closed", "This assignment is closed.", 423);
  const types = ((asg.submissionTypes as string[]) ?? ["text"]).map((t) => (t === "online_text" ? "text" : t));
  if (input.mode === "on_paper" || input.mode === "none" || !types.includes(input.mode)) throw new CampusError("mode_not_allowed", `This assignment accepts: ${types.join(", ")}.`, 422);
  if (input.mode === "text" && !(input.body ?? "").trim()) throw new CampusError("invalid", "Write your answer before submitting.", 422);
  if (input.mode === "url" && !/^https?:\/\//.test(input.url ?? "")) throw new CampusError("invalid", "Enter a full web address (https://…).", 422);
  if (input.mode === "media" && !/^(https?:\/\/|\/api\/campus\/)/.test(input.mediaUrl ?? "")) throw new CampusError("invalid", "Record or upload media first.", 422);
  if (input.mode === "file" || input.mode === "annotation") {
    const f = input.fileId ? store.get("files", input.fileId) : undefined;
    if (input.mode === "file") {
      if (!f || f.ownerId !== a.id) throw new CampusError("invalid", "Upload your file first.", 422);
      if (f.state === "quarantined" || f.state === "pending_upload") throw new CampusError("not_ready", "Your file is still being scanned. Try again in a moment.", 409);
      if (f.state !== "available") throw new CampusError("blocked", "Your file didn't pass the safety scan.", 422);
      const allowed = (asg.allowedExtensions as string[]) ?? [];
      const ext = String(f.name).split(".").pop()?.toLowerCase() ?? "";
      if (allowed.length && !allowed.map((x) => x.toLowerCase().replace(/^\./, "")).includes(ext)) throw new CampusError("type_not_allowed", `Allowed file types: ${allowed.join(", ")}.`, 422);
    }
    if (input.mode === "annotation" && !asg.annotationFileId) throw new CampusError("invalid", "This assignment has no document to annotate.", 422);
  }
  // Group assignment: one submission for the whole group.
  let groupId: string | null = null;
  let members = [a.id];
  if (asg.groupSetId) {
    const g = store.list("groups", (g) => g.setId === asg.groupSetId && ((g.memberIds as string[]) ?? []).includes(a.id))[0];
    if (!g) throw new CampusError("no_group", "Join a group before submitting this group assignment.", 409);
    groupId = g.id;
    members = (g.memberIds as string[]) ?? [a.id];
  }
  const prior = store.list("submissions", (s) => s.assignmentId === assignmentId && (groupId ? s.groupId === groupId : s.userId === a.id));
  const allowed = asg.attempts ? Number(asg.attempts) : Infinity;
  if (prior.length >= allowed) throw new CampusError("attempts_used", `You've used all ${allowed} attempt(s).`, 409);
  const due = dueFor(store, asg, a.id);
  return store.tx(() => {
    const s = store.insert("submissions", { assignmentId, userId: a.id, courseId, mode: input.mode, body: input.mode === "text" ? input.body : null, url: input.url ?? input.mediaUrl ?? null, fileId: input.mode === "annotation" ? asg.annotationFileId : (input.fileId ?? null), attempt: prior.length + 1, state: "submitted", late: !!due && now > due, groupId, groupMemberIds: members, offline: !!input.offline }, "sub");
    store.emit("submissions.created", `submissions/${s.id}`, { submissionId: s.id, assignmentId, courseId, userId: a.id, late: s.late, attempt: s.attempt });
    audit(store, a, "submissions.create", `submissions/${s.id}`);
    return s;
  });
}

export function mySubmissions(store: TenantStore, a: Actor, assignmentId: string) {
  return store.list("submissions", (s) => s.assignmentId === assignmentId && (s.userId === a.id || ((s.groupMemberIds as string[]) ?? []).includes(a.id))).sort((x, y) => Number(x.attempt) - Number(y.attempt));
}

/** Sequential grader queue: latest submission per student, filterable. */
export function graderQueue(store: TenantStore, a: Actor, assignmentId: string, f: { needsGrading?: boolean; sectionId?: string } = {}) {
  const asg = store.get("assignments", assignmentId) ?? store.get("quizzes", assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, asg.courseId as string, ["admin", "instructor", "ta"], "grader.queue");
  const anonymous = !!asg.anonymousGrading;
  return activeStudents(store, asg.courseId as string, f.sectionId)
    .map((e, i) => {
      const uid = e.userId as string;
      const subs = store.list("submissions", (s) => s.assignmentId === assignmentId && (s.userId === uid || ((s.groupMemberIds as string[]) ?? []).includes(uid))).sort((x, y) => Number(y.attempt) - Number(x.attempt));
      const g = store.list("grades", (x) => x.assignmentId === assignmentId && x.userId === uid)[0];
      return {
        userId: uid,
        display: anonymous ? `Student ${i + 1}` : userName(store, uid),
        anonymous,
        submission: subs[0] ?? null,
        attempts: subs.length,
        grade: g ? { id: g.id, score: g.score, version: g.version, posted: !!g.posted, status: g.status, excused: !!g.excused, provisional: g.provisional ?? [] } : null,
        needsGrading: !!subs[0] && (!g || g.score === null || g.score === undefined || toMs(subs[0].createdAt) > toMs(g.updatedAt)),
        resubmitted: subs.length > 1 && !!g && toMs(subs[0].createdAt) > toMs(g.updatedAt),
      };
    })
    .filter((r) => !f.needsGrading || r.needsGrading);
}

/* ---------------- Peer review ---------------- */

export function assignPeerReviews(store: TenantStore, a: Actor, assignmentId: string, manual?: { reviewerId: string; submissionId: string }[]) {
  const asg = store.get("assignments", assignmentId);
  if (!asg) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, asg.courseId as string, ["admin", "instructor", "ta"], "peer_reviews.assign");
  const n = Number(asg.peerReviews ?? 0);
  if (!n && !manual) throw new CampusError("not_enabled", "Peer reviews aren't on for this assignment.", 409);
  return store.tx(() => {
    const made: Row[] = [];
    const exists = (r: string, s: string) => store.list("peer_reviews", (p) => p.reviewerId === r && p.submissionId === s).length > 0;
    if (manual) {
      for (const m of manual) {
        const sub = store.get("submissions", m.submissionId);
        if (!sub || sub.assignmentId !== assignmentId) throw new CampusError("invalid", "Submission isn't for this assignment.", 422);
        if (sub.userId === m.reviewerId || ((sub.groupMemberIds as string[]) ?? []).includes(m.reviewerId)) throw new CampusError("invalid", "Students can't review their own work.", 422);
        if (!exists(m.reviewerId, m.submissionId)) made.push(store.insert("peer_reviews", { assignmentId, submissionId: m.submissionId, reviewerId: m.reviewerId, courseId: asg.courseId, state: "assigned", dueAt: asg.peerReviewsDueAt ?? null, anonymous: !!asg.peerReviewAnonymous }, "prv"));
      }
    } else {
      const latest = new Map<string, Row>();
      for (const s of store.list("submissions", (s) => s.assignmentId === assignmentId)) {
        const key = (s.groupId as string) ?? (s.userId as string);
        if (!latest.has(key) || Number(s.attempt) > Number(latest.get(key)!.attempt)) latest.set(key, s);
      }
      const subs = [...latest.values()];
      subs.forEach((s, i) => {
        for (let k = 1; k <= Math.min(n, subs.length - 1); k++) {
          const target = subs[(i + k) % subs.length];
          if (target.userId === s.userId || ((target.groupMemberIds as string[]) ?? []).includes(s.userId as string)) continue;
          if (!exists(s.userId as string, target.id)) made.push(store.insert("peer_reviews", { assignmentId, submissionId: target.id, reviewerId: s.userId, courseId: asg.courseId, state: "assigned", dueAt: asg.peerReviewsDueAt ?? null, anonymous: !!asg.peerReviewAnonymous }, "prv"));
        }
      });
    }
    notify(store, [...new Set(made.map((m) => m.reviewerId as string))], "peer_reviews", `Peer reviews assigned: ${asg.title}`, "You have classmates' work to review.", `/campus/{tenant}/courses/${asg.courseId}/assignments/${asg.id}`, asg.courseId as string);
    audit(store, a, "peer_reviews.assign", `assignments/${assignmentId}`, String(made.length));
    return made;
  });
}

export function completePeerReview(store: TenantStore, a: Actor, reviewId: string, comments: string, rubric?: Record<string, number>) {
  const r = store.get("peer_reviews", reviewId);
  if (!r || r.reviewerId !== a.id) throw new CampusError("not_found", "Review not found", 404);
  if (r.state === "completed") throw new CampusError("already", "You already completed this review.", 409);
  if (comments.trim().length < 20) throw new CampusError("invalid", "Write at least a couple of sentences of feedback.", 422);
  return store.tx(() => {
    const out = store.update("peer_reviews", reviewId, { state: "completed", comments, rubric: rubric ?? null, completedAt: nowIso() });
    store.emit("peer_reviews.completed", `peer_reviews/${reviewId}`, { reviewId, courseId: r.courseId });
    return out;
  });
}

/** What a student sees for peer reviews assigned to them (anonymized if required). */
export function myPeerReviews(store: TenantStore, a: Actor, assignmentId: string) {
  return store.list("peer_reviews", (p) => p.assignmentId === assignmentId && p.reviewerId === a.id).map((p) => {
    const s = store.get("submissions", p.submissionId as string)!;
    return { id: p.id, state: p.state, dueAt: p.dueAt, author: p.anonymous ? "Anonymous classmate" : userName(store, s.userId as string), submission: { mode: s.mode, body: s.body, url: s.url, fileId: s.fileId } };
  });
}

/* ---------------- Quizzes ---------------- */

interface QSnap {
  id: string;
  kind: string;
  prompt: string;
  choices: string[];
  answer: string | null;
  points: number;
  config: Record<string, unknown> | null;
  tags: string[];
  bankId: string;
  stimulusId?: string | null;
  outcomeId?: string | null;
}

function poolQuestions(store: TenantStore, quiz: Row): { pools: { ids: string[]; pick: number }[]; all: QSnap[] } {
  const pools = ((quiz.pools as { bankId: string; tag?: string; pick: number }[]) ?? []).length ? (quiz.pools as { bankId: string; tag?: string; pick: number }[]) : quiz.bankId ? [{ bankId: quiz.bankId as string, pick: Number(quiz.questionCount) }] : [];
  const all: QSnap[] = [];
  const out: { ids: string[]; pick: number }[] = [];
  for (const p of pools) {
    const qs = store.list("questions", (q) => q.bankId === p.bankId && (!p.tag || ((q.tags as string[]) ?? []).includes(p.tag)));
    for (const q of qs) if (!all.some((x) => x.id === q.id)) all.push({ id: q.id, kind: q.kind as string, prompt: q.prompt as string, choices: (q.choices as string[]) ?? [], answer: (q.answer as string) ?? null, points: Number(q.points), config: (q.config as Record<string, unknown>) ?? null, tags: (q.tags as string[]) ?? [], bankId: q.bankId as string, stimulusId: (q.stimulusId as string) ?? null, outcomeId: (q.outcomeId as string) ?? null });
    out.push({ ids: qs.map((q) => q.id), pick: Number(p.pick) });
  }
  return { pools: out, all };
}

registerHooks("quizzes", {
  publishChecks(store, row) {
    const { pools } = poolQuestions(store, row);
    if (!pools.length) return ["Choose a question bank or random pools."];
    const issues = pools.filter((p) => p.ids.length < p.pick).map((p) => `A pool needs ${p.pick} questions but has ${p.ids.length}.`);
    return issues;
  },
  afterWrite(store, _a, row, op) {
    // Snapshot questions, scoring rules and settings at publication.
    if (op === "publish") {
      const { pools, all } = poolQuestions(store, row);
      store.update("quizzes", row.id, { snapshot: { at: nowIso(), version: Number((row.snapshot as { version?: number } | undefined)?.version ?? 0) + 1, pools, questions: all, timeLimitMin: row.timeLimitMin, allowedAttempts: row.allowedAttempts, scoringPolicy: row.scoringPolicy ?? "highest" } });
    }
  },
});

/** Deterministic PRNG from a secure per-attempt seed (HMAC), so selection is reproducible. */
function rng(seed: string) {
  let h = parseInt(seed.slice(0, 8), 16) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function accommodation(store: TenantStore, userId: string, courseId: string) {
  const acc = store.list("accommodations", (x) => x.userId === userId && (!x.courseId || x.courseId === courseId) && (!x.expiresAt || String(x.expiresAt) >= nowIso().slice(0, 10)));
  const mult = acc.filter((x) => x.kind === "extra_time").reduce((m, x) => Math.max(m, Number(x.multiplier ?? 1)), 1);
  const extraMin = acc.filter((x) => x.kind === "extra_time").reduce((s, x) => s + Number(x.minutes ?? 0), 0);
  const extraAttempts = acc.filter((x) => x.kind === "extra_attempt").length;
  return { mult, extraMin, extraAttempts };
}

function quizDates(store: TenantStore, quiz: Row, userId: string) {
  return effectiveDates(store, { ...quiz, dueAt: quiz.availableUntil ?? quiz.dueAt, unlockAt: quiz.availableFrom, lockAt: quiz.availableUntil }, userId);
}

/** What a student sees: no answers, no config that reveals answers. */
function publicQuestion(q: QSnap, seed: string, shuffleAnswers: boolean) {
  const cfg = q.config ?? {};
  // Independent streams per question so answer shuffling never changes formula values.
  const r = rng(hmac(seed, `${q.id}:order`));
  const rv = rng(hmac(seed, `${q.id}:vars`));
  const base = { id: q.id, kind: q.kind, prompt: q.prompt, points: q.points, stimulusId: q.stimulusId ?? null };
  switch (q.kind) {
    case "multiple_choice":
    case "multiple_answer":
      return { ...base, choices: shuffleAnswers ? shuffle(q.choices, r) : q.choices };
    case "true_false":
      return { ...base, choices: ["True", "False"] };
    case "matching": {
      const pairs = (cfg.pairs as [string, string][]) ?? [];
      return { ...base, left: pairs.map((p) => p[0]), right: shuffle(pairs.map((p) => p[1]), r) };
    }
    case "ordering":
      return { ...base, items: shuffle((cfg.order as string[]) ?? [], r) };
    case "categorization": {
      const cats = (cfg.categories as Record<string, string[]>) ?? {};
      return { ...base, categories: Object.keys(cats), items: shuffle(Object.values(cats).flat(), r) };
    }
    case "multi_blank":
      return { ...base, blanks: Object.keys((cfg.blanks as Record<string, string[]>) ?? {}) };
    case "formula": {
      const vars = (cfg.vars as Record<string, [number, number]>) ?? {};
      const values = Object.fromEntries(Object.entries(vars).map(([k, [lo, hi]]) => [k, Math.round(lo + rv() * (hi - lo))]));
      return { ...base, values };
    }
    case "hot_spot":
      return { ...base, image: cfg.image ?? null };
    default:
      return base;
  }
}

export function startAttempt(store: TenantStore, a: Actor, quizId: string, opts: { accessCode?: string; ip?: string } = {}) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz || quiz.state !== "published" || !quiz.snapshot) throw new CampusError("not_found", "Quiz not available", 404);
  const courseId = quiz.courseId as string;
  // Transactional start: availability, enrollment, attempt count, accommodations.
  if (!hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "Only enrolled students can take this quiz.", 403);
  assertAccessible(store, a, "quiz", quiz.id);
  const d = quizDates(store, quiz, a.id);
  if (!d.assigned) throw new CampusError("not_assigned", "This quiz isn't assigned to you.", 403);
  const now = nowIso();
  if (d.unlockAt && d.unlockAt > now) throw new CampusError("not_open", "This quiz isn't open yet.", 423);
  if (d.lockAt && d.lockAt < now) throw new CampusError("closed", "This quiz is closed.", 423);
  if (quiz.accessCode && opts.accessCode !== quiz.accessCode) throw new CampusError("access_code", "Enter the access code your instructor gave you.", 403);
  const ipf = (quiz.ipFilter as string[]) ?? [];
  if (ipf.length && !ipf.some((p) => (opts.ip ?? "").startsWith(p))) throw new CampusError("ip_blocked", "This quiz can only be taken from an approved location.", 403);
  const mine = store.list("attempts", (x) => x.quizId === quizId && x.userId === a.id);
  const open = mine.find((x) => x.state === "in_progress");
  if (open) return attemptView(store, a, open.id);
  const acc = accommodation(store, a.id, courseId);
  const extraMod = store.list("quiz_moderations", (m) => m.quizId === quizId && m.userId === a.id && m.kind === "extra_attempt").length;
  const allowed = Number(quiz.allowedAttempts ?? 1) + acc.extraAttempts + extraMod;
  if (mine.length >= allowed) throw new CampusError("attempts_used", `You've used all ${allowed} attempt(s).`, 409);
  const last = mine.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
  if (last && quiz.coolingMinutes && toMs(last.submittedAt) + Number(quiz.coolingMinutes) * 60_000 > nowMs()) throw new CampusError("cooling", `Wait ${quiz.coolingMinutes} minutes between attempts.`, 409);
  const snap = quiz.snapshot as { pools: { ids: string[]; pick: number }[]; questions: QSnap[]; version: number };
  const seed = hmac(SEED_KEY, `${store.tenantId}:${quizId}:${a.id}:${mine.length + 1}:v${snap.version}`);
  const r = rng(seed);
  let ids = snap.pools.flatMap((p) => shuffle(p.ids, r).slice(0, p.pick));
  if (quiz.shuffleQuestions) ids = shuffle(ids, r);
  const limit = Math.round(Number(quiz.timeLimitMin) * acc.mult + acc.extraMin);
  const deadlineMs = Math.min(nowMs() + limit * 60_000, d.lockAt ? toMs(d.lockAt) : Infinity);
  return store.tx(() => {
    const at = store.insert("attempts", { quizId, userId: a.id, courseId, seed, questionIds: ids, answers: {}, state: "in_progress", deadline: new Date(deadlineMs).toISOString(), timeLimitMin: limit, attemptNo: mine.length + 1, snapshotVersion: snap.version, locked: [] }, "att");
    store.emit("attempts.started", `attempts/${at.id}`, { attemptId: at.id, quizId, courseId, userId: a.id });
    return attemptView(store, a, at.id);
  });
}

export function attemptView(store: TenantStore, a: Actor, attemptId: string) {
  const at = store.get("attempts", attemptId);
  if (!at) throw new CampusError("not_found", "Attempt not found", 404);
  if (at.userId !== a.id && !isGrader(a, at.courseId as string)) throw new CampusError("forbidden", "Not your attempt.", 403);
  autoSubmitIfExpired(store, at);
  const quiz = store.get("quizzes", at.quizId as string)!;
  const snap = quiz.snapshot as { questions: QSnap[] };
  const seed = String(at.seed);
  const qs = (at.questionIds as string[]).map((id) => snap.questions.find((q) => q.id === id)!).filter(Boolean);
  const stimuli = [...new Set(qs.map((q) => q.stimulusId).filter(Boolean))].map((id) => snap.questions.find((q) => q.id === id) ?? store.get("questions", id as string)).filter(Boolean);
  const done = at.state !== "in_progress";
  const showCorrect = done && !!quiz.showCorrectAnswers && (!quiz.showCorrectAfter || String(quiz.showCorrectAfter) <= nowIso());
  return {
    attempt: { id: at.id, state: at.state, version: at.version, deadline: at.deadline, timeLimitMin: at.timeLimitMin, attemptNo: at.attemptNo, score: done && (quiz.showResponses !== false) ? at.score : null, answers: at.answers, locked: at.locked ?? [] },
    quiz: { id: quiz.id, title: quiz.title, oneAtATime: !!quiz.oneAtATime, lockAfterAnswer: !!quiz.lockAfterAnswer, calculator: quiz.calculator ?? "none", kind: quiz.kind ?? "graded" },
    questions: qs.map((q) => ({ ...publicQuestion(q, seed, !!quiz.shuffleAnswers), ...(showCorrect ? { correct: q.answer ?? q.config } : {}), ...(done && quiz.showResponses !== false ? { result: (at.results as Record<string, unknown> | undefined)?.[q.id] ?? null } : {}) })),
    stimuli: stimuli.map((s) => ({ id: (s as QSnap | Row).id, prompt: (s as QSnap).prompt })),
  };
}

export function autosave(store: TenantStore, a: Actor, attemptId: string, answers: Record<string, unknown>, version: number) {
  const at = store.get("attempts", attemptId);
  if (!at || at.userId !== a.id) throw new CampusError("not_found", "Attempt not found", 404);
  if (at.state !== "in_progress") throw new CampusError("submitted", "This attempt was already submitted.", 409);
  if (toMs(at.deadline) + 30_000 < nowMs()) {
    autoSubmitIfExpired(store, at);
    throw new CampusError("time_up", "Time is up. Your saved answers were submitted.", 409);
  }
  const quiz = store.get("quizzes", at.quizId as string)!;
  const locked = new Set((at.locked as string[]) ?? []);
  for (const k of Object.keys(answers)) {
    if (!(at.questionIds as string[]).includes(k)) throw new CampusError("invalid", "Answer for a question not in this attempt.", 422);
    if (locked.has(k)) throw new CampusError("locked", "That question is locked after answering.", 409);
  }
  return store.tx(() => {
    const merged = { ...(at.answers as Record<string, unknown>), ...answers };
    const newLocked = quiz.lockAfterAnswer ? [...new Set([...locked, ...Object.keys(answers)])] : [...locked];
    const out = store.update("attempts", attemptId, { answers: merged, locked: newLocked }, version);
    return { version: out.version, savedAt: out.updatedAt };
  });
}

/** Scores one answer; returns null for items needing a human. */
export function scoreQuestion(q: QSnap, ans: unknown, values?: Record<string, number>): number | null {
  const cfg = (q.config ?? {}) as Record<string, unknown>;
  const pts = q.points;
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  switch (q.kind) {
    case "multiple_choice":
    case "true_false":
      return norm(ans) === norm(q.answer) ? pts : 0;
    case "multiple_answer": {
      const correct = new Set(String(q.answer ?? "").split("|").map(norm));
      const given = new Set((Array.isArray(ans) ? ans : [ans]).map(norm));
      const right = [...given].filter((x) => correct.has(x)).length;
      const wrong = [...given].filter((x) => !correct.has(x)).length;
      return Math.max(0, Math.round(((right - wrong) / correct.size) * pts * 100) / 100);
    }
    case "fill_blank":
      return String(q.answer ?? "").split("|").map(norm).includes(norm(ans)) ? pts : 0;
    case "multi_blank": {
      const blanks = (cfg.blanks as Record<string, string[]>) ?? {};
      const keys = Object.keys(blanks);
      const given = (ans as Record<string, string>) ?? {};
      const right = keys.filter((k) => blanks[k].map(norm).includes(norm(given[k]))).length;
      return keys.length ? Math.round((right / keys.length) * pts * 100) / 100 : 0;
    }
    case "matching": {
      const pairs = (cfg.pairs as [string, string][]) ?? [];
      const given = (ans as Record<string, string>) ?? {};
      const right = pairs.filter(([l, rr]) => norm(given[l]) === norm(rr)).length;
      return pairs.length ? Math.round((right / pairs.length) * pts * 100) / 100 : 0;
    }
    case "ordering": {
      const order = (cfg.order as string[]) ?? [];
      return JSON.stringify((ans as string[]) ?? []) === JSON.stringify(order) ? pts : 0;
    }
    case "categorization": {
      const cats = (cfg.categories as Record<string, string[]>) ?? {};
      const given = (ans as Record<string, string>) ?? {};
      const items = Object.entries(cats).flatMap(([c, xs]) => xs.map((x) => [x, c] as const));
      const right = items.filter(([x, c]) => given[x] === c).length;
      return items.length ? Math.round((right / items.length) * pts * 100) / 100 : 0;
    }
    case "hot_spot": {
      const [x, y] = (ans as number[]) ?? [];
      const xr = cfg.x as number[];
      const yr = cfg.y as number[];
      return x >= xr[0] && x <= xr[1] && y >= yr[0] && y <= yr[1] ? pts : 0;
    }
    case "numeric": {
      const v = Number(ans);
      if (!Number.isFinite(v)) return 0;
      if (cfg.exact !== undefined) return Math.abs(v - Number(cfg.exact)) <= Number(cfg.margin ?? 0) ? pts : 0;
      if (cfg.min !== undefined) return v >= Number(cfg.min) && v <= Number(cfg.max) ? pts : 0;
      if (cfg.precision !== undefined) return Number(v.toPrecision(Number(cfg.precision))) === Number(Number(q.answer).toPrecision(Number(cfg.precision))) ? pts : 0;
      return v === Number(q.answer) ? pts : 0;
    }
    case "formula": {
      const expr = String(cfg.expr ?? "");
      const names = Object.keys(values ?? {});
      // Only digits, operators and the declared variables are allowed.
      if (!/^[a-z0-9+\-*/(). ]+$/i.test(expr) || (expr.match(/[a-z_]+/gi) ?? []).some((t) => !names.includes(t))) return 0;
      const fn = new Function(...Object.keys(values ?? {}), `return (${expr});`) as (...args: number[]) => number;
      const want = fn(...Object.values(values ?? {}));
      const p = Number(cfg.precision ?? 2);
      return Math.abs(Number(ans) - want) <= Math.pow(10, -p) / 2 + 1e-9 ? pts : 0;
    }
    case "text":
    case "stimulus":
      return 0;
    default:
      return null; // essay, file_upload
  }
}

function gradeAttempt(store: TenantStore, at: Row) {
  const quiz = store.get("quizzes", at.quizId as string)!;
  const snap = quiz.snapshot as { questions: QSnap[] };
  const results: Record<string, { points: number | null; max: number; manual: boolean }> = {};
  let total = 0;
  let manual = false;
  for (const id of at.questionIds as string[]) {
    const q = snap.questions.find((x) => x.id === id)!;
    const pub = publicQuestion(q, String(at.seed), false) as { values?: Record<string, number> };
    const s = scoreQuestion(q, (at.answers as Record<string, unknown>)[id], pub.values);
    if (s === null) manual = true;
    results[id] = { points: s, max: ["text", "stimulus"].includes(q.kind) ? 0 : q.points, manual: s === null };
    total += s ?? 0;
  }
  return { results, total: Math.round(total * 100) / 100, manual };
}

export function submitAttempt(store: TenantStore, a: Actor, attemptId: string) {
  const at = store.get("attempts", attemptId);
  if (!at || at.userId !== a.id) throw new CampusError("not_found", "Attempt not found", 404);
  if (at.state !== "in_progress") return { attempt: at, idempotent: true }; // idempotent submit
  return { attempt: finalizeAttempt(store, at), idempotent: false };
}

function finalizeAttempt(store: TenantStore, at: Row) {
  return store.tx(() => {
    const { results, total, manual } = gradeAttempt(store, at);
    const out = store.update("attempts", at.id, { state: manual ? "pending_review" : "graded", score: total, results, submittedAt: nowIso(), needsManual: manual });
    store.emit("attempts.submitted", `attempts/${at.id}`, { attemptId: at.id, quizId: at.quizId, courseId: at.courseId, userId: at.userId, needsManual: manual });
    if (!manual) postQuizScore(store, at.quizId as string, at.userId as string);
    return out;
  });
}

function autoSubmitIfExpired(store: TenantStore, at: Row) {
  if (at.state === "in_progress" && toMs(at.deadline) + 30_000 < nowMs()) finalizeAttempt(store, at);
}

/** Keep highest / latest / average across graded attempts, then write the grade. */
function postQuizScore(store: TenantStore, quizId: string, userId: string) {
  const quiz = store.get("quizzes", quizId)!;
  if ((quiz.kind ?? "graded") === "practice" || quiz.kind === "survey") return;
  const graded = store.list("attempts", (x) => x.quizId === quizId && x.userId === userId && x.state === "graded").sort((x, y) => String(x.submittedAt).localeCompare(String(y.submittedAt)));
  if (!graded.length) return;
  const scores = graded.map((g) => Number(g.score));
  const policy = (quiz.scoringPolicy as string) ?? "highest";
  let score = policy === "latest" ? scores[scores.length - 1] : policy === "average" ? scores.reduce((s, x) => s + x, 0) / scores.length : Math.max(...scores);
  if (quiz.kind === "graded_survey") score = Number(quiz.points ?? 0);
  setGrade(store, null, { assignmentId: quizId, userId, score: Math.round(score * 100) / 100, source: "quiz" });
}

/** Manual grading of essay / file items from the sequential grader. */
export function gradeQuestion(store: TenantStore, a: Actor, attemptId: string, questionId: string, points: number) {
  const at = store.get("attempts", attemptId);
  if (!at) throw new CampusError("not_found", "Attempt not found", 404);
  if (!isGrader(a, at.courseId as string)) throw new CampusError("forbidden", "You can't grade this.", 403);
  const res = { ...((at.results as Record<string, { points: number | null; max: number; manual: boolean }>) ?? {}) };
  const r = res[questionId];
  if (!r) throw new CampusError("not_found", "Question not in attempt", 404);
  if (points < 0 || points > r.max) throw new CampusError("invalid", `Score between 0 and ${r.max}.`, 422);
  return store.tx(() => {
    res[questionId] = { ...r, points, manual: false };
    const still = Object.values(res).some((x) => x.manual);
    const total = Object.values(res).reduce((s, x) => s + (x.points ?? 0), 0);
    const out = store.update("attempts", attemptId, { results: res, score: Math.round(total * 100) / 100, state: still ? "pending_review" : "graded", needsManual: still });
    if (!still) postQuizScore(store, at.quizId as string, at.userId as string);
    audit(store, a, "attempts.grade_question", `attempts/${attemptId}`, `${questionId}=${points}`);
    return out;
  });
}

/** Moderate: extend time in progress, grant an extra attempt, or reopen a submitted attempt. */
export function moderate(store: TenantStore, a: Actor, quizId: string, userId: string, action: "extend" | "extra_attempt" | "reopen", minutes = 10) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz) throw new CampusError("not_found", "Quiz not found", 404);
  requireCourse(store, a, quiz.courseId as string, ["admin", "instructor", "ta"], "quizzes.moderate");
  return store.tx(() => {
    if (action === "extra_attempt") store.insert("quiz_moderations", { quizId, userId, kind: "extra_attempt", by: a.id }, "qm");
    else {
      const at = store.list("attempts", (x) => x.quizId === quizId && x.userId === userId).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
      if (!at) throw new CampusError("not_found", "No attempt to moderate.", 404);
      if (action === "extend") {
        if (at.state !== "in_progress") throw new CampusError("not_in_progress", "Only an attempt in progress can be extended.", 409);
        store.update("attempts", at.id, { deadline: new Date(toMs(at.deadline) + minutes * 60_000).toISOString() });
      } else store.update("attempts", at.id, { state: "in_progress", deadline: new Date(nowMs() + minutes * 60_000).toISOString() });
      store.insert("quiz_moderations", { quizId, userId, kind: action, minutes, attemptId: at.id, by: a.id }, "qm");
    }
    audit(store, a, `quizzes.moderate_${action}`, `quizzes/${quizId}`, userId);
    return { ok: true };
  });
}

/** Regrade after a question is corrected: full credit, accept old+new, or rescore with new key. */
export function regrade(store: TenantStore, a: Actor, quizId: string, questionId: string, newAnswer: string, option: "full_credit" | "both" | "new_only") {
  const quiz = store.get("quizzes", quizId);
  if (!quiz?.snapshot) throw new CampusError("not_found", "Quiz not found", 404);
  requireCourse(store, a, quiz.courseId as string, ["admin", "instructor"], "quizzes.regrade");
  const snap = quiz.snapshot as { questions: QSnap[]; version: number };
  const q = snap.questions.find((x) => x.id === questionId);
  if (!q) throw new CampusError("not_found", "Question not in this quiz", 404);
  const oldAnswer = q.answer;
  return store.tx(() => {
    q.answer = newAnswer;
    store.update("quizzes", quizId, { snapshot: { ...snap, version: snap.version + 1, questions: snap.questions } });
    store.update("questions", questionId, { answer: newAnswer, version: Number(store.get("questions", questionId)?.version ?? 1) + 1 });
    let n = 0;
    for (const at of store.list("attempts", (x) => x.quizId === quizId && x.state !== "in_progress" && (x.questionIds as string[]).includes(questionId))) {
      const ans = (at.answers as Record<string, unknown>)[questionId];
      const res = { ...((at.results as Record<string, { points: number | null; max: number; manual: boolean }>) ?? {}) };
      const r = res[questionId];
      let pts: number;
      if (option === "full_credit") pts = r.max;
      else if (option === "both") pts = Math.max(scoreQuestion({ ...q, answer: oldAnswer }, ans) ?? 0, scoreQuestion(q, ans) ?? 0);
      else pts = scoreQuestion(q, ans) ?? 0;
      res[questionId] = { ...r, points: pts };
      const total = Object.values(res).reduce((s, x) => s + (x.points ?? 0), 0);
      store.update("attempts", at.id, { results: res, score: Math.round(total * 100) / 100 });
      if (at.state === "graded") postQuizScore(store, quizId, at.userId as string);
      n++;
    }
    audit(store, a, "quizzes.regrade", `quizzes/${quizId}`, `${questionId}:${option}:${n}`);
    return { regraded: n };
  });
}

/** Item analysis: difficulty (p-value) and discrimination (point-biserial). */
export function itemAnalysis(store: TenantStore, a: Actor, quizId: string) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz?.snapshot) throw new CampusError("not_found", "Quiz not found", 404);
  requireCourse(store, a, quiz.courseId as string, ["admin", "instructor", "ta", "designer"], "quizzes.item_analysis");
  const atts = store.list("attempts", (x) => x.quizId === quizId && x.state === "graded");
  const totals = atts.map((x) => Number(x.score));
  const mean = totals.reduce((s, x) => s + x, 0) / (totals.length || 1);
  const sd = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / (totals.length || 1));
  const snap = quiz.snapshot as { questions: QSnap[] };
  const items = snap.questions.map((q) => {
    const rows = atts.filter((x) => (x.questionIds as string[]).includes(q.id)).map((x) => ({ s: Number((x.results as Record<string, { points: number }>)[q.id]?.points ?? 0) / (q.points || 1), t: Number(x.score) }));
    const p = rows.length ? rows.reduce((s, r) => s + r.s, 0) / rows.length : null;
    let disc: number | null = null;
    if (rows.length > 2 && sd > 0 && p !== null && p > 0 && p < 1) {
      const right = rows.filter((r) => r.s >= 0.999);
      const mRight = right.reduce((s, r) => s + r.t, 0) / (right.length || 1);
      disc = Math.round((((mRight - mean) / sd) * Math.sqrt(p / (1 - p))) * 100) / 100;
    }
    return { questionId: q.id, prompt: q.prompt, kind: q.kind, responses: rows.length, difficulty: p === null ? null : Math.round(p * 100) / 100, discrimination: disc, flag: p !== null && (p < 0.2 || (disc !== null && disc < 0.1)) };
  });
  const anonymous = quiz.kind === "survey" && !!quiz.anonymousSurvey;
  const students = anonymous ? [] : atts.map((x) => ({ userId: x.userId, name: userName(store, x.userId as string), score: x.score, attempt: x.attemptNo }));
  return { attempts: atts.length, mean: Math.round(mean * 100) / 100, sd: Math.round(sd * 100) / 100, items, students };
}

/** Students allowed to take a quiz; whether staff see the essay queue. */
export function manualQueue(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "quizzes.manual_queue");
  return store.list("attempts", (x) => x.courseId === courseId && x.state === "pending_review").map((x) => ({ attemptId: x.id, quiz: store.get("quizzes", x.quizId as string)?.title, student: userName(store, x.userId as string), submittedAt: x.submittedAt }));
}

export function courseHasStudent(store: TenantStore, courseId: string, userId: string) {
  return store.list("enrollments", (e) => e.courseId === courseId && e.userId === userId && e.role === "student" && e.state === "active").length > 0;
}

export { groupIdsOf, isStaff };
