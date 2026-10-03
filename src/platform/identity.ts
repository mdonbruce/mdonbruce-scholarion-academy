import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { publish } from "./bus";
import { getDb, now, nowIso, save } from "./store";
import type { Role, Session, User } from "./types";
import { DAY, newId, PlatformError } from "./util";

/** Scholarion Identity (Integration Spec §4). Local stand-in for the OIDC provider. */

const SESSION_DAYS = 14;

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
  return { id: u.id, email: u.email, name: u.name, roles: u.roles, tenantIds: u.tenantIds, timezone: u.timezone };
}
export type PublicUser = ReturnType<typeof publicUser>;

export const identity = {
  signUp(input: { name: string; email: string; password: string; acceptTerms: boolean }): User {
    const email = input.email.trim().toLowerCase();
    if (!input.acceptTerms) throw new PlatformError("terms_required", "Please accept the terms to create an account.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PlatformError("invalid_email", "Enter a valid email address.");
    if (input.password.length < 10) throw new PlatformError("weak_password", "Use at least 10 characters for your password.");
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
    save();
    return user;
  },

  signIn(emailRaw: string, password: string): Session {
    const db = getDb();
    const email = emailRaw.trim().toLowerCase();
    const user = db.users.find((u) => u.email === email);
    // Same message for unknown email and wrong password (no account enumeration).
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new PlatformError("invalid_credentials", "That email and password don't match an account.", 401);
    }
    return this.createSession(user.id, user.tenantIds[0]);
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
    const user = db.users.find((u) => u.id === session.userId);
    return user ? { user, session } : null;
  },

  signOut(token: string): void {
    const db = getDb();
    db.sessions = db.sessions.filter((s) => s.token !== token);
    save();
  },

  getUser(id: string): User | undefined {
    return getDb().users.find((u) => u.id === id);
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
};
