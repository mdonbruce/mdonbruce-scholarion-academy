import { CampusError, nowIso, type TenantStore } from "../../core";
import { isWithin, WORKSPACE_ROOT } from "./vfs";

/**
 * Execution policy for simulated sandbox workspaces and bounded agent runs.
 *
 * Policies live in the tenant store (table `workspace_policies`), one versioned row per
 * change for a course + lab. A run (a terminal session or an agent run) freezes the policy
 * that was current when it started, so an instructor change only affects future runs.
 * Enforcement happens in the service using that frozen copy — never from anything inside
 * the learner's files (a learner file called policy.json is just text).
 */

export const TOOLS = ["EXECUTE_BASH", "FILE_WRITE", "FILE_READ", "HTTP_REQUEST"] as const;
export type Tool = (typeof TOOLS)[number];

export interface PolicyLimits {
  /** Simulated clock milliseconds (no real time is spent). */
  runtimeMs: number;
  /** Words processed (commands + outputs). */
  tokens: number;
  memoryKb: number;
  cpuUnits: number;
  costUnits: number;
  maxSteps: number;
  maxRetries: number;
}

export interface ExecPolicy {
  version: number;
  tools: Record<Tool, boolean>;
  /** Everything learners and agents may touch lives under this path (always inside /workspace). */
  fsBoundary: string;
  /** EXECUTE_BASH (the simulated shell) only runs with a working directory inside one of these. */
  bashDirs: string[];
  /** Only simulated hosts; real hosts are never contacted. */
  network: { allowedHosts: string[]; schemes: string[] };
  /** Credentials are always simulated tokens; production credentials are never in scope. */
  credentials: { scope: "simulated"; names: string[] };
  limits: PolicyLimits;
  /** Readable roots (inside fsBoundary). */
  dataAccess: string[];
  stopConditions: { onBlocked: "continue" | "stop"; maxConsecutiveFailures: number };
}

export const SIMULATED_HOSTS = ["api.scholarion.local", "data.scholarion.local", "cloud.sim.scholarion.local"];

/** Paths that are never reachable, whatever a policy says. */
export const PROTECTED_ROOTS = ["/instructor", "/keys", "/answer-keys", "/etc", "/root", "/proc", "/sys", "/dev", "/var", "/home", "/tmp", "/usr", "/bin"];

export const DEFAULT_POLICY: ExecPolicy = {
  version: 1,
  tools: { EXECUTE_BASH: true, FILE_WRITE: true, FILE_READ: true, HTTP_REQUEST: true },
  fsBoundary: WORKSPACE_ROOT,
  bashDirs: [WORKSPACE_ROOT],
  network: { allowedHosts: [...SIMULATED_HOSTS], schemes: ["sim", "https", "http"] },
  credentials: { scope: "simulated", names: ["SIM_API_TOKEN"] },
  limits: { runtimeMs: 600_000, tokens: 200_000, memoryKb: 5120, cpuUnits: 5_000, costUnits: 200, maxSteps: 500, maxRetries: 2 },
  dataAccess: [WORKSPACE_ROOT],
  stopConditions: { onBlocked: "continue", maxConsecutiveFailures: 5 },
};

export const LIMIT_CAPS: PolicyLimits = { runtimeMs: 3_600_000, tokens: 2_000_000, memoryKb: 5120, cpuUnits: 50_000, costUnits: 2_000, maxSteps: 5_000, maxRetries: 5 };

export const isSimulatedHost = (h: string) => SIMULATED_HOSTS.includes(h) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.scholarion\.local$/.test(h);

const bad = (msg: string): never => {
  throw new CampusError("invalid_policy", msg, 400);
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function cleanDir(p: unknown, field: string): string {
  if (typeof p !== "string" || !p.startsWith("/")) bad(`${field} must be an absolute path under /workspace.`);
  const s = (p as string).replace(/\/+$/, "") || "/";
  if (!isWithin(s, WORKSPACE_ROOT) || s.split("/").some((x) => x === ".." || x === ".")) bad(`${field} must stay inside /workspace.`);
  return s;
}

/** Apply an instructor patch to a base policy, validating every field. */
export function applyPolicyPatch(base: ExecPolicy, patch: unknown, version: number): ExecPolicy {
  if (!isObj(patch)) bad("Policy changes must be an object.");
  const p = patch as Record<string, unknown>;
  const known = ["tools", "fsBoundary", "bashDirs", "network", "credentials", "limits", "dataAccess", "stopConditions"];
  for (const k of Object.keys(p)) if (!known.includes(k)) bad(`Unknown policy field "${k}".`);
  const next: ExecPolicy = JSON.parse(JSON.stringify(base));
  next.version = version;
  if (p.tools !== undefined) {
    if (!isObj(p.tools)) bad("tools must map tool names to true/false.");
    for (const [k, v] of Object.entries(p.tools as object)) {
      if (!(TOOLS as readonly string[]).includes(k)) bad(`Unknown tool "${k}". Permitted tools: ${TOOLS.join(", ")}.`);
      if (typeof v !== "boolean") bad(`tools.${k} must be true or false.`);
      next.tools[k as Tool] = v as boolean;
    }
  }
  if (p.fsBoundary !== undefined) next.fsBoundary = cleanDir(p.fsBoundary, "fsBoundary");
  if (p.bashDirs !== undefined) {
    if (!Array.isArray(p.bashDirs) || !p.bashDirs.length) bad("bashDirs must be a non-empty list of lab directories.");
    next.bashDirs = (p.bashDirs as unknown[]).map((d) => cleanDir(d, "bashDirs"));
  }
  if (p.dataAccess !== undefined) {
    if (!Array.isArray(p.dataAccess) || !p.dataAccess.length) bad("dataAccess must be a non-empty list of paths.");
    next.dataAccess = (p.dataAccess as unknown[]).map((d) => cleanDir(d, "dataAccess"));
  }
  for (const d of [...next.bashDirs, ...next.dataAccess]) if (!isWithin(d, next.fsBoundary)) bad(`${d} is outside the filesystem boundary ${next.fsBoundary}.`);
  if (p.network !== undefined) {
    if (!isObj(p.network)) bad("network must be an object.");
    const n = p.network as Record<string, unknown>;
    if (n.allowedHosts !== undefined) {
      if (!Array.isArray(n.allowedHosts)) bad("network.allowedHosts must be a list.");
      next.network.allowedHosts = (n.allowedHosts as unknown[]).map((h) => {
        const host = String(h).toLowerCase();
        if (!isSimulatedHost(host)) bad(`"${host}" is not a simulated host. Only *.scholarion.local simulated endpoints can be allowed; real hosts are never contacted.`);
        return host;
      });
    }
    if (n.schemes !== undefined) {
      if (!Array.isArray(n.schemes)) bad("network.schemes must be a list.");
      next.network.schemes = (n.schemes as unknown[]).map((s) => {
        if (!["sim", "http", "https"].includes(String(s))) bad(`Scheme "${String(s)}" is not supported.`);
        return String(s);
      });
    }
  }
  if (p.credentials !== undefined) {
    if (!isObj(p.credentials)) bad("credentials must be an object.");
    const c = p.credentials as Record<string, unknown>;
    if (c.scope !== undefined && c.scope !== "simulated") bad("Credential scope is always simulated; production credentials can't be granted.");
    if (c.names !== undefined) {
      if (!Array.isArray(c.names)) bad("credentials.names must be a list.");
      next.credentials.names = (c.names as unknown[]).map((x) => {
        if (typeof x !== "string" || !/^SIM_[A-Z0-9_]{1,40}$/.test(x)) bad("Credential names must look like SIM_NAME (simulated only).");
        return x as string;
      });
    }
    next.credentials.scope = "simulated";
  }
  if (p.limits !== undefined) {
    if (!isObj(p.limits)) bad("limits must be an object.");
    for (const [k, v] of Object.entries(p.limits as object)) {
      if (!(k in LIMIT_CAPS)) bad(`Unknown limit "${k}".`);
      const cap = LIMIT_CAPS[k as keyof PolicyLimits];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || (v !== Math.floor(v))) bad(`limits.${k} must be a whole number ≥ 0.`);
      if ((v as number) > cap) bad(`limits.${k} can't exceed ${cap}.`);
      next.limits[k as keyof PolicyLimits] = v as number;
    }
  }
  if (p.stopConditions !== undefined) {
    if (!isObj(p.stopConditions)) bad("stopConditions must be an object.");
    const s = p.stopConditions as Record<string, unknown>;
    if (s.onBlocked !== undefined) {
      if (s.onBlocked !== "continue" && s.onBlocked !== "stop") bad('stopConditions.onBlocked must be "continue" or "stop".');
      next.stopConditions.onBlocked = s.onBlocked as "continue" | "stop";
    }
    if (s.maxConsecutiveFailures !== undefined) {
      const m = s.maxConsecutiveFailures;
      if (typeof m !== "number" || m < 1 || m > 100 || m !== Math.floor(m)) bad("stopConditions.maxConsecutiveFailures must be 1–100.");
      next.stopConditions.maxConsecutiveFailures = m as number;
    }
  }
  return next;
}

/* ---------------- Stored versions ---------------- */

export const POLICY_TABLE = "workspace_policies";

/** The policy that a run starting now would freeze. */
export function effectivePolicy(store: TenantStore, courseId: string, labKey: string): ExecPolicy {
  const rows = store.list(POLICY_TABLE, (r) => r.courseId === courseId && r.labKey === labKey);
  if (!rows.length) return JSON.parse(JSON.stringify(DEFAULT_POLICY));
  const latest = rows.reduce((a, b) => ((a.policyVersion as number) >= (b.policyVersion as number) ? a : b));
  return JSON.parse(JSON.stringify(latest.policy)) as ExecPolicy;
}

export function savePolicyVersion(store: TenantStore, courseId: string, labKey: string, patch: unknown, setBy: string): ExecPolicy {
  const base = effectivePolicy(store, courseId, labKey);
  const next = applyPolicyPatch(base, patch, base.version + 1);
  store.insert(POLICY_TABLE, { courseId, labKey, policyVersion: next.version, policy: next, setBy, setAt: nowIso() }, "wpol");
  return next;
}

/* ---------------- Usage and budget ---------------- */

export interface Usage {
  steps: number;
  cpuUnits: number;
  tokens: number;
  runtimeMs: number;
  costUnits: number;
}
export const zeroUsage = (): Usage => ({ steps: 0, cpuUnits: 0, tokens: 0, runtimeMs: 0, costUnits: 0 });

export function usageLimits(l: PolicyLimits): Usage {
  return { steps: l.maxSteps, cpuUnits: l.cpuUnits, tokens: l.tokens, runtimeMs: l.runtimeMs, costUnits: l.costUnits };
}

/** The first exhausted budget dimension, or null. */
export function budgetExhausted(u: Usage, l: PolicyLimits): keyof Usage | null {
  const lim = usageLimits(l);
  for (const k of Object.keys(lim) as (keyof Usage)[]) if (u[k] >= lim[k]) return k;
  return null;
}

export function budgetMessage(dim: keyof Usage, u: Usage, l: PolicyLimits): string {
  const lim = usageLimits(l);
  return `Simulated sandbox budget exhausted: the ${dim} limit was reached (${u[dim]}/${lim[dim]}). Execution stopped; your files are saved. Ask your instructor to raise the lab limit.`;
}

export function remainingUsage(u: Usage, l: PolicyLimits): Usage {
  const lim = usageLimits(l);
  const r = zeroUsage();
  for (const k of Object.keys(lim) as (keyof Usage)[]) r[k] = Math.max(0, lim[k] - u[k]);
  return r;
}

/* ---------------- Decisions ---------------- */

export type Decision = { ok: true } | { ok: false; tool: Tool; reason: string };
const blocked = (tool: Tool, reason: string): Decision => ({ ok: false, tool, reason });

function toolOff(p: ExecPolicy, tool: Tool): Decision | null {
  return p.tools[tool] ? null : blocked(tool, `${tool} is not permitted by this lab's execution policy.`);
}

function pathDecision(p: ExecPolicy, tool: Tool, abs: string, verb: string): Decision {
  const off = toolOff(p, tool);
  if (off) return off;
  if (PROTECTED_ROOTS.some((r) => isWithin(abs, r))) return blocked(tool, `${verb} ${abs} is outside the simulated sandbox. System paths and instructor keys are never reachable.`);
  if (!isWithin(abs, p.fsBoundary)) return blocked(tool, `${verb} ${abs} is outside the filesystem boundary (${p.fsBoundary}).`);
  return { ok: true };
}

export function checkFileRead(p: ExecPolicy, abs: string): Decision {
  const d = pathDecision(p, "FILE_READ", abs, "Reading");
  if (!d.ok) return d;
  if (!p.dataAccess.some((r) => isWithin(abs, r))) return blocked("FILE_READ", `Reading ${abs} is outside the data this lab allows (${p.dataAccess.join(", ")}).`);
  return d;
}

export function checkFileWrite(p: ExecPolicy, abs: string): Decision {
  return pathDecision(p, "FILE_WRITE", abs, "Writing");
}

export function checkBash(p: ExecPolicy, cwd: string): Decision {
  const off = toolOff(p, "EXECUTE_BASH");
  if (off) return off;
  if (!p.bashDirs.some((d) => isWithin(cwd, d))) return blocked("EXECUTE_BASH", `Shell commands may only run inside the lab directories (${p.bashDirs.join(", ")}); ${cwd} is outside them.`);
  return { ok: true };
}

export interface ParsedUrl {
  scheme: string;
  host: string;
  path: string;
}

export function parseUrl(url: string): ParsedUrl | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]*)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(url.trim());
  if (!m) return null;
  return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), path: m[3] || "/" };
}

export function checkHttp(p: ExecPolicy, url: string): Decision & { target?: ParsedUrl } {
  const off = toolOff(p, "HTTP_REQUEST");
  if (off) return off;
  const u = parseUrl(String(url ?? ""));
  if (!u) return blocked("HTTP_REQUEST", "That URL couldn't be parsed. Simulated endpoints look like sim://api.scholarion.local/v1/health.");
  if (u.host.includes("@")) return blocked("HTTP_REQUEST", "URLs with embedded credentials (user@host) are blocked by policy.");
  if (u.host.includes(":")) return blocked("HTTP_REQUEST", "Custom ports are blocked by policy; use the simulated endpoint as given.");
  if (!p.network.schemes.includes(u.scheme)) return blocked("HTTP_REQUEST", `The ${u.scheme}:// scheme is blocked by policy.`);
  if (!p.network.allowedHosts.includes(u.host)) {
    return blocked("HTTP_REQUEST", `Request to ${u.host} blocked by policy: only simulated endpoints (${p.network.allowedHosts.join(", ")}) are reachable. No real network request was made.`);
  }
  return { ok: true, target: u };
}
