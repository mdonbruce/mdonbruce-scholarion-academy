import { CampusError, nowIso, type Row, type TenantStore } from "../../core";
import { effectiveRoles, type Actor } from "../../iam";
import { audit } from "../common";
import { budgetExhausted, budgetMessage, checkFileRead, checkFileWrite, effectivePolicy, remainingUsage, TOOLS, usageLimits, zeroUsage, type ExecPolicy, type Tool, type Usage } from "./policy";
import { _loadForAgent, WS_TABLE } from "./store";
import { getTemplate, type WorkspaceTemplate } from "./templates";
import { runShell, simulateHttp, type ShellState } from "./terminal";
import { byteLength, normalizePath, vfsClone, vfsRead, vfsWrite, WORKSPACE_ROOT, type Vfs } from "./vfs";

/**
 * Bounded autonomous agent runner for simulated sandbox workspaces.
 *
 * The learner submits a declarative plan (JSON): an ordered list of tool steps. The runner
 * executes it on the workspace VFS without human approval gates. Each step is checked against
 * the policy frozen when the run started; a disallowed step fails automatically with an
 * explanation (it is never turned into an approval request). Runs stop when the plan ends, the
 * budget is exhausted, a stop condition triggers, or the learner presses stop.
 *
 * The run record is operational only: tool, arguments, outcome and a short result summary.
 * No reasoning or free-form commentary is recorded. File contents read during a run are
 * treated as data — they never add, change or authorise steps.
 */

export const AGENT_RUN_TABLE = "workspace_agent_runs";
const MAX_SPEC_CHARS = 50_000;
const MAX_PLAN_STEPS = 100;
const SUMMARY_CHARS = 300;

export interface AgentStep {
  tool: string;
  args: Record<string, string | boolean>;
  retries: number;
  onFailure: "continue" | "stop";
}
export interface AgentPlan {
  name: string;
  steps: AgentStep[];
  onBlocked: "continue" | "stop";
}

export type AgentRunStatus = "running" | "completed" | "failed" | "stopped_by_learner" | "stopped_on_policy" | "budget_exhausted" | "stopped_by_instructor";

export interface AgentStepRecord {
  index: number;
  tool: string;
  args: Record<string, string | boolean>;
  ok: boolean;
  attempts: number;
  resultSummary: string;
  blockedReason?: string;
  at: string;
}

const bad = (msg: string): never => {
  throw new CampusError("invalid_plan", msg, 400);
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const clip = (s: string, n = SUMMARY_CHARS) => (s.length > n ? s.slice(0, n) + "…" : s);

const ARG_KEYS: Record<Tool, string[]> = {
  EXECUTE_BASH: ["command"],
  FILE_READ: ["path"],
  FILE_WRITE: ["path", "content", "append"],
  HTTP_REQUEST: ["url", "method"],
};

/**
 * Parse a learner plan. Only operational fields are kept: unknown keys (including any
 * "policy", "permissions", "reasoning" or "thoughts" fields) are dropped.
 */
export function parseAgentPlan(input: unknown): AgentPlan {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (input.length > MAX_SPEC_CHARS) bad(`Plan is larger than ${MAX_SPEC_CHARS} characters.`);
    try {
      raw = JSON.parse(input);
    } catch {
      bad("Plan must be valid JSON.");
    }
  } else if (JSON.stringify(input ?? null).length > MAX_SPEC_CHARS) bad(`Plan is larger than ${MAX_SPEC_CHARS} characters.`);
  if (!isObj(raw)) bad("Plan must be an object with a steps list.");
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.steps) || !r.steps.length) bad("Plan needs at least one step.");
  if ((r.steps as unknown[]).length > MAX_PLAN_STEPS) bad(`Plans are limited to ${MAX_PLAN_STEPS} steps.`);
  const steps = (r.steps as unknown[]).map((s, i) => {
    if (!isObj(s)) bad(`Step ${i + 1} must be an object.`);
    const st = s as Record<string, unknown>;
    const tool = String(st.tool ?? "");
    const a = isObj(st.args) ? st.args : {};
    const keys = (TOOLS as readonly string[]).includes(tool) ? ARG_KEYS[tool as Tool] : [];
    const args: Record<string, string | boolean> = {};
    for (const k of keys) if (a[k] !== undefined) args[k] = typeof a[k] === "boolean" ? (a[k] as boolean) : String(a[k]);
    const retries = Number.isInteger(st.retries) ? Math.max(0, Math.min(10, st.retries as number)) : 0;
    return { tool, args, retries, onFailure: st.onFailure === "stop" ? "stop" : "continue" } as AgentStep;
  });
  return { name: clip(String(r.name ?? "agent plan"), 80), steps, onBlocked: r.onBlocked === "stop" ? "stop" : "continue" };
}

/* ---------------- Step execution ---------------- */

interface StepOutcome {
  ok: boolean;
  summary: string;
  blockedReason?: string;
  retryable: boolean;
}

interface RunCtx {
  state: ShellState;
  policy: ExecPolicy;
  template: WorkspaceTemplate;
}

function charge(u: Usage, bytes: number, http = 0) {
  const kb = Math.ceil(bytes / 1024);
  u.steps += 1;
  u.cpuUnits += 1 + kb;
  u.runtimeMs += 5 + kb + 20 * http;
  u.costUnits += http;
}

function blockedOutcome(reason: string): StepOutcome {
  return { ok: false, summary: "Blocked by policy — refused automatically (no approval requested).", blockedReason: reason, retryable: false };
}

function execStep(step: AgentStep, ctx: RunCtx): StepOutcome {
  const { policy, state } = ctx;
  if (!(TOOLS as readonly string[]).includes(step.tool)) return blockedOutcome(`"${step.tool}" is not a permitted tool. Permitted tools: ${TOOLS.join(", ")}.`);
  const tool = step.tool as Tool;
  if (!policy.tools[tool]) return blockedOutcome(`${tool} is not permitted by this lab's execution policy.`);

  if (tool === "EXECUTE_BASH") {
    const cmd = String(step.args.command ?? "");
    if (!cmd.trim()) return { ok: false, summary: "No command given.", retryable: false };
    const r = runShell(state, cmd, policy, ctx.template, { historyPrefix: "[agent] " });
    if (r.blocked) return blockedOutcome(r.blocked.reason);
    if (r.budgetExhausted) return { ok: false, summary: clip(r.output.trim()), retryable: false };
    return { ok: r.exitCode === 0, summary: clip(`exit ${r.exitCode}: ${r.output.trim()}`), retryable: r.exitCode !== 0 && r.exitCode !== 78 && r.exitCode !== 127 };
  }

  if (tool === "HTTP_REQUEST") {
    charge(state.usage, 0, 1);
    const method = String(step.args.method ?? "GET").toUpperCase();
    const r = simulateHttp(policy, ctx.template, String(step.args.url ?? ""), method);
    if (!r.ok) return blockedOutcome(r.reason);
    const body = JSON.stringify(r.body);
    return { ok: r.status < 400, summary: clip(`simulated HTTP ${r.status}: ${body}`), retryable: r.status >= 500 };
  }

  let abs: string;
  try {
    abs = normalizePath(step.args.path, WORKSPACE_ROOT);
  } catch (e) {
    charge(state.usage, 0);
    const msg = e instanceof Error ? e.message : String(e);
    return e instanceof CampusError && e.status === 403 ? blockedOutcome(msg) : { ok: false, summary: msg, retryable: false };
  }

  if (tool === "FILE_READ") {
    const d = checkFileRead(policy, abs);
    charge(state.usage, 0);
    if (!d.ok) return blockedOutcome(d.reason);
    try {
      const content = vfsRead(state.vfs, abs);
      state.usage.cpuUnits += Math.ceil(byteLength(content) / 1024);
      // Untrusted data: summarised for the record, never interpreted as instructions.
      return { ok: true, summary: clip(`read ${byteLength(content)} bytes (untrusted data, not interpreted): ${content.replace(/\s+/g, " ").trim()}`), retryable: false };
    } catch (e) {
      return { ok: false, summary: e instanceof Error ? e.message : String(e), retryable: true };
    }
  }

  // FILE_WRITE
  const d = checkFileWrite(policy, abs);
  const content = String(step.args.content ?? "");
  charge(state.usage, byteLength(content));
  if (!d.ok) return blockedOutcome(d.reason);
  try {
    vfsWrite(state.vfs, abs, content, { append: step.args.append === true || step.args.append === "true", createParents: true, maxTotalBytes: policy.limits.memoryKb * 1024 });
    return { ok: true, summary: `wrote ${byteLength(content)} bytes to ${abs}`, retryable: false };
  } catch (e) {
    return { ok: false, summary: e instanceof Error ? e.message : String(e), retryable: false };
  }
}

/* ---------------- Run lifecycle ---------------- */

export function agentRunView(run: Row) {
  const policy = run.policy as ExecPolicy;
  const used = run.usage as Usage;
  return {
    id: run.id,
    workspaceId: run.workspaceId as string,
    ownerId: run.ownerId as string,
    name: run.name as string,
    status: run.status as AgentRunStatus,
    stopReason: (run.stopReason as string | null) ?? null,
    approvalRequired: false as const,
    policyVersion: policy.version,
    plannedSteps: (run.plan as AgentStep[]).length,
    cursor: run.cursor as number,
    steps: (run.steps as AgentStepRecord[]).map((s) => ({ ...s, args: { ...s.args } })),
    budget: { used: { ...used }, limit: usageLimits(policy.limits), remaining: remainingUsage(used, policy.limits) },
    startedAt: run.startedAt as string,
    finishedAt: (run.finishedAt as string | null) ?? null,
    sandbox: "simulated" as const,
  };
}

function loadRun(store: TenantStore, actor: Actor, runId: string): { run: Row; ws: Row } {
  const run = store.get(AGENT_RUN_TABLE, String(runId));
  if (!run) throw new CampusError("not_found", "Agent run not found", 404);
  try {
    return { run, ws: _loadForAgent(store, actor, run.workspaceId as string) };
  } catch (e) {
    if (e instanceof CampusError && e.status === 403) store.audit({ actorId: actor.id, actorRoles: effectiveRoles(actor), action: "agent.run", resource: `${AGENT_RUN_TABLE}/${run.id}`, outcome: "denied", reason: "not_owner" });
    throw e;
  }
}

/** Start a run. By default it runs to completion immediately; pass { advance: false } to step it. */
export function startAgentRun(store: TenantStore, actor: Actor, wsId: string, planInput: unknown, opts: { advance?: boolean } = {}) {
  const ws = _loadForAgent(store, actor, wsId);
  if (ws.status === "paused_by_instructor") throw new CampusError("paused", "Your instructor paused this simulated sandbox lab; agent runs are disabled until it resumes.", 423);
  const plan = parseAgentPlan(planInput);
  const run = store.tx(() => {
    const policy = effectivePolicy(store, ws.courseId as string, ws.labKey as string);
    const row = store.insert(
      AGENT_RUN_TABLE,
      { workspaceId: ws.id, ownerId: actor.id, courseId: ws.courseId, labKey: ws.labKey, name: plan.name, plan: plan.steps, onBlocked: plan.onBlocked, policy, cursor: 0, steps: [], usage: zeroUsage(), status: "running" as AgentRunStatus, stopReason: null, startedAt: nowIso(), finishedAt: null, consecutiveFailures: 0 },
      "arun",
    );
    audit(store, actor, "agent.start", `${AGENT_RUN_TABLE}/${row.id}`, `policy v${policy.version}`);
    return row;
  });
  if (opts.advance === false) return agentRunView(run);
  return advanceAgentRun(store, actor, run.id);
}

/** Execute up to `maxSteps` more plan steps (all remaining by default). */
export function advanceAgentRun(store: TenantStore, actor: Actor, runId: string, maxSteps = Number.POSITIVE_INFINITY) {
  const { run, ws } = loadRun(store, actor, runId);
  if (run.status !== "running") return agentRunView(run);
  return store.tx(() => {
    const policy = run.policy as ExecPolicy;
    const template = getTemplate(ws.templateId as string);
    const plan = run.plan as AgentStep[];
    const records = [...(run.steps as AgentStepRecord[])];
    const state: ShellState = { vfs: vfsClone(ws.files as Vfs), cwd: WORKSPACE_ROOT, env: { ...(ws.env as Record<string, string>) }, history: [...(ws.history as string[])], usage: { ...(run.usage as Usage) } };
    let cursor = run.cursor as number;
    let consecutive = (run.consecutiveFailures as number) ?? 0;
    let status: AgentRunStatus = "running";
    let stopReason: string | null = null;
    let executed = 0;

    if (ws.status === "paused_by_instructor") {
      status = "stopped_by_instructor";
      stopReason = "The instructor paused this lab.";
    }
    while (status === "running" && cursor < plan.length && executed < maxSteps) {
      const dim = budgetExhausted(state.usage, policy.limits);
      if (dim) {
        status = "budget_exhausted";
        stopReason = budgetMessage(dim, state.usage, policy.limits);
        break;
      }
      const step = plan[cursor];
      const allowedRetries = Math.min(step.retries, policy.limits.maxRetries);
      let attempts = 0;
      let out: StepOutcome;
      do {
        attempts++;
        out = execStep(step, { state, policy, template });
      } while (!out.ok && out.retryable && attempts <= allowedRetries && !budgetExhausted(state.usage, policy.limits));
      records.push({ index: cursor, tool: step.tool, args: Object.fromEntries(Object.entries(step.args).map(([k, v]) => [k, typeof v === "string" ? clip(v, 200) : v])), ok: out.ok, attempts, resultSummary: out.summary, ...(out.blockedReason ? { blockedReason: out.blockedReason } : {}), at: nowIso() });
      cursor++;
      executed++;
      consecutive = out.ok ? 0 : consecutive + 1;
      if (out.blockedReason && (run.onBlocked === "stop" || policy.stopConditions.onBlocked === "stop")) {
        status = "stopped_on_policy";
        stopReason = `Step ${cursor} was blocked by policy and the plan says to stop on a blocked step.`;
      } else if (!out.ok && !out.blockedReason && step.onFailure === "stop") {
        status = "failed";
        stopReason = `Step ${cursor} failed and is marked onFailure: stop.`;
      } else if (consecutive >= policy.stopConditions.maxConsecutiveFailures) {
        status = "failed";
        stopReason = `${consecutive} consecutive steps failed (policy stop condition).`;
      }
    }
    if (status === "running" && cursor >= plan.length) status = "completed";
    if (status === "running") {
      const dim = budgetExhausted(state.usage, policy.limits);
      if (dim && cursor < plan.length) {
        status = "budget_exhausted";
        stopReason = budgetMessage(dim, state.usage, policy.limits);
      }
    }
    const done = status !== "running";
    const now = nowIso();
    store.update(WS_TABLE, ws.id, { files: state.vfs, history: state.history, lastActivityAt: now, autosaveAt: now, saveStatus: "autosaved" });
    const next = store.update(AGENT_RUN_TABLE, run.id, { steps: records, cursor, usage: state.usage, status, stopReason, consecutiveFailures: consecutive, finishedAt: done ? now : null });
    if (records.some((r) => r.blockedReason)) store.audit({ actorId: actor.id, actorRoles: effectiveRoles(actor, ws.courseId as string), action: "agent.step", resource: `${AGENT_RUN_TABLE}/${run.id}`, outcome: "denied", reason: "policy_blocked" });
    return agentRunView(next);
  });
}

/** Run a plan to completion (or until a stop condition) with no approval gates. */
export function runAgent(store: TenantStore, actor: Actor, wsId: string, plan: unknown) {
  return startAgentRun(store, actor, wsId, plan);
}

/** Learner stop control: no further steps execute. */
export function stopAgentRun(store: TenantStore, actor: Actor, runId: string) {
  const { run } = loadRun(store, actor, runId);
  if (run.status !== "running") return agentRunView(run);
  return store.tx(() => agentRunView(store.update(AGENT_RUN_TABLE, run.id, { status: "stopped_by_learner", stopReason: "Stopped by the learner.", finishedAt: nowIso() })));
}

export function getAgentRun(store: TenantStore, actor: Actor, runId: string) {
  const { run } = loadRun(store, actor, runId);
  return agentRunView(run);
}

export function listAgentRuns(store: TenantStore, actor: Actor, wsId: string) {
  const ws = _loadForAgent(store, actor, wsId);
  return store.list(AGENT_RUN_TABLE, (r) => r.workspaceId === ws.id).map(agentRunView);
}
