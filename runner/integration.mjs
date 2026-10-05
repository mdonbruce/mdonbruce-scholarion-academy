#!/usr/bin/env node
/**
 * End-to-end check against real Docker (CI's container-runner job). Starts the runner in-process
 * and sends signed requests over HTTP, exactly as the campus does.
 *   RUNNER_IMAGE must name a built sandbox image (runner/Dockerfile.sandbox).
 */
import assert from "node:assert/strict";
import { createServer, sign } from "./server.mjs";

const secret = "ci-runner-secret-0123456789abcdef";
const server = createServer({ ...process.env, RUNNER_SECRET: secret });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function exec(payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${base}/v1/exec`, { method: "POST", headers: { "content-type": "application/json", "x-scholarion-signature": sign(secret, body) }, body });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  return data;
}

const checks = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`ok - ${name}`);
};

try {
  await check("runs Python over the learner's files and syncs changes back", async () => {
    const r = await exec({ command: "python3 main.py && ls", files: { "main.py": "open('out.txt','w').write(str(sum(range(10))))\nprint('done')\n" } });
    assert.equal(r.exitCode, 0, r.stderr);
    assert.match(r.stdout, /done/);
    assert.equal(r.files.changed["out.txt"], "45");
  });
  await check("runs in the requested working directory", async () => {
    const r = await exec({ command: "pwd", cwd: "src", files: { "src/a.py": "" } });
    assert.equal(r.stdout.trim(), "/workspace/src");
  });
  await check("runs as an unprivileged user", async () => {
    const r = await exec({ command: "id -u", files: {} });
    assert.equal(r.stdout.trim(), "1000");
  });
  await check("has no network", async () => {
    const r = await exec({ command: "python3 -c \"import socket; socket.create_connection(('1.1.1.1', 53), timeout=3)\"", files: {} });
    assert.notEqual(r.exitCode, 0);
  });
  await check("root filesystem is read-only; /tmp is a small tmpfs", async () => {
    const r = await exec({ command: "touch /var/tmp/x 2>&1; echo ok > /tmp/t && cat /tmp/t", files: {} });
    assert.match(r.stdout, /Read-only file system/);
    assert.match(r.stdout, /ok/);
  });
  await check("is killed at the time limit", async () => {
    const r = await exec({ command: "sleep 30", timeoutSec: 2, files: {} });
    assert.equal(r.timedOut, true);
    assert.ok(r.durationMs < 15000, String(r.durationMs));
  });
  await check("caps processes (fork bomb contained)", async () => {
    const r = await exec({ command: "for i in $(seq 1 400); do sleep 5 & done 2>&1 | tail -1; echo survived", timeoutSec: 10, files: {} });
    assert.match(r.stdout + r.stderr, /survived|Resource temporarily unavailable|fork/i);
  });
  console.log(`container runner: ${checks.length} checks passed against real Docker`);
} finally {
  server.close();
}
