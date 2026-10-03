import { randomBytes } from "node:crypto";
import { publish } from "./bus";
import { catalog } from "./catalog";
import { commerceConfig, money } from "./config";
import { entitlements } from "./entitlements";
import { identity } from "./identity";
import { lms } from "./lms";
import { getDb, nowIso, save } from "./store";
import type { Organization, OrgMember, Product, User } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Scholarion for Teams (Master Prompt §7). Organizations are tenants: seats grant
 * `org_seat` entitlements scoped to the organization, admins see only their own
 * organization's people, and nothing crosses organizations.
 * SSO here is simulated by email-domain matching; SAML/OIDC and SCIM are PLANNED.
 */

const MAX_SEATS = 5000;

function seatRef(orgId: string, userId: string) {
  return `seat:${orgId}:${userId}`;
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function cleanDomain(d: string | null | undefined): string | null {
  const v = (d ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!v) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) throw new PlatformError("invalid_domain", "Enter an email domain like example.com.");
  return v;
}

function org(orgId: string): Organization {
  const o = getDb().organizations.find((x) => x.id === orgId);
  if (!o) throw new PlatformError("not_found", "Organization not found", 404);
  return o;
}

/** Every admin-facing call goes through this: admins of org A can never act on org B. */
function asAdmin(orgId: string, userId: string): Organization {
  const o = org(orgId);
  const u = identity.getUser(userId);
  if (!o.adminIds.includes(userId) && !u?.roles.includes("platform_admin")) {
    throw new PlatformError("forbidden", "You don't manage this organization.", 403);
  }
  return o;
}

function activeMembers(orgId: string): OrgMember[] {
  return getDb().orgMembers.filter((m) => m.orgId === orgId && m.status === "active");
}

function grantPrograms(o: Organization, userId: string, programIds: string[]) {
  for (const pid of programIds) {
    entitlements.grant({ userId, tenantId: o.id, resource: { kind: "product", id: pid }, level: "full", source: "org_seat", sourceRef: seatRef(o.id, userId) });
    lms.enroll(userId, pid, "full");
  }
}

export const teams = {
  quote(seats: number) {
    const n = Math.floor(seats);
    if (!Number.isFinite(n) || n < 1 || n > MAX_SEATS) throw new PlatformError("invalid_seats", `Choose between 1 and ${MAX_SEATS} seats.`);
    const per = commerceConfig.seatAnnual;
    return { seats: n, perSeat: per, total: n * per, label: `${n} seat${n === 1 ? "" : "s"} × ${money(per)}/year = ${money(n * per)}/year` };
  },

  /** Sandbox purchase: creates the organization, its tenant, and an order. The buyer becomes its admin. */
  purchase(input: { adminId: string; name: string; seats: number; domain?: string | null; ssoEnabled?: boolean; id?: string }): Organization {
    const admin = identity.getUser(input.adminId);
    if (!admin) throw new PlatformError("not_signed_in", "Sign in to buy seats.", 401);
    const name = input.name.trim();
    if (name.length < 2) throw new PlatformError("name_required", "Enter your organization's name.");
    const q = this.quote(input.seats);
    const domain = cleanDomain(input.domain);
    const db = getDb();
    if (domain && db.organizations.some((o) => o.domain === domain)) throw new PlatformError("domain_taken", "Another organization already uses that email domain.", 409);
    const o: Organization = { id: input.id ?? newId("org"), name, domain, ssoEnabled: !!domain && input.ssoEnabled !== false, seats: q.seats, adminIds: [admin.id], programIds: [], createdAt: nowIso() };
    db.organizations.push(o);
    db.tenants.push({ id: o.id, name: o.name, kind: "organization" });
    if (!admin.tenantIds.includes(o.id)) admin.tenantIds.push(o.id);
    const orderId = newId("ord");
    db.orders.push({ id: orderId, userId: admin.id, sessionId: `org:${o.id}`, amount: q.total, currency: commerceConfig.currency, description: `Scholarion for Teams — ${q.seats} seats, annual (sandbox)`, status: "paid", createdAt: nowIso() });
    publish("org.created", "teams", `org/${o.id}`, { orgId: o.id, adminId: admin.id, seats: q.seats }, o.id);
    publish("order.paid", "commerce", `user/${admin.id}`, { userId: admin.id, orderId, plan: "org_seats", amount: q.total });
    save();
    return o;
  },

  addSeats(orgId: string, adminId: string, extra: number): Organization {
    const o = asAdmin(orgId, adminId);
    const q = this.quote(extra);
    if (o.seats + q.seats > MAX_SEATS) throw new PlatformError("invalid_seats", `An organization can have up to ${MAX_SEATS} seats.`);
    o.seats += q.seats;
    getDb().orders.push({ id: newId("ord"), userId: adminId, sessionId: `org:${o.id}`, amount: q.total, currency: commerceConfig.currency, description: `Scholarion for Teams — ${q.seats} more seats (sandbox)`, status: "paid", createdAt: nowIso() });
    save();
    return o;
  },

  updateSso(orgId: string, adminId: string, domain: string | null, enabled: boolean): Organization {
    const o = asAdmin(orgId, adminId);
    const d = cleanDomain(domain);
    if (d && getDb().organizations.some((x) => x.id !== o.id && x.domain === d)) throw new PlatformError("domain_taken", "Another organization already uses that email domain.", 409);
    o.domain = d;
    o.ssoEnabled = !!d && enabled;
    save();
    return o;
  },

  /** Curate the organization's academy; every active member gets access and is enrolled. */
  assignProgram(orgId: string, adminId: string, productId: string): Organization {
    const o = asAdmin(orgId, adminId);
    const p = catalog.get(productId);
    if (!p) throw new PlatformError("not_found", "Program not found", 404);
    if (p.format === "live") throw new PlatformError("live_not_seatable", "Live programs are booked per cohort. Contact us to reserve seats.");
    if (o.programIds.includes(p.id)) return o;
    o.programIds.push(p.id);
    for (const m of activeMembers(o.id)) grantPrograms(o, m.userId, [p.id]);
    publish("org.program.assigned", "teams", `org/${o.id}`, { orgId: o.id, productId: p.id }, o.id);
    save();
    return o;
  },

  /** Removing a program stops new access; members keep progress and anything already earned. */
  unassignProgram(orgId: string, adminId: string, productId: string): Organization {
    const o = asAdmin(orgId, adminId);
    o.programIds = o.programIds.filter((x) => x !== productId);
    const db = getDb();
    for (const e of db.entitlements) {
      if (e.source === "org_seat" && e.tenantId === o.id && e.resource.id === productId && !e.revokedAt) e.revokedAt = nowIso();
    }
    save();
    return o;
  },

  invite(orgId: string, adminId: string, emailsRaw: string): { created: { email: string; token: string }[]; skipped: string[] } {
    const o = asAdmin(orgId, adminId);
    const db = getDb();
    const emails = [...new Set(emailsRaw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) throw new PlatformError("no_emails", "Add at least one email address.");
    const created: { email: string; token: string }[] = [];
    const skipped: string[] = [];
    for (const email of emails) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        skipped.push(`${email} (not an email address)`);
        continue;
      }
      const existingUser = db.users.find((u) => u.email === email);
      if (existingUser && activeMembers(o.id).some((m) => m.userId === existingUser.id)) {
        skipped.push(`${email} (already a member)`);
        continue;
      }
      if (db.orgInvites.some((i) => i.orgId === o.id && i.email === email && !i.acceptedAt && !i.revokedAt)) {
        skipped.push(`${email} (already invited)`);
        continue;
      }
      const token = randomBytes(18).toString("base64url");
      db.orgInvites.push({ token, orgId: o.id, email, createdAt: nowIso() });
      created.push({ email, token });
      // Event carries the token reference, not the address; HavenRoute looks the address up.
      publish("org.invited", "teams", `org/${o.id}`, { orgId: o.id, inviteToken: token }, o.id);
    }
    save();
    return { created, skipped };
  },

  revokeInvite(orgId: string, adminId: string, token: string): void {
    asAdmin(orgId, adminId);
    const inv = getDb().orgInvites.find((i) => i.orgId === orgId && i.token === token);
    if (inv && !inv.acceptedAt) inv.revokedAt = nowIso();
    save();
  },

  invitation(token: string) {
    const inv = getDb().orgInvites.find((i) => i.token === token);
    if (!inv || inv.revokedAt) return null;
    const o = getDb().organizations.find((x) => x.id === inv.orgId);
    return o ? { invite: inv, org: o, programs: o.programIds.map((id) => catalog.get(id)).filter((p): p is Product => !!p) } : null;
  },

  acceptInvite(token: string, userId: string): Organization {
    const inv = getDb().orgInvites.find((i) => i.token === token);
    if (!inv || inv.revokedAt) throw new PlatformError("invite_invalid", "This invitation is no longer valid. Ask your administrator for a new one.", 404);
    const user = identity.getUser(userId);
    if (!user) throw new PlatformError("not_signed_in", "Sign in to accept the invitation.", 401);
    if (user.email.toLowerCase() !== inv.email) {
      throw new PlatformError("invite_email_mismatch", `This invitation was sent to ${inv.email}. Sign in with that email address to accept it.`, 403);
    }
    const o = org(inv.orgId);
    this.addMember(o, user, "invite");
    inv.acceptedAt = inv.acceptedAt ?? nowIso();
    save();
    return o;
  },

  /** Organization the user could join through organization sign-in (simulated SSO by email domain). */
  ssoMatch(user: Pick<User, "id" | "email">): Organization | null {
    const d = emailDomain(user.email);
    const o = getDb().organizations.find((x) => x.ssoEnabled && x.domain === d);
    if (!o) return null;
    const m = getDb().orgMembers.find((x) => x.orgId === o.id && x.userId === user.id);
    return m ? null : o;
  },

  joinViaSso(orgId: string, userId: string): Organization {
    const o = org(orgId);
    const user = identity.getUser(userId);
    if (!user) throw new PlatformError("not_signed_in", "Sign in first.", 401);
    if (!o.ssoEnabled || !o.domain || emailDomain(user.email) !== o.domain) {
      throw new PlatformError("sso_not_allowed", "Your email address isn't part of this organization's sign-in domain.", 403);
    }
    this.addMember(o, user, "sso");
    return o;
  },

  addMember(o: Organization, user: User, via: OrgMember["via"]): OrgMember {
    const db = getDb();
    const existing = db.orgMembers.find((m) => m.orgId === o.id && m.userId === user.id);
    if (existing?.status === "active") return existing;
    if (activeMembers(o.id).length >= o.seats) {
      throw new PlatformError("no_seats", `${o.name} has no free seats. Ask your administrator to add seats or free one up.`, 409);
    }
    let m: OrgMember;
    if (existing) {
      existing.status = "active";
      existing.via = via;
      existing.joinedAt = nowIso();
      delete existing.revokedAt;
      m = existing;
    } else {
      m = { orgId: o.id, userId: user.id, status: "active", via, joinedAt: nowIso() };
      db.orgMembers.push(m);
    }
    if (!user.tenantIds.includes(o.id)) user.tenantIds.push(o.id);
    grantPrograms(o, user.id, o.programIds);
    publish("org.member.joined", "teams", `org/${o.id}`, { orgId: o.id, userId: user.id, via }, o.id);
    save();
    return m;
  },

  /** Free a seat. Access through the organization ends; the learner keeps progress and credentials. */
  revokeSeat(orgId: string, adminId: string, userId: string): void {
    const o = asAdmin(orgId, adminId);
    const m = getDb().orgMembers.find((x) => x.orgId === o.id && x.userId === userId && x.status === "active");
    if (!m) throw new PlatformError("not_member", "That person doesn't hold a seat.", 404);
    m.status = "revoked";
    m.revokedAt = nowIso();
    entitlements.revokeBySource(seatRef(o.id, userId));
    publish("org.member.removed", "teams", `org/${o.id}`, { orgId: o.id, userId }, o.id);
    save();
  },

  adminOf(userId: string): Organization[] {
    return getDb().organizations.filter((o) => o.adminIds.includes(userId));
  },

  membershipsOf(userId: string): { org: Organization; member: OrgMember }[] {
    const db = getDb();
    return db.orgMembers
      .filter((m) => m.userId === userId && m.status === "active")
      .map((m) => ({ org: db.organizations.find((o) => o.id === m.orgId)!, member: m }))
      .filter((x) => !!x.org);
  },

  /** Admin dashboard. Only this organization's people, only their progress on its academy. */
  dashboard(orgId: string, adminId: string) {
    const o = asAdmin(orgId, adminId);
    const db = getDb();
    const programs = o.programIds.map((id) => catalog.get(id)).filter((p): p is Product => !!p);
    const members = db.orgMembers
      .filter((m) => m.orgId === o.id)
      .map((m) => {
        const u = db.users.find((x) => x.id === m.userId)!;
        const progress = programs.map((p) => {
          const courseIds = p.courseIds.length ? p.courseIds : [p.id];
          const percent = Math.round(courseIds.reduce((a, c) => a + lms.courseProgress(u.id, c).percent, 0) / courseIds.length);
          const credential = db.credentials.find((c) => c.userId === u.id && c.productId === p.id && !c.revokedAt);
          return { productId: p.id, percent, completed: !!credential, credentialId: credential?.id ?? null };
        });
        const courseIds = new Set(programs.flatMap((p) => (p.courseIds.length ? p.courseIds : [p.id])));
        const last = db.progress
          .filter((x) => x.userId === u.id && courseIds.has(catalog.item(x.itemId)?.courseId ?? ""))
          .reduce<string | null>((a, x) => (!a || x.updatedAt > a ? x.updatedAt : a), null);
        return { userId: u.id, name: u.name, email: u.email, status: m.status, via: m.via, joinedAt: m.joinedAt, lastActive: last, progress };
      })
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "active" ? -1 : 1));
    const active = members.filter((m) => m.status === "active");
    const completions = active.reduce((a, m) => a + m.progress.filter((p) => p.completed).length, 0);
    const skills = [...new Set(programs.filter((p) => active.some((m) => m.progress.find((x) => x.productId === p.id)?.completed)).flatMap((p) => p.skills))];
    return {
      org: o,
      programs,
      members,
      invites: db.orgInvites.filter((i) => i.orgId === o.id && !i.acceptedAt && !i.revokedAt),
      seats: { total: o.seats, used: active.length, free: o.seats - active.length },
      totals: {
        completions,
        avgProgress: active.length && programs.length ? Math.round(active.reduce((a, m) => a + m.progress.reduce((b, p) => b + p.percent, 0) / programs.length, 0) / active.length) : 0,
        credentials: db.credentials.filter((c) => active.some((m) => m.userId === c.userId) && o.programIds.includes(c.productId) && !c.revokedAt).length,
        skillsGained: skills,
      },
      orders: db.orders.filter((x) => x.sessionId === `org:${o.id}`),
      seatPrice: commerceConfig.seatAnnual,
    };
  },

  reportCsv(orgId: string, adminId: string): string {
    const d = this.dashboard(orgId, adminId);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["name", "email", "seat_status", "joined_via", "joined_at", "last_active", ...d.programs.flatMap((p) => [`${p.code ?? p.slug}_progress_percent`, `${p.code ?? p.slug}_completed`])];
    const rows = d.members.map((m) => [m.name, m.email, m.status, m.via, m.joinedAt.slice(0, 10), m.lastActive?.slice(0, 10) ?? "", ...m.progress.flatMap((p) => [p.percent, p.completed ? "yes" : "no"])]);
    return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
  },
};
