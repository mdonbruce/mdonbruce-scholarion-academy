import { CampusError, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, course } from "./common";

/**
 * LTI app installs and placements (parity §3.19, §6, §12).
 *
 * A registered LTI 1.3 tool is installed at an account (inherited by every sub-account and
 * course below it) or in a single course, with the placements where it appears. A course can
 * hide an inherited app. The placements list answers "which apps appear here?" for a course
 * and placement, with where each one comes from.
 */

export const INSTALLS = "tool_installs";
export const PLACEMENTS = [
  { key: "course_navigation", label: "Course navigation", deepLinking: false },
  { key: "account_navigation", label: "Account navigation", deepLinking: false },
  { key: "global_navigation", label: "Global navigation", deepLinking: false },
  { key: "user_navigation", label: "User menu", deepLinking: false },
  { key: "assignment_selection", label: "Assignment selection", deepLinking: true },
  { key: "link_selection", label: "Module link selection", deepLinking: true },
  { key: "editor_button", label: "Rich-editor button", deepLinking: true },
  { key: "homework_submission", label: "Submission from an app", deepLinking: true },
] as const;
export type PlacementKey = (typeof PLACEMENTS)[number]["key"];

const bad = (m: string) => new CampusError("invalid", m, 422);

function accountChain(store: TenantStore, accountId: string | null | undefined): string[] {
  const chain: string[] = [];
  let cur = accountId ? store.get("accounts", accountId) : undefined;
  while (cur && !chain.includes(cur.id)) {
    chain.push(cur.id);
    cur = cur.parentId ? store.get("accounts", String(cur.parentId)) : undefined;
  }
  return chain;
}

function checkPlacements(tool: Row, input: { key: string; label?: string }[]) {
  if (!Array.isArray(input) || !input.length) throw bad("Choose at least one placement.");
  const services = ((tool.services as string[]) ?? []).map(String);
  return input.map((p) => {
    const def = PLACEMENTS.find((x) => x.key === p.key);
    if (!def) throw bad(`Unknown placement "${p.key}".`);
    if (def.deepLinking && !services.includes("deep_linking")) throw bad(`${def.label} needs a tool that supports deep linking.`);
    return { key: def.key, label: String(p.label ?? "").trim().slice(0, 60) || String(tool.name), enabled: true };
  });
}

/** Install a registered tool at an account (admins) or in one course (course instructors/designers). */
export function installTool(store: TenantStore, a: Actor, input: { toolId: string; scope: "account" | "course"; accountId?: string; courseId?: string; placements: { key: string; label?: string }[] }) {
  const tool = store.get("tool_registrations", input.toolId);
  if (!tool) throw new CampusError("not_found", "Tool not registered", 404);
  if (tool.enabled === false) throw new CampusError("disabled", "This tool is disabled by an admin.", 409);
  let accountId: string | null = null;
  let courseId: string | null = null;
  if (input.scope === "account") {
    if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only admins install apps for an account.", 403);
    if (!input.accountId || !store.get("accounts", input.accountId)) throw new CampusError("not_found", "Account not found", 404);
    accountId = input.accountId;
  } else {
    if (!input.courseId) throw bad("Choose a course.");
    course(store, input.courseId);
    if (!hasAny(a, ["admin", "instructor", "designer"], input.courseId)) throw new CampusError("forbidden", "Only the course's instructors and designers install apps in it.", 403);
    courseId = input.courseId;
  }
  const placements = checkPlacements(tool, input.placements);
  const dup = store.list(INSTALLS, (i) => i.toolId === tool.id && (i.accountId ?? null) === accountId && (i.courseId ?? null) === courseId && i.state !== "hidden")[0];
  if (dup) throw new CampusError("conflict", "This app is already installed here; edit its placements instead.", 409);
  const row = store.tx(() => store.insert(INSTALLS, { toolId: tool.id, scope: input.scope, accountId, courseId, placements, state: "active", by: a.id }, "tin"));
  audit(store, a, "apps.install", `${INSTALLS}/${row.id}`, `${tool.name} → ${input.scope}`);
  return row;
}

export function updatePlacements(store: TenantStore, a: Actor, installId: string, placements: { key: string; label?: string; enabled?: boolean }[]) {
  const ins = store.get(INSTALLS, installId);
  if (!ins) throw new CampusError("not_found", "Install not found", 404);
  if (ins.courseId ? !hasAny(a, ["admin", "instructor", "designer"], String(ins.courseId)) : !hasAny(a, ["admin"])) throw new CampusError("forbidden", "You can't change this install.", 403);
  const tool = store.get("tool_registrations", String(ins.toolId))!;
  const next = checkPlacements(tool, placements).map((p, i) => ({ ...p, enabled: placements[i].enabled !== false }));
  const row = store.tx(() => store.update(INSTALLS, ins.id, { placements: next }));
  audit(store, a, "apps.placements", `${INSTALLS}/${ins.id}`);
  return row;
}

/** Hide an inherited account app in one course (or show it again). */
export function setHiddenInCourse(store: TenantStore, a: Actor, input: { toolId: string; courseId: string; hidden: boolean }) {
  course(store, input.courseId);
  if (!hasAny(a, ["admin", "instructor", "designer"], input.courseId)) throw new CampusError("forbidden", "Course staff only.", 403);
  const cur = store.list(INSTALLS, (i) => i.toolId === input.toolId && i.courseId === input.courseId && i.state === "hidden")[0];
  store.tx(() => {
    if (input.hidden && !cur) store.insert(INSTALLS, { toolId: input.toolId, scope: "course", accountId: null, courseId: input.courseId, placements: [], state: "hidden", by: a.id }, "tin");
    if (!input.hidden && cur) store.tombstone(INSTALLS, cur.id);
  });
  audit(store, a, input.hidden ? "apps.hide" : "apps.show", `courses/${input.courseId}`, input.toolId);
  return { toolId: input.toolId, courseId: input.courseId, hidden: input.hidden };
}

/** Which apps appear in a course (optionally at one placement), with where each comes from. */
export function placementsFor(store: TenantStore, a: Actor, input: { courseId: string; placement?: string }) {
  const c = course(store, input.courseId);
  if (!hasAny(a, ["admin", "instructor", "designer", "ta", "student", "observer"], c.id)) throw new CampusError("forbidden", "Not in this course.", 403);
  if (input.placement && !PLACEMENTS.some((p) => p.key === input.placement)) throw bad("Unknown placement.");
  const chain = accountChain(store, c.accountId as string);
  const hidden = new Set(store.list(INSTALLS, (i) => i.courseId === c.id && i.state === "hidden").map((i) => String(i.toolId)));
  const installs = [
    ...store.list(INSTALLS, (i) => i.courseId === c.id && i.state === "active"),
    ...store.list(INSTALLS, (i) => !!i.accountId && chain.includes(String(i.accountId)) && i.state === "active" && !hidden.has(String(i.toolId))).sort((x, y) => chain.indexOf(String(x.accountId)) - chain.indexOf(String(y.accountId))),
  ];
  const seen = new Set<string>();
  const out: { toolId: string; tool: string; placement: string; placementLabel: string; label: string; source: string; launchUrl: string }[] = [];
  for (const i of installs) {
    const tool = store.get("tool_registrations", String(i.toolId));
    if (!tool || tool.enabled === false) continue;
    for (const p of (i.placements as { key: string; label: string; enabled: boolean }[]) ?? []) {
      if (!p.enabled || (input.placement && p.key !== input.placement)) continue;
      const k = `${tool.id}:${p.key}`;
      if (seen.has(k)) continue; // the nearest install (course, then closest account) wins
      seen.add(k);
      out.push({ toolId: tool.id, tool: String(tool.name), placement: p.key, placementLabel: PLACEMENTS.find((x) => x.key === p.key)!.label, label: p.label, source: i.courseId ? "this course" : `account: ${String(store.get("accounts", String(i.accountId))?.name ?? i.accountId)}`, launchUrl: String(tool.launchUrl) });
    }
  }
  return { courseId: c.id, placement: input.placement ?? null, apps: out, hidden: [...hidden] };
}
