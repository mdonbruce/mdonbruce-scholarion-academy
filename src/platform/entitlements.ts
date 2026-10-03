import { publish } from "./bus";
import { getDb, nowIso, save } from "./store";
import type { AccessDecision, AccessLevel, Action, Entitlement, EntitlementSource, Product } from "./types";
import { newId } from "./util";

/**
 * Entitlement service (Integration Spec §4): the single access authority.
 * The BFF asks "can user U do action A on resource R?" and never infers access
 * from plan names or prices.
 */

const AUDIT_ACTIONS: Action[] = ["content.view"];
const FULL_ACTIONS: Action[] = ["content.view", "item.graded", "lab.launch", "tutor.use", "credential.earn"];

function active(e: Entitlement, at: string): boolean {
  return !e.revokedAt && e.validFrom <= at && (e.validTo === null || e.validTo > at);
}

function productsContaining(courseId: string): Product[] {
  return getDb().products.filter((p) => p.courseIds.includes(courseId));
}

export const entitlements = {
  grant(input: {
    userId: string;
    tenantId?: string;
    resource: Entitlement["resource"];
    level: AccessLevel;
    source: EntitlementSource;
    sourceRef?: string;
    validTo?: string | null;
    validFrom?: string;
  }): Entitlement {
    const db = getDb();
    const ent: Entitlement = {
      id: newId("ent"),
      userId: input.userId,
      tenantId: input.tenantId ?? "academy-public",
      resource: input.resource,
      level: input.level,
      source: input.source,
      sourceRef: input.sourceRef,
      validFrom: input.validFrom ?? nowIso(),
      validTo: input.validTo ?? null,
    };
    db.entitlements.push(ent);
    publish("entitlement.changed", "entitlements", `user/${ent.userId}`, {
      userId: ent.userId,
      entitlementId: ent.id,
      change: "granted",
      level: ent.level,
      resource: ent.resource,
    });
    save();
    return ent;
  },

  /** Revoke every active grant created from a source reference (subscription, order, aid decision). */
  revokeBySource(sourceRef: string, at = nowIso()): number {
    const db = getDb();
    let n = 0;
    for (const e of db.entitlements) {
      if (e.sourceRef === sourceRef && !e.revokedAt) {
        e.revokedAt = at;
        n++;
        publish("entitlement.changed", "entitlements", `user/${e.userId}`, {
          userId: e.userId,
          entitlementId: e.id,
          change: "revoked",
        });
      }
    }
    save();
    return n;
  },

  /** End access at a given time (cancel at period end keeps access until then). */
  endBySource(sourceRef: string, validTo: string): void {
    for (const e of getDb().entitlements) if (e.sourceRef === sourceRef && !e.revokedAt) e.validTo = validTo;
    save();
  },

  listFor(userId: string, at = nowIso()): Entitlement[] {
    return getDb().entitlements.filter((e) => e.userId === userId && active(e, at));
  },

  /**
   * Resolve access for a product or a course. A course is reachable through
   * its own grant, any program that contains it, Plus (when Plus-eligible),
   * or staff assignment.
   */
  check(userId: string | null, action: Action, productOrCourseId: string, at = nowIso()): AccessDecision {
    if (!userId) return { allow: false, reason: "not_signed_in" };
    const db = getDb();
    const grants = this.listFor(userId, at);
    const target = db.products.find((p) => p.id === productOrCourseId);
    const containing = target ? [target, ...productsContaining(target.id).filter((p) => p.id !== target.id)] : [];
    const ids = new Set(containing.map((p) => p.id));

    const relevant = grants.filter((g) => {
      if (g.resource.kind === "product") return ids.has(g.resource.id);
      if (g.resource.kind === "plus") return containing.some((p) => p.plusEligible && p.format === "self_paced");
      return false;
    });

    if (action === "studio.manage") {
      const staff = relevant.find((g) => g.level === "instructor");
      return staff ? { allow: true, level: "instructor", source: staff.source } : { allow: false, reason: "needs_upgrade" };
    }

    if (action === "live.join") {
      const seat = relevant.find((g) => g.level === "live_seat");
      if (seat) return { allow: true, level: "live_seat", source: seat.source };
      const lapsed = db.entitlements.find((e) => e.userId === userId && e.level === "live_seat" && ids.has(e.resource.id) && e.revokedAt);
      return { allow: false, reason: lapsed ? "seat_revoked" : "no_live_seat" };
    }

    const order: AccessLevel[] = ["instructor", "full", "live_seat", "audit"];
    relevant.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    const best = relevant[0];

    if (best && (best.level === "full" || best.level === "instructor" || best.level === "live_seat")) {
      return FULL_ACTIONS.includes(action) || action === "content.view"
        ? { allow: true, level: best.level, source: best.source }
        : { allow: false, reason: "needs_upgrade" };
    }
    if (best && best.level === "audit") {
      if (AUDIT_ACTIONS.includes(action)) return { allow: true, level: "audit", source: best.source };
      return { allow: false, reason: this.whyNotFull(userId, ids, at) };
    }
    return { allow: false, reason: this.whyNotFull(userId, ids, at, true) };
  },

  /** Pick the most helpful reason code for the plain-language upgrade explanation. */
  whyNotFull(userId: string, productIds: Set<string>, at: string, noGrant = false) {
    const db = getDb();
    const pendingAid = db.aid.find((a) => a.userId === userId && productIds.has(a.productId) && a.status === "submitted");
    if (pendingAid) return "aid_pending" as const;
    const expiredTrial = db.subscriptions.find(
      (s) => s.userId === userId && s.trialEnd && s.trialEnd <= at && (s.status === "expired" || s.status === "canceled"),
    );
    if (expiredTrial) return "trial_expired" as const;
    return noGrant ? ("not_enrolled" as const) : ("needs_upgrade" as const);
  },

  /** Batch form used by the BFF: POST /v1/entitlements/check */
  checkBatch(userId: string | null, pairs: { action: Action; resource: string }[]) {
    return pairs.map((p) => ({ ...p, ...this.check(userId, p.action, p.resource) }));
  },
};

export const DENY_COPY: Record<string, string> = {
  not_signed_in: "Sign in or create a free account to continue.",
  not_enrolled: "Enroll to open this. You can audit for free or choose a paid option.",
  needs_upgrade:
    "You're auditing this course. Auditing includes videos and readings. Graded work, labs, the AI Tutor and the certificate come with a subscription, Scholarion Plus or approved financial aid.",
  trial_expired: "Your free trial has ended. Subscribe to pick up where you left off — your progress is saved.",
  aid_pending: "Your financial aid application is being reviewed. You'll get full access as soon as it's approved.",
  seat_revoked: "Your live seat is no longer active. Contact support if you think this is a mistake.",
  no_live_seat: "Live sessions are for accepted applicants with a reserved seat.",
};
