import { createHash } from "node:crypto";
import { fitSize, LEAD_FACULTY } from "../../../brand/faculty";
import { facultyDataUri } from "../../../brand/faculty-assets";
import { coverHtml, coverNotes, coverPptx, deckPptx } from "./brand";
import {
  bestObjective,
  cloze,
  containsTerm,
  corpus,
  definitions,
  definitionQuestion,
  bestTermIn,
  excerpt,
  hash,
  isApplied,
  isExample,
  isMisconception,
  isProcess,
  isWhy,
  keyTerms,
  scoreSentences,
  stableShuffle,
  summarize,
  tokens,
  topSentences,
  whyParts,
  wordCount,
  type Definition,
  type Sentence,
  type Term,
} from "./extract";
import {
  DRAFT_LABEL,
  SUPPLEMENTAL,
  type Access,
  type AssessmentInput,
  type GeneratedFile,
  type GenSource,
  type LabCheckResult,
  type LabSpec,
  type LabTask,
  type OutputStatus,
  type QuizQuestion,
  type StepKey,
  type StudioInput,
} from "./types";

/**
 * Scholarion Course Studio generator. Deterministic and extractive: every factual statement is a
 * short excerpt of a supplied source with its citation ([S1] …); everything else is course
 * scaffolding (headings, prompts, transitions) or is marked "[Supplemental — verify]".
 * Source text is treated purely as data — it is escaped on output and never interpreted.
 */

export const WPM = 140;
export const INSTRUCTOR_NAME = "Dr. Martins Donbruce Idahosa";
export const INSTRUCTOR_ROLE = "Lead Faculty & Director of AI Innovation";
export const WORDMARK = "Scholarion Academy | Agentic Cloud Labs";
export const SUBFOLDERS = [
  "01_Sources",
  "02_Overview_and_Lessons",
  "03_Lecture_Deck",
  "04_Audio",
  "05_Video",
  "06_Infographics_and_Mind_Maps",
  "07_Study_Guides_and_Flashcards",
  "08_Practice_Quizzes",
  "09_Student_Labs",
  "10_Instructor_Resources",
  "11_Application_Demo",
  "12_Assessments_and_Rubrics",
  "13_Environment_Templates",
] as const;

/* ======================================================================
 * Utilities
 * ==================================================================== */

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** JSON safe to embed inside <script>. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
/** Neutralize Markdown/HTML control characters in source-derived text placed in Markdown. */
const md = (s: string) => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, " ");
const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");
export const sanitizeName = (s: string, max = 60) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, max)
    .replace(/^_+|_+$/g, "") || "Untitled";
const pad2 = (n: number) => String(n).padStart(2, "0");
const mmss = (s: number) => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}`;
const checksum = (c: string | Buffer) => createHash("sha256").update(c).digest("hex");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minutes = (words: number) => Math.round((words / WPM) * 10) / 10;

export function topicRoot(input: Pick<StudioInput, "programTitle" | "courseCode" | "courseTitle" | "moduleNumber" | "topicTitle">): string {
  return `Scholarion_Academy/${sanitizeName(input.programTitle)}/${sanitizeName(`${input.courseCode}_${input.courseTitle}`, 80)}/Module_${pad2(input.moduleNumber)}/${sanitizeName(input.topicTitle)}`;
}

/** Prefix a text output with the AI DRAFT label in a format-appropriate way. */
export function withLabel(format: string, content: string): string {
  switch (format) {
    case "md":
      return `> **${DRAFT_LABEL}**\n\n${content}`;
    case "csv":
    case "yml":
    case "yaml":
    case "txt-hash":
    case "py":
    case "dockerfile":
    case "env":
    case "toml":
    case "requirements":
      return `# ${DRAFT_LABEL}\n${content}`;
    case "mmd":
      return `%% ${DRAFT_LABEL}\n${content}`;
    case "txt":
      return `${DRAFT_LABEL}\n\n${content}`;
    case "jsonc":
      return `// ${DRAFT_LABEL}\n${content}`;
    default:
      return content;
  }
}

/* ======================================================================
 * Model — everything is derived from input + sources once
 * ==================================================================== */

export interface Model {
  input: StudioInput;
  root: string;
  sources: GenSource[];
  avail: GenSource[];
  unavailable: GenSource[];
  sentences: Sentence[];
  terms: Term[];
  defs: Definition[];
  scores: Map<number, number>;
  los: { id: string; text: string; supplemental: boolean }[];
  summary: Sentence[];
  misconceptions: Sentence[];
  process: Sentence[];
  examples: Sentence[];
  applied: Sentence[];
  why: Sentence[];
  totalWords: number;
  thin: boolean;
  assessments: AssessmentInput[];
}

const MEASURABLE = /^(analy[sz]e|apply|build|calculate|classify|compare|configure|construct|create|debug|define|demonstrate|deploy|describe|design|differentiate|evaluate|explain|identify|implement|interpret|justify|list|map|measure|outline|plan|predict|recognize|recall|select|solve|summari[sz]e|test|troubleshoot|use|validate|write)\b/i;

export function buildModel(input: StudioInput, sources: GenSource[]): Model {
  const avail = sources.filter((s) => s.status === "available" && s.ref);
  const unavailable = sources.filter((s) => s.status !== "available");
  const sentences = corpus(avail.map((s) => ({ id: s.id, ref: s.ref!, text: s.text })));
  const terms = keyTerms(sentences, 24);
  const defs = definitions(sentences);
  const scores = scoreSentences(sentences, terms, defs);
  const totalWords = sentences.reduce((n, s) => n + s.words, 0);
  const los = (input.objectives ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 12).map((text, i) => ({ id: `LO${i + 1}`, text, supplemental: false }));
  if (!los.length) {
    const basis = defs.length ? defs.slice(0, 3).map((d) => `Explain ${d.term} using the supplied readings.`) : terms.slice(0, 3).map((t) => `Explain the role of ${t.display} in ${input.topicTitle}.`);
    (basis.length ? basis : [`Summarize the key ideas of ${input.topicTitle}.`]).forEach((text, i) => los.push({ id: `LO${i + 1}`, text: `${text} ${SUPPLEMENTAL}`, supplemental: true }));
  }
  const sorted = (pred: (s: string) => boolean) => sentences.filter((s) => pred(s.text)).sort((a, b) => (scores.get(b.idx) ?? 0) - (scores.get(a.idx) ?? 0) || a.idx - b.idx);
  const assessments = input.assessments?.length ? input.assessments : [{ key: "project", title: `${input.topicTitle} Project`, kind: "project" as const, points: 100 }];
  return {
    input,
    root: topicRoot(input),
    sources,
    avail,
    unavailable,
    sentences,
    terms,
    defs,
    scores,
    los,
    summary: summarize(sentences, scores, Math.min(8, sentences.length)),
    misconceptions: sorted(isMisconception).slice(0, 8),
    process: sentences.filter((s) => isProcess(s.text)).slice(0, 8),
    examples: sorted(isExample).slice(0, 6),
    applied: sorted(isApplied).slice(0, 6),
    why: sorted(isWhy).slice(0, 12),
    totalWords,
    thin: totalWords < 600,
    assessments: assessments.map((a) => ({ ...a, key: sanitizeName(a.key, 40).toLowerCase() })),
  };
}

const cite = (s: Sentence, max = 40) => `${md(excerpt(s.text, max))} [${s.ref}]`;
const citeHtml = (s: Sentence, max = 40) => `${esc(excerpt(s.text, max))} <span class="cite">[${esc(s.ref)}]</span>`;
const refsOf = (m: Model, sents: Sentence[]) => [...new Set(sents.map((s) => s.sourceId))];
const allRefs = (m: Model) => m.avail.map((s) => s.id);
const loFor = (m: Model, text: string) => m.los[bestObjective(text, m.los.map((l) => l.text))]?.id ?? "LO1";
const defOf = (m: Model, term: string) => m.defs.find((d) => d.term.toLowerCase() === term.toLowerCase());
/** Best sentence mentioning a term (excluding some indices). */
function sentenceFor(m: Model, term: string, exclude = new Set<number>()): Sentence | undefined {
  return topSentences(m.sentences.filter((s) => !exclude.has(s.idx) && containsTerm(s.text, term)), m.scores, 1)[0];
}
const header = (m: Model, title: string) =>
  `# ${title}\n\n**${m.input.courseCode} ${md(m.input.courseTitle)}** · Module ${pad2(m.input.moduleNumber)}: ${md(m.input.moduleTitle)} · Topic: ${md(m.input.topicTitle)} · Level: ${md(m.input.level)}\n\nCitations like [S1] refer to the supplied sources in \`01_Sources/reading_list.md\`. Text marked ${SUPPLEMENTAL} is not from a supplied source.\n`;

function file(step: StepKey, path: string, format: string, content: string | Buffer, access: Access, sourceRefs: string[], status: OutputStatus = "ready", extra: Partial<GeneratedFile> = {}): GeneratedFile {
  return { step, path, format, content, access, status, sourceRefs, ...extra };
}

/** Concept list for flows/mind maps: definition terms first, then key terms, by first appearance. */
export function concepts(m: Model, n: number): { term: string; def?: Definition }[] {
  const out: { term: string; def?: Definition }[] = [];
  const seen = new Set<string>();
  for (const d of m.defs) {
    const k = d.term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ term: d.term, def: d });
  }
  for (const t of m.terms) {
    if (out.length >= n * 2) break;
    if ([...seen].some((s) => s.includes(t.term) || t.term.includes(s))) continue;
    seen.add(t.term);
    out.push({ term: t.display });
  }
  return out.slice(0, n);
}

/* ======================================================================
 * Step: map_outcomes
 * ==================================================================== */

export function genMapOutcomes(m: Model): GeneratedFile[] {
  const relevance = (m.applied.length ? m.applied : m.summary).slice(0, 3);
  const keyTermsMd = concepts(m, 10)
    .map((c) => (c.def ? `- **${md(c.def.term)}** — ${md(excerpt(c.def.definition, 30))} [${c.def.sentence.ref}]` : `- **${md(c.term)}** — appears in ${sentenceFor(m, c.term) ? `[${sentenceFor(m, c.term)!.ref}]` : "the readings"}`))
    .join("\n");
  const mis = m.misconceptions.length ? m.misconceptions.slice(0, 5).map((s) => `- ${cite(s)}`).join("\n") : `- ${SUPPLEMENTAL} The supplied sources name no explicit misconceptions. Instructor: add common errors you have observed.`;
  const losMd = m.los
    .map((l) => `- **${l.id}.** ${md(l.text)}${MEASURABLE.test(l.text) ? "" : " _(Review: start with a measurable verb such as explain, apply, configure or evaluate.)_"}`)
    .join("\n");
  const body = `${header(m, `Topic Overview — ${md(m.input.topicTitle)}`)}
## Practical relevance
${relevance.length ? relevance.map((s) => `- ${cite(s)}`).join("\n") : `- ${SUPPLEMENTAL} No source sentences available; add sources.`}

## Measurable learning objectives
${losMd}

## Key terms
${keyTermsMd || `- ${SUPPLEMENTAL} No key terms could be extracted; add sources.`}

## Common misconceptions
${mis}

## Sources used
${m.avail.map((s) => `- [${s.ref}] ${md(s.title)}`).join("\n") || "- None available."}
`;
  return [file("map_outcomes", "02_Overview_and_Lessons/topic_overview.md", "md", withLabel("md", body), "learner", refsOf(m, [...relevance, ...m.misconceptions, ...m.defs.map((d) => d.sentence)]))];
}

/* ======================================================================
 * Step: lessons_readings
 * ==================================================================== */

export function apaEntry(s: GenSource): string {
  const who = s.author ? md(s.author) : null;
  const yr = s.year ? md(s.year) : "n.d.";
  const title = md(s.title);
  if (s.kind === "url") return who ? `${who}. (${yr}). *${title}*. ${s.url}` : `*${title}*. (${yr}). ${s.url}`;
  if (s.kind === "file") return who ? `${who}. (${yr}). *${title}* [Course document: ${md(s.filename ?? "upload")}].` : `*${title}*. (${yr}). [Course document: ${md(s.filename ?? "upload")}].`;
  return who ? `${who}. (${yr}). *${title}* [Instructor-supplied notes].` : `*${title}*. (${yr}). [Instructor-supplied notes].`;
}

function readingList(m: Model): GeneratedFile {
  const avail = m.avail.map((s) => `- [${s.ref}] ${apaEntry(s)}`).join("\n");
  const un = m.unavailable.map((s) => `- ${apaEntry(s)} — **status: unavailable** (${md(s.reason ?? "not reachable")}). Not cited in any output.`).join("\n");
  const body = `${header(m, "Reading List")}
Entries are formatted in APA style from the details supplied with each source. Only sources supplied to the Studio are listed; none were added.

## Readings
${avail || "- No available sources."}
${un ? `\n## Unavailable sources\n${un}\n` : ""}`;
  return file("lessons_readings", "01_Sources/reading_list.md", "md", withLabel("md", body), "learner", allRefs(m));
}

function lessons(m: Model): GeneratedFile {
  const used: Sentence[] = [];
  const byLo = new Map<string, Sentence[]>();
  for (const s of topSentences(m.sentences, m.scores, Math.min(40, m.sentences.length)).sort((a, b) => a.idx - b.idx)) {
    const lo = loFor(m, s.text);
    (byLo.get(lo) ?? byLo.set(lo, []).get(lo)!).push(s);
  }
  const units = m.los.map((lo, i) => {
    const sents = (byLo.get(lo.id) ?? []).slice(0, 5);
    const expl = sents.length ? sents : topSentences(m.sentences, m.scores, 3).slice(i, i + 2);
    used.push(...expl);
    const ex = m.examples.filter((e) => loFor(m, e.text) === lo.id).slice(0, 2);
    const exampleSents = ex.length ? ex : m.examples.slice(i, i + 1);
    used.push(...exampleSents);
    const exMd = exampleSents.length
      ? exampleSents.map((s, k) => `${k + 1}. ${cite(s)}`).join("\n") + `\n\n_Work through it:_ restate the example in your own words, name the concept it shows, and predict what changes if one condition changes.`
      : `${SUPPLEMENTAL} The sources contain no worked example for this objective. Scaffold: (1) pick one key term from this unit, (2) apply it to the Mini-Lab dataset, (3) record the input, the decision and the result, (4) compare with a classmate.`;
    return `## Lesson ${i + 1}: ${md(lo.text)}\n\n**Objective:** ${lo.id}\n\n### Explanation\n${expl.map((s) => `- ${cite(s)}`).join("\n") || `- ${SUPPLEMENTAL} Not enough source text for this objective.`}\n\n### Worked example\n${exMd}\n`;
  });
  const body = `${header(m, `Lessons — ${md(m.input.topicTitle)}`)}\n${units.join("\n")}`;
  return file("lessons_readings", "02_Overview_and_Lessons/lessons.md", "md", withLabel("md", body), "learner", refsOf(m, used));
}

function lectureNotes(m: Model): GeneratedFile {
  const used = new Set<number>();
  const sec = (title: string, list: Sentence[], n: number) => {
    const pick = list.filter((s) => !used.has(s.idx)).slice(0, n);
    pick.forEach((s) => used.add(s.idx));
    return `## ${title}\n${pick.length ? pick.map((s) => `- ${cite(s)}`).join("\n") : `- ${SUPPLEMENTAL} No source sentences for this section.`}\n`;
  };
  const body = `${header(m, `Lecture Notes — ${md(m.input.topicTitle)}`)}
${sec("Context and overview", m.summary, 4)}
${sec("Foundational concepts", m.defs.map((d) => d.sentence), 6)}
${sec("Process and architecture", m.process, 5)}
${sec("Examples", m.examples, 4)}
${sec("Real-world application", m.applied, 4)}
${sec("Common mistakes", m.misconceptions, 4)}
${sec("Further detail", topSentences(m.sentences, m.scores, 30), 8)}`;
  return file("lessons_readings", "02_Overview_and_Lessons/lecture_notes.md", "md", withLabel("md", body), "learner", refsOf(m, m.sentences.filter((s) => used.has(s.idx))));
}

function lectureOverview(m: Model): GeneratedFile {
  const pts = m.summary.slice(0, 5);
  const body = `${header(m, `Lecture Overview (1 page) — ${md(m.input.topicTitle)}`)}
**Instructor:** ${INSTRUCTOR_NAME}, ${INSTRUCTOR_ROLE}

## Objectives
${m.los.map((l) => `- ${l.id}: ${md(l.text)}`).join("\n")}

## Five key points
${pts.map((s, i) => `${i + 1}. ${cite(s, 30)}`).join("\n") || `${SUPPLEMENTAL} Add sources.`}

## Key terms
${concepts(m, 8).map((c) => md(c.term)).join(" · ") || "—"}

## Readings
${m.avail.map((s) => `[${s.ref}] ${md(s.title)}`).join("; ") || "—"}
`;
  return file("lessons_readings", "02_Overview_and_Lessons/lecture_overview.md", "md", withLabel("md", body), "learner", refsOf(m, pts));
}

function summaryMd(m: Model): GeneratedFile {
  const pts = m.summary.slice(0, 8);
  const body = `${header(m, `Summary — ${md(m.input.topicTitle)}`)}
${pts.map((s) => cite(s)).join(" ") || `${SUPPLEMENTAL} No source text available.`}

**Key terms:** ${concepts(m, 10).map((c) => md(c.term)).join(", ") || "—"}
`;
  return file("lessons_readings", "02_Overview_and_Lessons/summary.md", "md", withLabel("md", body), "learner", refsOf(m, pts));
}

/* ---------- Flashcards ---------- */

export interface Flashcard {
  front: string;
  back: string;
  topic: string;
  lo: string;
  difficulty: "easy" | "medium" | "hard";
  tag: "definition" | "cloze" | "why" | "concept";
  sourceRef: string;
}

export function buildFlashcards(m: Model, max = 40): Flashcard[] {
  const cards: Flashcard[] = [];
  const usedSent = new Set<number>();
  const fronts = new Set<string>();
  const add = (c: Flashcard, s: Sentence) => {
    const k = c.front.toLowerCase().replace(/\W+/g, " ").trim();
    if (fronts.has(k) || usedSent.has(s.idx) || cards.length >= max) return;
    fronts.add(k);
    usedSent.add(s.idx);
    cards.push(c);
  };
  const topic = m.input.topicTitle;
  for (const d of m.defs) add({ front: definitionQuestion(d), back: `${excerpt(cap(d.definition), 35)} [${d.sentence.ref}]`, topic, lo: loFor(m, d.sentence.text), difficulty: "easy", tag: "definition", sourceRef: d.sentence.ref }, d.sentence);
  for (const s of m.why) {
    const p = whyParts(s.text);
    if (!p || wordCount(p.claim) > 30) continue;
    const lead = p.marker === "because" ? "Because" : p.marker === "therefore" ? "Therefore" : p.marker === "which means" ? "It means" : cap(p.marker);
    add({ front: `Why does this hold, according to the readings: “${excerpt(p.claim, 25)}”?`, back: `${lead} ${excerpt(p.reason, 30)} [${s.ref}]`, topic, lo: loFor(m, s.text), difficulty: "hard", tag: "why", sourceRef: s.ref }, s);
  }
  for (const s of topSentences(m.sentences, m.scores, m.sentences.length)) {
    if (s.words > 40) continue;
    const t = bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term));
    if (!t) continue;
    const c = cloze(s.text, t.term);
    if (!c) continue;
    add({ front: `Fill in the blank: ${c.prompt}`, back: `${c.answer} [${s.ref}]`, topic, lo: loFor(m, s.text), difficulty: "medium", tag: "cloze", sourceRef: s.ref }, s);
  }
  for (const t of m.terms) {
    const s = sentenceFor(m, t.term, usedSent);
    if (!s) continue;
    add({ front: `What do the readings say about “${t.display}”?`, back: `${excerpt(s.text, 35)} [${s.ref}]`, topic, lo: loFor(m, s.text), difficulty: "medium", tag: "concept", sourceRef: s.ref }, s);
  }
  return cards;
}

function flashcardFiles(m: Model): GeneratedFile[] {
  const cards = buildFlashcards(m);
  const status: OutputStatus = cards.length >= 20 ? "ready" : "needs_more_sources";
  const reason = status === "ready" ? undefined : `Only ${cards.length} meaningful flashcards could be built from the supplied sources (target ≥ 20). Add sources.`;
  const refs = [...new Set(cards.map((c) => m.avail.find((s) => s.ref === c.sourceRef)?.id).filter(Boolean) as string[])];
  const csv = [csvRow(["front", "back", "topic", "lo", "difficulty", "tag"]), ...cards.map((c) => csvRow([c.front, c.back, c.topic, c.lo, c.difficulty, c.tag]))].join("\n") + "\n";
  const json = JSON.stringify({ label: DRAFT_LABEL, topic: m.input.topicTitle, count: cards.length, status, reason: reason ?? null, cards: cards.map(({ sourceRef: _r, ...c }) => c) }, null, 2);
  return [
    file("lessons_readings", "07_Study_Guides_and_Flashcards/flashcards.csv", "csv", withLabel("csv", csv), "learner", refs, status, { reason, meta: { count: cards.length } }),
    file("lessons_readings", "07_Study_Guides_and_Flashcards/flashcards.json", "json", json, "learner", refs, status, { reason, meta: { count: cards.length } }),
  ];
}

/* ---------- Study guide ---------- */

function studyGuide(m: Model): GeneratedFile {
  const quiz = buildQuiz(m, new Set(), 1).questions;
  const labs = buildLabSpecs(m);
  const glossary = concepts(m, 16)
    .map((c) => {
      const s = c.def?.sentence ?? sentenceFor(m, c.term);
      return `- **${md(c.term)}** — ${c.def ? md(excerpt(c.def.definition, 30)) : s ? md(excerpt(s.text, 30)) : SUPPLEMENTAL} ${s ? `[${s.ref}]` : ""}`;
    })
    .join("\n");
  const map = m.los
    .map((l) => {
      const qs = quiz.map((q, i) => (q.lo === l.id ? `Q${i + 1}` : "")).filter(Boolean).join(", ") || "—";
      const ts = labs.flatMap((lab, li) => lab.tasks.map((t, ti) => ({ t, li, ti }))).filter(({ t }) => ("prompt" in t ? loFor(m, t.prompt) : "LO1") === l.id).map(({ li, ti }) => `ML${li + 1}.${ti + 1}`).slice(0, 6).join(", ") || "—";
      const terms = m.terms.filter((t) => tokens(l.text).some((w) => t.term.includes(w) && w.length > 3)).slice(0, 3).map((t) => t.display).join(", ") || md(m.input.topicTitle);
      return `| ${l.id} | ${md(excerpt(l.text, 18))} | ${md(terms)} | ${qs} | ${ts} | ${m.assessments.map((a) => md(a.title)).join("; ")} |`;
    })
    .join("\n");
  const conceptSum = concepts(m, 6)
    .map((c) => {
      const ss = m.sentences.filter((s) => containsTerm(s.text, c.term)).slice(0, 2);
      return `### ${md(c.term)}\n${ss.map((s) => `- ${cite(s, 35)}`).join("\n") || `- ${SUPPLEMENTAL}`}`;
    })
    .join("\n\n");
  const prompts = [
    ...m.defs.slice(0, 3).map((d) => `- In your own words, explain ${md(d.term)} and give one situation where it matters.`),
    ...m.misconceptions.slice(0, 2).map((s) => `- The readings warn: “${md(excerpt(s.text, 20))}” [${s.ref}]. Why might someone make this mistake?`),
    `- How would you explain ${md(m.input.topicTitle)} to a teammate in three sentences?`,
  ].join("\n");
  const body = `${header(m, `Study Guide — ${md(m.input.topicTitle)}`)}
## Learning objective checklist
${m.los.map((l) => `- [ ] ${l.id}: ${md(l.text)}`).join("\n")}

## Objective ↔ topic ↔ assessment map
| Objective | Statement | Key terms | Practice quiz | Mini-lab tasks | Assessments |
|---|---|---|---|---|---|
${map}

## Glossary
${glossary || `- ${SUPPLEMENTAL} No terms extracted.`}

## Concept summaries
${conceptSum}

## Practice prompts
${prompts}

## Self-assessment checklist
- [ ] I can define every glossary term without looking.
- [ ] I scored 8/10 or better on the practice quiz.
- [ ] I completed Mini-Lab 1 (guided) and Mini-Lab 2 (apply/debug).
- [ ] I can name one common mistake and how to avoid it.
- [ ] I reviewed every reading marked in the reading list.
`;
  return file("lessons_readings", "07_Study_Guides_and_Flashcards/study_guide.md", "md", withLabel("md", body), "learner", allRefs(m));
}

const bibEsc = (v: string) => String(v).replace(/[\\{}]/g, "").replace(/([&%$#_])/g, "\\$1").replace(/\s+/g, " ").trim();

/** BibTeX for every supplied source (only details the instructor supplied; nothing inferred). */
export function bibtex(m: Model): string {
  const entry = (s: GenSource) => {
    const key = `${(s.author ?? "source").split(/[\s,]+/)[0].replace(/[^A-Za-z]/g, "") || "source"}${(s.year ?? "nd").replace(/\D/g, "") || "nd"}_${(s.ref ?? s.id).replace(/[^A-Za-z0-9]/g, "")}`;
    const f: [string, string | null | undefined][] = [
      ["title", s.title],
      ["author", s.author],
      ["year", s.year],
      ["howpublished", s.kind === "url" && s.url ? `\\url{${String(s.url).replace(/[{}\\\s]/g, "")}}` : s.kind === "file" ? `Course document: ${s.filename ?? "upload"}` : "Instructor-supplied notes"],
      ["note", `${s.ref ? `Cited as [${s.ref}] in the Studio outputs. ` : ""}${s.status === "available" ? "" : `Unavailable: ${s.reason ?? "not reachable"}. Not cited.`}`.trim()],
    ];
    return `@misc{${key},\n${f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${k === "howpublished" && s.kind === "url" ? v : bibEsc(String(v))}}`).join(",\n")}\n}`;
  };
  return `% ${DRAFT_LABEL}\n% ${m.input.courseCode} Module ${pad2(m.input.moduleNumber)} — ${m.input.topicTitle}: sources supplied to the Studio.\n\n${[...m.avail, ...m.unavailable].map(entry).join("\n\n")}\n`;
}

export function genLessonsReadings(m: Model): GeneratedFile[] {
  return [readingList(m), file("lessons_readings", "01_Sources/sources_master.bib", "bib", bibtex(m), "learner", allRefs(m)), lessons(m), lectureNotes(m), lectureOverview(m), summaryMd(m), studyGuide(m), ...flashcardFiles(m)];
}

/* ======================================================================
 * Quiz
 * ==================================================================== */

const normStem = (s: string) => s.toLowerCase().replace(/\W+/g, " ").trim();

/** Concept vocabulary for distractors and swaps: definition terms, then multi-word key terms. */
function conceptPool(m: Model): string[] {
  const generic = (t: { n: number; freq: number }) => t.n === 1 && t.freq > Math.max(6, m.sentences.length * 0.2);
  return [...new Map([...m.defs.map((d) => d.term), ...m.terms.filter((t) => t.n > 1 && !generic(t)).map((t) => t.display)].map((t) => [t.toLowerCase(), t])).values()];
}
const prefTerms = (m: Model) => m.defs.map((d) => d.term);
const overlaps = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
};

function swapTerm(m: Model, s: Sentence, seed: string): { text: string; from: string; to: string } | null {
  const inSentence = conceptPool(m).filter((t) => containsTerm(s.text, t)).sort((a, b) => b.length - a.length);
  const fromTerm = inSentence[0] ?? bestTermIn(s.text, m.terms, m.sentences.length, prefTerms(m))?.term;
  if (!fromTerm) return null;
  const to = stableShuffle(conceptPool(m).filter((t) => !overlaps(t, fromTerm) && !containsTerm(s.text, t)), `${seed}:${s.idx}`)[0];
  if (!to) return null;
  const c = cloze(s.text, fromTerm);
  if (!c) return null;
  const [before, after] = c.prompt.split("_____");
  const head = before.replace(/(^|\s)(an?|the)\s$/i, "$1");
  const text = head ? `${head}${to}${after}` : `${cap(to)}${after}`;
  return { text, from: c.answer, to };
}

function termOptions(m: Model, correct: string, context: string, seed: string, n = 3): string[] {
  const ok = (t: string) => !overlaps(t, correct) && !containsTerm(context, t);
  const defTerms = stableShuffle(m.defs.map((d) => d.term).filter(ok), seed);
  const primary = defTerms.length >= n ? defTerms : [...defTerms, ...stableShuffle(conceptPool(m).filter((t) => ok(t) && !defTerms.includes(t)), seed)];
  if (primary.length >= n) return primary.slice(0, n);
  const extra = stableShuffle(m.terms.map((t) => t.display).filter((t) => ok(t) && !primary.includes(t)), seed);
  return [...primary, ...extra].slice(0, n);
}

function distractorWhy(m: Model, term: string): string {
  const d = defOf(m, term);
  return d ? `“${term}” is a different concept; the readings describe it as “${excerpt(d.definition, 15)}” [${d.sentence.ref}].` : `“${term}” is another key term from the readings, but it does not fit this description.`;
}

interface Candidate {
  type: QuizQuestion["type"];
  build: (seed: string) => Omit<QuizQuestion, "id"> | null;
  stem: string;
  /** Source sentences the item is built on (an item never reuses another item's sentence). */
  sents?: number[];
}

function quizCandidates(m: Model): Candidate[] {
  const out: Candidate[] = [];
  const letters = ["a", "b", "c", "d", "e"];
  const mcFromTerms = (type: QuizQuestion["type"], stem: string, correct: string, s: Sentence, bloom: QuizQuestion["bloom"], difficulty: QuizQuestion["difficulty"], context: string): Candidate => ({
    type,
    stem,
    sents: [s.idx],
    build: (seed) => {
      const ds = termOptions(m, correct, context, seed + stem);
      if (ds.length < 3) return null;
      const opts = stableShuffle([correct, ...ds], seed + "o" + stem);
      const options = opts.map((t, i) => ({ id: letters[i], text: t }));
      const ok = options.find((o) => o.text === correct)!.id;
      return {
        type,
        stem,
        options,
        correct: [ok],
        explanation: `The readings state: “${excerpt(s.text, 30)}” [${s.ref}].`,
        sourceRef: s.ref,
        sourceId: s.sourceId,
        sourceExcerpt: excerpt(s.text, 30),
        distractorRationale: Object.fromEntries(options.filter((o) => o.id !== ok).map((o) => [o.id, distractorWhy(m, o.text)])),
        lo: loFor(m, s.text),
        bloom,
        difficulty,
      };
    },
  });
  for (const d of m.defs) {
    out.push(mcFromTerms("multiple_choice", `Which term matches this description from the readings: “${excerpt(d.definition, 25)}”?`, d.term, d.sentence, "Remember", "easy", d.definition));
  }
  const isConcept = (t: { term: string; n: number }) => t.n > 1 || m.defs.some((d) => d.term.toLowerCase() === t.term);
  for (const s of [...m.applied, ...m.examples]) {
    const t = bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term));
    if (!t || !isConcept(t) || s.words > 45) continue;
    const c = cloze(s.text, t.term);
    if (!c) continue;
    out.push(mcFromTerms("scenario", `Scenario: a team working on ${m.input.topicTitle} reads this situation — “${c.prompt.replace("_____", "[this concept]")}” Which concept fills the gap?`, t.display, s, "Apply", "medium", c.prompt));
  }
  for (const d of m.defs) {
    out.push(mcFromTerms("scenario", `Scenario: during the ${m.input.topicTitle} lab, a learner needs the capability described as “${excerpt(d.definition, 18)}”. Which concept should they apply?`, d.term, d.sentence, "Apply", "medium", d.definition));
  }
  for (const s of topSentences(m.sentences, m.scores, 30)) {
    if (s.words > 40) continue;
    const t = bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term));
    if (!t || !isConcept(t)) continue;
    const c = cloze(s.text, t.term);
    if (!c) continue;
    out.push(mcFromTerms("multiple_choice", `Complete the statement from the readings: “${c.prompt}”`, t.display, s, "Understand", "medium", c.prompt));
  }
  for (const s of topSentences(m.sentences, m.scores, 24)) {
    if (s.words > 35) continue;
    for (const truth of hash(String(s.idx)) % 2 ? [false, true] : [true, false]) {
      const stmtFor = (seed: string) => (truth ? { text: s.text, from: "", to: "" } : swapTerm(m, s, seed));
      const probe = stmtFor("probe");
      if (!probe) continue;
      const stem = `True or false: “${truth ? s.text : probe.text}”`;
      out.push({
        type: "true_false",
        stem,
        sents: [s.idx],
        build: () => ({
          type: "true_false",
          stem,
          options: [
            { id: "t", text: "True" },
            { id: "f", text: "False" },
          ],
          correct: [truth ? "t" : "f"],
          explanation: truth ? `True. The readings state: “${excerpt(s.text, 30)}” [${s.ref}].` : `False. The statement replaces “${probe.from}” with “${probe.to}”. The readings state: “${excerpt(s.text, 30)}” [${s.ref}].`,
          sourceRef: s.ref,
          sourceId: s.sourceId,
          sourceExcerpt: excerpt(s.text, 30),
          distractorRationale: (truth ? { f: "The statement matches the source sentence." } : { t: `The statement was altered: “${probe.to}” replaces “${probe.from}”.` }) as Record<string, string>,
          lo: loFor(m, s.text),
          bloom: "Understand",
          difficulty: "easy",
        }),
      });
    }
  }
  const pool = topSentences(m.sentences, m.scores, 30).filter((s) => s.words <= 32);
  for (let i = 0; i + 3 < pool.length; i += 2) {
    const group = pool.slice(i, i + 4);
    const stem = `Which of the following statements are supported by the readings? Select all that apply. (Group ${i / 2 + 1})`;
    out.push({
      type: "multiple_response",
      stem,
      sents: group.map((g) => g.idx),
      build: (seed) => {
        const trueOnes = group.slice(0, 2);
        const altered = group.slice(2, 4).map((s) => ({ s, sw: swapTerm(m, s, seed) }));
        if (altered.some((a) => !a.sw)) return null;
        const items = stableShuffle(
          [...trueOnes.map((s) => ({ text: s.text, ok: true, s, why: "" })), ...altered.map((a) => ({ text: a.sw!.text, ok: false, s: a.s, why: `Altered: “${a.sw!.to}” replaces “${a.sw!.from}” (source: [${a.s.ref}]).` }))],
          seed + stem,
          (x) => x.text,
        );
        const options = items.map((x, k) => ({ id: letters[k], text: excerpt(x.text, 35) }));
        return {
          type: "multiple_response",
          stem,
          options,
          correct: items.map((x, k) => (x.ok ? letters[k] : "")).filter(Boolean),
          explanation: `Supported statements come directly from the readings: ${trueOnes.map((s) => `“${excerpt(s.text, 18)}” [${s.ref}]`).join("; ")}.`,
          sourceRef: trueOnes[0].ref,
          sourceId: trueOnes[0].sourceId,
          sourceExcerpt: excerpt(trueOnes[0].text, 30),
          distractorRationale: Object.fromEntries(items.map((x, k) => [letters[k], x.why]).filter(([, w]) => w)),
          lo: loFor(m, trueOnes[0].text),
          bloom: "Analyze",
          difficulty: "hard",
        };
      },
    });
  }
  return out;
}

export function buildQuiz(m: Model, avoidStems: Set<string>, setNo: number, n = 10): { questions: QuizQuestion[]; status: OutputStatus; reason?: string } {
  const seed = `set${setNo}`;
  const cands = quizCandidates(m).filter((c) => !avoidStems.has(normStem(c.stem)));
  const ordered = setNo === 1 ? cands : stableShuffle(cands, seed, (c) => c.stem);
  const want: [QuizQuestion["type"], number][] = [
    ["multiple_choice", 4],
    ["multiple_response", 2],
    ["true_false", 2],
    ["scenario", 2],
  ];
  const chosen: Omit<QuizQuestion, "id">[] = [];
  const used = new Set<string>();
  const usedSentence = new Set<number>();
  const take = (c: Candidate) => {
    if (chosen.length >= n || used.has(c.stem)) return false;
    if ((c.sents ?? []).some((i) => usedSentence.has(i))) return false;
    const q = c.build(seed);
    if (!q) return false;
    used.add(c.stem);
    (c.sents ?? []).forEach((i) => usedSentence.add(i));
    chosen.push(q);
    return true;
  };
  for (const [type, k] of want) {
    let got = 0;
    for (const c of ordered) if (got < k && c.type === type && take(c)) got++;
  }
  for (const c of ordered) if (chosen.length < n) take(c);
  const order: Record<string, number> = { multiple_choice: 0, scenario: 1, true_false: 2, multiple_response: 3 };
  const questions = chosen.sort((a, b) => order[a.type] - order[b.type]).map((q, i) => ({ id: `q${i + 1}`, ...q }));
  return questions.length >= n ? { questions, status: "ready" } : { questions, status: "needs_more_sources", reason: `Only ${questions.length} new questions could be built from the supplied sources (target ${n}).` };
}

export function quizFiles(m: Model, quiz: ReturnType<typeof buildQuiz>, setNo: number, step: StepKey = "assessments_rubrics"): GeneratedFile[] {
  const sfx = setNo === 1 ? "" : `_set_${setNo}`;
  const refs = [...new Set(quiz.questions.map((q) => q.sourceId))];
  const L = (q: QuizQuestion, id: string) => q.options.find((o) => o.id === id)?.text ?? id;
  const typeName: Record<string, string> = { multiple_choice: "Multiple choice", multiple_response: "Multiple response", true_false: "True / false", scenario: "Scenario" };
  const student = `${header(m, `Practice Quiz${setNo > 1 ? ` — Set ${setNo}` : ""}`)}
Practice only — not graded. ${quiz.questions.length} questions.

${quiz.questions.map((q, i) => `### ${i + 1}. ${typeName[q.type]} (${q.lo})\n${md(q.stem)}\n\n${q.options.map((o) => `- ${o.id.toUpperCase()}. ${md(o.text)}`).join("\n")}\n`).join("\n")}`;
  const key = `${header(m, `Practice Quiz — Instructor Key${setNo > 1 ? ` (Set ${setNo})` : ""}`)}
${quiz.questions
  .map(
    (q, i) => `### Q${i + 1} (${typeName[q.type]} · ${q.lo} · ${q.bloom} · ${q.difficulty})
${md(q.stem)}

**Q${i + 1} answer:** ${q.correct.map((c) => `${c.toUpperCase()}. ${md(L(q, c))}`).join("; ")}

Explanation (Q${i + 1}): ${md(q.explanation)}

Distractor rationale:
${Object.entries(q.distractorRationale).map(([id, why]) => `- ${id.toUpperCase()}: ${md(why)}`).join("\n") || "- —"}
`,
  )
  .join("\n")}`;
  const json = JSON.stringify({ label: DRAFT_LABEL, set: setNo, status: quiz.status, reason: quiz.reason ?? null, questions: quiz.questions }, null, 2);
  return [
    file(step, `08_Practice_Quizzes/practice_quiz${sfx}.json`, "json", json, "instructor", refs, quiz.status, { reason: quiz.reason, meta: { count: quiz.questions.length, stems: quiz.questions.map((q) => normStem(q.stem)) } }),
    file(step, `08_Practice_Quizzes/practice_quiz${sfx}_student.md`, "md", withLabel("md", student), "learner", refs, quiz.status, { reason: quiz.reason }),
    file(step, `08_Practice_Quizzes/practice_quiz${sfx}_key.md`, "md", withLabel("md", key), "instructor", refs, quiz.status, { reason: quiz.reason }),
  ];
}
export const quizStems = (q: QuizQuestion[]) => q.map((x) => normStem(x.stem));

/* ======================================================================
 * Rubrics
 * ==================================================================== */

const CRITERIA: Record<AssessmentInput["kind"], string[]> = {
  project: ["Functional correctness", "Real-world requirements", "Tool and environment use", "Testing and validation", "Explanation and documentation"],
  lab: ["Lab task correctness", "Lab requirements coverage", "Tool and environment use", "Verification and testing", "Lab write-up"],
  "mini-lab": ["Task accuracy", "Applying the concepts", "Lab tool use", "Checking your work", "Reflection notes"],
  quiz: ["Answer accuracy", "Concept application", "Use of course materials", "Reviewing results", "Explaining reasoning"],
  worksheet: ["Response accuracy", "Use of examples", "Use of course tools", "Self-checking", "Clarity of writing"],
  activity: ["Activity completion and correctness", "Real-world connection", "Tool and environment use", "Testing and reflection", "Explanation and documentation"],
};
const WEIGHTS = [40, 20, 15, 15, 10];
const LEVELS = [
  ["Exemplary", 1],
  ["Proficient", 0.8],
  ["Developing", 0.6],
  ["Beginning", 0.3],
] as const;

export function rubricRows(m: Model, a: AssessmentInput) {
  const total = a.points ?? 100;
  const names = CRITERIA[a.kind] ?? CRITERIA.project;
  return names.map((name, i) => {
    const pts = Math.round((WEIGHTS[i] / 100) * total * 10) / 10;
    const lo = m.los[i % m.los.length]?.id ?? "LO1";
    const desc = [
      `Work runs or answers correctly against the stated requirements of “${a.title}”.`,
      `Addresses the realistic constraints and requirements described for ${m.input.topicTitle}.`,
      `Uses the provided lab environment, tools and permissions appropriately and within limits.`,
      `Shows evidence of testing: inputs, expected vs actual results, and fixes.`,
      `Explains decisions clearly with embedded code, output screenshots and cited readings.`,
    ][i];
    const levels = LEVELS.map(([lvl, k]) => ({ level: lvl, points: Math.round(pts * k * 10) / 10, descriptor: `${lvl}: ${["fully meets and extends", "meets", "partially meets", "does not yet meet"][LEVELS.findIndex((x) => x[0] === lvl)]} the criterion.` }));
    const evidence = ["Working artifact + run output", "Requirement checklist with references", "Environment screenshots / logs", "Test cases and results", "2–3-page APA paper with code, explanations, screenshots and references"][i];
    return { criterion: name, description: desc, levels, points: pts, evidence, lo, pass: i === 0 ? `Proficient or higher ${SUPPLEMENTAL}` : "—" };
  });
}

function rubricFiles(m: Model): GeneratedFile[] {
  return m.assessments.flatMap((a) => {
    const rows = rubricRows(m, a);
    const total = a.points ?? 100;
    const mdBody = `${header(m, `Rubric — ${md(a.title)} (${a.kind}, ${total} pts)`)}
| Criterion | Description | Exemplary | Proficient | Developing | Beginning | Points | Evidence required | LO | Pass requirement |
|---|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.criterion} | ${md(r.description)} | ${r.levels[0].points} | ${r.levels[1].points} | ${r.levels[2].points} | ${r.levels[3].points} | ${r.points} | ${r.evidence} | ${r.lo} | ${r.pass} |`).join("\n")}

**Overall pass requirement:** ${Math.round(total * 0.7)} of ${total} points and criterion 1 at Proficient or higher ${SUPPLEMENTAL} (default threshold; instructor sets the final policy).
`;
    const csv = [csvRow(["criterion", "description", "exemplary", "proficient", "developing", "beginning", "points", "evidence_required", "lo_alignment", "pass_requirement"]), ...rows.map((r) => csvRow([r.criterion, r.description, r.levels[0].points, r.levels[1].points, r.levels[2].points, r.levels[3].points, r.points, r.evidence, r.lo, r.pass]))].join("\n") + "\n";
    const student = `${header(m, `What Good Looks Like — ${md(a.title)} (${total} pts)`)}
Student version of the rubric. Use it as a checklist before you submit; your instructor grades with the full rubric.

${rows.map((r, k) => `### ${k + 1}. ${r.criterion} — ${r.points} pts (${r.lo})
- [ ] ${md(r.description)}
- [ ] I included: ${r.evidence}.
- **Proficient** means it meets the criterion; **Exemplary** means it meets and goes beyond it (for example, extra tests, clearer reasoning or a well-cited extension).
`).join("\n")}
**To pass:** about ${Math.round(total * 0.7)} of ${total} points, with “${rows[0]?.criterion ?? "criterion 1"}” at Proficient or higher (your instructor confirms the final policy).
`;
    const calibration = `${header(m, `Rubric Calibration Notes — ${md(a.title)}`)}
For instructors and TAs grading the same assessment. Calibrate before grading the first batch.

## Norming routine
1. Each grader scores the same three anonymised submissions independently with \`rubric_${a.key}.md\`.
2. Compare scores criterion by criterion. Any criterion more than one level apart is discussed until the graders agree on the reading of the descriptor.
3. Record the agreed reading below and keep the three samples as anchors (with the learners' consent, or use instructor-written samples).
4. Re-check agreement after the first ten submissions; repeat the routine if graders drift.

## Telling the levels apart
${rows.map((r) => `- **${r.criterion}** (${r.points} pts) — Proficient: ${md(r.description)} Exemplary adds something beyond it. Developing: part of it is missing or incorrect. Beginning: little or no evidence. Evidence to look for: ${r.evidence}.`).join("\n")}

## Common scoring errors
- Letting writing quality raise the score on correctness criteria (score each criterion on its own evidence).
- Penalising the same mistake under several criteria.
- Rewarding length rather than evidence.
- Treating an AI-assisted section as misconduct without checking the course's AI-use policy for this assessment.

## Agreed readings
| Criterion | Agreed reading | Anchor sample | Date |
|---|---|---|---|
${rows.map((r) => `| ${r.criterion} |  |  |  |`).join("\n")}
`;
    return [
      file("assessments_rubrics", `12_Assessments_and_Rubrics/rubric_${a.key}.md`, "md", withLabel("md", mdBody), "learner", []),
      file("assessments_rubrics", `12_Assessments_and_Rubrics/rubric_${a.key}.csv`, "csv", withLabel("csv", csv), "learner", []),
      file("assessments_rubrics", `12_Assessments_and_Rubrics/rubric_${a.key}_student.md`, "md", withLabel("md", student), "learner", []),
      file("assessments_rubrics", `12_Assessments_and_Rubrics/rubric_${a.key}_calibration.md`, "md", withLabel("md", calibration), "instructor", []),
    ];
  });
}

export function genAssessmentsRubrics(m: Model): GeneratedFile[] {
  const quiz = buildQuiz(m, new Set(), 1);
  const answerKeys = `${header(m, "Answer Keys (Instructor)")}
- Practice quiz key: \`08_Practice_Quizzes/practice_quiz_key.md\` (${quiz.questions.length} questions).
- Mini-lab keys: \`10_Instructor_Resources/minilab_keys.json\` (checked server-side with \`checkMiniLab\`).
- Rubrics: ${m.assessments.map((a) => `\`12_Assessments_and_Rubrics/rubric_${a.key}.md\``).join(", ")}.

## Quick key
${quiz.questions.map((q, i) => `- Q${i + 1} answer: ${q.correct.map((c) => c.toUpperCase()).join(", ")} (${q.lo})`).join("\n")}
`;
  return [...quizFiles(m, quiz, 1), ...rubricFiles(m), file("assessments_rubrics", "10_Instructor_Resources/answer_keys.md", "md", withLabel("md", answerKeys), "instructor", [...new Set(quiz.questions.map((q) => q.sourceId))])];
}

/* ======================================================================
 * Mini-labs
 * ==================================================================== */

const BROKEN_CONFIG = `# Practice runner configuration (contains deliberate errors)
runner:
  max_steps: 0
  timeout_seconds: -30
  network: open
  tools_allowed: ["*"]
  api_key: PASTE-YOUR-KEY-HERE
  log_tool_calls: false
`;

export function buildLabSpecs(m: Model): LabSpec[] {
  const matchPool = m.defs.length >= 3 ? m.defs.slice(0, 6) : [];
  const termsForMatch = matchPool.map((d) => d.term).sort((a, b) => a.localeCompare(b));
  const lab1Tasks: LabTask[] = matchPool.map((d, i) => ({ id: `m${i + 1}`, type: "match", prompt: excerpt(cap(d.definition), 28), sourceRef: d.sentence.ref, options: termsForMatch, answer: d.term }));
  if (lab1Tasks.length < 3) {
    const cl = topSentences(m.sentences, m.scores, 20)
      .map((s) => ({ s, t: bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term)) }))
      .filter((x) => x.t && x.s.words <= 40)
      .slice(0, 6);
    const opts = [...new Set(cl.map((x) => x.t!.display))].sort();
    cl.forEach((x) => {
      const c = cloze(x.s.text, x.t!.term);
      if (c) lab1Tasks.push({ id: `m${lab1Tasks.length + 1}`, type: "match", prompt: c.prompt, sourceRef: x.s.ref, options: opts, answer: x.t!.display });
    });
  }
  const lab2: LabTask[] = [];
  if (m.process.length >= 3) {
    const steps = m.process.slice(0, 5).map((s, i) => ({ id: `p${i + 1}`, text: `${excerpt(s.text, 25)} [${s.ref}]` }));
    let shown = stableShuffle(steps, "order", (x) => x.id);
    if (shown.every((x, i) => x.id === steps[i].id)) shown = [...shown.slice(1), shown[0]];
    lab2.push({ id: "o1", type: "order", prompt: "Put these statements in the order the readings present them.", items: shown, answer: steps.map((s) => s.id) });
  }
  const cls = topSentences(m.sentences, m.scores, 16).filter((s) => s.words <= 32).slice(0, 4);
  cls.forEach((s, i) => {
    const alter = i % 2 === 1 ? swapTerm(m, s, `lab${i}`) : null;
    lab2.push({ id: `c${i + 1}`, type: "classify", prompt: "Does this statement match the readings, or has it been altered?", statement: excerpt(alter ? alter.text : s.text, 32), options: ["Matches the readings", "Altered"], answer: alter ? "Altered" : "Matches the readings", sourceRef: s.ref });
  });
  lab2.push({
    id: "f1",
    type: "config_fix",
    prompt: `Fix the practice runner configuration so it follows every lab rule below. ${SUPPLEMENTAL} These rules are the lab's practice policy, not statements from the readings.`,
    broken: BROKEN_CONFIG,
    rules: [
      { id: "r1", description: "max_steps is a whole number from 1 to 20.", pattern: "^\\s*max_steps:\\s*([1-9]|1\\d|20)\\s*$", mustMatch: true },
      { id: "r2", description: "timeout_seconds is a whole number from 1 to 900.", pattern: "^\\s*timeout_seconds:\\s*([1-9]\\d{0,1}|[1-8]\\d{2}|900)\\s*$", mustMatch: true },
      { id: "r3", description: "network is none or allowlist.", pattern: "^\\s*network:\\s*(none|allowlist)\\s*$", mustMatch: true },
      { id: "r4", description: "tools_allowed lists named tools only (no wildcard).", pattern: "^\\s*tools_allowed:.*\\*", mustMatch: false },
      { id: "r5", description: "No key is written inline; reference an environment variable with api_key_env.", pattern: "^\\s*api_key\\s*:", mustMatch: false },
      { id: "r6", description: "log_tool_calls is true.", pattern: "^\\s*log_tool_calls:\\s*true\\s*$", mustMatch: true },
    ],
  });
  return [
    { id: "minilab_1", title: `Mini-Lab 1 (guided): ${m.input.topicTitle} — match the concepts`, kind: "guided", intro: "Match each description from the readings to the concept it describes. Use the reading list and lessons if you get stuck.", tasks: lab1Tasks },
    { id: "minilab_2", title: `Mini-Lab 2 (apply/debug): ${m.input.topicTitle}`, kind: "apply_debug", intro: "Apply what you learned: check statements against the readings and repair a broken runner configuration.", tasks: lab2 },
  ];
}

/**
 * Three-step hint ladder per task: (1) where to look, (2) how to narrow it down, (3) a strong nudge.
 * Hints never contain the full answer; the worked solution comes from the server (see solutionFor).
 */
export function hintsFor(t: LabTask): [string, string, string] {
  switch (t.type) {
    case "match": {
      const words = t.answer.trim().split(/\s+/).length;
      return [
        `Find the sentence this description comes from in source [${t.sourceRef}] — the reading list links each source.`,
        `The description defines one concept. Rule out options that the readings define with a different sentence.`,
        `The concept starts with “${t.answer.trim().charAt(0).toUpperCase()}” and is ${words} word${words === 1 ? "" : "s"} long.`,
      ];
    }
    case "order":
      return [
        "The statements follow the order the readings present them — check each statement's [S#] reference first.",
        "Statements from the same source keep that source's sentence order; sources run S1, S2, S3 …",
        `Start with: “${excerpt(t.items.find((i) => i.id === t.answer[0])?.text ?? "", 10)}”`,
      ];
    case "classify":
      return [
        `Open source [${t.sourceRef}] and find the sentence with the same wording.`,
        "Compare key terms one by one — an altered statement swaps exactly one concept for another.",
        "If every key term matches the source sentence word for word, it matches; one swapped term means it was altered.",
      ];
    case "config_fix":
      return [
        "Check each requirement against one line of the configuration — six rules, six lines to look at.",
        "Four values are out of range or the wrong kind; two lines break a rule by what they contain (a wildcard and an inline key).",
        "Replace the inline key line with api_key_env: SOME_VARIABLE, list tools by name, and keep numbers inside the stated ranges.",
      ];
  }
}

/** Worked solution, returned only by the server after the learner has checked twice (staff any time). */
export function solutionFor(spec: LabSpec) {
  return spec.tasks.map((t) => {
    switch (t.type) {
      case "match":
      case "classify":
        return { id: t.id, answer: t.answer, why: `See the source sentence [${t.sourceRef}].` };
      case "order":
        return { id: t.id, answer: t.answer.map((id, k) => `${k + 1}. ${t.items.find((i) => i.id === id)?.text ?? id}`).join("\n"), why: "The order the readings present the statements." };
      case "config_fix":
        return { id: t.id, answer: "max_steps: 8\ntimeout_seconds: 300\nnetwork: allowlist\ntools_allowed: [glossary_lookup, source_search]\napi_key_env: STUDIO_RUNNER_KEY\nlog_tool_calls: true", why: `One configuration that satisfies every rule: ${t.rules.map((r) => r.description).join(" ")}` };
    }
  });
}

/** Strip answers for learner delivery. */
export function publicLabSpec(spec: LabSpec) {
  return {
    id: spec.id,
    title: spec.title,
    kind: spec.kind,
    intro: spec.intro,
    tasks: spec.tasks.map((t) => {
      switch (t.type) {
        case "match":
          return { id: t.id, type: t.type, prompt: t.prompt, sourceRef: t.sourceRef, options: t.options, hints: hintsFor(t) };
        case "order":
          return { id: t.id, type: t.type, prompt: t.prompt, items: t.items, hints: hintsFor(t) };
        case "classify":
          return { id: t.id, type: t.type, prompt: t.prompt, statement: t.statement, options: t.options, sourceRef: t.sourceRef, hints: hintsFor(t) };
        case "config_fix":
          return { id: t.id, type: t.type, prompt: t.prompt, broken: t.broken, requirements: t.rules.map((r) => r.description), hints: hintsFor(t) };
      }
    }),
  };
}

/** Server-side checking. Feedback never reveals the correct answer. */
export function checkMiniLab(spec: LabSpec, answers: Record<string, unknown>): LabCheckResult {
  const items = spec.tasks.map((t) => {
    const a = answers?.[t.id];
    switch (t.type) {
      case "match":
      case "classify": {
        const ok = typeof a === "string" && a.trim().toLowerCase() === t.answer.toLowerCase();
        return { id: t.id, correct: ok, feedback: ok ? "Correct." : `Not yet — re-read the source sentence [${t.sourceRef}].` };
      }
      case "order": {
        const arr = Array.isArray(a) ? a.map(String) : typeof a === "string" ? a.split(",").map((s) => s.trim()) : [];
        const ok = arr.length === t.answer.length && arr.every((x, i) => x === t.answer[i]);
        const right = arr.filter((x, i) => x === t.answer[i]).length;
        return { id: t.id, correct: ok, feedback: ok ? "Correct order." : `${right} of ${t.answer.length} positions are right.` };
      }
      case "config_fix": {
        const text = typeof a === "string" ? a.slice(0, 5000) : "";
        const failed = t.rules.filter((r) => new RegExp(r.pattern, "m").test(text) !== r.mustMatch);
        return { id: t.id, correct: !!text && !failed.length, feedback: !text ? "Paste your fixed configuration." : failed.length ? `Still failing: ${failed.map((r) => r.description).join(" ")}` : "All rules pass." };
      }
    }
  });
  return { labId: spec.id, score: items.filter((i) => i.correct).length, total: items.length, items };
}

/* ---------- Shared HTML shell ---------- */

const BASE_CSS = `
:root{--ink:#0f1a33;--muted:#3d4966;--bg:#ffffff;--panel:#f3f5fa;--navy:#0b1f4d;--gold:#f2c66d;--accent:#1b3a8a;--warn-bg:#fff4d6;--warn-ink:#5c3b00;--focus:#b8861f}
@media (prefers-color-scheme:dark){:root{--ink:#eef2fb;--muted:#c3cbe0;--bg:#0d1426;--panel:#172241;--accent:#9fb6ff;--warn-bg:#3a2a05;--warn-ink:#ffe2a3}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.55 "Source Sans 3","Segoe UI",system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px}h1,h2,h3{line-height:1.2}a{color:var(--accent)}
.draft{background:var(--warn-bg);color:var(--warn-ink);padding:10px 16px;font-weight:700;border-bottom:2px solid var(--focus)}
.brand{background:var(--navy);color:#fff;padding:10px 16px;font-weight:700;letter-spacing:.03em}.brand span{color:var(--gold)}
fieldset{border:1px solid var(--muted);border-radius:8px;margin:0 0 16px;padding:12px 16px}legend{font-weight:700;padding:0 6px}
label{display:block;margin:6px 0}select,input,textarea,button{font:inherit;color:inherit}
select,input[type=number],input[type=text],textarea{background:var(--bg);border:1px solid var(--muted);border-radius:6px;padding:6px 8px;max-width:100%}
textarea{width:100%;min-height:200px;font-family:ui-monospace,Consolas,monospace;font-size:16px}
button{background:var(--navy);color:#fff;border:2px solid var(--navy);border-radius:6px;padding:8px 16px;cursor:pointer;margin:4px 8px 4px 0}
button.secondary{background:transparent;color:var(--ink);border-color:var(--muted)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.cite{color:var(--muted);font-size:.85em}.sup{color:var(--warn-ink);background:var(--warn-bg);padding:0 4px;border-radius:4px}
.panel{background:var(--panel);border-radius:8px;padding:12px 16px;margin:12px 0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--muted);padding:6px 8px;text-align:left;vertical-align:top}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
pre{white-space:pre-wrap;background:var(--panel);padding:12px;border-radius:8px;overflow:auto}
`;
const shell = (title: string, body: string, extraCss = "", script = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}${extraCss}</style></head><body><div class="draft" role="note">${esc(DRAFT_LABEL)}</div><div class="brand">${esc(WORDMARK.split(" | ")[0])} | <span>${esc(WORDMARK.split(" | ")[1])}</span></div>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;

function miniLabHtml(m: Model, spec: LabSpec): string {
  const pub = publicLabSpec(spec);
  const fields = pub.tasks
    .map((t, i) => {
      const n = i + 1;
      if (t.type === "match")
        return `<fieldset><legend>Task ${n}</legend><p id="${t.id}-d">${esc(t.prompt)} <span class="cite">[${esc(t.sourceRef)}]</span></p><label for="${t.id}">Concept</label><select id="${t.id}" name="${t.id}" aria-describedby="${t.id}-d"><option value="">Choose…</option>${t.options!.map((o) => `<option>${esc(o)}</option>`).join("")}</select></fieldset>`;
      if (t.type === "order")
        return `<fieldset><legend>Task ${n}: ${esc(t.prompt)}</legend><p>Give each statement a position number (1 = first).</p>${t.items!.map((it) => `<label>Position <input type="number" min="1" max="${t.items!.length}" name="${t.id}" data-item="${esc(it.id)}" aria-label="Position for: ${esc(it.text)}" style="width:5em"> ${esc(it.text)}</label>`).join("")}</fieldset>`;
      if (t.type === "classify")
        return `<fieldset><legend>Task ${n}: ${esc(t.prompt)}</legend><p>“${esc(t.statement)}” <span class="cite">[${esc(t.sourceRef)}]</span></p>${t.options!.map((o, k) => `<label><input type="radio" name="${t.id}" value="${esc(o)}" id="${t.id}-${k}"> ${esc(o)}</label>`).join("")}</fieldset>`;
      return `<fieldset><legend>Task ${n}: Fix the configuration</legend><p>${esc(t.prompt)}</p><ul>${t.requirements!.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><label for="${t.id}">Your fixed configuration</label><textarea id="${t.id}" name="${t.id}" spellcheck="false">${esc(t.broken)}</textarea></fieldset>`;
    })
    .map((html, k) => {
      const t = pub.tasks[k];
      const ladder = `<div class="ladder"><button type="button" class="secondary hint" data-task="${t.id}" aria-controls="${t.id}-hints">Show a hint (0 of 3 used)</button><ol id="${t.id}-hints" class="hints" aria-live="polite"></ol><div id="${t.id}-sol" class="sol" hidden></div></div>`;
      return html.replace(/<\/fieldset>$/, `${ladder}</fieldset>`);
    })
    .join("\n");
  const hintData = Object.fromEntries(pub.tasks.map((t) => [t.id, t.hints]));
  const script = `(function(){var f=document.getElementById("lab");var out=document.getElementById("result");
function collect(){var r={};f.querySelectorAll("select,textarea").forEach(function(e){r[e.name]=e.value});
f.querySelectorAll("input[type=radio]:checked").forEach(function(e){r[e.name]=e.value});
var groups={};f.querySelectorAll("input[type=number]").forEach(function(e){(groups[e.name]=groups[e.name]||[]).push({id:e.getAttribute("data-item"),pos:Number(e.value)||99})});
Object.keys(groups).forEach(function(k){r[k]=groups[k].sort(function(a,b){return a.pos-b.pos}).map(function(x){return x.id})});return r}
document.getElementById("check").addEventListener("click",function(){var ep=f.getAttribute("data-check-endpoint");var payload={labId:f.getAttribute("data-lab-id"),responses:collect()};
if(!ep){out.textContent="Checking is done on the course server. Your instructor has not connected it yet — use Download my answers and submit the file.";return}
out.textContent="Checking…";fetch(ep,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(j){
var res=j&&j.data?j.data:j;if(!res||!res.items){out.textContent="The checker did not return a result.";return}
out.textContent="Score: "+res.score+" of "+res.total+". "+res.items.map(function(i,n){return "Task "+(n+1)+": "+i.feedback}).join(" ")}).catch(function(){out.textContent="Could not reach the checker. Download your answers instead."})});
var H=JSON.parse(document.getElementById("hint-data").textContent||"{}");var used={};
f.querySelectorAll("button.hint").forEach(function(b){b.addEventListener("click",function(){var id=b.getAttribute("data-task");var n=used[id]||0;var list=H[id]||[];if(n>=list.length)return;var li=document.createElement("li");li.textContent=list[n];document.getElementById(id+"-hints").appendChild(li);used[id]=n+1;b.textContent=used[id]>=list.length?"All 3 hints shown":"Show the next hint ("+used[id]+" of 3 used)";if(used[id]>=list.length)b.disabled=true})});
document.getElementById("sol").addEventListener("click",function(){var ep=f.getAttribute("data-check-endpoint");if(!ep){out.textContent="Solutions come from the course server after you have checked your answers twice. Your instructor has not connected it yet.";return}
fetch(ep,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({labId:f.getAttribute("data-lab-id"),responses:collect(),reveal:true})}).then(function(r){return r.json()}).then(function(j){var res=j&&j.data?j.data:j;if(!res||!res.solution){out.textContent=(j&&j.error&&j.error.message)||"Check your answers at least twice before viewing the solution.";return}
res.solution.forEach(function(s){var d=document.getElementById(s.id+"-sol");if(!d)return;d.hidden=false;d.textContent="";var h=document.createElement("strong");h.textContent="Solution: ";d.appendChild(h);var p=document.createElement("pre");p.textContent=s.answer;d.appendChild(p);var w=document.createElement("p");w.textContent=s.why;d.appendChild(w)});out.textContent="Solutions are shown under each task."}).catch(function(){out.textContent="Could not reach the course server."})});
document.getElementById("reset").addEventListener("click",function(){f.reset();used={};f.querySelectorAll("ol.hints").forEach(function(o){o.textContent=""});f.querySelectorAll(".sol").forEach(function(d){d.hidden=true;d.textContent=""});f.querySelectorAll("button.hint").forEach(function(b){b.disabled=false;b.textContent="Show a hint (0 of 3 used)"});out.textContent="The lab was reset. Your earlier checks still count toward unlocking the solution."});
document.getElementById("dl").addEventListener("click",function(){var b=new Blob([JSON.stringify({labId:f.getAttribute("data-lab-id"),responses:collect(),savedAt:new Date().toISOString()},null,2)],{type:"application/json"});
var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=f.getAttribute("data-lab-id")+"_my_answers.json";document.body.appendChild(a);a.click();a.remove();out.textContent="Your answers were downloaded."})})();`;
  const body = `<main><h1>${esc(spec.title)}</h1><p>${esc(m.input.courseCode)} ${esc(m.input.courseTitle)} · Module ${pad2(m.input.moduleNumber)}: ${esc(m.input.moduleTitle)}</p><p>${esc(spec.intro)}</p>
<form id="lab" data-lab-id="${esc(spec.id)}" data-check-endpoint="" onsubmit="return false">${fields}
<button type="button" id="check">Check my answers</button><button type="button" class="secondary" id="sol">Show solution</button><button type="button" class="secondary" id="reset">Reset lab</button><button type="button" class="secondary" id="dl">Download my answers</button></form>
<script type="application/json" id="hint-data">${scriptJson(hintData)}</script>
<div id="result" role="status" aria-live="polite" class="panel">Your responses are checked on the course server, not in this page. Hints unlock one at a time; the solution unlocks after you have checked twice.</div></main>`;
  return shell(spec.title, body, ".ladder{margin-top:8px}.hints{margin:6px 0 0;padding-left:1.4em}.hints li{margin:4px 0;background:var(--panel);padding:4px 8px;border-radius:6px}.sol{margin-top:8px;border-left:4px solid var(--gold);padding:4px 12px}", script);
}

/* ---------- Agentic demo ---------- */

function demoHtml(m: Model): string {
  const cards = [
    ...m.defs.slice(0, 12).map((d, i) => ({ id: `k${i + 1}`, term: d.term, text: excerpt(d.sentence.text, 40), ref: d.sentence.ref, kind: "definition" })),
    ...topSentences(m.sentences, m.scores, 24)
      .filter((s) => !m.defs.some((d) => d.sentence.idx === s.idx))
      .slice(0, 18)
      .map((s, i) => ({ id: `n${i + 1}`, term: bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term))?.display ?? "", text: excerpt(s.text, 40), ref: s.ref, kind: "note" })),
  ];
  const data = { topic: m.input.topicTitle, cards, terms: m.terms.slice(0, 20).map((t) => t.display) };
  const script = `(function(){var D=${scriptJson(data)};var memory=[];var $=function(id){return document.getElementById(id)};
function toks(s){return (s.toLowerCase().match(/[a-z][a-z0-9-]*/g)||[])}
function perceive(q){var t=toks(q);var intent=/\\b(what is|define|meaning|explain)\\b/i.test(q)?"define":/\\b(compare|difference|versus|vs)\\b/i.test(q)?"compare":/\\b(how|steps|process|order)\\b/i.test(q)?"process":"explore";
var ents=D.terms.filter(function(x){return q.toLowerCase().indexOf(x.toLowerCase())>=0});return {tokens:t,intent:intent,entities:ents}}
var TOOLS={glossary_lookup:function(a){return D.cards.filter(function(c){return c.kind==="definition"&&c.term.toLowerCase()===String(a.term).toLowerCase()})},
search_notes:function(a){var q=toks(a.query);return D.cards.map(function(c){var t=toks(c.text);var s=q.filter(function(w){return w.length>3&&t.indexOf(w)>=0}).length;return {c:c,s:s}}).filter(function(x){return x.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,3).map(function(x){return x.c})},
recall_memory:function(){return memory.slice(-3)},
compose_answer:function(a){return a.items.slice(0,4).map(function(c){return c.text+" ["+c.ref+"]"}).join(" ")}};
function plan(p,q){var steps=[];if(p.entities.length&&p.intent!=="explore"){p.entities.slice(0,2).forEach(function(e){steps.push({tool:"glossary_lookup",args:{term:e}})})}
steps.push({tool:"search_notes",args:{query:q}});if(memory.length)steps.push({tool:"recall_memory",args:{}});steps.push({tool:"compose_answer",args:{}});return steps}
function run(){var q=$("q").value.trim();if(!q){$("status").textContent="Type a question first.";$("q").focus();return}
var max=Math.max(1,Math.min(6,Number($("max").value)||4));var allowed={};document.querySelectorAll("input[name=tool]").forEach(function(e){allowed[e.value]=e.checked});
var p=perceive(q);var steps=plan(p,q);var trace=[];var found=[];var budget=max;
steps.forEach(function(s,i){if(budget<=0){trace.push({step:i+1,tool:s.tool,status:"skipped: step budget exhausted"});return}
if(!allowed[s.tool]){trace.push({step:i+1,tool:s.tool,status:"blocked: tool not permitted"});return}budget--;
var r=s.tool==="compose_answer"?TOOLS.compose_answer({items:found}):TOOLS[s.tool](s.args);
if(Array.isArray(r))r.forEach(function(c){if(c&&c.id&&!found.some(function(f){return f.id===c.id}))found.push(c)});
trace.push({step:i+1,tool:s.tool+" (simulated)",args:s.args,status:"ok",resultCount:Array.isArray(r)?r.length:1})});
var answer=found.length?TOOLS.compose_answer({items:found}):"No matching notes in the synthetic dataset. Try one of the key terms.";
memory.push({q:q,intent:p.intent,entities:p.entities});if(memory.length>5)memory.shift();
$("perception").textContent=JSON.stringify(p,null,2);$("plan").textContent=JSON.stringify(steps,null,2);$("memory").textContent=JSON.stringify(memory,null,2);
$("trace").innerHTML=trace.map(function(t){return "<tr><td>"+t.step+"</td><td>"+esc(t.tool)+"</td><td>"+esc(t.status)+"</td></tr>"}).join("");
$("answer").textContent=answer;$("status").textContent="Done: "+trace.length+" planned step(s), budget "+max+"."}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
$("run").addEventListener("click",run);$("q").addEventListener("keydown",function(e){if(e.key==="Enter")run()});
$("data").textContent=JSON.stringify(D.cards.slice(0,6),null,2)})();`;
  const body = `<main><h1>Agentic Application Demo — ${esc(m.input.topicTitle)}</h1>
<p>This in-browser demo walks a small, synthetic dataset built from the topic's readings through four stages: <strong>Perception → Reasoning &amp; Planning → Memory → bounded Tool Execution</strong>. All tools are <strong>simulated</strong>; nothing leaves this page and no network is used.</p>
<div class="panel"><label for="q">Ask about the topic</label><input id="q" type="text" style="width:100%" placeholder="e.g. What is ${esc(m.defs[0]?.term ?? m.terms[0]?.display ?? m.input.topicTitle)}?">
<label for="max">Step budget (1–6)</label><input id="max" type="number" min="1" max="6" value="4" style="width:5em">
<fieldset><legend>Permitted tools (simulated)</legend>${["glossary_lookup", "search_notes", "recall_memory", "compose_answer"].map((t) => `<label><input type="checkbox" name="tool" value="${t}" checked> ${t} (simulated)</label>`).join("")}</fieldset>
<button type="button" id="run">Run the agent</button><p id="status" role="status" aria-live="polite"></p></div>
<h2>1. Perception</h2><pre id="perception" tabindex="0" role="region" aria-label="Perception output"></pre>
<h2>2. Reasoning &amp; Planning</h2><pre id="plan" tabindex="0" role="region" aria-label="Plan"></pre>
<h2>3. Memory (last 5 turns)</h2><pre id="memory" tabindex="0" role="region" aria-label="Memory"></pre>
<h2>4. Bounded tool execution</h2><table><caption class="sr-only">Tool execution trace</caption><thead><tr><th scope="col">Step</th><th scope="col">Tool</th><th scope="col">Status</th></tr></thead><tbody id="trace"></tbody></table>
<h2>Result</h2><div id="answer" class="panel" aria-live="polite"></div>
<h2>Synthetic dataset (first 6 records)</h2><pre id="data" tabindex="0" role="region" aria-label="Dataset sample"></pre>
<p class="cite">Dataset records are short excerpts of the supplied readings with their citations; see 01_Sources/reading_list.md.</p></main>`;
  return shell(`Agentic demo — ${m.input.topicTitle}`, body, "", script);
}

/* ---------- Environment templates ---------- */

function envTemplates(m: Model): GeneratedFile[] {
  const slug = sanitizeName(m.input.topicTitle, 40).toLowerCase();
  const T = (path: string, format: string, labelFmt: string, content: string, access: Access = "instructor") => file("labs_demos", `13_Environment_Templates/${path}`, format, withLabel(labelFmt, content), access, []);
  const seedRows = concepts(m, 12).map((c, i) => csvRow([i + 1, c.term, c.def ? excerpt(c.def.definition, 20) : "", c.def?.sentence.ref ?? sentenceFor(m, c.term)?.ref ?? ""]));
  return [
    T("lab_env/docker-compose.yml", "yml", "yml", `# TEXT TEMPLATE — not executed by the Studio. ${SUPPLEMENTAL} image tags before use.
services:
  lab:
    image: python:3.12-slim
    working_dir: /workspace
    command: ["sleep", "infinity"]
    volumes:
      - ./workspace:/workspace
      - ./seed:/seed:ro
    environment:
      - LAB_TOPIC=${slug}
    network_mode: "none"
    read_only: false
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1g
    healthcheck:
      test: ["CMD", "python", "-c", "import sys; sys.exit(0)"]
      interval: 30s
      timeout: 5s
      retries: 3
`),
    T("lab_env/cloud_lab_image_spec.md", "md", "md", `# Cloud lab image spec — ${md(m.input.topicTitle)}\n\n- Base: python 3.12 slim ${SUPPLEMENTAL}\n- Network: none (bounded lab)\n- Tools: python, pytest, a text editor\n- Seed data: \`seed/topic_seed.csv\` (synthetic; see data card)\n- Session limits: see \`resource_limits.md\`\n- Attempts: 2-attempt limit per lab\n`),
    T("lab_env/seed/topic_seed.csv", "csv", "csv", [csvRow(["id", "concept", "short_description", "source_ref"]), ...seedRows].join("\n") + "\n"),
    T("lab_env/seed/DATA_CARD.md", "md", "md", `# Data card — topic_seed.csv\n\n- **Origin:** short excerpts of the supplied readings (citation in \`source_ref\`); synthetic arrangement for practice.\n- **Rows:** ${seedRows.length}\n- **Personal data:** none.\n- **Intended use:** Mini-labs and the application demo for ${md(m.input.topicTitle)}.\n- **Limits:** excerpts, not full readings; verify against the sources.\n`),
    T("lab_env/healthcheck.md", "md", "md", "# Healthcheck\n\n1. Container reports `healthy`.\n2. `python -c \"import csv; print(sum(1 for _ in open('/seed/topic_seed.csv')))\"` prints the row count + 1.\n3. `pytest -q` in the starter repo exits 0 on the instructor solution.\n"),
    T("lab_env/reset_script.txt", "txt", "txt", "Reset procedure (text template; the Studio does not run it):\n1. Stop the lab container.\n2. Delete ./workspace contents (keep ./seed read-only).\n3. Copy the starter repo into ./workspace.\n4. Start the container and wait for healthy.\n5. Record the reset in the lab log (counts toward the 2-attempt limit only if the instructor says so).\n"),
    T("lab_env/setup_guide.md", "md", "md", `# Setup guide\n\n1. Install a container runtime ${SUPPLEMENTAL}.\n2. Copy \`lab_env/\` to your machine or the cloud lab.\n3. Run the compose file and wait for the healthcheck.\n4. Open the starter repo and run \`pytest -q\`.\n`),
    T("lab_env/troubleshooting.md", "md", "md", "# Troubleshooting\n\n| Symptom | Check | Fix |\n|---|---|---|\n| Container unhealthy | `docker compose ps` | Restart; check memory limit |\n| Seed file missing | Volume mount path | Re-copy `seed/` |\n| Tests fail on import | Python version | Use the pinned image |\n| No network | Expected — the lab is offline by design | Use local data only |\n"),
    T("lab_env/resource_limits.md", "md", "md", `# Resource limits ${SUPPLEMENTAL}\n\n- CPU: 1 vCPU · Memory: 1 GiB · Disk: 2 GiB\n- Session: 90 minutes · Idle timeout: 20 minutes\n- Network: none · Attempts: 2\n`),
    T("programming_env/.devcontainer/devcontainer.json", "json", "jsonc", JSON.stringify({ name: `${m.input.courseCode} ${m.input.topicTitle}`, image: "mcr.microsoft.com/devcontainers/python:3.12", postCreateCommand: "pip install -r requirements.txt", customizations: { vscode: { extensions: ["ms-python.python"] } } }, null, 2), "learner"),
    T("programming_env/requirements.txt", "txt", "requirements", `# ${SUPPLEMENTAL} pins before release\npytest==8.3.3\npandas==2.2.3\n`, "learner"),
    T("programming_env/.env.example", "env", "env", "# Copy to .env and fill in locally. Never commit real values.\nLAB_DATA_PATH=./data/topic_seed.csv\nLAB_MAX_STEPS=8\nLAB_API_KEY_ENV=\n", "learner"),
    T("programming_env/starter_repo/README.md", "md", "md", `# Starter repo — ${md(m.input.topicTitle)}\n\n\`\`\`\nstarter_repo/\n├── README.md\n├── data/topic_seed.csv\n├── src/lab.py\n└── tests/test_lab.py\n\`\`\`\n\nRun \`pytest -q\`. Complete the TODOs in \`src/lab.py\`.\n`, "learner"),
    T("programming_env/starter_repo/src/lab.py", "py", "py", `"""Starter code for ${m.input.topicTitle.replace(/"/g, "'")}."""\nimport csv\n\n\ndef load_concepts(path):\n    """Return a list of dict rows from the seed CSV."""\n    with open(path, newline="", encoding="utf-8") as fh:\n        return [row for row in csv.DictReader(line for line in fh if not line.startswith("#"))]\n\n\ndef find_concept(rows, name):\n    """TODO: return the row whose 'concept' matches name (case-insensitive), or None."""\n    raise NotImplementedError\n`, "learner"),
    T("programming_env/starter_repo/tests/test_lab.py", "py", "py", `from src.lab import find_concept\n\n\ndef test_find_concept_is_case_insensitive():\n    rows = [{"concept": "Example", "short_description": "x"}]\n    assert find_concept(rows, "example")["concept"] == "Example"\n\n\ndef test_find_concept_missing_returns_none():\n    assert find_concept([], "anything") is None\n`, "learner"),
    T("devops_env/.github/workflows/ci.yml", "yml", "yml", "name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - run: pip install -r requirements.txt\n      - run: pytest -q\n"),
    T("devops_env/Dockerfile", "dockerfile", "dockerfile", "FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nUSER 1000\nCMD [\"pytest\", \"-q\"]\n"),
    T("devops_env/.pre-commit-config.yaml", "yml", "yml", `# ${SUPPLEMENTAL} hook versions\nrepos:\n  - repo: https://github.com/pre-commit/pre-commit-hooks\n    rev: v4.6.0\n    hooks:\n      - id: end-of-file-fixer\n      - id: trailing-whitespace\n      - id: detect-private-key\n`),
    T("devops_env/kanban_template.md", "md", "md", "# Kanban board\n\n| Backlog | In progress | Review | Done |\n|---|---|---|---|\n| Read sources | | | |\n| Mini-Lab 1 | | | |\n| Mini-Lab 2 | | | |\n| Project draft | | | |\n"),
    T("devops_env/PULL_REQUEST_TEMPLATE.md", "md", "md", "## What changed\n\n## How I tested it\n- [ ] `pytest -q` passes\n- [ ] Screenshots of output attached\n\n## Readings cited\n\n## AI-use disclosure\nDescribe any AI assistance, as the course AI-use policy requires.\n"),
  ];
}

export function genLabsDemos(m: Model): GeneratedFile[] {
  const labs = buildLabSpecs(m);
  const labRefs = (spec: LabSpec) => [...new Set(spec.tasks.flatMap((t) => ("sourceRef" in t ? [m.avail.find((s) => s.ref === t.sourceRef)?.id] : t.type === "order" ? m.process.map((s) => s.sourceId) : [])).filter(Boolean) as string[])];
  const keys = JSON.stringify({ label: DRAFT_LABEL, note: "Instructor only. Learner pages never contain these keys; use checkMiniLab(spec, answers) on the server.", labs }, null, 2);
  const teaching = `${header(m, "Teaching Notes (Instructor)")}
## Suggested flow (90 min) ${SUPPLEMENTAL}
1. 10 min — Lecture deck slides 1–3 (objectives, context).
2. 25 min — Slides 4–7 with the worked example.
3. 20 min — Mini-Lab 1 (guided), pairs.
4. 20 min — Mini-Lab 2 (apply/debug), individual.
5. 10 min — Slide 8 (common mistakes) and the practice quiz.
6. 5 min — Wrap-up: review core concepts (slide 10).

## Where learners struggle (from the readings)
${m.misconceptions.slice(0, 4).map((s) => `- ${cite(s)}`).join("\n") || `- ${SUPPLEMENTAL} No misconceptions in the sources.`}

## Source coverage
- ${m.avail.length} available source(s), ${m.totalWords} words extracted${m.thin ? " — **thin: add sources before release**" : ""}.
${m.unavailable.length ? `- Unavailable: ${m.unavailable.map((s) => md(s.title)).join("; ")}` : ""}
`;
  const expected = `${header(m, "Expected Results (Instructor)")}
## Mini-Lab 1
${labs[0].tasks.map((t, i) => `- Task ${i + 1}: ${t.type === "match" ? md(t.answer) : "—"}`).join("\n")}

## Mini-Lab 2
${labs[1].tasks.map((t, i) => `- Task ${i + 1} (${t.type}): ${t.type === "classify" ? md(t.answer) : t.type === "order" ? t.answer.join(" → ") : t.type === "config_fix" ? "all six rules pass, e.g. max_steps: 8, timeout_seconds: 300, network: none, tools_allowed: [search_notes], api_key_env: LAB_API_KEY, log_tool_calls: true" : "—"}`).join("\n")}

## Application demo
- Asking "What is <key term>?" returns that term's definition excerpt with its citation and a 3–4 step trace within the step budget.
- Unchecking a tool shows "blocked: tool not permitted" in the trace.
`;
  return [
    file("labs_demos", "09_Student_Labs/minilab_1.html", "html", miniLabHtml(m, labs[0]), "learner", labRefs(labs[0]), labs[0].tasks.length >= 3 ? "ready" : "needs_more_sources", labs[0].tasks.length >= 3 ? {} : { reason: `Only ${labs[0].tasks.length} matching task(s) could be built from the supplied sources (target ≥ 3). Add sources.` }),
    file("labs_demos", "09_Student_Labs/minilab_2.html", "html", miniLabHtml(m, labs[1]), "learner", labRefs(labs[1])),
    file("labs_demos", "10_Instructor_Resources/minilab_keys.json", "json", keys, "instructor", [...labRefs(labs[0]), ...labRefs(labs[1])]),
    file("labs_demos", "10_Instructor_Resources/teaching_notes.md", "md", withLabel("md", teaching), "instructor", allRefs(m)),
    file("labs_demos", "10_Instructor_Resources/expected_results.md", "md", withLabel("md", expected), "instructor", allRefs(m)),
    file("labs_demos", "11_Application_Demo/agentic_demo.html", "html", demoHtml(m), "learner", allRefs(m)),
    ...envTemplates(m),
  ];
}

/* ======================================================================
 * Step: studio_text_visual — deck, audio, video scripts, infographic, mind map
 * ==================================================================== */

export interface Slide {
  n: number;
  title: string;
  bullets: string[]; // HTML
  notes: string; // plain text with [S#]
  notesWords: number;
  thin: boolean;
  sents: Sentence[];
}

function notesFor(m: Model, lead: string, prefer: Sentence[], usedGlobal: Set<number>): { text: string; words: number; thin: boolean; sents: Sentence[] } {
  const parts: string[] = [lead];
  let words = wordCount(lead);
  const sents: Sentence[] = [];
  const pool = [...prefer, ...topSentences(m.sentences, m.scores, m.sentences.length).filter((s) => !usedGlobal.has(s.idx)), ...topSentences(m.sentences, m.scores, m.sentences.length)];
  const seen = new Set<number>();
  for (const s of pool) {
    if (words >= 150) break;
    if (seen.has(s.idx)) continue;
    seen.add(s.idx);
    if (words + s.words > 250) continue;
    parts.push(`${s.text} [${s.ref}]`);
    words += s.words;
    sents.push(s);
    usedGlobal.add(s.idx);
  }
  const thin = words < 150;
  if (thin) parts.push(`(Note: the supplied sources only support about ${words} words of notes for this slide; the target is 150–250. Add sources before release.)`);
  return { text: parts.join(" "), words, thin, sents };
}

export function buildSlides(m: Model): Slide[] {
  const used = new Set<number>();
  const i = m.input;
  const li = (s: Sentence, w = 18) => citeHtml(s, w);
  const sup = (t: string) => `<span class="sup">${esc(SUPPLEMENTAL)}</span> ${esc(t)}`;
  const mk = (n: number, title: string, bullets: string[], lead: string, prefer: Sentence[]): Slide => {
    const no = notesFor(m, lead, prefer, used);
    return { n, title, bullets, notes: no.text, notesWords: no.words, thin: no.thin, sents: no.sents };
  };
  const defs = m.defs.slice(0, 4);
  const flow = concepts(m, 5);
  const ex = m.examples.slice(0, 3);
  const app = m.applied.slice(0, 3);
  const mis = m.misconceptions.slice(0, 3);
  return [
    mk(1, "Cover", [], `Welcome to ${i.courseCode} ${i.courseTitle}, Module ${pad2(i.moduleNumber)}: ${i.moduleTitle}. Today's topic is ${i.topicTitle}.`, m.summary.slice(0, 2)),
    mk(2, "Learning objectives", m.los.slice(0, 4).map((l) => `${esc(l.id)}: ${esc(excerpt(l.text.replace(SUPPLEMENTAL, ""), 16))}${l.supplemental ? ` <span class="sup">${esc(SUPPLEMENTAL)}</span>` : ""}`), `By the end of this session you should be able to meet ${m.los.length} objective${m.los.length === 1 ? "" : "s"}. Keep them in view as we work through the readings.`, m.summary.slice(0, 3)),
    mk(3, "Context and overview", m.summary.slice(0, 3).map((s) => li(s)), `Let's set the context for ${i.topicTitle} using the readings.`, m.summary),
    mk(4, "Foundational concepts", defs.length ? defs.map((d) => `<strong>${esc(d.term)}</strong>: ${esc(excerpt(d.definition, 14))} <span class="cite">[${esc(d.sentence.ref)}]</span>`) : [sup("No explicit definitions found in the sources.")], "These are the foundational concepts, in the readings' own words.", defs.map((d) => d.sentence)),
    mk(5, "Process or architecture", m.process.length >= 2 ? m.process.slice(0, 4).map((s) => li(s, 16)) : flow.map((c, k) => `${k + 1}. ${esc(c.term)}`).concat([sup("Shown in order of first appearance in the readings.")]), "Now the process or architecture: how the pieces fit together.", m.process),
    mk(6, "Worked example", ex.length ? ex.map((s) => li(s)) : [sup(`Walk through applying ${flow[0]?.term ?? i.topicTitle} to the Mini-Lab dataset step by step.`)], "Let's work an example from the readings.", ex),
    mk(7, "Real-world application", app.length ? app.map((s) => li(s)) : [sup(`Discuss where ${i.topicTitle} appears in your own work context.`)], "Where does this show up in practice?", app),
    mk(8, "Common mistakes and troubleshooting", mis.length ? mis.map((s) => li(s)) : [sup("The sources list no common mistakes; add instructor experience.")], "Here are the mistakes and pitfalls the readings warn about.", mis),
    mk(9, "Lab or discussion preparation", ["Mini-Lab 1 (guided): match concepts to descriptions", "Mini-Lab 2 (apply/debug): check statements; fix a runner config", `Discussion: which concept in ${esc(i.topicTitle)} would you apply first, and why?`, "Practice quiz: 10 questions, ungraded"], "Before the lab, here's how to prepare.", m.process.concat(m.examples)),
    mk(10, "Summary and readings", [...m.summary.slice(0, 3).map((s) => li(s, 14)), `Readings: ${m.avail.map((s) => `[${esc(s.ref!)}] ${esc(excerpt(s.title, 8))}`).join("; ") || "—"}`], "To summarize the session:", m.summary),
  ];
}

function deckHtml(m: Model, slides: Slide[]): string {
  const i = m.input;
  const f = LEAD_FACULTY;
  const uri = facultyDataUri(f) ?? f.photo.src;
  const size = fitSize(f.photo, f.photo.width, f.photo.height);
  const logoOk = !!i.logoDataUri && /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(i.logoDataUri) && i.logoDataUri.length < 2_000_000;
  const provisional = i.designSamples ? "" : `<p class="prov">Provisional Scholarion design — cover samples not yet supplied</p>`;
  const cover = `<section class="slide cover" id="slide-1" aria-roledescription="slide" aria-label="Slide 1 of 10: Cover">
<div class="wordmark">${logoOk ? `<img src="${esc(i.logoDataUri)}" alt="Scholarion Academy logo" height="56">` : ""}<span>Scholarion Academy</span> | <span class="gold">Agentic Cloud Labs</span></div>
<div class="cover-main"><div><p class="code">${esc(i.courseCode)} · ${esc(i.courseTitle)}</p><p class="module">Module ${pad2(i.moduleNumber)}: ${esc(i.moduleTitle)}</p><h1>${esc(i.topicTitle)}</h1>
<div class="who"><img class="photo" src="${uri}" width="${size.width}" height="${size.height}" alt="${esc(f.photo.alt)}"><div><p class="name">${esc(INSTRUCTOR_NAME)}</p><p class="role">${esc(INSTRUCTOR_ROLE)}</p></div></div></div></div>
<p class="foot">Duration${i.duration ? `: ${esc(i.duration)}` : ""} | Mode: Autonomous Agentic Lab | 2-Attempt Limit</p>${provisional}
<aside class="notes" aria-label="Speaker notes">${esc(slides[0].notes)}</aside></section>`;
  const rest = slides
    .slice(1)
    .map(
      (s) => `<section class="slide" id="slide-${s.n}" aria-roledescription="slide" aria-label="Slide ${s.n} of 10: ${esc(s.title)}"><header class="sh"><span>${esc(i.courseCode)} · Module ${pad2(i.moduleNumber)}</span><span>${s.n} / 10</span></header>
<h2>${esc(s.title)}</h2><ul>${s.bullets.map((b) => `<li>${b}</li>`).join("")}</ul><p class="slabel">${esc(DRAFT_LABEL)}</p>
<aside class="notes" aria-label="Speaker notes">${esc(s.notes)}</aside></section>`,
    )
    .join("\n");
  const css = `
.deck{position:relative}.stage{width:1280px;height:720px;transform-origin:top left}
.slide{display:none;width:1280px;height:720px;padding:48px 64px;background:#ffffff;color:#0f1a33;position:relative;overflow:hidden;font-size:28px;line-height:1.35}
.slide.active{display:block}.slide h2{font:700 44px/1.15 "Source Serif 4",Georgia,serif;color:#0b1f4d;margin:16px 0 20px}
.slide ul{margin:0;padding-left:1.1em}.slide li{margin:0 0 14px}.slide .cite{color:#4a5672;font-size:24px}.slide .sup{color:#5c3b00;background:#fff4d6;font-size:24px}
.sh{display:flex;justify-content:space-between;font-size:24px;color:#3d4966;border-bottom:3px solid #b8861f;padding-bottom:8px}
.slabel{position:absolute;bottom:16px;left:64px;font-size:24px;color:#5c3b00;margin:0}
.cover{background:#0b1f4d;color:#ffffff}.cover .wordmark{font-size:28px;font-weight:700;letter-spacing:.03em;display:flex;align-items:center;gap:12px}.gold{color:#f2c66d}
.cover-main{display:flex;align-items:center;height:470px}.cover h1{font:700 56px/1.1 "Source Serif 4",Georgia,serif;margin:8px 0 24px;color:#fff}
.code,.module{margin:0;font-size:28px;color:#dbe3f7}.module{color:#f2c66d;font-weight:700}
.who{display:flex;gap:20px;align-items:center}.photo{display:block;height:auto;border-radius:8px;object-fit:contain;border:2px solid #f2c66d}
.name{margin:0;font-weight:700;font-size:28px}.role{margin:0;font-size:24px;color:#dbe3f7}
.foot{position:absolute;bottom:44px;left:64px;margin:0;font-size:24px;color:#ffffff;border-top:3px solid #b8861f;padding-top:8px}
.prov{position:absolute;bottom:12px;left:64px;margin:0;font-size:24px;color:#f2c66d}
.notes{display:none}.shownotes .slide.active .notes{display:block;position:absolute;inset:auto 0 0 0;max-height:45%;overflow:auto;background:#f3f5fa;color:#0f1a33;font-size:24px;padding:12px 64px;border-top:2px solid #0b1f4d}
.controls{display:flex;gap:8px;align-items:center;padding:8px 16px;flex-wrap:wrap}
@media print{.draft,.brand,.controls{display:none}.stage{transform:none!important}.slide{display:block!important;page-break-after:always;break-after:page}.notes{display:none!important}@page{size:1280px 720px;margin:0}}
`;
  const script = `(function(){var slides=[].slice.call(document.querySelectorAll(".slide"));var i=0;var live=document.getElementById("live");var stage=document.querySelector(".stage");
function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,k){s.classList.toggle("active",k===i);s.setAttribute("aria-hidden",k===i?"false":"true")});live.textContent="Slide "+(i+1)+" of "+slides.length+": "+slides[i].getAttribute("aria-label").replace(/^Slide \\d+ of \\d+: /,"");try{history.replaceState(null,"","#slide-"+(i+1))}catch(e){}}
function fit(){var w=document.querySelector(".deck").clientWidth;var k=Math.min(1,w/1280);stage.style.transform="scale("+k+")";document.querySelector(".deck").style.height=(720*k)+"px"}
document.getElementById("prev").addEventListener("click",function(){show(i-1)});document.getElementById("next").addEventListener("click",function(){show(i+1)});
document.getElementById("notes").addEventListener("click",function(e){var on=document.body.classList.toggle("shownotes");e.currentTarget.setAttribute("aria-pressed",on?"true":"false")});
document.addEventListener("keydown",function(e){if(/INPUT|TEXTAREA|SELECT/.test((e.target||{}).tagName||""))return;if(e.key==="ArrowRight"||e.key==="PageDown"||e.key===" "){e.preventDefault();show(i+1)}else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();show(i-1)}else if(e.key==="Home"){show(0)}else if(e.key==="End"){show(slides.length-1)}else if(e.key==="n"||e.key==="N"){document.getElementById("notes").click()}});
window.addEventListener("resize",fit);var h=Number((location.hash.match(/slide-(\\d+)/)||[])[1]);show(h?h-1:0);fit()})();`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(i.courseCode)} Module ${pad2(i.moduleNumber)}: ${esc(i.topicTitle)} — Lecture deck</title><style>${BASE_CSS}${css}</style></head>
<body><div class="draft" role="note">${esc(DRAFT_LABEL)}</div>
<div class="controls" role="toolbar" aria-label="Slide controls"><button type="button" id="prev" aria-label="Previous slide">◀ Previous</button><button type="button" id="next" aria-label="Next slide">Next ▶</button><button type="button" id="notes" class="secondary" aria-pressed="false">Speaker notes (N)</button><span id="live" role="status" aria-live="polite"></span></div>
<main class="deck" aria-label="Lecture deck, 10 slides. Use the arrow keys or the buttons to move between slides."><div class="stage">
${cover}
${rest}
</div></main><script>${script}</script></body></html>`;
}

/* ---------- Captions ---------- */

const ts = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad2(h)}:${pad2(mi)}:${s.toFixed(3).padStart(6, "0")}`;
};
/** Spoken text only: drop headings, labels, cue markers and citation markers. */
export function spoken(line: string): string {
  return line
    .replace(/\[Slide \d+\]/g, "")
    .replace(/\[S\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function vttFromCues(cues: { start: number; end: number; text: string }[]): string {
  return `WEBVTT\n\nNOTE ${DRAFT_LABEL}\n\n${cues.map((c, k) => `${k + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}`).join("\n\n")}\n`;
}
/** Cue a sequence of (speaker?, text) lines at WPM, starting at `start`. Returns cues and end time. */
export function cueLines(lines: { speaker?: string; text: string }[], start = 0, maxWords = 12): { cues: { start: number; end: number; text: string }[]; end: number } {
  const cues: { start: number; end: number; text: string }[] = [];
  let t = start;
  for (const l of lines) {
    const words = spoken(l.text).split(" ").filter(Boolean);
    for (let k = 0; k < words.length; k += maxWords) {
      const chunk = words.slice(k, k + maxWords);
      const d = (chunk.length / WPM) * 60;
      cues.push({ start: t, end: t + d, text: `${k === 0 && l.speaker ? `${l.speaker}: ` : ""}${chunk.join(" ")}` });
      t += d;
    }
  }
  return { cues, end: t };
}

/* ---------- Audio scripts ---------- */

function audioLecture(m: Model, slides: Slide[]) {
  const used = new Set<number>();
  const blocks: { slide: number; title: string; text: string }[] = [];
  let total = 0;
  for (const s of slides) {
    const lead = s.n === 1 ? `Welcome. This is ${m.input.courseCode}, ${m.input.courseTitle}, Module ${m.input.moduleNumber}: ${m.input.moduleTitle}. I'm ${INSTRUCTOR_NAME}, and today's topic is ${m.input.topicTitle}.` : `Slide ${s.n}: ${s.title}.`;
    const parts = [lead];
    let words = wordCount(lead);
    const pool = [...s.sents, ...topSentences(m.sentences.filter((x) => s.sents.some((y) => y.sourceId === x.sourceId)), m.scores, 60)];
    for (const x of pool) {
      if (used.has(x.idx) || words > 380 || total + words > 3800) continue;
      used.add(x.idx);
      parts.push(`${x.text} [${x.ref}]`);
      words += x.words;
    }
    if (s.n === 9) parts.push("Before the lab, review the flashcards and the study guide, then open Mini-Lab 1.");
    if (s.n === 10) parts.push("That concludes this lecture. Check the reading list for the full sources.");
    const text = parts.join(" ");
    total += wordCount(spoken(text));
    blocks.push({ slide: s.n, title: s.title, text });
  }
  const words = blocks.reduce((n, b) => n + wordCount(spoken(b.text)), 0);
  const target = words >= 2600 ? "within the 20–30 minute target" : `below the 20–30 minute target because the supplied sources support about ${m.totalWords} words; add sources to lengthen it`;
  const scriptMd = `${header(m, "Audio Lecture Script (single narrator)")}
**Narrator:** ${INSTRUCTOR_NAME} (to be recorded or voiced) · **Word count:** ${words} · **Estimated duration:** ${minutes(words)} min at ${WPM} wpm (${target}).

${blocks.map((b) => `[Slide ${b.slide}] **${b.title}**\n\n${md(b.text)}\n`).join("\n")}`;
  const { cues } = cueLines(blocks.map((b) => ({ text: b.text })));
  const transcript = blocks.map((b) => spoken(b.text)).join("\n\n");
  // Chapters: one per slide, timed on the same cue clock as the captions.
  const chapters: { start: number; end: number; title: string }[] = [];
  let t = 0;
  for (const b of blocks) {
    const r = cueLines([{ text: b.text }], t);
    chapters.push({ start: t, end: r.end, title: `Slide ${b.slide}: ${b.title}` });
    t = r.end;
  }
  const chaptersVtt = vttFromCues(chapters.map((c) => ({ start: c.start, end: c.end, text: c.title })));
  const chaptersJson = JSON.stringify({ version: "1.2.0", label: DRAFT_LABEL, title: `${m.input.topicTitle} — audio lecture`, chapters: chapters.map((c) => ({ startTime: Math.round(c.start * 10) / 10, endTime: Math.round(c.end * 10) / 10, title: c.title })) }, null, 2);
  return { scriptMd, vtt: vttFromCues(cues), transcript, words, sents: m.sentences.filter((s) => used.has(s.idx)), chaptersVtt, chaptersJson, chapters };
}

function deepDive(m: Model) {
  const used = new Set<number>();
  const lines: { speaker: string; text: string }[] = [];
  const A = "Host A (Alex)";
  const B = "Host B";
  const say = (sp: string, text: string) => lines.push({ speaker: sp, text });
  const take = (list: Sentence[], n: number) => {
    const out = list.filter((s) => !used.has(s.idx)).slice(0, n);
    out.forEach((s) => used.add(s.idx));
    return out;
  };
  const sayS = (sp: string, ss: Sentence[]) => ss.length && say(sp, ss.map((s) => `${s.text} [${s.ref}]`).join(" "));
  const t = m.input.topicTitle;
  say(A, `Disclosure: this deep-dive is a script for AI-generated voices; it is not a recording of real people, and the script is an AI draft that requires instructor review before release.`);
  say(A, `Here's a question to start us off: why should anyone in ${m.input.courseTitle} care about ${t}?`);
  sayS(B, take(m.summary, 1));
  say(A, "Okay, give me the big picture first.");
  sayS(B, take(m.summary, 3));
  for (const c of concepts(m, 6)) {
    say(A, `So what is ${c.term}, according to our sources?`);
    if (c.def && !used.has(c.def.sentence.idx)) {
      used.add(c.def.sentence.idx);
      say(B, `${c.def.sentence.text} [${c.def.sentence.ref}]`);
    } else {
      const s = sentenceFor(m, c.term, used);
      if (s) {
        used.add(s.idx);
        say(B, `${s.text} [${s.ref}]`);
      } else say(B, `The readings mention ${c.term} without much detail, so check the reading list.`);
    }
    const more = m.sentences.filter((s) => !used.has(s.idx) && containsTerm(s.text, c.term)).slice(0, 2);
    if (more.length) {
      say(A, "And how does that connect to the rest of the picture?");
      more.forEach((s) => used.add(s.idx));
      sayS(B, more);
    }
  }
  say(A, "What do people tend to get wrong here?");
  const mis = take(m.misconceptions, 3);
  if (mis.length) sayS(B, mis);
  else say(B, "Our sources don't call out specific mistakes, so that's a good question to bring to the discussion.");
  say(A, "Where does this show up in the real world?");
  const app = take([...m.applied, ...m.examples], 3);
  if (app.length) sayS(B, app);
  else say(B, "The readings don't give a real-world case, so try connecting it to your own projects.");
  const remaining = topSentences(m.sentences.filter((s) => !used.has(s.idx)), m.scores, 40);
  for (let k = 0; k + 1 < remaining.length && lines.reduce((n, l) => n + wordCount(spoken(l.text)), 0) < 2200; k += 2) {
    say(A, "Is there anything else in the readings worth flagging?");
    remaining.slice(k, k + 2).forEach((s) => used.add(s.idx));
    sayS(B, remaining.slice(k, k + 2));
  }
  say(A, "Let's land three takeaways.");
  say(B, m.summary.slice(0, 3).map((s, k) => `${["One", "Two", "Three"][k]}: ${excerpt(s.text, 25)} [${s.ref}]`).join(" "));
  say(A, "And what should listeners do next?");
  say(B, "Work through Mini-Lab 1 and Mini-Lab 2, review the flashcards, and take the practice quiz. Then check the reading list for the full sources.");
  const words = lines.reduce((n, l) => n + wordCount(spoken(l.text)), 0);
  const target = words >= 2200 ? "near the ~16-minute target" : `below the ~16-minute target (2,200–2,400 words) because the supplied sources support about ${m.totalWords} words`;
  const scriptMd = `${header(m, "Deep-Dive Conversation Script (two hosts)")}
**Speakers:** ${A}; ${B} · **Word count:** ${words} · **Estimated duration:** ${minutes(words)} min at ${WPM} wpm (${target}).

${lines.map((l) => `**${l.speaker}:** ${md(l.text)}`).join("\n\n")}
`;
  const { cues } = cueLines(lines);
  return { scriptMd, vtt: vttFromCues(cues), transcript: lines.map((l) => `${l.speaker}: ${spoken(l.text)}`).join("\n\n"), words, sents: m.sentences.filter((s) => used.has(s.idx)) };
}

/* ---------- Video scripts ---------- */

function videoOverview(m: Model) {
  const used = new Set<number>();
  const pick = (list: Sentence[], n: number) => {
    const out = list.filter((s) => !used.has(s.idx)).slice(0, n);
    out.forEach((s) => used.add(s.idx));
    return out;
  };
  const scenes = [
    { title: "Title", onscreen: `${m.input.courseCode} · Module ${pad2(m.input.moduleNumber)} · ${m.input.topicTitle}`, visual: "Cover card with the Scholarion wordmark and the instructor photo.", narration: `This short overview introduces ${m.input.topicTitle}.`, sents: [] as Sentence[] },
    { title: "Why it matters", onscreen: "Why it matters", visual: "Icon row; one highlighted quote from the readings.", narration: "", sents: pick(m.applied.length ? m.applied : m.summary, 2) },
    { title: "Key concepts", onscreen: concepts(m, 4).map((c) => c.term).join(" · "), visual: "Concept cards appear one by one.", narration: "", sents: pick(m.defs.map((d) => d.sentence), 3) },
    { title: "How it works", onscreen: "How it works", visual: "Flow diagram from the infographic, animated left to right.", narration: "", sents: pick(m.process.length ? m.process : m.summary, 2) },
    { title: "Watch out", onscreen: "Common mistakes", visual: "Warning callouts.", narration: "", sents: pick(m.misconceptions, 2) },
    { title: "What's next", onscreen: "Mini-labs · Practice quiz · Readings", visual: "Checklist of next steps.", narration: "Next, work through the two mini-labs and the practice quiz.", sents: [] },
  ].map((s) => ({ ...s, text: [s.narration, ...s.sents.map((x) => `${x.text} [${x.ref}]`)].filter(Boolean).join(" ") || `${SUPPLEMENTAL} No source text for this scene.` }));
  let t = 0;
  const timed = scenes.map((s) => {
    const d = Math.max(8, (wordCount(spoken(s.text)) / WPM) * 60);
    const r = { ...s, start: t, end: t + d };
    t += d;
    return r;
  });
  const cues = timed.flatMap((s) => cueLines([{ text: s.text }], s.start).cues);
  const scriptMd = `${header(m, "Video Overview Script")}
**Estimated length:** ${mmss(t)} at ${WPM} wpm. Narration is extractive; citations are not read aloud.

${timed.map((s, k) => `## Scene ${k + 1} (${mmss(s.start)}–${mmss(s.end)}): ${s.title}\n**On screen:** ${md(s.onscreen)}\n\n**Narration:** ${md(s.text)}\n`).join("\n")}`;
  const board = `${header(m, "Video Overview Storyboard")}
| Scene | Time | Visual | On-screen text | Alt description |
|---|---|---|---|---|
${timed.map((s, k) => `| ${k + 1}. ${s.title} | ${mmss(s.start)}–${mmss(s.end)} | ${s.visual} | ${md(excerpt(s.onscreen, 14))} | ${md(s.visual)} |`).join("\n")}
`;
  return { scriptMd, board, vtt: vttFromCues(cues), sents: m.sentences.filter((s) => used.has(s.idx)), duration: t };
}

export const REQ_SEGMENTS = [
  ["Hook", 0, 20],
  ["What you'll build", 20, 60],
  ["Requirements", 60, 165],
  ["Deliverables", 165, 210],
  ["Grading", 210, 255],
  ["Timeline", 255, 280],
  ["Common mistakes", 280, 310],
  ["Integrity, AI use and support", 310, 330],
] as const;

export function requirementsSegments(m: Model, a: AssessmentInput) {
  const rows = rubricRows(m, a);
  const paper = a.kind === "quiz" ? "Answer every question within the attempt limit; your score is recorded automatically." : "Submit your work plus a 2–3-page APA paper with embedded code, explanations and output screenshots, with references and citations, uploaded through the course LMS as Word or PDF.";
  const top = m.summary[0];
  const content: Record<string, { lines: string[]; sents: Sentence[] }> = {
    Hook: { lines: [`In this ${a.kind}, ${a.title}, you'll put ${m.input.topicTitle} into practice.`, ...(top ? [`${excerpt(top.text, 25)} [${top.ref}]`] : [])], sents: top ? [top] : [] },
    "What you'll build": { lines: [`You'll produce: ${a.title}.`, ...m.los.slice(0, 3).map((l) => `${l.id}: ${l.text.replace(SUPPLEMENTAL, "").trim()}`)], sents: [] },
    Requirements: { lines: rows.map((r) => `${r.criterion}: ${r.description}`), sents: [] },
    Deliverables: { lines: [paper], sents: [] },
    Grading: { lines: [`${a.points ?? 100} points in total.`, ...rows.map((r) => `${r.criterion}: ${r.points} points.`)], sents: [] },
    Timeline: { lines: [`Due: ${a.due ?? "as posted in the course calendar"}.`, "You have a 2-attempt limit."], sents: [] },
    "Common mistakes": { lines: m.misconceptions.length ? m.misconceptions.slice(0, 2).map((s) => `${excerpt(s.text, 22)} [${s.ref}]`) : [`${SUPPLEMENTAL} Check every requirement against the rubric before submitting.`], sents: m.misconceptions.slice(0, 2) },
    "Integrity, AI use and support": { lines: ["Submit your own work. Use AI tools only as the course AI-use policy allows, and disclose any AI assistance.", "Questions? Use office hours or the course discussion board."], sents: [] },
  };
  return REQ_SEGMENTS.map(([title, start, end]) => {
    const budget = Math.floor(((end - start) / 60) * WPM);
    const c = content[title];
    const kept: string[] = [];
    let w = 0;
    for (const l of c.lines) {
      const lw = wordCount(spoken(l));
      if (w + lw > budget) continue;
      kept.push(l);
      w += lw;
    }
    return { title, start, end, lines: kept, words: w, budget, sents: c.sents };
  });
}

function requirementsFiles(m: Model, a: AssessmentInput): GeneratedFile[] {
  const segs = requirementsSegments(m, a);
  const scriptMd = `${header(m, `Requirements Video Script — ${md(a.title)}`)}
**Length:** 5:30 · 8 timed segments · narration at ${WPM} wpm (words per segment shown against the time budget).

${segs.map((s, k) => `## ${k + 1}. ${s.title} (${mmss(s.start)}–${mmss(s.end)}) — ${s.words}/${s.budget} words\n${s.lines.map((l) => `- ${md(l)}`).join("\n")}\n`).join("\n")}`;
  const board = `${header(m, `Requirements Video Storyboard — ${md(a.title)}`)}
| # | Segment | Time | Visual | On-screen text |
|---|---|---|---|---|
${segs.map((s, k) => `| ${k + 1} | ${s.title} | ${mmss(s.start)}–${mmss(s.end)} | Brand card (navy background, white text) | ${md(excerpt(s.lines[0] ?? s.title, 14))} |`).join("\n")}
`;
  const vtt = vttFromCues(
    segs.flatMap((s) => {
      const { cues, end } = cueLines(s.lines.map((text) => ({ text })), s.start);
      const k = end > s.end ? (s.end - s.start) / (end - s.start) : 1;
      return cues.map((c) => ({ start: s.start + (c.start - s.start) * k, end: s.start + (c.end - s.start) * k, text: c.text }));
    }),
  );
  const refs = refsOf(m, segs.flatMap((s) => s.sents));
  const base = `05_Video/${a.key}_requirements`;
  return [file("studio_text_visual", `${base}_script.md`, "md", withLabel("md", scriptMd), "learner", refs), file("studio_text_visual", `${base}_storyboard.md`, "md", withLabel("md", board), "learner", refs), file("studio_text_visual", `${base}.vtt`, "vtt", vtt, "learner", refs)];
}

/* ---------- Infographic + mind map ---------- */

function infographic(m: Model) {
  const cs = concepts(m, 6).filter((c) => c.def).slice(0, 6);
  const cards = (cs.length >= 3 ? cs : concepts(m, 4)).slice(0, 6);
  const fromProcess = [...new Set(m.process.map((s) => bestTermIn(s.text, m.terms, m.sentences.length, m.defs.map((d) => d.term))?.display).filter(Boolean) as string[])];
  const flow = (fromProcess.length >= 3 ? fromProcess : concepts(m, 5).map((c) => c.term)).slice(0, 5);
  const remember = m.summary[0];
  const bw = 300;
  const gap = (1760 - flow.length * bw) / Math.max(1, flow.length - 1);
  const svg = `<svg role="img" aria-labelledby="flow-t flow-d" viewBox="0 0 1760 180" width="1760" height="180" xmlns="http://www.w3.org/2000/svg"><title id="flow-t">Concept flow</title><desc id="flow-d">${esc(flow.join(" then "))}</desc>
<defs><marker id="ah" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="#0b1f4d"/></marker></defs>
${flow.map((f, k) => { const x = Math.round(k * (bw + gap)); return `<rect x="${x}" y="40" width="${bw}" height="100" rx="14" fill="#0b1f4d"/><text x="${x + bw / 2}" y="98" text-anchor="middle" font-size="30" fill="#ffffff" font-family="Segoe UI, sans-serif">${esc(excerpt(f, 4))}</text>${k < flow.length - 1 ? `<line x1="${x + bw + 8}" y1="90" x2="${x + bw + gap - 10}" y2="90" stroke="#0b1f4d" stroke-width="6" marker-end="url(#ah)"/>` : ""}`; }).join("")}</svg>`;
  const css = `body{background:#e9edf5}.ig{width:1920px;height:1080px;margin:0 auto;background:#ffffff;color:#0f1a33;padding:48px 80px;position:relative;overflow:hidden;font-size:26px}
.ig h1{font:700 60px/1.1 "Source Serif 4",Georgia,serif;color:#0b1f4d;margin:0 0 6px}.ig .sub{margin:0 0 24px;color:#3d4966}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px}.card{background:#f3f5fa;border-left:8px solid #b8861f;border-radius:10px;padding:14px 18px}.card h2{margin:0 0 6px;font-size:30px;color:#0b1f4d}.card p{margin:0;font-size:24px}
.remember{background:#0b1f4d;color:#fff;border-radius:12px;padding:18px 24px;margin-top:20px;font-size:28px}.remember strong{color:#f2c66d}
.ig footer{position:absolute;bottom:24px;left:80px;right:80px;font-size:20px;color:#3d4966;border-top:2px solid #b8861f;padding-top:8px}
.ig .cite{color:#3d4966;font-size:20px}@media print{.draft,.brand{display:none}@page{size:1920px 1080px;margin:0}}`;
  const body = `<main class="ig" aria-labelledby="ig-title"><h1 id="ig-title">${esc(m.input.topicTitle)}</h1><p class="sub">${esc(m.input.courseCode)} · Module ${pad2(m.input.moduleNumber)}: ${esc(m.input.moduleTitle)}</p>
<section class="cards" aria-label="Key concepts">${cards.map((c) => `<article class="card"><h2>${esc(c.term)}</h2><p>${c.def ? `${esc(excerpt(c.def.definition, 16))} <span class="cite">[${esc(c.def.sentence.ref)}]</span>` : "Key term in the readings."}</p></article>`).join("")}</section>
<section aria-label="Concept flow">${svg}</section>
<div class="remember"><strong>Remember this:</strong> ${remember ? citeHtml(remember, 26).replace('class="cite"', 'class="cite" style="color:#dbe3f7"') : esc(SUPPLEMENTAL)}</div>
<footer>Sources: ${m.avail.map((s) => `[${esc(s.ref!)}] ${esc(excerpt(s.title, 10))}`).join("; ") || "none"} · ${esc(DRAFT_LABEL)}</footer></main>`;
  const alt = `${header(m, "Infographic — Alt Text")}
**Short alt:** Infographic on ${md(m.input.topicTitle)} with ${cards.length} key concepts, a concept flow and a "remember this" callout.

**Long description:**
- Title: ${md(m.input.topicTitle)} (${m.input.courseCode}, Module ${pad2(m.input.moduleNumber)}).
${cards.map((c) => `- Concept card — ${md(c.term)}: ${c.def ? `${md(excerpt(c.def.definition, 16))} [${c.def.sentence.ref}]` : "key term in the readings"}.`).join("\n")}
- Flow diagram: ${md(flow.join(" → "))}.
- Remember this: ${remember ? cite(remember, 26) : SUPPLEMENTAL}
- Footer lists the sources: ${m.avail.map((s) => `[${s.ref}] ${md(s.title)}`).join("; ")}.
`;
  // Portrait (1080×1920) edition for phones and social posts: same content, vertical flow.
  const vh = flow.length * 116;
  const vsvg = `<svg role="img" aria-labelledby="vflow-t vflow-d" viewBox="0 0 920 ${vh}" width="920" height="${vh}" xmlns="http://www.w3.org/2000/svg"><title id="vflow-t">Concept flow</title><desc id="vflow-d">${esc(flow.join(" then "))}</desc>
<defs><marker id="vah" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="#0b1f4d"/></marker></defs>
${flow.map((f, k) => `<rect x="160" y="${k * 116}" width="600" height="76" rx="14" fill="#0b1f4d"/><text x="460" y="${k * 116 + 48}" text-anchor="middle" font-size="30" fill="#ffffff" font-family="Segoe UI, sans-serif">${esc(excerpt(f, 4))}</text>${k < flow.length - 1 ? `<line x1="460" y1="${k * 116 + 78}" x2="460" y2="${k * 116 + 110}" stroke="#0b1f4d" stroke-width="6" marker-end="url(#vah)"/>` : ""}`).join("")}</svg>`;
  const pcss = css.replace("width:1920px;height:1080px", "width:1080px;min-height:1920px").replace("padding:48px 80px", "padding:56px 64px").replace("grid-template-columns:repeat(3,1fr)", "grid-template-columns:1fr").replace("@page{size:1920px 1080px", "@page{size:1080px 1920px").replace("position:absolute;bottom:24px;left:80px;right:80px", "position:static;margin-top:20px").replace(".cards{display:grid;", ".cards{gap:14px;display:grid;").replace("gap:20px;margin-bottom:24px", "gap:14px;margin-bottom:20px");
  const portrait = shell(`Infographic (portrait) — ${m.input.topicTitle}`, body.replace(svg, vsvg).replace('aria-labelledby="ig-title"', 'aria-labelledby="ig-title" data-orientation="portrait"'), pcss);
  return { html: shell(`Infographic — ${m.input.topicTitle}`, body, css), portrait, alt, sents: [...cards.flatMap((c) => (c.def ? [c.def.sentence] : [])), ...(remember ? [remember] : [])] };
}

function mindMap(m: Model) {
  const clean = (s: string) => excerpt(String(s).replace(/[()[\]{}"`<>]/g, "").replace(/\s+/g, " ").trim(), 8);
  const tree = {
    text: m.input.topicTitle,
    children: [
      { text: "Learning objectives", children: m.los.map((l) => ({ text: `${l.id} ${l.text.replace(SUPPLEMENTAL, "")}`, children: [] })) },
      { text: "Key concepts", children: concepts(m, 8).map((c) => ({ text: c.term, children: c.def ? [{ text: excerpt(c.def.definition, 8), ref: c.def.sentence.ref, children: [] }] : [] })) },
      { text: "Process", children: (m.process.length ? m.process.slice(0, 4) : []).map((s) => ({ text: excerpt(s.text, 8), ref: s.ref, children: [] })) },
      { text: "Common mistakes", children: m.misconceptions.slice(0, 4).map((s) => ({ text: excerpt(s.text, 8), ref: s.ref, children: [] })) },
      { text: "Applications", children: m.applied.slice(0, 3).map((s) => ({ text: excerpt(s.text, 8), ref: s.ref, children: [] })) },
    ].filter((b) => b.children.length),
  } as { text: string; ref?: string; children: { text: string; ref?: string; children: unknown[] }[] };
  type N = { text: string; ref?: string; children: N[] };
  const mmd: string[] = ["mindmap", `  root((${clean(tree.text)}))`];
  const outline: string[] = [`- **${md(tree.text)}**`];
  const walk = (n: N, depth: number) => {
    for (const c of n.children) {
      mmd.push(`${"  ".repeat(depth + 2)}${clean(c.text)}${c.ref ? ` ${c.ref}` : ""}`);
      outline.push(`${"  ".repeat(depth + 1)}- ${md(c.text)}${c.ref ? ` [${c.ref}]` : ""}`);
      walk(c, depth + 1);
    }
  };
  walk(tree as N, 0);
  return { mmd: mmd.join("\n") + "\n", json: JSON.stringify({ label: DRAFT_LABEL, root: tree }, null, 2), outline: `${header(m, "Mind Map — Text Outline")}\nAccessible text alternative to \`mind_map.mmd\`.\n\n${outline.join("\n")}\n` };
}

/** Regeneration commands for this topic (operations API and campus forms). */
function regenerationCommands(m: Model) {
  const i = m.input;
  return `${header(m, "Regeneration Commands")}
Every command is an authenticated campus operation (POST /api/campus/v1/t/{tenant}/a/<name>). Instructor-edited files are never overwritten.

| Goal | Operation | Parameters |
|---|---|---|
| Add a source | studio.add_source | courseKey=${i.courseKey}, module=${i.moduleNumber}, topic="${i.topicTitle}", kind=text\|file\|url |
| Generate this topic | studio.start | courseId=${i.courseKey}, topicKey=<topic key> (or input=<StudioInput JSON>) |
| Resume after a failed step | studio.resume | runId=<run id> |
| New version of everything | studio.regenerate | runId=<run id> |
| New practice-quiz set (new stems) | studio.regenerate_quiz | runId=<run id> |
| Edit one text file | studio.edit_output | outputId=<output id>, content=<text> |
| Release to learners (QA must pass) | studio.release | runId=<run id> |
| Check a mini-lab answer | studio.check_minilab | runId, labId, answers |
| Show a mini-lab solution (after two checks) | studio.check_minilab | runId, labId, reveal=true |
| Rebuild cover B only | studio.rebuild | runId, target=cover_b |
| Rebuild both covers + PowerPoint | studio.rebuild | runId, target=cover |
| Refresh readings and BibTeX | studio.rebuild | runId, target=readings |
| Rebuild deck / rubrics / mini-labs / chapters | studio.rebuild | runId, target=deck \| rubrics \| minilabs \| chapters |
| Set course branding (motto, colours, footer) | studio.profile_set | courseKey=${i.courseKey}, motto, primary, accent, … |
| Export LMS package (.imscc) | GET learn/${i.courseKey}/studio/<run id>/lms.imscc | staff only |

Adding a source to a topic that already has a run regenerates it as a new version automatically (pass autoRegenerate=false to studio.add_source to skip).

Media: set a text-to-speech provider and media renderer, then run studio.regenerate to replace files marked awaiting rendering.
`;
}

export function genStudioTextVisual(m: Model): GeneratedFile[] {
  const slides = buildSlides(m);
  const deck = deckHtml(m, slides);
  const notesMd = `${header(m, "Speaker Notes")}\nTarget 150–250 words per slide.\n\n${slides.map((s) => `## Slide ${s.n}: ${s.title} (${s.notesWords} words${s.thin ? " — thin" : ""})\n\n${md(s.notes)}\n`).join("\n")}`;
  const slideRefs = refsOf(m, slides.flatMap((s) => s.sents).concat(m.summary, m.defs.map((d) => d.sentence)));
  const au = audioLecture(m, slides);
  const dd = deepDive(m);
  const vo = videoOverview(m);
  const ig = infographic(m);
  const mm = mindMap(m);
  const S = "studio_text_visual" as const;
  return [
    file(S, "03_Lecture_Deck/lecture_deck.html", "html", deck, "learner", slideRefs, "ready", { meta: { slides: slides.length, notesWords: slides.map((s) => s.notesWords), thinSlides: slides.filter((s) => s.thin).map((s) => s.n) } }),
    file(S, "03_Lecture_Deck/speaker_notes.md", "md", withLabel("md", notesMd), "instructor", slideRefs),
    file(S, "03_Lecture_Deck/lecture_deck.pptx", "pptx", deckPptx(m, slides), "learner", slideRefs, "ready", { meta: { slides: slides.length, width: 1920, height: 1080, speakerNotes: true } }),
    file(S, "03_Lecture_Deck/cover_variant_A.html", "html", coverHtml(m, "A"), "learner", [], "ready", { meta: { provisional: !m.input.designSamples, width: 1920, height: 1080 } }),
    file(S, "03_Lecture_Deck/cover_variant_B.html", "html", coverHtml(m, "B"), "learner", [], "ready", { meta: { provisional: !m.input.designSamples, width: 1920, height: 1080 } }),
    file(S, "03_Lecture_Deck/cover_slide_A.pptx", "pptx", coverPptx(m, "A"), "learner", [], "ready", { meta: { width: 1920, height: 1080 } }),
    file(S, "03_Lecture_Deck/cover_slide_B.pptx", "pptx", coverPptx(m, "B"), "learner", [], "ready", { meta: { width: 1920, height: 1080 } }),
    file(S, "03_Lecture_Deck/cover_design_notes.md", "md", withLabel("md", `${header(m, "Cover Design Notes")}\n${coverNotes(m)}`), "instructor", []),
    file(S, "10_Instructor_Resources/regeneration_commands.md", "md", withLabel("md", regenerationCommands(m)), "instructor", []),
    file(S, "04_Audio/audio_lecture_script.md", "md", withLabel("md", au.scriptMd), "learner", refsOf(m, au.sents), "ready", { meta: { words: au.words, minutes: minutes(au.words) } }),
    file(S, "04_Audio/audio_lecture.vtt", "vtt", au.vtt, "learner", refsOf(m, au.sents)),
    file(S, "04_Audio/audio_lecture_transcript.txt", "txt", withLabel("txt", au.transcript), "learner", refsOf(m, au.sents)),
    file(S, "04_Audio/audio_lecture_chapters.vtt", "vtt", au.chaptersVtt, "learner", [], "ready", { meta: { kind: "chapters", chapters: au.chapters.length } }),
    file(S, "04_Audio/audio_lecture_chapters.json", "json", au.chaptersJson, "learner", []),
    file(S, "04_Audio/deep_dive_script.md", "md", withLabel("md", dd.scriptMd), "learner", refsOf(m, dd.sents), "ready", { meta: { words: dd.words, minutes: minutes(dd.words) } }),
    file(S, "04_Audio/deep_dive.vtt", "vtt", dd.vtt, "learner", refsOf(m, dd.sents)),
    file(S, "04_Audio/deep_dive_transcript.txt", "txt", withLabel("txt", dd.transcript), "learner", refsOf(m, dd.sents)),
    file(S, "05_Video/video_overview_script.md", "md", withLabel("md", vo.scriptMd), "learner", refsOf(m, vo.sents)),
    file(S, "05_Video/video_overview_storyboard.md", "md", withLabel("md", vo.board), "learner", refsOf(m, vo.sents)),
    file(S, "05_Video/video_overview.vtt", "vtt", vo.vtt, "learner", refsOf(m, vo.sents)),
    ...m.assessments.flatMap((a) => requirementsFiles(m, a)),
    file(S, "06_Infographics_and_Mind_Maps/infographic.html", "html", ig.html, "learner", refsOf(m, ig.sents)),
    file(S, "06_Infographics_and_Mind_Maps/infographic_portrait.html", "html", ig.portrait, "learner", refsOf(m, ig.sents), "ready", { meta: { width: 1080, height: 1920 } }),
    file(S, "06_Infographics_and_Mind_Maps/infographic_alt_text.md", "md", withLabel("md", ig.alt), "learner", refsOf(m, ig.sents)),
    file(S, "06_Infographics_and_Mind_Maps/mind_map.mmd", "mmd", withLabel("mmd", mm.mmd), "learner", allRefs(m)),
    file(S, "06_Infographics_and_Mind_Maps/mind_map.json", "json", mm.json, "learner", allRefs(m)),
    file(S, "06_Infographics_and_Mind_Maps/mind_map_outline.md", "md", withLabel("md", mm.outline), "learner", allRefs(m)),
  ];
}

/* ======================================================================
 * Step: render_media (placeholders; the pipeline adds the optional silent preview)
 * ==================================================================== */

export const NO_TTS = "No text-to-speech provider is configured";

export function genRenderPlaceholders(m: Model): GeneratedFile[] {
  const R = "render_media" as const;
  const ph = (path: string, format: string, extra = "") => file(R, path, format, "", "learner", [], "awaiting_rendering", { reason: `${NO_TTS}${extra}` });
  return [
    ph("04_Audio/audio_lecture.mp3", "mp3"),
    ph("04_Audio/deep_dive.mp3", "mp3"),
    ph("05_Video/video_overview.mp4", "mp4", " (narrated video needs TTS)"),
    ...m.assessments.map((a) => ph(`05_Video/${a.key}_requirements.mp4`, "mp4", " (narrated video needs TTS)")),
  ];
}

/* ======================================================================
 * Step: validate_artifacts — source manifest + QA report
 * ==================================================================== */

export interface OutputView {
  path: string;
  format: string;
  access: Access;
  status: string;
  text: string | null;
  sourceRefs: string[];
  reason?: string | null;
}

const KEY_MARKERS = /answer key|data-answer|data-correct|"correct"\s*:|"answer"\s*:|\bQ\d+ answer:|Explanation \(Q\d+\)/i;

/** Scan learner-access text outputs for answer-key content. Returns offending paths with the reason. */
export function scanForAnswerKeys(outputs: OutputView[], labs: LabSpec[]): { path: string; why: string }[] {
  const hits: { path: string; why: string }[] = [];
  const orderKeys = labs.flatMap((l) => l.tasks.filter((t): t is Extract<LabTask, { type: "order" }> => t.type === "order").map((t) => JSON.stringify(t.answer)));
  for (const o of outputs) {
    if (o.access !== "learner" || o.text === null) continue;
    const m = o.text.match(KEY_MARKERS);
    if (m) hits.push({ path: o.path, why: `contains key marker “${m[0]}”` });
    for (const k of orderKeys) if (o.text.includes(k)) hits.push({ path: o.path, why: "contains a mini-lab order key" });
    if (/minilab_\d\.html$/.test(o.path)) {
      for (const lab of labs) {
        for (const t of lab.tasks) {
          if (t.type !== "order") continue;
          const shownIds = [...o.text.matchAll(/data-item="([^"]+)"/g)].map((x) => x[1]);
          if (shownIds.length === t.answer.length && shownIds.every((id, i) => id === t.answer[i])) hits.push({ path: o.path, why: "order task is displayed in the answer order" });
        }
      }
    }
  }
  return hits;
}

export function genValidate(m: Model, outputs: OutputView[], copyFlags: (text: string) => { rule: string; match: string }[] = () => []): GeneratedFile[] {
  const used = (id: string) => outputs.filter((o) => o.sourceRefs.includes(id)).map((o) => o.path);
  const manifest = JSON.stringify(
    { label: DRAFT_LABEL, topic: m.input.topicTitle, sources: m.sources.map((s) => ({ id: s.id, ref: s.ref, title: s.title, kind: s.kind, url: s.url ?? null, filename: s.filename ?? null, status: s.status, reason: s.reason ?? null, checksum: s.checksum, usedBy: s.status === "available" ? used(s.id) : [] })) },
    null,
    2,
  );
  const labs = buildLabSpecs(m);
  const byPath = (p: string) => outputs.find((o) => o.path === p);
  const deck = byPath("03_Lecture_Deck/lecture_deck.html")?.text ?? "";
  const slideCount = (deck.match(/<section class="slide/g) ?? []).length;
  const fc = byPath("07_Study_Guides_and_Flashcards/flashcards.json");
  const fcCount = fc?.text ? (JSON.parse(fc.text).count as number) : 0;
  const qz = byPath("08_Practice_Quizzes/practice_quiz.json");
  const qCount = qz?.text ? (JSON.parse(qz.text).questions as unknown[]).length : 0;
  const leaks = scanForAnswerKeys(outputs, labs);
  const validRefs = new Set(m.avail.map((s) => s.ref));
  const badCites: string[] = [];
  for (const o of outputs) for (const c of o.text?.matchAll(/\[(S\d+)\]/g) ?? []) if (!validRefs.has(c[1])) badCites.push(`${o.path}: [${c[1]}]`);
  const unavailableCited = outputs.filter((o) => m.unavailable.some((u) => o.sourceRefs.includes(u.id))).map((o) => o.path);
  const scripts = outputs.filter((o) => /_script\.md$/.test(o.path) && /^0[45]_/.test(o.path));
  const missingCaptions = scripts.filter((s) => {
    const base = s.path.replace(/_script\.md$/, "");
    return !outputs.some((o) => o.path === `${base}.vtt`);
  });
  const pending = outputs.filter((o) => ["awaiting_rendering", "configuration_required", "needs_more_sources", "failed"].includes(o.status));
  const unlabelled = outputs.filter((o) => o.text !== null && o.text.length > 0 && !o.text.includes(DRAFT_LABEL)).map((o) => o.path);
  const flags = outputs.filter((o) => o.text && o.access === "learner" && !/\.(vtt|txt)$/.test(o.path)).flatMap((o) => copyFlags(o.text!).map((f) => `${o.path}: ${f.rule} (“${f.match}”)`));
  const banned = outputs.filter((o) => o.text && /\b(oak ?haven|notebooklm)\b/i.test(o.text)).map((o) => o.path);
  const row = (ok: boolean | "pending", label: string, detail: string) => `| ${ok === "pending" ? "PENDING" : ok ? "PASS" : "FAIL"} | ${label} | ${md(detail)} |`;
  const qa = `# QA Report — ${md(m.input.topicTitle)}

> **${DRAFT_LABEL}**

${m.input.courseCode} · Module ${pad2(m.input.moduleNumber)} · ${outputs.length} files checked.

| Result | Check | Detail |
|---|---|---|
${[
  row(m.avail.length > 0, "Topic has readings", `${m.avail.length} available, ${m.unavailable.length} unavailable`),
  row(fcCount >= 20, "Flashcards ≥ 20", `${fcCount} cards${fcCount < 20 ? " — needs_more_sources" : ""}`),
  row(qCount === 10, "Practice quiz has 10 questions", `${qCount} questions`),
  row(!!byPath("09_Student_Labs/minilab_1.html") && !!byPath("09_Student_Labs/minilab_2.html"), "Two mini-labs", "minilab_1.html, minilab_2.html"),
  row(slideCount === 10, "Deck has exactly 10 slides", `${slideCount} slides`),
  row(!leaks.length, "Student files contain no answer keys", leaks.length ? leaks.map((l) => `${l.path}: ${l.why}`).join("; ") : "scanned all learner files for key markers, quiz answer lines and mini-lab keys"),
  row(!badCites.length && !unavailableCited.length, "Citations only to supplied, available sources", badCites.length || unavailableCited.length ? [...badCites, ...unavailableCited.map((p) => `${p} cites an unavailable source`)].join("; ") : `refs used: ${[...validRefs].join(", ") || "none"}`),
  row(!missingCaptions.length, "Captions present for every audio/video script", missingCaptions.length ? missingCaptions.map((s) => s.path).join(", ") : `${scripts.length} scripts, all with .vtt`),
  row(!unlabelled.length, "Every text file carries the AI DRAFT label", unlabelled.length ? unlabelled.join(", ") : "ok"),
  row(!banned.length, "No disallowed names", banned.length ? banned.join(", ") : "ok"),
  row(flags.length ? "pending" : true, "Honesty copy check (learner files)", flags.length ? `review: ${flags.slice(0, 12).join("; ")}` : "no flags"),
  row(pending.length ? "pending" : true, "Media awaiting rendering / items needing attention", pending.length ? `${pending.length} item(s), listed below` : "none"),
].join("\n")}

## Awaiting rendering and other pending items
${pending.map((p) => `- \`${p.path}\` — ${p.status}${p.reason ? `: ${md(p.reason)}` : ""}`).join("\n") || "- None."}

## Source coverage
- Extracted words: ${m.totalWords}${m.thin ? " (thin — add sources)" : ""}; sentences: ${m.sentences.length}; key terms: ${m.terms.length}; definitions: ${m.defs.length}.
`;
  return [file("validate_artifacts", "01_Sources/source_manifest.json", "json", manifest, "instructor", m.sources.map((s) => s.id)), file("validate_artifacts", "17_qa_report.md", "md", qa, "instructor", allRefs(m), leaks.length || badCites.length || slideCount !== 10 ? "failed" : "ready", { meta: { leaks, badCites, slideCount, flashcards: fcCount, quiz: qCount } })];
}

/** 00_manifest.json for a saved output set. */
export function genManifest(m: Model, entries: { path: string; format: string; version: number; status: string; sourceRefs: string[]; access: Access; generatedAt: string; checksum: string }[], version: number): GeneratedFile {
  const json = JSON.stringify({ label: DRAFT_LABEL, root: m.root, version, generatedAt: entries.reduce((a, e) => (e.generatedAt > a ? e.generatedAt : a), ""), folders: SUBFOLDERS, files: [...entries, { path: "00_manifest.json", format: "json", version, status: "ready", sourceRefs: [], access: "instructor", generatedAt: "self", checksum: "self" }] }, null, 2);
  return file("save_output_set", "00_manifest.json", "json", json, "instructor", []);
}

export { checksum as contentChecksum, hash as stableHash };
