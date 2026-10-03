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

  outbox(userEmail?: string): OutboxEmail[] {
    return getDb()
      .outbox.filter((e) => !userEmail || e.to === userEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

/* ---------------- HavenRoute: event → email templates ---------------- */

const fmtDate = (iso: unknown) => (typeof iso === "string" ? new Date(iso).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "America/New_York" }) : "");

function email(evt: CloudEvent, template: string, subject: string, body: string) {
  const userId = evt.data.userId as string | undefined;
  const user = userId ? identity.getUser(userId) : undefined;
  if (!user) return;
  getDb().outbox.push({ id: newId("eml"), to: user.email, template, subject, body: `Hi ${user.name.split(" ")[0]},\n\n${body}\n\n— Scholarion Academy`, eventId: evt.id, createdAt: nowIso() });
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
  subscribe("havenroute", "live.session.reminder", (e) => email(e, "live_reminder", "Your live session starts soon", `Your session "${e.data.title}" starts ${fmtDate(e.data.startsAt)}. Join from your dashboard 10 minutes before the start.`));
}
