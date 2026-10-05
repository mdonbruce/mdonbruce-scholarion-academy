import type http from "node:http";

type Env = Record<string, string | undefined>;
export interface ExecRequest {
  command: string;
  cwd?: string;
  files?: Record<string, string>;
  timeoutSec?: number;
  limits?: { memoryMb?: number; cpus?: number; pids?: number };
}
export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  infra: boolean;
  durationMs: number;
  files: { changed: Record<string, string>; deleted: string[] };
}
export const LIMITS: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxOutput: number; maxTimeoutSec: number; maxMemoryMb: number; maxCpus: number; maxPids: number };
export function sign(secret: string, body: string, t?: number): string;
export function verifySignature(secret: string, header: string | string[] | undefined, body: string, now?: number): string | null;
export function materialize(dir: string, files: Record<string, string>): Map<string, string>;
export function collect(dir: string, before: Map<string, string>): ExecResult["files"];
export function dockerArgs(o: { name: string; dir: string; command: string; image: string; limits?: ExecRequest["limits"]; runtime?: string; cwd?: string }): string[];
export function execute(req: ExecRequest, env?: Env): Promise<ExecResult>;
export function createServer(env?: Env): http.Server;
