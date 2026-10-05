import { CampusError, nowIso, sha256, type Row, type TenantStore } from "../../core";
import { effectiveRoles, type Actor } from "../../iam";
import { activeStudents, audit, course, isStaff, isStudentIn, requireCourse, userName } from "../common";
import { budgetExhausted, budgetMessage, checkBash, checkFileRead, checkFileWrite, effectivePolicy, remainingUsage, savePolicyVersion, usageLimits, zeroUsage, type ExecPolicy, type Usage } from "./policy";
import { describeReset, getTemplate, runValidation, templateVfs, type ResetPlan, type ValidationResult } from "./templates";
import { runShell, type ShellState } from "./terminal";
import { normalizePath, relPath, vfsClone, vfsListing, vfsMkdir, vfsRead, vfsRemove, vfsToFiles, vfsTree, vfsUsage, vfsWrite, WORKSPACE_ROOT, type Vfs } from "./vfs";

/**
 * Persistent simulated sandbox workspaces (one per learner — or per team — per lab).
 *
 * Tables:
 *  - lab_workspaces       the workspace: VFS, env, shell history, budget, frozen policy, status
 *  - workspace_teams      { courseId, labKey?, name, memberIds } — members share one workspace
 *  - workspace_snapshots  immutable submission snapshots (never changed or deleted by this service)
 *  - workspace_policies   versioned execution policies (see policy.ts)
 */

export const WS_TABLE = "lab_workspaces";
export const TEAM_TABLE = "workspace_teams";
export const SNAPSHOT_TABLE = "workspace_snapshots";

export type WorkspaceStatus = "stopped" | "running" | "paused_by_instructor";
const POLICY_EDITORS = ["admin", "instructor", "designer"] as const;
const PROGRESS_VIEWERS = ["admin", "instructor", "ta", "designer"] as const;

const forbidden = (msg = "You can't access this workspace.") => new CampusError("forbidden", msg, 403);

/* ---------------- Row accessors ---------------- */

const filesOf = (ws: Row) => ws.files as Vfs;
const policyOf = (ws: Row) => ws.policy as ExecPolicy;
const usageOf = (ws: Row) => (ws.budget as { used: Usage }).used;

export function resourceUsage(ws: Row) {
  const policy = policyOf(ws);
  const used = usageOf(ws);
  const mem = vfsUsage(filesOf(ws));
  return {
    used: { ...used },
    limit: usageLimits(policy.limits),
    remaining: remainingUsage(used, policy.limits),
    memory: { usedKb: Math.ceil(mem.bytes / 1024), limitKb: policy.limits.memoryKb, nodes: mem.nodes },
    policyVersion: policy.version,
    label: "Simulated sandbox resource budget",
  };
}

export function workspaceView(ws: Row) {
  const t = getTemplate(ws.templateId as string);
  return {
    id: ws.id,
    ownerId: ws.ownerId as string,
    teamId: (ws.teamId as string | null) ?? null,
    courseId: ws.courseId as string,
    labKey: ws.labKey as string,
    templateId: ws.templateId as string,
    templateVersion: ws.templateVersion as number,
    title: `${t.title} (simulated sandbox)`,
    instructions: t.instructions,
    dependencies: t.dependencies,
    status: ws.status as WorkspaceStatus,
    stopReason: (ws.stopReason as string | null) ?? null,
    saveStatus: ws.saveStatus as string,
    savedAt: (ws.savedAt as string | null) ?? null,
    autosaveAt: (ws.autosaveAt as string | null) ?? null,
    revision: ws.revision as number,
    cwd: (ws.settings as { cwd: string }).cwd,
    settings: ws.settings,
    env: ws.env as Record<string, string>,
    history: [...(ws.history as string[])],
    files: vfsToFiles(filesOf(ws)),
    listing: vfsListing(filesOf(ws)),
    tree: vfsTree(filesOf(ws), WORKSPACE_ROOT),
    budget: resourceUsage(ws),
    lastValidation: (ws.lastValidation as ValidationResult | null) ?? null,
    lastActivityAt: ws.lastActivityAt as string,
    sandbox: "simulated" as const,
  };
}

/* ---------------- Access ---------------- */

function teamFor(store: TenantStore, actorId: string, courseId: string, labKey: string): Row | undefined {
  return store.list(TEAM_TABLE, (t) => t.courseId === courseId && (!t.labKey || t.labKey === labKey) && Array.isArray(t.memberIds) && (t.memberIds as string[]).includes(actorId))[0];
}

function isMember(store: TenantStore, a: Actor, ws: Row): boolean {
  if (ws.ownerId === a.id) return true;
  if (!ws.teamId) return false;
  const team = store.get(TEAM_TABLE, ws.teamId as string);
  return !!team && (team.memberIds as string[]).includes(a.id);
}

/** Owners and team members read and write; course staff may read (support), never write. */
function load(store: TenantStore, a: Actor, wsId: string, mode: "read" | "write"): Row {
  const ws = store.get(WS_TABLE, String(wsId));
  if (!ws) throw new CampusError("not_found", "Workspace not found", 404);
  const courseId = ws.courseId as string;
  const member = isMember(store, a, ws) && (isStudentIn(a, courseId) || isStaff(a, courseId));
  const ok = member || (mode === "read" && isStaff(a, courseId));
  if (!ok) {
    store.audit({ actorId: a.id, actorRoles: effectiveRoles(a, courseId), action: `workspace.${mode}`, resource: `${WS_TABLE}/${ws.id}`, outcome: "denied", reason: "not_owner" });
    throw forbidden();
  }
  return ws;
}

function requirePlayable(ws: Row) {
  if (ws.status === "paused_by_instructor") throw new CampusError("paused", "Your instructor paused this simulated sandbox lab. Your files are saved; work resumes when they unpause it.", 423);
}

const LAB_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

/* ---------------- Launch / read ---------------- */

export function launchWorkspace(store: TenantStore, actor: Actor, input: { courseId: string; labKey: string; templateId: string }) {
  const { courseId, labKey, templateId } = input ?? ({} as typeof input);
  course(store, courseId);
  if (typeof labKey !== "string" || !LAB_KEY.test(labKey)) throw new CampusError("invalid_lab", "labKey must be 1–80 letters, digits, dot, dash or underscore.", 400);
  const t = getTemplate(templateId);
  if (!isStudentIn(actor, courseId) && !isStaff(actor, courseId)) {
    store.audit({ actorId: actor.id, actorRoles: effectiveRoles(actor, courseId), action: "workspace.launch", resource: `courses/${courseId}`, outcome: "denied", reason: "not_enrolled" });
    throw forbidden("You need to be enrolled in this course to open its lab workspace.");
  }
  const team = teamFor(store, actor.id, courseId, labKey);
  return store.tx(() => {
    const existing = store.list(WS_TABLE, (w) => w.courseId === courseId && w.labKey === labKey && (team ? w.teamId === team.id : w.ownerId === actor.id && !w.teamId))[0];
    if (existing) {
      if (existing.status === "stopped") {
        store.update(WS_TABLE, existing.id, { status: "running", stopReason: null, policy: effectivePolicy(store, courseId, labKey), lastActivityAt: nowIso() });
      }
      audit(store, actor, "workspace.resume", `${WS_TABLE}/${existing.id}`);
      return { ...workspaceView(store.get(WS_TABLE, existing.id)!), resumed: true };
    }
    const now = nowIso();
    const ws = store.insert(
      WS_TABLE,
      {
        ownerId: actor.id,
        teamId: team?.id ?? null,
        courseId,
        labKey,
        templateId: t.id,
        templateVersion: t.version,
        files: templateVfs(t),
        settings: { cwd: WORKSPACE_ROOT, theme: "system", fontSize: 14 },
        env: { ...t.envConfig, HOME: WORKSPACE_ROOT, PWD: WORKSPACE_ROOT, SANDBOX: "simulated", SIM_API_TOKEN: `sim_tok_${sha256(`${actor.id}:${courseId}:${labKey}`).slice(0, 16)}`, SIM_CREDENTIAL_SCOPE: "simulated-only" },
        history: [],
        budget: { used: zeroUsage() },
        policy: effectivePolicy(store, courseId, labKey),
        status: "running" as WorkspaceStatus,
        stopReason: null,
        saveStatus: "saved",
        autosaveAt: null,
        savedAt: now,
        revision: 1,
        lastValidation: null,
        lastActivityAt: now,
      },
      "lws",
    );
    audit(store, actor, "workspace.launch", `${WS_TABLE}/${ws.id}`);
    return { ...workspaceView(ws), resumed: false };
  });
}

export function getWorkspace(store: TenantStore, actor: Actor, wsId: string) {
  return workspaceView(load(store, actor, wsId, "read"));
}

export function listMyWorkspaces(store: TenantStore, actor: Actor, courseId?: string) {
  return store
    .list(WS_TABLE, (w) => (!courseId || w.courseId === courseId) && isMember(store, actor, w))
    .map((w) => ({ id: w.id, courseId: w.courseId, labKey: w.labKey, templateId: w.templateId, status: w.status, saveStatus: w.saveStatus, savedAt: w.savedAt, lastActivityAt: w.lastActivityAt, teamId: w.teamId ?? null }));
}

/* ---------------- Terminal ---------------- */

export function runCommand(store: TenantStore, actor: Actor, wsId: string, command: string) {
  const ws = load(store, actor, wsId, "write");
  const t = getTemplate(ws.templateId as string);
  if (typeof command !== "string") throw new CampusError("invalid_command", "Command must be text.", 400);
  if (ws.status === "paused_by_instructor") {
    return { output: "Simulated sandbox paused by your instructor. Commands are disabled until the lab is resumed; your files are saved.\n", exitCode: 75, budget: resourceUsage(ws), status: ws.status as WorkspaceStatus, saveStatus: ws.saveStatus as string, cwd: (ws.settings as { cwd: string }).cwd };
  }
  if (ws.status === "stopped") {
    const why = ws.stopReason === "budget_exhausted" ? "its budget is exhausted" : "it is stopped";
    return { output: `This simulated sandbox workspace isn't running because ${why}. Resume it to continue; your files are saved.\n`, exitCode: 1, budget: resourceUsage(ws), status: ws.status as WorkspaceStatus, saveStatus: ws.saveStatus as string, cwd: (ws.settings as { cwd: string }).cwd };
  }
  return store.tx(() => {
    const settings = ws.settings as { cwd: string };
    const state: ShellState = { vfs: vfsClone(filesOf(ws)), cwd: settings.cwd, env: { ...(ws.env as Record<string, string>) }, history: [...(ws.history as string[])], usage: { ...usageOf(ws) }, lastValidation: (ws.lastValidation as ValidationResult | undefined) ?? undefined };
    const r = runShell(state, command, policyOf(ws), t);
    const now = nowIso();
    state.env.PWD = state.cwd;
    const patch: Record<string, unknown> = {
      files: state.vfs,
      settings: { ...settings, cwd: state.cwd },
      env: state.env,
      history: state.history,
      budget: { used: state.usage },
      lastActivityAt: now,
      lastValidation: state.lastValidation ? { ...state.lastValidation, at: state.lastValidation.at ?? now } : null,
    };
    if (r.mutated) Object.assign(patch, { autosaveAt: now, saveStatus: "autosaved" });
    if (r.budgetExhausted) Object.assign(patch, { status: "stopped", stopReason: "budget_exhausted" });
    if (r.blocked) store.audit({ actorId: actor.id, actorRoles: effectiveRoles(actor, ws.courseId as string), action: "workspace.command", resource: `${WS_TABLE}/${ws.id}`, outcome: "denied", reason: `policy:${r.blocked.tool}` });
    const next = store.update(WS_TABLE, ws.id, patch);
    return { output: r.output, exitCode: r.exitCode, budget: resourceUsage(next), status: next.status as WorkspaceStatus, saveStatus: next.saveStatus as string, cwd: state.cwd, ...(r.clear ? { clear: true } : {}), ...(r.blocked ? { blocked: r.blocked } : {}), ...(r.budgetExhausted ? { budgetExhausted: r.budgetExhausted } : {}) };
  });
}

/* ---------------- Files ---------------- */

function policyPath(ws: Row, path: unknown, mode: "read" | "write"): string {
  const abs = normalizePath(path, WORKSPACE_ROOT);
  const d = mode === "read" ? checkFileRead(policyOf(ws), abs) : checkFileWrite(policyOf(ws), abs);
  if (!d.ok) throw new CampusError("policy_blocked", `Blocked by policy (${d.tool}): ${d.reason}`, 403, { tool: d.tool });
  return abs;
}

function commitFiles(store: TenantStore, ws: Row, files: Vfs) {
  const now = nowIso();
  return store.update(WS_TABLE, ws.id, { files, autosaveAt: now, saveStatus: "autosaved", lastActivityAt: now });
}

export function writeFile(store: TenantStore, actor: Actor, wsId: string, path: string, content: string) {
  const ws = load(store, actor, wsId, "write");
  requirePlayable(ws);
  const abs = policyPath(ws, path, "write");
  return store.tx(() => {
    const v = vfsClone(filesOf(ws));
    vfsWrite(v, abs, String(content ?? ""), { createParents: true, maxTotalBytes: policyOf(ws).limits.memoryKb * 1024 });
    const next = commitFiles(store, ws, v);
    return { path: relPath(abs), bytes: vfsUsage({ [abs]: v[abs] }).bytes, autosaveAt: next.autosaveAt as string, saveStatus: next.saveStatus as string };
  });
}

export function readFile(store: TenantStore, actor: Actor, wsId: string, path: string) {
  const ws = load(store, actor, wsId, "read");
  const abs = policyPath(ws, path, "read");
  return { path: relPath(abs), content: vfsRead(filesOf(ws), abs) };
}

export function deleteFile(store: TenantStore, actor: Actor, wsId: string, path: string, opts: { recursive?: boolean } = {}) {
  const ws = load(store, actor, wsId, "write");
  requirePlayable(ws);
  const abs = policyPath(ws, path, "write");
  return store.tx(() => {
    const v = vfsClone(filesOf(ws));
    vfsRemove(v, abs, !!opts.recursive);
    const next = commitFiles(store, ws, v);
    return { path: relPath(abs), deleted: true, saveStatus: next.saveStatus as string };
  });
}

export function makeDirectory(store: TenantStore, actor: Actor, wsId: string, path: string) {
  const ws = load(store, actor, wsId, "write");
  requirePlayable(ws);
  const abs = policyPath(ws, path, "write");
  return store.tx(() => {
    const v = vfsClone(filesOf(ws));
    vfsMkdir(v, abs, true);
    commitFiles(store, ws, v);
    return { path: relPath(abs) };
  });
}

export function listFiles(store: TenantStore, actor: Actor, wsId: string) {
  const ws = load(store, actor, wsId, "read");
  return vfsListing(filesOf(ws));
}

/* ---------------- Save / stop / resume / reset ---------------- */

export function saveWorkspace(store: TenantStore, actor: Actor, wsId: string) {
  const ws = load(store, actor, wsId, "write");
  return store.tx(() => {
    const now = nowIso();
    const next = store.update(WS_TABLE, ws.id, { savedAt: now, saveStatus: "saved", revision: (ws.revision as number) + 1, lastActivityAt: now });
    audit(store, actor, "workspace.save", `${WS_TABLE}/${ws.id}`);
    return { revision: next.revision as number, savedAt: now, saveStatus: "saved", message: `Saved revision ${next.revision} of your simulated sandbox workspace.` };
  });
}

export function stopWorkspace(store: TenantStore, actor: Actor, wsId: string) {
  const ws = load(store, actor, wsId, "write");
  requirePlayable(ws);
  return store.tx(() => {
    const now = nowIso();
    const next = store.update(WS_TABLE, ws.id, { status: "stopped", stopReason: "stopped_by_learner", savedAt: now, saveStatus: "saved", lastActivityAt: now });
    return workspaceView(next);
  });
}

/** Resume starts a new run: it freezes the lab's current policy. */
export function resumeWorkspace(store: TenantStore, actor: Actor, wsId: string) {
  const ws = load(store, actor, wsId, "write");
  requirePlayable(ws);
  return store.tx(() => {
    const next = store.update(WS_TABLE, ws.id, { status: "running", stopReason: null, policy: effectivePolicy(store, ws.courseId as string, ws.labKey as string), lastActivityAt: nowIso() });
    return workspaceView(next);
  });
}

/**
 * Without confirm=true nothing changes: the reset plan (exact files replaced, restored and
 * removed) is returned. Submission snapshots are never touched by a reset.
 */
export function resetWorkspace(store: TenantStore, actor: Actor, wsId: string, confirm = false): { applied: boolean; plan: ResetPlan; workspace?: ReturnType<typeof workspaceView>; message: string } {
  const ws = load(store, actor, wsId, "write");
  const plan = describeReset(ws.templateId as string, filesOf(ws));
  if (confirm !== true) return { applied: false, plan, message: "Nothing was changed. Review the plan and confirm to reset your simulated sandbox workspace." };
  requirePlayable(ws);
  const t = getTemplate(ws.templateId as string);
  return store.tx(() => {
    const now = nowIso();
    const next = store.update(WS_TABLE, ws.id, {
      files: templateVfs(t),
      templateVersion: t.version,
      settings: { ...(ws.settings as object), cwd: WORKSPACE_ROOT },
      history: [...(ws.history as string[]), "# workspace reset to template"],
      lastValidation: null,
      revision: (ws.revision as number) + 1,
      savedAt: now,
      saveStatus: "saved",
      lastActivityAt: now,
    });
    audit(store, actor, "workspace.reset", `${WS_TABLE}/${ws.id}`);
    return { applied: true, plan, workspace: workspaceView(next), message: plan.summary };
  });
}

/* ---------------- Submission snapshots ---------------- */

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as object)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export function snapshotChecksum(files: Record<string, string>): string {
  const keys = Object.keys(files).sort();
  return sha256(JSON.stringify(keys.map((k) => [k, files[k]])));
}

export interface SnapshotView {
  id: string;
  workspaceId: string;
  ownerId: string;
  teamId: string | null;
  submittedBy: string;
  assessmentKey: string;
  templateId: string;
  templateVersion: number;
  revision: number;
  files: Record<string, string>;
  checksum: string;
  intact: boolean;
  createdAt: string;
  readOnly: true;
}

function snapshotView(s: Row): SnapshotView {
  const files = JSON.parse(JSON.stringify(s.files)) as Record<string, string>;
  return deepFreeze({
    id: s.id,
    workspaceId: s.workspaceId as string,
    ownerId: s.ownerId as string,
    teamId: (s.teamId as string | null) ?? null,
    submittedBy: s.submittedBy as string,
    assessmentKey: s.assessmentKey as string,
    templateId: s.templateId as string,
    templateVersion: s.templateVersion as number,
    revision: s.revision as number,
    files,
    checksum: s.checksum as string,
    intact: snapshotChecksum(files) === s.checksum,
    createdAt: s.createdAt,
    readOnly: true as const,
  });
}

export function snapshotForSubmission(store: TenantStore, actor: Actor, wsId: string, assessmentKey: string): SnapshotView {
  const ws = load(store, actor, wsId, "write");
  if (typeof assessmentKey !== "string" || !LAB_KEY.test(assessmentKey)) throw new CampusError("invalid_assessment", "assessmentKey is required.", 400);
  return store.tx(() => {
    const files = vfsToFiles(filesOf(ws));
    const row = store.insert(
      SNAPSHOT_TABLE,
      { workspaceId: ws.id, ownerId: ws.ownerId, teamId: ws.teamId ?? null, submittedBy: actor.id, courseId: ws.courseId, labKey: ws.labKey, assessmentKey, templateId: ws.templateId, templateVersion: ws.templateVersion, revision: ws.revision, files, checksum: snapshotChecksum(files) },
      "wsnap",
    );
    Object.freeze(row.files as object);
    audit(store, actor, "workspace.snapshot", `${SNAPSHOT_TABLE}/${row.id}`);
    return snapshotView(row);
  });
}

export function getSnapshot(store: TenantStore, actor: Actor, snapshotId: string): SnapshotView {
  const s = store.get(SNAPSHOT_TABLE, String(snapshotId));
  if (!s) throw new CampusError("not_found", "Snapshot not found", 404);
  const ws = store.get(WS_TABLE, s.workspaceId as string);
  const member = ws ? isMember(store, actor, ws) : s.ownerId === actor.id;
  if (!member && !isStaff(actor, s.courseId as string)) throw forbidden("You can't view this submission snapshot.");
  return snapshotView(s);
}

export function listSnapshots(store: TenantStore, actor: Actor, wsId: string) {
  const ws = load(store, actor, wsId, "read");
  return store.list(SNAPSHOT_TABLE, (s) => s.workspaceId === ws.id).map((s) => ({ id: s.id, assessmentKey: s.assessmentKey, checksum: s.checksum, createdAt: s.createdAt, revision: s.revision }));
}

/* ---------------- Instructor controls ---------------- */

function labWorkspaces(store: TenantStore, courseId: string, labKey: string) {
  return store.list(WS_TABLE, (w) => w.courseId === courseId && w.labKey === labKey);
}

export function pauseWorkspaces(store: TenantStore, actor: Actor, courseId: string, labKey: string) {
  requireCourse(store, actor, courseId, [...POLICY_EDITORS, "ta"], "workspace.pause");
  return store.tx(() => {
    let paused = 0;
    for (const w of labWorkspaces(store, courseId, labKey)) {
      if (w.status === "paused_by_instructor") continue;
      store.update(WS_TABLE, w.id, { status: "paused_by_instructor", pausedFrom: w.status, pausedBy: actor.id, pausedAt: nowIso() });
      paused++;
    }
    audit(store, actor, "workspace.pause", `courses/${courseId}/labs/${labKey}`, `${paused} workspaces`);
    return { courseId, labKey, paused };
  });
}

export function resumeWorkspaces(store: TenantStore, actor: Actor, courseId: string, labKey: string) {
  requireCourse(store, actor, courseId, [...POLICY_EDITORS, "ta"], "workspace.unpause");
  return store.tx(() => {
    let resumed = 0;
    for (const w of labWorkspaces(store, courseId, labKey)) {
      if (w.status !== "paused_by_instructor") continue;
      store.update(WS_TABLE, w.id, { status: (w.pausedFrom as WorkspaceStatus) ?? "running", pausedFrom: null, pausedBy: null, pausedAt: null });
      resumed++;
    }
    audit(store, actor, "workspace.unpause", `courses/${courseId}/labs/${labKey}`, `${resumed} workspaces`);
    return { courseId, labKey, resumed };
  });
}

/** New policy version for the lab. Running and finished runs keep the policy they froze. */
export function setPolicy(store: TenantStore, actor: Actor, courseId: string, labKey: string, policyPatch: unknown): ExecPolicy {
  requireCourse(store, actor, courseId, [...POLICY_EDITORS], "workspace.policy");
  if (typeof labKey !== "string" || !LAB_KEY.test(labKey)) throw new CampusError("invalid_lab", "labKey is required.", 400);
  return store.tx(() => {
    const p = savePolicyVersion(store, courseId, labKey, policyPatch, actor.id);
    audit(store, actor, "workspace.policy", `courses/${courseId}/labs/${labKey}`, `v${p.version}`);
    return p;
  });
}

export function getPolicy(store: TenantStore, actor: Actor, courseId: string, labKey: string): ExecPolicy {
  requireCourse(store, actor, courseId, [...PROGRESS_VIEWERS, "student"], "workspace.policy.read");
  return effectivePolicy(store, courseId, labKey);
}

/** Per learner: last activity, validation results (labels only — no answer keys) and budget use. */
export function classProgress(store: TenantStore, actor: Actor, courseId: string, labKey: string) {
  requireCourse(store, actor, courseId, [...PROGRESS_VIEWERS], "workspace.progress");
  const wss = labWorkspaces(store, courseId, labKey);
  const learners = new Set<string>(activeStudents(store, courseId).map((e) => e.userId as string));
  for (const w of wss) learners.add(w.ownerId as string);
  const rows = [...learners].map((userId) => {
    const w = wss.find((x) => x.ownerId === userId) ?? wss.find((x) => x.teamId && (store.get(TEAM_TABLE, x.teamId as string)?.memberIds as string[] | undefined)?.includes(userId));
    if (!w) return { userId, name: userName(store, userId), started: false as const };
    const v = runValidation(getTemplate(w.templateId as string), filesOf(w));
    const b = resourceUsage(w);
    return {
      userId,
      name: userName(store, userId),
      started: true as const,
      workspaceId: w.id,
      teamId: (w.teamId as string | null) ?? null,
      status: w.status as WorkspaceStatus,
      lastActivityAt: w.lastActivityAt as string,
      savedAt: w.savedAt as string,
      revision: w.revision as number,
      validation: { passed: v.passed, total: v.total, checks: v.checks.map((c) => ({ id: c.id, label: c.label, passed: c.passed })) },
      budget: { used: b.used, limit: b.limit, memoryKb: b.memory.usedKb },
      snapshots: store.list(SNAPSHOT_TABLE, (s) => s.workspaceId === w.id).length,
    };
  });
  return { courseId, labKey, learners: rows, sandbox: "simulated" as const };
}

export function createTeam(store: TenantStore, actor: Actor, input: { courseId: string; labKey?: string; name: string; memberIds: string[] }) {
  requireCourse(store, actor, input.courseId, [...POLICY_EDITORS, "ta"], "workspace.team");
  if (!Array.isArray(input.memberIds) || !input.memberIds.length) throw new CampusError("invalid_team", "A team needs at least one member.", 400);
  return store.tx(() => store.insert(TEAM_TABLE, { courseId: input.courseId, labKey: input.labKey ?? null, name: String(input.name ?? "Team"), memberIds: [...new Set(input.memberIds.map(String))] }, "wteam"));
}

/** Internal: used by the agent runner to persist VFS changes and history. */
export function _loadForAgent(store: TenantStore, actor: Actor, wsId: string): Row {
  return load(store, actor, wsId, "write");
}

/* ---------------- Container runner (data only) ----------------
 * The real container runner is a separate service (runner/server.mjs). Nothing here executes,
 * fetches or touches the server filesystem: these two functions only prepare the request from
 * the saved workspace (after the policy and budget checks) and apply the returned file changes
 * back under the same frozen policy.
 */

export interface ContainerRequest {
  wsId: string;
  command: string;
  cwd: string;
  files: Record<string, string>;
  timeoutSec: number;
  limits: { memoryMb: number; cpus: number; pids: number };
  /** Content checksum at dispatch; changes made meanwhile are never overwritten. */
  baseChecksum: string;
}

export interface ContainerResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  infra?: boolean;
  durationMs: number;
  files: { changed: Record<string, string>; deleted: string[] };
}

const CONTAINER_TIMEOUT_CAP_SEC = 60;

export type ContainerPrep = { ok: true; request: ContainerRequest } | { ok: false; output: string; exitCode: number; blocked?: { tool: string; reason: string } };

export function prepareContainerRun(store: TenantStore, actor: Actor, wsId: string, command: string): ContainerPrep {
  const ws = load(store, actor, wsId, "write");
  if (typeof command !== "string" || !command.trim()) throw new CampusError("invalid_command", "Type a command to run.", 400);
  if (command.length > 4000) throw new CampusError("invalid_command", "Commands are limited to 4,000 characters.", 400);
  if (ws.status === "paused_by_instructor") return { ok: false, output: "Paused by your instructor. Commands are disabled until the lab is resumed; your files are saved.\n", exitCode: 75 };
  if (ws.status === "stopped") return { ok: false, output: "This workspace is stopped. Resume it to continue; your files are saved.\n", exitCode: 1 };
  const policy = policyOf(ws);
  const cwd = (ws.settings as { cwd: string }).cwd;
  const d = checkBash(policy, cwd);
  if (!d.ok) {
    store.audit({ actorId: actor.id, actorRoles: effectiveRoles(actor, ws.courseId as string), action: "workspace.exec", resource: `${WS_TABLE}/${ws.id}`, outcome: "denied", reason: `policy:${d.tool}` });
    return { ok: false, output: `Blocked by policy (${d.tool}): ${d.reason}\n`, exitCode: 126, blocked: { tool: d.tool, reason: d.reason } };
  }
  const used = usageOf(ws);
  const dim = budgetExhausted(used, policy.limits);
  if (dim) return { ok: false, output: budgetMessage(dim, used, policy.limits) + "\n", exitCode: 137 };
  const files = vfsToFiles(filesOf(ws));
  const remainingMs = Math.max(1000, policy.limits.runtimeMs - used.runtimeMs);
  return {
    ok: true,
    request: {
      wsId: ws.id,
      command,
      cwd: cwd === WORKSPACE_ROOT ? "" : relPath(cwd),
      files,
      timeoutSec: Math.max(1, Math.min(CONTAINER_TIMEOUT_CAP_SEC, Math.floor(remainingMs / 1000))),
      limits: { memoryMb: 512, cpus: 1, pids: 128 },
      baseChecksum: snapshotChecksum(files),
    },
  };
}

/** Apply a runner result: only files inside the policy's write boundary, never over newer edits. */
export function applyContainerResult(store: TenantStore, actor: Actor, req: ContainerRequest, result: ContainerResult) {
  const ws = load(store, actor, req.wsId, "write");
  const policy = policyOf(ws);
  return store.tx(() => {
    const v = vfsClone(filesOf(ws));
    const current = vfsToFiles(v);
    const written: string[] = [];
    const removed: string[] = [];
    const refused: { path: string; reason: string }[] = [];
    const conflicts: string[] = [];
    const sent = req.files;
    const touch = (rel: string, fn: (abs: string) => void) => {
      let abs: string;
      try {
        abs = normalizePath(rel, WORKSPACE_ROOT);
      } catch {
        refused.push({ path: rel, reason: "invalid path" });
        return;
      }
      const dec = checkFileWrite(policy, abs);
      if (!dec.ok) return void refused.push({ path: rel, reason: dec.reason });
      if (current[relPath(abs)] !== sent[relPath(abs)]) return void conflicts.push(relPath(abs));
      try {
        fn(abs);
      } catch (e) {
        refused.push({ path: rel, reason: e instanceof Error ? e.message : String(e) });
      }
    };
    for (const [rel, content] of Object.entries(result.files?.changed ?? {})) {
      touch(rel, (abs) => {
        vfsWrite(v, abs, String(content), { createParents: true, maxTotalBytes: policy.limits.memoryKb * 1024 });
        written.push(relPath(abs));
      });
    }
    for (const rel of result.files?.deleted ?? []) {
      touch(rel, (abs) => {
        if (v[abs]?.type === "file") {
          vfsRemove(v, abs, false);
          removed.push(relPath(abs));
        }
      });
    }
    const used = { ...usageOf(ws) };
    const ms = Math.max(0, Math.round(Number(result.durationMs) || 0));
    const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    used.steps += 1;
    used.runtimeMs += ms;
    used.cpuUnits += Math.max(1, Math.ceil(ms / 100));
    used.tokens += (req.command.match(/\S+/g)?.length ?? 0) + (out.match(/\S+/g)?.length ?? 0);
    used.costUnits += 1;
    const now = nowIso();
    const exhausted = budgetExhausted(used, policy.limits);
    const patch: Record<string, unknown> = { budget: { used }, history: [...(ws.history as string[]), `[container] ${req.command}`].slice(-500), lastActivityAt: now };
    if (written.length || removed.length) Object.assign(patch, { files: v, autosaveAt: now, saveStatus: "autosaved" });
    if (exhausted) Object.assign(patch, { status: "stopped", stopReason: "budget_exhausted" });
    const next = store.update(WS_TABLE, ws.id, patch);
    audit(store, actor, "workspace.exec", `${WS_TABLE}/${ws.id}`, result.timedOut ? "timed_out" : `exit_${result.exitCode}`);
    const notes: string[] = [];
    if (result.timedOut) notes.push(`[stopped: the ${req.timeoutSec}s time limit was reached]`);
    if (written.length || removed.length) notes.push(`[files synced: ${[...written.map((p) => `+${p}`), ...removed.map((p) => `-${p}`)].join(", ")}]`);
    if (conflicts.length) notes.push(`[not synced because you edited them while the command ran: ${conflicts.join(", ")}]`);
    if (refused.length) notes.push(`[not synced (policy): ${refused.map((r) => `${r.path} — ${r.reason}`).join("; ")}]`);
    if (exhausted) notes.push(budgetMessage(exhausted, used, policy.limits));
    return {
      output: `${out}${out && !out.endsWith("\n") ? "\n" : ""}${notes.join("\n")}${notes.length ? "\n" : ""}`,
      exitCode: result.timedOut ? 124 : (result.exitCode ?? 1),
      timedOut: !!result.timedOut,
      durationMs: ms,
      synced: { written, removed, conflicts, refused },
      budget: resourceUsage(next),
      status: next.status as WorkspaceStatus,
      saveStatus: next.saveStatus as string,
      cwd: (next.settings as { cwd: string }).cwd,
      sandbox: "container" as const,
    };
  });
}
