import { publish } from "./bus";
import { commerce } from "./commerce";
import { identity, verifyPassword } from "./identity";
import { getDb, nowIso, save } from "./store";
import { teams } from "./teams";
import { PlatformError } from "./util";

/**
 * Privacy rights (GDPR / CCPA / NDPA): a learner can download everything we hold
 * about them, and delete their account. Deletion erases personal data across services;
 * financial records are kept without identity for tax law, and issued credentials
 * are revoked so verification never shows a deleted person.
 */

export const privacy = {
  exportData(userId: string) {
    const db = getDb();
    const u = identity.getUser(userId);
    if (!u) throw new PlatformError("not_found", "Account not found", 404);
    const mine = <T extends { userId: string }>(xs: T[]) => xs.filter((x) => x.userId === userId);
    return {
      exportedAt: nowIso(),
      format: "Scholarion account export v1",
      account: { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, timezone: u.timezone, emailVerifiedAt: u.emailVerifiedAt ?? null, mfaEnabled: !!u.mfaSecret, onboarding: u.onboarding ?? null, locale: u.locale ?? null, region: u.region ?? null },
      enrollments: mine(db.enrollments),
      progress: mine(db.progress),
      quizAttempts: mine(db.attempts).map((a) => ({ itemId: a.itemId, answers: a.answers, startedAt: a.startedAt, submittedAt: a.submittedAt, score: a.score, max: a.max })),
      submissions: mine(db.submissions),
      peerReviewsGiven: db.peerReviews.filter((r) => r.reviewerId === userId),
      grades: mine(db.grades),
      labWork: mine(db.labSessions).map((l) => ({ itemId: l.itemId, code: l.code, lastActiveAt: l.lastActiveAt })),
      discussionPosts: mine(db.posts).map((p) => ({ id: p.id, itemId: p.itemId, body: p.body, createdAt: p.createdAt })),
      reviews: mine(db.reviews).map((r) => ({ productId: r.productId, rating: r.rating, title: r.title, body: r.body, status: r.status, createdAt: r.createdAt })),
      credentials: mine(db.credentials).map((c) => ({ id: c.id, title: c.title, issuedAt: c.issuedAt, revokedAt: c.revokedAt ?? null, verifiableCredential: c.vc })),
      orders: mine(db.orders),
      subscriptions: mine(db.subscriptions),
      financialAid: mine(db.aid),
      liveApplications: mine(db.applications),
      liveAttendance: mine(db.attendance),
      organizations: teams.membershipsOf(userId).map((m) => ({ organization: m.org.name, via: m.member.via, joinedAt: m.member.joinedAt })),
      supportTickets: db.tickets.filter((t) => t.userId === userId).map((t) => ({ subject: t.subject, body: t.body, createdAt: t.createdAt, status: t.status })),
      notifications: mine(db.notices).map((n) => ({ title: n.title, createdAt: n.createdAt, readAt: n.readAt ?? null })),
      emailsSent: db.outbox.filter((e) => e.to === u.email).map((e) => ({ subject: e.subject, createdAt: e.createdAt })),
    };
  },

  /** Requires the password. Irreversible. */
  deleteAccount(userId: string, password: string, confirmText: string): void {
    const db = getDb();
    const u = identity.getUser(userId);
    if (!u) throw new PlatformError("not_found", "Account not found", 404);
    if (confirmText.trim().toUpperCase() !== "DELETE") throw new PlatformError("confirm_required", "Type DELETE to confirm.");
    if (!verifyPassword(password, u.passwordHash)) throw new PlatformError("wrong_password", "Your password isn't right.", 403);
    if (db.organizations.some((o) => o.adminIds.includes(userId) && o.adminIds.length === 1)) {
      throw new PlatformError("sole_org_admin", "You're the only admin of an organization. Add another admin or contact support before deleting your account.", 409);
    }
    const t = nowIso();
    const email = u.email;

    // Stop billing; keep orders (tax records) but detach them from the person.
    for (const s of db.subscriptions.filter((x) => x.userId === userId && (x.status === "active" || x.status === "trialing" || x.status === "paused"))) {
      try {
        commerce.cancel(s.id, userId);
      } catch {
        s.status = "canceled";
      }
    }
    for (const o of db.orders) if (o.userId === userId) o.userId = "deleted";
    for (const s of db.subscriptions) if (s.userId === userId) s.userId = "deleted";

    // Free organization seats.
    for (const m of db.orgMembers) if (m.userId === userId && m.status === "active") {
      m.status = "revoked";
      m.revokedAt = t;
    }
    for (const e of db.entitlements) if (e.userId === userId && !e.revokedAt) e.revokedAt = t;

    // Credentials: revoke and remove the name.
    for (const c of db.credentials) if (c.userId === userId) {
      c.revokedAt = c.revokedAt ?? t;
      c.holderName = "Deleted account";
    }

    // Learning records and content.
    const drop = <T extends { userId: string }>(xs: T[]) => xs.filter((x) => x.userId !== userId);
    db.enrollments = drop(db.enrollments);
    db.progress = drop(db.progress);
    db.attempts = drop(db.attempts);
    db.grades = drop(db.grades);
    db.labSessions = drop(db.labSessions);
    db.tutorUsage = drop(db.tutorUsage);
    db.aid = drop(db.aid);
    db.applications = drop(db.applications);
    db.attendance = drop(db.attendance);
    for (const s of db.submissions) if (s.userId === userId) {
      s.text = "[deleted]";
      delete s.fileName;
    }
    for (const r of db.peerReviews) if (r.reviewerId === userId) r.reviewerId = "deleted";
    for (const p of db.posts) if (p.userId === userId) {
      p.body = "[deleted]";
      p.hiddenAt = p.hiddenAt ?? t;
      p.userId = "deleted";
    }
    db.reviews = drop(db.reviews);
    for (const tk of db.tickets) if (tk.userId === userId) {
      tk.userId = null;
      tk.body = "[deleted]";
      tk.context = {};
    }
    db.outbox = db.outbox.filter((e) => e.to !== email);
    db.authTokens = drop(db.authTokens);
    db.sessions = drop(db.sessions);
    db.notices = drop(db.notices);

    // Tombstone the account.
    u.deletedAt = t;
    u.email = `deleted+${u.id}@invalid`;
    u.name = "Deleted account";
    u.passwordHash = "deleted";
    delete u.onboarding;
    delete u.mfaSecret;
    delete u.mfaPendingSecret;
    publish("identity.user.deleted", "identity", `user/${userId}`, { userId });
    save();
  },
};
