import { broker, CampusError, nowIso, nowMs, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { scenarioByKey, type SimScenario } from "../academy/sim-scenarios";
import { audit, notify, requireTenant } from "./common";

/**
 * Scholarion Agentic Cloud Labs — the Academy's own hosted learning area for agent building.
 *
 * - Saved workspaces: each learner's agent spec per lab, with version history.
 * - Bounded agent runner: the learner's agent runs autonomously (no human approval gates) with a
 *   step budget and a tool-call budget. Learners author the agent as a declarative spec (routes,
 *   tool steps, guardrail, error handling); Scholarion's engine interprets it. Learner input is never
 *   executed as code.
 * - Tool permissions: each tool is allowed or denied per lab, with per-task call caps; denied or
 *   over-cap calls are blocked and counted as violations.
 * - Run logs: every routing decision, tool call, observation and violation is recorded per task (operational records, not model reasoning).
 * - Rubric grading: five criteria scored from the evaluation; graded attempts post straight to the
 *   gradebook with a pass/no-pass mark. Two graded attempts per lab; the best attempt counts.
 */

export const RUBRIC = [
  { key: "task_success", label: "Task success", points: 40, description: "Final answers contain the facts each task requires and meet its stop condition." },
  { key: "tool_use", label: "Correct tool use", points: 20, description: "Required tools are called in the right order." },
  { key: "permissions", label: "Permission compliance", points: 15, description: "No calls to denied tools and no per-task cap overruns (5 points lost per violation)." },
  { key: "budget", label: "Bounded execution", points: 15, description: "Every task finishes inside the step and tool-call budget." },
  { key: "safety", label: "Error handling and guardrails", points: 10, description: "Missing records end in a handled not-found; injection attempts are refused with no tool calls." },
] as const;

export const DEFAULT_MAX_ATTEMPTS = 2;
export const PASS_MARK = 70;
const MAX_SPEC_CHARS = 20_000;

interface LabTool { name: string; kind: "lookup" | "search" | "action"; table?: string; field?: string; description: string }
interface LabTask { id: string; request: string; requireTools: string[]; expectContains?: string[]; expectNotFound?: boolean; expectRefusal?: boolean; hidden?: boolean }
export interface AgentLabSpec { key: string; scenario: string; title: string; permissions: Record<string, { allow: boolean; maxCallsPerTask?: number }>; budget: { maxSteps: number; maxToolCalls: number }; tasks: LabTask[] }

/** The learner-authored agent (JSON). */
export interface AgentDesign {
  guardrail?: { blockIfContains?: string[]; refusal?: string };
  routes?: { intent: string; whenAny: string[]; steps: { tool: string; arg: "id" | "field" | "text" }[] }[];
  onToolError?: "finish_not_found" | "continue";
  notFoundMessage?: string;
  fallback?: string;
  answerFrom?: "last_result" | "fixed";
  fixedAnswer?: string;
}

function labTools(s: SimScenario): LabTool[] {
  // Every lab also exposes one destructive tool the agent is never allowed to use.
  const destructive: Record<string, LabTool> = {
    "haven-guest-services": { name: "delete_booking", kind: "action", description: "Permanently delete a booking (denied in this lab)." },
    "medigrid-fulfillment": { name: "cancel_all_orders", kind: "action", description: "Cancel every open order (denied in this lab)." },
    "admissions-navigator": { name: "change_decision", kind: "action", description: "Change an admission decision (denied — decisions belong to staff)." },
  };
  return [...s.tools.map(({ risky: _r, ...t }) => t), destructive[s.key]].filter(Boolean) as LabTool[];
}

/** Lab definitions built from the sandbox scenarios. Hidden tasks vary the record IDs. */
export function labSpecFor(s: SimScenario): AgentLabSpec {
  const tools = labTools(s);
  const risky = s.tools.filter((t) => t.risky).map((t) => t.name);
  const permissions = Object.fromEntries(tools.map((t) => [t.name, risky.includes(t.name) ? { allow: true, maxCallsPerTask: 1 } : /delete|cancel_all|change_decision/.test(t.name) ? { allow: false } : { allow: true, maxCallsPerTask: 3 }]));
  const idOf = (text: string) => text.match(new RegExp(s.idPattern, "i"))?.[0].toUpperCase();
  const tasks: LabTask[] = s.tasks.map((t) => {
    const id = idOf(t.request);
    if (t.expectBlocked) return { id: t.id, request: t.request, requireTools: [], expectRefusal: true };
    if (t.expectNotFound) return { id: t.id, request: t.request, requireTools: t.expectTools, expectNotFound: true };
    return { id: t.id, request: t.request, requireTools: t.expectTools, expectContains: id ? [id] : [] };
  });
  const firstLookup = s.tasks.find((t) => !t.expectBlocked && !t.expectNotFound && idOf(t.request));
  const table = s.tools.find((t) => t.kind === "lookup")?.table;
  if (firstLookup && table) {
    const used = idOf(firstLookup.request)!;
    const other = Object.keys(s.data[table]).find((k) => k !== used);
    if (other) tasks.push({ id: "H1", request: firstLookup.request.replace(new RegExp(s.idPattern, "i"), other), requireTools: firstLookup.expectTools, expectContains: [other], hidden: true });
  }
  return { key: `agentlab-${s.key}`, scenario: s.key, title: `Agentic Cloud Lab: ${s.title}`, permissions, budget: { maxSteps: s.stepLimit + 1, maxToolCalls: s.stepLimit }, tasks };
}

/** What learners can read: tools, permissions, field values and the budget — never the data or expectations. */
export function learnerBrief(s: SimScenario, spec: AgentLabSpec) {
  const tools = labTools(s);
  const fieldValues = Object.fromEntries(tools.filter((t) => t.kind === "search").map((t) => [t.name, [...new Set(Object.values(s.data[t.table!] ?? {}).map((r) => r[t.field!]))]]));
  return { idPattern: s.idPattern, idLabel: s.idLabel, tools: tools.map((t) => ({ name: t.name, kind: t.kind, description: t.description, allowed: spec.permissions[t.name]?.allow ?? false, maxCallsPerTask: spec.permissions[t.name]?.maxCallsPerTask ?? null })), fieldValues, budget: spec.budget };
}

export function starterDesign(s: SimScenario): string {
  const first = s.tools.find((t) => t.kind === "lookup")?.name ?? s.tools[0].name;
  const design = {
    _readme: "Your agent runs autonomously: no human approves its steps. The lab enforces tool permissions and the budget; you make the agent safe and correct. TODOs: (1) list injection phrases to block; (2) add one route per kind of request, with tool steps in order; (3) decide what happens when a tool errors; (4) answer from the last tool result.",
    guardrail: { blockIfContains: ["TODO: add phrases that signal prompt injection"], refusal: "TODO: a short refusal" },
    routes: [{ intent: "TODO-example", whenAny: ["TODO keyword"], steps: [{ tool: first, arg: "id" }] }],
    onToolError: "continue",
    notFoundMessage: "TODO",
    fallback: "TODO: what to say when no route matches",
    answerFrom: "fixed",
    fixedAnswer: "TODO",
  };
  return JSON.stringify(design, null, 2);
}

export function referenceDesign(s: SimScenario): string {
  const design: AgentDesign & { _readme: string } = {
    _readme: "Instructor solution. Routes are tried in order; the first route whose keywords appear in the request runs its steps.",
    guardrail: { blockIfContains: s.injectionMarkers, refusal: "I can't help with that request. A staff member can assist you directly." },
    routes: s.intents.map((i) => ({ intent: i.key, whenAny: i.match, steps: i.steps })),
    onToolError: "finish_not_found",
    notFoundMessage: "Sorry, that record was not found. Please check the reference and try again.",
    fallback: "I've passed your message to a staff member.",
    answerFrom: "last_result",
  };
  return JSON.stringify(design, null, 2);
}

/** Parse and validate a learner design; errors are shown in the workspace. */
export function parseDesign(text: string, s: SimScenario): { design: AgentDesign | null; errors: string[] } {
  if (text.length > MAX_SPEC_CHARS) return { design: null, errors: [`The agent spec must be under ${MAX_SPEC_CHARS.toLocaleString()} characters.`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { design: null, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const d = raw as AgentDesign;
  if (!d || typeof d !== "object" || Array.isArray(d)) return { design: null, errors: ["The agent spec must be a JSON object."] };
  const toolNames = new Set(labTools(s).map((t) => t.name));
  if (d.routes !== undefined && !Array.isArray(d.routes)) errors.push("routes must be a list.");
  for (const [i, r] of (Array.isArray(d.routes) ? d.routes : []).entries()) {
    if (!r || typeof r !== "object") { errors.push(`routes[${i}] must be an object.`); continue; }
    if (!Array.isArray(r.whenAny) || !r.whenAny.every((k) => typeof k === "string")) errors.push(`routes[${i}].whenAny must be a list of keywords.`);
    if (!Array.isArray(r.steps)) { errors.push(`routes[${i}].steps must be a list.`); continue; }
    for (const [j, st] of r.steps.entries()) {
      if (!st || typeof st.tool !== "string") errors.push(`routes[${i}].steps[${j}] needs a tool.`);
      else if (!toolNames.has(st.tool)) errors.push(`routes[${i}].steps[${j}]: unknown tool "${st.tool}".`);
      if (st && !["id", "field", "text"].includes(String(st.arg))) errors.push(`routes[${i}].steps[${j}].arg must be "id", "field" or "text".`);
    }
  }
  if (d.guardrail?.blockIfContains !== undefined && (!Array.isArray(d.guardrail.blockIfContains) || !d.guardrail.blockIfContains.every((x) => typeof x === "string"))) errors.push("guardrail.blockIfContains must be a list of phrases.");
  if (d.onToolError !== undefined && !["finish_not_found", "continue"].includes(d.onToolError)) errors.push('onToolError must be "finish_not_found" or "continue".');
  if (d.answerFrom !== undefined && !["last_result", "fixed"].includes(d.answerFrom)) errors.push('answerFrom must be "last_result" or "fixed".');
  return { design: errors.length ? null : d, errors };
}

/* ---------------- bounded autonomous runner ---------------- */

interface TraceRow { step: number; type: "decide" | "call" | "observe" | "error" | "violation" | "guard" | "limit" | "finish"; tool?: string; msg: string }
interface TaskResult { id: string; status: string; answer: string | null; calls: string[]; violations: number; trace: TraceRow[]; ms: number }

const summarize = (rec: Record<string, unknown>) => Object.entries(rec).map(([k, v]) => `${k}=${v}`).join(", ");

function runTask(s: SimScenario, spec: AgentLabSpec, d: AgentDesign, task: LabTask): TaskResult {
  const started = nowMs();
  const tools = new Map(labTools(s).map((t) => [t.name, t]));
  const trace: TraceRow[] = [];
  const calls: string[] = [];
  const counts: Record<string, number> = {};
  let violations = 0;
  let last: { ok: boolean; result: unknown } | null = null;
  const ctx: { lastRec?: [string, Record<string, unknown>]; matches?: string[] } = {};
  const text = task.request;
  const lower = ` ${text.toLowerCase()} `;
  const done = (status: string, answer: string | null): TaskResult => {
    trace.push({ step: trace.length, type: status === "finished" ? "finish" : "limit", msg: answer ?? status });
    return { id: task.id, status, answer, calls, violations, trace, ms: nowMs() - started };
  };
  const hit = (d.guardrail?.blockIfContains ?? []).find((p) => p && !/^todo/i.test(p) && lower.includes(p.toLowerCase()));
  if (hit) {
    trace.push({ step: 0, type: "guard", msg: `Guardrail blocked the request (matched "${hit}"). No tools ran.` });
    return done("finished", d.guardrail?.refusal ?? "I can't help with that.");
  }
  const route = (d.routes ?? []).find((r) => r.whenAny.some((k) => k && lower.includes(k.toLowerCase())));
  if (!route) {
    trace.push({ step: 0, type: "decide", msg: "No route matched; using the fallback answer." });
    return done("finished", d.fallback ?? "");
  }
  trace.push({ step: 0, type: "decide", msg: `Route "${route.intent}": ${route.steps.map((x) => x.tool).join(" → ")}` });
  let step = 0;
  for (const st of route.steps) {
    step++;
    if (step > spec.budget.maxSteps) {
      trace.push({ step, type: "limit", msg: `Step budget of ${spec.budget.maxSteps} reached.` });
      return { id: task.id, status: "budget_exceeded", answer: null, calls, violations, trace, ms: nowMs() - started };
    }
    if (last && !last.ok && d.onToolError === "finish_not_found") return done("finished", d.notFoundMessage ?? "Not found.");
    const tool = tools.get(st.tool);
    if (!tool) {
      trace.push({ step, type: "error", msg: `Unknown tool ${st.tool}.` });
      last = { ok: false, result: "unknown tool" };
      continue;
    }
    const perm = spec.permissions[tool.name] ?? { allow: false };
    if (!perm.allow || (perm.maxCallsPerTask !== undefined && (counts[tool.name] ?? 0) >= perm.maxCallsPerTask)) {
      violations++;
      trace.push({ step, type: "violation", tool: tool.name, msg: `${tool.name} blocked: ${perm.allow ? `per-task cap of ${perm.maxCallsPerTask} reached` : "denied by lab permissions"}.` });
      last = { ok: false, result: "permission_denied" };
      continue;
    }
    if (calls.length >= spec.budget.maxToolCalls) {
      trace.push({ step, type: "limit", msg: `Tool-call budget of ${spec.budget.maxToolCalls} reached.` });
      return { id: task.id, status: "budget_exceeded", answer: null, calls, violations, trace, ms: nowMs() - started };
    }
    const arg = st.arg === "id" ? text.match(new RegExp(s.idPattern, "i"))?.[0].toUpperCase() ?? "" : st.arg === "field" ? (() => {
      const rows = s.data[tool.table ?? ""] ?? {};
      return String(Object.values(rows).map((r) => r[tool.field ?? ""]).find((v) => lower.includes(String(v).toLowerCase())) ?? "");
    })() : text.slice(0, 140);
    counts[tool.name] = (counts[tool.name] ?? 0) + 1;
    calls.push(tool.name);
    trace.push({ step, type: "call", tool: tool.name, msg: `${tool.name}(${arg})` });
    if (tool.kind === "lookup") {
      const rec = (s.data[tool.table ?? ""] ?? {})[arg];
      if (!rec) last = { ok: false, result: `not_found: ${arg || "(no id)"} is not in ${tool.table}` };
      else {
        ctx.lastRec = [arg, rec];
        last = { ok: true, result: rec };
      }
    } else if (tool.kind === "search") {
      const rows = s.data[tool.table ?? ""] ?? {};
      ctx.matches = Object.keys(rows).filter((k) => !arg || String(rows[k][tool.field ?? ""]) === arg);
      last = { ok: true, result: ctx.matches };
    } else if (tool.name.startsWith("draft")) {
      last = { ok: true, result: ctx.lastRec ? `Reply for ${ctx.lastRec[0]}: ${summarize(ctx.lastRec[1])}` : ctx.matches ? `Options available: ${ctx.matches.join(", ") || "none right now"}` : "Reply drafted." };
    } else last = { ok: true, result: { done: tool.name, ref: `ACT-${1000 + calls.length}` } };
    trace.push({ step, type: last.ok ? "observe" : "error", tool: tool.name, msg: typeof last.result === "object" && !Array.isArray(last.result) ? summarize(last.result as Record<string, unknown>) : Array.isArray(last.result) ? last.result.join(", ") || "no rows" : String(last.result) });
  }
  if (last && !last.ok && d.onToolError === "finish_not_found") return done("finished", d.notFoundMessage ?? "Not found.");
  return done("finished", d.answerFrom === "last_result" && last ? (typeof last.result === "string" ? last.result : JSON.stringify(last.result)) : d.fixedAnswer ?? "");
}

export function evaluate(s: SimScenario, spec: AgentLabSpec, designText: string) {
  const { design, errors } = parseDesign(designText, s);
  if (!design) return { ok: false, errors, results: [] as TaskResult[] };
  return { ok: true, errors: [], results: spec.tasks.map((t) => runTask(s, spec, design, t)) };
}

const inOrder = (calls: string[], req: string[]) => {
  let i = 0;
  for (const c of calls) if (c === req[i]) i++;
  return i === req.length;
};

/** Score an evaluation against the rubric. */
export function scoreRun(spec: AgentLabSpec, results: TaskResult[]) {
  const per = spec.tasks.map((t) => {
    const r = results.find((x) => x.id === t.id);
    const answer = (r?.answer ?? "").toLowerCase();
    const finished = r?.status === "finished";
    const toolsOk = !!r && (t.expectRefusal ? r.calls.length === 0 : inOrder(r.calls, t.requireTools));
    let success = finished && toolsOk;
    const why: string[] = [];
    if (!r) why.push("no result");
    else {
      if (!finished) why.push(`ended with status ${r.status}`);
      if (!toolsOk) why.push(t.expectRefusal ? `tools were called: ${r.calls.join(", ")}` : `expected tools in order ${t.requireTools.join(" → ")}, got ${r.calls.join(" → ") || "none"}`);
      if (t.expectContains?.length && !t.expectContains.every((c) => answer.includes(c.toLowerCase()))) {
        success = false;
        why.push(`answer should mention ${t.expectContains.join(", ")}`);
      }
      if (t.expectNotFound && (!/not found|couldn't find|could not find|no record/.test(answer) || r.calls.some((c) => c.startsWith("draft")))) {
        success = false;
        why.push("expected a handled not-found answer with no drafted reply");
      }
      if (t.expectRefusal && !/can't|cannot|unable|not able|won't/.test(answer)) {
        success = false;
        why.push("expected a refusal");
      }
    }
    return { id: t.id, hidden: !!t.hidden, success, toolsOk, withinBudget: finished, violations: r?.violations ?? 0, why };
  });
  const n = per.length || 1;
  const violations = per.reduce((s, p) => s + p.violations, 0);
  const safetyTasks = spec.tasks.filter((t) => t.expectNotFound || t.expectRefusal);
  const safetyOk = safetyTasks.filter((t) => per.find((p) => p.id === t.id)?.success).length;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const criteria = [
    { key: "task_success", earned: r1((per.filter((p) => p.success).length / n) * 40) },
    { key: "tool_use", earned: r1((per.filter((p) => p.toolsOk).length / n) * 20) },
    { key: "permissions", earned: Math.max(0, 15 - 5 * violations) },
    { key: "budget", earned: r1((per.filter((p) => p.withinBudget).length / n) * 15) },
    { key: "safety", earned: safetyTasks.length ? r1((safetyOk / safetyTasks.length) * 10) : 10 },
  ].map((c) => ({ ...RUBRIC.find((r) => r.key === c.key)!, earned: c.earned }));
  const score = r1(criteria.reduce((s, c) => s + c.earned, 0));
  return { score, max: 100, criteria, tasks: per, violations };
}

/* ---------------- labs, workspaces, runs ---------------- */

function labRow(store: TenantStore, labId: string) {
  const lab = store.get("agent_labs", labId);
  if (!lab || lab.state !== "published") throw new CampusError("not_found", "Agentic Cloud Lab not found", 404);
  return lab;
}
const specOf = (lab: Row) => lab.spec as AgentLabSpec;
function scenarioOf(lab: Row) {
  const s = scenarioByKey(String(lab.scenario));
  if (!s) throw new CampusError("not_found", "Lab scenario missing", 404);
  return s;
}
function roleIn(a: Actor, lab: Row): "staff" | "learner" {
  const courseId = String(lab.courseId);
  if (hasAny(a, ["admin", "designer"]) || hasAny(a, ["instructor", "ta"], courseId)) return "staff";
  if (hasAny(a, ["student"], courseId)) return "learner";
  throw new CampusError("forbidden", "Enroll in the course to open this lab.", 403);
}

/** Create (idempotently) one Agentic Cloud Lab per scenario, attached to a course as a 100-point assignment. */
export function ensureAgentLabs(store: TenantStore) {
  const t = broker.tenant(store.tenantId)!;
  const homes: Record<string, string[]> = { "haven-guest-services": [`crs_${t.slug}_p32`, `crs_${t.slug}_p15`], "medigrid-fulfillment": [`crs_${t.slug}_p8`, `crs_${t.slug}_p27`], "admissions-navigator": [`crs_${t.slug}_p2`, `crs_${t.slug}_p16`] };
  for (const [key, courses] of Object.entries(homes)) {
    const id = `al_${t.slug}_${key.replace(/-/g, "_")}`;
    if (store.get("agent_labs", id)) continue;
    const s = scenarioByKey(key)!;
    const spec = labSpecFor(s);
    const course = courses.map((c) => store.get("courses", c)).find(Boolean);
    if (!course) continue;
    const mod = store.list("modules", (m) => m.courseId === course.id).sort((x, y) => Number(x.position) - Number(y.position))[0];
    const grp = store.list("assignment_groups", (g) => g.courseId === course.id)[0] ?? store.insert("assignment_groups", { courseId: course.id, name: "Agentic Cloud Labs", weight: 0 }, "ag");
    const asg = store.insert("assignments", { courseId: course.id, moduleId: mod?.id ?? null, title: spec.title, instructions: `Design an autonomous agent for ${s.org}. It runs without approval gates in the Scholarion Agentic Cloud Lab; tool permissions and a step budget are enforced. Two graded attempts; the best attempt posts to the gradebook automatically.`, points: 100, groupId: grp.id, submissionTypes: ["external_tool"], state: "published", gradingType: "points", tags: ["agentic_cloud_lab", "autograded"], allowedAttempts: DEFAULT_MAX_ATTEMPTS }, "asg");
    store.insert("agent_labs", { id, key: spec.key, title: spec.title, scenario: key, courseId: course.id, assignmentId: asg.id, spec, starterCode: starterDesign(s), referenceCode: referenceDesign(s), maxAttempts: DEFAULT_MAX_ATTEMPTS, passMark: PASS_MARK, rubric: RUBRIC, autonomous: true, state: "published" }, "al");
  }
}

function attemptsAllowed(store: TenantStore, lab: Row, userId: string) {
  const extra = store.list("agent_lab_grants", (g) => g.labId === lab.id && g.userId === userId).reduce((s, g) => s + Number(g.extraAttempts ?? 0), 0);
  return Number(lab.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) + extra;
}
const gradedRuns = (store: TenantStore, labId: string, userId: string) => store.list("agent_lab_runs", (r) => r.labId === labId && r.userId === userId && r.mode === "graded");

export function myLabs(store: TenantStore, a: Actor) {
  return store.list("agent_labs", (l) => l.state === "published").filter((l) => {
    try {
      roleIn(a, l);
      return true;
    } catch {
      return false;
    }
  }).map((l) => {
    const graded = gradedRuns(store, l.id, a.id);
    const best = graded.length ? Math.max(...graded.map((r) => Number(r.score ?? 0))) : null;
    return { id: l.id, title: String(l.title), course: String(store.get("courses", String(l.courseId))?.title ?? ""), role: roleIn(a, l), attemptsUsed: graded.length, maxAttempts: attemptsAllowed(store, l, a.id), best, passed: best !== null && best >= Number(l.passMark ?? PASS_MARK) };
  });
}

function workspaceFor(store: TenantStore, a: Actor, lab: Row) {
  return store.list("agent_workspaces", (w) => w.labId === lab.id && w.userId === a.id)[0] ?? store.tx(() => store.insert("agent_workspaces", { labId: lab.id, userId: a.id, files: { "agent.json": String(lab.starterCode) }, versions: [], savedAt: nowIso() }, "aws"));
}
const codeOf = (ws: Row) => String((ws.files as Record<string, string>)["agent.json"] ?? "");

export function openLab(store: TenantStore, a: Actor, labId: string) {
  const lab = labRow(store, labId);
  const role = roleIn(a, lab);
  const s = scenarioOf(lab);
  const spec = specOf(lab);
  const ws = workspaceFor(store, a, lab);
  const runs = store.list("agent_lab_runs", (r) => r.labId === lab.id && r.userId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const graded = runs.filter((r) => r.mode === "graded");
  const allowed = attemptsAllowed(store, lab, a.id);
  const grade = store.list("grades", (g) => g.assignmentId === lab.assignmentId && g.userId === a.id)[0];
  return {
    lab: { id: lab.id, title: String(lab.title), course: String(store.get("courses", String(lab.courseId))?.title ?? ""), org: s.org, orgNote: s.orgNote, autonomous: true, passMark: Number(lab.passMark ?? PASS_MARK), assignmentId: String(lab.assignmentId) },
    role,
    brief: learnerBrief(s, spec),
    visibleTasks: spec.tasks.filter((t) => !t.hidden).map((t) => ({ id: t.id, request: t.request })),
    hiddenTaskCount: spec.tasks.filter((t) => t.hidden).length,
    rubric: RUBRIC,
    workspace: { id: ws.id, code: codeOf(ws), savedAt: String(ws.savedAt), versions: ((ws.versions as { at: string; code: string }[]) ?? []).map((v, i) => ({ index: i, at: v.at, chars: v.code.length })), errors: parseDesign(codeOf(ws), s).errors },
    attempts: { used: graded.length, allowed, remaining: Math.max(0, allowed - graded.length) },
    best: graded.length ? Math.max(...graded.map((r) => Number(r.score ?? 0))) : null,
    gradebook: grade ? { score: Number(grade.score), posted: !!grade.posted, passFail: (grade.passFail as string) ?? null } : null,
    runs: runs.slice(0, 10).map((r) => ({ id: r.id, mode: String(r.mode), attempt: (r.attempt as number) ?? null, score: (r.score as number) ?? null, passed: !!r.passed, createdAt: String(r.createdAt), violations: Number(r.violations ?? 0) })),
    referenceCode: role === "staff" ? String(lab.referenceCode) : null,
  };
}

export function saveWorkspace(store: TenantStore, a: Actor, labId: string, code: string) {
  const lab = labRow(store, labId);
  roleIn(a, lab);
  if (typeof code !== "string" || code.length > MAX_SPEC_CHARS) throw new CampusError("invalid", `The agent spec must be under ${MAX_SPEC_CHARS.toLocaleString()} characters.`, 422);
  const ws = workspaceFor(store, a, lab);
  return store.tx(() => {
    const prev = codeOf(ws);
    const versions = [...((ws.versions as { at: string; code: string }[]) ?? []), ...(prev && prev !== code ? [{ at: String(ws.savedAt), code: prev }] : [])].slice(-10);
    const row = store.update("agent_workspaces", ws.id, { files: { "agent.json": code }, versions, savedAt: nowIso() });
    return { id: row.id, savedAt: row.savedAt, versions: versions.length, errors: parseDesign(code, scenarioOf(lab)).errors };
  });
}

export function restoreVersion(store: TenantStore, a: Actor, labId: string, index: number) {
  const lab = labRow(store, labId);
  roleIn(a, lab);
  const v = ((workspaceFor(store, a, lab).versions as { at: string; code: string }[]) ?? [])[index];
  if (!v) throw new CampusError("not_found", "Version not found", 404);
  return saveWorkspace(store, a, labId, v.code);
}

export function resetWorkspace(store: TenantStore, a: Actor, labId: string) {
  return saveWorkspace(store, a, labId, String(labRow(store, labId).starterCode));
}

/** Run the agent: practice (unlimited, visible tasks) or graded (uses an attempt, adds hidden tasks, posts to the gradebook). */
export function runLab(store: TenantStore, a: Actor, labId: string, mode: "practice" | "graded", code?: string) {
  const lab = labRow(store, labId);
  const role = roleIn(a, lab);
  if (code !== undefined) saveWorkspace(store, a, labId, code);
  const src = codeOf(workspaceFor(store, a, lab));
  const spec = specOf(lab);
  const s = scenarioOf(lab);
  if (mode === "graded") {
    if (role === "staff") throw new CampusError("forbidden", "Staff run practice evaluations; graded attempts are for learners.", 403);
    const allowed = attemptsAllowed(store, lab, a.id);
    if (gradedRuns(store, lab.id, a.id).length >= allowed) throw new CampusError("attempts_exhausted", `You've used all ${allowed} graded attempts for this lab. Your best attempt is in the gradebook.`, 409);
  }
  const runSpec: AgentLabSpec = mode === "practice" ? { ...spec, tasks: spec.tasks.filter((t) => !t.hidden) } : spec;
  const ev = evaluate(s, runSpec, src);
  if (!ev.ok) throw new CampusError("invalid_agent", `Fix the agent spec first: ${ev.errors.join(" ")}`, 422, { errors: ev.errors });
  const scored = scoreRun(runSpec, ev.results);
  const passMark = Number(lab.passMark ?? PASS_MARK);
  return store.tx(() => {
    const attempt = mode === "graded" ? gradedRuns(store, lab.id, a.id).length + 1 : null;
    const traces = ev.results.map((r) => ({ ...r, hidden: !!runSpec.tasks.find((t) => t.id === r.id)?.hidden }));
    const run = store.insert("agent_lab_runs", { labId: lab.id, userId: a.id, mode, attempt, code: src, score: scored.score, max: 100, passed: scored.score >= passMark, criteria: scored.criteria, taskResults: scored.tasks, violations: scored.violations, traces, autonomous: true }, "alr");
    const gradebook = mode === "graded" ? postBest(store, lab, a.id) : null;
    audit(store, a, mode === "graded" ? "agentlab.submit" : "agentlab.practice", `agent_lab_runs/${run.id}`, `${lab.title} ${scored.score}/100`);
    return { id: run.id, runId: run.id, mode, attempt, score: scored.score, max: 100, passed: scored.score >= passMark, criteria: scored.criteria, tasks: scored.tasks.map((t) => (t.hidden ? { ...t, why: t.success ? [] : ["hidden test failed"] } : t)), violations: scored.violations, gradebook };
  });
}

/** The best graded attempt goes to the gradebook, posted, with a pass/no-pass mark. */
function postBest(store: TenantStore, lab: Row, userId: string) {
  const graded = gradedRuns(store, lab.id, userId);
  const best = Math.max(0, ...graded.map((r) => Number(r.score ?? 0)));
  const asg = store.get("assignments", String(lab.assignmentId))!;
  const score = Math.round((best / 100) * Number(asg.points ?? 100) * 100) / 100;
  const passFail = best >= Number(lab.passMark ?? PASS_MARK) ? "pass" : "no_pass";
  const existing = store.list("grades", (g) => g.assignmentId === asg.id && g.userId === userId)[0];
  const row = { score, posted: true, postedAt: nowIso(), status: "none", passFail, gradedBy: "agentic-cloud-lab", attemptsUsed: graded.length };
  if (existing) store.update("grades", existing.id, row);
  else store.insert("grades", { assignmentId: asg.id, userId, ...row }, "grd");
  const prior = store.list("submissions", (x) => x.assignmentId === asg.id && x.userId === userId).length;
  store.insert("submissions", { assignmentId: asg.id, userId, courseId: asg.courseId, mode: "lti", body: null, url: null, attempt: prior + 1, state: "graded", late: false, groupId: null, groupMemberIds: [userId] }, "sub");
  store.emit("grades.posted", `assignments/${asg.id}`, { courseId: asg.courseId, assignmentId: asg.id, userIds: [userId] });
  notify(store, [userId], "grades", `${lab.title}: ${best}/100 (${passFail === "pass" ? "pass" : "not yet passing"})`, `Best of ${graded.length} graded attempt(s) posted to your gradebook.`, `/campus/{tenant}/agent-labs/${lab.id}`, String(asg.courseId));
  return { score, passFail, posted: true };
}

export function runDetail(store: TenantStore, a: Actor, runId: string) {
  const run = store.get("agent_lab_runs", runId);
  if (!run) throw new CampusError("not_found", "Run not found", 404);
  const lab = labRow(store, String(run.labId));
  const staff = roleIn(a, lab) === "staff";
  if (run.userId !== a.id && !staff) throw new CampusError("forbidden", "Not your run.", 403);
  const traces = ((run.traces as (TaskResult & { hidden: boolean })[]) ?? []).map((t) => (t.hidden && !staff ? { ...t, trace: [], calls: [], answer: null } : t));
  return { id: run.id, labId: lab.id, lab: String(lab.title), learner: String(store.get("users", String(run.userId))?.name ?? run.userId), mode: String(run.mode), attempt: (run.attempt as number) ?? null, score: Number(run.score), max: 100, passed: !!run.passed, criteria: run.criteria as { key: string; label: string; points: number; earned: number }[], tasks: run.taskResults as { id: string; hidden: boolean; success: boolean; why: string[] }[], violations: Number(run.violations ?? 0), traces, createdAt: String(run.createdAt), autonomous: true };
}

/** Instructor view: each learner's attempts, best score and violations for a lab. */
export function labRoster(store: TenantStore, a: Actor, labId: string) {
  const lab = labRow(store, labId);
  if (roleIn(a, lab) !== "staff") throw new CampusError("forbidden", "Course staff only.", 403);
  const learners = store.list("enrollments", (e) => e.courseId === lab.courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
  return [...new Set(learners)].map((uid) => {
    const runs = store.list("agent_lab_runs", (r) => r.labId === lab.id && r.userId === uid).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const graded = runs.filter((r) => r.mode === "graded");
    return { userId: uid, name: String(store.get("users", uid)?.name ?? uid), practiceRuns: runs.length - graded.length, attemptsUsed: graded.length, allowed: attemptsAllowed(store, lab, uid), best: graded.length ? Math.max(...graded.map((r) => Number(r.score ?? 0))) : null, violations: runs.reduce((s, r) => s + Number(r.violations ?? 0), 0), lastRunId: runs[0]?.id ?? null };
  });
}

export function grantAttempt(store: TenantStore, a: Actor, labId: string, userId: string, reason: string) {
  const lab = labRow(store, labId);
  if (roleIn(a, lab) !== "staff") throw new CampusError("forbidden", "Course staff only.", 403);
  if (!String(reason ?? "").trim()) throw new CampusError("invalid", "Give a reason (for the audit log).", 422);
  return store.tx(() => {
    const g = store.insert("agent_lab_grants", { labId: lab.id, userId, extraAttempts: 1, reason: String(reason).slice(0, 300), grantedBy: a.id }, "alg");
    audit(store, a, "agentlab.grant_attempt", `agent_lab_grants/${g.id}`, reason);
    notify(store, [userId], "grades", `${lab.title}: one more graded attempt`, "Your instructor granted an extra attempt.", `/campus/{tenant}/agent-labs/${lab.id}`, String(lab.courseId));
    return { granted: true, allowed: attemptsAllowed(store, lab, userId) };
  });
}

/** Quality check for staff: the reference agent scores 100 and the starter scores below the pass mark. */
export function verifyLab(store: TenantStore, a: Actor, labId: string) {
  requireTenant(store, a, ["admin", "designer", "instructor"], "agentlab.verify");
  const lab = labRow(store, labId);
  const s = scenarioOf(lab);
  const spec = specOf(lab);
  const ref = evaluate(s, spec, String(lab.referenceCode));
  const st = evaluate(s, spec, String(lab.starterCode));
  const refScore = scoreRun(spec, ref.results).score;
  const starterScore = st.ok ? scoreRun(spec, st.results).score : 0;
  return { reference: refScore, starter: starterScore, ok: refScore === 100 && starterScore < PASS_MARK };
}
