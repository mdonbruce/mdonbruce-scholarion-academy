import { CampusError, nowIso, type Role, type TenantStore } from "./core";
import { type Actor } from "./iam";

/**
 * Granular permission matrix with account → sub-account inheritance and locks.
 * Registry role lists are the defaults; tenant admins toggle permissions per role (or per
 * custom role) at any account node. A lock at a parent stops every descendant from
 * changing that permission.
 */

export const PERMISSIONS: { key: string; label: string; defaults: Role[] }[] = [
  { key: "manage_course_content", label: "Manage course content", defaults: ["admin", "instructor", "designer", "ta"] },
  { key: "grade_submissions", label: "Grade submissions", defaults: ["admin", "instructor", "ta"] },
  { key: "view_all_grades", label: "View all grades", defaults: ["admin", "instructor", "ta", "registrar"] },
  { key: "manage_sections", label: "Manage sections", defaults: ["admin", "registrar"] },
  { key: "send_messages", label: "Send messages", defaults: ["admin", "instructor", "ta", "student", "advisor", "designer"] },
  { key: "view_restore_deleted", label: "View and restore deleted content", defaults: ["admin"] },
  { key: "manage_lti", label: "Manage LTI tools", defaults: ["admin"] },
  { key: "change_course_state", label: "Change course state (publish, conclude)", defaults: ["admin", "instructor", "designer"] },
  { key: "masquerade", label: "Act as users", defaults: ["admin"] },
  { key: "manage_users", label: "Manage users and roles", defaults: ["admin"] },
  { key: "manage_sis", label: "Manage SIS data", defaults: ["admin", "registrar"] },
  { key: "manage_outcomes", label: "Manage outcomes", defaults: ["admin", "designer"] },
  { key: "manage_rubrics", label: "Manage rubrics", defaults: ["admin", "instructor", "designer", "ta"] },
  { key: "manage_files", label: "Manage course files", defaults: ["admin", "instructor", "designer", "ta"] },
  { key: "view_analytics", label: "View analytics", defaults: ["admin", "instructor", "advisor"] },
  { key: "manage_advising", label: "Manage advising", defaults: ["admin", "advisor"] },
  { key: "manage_finance", label: "Manage student accounts", defaults: ["admin", "registrar"] },
  { key: "manage_ai", label: "Configure AI agents", defaults: ["admin"] },
  { key: "manage_tenant", label: "Manage tenant settings", defaults: ["admin"] },
  { key: "manage_support", label: "Work help desk tickets", defaults: ["admin", "support"] },
  { key: "create_discussions", label: "Students can create discussions", defaults: ["admin", "instructor", "ta", "designer", "student"] },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Which permission governs writes (create/update/archive/publish) to each table. */
export const TABLE_PERMISSION: Record<string, string> = {
  courses: "change_course_state", sections: "manage_sections", modules: "manage_course_content", pages: "manage_course_content", module_items: "manage_course_content",
  assignments: "manage_course_content", quizzes: "manage_course_content", question_banks: "manage_course_content", questions: "manage_course_content", assignment_overrides: "manage_course_content", mastery_paths: "manage_course_content",
  assignment_groups: "manage_course_content", rubrics: "manage_rubrics", posting_policies: "grade_submissions", grading_periods: "manage_sis", grading_schemes: "manage_course_content", comment_library: "grade_submissions",
  discussion_topics: "manage_course_content", announcements: "manage_course_content", media: "manage_files", caption_tracks: "manage_files", folders: "manage_files",
  interventions: "view_analytics", tool_registrations: "manage_lti", webhooks: "manage_lti", developer_keys: "manage_lti",
  applicants: "manage_sis", applications: "manage_sis", admission_documents: "manage_sis", terms: "manage_sis", catalog_entries: "manage_sis", holds: "manage_sis", academic_history: "manage_sis",
  charges: "manage_finance", aid_awards: "manage_finance", outcomes: "manage_outcomes", outcome_alignments: "manage_outcomes",
  advising_cases: "manage_advising", advising_notes: "manage_advising", referrals: "manage_advising",
  agents: "manage_ai", policy_versions: "manage_ai", course_templates: "manage_ai",
  tickets: "manage_support", kb_articles: "manage_support",
  role_templates: "manage_tenant", retention_policies: "manage_tenant", legal_holds: "manage_tenant", listings: "manage_tenant", notification_templates: "manage_tenant", global_announcements: "manage_tenant", accounts: "manage_tenant", custom_roles: "manage_users",
  groups: "manage_course_content", group_sets: "manage_course_content", reading_items: "manage_course_content", live_sessions: "manage_course_content", lab_templates: "manage_course_content",
  accommodations: "manage_advising", appointment_groups: "manage_course_content", pace_plans: "manage_course_content", blackout_dates: "manage_course_content",
};

/** Chain of account ids from the root down to `accountId`. */
export function accountChain(store: TenantStore, accountId?: string | null): string[] {
  const chain: string[] = [];
  let cur = accountId ? store.get("accounts", accountId) : store.list("accounts", (a) => !a.parentId)[0];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur.id);
    cur = cur.parentId ? store.get("accounts", cur.parentId as string) : undefined;
  }
  return chain;
}

/**
 * Resolve whether `role` has `permission` at `accountId`, walking root → leaf. Each node
 * may override; a locked node fixes the value for every descendant.
 */
export function resolvePermission(store: TenantStore, role: string, permission: string, accountId?: string | null): { enabled: boolean; lockedAt?: string; source: string } {
  const def = PERMISSIONS.find((p) => p.key === permission);
  const custom = store.list("custom_roles", (c) => c.key === role)[0];
  const baseRole = (custom?.baseRole as Role | undefined) ?? (role as Role);
  let enabled = !!def?.defaults.includes(baseRole);
  let source = "default";
  for (const acc of accountChain(store, accountId)) {
    const o = store.list("permission_overrides", (x) => x.accountId === acc && x.role === role && x.permission === permission)[0];
    if (o) {
      enabled = !!o.enabled;
      source = acc;
      if (o.locked) return { enabled, lockedAt: acc, source };
    }
  }
  return { enabled, source };
}

export function setPermission(store: TenantStore, by: Actor, input: { accountId: string; role: string; permission: string; enabled: boolean; locked?: boolean }) {
  if (!by.roles.includes("admin")) throw new CampusError("forbidden", "Only admins edit permissions.", 403);
  if (!PERMISSION_KEYS.includes(input.permission)) throw new CampusError("bad_permission", "Unknown permission");
  if (!store.get("accounts", input.accountId)) throw new CampusError("not_found", "Account not found", 404);
  const chain = accountChain(store, input.accountId);
  // A lock on any ancestor (not this node) blocks the change.
  for (const acc of chain.slice(0, -1)) {
    const o = store.list("permission_overrides", (x) => x.accountId === acc && x.role === input.role && x.permission === input.permission && !!x.locked)[0];
    if (o) {
      store.audit({ actorId: by.id, actorRoles: by.roles, action: "permission.set", resource: `account/${input.accountId}`, outcome: "denied", reason: `locked at ${acc}` });
      throw new CampusError("permission_locked", `This permission is locked by a parent account (${store.get("accounts", acc)?.name ?? acc}).`, 409);
    }
  }
  return store.tx(() => {
    const existing = store.list("permission_overrides", (x) => x.accountId === input.accountId && x.role === input.role && x.permission === input.permission)[0];
    const row = existing
      ? store.update("permission_overrides", existing.id, { enabled: input.enabled, locked: !!input.locked })
      : store.insert("permission_overrides", { accountId: input.accountId, role: input.role, permission: input.permission, enabled: input.enabled, locked: !!input.locked }, "po");
    store.emit("permissions.changed", `account/${input.accountId}`, { role: input.role, permission: input.permission, enabled: input.enabled, locked: !!input.locked });
    store.audit({ actorId: by.id, actorRoles: by.roles, action: "permission.set", resource: `account/${input.accountId}`, outcome: "allowed", reason: `${input.role}:${input.permission}=${input.enabled}${input.locked ? " locked" : ""}` });
    return row;
  });
}

/** Does the actor hold `permission` for a resource under `accountId` (via any effective role)? */
export function actorHas(store: TenantStore, a: Actor, roles: string[], permission: string | undefined, accountId?: string | null): boolean {
  if (!permission) return true;
  for (const r of [...roles, ...(a.customRoles ?? [])]) if (resolvePermission(store, r, permission, accountId).enabled) return true;
  return false;
}

export function permissionMatrix(store: TenantStore, accountId?: string | null) {
  const roles: string[] = ["admin", "instructor", "ta", "designer", "student", "observer", "advisor", "registrar", "support", ...store.list("custom_roles").map((c) => c.key as string)];
  return {
    accountId: accountId ?? accountChain(store)[0],
    roles,
    rows: PERMISSIONS.map((p) => ({ key: p.key, label: p.label, cells: roles.map((r) => ({ role: r, ...resolvePermission(store, r, p.key, accountId) })) })),
    at: nowIso(),
  };
}
