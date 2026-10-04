import type { DataCard, ProgramSpec, ProjectSpec, WeekSpec } from "./programs-data";
import { LIBRARY } from "./programs-data-2";

/**
 * Program design packages for the 11 Scholaris AI Academy certificate programs (#1–#11).
 *
 * Everything here is derived deterministically from each program's catalog design (outcomes,
 * weeks, projects, tools, data cards). It produces the course-standard plan, the alignment matrix
 * with Bloom levels, per-module activity editions, notebooks or no-code walkthroughs, datasets
 * with full data cards, credential rules, career hooks, the evaluation plan and the instructor
 * guide. Every artifact is labelled AI DRAFT and needs SME and instructional-designer approval.
 */

export const DESIGN_CODES = ["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8", "#9", "#10", "#11"];
export const isDesignProgram = (code: string) => DESIGN_CODES.includes(code);
export const DRAFT = "AI DRAFT — requires SME and instructional-designer approval.";

/* ---------------- Bloom ---------------- */

export const BLOOM = ["", "Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
const VERBS: Record<number, string[]> = {
  1: ["define", "list", "recall", "identify", "name", "state", "recognize"],
  2: ["explain", "describe", "summarize", "classify", "interpret", "discuss", "outline", "understand"],
  3: ["apply", "use", "implement", "build", "construct", "configure", "run", "deploy", "ship", "execute", "operate", "automate", "prepare", "write", "set", "prompt", "train", "integrate", "connect", "create a", "complete", "perform"],
  4: ["analyze", "analyse", "differentiate", "examine", "map", "investigate", "compare", "measure", "test", "trace", "monitor", "debug", "troubleshoot", "interpret data", "diagnose", "model", "forecast", "calculate", "quantify"],
  5: ["evaluate", "assess", "justify", "critique", "judge", "recommend", "validate", "audit", "defend", "select", "choose", "decide", "prioritize", "govern", "secure", "benchmark", "review"],
  6: ["design", "create", "develop", "compose", "formulate", "plan", "produce", "propose", "architect", "author", "lead", "orchestrate", "engineer", "invent", "generate", "devise"],
};
export function bloomOf(outcome: string): { level: number; verb: string } {
  const first = outcome.trim().toLowerCase().replace(/[^a-z\s-]/g, "").split(/\s+/)[0] ?? "";
  for (let lvl = 6; lvl >= 1; lvl--) if (VERBS[lvl].some((v) => v === first)) return { level: lvl, verb: first };
  return { level: 3, verb: first || "apply" };
}

/** Highest Bloom level each assessment type can evidence. Recall-only items never evidence design or evaluation. */
export const BLOOM_CAP: Record<AssessmentKind, number> = { quiz: 3, activity: 4, lab: 4, assignment: 5, midterm_exam: 4, final_exam: 4, final_practical: 5, project: 6, midterm_project: 6, capstone: 6 };

/* ---------------- text helpers ---------------- */

const STOP = new Set("a an the and or of to in on for with by from into your you their its it as at be is are that this these those using use used via within over than then can will own one two three each per across through about without not no more most plus vs".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
export const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
const pad2 = (n: number | string) => String(n).padStart(2, "0");
const topicsOf = (focus: string) => focus.replace(/\.$/, "").split(/[,;]|\band\b|—|–/).map((x) => x.trim()).filter((x) => x.length > 2).slice(0, 6);
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

/* ---------------- tracks ---------------- */

export type DeliveryTrack = "Builder" | "No-Code" | "Business & Leadership" | "Industry";
export function trackOf(spec: ProgramSpec): DeliveryTrack {
  if (spec.code === "#1") return "Builder";
  const t = spec.catalogTrack ?? (/no-code/i.test(spec.track) ? "No-Code" : /industry|finance|health/i.test(spec.track) ? "Industry" : /business|leader/i.test(spec.track) ? "Business & Leadership" : "Builder");
  return t === "Data" || t === "Product" ? "Builder" : (t as DeliveryTrack);
}
/** Builder and Industry tracks work in notebooks; No-Code and Business tracks use tool walkthroughs with a reference build. */
export const usesNotebooks = (spec: ProgramSpec) => ["Builder", "Industry"].includes(trackOf(spec));
export const targetHours = (spec: ProgramSpec) => (trackOf(spec) === "Builder" ? [6, 10] : [4, 6]);

/* ---------------- course standard ---------------- */

export type StandardName = "10-week block" | "10-week block (capstone defense replaces final)" | "Extended block (capstone weeks)" | "Scaled 6-week standard";
export interface StandardCounts {
  modules: number;
  assignments: number;
  labs: number;
  projects: number;
  quizzes: number;
  midterm: boolean;
  final: "exam" | "capstone_defense" | "final_practical";
}
export interface BlockPlan {
  key: string;
  title: string;
  standard: StandardName;
  counts: StandardCounts;
  weeks: string[];
}

export type AssessmentKind = "quiz" | "activity" | "lab" | "assignment" | "midterm_exam" | "final_exam" | "final_practical" | "project" | "midterm_project" | "capstone";
export type AiPolicy = "Not allowed" | "Allowed with disclosure" | "Allowed";
export const AI_POLICY: Record<AssessmentKind, AiPolicy> = {
  quiz: "Not allowed",
  midterm_exam: "Not allowed",
  final_exam: "Not allowed",
  final_practical: "Allowed with disclosure",
  activity: "Allowed with disclosure",
  lab: "Allowed with disclosure",
  assignment: "Allowed with disclosure",
  project: "Allowed with disclosure",
  midterm_project: "Allowed with disclosure",
  capstone: "Allowed with disclosure",
};
export const AI_POLICY_TEXT: Record<AiPolicy, string> = {
  "Not allowed": "AI use is not allowed. Work on your own; the AI Teaching Assistant won't help with this item while it's open.",
  "Allowed with disclosure": "AI tools are allowed for brainstorming, debugging and drafting if you disclose them: name the tool, what you asked and what you changed. You must be able to explain every line you submit.",
  Allowed: "AI tools are allowed; cite them as you would any source.",
};

export interface PlannedAssessment {
  id: string;
  kind: AssessmentKind;
  block: string;
  week: string;
  title: string;
  weight: number;
  outcomes: string[];
  bloomCap: number;
  aiPolicy: AiPolicy;
  fromSpec: boolean;
  /** Added by the alignment fixer — flagged for review. */
  addedForCoverage?: string[];
  description: string;
}

export interface WeekPlan {
  week: string;
  n: number;
  block: string;
  title: string;
  topics: string[];
  outcomes: string[];
  readings: string[];
  lab: string | null;
  activity: string;
  assessments: string[];
  liveSession: string;
  hours: number;
  kind?: WeekSpec["kind"];
  optional?: boolean;
}

/* ---------------- outcomes ---------------- */

export interface OutcomeDef {
  id: string;
  text: string;
  bloom: number;
  bloomName: string;
  verb: string;
}
export const outcomesOf = (spec: ProgramSpec): OutcomeDef[] =>
  spec.outcomes.map((t, i) => {
    const b = bloomOf(t);
    return { id: `C${i + 1}`, text: t, bloom: b.level, bloomName: BLOOM[b.level], verb: b.verb };
  });

function bestOutcomes(text: string, outs: OutcomeDef[], max = 2): string[] {
  const tk = tokens(text);
  const scored = outs.map((o) => ({ id: o.id, s: overlap(tk, tokens(o.text)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x) => x.id);
}

/* ---------------- the plan ---------------- */

const weekN = (w: string) => Number(String(w).replace(/[^0-9]/g, "")) || 0;
const spread = <T,>(arr: T[], n: number): T[] => {
  if (n <= 0 || !arr.length) return [];
  if (n >= arr.length) return arr.slice();
  return Array.from({ length: n }, (_x, i) => arr[Math.min(arr.length - 1, Math.round(((i + 0.5) * arr.length) / n - 0.5))]);
};

export function blockPlan(spec: ProgramSpec): BlockPlan[] {
  const core = spec.curriculum.filter((w) => !w.optional);
  const blocks = spec.blocks.map((b) => ({ ...b, weeks: core.filter((w) => (w.block ?? spec.blocks[0].key) === b.key).map((w) => w.week) }));
  return blocks.map((b, i) => {
    const n = b.weeks.length;
    let standard: StandardName;
    let counts: StandardCounts;
    if (spec.weeks <= 6) {
      standard = "Scaled 6-week standard";
      counts = { modules: n, assignments: 3, labs: 2, projects: 1, quizzes: n, midterm: false, final: "final_practical" };
    } else if (blocks.length >= 2) {
      const last = i === blocks.length - 1;
      standard = last ? "10-week block (capstone defense replaces final)" : "10-week block";
      counts = { modules: n, assignments: 5, labs: 3, projects: 2, quizzes: Math.min(8, n - 1), midterm: true, final: last ? "capstone_defense" : "exam" };
    } else if (spec.weeks >= 12) {
      standard = "Extended block (capstone weeks)";
      counts = { modules: n, assignments: 5, labs: 3, projects: 2, quizzes: 8, midterm: true, final: "exam" };
    } else {
      standard = "10-week block";
      counts = { modules: n, assignments: 5, labs: 3, projects: 2, quizzes: 8, midterm: true, final: "exam" };
    }
    return { key: b.key, title: b.title, standard, counts, weeks: b.weeks };
  });
}

export interface ProgramDesign {
  code: string;
  slug: string;
  title: string;
  track: DeliveryTrack;
  notebooks: boolean;
  status: string;
  outcomes: OutcomeDef[];
  blocks: BlockPlan[];
  weeks: WeekPlan[];
  assessments: PlannedAssessment[];
  matrix: { outcome: string; introduced: string | null; developed: string | null; mastered: string | null; assessments: string[]; maxCap: number }[];
  issues: { kind: "orphan_outcome" | "orphan_assessment" | "bloom_mismatch" | "over_assessed" | "under_assessed"; target: string; detail: string; fix: string }[];
  datasets: DatasetDef[];
  credential: CredentialDef;
  career: CareerHooks;
  evaluation: EvaluationPlan;
  industryRules: string[];
}

export function designFor(spec: ProgramSpec): ProgramDesign {
  const outs = outcomesOf(spec);
  const blocks = blockPlan(spec);
  const weekSpec = new Map(spec.curriculum.map((w) => [w.week, w]));
  const assessments: PlannedAssessment[] = [];
  let seq = 0;
  const add = (a: Omit<PlannedAssessment, "id" | "bloomCap" | "aiPolicy">) => {
    const id = `${a.kind.toUpperCase().replace(/_/g, "-")}-${a.block}${++seq}`;
    assessments.push({ ...a, id, bloomCap: BLOOM_CAP[a.kind], aiPolicy: AI_POLICY[a.kind] });
    return id;
  };

  for (const b of blocks) {
    const ws = b.weeks.map((w) => weekSpec.get(w)!);
    const regular = ws.filter((w) => !w.kind);
    const mid = ws.find((w) => w.kind === "midterm") ?? ws[Math.floor(ws.length / 2) - 1];
    const last = ws[ws.length - 1];
    // Projects from the catalog design first.
    const specProjects = spec.projects.filter((p) => b.weeks.includes(p.week) || (!weekSpec.has(p.week) && b.weeks.includes(String(weekN(p.week)))));
    for (const p of specProjects) add({ kind: p.kind === "capstone" ? "capstone" : p.kind === "midterm" ? "midterm_project" : "project", block: b.key, week: p.week, title: p.name, weight: 0, outcomes: [], fromSpec: true, description: p.description });
    const projectCount = specProjects.filter((p) => p.kind !== "capstone").length;
    for (let k = projectCount; k < b.counts.projects; k++) {
      const wk = spread(regular, b.counts.projects)[k] ?? regular[regular.length - 1];
      if (!wk) break;
      add({ kind: "project", block: b.key, week: wk.week, title: `Applied project: ${wk.title}`, weight: 0, outcomes: [], fromSpec: false, description: `A short applied project on "${wk.title}": ${wk.focus} Deliver a working artifact, a one-page write-up and evidence it meets a stated definition of done.` });
    }
    for (const w of spread(b.standard === "Scaled 6-week standard" ? ws : regular, b.counts.quizzes)) add({ kind: "quiz", block: b.key, week: w.week, title: `Week ${w.week} quiz: ${w.title}`, weight: 0, outcomes: [], fromSpec: false, description: `Scenario-based knowledge check on ${w.focus.replace(/\.$/, "").toLowerCase()}. Randomized from a pool of twice the items shown.` });
    const existingLabs = ws.filter((w) => w.dual || w.labs || w.sessions).length;
    for (const w of spread(regular.filter((x) => !x.dual), Math.max(0, b.counts.labs - existingLabs))) add({ kind: "lab", block: b.key, week: w.week, title: `Lab ${pad2(w.week)}: ${w.title}`, weight: 0, outcomes: [], fromSpec: false, description: usesNotebooks(spec) ? `Notebook lab in the Scholaris Cloud Lab (or Colab): ${w.focus}` : `Guided tool walkthrough with a completed reference build: ${w.focus}` });
    for (const w of ws.filter((x) => x.dual)) add({ kind: "lab", block: b.key, week: w.week, title: `Lab ${pad2(w.week)}: ${w.title} (PyTorch or TensorFlow/Keras)`, weight: 0, outcomes: [], fromSpec: true, description: w.focus });
    for (const w of spread(regular, b.counts.assignments)) add({ kind: "assignment", block: b.key, week: w.week, title: `Assignment: ${w.title} on a larger dataset`, weight: 0, outcomes: [], fromSpec: false, description: `Enhanced assignment with a step-by-step walkthrough on a larger synthetic dataset: ${w.focus}` });
    if (b.counts.midterm && mid) add({ kind: "midterm_exam", block: b.key, week: mid.week, title: `${b.key === "A" && blocks.length > 1 ? "Block A " : ""}Midterm exam`, weight: 0, outcomes: [], fromSpec: false, description: "Timed exam with scenario items drawn from the block's item banks." });
    if (b.counts.final === "exam" && last) add({ kind: "final_exam", block: b.key, week: last.week, title: `${blocks.length > 1 ? `Block ${b.key} ` : ""}Final exam`, weight: 0, outcomes: [], fromSpec: false, description: "Cumulative exam with scenario items from every week of the block." });
    if (b.counts.final === "final_practical" && last) add({ kind: "final_practical", block: b.key, week: last.week, title: "Final practical assessment", weight: 0, outcomes: [], fromSpec: false, description: "Hands-on practical: rebuild and explain one workflow from the program under time and scope constraints." });
    for (const w of ws.filter((x) => !x.kind)) add({ kind: "activity", block: b.key, week: w.week, title: `In-Class Activity — Week ${w.week}: ${w.title}`, weight: 0, outcomes: [], fromSpec: true, description: w.focus });
  }

  // Alignment: map each assessment to outcomes by content, respecting Bloom caps.
  const textOf = (a: PlannedAssessment) => {
    const p = spec.projects.find((x) => x.name === a.title);
    const w = weekSpec.get(a.week);
    return `${a.title} ${a.description} ${w?.title ?? ""} ${w?.focus ?? ""} ${p ? `${p.skills.join(" ")} ${(p.requirements ?? []).join(" ")}` : ""}`;
  };
  for (const a of assessments) {
    const max = a.kind === "capstone" ? 5 : a.kind === "project" || a.kind === "midterm_project" ? 3 : 2;
    a.outcomes = bestOutcomes(textOf(a), outs, max);
  }
  // Fix coverage: any outcome without an assessment at or above its Bloom level gets the closest project/capstone.
  const issues: ProgramDesign["issues"] = [];
  for (const o of outs) {
    const covering = assessments.filter((a) => a.outcomes.includes(o.id));
    if (!covering.length) issues.push({ kind: "orphan_outcome", target: o.id, detail: `${o.id} has no assessment.`, fix: "Linked to the capstone; reviewer to confirm a capstone criterion assesses it." });
    else if (!covering.some((a) => a.bloomCap >= o.bloom)) issues.push({ kind: "bloom_mismatch", target: o.id, detail: `${o.id} is a ${o.bloomName}-level outcome but is only assessed by ${[...new Set(covering.map((a) => a.kind))].join(", ")} (max ${BLOOM[Math.max(...covering.map((a) => a.bloomCap))]}).`, fix: "Linked to the capstone/project that can evidence this level; reviewer to add a matching rubric criterion." });
    if (!covering.some((a) => a.bloomCap >= o.bloom)) {
      const target = assessments.find((a) => a.kind === "capstone") ?? assessments.filter((a) => a.kind === "project" || a.kind === "midterm_project").pop();
      if (target) {
        target.outcomes.push(o.id);
        (target.addedForCoverage ??= []).push(o.id);
      }
    }
  }
  for (const a of assessments) {
    if (!a.outcomes.length) {
      const w = weekSpec.get(a.week);
      const near = bestOutcomes(`${w?.title ?? ""} ${spec.title}`, outs, 1);
      a.outcomes = near.length ? near : [outs[(weekN(a.week) + outs.length - 1) % outs.length].id];
      (a.addedForCoverage ??= []).push(...a.outcomes);
      issues.push({ kind: "orphan_assessment", target: a.id, detail: `${a.title} didn't match an outcome by content.`, fix: `Linked to ${a.outcomes.join(", ")} by week; reviewer to confirm.` });
    }
  }
  const counts = outs.map((o) => assessments.filter((a) => a.outcomes.includes(o.id)).length);
  const mean = counts.reduce((x, y) => x + y, 0) / Math.max(1, counts.length);
  outs.forEach((o, i) => {
    if (counts[i] > mean * 2.2 && counts[i] > 8) issues.push({ kind: "over_assessed", target: o.id, detail: `${o.id} is assessed ${counts[i]} times (average ${mean.toFixed(1)}).`, fix: "Consider moving some checks to under-assessed outcomes." });
    if (counts[i] < Math.max(2, mean * 0.35)) issues.push({ kind: "under_assessed", target: o.id, detail: `${o.id} is assessed only ${counts[i]} time(s) (average ${mean.toFixed(1)}).`, fix: "Add a practice check or project criterion for this outcome." });
  });

  // Weights by kind, normalised to 100 per block.
  const W: Record<AssessmentKind, number> = { activity: 1, quiz: 1.25, lab: 3, assignment: 3, midterm_exam: 7, final_exam: 8, final_practical: 12, project: 8, midterm_project: 10, capstone: 20 };
  for (const b of blocks) {
    const list = assessments.filter((a) => a.block === b.key);
    const total = list.reduce((s, a) => s + W[a.kind], 0);
    let acc = 0;
    list.forEach((a, i) => {
      a.weight = i === list.length - 1 ? Math.round((100 - acc) * 10) / 10 : Math.round(((W[a.kind] / total) * 100) * 10) / 10;
      acc += a.weight;
    });
  }

  // Weeks.
  const [hLo, hHi] = spec.hoursPerWeek ?? targetHours(spec);
  const weeks: WeekPlan[] = spec.curriculum.map((w) => {
    const lib = (w.lib ?? []).map((k) => LIBRARY.find((l) => l.key === k)).filter(Boolean);
    const readings = [...new Set([...lib.filter((l) => l!.textbook).map((l) => `${l!.textbook} (shared module: ${l!.title})`), ...(weekN(w.week) <= 2 ? spec.textbooks ?? [] : []), ...lib.filter((l) => !l!.textbook).map((l) => `Scholaris library module: ${l!.title} v${l!.version}`)])];
    if (!readings.length) readings.push("Instructor-selected reading — SME to confirm a verified source (official documentation or an open-access article).");
    const mine = assessments.filter((a) => a.week === w.week);
    const lab = mine.find((a) => a.kind === "lab");
    return {
      week: w.week,
      n: weekN(w.week),
      block: w.block ?? spec.blocks[0].key,
      title: w.title,
      topics: topicsOf(w.focus),
      outcomes: [...new Set([...bestOutcomes(`${w.title} ${w.focus}`, outs, 2), ...mine.flatMap((a) => a.outcomes)])].sort(),
      readings,
      lab: lab?.title ?? (w.sessions ? `Session labs: ${w.sessions.join(" / ")}` : w.labs ? `Labs: ${w.labs.join(" / ")}` : null),
      activity: w.kind ? (w.kind === "capstone" ? "Capstone defense and demo day" : "Midterm build and review") : `In-Class Activity — ${w.title}`,
      assessments: mine.filter((a) => a.kind !== "activity").map((a) => a.id),
      liveSession: w.sessions ? w.sessions.join(" · ") : w.kind === "capstone" ? "Capstone demo day: live defenses to a faculty panel" : w.kind === "midterm" ? "Midterm studio: build clinic and review" : `Live session: ${w.title} — concept walkthrough, live build and Q&A`,
      hours: Math.round(((hLo + hHi) / 2) * 10) / 10,
      kind: w.kind,
      optional: w.optional,
    };
  });

  // Scaffolding per outcome: introduced → developed → mastered.
  const matrix = outs.map((o) => {
    const touched = weeks.filter((w) => w.outcomes.includes(o.id)).map((w) => w.week);
    const as = assessments.filter((a) => a.outcomes.includes(o.id));
    return { outcome: o.id, introduced: touched[0] ?? null, developed: touched[Math.floor(touched.length / 2)] ?? null, mastered: as.filter((a) => a.bloomCap >= o.bloom).map((a) => a.week).pop() ?? null, assessments: as.map((a) => a.id), maxCap: Math.max(0, ...as.map((a) => a.bloomCap)) };
  });

  return {
    code: spec.code,
    slug: spec.slug,
    title: spec.title,
    track: trackOf(spec),
    notebooks: usesNotebooks(spec),
    status: DRAFT,
    outcomes: outs,
    blocks,
    weeks,
    assessments,
    matrix,
    issues,
    datasets: spec.dataCards.map((d) => datasetDef(spec, d)),
    credential: credentialDef(spec, outs),
    career: careerHooks(spec, outs),
    evaluation: evaluationPlan(spec, outs),
    industryRules: INDUSTRY_RULES[spec.code]?.map((r) => r.rule) ?? [],
  };
}

/* ---------------- datasets ---------------- */

export interface DatasetDef {
  key: string;
  name: string;
  file: string;
  rows: number;
  fields: { name: string; type: string }[];
  license: string;
  source: string;
  intendedUse: string;
  knownBiases: string;
  caveats: string;
  synthetic: true;
  seed: number;
}

function fieldType(f: string): string {
  const n = f.toLowerCase();
  if (/(^|_)id$|_id$|^id$/.test(n)) return "id";
  if (/date|_at$|time|month|period|week/.test(n)) return "date";
  if (/amount|price|cost|revenue|balance|fee|total|value|spend|budget|salary|income/.test(n)) return "money";
  if (/score|rate|pct|percent|prob|ratio|confidence|accuracy/.test(n)) return "ratio";
  if (/count|qty|quantity|minutes|hours|days|age|rows|tokens|latency|duration|size|number/.test(n)) return "count";
  if (/^is_|flag|label|fraud|churn|approved|passed|resolved|escalated|match/.test(n)) return "flag";
  if (/text|description|note|body|message|comment|summary|question|answer|query|document|content|request|ticket|review/.test(n)) return "text";
  return "category";
}

export function datasetDef(spec: ProgramSpec, d: DataCard): DatasetDef {
  const fields = d.fields.map((f) => ({ name: f.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "field", type: fieldType(f) }));
  let seed = 0;
  for (const ch of `${spec.code}:${d.key}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    key: d.key,
    name: d.name,
    file: `datasets/${slugify(d.key)}.csv`,
    rows: Math.min(5000, Math.max(50, d.rows)),
    fields,
    license: "CC0 1.0 — synthetic data generated by Scholarion; no real people, organizations, patients or accounts.",
    source: d.source,
    intendedUse: `${d.purpose}. Teaching and practice only — not for real decisions about people, money or health.`,
    knownBiases: `${d.caveats} Values are drawn from simple, near-uniform distributions, so category balance, correlations and edge cases are artificial and don't reflect any real population.`,
    caveats: d.caveats,
    synthetic: true,
    seed,
  };
}

/** Deterministic synthetic CSV for a dataset (same seed → same file). */
export function datasetCsv(ds: DatasetDef, maxRows = ds.rows): string {
  let s = ds.seed || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const words = [...tokens(`${ds.name} ${ds.intendedUse}`)].filter((w) => /^[a-z]+$/.test(w) && w.length > 3).slice(0, 12);
  const vocab = words.length >= 4 ? words : ["request", "account", "service", "process", "update", "review"];
  const cats: Record<string, string[]> = {};
  const catFor = (name: string) => (cats[name] ??= Array.from({ length: 4 + Math.floor(rnd() * 3) }, (_x, i) => `${name.replace(/_/g, " ").split(" ").pop()}_${String.fromCharCode(65 + i)}`));
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const start = Date.UTC(2025, 0, 1);
  const lines = [ds.fields.map((f) => f.name).join(",")];
  for (let r = 1; r <= Math.min(maxRows, ds.rows); r++) {
    lines.push(
      ds.fields
        .map((f) => {
          switch (f.type) {
            case "id":
              return `${f.name.replace(/_?id$/, "").slice(0, 3).toUpperCase() || "ID"}-${String(r).padStart(5, "0")}`;
            case "date":
              return new Date(start + Math.floor(rnd() * 540) * 86_400_000).toISOString().slice(0, 10);
            case "money":
              return (Math.round((20 + rnd() * rnd() * 4980) * 100) / 100).toFixed(2);
            case "ratio":
              return (Math.round(rnd() * 1000) / 1000).toString();
            case "count":
              return String(Math.floor(rnd() * rnd() * 120));
            case "flag":
              return rnd() < 0.18 ? "1" : "0";
            case "text":
              return esc(`Synthetic ${pick(vocab)} note about ${pick(vocab)} and ${pick(vocab)} (record ${r})`);
            default:
              return pick(catFor(f.name));
          }
        })
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function dataCardMd(ds: DatasetDef, spec: ProgramSpec) {
  return `# Data card — ${ds.name}\n\n${DRAFT}\n\n| Item | Detail |\n|---|---|\n| Program | ${spec.code} ${spec.title} |\n| File | \`${ds.file}\` |\n| Rows | ${ds.rows} |\n| Source | ${ds.source} |\n| License | ${ds.license} |\n| Intended use | ${ds.intendedUse} |\n| Known biases and limits | ${ds.knownBiases} |\n| Personal data | None. Every value is generated. |\n| Generator seed | ${ds.seed} (re-running the generator gives the same file) |\n\n## Fields\n\n| Field | Type |\n|---|---|\n${ds.fields.map((f) => `| ${f.name} | ${f.type} |`).join("\n")}\n`;
}

/* ---------------- credential ---------------- */

export interface CredentialDef {
  certificate: string;
  badge: string;
  completion: string[];
  achievement: Record<string, unknown>;
  skillBadge: Record<string, unknown>;
}
const OB3 = ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"];
function credentialDef(spec: ProgramSpec, outs: OutcomeDef[]): CredentialDef {
  const capstone = spec.projects.find((p) => p.kind === "capstone");
  const criteriaUrl = `/campus/academy/programs/${spec.slug}#credential`;
  const completion = [
    "An overall grade of at least 70%.",
    "Every lab submitted.",
    `The capstone (${capstone?.name ?? "final project"}) passed against its rubric, with a live or recorded defense.`,
    "At least 80% attendance or participation in live and mentored sessions, or an approved asynchronous alternative.",
    "Outcome mastery (70%+) on each program competency before the capstone; learners below mastery complete Mastery Path remediation first.",
  ];
  const skills = [...new Set(spec.projects.flatMap((p) => p.skills))].slice(0, 12);
  return {
    certificate: spec.credential.certificate,
    badge: spec.credential.badge,
    completion,
    achievement: {
      "@context": OB3,
      id: criteriaUrl,
      type: ["Achievement"],
      achievementType: "Certificate",
      name: spec.credential.certificate,
      description: `${spec.valueStatement} Non-credit certificate of completion issued by Scholaris AI Academy.`,
      criteria: { id: criteriaUrl, narrative: completion.join(" ") },
      alignment: outs.map((o) => ({ type: ["Alignment"], targetName: `${o.id}: ${o.text}`, targetType: "Competency", targetUrl: `${criteriaUrl}-${o.id.toLowerCase()}` })),
      tag: skills,
      creator: { type: ["Profile"], name: "Scholaris AI Academy" },
    },
    skillBadge: {
      "@context": OB3,
      id: `${criteriaUrl}-capstone`,
      type: ["Achievement"],
      achievementType: "Badge",
      name: spec.credential.badge,
      description: `Capstone skill badge: ${capstone?.description ?? spec.valueStatement}`,
      criteria: { narrative: `Capstone "${capstone?.name ?? "final project"}" passed against its rubric and defended. Evidence: link to the capstone repository or recording, shared by the learner.` },
      tag: capstone?.skills ?? skills,
    },
  };
}

/* ---------------- career hooks ---------------- */

export interface CareerHooks {
  portfolio: { item: string; evidence: string }[];
  resumeBullets: string[];
  interviewPrompts: string[];
  roles: string[];
  note: string;
}
const ROLES: Record<string, string[]> = {
  "#1": ["AI engineer", "Agent platform engineer", "ML engineer (LLM systems)", "Applied AI developer"],
  "#2": ["Applied AI developer", "LLM application engineer", "Software engineer (AI features)"],
  "#3": ["Machine learning engineer", "Data scientist", "Applied AI developer"],
  "#4": ["Software engineer", "DevOps / platform engineer", "Developer productivity engineer"],
  "#5": ["Business analyst", "AI operations analyst", "Automation specialist"],
  "#6": ["Knowledge management specialist", "Workflow automation specialist", "Operations analyst"],
  "#7": ["Any knowledge worker", "Team lead", "Project coordinator"],
  "#8": ["Operations manager", "Process improvement lead", "Customer operations lead"],
  "#9": ["AI program lead", "Product or strategy leader", "Transformation lead"],
  "#10": ["Finance operations analyst", "Risk or compliance analyst", "Controller / reconciliation lead"],
  "#11": ["Healthcare operations analyst", "Revenue-cycle specialist", "Practice administrator"],
};
function careerHooks(spec: ProgramSpec, outs: OutcomeDef[]): CareerHooks {
  const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  return {
    portfolio: spec.projects.map((p) => ({ item: p.name, evidence: `${p.kind === "capstone" ? "Capstone repository, evaluation report and defense recording" : "Project repository or build and a one-page write-up"} (${p.skills.join(", ")})` })),
    resumeBullets: spec.projects.map((p) => `Built ${lc(p.name)} — ${lc(p.description.replace(/\.$/, ""))}; demonstrated ${p.skills.slice(0, 3).join(", ")}.`),
    interviewPrompts: outs.map((o) => `Walk me through a time you had to ${lc(o.text.replace(/\.$/, ""))} — what did you decide, how did you measure it, and what would you change?`),
    roles: ROLES[spec.code] ?? [],
    note: "Roles where these skills are used. Career services are services offered (portfolio review, mock interviews, job-search coaching); no placement, salary or job outcome is promised.",
  };
}

/* ---------------- evaluation plan ---------------- */

export interface EvaluationPlan {
  prePost: { outcome: string; items: number; bloom: string }[];
  survey: string[];
  analytics: string[];
  remediation: string;
}
function evaluationPlan(spec: ProgramSpec, outs: OutcomeDef[]): EvaluationPlan {
  return {
    prePost: outs.map((o) => ({ outcome: o.id, items: 2, bloom: o.bloomName })),
    survey: ["The module's goals were clear. (1–5)", "The hands-on work helped me learn. (1–5)", "The time needed matched the stated hours. (1–5)", "Materials were accessible to me. (1–5)", "I could get help when I needed it. (1–5)", "What one change would most improve this module? (open)"],
    analytics: ["Module completion and drop-off", "Mastery by competency (C1–C5) from rubric criteria and quiz items", "Time-on-task vs the stated weekly hours", "Lab first-attempt pass rate and common failure points", "Pre/post skills gain per competency", "Completion and credential rates by cohort"],
    remediation: `Learners below 70% mastery on any competency are routed to a Mastery Path (targeted practice and a re-check) before the ${spec.projects.some((p) => p.kind === "capstone") ? "capstone" : "final project"}.`,
  };
}

/* ---------------- industry boundaries ---------------- */

export const INDUSTRY_RULES: Record<string, { rule: string; forbidden: RegExp }[]> = {
  "#10": [{ rule: "No personalized investment-advice agents built by learners.", forbidden: /\b(personali[sz]ed investment advice|recommend(s|ing)? (stocks|securities|investments) to (individuals|clients|customers)|robo-?advis[eo]r|buy\/sell recommendations? for (individual|client))\b/i }],
  "#11": [{ rule: "No diagnostic or treatment-decision agents built by learners; clinical AI is covered only as evaluation, regulation and governance.", forbidden: /\b(diagnos(e|es|ing|tic agent)|treatment (decision|recommendation|plan) (agent|bot|tool)|prescrib(e|ing)|clinical decision-?making agent)\b/i }],
};
/** Text a learner builds against (capstone and project briefs, requirements, week focus) must not ask for a forbidden agent unless it is clearly negated. */
export function boundaryViolations(spec: ProgramSpec): string[] {
  const rules = INDUSTRY_RULES[spec.code] ?? [];
  const texts = [...spec.projects.map((p) => `${p.name}. ${p.description} ${(p.requirements ?? []).join(". ")}`), ...spec.curriculum.map((w) => w.focus)];
  const out: string[] = [];
  for (const r of rules) {
    for (const t of texts) {
      for (const sentence of t.split(/(?<=[.;])\s+/)) {
        if (r.forbidden.test(sentence) && !/\b(no|not|never|without|isn't|aren't|don't|doesn't|must not|excluded|outside the scope|only (as|how)|evaluat|govern|regulat)\b/i.test(sentence)) out.push(`${r.rule} Found: "${sentence.trim().slice(0, 160)}"`);
      }
    }
  }
  return out;
}

/* ---------------- module package content ---------------- */

const SUBMISSION = [
  "2–3-page APA paper with embedded code (where applicable), explanations and output screenshots.",
  "References and citations (APA 7).",
  "Upload via the Scholarion LMS as Word or PDF.",
  "Due Sunday 11:59 PM (US Eastern).",
];

export interface ActivityEditions {
  student: string;
  instructor: string;
  title: string;
}
const MISTAKES: [RegExp, string][] = [
  [/prompt|instruction/i, "Changing several prompt parts at once, so no one knows which change helped; no fixed evaluation set."],
  [/rag|retriev|embedding|vector|chunk/i, "Chunks too large or too small; judging retrieval by eye instead of measuring recall and citation accuracy."],
  [/agent|tool|function/i, "Tools without typed inputs or stop rules; letting the agent take irreversible actions without a human approval step."],
  [/eval|test|measur|judge/i, "Tiny evaluation sets, no baseline, and LLM-as-judge scores used without human calibration."],
  [/secur|inject|guardrail|privacy|govern/i, "Treating retrieved text as instructions; over-broad tool permissions; secrets pasted into notebooks."],
  [/data|dataset|feature|clean/i, "Leaking test data into training; ignoring missing values and class imbalance."],
  [/model|train|neural|learn/i, "No train/validation split; reporting accuracy on imbalanced data; not fixing seeds."],
  [/deploy|api|app|ship|ci|devops/i, "Hard-coded keys, no health check, and no rollback path."],
  [/workflow|automation|no-code|process/i, "Automating a broken process; no owner for exceptions; no log of what the automation did."],
  [/finance|fraud|reconcil|risk/i, "No audit trail; thresholds set without a stated false-positive budget; treating the model as the decision-maker."],
  [/health|patient|claims|scheduling|clinical/i, "Using realistic-looking patient details; letting an operations tool drift into clinical judgement."],
  [/strategy|roi|leader|business|value/i, "ROI cases without a baseline or adoption cost; no named owner or governance step."],
];
export const commonMistakes = (text: string) => {
  const out = MISTAKES.filter(([re]) => re.test(text)).map(([, m]) => m).slice(0, 3);
  return out.length ? out : ["Skipping the definition of done; not stating assumptions and limits in the write-up."];
};

export function activityEditions(spec: ProgramSpec, d: ProgramDesign, w: WeekPlan): ActivityEditions {
  const outs = d.outcomes.filter((o) => w.outcomes.includes(o.id));
  const ds = d.datasets[0];
  const nb = d.notebooks;
  const title = `${w.title} — Hands-on In-Class Activity`;
  const step2 = nb
    ? [`Open \`Week_${pad2(w.week)}_Student_Starter_TODO.ipynb\` in the Scholaris Cloud Lab (or Colab) and complete each TODO.`, `**Resources provided:** Student Starter TODO notebook; Instructor Solution notebook (EXECUTED, released by your instructor after the due date); dataset \`${ds?.file ?? "datasets/…csv"}\` with its data card.`]
    : [`Follow \`Week_${pad2(w.week)}_Tool_Walkthrough.md\` step by step in the approved no-code tool, then compare your build with the completed reference build.`, `**Resources provided:** tool walkthrough (screenshots are added when the tool version is pinned); completed reference build description; dataset \`${ds?.file ?? "datasets/…csv"}\` with its data card.`];
  const body = (instructor: boolean) =>
    [
      `# ${title}`,
      `${spec.code} ${spec.title} · Week ${w.week}${w.block ? ` · Block ${w.block}` : ""}`,
      `> ${DRAFT}${instructor ? " INSTRUCTOR EDITION — contains answers and facilitation notes." : " STUDENT EDITION — no answers."}`,
      "## Objective",
      outs.length ? `By the end of this activity you can show progress on: ${outs.map((o) => `${o.id} — ${o.text}`).join(" ")}` : `Apply this week's ideas: ${w.topics.join(", ")}.`,
      "## Activity Overview",
      `${spec.curriculum.find((x) => x.week === w.week)?.focus ?? ""} You will work through the concepts, build a small working example and reflect on its limits.`,
      "## Step 1: Concept setup and context",
      w.topics.map((t) => `- ${t}`).join("\n"),
      "## Step 2: Hands-On Implementation",
      step2.join("\n\n"),
      "## Step 3: Task",
      `Using the ${ds ? `"${ds.name}"` : "synthetic"} dataset, produce a working result for this week's topic (${w.topics.slice(0, 2).join("; ")}), with a short table or screenshot showing it works and one sentence on how you checked it.`,
      "## Step 4: Research, Discussion & Reflection",
      "- Find one current, citable source (official documentation or a peer-reviewed or open-access article) that explains a choice you made. Cite it in APA.\n- Discuss with your group: where could this approach fail for real users, and who would be affected?\n- Note one responsible-AI consideration (privacy, bias, safety or transparency) for your build.",
      "## Step 5: Wrap-Up (5 min)",
      `Review the core concepts: ${w.topics.slice(0, 4).join(", ")}.`,
      ...(instructor
        ? [
            "## Instructor Emphasizes",
            [...w.topics.slice(0, 3).map((t) => `- ${t}`), "- Measure before and after; state the definition of done.", ...(d.industryRules.length ? d.industryRules.map((r) => `- Boundary: ${r}`) : [])].join("\n"),
            "## Instructor-led sample (prefilled)",
            `Live-code the first TODO with the class${nb ? " in the starter notebook" : " in the tool"}, narrating each decision; show one failure case and how you detected it. Keep the remaining TODOs for learners.`,
            "## Answer key",
            nb ? `See \`Week_${pad2(w.week)}_Instructor_Solution_EXECUTED.ipynb\` (solution cells filled; execute in the Cloud Lab before release — not executed in this environment). Accept any approach that meets the definition of done and is explained.` : "See the completed reference build. Accept any configuration that meets the definition of done and is explained.",
            "## Common mistakes",
            commonMistakes(`${w.title} ${w.topics.join(" ")}`).map((m) => `- ${m}`).join("\n"),
            "## Timing (in class)",
            "- 10 min recap and context · 15 min instructor-led sample · 40 min hands-on · 15 min discussion · 5 min wrap-up",
          ]
        : []),
      "## Reflection Questions",
      "1. What did you change between your first attempt and your final result, and why?\n2. How do you know your result is correct — what evidence did you collect?\n3. What would you need before using this with real users?",
      "## Submission",
      SUBMISSION.map((s) => `- ${s}`).join("\n"),
      `**AI-use policy:** ${AI_POLICY_TEXT[AI_POLICY.activity]}`,
      "## Reminders",
      "- Use only the synthetic datasets provided — never real personal, financial or patient data.\n- Keep keys and secrets out of notebooks and screenshots.\n- Ask the AI Teaching Assistant for hints; it won't complete graded work.\n- Accessibility support and extensions: contact the program support desk.",
    ].join("\n\n");
  return { title, student: body(false), instructor: body(true) };
}

/** Jupyter notebook (nbformat 4) — starter with TODOs, or solution with the TODOs filled. Not executed here. */
export function notebook(spec: ProgramSpec, d: ProgramDesign, w: WeekPlan, solution: boolean, label = "Activity"): string {
  const ds = d.datasets[0];
  const file = ds ? ds.file : "datasets/data.csv";
  const md = (src: string) => ({ cell_type: "markdown", metadata: {}, source: src.split(/(?<=\n)/) });
  const code = (src: string) => ({ cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: src.split(/(?<=\n)/) });
  const textCol = ds?.fields.find((f) => f.type === "category")?.name ?? ds?.fields[1]?.name ?? "category";
  const numCol = ds?.fields.find((f) => ["money", "ratio", "count"].includes(f.type))?.name;
  const cells = [
    md(`# ${spec.code} · Week ${w.week}: ${w.title} — ${label}${solution ? " (Instructor Solution)" : " (Student Starter)"}\n\n${DRAFT}\n\n${solution ? "**Instructor edition.** Solution cells are filled. Execute top to bottom in the Scholarion Cloud Lab before release; outputs are not saved in this file yet." : "**Student edition.** Complete each `TODO`. Run cells top to bottom."}\n\nTopics: ${w.topics.join(", ")}.`),
    md("## 0. Setup\nUse the pinned Cloud Lab image (or Colab). Never paste keys into a notebook — the lab injects a learner-scoped key as an environment variable."),
    code(`import pandas as pd\n\ndf = pd.read_csv("${file}")\nprint(df.shape)\ndf.head()`),
    md("## 1. Explore the data\nSummarise the columns and check for missing values."),
    code(solution ? "summary = df.describe(include=\"all\").T\nmissing = df.isna().sum()\nsummary, missing" : "# TODO: summarise every column and count missing values\nsummary = None\nmissing = None"),
    md(`## 2. Week task\n${w.topics.map((t) => `- ${t}`).join("\n")}\n\nImplement \`week_task(df)\` so it returns a small table you can explain.`),
    code(
      solution
        ? `def week_task(df: pd.DataFrame) -> pd.DataFrame:\n    """Group by a categorical column and report counts${numCol ? " and the mean of a numeric column" : ""}."""\n    out = df.groupby("${textCol}").agg(rows=("${ds?.fields[0]?.name ?? textCol}", "count")${numCol ? `, mean_${numCol}=("${numCol}", "mean")` : ""})\n    return out.sort_values("rows", ascending=False)\n\nresult = week_task(df)\nresult`
        : `def week_task(df: pd.DataFrame) -> pd.DataFrame:\n    # TODO: return a small summary table for this week's task\n    raise NotImplementedError\n\n# result = week_task(df)`,
    ),
    md("## 3. Check your result\nWrite one assertion that would fail if your result were wrong."),
    code(solution ? `assert len(result) > 0\nassert result["rows"].sum() == len(df)\nprint("checks passed")` : "# TODO: add at least one assertion about your result"),
    md("## 4. Reflection\n- What evidence shows your result is correct?\n- One responsible-AI consideration for this task:\n\n_Write your answers here._"),
  ];
  return JSON.stringify({ cells, metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, language_info: { name: "python" }, scholarion: { program: spec.code, week: w.week, edition: solution ? "instructor" : "student", executed: false, status: DRAFT } }, nbformat: 4, nbformat_minor: 5 }, null, 1);
}

export function walkthrough(spec: ProgramSpec, d: ProgramDesign, w: WeekPlan): string {
  const ds = d.datasets[0];
  return `# Week ${w.week} tool walkthrough — ${w.title}\n\n${DRAFT}\n\n**Track:** ${d.track} (no coding required). Screenshots: added when the tool and version are pinned for the cohort (status: needs capture).\n\n## Before you start\n- Sign in to the approved no-code tool listed in "Tools and versions" (education use verified for the cohort).\n- Download \`${ds?.file ?? "the dataset"}\` and read its data card.\n\n## Steps\n${w.topics.map((t, i) => `${i + 1}. **${t}** — configure this step in the tool; record the setting you chose and why.`).join("\n")}\n${w.topics.length + 1}. Run the workflow on 10 sample rows and check every output by hand.\n${w.topics.length + 2}. Add a human approval step before anything is sent or changed.\n${w.topics.length + 3}. Export a screenshot of the finished flow and its run log.\n\n## Completed reference build (instructor)\nA working configuration of the steps above on the same dataset, with run log and the approval step. Released to learners after the due date.\n\n## Definition of done\n- The flow runs end to end on the sample rows.\n- Every automated action is logged; a person approves anything sent or changed.\n- Your write-up states one limitation and one risk.\n`;
}

export function slidesOutline(spec: ProgramSpec, d: ProgramDesign, w: WeekPlan) {
  const outs = d.outcomes.filter((o) => w.outcomes.includes(o.id));
  return `# Slides outline — Week ${w.week}: ${w.title}\n\n${DRAFT}\n\n1. Cover — ${spec.code} ${spec.title}, Week ${w.week}, with the approved faculty photo of Dr. Martins Donbruce Idahosa (Lead Faculty & Director of AI Innovation) and Scholaris AI Academy branding.\n2. Outcomes and agenda — ${outs.map((o) => o.id).join(", ") || "this week's goals"}.\n3. Why it matters — a realistic scenario from a Scholarion sandbox.\n${w.topics.slice(0, 5).map((t, i) => `${4 + i}. ${t} — one idea, one diagram or worked example, one check-your-understanding prompt.`).join("\n")}\n${4 + Math.min(5, w.topics.length)}. Hands-on preview — activity, lab and tools.\n${5 + Math.min(5, w.topics.length)}. Summary, readings, what's due, next week.\n\nAccessibility: ≥ 24 pt text, alt text on every visual, captions on recordings, no color-only meaning.\n`;
}

export function scriptOutline(spec: ProgramSpec, w: WeekPlan) {
  return `# Recorded lecture script outline — Week ${w.week}: ${w.title}\n\n${DRAFT}\n\n| Time | Segment |\n|---|---|\n| 0:00–1:00 | Welcome and outcomes |\n${w.topics.slice(0, 5).map((t, i) => `| ${1 + i * 4}:00–${5 + i * 4}:00 | ${t} — explain, show an example, common pitfall |`).join("\n")}\n| ${1 + Math.min(5, w.topics.length) * 4}:00 | Recap and what to do next |\n\nCaptions and a transcript are required before publishing. If an AI presenter is used, it is disclosed on screen and in the narration; the instructor's voice and likeness are never cloned without recorded consent.\n`;
}

export function syllabusMd(spec: ProgramSpec, d: ProgramDesign, b: BlockPlan) {
  const ws = d.weeks.filter((w) => w.block === b.key && !w.optional);
  const as = d.assessments.filter((a) => a.block === b.key);
  return `# Syllabus — ${spec.code} ${spec.title}${d.blocks.length > 1 ? ` · ${b.title}` : ""}\n\n${DRAFT}\n\n**Course standard:** ${b.standard} · ${b.counts.modules} modules · ${b.counts.assignments} assignments · ${b.counts.labs} labs · ${b.counts.projects} projects · ${b.counts.quizzes} quizzes · ${b.counts.midterm ? "midterm · " : ""}${b.counts.final === "exam" ? "final exam" : b.counts.final === "capstone_defense" ? "capstone defense (replaces the final)" : "final practical"} · weekly announcements · sequential module locking.\n\n**Credential:** ${spec.credential.certificate} (non-credit). ${spec.creditStatement}\n\n**Weekly time:** ${spec.hoursPerWeek ? `${spec.hoursPerWeek[0]}–${spec.hoursPerWeek[1]}` : targetHours(spec).join("–")} hours.\n\n## Competencies\n${d.outcomes.map((o) => `- **${o.id}** (${o.bloomName}) ${o.text}`).join("\n")}\n\n## Weekly schedule\n\n| Week | Module | Topics | Readings | Lab | Assessments | Live session |\n|---|---|---|---|---|---|---|\n${ws.map((w) => `| ${w.week} | ${w.title} | ${w.topics.join("; ")} | ${w.readings.join("; ")} | ${w.lab ?? "—"} | ${w.assessments.map((id) => as.find((a) => a.id === id)?.title ?? id).join("; ") || "—"} | ${w.liveSession} |`).join("\n")}\n\n## Assessments and weights\n\n| Assessment | Week | Weight % | Competencies | AI-use policy |\n|---|---|---|---|---|\n${as.map((a) => `| ${a.title} | ${a.week} | ${a.weight} | ${a.outcomes.join(", ")} | ${a.aiPolicy} |`).join("\n")}\n\n## Policies\n- **Academic integrity:** each graded item states its AI-use policy. The AI Teaching Assistant explains and coaches but never completes graded work.\n- **Late work:** per the program's late policy; contact the support desk early for extensions.\n- **Accessibility:** WCAG 2.2 AA materials; captions and transcripts on all media; accommodations through the program support desk.\n- **Data:** synthetic datasets only.\n${d.industryRules.map((r) => `- **Boundary:** ${r}`).join("\n")}\n\n## Textbooks and readings\n${(spec.textbooks ?? []).map((t) => `- ${t}`).join("\n") || "- Weekly readings are listed above; the SME confirms each source."}\n`;
}

export function instructorGuide(spec: ProgramSpec, d: ProgramDesign) {
  return `# Instructor guide — ${spec.code} ${spec.title}\n\n${DRAFT}\n\n## How the program runs\n${spec.formatText}. Track: ${d.track}. ${d.notebooks ? "Labs use Student Starter and Instructor EXECUTED notebooks." : "Labs use tool walkthroughs with a completed reference build."}\n\n## Weekly plan\n${d.weeks.filter((w) => !w.optional).map((w) => `### Week ${w.week}: ${w.title}\n- **Live session:** ${w.liveSession}\n- **Timing:** 10 min recap · 25 min concepts · 60 min live build and lab · 20 min activity debrief · 5 min wrap-up\n- **Facilitation:** start from the scenario, narrate decisions, show one failure and how you detected it.\n- **Answer keys:** instructor editions of the activity${d.notebooks ? " and the EXECUTED solution notebook" : " and the reference build"}.\n- **Common mistakes:** ${commonMistakes(`${w.title} ${w.topics.join(" ")}`).join(" ")}`).join("\n\n")}\n\n## Capstone defense and demo day\nEach learner presents for 10 minutes and takes 5 minutes of questions from a faculty panel. Score with the capstone rubric; record the defense with consent.\n\n## Boundaries\n${d.industryRules.length ? d.industryRules.map((r) => `- ${r}`).join("\n") : "- Standard Academy rules: synthetic data only, human approval before irreversible actions."}\n`;
}

export function capstoneBrief(spec: ProgramSpec, d: ProgramDesign, p: ProjectSpec) {
  const reqs = p.requirements ?? [];
  return `# ${p.kind === "capstone" ? "Capstone" : "Project"} brief — ${p.name}\n\n${DRAFT}\n\n${p.description}\n\n**Skills:** ${p.skills.join(", ")}\n\n## Milestones\n1. Proposal and scope (week ${Math.max(1, weekN(p.week) - 3)})\n2. Working prototype and evaluation plan (week ${Math.max(1, weekN(p.week) - 2)})\n3. Evaluation results and guardrails (week ${Math.max(1, weekN(p.week) - 1)})\n4. Final submission and ${p.kind === "capstone" ? "live defense on demo day" : "demo"} (week ${p.week})\n\n## Deliverables\n${(reqs.length ? reqs : ["Working build", "Evaluation evidence", "Write-up with limitations"]).map((r) => `- ${r}`).join("\n")}\n\n## Rubric (analytic)\n\n| Criterion | Exemplary (5) | Proficient (4) | Developing (2) | Beginning (0) | Competencies |\n|---|---|---|---|---|---|\n${(reqs.length ? reqs : ["Working build", "Evaluation evidence", "Write-up with limitations"]).map((r) => `| ${r} | Fully met, with evidence and trade-offs explained | Met with minor gaps | Partly met | Not met | ${bestOutcomes(r, d.outcomes, 2).join(", ") || "—"} |`).join("\n")}\n\n## Exemplar\nA sample exemplar is produced by the SME from a pilot run and shared after the first cohort (status: needs SME).\n\n**AI-use policy:** ${AI_POLICY_TEXT[AI_POLICY.capstone]}\n${d.industryRules.map((r) => `\n**Boundary:** ${r}`).join("")}\n`;
}

export function quizBlueprint(d: ProgramDesign, a: PlannedAssessment) {
  const outs = a.outcomes.length ? a.outcomes : [d.outcomes[0].id];
  const levels = ["Remember", "Understand", "Understand", "Apply", "Apply", "Apply", "Analyze", "Analyze", "Apply", "Understand"];
  return {
    id: a.id,
    title: a.title,
    status: `${DRAFT} Items need SME authoring before the quiz is published.`,
    itemsShown: a.kind === "quiz" ? 10 : 25,
    poolSize: a.kind === "quiz" ? 20 : 50,
    randomized: true,
    aiPolicy: a.aiPolicy,
    blueprint: Array.from({ length: a.kind === "quiz" ? 10 : 25 }, (_x, i) => ({ item: i + 1, competency: outs[i % outs.length], bloom: levels[i % levels.length], type: i % 3 === 2 ? "scenario multiple choice" : i % 3 === 1 ? "multiple answer" : "multiple choice", explanationRequired: true })),
  };
}
