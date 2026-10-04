import { ratingFor, type Rating } from "./outcomes";
import { periodsForCourse } from "./terms";
import { CampusError, nowIso, registerConsumer, type Row, type TenantStore } from "../core";
import { registerHooks } from "../entity";
import { hasAny, type Actor } from "../iam";
import { activeStudents, audit, course, isGrader, notify, requireCourse, toMs, userName } from "./common";
import { effectiveDates } from "./curriculum";
import { csv, parseCsv } from "./sis";

/**
 * Gradebook: grade entries with optimistic concurrency (412 on stale edits), automatic
 * late/missing policies, explicit audited posting, moderated and anonymous grading,
 * versioned rubrics, history, curve/default grade, CSV round-trip, totals with weights and
 * drop rules, What-If, grading periods and schemes, and the learning mastery view.
 */

export type CellStatus = "none" | "late" | "missing" | "excused" | "resubmitted" | "dropped";

/** Anything gradable: assignments, quizzes, graded discussions all have a points field. */
export function gradable(store: TenantStore, id: string): Row | undefined {
  return store.get("assignments", id) ?? store.get("quizzes", id);
}

function postingMode(store: TenantStore, item: Row): "automatic" | "manual" {
  const p = store.list("posting_policies", (x) => x.assignmentId === item.id)[0] ?? store.list("posting_policies", (x) => x.courseId === item.courseId && !x.assignmentId)[0];
  if (item.anonymousGrading || item.moderated) return "manual";
  return (p?.mode as "automatic" | "manual") ?? "automatic";
}

function periodClosed(store: TenantStore, item: Row, userId: string): Row | undefined {
  const d = effectiveDates(store, item, userId).dueAt;
  if (!d) return undefined;
  // The course's own periods (its term's set, the account default set, or the term's periods) decide.
  const own = periodsForCourse(store, String(item.courseId)).periods;
  const pool = own.length ? own : store.list("grading_periods");
  return pool.find((p) => String(p.startsAt) <= d && String(p.endsAt) >= d && String(p.closeAt) < nowIso());
}

function latestSubmission(store: TenantStore, itemId: string, userId: string): Row | undefined {
  return store.list("submissions", (s) => s.assignmentId === itemId && (s.userId === userId || ((s.groupMemberIds as string[]) ?? []).includes(userId))).sort((a, b) => Number(b.attempt) - Number(a.attempt))[0];
}

function accommodationDays(store: TenantStore, userId: string, courseId: string) {
  return store.list("accommodations", (x) => x.userId === userId && x.kind === "deadline_extension" && (!x.courseId || x.courseId === courseId) && (!x.expiresAt || String(x.expiresAt) >= nowIso().slice(0, 10))).reduce((s, x) => s + Number(x.days ?? 0), 0);
}

export function dueFor(store: TenantStore, item: Row, userId: string): string | null {
  const d = effectiveDates(store, item, userId).dueAt;
  if (!d) return null;
  const days = accommodationDays(store, userId, item.courseId as string);
  return days ? new Date(toMs(d) + days * 86400_000).toISOString() : d;
}

/** Late penalty from the course policy: X% per day late, never below the floor. */
export function latePenalty(store: TenantStore, item: Row, userId: string, raw: number): { score: number; daysLate: number; penaltyPct: number } {
  const sub = latestSubmission(store, item.id, userId);
  const due = dueFor(store, item, userId);
  const policy = (course(store, item.courseId as string).latePolicy as { latePctPerDay?: number; floorPct?: number } | undefined) ?? {};
  if (!sub || !due || !policy.latePctPerDay) return { score: raw, daysLate: 0, penaltyPct: 0 };
  const lateMs = toMs(sub.createdAt) - toMs(due);
  if (lateMs <= 0) return { score: raw, daysLate: 0, penaltyPct: 0 };
  const daysLate = Math.ceil(lateMs / 86400_000);
  const pts = Number(item.points ?? 0);
  const penaltyPct = Math.min(100, daysLate * policy.latePctPerDay);
  const floor = ((policy.floorPct ?? 0) / 100) * pts;
  const score = Math.max(Math.min(raw, raw - (penaltyPct / 100) * pts), Math.min(raw, floor));
  return { score: Math.round(score * 100) / 100, daysLate, penaltyPct };
}

export interface SetGradeInput {
  assignmentId: string;
  userId: string;
  score?: number | null;
  excused?: boolean;
  status?: CellStatus;
  lateOverrideDays?: number;
  rubric?: { ratings: Record<string, number>; comments?: Record<string, string> };
  ifVersion?: number;
  source?: "manual" | "quiz" | "lti" | "peer" | "curve" | "default" | "csv" | "checkpoints" | "attendance";
  comment?: string;
  /** Keep the grade unposted until a teacher posts it (external tool scores). */
  holdForReview?: boolean;
}

/** The single path for writing grades. */
export function setGrade(store: TenantStore, a: Actor | null, input: SetGradeInput) {
  const item = gradable(store, input.assignmentId);
  if (!item) throw new CampusError("not_found", "Assignment not found", 404);
  const courseId = item.courseId as string;
  const system = !a;
  if (a && !isGrader(a, courseId)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "grades.set", resource: `assignments/${item.id}`, outcome: "denied" });
    throw new CampusError("forbidden", "You can't grade in this course.", 403);
  }
  if (!store.list("enrollments", (e) => e.userId === input.userId && e.courseId === courseId && e.role === "student").length) throw new CampusError("not_found", "That student isn't in this course.", 404);
  const closed = periodClosed(store, item, input.userId);
  if (closed && !(a && a.roles.includes("admin"))) throw new CampusError("period_closed", `The ${closed.name} grading period is closed.`, 423);
  const existing = store.list("grades", (g) => g.assignmentId === item.id && g.userId === input.userId)[0];
  if (existing && input.ifVersion !== undefined && input.ifVersion !== existing.version) {
    const by = existing.graderId ? userName(store, existing.graderId as string) : "someone";
    throw new CampusError("precondition_failed", `Grade changed by ${by}. Reload to see the latest before saving.`, 412, { current: existing.version, by });
  }
  let raw = input.score;
  let rubricAssessment = existing?.rubricAssessment ?? null;
  if (input.rubric) {
    const rb = item.rubricId ? store.get("rubrics", item.rubricId as string) : undefined;
    if (!rb) throw new CampusError("invalid", "This assignment has no rubric.", 422);
    const criteria = (rb.criteria as { id: string; bands: { points: number }[]; range?: boolean }[]) ?? [];
    let total = 0;
    for (const c of criteria) {
      const v = input.rubric.ratings[c.id];
      if (v === undefined) continue;
      const max = Math.max(...c.bands.map((b) => b.points));
      if (c.range ? v < 0 || v > max : !c.bands.some((b) => b.points === v)) throw new CampusError("invalid", `Rating for "${c.id}" isn't one of the rubric's ratings.`, 422);
      total += v;
    }
    rubricAssessment = { rubricId: rb.id, version: rb.version ?? 1, ratings: input.rubric.ratings, comments: input.rubric.comments ?? {}, at: nowIso() };
    if (raw === undefined) raw = total;
  }
  const pts = Number(item.points ?? 0);
  if (raw !== undefined && raw !== null && (raw < 0 || raw > pts * 2)) throw new CampusError("invalid", `Score must be between 0 and ${pts * 2} (extra credit allowed up to double).`, 422);
  // Moderated grading: non-final graders leave provisional grades only.
  if (item.moderated && a && input.source !== "curve" && item.finalGraderId !== a.id && !a.roles.includes("admin")) {
    return store.tx(() => {
      const g = existing ?? store.insert("grades", { assignmentId: item.id, userId: input.userId, courseId, score: null, posted: false, provisional: [], moderationState: "provisional" }, "gr");
      const prov = ((g.provisional as { graderId: string; score: number; at: string }[]) ?? []).filter((p) => p.graderId !== a.id);
      prov.push({ graderId: a.id, score: Number(raw ?? 0), at: nowIso() });
      if (prov.length > Number(item.graderCount ?? 2)) throw new CampusError("grader_limit", "This assignment already has the maximum number of graders.", 409);
      const out = store.update("grades", g.id, { provisional: prov, moderationState: "provisional" });
      audit(store, a, "grades.provisional", `grades/${g.id}`);
      return out;
    });
  }
  return store.tx(() => {
    let score = raw === undefined ? ((existing?.enteredScore as number) ?? null) : raw;
    let late = { daysLate: 0, penaltyPct: 0 };
    if (score !== null && !input.excused && input.lateOverrideDays === undefined) {
      const lp = latePenalty(store, item, input.userId, score);
      late = lp;
      score = lp.score;
    } else if (score !== null && input.lateOverrideDays !== undefined) {
      const policy = (course(store, courseId).latePolicy as { latePctPerDay?: number; floorPct?: number }) ?? {};
      const penaltyPct = Math.min(100, input.lateOverrideDays * (policy.latePctPerDay ?? 0));
      late = { daysLate: input.lateOverrideDays, penaltyPct };
      score = Math.max(score - (penaltyPct / 100) * pts, Math.min(score, ((policy.floorPct ?? 0) / 100) * pts));
    }
    const autoPost = !input.holdForReview && postingMode(store, item) === "automatic";
    const values = {
      assignmentId: item.id,
      userId: input.userId,
      courseId,
      enteredScore: raw === undefined ? (existing?.enteredScore ?? null) : raw,
      score: input.excused ? null : score,
      excused: input.excused ?? existing?.excused ?? false,
      status: input.status ?? (input.excused ? "excused" : late.daysLate ? "late" : (existing?.status as string) ?? "none"),
      daysLate: late.daysLate,
      latePenaltyPct: late.penaltyPct,
      rubricAssessment,
      source: input.source ?? "manual",
      graderId: a?.id ?? "system",
      posted: input.holdForReview ? false : existing?.posted ? true : autoPost,
      postedAt: input.holdForReview ? null : (existing?.postedAt ?? (autoPost ? nowIso() : null)),
      moderationState: item.moderated ? "final" : null,
    };
    const before = existing ? { score: existing.score, excused: existing.excused, status: existing.status, posted: existing.posted } : null;
    const g = existing ? store.update("grades", existing.id, values) : store.insert("grades", values, "gr");
    store.insert("grade_history", { gradeId: g.id, courseId, assignmentId: item.id, userId: input.userId, graderId: a?.id ?? "system", before, after: { score: g.score, excused: g.excused, status: g.status, posted: g.posted }, reason: input.source ?? "manual" }, "gh");
    if (input.comment) store.insert("submission_comments", { submissionId: latestSubmission(store, item.id, input.userId)?.id ?? null, courseId, authorId: a?.id ?? "system", body: input.comment, hiddenUntilPosted: !g.posted, assignmentId: item.id, userId: input.userId }, "sc");
    store.emit("grades.changed", `grades/${g.id}`, { gradeId: g.id, courseId, assignmentId: item.id, userId: input.userId, posted: !!g.posted });
    if (g.posted && !before?.posted) store.emit("grades.posted", `grades/${g.id}`, { courseId, assignmentId: item.id, userIds: [input.userId] });
    if (!system) audit(store, a!, "grades.set", `grades/${g.id}`, `${before?.score ?? "–"}→${g.score ?? "–"}`);
    return g;
  });
}

/** Moderated grading: the final grader picks a provisional grade (or enters their own). */
export function selectProvisional(store: TenantStore, a: Actor, gradeId: string, graderId: string | null, score?: number) {
  const g = store.get("grades", gradeId);
  if (!g) throw new CampusError("not_found", "Grade not found", 404);
  const item = gradable(store, g.assignmentId as string)!;
  if (item.finalGraderId !== a.id && !a.roles.includes("admin")) throw new CampusError("forbidden", "Only the final grader selects grades.", 403);
  const pick = graderId ? ((g.provisional as { graderId: string; score: number }[]) ?? []).find((p) => p.graderId === graderId)?.score : score;
  if (pick === undefined) throw new CampusError("invalid", "Choose a provisional grade or enter one.", 422);
  return setGrade(store, { ...a, roles: [...a.roles] }, { assignmentId: g.assignmentId as string, userId: g.userId as string, score: pick, source: "manual" });
}

/** Explicit, audited posting. */
export function postGrades(store: TenantStore, a: Actor, assignmentId: string, opts: { sectionId?: string; gradedOnly?: boolean; hide?: boolean } = {}) {
  const item = gradable(store, assignmentId);
  if (!item) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, item.courseId as string, ["admin", "instructor", "ta"], opts.hide ? "grades.hide" : "grades.post");
  if (item.moderated && !opts.hide && store.list("grades", (g) => g.assignmentId === assignmentId && g.moderationState === "provisional").length) throw new CampusError("moderation_pending", "Select final grades before posting.", 409);
  const inSection = (uid: string) => !opts.sectionId || store.list("enrollments", (e) => e.userId === uid && e.sectionId === opts.sectionId && e.courseId === item.courseId).length > 0;
  return store.tx(() => {
    const changed: string[] = [];
    for (const g of store.list("grades", (g) => g.assignmentId === assignmentId && inSection(g.userId as string))) {
      if (opts.gradedOnly && (g.score === null || g.score === undefined) && !g.excused) continue;
      if (!!g.posted === !opts.hide) continue;
      store.update("grades", g.id, opts.hide ? { posted: false, postedAt: null } : { posted: true, postedAt: nowIso() });
      store.insert("grade_history", { gradeId: g.id, courseId: item.courseId, assignmentId, userId: g.userId, graderId: a.id, before: { posted: !opts.hide }, after: { posted: !opts.hide ? true : false }, reason: opts.hide ? "hide" : "post" }, "gh");
      changed.push(g.userId as string);
    }
    if (!opts.hide) {
      for (const c of store.list("submission_comments", (c) => c.assignmentId === assignmentId && !!c.hiddenUntilPosted && changed.includes(c.userId as string))) store.update("submission_comments", c.id, { hiddenUntilPosted: false });
      if (changed.length) store.emit("grades.posted", `assignments/${assignmentId}`, { courseId: item.courseId, assignmentId, userIds: changed });
    }
    audit(store, a, opts.hide ? "grades.hide" : "grades.post", `assignments/${assignmentId}`, `${changed.length} students${opts.sectionId ? ` section ${opts.sectionId}` : ""}`);
    return { count: changed.length };
  });
}

/** Grades as a student (or a consenting observer) may see them: posted only. */
export function visibleGrade(store: TenantStore, assignmentId: string, userId: string) {
  const g = store.list("grades", (x) => x.assignmentId === assignmentId && x.userId === userId)[0];
  if (!g || !g.posted) return { hidden: !!g, score: null, excused: false, status: g?.posted === false ? "hidden" : "none" };
  return { hidden: false, score: g.score as number | null, excused: !!g.excused, status: g.status as string, rubricAssessment: g.rubricAssessment };
}

/* ---------------- Totals ---------------- */

export interface ItemResult {
  id: string;
  title: string;
  groupId: string | null;
  points: number;
  score: number | null;
  status: CellStatus;
  counted: boolean;
  dropped: boolean;
  hidden: boolean;
  dueAt: string | null;
}

export function courseItems(store: TenantStore, courseId: string): Row[] {
  return [
    ...store.list("assignments", (x) => x.courseId === courseId && x.state === "published" && x.gradingType !== "not_graded" && x.displayGradeAs !== "not_graded"),
    ...store.list("quizzes", (x) => x.courseId === courseId && x.state === "published" && (x.kind ?? "graded") !== "practice" && x.kind !== "survey"),
  ];
}

/**
 * Totals for one student. `whatIf` overrides scores without saving (used by the student
 * What-If view). Unposted grades are excluded unless `includeUnposted` (staff view).
 */
export function computeTotals(store: TenantStore, courseId: string, userId: string, opts: { whatIf?: Record<string, number>; includeUnposted?: boolean } = {}) {
  const c = course(store, courseId);
  const groups = store.list("assignment_groups", (g) => g.courseId === courseId);
  const policy = (c.latePolicy as { missingScorePct?: number }) ?? {};
  const now = nowIso();
  const results: ItemResult[] = [];
  for (const item of courseItems(store, courseId)) {
    const dates = effectiveDates(store, item.dueAt === undefined ? { ...item, dueAt: item.availableUntil } : item, userId);
    if (!dates.assigned) continue;
    const g = store.list("grades", (x) => x.assignmentId === item.id && x.userId === userId)[0];
    const sub = latestSubmission(store, item.id, userId);
    const attempt = store.list("attempts", (x) => x.quizId === item.id && x.userId === userId && x.state !== "in_progress")[0];
    const due = dueFor(store, item, userId);
    const visible = !!g && (g.posted || opts.includeUnposted);
    let score: number | null = visible ? ((g!.score as number) ?? null) : null;
    let status: CellStatus = (g?.status as CellStatus) ?? "none";
    if (g?.excused) status = "excused";
    else if (!sub && !attempt && due && due < now && (!g || g.score === null || g.score === undefined)) {
      status = "missing";
      if (policy.missingScorePct !== undefined && policy.missingScorePct !== null) score = (Number(policy.missingScorePct) / 100) * Number(item.points ?? 0);
    } else if (sub && Number(sub.attempt) > 1 && g && toMs(sub.createdAt) > toMs(g.updatedAt)) status = "resubmitted";
    if (opts.whatIf && item.id in opts.whatIf) score = opts.whatIf[item.id];
    const counted = !g?.excused && score !== null && score !== undefined && !item.excludeFromFinal;
    results.push({ id: item.id, title: item.title as string, groupId: (item.groupId as string) ?? null, points: Number(item.points ?? 0), score, status, counted, dropped: false, hidden: !!g && !g.posted && !opts.includeUnposted, dueAt: due });
  }
  // Drop rules per group (by percentage), honoring "never drop".
  for (const grp of groups) {
    const items = results.filter((r) => r.groupId === grp.id && r.counted && r.points > 0 && !((grp.neverDrop as string[]) ?? []).includes(r.id));
    const byPct = [...items].sort((x, y) => x.score! / x.points - y.score! / y.points);
    const low = Number(grp.dropLowest ?? 0);
    const high = Number(grp.dropHighest ?? 0);
    const keepAtLeast = 1;
    const dropL = byPct.slice(0, Math.max(0, Math.min(low, items.length - keepAtLeast)));
    const dropH = byPct.slice().reverse().slice(0, Math.max(0, Math.min(high, items.length - keepAtLeast - dropL.length)));
    for (const r of [...dropL, ...dropH]) {
      r.dropped = true;
      r.counted = false;
      if (r.status === "none") r.status = "dropped";
    }
  }
  const counted = results.filter((r) => r.counted);
  const groupTotals = groups.map((grp) => {
    const rs = counted.filter((r) => r.groupId === grp.id);
    const earned = rs.reduce((s, r) => s + (r.score ?? 0), 0);
    const possible = rs.reduce((s, r) => s + r.points, 0);
    return { id: grp.id, name: grp.name as string, weight: Number(grp.weight ?? 0), earned, possible, pct: possible > 0 ? (earned / possible) * 100 : null };
  });
  const weighted = groups.some((g) => Number(g.weight ?? 0) > 0);
  let finalPct: number | null;
  if (weighted) {
    const active = groupTotals.filter((g) => g.pct !== null && g.weight > 0);
    const wsum = active.reduce((s, g) => s + g.weight, 0);
    finalPct = wsum > 0 ? active.reduce((s, g) => s + (g.pct! * g.weight) / wsum, 0) : null;
  } else {
    const earned = counted.reduce((s, r) => s + (r.score ?? 0), 0);
    const possible = counted.reduce((s, r) => s + r.points, 0);
    finalPct = possible > 0 ? (earned / possible) * 100 : null;
  }
  const override = store.list("final_overrides", (o) => o.courseId === courseId && o.userId === userId)[0];
  const scheme = c.gradingSchemeId ? store.get("grading_schemes", c.gradingSchemeId as string) : undefined;
  const letter = finalPct === null ? null : letterFor(scheme, finalPct);
  return { userId, items: results, groups: groupTotals, finalPct: finalPct === null ? null : Math.round(finalPct * 100) / 100, letter, override: override?.grade ?? null, hideTotals: !!c.hideTotals };
}

export function letterFor(scheme: Row | undefined, pct: number): string {
  const bands = ((scheme?.bands as { label: string; min: number }[]) ?? [
    { label: "A", min: 90 },
    { label: "B", min: 80 },
    { label: "C", min: 70 },
    { label: "D", min: 60 },
    { label: "F", min: 0 },
  ]).slice().sort((a, b) => b.min - a.min);
  return bands.find((b) => pct >= b.min)?.label ?? bands[bands.length - 1].label;
}

export function setFinalOverride(store: TenantStore, a: Actor, courseId: string, userId: string, grade: string | null) {
  requireCourse(store, a, courseId, ["admin", "instructor"], "grades.final_override");
  return store.tx(() => {
    const ex = store.list("final_overrides", (o) => o.courseId === courseId && o.userId === userId)[0];
    const out = ex ? (grade ? store.update("final_overrides", ex.id, { grade }) : store.tombstone("final_overrides", ex.id)) : store.insert("final_overrides", { courseId, userId, grade }, "fo");
    store.insert("grade_history", { gradeId: out.id, courseId, assignmentId: "final", userId, graderId: a.id, before: { grade: ex?.grade ?? null }, after: { grade }, reason: "final_override" }, "gh");
    audit(store, a, "grades.final_override", `courses/${courseId}`, `${userId}:${grade}`);
    return out;
  });
}

/* ---------------- Gradebook grid (teacher spreadsheet) ---------------- */

export function gradebookGrid(store: TenantStore, a: Actor, courseId: string, f: { sectionId?: string; groupId?: string; moduleId?: string; periodId?: string; studentGroupId?: string; showUnpublished?: boolean; sort?: "due" | "points" | "module" | "title" } = {}) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "gradebook.view");
  let items = f.showUnpublished ? [...store.list("assignments", (x) => x.courseId === courseId), ...store.list("quizzes", (x) => x.courseId === courseId)] : courseItems(store, courseId);
  if (f.groupId) items = items.filter((i) => i.groupId === f.groupId);
  if (f.moduleId) items = items.filter((i) => i.moduleId === f.moduleId);
  if (f.periodId) {
    const p = store.get("grading_periods", f.periodId);
    if (p) items = items.filter((i) => i.dueAt && String(i.dueAt) >= String(p.startsAt) && String(i.dueAt) <= String(p.endsAt));
  }
  const sort = f.sort ?? "due";
  items.sort((x, y) => (sort === "points" ? Number(y.points) - Number(x.points) : sort === "title" ? String(x.title).localeCompare(String(y.title)) : sort === "module" ? String(x.moduleId ?? "").localeCompare(String(y.moduleId ?? "")) : String(x.dueAt ?? "9").localeCompare(String(y.dueAt ?? "9"))));
  let students = activeStudents(store, courseId, f.sectionId);
  if (f.studentGroupId) {
    const g = store.get("groups", f.studentGroupId);
    students = students.filter((s) => ((g?.memberIds as string[]) ?? []).includes(s.userId as string));
  }
  const rows = students.map((e) => {
    const u = store.get("users", e.userId as string)!;
    const t = computeTotals(store, courseId, u.id, { includeUnposted: true });
    return {
      userId: u.id,
      name: u.name as string,
      sisId: (u.sisId as string) ?? null,
      email: u.email as string,
      section: store.get("sections", e.sectionId as string)?.code ?? null,
      cells: Object.fromEntries(
        items.map((i) => {
          const g = store.list("grades", (x) => x.assignmentId === i.id && x.userId === u.id)[0];
          const r = t.items.find((x) => x.id === i.id);
          return [i.id, { score: (g?.score as number) ?? null, status: r?.status ?? "none", posted: !!g?.posted, version: g?.version ?? null, gradeId: g?.id ?? null, excused: !!g?.excused, dueAt: dueFor(store, i, u.id), assigned: effectiveDates(store, i, u.id).assigned }];
        }),
      ),
      groups: t.groups,
      finalPct: t.finalPct,
      letter: t.letter,
      override: t.override,
      note: store.list("gradebook_notes", (n) => n.courseId === courseId && n.userId === u.id)[0]?.body ?? null,
    };
  });
  return { columns: items.map((i) => ({ id: i.id, title: i.title as string, points: Number(i.points ?? 0), dueAt: (i.dueAt as string) ?? null, groupId: (i.groupId as string) ?? null, published: i.state === "published", kind: store.get("quizzes", i.id) ? "quiz" : "assignment", anonymous: !!i.anonymousGrading, posting: postingMode(store, i) })), rows, groups: store.list("assignment_groups", (g) => g.courseId === courseId) };
}

/** Curve: scale scores linearly so the class average hits the target, capped at full points. */
export function curve(store: TenantStore, a: Actor, assignmentId: string, targetAvgPct: number) {
  const item = gradable(store, assignmentId);
  if (!item) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, item.courseId as string, ["admin", "instructor"], "grades.curve");
  const graded = store.list("grades", (g) => g.assignmentId === assignmentId && g.score !== null && g.score !== undefined && !g.excused);
  if (!graded.length) throw new CampusError("nothing", "No grades to curve.", 409);
  const pts = Number(item.points);
  const avg = graded.reduce((s, g) => s + Number(g.score), 0) / graded.length;
  if (avg <= 0) throw new CampusError("nothing", "Average is zero; can't curve.", 409);
  const factor = ((targetAvgPct / 100) * pts) / avg;
  for (const g of graded) setGrade(store, a, { assignmentId, userId: g.userId as string, score: Math.min(pts, Math.round(Number(g.enteredScore ?? g.score) * factor * 100) / 100), source: "curve" });
  return { factor: Math.round(factor * 1000) / 1000, count: graded.length };
}

export function defaultGrade(store: TenantStore, a: Actor, assignmentId: string, score: number, overwrite = false) {
  const item = gradable(store, assignmentId);
  if (!item) throw new CampusError("not_found", "Assignment not found", 404);
  requireCourse(store, a, item.courseId as string, ["admin", "instructor", "ta"], "grades.default");
  let n = 0;
  for (const e of activeStudents(store, item.courseId as string)) {
    const g = store.list("grades", (x) => x.assignmentId === assignmentId && x.userId === e.userId)[0];
    if (g && g.score !== null && g.score !== undefined && !overwrite) continue;
    setGrade(store, a, { assignmentId, userId: e.userId as string, score, source: "default" });
    n++;
  }
  return { count: n };
}

/** "Message students who…" — returns recipients and sends individual conversations. */
export function messageStudentsWho(store: TenantStore, a: Actor, assignmentId: string, criterion: "not_submitted" | "not_graded" | "scored_below" | "scored_above", value: number | undefined, subject: string, body: string) {
  const item = gradable(store, assignmentId);
  if (!item) throw new CampusError("not_found", "Assignment not found", 404);
  const courseId = item.courseId as string;
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "grades.message_students_who");
  const ids = activeStudents(store, courseId)
    .map((e) => e.userId as string)
    .filter((uid) => {
      const g = store.list("grades", (x) => x.assignmentId === assignmentId && x.userId === uid)[0];
      const sub = latestSubmission(store, assignmentId, uid) ?? store.list("attempts", (x) => x.quizId === assignmentId && x.userId === uid && x.state !== "in_progress")[0];
      if (criterion === "not_submitted") return !sub;
      if (criterion === "not_graded") return !!sub && (!g || g.score === null || g.score === undefined);
      const pct = g?.score !== null && g?.score !== undefined ? (Number(g.score) / Number(item.points || 1)) * 100 : null;
      if (criterion === "scored_below") return pct !== null && pct < Number(value);
      return pct !== null && pct > Number(value);
    });
  return store.tx(() => {
    for (const uid of ids) {
      store.insert("conversations", { courseId, subject, participantIds: [a.id, uid], messages: [{ id: `m_${Date.now()}_${uid}`, authorId: a.id, body, at: nowIso() }], state: { [a.id]: { folder: "sent", read: true }, [uid]: { folder: "inbox", read: false } } }, "cv");
    }
    notify(store, ids, "conversations", subject, body.slice(0, 200), "/campus/{tenant}/inbox", courseId);
    audit(store, a, "grades.message_students_who", `assignments/${assignmentId}`, `${criterion}:${ids.length}`);
    return { recipients: ids.length };
  });
}

/* ---------------- CSV export / import ---------------- */

export function exportCsv(store: TenantStore, a: Actor, courseId: string): string {
  const grid = gradebookGrid(store, a, courseId, {});
  const cols = ["Student", "ID", "SIS ID", "Section", ...grid.columns.map((c) => `${c.title} (${c.id})`), "Final %", "Final grade"];
  const rows = grid.rows.map((r) => ({ Student: r.name, ID: r.userId, "SIS ID": r.sisId ?? "", Section: r.section ?? "", ...Object.fromEntries(grid.columns.map((c) => [`${c.title} (${c.id})`, r.cells[c.id].excused ? "EX" : (r.cells[c.id].score ?? "")])), "Final %": r.finalPct ?? "", "Final grade": r.override ?? r.letter ?? "" }));
  audit(store, a, "grades.export_csv", `courses/${courseId}`);
  return csv(rows, cols);
}

/** Parse a CSV and return the changes it would make (preview). `apply` writes them. */
export function importCsv(store: TenantStore, a: Actor, courseId: string, text: string, apply = false) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "grades.import_csv");
  const rows = parseCsv(text);
  const changes: { userId: string; name: string; assignmentId: string; title: string; from: number | string | null; to: number | string | null; version: number | null }[] = [];
  const errors: string[] = [];
  for (const r of rows) {
    const uid = r.ID;
    if (!uid || !store.list("enrollments", (e) => e.userId === uid && e.courseId === courseId && e.role === "student").length) {
      errors.push(`Unknown student ${r.Student ?? uid}`);
      continue;
    }
    for (const [k, v] of Object.entries(r)) {
      const m = k.match(/\(([a-z]+_[A-Z0-9]+)\)$/);
      if (!m) continue;
      const item = gradable(store, m[1]);
      if (!item || item.courseId !== courseId) continue;
      const g = store.list("grades", (x) => x.assignmentId === item.id && x.userId === uid)[0];
      const from = g?.excused ? "EX" : ((g?.score as number) ?? null);
      const to = v === "" ? null : v.toUpperCase() === "EX" ? "EX" : Number(v);
      if (typeof to === "number" && Number.isNaN(to)) {
        errors.push(`Invalid score "${v}" for ${r.Student} on ${item.title}`);
        continue;
      }
      if (String(from ?? "") !== String(to ?? "")) changes.push({ userId: uid, name: r.Student, assignmentId: item.id, title: item.title as string, from, to, version: (g?.version as number) ?? null });
    }
  }
  if (apply) {
    for (const c of changes) {
      if (c.to === null) continue;
      setGrade(store, a, { assignmentId: c.assignmentId, userId: c.userId, ...(c.to === "EX" ? { excused: true } : { score: c.to as number }), source: "csv", ...(c.version !== null ? { ifVersion: c.version } : {}) });
    }
  }
  return { changes, errors, applied: apply };
}

/* ---------------- History ---------------- */

export function history(store: TenantStore, a: Actor, courseId: string, f: { userId?: string; assignmentId?: string; graderId?: string; from?: string; to?: string } = {}) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "grades.history");
  return store
    .list("grade_history", (h) => h.courseId === courseId && (!f.userId || h.userId === f.userId) && (!f.assignmentId || h.assignmentId === f.assignmentId) && (!f.graderId || h.graderId === f.graderId) && (!f.from || String(h.createdAt) >= f.from) && (!f.to || String(h.createdAt) <= f.to))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
    .map((h) => ({ ...h, grader: h.graderId === "system" ? "System" : userName(store, h.graderId as string), student: userName(store, h.userId as string), assignment: gradable(store, h.assignmentId as string)?.title ?? (h.assignmentId === "final" ? "Final grade override" : h.assignmentId) }));
}

/* ---------------- Rubrics ---------------- */

registerHooks("rubrics", {
  beforeWrite(store, _a, values, existing) {
    if (values.criteria !== undefined) {
      const cs = values.criteria as { id?: string; name?: string; bands?: { label?: string; points?: number; description?: string }[] }[];
      if (!Array.isArray(cs) || !cs.length) throw new CampusError("invalid", "Add at least one criterion.", 422);
      cs.forEach((c, i) => {
        if (!c.id || !c.name || !Array.isArray(c.bands) || !c.bands.length) throw new CampusError("invalid", `Criterion ${i + 1} needs an id, name and at least one rating.`, 422);
        for (const b of c.bands) if (typeof b.points !== "number" || !b.label) throw new CampusError("invalid", `Criterion "${c.name}" has a rating without a label or points.`, 422);
      });
    }
    if (existing) {
      const used = store.list("grades", (g) => (g.rubricAssessment as { rubricId?: string } | null)?.rubricId === existing.id).length;
      if (used) throw new CampusError("rubric_locked", "This rubric has been used for grading. Create a new version to change it.", 409);
    } else values.version = values.version ?? 1;
  },
});

export function newRubricVersion(store: TenantStore, a: Actor, rubricId: string) {
  const r = store.get("rubrics", rubricId);
  if (!r) throw new CampusError("not_found", "Rubric not found", 404);
  if (!hasAny(a, ["admin", "instructor", "designer", "ta"])) throw new CampusError("forbidden", "You can't edit rubrics.", 403);
  return store.tx(() => {
    const v = store.insert("rubrics", { title: r.title, courseId: r.courseId ?? null, style: r.style, criteria: r.criteria, version: Number(r.version ?? 1) + 1, previousId: r.id, state: "unpublished", hideScoreTotal: r.hideScoreTotal ?? false, freeFormComments: r.freeFormComments ?? false }, "rb");
    for (const asg of store.list("assignments", (x) => x.rubricId === r.id && !store.list("grades", (g) => g.assignmentId === x.id).length)) store.update("assignments", asg.id, { rubricId: v.id });
    store.emit("rubrics.versioned", `rubrics/${v.id}`, { id: v.id, previousId: r.id });
    audit(store, a, "rubrics.new_version", `rubrics/${r.id}`, `v${v.version}`);
    return v;
  });
}

/* ---------------- Annotations & comments ---------------- */

export function annotate(store: TenantStore, a: Actor, submissionId: string, input: { type: "point" | "highlight" | "strikeout" | "freehand" | "text" | "area"; page: number; coords: number[]; comment?: string; quote?: string }) {
  const s = store.get("submissions", submissionId);
  if (!s) throw new CampusError("not_found", "Submission not found", 404);
  const courseId = s.courseId as string;
  const own = s.userId === a.id && s.mode === "annotation";
  if (!own && !isGrader(a, courseId)) throw new CampusError("forbidden", "You can't annotate this submission.", 403);
  if (!["point", "highlight", "strikeout", "freehand", "text", "area"].includes(input.type)) throw new CampusError("invalid", "Unknown annotation type.", 422);
  return store.tx(() => {
    const ann = store.insert("annotations", { submissionId, fileId: s.fileId ?? null, courseId, authorId: a.id, type: input.type, page: Math.max(1, Number(input.page) || 1), coords: input.coords ?? [], comment: (input.comment ?? "").slice(0, 2000), quote: input.quote ?? null }, "ann");
    store.emit("annotations.created", `submissions/${submissionId}`, { submissionId, courseId });
    return ann;
  });
}

export function comment(store: TenantStore, a: Actor, submissionId: string, body: string, opts: { mediaUrl?: string; fileIds?: string[]; libraryId?: string } = {}) {
  const s = store.get("submissions", submissionId);
  if (!s) throw new CampusError("not_found", "Submission not found", 404);
  const courseId = s.courseId as string;
  const grader = isGrader(a, courseId);
  if (!grader && s.userId !== a.id) throw new CampusError("forbidden", "You can't comment here.", 403);
  let text = body;
  if (opts.libraryId) {
    const lib = store.get("comment_library", opts.libraryId);
    if (!lib || lib.userId !== a.id) throw new CampusError("not_found", "Saved comment not found", 404);
    text = lib.text as string;
  }
  if (!text?.trim() && !opts.mediaUrl && !opts.fileIds?.length) throw new CampusError("invalid", "Write a comment or attach something.", 422);
  const item = gradable(store, s.assignmentId as string)!;
  const g = store.list("grades", (x) => x.assignmentId === item.id && x.userId === s.userId)[0];
  return store.tx(() => {
    const c = store.insert("submission_comments", { submissionId, courseId, authorId: a.id, body: text, mediaUrl: opts.mediaUrl ?? null, fileIds: opts.fileIds ?? [], hiddenUntilPosted: grader && postingMode(store, item) === "manual" && !g?.posted, assignmentId: item.id, userId: s.userId }, "sc");
    store.emit("submission_comments.created", `submissions/${submissionId}`, { submissionId, courseId, userId: s.userId, authorId: a.id, hidden: !!c.hiddenUntilPosted });
    if (!c.hiddenUntilPosted && grader) notify(store, [s.userId as string], "submission_comments", `New comment on ${item.title}`, text.slice(0, 200), `/campus/{tenant}/courses/${courseId}/assignments/${item.id}`, courseId);
    return c;
  });
}

export function commentsFor(store: TenantStore, a: Actor, submissionId: string) {
  const s = store.get("submissions", submissionId);
  if (!s) throw new CampusError("not_found", "Submission not found", 404);
  const grader = isGrader(a, s.courseId as string);
  if (!grader && s.userId !== a.id) throw new CampusError("forbidden", "Not your submission.", 403);
  return store.list("submission_comments", (c) => c.submissionId === submissionId && (grader || !c.hiddenUntilPosted)).map((c) => ({ ...c, author: userName(store, c.authorId as string) }));
}

/* ---------------- Learning mastery ---------------- */

export type MasteryMethod = "decaying_average" | "n_mastery" | "latest" | "highest" | "average";

export function masteryScore(scores: number[], method: MasteryMethod, threshold: number, n = 2): number | null {
  if (!scores.length) return null;
  switch (method) {
    case "latest":
      return scores[scores.length - 1];
    case "highest":
      return Math.max(...scores);
    case "average":
      return scores.reduce((s, x) => s + x, 0) / scores.length;
    case "n_mastery": {
      const hits = scores.filter((x) => x >= threshold);
      return hits.length >= n ? hits.slice(-n).reduce((s, x) => s + x, 0) / n : scores.reduce((s, x) => s + x, 0) / scores.length;
    }
    default: {
      if (scores.length === 1) return scores[0];
      const prev = scores.slice(0, -1).reduce((s, x) => s + x, 0) / (scores.length - 1);
      return 0.65 * scores[scores.length - 1] + 0.35 * prev;
    }
  }
}

/** Outcome results per student from rubric criteria and quiz questions aligned to outcomes. */
export function outcomeResults(store: TenantStore, courseId: string, userId: string) {
  // Account-level outcomes plus this course's own; another course's outcomes never appear.
  const outcomes = store.list("outcomes", (o) => !o.courseId || o.courseId === courseId);
  const out: { outcomeId: string; code: string; title: string; scores: number[]; mastery: number | null; mastered: boolean; method: string; rating?: { label: string; points: number } | null }[] = [];
  for (const o of outcomes) {
    const scores: number[] = [];
    for (const g of store.list("grades", (x) => x.courseId === courseId && x.userId === userId && !!x.posted && !!x.rubricAssessment).sort((x, y) => String(x.updatedAt).localeCompare(String(y.updatedAt)))) {
      const ra = g.rubricAssessment as { rubricId: string; ratings: Record<string, number> };
      const rb = store.get("rubrics", ra.rubricId);
      for (const c of (rb?.criteria as { id: string; outcomeId?: string; bands: { points: number }[] }[]) ?? []) {
        const aligned = c.outcomeId === o.id || store.list("outcome_alignments", (al) => al.outcomeId === o.id && al.targetType === "rubric_criterion" && al.targetId === `${rb!.id}:${c.id}`).length > 0;
        if (aligned && ra.ratings[c.id] !== undefined) scores.push((ra.ratings[c.id] / Math.max(...c.bands.map((b) => b.points))) * 100);
      }
    }
    for (const at of store.list("attempts", (x) => x.courseId === courseId && x.userId === userId && x.state === "graded")) {
      const res = (at.results as Record<string, { points: number; max: number }>) ?? {};
      for (const [qid, r] of Object.entries(res)) {
        const q = store.get("questions", qid);
        if (q && (q.outcomeId === o.id || store.list("outcome_alignments", (al) => al.outcomeId === o.id && al.targetType === "question" && al.targetId === qid).length) && r.max > 0) scores.push((r.points / r.max) * 100);
      }
    }
    if (!scores.length) continue;
    const scale = o.scaleId ? store.get("mastery_scales", String(o.scaleId)) : undefined;
    const threshold = scale ? (Number(scale.masteryPoints) / (Number((scale.ratings as Rating[])[0]?.points) || 1)) * 100 : Number(o.masteryThreshold ?? 70);
    const m = masteryScore(scores, (o.calculationMethod as MasteryMethod) ?? "decaying_average", threshold, Number(o.nMastery ?? 2));
    const rating = scale && m !== null ? ratingFor({ ratings: scale.ratings as Rating[], masteryPoints: Number(scale.masteryPoints) }, m) : null;
    out.push({ outcomeId: o.id, code: o.code as string, title: o.title as string, scores, mastery: m === null ? null : Math.round(m * 10) / 10, mastered: rating ? rating.mastered : m !== null && m >= threshold, method: (o.calculationMethod as string) ?? "decaying_average", rating: rating ? { label: rating.label, points: rating.points } : null });
  }
  return out;
}

export function masteryGradebook(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta", "designer"], "outcomes.mastery_gradebook");
  return activeStudents(store, courseId).map((e) => ({ userId: e.userId, name: userName(store, e.userId as string), results: outcomeResults(store, courseId, e.userId as string) }));
}

/* ---------------- Consumers ---------------- */

registerConsumer({
  name: "observer-alerts",
  types: ["grades.posted", "announcements.published", "student.missing"],
  handle(store, e) {
    const affected: string[] = e.type === "grades.posted" ? ((e.data.userIds as string[]) ?? []) : e.type === "student.missing" ? [String(e.data.userId)] : activeStudents(store, String(e.data.courseId)).map((x) => x.userId as string);
    for (const sid of affected) {
      for (const link of store.list("observer_links", (l) => l.studentId === sid)) {
        const consent = store.list("consents", (c) => c.studentId === sid && c.observerId === link.observerId && (!c.expiresAt || String(c.expiresAt) >= nowIso().slice(0, 10)));
        if (!consent.length) continue;
        let alert: { kind: string; title: string; refId: string } | null = null;
        if (e.type === "grades.posted" && link.alertGradeBelow !== undefined && link.alertGradeBelow !== null) {
          const g = store.list("grades", (x) => x.assignmentId === e.data.assignmentId && x.userId === sid)[0];
          const item = gradable(store, String(e.data.assignmentId));
          const pct = g && item && Number(item.points) > 0 ? (Number(g.score) / Number(item.points)) * 100 : null;
          if (pct !== null && pct < Number(link.alertGradeBelow)) alert = { kind: "grade_below", title: `${userName(store, sid)} scored ${Math.round(pct)}% on ${item!.title}`, refId: String(e.data.assignmentId) };
        } else if (e.type === "student.missing" && link.alertMissing) alert = { kind: "missing", title: `${userName(store, sid)} is missing ${e.data.title}`, refId: String(e.data.assignmentId) };
        else if (e.type === "announcements.published" && link.alertAnnouncements) alert = { kind: "announcement", title: `New announcement in ${course(store, String(e.data.courseId)).title}`, refId: String(e.data.id) };
        if (alert && !store.list("observer_alerts", (x) => x.observerId === link.observerId && x.refId === alert!.refId && x.kind === alert!.kind && x.studentId === sid).length) {
          store.insert("observer_alerts", { observerId: link.observerId, studentId: sid, ...alert }, "oba");
          notify(store, [link.observerId as string], "observer_alerts", alert.title, alert.title, "/campus/{tenant}/observers");
        }
      }
    }
  },
});

/** Job: emit `student.missing` once per missing item (feeds observer alerts and analytics). */
export function missingJob(store: TenantStore) {
  let n = 0;
  store.tx(() => {
    for (const c of store.list("courses", (x) => x.state === "published")) {
      for (const e of activeStudents(store, c.id)) {
        const t = computeTotals(store, c.id, e.userId as string, { includeUnposted: true });
        for (const r of t.items.filter((x) => x.status === "missing")) {
          const key = `missing:${r.id}:${e.userId}`;
          if (store.list("job_marks", (m) => m.key === key).length) continue;
          store.insert("job_marks", { key }, "jm");
          store.emit("student.missing", `users/${e.userId}`, { userId: e.userId, assignmentId: r.id, title: r.title, courseId: c.id });
          n++;
        }
      }
    }
  });
  return n;
}
