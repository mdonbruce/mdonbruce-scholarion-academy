import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import type { ProgramSpec } from "../academy/programs-data";
import { LIBRARY } from "../academy/programs-data-2";
import { SIM_SCENARIOS } from "../academy/sim-scenarios";
import { audit, requireTenant } from "./common";
import { copyCheck } from "./claims";
import { moduleKeyFor } from "./programs";
import { DRAFT_LABEL, simLabFileName } from "./simlab";

/**
 * Assessment & Project Studio — the Scholarion Curriculum Engine's generators for labs, in-class
 * activities, quizzes with item banks, practice exercises, mini-projects, real-world projects,
 * senior capstones and simulated Student/Instructor labs. Every output is built from the program
 * design (outcomes, week focus, tools, readings, data cards), follows the Four Project Pillars, comes
 * in student and instructor editions, and is labelled AI DRAFT until an SME and an instructional
 * designer both approve it. Places that need expert writing are marked [SME] and block publishing.
 */

export const KINDS = ["lab", "activity", "quiz", "exercises", "mini_project", "real_world_project", "senior_capstone", "simulated_lab"] as const;
export type DraftKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<DraftKind, string> = { lab: "Hands-on lab", activity: "In-class activity", quiz: "Quiz + item bank", exercises: "Practice exercises", mini_project: "Mini-project", real_world_project: "Real-world (scenario-based) project", senior_capstone: "Senior capstone", simulated_lab: "Simulated Student/Instructor lab + demo app" };

/** The Four Project Pillars, intensity by assignment type (Scholarion standard). */
export const PILLARS: Record<string, { problem: string; constraints: string; tools: string; done: string }> = {
  exercises: { problem: "Micro-task", constraints: "1 simple rule", tools: "Core language/library", done: "Tests pass" },
  lab: { problem: "Specific practical task", constraints: "1–2 technical limits", tools: "1 production tool, guided", done: "Checkpoints + executed notebook/config" },
  activity: { problem: "Quick team problem", constraints: "Countdown timer", tools: "Lightweight professional method", done: "Shareable artifact in-session" },
  quiz: { problem: "Mini-scenarios", constraints: "Given conditions", tools: "Tool-based reasoning", done: "Score + explanations" },
  mini_project: { problem: "Scoped pain point", constraints: "2–3 user requirements", tools: "2–3 connected tools", done: "Repo + README + local demo" },
  real_world_project: { problem: "Actual business/user problem", constraints: "Professional limits (rate limits, security, timeline)", tools: "Live DB, external APIs, Kanban, tests", done: "Automated tests + deployed URL + report" },
  senior_capstone: { problem: "Complex, cross-functional problem", constraints: "Compliance, budget tiers, scalability, team deadlines", tools: "Full stack, Docker, CI/CD, team workflows", done: "End-to-end deployed system + test suite + architecture report + defense" },
  simulated_lab: { problem: "Sandbox agent scenario", constraints: "Step limit, approvals, guardrail", tools: "Agent loop simulator", done: "5 checkpoints + 10-question worksheet" },
};

const SME = (what: string) => `[SME: ${what}]`;
const BLOOM_ORDER = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];

/* ---------------- context header ---------------- */

export function contextHeader(store: TenantStore, offeringId: string, week: string) {
  const page = store.list("program_pages", (p) => p.offeringId === offeringId)[0];
  if (!page) throw new CampusError("not_found", "Program not found", 404);
  const spec = page.spec as ProgramSpec;
  const wk = spec.curriculum.find((w) => w.week === week);
  if (!wk) throw new CampusError("not_found", `Week ${week} isn't in ${spec.code}.`, 404);
  const key = moduleKeyFor(spec.code, week);
  const mod = store.list("modules", (m) => m.moduleKey === key)[0];
  const course = mod ? store.get("courses", String(mod.courseId)) : undefined;
  const levelMap: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
  const senior = wk.kind === "capstone";
  const competencies = spec.outcomes.slice(0, 5).map((o, i) => ({ id: `C${i + 1}`, text: o }));
  const los = [
    { id: "LO1", text: `Explain the key ideas of ${wk.title.toLowerCase()}: ${wk.focus}`, bloom: "Understand" },
    { id: "LO2", text: `Apply ${wk.title.toLowerCase()} techniques to a realistic task with the program's tools.`, bloom: "Apply" },
    { id: "LO3", text: `Analyze results, errors and trade-offs in ${wk.title.toLowerCase()}.`, bloom: "Analyze" },
    { id: "LO4", text: `Evaluate a solution against constraints, quality and responsible-AI criteria.`, bloom: senior ? "Create" : "Evaluate" },
  ];
  const libs = (wk.lib ?? []).map((k) => LIBRARY.find((l) => l.key === k)).filter(Boolean) as typeof LIBRARY;
  return {
    source: "Scholarion Academy (Scholaris standard, non-credit)",
    package: "Scholaris Course Standard v1.2",
    program: `${spec.code} ${spec.title}`,
    course: course ? `${course.code} ${course.title}` : spec.title,
    courseId: course?.id ?? null,
    moduleId: mod?.id ?? null,
    module: `${/^\d/.test(week) ? (spec.formatKind === "live_weekend" ? "Weekend" : "Week") : "Module"} ${week}: ${wk.title}`,
    week,
    topic: wk.title,
    focus: wk.focus,
    level: senior ? "Senior/Capstone" : levelMap[spec.level] ?? "Intermediate",
    learners: spec.audience.join(", "),
    delivery: spec.selfPaced ? "self-paced" : spec.formatKind === "live_weekend" ? "live cohort (weekends)" : "live cohort",
    prerequisites: spec.prerequisites,
    competencies,
    los,
    roles: spec.audience,
    readings: [...(spec.textbooks ?? []), ...libs.filter((l) => l.textbook).map((l) => l.textbook!)].filter((v, i, a) => a.indexOf(v) === i),
    tools: spec.tools.flatMap((t) => t.items).map((t) => (/(pinned|verified)/i.test(t) ? t : `${t} (version pinned at cohort start)`)),
    runEnvironment: "Scholarion Cloud Lab image scholarion/lab-python:3.12-slim (Google Colab fallback)",
    library: libs.map((l) => ({ key: l.key, title: l.title, version: l.version })),
    dataCards: spec.dataCards ?? [],
    lms: "Scholarion LMS",
    codingRequired: spec.codingRequired !== false,
    spec,
  };
}
type Ctx = ReturnType<typeof contextHeader>;

const alignment = (ctx: Ctx, rows: { item: string; lo: string }[]) => rows.map((r, i) => ({ ...r, competency: ctx.competencies[i % Math.max(1, ctx.competencies.length)]?.id ?? "C1", bloom: ctx.los.find((l) => l.id === r.lo)?.bloom ?? "Apply" }));

const aiPolicy = (kind: string) => ({ lab: "Allowed with disclosure (explain any AI-assisted code in your results note).", activity: "Allowed with disclosure for the paper.", quiz: "Not allowed.", exercises: "Allowed (ungraded practice).", mini_project: "Allowed with disclosure; personalized data seed required.", real_world_project: "Allowed with disclosure; oral check-in confirms authorship.", senior_capstone: "Allowed with disclosure; live defense confirms authorship.", simulated_lab: "Worksheet items 1–6 not allowed; paper allowed with disclosure." })[kind] ?? "Allowed with disclosure.";

/** Deterministic synthetic preview rows from a data card's fields. */
function previewRows(fields: string[], n = 10) {
  return Array.from({ length: n }, (_, i) => Object.fromEntries(fields.map((f, j) => [f, /id$/i.test(f) ? `${f.replace(/_?id$/i, "").toUpperCase() || "ID"}-${String(1001 + i)}` : /(date|time|at)$/i.test(f) ? `2026-0${(i % 9) + 1}-1${j % 9}` : /(amount|total|price|rate|score|units|rows|count|eta|value)/i.test(f) ? String(((i + 3) * (j + 7)) % 97) : `${f}_${(i % 4) + 1}`])));
}
function generatorCode(card: { key: string; fields: string[]; rows: number }) {
  return [`# Synthetic data generator for ${card.key} (seeded; no real people)`, "import csv, random  # Gaddis Ch. 6: Files and Exceptions", "random.seed(42)", `FIELDS = ${JSON.stringify(card.fields)}`, `with open("${card.key}.csv", "w", newline="") as f:`, "    w = csv.writer(f)", "    w.writerow(FIELDS)", `    for i in range(${card.rows}):`, "        w.writerow([f\"{name}_{random.randint(1, 4)}\" if not name.endswith('id') else f\"ID-{1001 + i}\" for name in FIELDS])"].join("\n");
}

/* ---------------- generators ---------------- */

function genLab(ctx: Ctx) {
  const card = ctx.dataCards[0] ?? { key: "lab-data", name: "Synthetic lab dataset", purpose: "Lab", rows: 500, fields: ["id", "feature_a", "feature_b", "label"], source: "Generated by Scholaris.", caveats: "Synthetic." };
  const parts = ["Set up and load", "Core implementation", "Measure against the checkpoint", "Handle a constraint", "Independent extension"].map((t, i) => ({
    title: `Part ${i + 1} — ${t}`,
    goal: i === 0 ? "Load the dataset and confirm its shape." : i === 4 ? `Apply ${ctx.topic.toLowerCase()} to a new variation without step-by-step guidance.` : `${t} for ${ctx.topic.toLowerCase()}.`,
    instructions: i === 0 ? ["Run the setup cell (pinned packages).", `Load ${card.key}.csv into a DataFrame.`, "Print the first 5 rows."] : [SME(`step-by-step instructions for ${t.toLowerCase()} in ${ctx.topic}`)],
    todo: i === 0 ? `# TODO: load ${card.key}.csv  # Gaddis Ch. 6: Files and Exceptions\ndf = None` : `# TODO: ${t.toLowerCase()}\n${SME("starter code with a TODO")}`,
    checkpoint: i === 0 ? `assert df.shape[0] == ${card.rows}` : SME("assert test for this checkpoint"),
    hint: i === 0 ? "pandas.read_csv returns a DataFrame; .shape gives (rows, columns)." : SME("one hint"),
    lo: ["LO2", "LO2", "LO3", "LO3", "LO4"][i],
    constraint: i === 3 ? "Respond in under 500 ms per call and handle a rate limit of 60 requests/min." : null,
  }));
  const student = {
    title: `Lab: ${ctx.topic}`,
    purpose: `Practice ${ctx.topic.toLowerCase()} on a concrete task in ${ctx.runEnvironment.split(" (")[0]}.`,
    outcomes: ctx.los,
    time: "90 minutes",
    difficulty: ctx.level,
    pillars: PILLARS.lab,
    setup: { environment: ctx.runEnvironment, packages: ctx.tools, dataset: `${card.key}.csv`, apiKeys: "Use your Scholarion-issued, spend-capped key from the SCHOLARION_API_KEY environment variable. Never hard-code keys." },
    background: SME(`≤ 300 words of original background on ${ctx.focus}`),
    readings: ctx.readings,
    dataset: { card, generator: generatorCode(card), preview: previewRows(card.fields) },
    parts,
    challenge: SME("optional challenge extension"),
    reflection: [`What changed in your results when you applied the Part 4 constraint?`, `Where could ${ctx.topic.toLowerCase()} fail in a real deployment, and how would you notice?`, `Which checkpoint taught you the most, and why?`],
    deliverable: "The executed notebook plus a one-paragraph results note.",
    autograder: parts.map((p, i) => ({ test: `test_part${i + 1}`, checks: p.checkpoint, points: i === 4 ? 4 : 4, visibility: i < 3 ? "visible" : "hidden" })),
    troubleshooting: [["ModuleNotFoundError", "Run the setup cell; the Cloud Lab image pins versions."], ["FileNotFoundError", "Run the generator cell first or check the working directory."], ["KeyError on a column", "Print df.columns and match the exact name."], ["Rate-limit (429) errors", "Back off and retry with exponential delay; respect 60 requests/min."], ["Checkpoint assert fails", "Compare your output's shape and type with the expected value in the checkpoint."]],
    files: [`Lab_${ctx.week}_Student_Starter_TODO.ipynb`, `Lab_${ctx.week}_Instructor_Solution_EXECUTED.ipynb`, `${card.key}.csv`],
    miniLabs: [1, 2].map((n) => ({ title: `Mini Lab ${n}: ${n === 1 ? "warm-up" : "apply"} — ${ctx.topic}`, minutes: 15 + 5 * (n - 1), files: [`MiniLab_${ctx.week}_${n}_Starter_TODO.ipynb`, `MiniLab_${ctx.week}_${n}_Solution_EXECUTED.ipynb`], task: SME(`a 15–20 minute task on ${ctx.topic}`) })),
    aiPolicy: aiPolicy("lab"),
  };
  const instructor = { walkthrough: SME("solution walkthrough"), expectedOutputs: parts.map((p) => ({ part: p.title, expected: p.checkpoint })), timing: parts.map((p, i) => ({ part: p.title, minutes: [10, 25, 20, 20, 15][i] })), misconceptions: [SME("misconception 1"), SME("misconception 2"), SME("misconception 3")], gradingNotes: "Autograder covers 20 points; read the results note for reasoning.", adapt: { slower: "Pair on Parts 1–3; Part 5 becomes homework.", faster: "Add the challenge extension and a hidden-test of their own." } };
  return { student, instructor, alignment: alignment(ctx, parts.map((p) => ({ item: p.title, lo: p.lo }))) };
}

function genActivity(ctx: Ctx) {
  const card = ctx.dataCards[0] ?? { key: "activity-data", rows: 200, fields: ["id", "text", "label"] };
  const student = {
    title: `In-Class Activity: ${ctx.topic}`,
    objective: ctx.los.slice(1, 4).map((l) => `${l.id}: ${l.text}`),
    overview: { scenario: SME(`a 2–3 sentence scenario from a Scholarion sandbox organization for ${ctx.topic}`), time: "75–90 minutes", grouping: "Teams of 3", pillars: PILLARS.activity },
    step1: { title: "Step 1: Concept setup and peer discussion (10 min)", content: `Pairs discuss: where would ${ctx.topic.toLowerCase()} matter in your work? Key terms: ${SME("4–6 key terms")}` },
    step2: { title: "Step 2: Hands-On Implementation (30–40 min, countdown)", open: "Open the Student Starter with TODOs notebook.", resources: [`Student Starter TODO .ipynb`, `Instructor Solution EXECUTED .ipynb`, `${card.key}.csv with data card`, "Google Codelab-style walkthrough"], steps: [SME("numbered implementation steps with checkpoints")] },
    step3: { title: "Step 3: Task", content: "Apply your implementation to a new variation of the scenario and share the artifact (link, board or executed cell output) before time is up." },
    step4: { title: "Step 4: Research, Discussion & Reflection", research: `Find one credible source (APA) on ${ctx.topic.toLowerCase()} in practice.`, discussion: [`What trade-off did your team make, and why?`, `How would this change at 100× the data?`, `What could go wrong for the people affected by this system?`] },
    step5: { title: "Step 5: Wrap-Up (5 min)", review: [SME("3–5 core-concept bullets")], next: "Preview of the next module." },
    reflectionQuestions: [`What did you build, in one sentence?`, `Which step took longest, and what would speed it up?`, `What evidence shows your result is correct?`, `What ethical or real-world risk did you notice?`, `What will you try differently next time?`],
    submission: ["2–3-page APA paper with embedded code, explanations and output screenshots", "References and citations", `Upload via ${ctx.lms} as Word or PDF`, "Due Sunday 11:59 PM"],
    reminders: ["Academic integrity applies.", `AI-use policy: ${aiPolicy("activity")}`, "Accessibility support and extended time through your accommodations plan.", "Office hours are listed in the course calendar."],
    package: ["Instructor Colab notebook (EXECUTED)", "Student starter notebook (TODOs)", "Codelab-style walkthrough", `Generated dataset ${card.key}.csv with data card`, "2 Mini Labs (starter TODO + EXECUTED each)", `Enhanced assignment on a dataset ≥ 10× larger (${(card.rows * 10).toLocaleString()} rows) with walkthrough and rubric`],
  };
  const instructor = { emphasizes: [SME("4–6 points the instructor must stress")], sampleRun: SME("instructor-led sample run, prefilled"), answerKey: SME("answer key for Steps 2–3"), discussionGuide: SME("discussion guidance"), sampleReflections: SME("2 strong sample reflection answers"), paperRubric: ["Technical correctness", "Explanation quality", "Evidence/screenshots", "Analysis and reflection", "APA and citations", "Clarity"].map((c) => ({ criterion: c, bands: ["Exemplary 5", "Proficient 4", "Developing 2", "Beginning 1"] })) };
  return { student, instructor, alignment: alignment(ctx, [{ item: "Step 2 implementation", lo: "LO2" }, { item: "Step 3 task", lo: "LO3" }, { item: "Step 4 reflection", lo: "LO4" }]) };
}

/** Item bank JSON (Scholarion schema). Existing module quiz items are reused; the rest are SME slots. */
function genQuiz(store: TenantStore, ctx: Ctx, n: number) {
  const existing = ctx.moduleId ? store.list("quizzes", (q) => q.moduleId === ctx.moduleId).flatMap((q) => store.list("questions", (x) => x.bankId === q.bankId)) : [];
  const senior = ctx.level === "Advanced" || ctx.level === "Senior/Capstone";
  const targets = senior ? { low: 0.25, mid: 0.4, high: 0.35 } : { low: 0.3, mid: 0.4, high: 0.3 };
  const total = n * 3;
  const blooms = Array.from({ length: total }, (_, i) => {
    const f = i / total;
    return f < targets.low ? (i % 2 ? "Understand" : "Remember") : f < targets.low + targets.mid ? (i % 2 ? "Analyze" : "Apply") : (i % 3 === 2 ? "Create" : "Evaluate");
  });
  const types = ["multiple_choice", "scenario", "code_output", "multiple_answer", "ordering", "numeric", "code_fix", "true_false_justify", "short_answer", "matching"];
  const items = blooms.map((bloom, i) => {
    const src = existing[i] as Row | undefined;
    const lo = ctx.los[Math.min(ctx.los.length - 1, Math.floor((BLOOM_ORDER.indexOf(bloom) / 6) * ctx.los.length))].id;
    const id = `M${ctx.week}-Q${String(i + 1).padStart(2, "0")}`;
    if (src && Array.isArray(src.choices)) {
      const letters = ["a", "b", "c", "d", "e"];
      const options = Object.fromEntries((src.choices as string[]).map((c, j) => [letters[j], c]));
      const correct = letters.filter((l) => options[l] === src.answer);
      return { id, type: src.kind === "true_false" ? "true_false" : "multiple_choice", lo, competency: ctx.competencies[i % ctx.competencies.length]?.id ?? "C1", bloom, difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard", scenario: null, stem: String(src.prompt), options, correct, points: 1, rationale_correct: String(src.explanation ?? SME("why the answer is correct")), rationale_distractors: Object.fromEntries(letters.filter((l) => options[l] && !correct.includes(l)).map((l) => [l, SME("why this distractor is wrong")])), feedback_correct: "Correct.", feedback_incorrect: "Review the module notes on this topic.", tags: [ctx.topic, ...ctx.readings.slice(0, 1)], origin: "module quiz" };
    }
    return { id, type: types[i % types.length], lo, competency: ctx.competencies[i % ctx.competencies.length]?.id ?? "C1", bloom, difficulty: i % 3 === 0 ? "easy" : i % 3 === 1 ? "medium" : "hard", scenario: SME(`a mini-scenario with a constraint (budget, latency, rate limit or security rule) on ${ctx.topic}`), stem: SME(`${bloom}-level item on ${ctx.focus}`), options: { a: SME("option"), b: SME("option"), c: SME("option"), d: SME("option") }, correct: [] as string[], points: 1, rationale_correct: SME("why the answer is correct"), rationale_distractors: { a: SME("misconception"), b: SME("misconception"), c: SME("misconception") }, feedback_correct: "Correct.", feedback_incorrect: SME("teaching feedback"), tags: [ctx.topic], origin: "SME slot" };
  });
  const bank = { bank: `${ctx.course.split(" ")[0]}-M${ctx.week}`, version: "0.1-draft", items };
  const quiz = items.slice(0, n);
  const blueprint = ctx.los.map((l) => ({ lo: l.id, ...Object.fromEntries(BLOOM_ORDER.map((b) => [b, quiz.filter((q) => q.lo === l.id && q.bloom === b).length])) }));
  const higher = quiz.filter((q) => ["Apply", "Analyze", "Evaluate", "Create"].includes(q.bloom)).length / Math.max(1, quiz.length);
  return {
    student: { title: `Quiz: ${ctx.topic}`, pillars: PILLARS.quiz, items: quiz.map(({ correct: _c, rationale_correct: _r, rationale_distractors: _d, feedback_correct: _fc, feedback_incorrect: _fi, ...rest }) => rest), aiPolicy: aiPolicy("quiz") },
    instructor: { key: quiz.map((q) => ({ id: q.id, correct: q.correct, rationale: q.rationale_correct, distractors: q.rationale_distractors })), settings: { timeLimitMin: Math.max(15, n * 2), attempts: 2, shuffle: true, resultVisibility: "score and explanations after the due date", accommodations: "Time extensions and alternative formats apply automatically from accommodation plans." }, qtiNote: "Export as QTI 2.1 from this draft (one assessmentItem per item) for Scholarion LMS or another LMS." },
    blueprint,
    higherOrderShare: Math.round(higher * 100),
    bank,
    alignment: alignment(ctx, quiz.map((q) => ({ item: q.id, lo: q.lo }))),
  };
}

function genExercises(ctx: Ctx) {
  const set = (name: string, count: number, bloom: string, code: boolean) => Array.from({ length: count }, (_, i) => ({ title: `${name}${i + 1}: ${SME("title")}`, lo: bloom === "Create" ? "LO4" : bloom === "Analyze" ? "LO3" : bloom === "Apply" ? "LO2" : "LO1", difficulty: name === "A" ? "easy" : name === "D" ? "hard" : "medium", minutes: name === "A" ? 5 : name === "D" ? 25 : 12, instructions: SME(`${bloom} exercise on ${ctx.topic}`), starter: code ? `# TODO\n${SME("starter code")}` : null, tests: code ? SME("automated test") : "Self-check criteria: " + SME("criteria"), hints: [SME("hint 1"), SME("hint 2"), SME("hint 3")], gaddis: code && ctx.readings.some((r) => /Gaddis/.test(r)) ? "Gaddis 6th ed. chapter reference: " + SME("chapter") : null, grading: "ungraded" }));
  const sets = { A: set("A", 4, "Understand", false), B: set("B", 5, "Apply", ctx.codingRequired), C: set("C", 3, "Analyze", ctx.codingRequired), D: set("D", 1, "Create", ctx.codingRequired) };
  const all = Object.values(sets).flat();
  return { student: { title: `Practice: ${ctx.topic}`, pillars: PILLARS.exercises, sets, codeShare: Math.round((all.filter((e) => e.starter).length / all.length) * 100), aiPolicy: aiPolicy("exercises") }, instructor: { solutions: SME("worked solutions"), commonMistakes: SME("common mistakes per set") }, alignment: alignment(ctx, all.map((e) => ({ item: e.title.split(":")[0], lo: e.lo }))) };
}

function genMiniProject(ctx: Ctx) {
  const student = { title: `Mini-Project: ${ctx.topic}`, duration: "3–5 days, individual", pillars: PILLARS.mini_project, persona: SME("user persona"), painPoint: SME(`a scoped pain point that ${ctx.topic.toLowerCase()} solves`), stories: [SME("user story 1"), SME("user story 2"), SME("user story 3")], requirements: ["Must validate all inputs safely.", "Must persist data locally (SQLite or files).", SME("third requirement specific to the topic")], tools: ["Git/GitHub", "pytest", ...ctx.tools.slice(0, 1)], starterRepo: ["README.md", "src/", "tests/", "data/ (synthetic, with data card)"], definitionOfDone: ["Repository with README (setup, usage, screenshots)", "All tests pass", "Short screen recording of a local demo", "Reflection paragraph"], rubric: [["Functionality", 15], ["Requirements met", 10], ["Code quality and tests", 10], ["README and demo", 10], ["Reflection", 5]].map(([c, p]) => ({ criterion: c, points: p, levels: ["Exemplary", "Proficient", "Developing", "Beginning"] })), aiPolicy: aiPolicy("mini_project") };
  return { student, instructor: { referenceOutline: SME("reference solution outline"), testSuite: SME("test suite"), gradingNotes: SME("grading notes"), extensions: SME("extension ideas"), personalizationSeeds: "Each learner gets a seed (their user ID hash) that changes the synthetic data, so outputs differ between learners." }, alignment: alignment(ctx, [{ item: "Functionality", lo: "LO2" }, { item: "Tests", lo: "LO3" }, { item: "Reflection", lo: "LO4" }]) };
}

const SCENARIO_BRIEFS = [
  { org: "Haven Hospitality (sandbox)", problem: "multi-currency expense tracking and guest-request triage for a small hotel group with daily exchange rates" },
  { org: "MediGrid Distribution (sandbox, non-clinical)", problem: "order-exception handling and stock rebalancing across two warehouses" },
  { org: "Scholarion Demo University Admissions (sandbox)", problem: "application checklist navigation and document-deadline tracking" },
  { org: "HavenConnect Support Center (sandbox)", problem: "support-ticket triage and knowledge-base answers with escalation" },
];

function genRealWorld(ctx: Ctx) {
  const main = SCENARIO_BRIEFS[0];
  const rubric = [["Problem understanding", 10], ["Implementation", 25], ["Constraints honored", 10], ["Tool and workflow use", 15], ["Testing and CI", 15], ["Deployment", 10], ["Stakeholder report and demo", 10], ["Professionalism", 5]].map(([c, p]) => ({ criterion: c, points: p, levels: ["Exemplary", "Proficient", "Developing", "Beginning"] }));
  const student = {
    title: `Real-World Project: ${ctx.topic}`,
    duration: "3–6 weeks; individual or team of 2–4",
    pillars: PILLARS.real_world_project,
    brief: { organization: main.org, stakeholders: ["Operations lead", "Finance lead", "IT/security reviewer"], clientMemo: SME(`a one-page client memo describing ${main.problem}`), problem: main.problem, successMetrics: [SME("metric 1 with target"), SME("metric 2 with target")] },
    requirements: { stories: [SME("user story + acceptance criteria"), SME("user story + acceptance criteria"), SME("user story + acceptance criteria")], nonFunctional: ["Security: authentication on every endpoint; secrets in environment variables.", "Performance: p95 under 800 ms for core calls.", "Accessibility: WCAG 2.2 AA for any UI."] },
    constraints: { apiLimits: "External API limited to 60 requests/minute.", budget: "Free tier or a fixed sandbox credit only.", security: "Least-privilege credentials; no real personal data.", timeline: "Five milestones, one per week.", aiPolicy: aiPolicy("real_world_project") },
    data: "Synthetic datasets and API mocks with data cards (generator code provided).",
    milestones: ["M1 Plan and Kanban board", "M2 Data and baseline", "M3 Core build", "M4 Testing and deployment", "M5 Report and demo"].map((m) => ({ milestone: m, checklist: SME("checklist"), feedback: "Faculty feedback within 3 business days." })),
    definitionOfDone: ["Automated test suite passing in CI", "Deployed URL on Scholarion staging (or an approved free tier)", "Stakeholder report: results vs success metrics", "5–7 minute demo"],
    rubric,
    team: { roles: ["Project lead", "Builder", "QA/evaluation lead", "Ethics/compliance lead"], peerEvaluation: true, contributionLog: true },
    alternates: SCENARIO_BRIEFS.slice(1).map((s) => ({ organization: s.org, problem: s.problem })),
  };
  return { student, instructor: { architecture: SME("solution architecture outline"), metricsRange: SME("expected metric ranges"), gradingNotes: SME("grading notes"), pitfalls: SME("common pitfalls"), oralCheckIn: [`Walk me through one design decision you'd change now.`, `Show a test that would fail if the rate limit were ignored.`, `Where does your system store secrets, and why there?`], seeds: "Personalized data seeds per learner or team." }, alignment: alignment(ctx, rubric.map((r, i) => ({ item: String(r.criterion), lo: ["LO1", "LO2", "LO4", "LO2", "LO3", "LO2", "LO4", "LO4"][i] }))) };
}

function genCapstone(ctx: Ctx) {
  const rubric = ["Problem complexity and framing", "Integration of program competencies", "Architecture and technical depth", "Constraints met (compliance, budget, scalability)", "Testing and quality", "Deployment and operations", "Security and responsible AI", "Documentation and stakeholder report", "Presentation and defense", "Teamwork and professionalism (peer evaluation)"].map((c) => ({ criterion: c, points: 10, levels: ["Exemplary 10", "Proficient 8", "Developing 5", "Beginning 2"] }));
  const options = [...SCENARIO_BRIEFS, { org: "Scholarion Demo University Library (sandbox)", problem: "a secure research-assistant pipeline over licensed open documents" }].map((s, i) => ({ option: i + 1, organization: s.org, problem: `${s.problem}, at enterprise scale`, stakeholders: SME("stakeholders"), data: "Synthetic, with data cards", scope: SME("technical scope"), constraints: ["Compliance brief (GDPR / HIPAA-style / NDPA guidelines provided; non-clinical scope where health-adjacent)", "Fixed cloud budget tier", "500 concurrent users, p95 < 800 ms", "Least privilege, secrets management, audit logs", "Sprint deadlines"], risks: SME("risk register starter") }));
  const student = {
    title: `Senior Capstone: ${ctx.program}`,
    duration: "8–15 weeks; teams of 3–5 (individual by approval)",
    pillars: PILLARS.senior_capstone,
    coverage: ctx.competencies.map((c) => ({ competency: c.id, text: c.text, evidence: SME("capstone evidence"), criterion: rubric[1].criterion })),
    roles: ["Lead", "Backend/AI", "Frontend", "DevOps", "QA/security", "Compliance"],
    options,
    proposalTemplate: ["Problem and stakeholders", "Scope and success metrics", "Data plan", "Risks and ethics/privacy plan", "Timeline"],
    approvalCriteria: ["Integrates every program competency", "Synthetic or licensed data only", "Feasible within the budget tier", "Clear definition of done"],
    phases: [["1 Proposal", "Scope, stakeholders, metrics, risk register, ethics/privacy plan", "Faculty approval"], ["2 Architecture", "Requirements, architecture diagram, ADRs, data and evaluation plan, cost estimate", "Design review"], ["3 Sprint 1", "MVP, CI pipeline, tests", "Sprint demo"], ["4 Sprint 2", "Full features, integrations, security hardening", "Sprint demo"], ["5 Scale & verify", "Load test vs targets, security scan, compliance checklist", "Verification review"], ["6 Deploy & document", "Live system, runbook, API/user docs, monitoring dashboard", "Technical review"], ["7 Defense", "20-min presentation + live demo + Q&A; final report (10–15 pp, APA)", "Capstone panel"], ["8 Portfolio", "Case study page/repo, role contributions, visuals, reflection", "Portfolio check"]].map(([p, d, g]) => ({ phase: p, deliverable: d, gate: g })),
    rubric,
    passThreshold: "70/100 overall with no criterion at Beginning; remediation: one resubmission of the failing phase within 2 weeks.",
    portfolio: ["Case-study template", "Resume bullets based on real deliverables (no inflated claims)", "Demo-video script outline", "Project summary"],
    aiPolicy: aiPolicy("senior_capstone"),
  };
  const defense = ["Why this architecture over the alternative you rejected?", "Which constraint was hardest to meet, and what did you trade off?", "Show the test that protects your most important behavior.", "How does the system fail safely when a dependency is down?", "Where is personal or sensitive data, and who can access it?", "What does your monitoring tell you in the first five minutes of an incident?", "How did you measure quality, and how was the measure validated?", "What would change at 10× the load?", "Which ADR would you revisit, and why?", "How did you handle disagreement on the team?", "What bias or fairness risk did you test for?", "How do you roll back a bad release?", "What did your stakeholders say, and what did you change?", "What did you personally build? Show it.", "What is the next most valuable feature, and how would you validate it?"];
  return { student, instructor: { exemplar: SME("exemplar outline for option 1"), calibration: rubric.slice(0, 3).map((r) => ({ criterion: r.criterion, notes: SME("sample performance descriptions per level") })), redFlags: ["Scope creep without a change request", "Integrity concerns (unexplained code, mismatched commit history)", "Uneven team contribution in logs and peer evaluations"], defenseBank: defense, facultyTimeline: ["Week 1 proposal review", "Week 3 design review", "Weeks 5 and 8 sprint demos", "Week 10 verification", "Week 12 defense panel"], supervisionKit: ["Weekly check-in agenda", "Milestone feedback templates", "Peer evaluation form", "Individual contribution statement"] }, alignment: alignment(ctx, ctx.competencies.map((c, i) => ({ item: c.id, lo: ctx.los[Math.min(i, ctx.los.length - 1)].id }))) };
}

function genSimLab(ctx: Ctx) {
  const libs = new Set(ctx.library.map((l) => l.key));
  const code = ctx.spec.code;
  const pick = SIM_SCENARIOS.find((s) => s.programs.includes(code) && s.libraryKeys.some((k) => libs.has(k))) ?? SIM_SCENARIOS.find((s) => s.programs.includes(code)) ?? SIM_SCENARIOS.find((s) => s.libraryKeys.some((k) => libs.has(k)));
  if (!pick) return { student: { title: `Simulated lab: ${ctx.topic}`, scenario: null, note: SME("no sandbox scenario fits this module yet — write a scenario config (tools, data, tasks, worksheet)") }, instructor: {}, alignment: [] };
  return {
    student: { title: `${ctx.module} — Simulated Student and Instructor Lab`, scenario: pick.key, scenarioTitle: pick.title, org: pick.org, pillars: PILLARS.simulated_lab, files: (["student", "instructor", "app"] as const).map((e) => ({ edition: e, file: simLabFileName(pick.key, e, ctx.week) })), worksheetQuestions: pick.worksheet.length, tasks: pick.tasks.map((t) => `${t.id} ${t.title}`), aiPolicy: aiPolicy("simulated_lab") },
    instructor: { banner: "INSTRUCTOR MODE — answer keys and control panel are visible on this screen; Switch to Student View before projecting student work.", controls: ["Switch to Student View", "Run reference solution", "Countdown timer", "Reset runs", "Open all hints"], worksheetKey: pick.worksheet.map((w, i) => ({ n: i + 1, answer: w.answer })) },
    alignment: pick.worksheet.map((w, i) => ({ item: `Worksheet ${i + 1}`, lo: w.lo, competency: ctx.competencies[i % Math.max(1, ctx.competencies.length)]?.id ?? "C1", bloom: w.bloom })),
  };
}

/* ---------------- drafts workflow ---------------- */

function smeSlots(v: unknown): number {
  return (JSON.stringify(v).match(/\[SME:/g) ?? []).length;
}

export function generateDraft(store: TenantStore, a: Actor, input: { offeringId: string; week: string; kind: DraftKind; n?: number }) {
  requireTenant(store, a, ["admin", "designer", "instructor"], "assess.generate");
  if (!KINDS.includes(input.kind)) throw new CampusError("invalid", "Choose what to generate.", 422);
  const ctx = contextHeader(store, input.offeringId, String(input.week));
  const n = Math.min(30, Math.max(5, Number(input.n ?? 10)));
  const out = input.kind === "lab" ? genLab(ctx) : input.kind === "activity" ? genActivity(ctx) : input.kind === "quiz" ? genQuiz(store, ctx, n) : input.kind === "exercises" ? genExercises(ctx) : input.kind === "mini_project" ? genMiniProject(ctx) : input.kind === "real_world_project" ? genRealWorld(ctx) : input.kind === "senior_capstone" ? genCapstone(ctx) : genSimLab(ctx);
  const { spec: _spec, ...header } = ctx;
  const content = { label: DRAFT_LABEL, context: header, ...out };
  const flags = copyCheck(store, JSON.stringify(out.student));
  return store.tx(() => {
    const row = store.insert("assessment_drafts", { offeringId: input.offeringId, week: String(input.week), kind: input.kind, title: `${KIND_LABEL[input.kind]} — ${ctx.program.split(" ")[0]} ${ctx.module}`, content, smeSlots: smeSlots(out), copyFlags: flags.map((f) => f.label), smeApprovedBy: null, idApprovedBy: null, state: "draft", publishedRef: null, courseId: ctx.courseId, moduleId: ctx.moduleId }, "asd");
    audit(store, a, "assess.generate", `assessment_drafts/${row.id}`, input.kind);
    return { id: row.id, title: row.title, smeSlots: row.smeSlots, copyFlags: row.copyFlags, label: DRAFT_LABEL };
  });
}

/** Replace [SME: …] slots: a JSON patch of path → text (paths like "student.background"). */
export function fillDraft(store: TenantStore, a: Actor, id: string, patch: Record<string, string>) {
  requireTenant(store, a, ["admin", "designer", "instructor"], "assess.fill");
  const d = store.get("assessment_drafts", id);
  if (!d) throw new CampusError("not_found", "Draft not found", 404);
  if (d.state === "published") throw new CampusError("conflict", "Published drafts are read-only; generate a new version.", 409);
  const content = JSON.parse(JSON.stringify(d.content)) as Record<string, unknown>;
  for (const [p, v] of Object.entries(patch ?? {})) {
    const keys = p.split(".");
    let o = content as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) {
      if (o[k] === undefined || typeof o[k] !== "object") throw new CampusError("invalid", `No field at ${p}.`, 422);
      o = o[k] as Record<string, unknown>;
    }
    if (!(keys[keys.length - 1] in o)) throw new CampusError("invalid", `No field at ${p}.`, 422);
    o[keys[keys.length - 1]] = String(v).slice(0, 4000);
  }
  return store.tx(() => store.update("assessment_drafts", id, { content, smeSlots: smeSlots({ student: content.student, instructor: content.instructor }), smeApprovedBy: null, idApprovedBy: null, copyFlags: copyCheck(store, JSON.stringify(content.student)).map((f) => f.label) }));
}

/** Two approvals: a subject-matter expert (instructor) and an instructional designer. */
export function approveDraft(store: TenantStore, a: Actor, id: string, as: "sme" | "id") {
  const d = store.get("assessment_drafts", id);
  if (!d) throw new CampusError("not_found", "Draft not found", 404);
  if (as === "sme" && !hasAny(a, ["admin", "instructor"]) && !(d.courseId && hasAny(a, ["instructor"], String(d.courseId)))) throw new CampusError("forbidden", "SME approval needs an instructor.", 403);
  if (as === "id" && !hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Instructional-designer approval needs a designer.", 403);
  if (Number(d.smeSlots) > 0) throw new CampusError("sme_slots_open", `${d.smeSlots} [SME] placeholder(s) still need expert writing.`, 409);
  if (((d.copyFlags as string[]) ?? []).length) throw new CampusError("copy_check", `Copy check: ${(d.copyFlags as string[]).join(", ")}.`, 422);
  const field = as === "sme" ? "smeApprovedBy" : "idApprovedBy";
  if (as === "id" && d.smeApprovedBy === a.id) throw new CampusError("conflict", "The instructional-designer approval must come from a different person than the SME approval.", 409);
  if (as === "sme" && d.idApprovedBy === a.id) throw new CampusError("conflict", "The SME approval must come from a different person than the designer approval.", 409);
  return store.tx(() => {
    const row = store.update("assessment_drafts", id, { [field]: a.id, state: (as === "sme" ? d.idApprovedBy : d.smeApprovedBy) ? "approved" : "in_review" });
    audit(store, a, `assess.approve_${as}`, `assessment_drafts/${id}`);
    return row;
  });
}

/** Publish an approved draft into its course: quizzes become a bank + quiz; projects and labs become assignments with rubrics. */
export function publishDraft(store: TenantStore, a: Actor, id: string) {
  requireTenant(store, a, ["admin", "designer"], "assess.publish");
  const d = store.get("assessment_drafts", id);
  if (!d) throw new CampusError("not_found", "Draft not found", 404);
  if (d.state !== "approved") throw new CampusError("not_approved", "Both SME and instructional-designer approvals are required before publishing.", 409);
  if (!d.courseId) throw new CampusError("no_course", "This module has no course shell yet.", 409);
  const c = d.content as { student: Record<string, unknown>; bank?: { items: { stem: string; options: Record<string, string>; correct: string[]; rationale_correct: string; type: string }[] } };
  return store.tx(() => {
    let ref: string;
    if (d.kind === "quiz" && c.bank) {
      const bank = store.insert("question_banks", { courseId: d.courseId, title: `${d.title} bank` }, "qb");
      for (const it of c.bank.items) store.insert("questions", { courseId: d.courseId, bankId: bank.id, kind: it.type === "true_false" ? "true_false" : "multiple_choice", prompt: it.stem, choices: Object.values(it.options), answer: it.options[it.correct[0]] ?? "", explanation: it.rationale_correct, points: 1, tags: [String(d.week)], version: 1 }, "qn");
      const n = (c.student.items as unknown[]).length;
      const qz = store.insert("quizzes", { courseId: d.courseId, moduleId: d.moduleId, title: String(c.student.title), bankId: bank.id, pools: [{ bankId: bank.id, tag: String(d.week), pick: n }], questionCount: n, timeLimitMin: Math.max(15, n * 2), allowedAttempts: 2, points: n, kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, state: "unpublished" }, "qz");
      ref = `quizzes/${qz.id}`;
    } else {
      const rubric = (c.student.rubric as { criterion: string; points: number }[] | undefined) ?? [];
      const rb = rubric.length ? store.insert("rubrics", { courseId: d.courseId, title: `${d.title} rubric`, style: "analytic", criteria: rubric.map((r, i) => ({ id: `c${i + 1}`, name: r.criterion, bands: [{ label: "Exemplary", points: r.points }, { label: "Proficient", points: Math.round(r.points * 0.8) }, { label: "Developing", points: Math.round(r.points * 0.5) }, { label: "Beginning", points: Math.round(r.points * 0.2) }] })), version: 1, state: "published" }, "rb") : null;
      const asg = store.insert("assignments", { courseId: d.courseId, moduleId: d.moduleId, title: String(c.student.title), instructions: `${KIND_LABEL[d.kind as DraftKind]}. Full instructions are in the attached student edition.`, points: rubric.reduce((s, r) => s + r.points, 0) || 20, submissionTypes: ["file", "url"], rubricId: rb?.id ?? null, state: "unpublished", gradingType: "points", tags: [String(d.kind)], studentEdition: c.student }, "asg");
      ref = `assignments/${asg.id}`;
    }
    const row = store.update("assessment_drafts", id, { state: "published", publishedRef: ref, publishedAt: nowIso() });
    audit(store, a, "assess.publish", `assessment_drafts/${id}`, ref);
    return { draft: row, created: ref, note: "Created unpublished in the course so an instructor can schedule it." };
  });
}

export function draftView(store: TenantStore, a: Actor, id: string, edition: "student" | "instructor") {
  const d = store.get("assessment_drafts", id);
  if (!d) throw new CampusError("not_found", "Draft not found", 404);
  if (edition === "instructor" || d.state !== "published") requireTenant(store, a, ["admin", "designer", "instructor"], "assess.view");
  const c = d.content as Record<string, unknown>;
  return { id: d.id, title: d.title, kind: d.kind, state: d.state, label: c.label, context: c.context, student: c.student, instructor: edition === "instructor" ? c.instructor : undefined, alignment: c.alignment, blueprint: c.blueprint, bank: edition === "instructor" ? c.bank : undefined, smeSlots: d.smeSlots, approvals: { sme: d.smeApprovedBy, id: d.idApprovedBy } };
}

/** QTI 2.1 assessment items for a quiz draft (instructor-only; contains answers). */
export function qtiXml(store: TenantStore, a: Actor, id: string) {
  requireTenant(store, a, ["admin", "designer", "instructor"], "assess.export");
  const d = store.get("assessment_drafts", id);
  if (!d || d.kind !== "quiz") throw new CampusError("not_found", "Quiz draft not found", 404);
  const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const bank = (d.content as { bank: { items: { id: string; stem: string; options: Record<string, string>; correct: string[] }[] } }).bank;
  const items = bank.items.map((it) => `  <assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="${x(it.id)}" title="${x(it.id)}" adaptive="false" timeDependent="false">
    <responseDeclaration identifier="RESPONSE" cardinality="${it.correct.length > 1 ? "multiple" : "single"}" baseType="identifier"><correctResponse>${it.correct.map((c) => `<value>${x(c)}</value>`).join("")}</correctResponse></responseDeclaration>
    <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float"/>
    <itemBody><choiceInteraction responseIdentifier="RESPONSE" shuffle="true" maxChoices="${it.correct.length > 1 ? 0 : 1}"><prompt>${x(it.stem)}</prompt>${Object.entries(it.options).map(([k, v]) => `<simpleChoice identifier="${x(k)}">${x(v)}</simpleChoice>`).join("")}</choiceInteraction></itemBody>
    <responseProcessing template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct"/>
  </assessmentItem>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${DRAFT_LABEL} · ${x(String(d.title))} -->\n<assessmentItems>\n${items}\n</assessmentItems>\n`;
}

export function draftsList(store: TenantStore, a: Actor, offeringId?: string) {
  requireTenant(store, a, ["admin", "designer", "instructor"], "assess.list");
  return store.list("assessment_drafts", (d) => !offeringId || d.offeringId === offeringId).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).map((d) => ({ id: d.id, title: String(d.title), kind: String(d.kind), state: String(d.state), smeSlots: Number(d.smeSlots ?? 0), copyFlags: (d.copyFlags as string[]) ?? [], sme: !!d.smeApprovedBy, designer: !!d.idApprovedBy, publishedRef: (d.publishedRef as string) ?? null, createdAt: String(d.createdAt) }));
}

export function studioPrograms(store: TenantStore) {
  return store.list("program_pages", (p) => p.state === "published").map((p) => {
    const spec = p.spec as ProgramSpec;
    return { offeringId: String(p.offeringId), code: spec.code, title: spec.title, weeks: spec.curriculum.map((w) => ({ week: w.week, title: w.title })) };
  }).sort((x, y) => Number(x.code.replace(/\D/g, "")) - Number(y.code.replace(/\D/g, "")) || x.code.localeCompare(y.code));
}
