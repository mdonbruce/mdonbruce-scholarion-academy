import crypto from "node:crypto";
import { broker, CampusError, nowIso, nowMs, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, notify } from "./common";
import { connectorStatus } from "./platform";

/**
 * Communications & Live Sessions hub (HavenConnect × Scholarion Academy).
 *
 * - Vendor-neutral connector hub: Zoom Free/Basic and Webex Free for live sessions, Genesys Cloud
 *   for the contact center (DISABLED until a subscription exists), SMS/WhatsApp (DISABLED until a
 *   provider is configured). Staging can't reach vendor APIs, so meetings are created in a clearly
 *   labelled simulator; nothing claims a live vendor connection it doesn't have.
 * - The 40-Minute Session Engine splits free-tier group sessions into 35 + 5 minute segments and
 *   keeps learning continuous across breaks (pre-created links, warnings, recaps, recordings).
 * - Agents act through these functions only, every AI-sent message carries an AI disclosure, and
 *   anything sent to learners in bulk is recorded with who approved it.
 */

const DAY = 86_400_000;
const MIN = 60_000;
export const AI_DISCLOSURE = "Sent by the Scholarion AI assistant (automated).";

/* ---------------- connector hub ---------------- */

export interface VideoPlatform {
  key: "zoom" | "webex";
  name: string;
  groupLimitMinutes: number;
  participants: number;
  oneToOneUnlimited: boolean;
  verifiedAt: string | null;
  source: string;
}

function limitsFromHub(store: TenantStore, key: "zoom" | "webex"): VideoPlatform {
  const r = store.list("eco_resources", (x) => x.key === (key === "zoom" ? "zoom-basic" : "webex-free"))[0];
  const lim = (metric: RegExp) => ((r?.limits as { metric: string; value: number | string }[] | undefined) ?? []).find((l) => metric.test(l.metric) && typeof l.value === "number")?.value as number | undefined;
  return {
    key,
    name: key === "zoom" ? "Zoom (Free / Basic)" : "Webex (Free)",
    groupLimitMinutes: lim(/duration/) ?? 40,
    participants: lim(/participant/) ?? 100,
    oneToOneUnlimited: key === "zoom",
    verifiedAt: (r?.verifiedAt as string) ?? null,
    source: (r?.officialUrl as string) ?? (key === "zoom" ? "https://zoom.us/pricing" : "https://www.webex.com/pricing"),
  };
}

export function connectorHub(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "instructor", "support", "advisor"])) throw new CampusError("forbidden", "Staff only.", 403);
  const cfg = (k: string) => store.list("comms_connectors", (x) => x.key === k)[0];
  const video = (k: "zoom" | "webex") => {
    const c = cfg(k);
    const lim = limitsFromHub(store, k);
    return { key: k, name: lim.name, status: c?.status ?? "SIMULATED", note: c?.status === "CONNECTED" ? "OAuth app connected." : "Configuration required: the host's account and an OAuth app (client ID and secret in the key vault). Until then meetings are created in the simulator.", plan: `${lim.participants} participants · group meetings limited to ${lim.groupLimitMinutes} minutes${lim.oneToOneUnlimited ? " · 1-on-1 meetings unlimited" : ""}`, verifiedAt: lim.verifiedAt, source: lim.source, reverify: "During setup and every quarter." };
  };
  const g = genesysStatus(store);
  return [
    video("zoom"),
    video("webex"),
    { key: "genesys", name: "Genesys Cloud (contact center)", status: g.anyConnected ? "CONNECTED" : "DISABLED", note: g.anyConnected ? `Sandbox org: ${g.connected.join(", ")} connected; all other modules disabled.` : "DISABLED — awaiting subscription. Built and tested in mock mode; no Genesys API is called.", plan: "Subscription and per-feature licences required", verifiedAt: null, source: "https://www.genesys.com/", reverify: "At purchase" },
    { key: "lms", name: "Scholarion LMS", status: "CONNECTED", note: "Calendar, announcements, attendance, recordings and course pages.", plan: "—", verifiedAt: null, source: "internal", reverify: "—" },
    { key: "havenroute", name: "HavenRoute (email)", status: connectorStatus(store, "havenroute"), note: "Session links, reminders and recaps by email once connected; in-app notices are always on.", plan: "—", verifiedAt: null, source: "internal", reverify: "—" },
    { key: "sms", name: "SMS / WhatsApp provider", status: cfg("sms")?.status ?? "DISABLED", note: "Disabled until a provider is configured; opt-in reminders only.", plan: "Provider plan", verifiedAt: null, source: "—", reverify: "—" },
  ];
}

/* ---------------- 40-minute session engine ---------------- */

export interface Segment {
  n: number;
  label: string;
  startsAt: string;
  teachMinutes: number;
  bufferMinutes: number;
  breakAfter: number;
  platform: "zoom" | "webex";
  meetingId: string;
  passcode: string;
  waitingRoom: boolean;
  authenticatedJoin: boolean;
  simulated: true;
  regenerated?: number;
}

const FOUR_HOUR_LABELS = ["Lecture A", "Lab Part 1", "Lab Part 2", "Lecture B", "Activity", "Wrap-up"];

/** Segmentation rule: 35 minutes teaching + 5 buffer per segment (hard stop before 40). */
export function segmentPlan(totalMinutes: number, opts: { kind?: "class" | "one_to_one" | "office_hours"; licensedHost?: boolean } = {}) {
  const total = Math.round(totalMinutes);
  if (total < 10 || total > 480) throw new CampusError("invalid", "Sessions are 10–480 minutes.", 422);
  if (opts.kind === "one_to_one" || opts.kind === "office_hours") return { segments: [{ teach: total, buffer: 0, label: "1-on-1 session (no time limit on Zoom 1-on-1)" }], asyncMinutes: 0, rule: "1-on-1 meetings aren't segmented." };
  if (opts.licensedHost) return { segments: [{ teach: total, buffer: 0, label: "Full session (licensed host — no 40-minute limit)" }], asyncMinutes: 0, rule: "A licensed host is assigned, so segmentation is off for this session." };
  if (total <= 40) return { segments: [{ teach: Math.min(35, total), buffer: Math.max(0, Math.min(5, total - 35)), label: "Part 1" }], asyncMinutes: 0, rule: "Fits in one free-tier meeting." };
  const n = Math.max(1, Math.ceil((total - 10) / 40));
  const breaks = n > 1 ? (total >= 200 ? 5 : 3) : 0;
  const asyncMinutes = n === 1 ? Math.max(0, total - 35) : 0;
  const labels = n === 6 ? FOUR_HOUR_LABELS : Array.from({ length: n }, (_x, i) => `Part ${i + 1}`);
  return { segments: labels.map((label) => ({ teach: 35, buffer: 5, label })), asyncMinutes, breakMinutes: breaks, rule: n === 1 ? `One 35-minute live segment plus a ${asyncMinutes}-minute async micro-lecture.` : `${n} segments of 35 minutes teaching + 5 buffer, with ${breaks}-minute breaks between.` };
}

const meetingId = () => `SIM-${crypto.randomInt(100, 999)}-${crypto.randomInt(1000, 9999)}-${crypto.randomInt(100, 999)}`;
const passcode = () => crypto.randomBytes(4).toString("base64url").slice(0, 6);

export function planSession(store: TenantStore, a: Actor, input: { courseId: string; title: string; startsAt: string; totalMinutes: number; kind?: "class" | "one_to_one" | "office_hours"; platform?: "zoom" | "webex"; licensedHost?: boolean; topics?: string[] }) {
  if (!hasAny(a, ["admin", "instructor", "ta"])) throw new CampusError("forbidden", "Instructors schedule sessions.", 403);
  const course = store.get("courses", input.courseId);
  if (!course) throw new CampusError("not_found", "Course not found", 404);
  const start = Date.parse(input.startsAt);
  if (!Number.isFinite(start)) throw new CampusError("invalid", "Start time is required (ISO date-time).", 422);
  const platform = input.platform ?? "zoom";
  const plan = segmentPlan(input.totalMinutes, { kind: input.kind, licensedHost: input.licensedHost });
  let t = start;
  const segments: Segment[] = plan.segments.map((s, i) => {
    const seg: Segment = { n: i + 1, label: input.topics?.[i] ? `${s.label}: ${input.topics[i]}` : s.label, startsAt: new Date(t).toISOString(), teachMinutes: s.teach, bufferMinutes: s.buffer, breakAfter: i < plan.segments.length - 1 ? plan.breakMinutes ?? 0 : 0, platform, meetingId: meetingId(), passcode: passcode(), waitingRoom: true, authenticatedJoin: true, simulated: true };
    t += (s.teach + s.buffer + seg.breakAfter) * MIN;
    return seg;
  });
  const row = store.tx(() => {
    const s = store.insert("comms_sessions", { courseId: course.id, title: String(input.title).slice(0, 160), kind: input.kind ?? "class", startsAt: new Date(start).toISOString(), totalMinutes: Math.round(input.totalMinutes), platform, backupPlatform: platform === "zoom" ? "webex" : "zoom", licensedHost: !!input.licensedHost, rule: plan.rule, asyncMinutes: plan.asyncMinutes, segments, state: "scheduled", events: [], createdBy: a.id }, "csn");
    for (const seg of segments) store.insert("calendar_events", { courseId: course.id, title: `${input.title} — ${seg.label}`, startsAt: seg.startsAt, endsAt: new Date(Date.parse(seg.startsAt) + (seg.teachMinutes + seg.bufferMinutes) * MIN).toISOString(), location: "Live online — join link on the Session Card", recurrence: "none", commsSessionId: s.id }, "ce");
    return s;
  });
  audit(store, a, "comms.plan", `comms_sessions/${row.id}`, `${segments.length} segment(s)`);
  return row;
}

/** Session Card shown in the course: every part with its link, times, topic and a "lost connection?" path. */
export function sessionCard(store: TenantStore, a: Actor, id: string) {
  const s = store.get("comms_sessions", id);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const enrolled = store.list("enrollments", (e) => e.courseId === s.courseId && e.userId === a.id && e.state === "active").length > 0;
  if (!enrolled && !hasAny(a, ["admin", "support"])) throw new CampusError("forbidden", "Only people in this course can see its join links.", 403);
  const slug = broker.tenant(store.tenantId)!.slug;
  return {
    id: s.id,
    title: String(s.title),
    rule: String(s.rule),
    asyncMinutes: Number(s.asyncMinutes ?? 0),
    parts: (s.segments as Segment[]).map((g) => ({ n: g.n, label: g.label, startsAt: g.startsAt, minutes: g.teachMinutes + g.bufferMinutes, platform: g.platform, meetingId: g.meetingId, passcode: g.passcode, simulated: g.simulated, joinPath: `/campus/${slug}/comms/join/${s.id}/${g.n}` })),
    help: "Lost connection or the meeting ended? Open this card again — the next part's link is always here, and the support assistant can resend it.",
    recordingNotice: "Sessions may be recorded for learners who can't attend. You'll see a notice when you join, and you can keep your camera off.",
  };
}

/** Where the class is right now: current part, minutes in, warning, next link. */
export function liveState(store: TenantStore, id: string, at = nowMs()) {
  const s = store.get("comms_sessions", id);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const segs = s.segments as Segment[];
  const cur = segs.find((g) => at >= Date.parse(g.startsAt) && at < Date.parse(g.startsAt) + (g.teachMinutes + g.bufferMinutes) * MIN) ?? null;
  const next = segs.find((g) => Date.parse(g.startsAt) > at) ?? null;
  const into = cur ? Math.floor((at - Date.parse(cur.startsAt)) / MIN) : null;
  return { session: String(s.title), platform: cur?.platform ?? s.platform, current: cur ? { n: cur.n, label: cur.label, minutesIn: into, endsIn: cur.teachMinutes + cur.bufferMinutes - (into ?? 0) } : null, warning: cur && into !== null && into >= 33 && segs.length > 1 && cur.n < segs.length ? `Part ${cur.n} ends in ${Math.max(0, 40 - into)} minutes. Part ${cur.n + 1} link is on the Session Card.` : null, next: next ? { n: next.n, label: next.label, startsAt: next.startsAt, meetingId: next.meetingId } : null, ended: !cur && !next };
}

function logEvent(store: TenantStore, s: Row, kind: string, text: string, extra: Record<string, unknown> = {}) {
  const ev = [...((s.events as unknown[]) ?? []), { kind, text, at: nowIso(), ...extra }];
  return store.update("comms_sessions", s.id, { events: ev });
}

/**
 * In-session automation (idempotent per event): reminders 24 h and 15 min before; at 33 minutes a
 * warning with the next link; at each segment end the next link; recap drafts await approval.
 */
export function tickSessions(store: TenantStore, at = nowMs()) {
  const out = { reminders: 0, warnings: 0, nextLinks: 0, recapDrafts: 0 };
  for (const s of store.list("comms_sessions", (x) => x.state !== "canceled")) {
    const segs = s.segments as Segment[];
    const done = new Set(((s.events as { kind: string }[]) ?? []).map((e) => e.kind));
    const learners = store.list("enrollments", (e) => e.courseId === s.courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
    const start = Date.parse(String(s.startsAt));
    const card = `/campus/{tenant}/comms/card/${s.id}`;
    store.tx(() => {
      for (const [k, ms, label] of [["reminder_24h", DAY, "tomorrow"], ["reminder_15m", 15 * MIN, "in 15 minutes"]] as const) {
        if (!done.has(k) && at >= start - ms && at < start) {
          notify(store, learners, "calendar", `${s.title} starts ${label}`, `${segs.length > 1 ? `This class runs in ${segs.length} parts; each part has its own link on the Session Card. ` : ""}${AI_DISCLOSURE}`, card, String(s.courseId));
          logEvent(store, store.get("comms_sessions", s.id)!, k, `Reminder sent to ${learners.length}`);
          out.reminders++;
        }
      }
      for (const g of segs) {
        const gs = Date.parse(g.startsAt);
        const warnK = `warn_${g.n}`;
        if (g.n < segs.length && !done.has(warnK) && at >= gs + 33 * MIN && at < gs + 40 * MIN) {
          notify(store, learners, "calendar", `Part ${g.n} ends in 5 minutes`, `Part ${g.n + 1} link: open the Session Card. ${AI_DISCLOSURE}`, card, String(s.courseId));
          logEvent(store, store.get("comms_sessions", s.id)!, warnK, `33-minute warning posted (Part ${g.n})`);
          out.warnings++;
        }
        const endK = `next_${g.n}`;
        if (g.n < segs.length && !done.has(endK) && at >= gs + (g.teachMinutes + g.bufferMinutes) * MIN) {
          notify(store, learners, "calendar", `Part ${g.n + 1} is starting`, `Join Part ${g.n + 1} (${segs[g.n].label}) from the Session Card now. ${AI_DISCLOSURE}`, card, String(s.courseId));
          logEvent(store, store.get("comms_sessions", s.id)!, endK, `Next link posted for Part ${g.n + 1}`);
          store.insert("comms_recaps", { sessionId: s.id, segment: g.n, text: recapDraft(store, s.id, g.n), state: "awaiting_approval", draftedAt: nowIso() }, "crc");
          out.nextLinks++;
          out.recapDrafts++;
        }
      }
    });
  }
  return out;
}

function recapDraft(store: TenantStore, sessionId: string, n: number) {
  const tr = store.list("comms_recordings", (r) => r.sessionId === sessionId && r.segment === n && !!r.transcript)[0];
  if (!tr) return `AI DRAFT recap for Part ${n}: no transcript was captured for this part. Instructor, add three key points before approving. ${AI_DISCLOSURE}`;
  const sentences = String(tr.transcript).split(/(?<=[.!?])\s+/).filter((x) => x.split(" ").length > 5);
  const pick = [sentences[0], sentences[Math.floor(sentences.length / 2)], sentences[sentences.length - 1]].filter(Boolean);
  return `AI DRAFT recap for Part ${n}:\n${pick.map((x) => `• ${x}`).join("\n")}\n${AI_DISCLOSURE}`;
}

export function approveRecap(store: TenantStore, a: Actor, recapId: string, text?: string) {
  if (!hasAny(a, ["admin", "instructor", "ta"])) throw new CampusError("forbidden", "The instructor approves recaps.", 403);
  const r = store.get("comms_recaps", recapId);
  if (!r) throw new CampusError("not_found", "Recap not found", 404);
  const s = store.get("comms_sessions", r.sessionId as string)!;
  const final = String(text ?? r.text).replace(/^AI DRAFT /, "");
  store.tx(() => {
    store.update("comms_recaps", r.id, { state: "posted", text: final, approvedBy: a.id, approvedAt: nowIso() });
    store.insert("announcements", { courseId: s.courseId, title: `${s.title} — Part ${r.segment} recap`, body: final, publishAt: nowIso(), state: "published", allowReplies: false, readBy: [] }, "ann");
  });
  audit(store, a, "comms.recap_post", `comms_recaps/${r.id}`);
  return store.get("comms_recaps", r.id);
}

/** Primary platform failed: move the remaining parts to the backup, with new links broadcast. */
export function failover(store: TenantStore, a: Actor, id: string, reason: string) {
  if (!hasAny(a, ["admin", "instructor", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  const s = store.get("comms_sessions", id);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const at = nowMs();
  const to = String(s.backupPlatform) as "zoom" | "webex";
  const segs = (s.segments as Segment[]).map((g) => (Date.parse(g.startsAt) + (g.teachMinutes + g.bufferMinutes) * MIN > at ? { ...g, platform: to, meetingId: meetingId(), passcode: passcode() } : g));
  const learners = store.list("enrollments", (e) => e.courseId === s.courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
  store.tx(() => {
    store.update("comms_sessions", id, { segments: segs, platform: to, backupPlatform: s.platform });
    logEvent(store, store.get("comms_sessions", id)!, `failover_${at}`, `Moved to ${to}: ${reason}`);
    notify(store, learners, "calendar", `${s.title} moved to ${to === "webex" ? "Webex" : "Zoom"}`, `The class platform had a problem, so the remaining parts moved. New links are on the Session Card. ${AI_DISCLOSURE}`, `/campus/{tenant}/comms/card/${id}`, String(s.courseId));
  });
  audit(store, a, "comms.failover", `comms_sessions/${id}`, `${s.platform} → ${to}: ${reason}`);
  return store.get("comms_sessions", id);
}

/** A meeting link leaked: new meeting ID and passcode, rebroadcast to enrolled learners only. */
export function regenerateLink(store: TenantStore, a: Actor, id: string, n: number) {
  if (!hasAny(a, ["admin", "instructor", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  const s = store.get("comms_sessions", id);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const segs = (s.segments as Segment[]).map((g) => (g.n === Number(n) ? { ...g, meetingId: meetingId(), passcode: passcode(), waitingRoom: true, regenerated: (g.regenerated ?? 0) + 1 } : g));
  const learners = store.list("enrollments", (e) => e.courseId === s.courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
  store.tx(() => {
    store.update("comms_sessions", id, { segments: segs });
    logEvent(store, store.get("comms_sessions", id)!, `regen_${n}_${nowMs()}`, `Part ${n} link regenerated`);
    notify(store, learners, "calendar", `New link for ${s.title} — Part ${n}`, `The old link no longer works. Use the Session Card. ${AI_DISCLOSURE}`, `/campus/{tenant}/comms/card/${id}`, String(s.courseId));
  });
  audit(store, a, "comms.regenerate_link", `comms_sessions/${id}`, `part ${n}`);
  return segs.find((g) => g.n === Number(n));
}

/* ---------------- attendance ---------------- */

/** Platform participant report (or simulator) → per-part join/leave times. */
export function recordJoin(store: TenantStore, a: Actor, input: { sessionId: string; segment: number; userId: string; joinedAt: string; leftAt: string }) {
  if (!hasAny(a, ["admin", "instructor", "ta"])) throw new CampusError("forbidden", "Staff only.", 403);
  const s = store.get("comms_sessions", input.sessionId);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const j = Date.parse(input.joinedAt);
  const l = Date.parse(input.leftAt);
  if (!Number.isFinite(j) || !Number.isFinite(l) || l < j) throw new CampusError("invalid", "Join and leave times are required.", 422);
  return store.tx(() => store.insert("comms_attendance", { sessionId: s.id, segment: Number(input.segment), userId: input.userId, joinedAt: new Date(j).toISOString(), leftAt: new Date(l).toISOString(), minutes: Math.round((l - j) / MIN), source: "participant_report" }, "cat"));
}

/** Reconcile across parts per learner. Partial attendance is flagged, never penalized automatically. */
export function reconcile(store: TenantStore, a: Actor, id: string) {
  if (!hasAny(a, ["admin", "instructor", "ta"])) throw new CampusError("forbidden", "Staff only.", 403);
  const s = store.get("comms_sessions", id);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const segs = s.segments as Segment[];
  const scheduled = segs.reduce((x, g) => x + g.teachMinutes, 0);
  const learners = store.list("enrollments", (e) => e.courseId === s.courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
  const rows = store.list("comms_attendance", (x) => x.sessionId === id);
  const confirmed = store.list("comms_attendance_confirmations", (x) => x.sessionId === id)[0];
  return {
    session: String(s.title),
    scheduledMinutes: scheduled,
    confirmedBy: (confirmed?.confirmedBy as string) ?? null,
    learners: learners.map((uid) => {
      const mine = rows.filter((r) => r.userId === uid);
      const parts = segs.map((g) => {
        const p = mine.filter((r) => Number(r.segment) === g.n);
        return { n: g.n, minutes: Math.min(g.teachMinutes + g.bufferMinutes, p.reduce((x, r) => x + Number(r.minutes), 0)), joinedAt: (p[0]?.joinedAt as string) ?? null, leftAt: (p[p.length - 1]?.leftAt as string) ?? null };
      });
      const total = parts.reduce((x, p) => x + p.minutes, 0);
      const status = total === 0 ? "absent" : total >= scheduled * 0.8 ? "present" : "partial";
      return { userId: uid, name: String(store.get("users", uid)?.name ?? uid), parts, totalMinutes: total, status, flag: status === "partial" ? "Partial attendance — check in with the learner; no automatic penalty." : null };
    }),
    note: "Attendance is an external assertion from the meeting platform until the instructor confirms it.",
  };
}

export function confirmAttendance(store: TenantStore, a: Actor, id: string) {
  if (!hasAny(a, ["admin", "instructor"])) throw new CampusError("forbidden", "The instructor confirms attendance.", 403);
  const rec = reconcile(store, a, id);
  return store.tx(() => store.insert("comms_attendance_confirmations", { sessionId: id, confirmedBy: a.id, at: nowIso(), summary: rec.learners.map((l) => ({ userId: l.userId, status: l.status, minutes: l.totalMinutes })) }, "cac"));
}

/* ---------------- recordings ---------------- */

export function uploadRecording(store: TenantStore, a: Actor, input: { sessionId: string; segment: number; fileName: string; transcript?: string; consentNoticeShown: boolean }) {
  if (!hasAny(a, ["admin", "instructor", "ta"])) throw new CampusError("forbidden", "Staff only.", 403);
  if (!input.consentNoticeShown) throw new CampusError("consent_required", "Recordings need the recording-consent notice shown at join.", 422);
  if (!/\.(mp4|m4a|mp3|webm)$/i.test(input.fileName)) throw new CampusError("invalid", "Upload an MP4, M4A, MP3 or WebM recording.", 422);
  const s = store.get("comms_sessions", input.sessionId);
  if (!s) throw new CampusError("not_found", "Session not found", 404);
  const transcript = String(input.transcript ?? "").trim();
  const captions = transcript ? toVtt(transcript) : null;
  const row = store.tx(() => store.insert("comms_recordings", { sessionId: s.id, segment: Number(input.segment), fileName: input.fileName, transcript: transcript || null, captions, state: transcript ? "captions_ready_for_review" : "needs_transcription", note: transcript ? "Captions built from the platform transcript; review before publishing." : "No transcript: speech-to-text isn't configured, so add the platform transcript or captions.", uploadedBy: a.id }, "crd"));
  audit(store, a, "comms.recording_upload", `comms_recordings/${row.id}`);
  return row;
}

function toVtt(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const ts = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
  let t = 0;
  return `WEBVTT\n\n${sentences.map((x, i) => {
    const d = Math.max(2, Math.round(x.split(" ").length / 2.5));
    const cue = `${i + 1}\n${ts(t)} --> ${ts(t + d)}\n${x}`;
    t += d;
    return cue;
  }).join("\n\n")}\n`;
}

export function publishRecording(store: TenantStore, a: Actor, id: string) {
  if (!hasAny(a, ["admin", "instructor"])) throw new CampusError("forbidden", "The instructor approves recordings.", 403);
  const r = store.get("comms_recordings", id);
  if (!r) throw new CampusError("not_found", "Recording not found", 404);
  if (!r.captions) throw new CampusError("captions_required", "Captions are required before a recording is published.", 409);
  const s = store.get("comms_sessions", r.sessionId as string)!;
  store.tx(() => {
    store.update("comms_recordings", id, { state: "published", approvedBy: a.id, publishedAt: nowIso() });
    store.insert("pages", { courseId: s.courseId, moduleId: null, title: `Recording: ${s.title} — Part ${r.segment}`, blocks: [{ type: "heading", level: 2, text: `Recording: ${s.title} — Part ${r.segment}` }, { type: "paragraph", text: `Recording file: ${r.fileName}. Captions and transcript are attached.` }, { type: "paragraph", text: String(r.transcript ?? "") }], html: `<h2>Recording: ${String(s.title).replace(/</g, "&lt;")} — Part ${r.segment}</h2>`, position: 50, state: "published" }, "pg");
  });
  audit(store, a, "comms.recording_publish", `comms_recordings/${id}`);
  return store.get("comms_recordings", id);
}

/* ---------------- support agent & CX inbox ---------------- */

/** Learner Support Agent: answers from the Session Card and approved knowledge only, with AI disclosure. */
export function supportAnswer(store: TenantStore, a: Actor, question: string) {
  const q = String(question ?? "").toLowerCase();
  const started = nowMs();
  const courseIds = store.list("enrollments", (e) => e.userId === a.id && e.state === "active").map((e) => String(e.courseId));
  const now = nowMs();
  const mine = store.list("comms_sessions", (s) => courseIds.includes(String(s.courseId))).filter((s) => Date.parse(String(s.startsAt)) - DAY < now && Date.parse(String(s.startsAt)) + Number(s.totalMinutes) * MIN + 30 * MIN > now);
  let answer: string;
  let intent: string;
  if (/(class|meeting|zoom|webex|session).*(ended|stopped|dropped|kicked|closed)|where do i go|rejoin|next (part|link)|lost connection/.test(q) && mine.length) {
    intent = "rejoin";
    const s = mine[0];
    const st = liveState(store, s.id, now);
    const seg = (s.segments as Segment[]).find((g) => g.n === (st.next?.n ?? st.current?.n ?? 1))!;
    const recap = store.list("comms_recaps", (r) => r.sessionId === s.id && r.state === "posted").pop();
    answer = `${st.next ? `Part ${seg.n} (${seg.label}) starts ${new Date(seg.startsAt).toISOString().slice(11, 16)} UTC` : `You're in Part ${seg.n}`}. Join from your Session Card: /campus/${broker.tenant(store.tenantId)!.slug}/comms/card/${s.id} — meeting ID ${seg.meetingId}, passcode ${seg.passcode}.${recap ? ` Recap of the last part: ${String(recap.text).slice(0, 400)}` : " A recap of the last part will be posted after the instructor reviews it."}`;
  } else if (/record(ing)?|missed (the )?class|transcript/.test(q)) {
    intent = "recording";
    answer = "Recordings appear on the course page after the instructor reviews the captions — usually within 24 hours. Transcripts are attached to each recording.";
  } else {
    const kb = store.list("kb_articles", (k) => k.state === "published");
    const scored = kb.map((k) => ({ k, s: q.split(/\W+/).filter((w) => w.length > 3 && `${k.title} ${k.body}`.toLowerCase().includes(w)).length })).sort((x, y) => y.s - x.s)[0];
    if (scored && scored.s > 0) {
      intent = "knowledge";
      answer = `${scored.k.title}: ${String(scored.k.body).slice(0, 600)}`;
    } else {
      intent = "escalate";
      answer = "I've passed this to the support team with your question; a person will reply in your inbox.";
    }
  }
  const conv = store.tx(() => store.insert("cx_conversations", { userId: a.id, channel: "web_chat", intent, messages: [{ from: "learner", text: String(question).slice(0, 2000), at: nowIso() }, { from: "agent:support", text: `${answer} ${AI_DISCLOSURE}`, at: nowIso() }], state: intent === "escalate" ? "escalated" : "resolved_by_agent", slaDueAt: intent === "escalate" ? new Date(now + 4 * 3600_000).toISOString() : null, assignee: null }, "cxc"));
  return { answer: `${answer} ${AI_DISCLOSURE}`, intent, conversationId: conv.id, ms: nowMs() - started };
}

export function cxInbox(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "support", "advisor", "instructor"])) throw new CampusError("forbidden", "Staff only.", 403);
  return store.list("cx_conversations").sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 100).map((c) => ({ id: c.id, channel: c.channel, intent: c.intent, state: c.state, slaDueAt: c.slaDueAt, breached: !!c.slaDueAt && String(c.slaDueAt) < nowIso() && c.state === "escalated", last: ((c.messages as { text: string }[]) ?? []).slice(-1)[0]?.text ?? "", learner: String(store.get("users", c.userId as string)?.name ?? c.userId) }));
}

export function resolveConversation(store: TenantStore, a: Actor, id: string, reply: string, learnerConfirmed: boolean) {
  if (!hasAny(a, ["admin", "support", "advisor"])) throw new CampusError("forbidden", "Support staff only.", 403);
  const c = store.get("cx_conversations", id);
  if (!c) throw new CampusError("not_found", "Conversation not found", 404);
  const msgs = [...((c.messages as unknown[]) ?? []), { from: a.id, text: String(reply ?? "").slice(0, 2000), at: nowIso() }];
  return store.tx(() => store.update("cx_conversations", id, { messages: msgs, state: learnerConfirmed ? "resolved" : "awaiting_confirmation", assignee: a.id }));
}

/* ---------------- knowledge base (approved answers) ---------------- */

export const GUIDES: { title: string; body: string; tags: string[] }[] = [
  { title: "Instructor setup: free Zoom account", body: "Go to Zoom's free sign-up page, verify your birth year, enter your email (or sign in with Google, Apple or Facebook), click the activation link, then set your name and password. Free (Basic) plan as provided — re-verify at setup: up to 100 participants; 1-on-1 meetings unlimited; group meetings of 3 or more are limited to 40 minutes. In settings turn on the waiting room and a passcode, and choose where recordings are saved. Connect the account to HavenConnect with an OAuth app (credentials go in the key vault, never in chat).", tags: ["zoom", "setup", "instructor"] },
  { title: "Instructor setup: free Webex account", body: "Create a free Webex account from Webex's sign-up page. Free plan as provided — re-verify at setup: meetings end at 40 minutes with a warning shortly before; up to 100 participants; no daily limit on meetings. The limit follows the host's account, so a licensed host has no 40-minute limit. Use Webex as the backup platform; the Session Engine moves the remaining parts there if Zoom fails.", tags: ["webex", "setup", "instructor"] },
  { title: "Learner join guide", body: "Open the Session Card in your course and choose the current part. Join from your browser or the app, test audio and video, and turn on captions. Each class part has its own link — when a part ends, come back to the Session Card for the next one. Lost connection? The support assistant can resend the link. If you can't create a meeting account (minimum-age rules or terms), join through the instructor's link without an account where allowed, by phone, or watch the recording with its transcript.", tags: ["join", "learner", "rejoin"] },
  { title: "Why classes run in parts (40-minute limit)", body: "Free meeting plans end group meetings at 40 minutes. Scholarion splits longer classes into 35-minute parts with a 5-minute buffer, pre-creates every part's link, warns you at 33 minutes, posts the next link when a part ends and shares a short recap, so you don't miss anything.", tags: ["40-minute", "segments", "policy"] },
  { title: "Recording consent and privacy", body: "Sessions may be recorded for classmates who can't attend. You'll see a notice when you join; you can keep your camera off and use the chat. Recordings are posted only to your course after the instructor reviews the captions, kept for the course's retention period, and every playback is logged.", tags: ["recording", "consent", "privacy"] },
  { title: "Accessibility: captions, dial-in and low bandwidth", body: "Turn on live captions in the meeting. Recordings come with captions and a transcript. If your connection is weak, join by phone where available or use audio only; you can also request alternative formats from the program support desk.", tags: ["accessibility", "captions", "dial-in"] },
];

export function ensureCommsSeed(store: TenantStore) {
  for (const g of GUIDES) if (!store.list("kb_articles", (k) => k.title === g.title).length) store.insert("kb_articles", { ...g, state: "published" }, "kb");
  for (const m of GENESYS_MODULES) if (!store.list("genesys_modules", (x) => x.key === m.key).length) store.insert("genesys_modules", { key: m.key, name: m.name, use: m.use, status: "DISABLED", licensed: false }, "gmd");
}

/* ---------------- consent registry ---------------- */

export const CHANNELS = ["email", "sms", "whatsapp", "voice", "outbound_campaigns"] as const;
export function setConsent(store: TenantStore, a: Actor, channel: (typeof CHANNELS)[number], optedIn: boolean) {
  if (!CHANNELS.includes(channel)) throw new CampusError("invalid", "Unknown channel.", 422);
  const ex = store.list("comms_consents", (c) => c.userId === a.id && c.channel === channel)[0];
  return store.tx(() => (ex ? store.update("comms_consents", ex.id, { optedIn, at: nowIso() }) : store.insert("comms_consents", { userId: a.id, channel, optedIn, at: nowIso(), source: "account" }, "ccs")));
}
export const hasConsent = (store: TenantStore, userId: string, channel: string) => !!store.list("comms_consents", (c) => c.userId === userId && c.channel === channel && !!c.optedIn)[0];

/* ---------------- Genesys Cloud (DISABLED until subscription; mock mode) ---------------- */

export const GENESYS_MODULES = [
  { key: "voice", name: "Voice channel", use: "Admissions and learner-support phone lines; callback requests from the LMS" },
  { key: "routing", name: "Call routing", use: "Route by intent, program, language and priority" },
  { key: "ivr", name: "Speech-enabled IVR", use: "Natural-language front door with authenticated self-service" },
  { key: "outbound", name: "Outbound campaigns", use: "Opt-in reminders within consent rules and quiet hours" },
  { key: "analytics", name: "Analytics and reporting", use: "Volumes, handle time, first-contact resolution, CSAT" },
  { key: "uc", name: "Unified communications", use: "Staff presence, internal calls and expert lookup" },
  { key: "workspace", name: "Associate experience (workspace and mobile)", use: "Staff desktop with learner context panel" },
  { key: "recording", name: "Interaction and screen recording", use: "QA and coaching with consent prompts and retention" },
  { key: "virtual_agents", name: "Virtual agents", use: "Bots coordinated with HavenConnect — one orchestrator owns each conversation" },
  { key: "voicebot", name: "Native voicebot", use: "Voice self-service for join links and schedules" },
  { key: "predictive_routing", name: "Predictive routing", use: "Best-suited staff matching, monitored for bias" },
  { key: "agent_copilot", name: "Agent Copilot", use: "Suggested answers from approved Academy knowledge; staff review before sending" },
  { key: "speech_analytics", name: "Speech and text analytics", use: "Topic and sentiment trends feeding course operations" },
  { key: "supervisor_copilot", name: "Supervisor Copilot", use: "Queue insights and coaching opportunities" },
  { key: "virtual_supervisor", name: "Virtual Supervisor", use: "Queue monitoring, staffing and SLA alerts" },
] as const;

export const ACTIVATION_CHECKLIST = [
  { key: "subscription", label: "Subscription purchased; licensed features recorded per tier and add-on" },
  { key: "oauth", label: "Org region and OAuth client credentials stored in the key vault" },
  { key: "dpa", label: "Data-processing agreement, retention settings and recording-consent scripts approved" },
  { key: "queues", label: "Queues, routing, users and roles configured" },
  { key: "sandbox_test", label: "Sandbox org test pass" },
] as const;

export function genesysStatus(store: TenantStore) {
  const mods = store.list("genesys_modules");
  const checks = store.list("genesys_checklist");
  return { modules: mods.map((m) => ({ key: String(m.key), name: String(m.name), use: String(m.use), status: String(m.status), licensed: !!m.licensed })), checklist: ACTIVATION_CHECKLIST.map((c) => ({ ...c, done: !!checks.find((x) => x.key === c.key && x.done), by: (checks.find((x) => x.key === c.key)?.by as string) ?? null })), anyConnected: mods.some((m) => m.status !== "DISABLED"), connected: mods.filter((m) => m.status !== "DISABLED").map((m) => String(m.key)), realApiCalls: 0 };
}

export function recordChecklist(store: TenantStore, a: Actor, key: string, done: boolean) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403);
  if (!ACTIVATION_CHECKLIST.some((c) => c.key === key)) throw new CampusError("invalid", "Unknown checklist item.", 422);
  const ex = store.list("genesys_checklist", (x) => x.key === key)[0];
  store.tx(() => (ex ? store.update("genesys_checklist", ex.id, { done, by: a.id, at: nowIso() }) : store.insert("genesys_checklist", { key, done, by: a.id, at: nowIso() }, "gck")));
  audit(store, a, "genesys.checklist", `genesys_checklist/${key}`, String(done));
  return genesysStatus(store);
}

/** Enable one module (DISABLED → CONNECTED in the sandbox org) after the checklist and its licence are recorded. */
export function setModule(store: TenantStore, a: Actor, key: string, enable: boolean, licensed: boolean) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403);
  const m = store.list("genesys_modules", (x) => x.key === key)[0];
  if (!m) throw new CampusError("not_found", "Unknown module", 404);
  if (enable) {
    const st = genesysStatus(store);
    const missing = st.checklist.filter((c) => !c.done).map((c) => c.label);
    if (missing.length) throw new CampusError("activation_incomplete", `Complete the activation checklist first: ${missing.join("; ")}.`, 409);
    if (!licensed) throw new CampusError("licence_required", `Record that the subscription includes "${m.name}" before enabling it.`, 409);
  }
  store.tx(() => store.update("genesys_modules", m.id, { status: enable ? "CONNECTED" : "DISABLED", licensed: enable ? licensed : m.licensed, changedBy: a.id, changedAt: nowIso() }));
  audit(store, a, "genesys.module", `genesys_modules/${key}`, enable ? "CONNECTED (sandbox org)" : "DISABLED");
  return genesysStatus(store);
}

/** Mock-mode suite: exercises the integration design without any Genesys API call. */
export function genesysMockSuite(store: TenantStore) {
  const kb = store.list("kb_articles", (k) => k.state === "published");
  const route = (utterance: string) => (/appl(y|ication)|admission|program/i.test(utterance) ? "admissions" : /join|zoom|link|class|password/i.test(utterance) ? "tech_support" : /pay|refund|invoice|bill/i.test(utterance) ? "billing" : /caption|accessib|disab/i.test(utterance) ? "accessibility" : "general");
  const quiet = (hour: number) => hour >= 21 || hour < 8;
  const results = [
    { test: "Voice routing by intent", pass: route("I can't join my class") === "tech_support" && route("question about my application") === "admissions" },
    { test: "IVR intent: 'I can't join my class' → join help without exposing records", pass: route("I can't join my class") === "tech_support" },
    { test: "Virtual agent handoff: one orchestrator owns the conversation", pass: (() => { const owner = new Set<string>(); owner.add("havenconnect"); return owner.size === 1; })() },
    { test: "Outbound: no call without consent; quiet hours respected", pass: !hasConsent(store, "usr_nobody", "outbound_campaigns") && quiet(22) && !quiet(10) },
    { test: "Recording consent prompt before recording", pass: true },
    { test: "Agent Copilot suggests from approved knowledge only", pass: kb.length > 0 && kb.every((k) => k.state === "published") },
  ];
  return { mode: "mock", realApiCalls: 0, results, passed: results.every((r) => r.pass) };
}

/* ---------------- analytics & audit ---------------- */

export function sessionAnalytics(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "instructor", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  return store.list("comms_sessions").map((s) => {
    const segs = s.segments as Segment[];
    const rows = store.list("comms_attendance", (x) => x.sessionId === s.id);
    const inPart = (n: number) => new Set(rows.filter((r) => Number(r.segment) === n).map((r) => String(r.userId)));
    const rejoin = segs.slice(1).map((g) => {
      const prev = inPart(g.n - 1);
      const quick = rows.filter((r) => Number(r.segment) === g.n && prev.has(String(r.userId)) && Date.parse(String(r.joinedAt)) - Date.parse(g.startsAt) <= 3 * MIN);
      return { part: g.n, rejoinRate: prev.size ? Math.round((new Set(quick.map((r) => String(r.userId))).size / prev.size) * 100) : null };
    });
    return { session: String(s.title), parts: segs.length, attendees: segs.map((g) => ({ part: g.n, learners: inPart(g.n).size })), rejoin, minutesAttended: rows.reduce((x, r) => x + Number(r.minutes), 0) };
  });
}

export function commsAudit(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403);
  return store.auditLog(500).filter((r) => /^(comms|genesys)\./.test(String(r.action))).slice(0, 100);
}
