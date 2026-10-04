import { publish } from "./bus";
import { admissions } from "./admissions";
import { catalog } from "./catalog";
import { commerceConfig, money } from "./config";
import { formatMoney, installment, localize, region, REGIONS } from "./pricing";
import { entitlements } from "./entitlements";
import { getDb, now, nowIso, save } from "./store";
import type { AidApplication, CheckoutSession, CommerceSettings, Coupon, Offer, Order, PlanCode, Product, RefundRequest, Subscription } from "./types";
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

/** Rounds to the currency's smallest sensible unit (whole units for NGN/INR). */
export function roundMoney(n: number, regionCode?: string | null): number {
  const unit = region(regionCode).step >= 50 ? 1 : 0.01;
  return Number((Math.round(n / unit) * unit).toFixed(2));
}

function regionForCurrency(currency: string | undefined): string {
  return Object.values(REGIONS).find((r) => r.currency === currency)?.code ?? "US";
}

/** Approved partial aid (1–99% off) waiting to be used at checkout for this exact product. */
function partialAid(userId: string, productId: string): AidApplication | undefined {
  return getDb()
    .aid.filter((a) => a.userId === userId && a.productId === productId && a.status === "approved" && (a.discountPercent ?? 100) < 100)
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0];
}

/** Recomputes coupon discount, simulated tax and the amount due today. */
function price(cs: CheckoutSession): CheckoutSession {
  const first = cs.trialEndsAt ? 0 : cs.installmentAmount ?? cs.amount;
  const discount = cs.couponPercent ? roundMoney((first * cs.couponPercent) / 100, cs.region) : 0;
  const rate = commerceConfig.taxRate(cs.region);
  const tax = rate ? roundMoney(((first - discount) * rate) / 100, cs.region) : 0;
  cs.discount = discount;
  cs.taxRate = rate;
  cs.tax = tax;
  cs.dueToday = roundMoney(first - discount + tax, cs.region);
  return cs;
}

const PROGRAM_TYPES = new Set(["professional_certificate", "specialization", "bundle"]);
const COUPON_RE = /^[A-Z0-9-]{3,24}$/;

export type PlanChangeTarget = "plus_monthly" | "program_monthly" | "plus_annual";

export interface PlanChangeQuote {
  from: PlanCode;
  to: PlanChangeTarget;
  allowed: boolean;
  reason?: string;
  currency: string;
  newAmount: number;
  interval: "month" | "year";
  remainingDays: number;
  periodDays: number;
  credit: number;
  chargeToday: number;
  creditToNextBill: number;
  newPeriodEnd: string;
  /** Plain-language proration disclosure shown before confirming. */
  explanation: string;
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
    const listAmount = localize(
      input.plan === "plus_monthly" ? c.plusMonthly : input.plan === "plus_annual" ? c.plusAnnual : input.plan === "program_monthly" ? c.programMonthly : c.oneTime(product!.type, product!.hours),
      reg.code,
    );
    // Approved partial financial aid lowers this program's own price (100% aid grants access directly).
    const aid = product && (input.plan === "one_time" || input.plan === "program_monthly") ? partialAid(input.userId, product.id) : undefined;
    const amount = aid ? roundMoney((listAmount * (100 - aid.discountPercent!)) / 100, reg.code) : listAmount;
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
      ...(aid ? { listAmount, aidDiscountPercent: aid.discountPercent, aidApplicationId: aid.id } : {}),
      idempotencyKey: input.idempotencyKey,
      createdAt: start,
    };
    price(session);
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
    let coupon: Coupon | undefined;
    if (cs.couponCode) coupon = this.validateCoupon(cs.couponCode);
    // Charge exactly what the review page showed (amounts are fixed when the checkout is priced).
    cs.status = "paid";
    if (coupon) coupon.redemptions++;
    const product = cs.productId ? catalog.get(cs.productId) : undefined;
    const t = nowIso();
    const orderId = newId("ord");
    const charged = cs.dueToday ?? (cs.trialEndsAt ? 0 : cs.installmentAmount ?? cs.amount);
    const suffix = cs.trialEndsAt ? " (free trial)" : cs.installmentAmount ? ` (installment 1 of ${cs.installments})` : "";
    const aidNote = cs.aidDiscountPercent ? ` (financial aid ${cs.aidDiscountPercent}% off)` : "";
    db.orders.push({
      id: orderId,
      userId,
      sessionId: cs.id,
      amount: charged,
      currency: cs.currency,
      description: planLabel(cs.plan, product) + suffix + aidNote,
      status: "paid",
      createdAt: t,
      subtotal: cs.trialEndsAt ? 0 : cs.installmentAmount ?? cs.amount,
      discount: cs.discount || undefined,
      couponCode: cs.couponCode,
      tax: cs.tax || undefined,
      taxRate: cs.taxRate || undefined,
      plan: cs.plan,
      productId: cs.productId,
    });

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
    const since = s.planChangedAt ?? s.createdAt;
    const ageDays = (now().getTime() - Date.parse(since)) / DAY;
    if (s.plan !== "plus_annual") {
      return { status: "policy_explained", message: "Monthly plans aren't refunded. You can cancel any time and keep access until the end of the month you paid for." };
    }
    if (ageDays > c.refundDays) {
      return { status: "policy_explained", message: `The ${c.refundDays}-day money-back window for annual plans has passed. You can cancel and keep access until ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US", { dateStyle: "long" })}.` };
    }
    s.status = "refunded";
    entitlements.revokeBySource(s.id);
    // Refund what was actually paid for the annual term (an upgrade charge is net of its proration credit).
    const paid = db.orders.filter((o) => o.userId === userId && o.sessionId === s.id.replace("sub_", "cs_") && o.status === "paid" && o.createdAt >= since);
    const amount = paid.length ? roundMoney(paid.reduce((a, o) => a + o.amount, 0), regionForCurrency(s.currency)) : s.amount;
    for (const o of paid) o.status = "refunded";
    publish("refund.issued", "commerce", `user/${userId}`, { userId, subscriptionId: s.id, amount, currency: s.currency });
    save();
    return { status: "refunded", message: `Refund of ${money(amount, s.currency)} issued (sandbox). Access has ended; your progress is saved.` };
  },

  /** Scheduler tick: trial reminders, trial conversion, renewals, period-end expiry. */
  tick(): { reminders: number; converted: number; renewed: number; expired: number; renewalNotices: number } {
    const db = getDb();
    const t = nowIso();
    const r = { reminders: 0, converted: 0, renewed: 0, expired: 0, renewalNotices: 0 };
    for (const s of db.subscriptions) {
      // Pre-renewal notice: N days before a renewal charge, once per period (trials use the trial reminder).
      if (s.status === "active" && !s.installmentsTotal && !s.cancelAtPeriodEnd && t < s.currentPeriodEnd && t >= addDays(s.currentPeriodEnd, -commerceConfig.renewalNoticeDays) && s.renewalNoticeFor !== s.currentPeriodEnd) {
        s.renewalNoticeFor = s.currentPeriodEnd;
        const due = Math.max(0, roundMoney(s.amount - (s.credit ?? 0), regionForCurrency(s.currency)));
        publish("subscription.renewal_upcoming", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, plan: s.plan, renewsAt: s.currentPeriodEnd, amount: due, currency: s.currency });
        r.renewalNotices++;
      }
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
        // A proration credit from a plan change is used up against the next charges.
        const credit = Math.min(s.amount, s.credit ?? 0);
        const charge = roundMoney(s.amount - credit, regionForCurrency(s.currency));
        s.credit = s.credit ? roundMoney(s.credit - credit, regionForCurrency(s.currency)) || undefined : undefined;
        db.orders.push({ id: newId("ord"), userId: s.userId, sessionId: s.id.replace("sub_", "cs_"), amount: charge, currency: s.currency ?? commerceConfig.currency, description: `${planLabel(s.plan, s.productId ? catalog.get(s.productId) : null)} (renewal${credit ? `, ${money(credit, s.currency)} credit applied` : ""})`, status: "paid", createdAt: t, subtotal: s.amount, discount: credit || undefined, plan: s.plan, productId: s.productId });
        publish("subscription.renewed", "commerce", `user/${s.userId}`, { userId: s.userId, subscriptionId: s.id, periodEnd: s.currentPeriodEnd, amount: charge, currency: s.currency });
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
      a.discountPercent = Math.min(100, Math.max(1, Math.round(discountPercent)));
      // 100% aid is free access; a partial grant lowers the price at checkout instead.
      if (a.discountPercent === 100) entitlements.grant({ userId: a.userId, resource: { kind: "product", id: a.productId }, level: "full", source: "financial_aid", sourceRef: a.id, validTo: addDays(nowIso(), 180) });
    }
    publish("aid.decided", "commerce", `user/${a.userId}`, { userId: a.userId, applicationId: a.id, productId: a.productId, decision, discountPercent: a.discountPercent ?? 0 });
    save();
    return a;
  },

  /** Approved partial aid for a product, shown on product and checkout pages. */
  aidDiscountFor(userId: string, productId: string): number | null {
    return partialAid(userId, productId)?.discountPercent ?? null;
  },

  /* ---------------- Coupons (sandbox) ---------------- */

  coupons(): Coupon[] {
    return [...getDb().coupons].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  createCoupon(adminId: string, input: { code: string; percentOff: number; expiresInDays?: number | null; maxRedemptions?: number | null }): Coupon {
    const code = (input.code ?? "").trim().toUpperCase();
    if (!COUPON_RE.test(code)) throw new PlatformError("invalid_code", "Codes are 3–24 letters, numbers or hyphens.");
    const pct = Math.round(Number(input.percentOff));
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) throw new PlatformError("invalid_percent", "Percent off must be between 1 and 100.");
    const db = getDb();
    if (db.coupons.some((c) => c.code === code)) throw new PlatformError("duplicate_code", "That code already exists.", 409);
    const days = input.expiresInDays ? Math.round(Number(input.expiresInDays)) : null;
    if (days !== null && (!Number.isFinite(days) || days < 1 || days > 730)) throw new PlatformError("invalid_expiry", "Expiry must be between 1 and 730 days.");
    const max = input.maxRedemptions ? Math.round(Number(input.maxRedemptions)) : null;
    if (max !== null && (!Number.isFinite(max) || max < 1)) throw new PlatformError("invalid_max", "Maximum redemptions must be 1 or more.");
    const c: Coupon = { code, percentOff: pct, expiresAt: days ? addDays(nowIso(), days) : null, maxRedemptions: max, redemptions: 0, createdBy: adminId, createdAt: nowIso() };
    db.coupons.push(c);
    save();
    return c;
  },

  expireCoupon(code: string): Coupon {
    const c = getDb().coupons.find((x) => x.code === code.toUpperCase());
    if (!c) throw new PlatformError("not_found", "Coupon not found", 404);
    c.expiredAt ??= nowIso();
    save();
    return c;
  },

  /** Throws a plain-language error when a code can't be used. */
  validateCoupon(code: string): Coupon {
    const c = getDb().coupons.find((x) => x.code === (code ?? "").trim().toUpperCase());
    if (!c) throw new PlatformError("coupon_invalid", "That code isn't valid. Check the spelling and try again.");
    const t = nowIso();
    if (c.expiredAt || (c.expiresAt && t >= c.expiresAt)) throw new PlatformError("coupon_expired", "That code has expired.");
    if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) throw new PlatformError("coupon_used_up", "That code has reached its redemption limit.");
    return c;
  },

  applyCoupon(sessionId: string, userId: string, code: string): CheckoutSession {
    const cs = getDb().checkouts.find((c) => c.id === sessionId && c.userId === userId);
    if (!cs) throw new PlatformError("not_found", "Checkout not found", 404);
    if (cs.status !== "open") throw new PlatformError("checkout_closed", "This checkout is already complete.");
    if (cs.trialEndsAt) throw new PlatformError("coupon_trial", "Codes apply to paid checkouts. Your free trial already costs nothing today.");
    if (cs.aidDiscountPercent) throw new PlatformError("coupon_aid", "Your financial aid discount is already applied; codes can't be combined with it.");
    const c = this.validateCoupon(code);
    cs.couponCode = c.code;
    cs.couponPercent = c.percentOff;
    price(cs);
    save();
    return cs;
  },

  removeCoupon(sessionId: string, userId: string): CheckoutSession {
    const cs = getDb().checkouts.find((c) => c.id === sessionId && c.userId === userId);
    if (!cs || cs.status !== "open") throw new PlatformError("not_found", "Checkout not found", 404);
    delete cs.couponCode;
    delete cs.couponPercent;
    price(cs);
    save();
    return cs;
  },

  /* ---------------- Price book & billing settings (sandbox) ---------------- */

  settings() {
    const c = commerceConfig;
    return {
      programMonthly: c.programMonthly,
      plusMonthly: c.plusMonthly,
      plusAnnual: c.plusAnnual,
      trialDays: c.trialDays,
      renewalNoticeDays: c.renewalNoticeDays,
      refundDays: c.refundDays,
      taxRates: Object.fromEntries(Object.keys(REGIONS).map((r) => [r, c.taxRate(r)])) as Record<string, number>,
      updatedAt: getDb().commerceSettings.updatedAt ?? null,
    };
  },

  updateSettings(adminId: string, input: Record<string, string | undefined>): CommerceSettings {
    const db = getDb();
    const next: CommerceSettings = { ...db.commerceSettings, taxRates: { ...(db.commerceSettings.taxRates ?? {}) } };
    const setPrice = (k: "programMonthly" | "plusMonthly" | "plusAnnual", label: string) => {
      if (input[k] === undefined || input[k] === "") return;
      const v = Number(input[k]);
      if (!Number.isFinite(v) || v <= 0 || v > 10000) throw new PlatformError("invalid_price", `${label} must be a price between 0 and 10,000.`);
      next[k] = Math.round(v * 100) / 100;
    };
    setPrice("programMonthly", "Program monthly");
    setPrice("plusMonthly", "Plus monthly");
    setPrice("plusAnnual", "Plus annual");
    const int = (k: "trialDays" | "renewalNoticeDays", label: string, min: number, max: number) => {
      if (input[k] === undefined || input[k] === "") return;
      const v = Number(input[k]);
      if (!Number.isInteger(v) || v < min || v > max) throw new PlatformError("invalid_days", `${label} must be a whole number from ${min} to ${max}.`);
      next[k] = v;
    };
    int("trialDays", "Trial length", 1, 30);
    int("renewalNoticeDays", "Renewal notice", 1, 30);
    for (const code of Object.keys(REGIONS)) {
      const raw = input[`tax_${code}`];
      if (raw === undefined || raw === "") continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 30) throw new PlatformError("invalid_tax", `Simulated tax for ${code} must be from 0 to 30%.`);
      next.taxRates![code] = Math.round(v * 100) / 100;
    }
    next.updatedAt = nowIso();
    next.updatedBy = adminId;
    db.commerceSettings = next;
    publish("commerce.settings.updated", "commerce", "commerce/settings", { adminId });
    save();
    return next;
  },

  /* ---------------- Refund requests (one-time purchases) ---------------- */

  /** Whether an order can be sent to the refund queue, and why not. */
  refundEligibility(order: Order): { eligible: boolean; reason?: string } {
    const db = getDb();
    if (order.status !== "paid" || order.amount <= 0) return { eligible: false, reason: "Nothing to refund." };
    const cs = db.checkouts.find((c) => c.id === order.sessionId);
    const plan = order.plan ?? cs?.plan;
    if (plan !== "one_time" && plan !== "live_seat") return { eligible: false, reason: "Subscriptions are handled from the subscription itself." };
    if ((now().getTime() - Date.parse(order.createdAt)) / DAY > commerceConfig.refundDays) return { eligible: false, reason: `The ${commerceConfig.refundDays}-day refund window has passed.` };
    if (db.refundRequests.some((r) => r.orderId === order.id && r.status === "pending")) return { eligible: false, reason: "A refund request is already in review." };
    if (db.refundRequests.some((r) => r.orderId === order.id && r.status === "denied")) return { eligible: false, reason: "A refund for this order was already reviewed." };
    return { eligible: true };
  },

  requestOrderRefund(orderId: string, userId: string, reason: string): RefundRequest {
    const db = getDb();
    const order = db.orders.find((o) => o.id === orderId && o.userId === userId);
    if (!order) throw new PlatformError("not_found", "Order not found", 404);
    const e = this.refundEligibility(order);
    if (!e.eligible) throw new PlatformError("not_refundable", e.reason ?? "This order can't be refunded.");
    const r: RefundRequest = { id: newId("rfq"), userId, orderId, amount: order.amount, currency: order.currency, reason: (reason ?? "").trim().slice(0, 1000), status: "pending", createdAt: nowIso() };
    db.refundRequests.push(r);
    publish("refund.requested", "commerce", `user/${userId}`, { userId, requestId: r.id, orderId, amount: r.amount, currency: r.currency });
    save();
    return r;
  },

  refundQueue() {
    const db = getDb();
    return db.refundRequests
      .filter((r) => r.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => {
        const order = db.orders.find((o) => o.id === r.orderId);
        const productId = order?.productId ?? db.checkouts.find((c) => c.id === order?.sessionId)?.productId ?? null;
        const product = productId ? getDb().products.find((p) => p.id === productId) : undefined;
        const courseIds = product ? (product.courseIds.length ? product.courseIds : [product.id]) : [];
        const gradedItems = db.grades.filter((g) => g.userId === r.userId && courseIds.includes(db.items.find((i) => i.id === g.itemId)?.courseId ?? "")).length;
        return { ...r, order, product: product ? { id: product.id, title: product.title } : null, learner: db.users.find((u) => u.id === r.userId)?.name ?? "Learner", gradedItems };
      });
  },

  /** Staff decision; approval refunds the order and ends the access it bought. */
  decideRefund(requestId: string, adminId: string, decision: "approved" | "denied", note = ""): RefundRequest {
    const db = getDb();
    const r = db.refundRequests.find((x) => x.id === requestId);
    if (!r) throw new PlatformError("not_found", "Refund request not found", 404);
    if (r.status !== "pending") throw new PlatformError("already_decided", "This request already has a decision.", 409);
    r.status = decision;
    r.decidedAt = nowIso();
    r.decidedBy = adminId;
    r.note = note.trim().slice(0, 500) || undefined;
    if (decision === "approved") {
      const order = db.orders.find((o) => o.id === r.orderId);
      if (order) order.status = "refunded";
      entitlements.revokeBySource(r.orderId);
      publish("refund.issued", "commerce", `user/${r.userId}`, { userId: r.userId, orderId: r.orderId, amount: r.amount, currency: r.currency });
    } else {
      publish("refund.denied", "commerce", `user/${r.userId}`, { userId: r.userId, orderId: r.orderId, note: r.note ?? "" });
    }
    save();
    return r;
  },

  /* ---------------- Plan changes (sandbox) ---------------- */

  /** Proration quote: unused time on the current plan becomes credit toward the new one. */
  quoteChange(subscriptionId: string, userId: string, to: PlanChangeTarget): PlanChangeQuote {
    const db = getDb();
    const s = db.subscriptions.find((x) => x.id === subscriptionId && x.userId === userId);
    if (!s) throw new PlatformError("not_found", "Subscription not found", 404);
    const reg = regionForCurrency(s.currency);
    const c = commerceConfig;
    const cur = s.currency ?? region(reg).currency;
    const newAmount = localize(to === "plus_monthly" ? c.plusMonthly : to === "plus_annual" ? c.plusAnnual : c.programMonthly, reg);
    const t = now().getTime();
    const start = Date.parse(s.currentPeriodStart);
    const end = Date.parse(s.currentPeriodEnd);
    const periodDays = Math.max(1, Math.round((end - start) / DAY));
    const remainingDays = Math.max(0, Math.min(periodDays, Math.ceil((end - t) / DAY)));
    const base = { from: s.plan, to, currency: cur, newAmount, interval: (to === "plus_annual" ? "year" : "month") as "month" | "year", periodDays, remainingDays };
    const M = (n: number) => money(n, cur);
    const deny = (reason: string): PlanChangeQuote => ({ ...base, allowed: false, reason, credit: 0, chargeToday: 0, creditToNextBill: 0, newPeriodEnd: s.currentPeriodEnd, explanation: reason });
    const valid = (from: PlanCode[]) => from.includes(s.plan);
    if (s.status !== "active" && !(to === "plus_annual" && s.status === "trialing")) return deny(s.status === "trialing" ? "You can change plans after your free trial ends, or cancel the trial and choose another plan." : "Only an active subscription can change plans.");
    if (s.installmentsTotal) return deny("Payment plans can't be switched.");
    if (to === "plus_monthly" && !valid(["program_monthly"])) return deny("Switching to Plus monthly is available from a program subscription.");
    if (to === "program_monthly" && !valid(["plus_monthly"])) return deny("Switching to a program subscription is available from Plus monthly.");
    if (to === "plus_annual" && !valid(["plus_monthly"])) return deny("Annual billing is available for Scholarion Plus monthly.");
    if (to === "plus_monthly" && db.subscriptions.some((x) => x.userId === userId && x.id !== s.id && x.plan.startsWith("plus") && (x.status === "active" || x.status === "trialing"))) return deny("You already have Scholarion Plus.");

    if (to === "plus_annual") {
      // A trial converts with no credit (nothing was paid); an active month credits its unused days.
      const credit = s.status === "trialing" ? 0 : roundMoney((s.amount * remainingDays) / periodDays, reg);
      const chargeToday = Math.max(0, roundMoney(newAmount - credit, reg));
      const newPeriodEnd = addDays(nowIso(), 365);
      const explanation =
        s.status === "trialing"
          ? `Your free trial ends today and annual billing starts: ${M(newAmount)} today for 12 months, renewing ${new Date(newPeriodEnd).toLocaleDateString("en-US", { dateStyle: "long" })}.`
          : `You have ${remainingDays} of ${periodDays} days left this month. Their unused value (${M(s.amount)} × ${remainingDays}/${periodDays} = ${M(credit)}) is credited, so today's charge is ${M(newAmount)} − ${M(credit)} = ${M(chargeToday)}. Your new 12-month period starts today.`;
      return { ...base, allowed: true, credit, chargeToday, creditToNextBill: 0, newPeriodEnd, explanation: `${explanation} ${c.refundDays}-day money-back window on the annual plan. Sandbox — nothing is charged.` };
    }
    // Monthly ↔ monthly: same renewal date; pay or get credit for the price difference over the days left.
    const credit = roundMoney((s.amount * remainingDays) / periodDays, reg);
    const cost = roundMoney((newAmount * remainingDays) / periodDays, reg);
    const diff = roundMoney(cost - credit, reg);
    const chargeToday = Math.max(0, diff);
    const creditToNextBill = Math.max(0, -diff);
    const explanation = `You have ${remainingDays} of ${periodDays} days left in this billing period. Unused value of your current plan: ${M(credit)}. The new plan for the same days: ${M(cost)}. ${chargeToday > 0 ? `You pay the difference today: ${M(chargeToday)}.` : creditToNextBill > 0 ? `The difference (${M(creditToNextBill)}) is credited to your next bill.` : "Nothing to pay today."} From ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US", { dateStyle: "long" })} you're billed ${M(newAmount)}/month. Sandbox — nothing is charged.`;
    return { ...base, allowed: true, credit, chargeToday, creditToNextBill, newPeriodEnd: s.currentPeriodEnd, explanation };
  },

  changePlan(subscriptionId: string, userId: string, to: PlanChangeTarget, productId?: string | null): { subscription: Subscription; quote: PlanChangeQuote } {
    const db = getDb();
    const q = this.quoteChange(subscriptionId, userId, to);
    if (!q.allowed) throw new PlatformError("change_not_allowed", q.reason ?? "This change isn't available.");
    const s = db.subscriptions.find((x) => x.id === subscriptionId)!;
    let product: Product | undefined;
    if (to === "program_monthly") {
      product = productId ? catalog.get(productId) : undefined;
      if (!product || !PROGRAM_TYPES.has(product.type) || product.format !== "self_paced") throw new PlatformError("choose_program", "Choose the program to subscribe to.");
    }
    const t = nowIso();
    const from = s.plan;
    s.plan = to;
    s.amount = q.newAmount;
    s.planChangedAt = t;
    s.productId = to === "program_monthly" ? product!.id : null;
    if (to === "plus_annual") {
      s.status = "active";
      s.currentPeriodStart = t;
      s.currentPeriodEnd = q.newPeriodEnd;
      s.credit = undefined;
    } else if (q.creditToNextBill) {
      s.credit = roundMoney((s.credit ?? 0) + q.creditToNextBill, regionForCurrency(s.currency));
    }
    s.renewalNoticeFor = undefined;
    // Access follows the new plan from now; the old grant ends.
    entitlements.revokeBySource(s.id);
    entitlements.grant({ userId, resource: s.productId ? { kind: "product", id: s.productId } : { kind: "plus", id: "plus" }, level: "full", source: s.productId ? "program_subscription" : "plus", sourceRef: s.id, validTo: s.currentPeriodEnd });
    const orderId = newId("ord");
    db.orders.push({
      id: orderId,
      userId,
      sessionId: s.id.replace("sub_", "cs_"),
      amount: q.chargeToday,
      currency: q.currency,
      description: `Plan change: ${planLabel(from, null)} → ${planLabel(to, product)} (prorated)`,
      status: "paid",
      createdAt: t,
      subtotal: to === "plus_annual" ? q.newAmount : roundMoney((q.newAmount * q.remainingDays) / q.periodDays, regionForCurrency(s.currency)),
      discount: q.credit || undefined,
      plan: to,
      productId: s.productId,
    });
    publish("subscription.plan_changed", "commerce", `user/${userId}`, { userId, subscriptionId: s.id, from, to, chargeToday: q.chargeToday, currency: q.currency, orderId });
    save();
    return { subscription: s, quote: q };
  },

  /** Plain extractive summary for reviewers (AI may summarise, never decide). */
  summariseAid(a: AidApplication): string {
    const first = (s: string) => s.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return `Need: ${first(a.need)} Goals: ${first(a.goals)} (${words(a.need)} + ${words(a.goals)} words)`;
  },
};
