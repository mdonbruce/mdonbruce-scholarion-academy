/**
 * Scholarion Course Studio — shared types.
 *
 * The Studio is a deterministic, EXTRACTIVE generator: every statement it produces is either a
 * (short) excerpt from a supplied source, cited as [S1], [S2] …, or is marked
 * "[Supplemental — verify]". There is no language model behind it.
 */

export const DRAFT_LABEL = "AI DRAFT — requires instructor review before release.";
export const SUPPLEMENTAL = "[Supplemental — verify]";

export type SourceKind = "text" | "file" | "url";
export type SourceStatus = "available" | "unavailable";

/** A row of `studio_sources`. */
export interface StudioSource {
  id: string;
  courseKey: string;
  module: number;
  topic: string;
  kind: SourceKind;
  title: string;
  url?: string | null;
  filename?: string | null;
  author?: string | null;
  year?: string | null;
  text: string;
  status: SourceStatus;
  reason?: string | null;
  addedBy: string;
  checksum: string;
  createdAt: string;
}

export interface AddSourceInput {
  courseKey: string;
  module: number;
  topic: string;
  kind: SourceKind;
  title?: string;
  /** text: pasted notes; file: the uploaded document's text content. Ignored for url. */
  body?: string;
  filename?: string;
  url?: string;
  /** Optional bibliographic details (only what the instructor supplies; never inferred). */
  author?: string;
  year?: string;
}

/** Minimal response shape the URL fetcher must return (a subset of the WHATWG Response). */
export interface FetchedResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string>; redirect: "follow" | "manual" | "error" }) => Promise<FetchedResponse>;

export type AssessmentKind = "lab" | "mini-lab" | "quiz" | "worksheet" | "activity" | "project";
export interface AssessmentInput {
  key: string;
  title: string;
  kind: AssessmentKind;
  points?: number;
  /** Free text, e.g. "Sunday 11:59 PM". Shown as supplied. */
  due?: string;
}

export interface StudioInput {
  /** A campus course id (crs_…) or another course key. Course ids enable course-role checks. */
  courseKey: string;
  courseCode: string;
  courseTitle: string;
  programTitle: string;
  moduleNumber: number;
  moduleTitle: string;
  topicTitle: string;
  objectives: string[];
  level: string;
  assessments?: AssessmentInput[];
  /** Shown on the deck cover footer, e.g. "90 min". */
  duration?: string;
  /** True once real Scholarion cover samples were supplied; otherwise the design is marked provisional. */
  designSamples?: boolean;
  /** Optional uploaded logo (data:image/png|jpeg|svg+xml;base64,…). Text wordmark otherwise. */
  logoDataUri?: string;
  /** Restrict to these source ids; default = every source for (courseKey, module, topic). */
  sourceIds?: string[];
  /** Course/institution branding for covers and decks (from `studio_profiles`, or supplied inline). */
  profile?: StudioProfile;
}

/**
 * Per-course branding profile (`studio_profiles`). Drives the 1920×1080 cover variants and the
 * PowerPoint deck: institution wordmark, motto band, two-tone course code, module banner and the
 * six-cell footer info bar. Variant B adds key topics, a process strip and an outcomes checklist.
 * Every field is optional; anything missing falls back to Scholarion defaults or the course input.
 */
export interface StudioProfile {
  institution?: string;
  motto?: string;
  primary?: string;
  accent?: string;
  light?: string;
  /** Delivery format shown in the footer bar, e.g. "Live online + labs". */
  format?: string;
  /** Override any of the six footer cells by label (Course, Module, Level, Duration, Format, Instructor). */
  footer?: { label: string; value: string }[];
  keyTopics?: string[];
  process?: string[];
}

export type Access = "learner" | "instructor";
export type OutputStatus =
  | "ready"
  | "needs_more_sources"
  | "awaiting_rendering"
  | "preview_rendered_silent"
  | "configuration_required"
  | "failed";

export const STEP_KEYS = [
  "validate_inputs",
  "map_outcomes",
  "lessons_readings",
  "assessments_rubrics",
  "labs_demos",
  "studio_text_visual",
  "render_media",
  "validate_artifacts",
  "save_output_set",
  "publish_to_course",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type StepStatus = "queued" | "processing" | "completed" | "failed" | "configuration_required";
export interface RunStep {
  key: StepKey;
  status: StepStatus;
  error?: string | null;
  attempts: number;
  note?: string | null;
}

/** One generated file (before persistence). */
export interface GeneratedFile {
  /** Path relative to the topic folder, e.g. "03_Lecture_Deck/lecture_deck.html". */
  path: string;
  format: string;
  content: string | Buffer;
  access: Access;
  status: OutputStatus;
  reason?: string;
  /** Source ids (studio_sources ids) this file draws on. */
  sourceRefs: string[];
  step: StepKey;
  meta?: Record<string, unknown>;
}

/** A source as seen by the generator: available sources get a citation ref (S1, S2…). */
export interface GenSource {
  id: string;
  ref: string | null;
  kind: SourceKind;
  title: string;
  url?: string | null;
  filename?: string | null;
  author?: string | null;
  year?: string | null;
  text: string;
  status: SourceStatus;
  reason?: string | null;
  checksum: string;
  addedAt: string;
}

/* ---------- Quiz ---------- */
export type QuestionType = "multiple_choice" | "multiple_response" | "true_false" | "scenario";
export interface QuizQuestion {
  id: string;
  type: QuestionType;
  stem: string;
  options: { id: string; text: string }[];
  correct: string[];
  explanation: string;
  sourceRef: string;
  sourceId: string;
  sourceExcerpt: string;
  distractorRationale: Record<string, string>;
  lo: string;
  bloom: "Remember" | "Understand" | "Apply" | "Analyze";
  difficulty: "easy" | "medium" | "hard";
}

/* ---------- Mini-labs ---------- */
export type LabTask =
  | { id: string; type: "match"; prompt: string; sourceRef: string; options: string[]; answer: string }
  | { id: string; type: "order"; prompt: string; items: { id: string; text: string }[]; answer: string[] }
  | { id: string; type: "classify"; prompt: string; statement: string; options: string[]; answer: string; sourceRef: string }
  | { id: string; type: "config_fix"; prompt: string; broken: string; rules: { id: string; description: string; pattern: string; mustMatch: boolean }[] };

export interface LabSpec {
  id: string;
  title: string;
  kind: "guided" | "apply_debug";
  intro: string;
  tasks: LabTask[];
}

export interface LabCheckResult {
  labId: string;
  score: number;
  total: number;
  items: { id: string; correct: boolean; feedback: string }[];
}
