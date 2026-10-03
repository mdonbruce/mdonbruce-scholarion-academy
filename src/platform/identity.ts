import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { publish } from "./bus";
import { publicUrl } from "./config";
import { getDb, now, nowIso, save } from "./store";
import { newTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import type { AuthToken, Role, Session, User } from "./types";
import { DAY, newId, PlatformError, sha256 } from "./util";

/**
 * Scholarion Identity (Integration Spec §4). Local stand-in for the OIDC provider:
 * accounts, sessions, email verification, password reset, TOTP multi-factor sign-in
 * (required for platform admins when enforced), lockout after repeated failures.
 */

const SESSION_DAYS = 14;
const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_FAILURES = 8;
const TOKEN_TTL: Record<AuthToken["kind"], number> = { verify_email: 3 * DAY, reset_password: 60 * 60_000, mfa_pending: 5 * 60_000 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, roles: u.roles, tenantIds: u.tenantIds, timezone: u.timezone, emailVerified: !!u.emailVerifiedAt, mfaEnabled: !!u.mfaSecret };
}
export type PublicUser = ReturnType<typeof publicUser>;

/** Admin MFA is enforced in production, or whenever REQUIRE_ADMIN_MFA=1. */
export function adminMfaRequired(): boolean {
  if (process.env.REQUIRE_ADMIN_MFA === "0") return false;
  return process.env.REQUIRE_ADMIN_MFA === "1" || process.env.NODE_ENV === "production";
}

function validatePassword(password: string) {
  if (password.length < 10) throw new PlatformError("weak_password", "Use at least 10 characters for your password.");
  if (password.length > 200) throw new PlatformError("weak_password", "Use 200 characters or fewer.");
}

function issueToken(userId: string, kind: AuthToken["kind"], next?: string): string {
  const db = getDb();
  // One live token per kind per user: older ones stop working.
  for (const t of db.authTokens) if (t.userId === userId && t.kind === kind && !t.usedAt) t.usedAt = nowIso();
  const secret = randomBytes(24).toString("base64url");
  db.authTokens.push({ id: newId("tok"), hash: sha256(secret), userId, kind, expiresAt: new Date(now().getTime() + TOKEN_TTL[kind]).toISOString(), next });
  save();
  return secret;
}

function consumeToken(secret: string, kind: AuthToken["kind"]): AuthToken {
  const t = getDb().authTokens.find((x) => x.hash === sha256(secret ?? "") && x.kind === kind);
  if (!t || t.usedAt || t.expiresAt < nowIso()) {
    throw new PlatformError("token_invalid", kind === "mfa_pending" ? "Your sign-in expired. Please sign in again." : "This link has expired or was already used. Request a new one.", 400);
  }
  t.usedAt = nowIso();
  save();
  return t;
}

function liveUser(id: string): User | undefined {
  const u = getDb().users.find((x) => x.id === id);
  return u && !u.deletedAt ? u : undefined;
}

export const identity = {
  signUp(input: { name: string; email: string; password: string; acceptTerms: boolean }): User {
    const email = input.email.trim().toLowerCase();
    if (!input.acceptTerms) throw new PlatformError("terms_required", "Please accept the terms to create an account.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PlatformError("invalid_email", "Enter a valid email address.");
    validatePassword(input.password);
    if (!input.name.trim()) throw new PlatformError("name_required", "Enter your name.");
    const db = getDb();
    if (db.users.some((u) => u.email === email)) throw new PlatformError("email_taken", "An account with this email already exists.");
    const user: User = {
      id: newId("usr"),
      email,
      name: input.name.trim(),
      passwordHash: hashPassword(input.password),
      roles: ["learner"],
      tenantIds: ["academy-public"],
      createdAt: nowIso(),
      timezone: "America/New_York",
    };
    db.users.push(user);
    publish("identity.user.created", "identity", `user/${user.id}`, { userId: user.id });
    this.sendVerification(user.id);
    save();
    return user;
  },

  /** Emails a verification link. The link (a secret) goes only to HavenRoute's email, never to the browser. */
  sendVerification(userId: string): void {
    const u = liveUser(userId);
    if (!u || u.emailVerifiedAt) return;
    const secret = issueToken(u.id, "verify_email");
    publish("identity.email.verify_requested", "identity", `user/${u.id}`, { userId: u.id, link: `${publicUrl()}/verify-email/${secret}` });
  },

  verifyEmail(secret: string): User {
    const t = consumeToken(secret, "verify_email");
    const u = liveUser(t.userId);
    if (!u) throw new PlatformError("token_invalid", "This account no longer exists.", 400);
    u.emailVerifiedAt = u.emailVerifiedAt ?? nowIso();
    publish("identity.email.verified", "identity", `user/${u.id}`, { userId: u.id });
    save();
    return u;
  },

  /** Always succeeds from the caller's view, so it can't be used to discover accounts. */
  requestPasswordReset(emailRaw: string): void {
    const u = getDb().users.find((x) => x.email === emailRaw.trim().toLowerCase() && !x.deletedAt);
    if (!u) return;
    const secret = issueToken(u.id, "reset_password");
    publish("identity.password.reset_requested", "identity", `user/${u.id}`, { userId: u.id, link: `${publicUrl()}/reset-password/${secret}` });
  },

  resetPassword(secret: string, newPassword: string): User {
    validatePassword(newPassword);
    const t = consumeToken(secret, "reset_password");
    const u = liveUser(t.userId);
    if (!u) throw new PlatformError("token_invalid", "This account no longer exists.", 400);
    u.passwordHash = hashPassword(newPassword);
    u.passwordChangedAt = nowIso();
    u.emailVerifiedAt = u.emailVerifiedAt ?? nowIso(); // they proved access to the inbox
    this.signOutEverywhere(u.id);
    publish("identity.password.changed", "identity", `user/${u.id}`, { userId: u.id });
    save();
    return u;
  },

  changePassword(userId: string, current: string, next: string): void {
    const u = liveUser(userId);
    if (!u || !verifyPassword(current, u.passwordHash)) throw new PlatformError("wrong_password", "Your current password isn't right.", 403);
    validatePassword(next);
    u.passwordHash = hashPassword(next);
    u.passwordChangedAt = nowIso();
    publish("identity.password.changed", "identity", `user/${u.id}`, { userId: u.id });
    save();
  },

  /**
   * Step 1 of sign-in. Returns a session, or — when multi-factor sign-in is on —
   * a short-lived pending token to exchange with a code in step 2.
   */
  beginSignIn(emailRaw: string, password: string, next?: string): { session: Session } | { mfaToken: string } {
    const db = getDb();
    const email = emailRaw.trim().toLowerCase();
    const since = new Date(now().getTime() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
    db.loginFailures = db.loginFailures.filter((f) => f.at >= since);
    if (db.loginFailures.filter((f) => f.email === email).length >= LOCKOUT_FAILURES) {
      throw new PlatformError("locked", `Too many attempts. Wait ${LOCKOUT_WINDOW_MIN} minutes or reset your password.`, 429);
    }
    const user = db.users.find((u) => u.email === email && !u.deletedAt);
    // Same message for unknown email and wrong password (no account enumeration).
    if (!user || !verifyPassword(password, user.passwordHash)) {
      db.loginFailures.push({ email, at: nowIso() });
      save();
      throw new PlatformError("invalid_credentials", "That email and password don't match an account.", 401);
    }
    db.loginFailures = db.loginFailures.filter((f) => f.email !== email);
    if (user.mfaSecret) return { mfaToken: issueToken(user.id, "mfa_pending", next) };
    return { session: this.createSession(user.id, user.tenantIds[0]) };
  },

  /** Step 2: exchange the pending token and a 6-digit code for a session. */
  completeMfa(pendingToken: string, code: string): { session: Session; next?: string } {
    const t = getDb().authTokens.find((x) => x.hash === sha256(pendingToken ?? "") && x.kind === "mfa_pending");
    if (!t || t.usedAt || t.expiresAt < nowIso()) throw new PlatformError("token_invalid", "Your sign-in expired. Please sign in again.", 400);
    const u = liveUser(t.userId);
    if (!u?.mfaSecret) throw new PlatformError("token_invalid", "Please sign in again.", 400);
    if (!verifyTotp(u.mfaSecret, code)) throw new PlatformError("bad_code", "That code didn't work. Check your authenticator app and try again.", 401);
    t.usedAt = nowIso();
    return { session: this.createSession(u.id, u.tenantIds[0]), next: t.next };
  },

  /** Back-compatible single-step sign-in for accounts without MFA (tests, scripts). */
  signIn(emailRaw: string, password: string): Session {
    const r = this.beginSignIn(emailRaw, password);
    if ("mfaToken" in r) throw new PlatformError("mfa_required", "Enter the code from your authenticator app.", 401);
    return r.session;
  },

  beginMfaSetup(userId: string): { secret: string; otpauth: string } {
    const u = liveUser(userId);
    if (!u) throw new PlatformError("not_found", "User not found", 404);
    u.mfaPendingSecret = newTotpSecret();
    save();
    return { secret: u.mfaPendingSecret, otpauth: otpauthUrl(u.mfaPendingSecret, u.email) };
  },

  confirmMfaSetup(userId: string, code: string): void {
    const u = liveUser(userId);
    if (!u?.mfaPendingSecret) throw new PlatformError("no_setup", "Start setup again.");
    if (!verifyTotp(u.mfaPendingSecret, code)) throw new PlatformError("bad_code", "That code didn't match. Make sure your phone's clock is right and try the newest code.");
    u.mfaSecret = u.mfaPendingSecret;
    u.mfaEnabledAt = nowIso();
    delete u.mfaPendingSecret;
    publish("identity.mfa.enabled", "identity", `user/${u.id}`, { userId: u.id });
    save();
  },

  disableMfa(userId: string, password: string, code: string): void {
    const u = liveUser(userId);
    if (!u?.mfaSecret) return;
    if (!verifyPassword(password, u.passwordHash)) throw new PlatformError("wrong_password", "Your password isn't right.", 403);
    if (!verifyTotp(u.mfaSecret, code)) throw new PlatformError("bad_code", "That code didn't work.", 401);
    delete u.mfaSecret;
    delete u.mfaEnabledAt;
    publish("identity.mfa.disabled", "identity", `user/${u.id}`, { userId: u.id });
    save();
  },

  /** Platform admins must have MFA when it's enforced. */
  needsMfaSetup(user: Pick<User, "roles" | "mfaSecret">): boolean {
    return adminMfaRequired() && user.roles.includes("platform_admin") && !user.mfaSecret;
  },

  createSession(userId: string, tenantId: string): Session {
    const db = getDb();
    const session: Session = {
      token: randomBytes(32).toString("base64url"),
      userId,
      tenantId,
      createdAt: nowIso(),
      expiresAt: new Date(now().getTime() + SESSION_DAYS * DAY).toISOString(),
    };
    db.sessions.push(session);
    save();
    return session;
  },

  resolveSession(token: string | undefined | null): { user: User; session: Session } | null {
    if (!token) return null;
    const db = getDb();
    const session = db.sessions.find((s) => s.token === token);
    if (!session || session.expiresAt < nowIso()) return null;
    const user = liveUser(session.userId);
    return user ? { user, session } : null;
  },

  signOut(token: string): void {
    const db = getDb();
    db.sessions = db.sessions.filter((s) => s.token !== token);
    save();
  },

  signOutEverywhere(userId: string): number {
    const db = getDb();
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    save();
    return before - db.sessions.length;
  },

  sessionsFor(userId: string) {
    return getDb().sessions.filter((s) => s.userId === userId && s.expiresAt >= nowIso());
  },

  getUser(id: string): User | undefined {
    return liveUser(id);
  },

  hasRole(user: Pick<User, "roles">, ...roles: Role[]): boolean {
    return roles.some((r) => user.roles.includes(r)) || user.roles.includes("platform_admin");
  },

  saveOnboarding(userId: string, data: NonNullable<User["onboarding"]>): void {
    const u = this.getUser(userId);
    if (!u) throw new PlatformError("not_found", "User not found", 404);
    u.onboarding = data;
    save();
  },

  setPreferences(userId: string, prefs: { locale?: string; region?: string }): void {
    const u = this.getUser(userId);
    if (!u) return;
    if (prefs.locale) u.locale = prefs.locale;
    if (prefs.region) u.region = prefs.region;
    save();
  },
};
