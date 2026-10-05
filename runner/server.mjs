#!/usr/bin/env node
/**
 * Scholarion lab runner — executes lab-terminal commands inside throwaway containers.
 *
 * This is a SEPARATE service from the campus web app. The campus never runs learner code itself;
 * it sends a signed request here. Deploy the runner on its own host or VM (the container host
 * is the isolation boundary), ideally with gVisor (RUNNER_DOCKER_RUNTIME=runsc).
 *
 * Every command runs in a fresh container:
 *   --network none · read-only root filesystem · non-root user 1000:1000 · all capabilities
 *   dropped · no-new-privileges · memory/CPU/PID limits · file-size and open-file ulimits ·
 *   a 64 MB tmpfs at /tmp · the learner's files mounted at /workspace · a hard wall-clock kill.
 * Only /workspace changes come back, size-capped, and the campus re-checks them against the lab's
 * file policy before saving.
 *
 * Protocol: POST /v1/exec with JSON and header
 *   x-scholarion-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>
 * Requests older than 5 minutes, or replayed, are refused. GET /healthz reports the backend.
 *
 * Environment:
 *   RUNNER_SECRET (required)       shared secret with the campus (SCHOLARION_RUNNER_SECRET)
 *   RUNNER_PORT=8787               listen port      RUNNER_HOST=0.0.0.0
 *   RUNNER_IMAGE=scholarion/lab-sandbox:1        image for commands
 *   RUNNER_DOCKER_BIN=docker       docker or podman CLI
 *   RUNNER_DOCKER_RUNTIME          e.g. runsc (gVisor)
 *   RUNNER_MAX_CONCURRENCY=4
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export const LIMITS = { maxFiles: 2000, maxFileBytes: 2 * 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024, maxOutput: 64 * 1024, maxTimeoutSec: 120, maxMemoryMb: 1024, maxCpus: 2, maxPids: 256 };
const SAFE_REL = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[A-Za-z0-9._\-/ ]{1,240}$/;

export function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

const seen = new Map();
export function verifySignature(secret, header, body, now = Math.floor(Date.now() / 1000)) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(header ?? ""));
  if (!m) return "missing or malformed signature";
  const t = Number(m[1]);
  if (Math.abs(now - t) > 300) return "signature expired";
  const want = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const got = Buffer.from(m[2], "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return "bad signature";
  for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  if (seen.has(m[2])) return "replayed request";
  seen.set(m[2], now + 600);
  return null;
}

/** Validate and write the learner's files into a fresh directory. Returns the snapshot for diffing. */
export function materialize(dir, files) {
  const entries = Object.entries(files ?? {});
  if (entries.length > LIMITS.maxFiles) throw new Error("too many files");
  let total = 0;
  const before = new Map();
  for (const [rel, content] of entries) {
    if (!SAFE_REL.test(rel)) throw new Error(`unsafe path: ${rel}`);
    const buf = Buffer.from(String(content), "utf8");
    if (buf.length > LIMITS.maxFileBytes) throw new Error(`file too large: ${rel}`);
    total += buf.length;
    if (total > LIMITS.maxTotalBytes) throw new Error("workspace too large");
    const abs = path.join(dir, rel);
    if (!abs.startsWith(dir + path.sep)) throw new Error(`unsafe path: ${rel}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    before.set(rel, buf.toString("utf8"));
  }
  return before;
}

/** Collect regular files (no symlinks followed) and diff against what was sent. */
export function collect(dir, before) {
  const after = new Map();
  let total = 0;
  const walk = (d, prefix) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const abs = path.join(d, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) walk(abs, rel);
      else if (ent.isFile()) {
        if (after.size >= LIMITS.maxFiles) return;
        const st = fs.statSync(abs);
        if (st.size > LIMITS.maxFileBytes || total + st.size > LIMITS.maxTotalBytes) continue;
        total += st.size;
        const buf = fs.readFileSync(abs);
        // Text only: binary outputs are reported but not synced back.
        if (buf.includes(0)) continue;
        after.set(rel, buf.toString("utf8"));
      }
    }
  };
  walk(dir, "");
  const changed = {};
  for (const [rel, text] of after) if (before.get(rel) !== text && SAFE_REL.test(rel)) changed[rel] = text;
  const deleted = [...before.keys()].filter((rel) => !after.has(rel));
  return { changed, deleted };
}

export function dockerArgs({ name, dir, command, image, limits, runtime, cwd = "" }) {
  const mem = Math.min(LIMITS.maxMemoryMb, Math.max(64, Number(limits?.memoryMb ?? 512)));
  const cpus = Math.min(LIMITS.maxCpus, Math.max(0.25, Number(limits?.cpus ?? 1)));
  const pids = Math.min(LIMITS.maxPids, Math.max(16, Number(limits?.pids ?? 128)));
  return [
    "run", "--rm", "--name", name,
    "--network", "none",
    "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
    "--user", "1000:1000",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--memory", `${mem}m`, "--memory-swap", `${mem}m`, "--cpus", String(cpus), "--pids-limit", String(pids),
    "--ulimit", "nofile=256:256", "--ulimit", "fsize=52428800:52428800",
    ...(runtime ? ["--runtime", runtime] : []),
    "-e", "HOME=/tmp", "-e", "PYTHONDONTWRITEBYTECODE=1",
    "-v", `${dir}:/workspace:rw`, "-w", cwd ? `/workspace/${cwd}` : "/workspace",
    image, "/bin/sh", "-c", command,
  ];
}

function cap(s) {
  return s.length > LIMITS.maxOutput ? `${s.slice(0, LIMITS.maxOutput)}\n…[output truncated]` : s;
}

export async function execute(req, env = process.env) {
  const command = String(req.command ?? "");
  if (!command.trim() || command.length > 4000) throw new Error("command required (max 4000 characters)");
  const timeoutSec = Math.min(LIMITS.maxTimeoutSec, Math.max(1, Number(req.timeoutSec ?? 30)));
  const cwd = String(req.cwd ?? "").replace(/^\/+|\/+$/g, "");
  if (cwd && !SAFE_REL.test(cwd)) throw new Error("unsafe working directory");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sch-ws-"));
  fs.chmodSync(dir, 0o777); // the container user (1000) must be able to write /workspace
  const name = `sch-${randomBytes(6).toString("hex")}`;
  const bin = env.RUNNER_DOCKER_BIN || "docker";
  const image = env.RUNNER_IMAGE || "scholarion/lab-sandbox:1";
  try {
    const before = materialize(dir, req.files);
    if (cwd) fs.mkdirSync(path.join(dir, cwd), { recursive: true });
    for (const d of walkDirs(dir)) fs.chmodSync(d, 0o777);
    for (const f of walkFiles(dir)) fs.chmodSync(f, 0o666);
    const started = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn(bin, dockerArgs({ name, dir, command, image, limits: req.limits, runtime: env.RUNNER_DOCKER_RUNTIME, cwd }), { stdio: ["ignore", "pipe", "pipe"], shell: false });
      let out = "";
      let err = "";
      let timedOut = false;
      child.stdout.on("data", (d) => (out = cap(out + d)));
      child.stderr.on("data", (d) => (err = cap(err + d)));
      const timer = setTimeout(() => {
        timedOut = true;
        execFile(bin, ["kill", name], () => {});
        setTimeout(() => child.kill("SIGKILL"), 2000);
      }, timeoutSec * 1000);
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout: out, stderr: `runner backend error: ${e.message}`, timedOut, infra: true });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        // 125–127 are docker's own failures (daemon/image/exec), not the learner's command.
        resolve({ exitCode: code, stdout: out, stderr: err, timedOut, infra: !timedOut && code !== null && code >= 125 && code <= 127 && /docker|Unable to find image|Error response from daemon|OCI runtime/i.test(err) });
      });
    });
    const files = collect(dir, before);
    return { ...result, durationMs: Date.now() - started, files };
  } finally {
    await cleanup(dir, bin, image);
  }
}

/** Remove the scratch directory. Files the container created belong to uid 1000; if the runner
 * runs as another user and can't delete them, a throwaway container (same image) clears them. */
async function cleanup(dir, bin, image) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  } catch {
    /* fall through */
  }
  await new Promise((resolve) => execFile(bin, ["run", "--rm", "--network", "none", "--user", "1000:1000", "-v", `${dir}:/w`, image, "/bin/sh", "-c", "rm -rf /w/* /w/.[!.]* 2>/dev/null; true"], () => resolve()));
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error(`runner: could not remove ${dir}: ${e?.message ?? e}`);
  }
}

function* walkDirs(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) if (ent.isDirectory()) {
    const p = path.join(d, ent.name);
    yield p;
    yield* walkDirs(p);
  }
}
function* walkFiles(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) yield* walkFiles(p);
    else if (ent.isFile()) yield p;
  }
}

export function createServer(env = process.env) {
  const secret = env.RUNNER_SECRET;
  if (!secret || secret.length < 24) throw new Error("RUNNER_SECRET must be set (24+ characters).");
  const max = Number(env.RUNNER_MAX_CONCURRENCY || 4);
  let active = 0;
  return http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "GET" && req.url === "/healthz") return send(200, { ok: true, backend: env.RUNNER_DOCKER_BIN || "docker", image: env.RUNNER_IMAGE || "scholarion/lab-sandbox:1", runtime: env.RUNNER_DOCKER_RUNTIME || "default", active, max });
    if (req.method !== "POST" || req.url !== "/v1/exec") return send(404, { error: "not found" });
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > LIMITS.maxTotalBytes * 2) req.destroy();
      else chunks.push(c);
    });
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const bad = verifySignature(secret, req.headers["x-scholarion-signature"], body);
      if (bad) return send(401, { error: bad });
      if (active >= max) return send(503, { error: "runner busy; try again shortly", infra: true });
      active++;
      try {
        send(200, await execute(JSON.parse(body), env));
      } catch (e) {
        send(400, { error: String(e?.message ?? e) });
      } finally {
        active--;
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const port = Number(process.env.RUNNER_PORT || 8787);
  server.listen(port, process.env.RUNNER_HOST || "0.0.0.0", () => console.log(`scholarion lab runner listening on :${port}`));
}
