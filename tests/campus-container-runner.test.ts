import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as W from "../src/campus/services/workspace";
import { execInContainer, runnerConfig, signBody } from "../src/campus/services/runnerclient";
import { ai801CourseId } from "../src/campus/academy/ai801-seed";
// The runner is a standalone service; its module is plain ESM JavaScript.
import * as runner from "../runner/server.mjs";

/**
 * Container runner for the lab terminal. Docker is replaced by a stub CLI here that maps the
 * mounted workspace and runs the command with sh, so the protocol, limits, file sync and
 * policy checks are all exercised; CI's docker job runs the same service against real Docker.
 */

const SECRET = "test-runner-secret-0123456789abcdef";
let stubDir = "";
let stubBin = "";
let server: http.Server;
let url = "";
let COURSE = "";

const status = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};

before(async () => {
  freshCampus();
  COURSE = ai801CourseId(storeOf("academy"));
  stubDir = mkdtempSync(path.join(tmpdir(), "sch-stub-"));
  stubBin = path.join(stubDir, "docker");
  // Minimal docker stand-in: honours -v host:/workspace and -w, records its args, runs /bin/sh -c.
  writeFileSync(
    stubBin,
    `#!/bin/bash
if [ "$1" = "kill" ]; then exit 0; fi
printf '%s\\n' "$@" > "${stubDir}/last-args"
host=""; wd="/workspace"
while [ $# -gt 0 ]; do
  case "$1" in
    -v) host="\${2%%:/workspace*}"; shift 2;;
    -w) wd="$2"; shift 2;;
    /bin/sh) shift; [ "$1" = "-c" ] && shift; cmd="$1"; break;;
    *) shift;;
  esac
done
case "$cmd" in *DOCKER_INFRA_FAIL*) echo "docker: Error response from daemon: no such image" >&2; exit 125;; esac
cd "$host\${wd#/workspace}" || exit 126
exec /bin/sh -c "$cmd"
`,
  );
  chmodSync(stubBin, 0o755);
  server = runner.createServer({ RUNNER_SECRET: SECRET, RUNNER_DOCKER_BIN: stubBin, RUNNER_MAX_CONCURRENCY: "2" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
  rmSync(stubDir, { recursive: true, force: true });
});

describe("Runner service", () => {
  it("only accepts fresh, correctly signed, never-replayed requests", () => {
    const body = '{"command":"true"}';
    const now = 1_800_000_000;
    const sig = runner.sign(SECRET, body, now);
    assert.equal(runner.verifySignature(SECRET, sig, body, now), null);
    assert.equal(runner.verifySignature(SECRET, sig, body, now), "replayed request");
    assert.equal(runner.verifySignature(SECRET, runner.sign(SECRET, body, now - 301), body, now), "signature expired");
    assert.equal(runner.verifySignature(SECRET, runner.sign("wrong-secret-wrong-secret-xx", body, now), body, now), "bad signature");
    assert.equal(runner.verifySignature(SECRET, runner.sign(SECRET, body, now + 1), `${body} `, now), "bad signature");
    assert.equal(runner.verifySignature(SECRET, undefined, body, now), "missing or malformed signature");
    assert.equal(signBody(SECRET, body, now), runner.sign(SECRET, body, now), "campus client and runner agree on the signature");
  });

  it("starts every container locked down", () => {
    const args = runner.dockerArgs({ name: "sch-x", dir: "/tmp/ws", command: "ls", image: "img", limits: { memoryMb: 99999, cpus: 64, pids: 99999 }, runtime: "runsc", cwd: "src" });
    const joined = args.join(" ");
    for (const flag of ["--network none", "--read-only", "--user 1000:1000", "--cap-drop ALL", "--security-opt no-new-privileges", "--runtime runsc", "-w /workspace/src", "--memory 1024m", "--cpus 2", "--pids-limit 256"]) assert.ok(joined.includes(flag), flag);
    assert.deepEqual(args.slice(-4), ["img", "/bin/sh", "-c", "ls"], "the command is one argument, never re-parsed by a host shell");
  });

  it("refuses unsafe paths and oversized workspaces", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sch-mat-"));
    try {
      assert.throws(() => runner.materialize(dir, { "../escape.txt": "x" }), /unsafe path/);
      assert.throws(() => runner.materialize(dir, { "/etc/passwd": "x" }), /unsafe path/);
      assert.throws(() => runner.materialize(dir, { "big.txt": "x".repeat(runner.LIMITS.maxFileBytes + 1) }), /too large/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs a command, returns output and changed files, and enforces the time limit", async () => {
    const r = await runner.execute({ command: "cat a.txt; echo made > b.txt; rm gone.txt; echo err >&2; exit 3", files: { "a.txt": "hello\n", "gone.txt": "bye" } }, { RUNNER_DOCKER_BIN: stubBin });
    assert.equal(r.exitCode, 3);
    assert.equal(r.stdout, "hello\n");
    assert.equal(r.stderr, "err\n");
    assert.deepEqual(r.files, { changed: { "b.txt": "made\n" }, deleted: ["gone.txt"] });
    const slow = await runner.execute({ command: "exec sleep 5", timeoutSec: 1, files: {} }, { RUNNER_DOCKER_BIN: stubBin });
    assert.equal(slow.timedOut, true);
    assert.ok(slow.durationMs < 4500, String(slow.durationMs));
  });

  it("serves /healthz and rejects unsigned exec calls over HTTP", async () => {
    const h = await fetch(`${url}/healthz`);
    assert.equal(((await h.json()) as { ok: boolean }).ok, true);
    const r = await fetch(`${url}/v1/exec`, { method: "POST", body: "{}" });
    assert.equal(r.status, 401);
  });
});

describe("Lab terminal: Run in container", () => {
  const env = () => ({ SCHOLARION_RUNNER_URL: url, SCHOLARION_RUNNER_SECRET: SECRET });

  it("reports clearly when no runner is configured", async () => {
    assert.equal(runnerConfig({}).ok, false);
    const { store, actor } = as("academy", "student3", false);
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-demo", templateId: "python-project" });
    assert.equal(await status(() => execInContainer(store, actor, ws.id, "ls", { env: {} })), 409);
  });

  it("runs real commands over the saved files and syncs changes back", async () => {
    const { store, actor } = as("academy", "student3", false);
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-demo", templateId: "python-project" });
    const r = await execInContainer(store, actor, ws.id, "head -1 README.md && mkdir -p out && echo built > out/result.txt", { env: env() });
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /^# /);
    assert.match(r.output, /files synced: \+out\/result\.txt/);
    assert.equal(W.readFile(store, actor, ws.id, "out/result.txt").content, "built\n");
    const after = W.getWorkspace(store, actor, ws.id);
    assert.ok(after.history.includes("[container] head -1 README.md && mkdir -p out && echo built > out/result.txt"));
    assert.ok(after.budget.used.steps >= 1);
  });

  it("never overwrites edits made while the command ran", async () => {
    const { store, actor } = as("academy", "student3", false);
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-demo", templateId: "python-project" });
    W.writeFile(store, actor, ws.id, "notes.md", "v1");
    const racing: Parameters<typeof execInContainer>[4] = {
      env: env(),
      fetchImpl: async (u, init) => {
        const res = await fetch(u, init);
        W.writeFile(store, actor, ws.id, "notes.md", "edited meanwhile");
        return res;
      },
    };
    const r = await execInContainer(store, actor, ws.id, "echo from-container > notes.md", racing);
    assert.match(r.output, /not synced because you edited them while the command ran: notes\.md/);
    assert.equal(W.readFile(store, actor, ws.id, "notes.md").content, "edited meanwhile");
  });

  it("applies the lab policy: no shell → refused; no file writes → nothing synced", async () => {
    const inst = as("academy", "instructor");
    W.setPolicy(inst.store, inst.actor, COURSE, "container-noshell", { tools: { EXECUTE_BASH: false } });
    W.setPolicy(inst.store, inst.actor, COURSE, "container-readonly", { tools: { FILE_WRITE: false } });
    const { store, actor } = as("academy", "student3", false);
    const a = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-noshell", templateId: "python-project" });
    const ra = await execInContainer(store, actor, a.id, "echo hi", { env: env() });
    assert.equal(ra.exitCode, 126);
    assert.match(ra.output, /EXECUTE_BASH/);
    const b = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-readonly", templateId: "python-project" });
    const rb = await execInContainer(store, actor, b.id, "echo x > new.txt; cat new.txt", { env: env() });
    assert.match(rb.output, /^x\n/);
    assert.match(rb.output, /not synced \(policy\): new\.txt/);
    assert.equal(await status(() => W.readFile(store, actor, b.id, "new.txt")), 404);
  });

  it("other learners can't run commands in someone else's workspace; runner faults leave files alone", async () => {
    const { store, actor } = as("academy", "student3", false);
    const ws = W.launchWorkspace(store, actor, { courseId: COURSE, labKey: "container-demo", templateId: "python-project" });
    const other = as("academy", "student6", false);
    assert.equal(await status(() => execInContainer(other.store, other.actor, ws.id, "ls", { env: env() })), 403);
    const before = W.getWorkspace(store, actor, ws.id).files;
    assert.equal(await status(() => execInContainer(store, actor, ws.id, "echo DOCKER_INFRA_FAIL > x", { env: env() })), 502);
    assert.equal(await status(() => execInContainer(store, actor, ws.id, "ls", { env: { SCHOLARION_RUNNER_URL: "http://127.0.0.1:1", SCHOLARION_RUNNER_SECRET: SECRET } })), 502);
    assert.deepEqual(W.getWorkspace(store, actor, ws.id).files, before);
  });
});
