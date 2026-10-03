import { publish } from "./bus";
import { catalog } from "./catalog";
import { identity } from "./identity";
import { getDb, nowIso, save } from "./store";
import type { ApplicationStatus, LiveApplication, Product } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Live program admissions (Master Prompt §5.7): apply → staff review → seat
 * reservation (full or installments, handled by Commerce) → onboarding →
 * session cards → attendance → credential. Cohorts have a fixed capacity.
 */

const OPEN: ApplicationStatus[] = ["submitted", "accepted", "waitlisted", "reserved"];

function liveProduct(productId: string): Product {
  const p = catalog.get(productId);
  if (!p || p.format !== "live" || !p.livePlan) throw new PlatformError("not_live", "Only live programs take applications.", 404);
  return p;
}

export const admissions = {
  capacity(productId: string) {
    const p = liveProduct(productId);
    const apps = getDb().applications.filter((a) => a.productId === p.id && a.cohort === p.livePlan!.cohort);
    const reserved = apps.filter((a) => a.status === "reserved").length;
    const accepted = apps.filter((a) => a.status === "accepted").length;
    return { total: p.livePlan!.capacity, reserved, accepted, held: reserved + accepted, free: Math.max(0, p.livePlan!.capacity - reserved - accepted), waitlisted: apps.filter((a) => a.status === "waitlisted").length };
  },

  current(userId: string, productId: string): LiveApplication | undefined {
    return getDb()
      .applications.filter((a) => a.userId === userId && a.productId === productId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },

  apply(input: { userId: string; productId: string; experience: string; motivation: string }): LiveApplication {
    const p = liveProduct(input.productId);
    const existing = this.current(input.userId, p.id);
    if (existing && OPEN.includes(existing.status)) throw new PlatformError("already_applied", "You already have an application for this program.", 409);
    const experience = input.experience.trim();
    const motivation = input.motivation.trim();
    if (experience.length < 50) throw new PlatformError("experience_short", "Tell us a bit more about your experience (at least 50 characters).");
    if (motivation.length < 50) throw new PlatformError("motivation_short", "Tell us a bit more about why you want to join (at least 50 characters).");
    const app: LiveApplication = { id: newId("app"), userId: input.userId, productId: p.id, cohort: p.livePlan!.cohort, experience, motivation, status: "submitted", createdAt: nowIso() };
    getDb().applications.push(app);
    publish("live.application.submitted", "admissions", `user/${input.userId}`, { userId: input.userId, applicationId: app.id, productId: p.id });
    save();
    return app;
  },

  /** Staff decision. Accepting holds a seat; a full cohort can only waitlist. */
  decide(applicationId: string, reviewerId: string, decision: "accepted" | "waitlisted" | "declined", note = ""): LiveApplication {
    const reviewer = identity.getUser(reviewerId);
    if (!reviewer || !identity.hasRole(reviewer, "reviewer", "instructor")) throw new PlatformError("forbidden", "Only admissions staff can decide applications.", 403);
    const app = getDb().applications.find((a) => a.id === applicationId);
    if (!app) throw new PlatformError("not_found", "Application not found", 404);
    if (app.status !== "submitted" && app.status !== "waitlisted") throw new PlatformError("already_decided", "This application already has a final decision.", 409);
    if (decision === "accepted" && this.capacity(app.productId).free <= 0) {
      throw new PlatformError("cohort_full", "This cohort is full. Waitlist the applicant, or free a seat first.", 409);
    }
    app.status = decision;
    app.reviewerId = reviewerId;
    app.decisionNote = note.trim() || undefined;
    app.decidedAt = nowIso();
    publish("live.application.decided", "admissions", `user/${app.userId}`, { userId: app.userId, applicationId: app.id, productId: app.productId, decision });
    save();
    return app;
  },

  /** Called by Commerce when the seat payment (or first installment) succeeds. */
  markReserved(userId: string, productId: string, plan: "full" | "installments"): LiveApplication | undefined {
    const app = this.current(userId, productId);
    if (!app || app.status !== "accepted") return undefined;
    app.status = "reserved";
    app.reservedAt = nowIso();
    app.paymentPlan = plan;
    publish("live.seat.reserved", "admissions", `user/${userId}`, { userId, applicationId: app.id, productId, plan });
    save();
    return app;
  },

  /** Commerce gate: a live seat can only be bought after acceptance. */
  canReserve(userId: string, productId: string): boolean {
    return this.current(userId, productId)?.status === "accepted";
  },

  onboard(applicationId: string, userId: string, acknowledged: boolean): LiveApplication {
    const app = getDb().applications.find((a) => a.id === applicationId && a.userId === userId);
    if (!app) throw new PlatformError("not_found", "Application not found", 404);
    if (app.status !== "reserved") throw new PlatformError("not_reserved", "Reserve your seat before onboarding.");
    if (!acknowledged) throw new PlatformError("ack_required", "Please confirm the cohort guidelines.");
    app.onboardedAt = app.onboardedAt ?? nowIso();
    save();
    return app;
  },

  withdraw(applicationId: string, userId: string): LiveApplication {
    const app = getDb().applications.find((a) => a.id === applicationId && a.userId === userId);
    if (!app) throw new PlatformError("not_found", "Application not found", 404);
    if (app.status === "reserved") throw new PlatformError("reserved", "Your seat is reserved. Contact support to cancel it under the refund policy.");
    if (!OPEN.includes(app.status)) return app;
    app.status = "withdrawn";
    save();
    return app;
  },

  forUser(userId: string) {
    return getDb()
      .applications.filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a, product: catalog.get(a.productId) }));
  },

  queue() {
    const db = getDb();
    return db.applications
      .filter((a) => a.status === "submitted" || a.status === "waitlisted")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) => ({ ...a, product: catalog.get(a.productId), applicant: db.users.find((u) => u.id === a.userId)?.name ?? "Applicant", capacity: this.capacity(a.productId) }));
  },
};
