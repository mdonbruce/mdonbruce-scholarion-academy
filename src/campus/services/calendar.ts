import { broker, CampusError, hmac, id, nowIso, sha256, token, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, course, esc, isStaff, notify, requireCourse, toMs, userName } from "./common";
import { effectiveDates, groupIdsOf, sectionIdsOf } from "./curriculum";
import { dueFor } from "./grading";

/**
 * Calendar projections (assignments, quizzes, section meetings, live sessions, personal,
 * course, section and group events, recurring events, scheduler slots), revocable
 * hashed iCal feeds, the appointment scheduler, drag-to-reschedule, course pacing and
 * the sandbox live-classroom connector with attendance assertions.
 */

export interface CalItem {
  id: string;
  kind: "assignment" | "quiz" | "event" | "meeting" | "live" | "appointment" | "todo";
  title: string;
  start: string | null;
  end?: string | null;
  courseId?: string | null;
  href?: string;
  editable?: boolean;
  color?: string;
}

const PALETTE = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];

function myCourses(a: Actor): string[] {
  return Object.keys(a.courseRoles);
}

function expandRecurring(e: Row, from: string, to: string): { start: string; end: string | null }[] {
  const rec = (e.recurrence as string) ?? "none";
  const start = toMs(e.startsAt);
  const dur = e.endsAt ? toMs(e.endsAt) - start : 0;
  if (rec === "none") return [{ start: String(e.startsAt), end: (e.endsAt as string) ?? null }];
  const step = rec === "daily" ? 86400_000 : 7 * 86400_000;
  const until = Math.min(e.recurUntil ? toMs(`${e.recurUntil}T23:59:59Z`) : start + 180 * 86400_000, toMs(to));
  const out: { start: string; end: string | null }[] = [];
  for (let t = start; t <= until && out.length < 400; t += step) if (t >= toMs(from) - dur) out.push({ start: new Date(t).toISOString(), end: dur ? new Date(t + dur).toISOString() : null });
  return out;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function meetingInstances(pattern: unknown, from: string, to: string): { start: string; end: string }[] {
  const m = String(pattern ?? "").match(/^([A-Za-z/]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return [];
  const days = m[1].split("/").map((d) => d.slice(0, 3).toLowerCase());
  const out: { start: string; end: string }[] = [];
  for (let t = toMs(from.slice(0, 10)); t <= toMs(to) && out.length < 200; t += 86400_000) {
    const d = new Date(t);
    if (!days.includes(DAYS[d.getUTCDay()])) continue;
    const base = d.toISOString().slice(0, 10);
    out.push({ start: `${base}T${m[2].padStart(2, "0")}:${m[3]}:00.000Z`, end: `${base}T${m[4].padStart(2, "0")}:${m[5]}:00.000Z` });
  }
  return out;
}

/** All calendar items visible to the actor in [from, to]. */
export function projection(store: TenantStore, a: Actor, from: string, to: string, opts: { courseIds?: string[]; forUserId?: string } = {}): { items: CalItem[]; undated: CalItem[] } {
  const uid = opts.forUserId ?? a.id;
  const courses = (opts.courseIds?.length ? opts.courseIds : myCourses(a)).filter((c) => myCourses(a).includes(c) || a.roles.includes("admin"));
  const color = (cid: string) => PALETTE[Math.abs(parseInt(sha256(cid).slice(0, 6), 16)) % PALETTE.length];
  const items: CalItem[] = [];
  const undated: CalItem[] = [];
  const inRange = (d: string | null) => !!d && d >= from && d <= to;
  for (const cid of courses) {
    const staff = isStaff(a, cid) && !opts.forUserId;
    for (const asg of store.list("assignments", (x) => x.courseId === cid && (staff || x.state === "published"))) {
      const d = staff ? { dueAt: (asg.dueAt as string) ?? null, assigned: true } : { ...effectiveDates(store, asg, uid), dueAt: dueFor(store, asg, uid) };
      if (!d.assigned) continue;
      const it: CalItem = { id: asg.id, kind: "assignment", title: asg.title as string, start: d.dueAt, courseId: cid, href: `courses/${cid}/assignments/${asg.id}`, editable: staff, color: color(cid) };
      if (!d.dueAt) undated.push(it);
      else if (inRange(d.dueAt)) items.push(it);
    }
    for (const q of store.list("quizzes", (x) => x.courseId === cid && (staff || x.state === "published"))) {
      const d = staff ? { dueAt: (q.availableUntil as string) ?? null, assigned: true } : effectiveDates(store, { ...q, dueAt: q.availableUntil }, uid);
      if (!d.assigned) continue;
      const it: CalItem = { id: q.id, kind: "quiz", title: q.title as string, start: d.dueAt, courseId: cid, href: `courses/${cid}/quizzes/${q.id}`, editable: staff, color: color(cid) };
      if (!d.dueAt) undated.push(it);
      else if (inRange(d.dueAt)) items.push(it);
    }
    const mySections = staff ? store.list("sections", (s) => s.courseId === cid).map((s) => s.id) : sectionIdsOf(store, uid, cid);
    for (const s of store.list("sections", (x) => mySections.includes(x.id) && !!x.meetingPattern)) {
      for (const inst of meetingInstances(s.meetingPattern, from, to)) items.push({ id: `${s.id}:${inst.start}`, kind: "meeting", title: `${course(store, cid).code} ${s.code}`, start: inst.start, end: inst.end, courseId: cid, color: color(cid) });
    }
    for (const l of store.list("live_sessions", (x) => x.courseId === cid && (!x.sectionId || mySections.includes(x.sectionId as string)))) {
      if (inRange(l.startsAt as string)) items.push({ id: l.id, kind: "live", title: `Live: ${l.title}`, start: l.startsAt as string, end: new Date(toMs(l.startsAt) + Number(l.minutes) * 60_000).toISOString(), courseId: cid, href: `courses/${cid}/live`, color: color(cid) });
    }
    const myGroups = groupIdsOf(store, uid, cid);
    for (const e of store.list("calendar_events", (x) => x.courseId === cid && (!x.sectionId || mySections.includes(x.sectionId as string)) && (!x.groupId || myGroups.includes(x.groupId as string) || staff))) {
      for (const inst of expandRecurring(e, from, to)) if (inRange(inst.start)) items.push({ id: `${e.id}:${inst.start}`, kind: "event", title: e.title as string, start: inst.start, end: inst.end, courseId: cid, editable: staff, color: color(cid) });
    }
    for (const slot of store.list("appointment_slots", (x) => x.courseId === cid)) {
      const signed = ((slot.signups as { userId: string }[]) ?? []).some((s) => s.userId === uid);
      if ((signed || staff) && inRange(slot.startsAt as string)) items.push({ id: slot.id, kind: "appointment", title: `Appointment: ${store.get("appointment_groups", slot.groupId as string)?.title}`, start: slot.startsAt as string, end: slot.endsAt as string, courseId: cid, color: color(cid) });
    }
  }
  for (const e of store.list("calendar_events", (x) => x.userId === uid && !x.courseId)) for (const inst of expandRecurring(e, from, to)) if (inRange(inst.start)) items.push({ id: `${e.id}:${inst.start}`, kind: "event", title: e.title as string, start: inst.start, end: inst.end, editable: true, color: "#475569" });
  for (const t of store.list("planner_items", (x) => x.userId === uid && !x.done)) {
    const it: CalItem = { id: t.id, kind: "todo", title: `To do: ${t.title}`, start: (t.dueAt as string) ?? null, courseId: (t.courseId as string) ?? null, editable: true, color: "#64748b" };
    if (!t.dueAt) undated.push(it);
    else if (inRange(t.dueAt as string)) items.push(it);
  }
  items.sort((x, y) => String(x.start).localeCompare(String(y.start)));
  return { items, undated };
}

/** Drag an assignment/quiz/event to a new date; updates the due date only with permission. */
export function reschedule(store: TenantStore, a: Actor, kind: "assignment" | "quiz" | "event" | "todo", refId: string, newStart: string) {
  if (Number.isNaN(Date.parse(newStart))) throw new CampusError("invalid", "Invalid date.", 422);
  const at = new Date(newStart).toISOString();
  if (kind === "assignment" || kind === "quiz") {
    const table = kind === "assignment" ? "assignments" : "quizzes";
    const r = store.get(table, refId);
    if (!r) throw new CampusError("not_found", "Item not found", 404);
    requireCourse(store, a, r.courseId as string, ["admin", "instructor", "designer"], `${table}.reschedule`);
    const bp = store.get("courses", r.courseId as string)?.blueprintId;
    if (bp && r.blueprintSourceId && ((store.get("courses", bp as string)?.blueprintLocks as string[]) ?? []).includes("due_dates")) throw new CampusError("blueprint_locked", "Due dates are locked by the blueprint.", 409);
    return store.tx(() => {
      const out = store.update(table, refId, kind === "assignment" ? { dueAt: at } : { availableUntil: at });
      store.emit(`${table}.updated`, `${table}/${refId}`, { id: refId, courseId: r.courseId, fields: ["dueAt"] });
      notify(store, store.list("enrollments", (e) => e.courseId === r.courseId && e.role === "student" && e.state === "active").map((e) => e.userId as string), "calendar", `Date changed: ${r.title}`, `Now due ${at.slice(0, 16).replace("T", " ")} UTC`, `/campus/{tenant}/calendar`, r.courseId as string);
      audit(store, a, `${table}.reschedule`, `${table}/${refId}`, at);
      return out;
    });
  }
  const table = kind === "event" ? "calendar_events" : "planner_items";
  const r = store.get(table, refId.split(":")[0]);
  if (!r) throw new CampusError("not_found", "Item not found", 404);
  if (r.userId !== a.id && !(r.courseId && isStaff(a, r.courseId as string))) throw new CampusError("forbidden", "You can't move this.", 403);
  return store.tx(() => store.update(table, r.id, kind === "event" ? { startsAt: at, ...(r.endsAt ? { endsAt: new Date(toMs(at) + toMs(r.endsAt) - toMs(r.startsAt)).toISOString() } : {}) } : { dueAt: at }));
}

/* ---------------- iCal feeds ---------------- */

export function issueFeed(store: TenantStore, a: Actor, label = "My calendar") {
  const secret = token(24);
  return store.tx(() => {
    const t = store.insert("ical_tokens", { userId: a.id, label, tokenHash: sha256(secret) }, "ict");
    audit(store, a, "ical.issue", `ical_tokens/${t.id}`);
    return { id: t.id, url: `/api/campus/ical/${store.tenantId}/${secret}.ics` };
  });
}

export function revokeFeed(store: TenantStore, a: Actor, feedId: string) {
  const t = store.get("ical_tokens", feedId);
  if (!t || t.userId !== a.id) throw new CampusError("not_found", "Feed not found", 404);
  return store.tx(() => store.update("ical_tokens", feedId, { revokedAt: nowIso() }));
}

export function feedOwner(store: TenantStore, secret: string): string | null {
  const t = store.list("ical_tokens", (x) => x.tokenHash === sha256(secret) && !x.revokedAt)[0];
  if (!t) return null;
  store.update("ical_tokens", t.id, { lastUsedAt: nowIso() });
  return t.userId as string;
}

export function ics(items: CalItem[], name: string): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Scholarion Campus//EN", `X-WR-CALNAME:${name}`];
  for (const i of items) {
    if (!i.start) continue;
    lines.push("BEGIN:VEVENT", `UID:${i.id}@scholarion`, `DTSTAMP:${fmt(nowIso())}`, `DTSTART:${fmt(i.start)}`, ...(i.end ? [`DTEND:${fmt(i.end)}`] : []), `SUMMARY:${i.title.replace(/[,;\\]/g, (c) => `\\${c}`)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/* ---------------- Scheduler ---------------- */

export function signUpSlot(store: TenantStore, a: Actor, slotId: string, asGroup = false) {
  const slot = store.get("appointment_slots", slotId);
  if (!slot) throw new CampusError("not_found", "Time slot not found", 404);
  const grp = store.get("appointment_groups", slot.groupId as string)!;
  const courseId = slot.courseId as string;
  if (!hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "Only students in this course can sign up.", 403);
  if (toMs(slot.startsAt) < Date.parse(nowIso())) throw new CampusError("past", "That time has passed.", 409);
  const signups = (slot.signups as { userId: string; groupId?: string }[]) ?? [];
  const ids = asGroup && grp.groupSignup ? (store.list("groups", (g) => g.courseId === courseId && ((g.memberIds as string[]) ?? []).includes(a.id))[0]?.memberIds as string[]) ?? [a.id] : [a.id];
  // One slot per person per appointment group.
  for (const s of store.list("appointment_slots", (x) => x.groupId === grp.id)) if (((s.signups as { userId: string }[]) ?? []).some((x) => ids.includes(x.userId))) throw new CampusError("already", "You already have a time in this appointment group.", 409);
  const limit = Number(grp.perSlot ?? 1);
  const units = grp.groupSignup ? new Set(signups.map((s) => s.groupId ?? s.userId)).size : signups.length;
  if (units >= limit) throw new CampusError("full", "That time slot is full.", 409);
  return store.tx(() => {
    const gid = asGroup ? id("grpsu") : undefined;
    const out = store.update("appointment_slots", slotId, { signups: [...signups, ...ids.map((u) => ({ userId: u, groupId: gid, at: nowIso() }))] });
    notify(store, store.list("enrollments", (e) => e.courseId === courseId && e.role === "instructor").map((e) => e.userId as string), "scheduler", `${userName(store, a.id)} booked ${grp.title}`, String(slot.startsAt), "/campus/{tenant}/calendar", courseId);
    return out;
  });
}

export function cancelSlot(store: TenantStore, a: Actor, slotId: string, userId?: string) {
  const slot = store.get("appointment_slots", slotId);
  if (!slot) throw new CampusError("not_found", "Time slot not found", 404);
  const target = userId ?? a.id;
  if (target !== a.id && !isStaff(a, slot.courseId as string)) throw new CampusError("forbidden", "You can only cancel your own booking.", 403);
  return store.tx(() => {
    const out = store.update("appointment_slots", slotId, { signups: ((slot.signups as { userId: string }[]) ?? []).filter((s) => s.userId !== target) });
    if (target !== a.id) notify(store, [target], "scheduler", "Your appointment was cancelled", String(slot.startsAt), "/campus/{tenant}/calendar", slot.courseId as string);
    return out;
  });
}

/* ---------------- Course pacing ---------------- */

/** Assign per-student due dates spread over the pace duration, skipping weekends and blackouts. */
export function applyPacing(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "designer"], "pacing.apply");
  const c = course(store, courseId);
  if (!c.pacing) throw new CampusError("not_enabled", "Turn on course pacing in course settings first.", 409);
  const items = store.list("module_items", (i) => i.courseId === courseId && i.state === "published" && ["assignment", "quiz"].includes(i.kind as string)).sort((x, y) => {
    const mx = Number(store.get("modules", x.moduleId as string)?.position ?? 0);
    const my = Number(store.get("modules", y.moduleId as string)?.position ?? 0);
    return mx - my || Number(x.position) - Number(y.position);
  });
  const blackouts = store.list("blackout_dates", (b) => b.courseId === courseId);
  const plans = store.list("pace_plans", (p) => p.courseId === courseId);
  const isBlack = (d: Date) => blackouts.some((b) => d.toISOString().slice(0, 10) >= String(b.startsAt) && d.toISOString().slice(0, 10) <= String(b.endsAt));
  let created = 0;
  store.tx(() => {
    for (const e of store.list("enrollments", (x) => x.courseId === courseId && x.role === "student" && x.state === "active")) {
      const plan = plans.find((p) => p.scope === "student" && p.targetId === e.userId) ?? plans.find((p) => p.scope === "section" && p.targetId === e.sectionId) ?? plans.find((p) => p.scope === "course");
      if (!plan) continue;
      const start = plan.startAt ? new Date(`${plan.startAt}T00:00:00Z`) : new Date(String(e.createdAt));
      const days: Date[] = [];
      for (let d = new Date(start); days.length < Number(plan.weeks) * 7 * 2 && d.getTime() < start.getTime() + 400 * 86400_000; d = new Date(d.getTime() + 86400_000)) {
        if (plan.skipWeekends && [0, 6].includes(d.getUTCDay())) continue;
        if (isBlack(d)) continue;
        days.push(d);
        if (d.getTime() >= start.getTime() + Number(plan.weeks) * 7 * 86400_000) break;
      }
      items.forEach((it, i) => {
        const day = days[Math.min(days.length - 1, Math.floor(((i + 1) * days.length) / items.length) - 1)] ?? days[days.length - 1];
        const due = `${day.toISOString().slice(0, 10)}T23:59:00.000Z`;
        for (const o of store.list("assignment_overrides", (o) => o.assignmentId === it.refId && o.target === "student" && o.targetId === e.userId && o.source === "pacing")) store.tombstone("assignment_overrides", o.id);
        store.insert("assignment_overrides", { courseId, assignmentId: it.refId, target: "student", targetId: e.userId, dueAt: due, source: "pacing" }, "ao");
        created++;
      });
    }
    store.emit("pacing.applied", `courses/${courseId}`, { courseId, overrides: created });
    audit(store, a, "pacing.apply", `courses/${courseId}`, String(created));
  });
  return { overrides: created };
}

/* ---------------- Live classroom (sandbox connector) ---------------- */

export function scheduleLive(store: TenantStore, a: Actor, input: { courseId: string; sectionId?: string; title: string; startsAt: string; minutes: number; provider: "zoom" | "teams"; recordingRetentionDays?: number }) {
  const tenant = store.tenantId;
  requireCourse(store, a, input.courseId, ["admin", "instructor", "ta"], "live_sessions.create");
  if (!broker.tenant(tenant)?.flags.live_connectors) throw new CampusError("connector_disabled", "Live connectors are disabled. A tenant admin can enable them (with consent) in the Admin Console.", 409);
  const consent = store.list("connector_consents", (c) => c.provider === input.provider && !c.revokedAt)[0];
  if (!consent) throw new CampusError("connector_consent", `No ${input.provider} consent recorded for this tenant.`, 409);
  return store.tx(() => {
    const sid = id("ls");
    const joinUrl = `https://live.scholarion.local/${input.provider}/${sid}?t=${hmac(`${tenant}:live`, sid).slice(0, 16)}`;
    const l = store.insert("live_sessions", { id: sid, courseId: input.courseId, sectionId: input.sectionId ?? null, title: input.title, startsAt: new Date(input.startsAt).toISOString(), minutes: input.minutes, provider: input.provider, joinUrl, meetingOwnerId: a.id, recordingRetentionDays: input.recordingRetentionDays ?? 30, recordings: [] }, "ls");
    store.emit("live_sessions.created", `live_sessions/${l.id}`, { id: l.id, courseId: input.courseId });
    notify(store, store.list("enrollments", (e) => e.courseId === input.courseId && e.state === "active" && e.role === "student" && (!input.sectionId || e.sectionId === input.sectionId)).map((e) => e.userId as string), "calendar", `Live session: ${input.title}`, String(input.startsAt), `/campus/{tenant}/courses/${input.courseId}/live`, input.courseId);
    return l;
  });
}

/** Import attendance from the provider: stored as external assertions until a teacher reconciles. */
export function importAttendance(store: TenantStore, a: Actor, sessionId: string, rows: { email: string; minutes: number }[]) {
  const l = store.get("live_sessions", sessionId);
  if (!l) throw new CampusError("not_found", "Session not found", 404);
  requireCourse(store, a, l.courseId as string, ["admin", "instructor", "ta"], "attendance.import");
  return store.tx(() => {
    let n = 0;
    const unmatched: string[] = [];
    for (const r of rows) {
      const u = store.list("users", (x) => x.email === String(r.email).toLowerCase())[0];
      if (!u || !store.list("enrollments", (e) => e.userId === u.id && e.courseId === l.courseId && e.role === "student").length) {
        unmatched.push(r.email);
        continue;
      }
      const ex = store.list("attendance", (x) => x.sessionId === sessionId && x.userId === u.id)[0];
      const status = r.minutes >= Number(l.minutes) * 0.8 ? "present" : r.minutes > 0 ? "partial" : "absent";
      if (ex) store.update("attendance", ex.id, { minutes: r.minutes, status, assertion: true, source: l.provider });
      else store.insert("attendance", { sessionId, userId: u.id, courseId: l.courseId, minutes: r.minutes, status, source: l.provider, assertion: true }, "atn");
      n++;
    }
    audit(store, a, "attendance.import", `live_sessions/${sessionId}`, `${n} rows, ${unmatched.length} unmatched`);
    return { imported: n, unmatched };
  });
}

export function reconcileAttendance(store: TenantStore, a: Actor, recordId: string, status: "present" | "partial" | "absent" | "excused") {
  const r = store.get("attendance", recordId);
  if (!r) throw new CampusError("not_found", "Record not found", 404);
  requireCourse(store, a, r.courseId as string, ["admin", "instructor", "ta"], "attendance.reconcile");
  return store.tx(() => {
    const out = store.update("attendance", recordId, { status, assertion: false, reconciledBy: a.id });
    store.emit("attendance.reconciled", `attendance/${recordId}`, { courseId: r.courseId, userId: r.userId, status });
    return out;
  });
}

/** Mobile roll call: teacher marks attendance directly (not an external assertion). */
export function rollCall(store: TenantStore, a: Actor, sessionId: string, marks: Record<string, "present" | "late" | "absent">) {
  const l = store.get("live_sessions", sessionId);
  if (!l) throw new CampusError("not_found", "Session not found", 404);
  requireCourse(store, a, l.courseId as string, ["admin", "instructor", "ta"], "attendance.roll_call");
  return store.tx(() => {
    for (const [uid, status] of Object.entries(marks)) {
      const ex = store.list("attendance", (x) => x.sessionId === sessionId && x.userId === uid)[0];
      if (ex) store.update("attendance", ex.id, { status, assertion: false, source: "roll_call", reconciledBy: a.id });
      else store.insert("attendance", { sessionId, userId: uid, courseId: l.courseId, minutes: null, status, source: "roll_call", assertion: false, reconciledBy: a.id }, "atn");
    }
    return { marked: Object.keys(marks).length };
  });
}

export { esc };
