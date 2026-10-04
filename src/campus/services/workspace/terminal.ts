import { CampusError } from "../../core";
import { budgetExhausted, budgetMessage, checkBash, checkFileRead, checkFileWrite, checkHttp, type ExecPolicy, type Tool, type Usage } from "./policy";
import { runValidation, simEndpoint, type ValidationResult, type WorkspaceTemplate } from "./templates";
import {
  byteLength,
  isWithin,
  normalizePath,
  vfsCopy,
  vfsList,
  vfsMkdir,
  vfsMove,
  vfsRead,
  vfsRemove,
  vfsStat,
  vfsTouch,
  vfsTree,
  vfsWrite,
  WORKSPACE_ROOT,
  type Vfs,
} from "./vfs";

/**
 * Simulated shell for sandbox workspaces.
 *
 * A small, pure TypeScript interpreter over the virtual filesystem. Learner input is parsed
 * as data and dispatched to a fixed table of built-in commands; nothing is handed to the host.
 * Programs (python, node, docker, pip, npm …) are not run: the shell says plainly that a
 * container runner is required and is not connected.
 */

export interface ShellState {
  vfs: Vfs;
  cwd: string;
  env: Record<string, string>;
  history: string[];
  usage: Usage;
  lastValidation?: ValidationResult;
}

export interface ShellResult {
  output: string;
  exitCode: number;
  clear?: boolean;
  mutated: boolean;
  blocked?: { tool: Tool; reason: string };
  budgetExhausted?: keyof Usage;
}

export const RUNNER_MESSAGE =
  "Simulated sandbox: running programs requires the container runner, which is not connected in this environment. " +
  "This is a configuration requirement (an administrator must connect a container runner); nothing was executed. " +
  "Your files are saved — use `scholarion validate` to check your work.";

export const RUNNER_COMMANDS = new Set([
  "python", "python3", "pip", "pip3", "pytest", "node", "npm", "npx", "yarn", "pnpm", "deno", "bun",
  "docker", "docker-compose", "kubectl", "terraform", "make", "java", "javac", "go", "cargo", "gcc", "g++",
  "bash", "sh", "zsh", "ruby", "php", "perl", "aws", "gcloud", "az", "git", "ssh", "wget", "sudo", "apt", "apt-get",
]);

const MAX_OUTPUT = 64 * 1024;
const HISTORY_MAX = 500;
const MAX_LINE = 4096;

const HELP = `Scholarion simulated sandbox shell — built-in commands only (nothing runs on a real machine).

  help                     this help
  pwd | cd [dir]           print / change directory (inside /workspace)
  ls [-la] [path]          list files            tree [path]   show the file tree
  cat | head | tail        print files (-n N for head/tail)
  wc [-lwc] | grep [-i -n -v -c] TEXT [files]   count / search (fixed-text match)
  echo TEXT [> file | >> file]                  write text to a file
  mkdir [-p] | touch | rm [-r] | cp [-r] | mv   manage files
  env | history | clear                         environment, history, clear screen
  curl URL                 simulated HTTP (only simulated endpoints such as sim://api.scholarion.local/v1/health)
  scholarion validate      run this lab's checks       scholarion status   budget use
  Pipes: cat file | grep text | wc -l

python, node, docker, pip and npm need the container runner, which is not connected here.
`;

class Blocked extends Error {
  constructor(
    public tool: Tool,
    public reason: string,
  ) {
    super(reason);
  }
}
class ShellErr extends Error {
  constructor(
    message: string,
    public code = 1,
  ) {
    super(message);
  }
}

interface Ctx {
  state: ShellState;
  policy: ExecPolicy;
  template: WorkspaceTemplate;
  mutated: boolean;
  bytes: number;
  http: number;
  clear: boolean;
}

type Out = { out: string; err?: string; code?: number };

/* ---------------- Tokenizer ---------------- */

type Tok = { word: string } | { op: "|" | ">" | ">>" };

const VAR_RE = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/;

function expandVars(s: string, env: Record<string, string>): string {
  return s.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (_m, a, b) => env[(a ?? b) as string] ?? "");
}

export function tokenize(line: string, env: Record<string, string>): Tok[] {
  const out: Tok[] = [];
  let cur = "";
  let has = false;
  const push = () => {
    if (has) out.push({ word: cur });
    cur = "";
    has = false;
  };
  const unsupported = (what: string) => new ShellErr(`Simulated sandbox shell: ${what} is not supported (only pipes | and redirects > >> are available).`, 2);
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === "'") {
      const j = line.indexOf("'", i + 1);
      if (j < 0) throw new ShellErr("syntax error: unterminated quote", 2);
      cur += line.slice(i + 1, j);
      has = true;
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < line.length && /["\\$]/.test(line[j + 1])) {
          s += line[j + 1] === "$" ? "\u0000" : line[j + 1];
          j += 2;
        } else s += line[j++];
      }
      if (j >= line.length) throw new ShellErr("syntax error: unterminated quote", 2);
      cur += expandVars(s, env).replace(/\u0000/g, "$");
      has = true;
      i = j + 1;
    } else if (/\s/.test(c)) {
      push();
      i++;
    } else if (c === "|") {
      if (line[i + 1] === "|") throw unsupported("'||'");
      push();
      out.push({ op: "|" });
      i++;
    } else if (c === ">") {
      push();
      if (line[i + 1] === ">") {
        out.push({ op: ">>" });
        i += 2;
      } else {
        out.push({ op: ">" });
        i++;
      }
    } else if (c === ";" || c === "&" || c === "<" || c === "`") {
      throw unsupported(`'${c}'`);
    } else if (c === "$") {
      const m = VAR_RE.exec(line.slice(i));
      if (m) {
        cur += env[(m[1] ?? m[2]) as string] ?? "";
        has = true;
        i += m[0].length;
      } else if (line[i + 1] === "(") throw unsupported("'$(...)'");
      else {
        cur += c;
        has = true;
        i++;
      }
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[i + 1];
      has = true;
      i += 2;
    } else {
      cur += c;
      has = true;
      i++;
    }
  }
  push();
  return out;
}

interface Stage {
  argv: string[];
}
interface Pipeline {
  stages: Stage[];
  redirect?: { append: boolean; target: string };
}

function parsePipeline(toks: Tok[]): Pipeline {
  const stages: Stage[] = [{ argv: [] }];
  let redirect: Pipeline["redirect"];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if ("word" in t) {
      if (redirect) throw new ShellErr("syntax error: unexpected text after the redirect target", 2);
      stages[stages.length - 1].argv.push(t.word);
    } else if (t.op === "|") {
      if (redirect) throw new ShellErr("syntax error: a redirect must come at the end of the line", 2);
      if (!stages[stages.length - 1].argv.length) throw new ShellErr("syntax error near '|'", 2);
      stages.push({ argv: [] });
    } else {
      const next = toks[i + 1];
      if (!next || !("word" in next)) throw new ShellErr("syntax error: missing file name after redirect", 2);
      if (redirect) throw new ShellErr("syntax error: only one redirect is supported", 2);
      redirect = { append: t.op === ">>", target: next.word };
      i++;
    }
  }
  if (!stages[stages.length - 1].argv.length) throw new ShellErr("syntax error: missing command", 2);
  return { stages, redirect };
}

/* ---------------- Helpers ---------------- */

function parseFlags(args: string[], known: string): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  let done = false;
  for (const a of args) {
    if (!done && a === "--") done = true;
    else if (!done && /^-[A-Za-z]+$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (!known.includes(ch)) throw new ShellErr(`invalid option -- '${ch}'`, 2);
        flags.add(ch);
      }
    } else rest.push(a);
  }
  return { flags, rest };
}

function lineCountArg(args: string[]): { n: number; rest: string[] } {
  let n = 10;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-n") {
      n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 0) throw new ShellErr("invalid number of lines", 2);
    } else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
    else rest.push(a);
  }
  return { n: Math.min(n, 100_000), rest };
}

function splitLines(s: string): string[] {
  if (s === "") return [];
  const l = s.split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
}
const joinLines = (l: string[]) => (l.length ? l.join("\n") + "\n" : "");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function resolve(c: Ctx, p: string, tool: "FILE_READ" | "FILE_WRITE"): string {
  let abs: string;
  try {
    abs = normalizePath(p, c.state.cwd);
  } catch (e) {
    if (e instanceof CampusError && (e.code === "path_traversal" || e.status === 403)) throw new Blocked(tool, e.message);
    throw new ShellErr(`${p}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const d = tool === "FILE_READ" ? checkFileRead(c.policy, abs) : checkFileWrite(c.policy, abs);
  if (!d.ok) throw new Blocked(d.tool, d.reason);
  return abs;
}

function readText(c: Ctx, p: string): string {
  const abs = resolve(c, p, "FILE_READ");
  const s = vfsRead(c.state.vfs, abs);
  c.bytes += byteLength(s);
  return s;
}

const maxBytes = (c: Ctx) => c.policy.limits.memoryKb * 1024;

function writeText(c: Ctx, p: string, content: string, append: boolean) {
  const abs = resolve(c, p, "FILE_WRITE");
  vfsWrite(c.state.vfs, abs, content, { append, maxTotalBytes: maxBytes(c) });
  c.bytes += byteLength(content);
  c.mutated = true;
}

function inputs(c: Ctx, files: string[], stdin: string | null, cmd: string): { name: string | null; text: string }[] {
  if (files.length) return files.map((f) => ({ name: f, text: readText(c, f) }));
  if (stdin === null) throw new ShellErr(`${cmd}: missing file operand`);
  return [{ name: null, text: stdin }];
}

/** Simulated HTTP request through the policy allowlist. Nothing leaves the simulated sandbox. */
export function simulateHttp(policy: ExecPolicy, template: WorkspaceTemplate, url: string, method = "GET"): { ok: true; status: number; body: unknown } | { ok: false; reason: string } {
  const d = checkHttp(policy, url);
  if (!d.ok) return { ok: false, reason: d.reason };
  const t = d.target!;
  const ep = simEndpoint(template, t.host, t.path);
  if (method !== "GET" && ep.status === 200) return { ok: true, status: 202, body: { sandbox: "simulated", accepted: true, method, note: "Simulated endpoint; nothing was changed anywhere." } };
  return { ok: true, status: ep.status, body: ep.body };
}

/* ---------------- Built-in commands ---------------- */

type Cmd = (args: string[], stdin: string | null, c: Ctx) => Out;

const COMMANDS: Record<string, Cmd> = {
  help: () => ({ out: HELP }),
  pwd: (_a, _s, c) => ({ out: c.state.cwd + "\n" }),
  cd: (args, _s, c) => {
    const target = args[0] ?? WORKSPACE_ROOT;
    let abs: string;
    try {
      abs = normalizePath(target, c.state.cwd);
    } catch (e) {
      throw new Blocked("EXECUTE_BASH", e instanceof Error ? e.message : String(e));
    }
    const d = checkBash(c.policy, abs);
    if (!d.ok) throw new Blocked(d.tool, d.reason);
    const n = vfsStat(c.state.vfs, abs);
    if (!n) throw new ShellErr(`cd: ${target}: No such file or directory`);
    if (n.type !== "dir") throw new ShellErr(`cd: ${target}: Not a directory`);
    c.state.cwd = abs;
    return { out: "" };
  },
  ls: (args, _s, c) => {
    const { flags, rest } = parseFlags(args, "laA1h");
    const targets = rest.length ? rest : ["."];
    const showAll = flags.has("a") || flags.has("A");
    const blocks: string[] = [];
    for (const t of targets) {
      const abs = resolve(c, t, "FILE_READ");
      const n = vfsStat(c.state.vfs, abs);
      if (!n) throw new ShellErr(`ls: cannot access '${t}': No such file or directory`, 2);
      const entries = n.type === "file" ? [{ name: t, node: n }] : vfsList(c.state.vfs, abs).filter((e) => showAll || !e.name.startsWith("."));
      const lines = flags.has("l")
        ? entries.map((e) => `${e.node.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--"} ${String(e.node.type === "file" ? byteLength(e.node.content) : 0).padStart(7)} ${e.node.mtime.slice(0, 16).replace("T", " ")} ${e.name}${e.node.type === "dir" ? "/" : ""}`)
        : entries.map((e) => e.name + (e.node.type === "dir" ? "/" : ""));
      const body = flags.has("l") || flags.has("1") ? joinLines(lines) : lines.length ? lines.join("  ") + "\n" : "";
      blocks.push(targets.length > 1 ? `${t}:\n${body}` : body);
    }
    return { out: blocks.join("\n") };
  },
  cat: (args, stdin, c) => ({ out: inputs(c, args, stdin ?? (args.length ? null : ""), "cat").map((x) => x.text).join("") }),
  head: (args, stdin, c) => {
    const { n, rest } = lineCountArg(args);
    return { out: inputs(c, rest, stdin, "head").map((x) => joinLines(splitLines(x.text).slice(0, n))).join("") };
  },
  tail: (args, stdin, c) => {
    const { n, rest } = lineCountArg(args);
    return { out: inputs(c, rest, stdin, "tail").map((x) => joinLines(n === 0 ? [] : splitLines(x.text).slice(-n))).join("") };
  },
  wc: (args, stdin, c) => {
    const { flags, rest } = parseFlags(args, "lwc");
    const pick = flags.size ? ["l", "w", "c"].filter((f) => flags.has(f)) : ["l", "w", "c"];
    const ins = inputs(c, rest, stdin, "wc");
    const totals = { l: 0, w: 0, c: 0 };
    const lines = ins.map((x) => {
      const counts = { l: (x.text.match(/\n/g) ?? []).length, w: words(x.text), c: byteLength(x.text) };
      totals.l += counts.l;
      totals.w += counts.w;
      totals.c += counts.c;
      const nums = pick.map((k) => counts[k as "l"]);
      return x.name === null && pick.length === 1 ? String(nums[0]) : nums.map((v) => String(v).padStart(7)).join(" ") + (x.name ? ` ${x.name}` : "");
    });
    if (ins.length > 1) lines.push(pick.map((k) => String(totals[k as "l"]).padStart(7)).join(" ") + " total");
    return { out: joinLines(lines) };
  },
  grep: (args, stdin, c) => {
    const { flags, rest } = parseFlags(args, "invcF");
    const pattern = rest[0];
    if (pattern === undefined) throw new ShellErr("usage: grep [-i -n -v -c] TEXT [file...]", 2);
    const ins = inputs(c, rest.slice(1), stdin, "grep");
    const needle = flags.has("i") ? pattern.toLowerCase() : pattern;
    const multi = ins.length > 1;
    const out: string[] = [];
    let total = 0;
    for (const x of ins) {
      let count = 0;
      splitLines(x.text).forEach((line, idx) => {
        const hay = flags.has("i") ? line.toLowerCase() : line;
        const hit = hay.includes(needle) !== flags.has("v");
        if (!hit) return;
        count++;
        if (!flags.has("c")) out.push(`${multi ? `${x.name}:` : ""}${flags.has("n") ? `${idx + 1}:` : ""}${line}`);
      });
      if (flags.has("c")) out.push(`${multi ? `${x.name}:` : ""}${count}`);
      total += count;
    }
    return { out: joinLines(out), code: total ? 0 : 1 };
  },
  echo: (args) => {
    const noNl = args[0] === "-n";
    const text = (noNl ? args.slice(1) : args).join(" ");
    return { out: text + (noNl ? "" : "\n") };
  },
  mkdir: (args, _s, c) => {
    const { flags, rest } = parseFlags(args, "p");
    if (!rest.length) throw new ShellErr("mkdir: missing operand", 2);
    for (const p of rest) vfsMkdir(c.state.vfs, resolve(c, p, "FILE_WRITE"), flags.has("p"));
    c.mutated = true;
    return { out: "" };
  },
  touch: (args, _s, c) => {
    if (!args.length) throw new ShellErr("touch: missing file operand", 2);
    for (const p of args) vfsTouch(c.state.vfs, resolve(c, p, "FILE_WRITE"), maxBytes(c));
    c.mutated = true;
    return { out: "" };
  },
  rm: (args, _s, c) => {
    const { flags, rest } = parseFlags(args, "rRfdv");
    if (!rest.length) throw new ShellErr("rm: missing operand", 2);
    for (const p of rest) {
      const abs = resolve(c, p, "FILE_WRITE");
      if (abs === WORKSPACE_ROOT || abs === c.policy.fsBoundary) throw new ShellErr("rm: refusing to remove the workspace root");
      if (!vfsStat(c.state.vfs, abs) && flags.has("f")) continue;
      vfsRemove(c.state.vfs, abs, flags.has("r") || flags.has("R"));
    }
    c.mutated = true;
    return { out: "" };
  },
  cp: (args, _s, c) => {
    const { flags, rest } = parseFlags(args, "rRv");
    if (rest.length !== 2) throw new ShellErr("usage: cp [-r] SOURCE DEST", 2);
    const src = resolve(c, rest[0], "FILE_READ");
    const dst = resolve(c, rest[1], "FILE_WRITE");
    vfsCopy(c.state.vfs, src, dst, flags.has("r") || flags.has("R"), maxBytes(c));
    c.mutated = true;
    return { out: "" };
  },
  mv: (args, _s, c) => {
    const { rest } = parseFlags(args, "fv");
    if (rest.length !== 2) throw new ShellErr("usage: mv SOURCE DEST", 2);
    const src = resolve(c, rest[0], "FILE_WRITE");
    const dst = resolve(c, rest[1], "FILE_WRITE");
    vfsMove(c.state.vfs, src, dst);
    c.mutated = true;
    return { out: "" };
  },
  tree: (args, _s, c) => {
    const abs = resolve(c, args[0] ?? ".", "FILE_READ");
    return { out: vfsTree(c.state.vfs, abs) };
  },
  env: (_a, _s, c) => ({ out: joinLines(Object.keys(c.state.env).sort().map((k) => `${k}=${c.state.env[k]}`)) }),
  history: (args, _s, c) => {
    if (args[0] === "-c") {
      c.state.history.length = 0;
      return { out: "" };
    }
    return { out: joinLines(c.state.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`)) };
  },
  clear: (_a, _s, c) => {
    c.clear = true;
    return { out: "" };
  },
  curl: (args, _s, c) => {
    let method = "GET";
    let include = false;
    let url: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-X" || a === "--request") method = String(args[++i] ?? "GET").toUpperCase();
      else if (a === "-H" || a === "--header" || a === "-d" || a === "--data" || a === "-o") i++;
      else if (a === "-i" || a === "--include") include = true;
      else if (/^-[A-Za-z]+$/.test(a) || a.startsWith("--")) continue;
      else url ??= a;
    }
    if (!url) throw new ShellErr("curl: no URL specified (try curl sim://api.scholarion.local/v1/health)", 2);
    c.http++;
    const r = simulateHttp(c.policy, c.template, url, method);
    if (!r.ok) throw new Blocked("HTTP_REQUEST", r.reason);
    const body = JSON.stringify(r.body, null, 2) + "\n";
    c.bytes += byteLength(body);
    return { out: (include ? `HTTP/1.1 ${r.status} (simulated)\ncontent-type: application/json\nx-sandbox: simulated\n\n` : "") + body };
  },
  scholarion: (args, _s, c) => {
    const sub = args[0] ?? "help";
    if (sub === "validate") {
      const v = { ...runValidation(c.template, c.state.vfs), at: undefined };
      c.state.lastValidation = v;
      const lines = v.checks.map((x) => `[${x.passed ? "PASS" : "FAIL"}] ${x.label}${x.detail ? ` — ${x.detail}` : ""}`);
      lines.push("", `${v.passed}/${v.total} checks passed (simulated sandbox validation)`);
      return { out: joinLines(lines), code: v.passed === v.total ? 0 : 1 };
    }
    if (sub === "status") {
      const u = c.state.usage;
      const l = c.policy.limits;
      return { out: joinLines([`Simulated sandbox budget (policy v${c.policy.version}):`, `  steps     ${u.steps}/${l.maxSteps}`, `  cpuUnits  ${u.cpuUnits}/${l.cpuUnits}`, `  tokens    ${u.tokens}/${l.tokens}`, `  runtimeMs ${u.runtimeMs}/${l.runtimeMs} (simulated clock)`, `  costUnits ${u.costUnits}/${l.costUnits}`]) };
    }
    if (sub === "task" || sub === "instructions") return { out: joinLines(c.template.instructions.map((s, i) => `${i + 1}. ${s}`)) };
    return { out: "usage: scholarion validate | status | task\n" };
  },
};

/* ---------------- Entry point ---------------- */

/**
 * Run one command line against the shell state (mutated in place). Every line consumes
 * budget; once a budget dimension is exhausted the shell refuses further commands.
 */
export function runShell(state: ShellState, line: string, policy: ExecPolicy, template: WorkspaceTemplate, opts: { historyPrefix?: string } = {}): ShellResult {
  const exhausted = budgetExhausted(state.usage, policy.limits);
  if (exhausted) return { output: budgetMessage(exhausted, state.usage, policy.limits) + "\n", exitCode: 137, mutated: false, budgetExhausted: exhausted };
  const text = String(line ?? "");
  const trimmed = text.trim();
  if (!trimmed) return { output: "", exitCode: 0, mutated: false };
  if (text.length > MAX_LINE) return { output: `Command is longer than ${MAX_LINE} characters.\n`, exitCode: 2, mutated: false };

  state.history.push((opts.historyPrefix ?? "") + trimmed);
  if (state.history.length > HISTORY_MAX) state.history.splice(0, state.history.length - HISTORY_MAX);

  const c: Ctx = { state, policy, template, mutated: false, bytes: 0, http: 0, clear: false };
  let output = "";
  let exitCode = 0;
  let blocked: ShellResult["blocked"];
  let stagesRun = 1;
  try {
    const bash = checkBash(policy, state.cwd);
    if (!bash.ok) throw new Blocked(bash.tool, bash.reason);
    if (!template.labDirs.some((d) => isWithin(state.cwd, normalizePath(d, WORKSPACE_ROOT)))) throw new Blocked("EXECUTE_BASH", `Shell commands may only run inside this lab's directories (${template.labDirs.join(", ")}).`);
    const pipe = parsePipeline(tokenize(trimmed, state.env));
    stagesRun = pipe.stages.length;
    let stdin: string | null = null;
    let errs = "";
    for (let i = 0; i < pipe.stages.length; i++) {
      const [name, ...args] = pipe.stages[i].argv;
      let r: Out;
      if (RUNNER_COMMANDS.has(name)) r = { out: "", err: `${name}: ${RUNNER_MESSAGE}`, code: 78 };
      else if (!Object.prototype.hasOwnProperty.call(COMMANDS, name)) r = { out: "", err: `${name}: command not found in the simulated sandbox. Type 'help' for the available commands.`, code: 127 };
      else {
        try {
          r = COMMANDS[name](args, i === 0 ? null : stdin, c);
        } catch (e) {
          if (e instanceof Blocked) throw e;
          if (e instanceof ShellErr) r = { out: "", err: e.message.startsWith(name) ? e.message : `${name}: ${e.message}`, code: e.code };
          else if (e instanceof CampusError) r = { out: "", err: `${name}: ${e.message}`, code: 1 };
          else throw e;
        }
      }
      if (r.err) errs += r.err + "\n";
      stdin = r.out;
      exitCode = r.code ?? 0;
    }
    let stdout = stdin ?? "";
    if (pipe.redirect) {
      try {
        writeText(c, pipe.redirect.target, stdout, pipe.redirect.append);
      } catch (e) {
        if (e instanceof Blocked) throw e;
        errs += `${pipe.redirect.target}: ${e instanceof Error ? e.message : String(e)}\n`;
        exitCode = 1;
      }
      stdout = "";
    }
    output = stdout + errs;
  } catch (e) {
    if (e instanceof Blocked) {
      blocked = { tool: e.tool, reason: e.reason };
      output = `Blocked by policy (${e.tool}): ${e.reason} This was refused automatically by the simulated sandbox.\n`;
      exitCode = 126;
    } else if (e instanceof ShellErr) {
      output = e.message + "\n";
      exitCode = e.code;
    } else throw e;
  }

  if (output.length > MAX_OUTPUT) output = output.slice(0, MAX_OUTPUT) + "\n[output truncated by the simulated sandbox]\n";
  const kb = Math.ceil(c.bytes / 1024);
  state.usage.steps += 1;
  state.usage.cpuUnits += stagesRun + kb;
  state.usage.runtimeMs += 5 * stagesRun + kb + 20 * c.http;
  state.usage.costUnits += c.http;
  state.usage.tokens += words(trimmed) + words(output);
  return { output, exitCode, mutated: c.mutated, ...(c.clear ? { clear: true } : {}), ...(blocked ? { blocked } : {}) };
}

