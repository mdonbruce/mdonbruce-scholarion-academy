/** Scholarion Course Studio — source-grounded, extractive course-material generator. */
export * from "./types";
export * from "./extract";
export * from "./sources";
export * from "./render";
export {
  buildModel,
  buildQuiz,
  buildFlashcards,
  buildLabSpecs,
  buildSlides,
  publicLabSpec,
  checkMiniLab,
  scanForAnswerKeys,
  requirementsSegments,
  rubricRows,
  topicRoot,
  sanitizeName,
  withLabel,
  apaEntry,
  vttFromCues,
  cueLines,
  SUBFOLDERS,
  REQ_SEGMENTS,
  WPM,
  NO_TTS,
  INSTRUCTOR_NAME,
  INSTRUCTOR_ROLE,
  WORDMARK,
  type Model,
  type Flashcard,
  type Slide,
  type OutputView,
} from "./generate";
export {
  RUNS,
  OUTPUTS,
  normalizeInput,
  startRun,
  resumeRun,
  regenerateRun,
  getRunStatus,
  listRuns,
  releaseRun,
  listOutputs,
  readOutput,
  editOutput,
  bundleZip,
  regenerateQuiz,
  checkRunMiniLab,
  rebuildTarget,
  REBUILD_TARGETS,
  studioLmsPackage,
  addSourceAndRefresh,
  LAB_CHECKS,
  SOLUTION_AFTER_CHECKS,
  type PipelineOptions,
} from "./pipeline";

export { moduleStudioBundle } from "./layout";
export { renderNarration } from "./pipeline";
export { detectTts, VOICES, VOICE_LABEL } from "./narrate";
export { PROFILES, getProfile, setProfile, resolveProfile, coverShapes, coverHtml, coverPptx, deckPptx, twoTone } from "./brand";
