import { publish, subscribe } from "./bus";
import { catalog } from "./catalog";
import { cloudlab } from "./cloudlab";
import { commerce } from "./commerce";
import { credentials } from "./credentials";
import { cx, registerHavenRoute } from "./cx";
import { entitlements } from "./entitlements";
import { identity } from "./identity";
import { live } from "./live";
import { lms } from "./lms";
import { seed } from "./seed";
import { getDb, isSeeded, loadPersisted, markSeeded, save, setDb } from "./store";
import { studio } from "./studio";
import { tutor } from "./tutor";
import { teams } from "./teams";
import { community } from "./community";
import { admissions } from "./admissions";
import { privacy } from "./privacy";
import { reviews } from "./reviews";
import { authoring } from "./authoring";
import { content } from "./content";
import { library } from "./library";
import { recommend } from "./recommend";

/**
 * Platform façade. In production each export is a typed HTTP/gRPC client to the
 * real Scholarion service; here they are in-process stand-ins sharing one event bus.
 * The BFF imports only from this file.
 */

function wireConsumers(): void {
  // Cloud Lab → LMS: autograde results land in the gradebook.
  subscribe("lms", "lab.graded", (e) => {
    lms.postGrade({ userId: e.data.userId as string, itemId: e.data.itemId as string, score: Number(e.data.score), max: Number(e.data.max), source: "lab" });
    lms.recordProgress(e.data.userId as string, e.data.itemId as string, "completed");
  });
  // LMS → Credentials: issue on completion (course and program).
  subscribe("credentials", "lms.course.passed", (e) => {
    credentials.onCompletion(e.data.userId as string, e.data.courseId as string);
  });
  subscribe("credentials", "lms.program.completed", (e) => {
    credentials.onCompletion(e.data.userId as string, e.data.productId as string);
  });
  // Live engine → LMS/Credentials: attendance reconciliation for live programs.
  subscribe("lms", "live.attendance.recorded", (e) => {
    const userId = e.data.userId as string;
    const productId = e.data.productId as string;
    const db = getDb();
    const sessions = db.liveSessions.filter((s) => s.productId === productId);
    const scheduled = sessions.reduce((a, s) => a + s.segments.reduce((b, g) => b + g.minutes, 0), 0);
    const attended = db.attendance.filter((a) => a.userId === userId && sessions.some((s) => s.id === a.sessionId)).reduce((a, r) => a + r.minutes, 0);
    const allRecorded = sessions.every((s) => db.attendance.some((a) => a.userId === userId && a.sessionId === s.id));
    if (scheduled && allRecorded && attended / scheduled >= 0.8) {
      if (!db.events.some((x) => x.type === "lms.program.completed" && x.data.userId === userId && x.data.productId === productId)) {
        // Live programs complete on ≥80% attendance (instructor sign-off is implied in the stand-in).
        publish("lms.program.completed", "lms", `user/${userId}`, { userId, productId });
      }
    }
  });
  // Studio → AI Tutor: re-index happens on read in the stand-in; log the hook for parity.
  subscribe("tutor-indexer", "studio.output.published", () => undefined);
  subscribe("reviews", "credential.revoked", (e) => reviews.onCredentialRevoked(String(e.data.credentialId)));
  registerHavenRoute();
}

type G = { __scholarionReady?: boolean };
const g = globalThis as unknown as G;

/** Idempotent boot: restore persisted state or seed, then wire consumers. */
export function ensurePlatform(): void {
  if (g.__scholarionReady && isSeeded()) return;
  wireConsumers();
  const persisted = loadPersisted();
  if (persisted) setDb(persisted);
  else seed();
  markSeeded();
  g.__scholarionReady = true;
  save();
}

/** Scheduler tick (trials, renewals, deadline and live reminders, idle labs). */
export function tickAll() {
  return { commerce: commerce.tick(), lms: lms.tick(), live: live.tick(), labsStopped: cloudlab.tick() };
}

export { library, recommend };
export { admissions, authoring, content, privacy, reviews, catalog, cloudlab, commerce, community, credentials, cx, entitlements, identity, live, lms, studio, teams, tutor };
export { capabilities } from "./status";
export { checkClaims, partners } from "./partners";
export { publicQuiz } from "./lms";
export { DENY_COPY } from "./entitlements";
export { getDb, now, nowIso } from "./store";
export { adminMfaRequired, publicUser } from "./identity";
export { totp } from "./totp";
export type * from "./types";
