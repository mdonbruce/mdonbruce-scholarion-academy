import { CampusError, nowIso, nowMs, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";

/**
 * Projection lock. Answer keys, instructor lab editions and instructor Studio files stay hidden on
 * a course until an authenticated instructor explicitly unlocks them, and the lock closes again
 * automatically after a short window — so a projector left on never shows answers by accident.
 * Enforced server-side: locked requests receive the student edition or a 423.
 */

export const UNLOCK_MINUTES = 30;

function current(store: TenantStore, courseId: string) {
  return store.list("projection_locks", (l) => l.courseId === courseId).sort((a, b) => String(b.changedAt).localeCompare(String(a.changedAt)))[0];
}

export function lockState(store: TenantStore, courseId: string) {
  const row = current(store, courseId);
  const unlockedUntil = row && !row.locked ? String(row.unlockedUntil ?? "") : "";
  const open = !!unlockedUntil && Date.parse(unlockedUntil) > nowMs();
  return { courseId, locked: !open, unlockedUntil: open ? unlockedUntil : null, changedBy: (row?.changedBy as string) ?? null, changedAt: (row?.changedAt as string) ?? null };
}

export const answersLocked = (store: TenantStore, courseId: string) => lockState(store, courseId).locked;

export function setProjectionLock(store: TenantStore, a: Actor, courseId: string, locked: boolean) {
  if (!store.get("courses", courseId)) throw new CampusError("not_found", "Course not found", 404);
  if (!(hasAny(a, ["admin"]) || hasAny(a, ["instructor"], courseId))) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: locked ? "projection.lock" : "projection.unlock", resource: `courses/${courseId}`, outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "Only the course's instructors can change the projection lock.", 403);
  }
  if (!locked && a.masqueradedBy) throw new CampusError("forbidden", "Answer keys can't be unlocked while acting as another user.", 403);
  const at = nowIso();
  store.tx(() => store.insert("projection_locks", { courseId, scope: "answers", locked, changedBy: a.id, changedAt: at, unlockedUntil: locked ? null : new Date(nowMs() + UNLOCK_MINUTES * 60_000).toISOString() }, "plk"));
  audit(store, a, locked ? "projection.lock" : "projection.unlock", `courses/${courseId}`, locked ? "answers hidden" : `answers visible for ${UNLOCK_MINUTES} min`);
  return lockState(store, courseId);
}

/**
 * Course PIN for the downloadable instructor lab editions. The PIN encrypts the answer keys inside
 * each instructor file (they appear only after the PIN is typed in the browser). It's a classroom
 * projection guard, not an account password; it's stored server-side and never sent to learners.
 */
export function setInstructorPin(store: TenantStore, a: Actor, courseId: string, pin: string) {
  if (!store.get("courses", courseId)) throw new CampusError("not_found", "Course not found", 404);
  if (!(hasAny(a, ["admin"]) || hasAny(a, ["instructor"], courseId))) throw new CampusError("forbidden", "Only the course's instructors can set the PIN.", 403);
  if (!/^\d{4,8}$/.test(String(pin))) throw new CampusError("invalid", "The PIN is 4–8 digits.", 422);
  const cur = store.list("instructor_pins", (p) => p.courseId === courseId)[0];
  store.tx(() => (cur ? store.update("instructor_pins", cur.id, { pin: String(pin), setBy: a.id, setAt: nowIso() }) : store.insert("instructor_pins", { courseId, pin: String(pin), setBy: a.id, setAt: nowIso() }, "ipin")));
  audit(store, a, "projection.pin", `courses/${courseId}`, "PIN set");
  return { courseId, pinSet: true };
}

export function pinFor(store: TenantStore, courseId: string): string | undefined {
  return (store.list("instructor_pins", (p) => p.courseId === courseId)[0]?.pin as string | undefined) ?? undefined;
}
export const hasPin = (store: TenantStore, courseId: string) => !!pinFor(store, courseId);
