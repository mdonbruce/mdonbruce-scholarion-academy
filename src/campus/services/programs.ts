import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { broker, CampusError, metrics, nowIso, nowMs, registerConsumer, type Row, type TenantStore } from "../core";
import { addPublishCheck } from "../entity";
import { createUser, hasAny, type Actor } from "../iam";
import { PROGRAMS, P26_QUIZ, TRADEMARK_NOTICE, type ProgramSpec, type QuizItem, type WeekSpec } from "../academy/programs-data";
import { LEARNING_PATHS, LIBRARY, P15_CHECKS, PROGRAMS_2, type LibraryModule } from "../academy/programs-data-2";
import { PROGRAMS_3 } from "../academy/programs-data-3";
import { GENAI, genaiProgramSpec, genaiSessions } from "../academy/genai-program";
import { activityEditions, AI_POLICY, AI_POLICY_TEXT, designFor, DRAFT, isDesignProgram, quizBlueprint } from "../academy/design";
import { DECIDED_BY, DECISIONS, decisionIso } from "../academy/decisions";
import { facultyByName, fitSize } from "../../brand/faculty";
import { facultyImageBytes } from "../../brand/faculty-assets";
import { audit, notify, requireTenant } from "./common";
import { copyCheck } from "./claims";
import { renderBlocks, validateBlocks, type Block } from "./curriculum";
import { snapshotQuiz } from "./assessment";
import { decideApplication } from "./sis";
import { computeTotals } from "./grading";
import { issueCredential } from "./success";

/**
 * Program Studio (Tab 50): Scholaris AI Academy programs #1, #12, #13, #14 and #26.
 *
 * One source of truth: program designs live in `program_pages.spec`; fees, dates and seats
 * come from the catalog (`offerings`, `offering_sections`). The public website page,
 * structured data and the brochure PDF are all generated from those rows. Course shells
 * are loaded unpublished; an admin publishes them after the quality gate.
 */

const DAY = 86400_000;
const ET = "America/New_York";

/* ---------------- time helpers ---------------- */

/** The UTC instant at which the wall clock in `tz` reads y-m-d hh:mm. */
export function atZone(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const want = Date.UTC(y, m, d, hh, mm);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    guess += want - local;
  }
  return new Date(guess);
}

/** Monday of the cohort's first week, `days` from now (date only, in ET). */
function cohortMonday(days: number) {
  const d = new Date(nowMs() + days * DAY);
  const dow = d.getUTCDay();
  const add = (8 - dow) % 7;
  const m = new Date(d.getTime() + add * DAY);
  return { y: m.getUTCFullYear(), mo: m.getUTCMonth(), d: m.getUTCDate() };
}
function weekNo(w: string) {
  const parts = w.split(/[–-]/).map((x) => Number(x.replace(/\D/g, "")));
  return parts[parts.length - 1] || 0;
}
function dayOf(start: { y: number; mo: number; d: number }, offsetDays: number, hh: number, mm: number) {
  const base = new Date(Date.UTC(start.y, start.mo, start.d) + offsetDays * DAY);
  return atZone(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh, mm, ET).toISOString();
}

/* ---------------- ids ---------------- */

const num = (code: string) => code.replace("#", "").replace(".", "_");
export const offeringIdFor = (slug: string, code: string) => `off_${slug}_${num(code)}`;
const courseIdFor = (slug: string, code: string, block: string, single: boolean) => `crs_${slug}_p${num(code)}${single ? "" : block.toLowerCase()}`;
export const moduleKeyFor = (code: string, week: string) => `p${num(code)}-w${week.replace(/[–-]/g, "_")}`;

function blocks(paras: string[], title: string, extra: Block[] = []) {
  return validateBlocks([{ type: "heading", level: 2, text: title }, ...paras.map((p) => ({ type: "paragraph" as const, text: p })), ...extra]);
}
/** Markdown edition → page blocks (headings become real headings). */
function mdBlocks(md: string, title: string) {
  const out: Block[] = [{ type: "heading", level: 2, text: title }];
  for (const para of md.split(/\n\n+/)) {
    const h = /^(#{1,3})\s+(.*)$/.exec(para.trim());
    if (h) {
      if (h[1].length > 1) out.push({ type: "heading", level: 3, text: h[2] });
    } else if (para.trim()) out.push({ type: "paragraph", text: para.trim().replace(/^> /, "") });
  }
  return validateBlocks(out);
}

/** Program copy for the honesty guard: "#1" etc. are program numbers, not rankings. */
export function programCopy(spec: ProgramSpec) {
  const text = [spec.title, spec.valueStatement, ...spec.overview, ...spec.outcomes, ...spec.audience, spec.prerequisites, spec.codingRequirement, ...spec.curriculum.map((w) => `${w.title}. ${w.focus}`), ...spec.projects.map((p) => `${p.name}. ${p.description}`), ...spec.learningExperience, spec.credential.certificate, spec.credential.badge, spec.credential.description, ...spec.careerServices, ...spec.faqs.map((f) => `${f.q} ${f.a}`), spec.creditStatement, spec.fundingStatement].join("\n");
  return text.replace(/#\s?\d+(\.\d+)?/g, "Program N");
}

export function learningHours(spec: ProgramSpec) {
  if (!spec.hoursPerWeek) return null;
  const [a, b] = spec.hoursPerWeek;
  const weeks = spec.curriculum.filter((w) => !w.optional).length ? spec.weeks : spec.weeks;
  return a === b ? `${a * weeks} learning hours` : `${a * weeks}–${b * weeks} learning hours`;
}

/* ---------------- publish checks ---------------- */

addPublishCheck("program_pages", (store, row) => {
  const spec = row.spec as ProgramSpec | undefined;
  if (!spec) return ["Program design is missing."];
  const issues: string[] = [];
  for (const f of copyCheck(store, programCopy(spec))) issues.push(`Copy check: ${f.label} ("${f.match}") needs an approved claim or new wording.`);
  if (spec.outcomes.length < 5 || spec.outcomes.length > 6) issues.push("State 5–6 measurable outcomes.");
  if (spec.faculty.some((p) => !p.name)) issues.push("List confirmed faculty only.");
  const o = store.get("offerings", row.offeringId as string);
  if (!o || !(Number(o.price) > 0)) issues.push("Set the fee on the catalog offering.");
  if (!store.list("offering_sections", (s) => s.offeringId === row.offeringId).length) issues.push("Add at least one cohort with dates.");
  if (/\bCEUs?\b/.test(JSON.stringify(spec.credential)) && !store.list("approved_claims", (c) => /CEU provider/i.test(String(c.phrase))).length) issues.push("CEUs can only be stated with an approved CEU-provider claim; state learning hours instead.");
  return issues;
});
addPublishCheck("program_testimonials", (store, row) => {
  const issues = copyCheck(store, String(row.quote)).map((f) => `Copy check: ${f.label} ("${f.match}")`);
  if (!row.consentRef || !row.consentAt) issues.push("Written consent is required before a testimonial can appear.");
  return issues;
});

/* ---------------- loading programs ---------------- */

function leadFaculty(store: TenantStore, slug: string) {
  const id = `usr_${slug}_lead`;
  return store.get("users", id) ?? createUser(store, { id, name: "Dr. Martins Donbruce Idahosa", email: `lead@${slug}.scholarion.test`, roles: [] });
}

function rubricFor(store: TenantStore, courseId: string, title: string, reqs: string[]) {
  return store.insert("rubrics", {
    courseId,
    title,
    style: "analytic",
    criteria: reqs.map((r, i) => ({ id: `c${i + 1}`, name: r, bands: [{ label: "Meets", points: 5 }, { label: "Partly meets", points: 3 }, { label: "Not yet", points: 0 }] })),
    version: 1,
    state: "published",
  }, "rb");
}

const ACTIVITY_BODY = (w: WeekSpec) => [
  `Objective: apply this week's ideas — ${w.focus}`,
  "Activity overview, Step 1, Step 2 (hands-on implementation: open the Student Starter notebook with TODOs; the Instructor EXECUTED notebook is provided to faculty), Step 3 (task), Step 4 (research, discussion and reflection), Step 5 (wrap-up, 5 minutes).",
  "Submission: a 2–3-page APA paper with embedded code, explanations and output screenshots, with references and citations. Upload as Word or PDF. Due Sunday 11:59 PM ET.",
  "Status: shell loaded from the program design; the student and instructor editions are pending SME authoring.",
];

type Ctx = { store: TenantStore; slug: string; root: Row | undefined; staff: string[]; pos: number };

function getOrCreateCourse(x: Ctx, id: string, data: Record<string, unknown>) {
  const ex = x.store.get("courses", id);
  if (ex) return { course: x.store.update("courses", id, { code: data.code, title: data.title, description: data.description }), created: false };
  const c = x.store.insert("courses", { id, credits: 0, state: "unpublished", accountId: x.root?.id ?? null, homeType: "modules", latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 }, timeZone: ET, visibility: "course", ...data }, "crs");
  for (const uid of x.staff) x.store.insert("enrollments", { userId: uid, courseId: c.id, role: "instructor", state: "active", source: "manual" }, "enr");
  return { course: c, created: true };
}
function itemOf(x: Ctx, c: Row, m: Row, kind: string, refId: string, title: string, requirement: string | null, extra: Record<string, unknown> = {}) {
  return x.store.insert("module_items", { courseId: c.id, moduleId: m.id, kind, refId, title, position: ++x.pos, indent: 0, requirement, state: "published", ...extra }, "mi");
}
function pageOf(x: Ctx, c: Row, m: Row | null, title: string, paras: string[]) {
  const bl = blocks(paras, title);
  return x.store.insert("pages", { courseId: c.id, moduleId: m?.id ?? null, title, blocks: bl, html: renderBlocks(x.store, bl, c.id), position: 1, state: "published" }, "pg");
}
function libraryNote(keys: string[] | undefined) {
  const mods = (keys ?? []).map((k) => LIBRARY.find((l) => l.key === k)).filter(Boolean) as LibraryModule[];
  if (!mods.length) return [];
  return [`Built on shared library module${mods.length > 1 ? "s" : ""}: ${mods.map((m) => `${m.title} v${m.version}`).join("; ")}.`, ...mods.filter((m) => m.textbook).map((m) => `Reading: ${m.textbook}.`)];
}
function quizFrom(x: Ctx, c: Row, m: Row, title: string, items: QuizItem[], opts: { tag: string; groupId?: string; attempts?: number; cooling?: number; availableFrom?: string; availableUntil?: string; bank?: Row }) {
  const bank = opts.bank ?? x.store.insert("question_banks", { courseId: c.id, title: `${title} bank` }, "qb");
  for (const q of items) x.store.insert("questions", { courseId: c.id, bankId: bank.id, kind: q.kind, prompt: q.prompt, choices: q.choices, answer: q.answer, explanation: q.explanation ?? null, points: 1, tags: [opts.tag], version: 1 }, "qn");
  const qz = x.store.insert("quizzes", { courseId: c.id, moduleId: m.id, title, bankId: bank.id, pools: [{ bankId: bank.id, tag: opts.tag, pick: items.length }], questionCount: items.length, timeLimitMin: 20, allowedAttempts: opts.attempts ?? 3, coolingMinutes: opts.cooling ?? 0, points: items.length, groupId: opts.groupId ?? null, availableFrom: opts.availableFrom ?? null, availableUntil: opts.availableUntil ?? null, kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, showCorrectAnswers: true, state: "published" }, "qz");
  snapshotQuiz(x.store, qz.id);
  return { quiz: qz, bank };
}

/** Load one live/cohort program or pathway (idempotent): courses per block, modules per week, items, offering, cohorts, page, credentials. */
function loadProgram(x: Ctx, spec: ProgramSpec) {
  const { store, slug } = x;
  if (store.get("program_pages", `ppg_${slug}_${num(spec.code)}`)) return;
  if (spec.selfPaced) return loadSelfPaced(x, spec);
  const offeringId = offeringIdFor(slug, spec.code);
  const start = cohortMonday(spec.batches?.[0]?.startInDays ?? spec.cohort.startInDays);
  const single = spec.blocks.length === 1;
  const courseByBlock: Record<string, Row> = {};
  x.pos = 0;
  // #1–#11: the course standard from the program design package (quizzes, labs, assignments,
  // exams, announcements, sequential locking, activity editions, AI-use policy per item).
  const design = isDesignProgram(spec.code) ? designFor(spec) : null;

  spec.blocks.forEach((b, bi) => {
    const id = bi === 0 && spec.adoptCourse ? spec.adoptCourse.courseId : courseIdFor(slug, spec.code, b.key, single);
    const titleFor = spec.pathway ? `${spec.title} — ${b.title}` : single ? spec.title : `${spec.title} — ${b.title}`;
    courseByBlock[b.key] = getOrCreateCourse(x, id, { code: single && !spec.pathway ? spec.code : `${spec.code}-${b.key}`, title: titleFor, description: spec.valueStatement, format: spec.format, startAt: dayOf(start, 0, 0, 0), endAt: dayOf(start, spec.weeks * 7, 23, 59) }).course;
  });
  const groups: Record<string, Record<string, Row>> = {};
  for (const [k, c] of Object.entries(courseByBlock)) {
    const pnp = spec.grading === "pass_no_pass" || spec.completion === "weekend_intensive";
    groups[k] = design
      ? {
          act: store.insert("assignment_groups", { courseId: c.id, name: "In-class activities", weight: 10 }, "ag"),
          asg: store.insert("assignment_groups", { courseId: c.id, name: "Assignments", weight: 15 }, "ag"),
          lab: store.insert("assignment_groups", { courseId: c.id, name: "Labs", weight: 15 }, "ag"),
          quiz: store.insert("assignment_groups", { courseId: c.id, name: "Quizzes", weight: 10 }, "ag"),
          exam: store.insert("assignment_groups", { courseId: c.id, name: "Exams", weight: 15 }, "ag"),
          proj: store.insert("assignment_groups", { courseId: c.id, name: "Projects and capstone", weight: 35 }, "ag"),
        }
      : {
          act: store.insert("assignment_groups", { courseId: c.id, name: "In-class activities", weight: pnp ? 10 : 20 }, "ag"),
          lab: store.insert("assignment_groups", { courseId: c.id, name: "Labs", weight: pnp ? 40 : 20 }, "ag"),
          quiz: store.insert("assignment_groups", { courseId: c.id, name: "Quizzes and checks", weight: 20 }, "ag"),
          proj: store.insert("assignment_groups", { courseId: c.id, name: "Projects and capstone", weight: pnp ? 30 : 40 }, "ag"),
        };
  }
  const firstBlock = spec.blocks[0].key;
  let prevModule: Row | null = null;
  let prevBlock = "";
  let bank: Row | null = null;
  let checksBank: Row | null = null;
  const unit = spec.curriculum.some((w) => w.sessions) ? "Weekend" : "Week";
  for (const w of spec.curriculum) {
    const bk = w.block ?? firstBlock;
    const c = courseByBlock[bk];
    if (bk !== prevBlock) prevModule = null;
    prevBlock = bk;
    const wk = weekNo(w.week);
    const weekStart = Math.max(0, wk - 1) * 7;
    const adoptId = bk === firstBlock ? spec.adoptCourse?.weeks[w.week] : undefined;
    const modData = { courseId: c.id, title: `${w.optional ? "Optional — " : ""}${unit} ${w.week}: ${w.title}`, position: wk + 1, moduleKey: moduleKeyFor(spec.code, w.week), state: "published", requireAll: true, sequential: spec.code === "#26" || (!!design && !w.optional), prerequisiteModuleIds: (spec.code === "#26" || (!!design && !w.optional)) && prevModule ? [prevModule.id] : [] };
    const m: Row = adoptId && store.get("modules", adoptId) ? store.update("modules", adoptId, { title: modData.title, position: modData.position, moduleKey: modData.moduleKey }) : store.insert("modules", modData, "mod");
    if (!w.optional) prevModule = m;
    if (x.pos === 0 || (wk <= 1 && bk === firstBlock && !store.list("pages", (p) => p.courseId === c.id && /Orientation/.test(String(p.title))).length)) {
      const o = pageOf(x, c, m, "Orientation and getting started", [`Welcome to ${spec.title}. ${spec.formatText}.`, `How the program works: ${spec.learningExperience.join("; ")}.`, `Grading: ${spec.grading === "pass_no_pass" ? `pass/no-pass — ${(spec.passRules ?? []).join("; ")}` : spec.completion === "weekend_intensive" ? `completion requires — ${(spec.passRules ?? []).join("; ")}` : "graded against each assignment's rubric"}.`, ...(spec.textbooks?.length ? [`Textbooks: ${spec.textbooks.join("; ")}.`] : []), "Need help? Use the AI Teaching Assistant for hints from your course material, the program support desk for anything else, and the accessibility support contact for accommodations."]);
      itemOf(x, c, m, "page", o.id, o.title as string, "view");
    }
    const research = (spec.research ?? []).filter((r) => r.week === wk);
    const ov = pageOf(x, c, m, `${unit} ${w.week} overview`, [w.focus, ...(w.sessions ? [`Saturday session (3 hours): ${w.sessions[0]}.`, `Sunday session (3 hours): ${w.sessions[1]}.`, "Each session is a guided build: demo → lab → checkpoint."] : []), ...(w.labs ? [`Lab A: ${w.labs[0]}.`, `Lab B: ${w.labs[1]}.`] : []), ...(w.dual ? ["Deep learning labs ship in PyTorch and TensorFlow/Keras versions; choose one. The instructor solution covers both."] : []), ...libraryNote(w.lib), ...research.map((r) => `Research case study: ${r.authors} (${r.year}). ${r.title}. ${r.venue}.`)]);
    itemOf(x, c, m, "page", ov.id, ov.title as string, "view");
    const due = dayOf(start, weekStart + 6, 23, 59);
    const wp = design?.weeks.find((y) => y.week === w.week);
    if (design && wp && !w.optional) {
      store.insert("announcements", { courseId: c.id, title: `${unit} ${w.week} starts: ${w.title}`, body: `This week: ${wp.topics.join(", ")}. Live session: ${wp.liveSession}. Due Sunday 11:59 PM ET: ${[wp.activity, ...wp.assessments.map((id) => design.assessments.find((a) => a.id === id)?.title ?? "")].filter(Boolean).join("; ")}.`, publishAt: dayOf(start, weekStart, 8, 0), state: "published", auto: true, allowReplies: false, readBy: [] }, "ann");
    }
    if (w.kind !== "capstone" && w.kind !== "midterm") {
      const ed = design && wp ? activityEditions(spec, design, wp) : null;
      const act = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `In-Class Activity — ${unit} ${w.week}: ${w.title}`, instructions: ed ? ed.student : ACTIVITY_BODY(w).join("\n\n"), points: 10, groupId: groups[bk].act.id, dueAt: due, submissionTypes: ["file"], allowedExtensions: ["docx", "pdf"], state: "published", gradingType: "points", ...(design ? { aiPolicy: AI_POLICY.activity, designStatus: DRAFT } : {}) }, "asg");
      itemOf(x, c, m, "assignment", act.id, act.title as string, w.optional ? null : "submit");
      if (ed) {
        const ie = x.store.insert("pages", { courseId: c.id, moduleId: m.id, title: `Instructor edition — ${unit} ${w.week} activity`, blocks: mdBlocks(ed.instructor, `Instructor edition — ${unit} ${w.week} activity`), html: renderBlocks(x.store, mdBlocks(ed.instructor, `Instructor edition — ${unit} ${w.week} activity`), c.id), position: 2, state: "unpublished", audience: "instructors" }, "pg");
        itemOf(x, c, m, "page", ie.id, ie.title as string, null, { state: "unpublished" });
      }
    }
    if (w.sessions) {
      w.sessions.forEach((title, i) => {
        const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `Session lab ${wk}${i === 0 ? "A" : "B"}: ${title.split(":")[0]}`, instructions: `${title}.\n\nComplete the session checkpoint in the Cloud Lab and submit your notebook. If you missed the live session, review the recording first — a submitted lab counts as attendance.`, points: 10, groupId: groups[bk].lab.id, dueAt: dayOf(start, weekStart + 5 + i, 23, 59), submissionTypes: ["file", "url"], allowedExtensions: ["ipynb", "py", "pdf"], state: "published", gradingType: "points", tags: ["session_lab"] }, "asg");
        itemOf(x, c, m, "assignment", a.id, a.title as string, "submit");
      });
    }
    if (w.dual) {
      const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `Lab ${w.week}: ${w.title} (PyTorch or TensorFlow/Keras)`, instructions: "Choose the PyTorch or TensorFlow/Keras starter notebook, complete the TODOs and submit. Both versions are graded on the same rubric.", points: 10, groupId: groups[bk].lab.id, dueAt: due, submissionTypes: ["file", "url"], allowedExtensions: ["ipynb", "py"], state: "published", gradingType: "points", tags: ["lab", "dual_framework"] }, "asg");
      itemOf(x, c, m, "assignment", a.id, a.title as string, "submit");
    }
    if (w.labs) {
      w.labs.forEach((lab, i) => {
        const day = i === 0 ? 3 : 4;
        const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `Lab ${wk}${i === 0 ? "A" : "B"}: ${lab}`, instructions: `Guided 90-minute lab (${i === 0 ? "Thursday" : "Friday"}). Open the Student Starter notebook with TODOs in the Cloud Lab, complete the checkpoints and submit the notebook. Checkpoints are met at 7/10 or above.`, points: 10, groupId: groups[bk].lab.id, dueAt: dayOf(start, weekStart + day + 2, 23, 59), submissionTypes: ["file", "url"], allowedExtensions: ["ipynb", "py", "pdf"], state: "published", gradingType: "points", tags: ["lab"] }, "asg");
        itemOf(x, c, m, "assignment", a.id, a.title as string, "submit");
      });
    }
    if (spec.code === "#26" && P26_QUIZ[wk]) {
      bank ??= store.insert("question_banks", { courseId: c.id, title: `${spec.code} weekly quiz bank` }, "qb");
      const r = quizFrom(x, c, m, `Week ${wk} quiz`, P26_QUIZ[wk], { tag: `week${wk}`, groupId: groups[bk].quiz.id, availableFrom: dayOf(start, weekStart, 0, 0), availableUntil: due, bank });
      itemOf(x, c, m, "quiz", r.quiz.id, r.quiz.title as string, "submit");
    }
    if (spec.completion === "weekend_intensive" && P15_CHECKS[wk]) {
      checksBank ??= store.insert("question_banks", { courseId: c.id, title: `${spec.code} weekend checks bank` }, "qb");
      const r = quizFrom(x, c, m, `Weekend ${wk} check`, P15_CHECKS[wk], { tag: `weekend${wk}`, groupId: groups[bk].quiz.id, bank: checksBank });
      itemOf(x, c, m, "quiz", r.quiz.id, r.quiz.title as string, "min_score", { minScore: 70 });
    }
    if (spec.code === "#1" && w.kind === "midterm" && !design) {
      const ex = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Block A exam", instructions: "Exam items pending SME authoring.", points: 20, groupId: groups[bk].quiz.id, dueAt: due, submissionTypes: ["on_paper"], state: "unpublished", gradingType: "points" }, "asg");
      itemOf(x, c, m, "assignment", ex.id, ex.title as string, null);
    }
    for (const p of spec.projects.filter((pp) => weekNo(pp.week) === wk && (pp.week === w.week || !spec.curriculum.some((y) => y.week === pp.week)))) {
      const rb = p.requirements ? rubricFor(store, c.id, `${p.name} rubric`, p.requirements) : null;
      const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `${p.kind === "capstone" ? "Capstone" : p.kind === "midterm" ? "Midterm project" : "Project"}: ${p.name}`, instructions: `${p.description}\n\nSkills practiced: ${p.skills.join(", ")}.${p.requirements ? `\n\nRequired: ${p.requirements.join("; ")}.` : ""}\n\nUse the synthetic datasets in Program resources; never real personal or financial data.`, points: rb ? p.requirements!.length * 5 : 20, groupId: groups[bk].proj.id, dueAt: due, submissionTypes: ["file", "url"], rubricId: rb?.id ?? null, state: "published", gradingType: "points", tags: [p.kind] }, "asg");
      itemOf(x, c, m, "assignment", a.id, a.title as string, "submit");
    }
    if (design) {
      for (const a of design.assessments.filter((y) => y.week === w.week && !y.fromSpec)) {
        if (a.kind === "quiz" || a.kind === "midterm_exam" || a.kind === "final_exam") {
          const bp = quizBlueprint(design, a);
          const qb = store.insert("question_banks", { courseId: c.id, title: `${a.title} bank (${bp.poolSize} items to author)` }, "qb");
          const qz = store.insert("quizzes", { courseId: c.id, moduleId: m.id, title: a.title, bankId: qb.id, pools: [{ bankId: qb.id, tag: a.id, pick: bp.itemsShown }], questionCount: bp.itemsShown, timeLimitMin: a.kind === "quiz" ? 20 : 90, allowedAttempts: a.kind === "quiz" ? 2 : 1, points: bp.itemsShown, groupId: (a.kind === "quiz" ? groups[bk].quiz : groups[bk].exam).id, kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, state: "unpublished", aiPolicy: a.aiPolicy, blueprint: bp.blueprint, competencies: a.outcomes, designStatus: bp.status }, "qz");
          itemOf(x, c, m, "quiz", qz.id, `${a.title} (draft — items pending SME authoring)`, null, { state: "unpublished" });
          continue;
        }
        const grp = a.kind === "lab" ? groups[bk].lab : a.kind === "assignment" ? groups[bk].asg : groups[bk].proj;
        const policy = AI_POLICY_TEXT[a.aiPolicy];
        const steps = a.kind === "assignment" ? `\n\nWalkthrough:\n1. Load the larger synthetic dataset from Program resources and read its data card.\n2. Reproduce this week's technique on a 10% sample and check it by hand.\n3. Scale to the full dataset; record time, cost or errors.\n4. Compare results with a simple baseline.\n5. Write up decisions, evidence and one limitation.` : a.kind === "lab" ? `\n\n${design.notebooks ? `Open Week_${String(w.week).padStart(2, "0")}_Lab_Starter_TODO.ipynb in the Cloud Lab and complete each TODO; the instructor solution is released after the due date.` : "Follow the lab tool walkthrough and compare with the completed reference build."}` : "";
        const asg = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: a.title, instructions: `${a.description}${steps}\n\nCompetencies: ${a.outcomes.join(", ")}.\n\nAI-use policy (${a.aiPolicy}): ${policy}\n\n${DRAFT}`, points: a.kind === "final_practical" ? 30 : a.kind === "project" ? 20 : 10, groupId: grp.id, dueAt: due, submissionTypes: ["file", "url"], allowedExtensions: a.kind === "lab" ? ["ipynb", "py", "pdf"] : ["docx", "pdf", "zip", "ipynb"], state: "published", gradingType: "points", tags: [a.kind], aiPolicy: a.aiPolicy, competencies: a.outcomes }, "asg");
        itemOf(x, c, m, "assignment", asg.id, asg.title as string, "submit");
      }
    }
    if (spec.code === "#26" && wk === 5) {
      const ms = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Capstone milestone check-in", instructions: "Share your chosen brief, architecture sketch and evaluation plan for feedback.", points: 5, groupId: groups[bk].proj.id, dueAt: due, submissionTypes: ["text", "file"], state: "published", gradingType: "points" }, "asg");
      itemOf(x, c, m, "assignment", ms.id, ms.title as string, "submit");
    }
    if (spec.code === "#26" && wk === 7) {
      const pr = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Final presentation (10 minutes)", instructions: "Demo, architecture, evaluation results and limitations. Marked delivered by faculty.", points: 1, groupId: groups[bk].proj.id, dueAt: dayOf(start, 6 * 7 + 4, 23, 59), submissionTypes: ["on_paper"], state: "published", gradingType: "points", tags: ["presentation"] }, "asg");
      itemOf(x, c, m, "assignment", pr.id, pr.title as string, null);
    }
    if (spec.completion === "weekend_intensive" && w.kind === "capstone") {
      const d = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Capstone live demo defense", instructions: "Live demo with the monitoring dashboard, followed by questions from mentors. Marked delivered by faculty.", points: 1, groupId: groups[bk].proj.id, dueAt: due, submissionTypes: ["on_paper"], state: "published", gradingType: "points", tags: ["presentation"] }, "asg");
      itemOf(x, c, m, "assignment", d.id, d.title as string, null);
      if (checksBank) {
        const fq = store.insert("quizzes", { courseId: c.id, moduleId: m.id, title: "Final knowledge check", bankId: checksBank.id, pools: Object.keys(P15_CHECKS).map((k) => ({ bankId: checksBank!.id, tag: `weekend${k}`, pick: 1 })), questionCount: 10, timeLimitMin: 30, allowedAttempts: 2, points: 10, groupId: groups[bk].quiz.id, kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, state: "published" }, "qz");
        snapshotQuiz(store, fq.id);
        itemOf(x, c, m, "quiz", fq.id, "Final knowledge check (2 attempts; free remediation between attempts)", null);
      }
    }
  }
  // Program resources: data cards, tools, library modules, electives.
  {
    const c = courseByBlock[firstBlock];
    const res = store.insert("modules", { courseId: c.id, title: "Program resources: datasets, tools and electives", position: 99, moduleKey: moduleKeyFor(spec.code, "res"), state: "published", requireAll: false }, "mod");
    for (const d of spec.dataCards) {
      const pg = pageOf(x, c, res, `Data card: ${d.name}`, [`Purpose: ${d.purpose}.`, `Rows: about ${d.rows}. Fields: ${d.fields.join(", ")}.`, `Source: ${d.source}`, `Caveats: ${d.caveats}`]);
      itemOf(x, c, res, "page", pg.id, pg.title as string, null);
    }
    const t = pageOf(x, c, res, "Tools and versions", [...spec.tools.map((g) => `${g.family}: ${g.items.join(", ")}.`), "Versions are pinned in the Cloud Lab after verification at cohort start.", TRADEMARK_NOTICE]);
    itemOf(x, c, res, "page", t.id, t.title as string, null);
    if (spec.electives?.length) {
      const el = pageOf(x, c, res, "Self-paced electives (optional, micro-badges)", [...spec.electives.map((e) => `${e}.`), "Electives are optional and don't count toward completion. Each runs 2–4 weeks of access and earns a micro-badge."]);
      itemOf(x, c, res, "page", el.id, el.title as string, null);
    }
  }

  // Live calendars: #26 weekday sessions; weekend programs from the first batch.
  if (spec.code === "#26") {
    const c = courseByBlock[firstBlock];
    for (const w of spec.curriculum) {
      const wk = weekNo(w.week);
      const base = (wk - 1) * 7;
      const sessions: [number, string][] = w.kind === "capstone" ? [[3, "Capstone build clinic and peer design review"], [4, "Final presentations"]] : [[2, `Live session: ${w.title}`], [3, `Lab A: ${w.labs?.[0] ?? ""}`], [4, `Lab B: ${w.labs?.[1] ?? ""}`]];
      for (const [d, title] of sessions) store.insert("calendar_events", { courseId: c.id, title: `Week ${wk} · ${title}`, startsAt: dayOf(start, base + d, 12, 0), endsAt: dayOf(start, base + d, 13, 30), location: "Live online (link on the course home)", recurrence: "none" }, "ce");
    }
  } else if (spec.curriculum.some((w) => w.sessions)) {
    const c = courseByBlock[firstBlock];
    const b = spec.batches?.[0];
    const [sh, sm] = (b?.satStart ?? "10:00").split(":").map(Number);
    for (const w of spec.curriculum) {
      const wk = weekNo(w.week);
      const base = (wk - 1) * 7;
      w.sessions?.forEach((title, i) => store.insert("calendar_events", { courseId: c.id, title: `Weekend ${wk} · ${i === 0 ? "Sat" : "Sun"}: ${title.split(":")[0]}`, startsAt: dayOf(start, base + 5 + i, sh, sm), endsAt: dayOf(start, base + 5 + i, sh + 3, sm), location: `Live online${b ? ` (${b.label})` : ""}`, recurrence: "none" }, "ce"));
    }
  }

  // Credentials.
  const cert = store.insert("credential_templates", { name: spec.credential.certificate, kind: spec.productType === "professional_certificate" ? "professional_certificate" : "completion", wording: `${spec.credential.description} ${spec.creditStatement}`, gradeThreshold: 70, requiresCapstone: spec.grading !== "pass_no_pass" && spec.completion !== "weekend_intensive", approvalRequired: false, state: "published" }, "ctpl");
  store.insert("credential_templates", { name: spec.credential.badge, kind: "skill_badge", wording: spec.credential.badge, gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl");
  if (spec.gradedPerformance) store.insert("credential_templates", { name: `Scholaris AI Academy Graded Performance Certificate — ${spec.title}`, kind: "graded_performance", wording: `Shows the final grade earned in ${spec.title}. ${spec.creditStatement}`, gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl");

  // Catalog.
  const included = (spec.pathway?.includes ?? []).map((code) => store.list("offerings", (o) => o.code === code)[0]).filter(Boolean) as Row[];
  const includedCourses = included.flatMap((o) => [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])]).filter(Boolean);
  const blockIds = [...Object.values(courseByBlock).map((c) => c.id), ...includedCourses];
  const offeringData = {
    code: spec.code,
    title: spec.title,
    productType: spec.productType,
    courseId: blockIds[0],
    blockCourseIds: blockIds.slice(1),
    pathwayIncludes: included.map((o) => o.id),
    summary: spec.valueStatement,
    level: spec.level,
    hours: spec.hoursPerWeek ? Math.round(((spec.hoursPerWeek[0] + spec.hoursPerWeek[1]) / 2) * spec.weeks) : null,
    skills: [...new Set(spec.projects.flatMap((pp) => pp.skills))].slice(0, 8),
    libraryKeys: [...new Set(spec.curriculum.flatMap((w) => w.lib ?? []))],
    moduleKeys: spec.curriculum.map((w) => moduleKeyFor(spec.code, w.week)),
    price: spec.fees.price,
    earlyBirdPrice: spec.fees.earlyBirdPrice,
    earlyBirdEndsAt: dayOf(cohortMonday(spec.cohort.earlyBirdInDays - 7 > 0 ? spec.cohort.earlyBirdInDays - 7 : 0), 6, 23, 59),
    currency: "USD",
    format: spec.format === "online" && spec.formatKind?.startsWith("live") ? "live" : spec.format,
    selfPaced: false,
    inPlus: false,
    aidEligible: false,
    credentialTemplateId: cert.id,
    requiresApplication: true,
    selfCheckRequired: !!spec.selfCheck,
    payLaterAllowed: !!spec.batches,
    lateEnrollmentDays: spec.lateEnrollmentDays,
    state: "published",
  };
  const o = store.get("offerings", offeringId) ? store.update("offerings", offeringId, offeringData) : store.insert("offerings", { id: offeringId, ...offeringData }, "off");
  if (spec.batches?.length) {
    for (const b of spec.batches) {
      const bs = cohortMonday(b.startInDays);
      const [sh, sm] = b.satStart.split(":").map(Number);
      store.insert("offering_sections", { offeringId: o.id, code: b.code, label: b.label, startsAt: atZone(bs.y, bs.mo, bs.d + 5, sh, sm, b.timeZone).toISOString(), endsAt: dayOf(bs, spec.weeks * 7 - 1, 23, 59), timeZone: b.timeZone, capacity: b.capacity, registrationClosesAt: dayOf(bs, 2, 23, 59), applicationDeadline: dayOf(bs, -3, 23, 59), schedule: `Sat ${b.satStart}–${String(sh + 3).padStart(2, "0")}:${String(sm).padStart(2, "0")} and Sun ${b.sunStart}–${String(Number(b.sunStart.split(":")[0]) + 3).padStart(2, "0")}:${b.sunStart.split(":")[1]} (${b.timeZone})`, seatsTaken: 0 }, "osec");
    }
  } else {
    store.insert("offering_sections", { offeringId: o.id, code: spec.cohort.code, startsAt: dayOf(start, 0, 9, 0), endsAt: dayOf(start, spec.weeks * 7 - 1, 23, 59), timeZone: spec.cohort.timeZone, capacity: spec.cohort.capacity, registrationClosesAt: dayOf(start, spec.lateEnrollmentDays, 23, 59), applicationDeadline: dayOf(start, spec.cohort.applicationDeadlineInDays - spec.cohort.startInDays, 23, 59), schedule: spec.cohort.schedule, seatsTaken: 0 }, "osec");
  }
  for (const inc of included) if (!store.list("pathway_edges", (e) => e.fromId === inc.id && e.toId === o.id && e.kind === "stacks_into").length) store.insert("pathway_edges", { fromId: inc.id, toId: o.id, kind: "stacks_into", moduleKey: null, note: `Included in the ${spec.code} pathway; issues its own certificate.` }, "pe");

  // Parts sold separately (#13).
  for (const part of spec.parts ?? []) {
    const blockKey = part.code.endsWith(".1") ? "C1" : "C2";
    const po = store.insert("offerings", { id: offeringIdFor(slug, part.code), code: part.code, title: part.title, productType: "short_course", courseId: courseByBlock[blockKey].id, summary: part.summary, level: spec.level, price: part.price, currency: "USD", format: spec.format, selfPaced: false, inPlus: false, aidEligible: false, requiresApplication: true, credentialTemplateId: store.insert("credential_templates", { name: `Scholaris AI Academy Certificate of Completion — ${part.title}`, kind: "completion", wording: `Completed ${part.title}. ${spec.creditStatement}`, gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl").id, moduleKeys: spec.curriculum.filter((w) => (w.block ?? firstBlock) === blockKey).map((w) => moduleKeyFor(spec.code, w.week)), libraryKeys: [...new Set(spec.curriculum.filter((w) => (w.block ?? firstBlock) === blockKey).flatMap((w) => w.lib ?? []))], state: "published" }, "off");
    store.insert("offering_sections", { offeringId: po.id, code: `${spec.cohort.code}-${blockKey}`, startsAt: dayOf(start, blockKey === "C1" ? 0 : 56, 9, 0), endsAt: dayOf(start, blockKey === "C1" ? 55 : 111, 23, 59), timeZone: spec.cohort.timeZone, capacity: spec.cohort.capacity, registrationClosesAt: dayOf(start, (blockKey === "C1" ? 0 : 56) + spec.lateEnrollmentDays, 23, 59), schedule: spec.cohort.schedule, seatsTaken: 0 }, "osec");
    store.insert("pathway_edges", { fromId: po.id, toId: o.id, kind: "stacks_into", moduleKey: null, note: "Completing both courses earns the bundle badge." }, "pe");
  }

  store.insert("program_pages", { id: `ppg_${slug}_${num(spec.code)}`, offeringId: o.id, slug: spec.slug, spec, advisorEmail: `advisors@${slug}.scholarion.test`, advisorPhone: null, brochureNote: "Fees and dates are read from the catalog when the brochure is generated.", packageStatus: null, copyFlags: [], state: "published" }, "ppg");
}

/** Self-paced products (#28–#38): one course per short course, autograded labs, quizzes, final projects. */
function loadSelfPaced(x: Ctx, spec: ProgramSpec) {
  const { store, slug } = x;
  const sp = spec.selfPaced!;
  const courseRows: Row[] = [];
  const partOfferings: Row[] = [];
  const perCoursePrice = sp.courses.length > 1 ? Math.max(29, Math.round((spec.fees.price / sp.courses.length) * 1.25)) : spec.fees.price;
  for (const c of sp.courses) {
    const id = c.courseId ?? `crs_${slug}_p${num(c.code)}`;
    const { course, created } = getOrCreateCourse(x, id, { code: c.code, title: c.title, description: `${spec.title}: ${c.title}`, format: "online", selfPacedCourse: true });
    courseRows.push(course);
    if (created) {
      x.pos = 0;
      let complete = true;
      const grp = store.insert("assignment_groups", { courseId: course.id, name: "Graded work", weight: 100 }, "ag");
      c.modules.forEach((m, mi) => {
        const mod = store.insert("modules", { courseId: course.id, title: `Module ${mi + 1}: ${m.title}`, position: mi + 1, moduleKey: `${moduleKeyFor(c.code, String(mi + 1))}`, state: "published", requireAll: true, sequential: false }, "mod");
        const ov = pageOf(x, course, mod, `Module ${mi + 1} overview: ${m.title}`, [m.focus, `Videos (6–10 minutes each, captioned, with transcripts and chapters): ${(m.videos ?? [m.title, "Worked example", "Common pitfalls", "Recap"]).join("; ")}.${m.videos ? "" : " Scripts are pending SME authoring."}`, "Readings: original Scholaris notes plus cited public papers and documentation.", "Discussion prompt: share one thing that surprised you and one question you still have.", ...libraryNote(m.lib)]);
        itemOf(x, course, mod, "page", ov.id, ov.title as string, "view");
        if (m.lab) {
          const tpl = store.insert("lab_templates", { title: m.lab.title, kind: "python", image: "scholarion/lab-python:3.12-slim (pinned)", instructions: m.lab.instructions, starterCode: m.lab.starterCode, tests: m.lab.tests, maxScore: m.lab.tests.reduce((s, t) => s + t.points, 0), notebookStarter: { cells: [{ type: "code", source: m.lab.starterCode }] }, notebookExecuted: { cells: [{ type: "code", source: (m.lab as { solution?: string }).solution ?? "" }] }, releaseExecutedAfterSubmit: true }, "lt");
          const a = store.insert("assignments", { courseId: course.id, moduleId: mod.id, title: `Programming assignment: ${m.lab.title}`, instructions: `${m.lab.instructions}\n\nAutograded in the Scholaris Cloud Lab; your score passes back via LTI. The Instructor EXECUTED notebook unlocks after you submit.`, points: 10, groupId: grp.id, submissionTypes: ["lti"], labTemplateId: tpl.id, state: "published", gradingType: "points", tags: ["lab", "autograded"] }, "asg");
          itemOf(x, course, mod, "assignment", a.id, a.title as string, "submit");
        } else {
          complete = false;
          const a = store.insert("assignments", { courseId: course.id, moduleId: mod.id, title: `Ungraded lab: ${m.title}`, instructions: "Open the Student Starter notebook with TODOs. Notebook pending SME authoring after tool verification.", points: 0, groupId: grp.id, submissionTypes: ["file", "url"], allowedExtensions: ["ipynb", "py"], state: "unpublished", gradingType: "not_graded", tags: ["lab"] }, "asg");
          void a;
        }
        if (m.quiz?.length) {
          const r = quizFrom(x, course, mod, `Module ${mi + 1} quiz`, m.quiz, { tag: `m${mi + 1}`, groupId: grp.id, attempts: 5, cooling: 60 });
          itemOf(x, course, mod, "quiz", r.quiz.id, `${r.quiz.title} (80% to pass)`, "min_score", { minScore: 80 });
        } else {
          complete = false;
          store.insert("quizzes", { courseId: course.id, moduleId: mod.id, title: `Module ${mi + 1} quiz (items pending SME authoring)`, questionCount: 5, timeLimitMin: 20, allowedAttempts: 5, coolingMinutes: 60, points: 5, kind: "graded", state: "unpublished" }, "qz");
        }
        if (mi === c.modules.length - 1) {
          const fp = store.insert("assignments", { courseId: course.id, moduleId: mod.id, title: `Final project: ${c.finalProject}`, instructions: `${c.finalProject}.${c.peerReviewed ? " Peer-reviewed: you review three classmates' projects with the rubric, and three review yours." : " Autograded or instructor-reviewed against the rubric."}`, points: 20, groupId: grp.id, submissionTypes: ["file", "url"], peerReviews: c.peerReviewed ? 3 : 0, rubricId: rubricFor(store, course.id, `${c.title} final project rubric`, ["Meets the brief", "Correct and working", "Clearly explained", "Evaluated or tested"]).id, state: "published", gradingType: "points", tags: ["final_project"] }, "asg");
          itemOf(x, course, mod, "assignment", fp.id, fp.title as string, "submit");
        }
      });
      if (complete) store.update("courses", course.id, { state: "published", publishedAt: nowIso() });
    }
    if (sp.courses.length > 1) {
      const pid = offeringIdFor(slug, c.code);
      const pdata = { code: c.code, title: c.title, productType: "short_course", courseId: course.id, summary: `Course in ${spec.title}: ${c.title}.`, level: spec.level, hours: c.hours, price: perCoursePrice, currency: "USD", format: "online", selfPaced: true, inPlus: sp.inPlus, auditAvailable: sp.audit, aidEligible: false, requiresApplication: false, libraryKeys: [...new Set(c.modules.flatMap((m) => m.lib ?? []))], moduleKeys: c.modules.map((_, mi) => moduleKeyFor(c.code, String(mi + 1))), state: "published" };
      const existing = store.get("offerings", pid);
      const courseCert = () => store.insert("credential_templates", { name: `Scholaris AI Academy Course Certificate — ${c.title}`, kind: "course_certificate", wording: `Completed ${c.title}. ${spec.creditStatement}`, gradeThreshold: 80, requiresCapstone: false, approvalRequired: false, state: "published" }, "ctpl").id;
      // An adopted legacy offering keeps its id and history but issues this line's Course Certificate.
      const keepTpl = existing?.credentialTemplateId && store.get("credential_templates", String(existing.credentialTemplateId))?.kind === "course_certificate";
      const po = existing ? store.update("offerings", pid, { ...pdata, ...(keepTpl ? {} : { credentialTemplateId: courseCert() }) }) : store.insert("offerings", { id: pid, ...pdata, credentialTemplateId: courseCert() }, "off");
      partOfferings.push(po);
      if (!store.list("offering_sections", (s) => s.offeringId === po.id).length) store.insert("offering_sections", { offeringId: po.id, code: `${c.code.replace("#", "SP")}-OPEN`, startsAt: nowIso(), endsAt: new Date(nowMs() + 400 * DAY).toISOString(), timeZone: "UTC", capacity: 100000, registrationClosesAt: new Date(nowMs() + 365 * DAY).toISOString(), schedule: "Start any time", seatsTaken: 0 }, "osec");
    }
  }
  const kind = sp.type === "specialization" ? "specialization_certificate" : sp.type === "professional_certificate" ? "professional_certificate" : sp.type === "short_course" ? "course_certificate" : "skill_badge";
  const cert = store.insert("credential_templates", { name: spec.credential.certificate, kind, wording: `${spec.credential.description} ${spec.creditStatement}`, gradeThreshold: 80, requiresCapstone: false, approvalRequired: false, state: "published" }, "ctpl");
  store.insert("credential_templates", { name: spec.credential.badge, kind: "skill_badge", wording: spec.credential.badge, gradeThreshold: 80, requiresCapstone: false, approvalRequired: false, state: "published" }, "ctpl");
  const offeringId = offeringIdFor(slug, spec.code);
  const hours = sp.courses.reduce((s, c) => s + c.hours, 0);
  const data = { code: spec.code, title: spec.title, productType: sp.type, courseId: courseRows[0].id, blockCourseIds: courseRows.slice(1).map((c) => c.id), summary: spec.valueStatement, level: spec.level, hours, skills: [...new Set(spec.projects.flatMap((pp) => pp.skills))].slice(0, 8), libraryKeys: [...new Set(sp.courses.flatMap((c) => c.modules.flatMap((m) => m.lib ?? [])))], moduleKeys: sp.courses.flatMap((c) => c.modules.map((_, mi) => moduleKeyFor(c.code, String(mi + 1)))), price: spec.fees.price, currency: "USD", format: "online", selfPaced: true, inPlus: sp.inPlus, auditAvailable: sp.audit, aidEligible: false, credentialTemplateId: cert.id, requiresApplication: false, standardBlocks: sp.standardBlocks, state: "published" };
  const o = store.get("offerings", offeringId) ? store.update("offerings", offeringId, data) : store.insert("offerings", { id: offeringId, ...data }, "off");
  if (!store.list("offering_sections", (s) => s.offeringId === o.id).length) store.insert("offering_sections", { offeringId: o.id, code: `${spec.code.replace("#", "SP")}-OPEN`, startsAt: nowIso(), endsAt: new Date(nowMs() + 400 * DAY).toISOString(), timeZone: "UTC", capacity: 100000, registrationClosesAt: new Date(nowMs() + 365 * DAY).toISOString(), schedule: "Start any time", seatsTaken: 0 }, "osec");
  for (const po of partOfferings) if (!store.list("pathway_edges", (e) => e.fromId === po.id && e.toId === o.id).length) store.insert("pathway_edges", { fromId: po.id, toId: o.id, kind: "stacks_into", moduleKey: null, note: `Course in ${spec.code}; issues its own Course Certificate.` }, "pe");
  store.insert("program_pages", { id: `ppg_${slug}_${num(spec.code)}`, offeringId: o.id, slug: spec.slug, spec, advisorEmail: `advisors@${slug}.scholarion.test`, advisorPhone: null, brochureNote: "Prices and access models are read from the catalog when the brochure is generated.", packageStatus: null, copyFlags: [], state: "published" }, "ppg");
}

/** The shared module library: versioned rows plus a blueprint course holding one module per library entry. */
export function ensureLibrary(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  const x: Ctx = { store, slug: t.slug, root: store.list("accounts", (a) => !a.parentId)[0], staff: [leadFaculty(store, t.slug).id], pos: 0 };
  const { course, created } = getOrCreateCourse(x, `crs_${t.slug}_library`, { code: "LIB", title: "Scholaris Module Library (blueprint)", description: "Versioned shared modules that programs pull from. Programs add their own framing, projects and assessments.", isBlueprint: true, format: "online" });
  LIBRARY.forEach((l, i) => {
    if (store.list("library_modules", (r) => r.key === l.key).length) return;
    let moduleId: string | null = null;
    if (created) {
      const m = store.insert("modules", { courseId: course.id, title: `${l.title} v${l.version}`, position: i + 1, moduleKey: `lib-${l.key}`, state: "published", requireAll: false }, "mod");
      const pg = pageOf(x, course, m, `${l.title} (v${l.version})`, [`Key content: ${l.content}.`, `Used by: ${l.usedBy.join(", ")}.`, ...(l.dualFramework ? ["Framework rule: every lab ships in PyTorch and TensorFlow/Keras versions; learners choose one and the instructor solution covers both."] : []), ...(l.textbook ? [`Textbook alignment: ${l.textbook}.`] : [])]);
      itemOf(x, course, m, "page", pg.id, pg.title as string, null);
      moduleId = m.id;
    }
    store.insert("library_modules", { key: l.key, title: l.title, version: l.version, content: l.content, usedBy: l.usedBy, dualFramework: !!l.dualFramework, textbook: l.textbook ?? null, moduleId, blueprintCourseId: course.id }, "lib");
  });
}

/** Load every program design into a tenant (idempotent) and connect pathways. */
export function ensurePrograms(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  const root = store.list("accounts", (a) => !a.parentId)[0];
  const lead = leadFaculty(store, t.slug);
  const instructors = store.list("users", (u) => u.id === `usr_${t.slug}_instructor`).map((u) => u.id);
  ensureLibrary(store);
  ensurePolicies(store);
  const x: Ctx = { store, slug: t.slug, root, staff: [lead.id, ...instructors], pos: 0 };
  const all = [...PROGRAMS, ...PROGRAMS_2, ...PROGRAMS_3, genaiProgramSpec(nowMs())];
  for (const spec of all) loadProgram(x, spec);
  // #39: exact live sessions (computed in US Eastern, DST-aware) on the program's course calendar.
  const g = store.get("offerings", offeringIdFor(t.slug, GENAI.code));
  if (g) {
    // The cohort runs on the computed weekend sessions, not on the generic Monday start.
    const ses = genaiSessions();
    for (const sec of store.list("offering_sections", (x) => x.offeringId === g.id)) {
      if (sec.startsAt === ses[0].startUtc) continue;
      store.update("offering_sections", sec.id, { startsAt: ses[0].startUtc, endsAt: ses[ses.length - 1].endUtc, timeZone: GENAI.timeZone, registrationClosesAt: ses[2].startUtc, applicationDeadline: new Date(Date.parse(ses[0].startUtc) - 2 * 86_400_000).toISOString(), schedule: "Saturdays and Sundays 6:00–9:00 AM US Eastern (America/New_York), 16 Jan – 14 Mar 2027" });
    }
  }
  if (g?.courseId && !store.list("calendar_events", (e) => e.courseId === g.courseId).length) {
    for (const ses of genaiSessions()) store.insert("calendar_events", { courseId: g.courseId, title: `Weekend ${ses.weekend} · ${ses.day}: ${ses.session.topic}${ses.n === 1 && GENAI.freeDay1 ? " (free Day 1 class)" : ""}`, startsAt: ses.startUtc, endsAt: ses.endUtc, location: "Live online (link on the course home)", recurrence: "none" }, "ce");
  }
  // Waivers and transfer rules recorded in the consolidation table.
  for (const spec of all) {
    const from = store.get("offerings", offeringIdFor(t.slug, spec.code));
    if (!from) continue;
    for (const w of spec.waives ?? []) {
      const to = store.list("offerings", (o) => o.code === w.toCode)[0];
      if (!to) continue;
      for (const wk of w.weeks) {
        const key = moduleKeyFor(w.toCode.split(".")[0], wk);
        if (!store.list("pathway_edges", (e) => e.fromId === from.id && e.toId === to.id && e.moduleKey === key).length) store.insert("pathway_edges", { fromId: from.id, toId: to.id, kind: "waives", moduleKey: key, note: w.note }, "pe");
      }
    }
    for (const code of spec.mutuallyExclusive ?? []) {
      const other = store.list("offerings", (o) => o.code === code)[0];
      if (other && !store.list("pathway_edges", (e) => e.kind === "mutually_exclusive" && ((e.fromId === from.id && e.toId === other.id) || (e.toId === from.id && e.fromId === other.id))).length) store.insert("pathway_edges", { fromId: from.id, toId: other.id, kind: "mutually_exclusive", moduleKey: null, note: `Credit for ${spec.code} and ${code} is mutually exclusive.` }, "pe");
    }
    for (const code of spec.prerequisiteFor ?? []) {
      const to = store.list("offerings", (o) => o.code === code)[0];
      if (to && !store.list("pathway_edges", (e) => e.kind === "prerequisite" && e.fromId === from.id && e.toId === to.id).length) store.insert("pathway_edges", { fromId: from.id, toId: to.id, kind: "prerequisite", moduleKey: null, note: `${spec.code} (or advisor-confirmed equivalent) before ${code}.` }, "pe");
    }
    for (const code of spec.feeds ?? []) {
      const to = store.list("offerings", (o) => o.code === code)[0];
      if (to && !store.list("pathway_edges", (e) => e.kind === "stacks_into" && e.fromId === from.id && e.toId === to.id).length) store.insert("pathway_edges", { fromId: from.id, toId: to.id, kind: "stacks_into", moduleKey: null, note: `Recommended path: ${spec.code} → ${code}.` }, "pe");
    }
  }
  ensureAccessModel(store);
}

/* ---------------- public page model ---------------- */

export function pageRow(store: TenantStore, slugOrCode: string) {
  const row = store.list("program_pages", (p) => p.slug === slugOrCode || (p.spec as ProgramSpec)?.code === slugOrCode || p.offeringId === slugOrCode)[0];
  if (!row) throw new CampusError("not_found", "Program not found", 404);
  return row;
}

export function programPage(store: TenantStore, a: Actor | null, slugOrCode: string) {
  const row = pageRow(store, slugOrCode);
  const staff = !!a && hasAny(a, ["admin", "designer", "registrar", "advisor"]);
  if (row.state !== "published" && !staff) throw new CampusError("not_found", "Program not found", 404);
  const spec = row.spec as ProgramSpec;
  const o = store.get("offerings", row.offeringId as string)!;
  const now = nowIso();
  const cohorts = store.list("offering_sections", (s) => s.offeringId === o.id).sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt))).map((s) => ({ id: s.id, code: String(s.code), startsAt: String(s.startsAt), endsAt: String(s.endsAt ?? ""), applicationDeadline: String(s.applicationDeadline ?? s.registrationClosesAt), registrationClosesAt: String(s.registrationClosesAt), timeZone: String(s.timeZone), schedule: String(s.schedule ?? ""), seatsLeft: Math.max(0, Number(s.capacity) - Number(s.seatsTaken ?? 0)), soldOut: Number(s.capacity) - Number(s.seatsTaken ?? 0) <= 0, label: (s.label as string) ?? null }));
  const next = cohorts.find((c) => c.registrationClosesAt >= now) ?? cohorts[0] ?? null;
  const earlyBird = o.earlyBirdPrice && o.earlyBirdEndsAt && String(o.earlyBirdEndsAt) >= now ? { price: Number(o.earlyBirdPrice), endsAt: String(o.earlyBirdEndsAt) } : null;
  const price = Number(o.price);
  const inst = spec.fees.installments;
  const testimonials = store.list("program_testimonials", (x) => x.offeringId === o.id && x.state === "published" && !!x.consentRef).map((x) => ({ name: String(x.learnerName), quote: String(x.quote) }));
  const liveSchedule = spec.format === "live" ? store.list("calendar_events", (e) => e.courseId === o.courseId).sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt))).map((e) => ({ title: String(e.title), startsAt: String(e.startsAt), endsAt: String(e.endsAt) })) : [];
  const parts = (spec.parts ?? []).map((p) => {
    const po = store.get("offerings", offeringIdFor(broker.tenant(store.tenantId)!.slug, p.code));
    return { ...p, offeringId: po?.id ?? null, price: Number(po?.price ?? p.price) };
  });
  const hours = learningHours(spec);
  const tenant = broker.tenant(store.tenantId)!;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: spec.title,
    description: spec.valueStatement,
    courseCode: spec.code,
    provider: { "@type": "Organization", name: tenant.name },
    educationalCredentialAwarded: spec.credential.certificate,
    offers: { "@type": "Offer", price: earlyBird?.price ?? price, priceCurrency: o.currency ?? "USD", category: "Sandbox pricing (staging)" },
    hasCourseInstance: cohorts.map((c) => ({ "@type": "CourseInstance", courseMode: spec.format === "live" ? "online (live)" : "online", startDate: c.startsAt, endDate: c.endsAt })),
    ...(hours ? { timeRequired: `P${spec.weeks}W` } : {}),
  };
  return {
    id: row.id,
    state: String(row.state),
    offeringId: o.id,
    code: spec.code,
    slug: spec.slug,
    spec,
    facts: {
      startDate: next?.startsAt ?? null,
      duration: `${spec.weeks} weeks`,
      format: spec.formatText,
      weeklyHours: spec.hoursPerWeek ? `${spec.hoursPerWeek[0]}${spec.hoursPerWeek[1] !== spec.hoursPerWeek[0] ? `–${spec.hoursPerWeek[1]}` : ""} hours/week` : "Weekly hours confirmed before enrollment opens",
      fee: price,
      currency: String(o.currency ?? "USD"),
      lastDayToEnroll: next?.registrationClosesAt ?? null,
    },
    fees: {
      price,
      earlyBird,
      installments: { count: inst, each: Math.round((price / inst) * 100) / 100, fee: spec.fees.installmentFee, terms: `${inst} equal monthly payments of ${(price / inst).toFixed(2)} ${o.currency ?? "USD"}${spec.fees.installmentFee ? ` plus a ${spec.fees.installmentFee} ${o.currency ?? "USD"} plan fee` : ", with no plan fee"}. The first payment reserves your seat.` },
      team: `${spec.fees.teamDiscountPct}% off per seat for ${spec.fees.teamMinSeats} or more seats, invoiced to your organization.`,
      referral: `${spec.fees.referralCredit} ${o.currency ?? "USD"} credit for you and a friend who enrolls.`,
      employerLetter: true,
      sandbox: true,
    },
    cohorts,
    nextCohort: next,
    parts,
    learningHours: hours,
    ceuStatement: hours ? `Recognized as ${hours}. No CEUs are issued.` : "Learning hours are confirmed before enrollment opens. No CEUs are issued.",
    testimonials,
    showSocialProof: testimonials.length > 0,
    liveSchedule,
    trademark: TRADEMARK_NOTICE,
    contact: { advisorEmail: (row.advisorEmail as string) ?? null, advisorPhone: (row.advisorPhone as string) ?? null },
    howToApply: ["Submit your application", "Admission review (usually within 3 business days)", "Reserve your seat — pay in full or start your installment plan (sandbox)", "Orientation, then the cohort starts"],
    jsonLd,
    brochureUrl: `/api/campus/v1/t/${tenant.slug}/programs/${spec.slug}/brochure.pdf`,
    hubUrl: `/campus/${tenant.slug}/agentic-ai`,
    payLater: !!o.payLaterAllowed,
    policies: { refund: approvedPolicy(store, "refund"), deferral: approvedPolicy(store, "deferral"), batchChange: approvedPolicy(store, "batch_change") },
    paths: LEARNING_PATHS.filter((lp) => lp.steps.includes(spec.code)).map((lp) => ({ title: lp.title, steps: lp.steps.map((code) => ({ code, here: code === spec.code, slug: (store.list("program_pages", (pp) => (pp.spec as ProgramSpec)?.code === code && pp.state === "published")[0]?.slug as string) ?? null })).filter((st) => st.slug || st.here) })),
    transfers: store.list("pathway_edges", (e) => e.fromId === o.id && e.kind === "waives").reduce<Record<string, string[]>>((m, e) => {
      const to = String(store.get("offerings", String(e.toId))?.code ?? "");
      (m[to] ??= []).push(String(e.moduleKey).replace(/^p[\d_]+-w/, "Week "));
      return m;
    }, {}),
    selfPaced: spec.selfPaced
      ? {
          type: spec.selfPaced.type,
          suggestedPace: spec.selfPaced.suggestedPace,
          totalHours: spec.selfPaced.courses.reduce((t, c) => t + c.hours, 0),
          courses: spec.selfPaced.courses.map((c) => ({ code: c.code, title: c.title, hours: c.hours, modules: c.modules.map((m) => m.title), finalProject: c.finalProject, peerReviewed: !!c.peerReviewed, offeringId: store.get("offerings", offeringIdFor(tenant.slug, c.code))?.id ?? null })),
          access: { audit: !!o.auditAvailable, paid: true, subscription: !!o.inPlus },
          standardBlocks: spec.selfPaced.standardBlocks,
          related: store.list("pathway_edges", (e) => (e.fromId === o.id || e.toId === o.id) && e.kind !== "waives").map((e) => store.get("offerings", String(e.fromId === o.id ? e.toId : e.fromId))).filter((r) => r && !/^#\d+\.\d+$/.test(String(r.code))).map((r) => ({ code: String(r!.code), title: String(r!.title), slug: (store.list("program_pages", (pp) => pp.offeringId === r!.id)[0]?.slug as string) ?? null })),
        }
      : null,
  };
}

export function programIndex(store: TenantStore) {
  return store.list("program_pages", (p) => p.state === "published").map((p) => {
    const spec = p.spec as ProgramSpec;
    const o = store.get("offerings", p.offeringId as string);
    return { slug: spec.slug, code: spec.code, title: spec.title, valueStatement: spec.valueStatement, weeks: spec.weeks, format: spec.formatText, track: spec.track, selfPaced: spec.selfPaced ? spec.selfPaced.suggestedPace : null, price: Number(o?.price ?? 0), currency: String(o?.currency ?? "USD") };
  }).sort((x, y) => Number(x.code.replace(/\D/g, "")) - Number(y.code.replace(/\D/g, "")));
}

/* ---------------- brochure ---------------- */

/** WinAnsi-safe text for the standard PDF fonts. */
function ascii(s: string) {
  return s.replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/→/g, "->").replace(/·/g, "|").replace(/é/g, "e").replace(/[^\x20-\x7E]/g, "");
}

export async function brochurePdf(store: TenantStore, slugOrCode: string): Promise<Uint8Array> {
  const p = programPage(store, null, slugOrCode);
  const spec = p.spec;
  const doc = await PDFDocument.create();
  doc.setTitle(ascii(`${spec.code} ${spec.title} - Brochure`));
  doc.setAuthor("Scholaris AI Academy");
  doc.setSubject(ascii(spec.valueStatement));
  doc.setLanguage("en");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 740;
  const M = 56;
  const W = 612 - M * 2;
  const wrap = (text: string, f = font, size = 10) => {
    const words = ascii(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > W) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const write = (text: string, opts: { size?: number; bold?: boolean; gap?: number; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    for (const line of wrap(text, f, size)) {
      if (y < 60) {
        page = doc.addPage([612, 792]);
        y = 740;
      }
      page.drawText(line, { x: M, y, size, font: f, color: rgb(...(opts.color ?? [0.08, 0.1, 0.2])) });
      y -= size * 1.35;
    }
    y -= opts.gap ?? 4;
  };
  const h = (t: string) => {
    y -= 6;
    write(t, { size: 13, bold: true, color: [0.04, 0.12, 0.3] });
  };
  write("Scholaris AI Academy", { size: 10, bold: true, color: [0.72, 0.53, 0.12] });
  write(`${spec.code}  ${spec.title}`, { size: 18, bold: true, gap: 6 });
  write(spec.valueStatement, { size: 12, gap: 8 });
  write(`${p.facts.duration} | ${p.facts.weeklyHours} | ${spec.formatText}`);
  write(`Fee: ${p.fees.price} ${p.facts.currency} (sandbox price, set by the program team before go-live)${p.fees.earlyBird ? ` | Early registration: ${p.fees.earlyBird.price} ${p.facts.currency} until ${p.fees.earlyBird.endsAt.slice(0, 10)}` : ""}`);
  if (p.nextCohort) write(`Next cohort ${p.nextCohort.code}: starts ${p.nextCohort.startsAt.slice(0, 10)} | last day to enroll ${p.nextCohort.registrationClosesAt.slice(0, 10)} (${p.nextCohort.timeZone})`);
  h("Overview");
  for (const para of spec.overview) write(para);
  h("What you'll learn");
  spec.outcomes.forEach((x, i) => write(`${i + 1}. ${x}`));
  h("Who it's for");
  write(spec.audience.join("; "));
  write(`Prerequisites: ${spec.prerequisites} ${spec.codingRequirement}`);
  h("Curriculum");
  for (const w of spec.curriculum) write(`Week ${w.week}${w.optional ? " (optional)" : ""}: ${w.title} - ${w.focus}`);
  if (spec.electives?.length) write(`Optional electives (not required for completion): ${spec.electives.join("; ")}`);
  h("Projects and capstone");
  for (const pr of spec.projects) write(`${pr.name}: ${pr.description}`);
  h("Tools");
  for (const g of spec.tools) write(`${g.family}: ${g.items.join(", ")}`);
  write(p.trademark, { size: 8 });
  h("Certificate");
  write(`${spec.credential.certificate}. ${spec.credential.badge}. ${p.ceuStatement} ${spec.creditStatement}`);
  h("Fees and financing");
  write(p.fees.installments.terms);
  write(p.fees.team);
  write(p.fees.referral);
  write(spec.fundingStatement);
  h("How to apply");
  p.howToApply.forEach((s, i) => write(`${i + 1}. ${s}`));
  h("Faculty");
  for (const f of spec.faculty) {
    const approved = facultyByName(f.name);
    const bytes = approved ? facultyImageBytes(approved) : null;
    if (approved && bytes) {
      // The approved original photograph at its own proportions (never stretched or upscaled).
      const img = await doc.embedPng(bytes);
      const d = fitSize(approved.photo, 64, 75);
      if (y - d.height < 60) {
        page = doc.addPage([612, 792]);
        y = 740;
      }
      page.drawImage(img, { x: M, y: y - d.height + 10, width: d.width, height: d.height });
      page.drawText(ascii(approved.name), { x: M + d.width + 12, y: y - 4, size: 11, font: bold, color: rgb(0.08, 0.1, 0.2) });
      page.drawText(ascii(`${approved.role}, ${approved.org}`), { x: M + d.width + 12, y: y - 20, size: 10, font, color: rgb(0.29, 0.34, 0.45) });
      y -= d.height + 8;
    } else write(`${f.name}, ${f.role}`);
  }
  write("All payments on this staging site are sandbox only. Fees, dates and seats are read from the Scholaris catalog when this brochure is generated.", { size: 8 });
  metrics.inc("program_brochures_total", { program: spec.code });
  return doc.save();
}

/* ---------------- inquiries, self-check, apply ---------------- */

const INQUIRY_WINDOW = new Map<string, number[]>();

export function submitInquiry(store: TenantStore, a: Actor | null, input: { offeringId: string; kind: "team" | "advisor"; name: string; email: string; organization?: string; seats?: number; preferredTime?: string; timeZone?: string; message?: string }) {
  // "catalog" = a corporate-training inquiry from the catalog hub, not tied to one program.
  const o = input.offeringId === "catalog" ? ({ id: "catalog", code: "Catalog" } as unknown as Row) : store.get("offerings", input.offeringId);
  if (!o || (o.id !== "catalog" && o.state !== "published")) throw new CampusError("not_found", "Program not found", 404);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CampusError("invalid", "Enter a valid email address.", 422, { field: "email" });
  const name = String(input.name ?? "").trim();
  if (!name) throw new CampusError("invalid", "Enter your name.", 422, { field: "name" });
  if (!["team", "advisor"].includes(input.kind)) throw new CampusError("invalid", "Choose team enrollment or an advisor call.", 422);
  if (input.kind === "team" && !(Number(input.seats) >= 2)) throw new CampusError("invalid", "Team enrollment is for 2 or more seats.", 422, { field: "seats" });
  const key = `${store.tenantId}:${email}`;
  const recent = (INQUIRY_WINDOW.get(key) ?? []).filter((t) => t > nowMs() - 3600_000);
  if (recent.length >= 5) throw new CampusError("rate_limited", "Too many requests from this email. Try again later.", 429);
  INQUIRY_WINDOW.set(key, [...recent, nowMs()]);
  return store.tx(() => {
    const row = store.insert("program_inquiries", { offeringId: o.id, kind: input.kind, name: name.slice(0, 120), email, organization: input.organization?.slice(0, 160) ?? null, seats: input.kind === "team" ? Number(input.seats) : null, preferredTime: input.preferredTime?.slice(0, 120) ?? null, timeZone: input.timeZone?.slice(0, 60) ?? null, message: input.message?.slice(0, 2000) ?? null, state: "new" }, "pin");
    const advisors = store.list("users", (u) => ((u.roles as string[]) ?? []).includes("advisor")).map((u) => u.id);
    notify(store, advisors, "admissions", input.kind === "team" ? `Team enrollment inquiry: ${o.code}` : `Advisor call request: ${o.code}`, `${name} (${input.organization ?? "individual"}) — ${input.kind === "team" ? `${input.seats} seats` : `prefers ${input.preferredTime ?? "any time"}`}`, `/campus/{tenant}/t/program-studio`);
    store.emit("programs.inquiry", `program_inquiries/${row.id}`, { id: row.id, offeringId: o.id, kind: input.kind });
    if (a) audit(store, a, "programs.inquire", `program_inquiries/${row.id}`, input.kind);
    return { id: row.id, received: true, message: input.kind === "team" ? "Thanks — a program advisor will contact you about team enrollment within 2 business days." : "Thanks — an advisor will email you to confirm a time." };
  });
}

export function selfCheckQuestions(store: TenantStore, offeringId: string) {
  const spec = pageRow(store, offeringId).spec as ProgramSpec;
  if (!spec.selfCheck) throw new CampusError("not_found", "This program has no prerequisite self-check.", 404);
  return spec.selfCheck.questions.map(({ id, prompt, options }) => ({ id, prompt, options }));
}

export function selfCheck(store: TenantStore, a: Actor | null, offeringId: string, answers: Record<string, string>) {
  const row = pageRow(store, offeringId);
  const spec = row.spec as ProgramSpec;
  if (!spec.selfCheck) throw new CampusError("not_found", "This program has no prerequisite self-check.", 404);
  const sc = spec.selfCheck;
  const score = sc.questions.filter((q) => String(answers[q.id] ?? "") === q.answer).length;
  const band = spec.selfCheckBands?.find((b) => score >= b.min);
  const passed = band ? band.route.includes(spec.code) : score >= sc.passMin;
  const routeTo = band ? band.route.filter((c) => c !== spec.code) : passed ? [] : sc.routeTo;
  const available = routeTo.map((code) => store.list("offerings", (o) => o.code === code && o.state === "published")[0]).filter(Boolean) as Row[];
  const route = available.map((o) => ({ code: String(o.code), title: String(o.title), offeringId: o.id, slug: (store.list("program_pages", (p) => p.offeringId === o.id)[0]?.slug as string) ?? null }));
  const message = band
    ? `You scored ${score}/${sc.questions.length}. ${band.message}`
    : passed
      ? `You're ready for ${spec.code}. You scored ${score}/${sc.questions.length}.`
      : `You scored ${score}/${sc.questions.length}; ${sc.passMin} is needed. We recommend starting with ${routeTo.join(" or ")}${available.length < routeTo.length ? " — an advisor will help you choose, since not every recommended program is open in this catalog yet" : ""}.`;
  const row2 = store.tx(() => store.insert("selfcheck_attempts", { offeringId: row.offeringId, userId: a?.id ?? null, score, of: sc.questions.length, passed, routeTo, message }, "psc"));
  return { id: row2.id, score, of: sc.questions.length, passed, routeTo, available: route, message };
}

export function applyToProgram(store: TenantStore, a: Actor, input: { offeringId: string; sectionId?: string; statement: string; experience?: string }) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "Apply as yourself.", 403);
  const o = store.get("offerings", input.offeringId);
  if (!o || o.state !== "published" || !o.requiresApplication) throw new CampusError("not_found", "This program doesn't take applications.", 404);
  const statement = String(input.statement ?? "").trim();
  if (statement.length < 40) throw new CampusError("invalid", "Tell us a little more in your statement (at least 40 characters).", 422, { field: "statement" });
  if (o.selfCheckRequired && !store.list("selfcheck_attempts", (s) => s.offeringId === o.id && s.userId === a.id && !!s.passed).length) throw new CampusError("selfcheck_required", "Complete the prerequisite self-check on the program page first.", 409);
  const open = store.list("applications", (x) => x.offeringId === o.id && x.userId === a.id && !["denied", "withdrawn"].includes(String(x.state)))[0];
  if (open) throw new CampusError("conflict", "You already have an application for this program.", 409, { applicationId: open.id });
  const sec = input.sectionId ? store.get("offering_sections", input.sectionId) : store.list("offering_sections", (s) => s.offeringId === o.id && String(s.registrationClosesAt) >= nowIso())[0];
  return store.tx(() => {
    const me = store.get("users", a.id)!;
    const applicant = store.list("applicants", (x) => x.userId === a.id)[0] ?? store.insert("applicants", { name: me.name, email: me.email, program: `${o.code} ${o.title}`, userId: a.id }, "apl");
    const app = store.insert("applications", { applicantId: applicant.id, userId: a.id, program: `${o.code} ${o.title}`, termId: null, offeringId: o.id, sectionId: sec?.id ?? null, statement: `${statement}${input.experience ? `\n\nExperience: ${input.experience}` : ""}`.slice(0, 5000), requiredDocs: ["statement"], state: "submitted", checklist: null }, "app");
    store.insert("admission_documents", { applicationId: app.id, kind: "statement", fileId: null, received: true, verified: false }, "doc");
    store.emit("applications.submitted", `applications/${app.id}`, { id: app.id, offeringId: o.id });
    const reviewers = store.list("users", (u) => ((u.roles as string[]) ?? []).some((r) => r === "registrar" || r === "advisor")).map((u) => u.id);
    notify(store, reviewers, "admissions", `New application: ${o.code} ${o.title}`, "Review it in Admissions.", `/campus/{tenant}/t/admissions`);
    audit(store, a, "programs.apply", `applications/${app.id}`, String(o.code));
    return { application: app, next: "Admission review usually takes up to 3 business days. You'll get a notification with the decision and a link to reserve your seat." };
  });
}

/** Reviewer decision for a program application: verifies the statement, then records the decision. */
export function reviewProgramApplication(store: TenantStore, a: Actor, applicationId: string, outcome: "admit" | "deny" | "waitlist", note?: string) {
  requireTenant(store, a, ["admin", "registrar"], "programs.review");
  const app = store.get("applications", applicationId);
  if (!app?.offeringId) throw new CampusError("not_found", "Program application not found", 404);
  store.tx(() => {
    for (const d of store.list("admission_documents", (x) => x.applicationId === applicationId && x.kind === "statement")) store.update("admission_documents", d.id, { verified: true });
  });
  const dec = decideApplication(store, a, applicationId, outcome, note);
  if (outcome === "admit") {
    const o = store.get("offerings", app.offeringId as string)!;
    const page = store.list("program_pages", (p) => p.offeringId === o.id)[0];
    notify(store, [String(app.userId)], "admissions", `Reserve your seat: ${o.code} ${o.title}`, "You've been admitted. Reserve your seat by paying in full or starting your installment plan (sandbox).", `/campus/{tenant}/programs/${(page?.spec as ProgramSpec | undefined)?.slug ?? ""}#fees`);
  }
  return dec;
}

/** Commerce guard used by checkout: admission, self-check and the late-enrollment window. */
export function programCheckoutGuard(store: TenantStore, userId: string, o: Row, sectionId?: string | null) {
  if (o.requiresApplication && !store.list("applications", (x) => x.offeringId === o.id && x.userId === userId && x.state === "admitted").length) throw new CampusError("application_required", "Apply and be admitted before reserving a seat.", 409);
  if (o.selfCheckRequired && !store.list("selfcheck_attempts", (s) => s.offeringId === o.id && s.userId === userId && !!s.passed).length) throw new CampusError("selfcheck_required", "Complete the prerequisite self-check first.", 409);
  const sec = sectionId ? store.get("offering_sections", sectionId) : null;
  if (sec && o.lateEnrollmentDays !== undefined && o.lateEnrollmentDays !== null && toMs(String(sec.startsAt)) + Number(o.lateEnrollmentDays) * DAY < nowMs()) throw new CampusError("closed", "Late enrollment for this cohort has ended.", 423);
}
const toMs = (s: string) => new Date(s).getTime();

/** After enrollment: extra blocks, and automatic Week 1 lab extensions for late joiners. */
export function onProgramEnrollment(store: TenantStore, userId: string, o: Row, sectionId: string | null) {
  clearAudit(store, userId, o);
  for (const cid of (o.blockCourseIds as string[] | undefined) ?? []) {
    if (!store.list("enrollments", (e) => e.userId === userId && e.courseId === cid && e.role === "student" && e.state === "active").length) store.insert("enrollments", { userId, courseId: cid, role: "student", state: "active", source: "purchase" }, "enr");
  }
  // Pathways: enroll in each included program too, so each issues its own certificate on completion.
  for (const incId of (o.pathwayIncludes as string[] | undefined) ?? []) {
    if (!store.list("offering_enrollments", (e) => e.userId === userId && e.offeringId === incId && ["active", "completed"].includes(String(e.state))).length) store.insert("offering_enrollments", { userId, offeringId: incId, sectionId: null, source: "pathway", state: "active", orderId: null, waivedModules: [], completedAt: null, credentialId: null, viaOfferingId: o.id }, "oen");
  }
  const sec = sectionId ? store.get("offering_sections", sectionId) : null;
  if (!sec || !o.courseId) return;
  const startMs = toMs(String(sec.startsAt));
  if (nowMs() <= startMs) return;
  const late = nowMs() - startMs;
  const wk1 = store.list("modules", (m) => m.courseId === o.courseId && /^Week 1:/.test(String(m.title)))[0];
  if (!wk1) return;
  for (const asg of store.list("assignments", (x) => x.moduleId === wk1.id && /^Lab |In-Class Activity/.test(String(x.title)) && !!x.dueAt)) {
    store.insert("assignment_overrides", { courseId: o.courseId, assignmentId: asg.id, target: "student", targetId: userId, dueAt: new Date(toMs(String(asg.dueAt)) + late).toISOString() }, "ao");
  }
}

/** Pass/no-pass completion rules (#26). Returns null when the program is graded normally. */
export function passNoPassChecks(store: TenantStore, userId: string, o: Row) {
  const page = store.list("program_pages", (p) => p.offeringId === o.id)[0];
  const spec = page?.spec as ProgramSpec | undefined;
  if (spec?.completion === "weekend_intensive") return weekendChecks(store, userId, o);
  if (!spec || spec.grading !== "pass_no_pass") return null;
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const grade = (asgId: string) => store.list("grades", (g) => g.assignmentId === asgId && g.userId === userId && !!g.posted)[0];
  const labs = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Lab \d+[AB]:/.test(String(x.title)) && x.state === "published");
  const labsMet = labs.filter((l) => {
    const g = grade(l.id);
    return g && Number(g.score) >= 0.7 * Number(l.points);
  }).length;
  const quizzes = store.list("quizzes", (q) => courseIds.includes(q.courseId as string) && q.state === "published" && (q.kind ?? "graded") === "graded");
  const quizzesMet = quizzes.filter((q) => {
    const best = store.list("attempts", (x) => x.quizId === q.id && x.userId === userId && x.state === "graded").reduce((m, x) => Math.max(m, Number(x.score ?? 0)), -1);
    return best >= 0 && best >= 0.7 * Number(q.points ?? 0);
  }).length;
  const cap = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Capstone:/.test(String(x.title)))[0];
  const capG = cap ? grade(cap.id) : undefined;
  const pres = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Final presentation/.test(String(x.title)))[0];
  const presG = pres ? grade(pres.id) : undefined;
  return [
    { requirement: `All ${labs.length} labs submitted with checkpoints met`, ok: labs.length > 0 && labsMet === labs.length, detail: `${labsMet}/${labs.length}` },
    { requirement: "Every weekly quiz at 70% or above", ok: quizzes.length > 0 && quizzesMet === quizzes.length, detail: `${quizzesMet}/${quizzes.length}` },
    { requirement: "Capstone meets the rubric pass threshold (70%)", ok: !!capG && !!cap && Number(capG.score) >= 0.7 * Number(cap.points), detail: capG ? `${capG.score}/${cap?.points}` : "not graded" },
    { requirement: "Final presentation delivered", ok: !!presG && Number(presG.score) > 0, detail: presG ? "delivered" : "not yet" },
  ];
}

/** #15 completion: 20 session labs (attended, or recording reviewed with the lab submitted), weekend checks ≥ 70%, capstone ≥ 70/100 with a live defense, final knowledge check passed. */
function weekendChecks(store: TenantStore, userId: string, o: Row) {
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const grade = (asgId: string) => store.list("grades", (g) => g.assignmentId === asgId && g.userId === userId && !!g.posted)[0];
  const labs = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Session lab /.test(String(x.title)));
  const attended = labs.filter((l) => store.list("submissions", (sub) => sub.assignmentId === l.id && sub.userId === userId).length || store.list("attendance", (at) => at.userId === userId && at.refId === l.id).length).length;
  const best = (q: Row) => store.list("attempts", (x) => x.quizId === q.id && x.userId === userId && x.state === "graded").reduce((m, x) => Math.max(m, Number(x.score ?? 0)), -1);
  const checks = store.list("quizzes", (q) => courseIds.includes(q.courseId as string) && q.state === "published" && /^Weekend \d+ check/.test(String(q.title)));
  const checksMet = checks.filter((q) => best(q) >= 0.7 * Number(q.points ?? 0)).length;
  const cap = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Capstone:/.test(String(x.title)))[0];
  const capG = cap ? grade(cap.id) : undefined;
  const def = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /^Capstone live demo defense/.test(String(x.title)))[0];
  const defG = def ? grade(def.id) : undefined;
  const fin = store.list("quizzes", (q) => courseIds.includes(q.courseId as string) && q.title === "Final knowledge check")[0];
  const finBest = fin ? best(fin) : -1;
  return [
    { requirement: `All ${labs.length} live modules attended (or recording reviewed with the lab submitted)`, ok: labs.length > 0 && attended === labs.length, detail: `${attended}/${labs.length}` },
    { requirement: "All module assessments passed (70%)", ok: checks.length > 0 && checksMet === checks.length, detail: `${checksMet}/${checks.length}` },
    { requirement: "Capstone at least 70/100 on the mentor rubric", ok: !!capG && Number(capG.score) >= 70, detail: capG ? `${capG.score}/100` : "not graded" },
    { requirement: "Live demo defense delivered", ok: !!defG && Number(defG.score) > 0, detail: defG ? "delivered" : "not yet" },
    { requirement: "Final knowledge check passed (2 attempts)", ok: !!fin && finBest >= 0.7 * Number(fin.points ?? 10), detail: finBest >= 0 ? `${finBest}/${fin?.points}` : "not taken" },
  ];
}

/** After completion: the Graded Performance Certificate (shows the final grade) where the program offers one. */
export function afterProgramCompletion(store: TenantStore, userId: string, o: Row) {
  const spec = store.list("program_pages", (p) => p.offeringId === o.id)[0]?.spec as ProgramSpec | undefined;
  if (!spec?.gradedPerformance) return null;
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const pct = courseIds.map((c) => computeTotals(store, c, userId).finalPct).filter((p): p is number => p !== null);
  const final = pct.length ? Math.round((pct.reduce((s, p) => s + p, 0) / pct.length) * 10) / 10 : null;
  const tpl = store.list("credential_templates", (t) => t.kind === "graded_performance" && String(t.name).endsWith(spec.title))[0];
  return issueCredential(store, null, { userId, courseId: o.courseId as string, title: `Graded Performance Certificate — ${spec.title}`, kind: "certificate", templateId: tpl?.id, achievementType: "Certificate", evidence: [{ name: final === null ? "Final grade recorded by faculty" : `Final grade ${final}%` }] });
}

/* ---------------- audit access, policies, batch changes ---------------- */

/** Free audit of a self-paced offering: content visible, graded items locked. */
export function enrollAudit(store: TenantStore, a: Actor, offeringId: string) {
  const o = store.get("offerings", offeringId);
  if (!o || o.state !== "published" || !o.auditAvailable) throw new CampusError("audit_unavailable", "Free audit isn't offered for this product.", 409);
  return store.tx(() => {
    const ids = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])].filter(Boolean);
    for (const cid of ids) if (!store.list("enrollments", (e) => e.userId === a.id && e.courseId === cid && e.role === "student" && e.state === "active").length) store.insert("enrollments", { userId: a.id, courseId: cid, role: "student", state: "active", source: "audit", audit: true }, "enr");
    const enr = store.insert("offering_enrollments", { userId: a.id, offeringId: o.id, sectionId: null, source: "audit", state: "active", orderId: null, waivedModules: [], completedAt: null, credentialId: null }, "oen");
    audit(store, a, "commerce.audit", `offerings/${o.id}`);
    return { enrollment: enr, note: "Auditing: content is open; graded quizzes, assignments and the credential unlock when you buy or subscribe (sandbox)." };
  });
}

/** Upgrading from audit (purchase or subscription) unlocks graded work. */
export function clearAudit(store: TenantStore, userId: string, o: Row) {
  for (const cid of [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])].filter(Boolean)) for (const e of store.list("enrollments", (x) => x.userId === userId && x.courseId === cid && !!x.audit)) store.update("enrollments", e.id, { audit: false, source: "purchase" });
}

export const DEFAULT_POLICIES = [
  { kind: "refund", text: "Full refund if you ask within 14 days of your cohort or batch start and have completed less than 20% of the graded work. Self-paced products: full refund within 14 days of purchase if you haven't earned the credential. Refunds return to the original sandbox payment method.", windowDays: 14, feeAmount: 0, processingDays: 5 },
  { kind: "deferral", text: "You can defer once to a later cohort or batch if you ask at least 7 days before your start date. Deferral is free; your payment carries over.", windowDays: 7, feeAmount: 0, processingDays: 3 },
  { kind: "batch_change", text: "You can move to another batch of the same program once, up to 3 days before your current batch starts, if the new batch has seats. Later changes are reviewed case by case.", windowDays: 3, feeAmount: 0, processingDays: 2 },
];

export function ensurePolicies(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  for (const p of DEFAULT_POLICIES) if (!store.list("catalog_policies", (x) => x.kind === p.kind).length) store.insert("catalog_policies", { ...p, escalationContact: `support@${t.slug}.scholarion.test`, approvedBy: null, approvedAt: null, state: "draft" }, "cpol");
  // Product-owner decision: the policy text as written is approved. A policy an admin later sends back to draft
  // (revisedAfterDecision) needs a fresh approval in Tab 52.
  const approver = store.get("users", `usr_${t.slug}_admin`)?.id ?? null;
  const decided: readonly string[] = DECISIONS.policies.approved;
  for (const p of store.list("catalog_policies", (x) => decided.includes(String(x.kind)) && !x.approvedAt && !x.revisedAfterDecision)) {
    store.update("catalog_policies", p.id, { state: "published", approvedAt: decisionIso(DECISIONS.policies.decidedOn), approvedBy: approver, approvalNote: DECIDED_BY });
  }
}

/** Self-paced access model decision applied to every self-paced offering with a course. */
export function ensureAccessModel(store: TenantStore) {
  const models: readonly string[] = DECISIONS.accessModel.models;
  for (const o of store.list("offerings", (x) => !!x.selfPaced && !!x.courseId)) {
    const want = { auditAvailable: models.includes("audit"), inPlus: models.includes("subscription") };
    if (o.auditAvailable !== want.auditAvailable || o.inPlus !== want.inPlus) store.update("offerings", o.id, want);
  }
}

/** Policies show to learners only after the product owner (an admin) approves them. */
export function approvedPolicy(store: TenantStore, kind: "refund" | "deferral" | "batch_change") {
  const p = store.list("catalog_policies", (x) => x.kind === kind && x.state === "published" && !!x.approvedAt)[0];
  return p ? { kind, text: String(p.text), windowDays: Number(p.windowDays ?? 0), feeAmount: Number(p.feeAmount ?? 0), processingDays: Number(p.processingDays ?? 0), escalationContact: String(p.escalationContact ?? ""), approvedAt: String(p.approvedAt) } : null;
}

/** Product owner: send an approved policy back to draft for revision; it disappears from learner pages until re-approved. */
export function reopenPolicy(store: TenantStore, a: Actor, policyId: string, reason: string) {
  requireTenant(store, a, ["admin"], "policies.reopen");
  const p = store.get("catalog_policies", policyId);
  if (!p) throw new CampusError("not_found", "Policy not found", 404);
  if (!String(reason ?? "").trim()) throw new CampusError("invalid", "Say why the policy is going back to draft.", 422, { field: "reason" });
  return store.tx(() => {
    const row = store.update("catalog_policies", policyId, { state: "draft", approvedAt: null, approvedBy: null, revisedAfterDecision: true, approvalNote: `Sent back: ${String(reason).slice(0, 300)}` });
    audit(store, a, "policies.reopen", `catalog_policies/${policyId}`, String(p.kind));
    return row;
  });
}

export function approvePolicy(store: TenantStore, a: Actor, policyId: string) {
  requireTenant(store, a, ["admin"], "policies.approve");
  const p = store.get("catalog_policies", policyId);
  if (!p) throw new CampusError("not_found", "Policy not found", 404);
  const issues = copyCheck(store, String(p.text));
  if (issues.length) throw new CampusError("copy_check", `Copy check: ${issues.map((i) => i.label).join(", ")}.`, 422);
  return store.tx(() => {
    const row = store.update("catalog_policies", policyId, { approvedBy: a.id, approvedAt: nowIso(), state: "published" });
    audit(store, a, "policies.approve", `catalog_policies/${policyId}`, String(p.kind));
    return row;
  });
}

/** Move a seat to another batch of the same program under the approved batch-change policy. */
export function requestBatchChange(store: TenantStore, a: Actor, orderId: string, newSectionId: string) {
  const policy = approvedPolicy(store, "batch_change");
  if (!policy) throw new CampusError("policy_pending", "Batch changes open once the batch-change policy is approved. Contact support in the meantime.", 409);
  const order = store.get("orders", orderId);
  if (!order || order.userId !== a.id) throw new CampusError("not_found", "Order not found", 404);
  const from = order.sectionId ? store.get("offering_sections", String(order.sectionId)) : undefined;
  const to = store.get("offering_sections", newSectionId);
  if (!from || !to || to.offeringId !== order.offeringId || to.id === from.id) throw new CampusError("invalid", "Choose another batch of the same program.", 422);
  if (new Date(String(from.startsAt)).getTime() - nowMs() < policy.windowDays * DAY) throw new CampusError("window_closed", `Batch changes close ${policy.windowDays} days before your batch starts. Contact ${policy.escalationContact}.`, 423);
  if (Number(to.capacity) - Number(to.seatsTaken ?? 0) <= 0) throw new CampusError("sold_out", "That batch is sold out.", 409);
  if (store.list("orders", (x) => x.userId === a.id && x.offeringId === order.offeringId && !!x.batchChangedFrom).length) throw new CampusError("limit", "You've already changed batch once for this program.", 409);
  return store.tx(() => {
    store.update("offering_sections", from.id, { seatsTaken: Math.max(0, Number(from.seatsTaken ?? 0) - 1) });
    store.update("offering_sections", to.id, { seatsTaken: Number(to.seatsTaken ?? 0) + 1 });
    const row = store.update("orders", orderId, { sectionId: to.id, batchChangedFrom: from.id });
    for (const e of store.list("offering_enrollments", (x) => x.orderId === orderId)) store.update("offering_enrollments", e.id, { sectionId: to.id });
    audit(store, a, "commerce.batch_change", `orders/${orderId}`, `${from.code} → ${to.code}`);
    return { order: row, from: from.code, to: to.code, processingDays: policy.processingDays, fee: policy.feeAmount };
  });
}

/* ---------------- bundle badge (#13) ---------------- */

registerConsumer({
  name: "bundle-badge",
  types: ["offering_enrollments.completed"],
  handle(store, e) {
    const userId = String(e.data.userId);
    const o = store.get("offerings", String(e.data.offeringId));
    if (!o) return;
    // Parents this offering stacks into: bundles (#13), specializations and professional certificates.
    const parents = store.list("pathway_edges", (x) => x.kind === "stacks_into" && x.fromId === o.id).map((x) => store.get("offerings", String(x.toId))).filter((p) => p && ["bundle", "specialization", "professional_certificate"].includes(String(p.productType))) as Row[];
    for (const parent of parents) {
      const parts = store.list("pathway_edges", (x) => x.kind === "stacks_into" && x.toId === parent.id).map((x) => String(x.fromId));
      const done = parts.every((pid) => store.list("offering_enrollments", (x) => x.offeringId === pid && x.userId === userId && x.state === "completed").length);
      if (!done) continue;
      const spec = store.list("program_pages", (p) => p.offeringId === parent.id)[0]?.spec as ProgramSpec | undefined;
      if (!spec) continue;
      const titles = parent.productType === "bundle" ? [spec.credential.badge] : [spec.credential.certificate, spec.credential.badge];
      for (const title of titles) {
        if (store.list("credentials", (c) => c.userId === userId && c.title === title).length) continue;
        issueCredential(store, null, { userId, courseId: o.courseId as string, title, kind: /badge/i.test(title) ? "badge" : "certificate", achievementType: /badge/i.test(title) ? "Badge" : "Certificate", evidence: parts.map((pid) => ({ name: `Completed ${store.get("offerings", pid)?.code} ${store.get("offerings", pid)?.title}` })) });
      }
      for (const pe of store.list("offering_enrollments", (x) => x.offeringId === parent.id && x.userId === userId && x.state === "active")) store.update("offering_enrollments", pe.id, { state: "completed", completedAt: nowIso() });
    }
  },
});

/* ---------------- quality gate, shell publishing, status ---------------- */

export function qualityGate(store: TenantStore, offeringId: string) {
  const row = pageRow(store, offeringId);
  const spec = row.spec as ProgramSpec;
  const o = store.get("offerings", row.offeringId as string)!;
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const pages = store.list("pages", (p) => courseIds.includes(p.courseId as string));
  const copy = copyCheck(store, programCopy(spec));
  const common = [
    { gate: "Outcomes are 5–6 measurable competencies", ok: spec.outcomes.length >= 5 && spec.outcomes.length <= 6, detail: `${spec.outcomes.length}` },
    { gate: "Honest-claims copy check", ok: copy.length === 0, detail: copy.map((c) => c.label).join(", ") || "clean" },
    { gate: "Datasets are synthetic with data cards", ok: spec.dataCards.length > 0 && spec.dataCards.every((d) => /scholaris|fictional|synthetic/i.test(`${d.source} ${d.name}`)), detail: `${spec.dataCards.length} data cards` },
    { gate: "Pages pass the accessibility structure check (headings first)", ok: pages.every((p) => ((p.blocks as Block[]) ?? [])[0]?.type === "heading"), detail: `${pages.length} pages` },
  ];
  if (spec.selfPaced) {
    const sp = spec.selfPaced;
    const missing: string[] = [];
    let finals = 0;
    for (const c of sp.courses) {
      const cid = c.courseId ?? courseIdFor(broker.tenant(store.tenantId)!.slug, c.code, "A", true);
      if (c.courseId) {
        finals++; // adopted legacy course: its own structure is kept
        continue;
      }
      const mods = store.list("modules", (m) => m.courseId === cid);
      if (mods.length < c.modules.length) missing.push(`${c.code} (${mods.length}/${c.modules.length} modules)`);
      if (store.list("assignments", (a) => a.courseId === cid && /^Final project:/.test(String(a.title)) && !!a.rubricId).length) finals++;
    }
    return [
      { gate: "Every course has its modules (overview, lab, quiz)", ok: missing.length === 0, detail: missing.length ? missing.join("; ") : `${sp.courses.length} courses` },
      { gate: "Every course has a final project with a rubric", ok: finals === sp.courses.length, detail: `${finals}/${sp.courses.length}` },
      ...common,
    ];
  }
  const mods = store.list("modules", (m) => courseIds.includes(m.courseId as string) && !String(m.moduleKey).endsWith("-wres"));
  const missingWeeks = spec.curriculum.filter((w) => !mods.some((m) => m.moduleKey === moduleKeyFor(spec.code, w.week))).map((w) => w.week);
  const caps = spec.projects.filter((p) => p.kind === "capstone");
  const capsWithRubric = caps.filter((p) => store.list("assignments", (x) => courseIds.includes(x.courseId as string) && String(x.title).endsWith(p.name) && !!x.rubricId).length);
  return [
    { gate: "Every week has a module, overview page and activity", ok: missingWeeks.length === 0, detail: missingWeeks.length ? `Missing weeks: ${missingWeeks.join(", ")}` : `${spec.curriculum.length} ${spec.curriculum.some((w) => w.sessions) ? "weekends" : "weeks"}` },
    { gate: "Capstone has a rubric", ok: capsWithRubric.length === caps.length, detail: `${capsWithRubric.length}/${caps.length}` },
    ...common,
  ];
}

export function publishProgramShells(store: TenantStore, a: Actor, offeringId: string) {
  requireTenant(store, a, ["admin", "designer"], "programs.publish_shells");
  const gate = qualityGate(store, offeringId);
  const failed = gate.filter((g) => !g.ok);
  if (failed.length) throw new CampusError("quality_gate", `Quality gate failed: ${failed.map((f) => `${f.gate} (${f.detail})`).join("; ")}`, 409, { gate });
  const o = store.get("offerings", pageRow(store, offeringId).offeringId as string)!;
  const ids = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  store.tx(() => {
    for (const id of ids) store.update("courses", id, { state: "published", publishedAt: nowIso() });
    audit(store, a, "programs.publish_shells", `offerings/${o.id}`, ids.join(","));
  });
  return { published: ids, gate };
}

type Status = "complete" | "drafted" | "needs SME review" | "blocked" | "not started";

/** Design-package status per deliverable, computed from what is actually loaded. */
export function programStatus(store: TenantStore, offeringId: string) {
  const row = pageRow(store, offeringId);
  const spec = row.spec as ProgramSpec;
  const o = store.get("offerings", row.offeringId as string)!;
  const ids = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const asg = store.list("assignments", (x) => ids.includes(x.courseId as string));
  const quizzes = store.list("quizzes", (q) => ids.includes(q.courseId as string) && q.state === "published");
  const gate = qualityGate(store, row.offeringId as string);
  const sp = spec.selfPaced;
  const allModulesBuilt = !!sp && sp.courses.every((c) => !!c.courseId || c.modules.every((m) => m.lab && m.quiz?.length));
  const weekendChecks = spec.completion === "weekend_intensive" && quizzes.length >= 10;
  const items: { deliverable: string; status: Status; note: string }[] = [
    { deliverable: "Catalog entry and website page", status: o.state === "published" && row.state === "published" ? "complete" : "drafted", note: "Fees, dates and seats read from the catalog." },
    { deliverable: "Outcomes map and week-by-week curriculum", status: "needs SME review", note: `${spec.outcomes.length} outcomes, ${spec.curriculum.length} ${sp ? "modules" : spec.curriculum.some((w) => w.sessions) ? "weekends" : "weeks"}; outcome-to-module alignment needs SME confirmation.` },
    { deliverable: "Course shells in Scholaris", status: gate.every((g) => g.ok) ? "complete" : "drafted", note: `${ids.length} course(s) loaded${sp && allModulesBuilt ? " and published" : " unpublished; publish after the quality gate"}.` },
    { deliverable: "In-class activities (student and instructor editions)", status: "drafted", note: sp ? "Licensed-cohort activity editions follow the Academy template; the self-paced edition uses autograded deliverables." : `${asg.filter((x) => /In-Class Activity/.test(String(x.title))).length} activity shells in the Academy template; editions pending authoring.` },
    { deliverable: "Starter TODO and EXECUTED notebooks", status: allModulesBuilt ? "needs SME review" : "blocked", note: allModulesBuilt ? "Starter code and executed solutions exist for every lab; autograder tests verified (solutions pass, starters fail)." : "Built after tool versions are verified and pinned in the Cloud Lab (PyTorch and TensorFlow versions where applicable)." },
    { deliverable: "Synthetic datasets with data cards", status: "drafted", note: `${spec.dataCards.length} data card(s) written; datasets generated at build.` },
    { deliverable: "Quizzes, assignments, projects and capstone with rubrics", status: allModulesBuilt || weekendChecks || (spec.code === "#26" && quizzes.length >= 6) ? "needs SME review" : "drafted", note: `${quizzes.length} published quiz(zes); ${asg.filter((x) => /^(Project|Midterm project|Capstone|Final project)/.test(String(x.title))).length} projects/final projects with rubrics.` },
    { deliverable: "Slides, video scripts and instructor guide (with textbook chapter maps)", status: "not started", note: spec.textbooks?.length ? `Chapter maps due for: ${spec.textbooks.join("; ")}.` : "Authored after SME review of the curriculum." },
    { deliverable: "Credential and badge definitions", status: store.get("credential_templates", o.credentialTemplateId as string) ? "complete" : "drafted", note: `${spec.credential.certificate}; ${spec.credential.badge}${spec.gradedPerformance ? "; Graded Performance Certificate" : ""}.` },
    { deliverable: "Brochure", status: "complete", note: "Generated as PDF from the same content." },
    { deliverable: "Quality-gate results", status: gate.every((g) => g.ok) ? "complete" : "blocked", note: gate.filter((g) => !g.ok).map((g) => g.gate).join("; ") || "All gates pass." },
  ];
  if (isDesignProgram(spec.code)) {
    const d = designFor(spec);
    const set = (name: string, status: Status, note: string) => {
      const it = items.find((i) => i.deliverable.startsWith(name));
      if (it) Object.assign(it, { status, note });
    };
    set("Outcomes map", "needs SME review", `${d.outcomes.length} competencies with Bloom levels; alignment matrix across ${d.assessments.length} assessments; ${d.issues.length} item(s) flagged for review.`);
    set("In-class activities", "needs SME review", `${d.weeks.filter((w) => !w.kind && !w.optional).length} activities with student and instructor editions in the Academy template (AI DRAFT); instructor editions are unpublished pages.`);
    set("Starter TODO", d.notebooks ? "needs SME review" : "drafted", d.notebooks ? "Starter and solution notebooks (plus 2 mini labs per module) generated in the design package; execute in the Cloud Lab before release." : "No-code track: tool walkthroughs and reference builds generated; screenshots captured after tool pinning.");
    set("Synthetic datasets", "complete", `${d.datasets.length} dataset(s) generated from a fixed seed, each with source, license, fields, intended use and known biases.`);
    set("Quizzes, assignments", "drafted", `${d.assessments.filter((a) => a.kind === "quiz").length} quizzes and ${d.assessments.filter((a) => /exam/.test(a.kind)).length} exams loaded as unpublished shells with blueprints (items need SME authoring); ${d.assessments.filter((a) => a.kind === "lab" || a.kind === "assignment").length} labs and assignments published with AI-use policies.`);
    set("Slides, video scripts", "drafted", "Slide outlines, lecture script outlines and the instructor guide are generated in the design package.");
  }
  const risks = [
    "Tool list must be verified current and education-licensed, then version-pinned, before labs are built.",
    ...(spec.pathway?.missing ?? []).map((c) => `Pathway step ${c} isn't in the catalog yet; the pathway runs without it until it exists.`),
    ...(spec.adoptCourse ? ["Built on the Academy's earlier Deep Learning course shell (Weeks 5–6 reuse its modules and PyTorch lab)."] : []),
    ...(sp?.courses.some((c) => c.courseId) ? ["Course 2 reuses the earlier Applied ML course content; align it with the spec's module list during SME review."] : []),
    ...(spec.electives?.some((e) => /protocol/i.test(e)) ? ["Agent interoperability protocol status must be verified at build time."] : []),
    ...(spec.batches ? ["Refund, deferral and batch-change policy text is shown only after product-owner approval."] : []),
    ...(spec.faculty.some((f) => !f.bio) ? ["Lead faculty bio not yet supplied; additional faculty listed only once confirmed."] : []),
    ...(spec.research?.length ? ["Research citations entered from the publication record; SME to confirm before publishing the reading list."] : []),
    ...(spec.selfCheck ? spec.selfCheck.routeTo.filter((c) => !store.list("offerings", (x) => x.code === c).length).map((c) => `Self-check routes to ${c}, which isn't in this catalog yet.`) : []),
    ...(spec.decisions ?? []).filter((d) => d.status !== "recorded").map((d) => `Decision pending: ${d.topic} — ${d.decision}`),
    ...(spec.hoursPerWeek ? [] : ["Weekly hours not yet set; learning hours can't be stated until they are."]),
    ...(spec.waives ?? []).filter((w) => !store.list("offerings", (x) => x.code === w.toCode).length).map((w) => `Transfer rule into ${w.toCode} is recorded but that program isn't in the catalog yet.`),
  ];
  const overall: Status = items.some((i) => i.status === "blocked") ? "blocked" : items.every((i) => i.status === "complete") ? "complete" : "drafted";
  return { code: spec.code, title: spec.title, overall, items, risks, gate };
}

export function studioOverview(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "designer", "registrar", "advisor", "instructor"])) throw new CampusError("forbidden", "Staff only.", 403);
  return {
    programs: store.list("program_pages").map((p) => programStatus(store, p.offeringId as string)),
    inquiries: hasAny(a, ["admin", "advisor", "registrar"]) ? store.list("program_inquiries").sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 50) : [],
    applications: hasAny(a, ["admin", "registrar", "advisor"]) ? store.list("applications", (x) => !!x.offeringId).map((x) => ({ id: x.id, program: x.program, state: x.state, userId: x.userId })) : [],
    selfChecks: hasAny(a, ["admin", "advisor"]) ? { total: store.list("selfcheck_attempts").length, passed: store.list("selfcheck_attempts", (s) => !!s.passed).length } : null,
  };
}

/** Program learner progress (graded programs use totals; #26 uses pass/no-pass). */
export function myProgramProgress(store: TenantStore, a: Actor, offeringId: string) {
  const o = store.get("offerings", offeringId);
  if (!o) throw new CampusError("not_found", "Program not found", 404);
  const pnp = passNoPassChecks(store, a.id, o);
  return pnp ? { mode: "pass_no_pass", checks: pnp } : { mode: "graded", totals: computeTotals(store, o.courseId as string, a.id) };
}

/** The brochure as a document — the Word and Excel downloads carry the same content as the PDF. */
export function brochureDoc(store: TenantStore, slugOrCode: string): import("../../documents").Doc {
  const p = programPage(store, null, slugOrCode);
  const spec = p.spec;
  return {
    title: `${spec.code} ${spec.title}`,
    subtitle: `Scholaris AI Academy · ${spec.valueStatement}`,
    subject: "Program brochure",
    footer: `${spec.code} ${spec.title} · brochure`,
    blocks: [
      { t: "table", caption: "At a glance", head: ["Item", "Detail"], rows: [["Duration", p.facts.duration], ["Weekly time", p.facts.weeklyHours], ["Format", spec.formatText], ["Fee", `${p.fees.price} ${p.facts.currency} (sandbox price, set by the program team before go-live)`], ...(p.fees.earlyBird ? [["Early registration", `${p.fees.earlyBird.price} ${p.facts.currency} until ${p.fees.earlyBird.endsAt.slice(0, 10)}`]] : []), ...(p.nextCohort ? [["Next cohort", `${p.nextCohort.code}: starts ${p.nextCohort.startsAt.slice(0, 10)}; last day to enroll ${p.nextCohort.registrationClosesAt.slice(0, 10)} (${p.nextCohort.timeZone})`]] : [])] },
      { t: "h", level: 2, text: "Overview" },
      ...spec.overview.map((x) => ({ t: "p" as const, text: x })),
      { t: "h", level: 2, text: "What you'll learn" },
      { t: "list", ordered: true, items: spec.outcomes },
      { t: "h", level: 2, text: "Who it's for" },
      { t: "list", items: spec.audience },
      { t: "p", text: `Prerequisites: ${spec.prerequisites} ${spec.codingRequirement}` },
      { t: "h", level: 2, text: "Curriculum" },
      { t: "table", caption: "Curriculum", head: ["Week", "Title", "Focus"], rows: spec.curriculum.map((w) => [`${w.week}${w.optional ? " (optional)" : ""}`, w.title, w.focus]) },
      ...(spec.electives?.length ? [{ t: "p" as const, text: `Optional electives (not required for completion): ${spec.electives.join("; ")}` }] : []),
      { t: "h", level: 2, text: "Projects and capstone" },
      { t: "table", caption: "Projects", head: ["Project", "Description", "Skills"], rows: spec.projects.map((x) => [x.name, x.description, x.skills.join(", ")]) },
      { t: "h", level: 2, text: "Tools" },
      { t: "table", caption: "Tools", head: ["Family", "Tools"], rows: spec.tools.map((g) => [g.family, g.items.join(", ")]) },
      { t: "p", small: true, text: p.trademark },
      { t: "h", level: 2, text: "Certificate" },
      { t: "p", text: `${spec.credential.certificate}. ${spec.credential.badge}. ${p.ceuStatement} ${spec.creditStatement}` },
      { t: "h", level: 2, text: "Fees and financing" },
      { t: "list", items: [p.fees.installments.terms, p.fees.team, p.fees.referral, spec.fundingStatement] },
      { t: "h", level: 2, text: "How to apply" },
      { t: "list", ordered: true, items: p.howToApply },
      { t: "h", level: 2, text: "Faculty" },
      { t: "list", items: spec.faculty.map((f) => { const a = facultyByName(f.name); return a ? `${a.name}, ${a.role}, ${a.org}` : `${f.name}${"role" in f && f.role ? `, ${String(f.role)}` : ""}`; }) },
    ],
  };
}
