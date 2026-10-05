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
  solutionFor,
  contentChecksum,
  genAssessmentsRubrics,
  genLabsDemos,
  genLessonsReadings,
  genManifest,
  genMapOutcomes,
  genRenderPlaceholders,
  genStudioTextVisual,
  narrationPlan,
  genValidate,
  quizFiles,
  requirementsSegments,
  topicRoot,
  type Model,
  type OutputView,
} from "./generate";
import { renderSegmentPreview, type RenderResult } from "./render";
import { detectTts, renderAudio, renderVideo, VOICE_LABEL, VOICES } from "./narrate";
import { LEAD_FACULTY } from "../../../brand/faculty";
import nodePath from "node:path";
import { cleanProfile, getProfile } from "./brand";
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
  /** Render narrated audio and video with text-to-speech (instructor action; off for routine runs and tests). */
  narrate?: boolean;
  /** Narrated media rendered ahead of time (asynchronously) for the render_media step to save. */
  precomputedMedia?: GeneratedFile[];
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
    profile: cleanProfile(raw.profile),
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
      const files = opts.precomputedMedia ? [...opts.precomputedMedia] : genRenderPlaceholders(m);
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
          files.push({ step: key, path, format: "mp4", content: r.mp4, access: "learner", status: "preview_rendered_silent", reason: opts.narrate ? "Silent visual preview with soft captions; the narrated MP4 is rendered alongside it." : "Silent visual preview with soft captions; use Render narration for the narrated MP4.", sourceRefs: [], meta: { durationSec: r.durationSec, encoder: r.encoder, width: 1280, height: 720 } });
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

/**
 * Narrated media: audio lecture, two-host deep dive, video overview and one requirements video per
 * assessment, all with captions timed to the synthesized speech. Synthetic voices only (labelled).
 * If text-to-speech isn't available, each file says exactly what's missing.
 */
async function narratedMedia(m: Model, opts: PipelineOptions): Promise<GeneratedFile[]> {
  const R = "render_media" as const;
  const tts = detectTts(opts.env ?? process.env, opts.ffmpeg);
  const out: GeneratedFile[] = [];
  const blocked = (path: string, format: string, reason: string) => out.push({ step: R, path, format, content: "", access: "learner", status: "configuration_required", reason, sourceRefs: [] });
  const plan = narrationPlan(m);
  const paths = ["04_Audio/audio_lecture.mp3", "04_Audio/deep_dive.mp3", "05_Video/video_overview.mp4", ...plan.requirements.map((r) => `05_Video/${r.key}_requirements.mp4`)];
  if (!tts.ok) {
    for (const p of paths) blocked(p, p.endsWith(".mp3") ? "mp3" : "mp4", tts.reason);
    return out;
  }
  const photoFile = nodePath.join(process.cwd(), "public", LEAD_FACULTY.photo.src.replace(/^\//, ""));
  const photo = { file: photoFile, caption: LEAD_FACULTY.name };
  const header = `Scholarion Academy | ${m.input.courseCode} Module ${String(m.input.moduleNumber).padStart(2, "0")}`;
  const meta = (extra: Record<string, unknown>) => ({ ...extra, voiceLabel: VOICE_LABEL, engine: "flite (offline)" });
  const attempt = async (path: string, format: string, fn: () => Promise<GeneratedFile[]>) => {
    try {
      out.push(...(await fn()));
    } catch (e) {
      out.push({ step: R, path, format, content: "", access: "learner", status: "failed", reason: (e as Error).message.slice(0, 300), sourceRefs: [] });
    }
  };
  await attempt("04_Audio/audio_lecture.mp3", "mp3", async () => {
    const a = await renderAudio(tts, plan.lecture.map((text) => ({ voice: VOICES.narrator, text })), { gapSec: 0.6 });
    return [
      { step: R, path: "04_Audio/audio_lecture.mp3", format: "mp3", content: a.mp3, access: "learner", status: "rendered", sourceRefs: [], meta: meta({ durationSec: Math.round(a.durationSec), voices: a.voices }) },
      { step: R, path: "04_Audio/audio_lecture_narrated.vtt", format: "vtt", content: a.vtt, access: "learner", status: "ready", sourceRefs: [] },
    ];
  });
  await attempt("04_Audio/deep_dive.mp3", "mp3", async () => {
    const a = await renderAudio(tts, plan.deepDive.map((l) => ({ voice: l.speaker.startsWith("Host A") ? VOICES.hostA : VOICES.hostB, speaker: l.speaker, text: l.text })), { gapSec: 0.45, targetSec: 16 * 60 });
    return [
      { step: R, path: "04_Audio/deep_dive.mp3", format: "mp3", content: a.mp3, access: "learner", status: "rendered", reason: a.durationSec < 14 * 60 ? `About ${Math.round(a.durationSec / 60)} minutes: the supplied sources support a shorter conversation than the ~16-minute target; add sources and re-render to lengthen it.` : undefined, sourceRefs: [], meta: meta({ durationSec: Math.round(a.durationSec), voices: a.voices, hosts: { "Host A": VOICES.hostA, "Host B": VOICES.hostB } }) },
      { step: R, path: "04_Audio/deep_dive_narrated.vtt", format: "vtt", content: a.vtt, access: "learner", status: "ready", sourceRefs: [] },
    ];
  });
  await attempt("05_Video/video_overview.mp4", "mp4", async () => {
    const v = await renderVideo(tts, plan.overview, { header: `${header} | Video overview`, photo, env: opts.env });
    return [
      { step: R, path: "05_Video/video_overview.mp4", format: "mp4", content: v.mp4, access: "learner", status: "rendered", sourceRefs: [], meta: meta({ durationSec: Math.round(v.durationSec), width: v.width, height: v.height, encoder: v.encoder }) },
      { step: R, path: "05_Video/video_overview_narrated.vtt", format: "vtt", content: v.vtt, access: "learner", status: "ready", sourceRefs: [] },
    ];
  });
  for (const r of plan.requirements) {
    const p = `05_Video/${r.key}_requirements.mp4`;
    await attempt(p, "mp4", async () => {
      const v = await renderVideo(tts, r.segments, { header: `${header} | Requirements: ${r.title}`.slice(0, 90), photo, env: opts.env });
      return [
        { step: R, path: p, format: "mp4", content: v.mp4, access: "learner", status: "rendered", sourceRefs: [], meta: meta({ durationSec: Math.round(v.durationSec), width: v.width, height: v.height, encoder: v.encoder, target: "about 5 minutes at 720p" }) },
        { step: R, path: `05_Video/${r.key}_requirements_narrated.vtt`, format: "vtt", content: v.vtt, access: "learner", status: "ready", sourceRefs: [] },
      ];
    });
  }
  return out;
}

/** Instructor action: render (or re-render) the narrated audio and video for a run. */
export async function renderNarration(store: TenantStore, actor: Actor, runId: string, opts: PipelineOptions = {}): Promise<RunRow> {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.run.render_media");
  if (run.steps.some((s) => s.key !== "render_media" && STEP_KEYS.indexOf(s.key) < STEP_KEYS.indexOf("render_media") && s.status !== "completed")) throw new CampusError("not_ready", "Finish generating the package before rendering narration.", 409);
  audit(store, actor, "studio.run.render_media", `${RUNS}/${runId}`);
  // Synthesis and encoding run asynchronously (the server keeps serving); only saving is synchronous.
  const media = await narratedMedia(model(store, run), opts);
  const redo = new Set(["render_media", "validate_artifacts", "save_output_set", "publish_to_course"]);
  const fresh = getRun(store, runId);
  store.update(RUNS, runId, { steps: fresh.steps.map((s) => (redo.has(s.key) ? { ...s, status: "queued", error: null } : s)), state: "queued" });
  return execute(store, actor, runId, { ...opts, narrate: true, precomputedMedia: media });
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
  if (!input.profile) input.profile = getProfile(store, input.courseKey) ?? undefined;
  if (!input.profile) delete input.profile;
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
export const LAB_CHECKS = "studio_lab_checks";
/** Checks a learner must make before the worked solution unlocks. */
export const SOLUTION_AFTER_CHECKS = 2;

export function checkRunMiniLab(store: TenantStore, actor: Actor, runId: string, labId: string, answers: Record<string, unknown>, opts: { reveal?: boolean } = {}): LabCheckResult & { checks?: number; solution?: ReturnType<typeof solutionFor> } {
  const run = getRun(store, runId);
  const who = viewerFor(store, actor, run);
  const version = who === "learner" ? Number(run.releasedVersion) : run.outputsVersion;
  const keys = currentOutputs(store, runId, version).find((o) => o.relPath === "10_Instructor_Resources/minilab_keys.json" && !o.conflict);
  const labs: LabSpec[] = keys ? (JSON.parse(String(keys.contentText)).labs as LabSpec[]) : buildLabSpecs(model(store, run));
  const spec = labs.find((l) => l.id === labId);
  if (!spec) throw new CampusError("not_found", "Mini-lab not found", 404);
  const prior = store.list(LAB_CHECKS, (c) => c.runId === runId && c.labId === labId && c.userId === actor.id).length;
  if (opts.reveal) {
    if (who === "learner" && prior < SOLUTION_AFTER_CHECKS) throw new CampusError("not_yet", `Check your answers ${SOLUTION_AFTER_CHECKS - prior} more time${SOLUTION_AFTER_CHECKS - prior === 1 ? "" : "s"} before viewing the solution — use the hints first.`, 409);
    audit(store, actor, "studio.minilab.solution", `${RUNS}/${runId}`, labId);
    return { ...checkMiniLab(spec, answers && typeof answers === "object" ? answers : {}), checks: prior, solution: solutionFor(spec) };
  }
  const result = checkMiniLab(spec, answers && typeof answers === "object" ? answers : {});
  store.insert(LAB_CHECKS, { runId, labId, userId: actor.id, score: result.score, total: result.total, at: nowIso() }, "slc");
  return { ...result, checks: prior + 1 };
}

export { canGenerate };

/* ---------------- Targeted rebuilds ---------------- */

/**
 * Rebuild just one part of the current version — e.g. "rebuild cover B" or "refresh readings" —
 * without regenerating the whole set. Instructor-edited files are kept (the new text is stored
 * as a conflict copy for review). The QA report and manifest are refreshed afterwards.
 * A released version is never changed in place: regenerate it as a new version instead.
 */
export const REBUILD_TARGETS: Record<string, { label: string; step: StepKey; paths: RegExp }> = {
  cover: { label: "Covers A and B (HTML + PowerPoint)", step: "studio_text_visual", paths: /^03_Lecture_Deck\/(cover_|lecture_deck\.pptx$)/ },
  cover_a: { label: "Cover A", step: "studio_text_visual", paths: /^03_Lecture_Deck\/cover_(variant|slide)_A\./ },
  cover_b: { label: "Cover B", step: "studio_text_visual", paths: /^03_Lecture_Deck\/cover_(variant|slide)_B\./ },
  deck: { label: "Lecture deck (HTML + PowerPoint) and speaker notes", step: "studio_text_visual", paths: /^03_Lecture_Deck\/(lecture_deck\.|speaker_notes\.md$)/ },
  chapters: { label: "Audio chapters", step: "studio_text_visual", paths: /^04_Audio\/audio_lecture_chapters\./ },
  readings: { label: "Reading list and BibTeX", step: "lessons_readings", paths: /^01_Sources\/(reading_list\.md|sources_master\.bib)$/ },
  rubrics: { label: "Rubrics (full, student and calibration)", step: "assessments_rubrics", paths: /^12_Assessments_and_Rubrics\/rubric_/ },
  minilabs: { label: "Mini-labs", step: "labs_demos", paths: /^09_Student_Labs\/minilab_\d\.html$/ },
};

export function rebuildTarget(store: TenantStore, actor: Actor, runId: string, target: string) {
  const run = getRun(store, runId);
  requireGenerate(store, actor, run.courseKey, "studio.rebuild");
  const t = REBUILD_TARGETS[target];
  if (!t) throw new CampusError("invalid", `Unknown target. Use one of: ${Object.keys(REBUILD_TARGETS).join(", ")}.`, 422);
  if (!["completed", "needs_configuration"].includes(String(run.state))) throw new CampusError("not_ready", "Finish or resume this run before rebuilding part of it.", 409);
  if (Number(run.releasedVersion ?? 0) === run.outputsVersion) throw new CampusError("released", "This version is released to learners. Regenerate it as a new version, then rebuild.", 409);
  const v = run.outputsVersion;
  const rebuilt: string[] = [];
  store.tx(() => {
    // Covers and decks pick up the latest course branding profile.
    if (t.step === "studio_text_visual") {
      const profile = getProfile(store, run.courseKey);
      if (profile) store.update(RUNS, runId, { input: { ...run.input, profile } });
    }
    const r = runStep(store, getRun(store, runId), t.step, {});
    for (const f of r.files.filter((f) => t.paths.test(f.path))) {
      persist(store, getRun(store, runId), f, v);
      rebuilt.push(f.path);
    }
    for (const key of ["validate_artifacts", "save_output_set"] as StepKey[]) for (const f of runStep(store, getRun(store, runId), key, {}).files) persist(store, getRun(store, runId), f, v);
  });
  audit(store, actor, "studio.rebuild", `${RUNS}/${runId}`, `${target}: ${rebuilt.length} file(s)`);
  return { runId, target, label: t.label, version: v, rebuilt };
}

/* ---------------- LMS package (Common Cartridge 1.3) ---------------- */

const xe = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function quizQti(id: string, title: string, qs: { id: string; type: string; stem: string; options: { id: string; text: string }[]; correct: string[] }[]) {
  const items = qs
    .map((q) => {
      const multi = q.type === "multiple_response";
      const kind = multi ? "multiple_answers_question" : q.type === "true_false" ? "true_false_question" : "multiple_choice_question";
      const cond = multi ? `<and>${q.options.map((o) => (q.correct.includes(o.id) ? `<varequal respident="r1">${xe(o.id)}</varequal>` : `<not><varequal respident="r1">${xe(o.id)}</varequal></not>`)).join("")}</and>` : `<varequal respident="r1">${xe(q.correct[0])}</varequal>`;
      return `<item ident="${xe(q.id)}" title="${xe(q.stem.slice(0, 60))}"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${kind}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata><presentation><material><mattext texttype="text/plain">${xe(q.stem)}</mattext></material><response_lid ident="r1" rcardinality="${multi ? "Multiple" : "Single"}"><render_choice>${q.options.map((o) => `<response_label ident="${xe(o.id)}"><material><mattext texttype="text/plain">${xe(o.text)}</mattext></material></response_label>`).join("")}</render_choice></response_lid></presentation><resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes><respcondition continue="No"><conditionvar>${cond}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing></item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="${xe(id)}" title="${xe(title)}"><section ident="root_section">${items}</section></assessment></questestinterop>`;
}

/**
 * Export a topic's current version as an IMS Common Cartridge (.imscc) for import into another
 * LMS: every learner file as web content, organised by Studio folder, plus the practice quiz as
 * QTI 1.2 (with its key — so the package is for staff only). Pending media are listed, not faked.
 */
export function studioLmsPackage(store: TenantStore, actor: Actor, runId: string): { zip: Buffer; name: string; files: number; pending: string[] } {
  const run = getRun(store, runId);
  if (!canSeeInstructor(store, actor, run.courseKey)) throw new CampusError("forbidden", "Only course staff can export the LMS package.", 403);
  const rows = currentOutputs(store, runId, run.outputsVersion).filter((o) => !o.conflict);
  const learner = rows.filter((o) => o.access === "learner");
  const has = (o: Row) => !!(o.contentB64 || String(o.contentText ?? "").length);
  const entries: { name: string; data: Buffer }[] = [];
  const resources: string[] = [];
  const folders = new Map<string, string[]>();
  learner.filter(has).forEach((o, k) => {
    const rel = String(o.relPath);
    const href = `web_resources/${rel}`;
    entries.push({ name: href, data: bytesOf(o) });
    const id = `res_${k + 1}`;
    resources.push(`<resource identifier="${id}" type="webcontent" href="${xe(href)}"><file href="${xe(href)}"/></resource>`);
    const folder = rel.split("/")[0];
    folders.set(folder, [...(folders.get(folder) ?? []), `<item identifier="it_${id}" identifierref="${id}"><title>${xe(rel.split("/").slice(1).join("/"))}</title></item>`]);
  });
  const quizRow = rows.find((o) => o.relPath === "08_Practice_Quizzes/practice_quiz.json");
  if (quizRow?.contentText) {
    try {
      const qz = JSON.parse(String(quizRow.contentText)) as { questions: Parameters<typeof quizQti>[2] };
      if (qz.questions?.length) {
        entries.push({ name: "assessments/practice_quiz.xml", data: Buffer.from(quizQti(`quiz_${runId}`, `${run.topic} — practice quiz`, qz.questions)) });
        resources.push(`<resource identifier="practice_quiz" type="imsqti_xmlv1p2/imscc_xmlv1p3/assessment" href="assessments/practice_quiz.xml"><file href="assessments/practice_quiz.xml"/></resource>`);
        folders.set("08_Practice_Quizzes", [...(folders.get("08_Practice_Quizzes") ?? []), `<item identifier="it_practice_quiz" identifierref="practice_quiz"><title>Practice quiz (QTI)</title></item>`]);
      }
    } catch {
      /* quiz JSON unreadable: export the rest */
    }
  }
  const pending = learner.filter((o) => !has(o)).map((o) => `${o.relPath}: ${o.status}${o.reason ? ` — ${o.reason}` : ""}`);
  entries.push({ name: "web_resources/README_IMPORT.txt", data: Buffer.from(`${DRAFT_LABEL}\n\n${run.topic}: Studio version ${run.outputsVersion}${run.releasedVersion ? ` (released version ${run.releasedVersion})` : " (not yet released)"}.\nImport into the target LMS as a Common Cartridge 1.3 package. Review every file before publishing to learners.\n\nNot included (not rendered yet):\n${pending.join("\n") || "- none"}\n`) });
  const org = [...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, items], k) => `<item identifier="fold_${k}"><title>${xe(f.replace(/^\d+_/, "").replace(/_/g, " "))}</title>${items.join("")}</item>`).join("");
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest identifier="studio_${xe(runId)}" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion><lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest"><lomimscc:general><lomimscc:title><lomimscc:string>${xe(`${run.input.courseCode} Module ${String(run.module).padStart(2, "0")} — ${run.topic}`)}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata><organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="root">${org}</item></organization></organizations><resources>${resources.join("")}</resources></manifest>`;
  entries.unshift({ name: "imsmanifest.xml", data: Buffer.from(manifest) });
  audit(store, actor, "studio.lms_package", `${RUNS}/${runId}`, `${entries.length} files`);
  return { zip: zip(entries), name: `${String(run.root).split("/").pop()}_v${run.outputsVersion}.imscc`, files: entries.length, pending };
}

/* ---------------- Sources added → refresh ---------------- */

/**
 * Add a source and, when the topic already has a run, regenerate it as a new version so the new
 * source is used (instructor edits carry forward). Released versions stay as they are until the
 * new version is reviewed and released.
 */
export async function addSourceAndRefresh(store: TenantStore, actor: Actor, input: AddSourceInput, opts: { fetcher?: Fetcher; timeoutMs?: number; autoRegenerate?: boolean } = {}) {
  const source = await addSourceImpl(store, actor, input, opts);
  if (opts.autoRegenerate === false || source.status !== "available") return { source, regenerated: null as null | { runId: string; version: number; state: string } };
  const run = store
    .list(RUNS, (r) => r.courseKey === input.courseKey && Number(r.module) === Number(input.module) && r.topic === input.topic)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] as RunRow | undefined;
  if (!run || !["completed", "needs_configuration"].includes(String(run.state))) return { source, regenerated: null };
  // Include the new source: runs without an explicit selection follow every topic source.
  if (!run.input.sourceIds) store.update(RUNS, run.id, { sourceIds: genSources(store, run.courseKey, run.module, run.topic).map((s) => s.id) });
  const next = regenerateRun(store, actor, run.id, { render: false });
  audit(store, actor, "studio.source_refresh", `${RUNS}/${run.id}`, `v${next.outputsVersion}`);
  return { source, regenerated: { runId: next.id, version: next.outputsVersion, state: String(next.state) } };
}
