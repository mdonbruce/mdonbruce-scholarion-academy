import { CampusError, nowIso, type Row, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { copyCheck } from "../claims";
import { audit } from "../common";
import { zip } from "../files";
import {
  buildLabSpecs,
  buildModel,
  buildQuiz,
  checkMiniLab,
  contentChecksum,
  genAssessmentsRubrics,
  genLabsDemos,
  genLessonsReadings,
  genManifest,
  genMapOutcomes,
  genRenderPlaceholders,
  genStudioTextVisual,
  genValidate,
  quizFiles,
  requirementsSegments,
  topicRoot,
  type Model,
  type OutputView,
} from "./generate";
import { renderSegmentPreview, type RenderResult } from "./render";
import { addSource as addSourceImpl, canGenerate, canSeeInstructor, genSources, isLearnerOf, listSources as listSourcesImpl, requireGenerate } from "./sources";
import { DRAFT_LABEL, STEP_KEYS, type Access, type AddSourceInput, type Fetcher, type GeneratedFile, type LabCheckResult, type LabSpec, type RunStep, type StepKey, type StudioInput, type StudioSource } from "./types";

/**
 * Course Studio pipeline: a resumable, step-by-step run that turns a topic's sources into a
 * versioned output set.
 *
 *   validate_inputs → map_outcomes → lessons_readings → assessments_rubrics → labs_demos →
 *   studio_text_visual → render_media → validate_artifacts → save_output_set → publish_to_course
 *
 * - Each step's outputs are written in one transaction; a failing step leaves nothing behind.
 * - Resuming retries only failed / incomplete steps; completed steps are skipped, and re-writing
 *   an identical output is a no-op (no duplicates).
 * - Regeneration starts a new output-set version; earlier versions are kept.
 * - Outputs an instructor edited (`editedBy`) are never overwritten: a new row is written
 *   alongside and flagged `conflict`.
 * - Learners only ever see learner-access files, and only after an instructor releases the set.
 */

export const RUNS = "studio_runs";
export const OUTPUTS = "studio_outputs";

export interface PipelineOptions {
  /** Test/ops hook: make a step throw (by key, or by predicate). */
  failAt?: StepKey | ((step: StepKey, attempt: number) => boolean);
  /** Render the silent requirements-video preview when ffmpeg is available (default true). */
  render?: boolean;
  /** Override ffmpeg/font detection (tests). */
  ffmpeg?: string;
  env?: NodeJS.ProcessEnv;
}

type RunRow = Row & {
  courseKey: string;
  module: number;
  topic: string;
  input: StudioInput;
  sourceIds: string[];
  steps: RunStep[];
  state: string;
  outputsVersion: number;
  root: string;
  createdBy: string;
  reviewState?: string;
  releasedAt?: string | null;
  quizStems?: string[];
  quizSets?: number;
};

/* ---------------- Validation ---------------- */

const str = (v: unknown, max: number, name: string, required = true) => {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (required && !s) throw new CampusError("invalid", `${name} is required.`);
  if (s.length > max) throw new CampusError("invalid", `${name} must be at most ${max} characters.`);
  return s;
};

export function normalizeInput(raw: StudioInput): StudioInput {
  const moduleNumber = Number(raw?.moduleNumber);
  if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 99) throw new CampusError("invalid", "moduleNumber must be a whole number from 1 to 99.");
  if (raw.objectives !== undefined && !Array.isArray(raw.objectives)) throw new CampusError("invalid", "objectives must be a list.");
  const kinds = ["lab", "mini-lab", "quiz", "worksheet", "activity", "project"];
  const assessments = (raw.assessments ?? []).slice(0, 6).map((a, i) => {
    if (!kinds.includes(a?.kind)) throw new CampusError("invalid", `assessments[${i}].kind must be one of ${kinds.join(", ")}.`);
    const points = a.points === undefined ? undefined : Number(a.points);
    if (points !== undefined && !(points > 0 && points <= 1000)) throw new CampusError("invalid", `assessments[${i}].points must be between 1 and 1000.`);
    return { key: str(a.key, 40, `assessments[${i}].key`), title: str(a.title, 200, `assessments[${i}].title`), kind: a.kind, points, due: a.due ? str(a.due, 80, "due", false) : undefined };
  });
  if (raw.logoDataUri && !/^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(raw.logoDataUri)) throw new CampusError("invalid", "logoDataUri must be a base64 PNG, JPEG or SVG data URI.");
  return {
    courseKey: str(raw.courseKey, 120, "courseKey"),
    courseCode: str(raw.courseCode, 40, "courseCode"),
    courseTitle: str(raw.courseTitle, 200, "courseTitle"),
    programTitle: str(raw.programTitle, 200, "programTitle"),
    moduleNumber,
    moduleTitle: str(raw.moduleTitle, 200, "moduleTitle"),
    topicTitle: str(raw.topicTitle, 200, "topicTitle"),
    objectives: (raw.objectives ?? []).slice(0, 12).map((o, i) => str(o, 300, `objectives[${i}]`)).filter(Boolean),
    level: str(raw.level, 60, "level"),
    assessments,
    duration: raw.duration ? str(raw.duration, 40, "duration", false) : undefined,
    designSamples: raw.designSamples === true,
    logoDataUri: raw.logoDataUri && raw.logoDataUri.length < 2_000_000 ? raw.logoDataUri : undefined,
    sourceIds: Array.isArray(raw.sourceIds) ? raw.sourceIds.map(String).slice(0, 50) : undefined,
  };
}

/* ---------------- Helpers ---------------- */

function getRun(store: TenantStore, runId: string): RunRow {
  const r = store.get(RUNS, runId);
  if (!r) throw new CampusError("not_found", "Studio run not found", 404);
  return r as RunRow;
}

function model(store: TenantStore, run: RunRow): Model {
  return buildModel(run.input, genSources(store, run.courseKey, run.module, run.topic, run.sourceIds));
}

function currentOutputs(store: TenantStore, runId: string, version: number): Row[] {
  return store.list(OUTPUTS, (o) => o.runId === runId && o.setVersion === version).sort((a, b) => String(a.path).localeCompare(String(b.path)) || Number(a.conflict ?? 0) - Number(b.conflict ?? 0));
}

const isBuffer = (c: unknown): c is Buffer => Buffer.isBuffer(c);
const textOf = (o: Row): string | null => (typeof o.contentText === "string" ? (o.contentText as string) : null);
const bytesOf = (o: Row): Buffer => (typeof o.contentB64 === "string" ? Buffer.from(o.contentB64 as string, "base64") : Buffer.from(String(o.contentText ?? ""), "utf8"));

function persist(store: TenantStore, run: RunRow, f: GeneratedFile, version: number): Row {
  const sum = contentChecksum(isBuffer(f.content) ? f.content : String(f.content));
  const live = store.list(OUTPUTS, (o) => o.runId === run.id && o.relPath === f.path && o.setVersion === version);
  const existing = live.find((o) => !o.conflict) ?? live[0];
  const payload = {
    format: f.format,
    status: f.status,
    reason: f.reason ?? null,
    access: f.access,
    contentText: isBuffer(f.content) ? null : String(f.content),
    contentB64: isBuffer(f.content) ? f.content.toString("base64") : null,
    sourceRefs: f.sourceRefs,
    checksum: sum,
    meta: f.meta ?? null,
    step: f.step,
  };
  if (existing) {
    if (existing.checksum === sum && existing.status === f.status && existing.access === f.access) return existing;
    if (existing.editedBy) {
      const dup = live.find((o) => o.conflict && o.checksum === sum);
      if (dup) return dup;
      return store.insert(OUTPUTS, { runId: run.id, path: `${run.root}/${f.path}`, relPath: f.path, version, setVersion: version, ...payload, generatedAt: nowIso(), conflict: true, conflictWith: existing.id }, "sout");
    }
    return store.update(OUTPUTS, existing.id, { ...payload, generatedAt: nowIso() });
  }
  const prevEdited = store.list(OUTPUTS, (o) => o.runId === run.id && o.relPath === f.path && Number(o.setVersion) < version && !!o.editedBy).sort((a, b) => Number(b.setVersion) - Number(a.setVersion))[0];
  return store.insert(OUTPUTS, { runId: run.id, path: `${run.root}/${f.path}`, relPath: f.path, version, setVersion: version, ...payload, generatedAt: nowIso(), conflict: !!prevEdited, conflictWith: prevEdited?.id ?? null }, "sout");
}

function outputViews(rows: Row[]): OutputView[] {
  return rows.map((o) => ({ path: String(o.relPath), format: String(o.format), access: o.access as Access, status: String(o.status), text: textOf(o), sourceRefs: (o.sourceRefs as string[]) ?? [], reason: (o.reason as string) ?? null }));
}

/* ---------------- Steps ---------------- */

function runStep(store: TenantStore, run: RunRow, key: StepKey, opts: PipelineOptions): { files: GeneratedFile[]; status: "completed" | "configuration_required"; note?: string; patch?: Record<string, unknown> } {
  const v = run.outputsVersion;
  switch (key) {
    case "validate_inputs": {
      normalizeInput(run.input);
      const srcs = genSources(store, run.courseKey, run.module, run.topic, run.sourceIds);
      if (!srcs.some((s) => s.status === "available")) throw new CampusError("no_sources", "Add at least one available source (text, file or reachable URL) before generating.");
      return { files: [], status: "completed", note: `${srcs.filter((s) => s.status === "available").length} available source(s)` };
    }
    case "map_outcomes":
      return { files: genMapOutcomes(model(store, run)), status: "completed" };
    case "lessons_readings":
      return { files: genLessonsReadings(model(store, run)), status: "completed" };
    case "assessments_rubrics": {
      const m = model(store, run);
      const files = genAssessmentsRubrics(m);
      const quiz = files.find((f) => f.path === "08_Practice_Quizzes/practice_quiz.json");
      return { files, status: "completed", patch: { quizStems: (quiz?.meta?.stems as string[]) ?? [], quizSets: 1 } };
    }
    case "labs_demos":
      return { files: genLabsDemos(model(store, run)), status: "completed" };
    case "studio_text_visual":
      return { files: genStudioTextVisual(model(store, run)), status: "completed" };
    case "render_media": {
      const m = model(store, run);
      const files = genRenderPlaceholders(m);
      let status: "completed" | "configuration_required" = "completed";
      const notes: string[] = [];
      for (const a of m.assessments) {
        const path = `05_Video/${a.key}_requirements_preview.mp4`;
        if (opts.render === false) {
          files.push({ step: key, path, format: "mp4", content: "", access: "learner", status: "awaiting_rendering", reason: "Silent preview rendering was turned off for this run.", sourceRefs: [] });
          continue;
        }
        const vttRow = store.list(OUTPUTS, (o) => o.runId === run.id && o.setVersion === v && o.relPath === `05_Video/${a.key}_requirements.vtt`)[0];
        const segs = requirementsSegments(m, a).map((s) => ({ start: s.start, end: s.end, title: s.title, lines: s.lines }));
        const r: RenderResult = renderSegmentPreview(segs, textOf(vttRow ?? ({} as Row)) ?? "WEBVTT\n", { ffmpeg: opts.ffmpeg, env: opts.env });
        if (r.status === "preview_rendered_silent") {
          files.push({ step: key, path, format: "mp4", content: r.mp4, access: "learner", status: "preview_rendered_silent", reason: "Silent visual preview with soft captions; the narrated MP4 is awaiting rendering (no TTS).", sourceRefs: [], meta: { durationSec: r.durationSec, encoder: r.encoder, width: 1280, height: 720 } });
          notes.push(`${a.key}: preview rendered`);
        } else {
          if (r.status === "configuration_required") status = "configuration_required";
          files.push({ step: key, path, format: "mp4", content: "", access: "learner", status: r.status, reason: r.reason, sourceRefs: [] });
          notes.push(`${a.key}: ${r.status} — ${r.reason}`);
        }
      }
      return { files, status, note: notes.join("; ") || undefined };
    }
    case "validate_artifacts": {
      const m = model(store, run);
      const views = outputViews(currentOutputs(store, run.id, v).filter((o) => !["01_Sources/source_manifest.json", "17_qa_report.md", "00_manifest.json"].includes(String(o.relPath))));
      return { files: genValidate(m, views, (t) => copyCheck(store, t)), status: "completed" };
    }
    case "save_output_set": {
      const m = model(store, run);
      const rows = currentOutputs(store, run.id, v).filter((o) => o.relPath !== "00_manifest.json");
      const entries = rows.map((o) => ({ path: String(o.path), format: String(o.format), version: Number(o.setVersion), status: String(o.status), sourceRefs: (o.sourceRefs as string[]) ?? [], access: o.access as Access, generatedAt: String(o.generatedAt), checksum: String(o.checksum), ...(o.conflict ? { conflict: true } : {}) }));
      return { files: [genManifest(m, entries, v)], status: "completed", patch: { savedAt: nowIso() } };
    }
    case "publish_to_course": {
      store.emit("studio.output_set.ready_for_review", `${RUNS}/${run.id}`, { runId: run.id, courseKey: run.courseKey, version: v });
      return { files: [], status: "completed", note: "Saved to the course as an AI DRAFT awaiting instructor review; learners see it only after release.", patch: { reviewState: "pending_review", publishedAt: nowIso() } };
    }
  }
}

function execute(store: TenantStore, actor: Actor, runId: string, opts: PipelineOptions): RunRow {
  let run = getRun(store, runId);
  store.update(RUNS, run.id, { state: "processing" });
  for (const key of STEP_KEYS) {
    run = getRun(store, runId);
    const idx = run.steps.findIndex((s) => s.key === key);
    const step = run.steps[idx];
    if (step.status === "completed") continue;
    const attempts = step.attempts + 1;
    const mark = (patch: Partial<RunStep>, extra: Record<string, unknown> = {}) => {
      const cur = getRun(store, runId);
      const steps = cur.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      store.update(RUNS, runId, { steps, ...extra });
    };
    mark({ status: "processing", attempts, error: null });
    try {
      store.tx(() => {
        const fail = typeof opts.failAt === "function" ? opts.failAt(key, attempts) : opts.failAt === key;
        if (fail) throw new Error(`Injected failure at ${key}`);
        const r = runStep(store, getRun(store, runId), key, opts);
        const v = getRun(store, runId).outputsVersion;
        for (const f of r.files) persist(store, getRun(store, runId), f, v);
        mark({ status: r.status, note: r.note ?? null }, r.patch ?? {});
      });
    } catch (err) {
      const msg = err instanceof CampusError ? err.message : (err as Error).message ?? String(err);
      mark({ status: "failed", error: msg.slice(0, 500) }, { state: "failed" });
      audit(store, actor, "studio.run.step_failed", `${RUNS}/${runId}`, `${key}: ${msg.slice(0, 120)}`);
      return getRun(store, runId);
    }
  }
  const done = getRun(store, runId);
  const state = done.steps.every((s) => s.status === "completed") ? "completed" : done.steps.some((s) => s.status === "failed") ? "failed" : "needs_configuration";
  store.update(RUNS, runId, { state, finishedAt: nowIso() });
  return getRun(store, runId);
}

/* ---------------- Public API ---------------- */

export function addSource(store: TenantStore, actor: Actor, input: AddSourceInput, opts: { fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<StudioSource> {
  return addSourceImpl(store, actor, input, opts);
}
export function listSources(store: TenantStore, actor: Actor, filter: { courseKey: string; module?: number; topic?: string }): StudioSource[] {
  return listSourcesImpl(store, actor, filter);
}

export function startRun(store: TenantStore, actor: Actor, rawInput: StudioInput, opts: PipelineOptions = {}): RunRow {
  const input = normalizeInput(rawInput);
  requireGenerate(store, actor, input.courseKey, "studio.run.start");
  const sourceIds = genSources(store, input.courseKey, input.moduleNumber, input.topicTitle, input.sourceIds).map((s) => s.id);
  const run = store.tx(() => {
    const r = store.insert(
      RUNS,
      {
        courseKey: input.courseKey,
        module: input.moduleNumber,
        topic: input.topicTitle,
        input,
        sourceIds,
        steps: STEP_KEYS.map((key) => ({ key, status: "queued", attempts: 0, error: null })),
        state: "queued",
        outputsVersion: 1,
        root: topicRoot(input),
        createdBy: actor.id,
        reviewState: "draft",
        releasedAt: null,
      },
      "srun",
    );
    audit(store, actor, "studio.run.start", `${RUNS}/${r.id}`);
    return r;
  });
  return execute(store, actor, run.id, opts);
}

export function resumeRun(store: TenantStore, actor: Actor, runId: string, opts: PipelineOptions = {}): RunRow {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.run.resume");
  audit(store, actor, "studio.run.resume", `${RUNS}/${runId}`);
  return execute(store, actor, runId, opts);
}

/** New output-set version: every generation step reruns; earlier versions are kept. */
export function regenerateRun(store: TenantStore, actor: Actor, runId: string, opts: PipelineOptions = {}): RunRow {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.run.regenerate");
  store.update(RUNS, runId, { outputsVersion: run.outputsVersion + 1, steps: STEP_KEYS.map((key) => ({ key, status: "queued", attempts: 0, error: null })), state: "queued", reviewState: run.releasedVersion ? "released_previous_version" : "draft", quizStems: [], quizSets: 0 });
  audit(store, actor, "studio.run.regenerate", `${RUNS}/${runId}`, `v${run.outputsVersion + 1}`);
  return execute(store, actor, runId, opts);
}

export function getRunStatus(store: TenantStore, actor: Actor, runId: string) {
  const run = getRun(store, runId);
  if (!canSeeInstructor(store, actor, run.courseKey)) throw new CampusError("forbidden", "You don't have permission to see this Studio run.", 403);
  const { input: _i, ...rest } = run;
  return rest;
}

export function listRuns(store: TenantStore, actor: Actor, courseKey: string) {
  if (!canSeeInstructor(store, actor, courseKey)) throw new CampusError("forbidden", "You don't have permission to see Studio runs for this course.", 403);
  return store.list(RUNS, (r) => r.courseKey === courseKey).map((r) => ({ id: r.id, module: r.module, topic: r.topic, state: r.state, outputsVersion: r.outputsVersion, reviewState: r.reviewState, createdAt: r.createdAt }));
}

/** Instructor approval: learners can see learner files of the current version from now on (until a newer version is released). */
export function releaseRun(store: TenantStore, actor: Actor, runId: string) {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.run.release");
  if (run.state !== "completed" && run.state !== "needs_configuration") throw new CampusError("not_ready", "Finish the run before releasing it to learners.", 409);
  const qa = currentOutputs(store, runId, run.outputsVersion).find((o) => o.relPath === "17_qa_report.md");
  if (qa?.status === "failed") throw new CampusError("qa_failed", "The QA report has failing checks; fix them before release.", 409);
  return store.tx(() => {
    const r = store.update(RUNS, runId, { reviewState: "released", releasedAt: nowIso(), releasedBy: actor.id, releasedVersion: run.outputsVersion });
    audit(store, actor, "studio.run.release", `${RUNS}/${runId}`, `v${run.outputsVersion}`);
    return r;
  });
}

type Viewer = "staff" | "learner";
function viewerFor(store: TenantStore, actor: Actor, run: RunRow): Viewer {
  if (canSeeInstructor(store, actor, run.courseKey)) return "staff";
  if (isLearnerOf(store, actor, run.courseKey) && run.releasedVersion) return "learner";
  store.audit({ actorId: actor.id, actorRoles: actor.roles, action: "studio.outputs.read", resource: `${RUNS}/${run.id}`, outcome: "denied", reason: "role_or_unreleased" });
  throw new CampusError("forbidden", "These Studio outputs aren't available to you.", 403);
}

const metaOf = (o: Row) => ({ id: o.id, path: o.path, relPath: o.relPath, format: o.format, version: o.setVersion, rowVersion: o.version, status: o.status, reason: o.reason ?? null, access: o.access, sourceRefs: o.sourceRefs, checksum: o.checksum, generatedAt: o.generatedAt, step: o.step, editedBy: o.editedBy ?? null, conflict: !!o.conflict, size: o.contentB64 ? Buffer.from(String(o.contentB64), "base64").length : Buffer.byteLength(String(o.contentText ?? "")), meta: o.meta ?? null });

export function listOutputs(store: TenantStore, actor: Actor, runId: string, opts: { version?: number; allVersions?: boolean } = {}) {
  const run = getRun(store, runId);
  const who = viewerFor(store, actor, run);
  const version = who === "learner" ? Number(run.releasedVersion ?? run.outputsVersion) : opts.version ?? run.outputsVersion;
  return store
    .list(OUTPUTS, (o) => o.runId === runId && (opts.allVersions && who === "staff" ? true : o.setVersion === version) && (who === "staff" || o.access === "learner"))
    .sort((a, b) => Number(a.setVersion) - Number(b.setVersion) || String(a.path).localeCompare(String(b.path)))
    .map(metaOf);
}

export function readOutput(store: TenantStore, actor: Actor, outputId: string): ReturnType<typeof metaOf> & { content: string | Buffer } {
  const o = store.get(OUTPUTS, outputId);
  if (!o) throw new CampusError("not_found", "Output not found", 404);
  const run = getRun(store, String(o.runId));
  const who = viewerFor(store, actor, run);
  if (who === "learner" && (o.access !== "learner" || Number(o.setVersion) !== Number(run.releasedVersion))) {
    store.audit({ actorId: actor.id, actorRoles: actor.roles, action: "studio.output.read", resource: `${OUTPUTS}/${outputId}`, outcome: "denied", reason: "instructor_only" });
    throw new CampusError("forbidden", "This file is for instructors only.", 403);
  }
  return { ...metaOf(o), content: o.contentB64 ? bytesOf(o) : String(o.contentText ?? "") };
}

/** Instructor edit of a text output (marks it editedBy so regeneration never overwrites it). */
export function editOutput(store: TenantStore, actor: Actor, outputId: string, content: string) {
  const o = store.get(OUTPUTS, outputId);
  if (!o) throw new CampusError("not_found", "Output not found", 404);
  const run = getRun(store, String(o.runId));
  requireGenerate(store, actor, run.courseKey, "studio.output.edit");
  if (o.contentB64) throw new CampusError("invalid", "Only text outputs can be edited.");
  const text = String(content ?? "");
  if (text.length > 2_000_000) throw new CampusError("invalid", "Content is too large.");
  return store.tx(() => {
    const r = store.update(OUTPUTS, outputId, { contentText: text, checksum: contentChecksum(text), editedBy: actor.id, editedAt: nowIso() });
    audit(store, actor, "studio.output.edit", `${OUTPUTS}/${outputId}`);
    return metaOf(r);
  });
}

/** Zip of the current output set; learners get learner files only (after release). Placeholders with no bytes are skipped. */
export function bundleZip(store: TenantStore, actor: Actor, runId: string): Buffer {
  const run = getRun(store, runId);
  const who = viewerFor(store, actor, run);
  const version = who === "learner" ? Number(run.releasedVersion) : run.outputsVersion;
  const rows = currentOutputs(store, runId, version).filter((o) => (who === "staff" || o.access === "learner") && !o.conflict);
  const entries = rows.filter((o) => (o.contentB64 ? true : String(o.contentText ?? "").length > 0)).map((o) => ({ name: String(o.path), data: bytesOf(o) }));
  const pending = rows.filter((o) => !(o.contentB64 || String(o.contentText ?? "").length)).map((o) => `${o.relPath}: ${o.status}${o.reason ? ` — ${o.reason}` : ""}`);
  if (pending.length) entries.push({ name: `${run.root}/PENDING_MEDIA.txt`, data: Buffer.from(`${DRAFT_LABEL}\n\nThese files are not rendered yet:\n${pending.join("\n")}\n`) });
  audit(store, actor, "studio.bundle.download", `${RUNS}/${runId}`, who);
  return zip(entries);
}

/** A new practice-quiz set whose stems avoid every earlier set's stems. */
export function regenerateQuiz(store: TenantStore, actor: Actor, runId: string) {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.quiz.regenerate");
  const m = model(store, run);
  const avoid = new Set(run.quizStems ?? []);
  const setNo = Math.max(1, run.quizSets ?? 1) + 1;
  const quiz = buildQuiz(m, avoid, setNo);
  return store.tx(() => {
    const rows = quizFiles(m, quiz, setNo).map((f) => persist(store, run, f, run.outputsVersion));
    store.update(RUNS, runId, { quizStems: [...avoid, ...quiz.questions.map((q) => q.stem.toLowerCase().replace(/\W+/g, " ").trim())], quizSets: setNo });
    audit(store, actor, "studio.quiz.regenerate", `${RUNS}/${runId}`, `set ${setNo}`);
    return { set: setNo, count: quiz.questions.length, status: quiz.status, reason: quiz.reason ?? null, outputs: rows.map(metaOf) };
  });
}

/** Server-side mini-lab check for a run (learners after release, or staff). */
export function checkRunMiniLab(store: TenantStore, actor: Actor, runId: string, labId: string, answers: Record<string, unknown>): LabCheckResult {
  const run = getRun(store, runId);
  const who = viewerFor(store, actor, run);
  const version = who === "learner" ? Number(run.releasedVersion) : run.outputsVersion;
  const keys = currentOutputs(store, runId, version).find((o) => o.relPath === "10_Instructor_Resources/minilab_keys.json" && !o.conflict);
  const labs: LabSpec[] = keys ? (JSON.parse(String(keys.contentText)).labs as LabSpec[]) : buildLabSpecs(model(store, run));
  const spec = labs.find((l) => l.id === labId);
  if (!spec) throw new CampusError("not_found", "Mini-lab not found", 404);
  return checkMiniLab(spec, answers && typeof answers === "object" ? answers : {});
}

export { canGenerate };
