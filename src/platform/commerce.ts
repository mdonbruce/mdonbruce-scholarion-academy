import { publish } from "./bus";
import { admissions } from "./admissions";
import { catalog } from "./catalog";
import { commerceConfig, money } from "./config";
import { formatMoney, installment, localize, region } from "./pricing";
import { entitlements } from "./entitlements";
import { getDb, now, nowIso, save } from "./store";
import type { AidApplication, CheckoutSession, Offer, PlanCode, Product, Subscription } from "./types";
import { addDays, DAY, newId, PlatformError, words } from "./util";

/**
 * Commerce (Integration Spec §6). The only service that grants or revokes paid
 * entitlements. SANDBOX: no real processor; a checkout is "paid" by an explicit
 * sandbox confirmation. Payment webhooks would land here, never on the site.
 */

const AUDIT_INCLUDES = ["Video lectures", "Readings", "Discussions (read-only for some courses)"];
const AUDIT_EXCLUDES = ["Graded quizzes and assignments", "Cloud Lab", "AI Tutor", "Certificate"];
const FULL_INCLUDES = ["Everything in audit", "Graded quizzes, labs and projects", "Cloud Lab workspaces", "AI Tutor", "Shareable certificate"];

function periodEnd(start: string, plan: PlanCode): string {
  if (plan === "plus_annual") return addDays(start, 365);
  return addDays(start, 30);
}

function planLabel(plan: PlanCode, product?: Product | null): string {
  switch (plan) {
    case "plus_monthly":
      return "Scholarion Plus — monthly";
    case "plus_annual":
      return "Scholarion Plus — annual";
    case "program_monthly":
      return `${product?.title ?? "Program"} — monthly subscription`;
    case "live_seat":
      return `${product?.title ?? "Live program"} — seat`;
    default:
      return product?.title ?? "One-time purchase";
  }
}

export const commerce = {
  /** GET /v1/commerce/offers — options for the Enroll modal with plain-language terms. */
  /** Offers in the learner's region and currency (sandbox price book, see pricing.ts). */
  offers(productId: string, regionCode?: string | null): Offer[] {
    const p = catalog.get(productId);
    if (!p) throw new PlatformError("not_found", "Product not found", 404);
    const c = commerceConfig;
    const cur = region(regionCode).currency;
    const L = (usd: number) => localize(usd, regionCode);
    const M = (usd: number) => formatMoney(L(usd), cur);
    const out: Offer[] = [];
    if (p.freeToAudit) {
      out.push({ code: "audit", label: "Audit for free", price: 0, currency: cur, interval: null, includes: AUDIT_INCLUDES, excludes: AUDIT_EXCLUDES, renewalTerms: "Free. No payment details needed.", placeholder: false });
    }
    if (p.format === "live") {
      out.push({
        code: "live_seat",
        label: "Apply for a seat",
        price: L(c.oneTime(p.type, p.hours)),
        currency: cur,
        interval: "once",
        includes: ["All live sessions for your cohort", "Mentor Q&A", "Recordings with captions", "Certificate on completion"],
        excludes: ["Not included in Scholarion Plus"],
        renewalTerms: `Apply first. If you're accepted, pay in full or in 3 monthly installments of ${formatMoney(installment(L(c.oneTime(p.type, p.hours)), 3, regionCode), cur)}. Cohort of ${p.livePlan?.capacity ?? "limited"} seats.`,
        placeholder: true,
      });
    } else if (p.type === "guided_project" || p.type === "course") {
      out.push({
        code: "one_time",
        label: "Buy this " + (p.type === "course" ? "course" : "project"),
        price: L(c.oneTime(p.type, p.hours)),
        currency: cur,
        interval: "once",
        includes: FULL_INCLUDES,
        excludes: [],
        renewalTerms: "One-time payment. No renewal.",
        placeholder: true,
      });
    }
    if (p.format === "self_paced" && (p.type === "professional_certificate" || p.type === "specialization" || p.type === "bundle")) {
      out.push({
        code: "program_monthly",
        label: "Subscribe to this program",
        price: L(c.programMonthly),
        currency: cur,
        interval: "month",
        includes: [...FULL_INCLUDES, "Every course in this program"],
        excludes: ["Other programs", "Live programs"],
        renewalTerms: `Renews monthly at ${M(c.programMonthly)} until you cancel. Cancel any time in Account → Billing; access continues to the end of the period you paid for.`,
        placeholder: true,
      });
    }
    if (p.plusEligible) {
      out.push({
        code: "plus_monthly",
        label: `Start a ${c.trialDays}-day free trial of Scholarion Plus`,
        price: L(c.plusMonthly),
        currency: cur,
        interval: "month",
        trialDays: c.trialDays,
        includes: ["Everything in this " + p.type.replace("_", " "), "All Plus-eligible self-paced courses, certificates and guided projects"],
        excludes: ["Live programs (unless marked as included)"],
        renewalTerms: `Free for ${c.trialDays} days, then ${M(c.plusMonthly)}/month. We email you ${c.trialReminderDays} days before the first charge. Cancel before the trial ends and you pay nothing.`,
        placeholder: true,
      });
    }
    if (p.type !== "guided_project") {
      out.push({
        code: "financial_aid",
        label: "Apply for financial aid",
        price: null,
        currency: cur,
        interval: null,
        includes: ["Up to 100% off this " + (p.type === "course" ? "course" : "program"), "Full access once approved"],
        excludes: ["Approval is not automatic; a person reviews every application"],
        renewalTerms: "No payment while your application is reviewed.",
        placeholder: false,
      });
    }
    return out;
  },

  plansSummary(regionCode?: string | null) {
    const c = commerceConfig;
    const L = (usd: number) => localize(usd, regionCode);
    return {
      currency: region(regionCode).currency,
      region: region(regionCode).code,
      programMonthly: L(c.programMonthly),
      plusMonthly: L(c.plusMonthly),
      plusAnnual: L(c.plusAnnual),
      annualSavings: Math.max(0, L(c.plusMonthly) * 12 - L(c.plusAnnual)),
      trialDays: c.trialDays,
      refundDays: c.refundDays,
      reminderDays: c.trialReminderDays,
      placeholder: c.placeholder,
    };
  },

  /** POST /v1/commerce/checkout-sessions (idempotent). */
  createCheckout(input: { userId: string; plan: PlanCode; productId: string | null; idempotencyKey: string; installments?: number; region?: string | null }): CheckoutSession {
    const db = getDb();
    const existing = db.checkouts.find((c) => c.idempotencyKey === input.idempotencyKey && c.userId === input.userId);
    if (existing) return existing;
    const c = commerceConfig;
    const product = input.productId ? catalog.get(input.productId) ?? null : null;
    if (input.plan !== "plus_monthly" && input.plan !== "plus_annual" && !product) {
      throw new PlatformError("not_found", "Product not found", 404);
    }
    if (input.plan.startsWith("plus") && db.subscriptions.some((s) => s.userId === input.userId && s.plan.startsWith("plus") && (s.status === "active" || s.status === "trialing"))) {
      throw new PlatformError("already_subscribed", "You already have Scholarion Plus.", 409);
    }
    let installments: number | undefined;
    if (input.plan === "live_seat") {
      if (!admissions.canReserve(input.userId, product!.id)) {
        throw new PlatformError("apply_first", "Live seats are reserved after your application is accepted. Apply from the program page.", 403);
      }
      installments = input.installments === 3 ? 3 : 1;
    }
    const start = nowIso();
    const hadTrial = db.subscriptions.some((s) => s.userId === input.userId && s.trialEnd);
    const trialEndsAt = input.plan === "plus_monthly" && !hadTrial ? addDays(start, c.trialDays) : null;
    const reg = region(input.region);
    const amount = localize(
      input.plan === "plus_monthly" ? c.plusMonthly : input.plan === "plus_annual" ? c.plusAnnual : input.plan === "program_monthly" ? c.programMonthly : c.oneTime(product!.type, product!.hours),
      reg.code,
    );
    const installmentAmount = installments && installments > 1 ? installment(amount, installments, reg.code) : undefined;
    const renewsAt = input.plan === "one_time" || (input.plan === "live_seat" && !installmentAmount) ? null : installmentAmount ? addDays(start, 30) : trialEndsAt ?? periodEnd(start, input.plan);
    const session: CheckoutSession = {
      id: newId("cs"),
      userId: input.userId,
      productId: product?.id ?? null,
      plan: input.plan,
      amount,
      currency: reg.currency,
      region: reg.code,
      trialEndsAt,
      renewsAt,
      refundPolicy:
        input.plan === "plus_annual"
          ? `Full refund within ${c.refundDays} days of purchase. After that, cancel any time and keep access to the end of the year.`
          : input.plan === "one_time" || input.plan === "live_seat"
            ? `Refunds within ${c.refundDays} days if you have not completed graded work.`
            : "Monthly payments are not refunded; cancel any time and keep access to the end of the month.",
      status: "open",
      installments,
      installmentAmount,
      idempotencyKey: input.idempotencyKey,
      createdAt: start,
    };
    db.checkouts.push(session);
    save();
    return session;
  },

  getCheckout(id: string, userId: string): CheckoutSession | undefined {
    return getDb().checkouts.find((c) => c.id === id && c.userId === userId);
  },

  /** Sandbox confirmation — stands in for the processor's payment_succeeded webhook. */
  confirmSandboxPayment(sessionId: string, userId: string) {
    const db = getDb();
    const cs = db.checkouts.find((c) => c.id === sessionId && c.userId === userId);
    if (!cs) throw new PlatformError("not_found", "Checkout not found", 404);
    if (cs.status === "paid") return { session: cs, subscription: db.subscriptions.find((s) => s.id === cs.id.replace("cs_", "sub_")) };
    cs.status = "paid";
    const product = cs.productId ? catalog.get(cs.productId) : undefined;
    const t = nowIso();
    const orderId = newId("ord");
    const charged = cs.trialEndsAt ? 0 : cs.installmentAmount ?? cs.amount;
    const suffix = cs.trialEndsAt ? " (free trial)" : cs.installmentAmount ? ` (installment 1 of ${cs.installments})` : "";
    db.orders.push({ id: orderId, userId, sessionId: cs.id, amount: charged, currency: cs.currency, description: planLabel(cs.plan, product) + suffix, status: "paid", createdAt: t });

    let subscription: Subscription | undefined;
    if (cs.plan === "one_time" || cs.plan === "live_seat") {
      entitlements.grant({ userId, resource: { kind: "product", id: cs.productId! }, level: cs.plan === "live_seat" ? "live_seat" : "full", source: "purchase", sourceRef: orderId });
      if (cs.plan === "live_seat" && cs.installmentAmount && cs.installments) {
        subscription = {
          id: cs.id.replace("cs_", "sub_"),
          userId,
          plan: "live_seat",
          productId: cs.productId,
          status: "active",
          currentPeriodStart: t,
          currentPeriodEnd: addDays(t, 30),
          trialEnd: null,
          cancelAtPeriodEnd: false,
          amount: cs.installmentAmount,
          currency: cs.currency,
          installmentsTotal: cs.installments,
          installmentsPaid: 1,
          createdAt: t,
        };
        db.subscriptions.push(subscription);
      }
      if (cs.plan === "live_seat") admissions.markReserved(userId, cs.productId!, cs.installmentAmount ? "installments" : "full");
      publish("order.paid", "commerce", `user/${userId}`, { userId, orderId, productId: cs.productId, plan: cs.plan, amount: charged, currency: cs.currency });
    } else {
      subscription = {
        id: cs.id.replace("cs_", "sub_"),
        userId,
        plan: cs.plan,
        productId: cs.plan.startsWith("plus") ? null : cs.productId,
        status: cs.trialEndsAt ? "trialing" : "active",
        currentPeriodStart: t,
        currentPeriodEnd: cs.trialEndsAt ?? periodEnd(t, cs.plan),
        trialEnd: cs.trialEndsAt,
        cancelAtPeriodEnd: false,
        amount: cs.amount,
        currency: cs.currency,
        createdAt: t,
      };
      db.subscriptions.push(subscription);
      entitlements.grant({
        userId,
        resource: subscription.productId ? { kind: "product", id: subscription.productId } : { kind: "plus", id: "plus" },
        level: "full",
        source: subscription.productId ? "program_subscription" : "plus",
        sourceRef: subscription.id,
        validTo: subscription.currentPeriodEnd,
      });
      if (subscription.status === "trialing") {
        publish("trial.started", "commerce", `user/${userId}`, { userId, subscriptionId: subscription.id, trialEnd: subscription.trialEnd, amountAfterTrial: subscription.amount, currency: subscription.currency });
      } else {
        publish("order.paid", "commerce", `user/${userId}`, { userId, orderId, subscriptionId: subscription.id, plan: cs.plan, amount: charged, currency: cs.currency });
      }
    }
    save();
    return { session: cs, subscription };
  },

  subscriptionsFor(userId: string): Subscription[] {
    return getDb().subscriptions.filter((s) => s.userId === userId);
  },

  ordersFor(userId: string) {
    return getDb().orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Cancel: one step, access to period end, progress kept (Spec §5.4). */
  cancel(subscriptionId: string, userId: string): Subscription {
    const s = getDb().subscriptions.find((x) => x.id === subscriptionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Subscription not found", 404);
    if (s.status === "canceled" || s.status === "expired" || s.status === "refunded") return s;
    s.cancelAtPeriodEnd = true;
    s.status = "canceled";
    entitlements.endBySource(s.id, s.currentPeriodEnd);
    publish("subscription.canceled", "commerce", `user/${userId}`, { userId, subscriptionId: s.id, accessUntil: s.currentPeriodEnd });
    save();
    return s;
  },

  pause(subscriptionId: string, userId: string): Subscription {
    const s = getDb().subscriptions.find((x) => x.id === subscriptionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Subscription not found", 404);
    if (s.status !== "active") throw new PlatformError("not_active", "Only an active paid subscription can be paused.");
    s.status = "paused";
    entitlements.endBySource(s.id, nowIso());
    publish("subscription.paused", "commerce", `user/${userId}`, { userId, subscriptionId: s.id });
    save();
    return s;
  },

  resume(subscriptionId: string, userId: string): Subscription {
    const s = getDb().subscriptions.find((x) => x.id === subscriptionId && x.userId === userId);
    if (!s || s.status !== "paused") throw new PlatformError("not_paused", "Subscription is not paused.");
    s.status = "active";
    const t = nowIso();
    s.currentPeriodStart = t;
    s.currentPeriodEnd = periodEnd(t, s.plan);
    entitlements.grant({ userId, resource: s.productId ? { kind: "product", id: s.productId } : { kind: "plus", id: "plus" }, level: "full", source: s.productId ? "program_subscription" : "plus", sourceRef: s.id, validTo: s.currentPeriodEnd });
    save();
    return s;
  },

  /** POST /v1/commerce/refunds — annual money-back window; outside it the policy is explained. */
  requestRefund(subscriptionId: string, userId: string): { status: "refunded" | "policy_explained"; message: string } {
    const db = getDb();
    const s = db.subscriptions.find((x) => x.id === subscriptionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Subscription not found", 404);
    const c = commerceConfig;
    const ageDays = (now().getTime() - Date.parse(s.createdAt)) / DAY;
    if (s.plan !== "plus_annual") {
      return { status: "policy_explained", message: "Monthly plans aren't refunded. You can cancel any time and keep access until the end of the month you paid for." };
    }
    if (ageDays > c.refundDays) {
      return { status: "policy_explained", message: `The ${c.refundDays}-day money-back window for annual plans has passed. You can cancel and keep access until ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US", { dateStyle: "long" })}.` };
    }
    s.status = "refunded";
    entitlements.revokeBySource(s.id);
    for (const o of db.orders) if (o.userId === userId && o.sessionId === s.id.replace("sub_", "cs_")) o.status = "refunded";
    publish("refund.issued", "commerce", `user/${userId}`, { userId, subscriptionId: s.id, amount: s.amount, currency: s.currency });
    save();
    return { status: "refunded", message: `Refund of ${money(s.amount, s.currency)} issued (sandbox). Access has ended; your progress is saved.` };
  },

  /** Scheduler tick: trial reminders, trial conversion, renewals, period-end expiry. */
  tick(): { reminders: number; converted: number; renewed: number; expired: number } {
    const db = getDb();
    const t = nowIso();
    const r = { reminders: 0, converted: 0, renewed: 0, expired: 0 };
    for (const s of db.subscriptions) {
      if (s.status === "trialing" && s.trialEnd) {
        const remindAt = addDays(s.trialEnd, -commerceConfig.trialReminderDays);
        if (!s.reminderSentAt && t >= remindAt) {
          s.reminderSentAt = t;
          publish("trial.ending", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, trialEnd: s.trialEnd, amount: s.amount, currency: s.currency });
          r.reminders++;
        }
        if (t >= s.trialEnd) {
          s.status = "active";
          s.currentPeriodStart = s.trialEnd;
          s.currentPeriodEnd = periodEnd(s.trialEnd, s.plan);
          entitlements.endBySource(s.id, s.currentPeriodEnd);
          db.orders.push({ id: newId("ord"), userId: s.userId, sessionId: s.id.replace("sub_", "cs_"), amount: s.amount, currency: s.currency ?? commerceConfig.currency, description: `${planLabel(s.plan)} (first charge after trial)`, status: "paid", createdAt: t });
          publish("subscription.renewed", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, periodEnd: s.currentPeriodEnd, amount: s.amount, currency: s.currency });
          r.converted++;
        }
      } else if (s.status === "active" && s.installmentsTotal && t >= s.currentPeriodEnd) {
        // Payment plan: charge the next installment; the plan completes after the last one.
        const n = (s.installmentsPaid ?? 1) + 1;
        s.installmentsPaid = n;
        db.orders.push({ id: newId("ord"), userId: s.userId, sessionId: s.id.replace("sub_", "cs_"), amount: s.amount, currency: s.currency ?? commerceConfig.currency, description: `${planLabel(s.plan, s.productId ? catalog.get(s.productId) : null)} (installment ${n} of ${s.installmentsTotal})`, status: "paid", createdAt: t });
        if (n >= s.installmentsTotal) s.status = "completed";
        else {
          s.currentPeriodStart = s.currentPeriodEnd;
          s.currentPeriodEnd = addDays(s.currentPeriodEnd, 30);
        }
        publish("order.paid", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, plan: s.plan, amount: s.amount, currency: s.currency });
        r.renewed++;
      } else if (s.status === "active" && t >= s.currentPeriodEnd) {
        s.currentPeriodStart = s.currentPeriodEnd;
        s.currentPeriodEnd = periodEnd(s.currentPeriodStart, s.plan);
        entitlements.endBySource(s.id, s.currentPeriodEnd);
        db.orders.push({ id: newId("ord"), userId: s.userId, sessionId: s.id.replace("sub_", "cs_"), amount: s.amount, currency: s.currency ?? commerceConfig.currency, description: `${planLabel(s.plan)} (renewal)`, status: "paid", createdAt: t });
        publish("subscription.renewed", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, periodEnd: s.currentPeriodEnd, amount: s.amount, currency: s.currency });
        r.renewed++;
      } else if (s.status === "canceled" && t >= s.currentPeriodEnd) {
        s.status = "expired";
        publish("subscription.expired", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id });
        r.expired++;
      }
    }
    save();
    return r;
  },

  /* ---------------- Financial aid (Spec §5.5) ---------------- */

  aidGuidance: { needMin: 150, needMax: 500, goalsMin: 150, goalsMax: 500, decisionDays: 15 },

  applyForAid(input: { userId: string; productId: string; background: string; need: string; goals: string; commitment: boolean }): AidApplication {
    const g = this.aidGuidance;
    const product = catalog.get(input.productId);
    if (!product) throw new PlatformError("not_found", "Product not found", 404);
    if (!input.commitment) throw new PlatformError("commitment_required", "Please confirm you'll complete the coursework.");
    if (words(input.need) < g.needMin) throw new PlatformError("need_too_short", `Tell us a bit more about your financial need (at least ${g.needMin} words).`);
    if (words(input.goals) < g.goalsMin) throw new PlatformError("goals_too_short", `Tell us a bit more about your goals (at least ${g.goalsMin} words).`);
    const db = getDb();
    if (db.aid.some((a) => a.userId === input.userId && a.productId === input.productId && a.status === "submitted")) {
      throw new PlatformError("already_applied", "You already have an application under review for this program.", 409);
    }
    const app: AidApplication = { id: newId("aid"), ...input, status: "submitted", createdAt: nowIso() };
    db.aid.push(app);
    publish("aid.submitted", "commerce", `user/${input.userId}`, { userId: input.userId, applicationId: app.id, productId: input.productId });
    save();
    return app;
  },

  aidQueue(): AidApplication[] {
    return getDb().aid.filter((a) => a.status === "submitted").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  aidFor(userId: string): AidApplication[] {
    return getDb().aid.filter((a) => a.userId === userId);
  },

  /** Reviewer-only. A human decides; AI may summarise but never decides. */
  decideAid(applicationId: string, reviewerId: string, decision: "approved" | "declined", discountPercent = 100): AidApplication {
    const db = getDb();
    const a = db.aid.find((x) => x.id === applicationId);
    if (!a) throw new PlatformError("not_found", "Application not found", 404);
    if (a.status !== "submitted") throw new PlatformError("already_decided", "This application already has a decision.", 409);
    a.status = decision;
    a.reviewerId = reviewerId;
    a.decidedAt = nowIso();
    if (decision === "approved") {
      a.discountPercent = Math.min(100, Math.max(1, discountPercent));
      entitlements.grant({ userId: a.userId, resource: { kind: "product", id: a.productId }, level: "full", source: "financial_aid", sourceRef: a.id, validTo: addDays(nowIso(), 180) });
    }
    publish("aid.decided", "commerce", `user/${a.userId}`, { userId: a.userId, applicationId: a.id, productId: a.productId, decision, discountPercent: a.discountPercent ?? 0 });
    save();
    return a;
  },

  /** Plain extractive summary for reviewers (AI may summarise, never decide). */
  summariseAid(a: AidApplication): string {
    const first = (s: string) => s.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return `Need: ${first(a.need)} Goals: ${first(a.goals)} (${words(a.need)} + ${words(a.goals)} words)`;
  },
};
