import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { addBeforeWrite } from "../entity";
import { hasAny, type Actor } from "../iam";
import { audit, course, requireCourse, userName } from "./common";
import { ratingFor, type Rating } from "./outcomes";

/**
 * Quiz reporting and sharing (parity §3.12, §6):
 *  - Student analysis: every attempt's answers and points per question, as rows or CSV.
 *  - Outcomes analysis: per outcome aligned to the quiz's questions — attempts, average and how
 *    many students reached mastery (mastery scale or threshold).
 *  - Item banks shared across the account: a bank's course staff share it; quizzes in any
 *    course under the same account can draw from it; questions keep a version that increases on
 *    every content change.
 */

const CONTENT_FIELDS = ["prompt", "choices", "answer", "points", "kind", "config"];

/** Every content edit to a question bumps its content version (snapshots keep the old one). */
addBeforeWrite("questions", (_store, _a, values, existing) => {
  if (!existing) {
    values.contentRevision = 1;
    return;
  }
  const changed = CONTENT_FIELDS.some((k) => k in values && JSON.stringify(values[k]) !== JSON.stringify(existing[k]));
  if (changed) values.contentRevision = Number(existing.contentRevision ?? 1) + 1;
});

type Snap = { questions: { id: string; prompt: string; kind: string; points: number; choices?: string[]; outcomeId?: string | null }[] };

function quizFor(store: TenantStore, a: Actor, quizId: string, action: string) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz?.snapshot) throw new CampusError("not_found", "Quiz not found or not published", 404);
  requireCourse(store, a, String(quiz.courseId), ["admin", "instructor", "ta", "designer"], action);
  return quiz;
}

const answerText = (ans: unknown, choices?: string[]): string => {
  if (ans === null || ans === undefined || ans === "") return "";
  if (Array.isArray(ans)) return ans.map((x): string => answerText(x, choices)).join("; ");
  if (typeof ans === "object") return JSON.stringify(ans);
  return String(ans);
};

export function studentAnalysis(store: TenantStore, a: Actor, quizId: string) {
  const quiz = quizFor(store, a, quizId, "quizzes.student_analysis");
  const snap = quiz.snapshot as Snap;
  const anonymous = quiz.kind === "survey" && !!quiz.anonymousSurvey;
  const attempts = store.list("attempts", (x) => x.quizId === quizId && x.state !== "in_progress").sort((x, y) => String(x.submittedAt ?? "").localeCompare(String(y.submittedAt ?? "")));
  const rows = attempts.map((at, i) => {
    const results = (at.results as Record<string, { points: number; max: number; manual?: boolean }>) ?? {};
    const answers = (at.answers as Record<string, unknown>) ?? {};
    return {
      student: anonymous ? `Respondent ${i + 1}` : userName(store, String(at.userId)),
      sisId: anonymous ? null : ((store.get("users", String(at.userId))?.sisId as string) ?? null),
      attempt: Number(at.attemptNo ?? 1),
      submittedAt: (at.submittedAt as string) ?? null,
      state: String(at.state),
      score: at.score === undefined ? null : Number(at.score),
      responses: snap.questions.map((q) => ({ questionId: q.id, answer: answerText(answers[q.id], q.choices), points: results[q.id] ? results[q.id].points : null, max: results[q.id]?.max ?? q.points, needsGrading: !!results[q.id]?.manual })),
    };
  });
  return { quiz: String(quiz.title), anonymous, questions: snap.questions.map((q, i) => ({ n: i + 1, id: q.id, prompt: q.prompt, kind: q.kind, points: q.points })), rows };
}

export function studentAnalysisCsv(store: TenantStore, a: Actor, quizId: string) {
  const r = studentAnalysis(store, a, quizId);
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["student", "sis_id", "attempt", "submitted_at", "state", "score", ...r.questions.flatMap((x) => [`Q${x.n} answer`, `Q${x.n} points (of ${x.points})`])];
  const lines = [head.map(q).join(","), ...r.rows.map((row) => [row.student, row.sisId ?? "", row.attempt, row.submittedAt ?? "", row.state, row.score ?? "", ...row.responses.flatMap((x) => [x.answer, x.needsGrading ? "needs grading" : (x.points ?? "")])].map(q).join(","))];
  audit(store, a, "quizzes.student_analysis_csv", `quizzes/${quizId}`, `${r.rows.length} rows`);
  return `${lines.join("\n")}\n`;
}

export function outcomesAnalysis(store: TenantStore, a: Actor, quizId: string) {
  const quiz = quizFor(store, a, quizId, "quizzes.outcomes_analysis");
  const snap = quiz.snapshot as Snap;
  const attempts = store.list("attempts", (x) => x.quizId === quizId && x.state === "graded");
  const byOutcome = new Map<string, string[]>();
  for (const q of snap.questions) {
    const ids = new Set<string>();
    if (q.outcomeId) ids.add(q.outcomeId);
    for (const al of store.list("outcome_alignments", (x) => x.targetType === "question" && x.targetId === q.id)) ids.add(String(al.outcomeId));
    for (const id of ids) byOutcome.set(id, [...(byOutcome.get(id) ?? []), q.id]);
  }
  const outcomes = [...byOutcome.entries()].map(([oid, qids]) => {
    const o = store.get("outcomes", oid);
    const scale = o?.scaleId ? store.get("mastery_scales", String(o.scaleId)) : undefined;
    const threshold = scale ? (Number(scale.masteryPoints) / (Number((scale.ratings as Rating[])[0]?.points) || 1)) * 100 : Number(o?.masteryThreshold ?? 70);
    const perStudent = new Map<string, number>();
    for (const at of attempts) {
      const res = (at.results as Record<string, { points: number; max: number }>) ?? {};
      let got = 0;
      let max = 0;
      for (const qid of qids) if (res[qid] && res[qid].max > 0) {
        got += res[qid].points;
        max += res[qid].max;
      }
      if (max > 0) perStudent.set(String(at.userId), Math.max(perStudent.get(String(at.userId)) ?? 0, (got / max) * 100));
    }
    const pcts = [...perStudent.values()];
    const avg = pcts.length ? Math.round((pcts.reduce((s, x) => s + x, 0) / pcts.length) * 10) / 10 : null;
    const mastered = pcts.filter((p) => (scale ? ratingFor({ ratings: scale.ratings as Rating[], masteryPoints: Number(scale.masteryPoints) }, p).mastered : p >= threshold)).length;
    return { outcomeId: oid, code: String(o?.code ?? oid), title: String(o?.title ?? ""), questions: qids.length, students: pcts.length, averagePct: avg, mastered, masteredPct: pcts.length ? Math.round((mastered / pcts.length) * 100) : null, thresholdPct: Math.round(threshold) };
  });
  return { quiz: String(quiz.title), attempts: attempts.length, outcomes, unaligned: snap.questions.filter((q) => ![...byOutcome.values()].some((ids) => ids.includes(q.id))).length };
}

/* ---------------- shared item banks ---------------- */

function accountChain(store: TenantStore, accountId: unknown): string[] {
  const out: string[] = [];
  let cur = accountId ? store.get("accounts", String(accountId)) : undefined;
  while (cur && !out.includes(cur.id)) {
    out.push(cur.id);
    cur = cur.parentId ? store.get("accounts", String(cur.parentId)) : undefined;
  }
  return out;
}

export function shareBank(store: TenantStore, a: Actor, bankId: string, shared: boolean) {
  const bank = store.get("question_banks", bankId);
  if (!bank) throw new CampusError("not_found", "Bank not found", 404);
  requireCourse(store, a, String(bank.courseId), ["admin", "instructor", "designer"], "question_banks.share");
  const row = store.tx(() => store.update("question_banks", bank.id, { sharedWithAccount: !!shared, sharedAccountId: shared ? (course(store, String(bank.courseId)).accountId ?? null) : null, sharedAt: shared ? nowIso() : null }));
  audit(store, a, shared ? "question_banks.share" : "question_banks.unshare", `question_banks/${bank.id}`);
  return row;
}

/** Banks a course can draw from: its own plus banks shared by courses in the same account tree. */
export function banksFor(store: TenantStore, a: Actor, courseId: string) {
  const c = course(store, courseId);
  if (!hasAny(a, ["admin", "instructor", "designer", "ta"], courseId)) throw new CampusError("forbidden", "Course staff only.", 403);
  const chain = accountChain(store, c.accountId);
  const view = (b: Row, source: string) => ({ id: b.id, title: String(b.title), source, questions: store.list("questions", (q) => q.bankId === b.id).length, tags: [...new Set(store.list("questions", (q) => q.bankId === b.id).flatMap((q) => (q.tags as string[]) ?? []))] });
  return [
    ...store.list("question_banks", (b) => b.courseId === courseId).map((b) => view(b, "this course")),
    ...store.list("question_banks", (b) => b.courseId !== courseId && !!b.sharedWithAccount && (!b.sharedAccountId || chain.includes(String(b.sharedAccountId)) || accountChain(store, b.sharedAccountId).some((x) => chain.includes(x)))).map((b) => view(b, `shared by ${String(store.get("courses", String(b.courseId))?.code ?? b.courseId)}`)),
  ];
}

/** Add a pool drawing `pick` questions (optionally by tag) from a bank this course may use. */
export function addPool(store: TenantStore, a: Actor, quizId: string, input: { bankId: string; pick: number; tag?: string }) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz) throw new CampusError("not_found", "Quiz not found", 404);
  requireCourse(store, a, String(quiz.courseId), ["admin", "instructor", "designer"], "quizzes.add_pool");
  if (!banksFor(store, a, String(quiz.courseId)).some((b) => b.id === input.bankId)) throw new CampusError("forbidden", "That bank isn't in this course or shared with it.", 403);
  const pick = Math.floor(Number(input.pick));
  const available = store.list("questions", (q) => q.bankId === input.bankId && (!input.tag || ((q.tags as string[]) ?? []).includes(input.tag))).length;
  if (!(pick >= 1) || pick > available) throw new CampusError("invalid", `Pick between 1 and ${available} questions.`, 422);
  const pools = [...((quiz.pools as { bankId: string; pick: number; tag?: string }[]) ?? []), { bankId: input.bankId, pick, ...(input.tag ? { tag: input.tag } : {}) }];
  const row = store.tx(() => store.update("quizzes", quiz.id, { pools }));
  audit(store, a, "quizzes.add_pool", `quizzes/${quiz.id}`, `${pick} from ${input.bankId}`);
  return row;
}
