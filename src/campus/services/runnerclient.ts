import { createHmac } from "node:crypto";
import { CampusError, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { applyContainerResult, prepareContainerRun, type ContainerRequest, type ContainerResult } from "./workspace/store";

/**
 * Client for the separate lab runner service (runner/server.mjs).
 *
 * The campus never executes learner code. "Run in container" sends the saved workspace files and
 * the command to the runner over a signed request; the runner executes it in a throwaway,
 * network-less container and returns output plus changed files, which the workspace service
 * re-checks against the lab's frozen policy before saving.
 *
 * Configuration (both required, otherwise the feature reports itself as not configured):
 *   SCHOLARION_RUNNER_URL     e.g. https://runner.internal:8787
 *   SCHOLARION_RUNNER_SECRET  shared HMAC secret (24+ characters), the runner's RUNNER_SECRET
 */

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface RunnerConfig {
  url: string;
  secret: string;
}

export function runnerConfig(env: Env = process.env): { ok: true; config: RunnerConfig } | { ok: false; reason: string } {
  const url = (env.SCHOLARION_RUNNER_URL ?? "").trim().replace(/\/+$/, "");
  const secret = env.SCHOLARION_RUNNER_SECRET ?? "";
  if (!url) return { ok: false, reason: "The container runner isn't configured on this campus (SCHOLARION_RUNNER_URL is not set). The simulated terminal still works." };
  if (!/^https?:\/\/[^\s/]+/.test(url)) return { ok: false, reason: "SCHOLARION_RUNNER_URL must be an http(s) URL." };
  if (secret.length < 24) return { ok: false, reason: "SCHOLARION_RUNNER_SECRET must be set (24+ characters) to sign runner requests." };
  return { ok: true, config: { url, secret } };
}

export function signBody(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

function asResult(x: unknown): ContainerResult {
  const r = (x ?? {}) as Record<string, unknown>;
  const files = (r.files ?? {}) as Record<string, unknown>;
  const changed: Record<string, string> = {};
  for (const [k, v] of Object.entries((files.changed ?? {}) as Record<string, unknown>)) if (typeof v === "string") changed[k] = v;
  return {
    exitCode: typeof r.exitCode === "number" ? r.exitCode : null,
    stdout: String(r.stdout ?? ""),
    stderr: String(r.stderr ?? ""),
    timedOut: r.timedOut === true,
    infra: r.infra === true,
    durationMs: Number(r.durationMs) || 0,
    files: { changed, deleted: Array.isArray(files.deleted) ? files.deleted.map(String) : [] },
  };
}

/** Send one signed exec request. Network and runner failures are reported, never thrown at the learner raw. */
export async function callRunner(cfg: RunnerConfig, req: ContainerRequest, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<ContainerResult> {
  const body = JSON.stringify({ command: req.command, cwd: req.cwd, files: req.files, timeoutSec: req.timeoutSec, limits: req.limits });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), (req.timeoutSec + 30) * 1000);
  try {
    const res = await fetchImpl(`${cfg.url}/v1/exec`, { method: "POST", headers: { "content-type": "application/json", "x-scholarion-signature": signBody(cfg.secret, body) }, body, signal: ctl.signal });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new CampusError("runner_unavailable", `The container runner refused the request (${res.status}${data.error ? `: ${String(data.error)}` : ""}).`, res.status === 503 ? 503 : 502);
    return asResult(data);
  } catch (e) {
    if (e instanceof CampusError) throw e;
    throw new CampusError("runner_unavailable", "The container runner couldn't be reached. Your files are unchanged; try again, or use the simulated terminal.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Run a terminal command in a real container via the runner, then sync files back under policy. */
export async function execInContainer(store: TenantStore, actor: Actor, wsId: string, command: string, opts: { env?: Env; fetchImpl?: FetchLike } = {}) {
  const cfg = runnerConfig(opts.env);
  if (!cfg.ok) throw new CampusError("runner_not_configured", cfg.reason, 409);
  const prep = prepareContainerRun(store, actor, wsId, command);
  if (!prep.ok) return { output: prep.output, exitCode: prep.exitCode, ...(prep.blocked ? { blocked: prep.blocked } : {}), sandbox: "container" as const };
  const result = await callRunner(cfg.config, prep.request, opts.fetchImpl);
  if (result.infra) throw new CampusError("runner_unavailable", `The container runner had a problem starting the sandbox (${result.stderr.split("\n")[0].slice(0, 200)}). Your files are unchanged.`, 502);
  return applyContainerResult(store, actor, prep.request, result);
}

export function runnerStatus(env: Env = process.env) {
  const c = runnerConfig(env);
  return c.ok ? { configured: true, url: c.config.url.replace(/\/\/([^@/]*@)/, "//"), note: "Commands run in a throwaway container with no network, a read-only root filesystem and CPU, memory, process and time limits." } : { configured: false, note: c.reason };
}
