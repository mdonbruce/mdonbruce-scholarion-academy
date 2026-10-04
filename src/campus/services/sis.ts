import { CampusError, nowIso, nowMs, registerConsumer, type Row, type TenantStore } from "../core";
import { createUser, hasAny, type Actor } from "../iam";
import { audit, notify, requireTenant } from "./common";

/**
 * Student Information System contexts: Admissions, Registration & Records, Student
 * Accounts. SIS is the source of academic truth; the LMS only receives projections via
 * `sis.enrollment.committed` / `sis.enrollment.dropped` outbox events.
 */

const SIS_ROLES = ["admin", "registrar"] as const;
export const TUITION_PER_CREDIT = 300; // sandbox placeholder

/* ---------------- Admissions ---------------- */

export const REQUIRED_DOCS = ["transcript", "id", "statement"];

export function applicationChecklist(store: TenantStore, applicationId: string) {
  const docs = store.list("admission_documents", (d) => d.applicationId === applicationId);
  // Program applications (Academy) list their own required documents (e.g. a statement only).
  const required = (store.get("applications", applicationId)?.requiredDocs as string[] | undefined) ?? REQUIRED_DOCS;
  return required.map((kind) => {
    const d = docs.find((x) => x.kind === kind);
    return { kind, received: !!d?.received, verified: !!d?.verified };
  });
}

export function decideApplication(store: TenantStore, a: Actor, applicationId: string, outcome: "admit" | "deny" | "waitlist", note?: string) {
  requireTenant(store, a, [...SIS_ROLES], "admissions.decide");
  const app = store.get("applications", applicationId);
  if (!app) throw new CampusError("not_found", "Application not found", 404);
  if (["admitted", "denied"].includes(app.state as string)) throw new CampusError("already_decided", "This application already has a final decision.", 409);
  const checklist = applicationChecklist(store, applicationId);
  const missing = checklist.filter((c) => !c.received || !c.verified);
  if (missing.length && outcome !== "deny") throw new CampusError("checklist_incomplete", `Receive and verify: ${missing.map((m) => m.kind).join(", ")}.`, 409);
  const applicant = store.get("applicants", app.applicantId as string)!;
  const term = store.get("terms", app.termId as string);
  return store.tx(() => {
    let userId = (app.userId as string) ?? (applicant.userId as string) ?? null;
    if (outcome === "admit" && !userId) {
      const existing = store.list("users", (u) => u.email === applicant.email)[0];
      userId = existing?.id ?? createUser(store, { name: applicant.name as string, email: applicant.email as string, roles: ["student"] }).id;
      store.update("applicants", applicant.id, { userId });
    }
    const letter =
      outcome === "admit"
        ? `Dear ${applicant.name},\n\nWe're pleased to offer you admission to ${app.program} beginning ${term?.name ?? "the upcoming term"}. Your next step is to register for classes once registration opens.\n\n${note ?? ""}\n\nThis is a demonstration institution; programs are non-credit demonstrations.`
        : outcome === "waitlist"
          ? `Dear ${applicant.name},\n\nYour application to ${app.program} has been placed on our waitlist. We'll contact you if a place becomes available.\n\n${note ?? ""}`
          : `Dear ${applicant.name},\n\nThank you for applying to ${app.program}. We're unable to offer you admission at this time.\n\n${note ?? ""}`;
    const dec = store.insert("decisions", { applicationId, outcome, letter, decidedBy: a.id, releasedAt: nowIso() }, "dec");
    store.update("applications", applicationId, { state: outcome === "admit" ? "admitted" : outcome === "deny" ? "denied" : "waitlisted", reviewerId: a.id, userId });
    store.emit("admissions.decided", `applications/${applicationId}`, { applicationId, outcome, userId });
    if (userId) notify(store, [userId], "admissions", `Admission decision: ${app.program}`, letter.slice(0, 400), `/campus/{tenant}/admissions/decision/${dec.id}`);
    audit(store, a, "admissions.decide", `applications/${applicationId}`, outcome);
    return dec;
  });
}

/* ---------------- Registration ---------------- */

interface Meeting {
  days: string[];
  start: number;
  end: number;
}
export function parseMeeting(p?: unknown): Meeting | null {
  const m = String(p ?? "").match(/^([A-Za-z/]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { days: m[1].split("/").map((d) => d.slice(0, 3).toLowerCase()), start: +m[2] * 60 + +m[3], end: +m[4] * 60 + +m[5] };
}
function overlaps(a: Meeting | null, b: Meeting | null) {
  if (!a || !b) return false;
  return a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end;
}

function catalogFor(store: TenantStore, section: Row): Row | undefined {
  return store.list("catalog_entries", (c) => c.courseId === section.courseId)[0];
}

export interface RegistrationCheck {
  check: string;
  ok: boolean;
  message: string;
}

/** Validates every rule without changing anything (also used by the Registration Guide agent). */
export function validateRegistration(store: TenantStore, userId: string, sectionId: string, opts: { allowOutsideWindow?: boolean } = {}): { checks: RegistrationCheck[]; section: Row; term: Row; full: boolean } {
  const section = store.get("sections", sectionId);
  if (!section) throw new CampusError("not_found", "Section not found", 404);
  const term = store.get("terms", section.termId as string);
  if (!term) throw new CampusError("not_found", "Term not found", 404);
  const user = store.get("users", userId);
  const checks: RegistrationCheck[] = [];
  checks.push({ check: "status", ok: user?.status === "active", message: user?.status === "active" ? "Student record is active." : "Student record isn't active." });
  const now = nowIso();
  const inWindow = now >= String(term.registrationOpens) && now <= String(term.registrationCloses);
  checks.push({ check: "window", ok: inWindow || !!opts.allowOutsideWindow, message: inWindow ? "Registration is open." : `Registration for ${term.name} runs ${String(term.registrationOpens).slice(0, 10)} to ${String(term.registrationCloses).slice(0, 10)}.` });
  const holds = store.list("holds", (h) => h.userId === userId && !!h.blocksRegistration && !h.releasedAt);
  checks.push({ check: "holds", ok: holds.length === 0, message: holds.length ? `Hold: ${holds.map((h) => `${h.kind} — ${h.reason}`).join("; ")}` : "No registration holds." });
  const cat = catalogFor(store, section);
  const prereqs = (cat?.prerequisites as string[]) ?? [];
  const passed = new Set(store.list("academic_history", (h) => h.userId === userId && !["F", "W", "I"].includes(h.grade as string)).map((h) => h.code as string));
  const missing = prereqs.filter((p) => !passed.has(p));
  checks.push({ check: "prerequisites", ok: missing.length === 0, message: missing.length ? `Missing prerequisites: ${missing.join(", ")}.` : prereqs.length ? "Prerequisites met." : "No prerequisites." });
  const mine = store.list("registrations", (r) => r.userId === userId && r.termId === term.id && r.state === "registered" && r.sectionId !== sectionId);
  const myMeet = parseMeeting(section.meetingPattern);
  const clash = mine.map((r) => store.get("sections", r.sectionId as string)).find((s) => s && overlaps(myMeet, parseMeeting(s.meetingPattern)));
  checks.push({ check: "conflicts", ok: !clash, message: clash ? `Time conflict with ${clash.code}.` : "No time conflicts." });
  const credits = Number(cat?.credits ?? store.get("courses", section.courseId as string)?.credits ?? 0);
  const current = mine.reduce((s, r) => s + Number(catalogFor(store, store.get("sections", r.sectionId as string)!)?.credits ?? 0), 0);
  const limit = Number(term.maxCredits ?? 18);
  checks.push({ check: "credits", ok: current + credits <= limit, message: current + credits <= limit ? `${current + credits} of ${limit} credits.` : `This would bring you to ${current + credits} credits; the limit is ${limit}.` });
  const taken = store.list("registrations", (r) => r.sectionId === sectionId && r.state === "registered").length;
  const full = taken >= Number(section.capacity);
  checks.push({ check: "capacity", ok: true, message: full ? "Section is full; you'll be added to the waitlist." : `${Number(section.capacity) - taken} seat(s) open.` });
  return { checks, section, term, full };
}

/** Register (student for themselves, or registrar on behalf). Idempotent per key. */
export function register(store: TenantStore, a: Actor, input: { userId?: string; sectionId: string; idempotencyKey?: string }) {
  const userId = input.userId ?? a.id;
  const staff = hasAny(a, [...SIS_ROLES]);
  if (userId !== a.id && !staff) throw new CampusError("forbidden", "You can only register yourself.", 403);
  const key = input.idempotencyKey ?? `${userId}:${input.sectionId}`;
  const prior = store.list("registrations", (r) => r.idempotencyKey === key && r.state !== "dropped")[0];
  if (prior) return prior;
  const v = validateRegistration(store, userId, input.sectionId, { allowOutsideWindow: staff });
  const failed = v.checks.filter((c) => !c.ok);
  if (failed.length) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "registration.create", resource: `sections/${input.sectionId}`, outcome: "denied", reason: failed.map((f) => f.check).join(",") });
    throw new CampusError("registration_blocked", failed.map((f) => f.message).join(" "), 409, { checks: v.checks });
  }
  return store.tx(() => {
    // Capacity is re-checked inside the transaction (last-seat race).
    const taken = store.list("registrations", (r) => r.sectionId === input.sectionId && r.state === "registered").length;
    if (taken >= Number(v.section.capacity)) {
      const pos = store.list("waitlist", (w) => w.sectionId === input.sectionId && w.state === "waiting").length + 1;
      const reg = store.insert("registrations", { userId, sectionId: input.sectionId, termId: v.term.id, state: "waitlisted", checks: v.checks, idempotencyKey: key }, "reg");
      store.insert("waitlist", { userId, sectionId: input.sectionId, position: pos, state: "waiting", registrationId: reg.id }, "wl");
      store.emit("sis.registration.waitlisted", `registrations/${reg.id}`, { registrationId: reg.id, userId, sectionId: input.sectionId, position: pos });
      audit(store, a, "registration.waitlist", `registrations/${reg.id}`);
      return reg;
    }
    const reg = store.insert("registrations", { userId, sectionId: input.sectionId, termId: v.term.id, state: "registered", checks: v.checks, idempotencyKey: key }, "reg");
    commit(store, reg, v.section);
    audit(store, a, "registration.commit", `registrations/${reg.id}`);
    return reg;
  });
}

function commit(store: TenantStore, reg: Row, section: Row) {
  store.emit("sis.enrollment.committed", `registrations/${reg.id}`, { registrationId: reg.id, userId: reg.userId, sectionId: section.id, courseId: section.courseId, role: "student", startAt: section.startAt ?? null, endAt: section.endAt ?? null });
  const cat = catalogFor(store, section);
  const credits = Number(cat?.credits ?? 0);
  if (credits > 0) store.insert("charges", { userId: reg.userId, description: `Tuition (sandbox): ${cat?.code ?? section.code}`, amount: credits * TUITION_PER_CREDIT, dueAt: new Date(nowMs() + 30 * 86400_000).toISOString().slice(0, 10), paid: false, registrationId: reg.id }, "chg");
}

export function drop(store: TenantStore, a: Actor, registrationId: string) {
  const reg = store.get("registrations", registrationId);
  if (!reg) throw new CampusError("not_found", "Registration not found", 404);
  if (reg.userId !== a.id && !hasAny(a, [...SIS_ROLES])) throw new CampusError("forbidden", "You can only drop your own classes.", 403);
  if (reg.state === "dropped") return reg;
  return store.tx(() => {
    const wasRegistered = reg.state === "registered";
    store.update("registrations", reg.id, { state: "dropped" });
    for (const w of store.list("waitlist", (w) => w.registrationId === reg.id)) store.update("waitlist", w.id, { state: "removed" });
    if (wasRegistered) {
      store.emit("sis.enrollment.dropped", `registrations/${reg.id}`, { registrationId: reg.id, userId: reg.userId, sectionId: reg.sectionId });
      for (const c of store.list("charges", (c) => c.registrationId === reg.id && !c.paid)) store.tombstone("charges", c.id);
      // Promote the next waitlisted student if their checks still pass.
      const next = store.list("waitlist", (w) => w.sectionId === reg.sectionId && w.state === "waiting").sort((x, y) => Number(x.position) - Number(y.position))[0];
      if (next) {
        const nreg = store.get("registrations", next.registrationId as string)!;
        const v = validateRegistration(store, next.userId as string, reg.sectionId as string, { allowOutsideWindow: true });
        if (v.checks.every((c) => c.ok)) {
          store.update("registrations", nreg.id, { state: "registered", checks: v.checks });
          store.update("waitlist", next.id, { state: "promoted" });
          commit(store, nreg, v.section);
          notify(store, [next.userId as string], "registration", "You're in!", `A seat opened in ${v.section.code} and you've been registered.`, "/campus/{tenant}/registration");
        }
      }
    }
    audit(store, a, "registration.drop", `registrations/${reg.id}`);
    return store.get("registrations", reg.id);
  });
}

/* ---------------- LMS projection (consumer) ---------------- */

registerConsumer({
  name: "lms-enrollment-projection",
  types: ["sis.enrollment.committed", "sis.enrollment.dropped", "sections.created", "sections.updated"],
  handle(store, e) {
    if (e.type === "sis.enrollment.committed") {
      const existing = store.list("enrollments", (x) => x.sisRegistrationId === e.data.registrationId, { includeDeleted: true })[0];
      if (existing) {
        if (existing.state !== "active") store.update("enrollments", existing.id, { state: "active" });
        return;
      }
      store.insert("enrollments", { userId: e.data.userId, courseId: e.data.courseId, sectionId: e.data.sectionId, role: e.data.role ?? "student", state: "active", source: "sis", sisRegistrationId: e.data.registrationId, startAt: e.data.startAt, endAt: e.data.endAt }, "enr");
      return;
    }
    if (e.type === "sis.enrollment.dropped") {
      // Inactive enrollments keep grades.
      for (const x of store.list("enrollments", (x) => x.sisRegistrationId === e.data.registrationId)) store.update("enrollments", x.id, { state: "inactive" });
      return;
    }
    // Section instructors get instructor enrollments.
    const s = store.get("sections", String(e.data.id));
    if (!s?.instructorId) return;
    const has = store.list("enrollments", (x) => x.userId === s.instructorId && x.courseId === s.courseId && x.role === "instructor" && x.sectionId === s.id).length;
    if (!has) store.insert("enrollments", { userId: s.instructorId, courseId: s.courseId, sectionId: s.id, role: "instructor", state: "active", source: "sis" }, "enr");
  },
});

/** Detect missing, extra or stale LMS access versus SIS truth, optionally fix. */
export function reconcile(store: TenantStore, a: Actor, apply = false) {
  requireTenant(store, a, [...SIS_ROLES], "enrollment.reconcile");
  const regs = store.list("registrations", (r) => r.state === "registered");
  const enr = store.list("enrollments", (e) => e.source === "sis" && e.role === "student");
  const missing = regs.filter((r) => !enr.some((e) => e.sisRegistrationId === r.id && e.state === "active"));
  const extra = enr.filter((e) => e.state === "active" && !regs.some((r) => r.id === e.sisRegistrationId));
  const stale = enr.filter((e) => {
    const r = regs.find((x) => x.id === e.sisRegistrationId);
    return r && (r.sectionId !== e.sectionId);
  });
  const report = {
    at: nowIso(),
    missing: missing.map((r) => ({ registrationId: r.id, userId: r.userId, sectionId: r.sectionId, action: "create access" })),
    extra: extra.map((e) => ({ enrollmentId: e.id, userId: e.userId, courseId: e.courseId, action: "deactivate access" })),
    stale: stale.map((e) => ({ enrollmentId: e.id, userId: e.userId, action: "move to registered section" })),
    applied: false,
  };
  return store.tx(() => {
    if (apply) {
      for (const r of missing) {
        const s = store.get("sections", r.sectionId as string)!;
        store.emit("sis.enrollment.committed", `registrations/${r.id}`, { registrationId: r.id, userId: r.userId, sectionId: s.id, courseId: s.courseId, role: "student" });
      }
      for (const e of extra) store.update("enrollments", e.id, { state: "inactive" });
      for (const e of stale) {
        const r = regs.find((x) => x.id === e.sisRegistrationId)!;
        store.update("enrollments", e.id, { sectionId: r.sectionId });
      }
      report.applied = true;
    }
    const job = store.insert("sync_jobs", { kind: "enrollment_reconciliation", state: "complete", idempotencyKey: `recon:${nowIso()}`, report, startedBy: a.id }, "sj");
    audit(store, a, "enrollment.reconcile", `sync_jobs/${job.id}`, `${missing.length}/${extra.length}/${stale.length}`);
    return { ...report, jobId: job.id };
  });
}

/* ---------------- Records ---------------- */

const POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
export function unofficialTranscript(store: TenantStore, a: Actor, userId: string) {
  if (userId !== a.id && !hasAny(a, ["admin", "registrar", "advisor"])) throw new CampusError("forbidden", "You can only view your own transcript.", 403);
  const u = store.get("users", userId);
  if (!u) throw new CampusError("not_found", "Student not found", 404);
  const rows = store.list("academic_history", (h) => h.userId === userId).sort((x, y) => String(x.termName).localeCompare(String(y.termName)));
  const graded = rows.filter((r) => r.grade && String(r.grade) in POINTS);
  const credits = graded.reduce((s, r) => s + Number(r.credits), 0);
  const gpa = credits ? Math.round((graded.reduce((s, r) => s + POINTS[r.grade as string] * Number(r.credits), 0) / credits) * 100) / 100 : null;
  const inProgress = store.list("registrations", (r) => r.userId === userId && r.state === "registered").map((r) => {
    const s = store.get("sections", r.sectionId as string);
    return { section: s?.code, term: store.get("terms", r.termId as string)?.name };
  });
  audit(store, a, "transcript.view", `users/${userId}`);
  return { student: { id: u.id, name: u.name }, watermark: "UNOFFICIAL — demonstration institution", rows, gpa, creditsEarned: credits, inProgress, generatedAt: nowIso() };
}

/* ---------------- Student accounts (sandbox) ---------------- */

export function account(store: TenantStore, a: Actor, userId: string) {
  if (userId !== a.id && !hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "You can only view your own account.", 403);
  const charges = store.list("charges", (c) => c.userId === userId);
  const payments = store.list("payments", (p) => p.userId === userId);
  const aid = store.list("aid_awards", (x) => x.userId === userId);
  const accepted = aid.filter((x) => x.state === "accepted").reduce((s, x) => s + Number(x.amount), 0);
  const total = charges.reduce((s, c) => s + Number(c.amount), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const plan = store.list("payment_plans", (p) => p.userId === userId && p.state === "active")[0] ?? null;
  return { userId, currency: "USD", charges, payments, aid, plan, balance: Math.round((total - paid - accepted) * 100) / 100, sandbox: true };
}

export function respondToAid(store: TenantStore, a: Actor, awardId: string, accept: boolean) {
  const aw = store.get("aid_awards", awardId);
  if (!aw || aw.userId !== a.id) throw new CampusError("not_found", "Award not found", 404);
  if (aw.state && aw.state !== "offered") throw new CampusError("already", "You already responded.", 409);
  return store.tx(() => {
    const out = store.update("aid_awards", awardId, { state: accept ? "accepted" : "declined" });
    store.emit("finance.aid.responded", `aid_awards/${awardId}`, { userId: a.id, accept });
    releaseFinancialHoldIfClear(store, a.id);
    return out;
  });
}

/** Sandbox payment provider: no real funds move. */
export function pay(store: TenantStore, a: Actor, amount: number, userId?: string) {
  const uid = userId ?? a.id;
  if (uid !== a.id && !hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "You can only pay your own account.", 403);
  if (!(amount > 0) || amount > 100000) throw new CampusError("invalid", "Enter an amount between 0.01 and 100,000.", 422);
  return store.tx(() => {
    const p = store.insert("payments", { userId: uid, amount: Math.round(amount * 100) / 100, provider: "sandbox", providerRef: `sbx_${Date.now()}` }, "pay");
    const plan = store.list("payment_plans", (x) => x.userId === uid && x.state === "active")[0];
    if (plan) {
      const paid = Number(plan.paid) + p.amount;
      store.update("payment_plans", plan.id, { paid, state: paid >= Number(plan.total) ? "completed" : "active" });
    }
    store.emit("finance.payment.received", `payments/${p.id}`, { userId: uid, amount: p.amount });
    releaseFinancialHoldIfClear(store, uid);
    audit(store, a, "finance.pay", `payments/${p.id}`, String(p.amount));
    return p;
  });
}

export function createPaymentPlan(store: TenantStore, a: Actor, installments: number) {
  const acc = account(store, a, a.id);
  if (acc.balance <= 0) throw new CampusError("nothing_owed", "You don't have a balance.", 409);
  if (acc.plan) throw new CampusError("already", "You already have a payment plan.", 409);
  if (![2, 3, 4, 6].includes(installments)) throw new CampusError("invalid", "Choose 2, 3, 4 or 6 installments.", 422);
  return store.tx(() => {
    const plan = store.insert("payment_plans", { userId: a.id, total: acc.balance, installments, paid: 0, state: "active", perInstallment: Math.ceil((acc.balance / installments) * 100) / 100 }, "ppl");
    store.emit("finance.plan.created", `payment_plans/${plan.id}`, { userId: a.id });
    releaseFinancialHoldIfClear(store, a.id);
    return plan;
  });
}

function releaseFinancialHoldIfClear(store: TenantStore, userId: string) {
  const acc = account(store, { id: userId, roles: [], tenantId: store.tenantId } as unknown as Actor, userId);
  if (acc.balance <= 0 || acc.plan) for (const h of store.list("holds", (h) => h.userId === userId && h.kind === "financial" && !h.releasedAt && h.system === true)) store.update("holds", h.id, { releasedAt: nowIso() });
}

/** Job: overdue unpaid balance without a plan → financial hold. */
export function overdueJob(store: TenantStore) {
  let placed = 0;
  store.tx(() => {
    const users = new Set(store.list("charges", (c) => !c.paid && String(c.dueAt) < nowIso().slice(0, 10)).map((c) => c.userId as string));
    for (const uid of users) {
      const acc = account(store, { id: uid, roles: [], tenantId: store.tenantId } as unknown as Actor, uid);
      if (acc.balance > 0 && !acc.plan && !store.list("holds", (h) => h.userId === uid && h.kind === "financial" && !h.releasedAt).length) {
        store.insert("holds", { userId: uid, kind: "financial", reason: "Your account has an overdue balance. Pay or set up a payment plan to register.", blocksRegistration: true, system: true }, "hld");
        notify(store, [uid], "billing", "Registration hold placed", "Your account has an overdue balance (sandbox).", "/campus/{tenant}/finance");
        placed++;
      }
    }
  });
  return placed;
}

/* ---------------- SIS import (CSV) ---------------- */

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

export function csv(rows: Record<string, unknown>[], cols?: string[]): string {
  const c = cols ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const e = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [c.join(","), ...rows.map((r) => c.map((k) => e(r[k])).join(","))].join("\n");
}

type SisKind = "users" | "terms" | "courses" | "sections" | "enrollments" | "groups" | "xlists";

export function sisImport(store: TenantStore, a: Actor, kind: SisKind, text: string, diffing = false) {
  requireTenant(store, a, [...SIS_ROLES], "sis.import");
  const rows = parseCsv(text);
  const errors: { row: number; message: string }[] = [];
  const counts = { created: 0, updated: 0, dropped: 0, skipped: 0 };
  const seen = new Set<string>();
  return store.tx(() => {
    rows.forEach((r, i) => {
      try {
        if (kind === "users") {
          if (!r.sis_id || !r.email || !r.name) throw new Error("sis_id, email and name are required");
          seen.add(r.sis_id);
          const u = store.list("users", (x) => x.sisId === r.sis_id || x.email === r.email.toLowerCase())[0];
          if (u) {
            store.update("users", u.id, { name: r.name, sisId: r.sis_id, status: r.status === "deleted" ? "suspended" : "active" });
            counts.updated++;
          } else {
            const nu = createUser(store, { name: r.name, email: r.email, roles: r.role ? [r.role as never] : ["student"] });
            store.update("users", nu.id, { sisId: r.sis_id });
            counts.created++;
          }
        } else if (kind === "terms") {
          if (!r.term_id || !r.name || !r.start_date || !r.end_date) throw new Error("term_id, name, start_date, end_date required");
          seen.add(r.term_id);
          const t = store.list("terms", (x) => x.sisId === r.term_id)[0];
          const vals = { name: r.name, startsAt: r.start_date, endsAt: r.end_date, registrationOpens: r.registration_opens || `${r.start_date}T00:00:00.000Z`, registrationCloses: r.registration_closes || `${r.end_date}T00:00:00.000Z`, maxCredits: Number(r.max_credits || 18), sisId: r.term_id };
          if (t) {
            store.update("terms", t.id, vals);
            counts.updated++;
          } else {
            store.insert("terms", vals, "trm");
            counts.created++;
          }
        } else if (kind === "courses") {
          if (!r.course_id || !r.code || !r.title) throw new Error("course_id, code, title required");
          seen.add(r.course_id);
          const c = store.list("courses", (x) => x.sisId === r.course_id)[0];
          const vals = { code: r.code, title: r.title, credits: Number(r.credits || 3), sisId: r.course_id };
          if (c) {
            store.update("courses", c.id, vals);
            counts.updated++;
          } else {
            const nc = store.insert("courses", { ...vals, state: "unpublished" }, "crs");
            store.insert("catalog_entries", { code: r.code, title: r.title, credits: Number(r.credits || 3), courseId: nc.id, prerequisites: r.prerequisites ? r.prerequisites.split(" ") : [] }, "cat");
            counts.created++;
          }
        } else if (kind === "sections") {
          const c = store.list("courses", (x) => x.sisId === r.course_id)[0];
          const t = store.list("terms", (x) => x.sisId === r.term_id)[0];
          if (!c || !t) throw new Error("unknown course_id or term_id");
          seen.add(r.section_id);
          const s = store.list("sections", (x) => x.sisId === r.section_id)[0];
          const vals = { courseId: c.id, code: r.code || r.section_id, termId: t.id, capacity: Number(r.capacity || 30), meetingPattern: r.meeting || null, sisId: r.section_id };
          if (s) {
            store.update("sections", s.id, vals);
            counts.updated++;
          } else {
            const ns = store.insert("sections", vals, "sec");
            store.emit("sections.created", `sections/${ns.id}`, { id: ns.id, courseId: c.id });
            counts.created++;
          }
        } else if (kind === "enrollments") {
          const u = store.list("users", (x) => x.sisId === r.user_id)[0];
          const s = store.list("sections", (x) => x.sisId === r.section_id)[0];
          if (!u || !s) throw new Error("unknown user_id or section_id");
          const key = `sis:${r.user_id}:${r.section_id}`;
          seen.add(key);
          const existing = store.list("registrations", (x) => x.idempotencyKey === key)[0];
          if (r.status === "deleted") {
            if (existing && existing.state === "registered") {
              store.update("registrations", existing.id, { state: "dropped" });
              store.emit("sis.enrollment.dropped", `registrations/${existing.id}`, { registrationId: existing.id, userId: u.id, sectionId: s.id });
              counts.dropped++;
            } else counts.skipped++;
          } else if (existing && existing.state === "registered") counts.skipped++;
          else {
            const role = r.role || "student";
            const reg = existing ? store.update("registrations", existing.id, { state: "registered" }) : store.insert("registrations", { userId: u.id, sectionId: s.id, termId: s.termId, state: "registered", checks: [{ check: "sis_import", ok: true, message: "Imported from SIS" }], idempotencyKey: key }, "reg");
            store.emit("sis.enrollment.committed", `registrations/${reg.id}`, { registrationId: reg.id, userId: u.id, sectionId: s.id, courseId: s.courseId, role });
            counts.created++;
          }
        } else if (kind === "groups") {
          const c = store.list("courses", (x) => x.sisId === r.course_id)[0];
          if (!c) throw new Error("unknown course_id");
          const members = (r.member_sis_ids || "").split(" ").map((sid) => store.list("users", (u) => u.sisId === sid)[0]?.id).filter(Boolean);
          store.insert("groups", { courseId: c.id, name: r.name, memberIds: members }, "grp");
          counts.created++;
        } else if (kind === "xlists") {
          const s = store.list("sections", (x) => x.sisId === r.section_id)[0];
          const other = store.list("sections", (x) => x.sisId === r.xlist_section_id)[0];
          if (!s || !other) throw new Error("unknown section ids");
          store.update("sections", s.id, { crossListedWith: [...new Set([...(((s.crossListedWith as string[]) ?? [])), other.id])] });
          counts.updated++;
        }
      } catch (err) {
        errors.push({ row: i + 2, message: err instanceof Error ? err.message : String(err) });
      }
    });
    // Diffing mode: enrollments missing from this batch are dropped.
    if (diffing && kind === "enrollments") {
      for (const reg of store.list("registrations", (x) => String(x.idempotencyKey).startsWith("sis:") && x.state === "registered" && !seen.has(x.idempotencyKey as string))) {
        store.update("registrations", reg.id, { state: "dropped" });
        store.emit("sis.enrollment.dropped", `registrations/${reg.id}`, { registrationId: reg.id, userId: reg.userId, sectionId: reg.sectionId });
        counts.dropped++;
      }
    }
    const job = store.insert("sis_imports", { kind, diffing, state: errors.length ? "completed_with_errors" : "completed", counts, errors, startedBy: a.id }, "sis");
    store.emit("sis.import.completed", `sis_imports/${job.id}`, { kind, counts });
    audit(store, a, "sis.import", `sis_imports/${job.id}`, `${kind} ${JSON.stringify(counts)}`);
    return job;
  });
}
