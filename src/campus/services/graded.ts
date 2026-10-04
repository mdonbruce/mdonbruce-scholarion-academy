import crypto from "node:crypto";
import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, notify } from "./common";

/**
 * Scholarion assessment engine for graded mini-labs, quizzes, worksheets, activities and projects.
 *
 * - Published items freeze their rubric and evaluator as a version; later edits create a new
 *   version and never change how an existing submission is graded.
 * - Two graded attempts by default; unlimited practice that never consumes attempts or posts grades.
 * - Submissions grade a fixed snapshot. Retries with the same idempotency key return the same
 *   submission (no extra attempt, no duplicate grade).
 * - Infrastructure failures do not consume an attempt; an accepted submission that runs and is
 *   wrong does.
 * - States: submitted → grading → graded → posted, or infra_failed / posting_failed. Posting is
 *   retried without regrading. The highest valid attempt is the recorded grade.
 * - Passing results update the competency passbook. Answer keys stay server-side; learners see
 *   the Check Answers view only after their submission is graded.
 */

export type ItemKind = "minilab" | "quiz" | "worksheet" | "activity" | "project";

export interface RubricCriterion {
  key: string;
  label: string;
  description: string;
  points: number;
  levels: { label: string; pct: number; descriptor: string }[];
  evidence: string;
  lo: string;
  mandatory?: boolean;
}

export interface Question {
  id: string;
  type: "single" | "multiple" | "true_false" | "scenario";
  prompt: string;
  scenario?: string;
  options: string[];
  /** Server-side only. Indexes into options. */
  answer: number[];
  explanation: string;
  lo: string;
  reading?: string;
  points?: number;
}

export interface MiniTask {
  id: string;
  kind: "match" | "order" | "choose" | "fill";
  prompt: string;
  /** match: left items; order: items to order; choose: options; fill: none. */
  items: string[];
  /** match: right items shown to learners (shuffled order). */
  targets?: string[];
  /** Server-side only. match: target index per item; order: correct order of item indexes; choose: option index; fill: accepted strings. */
  key: (number | string)[];
  points: number;
  hint: string[];
  explanation: string;
  lo: string;
}

export interface Evaluator {
  /** quiz: one question per slot; slot i of attempt n uses variants[i][min(n-1, len-1)]. */
  questions?: Question[][];
  tasks?: MiniTask[];
  /** worksheet/activity: objective questions + short answers judged by evidence terms. */
  shortAnswers?: { id: string; prompt: string; evidenceTerms: string[]; points: number; lo: string; model: string }[];
  /** activity/project: required artifacts in the workspace snapshot and validation checks. */
  artifacts?: { path: string; mustContain?: string[]; points: number; criterion: string }[];
}

export interface ItemInput {
  courseId: string;
  module: string;
  topic?: string | null;
  key: string;
  kind: ItemKind;
  title: string;
  instructions: string;
  rubric: RubricCriterion[];
  evaluator: Evaluator;
  competencies?: string[];
  passMark?: number;
  maxAttempts?: number;
  aiPolicy?: string;
  points?: number;
  /** Which attempt counts: the highest valid attempt (default) or the latest graded one. */
  gradingPolicy?: "highest" | "latest";
  dueAt?: string | null;
}

const DEFAULT_PASS = 70;
const DEFAULT_ATTEMPTS = 2;

/** Thrown by evaluators when grading infrastructure (runner, workspace) is unavailable. */
export class InfraFailure extends Error {}

/** Test hook: make the next N gradebook posts fail. */
export const postingFaults = { remaining: 0 };

function staff(a: Actor, courseId: string) {
  return hasAny(a, ["admin", "designer"]) || hasAny(a, ["instructor", "ta"], courseId);
}
function learner(a: Actor, courseId: string) {
  return hasAny(a, ["student"], courseId);
}

/** Create or update an item; publishing freezes a version. */
export function upsertItem(store: TenantStore, a: Actor | null, input: ItemInput, publish = true) {
  if (a && !staff(a, input.courseId)) throw new CampusError("forbidden", "Course staff only.", 403);
  const total = input.rubric.reduce((s, c) => s + c.points, 0);
  const existing = store.list("graded_items", (i) => i.courseId === input.courseId && i.key === input.key)[0];
  return store.tx(() => {
    const base = { courseId: input.courseId, module: input.module, topic: input.topic ?? null, key: input.key, kind: input.kind, title: input.title, instructions: input.instructions, competencies: input.competencies ?? [], passMark: input.passMark ?? DEFAULT_PASS, maxAttempts: input.maxAttempts ?? DEFAULT_ATTEMPTS, aiPolicy: input.aiPolicy ?? "Allowed with disclosure.", points: input.points ?? total, rubricTotal: total, gradingPolicy: input.gradingPolicy ?? "highest", dueAt: input.dueAt ?? null };
    const item = existing ? store.update("graded_items", existing.id, base) : store.insert("graded_items", { ...base, currentVersion: 0, published: false, assignmentId: null }, "gi");
    const last = store.list("graded_item_versions", (v) => v.itemId === item.id).sort((x, y) => Number(y.version) - Number(x.version))[0];
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ r: input.rubric, e: input.evaluator, p: base.passMark })).digest("hex");
    if (publish && (!last || last.fingerprint !== fingerprint)) {
      const version = Number(last?.version ?? 0) + 1;
      store.insert("graded_item_versions", { itemId: item.id, version, rubric: input.rubric, evaluator: input.evaluator, passMark: base.passMark, fingerprint, frozenAt: nowIso() }, "giv");
      let assignmentId = item.assignmentId as string | null;
      if (!assignmentId) {
        const grp = store.list("assignment_groups", (g) => g.courseId === input.courseId)[0] ?? store.insert("assignment_groups", { courseId: input.courseId, name: "Graded work", weight: 100 }, "ag");
        assignmentId = store.insert("assignments", { courseId: input.courseId, moduleId: null, title: input.title, instructions: input.instructions, points: base.points, groupId: grp.id, submissionTypes: ["external_tool"], state: "published", gradingType: "points", tags: ["autograded", input.kind], allowedAttempts: base.maxAttempts, gradedItemId: item.id }, "asg").id;
      }
      store.update("graded_items", item.id, { currentVersion: version, published: true, assignmentId });
    }
    return store.get("graded_items", item.id)!;
  });
}

function versionOf(store: TenantStore, itemId: string, version: number) {
  const v = store.list("graded_item_versions", (x) => x.itemId === itemId && Number(x.version) === version)[0];
  if (!v) throw new CampusError("not_found", "Assessment version not found", 404);
  return v as Row & { rubric: RubricCriterion[]; evaluator: Evaluator; passMark: number };
}

function itemRow(store: TenantStore, itemId: string) {
  const i = store.get("graded_items", itemId);
  if (!i || !i.published) throw new CampusError("not_found", "Assessment not found", 404);
  return i;
}

/* ---------------- learner views (never include keys) ---------------- */

function publicQuestion(q: Question) {
  const { answer: _a, explanation: _e, ...rest } = q;
  return rest;
}
function publicTask(t: MiniTask) {
  const { key: _k, explanation: _e, ...rest } = t;
  return rest;
}

export function itemView(store: TenantStore, a: Actor, itemId: string) {
  const item = itemRow(store, itemId);
  const courseId = String(item.courseId);
  const isStaff = staff(a, courseId);
  if (!isStaff && !learner(a, courseId)) throw new CampusError("forbidden", "Enroll in the course to open this assessment.", 403);
  const v = versionOf(store, item.id, Number(item.currentVersion));
  const subs = store.list("graded_submissions", (s) => s.itemId === item.id && s.userId === a.id).sort((x, y) => Number(x.attempt ?? 0) - Number(y.attempt ?? 0));
  const counted = subs.filter((s) => !["infra_failed", "rejected"].includes(String(s.state)));
  const nextAttempt = Math.min(counted.length + 1, Number(item.maxAttempts));
  const questions = (v.evaluator.questions ?? []).map((variants) => publicQuestion(variants[Math.min(nextAttempt - 1, variants.length - 1)]));
  const best = bestOf(subs, String(item.gradingPolicy ?? "highest"));
  return {
    id: item.id,
    gradingPolicy: String(item.gradingPolicy ?? "highest"),
    dueAt: (item.dueAt as string) ?? null,
    key: String(item.key),
    kind: item.kind as ItemKind,
    title: String(item.title),
    instructions: String(item.instructions),
    module: String(item.module),
    topic: (item.topic as string) ?? null,
    version: Number(item.currentVersion),
    rubric: v.rubric.map((c) => ({ ...c })),
    passMark: Number(item.passMark),
    mandatory: v.rubric.filter((c) => c.mandatory).map((c) => c.label),
    aiPolicy: String(item.aiPolicy),
    maxAttempts: Number(item.maxAttempts),
    attemptsUsed: counted.length,
    attemptsRemaining: Math.max(0, Number(item.maxAttempts) - counted.length),
    questions,
    tasks: (v.evaluator.tasks ?? []).map(publicTask),
    shortAnswers: (v.evaluator.shortAnswers ?? []).map(({ model: _m, evidenceTerms: _t, ...rest }) => rest),
    artifacts: (v.evaluator.artifacts ?? []).map(({ mustContain: _m, ...rest }) => rest),
    submissions: subs.map((s) => ({ id: s.id, attempt: (s.attempt as number) ?? null, state: String(s.state), score: (s.score as number) ?? null, passed: (s.passed as boolean) ?? null, createdAt: String(s.createdAt), infraReason: (s.infraReason as string) ?? null })),
    best,
    isStaff,
  };
}

function bestOf(subs: Row[], policy: string = "highest") {
  const valid = subs.filter((s) => ["graded", "posted", "posting_failed"].includes(String(s.state)));
  if (!valid.length) return null;
  const b = policy === "latest" ? valid.reduce((m, s) => (Number(s.attempt) > Number(m.attempt) ? s : m)) : valid.reduce((m, s) => (Number(s.score) > Number(m.score) ? s : m));
  return { submissionId: b.id, score: Number(b.score), passed: !!b.passed, attempt: Number(b.attempt) };
}

/* ---------------- evaluation ---------------- */

interface Evaluation {
  score: number;
  criteria: { key: string; label: string; points: number; earned: number; feedback: string; mandatory: boolean; met: boolean }[];
  answers: { id: string; prompt: string; response: unknown; correct: unknown; earned: number; points: number; explanation: string; lo: string; reading?: string }[];
  mandatoryFailed: string[];
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export function evaluate(v: { rubric: RubricCriterion[]; evaluator: Evaluator }, payload: Record<string, unknown>, attempt: number, snapshotFiles?: Record<string, string>): Evaluation {
  const answers: Evaluation["answers"] = [];
  const ev = v.evaluator;
  // Quiz questions (variant by attempt).
  for (const variants of ev.questions ?? []) {
    const q = variants[Math.min(attempt - 1, variants.length - 1)];
    const raw = (payload[q.id] ?? []) as unknown;
    const resp = (Array.isArray(raw) ? raw : [raw]).filter((x) => x !== "" && x !== undefined && x !== null).map(Number).filter((n) => Number.isInteger(n));
    const pts = q.points ?? 1;
    answers.push({ id: q.id, prompt: q.prompt, response: resp.map((i) => q.options[i]), correct: q.answer.map((i) => q.options[i]), earned: sameSet(resp, q.answer) ? pts : 0, points: pts, explanation: q.explanation, lo: q.lo, reading: q.reading });
  }
  // Mini-lab tasks.
  for (const t of ev.tasks ?? []) {
    const raw = payload[t.id];
    let earned = 0;
    let shown: unknown = raw;
    if (t.kind === "match" || t.kind === "order") {
      const arr = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map((x) => Number(x));
      const hits = t.key.filter((k, i) => Number(k) === arr[i]).length;
      earned = Math.round((hits / t.key.length) * t.points * 100) / 100;
      shown = arr.map((x) => (t.kind === "match" ? t.targets?.[x] : t.items[x]) ?? "—");
    } else if (t.kind === "choose") {
      earned = Number(raw) === Number(t.key[0]) ? t.points : 0;
      shown = t.items[Number(raw)] ?? "—";
    } else {
      earned = t.key.some((k) => norm(k) === norm(raw)) ? t.points : 0;
    }
    const correct = t.kind === "match" ? t.key.map((k) => t.targets?.[Number(k)]) : t.kind === "order" ? t.key.map((k) => t.items[Number(k)]) : t.kind === "choose" ? t.items[Number(t.key[0])] : t.key[0];
    answers.push({ id: t.id, prompt: t.prompt, response: shown, correct, earned, points: t.points, explanation: t.explanation, lo: t.lo });
  }
  // Short answers: constrained evidence check (deterministic term coverage).
  for (const s of ev.shortAnswers ?? []) {
    const text = norm(payload[s.id]);
    const hit = s.evidenceTerms.filter((term) => text.includes(norm(term)));
    const earned = Math.round(Math.min(1, hit.length / Math.max(1, Math.ceil(s.evidenceTerms.length / 2))) * s.points * 100) / 100;
    answers.push({ id: s.id, prompt: s.prompt, response: String(payload[s.id] ?? ""), correct: s.model, earned, points: s.points, explanation: hit.length ? `Evidence found: ${hit.join(", ")}.` : "No supporting evidence found in the answer.", lo: s.lo });
  }
  // Artifacts in the workspace snapshot.
  const artifactResults = (ev.artifacts ?? []).map((art) => {
    const content = snapshotFiles?.[art.path];
    const ok = content !== undefined && (art.mustContain ?? []).every((m) => content.toLowerCase().includes(m.toLowerCase()));
    return { ...art, ok, present: content !== undefined };
  });
  // Rubric criteria: earned share from answers/artifacts mapped to each criterion.
  const objectivePts = answers.reduce((s, x) => s + x.points, 0);
  const objectiveEarned = answers.reduce((s, x) => s + x.earned, 0);
  const objectiveShare = objectivePts ? objectiveEarned / objectivePts : 1;
  const criteria = v.rubric.map((c) => {
    const arts = artifactResults.filter((r) => r.criterion === c.key);
    const share = arts.length ? arts.filter((r) => r.ok).length / arts.length : objectiveShare;
    const earned = Math.round(share * c.points * 100) / 100;
    const level = [...c.levels].sort((x, y) => y.pct - x.pct).find((l) => share * 100 >= l.pct) ?? c.levels[c.levels.length - 1];
    const missing = arts.filter((r) => !r.ok).map((r) => (r.present ? `${r.path} is missing required content` : `${r.path} not found in your submission`));
    return { key: c.key, label: c.label, points: c.points, earned, feedback: `${level?.label ?? ""}: ${level?.descriptor ?? ""}${missing.length ? ` Fix: ${missing.join("; ")}.` : ""}`, mandatory: !!c.mandatory, met: share >= 0.7 };
  });
  const total = v.rubric.reduce((s, c) => s + c.points, 0) || 1;
  const score = Math.round((criteria.reduce((s, c) => s + c.earned, 0) / total) * 1000) / 10;
  return { score, criteria, answers, mandatoryFailed: criteria.filter((c) => c.mandatory && !c.met).map((c) => c.label) };
}

/** Practice: unlimited, ungraded, no gradebook entry; immediate feedback including answers for practice items. */
export function practice(store: TenantStore, a: Actor, itemId: string, payload: Record<string, unknown>) {
  const item = itemRow(store, itemId);
  if (!staff(a, String(item.courseId)) && !learner(a, String(item.courseId))) throw new CampusError("forbidden", "Enroll in the course to practice.", 403);
  if (item.kind === "quiz") throw new CampusError("not_allowed", "Graded quizzes have no practice mode; use the topic practice quizzes.", 409);
  const v = versionOf(store, item.id, Number(item.currentVersion));
  const e = evaluate(v, payload, 1);
  // Practice feedback shows which tasks are right and the hint ladder — not the full key.
  const tasks = new Map((v.evaluator.tasks ?? []).map((t) => [t.id, t]));
  return { practice: true, score: e.score, criteria: e.criteria, results: e.answers.map((x) => ({ id: x.id, correct: x.earned >= x.points, earned: x.earned, points: x.points, hint: x.earned >= x.points ? null : tasks.get(x.id)?.hint[0] ?? null })), note: "Practice only — no attempt used and nothing posted to the gradebook." };
}

/** Submit a graded attempt (idempotent by key). `runner` lets labs supply snapshot files or report infrastructure failure. */
export function submit(store: TenantStore, a: Actor, itemId: string, payload: Record<string, unknown>, idempotencyKey: string, runner?: () => { files?: Record<string, string>; snapshotId?: string }) {
  const item = itemRow(store, itemId);
  const courseId = String(item.courseId);
  if (!learner(a, courseId)) throw new CampusError("forbidden", "Graded attempts are for enrolled learners.", 403);
  if (!idempotencyKey || idempotencyKey.length > 120) throw new CampusError("invalid", "An idempotency key is required.", 422);
  const dup = store.list("graded_submissions", (s) => s.itemId === item.id && s.userId === a.id && s.idempotencyKey === idempotencyKey && !["infra_failed", "rejected"].includes(String(s.state)))[0];
  if (dup) return { ...submissionResult(dup), duplicate: true };
  const counted = store.list("graded_submissions", (s) => s.itemId === item.id && s.userId === a.id && !["infra_failed", "rejected"].includes(String(s.state)));
  if (counted.length >= Number(item.maxAttempts)) throw new CampusError("attempts_exhausted", `You've used both graded attempts (${item.maxAttempts}). Your highest score is recorded.`, 409);
  const version = Number(item.currentVersion);
  const v = versionOf(store, item.id, version);
  const attempt = counted.length + 1;
  const snapshot = JSON.parse(JSON.stringify(payload ?? {}));
  const sub = store.tx(() => store.insert("graded_submissions", { itemId: item.id, itemVersion: version, userId: a.id, courseId, attempt, idempotencyKey, snapshot, snapshotChecksum: crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), state: "submitted", score: null, passed: null, postAttempts: 0 }, "gsb"));
  store.update("graded_submissions", sub.id, { state: "grading" });
  let files: Record<string, string> | undefined;
  try {
    const r = runner?.();
    files = r?.files;
    if (r?.snapshotId) store.update("graded_submissions", sub.id, { workspaceSnapshotId: r.snapshotId, snapshotFiles: r.files ?? null });
  } catch (e) {
    if (e instanceof InfraFailure) {
      store.tx(() => store.update("graded_submissions", sub.id, { state: "infra_failed", attempt: null, infraReason: e.message }));
      audit(store, a, "graded.infra_failed", `graded_submissions/${sub.id}`, e.message);
      return { ...submissionResult(store.get("graded_submissions", sub.id)!), note: "The grading environment failed. This did not use an attempt — please submit again." };
    }
    store.tx(() => store.update("graded_submissions", sub.id, { state: "rejected", attempt: null, infraReason: (e as Error).message }));
    throw e;
  }
  const e = evaluate(v, snapshot, attempt, files);
  const passed = e.score >= Number(item.passMark) && e.mandatoryFailed.length === 0;
  const similarity = similarityFlag(store, item.id, a.id, snapshot, files);
  store.tx(() => store.update("graded_submissions", sub.id, { state: "graded", score: e.score, passed, criteria: e.criteria, answers: e.answers, mandatoryFailed: e.mandatoryFailed, gradedAt: nowIso(), similarity }));
  postGrade(store, sub.id);
  audit(store, a, "graded.submit", `graded_submissions/${sub.id}`, `${item.title} attempt ${attempt}: ${e.score}`);
  return submissionResult(store.get("graded_submissions", sub.id)!);
}

/* ---------------- integrity: similarity (flag only, never a gate) ---------------- */

const shingles = (t: string) => {
  const w = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
};
function freeText(payload: Record<string, unknown>, files?: Record<string, string>) {
  const parts = Object.values(payload).filter((v): v is string => typeof v === "string" && v.length > 40);
  if (files) parts.push(...Object.entries(files).filter(([p]) => /\.(md|py|yaml|yml|txt)$/.test(p)).map(([, c]) => c));
  return parts.join("\n");
}
/** Highest Jaccard similarity of free text against other learners' graded submissions for the item. */
function similarityFlag(store: TenantStore, itemId: string, userId: string, payload: Record<string, unknown>, files?: Record<string, string>) {
  const mine = shingles(freeText(payload, files));
  if (mine.size < 25) return null;
  let best = { score: 0, with: "" };
  for (const o of store.list("graded_submissions", (x) => x.itemId === itemId && x.userId !== userId && x.state !== "infra_failed")) {
    const theirs = shingles(freeText((o.snapshot as Record<string, unknown>) ?? {}, (o.snapshotFiles as Record<string, string>) ?? undefined));
    if (theirs.size < 25) continue;
    let inter = 0;
    for (const x of mine) if (theirs.has(x)) inter++;
    const j = inter / (mine.size + theirs.size - inter);
    if (j > best.score) best = { score: j, with: o.id };
  }
  return best.score >= 0.8 ? { score: Math.round(best.score * 100) / 100, withSubmission: best.with, note: "Flagged for review only; the grade stands." } : null;
}

/** Post-hoc instructor override with a required reason. Never blocks or delays the original posting. */
export function regrade(store: TenantStore, a: Actor, submissionId: string, score: number, reason: string) {
  const s = store.get("graded_submissions", submissionId);
  if (!s) throw new CampusError("not_found", "Submission not found", 404);
  const item = store.get("graded_items", String(s.itemId))!;
  if (!staff(a, String(item.courseId))) throw new CampusError("forbidden", "Course staff only.", 403);
  if (!["graded", "posted", "posting_failed"].includes(String(s.state))) throw new CampusError("not_graded", "Only graded submissions can be regraded.", 409);
  if (!String(reason ?? "").trim()) throw new CampusError("invalid", "A reason is required for a regrade.", 422);
  const n = Number(score);
  if (!(n >= 0 && n <= 100)) throw new CampusError("invalid", "Score must be 0–100.", 422);
  const passed = n >= Number(item.passMark) && !((s.mandatoryFailed as string[]) ?? []).length;
  store.tx(() => store.update("graded_submissions", s.id, { score: n, passed, overrides: [...((s.overrides as unknown[]) ?? []), { by: a.id, at: nowIso(), from: s.score, to: n, reason: String(reason).slice(0, 500) }] }));
  audit(store, a, "graded.regrade", `graded_submissions/${s.id}`, `${s.score} → ${n}: ${reason}`);
  postGrade(store, s.id);
  notify(store, [String(s.userId)], "grades", `${item.title}: regraded to ${n}/100`, `Your instructor updated this grade. Reason: ${reason}`, `/campus/{tenant}/learn/${item.courseId}/gradebook`, String(item.courseId));
  return submissionResult(store.get("graded_submissions", s.id)!);
}

function submissionResult(s: Row) {
  return { id: s.id, attempt: (s.attempt as number) ?? null, state: String(s.state), score: (s.score as number) ?? null, passed: (s.passed as boolean) ?? null, criteria: s.criteria ?? [], mandatoryFailed: s.mandatoryFailed ?? [] };
}

/** Post the best valid attempt to the gradebook (idempotent) and update the passbook. Never regrades. */
export function postGrade(store: TenantStore, submissionId: string) {
  const s = store.get("graded_submissions", submissionId);
  if (!s || !["graded", "posting_failed", "posted"].includes(String(s.state))) return null;
  const item = store.get("graded_items", String(s.itemId))!;
  try {
    if (postingFaults.remaining > 0) {
      postingFaults.remaining--;
      throw new Error("Gradebook unavailable");
    }
    store.tx(() => {
      const all = store.list("graded_submissions", (x) => x.itemId === item.id && x.userId === s.userId);
      const best = bestOf(all, String(item.gradingPolicy ?? "highest"))!;
      const asg = store.get("assignments", String(item.assignmentId));
      if (asg) {
        const score = Math.round((best.score / 100) * Number(asg.points ?? 100) * 100) / 100;
        const g = store.list("grades", (x) => x.assignmentId === asg.id && x.userId === s.userId)[0];
        const row = { score, posted: true, postedAt: nowIso(), status: "none", passFail: best.passed ? "pass" : "no_pass", gradedBy: "scholarion-autograder", sourceSubmissionId: best.submissionId };
        if (g) store.update("grades", g.id, row);
        else store.insert("grades", { assignmentId: asg.id, userId: s.userId, ...row }, "grd");
        store.emit("grades.posted", `assignments/${asg.id}`, { courseId: item.courseId, assignmentId: asg.id, userIds: [s.userId] });
      }
      for (const comp of (item.competencies as string[]) ?? []) {
        const existing = store.list("passbook", (p) => p.userId === s.userId && p.courseId === item.courseId && p.competency === comp && p.itemId === item.id)[0];
        const rec = { score: best.score, threshold: Number(item.passMark), result: best.passed ? "pass" : "not_yet", completedAt: best.passed ? nowIso() : null, submissionId: best.submissionId };
        if (existing) store.update("passbook", existing.id, rec);
        else store.insert("passbook", { userId: s.userId, courseId: item.courseId, competency: comp, itemId: item.id, itemTitle: item.title, ...rec }, "pb");
      }
      store.update("graded_submissions", s.id, { state: "posted", postedAt: nowIso(), postAttempts: Number(s.postAttempts ?? 0) + 1 });
    });
    notify(store, [String(s.userId)], "grades", `${item.title}: ${s.score}/100 (${s.passed ? "pass" : "not yet passing"})`, "Your result was posted to the gradebook.", `/campus/{tenant}/learn/${item.courseId}/gradebook`, String(item.courseId));
  } catch (e) {
    store.tx(() => store.update("graded_submissions", s.id, { state: "posting_failed", postError: (e as Error).message, postAttempts: Number(s.postAttempts ?? 0) + 1 }));
  }
  return store.get("graded_submissions", s.id);
}

/** Retry every failed posting (run by a scheduler or staff); never regrades or uses attempts. */
export function retryPostings(store: TenantStore, a?: Actor, courseId?: string) {
  if (a && courseId && !staff(a, courseId)) throw new CampusError("forbidden", "Course staff only.", 403);
  const failed = store.list("graded_submissions", (s) => s.state === "posting_failed" && (!courseId || s.courseId === courseId));
  return { retried: failed.length, posted: failed.map((s) => postGrade(store, s.id)).filter((r) => r?.state === "posted").length };
}

/** Check Answers: available to the learner once their submission is graded; always to staff. */
export function reviewAnswers(store: TenantStore, a: Actor, submissionId: string) {
  const s = store.get("graded_submissions", submissionId);
  if (!s) throw new CampusError("not_found", "Submission not found", 404);
  const item = store.get("graded_items", String(s.itemId))!;
  const isStaff = staff(a, String(item.courseId));
  if (s.userId !== a.id && !isStaff) throw new CampusError("forbidden", "Not your submission.", 403);
  if (!["graded", "posted", "posting_failed"].includes(String(s.state))) throw new CampusError("not_graded", "Answers can be reviewed once this submission is graded.", 409);
  return { id: s.id, item: String(item.title), attempt: s.attempt, score: s.score, passed: s.passed, state: s.state, criteria: s.criteria, answers: s.answers, version: s.itemVersion };
}

export function courseGradebook(store: TenantStore, a: Actor, courseId: string) {
  const items = store.list("graded_items", (i) => i.courseId === courseId && !!i.published);
  const isStaff = staff(a, courseId);
  if (!isStaff && !learner(a, courseId)) throw new CampusError("forbidden", "Not in this course.", 403);
  const users = isStaff ? [...new Set(store.list("enrollments", (e) => e.courseId === courseId && e.role === "student" && e.state === "active").map((e) => String(e.userId)))] : [a.id];
  const rows = users.map((uid) => ({
    userId: uid,
    name: String(store.get("users", uid)?.name ?? uid),
    items: items.map((i) => {
      const subs = store.list("graded_submissions", (s) => s.itemId === i.id && s.userId === uid);
      const best = bestOf(subs, String(i.gradingPolicy ?? "highest"));
      const latest = subs.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
      return { itemId: i.id, title: String(i.title), kind: String(i.kind), attemptsUsed: subs.filter((x) => !["infra_failed", "rejected"].includes(String(x.state))).length, maxAttempts: Number(i.maxAttempts), best: best?.score ?? null, passed: best?.passed ?? null, state: latest ? String(latest.state) : "not_started" };
    }),
    passbook: store.list("passbook", (p) => p.userId === uid && p.courseId === courseId).map((p) => ({ competency: String(p.competency), item: String(p.itemTitle), score: Number(p.score), threshold: Number(p.threshold), result: String(p.result), completedAt: (p.completedAt as string) ?? null })),
  }));
  return { items: items.map((i) => ({ id: i.id, title: String(i.title), kind: String(i.kind), passMark: Number(i.passMark), competencies: (i.competencies as string[]) ?? [] })), rows, isStaff, failedPostings: isStaff ? store.list("graded_submissions", (s) => s.courseId === courseId && s.state === "posting_failed").length : 0 };
}

/** CSV export of the course gradebook and passbook (staff). */
export function gradebookCsv(store: TenantStore, a: Actor, courseId: string) {
  const g = courseGradebook(store, a, courseId);
  if (!g.isStaff) throw new CampusError("forbidden", "Course staff only.", 403);
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Learner", ...g.items.map((i) => i.title), "Competencies passed"].map(q).join(",");
  const lines = g.rows.map((r) => [r.name, ...r.items.map((i) => (i.best === null ? "" : `${i.best}${i.passed ? " (pass)" : ""}`)), r.passbook.filter((p) => p.result === "pass").map((p) => p.competency).join("; ")].map(q).join(","));
  return [head, ...lines].join("\n") + "\n";
}
