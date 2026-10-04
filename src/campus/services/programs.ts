import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { broker, CampusError, metrics, nowIso, nowMs, registerConsumer, type Row, type TenantStore } from "../core";
import { addPublishCheck } from "../entity";
import { createUser, hasAny, type Actor } from "../iam";
import { PROGRAMS, P26_QUIZ, TRADEMARK_NOTICE, type ProgramSpec, type WeekSpec } from "../academy/programs-data";
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

/** Load one program (idempotent): courses per block, modules per week, items, offering, cohort, page, credentials. */
function loadProgram(store: TenantStore, slug: string, spec: ProgramSpec, root: Row | undefined, instructorIds: string[]) {
  const offeringId = offeringIdFor(slug, spec.code);
  if (store.get("program_pages", `ppg_${slug}_${num(spec.code)}`)) return;
  const lead = leadFaculty(store, slug);
  const start = cohortMonday(spec.cohort.startInDays);
  const single = spec.blocks.length === 1;
  const courseByBlock: Record<string, Row> = {};
  let pos = 0;

  for (const b of spec.blocks) {
    const c = store.insert("courses", {
      id: courseIdFor(slug, spec.code, b.key, single),
      code: single ? spec.code : `${spec.code}-${b.key}`,
      title: single ? spec.title : `${spec.title} — ${b.title}`,
      description: spec.valueStatement,
      credits: 0,
      state: "unpublished",
      accountId: root?.id ?? null,
      homeType: "modules",
      format: spec.format,
      latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 },
      startAt: dayOf(start, 0, 0, 0),
      endAt: dayOf(start, spec.weeks * 7, 23, 59),
      timeZone: ET,
      visibility: "course",
    }, "crs");
    courseByBlock[b.key] = c;
    for (const uid of [lead.id, ...instructorIds]) store.insert("enrollments", { userId: uid, courseId: c.id, role: "instructor", state: "active", source: "manual" }, "enr");
  }
  const groups: Record<string, Record<string, Row>> = {};
  for (const [k, c] of Object.entries(courseByBlock)) {
    groups[k] = {
      act: store.insert("assignment_groups", { courseId: c.id, name: "In-class activities", weight: spec.grading === "pass_no_pass" ? 10 : 20 }, "ag"),
      lab: store.insert("assignment_groups", { courseId: c.id, name: "Labs", weight: spec.grading === "pass_no_pass" ? 40 : 20 }, "ag"),
      quiz: store.insert("assignment_groups", { courseId: c.id, name: "Quizzes and exams", weight: 20 }, "ag"),
      proj: store.insert("assignment_groups", { courseId: c.id, name: "Projects and capstone", weight: spec.grading === "pass_no_pass" ? 30 : 40 }, "ag"),
    };
  }
  const item = (c: Row, m: Row, kind: string, refId: string, title: string, requirement: string | null) => store.insert("module_items", { courseId: c.id, moduleId: m.id, kind, refId, title, position: ++pos, indent: 0, requirement, state: "published" }, "mi");
  const page = (c: Row, m: Row | null, title: string, paras: string[], extra: Block[] = []) => {
    const bl = blocks(paras, title, extra);
    return store.insert("pages", { courseId: c.id, moduleId: m?.id ?? null, title, blocks: bl, html: renderBlocks(store, bl, c.id), position: 1, state: "published" }, "pg");
  };

  const firstBlock = spec.blocks[0].key;
  let prevModule: Row | null = null;
  let prevBlock = "";
  let bank: Row | null = null;
  for (const w of spec.curriculum) {
    const bk = w.block ?? firstBlock;
    const c = courseByBlock[bk];
    if (bk !== prevBlock) prevModule = null;
    prevBlock = bk;
    const wk = weekNo(w.week);
    const weekStart = Math.max(0, wk - 1) * 7;
    const m: Row = store.insert("modules", {
      courseId: c.id,
      title: `${w.optional ? "Optional — " : ""}Week ${w.week}: ${w.title}`,
      position: wk + 1,
      moduleKey: moduleKeyFor(spec.code, w.week),
      state: "published",
      requireAll: true,
      sequential: spec.code === "#26",
      prerequisiteModuleIds: spec.code === "#26" && prevModule ? [prevModule.id] : [],
    }, "mod");
    if (!w.optional) prevModule = m;
    if (pos === 0 || (wk <= 1 && bk === firstBlock && !store.list("pages", (p) => p.courseId === c.id && /Orientation/.test(String(p.title))).length)) {
      const o = page(c, m, "Orientation and getting started", [`Welcome to ${spec.title}. ${spec.formatText}.`, `How the program works: ${spec.learningExperience.join("; ")}.`, `Grading: ${spec.grading === "pass_no_pass" ? `pass/no-pass — ${(spec.passRules ?? []).join("; ")}` : "graded against each assignment's rubric"}.`, "Need help? Use the AI Teaching Assistant for hints from your course material, the program support desk for anything else, and the accessibility support contact for accommodations."]);
      item(c, m, "page", o.id, o.title as string, "view");
    }
    const research = (spec.research ?? []).filter((r) => r.week === wk);
    const ov = page(c, m, `Week ${w.week} overview`, [w.focus, ...(w.labs ? [`Lab A: ${w.labs[0]}.`, `Lab B: ${w.labs[1]}.`] : []), ...research.map((r) => `Research case study: ${r.authors} (${r.year}). ${r.title}. ${r.venue}.`)]);
    item(c, m, "page", ov.id, ov.title as string, "view");
    const due = dayOf(start, weekStart + 6, 23, 59);
    if (w.kind !== "capstone" && w.kind !== "midterm") {
      const act = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `In-Class Activity — Week ${w.week}: ${w.title}`, instructions: ACTIVITY_BODY(w).join("\n\n"), points: 10, groupId: groups[bk].act.id, dueAt: due, submissionTypes: ["file"], allowedExtensions: ["docx", "pdf"], state: "published", gradingType: "points" }, "asg");
      item(c, m, "assignment", act.id, act.title as string, w.optional ? null : "submit");
    }
    if (w.labs) {
      w.labs.forEach((lab, i) => {
        const day = i === 0 ? 3 : 4;
        const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `Lab ${wk}${i === 0 ? "A" : "B"}: ${lab}`, instructions: `Guided 90-minute lab (${i === 0 ? "Thursday" : "Friday"}). Open the Student Starter notebook with TODOs in the Cloud Lab, complete the checkpoints and submit the notebook. Checkpoints are met at 7/10 or above.`, points: 10, groupId: groups[bk].lab.id, dueAt: dayOf(start, weekStart + day + 2, 23, 59), submissionTypes: ["file", "url"], allowedExtensions: ["ipynb", "py", "pdf"], state: "published", gradingType: "points", tags: ["lab"] }, "asg");
        item(c, m, "assignment", a.id, a.title as string, "submit");
      });
    }
    if (spec.code === "#26" && P26_QUIZ[wk]) {
      bank ??= store.insert("question_banks", { courseId: c.id, title: `${spec.code} weekly quiz bank` }, "qb");
      for (const q of P26_QUIZ[wk]) store.insert("questions", { courseId: c.id, bankId: bank.id, kind: q.kind, prompt: q.prompt, choices: q.choices, answer: q.answer, points: 1, tags: [`week${wk}`], version: 1 }, "qn");
      const qz = store.insert("quizzes", { courseId: c.id, moduleId: m.id, title: `Week ${wk} quiz`, bankId: bank.id, pools: [{ bankId: bank.id, tag: `week${wk}`, pick: 3 }], questionCount: 3, timeLimitMin: 20, allowedAttempts: 3, points: 3, groupId: groups[bk].quiz.id, availableFrom: dayOf(start, weekStart, 0, 0), availableUntil: due, kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, state: "published" }, "qz");
      snapshotQuiz(store, qz.id);
      item(c, m, "quiz", qz.id, qz.title as string, "submit");
    }
    if (w.kind === "exam") {
      const ex = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `Block exam (Week ${w.week})`, instructions: "Exam items pending SME authoring.", points: 20, groupId: groups[bk].quiz.id, dueAt: due, submissionTypes: ["on_paper"], state: "unpublished", gradingType: "points" }, "asg");
      item(c, m, "assignment", ex.id, ex.title as string, null);
    }
    if (spec.code === "#1" && w.kind === "midterm") {
      const ex = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Block A exam", instructions: "Exam items pending SME authoring.", points: 20, groupId: groups[bk].quiz.id, dueAt: due, submissionTypes: ["on_paper"], state: "unpublished", gradingType: "points" }, "asg");
      item(c, m, "assignment", ex.id, ex.title as string, null);
    }
    for (const p of spec.projects.filter((x) => weekNo(x.week) === wk && (x.week === w.week || !spec.curriculum.some((y) => y.week === x.week)))) {
      const rb = p.requirements ? rubricFor(store, c.id, `${p.name} rubric`, p.requirements) : null;
      const a = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: `${p.kind === "capstone" ? "Capstone" : p.kind === "midterm" ? "Midterm project" : "Project"}: ${p.name}`, instructions: `${p.description}\n\nSkills practiced: ${p.skills.join(", ")}.${p.requirements ? `\n\nRequired: ${p.requirements.join("; ")}.` : ""}\n\nUse the synthetic datasets in Program resources; never real personal or financial data.`, points: rb ? p.requirements!.length * 5 : 20, groupId: groups[bk].proj.id, dueAt: due, submissionTypes: ["file", "url"], rubricId: rb?.id ?? null, state: "published", gradingType: "points", tags: [p.kind] }, "asg");
      item(c, m, "assignment", a.id, a.title as string, "submit");
    }
    if (spec.code === "#26" && wk === 5) {
      const ms = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Capstone milestone check-in", instructions: "Share your chosen brief, architecture sketch and evaluation plan for feedback.", points: 5, groupId: groups[bk].proj.id, dueAt: due, submissionTypes: ["text", "file"], state: "published", gradingType: "points" }, "asg");
      item(c, m, "assignment", ms.id, ms.title as string, "submit");
    }
    if (spec.code === "#26" && wk === 7) {
      const pr = store.insert("assignments", { courseId: c.id, moduleId: m.id, title: "Final presentation (10 minutes)", instructions: "Demo, architecture, evaluation results and limitations. Marked delivered by faculty.", points: 1, groupId: groups[bk].proj.id, dueAt: dayOf(start, 6 * 7 + 4, 23, 59), submissionTypes: ["on_paper"], state: "published", gradingType: "points", tags: ["presentation"] }, "asg");
      item(c, m, "assignment", pr.id, pr.title as string, null);
    }
  }
  // Program resources: data cards (synthetic datasets).
  for (const [k, c] of Object.entries(courseByBlock)) {
    if (k !== firstBlock) continue;
    const res = store.insert("modules", { courseId: c.id, title: "Program resources: datasets and data cards", position: 99, moduleKey: moduleKeyFor(spec.code, "res"), state: "published", requireAll: false }, "mod");
    for (const d of spec.dataCards) {
      const p = page(c, res, `Data card: ${d.name}`, [`Purpose: ${d.purpose}.`, `Rows: about ${d.rows}. Fields: ${d.fields.join(", ")}.`, `Source: ${d.source}`, `Caveats: ${d.caveats}`]);
      item(c, res, "page", p.id, p.title as string, null);
    }
    const t = page(c, res, "Tools and versions", [...spec.tools.map((g) => `${g.family}: ${g.items.join(", ")}.`), "Versions are pinned in the Cloud Lab after verification at cohort start.", TRADEMARK_NOTICE]);
    item(c, res, "page", t.id, t.title as string, null);
  }

  // Live schedule (#26): faculty session Wednesday, Lab A Thursday, Lab B Friday, 90 minutes, 12:00 ET.
  if (spec.code === "#26") {
    const c = courseByBlock[firstBlock];
    for (const w of spec.curriculum) {
      const wk = weekNo(w.week);
      const base = (wk - 1) * 7;
      const sessions: [number, string][] = w.kind === "capstone" ? [[3, "Capstone build clinic and peer design review"], [4, "Final presentations"]] : [[2, `Live session: ${w.title}`], [3, `Lab A: ${w.labs?.[0] ?? ""}`], [4, `Lab B: ${w.labs?.[1] ?? ""}`]];
      for (const [d, title] of sessions) store.insert("calendar_events", { courseId: c.id, title: `Week ${wk} · ${title}`, startsAt: dayOf(start, base + d, 12, 0), endsAt: dayOf(start, base + d, 13, 30), location: "Live online (link on the course home)", recurrence: "none" }, "ce");
    }
  }

  // Credentials.
  const cert = store.insert("credential_templates", { name: spec.credential.certificate, kind: spec.productType === "professional_certificate" ? "professional_certificate" : "completion", wording: `${spec.credential.description} ${spec.creditStatement}`, gradeThreshold: 70, requiresCapstone: spec.grading !== "pass_no_pass", approvalRequired: false, state: "published" }, "ctpl");
  store.insert("credential_templates", { name: spec.credential.badge, kind: "skill_badge", wording: spec.credential.badge, gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl");

  // Catalog.
  const blockIds = Object.values(courseByBlock).map((c) => c.id);
  const o = store.insert("offerings", {
    id: offeringId,
    code: spec.code,
    title: spec.title,
    productType: spec.productType,
    courseId: blockIds[0],
    blockCourseIds: blockIds.slice(1),
    summary: spec.valueStatement,
    level: spec.level,
    hours: spec.hoursPerWeek ? Math.round(((spec.hoursPerWeek[0] + spec.hoursPerWeek[1]) / 2) * spec.weeks) : null,
    skills: [...new Set(spec.projects.flatMap((p) => p.skills))].slice(0, 8),
    moduleKeys: spec.curriculum.map((w) => moduleKeyFor(spec.code, w.week)),
    price: spec.fees.price,
    earlyBirdPrice: spec.fees.earlyBirdPrice,
    earlyBirdEndsAt: dayOf(cohortMonday(spec.cohort.earlyBirdInDays - 7 > 0 ? spec.cohort.earlyBirdInDays - 7 : 0), 6, 23, 59),
    currency: "USD",
    format: spec.format,
    selfPaced: false,
    inPlus: false,
    aidEligible: false,
    credentialTemplateId: cert.id,
    requiresApplication: true,
    selfCheckRequired: !!spec.selfCheck,
    lateEnrollmentDays: spec.lateEnrollmentDays,
    state: "published",
  }, "off");
  store.insert("offering_sections", { offeringId: o.id, code: spec.cohort.code, startsAt: dayOf(start, 0, 9, 0), endsAt: dayOf(start, spec.weeks * 7 - 1, 23, 59), timeZone: spec.cohort.timeZone, capacity: spec.cohort.capacity, registrationClosesAt: dayOf(start, spec.lateEnrollmentDays, 23, 59), applicationDeadline: dayOf(start, spec.cohort.applicationDeadlineInDays - spec.cohort.startInDays, 23, 59), schedule: spec.cohort.schedule, seatsTaken: 0 }, "osec");

  // Parts sold separately (#13).
  for (const part of spec.parts ?? []) {
    const blockKey = part.code.endsWith(".1") ? "C1" : "C2";
    const po = store.insert("offerings", { id: offeringIdFor(slug, part.code), code: part.code, title: part.title, productType: "short_course", courseId: courseByBlock[blockKey].id, summary: part.summary, level: spec.level, price: part.price, currency: "USD", format: spec.format, selfPaced: false, inPlus: false, aidEligible: false, requiresApplication: true, credentialTemplateId: store.insert("credential_templates", { name: `Scholaris AI Academy Certificate of Completion — ${part.title}`, kind: "completion", wording: `Completed ${part.title}. ${spec.creditStatement}`, gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl").id, moduleKeys: spec.curriculum.filter((w) => (w.block ?? firstBlock) === blockKey).map((w) => moduleKeyFor(spec.code, w.week)), state: "published" }, "off");
    store.insert("offering_sections", { offeringId: po.id, code: `${spec.cohort.code}-${blockKey}`, startsAt: dayOf(start, blockKey === "C1" ? 0 : 56, 9, 0), endsAt: dayOf(start, blockKey === "C1" ? 55 : 111, 23, 59), timeZone: spec.cohort.timeZone, capacity: spec.cohort.capacity, registrationClosesAt: dayOf(start, (blockKey === "C1" ? 0 : 56) + spec.lateEnrollmentDays, 23, 59), schedule: spec.cohort.schedule, seatsTaken: 0 }, "osec");
    store.insert("pathway_edges", { fromId: po.id, toId: o.id, kind: "stacks_into", moduleKey: null, note: "Completing both courses earns the bundle badge." }, "pe");
  }

  store.insert("program_pages", { id: `ppg_${slug}_${num(spec.code)}`, offeringId: o.id, slug: spec.slug, spec, advisorEmail: `advisors@${slug}.scholarion.test`, advisorPhone: null, brochureNote: "Fees and dates are read from the catalog when the brochure is generated.", packageStatus: null, copyFlags: [], state: "published" }, "ppg");
}

/** Load every program design into a tenant (idempotent) and connect pathways. */
export function ensurePrograms(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  const root = store.list("accounts", (a) => !a.parentId)[0];
  const instructors = store.list("users", (u) => u.id === `usr_${t.slug}_instructor`).map((u) => u.id);
  for (const spec of PROGRAMS) loadProgram(store, t.slug, spec, root, instructors);
  // Waivers recorded in the consolidation table (#26 → #1 Weeks 1–8, #15 Weekends 3–5).
  for (const spec of PROGRAMS) {
    for (const w of spec.waives ?? []) {
      const to = store.list("offerings", (o) => o.code === w.toCode)[0];
      const from = store.get("offerings", offeringIdFor(t.slug, spec.code));
      if (!to || !from) continue;
      for (const wk of w.weeks) {
        const key = w.toCode === "#15" ? `dl-${wk.toLowerCase()}` : moduleKeyFor(w.toCode, wk);
        if (!store.list("pathway_edges", (e) => e.fromId === from.id && e.toId === to.id && e.moduleKey === key).length) store.insert("pathway_edges", { fromId: from.id, toId: to.id, kind: "waives", moduleKey: key, note: w.note }, "pe");
      }
    }
  }
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
  const cohorts = store.list("offering_sections", (s) => s.offeringId === o.id).sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt))).map((s) => ({ id: s.id, code: String(s.code), startsAt: String(s.startsAt), endsAt: String(s.endsAt ?? ""), applicationDeadline: String(s.applicationDeadline ?? s.registrationClosesAt), registrationClosesAt: String(s.registrationClosesAt), timeZone: String(s.timeZone), schedule: String(s.schedule ?? ""), seatsLeft: Math.max(0, Number(s.capacity) - Number(s.seatsTaken ?? 0)) }));
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
  };
}

export function programIndex(store: TenantStore) {
  return store.list("program_pages", (p) => p.state === "published").map((p) => {
    const spec = p.spec as ProgramSpec;
    const o = store.get("offerings", p.offeringId as string);
    return { slug: spec.slug, code: spec.code, title: spec.title, valueStatement: spec.valueStatement, weeks: spec.weeks, format: spec.formatText, track: spec.track, price: Number(o?.price ?? 0), currency: String(o?.currency ?? "USD") };
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
  for (const f of spec.faculty) write(`${f.name}, ${f.role}`);
  write("All payments on this staging site are sandbox only. Fees, dates and seats are read from the Scholaris catalog when this brochure is generated.", { size: 8 });
  metrics.inc("program_brochures_total", { program: spec.code });
  return doc.save();
}

/* ---------------- inquiries, self-check, apply ---------------- */

const INQUIRY_WINDOW = new Map<string, number[]>();

export function submitInquiry(store: TenantStore, a: Actor | null, input: { offeringId: string; kind: "team" | "advisor"; name: string; email: string; organization?: string; seats?: number; preferredTime?: string; timeZone?: string; message?: string }) {
  const o = store.get("offerings", input.offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Program not found", 404);
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
  const passed = score >= sc.passMin;
  const available = sc.routeTo.map((code) => store.list("offerings", (o) => o.code === code && o.state === "published")[0]).filter(Boolean) as Row[];
  const route = passed ? [] : available.map((o) => ({ code: String(o.code), title: String(o.title), offeringId: o.id }));
  const message = passed
    ? `You're ready for ${spec.code}. You scored ${score}/${sc.questions.length}.`
    : `You scored ${score}/${sc.questions.length}; ${sc.passMin} is needed. We recommend starting with ${sc.routeTo.join(" or ")}${available.length < sc.routeTo.length ? " — an advisor will help you choose, since not every recommended program is open in this catalog yet" : ""}.`;
  const row2 = store.tx(() => store.insert("selfcheck_attempts", { offeringId: row.offeringId, userId: a?.id ?? null, score, of: sc.questions.length, passed, routeTo: sc.routeTo }, "psc"));
  return { id: row2.id, score, of: sc.questions.length, passed, routeTo: sc.routeTo, available: route, message };
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
  for (const cid of (o.blockCourseIds as string[] | undefined) ?? []) {
    if (!store.list("enrollments", (e) => e.userId === userId && e.courseId === cid && e.role === "student" && e.state === "active").length) store.insert("enrollments", { userId, courseId: cid, role: "student", state: "active", source: "purchase" }, "enr");
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

/* ---------------- bundle badge (#13) ---------------- */

registerConsumer({
  name: "bundle-badge",
  types: ["offering_enrollments.completed"],
  handle(store, e) {
    const userId = String(e.data.userId);
    const o = store.get("offerings", String(e.data.offeringId));
    if (!o || !/^#\d+\.\d$/.test(String(o.code))) return;
    const bundleCode = String(o.code).split(".")[0];
    const parts = store.list("offerings", (x) => String(x.code).startsWith(`${bundleCode}.`));
    const done = parts.every((p) => store.list("offering_enrollments", (x) => x.offeringId === p.id && x.userId === userId && x.state === "completed").length);
    if (!done) return;
    const bundle = store.list("offerings", (x) => x.code === bundleCode)[0];
    const spec = bundle ? (store.list("program_pages", (p) => p.offeringId === bundle.id)[0]?.spec as ProgramSpec | undefined) : undefined;
    if (!spec || store.list("credentials", (c) => c.userId === userId && c.title === spec.credential.badge).length) return;
    issueCredential(store, null, { userId, courseId: o.courseId as string, title: spec.credential.badge, kind: "badge", achievementType: "Badge", evidence: parts.map((p) => ({ name: `Completed ${p.code} ${p.title}` })) });
  },
});

/* ---------------- quality gate, shell publishing, status ---------------- */

export function qualityGate(store: TenantStore, offeringId: string) {
  const row = pageRow(store, offeringId);
  const spec = row.spec as ProgramSpec;
  const o = store.get("offerings", row.offeringId as string)!;
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const mods = store.list("modules", (m) => courseIds.includes(m.courseId as string) && !String(m.moduleKey).endsWith("-wres"));
  const missingWeeks = spec.curriculum.filter((w) => !mods.some((m) => m.moduleKey === moduleKeyFor(spec.code, w.week))).map((w) => w.week);
  const caps = spec.projects.filter((p) => p.kind === "capstone");
  const capsWithRubric = caps.filter((p) => store.list("assignments", (x) => courseIds.includes(x.courseId as string) && String(x.title).endsWith(p.name) && !!x.rubricId).length);
  const pages = store.list("pages", (p) => courseIds.includes(p.courseId as string));
  const copy = copyCheck(store, programCopy(spec));
  return [
    { gate: "Every week has a module, overview page and activity", ok: missingWeeks.length === 0, detail: missingWeeks.length ? `Missing weeks: ${missingWeeks.join(", ")}` : `${spec.curriculum.length} weeks` },
    { gate: "Capstone has a rubric", ok: capsWithRubric.length === caps.length, detail: `${capsWithRubric.length}/${caps.length}` },
    { gate: "Outcomes are 5–6 measurable competencies", ok: spec.outcomes.length >= 5 && spec.outcomes.length <= 6, detail: `${spec.outcomes.length}` },
    { gate: "Honest-claims copy check", ok: copy.length === 0, detail: copy.map((c) => c.label).join(", ") || "clean" },
    { gate: "Datasets are synthetic with data cards", ok: spec.dataCards.length > 0 && spec.dataCards.every((d) => /scholaris|fictional|synthetic/i.test(`${d.source} ${d.name}`)), detail: `${spec.dataCards.length} data cards` },
    { gate: "Pages pass the accessibility structure check (headings first)", ok: pages.every((p) => ((p.blocks as Block[]) ?? [])[0]?.type === "heading"), detail: `${pages.length} pages` },
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
  const items: { deliverable: string; status: Status; note: string }[] = [
    { deliverable: "Catalog entry and website page", status: o.state === "published" && row.state === "published" ? "complete" : "drafted", note: "Fees and dates read from the catalog." },
    { deliverable: "Outcomes map and week-by-week curriculum", status: "needs SME review", note: `${spec.outcomes.length} outcomes, ${spec.curriculum.length} weeks; outcome-to-week alignment needs SME confirmation.` },
    { deliverable: "Course shells in Scholaris", status: gate.every((g) => g.ok) ? "complete" : "drafted", note: `${ids.length} course block(s) loaded unpublished; publish after the quality gate.` },
    { deliverable: "In-class activities (student and instructor editions)", status: "drafted", note: `${asg.filter((x) => /In-Class Activity/.test(String(x.title))).length} activity shells in the Academy template; editions pending authoring.` },
    { deliverable: "Starter TODO and EXECUTED notebooks", status: "blocked", note: "Built after tool versions are verified and pinned in the Cloud Lab." },
    { deliverable: "Synthetic datasets with data cards", status: "drafted", note: `${spec.dataCards.length} data cards written; datasets generated at build.` },
    { deliverable: "Mini labs, quizzes, assignments, projects and capstone with rubrics", status: spec.code === "#26" && quizzes.length >= 6 ? "needs SME review" : "drafted", note: `${asg.filter((x) => /^(Project|Midterm project|Capstone)/.test(String(x.title))).length} projects, ${quizzes.length} published quizzes, capstone rubric ${gate[1].ok ? "attached" : "missing"}.` },
    { deliverable: "Slides, scripts and instructor guide", status: "not started", note: "Authored after SME review of the curriculum." },
    { deliverable: "Credential and badge definitions", status: store.get("credential_templates", o.credentialTemplateId as string) ? "complete" : "drafted", note: `${spec.credential.certificate}; ${spec.credential.badge}.` },
    { deliverable: "Brochure", status: "complete", note: "Generated as PDF from the same content." },
  ];
  const risks = [
    "Tool list must be verified current and education-licensed, then version-pinned, before labs are built.",
    ...(spec.faculty.some((f) => !f.bio) ? ["Lead faculty bio not yet supplied; additional faculty listed only once confirmed."] : []),
    ...(spec.research?.length ? ["Research citations entered from the publication record; SME to confirm before publishing the reading list."] : []),
    ...(spec.selfCheck ? spec.selfCheck.routeTo.filter((c) => !store.list("offerings", (x) => x.code === c).length).map((c) => `Self-check routes to ${c}, which isn't in this catalog yet.`) : []),
    ...(spec.decisions ?? []).filter((d) => d.status !== "recorded").map((d) => `Decision pending: ${d.topic} — ${d.decision}`),
    ...(spec.waives ?? []).filter((w) => w.toCode === "#15").map(() => "Program #15's course shell has no Weekend 3–5 modules keyed yet, so that waiver applies once they exist."),
    ...(spec.hoursPerWeek ? [] : ["Weekly hours not yet set; learning hours can't be stated until they are."]),
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
