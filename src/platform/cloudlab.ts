import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { getDb, now, nowIso, save } from "./store";
import type { LabGradeResult, LabRunResult, LabSession } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Cloud Lab (Integration Spec §8). The real service runs isolated containers with
 * no outbound network. This local stand-in runs Python on the developer's machine
 * with a timeout and resource limits — SIMULATED, development only.
 */

const RUN_TIMEOUT_MS = 6000;
const IDLE_MINUTES = 30;

const HARNESS = String.raw`
import sys, json, io, contextlib
try:
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
except Exception:
    pass
mode = sys.argv[1]
src = open('learner.py', encoding='utf-8').read()
if mode == 'run':
    exec(compile(src, 'starter.py', 'exec'), {'__name__': '__main__'})
    sys.exit(0)
tests = json.load(open('tests.json', encoding='utf-8'))
ns = {'__name__': '__learner__'}
out = io.StringIO()
load_err = None
try:
    with contextlib.redirect_stdout(out):
        exec(compile(src, 'starter.py', 'exec'), ns)
except Exception as e:
    load_err = type(e).__name__ + ': ' + str(e)
results = []
for t in tests:
    ok = False
    if load_err is None:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(t['code'], dict(ns))
            ok = True
        except Exception:
            ok = False
    results.append({'name': t['name'], 'passed': ok, 'points': t['points']})
sys.stdout.write('\n@@RESULT@@' + json.dumps({'results': results, 'stdout': out.getvalue()[-4000:], 'error': load_err}))
`;

function runnerEnabled(): boolean {
  return process.env.CLOUDLAB_LOCAL_RUNNER === "1";
}

function pythonCommand(): string {
  return process.env.CLOUDLAB_PYTHON || (process.platform === "win32" ? "python" : "python3");
}

/** Minimal environment for learner code. Windows needs SystemRoot/TEMP or Python fails to start. */
function runnerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONIOENCODING: "utf-8" };
  if (process.platform === "win32") {
    for (const k of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "PATHEXT", "COMSPEC"]) if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

function execute(code: string, mode: "run" | "grade", tests: unknown[] = []): { stdout: string; stderr: string; timedOut: boolean; status: number | null } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scholarion-lab-"));
  try {
    fs.writeFileSync(path.join(dir, "learner.py"), code);
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify(tests));
    fs.writeFileSync(path.join(dir, "harness.py"), HARNESS);
    const res = spawnSync(pythonCommand(), ["-I", "harness.py", mode], {
      cwd: dir,
      timeout: RUN_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 256 * 1024,
      env: runnerEnv(),
      windowsHide: true,
    });
    if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
      return { stdout: "", stderr: `Python wasn't found ("${pythonCommand()}"). Install Python 3 or set CLOUDLAB_PYTHON in .env.local.`, timedOut: false, status: 127 };
    }
    const timedOut = res.error ? (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT" : res.signal === "SIGTERM";
    return { stdout: res.stdout ?? "", stderr: (res.stderr ?? "").replace(/File "[^"]*harness\.py"[^\n]*\n[^\n]*\n/g, ""), timedOut, status: res.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export const cloudlab = {
  runnerName(): LabRunResult["runner"] {
    return runnerEnabled() ? "local-dev-runner" : "disabled";
  },

  /** POST /v1/labs/sessions */
  launch(userId: string, itemId: string): LabSession {
    const item = catalog.item(itemId);
    if (!item?.lab) throw new PlatformError("not_found", "Lab not found", 404);
    const d = entitlements.check(userId, "lab.launch", item.courseId);
    if (!d.allow) throw new PlatformError(d.reason ?? "needs_upgrade", "Cloud Lab needs full access.", 403);
    const db = getDb();
    let s = db.labSessions.find((x) => x.userId === userId && x.itemId === itemId);
    const t = nowIso();
    if (!s) {
      s = { id: newId("lab"), userId, itemId, templateId: item.lab.templateId, code: item.lab.starterCode, status: "running", createdAt: t, lastActiveAt: t, attachUrlExpiresAt: new Date(now().getTime() + 10 * 60_000).toISOString() };
      db.labSessions.push(s);
      publish("lab.session.started", "cloudlab", `user/${userId}`, { userId, itemId, sessionId: s.id });
    } else {
      s.status = "running";
      s.lastActiveAt = t;
      s.attachUrlExpiresAt = new Date(now().getTime() + 10 * 60_000).toISOString();
    }
    save();
    return s;
  },

  session(userId: string, itemId: string): LabSession | undefined {
    return getDb().labSessions.find((x) => x.userId === userId && x.itemId === itemId);
  },

  saveCode(sessionId: string, userId: string, code: string): LabSession {
    const s = getDb().labSessions.find((x) => x.id === sessionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Lab session not found", 404);
    if (code.length > 100_000) throw new PlatformError("too_large", "Code is too large for this lab.");
    s.code = code;
    s.lastActiveAt = nowIso();
    save();
    return s;
  },

  run(sessionId: string, userId: string, code?: string): LabRunResult {
    const s = code !== undefined ? this.saveCode(sessionId, userId, code) : getDb().labSessions.find((x) => x.id === sessionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Lab session not found", 404);
    if (!runnerEnabled()) return { ok: false, stdout: "", stderr: "The Cloud Lab runner is not connected in this environment. Download the starter files to work locally.", timedOut: false, runner: "disabled" };
    const r = execute(s.code, "run");
    return { ok: r.status === 0 && !r.timedOut, stdout: r.stdout.slice(-8000), stderr: r.timedOut ? "Stopped: your program ran longer than 5 seconds." : r.stderr.slice(-4000), timedOut: r.timedOut, runner: "local-dev-runner" };
  },

  /** POST /v1/labs/sessions/{id}/grade — hidden tests in a fresh sandbox; emits lab.graded. */
  grade(sessionId: string, userId: string, code?: string): LabGradeResult {
    const s = code !== undefined ? this.saveCode(sessionId, userId, code) : getDb().labSessions.find((x) => x.id === sessionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Lab session not found", 404);
    const item = catalog.item(s.itemId)!;
    const tests = item.lab!.tests;
    const max = tests.reduce((a, t) => a + t.points, 0);
    if (!runnerEnabled()) {
      return { ok: false, stdout: "", stderr: "Autograder not connected in this environment.", timedOut: false, runner: "disabled", score: 0, max, feedback: [] };
    }
    const r = execute(s.code, "grade", tests);
    const marker = r.stdout.lastIndexOf("@@RESULT@@");
    let parsed: { results: { name: string; passed: boolean; points: number }[]; stdout: string; error: string | null } | null = null;
    if (marker >= 0) {
      try {
        parsed = JSON.parse(r.stdout.slice(marker + "@@RESULT@@".length));
      } catch {
        parsed = null;
      }
    }
    const feedback = parsed?.results ?? tests.map((t) => ({ name: t.name, passed: false, points: t.points }));
    const score = feedback.filter((f) => f.passed).reduce((a, f) => a + f.points, 0);
    const result: LabGradeResult = {
      ok: !!parsed && !r.timedOut,
      stdout: parsed?.stdout ?? "",
      stderr: r.timedOut ? "Stopped: grading took longer than 5 seconds. Check for an infinite loop." : parsed?.error ?? r.stderr.slice(-4000),
      timedOut: r.timedOut,
      runner: "local-dev-runner",
      score,
      max,
      feedback,
    };
    publish("lab.graded", "cloudlab", `user/${userId}`, { userId, itemId: s.itemId, sessionId: s.id, score, max, passed: feedback.filter((f) => f.passed).length, total: feedback.length });
    return result;
  },

  /** Idle shutdown after 30 minutes. */
  tick(): number {
    let n = 0;
    const cutoff = new Date(now().getTime() - IDLE_MINUTES * 60_000).toISOString();
    for (const s of getDb().labSessions) {
      if (s.status === "running" && s.lastActiveAt < cutoff) {
        s.status = "stopped";
        n++;
      }
    }
    save();
    return n;
  },
};
