import { posix } from "node:path";

/**
 * Graded Agentic Cloud Lab: "Implement a bounded tool runner" (AI-801 Module 1).
 *
 * Learner code is never executed on the server. The lab is graded deterministically from the
 * frozen workspace snapshot:
 *  - Architecture: runner/agent.py declares perceive(), plan() and remember() (static check).
 *  - Tool bounds: runner/bounds.json is applied, by this grader, to a fixed set of hidden
 *    tool-call vectors (traversal, absolute paths, network) and compared with the expected
 *    decisions. The learner's configuration is data; it can't change the vectors or the rubric.
 *  - Task completion: runner/plan.json is replayed against the learner's bounds and the lab
 *    policy: it must read /workspace/system.log and write /workspace/summary.txt within the
 *    step budget, with no blocked step.
 *  - Code structure: error handling and logging present in runner/agent.py (static check).
 */

export interface Bounds {
  allowed_root: string;
  deny_traversal: boolean;
  tools: string[];
  http_allowlist: string[];
  max_steps: number;
}

export type Share = { share: number; notes: string[] };

const STEP_CAP = 10;

export function parseBounds(text: string | undefined): Bounds | null {
  if (!text) return null;
  try {
    const j = JSON.parse(text) as Partial<Bounds>;
    return {
      allowed_root: typeof j.allowed_root === "string" ? j.allowed_root : "/",
      deny_traversal: j.deny_traversal === true,
      tools: Array.isArray(j.tools) ? j.tools.map(String) : [],
      http_allowlist: Array.isArray(j.http_allowlist) ? j.http_allowlist.map(String) : [],
      max_steps: Math.max(1, Math.min(100, Number(j.max_steps) || 100)),
    };
  } catch {
    return null;
  }
}

/** How the learner's configuration would decide a call. Traversal is only caught when deny_traversal is on. */
export function decide(b: Bounds, call: { tool: string; path?: string; url?: string }): boolean {
  if (!b.tools.includes(call.tool)) return false;
  if (call.tool === "HTTP_REQUEST") {
    let host = "";
    try {
      host = new URL(String(call.url).replace(/^sim:\/\//, "https://")).hostname;
    } catch {
      return false;
    }
    return b.http_allowlist.includes(host);
  }
  const raw = String(call.path ?? "");
  const root = b.allowed_root.replace(/\/+$/, "") || "/";
  const target = b.deny_traversal ? posix.normalize(raw) : raw;
  if (b.deny_traversal && raw.includes("..")) return false;
  return root === "/" ? true : target === root || target.startsWith(`${root}/`);
}

/** Hidden vectors: tool call and whether a correctly bounded runner must allow it. */
export const BOUNDS_VECTORS: { call: { tool: string; path?: string; url?: string }; allow: boolean; label: string }[] = [
  { call: { tool: "EXECUTE_BASH", path: "/workspace/ls" }, allow: true, label: "bash inside /workspace" },
  { call: { tool: "FILE_WRITE", path: "/workspace/summary.txt" }, allow: true, label: "write inside /workspace" },
  { call: { tool: "FILE_READ", path: "/workspace/system.log" }, allow: true, label: "read inside /workspace" },
  { call: { tool: "EXECUTE_BASH", path: "/etc/passwd" }, allow: false, label: "bash outside /workspace" },
  { call: { tool: "FILE_WRITE", path: "/workspace/../etc/hosts" }, allow: false, label: "write by path traversal" },
  { call: { tool: "FILE_WRITE", path: "/workspace-evil/x" }, allow: false, label: "look-alike root prefix" },
  { call: { tool: "HTTP_REQUEST", url: "sim://api.scholarion.local/v1/status" }, allow: true, label: "allowlisted simulated API" },
  { call: { tool: "HTTP_REQUEST", url: "https://example.com/exfil" }, allow: false, label: "non-allowlisted host" },
];

const defs = (py: string) => new Set([...py.matchAll(/^\s*def\s+([A-Za-z_]\w*)\s*\(/gm)].map((m) => m[1]));

export function gradeBoundedRunner(files: Record<string, string> | undefined): Record<string, Share> {
  const f = files ?? {};
  const py = f["runner/agent.py"] ?? "";
  const bounds = parseBounds(f["runner/bounds.json"]);
  const out: Record<string, Share> = {};

  // Architecture: perception, planning and memory modules.
  const d = defs(py);
  const have = ["perceive", "plan", "remember"].filter((n) => d.has(n));
  out.architecture = { share: have.length === 3 ? 1 : have.length === 2 ? 0.5 : 0, notes: have.length === 3 ? [] : [`runner/agent.py needs def ${["perceive", "plan", "remember"].filter((n) => !d.has(n)).join("(), def ")}()`] };

  // Tool bounds against hidden vectors.
  if (!bounds) out.bounds = { share: 0, notes: ["runner/bounds.json is missing or isn't valid JSON"] };
  else {
    const wrong = BOUNDS_VECTORS.filter((v) => decide(bounds, v.call) !== v.allow);
    const right = BOUNDS_VECTORS.length - wrong.length;
    out.bounds = { share: wrong.length === 0 ? 1 : right >= BOUNDS_VECTORS.length / 2 ? 0.5 : 0, notes: wrong.map((w) => `${w.allow ? "should allow" : "should block"}: ${w.label}`) };
  }

  // Task completion: replay the plan within the learner's bounds and the step budget.
  let plan: { steps?: { tool: string; args?: { path?: string; url?: string } }[] } | null = null;
  try {
    plan = f["runner/plan.json"] ? JSON.parse(f["runner/plan.json"]) : null;
  } catch {
    plan = null;
  }
  if (!plan?.steps?.length || !bounds) out.completion = { share: 0, notes: [plan ? "runner/plan.json has no steps" : "runner/plan.json is missing or invalid"] };
  else {
    const steps = plan.steps.slice(0, STEP_CAP + 1);
    const notes: string[] = [];
    const budget = Math.min(bounds.max_steps, STEP_CAP);
    if (plan.steps.length > budget) notes.push(`plan uses ${plan.steps.length} steps; the budget is ${budget}`);
    // A step is blocked if the learner's bounds refuse it, or the lab policy would (outside /workspace, non-simulated host).
    const labAllows = (s: { tool: string; args?: { path?: string; url?: string } }) => {
      if (s.args?.path !== undefined) return posix.normalize(String(s.args.path)).startsWith("/workspace/");
      if (s.args?.url !== undefined) return /^sim:\/\/[a-z0-9.-]+\.scholarion\.local\//.test(String(s.args.url));
      return s.tool === "EXECUTE_BASH";
    };
    const blocked = steps.filter((s) => !decide(bounds, { tool: s.tool, path: s.args?.path, url: s.args?.url }) || !labAllows(s));
    if (blocked.length) notes.push(`${blocked.length} step(s) would be blocked by the lab policy`);
    const read = steps.some((s) => s.tool === "FILE_READ" && posix.normalize(String(s.args?.path ?? "")) === "/workspace/system.log");
    const wrote = steps.some((s) => s.tool === "FILE_WRITE" && posix.normalize(String(s.args?.path ?? "")) === "/workspace/summary.txt");
    if (!read) notes.push("read /workspace/system.log");
    if (!wrote) notes.push("write /workspace/summary.txt");
    out.completion = { share: read && wrote && !notes.length ? 1 : read || wrote ? 0.5 : 0, notes };
  }

  // Code structure: error handling and logging.
  const handled = /\btry\s*:/.test(py) && /\bexcept\b/.test(py);
  const logs = /\bimport\s+logging\b|\blogging\.getLogger\b|\blogger\.\w+\(/.test(py);
  out.code = { share: handled && logs ? 1 : handled || logs ? 0.5 : 0, notes: [...(handled ? [] : ["add try/except error handling"]), ...(logs ? [] : ["add logging"])] };
  return out;
}

export const BOUNDED_RUNNER_FILES: Record<string, string> = {
  "runner/agent.py": `"""AI-801 Module 1 graded lab: a bounded tool runner.

Complete perceive(), plan() and remember(), then make the runner safe:
error handling, logging, and bounds that keep every tool inside /workspace.
The grader never runs this file; it checks its structure and replays your plan
against your bounds (runner/bounds.json) and the lab policy.
"""


def perceive(event):
    """Turn a raw trigger into a typed record."""
    return {"kind": "log_review", "path": "/workspace/system.log", "raw": event}


def plan(record):
    """Return ordered tool steps for the task."""
    return [
        {"tool": "FILE_READ", "args": {"path": record["path"]}},
        {"tool": "FILE_WRITE", "args": {"path": "/workspace/summary.txt"}},
    ]


# TODO: def remember(key, value): keep short-term working memory for this run.
`,
  "runner/bounds.json": `${JSON.stringify({ allowed_root: "/workspace", deny_traversal: false, tools: ["EXECUTE_BASH", "FILE_READ", "FILE_WRITE"], http_allowlist: [], max_steps: 8 }, null, 2)}\n`,
  "runner/plan.json": `${JSON.stringify({ name: "summarize-errors", steps: [{ tool: "FILE_READ", args: { path: "/workspace/system.log" } }] }, null, 2)}\n`,
  "system.log": "2026-10-01T09:00:01Z INFO  service started (synthetic)\n2026-10-01T09:02:13Z ERROR timeout calling sim://api.scholarion.local/v1/status\n2026-10-01T09:05:40Z WARN  retrying\n2026-10-01T09:06:02Z ERROR queue full\n2026-10-01T09:07:15Z ERROR disk quota exceeded in /workspace/tmp\n",
  "README.md": "# Graded lab: implement a bounded tool runner\n\nSynthetic data. Edit `runner/agent.py`, `runner/bounds.json` and `runner/plan.json`.\n\n1. Add `remember()` so the runner has perception, planning and memory.\n2. Bounds: keep every tool inside `/workspace`, block path traversal, and allow HTTP only to `api.scholarion.local`.\n3. Plan: read `/workspace/system.log`, then write `/workspace/summary.txt`, within 8 steps.\n4. Add try/except error handling and logging.\n\nPractice runs are unlimited. Two graded submissions; the highest counts. Pass mark 70%; tool bounds must pass.\n",
};
