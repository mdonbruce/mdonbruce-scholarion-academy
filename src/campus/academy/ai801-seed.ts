import { CampusError, sha256, type Row, type TenantStore } from "../core";
import { actorFor, type Actor } from "../iam";
import { releaseRun, startRun } from "../services/studio";
import { studioInputFor } from "../services/learnarea";
import { InfraFailure, submit, upsertItem } from "../services/graded";
import { getWorkspace, savePolicyVersion, snapshotForSubmission } from "../services/workspace";
import { AI801, AI801_ACTIVITY, AI801_BRIEF, AI801_MINILABS, AI801_PROJECT_ARTIFACTS, AI801_QUIZ, AI801_TOPICS, AI801_WORKSHEET, MINILAB_RUBRIC, PROJECT_RUBRIC, QUIZ_RUBRIC, WORKSHEET_RUBRIC } from "./ai801";

/**
 * Seeds the sample hosted learning area: course AI-801, Module 1, its instructor sources, the
 * graded mini-labs, course quiz, activity worksheet and workspace project, plus the bounded
 * execution policy for its labs. Idempotent: running it again changes nothing.
 */

export const AI801_PROJECT_KEY = "m01-activity-project";
export const AI801_LAB_KEY = "m01-guest-services";
export const AI801_MODULE = "Module_01";

export function ensureAI801(store: TenantStore) {
  const slug = store.tenantId.replace(/^tn_/, "");
  const courseId = AI801.courseId.replace("academy", slug);
  if (store.get("courses", courseId)) return courseId;
  const u = (k: string) => `usr_${slug}_${k}`;
  const staff = [u("lead"), u("instructor")].filter((id) => store.get("users", id));
  const students = [1, 2, 3, 4].map((n) => u(`student${n}`)).filter((id) => store.get("users", id));
  store.tx(() => {
    store.insert("courses", { id: courseId, code: AI801.code, title: AI801.title, description: AI801.description, credits: 0, state: "published", homeType: "modules", visibility: "course", timeZone: "Africa/Lagos", latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 }, program: AI801.program, level: AI801.level, competencies: AI801.competencies, learningArea: true, leadFaculty: "martins-idahosa" }, "crs");
    for (const uid of staff) store.insert("enrollments", { userId: uid, courseId, role: "instructor", state: "active", source: "manual" }, "enr");
    for (const uid of students) store.insert("enrollments", { userId: uid, courseId, role: "student", state: "active", source: "manual" }, "enr");
    const mod = store.insert("modules", { courseId, title: `Module 1: ${AI801.module.title}`, position: 1, moduleKey: "ai801-m01", state: "published", requireAll: false, objectives: AI801.module.objectives }, "mod");
    store.insert("assignment_groups", { courseId, name: "Graded work", weight: 100 }, "ag");
    // Instructor-supplied sources (the brief and one note per topic). Stored as data, never instructions.
    const src = (topic: string, title: string, text: string) =>
      store.insert("studio_sources", { courseKey: courseId, module: 1, topic, kind: "text", title, url: null, filename: null, author: "Dr. Martins Idahosa", year: "2026", text, status: "available", reason: null, addedBy: staff[0] ?? "system", checksum: sha256(`text\n\n${text}`) }, "ssrc");
    src("Module overview", "Module 1 brief (instructor-supplied)", AI801_BRIEF);
    for (const t of AI801_TOPICS) src(t.title, `${t.title} — instructor notes`, t.source);
    let pos = 0;
    const item = (kind: string, refId: string, title: string) => store.insert("module_items", { courseId, moduleId: mod.id, kind, refId, title, position: ++pos, indent: 0, requirement: "submit", state: "published" }, "mi");
    // Mini-labs: two per topic.
    for (const t of AI801_TOPICS) {
      AI801_MINILABS[t.key].forEach((lab, i) => {
        const gi = upsertItem(store, null, { courseId, module: AI801_MODULE, topic: t.title, key: `m01-${t.key}-minilab-${i + 1}`, kind: "minilab", title: lab.title, instructions: `${lab.mode === "guided" ? "Guided" : "Apply / debug"} mini-lab for “${t.title}”. Practice as often as you like; two graded attempts, best counts, pass mark 70%.`, rubric: MINILAB_RUBRIC(t.lo), evaluator: { tasks: lab.tasks }, competencies: [t.competency] });
        item("graded_item", gi.id, lab.title);
      });
    }
    const quiz = upsertItem(store, null, { courseId, module: AI801_MODULE, key: "m01-course-quiz", kind: "quiz", title: "Module 1 graded quiz", instructions: "Ten questions covering all four topics. Two graded attempts; attempt 2 uses different question variants. Check Answers opens after grading.", rubric: QUIZ_RUBRIC, evaluator: { questions: AI801_QUIZ }, competencies: ["C1", "C2"] });
    item("graded_item", quiz.id, "Module 1 graded quiz");
    const ws = upsertItem(store, null, { courseId, module: AI801_MODULE, key: "m01-activity-worksheet", kind: "worksheet", title: "Activity worksheet: Guest Services Agent Architecture", instructions: "Ten questions about the in-class activity: six objective items and four short answers scored on evidence of the required ideas.", rubric: WORKSHEET_RUBRIC, evaluator: { questions: AI801_WORKSHEET.objective, shortAnswers: AI801_WORKSHEET.short }, competencies: ["C3", "C4"] });
    item("graded_item", ws.id, ws.title as string);
    const proj = upsertItem(store, null, { courseId, module: AI801_MODULE, key: AI801_PROJECT_KEY, kind: "project", title: "Workspace project: Guest services agent (Haven Hospitality sandbox)", instructions: `${AI801_ACTIVITY.context} Deliverables: ${AI801_ACTIVITY.deliverables.join(", ")}. Submit from your saved workspace; the files are frozen as a snapshot and graded against the rubric.`, rubric: PROJECT_RUBRIC, evaluator: { artifacts: AI801_PROJECT_ARTIFACTS }, competencies: ["C2", "C5"] });
    item("graded_item", proj.id, proj.title as string);
    // Bounded execution policy for the lab (instructor-editable; changes apply to future runs only).
    savePolicyVersion(store, courseId, AI801_LAB_KEY, { tools: { EXECUTE_BASH: true, FILE_READ: true, FILE_WRITE: true, HTTP_REQUEST: true }, limits: { maxSteps: 200, costUnits: 100 } }, staff[0] ?? "system");
    store.insert("posting_policies", { courseId, mode: "automatic" }, "pp");
  });
  // One Studio package generated and released for the first topic so learners see a complete
  // example; the instructor generates the other topics from the Lecture Studio.
  if (staff[0]) {
    const inst = actorFor(store, staff[0], true);
    const run = startRun(store, inst, studioInputFor(store, courseId, "perception"), { render: false });
    if (run.state === "completed" || run.state === "needs_configuration") { try { releaseRun(store, inst, run.id); } catch (e) { console.warn("[seed] studio release skipped:", (e as Error).message); } }
  }
  return courseId;
}

/** Submit the workspace project: freeze the workspace as a snapshot, then grade that snapshot. */
export function submitProject(store: TenantStore, a: Actor, itemId: string, wsId: string, idempotencyKey: string) {
  const item = store.get("graded_items", itemId);
  if (!item) throw new CampusError("not_found", "Assessment not found", 404);
  // Access is checked before any attempt is recorded: another learner's workspace is a 403, not an attempt.
  const first = getWorkspace(store, a, wsId) as { courseId?: string };
  if (first.courseId !== item.courseId) throw new CampusError("invalid", "Submit a workspace from this course.", 422);
  return submit(store, a, itemId, { workspaceId: wsId }, idempotencyKey, () => {
    let ws: { status?: string } | null = null;
    try {
      ws = getWorkspace(store, a, wsId) as { status?: string };
    } catch {
      throw new InfraFailure("Your workspace could not be loaded for grading.");
    }
    if (ws?.status === "paused_by_instructor") throw new InfraFailure("The lab is paused by your instructor; grading will resume when it reopens.");
    const snap = snapshotForSubmission(store, a, wsId, String(item.key));
    return { files: snap.files, snapshotId: snap.id };
  });
}

export function ai801CourseId(store: TenantStore) {
  return AI801.courseId.replace("academy", store.tenantId.replace(/^tn_/, ""));
}

export type { Row };
