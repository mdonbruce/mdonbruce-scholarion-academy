import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import type { Role } from "../core";
import { audit } from "./common";

/**
 * Term access windows and grading-period sets (parity §6).
 *
 * - Terms gain role access overrides: per role (student, TA, instructor, designer, observer)
 *   a start and/or end that replaces the term dates for that role. When a term enforces
 *   access, students (and any role with an override) can participate only inside their window;
 *   after it the course is read-only, before it participation hasn't opened.
 * - Grading-period sets group grading periods and attach to terms (or act as the account
 *   default), so a course's periods come from its term's set.
 */

export const TERM_OVERRIDES = "term_role_overrides";
export const PERIOD_SETS = "grading_period_sets";
const OVERRIDABLE = ["student", "ta", "instructor", "designer", "observer"] as const;

const bad = (m: string) => new CampusError("invalid", m, 422);

export function setRoleOverride(store: TenantStore, a: Actor, input: { termId: string; role: string; startsAt?: string | null; endsAt?: string | null }) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only admins and registrars set term access.", 403);
  const term = store.get("terms", input.termId);
  if (!term) throw new CampusError("not_found", "Term not found", 404);
  if (!(OVERRIDABLE as readonly string[]).includes(input.role)) throw bad(`Role must be one of ${OVERRIDABLE.join(", ")}.`);
  const s = input.startsAt ? new Date(input.startsAt).toISOString() : null;
  const e = input.endsAt ? new Date(input.endsAt).toISOString() : null;
  if ((input.startsAt && Number.isNaN(Date.parse(input.startsAt))) || (input.endsAt && Number.isNaN(Date.parse(input.endsAt)))) throw bad("Use valid dates.");
  if (s && e && s >= e) throw bad("The access start must be before its end.");
  const cur = store.list(TERM_OVERRIDES, (o) => o.termId === term.id && o.role === input.role)[0];
  const row = store.tx(() => (cur ? store.update(TERM_OVERRIDES, cur.id, { startsAt: s, endsAt: e }) : store.insert(TERM_OVERRIDES, { termId: term.id, role: input.role, startsAt: s, endsAt: e }, "tro")));
  audit(store, a, "terms.override", `${TERM_OVERRIDES}/${row.id}`, `${input.role}: ${s ?? "term start"} → ${e ?? "term end"}`);
  return row;
}

export function setEnforcement(store: TenantStore, a: Actor, termId: string, enforce: boolean) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only admins and registrars set term access.", 403);
  const term = store.get("terms", termId);
  if (!term) throw new CampusError("not_found", "Term not found", 404);
  const row = store.tx(() => store.update("terms", term.id, { enforceAccess: !!enforce }));
  audit(store, a, "terms.enforce", `terms/${term.id}`, String(!!enforce));
  return row;
}

/** The access window for a role in a course's term. Staff roles without an override are unrestricted. */
export function accessWindow(store: TenantStore, courseId: string, role: Role) {
  const c = store.get("courses", courseId);
  const term = c?.termId ? store.get("terms", String(c.termId)) : undefined;
  if (!term) return { termId: null, startsAt: null, endsAt: null, source: "no term", enforced: false };
  const o = store.list(TERM_OVERRIDES, (x) => x.termId === term.id && x.role === role)[0];
  const enforced = !!term.enforceAccess;
  if (o) return { termId: term.id, startsAt: (o.startsAt as string) ?? String(term.startsAt), endsAt: (o.endsAt as string) ?? String(term.endsAt), source: "role override", enforced };
  if (role === "student") return { termId: term.id, startsAt: String(term.startsAt), endsAt: String(term.endsAt), source: "term dates", enforced };
  return { termId: term.id, startsAt: null, endsAt: null, source: "unrestricted for this role", enforced };
}

/** Throws when an enforcing term's window for this role is closed. Returns the window otherwise. */
export function assertParticipation(store: TenantStore, a: Actor, courseId: string, role: Role = "student") {
  const w = accessWindow(store, courseId, role);
  if (!w.enforced) return w;
  const now = nowIso();
  if (w.startsAt && now < w.startsAt) throw new CampusError("term_not_started", `Participation opens ${w.startsAt.slice(0, 10)} (${w.source}).`, 423);
  if (w.endsAt && now > w.endsAt) throw new CampusError("term_concluded", `This course is read-only for you since ${w.endsAt.slice(0, 10)} (${w.source}).`, 423);
  void a;
  return w;
}

/* ---------------- grading-period sets ---------------- */

export function createPeriodSet(store: TenantStore, a: Actor, input: { title: string; termIds?: string[]; weighted?: boolean; accountDefault?: boolean }) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only admins and registrars manage grading-period sets.", 403);
  const title = String(input.title ?? "").trim();
  if (!title) throw bad("A title is required.");
  const termIds = (input.termIds ?? []).filter(Boolean);
  for (const t of termIds) {
    if (!store.get("terms", t)) throw new CampusError("not_found", `Term ${t} not found`, 404);
    const clash = store.list(PERIOD_SETS, (s) => ((s.termIds as string[]) ?? []).includes(t))[0];
    if (clash) throw new CampusError("conflict", `That term already uses the set "${clash.title}".`, 409);
  }
  const row = store.tx(() => {
    if (input.accountDefault) for (const s of store.list(PERIOD_SETS, (x) => !!x.accountDefault)) store.update(PERIOD_SETS, s.id, { accountDefault: false });
    return store.insert(PERIOD_SETS, { title, termIds, weighted: !!input.weighted, accountDefault: !!input.accountDefault }, "gps");
  });
  audit(store, a, "grading_period_sets.create", `${PERIOD_SETS}/${row.id}`);
  return row;
}

export function addPeriodToSet(store: TenantStore, a: Actor, input: { setId: string; name: string; startsAt: string; endsAt: string; closeAt: string; weight?: number }) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only admins and registrars manage grading periods.", 403);
  const set = store.get(PERIOD_SETS, input.setId);
  if (!set) throw new CampusError("not_found", "Set not found", 404);
  const [s, e, c] = [input.startsAt, input.endsAt, input.closeAt].map((d) => (d && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString() : null));
  if (!s || !e || !c) throw bad("Start, end and close dates are required.");
  if (!(s < e && e <= c)) throw bad("Dates must run start < end ≤ close.");
  const overlap = store.list("grading_periods", (p) => p.setId === set.id && String(p.startsAt) < e && String(p.endsAt) > s)[0];
  if (overlap) throw new CampusError("conflict", `Overlaps "${overlap.name}".`, 409);
  const termId = ((set.termIds as string[]) ?? [])[0] ?? null;
  const row = store.tx(() => store.insert("grading_periods", { setId: set.id, termId, name: String(input.name ?? "").trim() || "Period", startsAt: s, endsAt: e, closeAt: c, weight: set.weighted ? Number(input.weight ?? 0) : null }, "gp"));
  audit(store, a, "grading_periods.create", `grading_periods/${row.id}`);
  return row;
}

/** A course's grading periods: its term's set, else the account default set, else periods tied directly to the term. */
export function periodsForCourse(store: TenantStore, courseId: string): { set: Row | null; periods: Row[]; source: string } {
  const c = store.get("courses", courseId);
  const termId = (c?.termId as string) ?? null;
  const set = (termId ? store.list(PERIOD_SETS, (s) => ((s.termIds as string[]) ?? []).includes(termId))[0] : undefined) ?? store.list(PERIOD_SETS, (s) => !!s.accountDefault)[0];
  const sort = (rows: Row[]) => rows.sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt)));
  if (set) return { set, periods: sort(store.list("grading_periods", (p) => p.setId === set.id)), source: set.accountDefault && !((set.termIds as string[]) ?? []).includes(String(termId)) ? "account default set" : "term's set" };
  return { set: null, periods: sort(store.list("grading_periods", (p) => !!termId && p.termId === termId && !p.setId)), source: termId ? "term" : "none" };
}

export function termAccessSummary(store: TenantStore, a: Actor, termId: string) {
  if (!hasAny(a, ["admin", "registrar", "advisor"])) throw new CampusError("forbidden", "Staff only.", 403);
  const term = store.get("terms", termId);
  if (!term) throw new CampusError("not_found", "Term not found", 404);
  const set = store.list(PERIOD_SETS, (s) => ((s.termIds as string[]) ?? []).includes(term.id))[0];
  return {
    term: { id: term.id, name: String(term.name), startsAt: String(term.startsAt), endsAt: String(term.endsAt), enforceAccess: !!term.enforceAccess },
    roles: OVERRIDABLE.map((r) => {
      const o = store.list(TERM_OVERRIDES, (x) => x.termId === term.id && x.role === r)[0];
      return { role: r, startsAt: (o?.startsAt as string) ?? (r === "student" ? String(term.startsAt) : null), endsAt: (o?.endsAt as string) ?? (r === "student" ? String(term.endsAt) : null), source: o ? "override" : r === "student" ? "term dates" : "unrestricted" };
    }),
    gradingPeriodSet: set ? { id: set.id, title: String(set.title), weighted: !!set.weighted, periods: store.list("grading_periods", (p) => p.setId === set.id).map((p) => ({ name: String(p.name), startsAt: String(p.startsAt), endsAt: String(p.endsAt), closeAt: String(p.closeAt), weight: p.weight ?? null })) } : null,
  };
}
