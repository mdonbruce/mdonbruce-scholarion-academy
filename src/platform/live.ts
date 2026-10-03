import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { getDb, now, nowIso, save } from "./store";
import type { LiveSession } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Zoom/Webex live sessions engine (Integration Spec §13). Splits each session into
 * 40-minute segments with their own meetings and per-user registrant links, and
 * reconciles attendance back to the LMS. Local stand-in: provider calls are simulated.
 */

const JOIN_WINDOW_MIN = 10;

export const live = {
  schedule(input: { productId: string; cohort: string; title: string; startsAt: string; totalMinutes: number; provider?: "zoom" | "webex" }): LiveSession {
    const p = catalog.get(input.productId);
    if (!p || p.format !== "live") throw new PlatformError("not_live", "Only live programs have sessions.");
    const segMin = p.livePlan?.segmentMinutes ?? 40;
    const count = Math.ceil(input.totalMinutes / segMin);
    const id = newId("lvs");
    const breakMin = 5;
    const session: LiveSession = {
      id,
      productId: p.id,
      cohort: input.cohort,
      title: input.title,
      startsAt: input.startsAt,
      segments: Array.from({ length: count }, (_, i) => ({
        id: `${id}_s${i + 1}`,
        sessionId: id,
        index: i + 1,
        startsAt: new Date(Date.parse(input.startsAt) + i * (segMin + breakMin) * 60_000).toISOString(),
        minutes: segMin,
        provider: input.provider ?? "zoom",
        meetingId: `${(input.provider ?? "zoom") === "zoom" ? "8" : "2"}${String(Math.abs(hash(id + i)) % 1e9).padStart(9, "0")}`,
      })),
    };
    getDb().liveSessions.push(session);
    save();
    return session;
  },

  sessionsFor(userId: string): { session: LiveSession; productTitle: string; canJoin: boolean }[] {
    const db = getDb();
    return db.liveSessions
      .filter((s) => entitlements.check(userId, "live.join", s.productId).allow)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((s) => ({ session: s, productTitle: catalog.get(s.productId)?.title ?? "", canJoin: true }));
  },

  /** GET /v1/live/sessions/{id}/join — seat check, per-user registrant link, join window. */
  join(userId: string, segmentId: string): { url: string; opensAt: string; open: boolean; provider: string } {
    const db = getDb();
    const session = db.liveSessions.find((s) => s.segments.some((g) => g.id === segmentId));
    const seg = session?.segments.find((g) => g.id === segmentId);
    if (!session || !seg) throw new PlatformError("not_found", "Session not found", 404);
    const d = entitlements.check(userId, "live.join", session.productId);
    if (!d.allow) throw new PlatformError(d.reason ?? "no_live_seat", "Live sessions are for accepted applicants with a reserved seat.", 403);
    const opensAt = new Date(Date.parse(seg.startsAt) - JOIN_WINDOW_MIN * 60_000).toISOString();
    const closesAt = new Date(Date.parse(seg.startsAt) + seg.minutes * 60_000).toISOString();
    const open = nowIso() >= opensAt && nowIso() <= closesAt;
    const token = Buffer.from(`${userId}:${seg.id}`).toString("base64url");
    const host = seg.provider === "zoom" ? "zoom.example.invalid" : "webex.example.invalid";
    return { url: `https://${host}/w/${seg.meetingId}?tk=${token}`, opensAt, open, provider: seg.provider };
  },

  /** Provider webhook (participant joined/left) → minutes → live.attendance.recorded. */
  recordAttendance(userId: string, sessionId: string, minutes: number): void {
    const db = getDb();
    const s = db.liveSessions.find((x) => x.id === sessionId);
    if (!s) throw new PlatformError("not_found", "Session not found", 404);
    const total = s.segments.reduce((a, g) => a + g.minutes, 0);
    const m = Math.max(0, Math.min(total, Math.round(minutes)));
    const existing = db.attendance.find((a) => a.userId === userId && a.sessionId === sessionId);
    if (existing) existing.minutes = m;
    else db.attendance.push({ userId, sessionId, minutes: m, recordedAt: nowIso() });
    publish("live.attendance.recorded", "live", `user/${userId}`, { userId, sessionId, productId: s.productId, minutes: m, total });
    save();
  },

  attendanceFor(userId: string) {
    return getDb().attendance.filter((a) => a.userId === userId);
  },

  /** Failover: re-provision every segment on the other provider. */
  failover(sessionId: string): LiveSession {
    const s = getDb().liveSessions.find((x) => x.id === sessionId);
    if (!s) throw new PlatformError("not_found", "Session not found", 404);
    for (const g of s.segments) {
      g.provider = g.provider === "zoom" ? "webex" : "zoom";
      g.meetingId = `${g.provider === "zoom" ? "8" : "2"}${String(Math.abs(hash(g.id + g.provider)) % 1e9).padStart(9, "0")}`;
    }
    save();
    return s;
  },

  /** Reminders 24 h and 1 h before each session. */
  tick(): number {
    const db = getDb();
    let n = 0;
    const t = now().getTime();
    for (const s of db.liveSessions) {
      const start = Date.parse(s.startsAt);
      for (const hours of [24, 1]) {
        if (t >= start - hours * 3600_000 && t < start) {
          for (const e of db.entitlements.filter((x) => x.level === "live_seat" && x.resource.id === s.productId && !x.revokedAt)) {
            const key = `live:${s.id}:${e.userId}:${hours}`;
            if (db.processed.includes(key)) continue;
            db.processed.push(key);
            publish("live.session.reminder", "live", `user/${e.userId}`, { userId: e.userId, sessionId: s.id, title: s.title, startsAt: s.startsAt, hoursBefore: hours });
            n++;
          }
        }
      }
    }
    save();
    return n;
  },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
