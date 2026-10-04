import { CampusError, nowIso, type Role, type Row, type TenantStore } from "../core";
import { effectiveRoles, hasAny, type Actor } from "../iam";

/** Shared helpers for workflow services. */

export const STAFF_COURSE: Role[] = ["admin", "instructor", "ta", "designer"];
export const GRADERS: Role[] = ["admin", "instructor", "ta"];

export function course(store: TenantStore, courseId: string): Row {
  const c = store.get("courses", courseId);
  if (!c) throw new CampusError("not_found", "Course not found", 404);
  return c;
}

export function isStaff(a: Actor, courseId: string) {
  return hasAny(a, STAFF_COURSE, courseId);
}
export function isGrader(a: Actor, courseId: string) {
  return hasAny(a, GRADERS, courseId);
}
export function isStudentIn(a: Actor, courseId: string) {
  return (a.courseRoles[courseId] ?? []).includes("student");
}

export function requireCourse(store: TenantStore, a: Actor, courseId: string, roles: Role[], action: string) {
  course(store, courseId);
  if (!hasAny(a, roles, courseId)) {
    store.audit({ actorId: a.id, actorRoles: effectiveRoles(a, courseId), action, resource: `courses/${courseId}`, outcome: "denied", reason: "course_role" });
    throw new CampusError("forbidden", "You don't have permission to do that in this course.", 403);
  }
}

export function requireTenant(store: TenantStore, a: Actor, roles: Role[], action: string) {
  if (!hasAny(a, roles)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: action, outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "You don't have permission to do that.", 403);
  }
}

export function activeStudents(store: TenantStore, courseId: string, sectionId?: string): Row[] {
  // The Student View test student never counts as a real student (roster, gradebook, analytics, reports).
  return store.list("enrollments", (e) => e.courseId === courseId && e.role === "student" && e.state === "active" && e.source !== "student_view" && (!sectionId || e.sectionId === sectionId));
}

export function userName(store: TenantStore, userId: string) {
  return (store.get("users", userId)?.name as string) ?? "Former user";
}

/** Queue a notification through the outbox (the notifications consumer delivers it). */
export function notify(store: TenantStore, userIds: string[], category: string, title: string, body: string, href: string, courseId?: string | null) {
  if (!userIds.length) return;
  store.emit("notification.requested", `notifications`, { userIds: [...new Set(userIds)], category, title, body, href, courseId: courseId ?? null });
}

export function audit(store: TenantStore, a: Actor, action: string, resource: string, reason?: string) {
  store.audit({ actorId: a.id, actorRoles: a.roles, action, resource, outcome: "allowed", reason });
}

export const toMs = (iso?: unknown) => (iso ? Date.parse(String(iso)) : NaN);
export const iso = () => nowIso();

/** Escape text for HTML output. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
