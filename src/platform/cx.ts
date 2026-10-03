import { subscribe } from "./bus";
import { catalog } from "./catalog";
import { commerceConfig, money, publicUrl } from "./config";
import { identity } from "./identity";
import { getDb, nowIso, save } from "./store";
import type { CloudEvent, HelpArticle, Lead, OutboxEmail, Ticket } from "./types";
import { newId, PlatformError } from "./util";

/**
 * HavenConnect CX + HavenRoute email (Integration Spec §12).
 * Local stand-in: help-center retrieval for the AI agent, tickets, leads and an
 * email outbox that HavenRoute would deliver. Nothing is actually sent.
 */

const STOP = new Set("a an the and or to of in on for is are my i how do can what with it".split(" "));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

export const cx = {
  articles(q?: string): HelpArticle[] {
    const all = getDb().help;
    if (!q?.trim()) return all;
    const terms = words(q);
    return all
      .map((a) => ({ a, s: terms.filter((t) => (a.title + " " + a.body + " " + a.tags.join(" ")).toLowerCase().includes(t)).length }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);
  },

  article(id: string): HelpArticle | undefined {
    return getDb().help.find((a) => a.id === id);
  },

  /** HavenConnect AI agent: answers from articles and the learner's own context; never changes billing or grades. */
  chat(input: { userId: string | null; message: string; failedAttempts?: number; context?: Record<string, unknown> }): { reply: string; articles: HelpArticle[]; handoff: boolean } {
    const wantsHuman = /\b(human|agent|person|representative|someone)\b/i.test(input.message);
    if (wantsHuman || (input.failedAttempts ?? 0) >= 2) {
      return { reply: "I'll hand you to a member of the support team. They'll see your plan and active course, so you won't need to repeat yourself. Send your question below and we'll open a ticket.", articles: [], handoff: true };
    }
    const hits = this.articles(input.message).slice(0, 2);
    if (!hits.length) return { reply: "I couldn't find a help article for that. Try different words, or ask for a person and I'll open a ticket.", articles: [], handoff: false };
    return { reply: `${hits[0].body.split(/(?<=\.)\s/).slice(0, 2).join(" ")}`, articles: hits, handoff: false };
  },

  createTicket(input: { userId: string | null; category: Ticket["category"]; subject: string; body: string; context?: Record<string, unknown> }): Ticket {
    if (input.subject.trim().length < 3 || input.body.trim().length < 10) throw new PlatformError("invalid", "Add a subject and a short description.");
    const t: Ticket = { id: newId("tkt"), userId: input.userId, category: input.category, subject: input.subject.trim(), body: input.body.trim(), context: input.context ?? {}, status: "open", createdAt: nowIso() };
    getDb().tickets.push(t);
    save();
    return t;
  },

  tickets(): Ticket[] {
    return [...getDb().tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  resolveTicket(id: string): Ticket {
    const t = getDb().tickets.find((x) => x.id === id);
    if (!t) throw new PlatformError("not_found", "Ticket not found", 404);
    t.status = "resolved";
    save();
    return t;
  },

  createLead(input: Omit<Lead, "id" | "createdAt">): Lead {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new PlatformError("invalid_email", "Enter a valid work email.");
    if (!input.name.trim() || !input.organization.trim()) throw new PlatformError("invalid", "Add your name and organization.");
    const l: Lead = { id: newId("lead"), ...input, createdAt: nowIso() };
    getDb().leads.push(l);
    save();
    return l;
  },

  leads(): Lead[] {
    return [...getDb().leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  notices(userId: string, limit = 50) {
    return getDb()
      .notices.filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },

  unreadCount(userId: string): number {
    return getDb().notices.filter((n) => n.userId === userId && !n.readAt).length;
  },

  /** Marks one notice read and returns where it points. */
  openNotice(userId: string, id: string): string {
    const n = getDb().notices.find((x) => x.id === id && x.userId === userId);
    if (!n) throw new PlatformError("not_found", "Notification not found", 404);
    n.readAt = n.readAt ?? nowIso();
    save();
    return n.href;
  },

  markAllRead(userId: string): number {
    const t = nowIso();
    let n = 0;
    for (const x of getDb().notices) if (x.userId === userId && !x.readAt) {
      x.readAt = t;
      n++;
    }
    save();
    return n;
  },

  outbox(userEmail?: string): OutboxEmail[] {
    return getDb()
      .outbox.filter((e) => !userEmail || e.to === userEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

/* ---------------- HavenRoute: event → email templates ---------------- */

const fmtDate = (iso: unknown) => (typeof iso === "string" ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/New_York" }) : "");

/** Templates that carry one-time secrets stay out of the in-app inbox. */
const EMAIL_ONLY = new Set(["verify_email", "password_reset"]);

function noticeHref(template: string, data: Record<string, unknown>): string {
  const slug = typeof data.productId === "string" ? catalog.get(data.productId)?.slug : undefined;
  const map: Record<string, string> = {
    receipt: "/app/account",
    renewal_receipt: "/app/account",
    refund: "/app/account",
    cancellation: "/app/account",
    trial_started: "/app/account",
    trial_ending: "/app/account",
    credential_issued: "/app/credentials",
    deadline: "/app/calendar",
    live_reminder: "/app/live",
    seat_reserved: "/app/live",
    peer_disputed: "/app/grades",
    mfa_enabled: "/app/security",
    mfa_disabled: "/app/security",
    password_changed: "/app/security",
    aid_decision: slug ? `/learn/${slug}` : "/app",
    application_received: slug ? `/learn/${slug}/apply` : "/app/live",
    application_decision: slug ? `/learn/${slug}/apply` : "/app/live",
    course_published: typeof data.productId === "string" ? `/teach/${data.productId}` : "/teach",
    course_changes: typeof data.productId === "string" ? `/teach/${data.productId}` : "/teach",
  };
  return map[template] ?? "/app";
}

function email(evt: CloudEvent, template: string, subject: string, body: string) {
  const userId = evt.data.userId as string | undefined;
  const user = userId ? identity.getUser(userId) : undefined;
  if (!user) return;
  const db = getDb();
  db.outbox.push({ id: newId("eml"), to: user.email, template, subject, body: `Hi ${user.name.split(" ")[0]},\n\n${body}\n\n— Scholarion Academy`, eventId: evt.id, createdAt: nowIso() });
  if (!EMAIL_ONLY.has(template)) {
    db.notices.push({ id: newId("ntc"), userId: user.id, kind: template, title: subject, body: body.replace(/https?:\/\/\S+/g, "").replace(/\n{3,}/g, "\n\n").trim(), href: noticeHref(template, evt.data), createdAt: nowIso() });
    if (db.notices.length > 5000) db.notices.splice(0, db.notices.length - 5000);
  }
  save();
}

export function registerHavenRoute(): void {
  subscribe("havenroute", "trial.started", (e) =>
    email(e, "trial_started", "Your Scholarion Plus trial has started", `Your free trial runs until ${fmtDate(e.data.trialEnd)}. After that it's ${money(Number(e.data.amountAfterTrial))}/month. We'll remind you ${commerceConfig.trialReminderDays} days before you're charged. Cancel any time in Account → Billing: ${publicUrl()}/app/account`),
  );
  subscribe("havenroute", "trial.ending", (e) =>
    email(e, "trial_ending", "Reminder: your trial ends soon", `Your Scholarion Plus trial ends on ${fmtDate(e.data.trialEnd)}. On that date we'll charge ${money(Number(e.data.amount))} (sandbox). To avoid the charge, cancel before then: ${publicUrl()}/app/account`),
  );
  subscribe("havenroute", "order.paid", (e) => email(e, "receipt", "Your Scholarion receipt", `Payment received: ${money(Number(e.data.amount))} (sandbox). Order ${e.data.orderId}.`));
  subscribe("havenroute", "subscription.renewed", (e) => email(e, "renewal_receipt", "Your subscription renewed", `We charged ${money(Number(e.data.amount))} (sandbox). Your access continues until ${fmtDate(e.data.periodEnd)}.`));
  subscribe("havenroute", "subscription.canceled", (e) => email(e, "cancellation", "Your subscription is canceled", `You won't be charged again. You keep access until ${fmtDate(e.data.accessUntil)}, and your progress is saved.`));
  subscribe("havenroute", "refund.issued", (e) => email(e, "refund", "Your refund is on its way", `We've refunded ${money(Number(e.data.amount))} (sandbox). Your progress is saved if you come back.`));
  subscribe("havenroute", "aid.decided", (e) => {
    const p = catalog.get(e.data.productId as string);
    email(
      e,
      "aid_decision",
      `Financial aid decision: ${p?.title ?? "your program"}`,
      e.data.decision === "approved" ? `Good news — your application was approved at ${e.data.discountPercent}% off. You now have full access: ${publicUrl()}/app` : "Thank you for applying. We weren't able to approve this application. You can still audit eligible courses for free.",
    );
  });
  subscribe("havenroute", "credential.issued", (e) => {
    const p = catalog.get(e.data.productId as string);
    email(e, "credential_issued", "You earned a Scholarion credential", `Congratulations on completing ${p?.title}. View, download and share it here: ${publicUrl()}/verify/${e.data.credentialId}`);
  });
  subscribe("havenroute", "lms.deadline.approaching", (e) => {
    const i = catalog.item(e.data.itemId as string);
    email(e, "deadline", `Due soon: ${i?.title}`, `"${i?.title}" is due ${fmtDate(e.data.due)}. Need more time? You can reset your deadlines without penalty from the course page.`);
  });
  subscribe("havenroute", "org.invited", (e) => {
    const db = getDb();
    const inv = db.orgInvites.find((i) => i.token === e.data.inviteToken);
    const o = inv && db.organizations.find((x) => x.id === inv.orgId);
    if (!inv || !o) return;
    db.outbox.push({ id: newId("eml"), to: inv.email, template: "org_invite", subject: `${o.name} invited you to Scholarion Academy`, body: `Hello,\n\n${o.name} has given you a seat on Scholarion Academy. Accept your invitation here: ${publicUrl()}/join/${inv.token}\n\nSign in or create an account with ${inv.email}.\n\n— Scholarion Academy`, eventId: e.id, createdAt: nowIso() });
    save();
  });
  subscribe("havenroute", "org.member.joined", (e) => {
    const o = getDb().organizations.find((x) => x.id === e.data.orgId);
    email(e, "org_joined", `You're in: ${o?.name ?? "your organization"} on Scholarion`, `You now have access to your organization's programs. They're on your dashboard: ${publicUrl()}/app`);
  });
  subscribe("havenroute", "lms.peer_review.disputed", (e) => {
    const i = catalog.item(e.data.itemId as string);
    email(e, "peer_disputed", `Your project is with course staff: ${i?.title}`, "Your classmates' reviews didn't agree closely enough, so a member of course staff will grade your project. You'll get an email when it's done.");
  });
  subscribe("havenroute", "identity.email.verify_requested", (e) =>
    email(e, "verify_email", "Confirm your email for Scholarion", `Confirm this is your email address so we can send you course updates and certificates:\n${e.data.link}\n\nThe link works for 3 days. If you didn't create an account, ignore this email.`),
  );
  subscribe("havenroute", "identity.password.reset_requested", (e) =>
    email(e, "password_reset", "Reset your Scholarion password", `Use this link within 1 hour to choose a new password:\n${e.data.link}\n\nIf you didn't ask for this, ignore this email — your password stays the same.`),
  );
  subscribe("havenroute", "identity.password.changed", (e) =>
    email(e, "password_changed", "Your Scholarion password was changed", "Your password was just changed and other devices were signed out. If this wasn't you, reset your password now and contact support."),
  );
  subscribe("havenroute", "identity.mfa.enabled", (e) => email(e, "mfa_enabled", "Two-step sign-in is on", "Two-step sign-in is now on for your Scholarion account. You'll enter a code from your authenticator app when you sign in."));
  subscribe("havenroute", "identity.mfa.disabled", (e) => email(e, "mfa_disabled", "Two-step sign-in was turned off", "Two-step sign-in was turned off for your account. If this wasn't you, reset your password and contact support."));
  // Course builder: tell every author about the review decision.
  for (const [type, template] of [["authoring.course.published", "course_published"], ["authoring.course.changes_requested", "course_changes"]] as const) {
    subscribe("havenroute", type, (e) => {
      const p = getDb().products.find((x) => x.id === e.data.productId);
      if (!p?.authorIds) return;
      for (const userId of p.authorIds) {
        const ev = { ...e, data: { ...e.data, userId } };
        if (template === "course_published") email(ev, template, `Published: ${p.title}`, `A reviewer approved ${p.title}. It's live at ${publicUrl()}/learn/${p.slug}. Track enrollments and item analytics in Teach.`);
        else email(ev, template, `Changes requested: ${p.title}`, `A reviewer asked for changes before ${p.title} can publish:\n\n${p.review?.note ?? ""}\n\nOpen it in Teach to make the changes and resubmit.`);
      }
    });
  }
  subscribe("havenroute", "live.application.submitted", (e) => {
    const p = catalog.get(e.data.productId as string);
    email(e, "application_received", `Application received: ${p?.title}`, `Thanks for applying to ${p?.title}. Our admissions team reviews applications in the order they arrive, and we'll email you a decision.`);
  });
  subscribe("havenroute", "live.application.decided", (e) => {
    const p = catalog.get(e.data.productId as string);
    const d = e.data.decision;
    email(
      e,
      "application_decision",
      d === "accepted" ? `You're accepted: ${p?.title}` : d === "waitlisted" ? `You're on the waitlist: ${p?.title}` : `Your application: ${p?.title}`,
      d === "accepted"
        ? `Congratulations — you've been accepted to the ${p?.livePlan?.cohort} cohort. Reserve your seat (pay in full or in 3 installments): ${publicUrl()}/learn/${p?.slug}/apply`
        : d === "waitlisted"
          ? "The cohort is full right now. You're on the waitlist and we'll email you if a seat opens."
          : "Thank you for applying. We weren't able to offer you a seat in this cohort. You're welcome to apply to a future one.",
    );
  });
  subscribe("havenroute", "live.seat.reserved", (e) => {
    const p = catalog.get(e.data.productId as string);
    email(e, "seat_reserved", `Seat reserved: ${p?.title}`, `Your seat is reserved. Finish onboarding and see your session schedule here: ${publicUrl()}/app/live`);
  });
  subscribe("havenroute", "live.session.reminder", (e) => email(e, "live_reminder", "Your live session starts soon", `Your session "${e.data.title}" starts ${fmtDate(e.data.startsAt)}. Join from your dashboard 10 minutes before the start.`));
}
