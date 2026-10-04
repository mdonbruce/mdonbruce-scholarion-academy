import crypto from "node:crypto";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit, notify } from "./common";

/**
 * Academy plans (sandbox): Scholaris Plus monthly with a free trial, Plus annual with a money-back
 * window, per-program monthly subscriptions, and need-based financial aid.
 *
 * Consumer-protection rules built in:
 * - Price, trial end, first charge date, renewal date, cancellation path and refund terms are shown
 *   before anything starts, and the learner must tick an (unchecked) box to accept them.
 * - One free trial per learner; a reminder goes out before the trial converts.
 * - Cancelling is one step (sign-up is one step) and keeps access to the end of the paid period;
 *   progress is never deleted. Pausing keeps progress too.
 * - Prices are placeholders set by the product owner; nothing here takes a real payment.
 * Financial aid: a person decides; the AI may only summarize the application.
 */

const DAY = 86_400_000;
export type PlanKind = "plus_monthly" | "plus_annual" | "program_monthly";
export const PLAN_LABEL: Record<PlanKind, string> = { plus_monthly: "Scholaris Plus — monthly", plus_annual: "Scholaris Plus — annual", program_monthly: "Program subscription — monthly" };

export interface PlanSettings {
  currency: string;
  programMonthly: number;
  plusMonthly: number;
  plusAnnual: number;
  trialDays: number;
  refundDays: number;
  trialReminderDays: number;
  renewalNoticeDays: number;
  aidDecisionDays: number;
  aidMaxPct: number;
  placeholder: boolean;
}
const DEFAULTS: PlanSettings = { currency: "USD", programMonthly: 49, plusMonthly: 59, plusAnnual: 399, trialDays: 7, refundDays: 14, trialReminderDays: 2, renewalNoticeDays: 7, aidDecisionDays: 15, aidMaxPct: 100, placeholder: true };

export function planSettings(store: TenantStore): PlanSettings {
  const row = store.list("plan_settings", (r) => r.key === "default")[0];
  return { ...DEFAULTS, ...((row?.values as Partial<PlanSettings>) ?? {}) };
}

export function updatePlanSettings(store: TenantStore, a: Actor, input: Partial<PlanSettings>) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403);
  const cur = planSettings(store);
  const num = (v: unknown, min: number, max: number, label: string) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new CampusError("invalid", `${label} must be between ${min} and ${max}.`, 422);
    return n;
  };
  const next: PlanSettings = {
    ...cur,
    programMonthly: num(input.programMonthly, 1, 10000, "Program monthly price") ?? cur.programMonthly,
    plusMonthly: num(input.plusMonthly, 1, 10000, "Plus monthly price") ?? cur.plusMonthly,
    plusAnnual: num(input.plusAnnual, 1, 100000, "Plus annual price") ?? cur.plusAnnual,
    trialDays: num(input.trialDays, 0, 30, "Trial length") ?? cur.trialDays,
    refundDays: num(input.refundDays, 0, 60, "Refund window") ?? cur.refundDays,
    trialReminderDays: num(input.trialReminderDays, 1, 7, "Trial reminder") ?? cur.trialReminderDays,
    renewalNoticeDays: num(input.renewalNoticeDays, 1, 30, "Renewal notice") ?? cur.renewalNoticeDays,
    aidDecisionDays: num(input.aidDecisionDays, 1, 60, "Aid decision time") ?? cur.aidDecisionDays,
    aidMaxPct: num(input.aidMaxPct, 0, 100, "Maximum aid") ?? cur.aidMaxPct,
    currency: input.currency && /^[A-Z]{3}$/.test(input.currency) ? input.currency : cur.currency,
    placeholder: input.placeholder === undefined ? cur.placeholder : !!input.placeholder,
  };
  if (next.trialReminderDays >= next.trialDays && next.trialDays > 0) next.trialReminderDays = Math.max(1, next.trialDays - 1);
  const ex = store.list("plan_settings", (r) => r.key === "default")[0];
  store.tx(() => (ex ? store.update("plan_settings", ex.id, { values: next, updatedBy: a.id }) : store.insert("plan_settings", { key: "default", values: next, updatedBy: a.id }, "pls")));
  audit(store, a, "plans.settings", "plan_settings/default");
  return next;
}

const money = (s: PlanSettings, n: number) => `${s.currency} ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Live and cohort programs aren't in Plus unless an offering is flagged; self-paced offerings are. */
export const plusEligible = (o: Row) => !!o.inPlus || (!!o.selfPaced && o.productType !== "degree_track");
export const programMonthlyEligible = (o: Row) => ["specialization", "professional_certificate"].includes(String(o.productType)) || !!o.selfPaced;

/* ---------------- quotes and options ---------------- */

export interface PlanQuote {
  kind: PlanKind;
  label: string;
  price: number;
  currency: string;
  period: "month" | "year";
  chargedToday: number;
  trialDays: number;
  trialEndsAt: string | null;
  firstChargeAt: string;
  renewsAt: string;
  cancelPath: string;
  refundTerms: string;
  includes: string[];
  excludes: string[];
  disclosure: string;
  placeholderPrices: boolean;
  sandbox: true;
}

export function quotePlan(store: TenantStore, kind: PlanKind, offeringId?: string, userId?: string): PlanQuote {
  const s = planSettings(store);
  const now = nowMs();
  const o = offeringId ? store.get("offerings", offeringId) : undefined;
  if (kind === "program_monthly" && (!o || o.state !== "published")) throw new CampusError("invalid", "Choose the program to subscribe to.", 422);
  const trialUsed = !!userId && store.list("subscriptions", (x) => x.userId === userId && !!x.trialEndsAt).length > 0;
  const trialDays = kind === "plus_monthly" && !trialUsed ? s.trialDays : 0;
  const price = kind === "plus_monthly" ? s.plusMonthly : kind === "plus_annual" ? s.plusAnnual : s.programMonthly;
  const period = kind === "plus_annual" ? "year" : "month";
  const firstCharge = now + trialDays * DAY;
  const renews = firstCharge + (period === "year" ? 365 : 30) * DAY;
  const trialEndsAt = trialDays ? new Date(firstCharge).toISOString() : null;
  const cancelPath = "Account → Subscriptions → Cancel. One step, any time; access continues to the end of the period you've paid for.";
  const refundTerms = kind === "plus_annual" ? `${s.refundDays}-day money-back guarantee from the annual charge. After that, the annual plan isn't refunded but stays active to the end of the year.` : "Monthly plans aren't refunded for part of a month; cancelling stops the next charge and access continues to the end of the month.";
  const includes = kind === "program_monthly" ? [`Full access to ${o!.code} ${o!.title} while subscribed`, "Graded work, labs and the AI Teaching Assistant", "The program credential when you complete the requirements", "Progress is kept if you pause or cancel"] : ["Every Plus-eligible self-paced course, specialization and professional certificate", "Graded work, labs and the AI Teaching Assistant", "Credentials when you complete each program's requirements", "Progress is kept if you pause or cancel"];
  const excludes = kind === "program_monthly" ? ["Other programs", "Live cohort programs"] : ["Live cohort and weekend programs (unless a program says it's included)", "Partner degrees (none are offered)"];
  const disclosure = `${PLAN_LABEL[kind]}: ${money(s, price)} per ${period}${trialDays ? ` after a ${trialDays}-day free trial. Nothing is charged today; your trial ends ${day(firstCharge)} and we'll remind you ${s.trialReminderDays} day(s) before. The first charge is ${day(firstCharge)}` : `, charged today (${day(now)})`}, then it renews automatically on ${day(renews)} and every ${period} after that until you cancel. ${cancelPath} ${refundTerms} Sandbox: no real payment is taken.`;
  return { kind, label: PLAN_LABEL[kind], price, currency: s.currency, period, chargedToday: trialDays ? 0 : price, trialDays, trialEndsAt, firstChargeAt: new Date(firstCharge).toISOString(), renewsAt: new Date(renews).toISOString(), cancelPath, refundTerms, includes, excludes, disclosure, placeholderPrices: s.placeholder, sandbox: true };
}

/** Enroll options for a course or program page, each with what's included and excluded. */
export function enrollOptions(store: TenantStore, offeringId: string, userId?: string) {
  const o = store.get("offerings", offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Offering not found", 404);
  const s = planSettings(store);
  const opts: { key: string; title: string; price: string; includes: string[]; excludes: string[]; available: boolean; note?: string }[] = [];
  opts.push({ key: "audit", title: "Audit for free", price: "Free", includes: ["Lecture videos and readings", "Practice activities"], excludes: ["Graded assignments, labs and quizzes", "AI Teaching Assistant help on graded work", "Certificate"], available: !!o.auditAvailable, note: o.auditAvailable ? undefined : "Audit isn't offered for this program." });
  opts.push({ key: "buy", title: o.selfPaced ? "Buy this course" : "Enroll in this program", price: `${o.currency ?? s.currency} ${Number(o.price).toLocaleString("en-US")} one time${o.selfPaced ? "" : " · installments available"}`, includes: ["Everything in the program, including graded work and the credential", `Access for ${o.accessMonths ?? 24} months`], excludes: ["Other programs"], available: true });
  if (programMonthlyEligible(o)) {
    const q = quotePlan(store, "program_monthly", o.id, userId);
    opts.push({ key: "program_monthly", title: "Subscribe to this program", price: `${money(s, q.price)}/month, cancel anytime`, includes: q.includes, excludes: q.excludes, available: true });
  }
  if (plusEligible(o)) {
    const q = quotePlan(store, "plus_monthly", undefined, userId);
    opts.push({ key: "plus_monthly", title: q.trialDays ? `Start a ${q.trialDays}-day free trial of Scholaris Plus` : "Subscribe to Scholaris Plus", price: `${money(s, s.plusMonthly)}/month${q.trialDays ? " after the trial" : ""}, or ${money(s, s.plusAnnual)}/year`, includes: q.includes, excludes: q.excludes, available: true });
  }
  opts.push({ key: "aid", title: "Apply for financial aid", price: `Up to ${s.aidMaxPct}% of the fee`, includes: [`A person reviews your application within ${s.aidDecisionDays} days`, "If approved, full access at the approved discount"], excludes: ["Live seat is held only after a decision"], available: true });
  return { offeringId: o.id, code: o.code, title: o.title, inPlus: plusEligible(o), options: opts, placeholderPrices: s.placeholder };
}

/* ---------------- subscriptions ---------------- */

const live = (x: Row) => ["trialing", "active"].includes(String(x.state)) || (String(x.state) === "canceling" && String(x.currentPeriodEnd) > nowIso());

/** What a learner's subscriptions entitle them to right now. */
export function entitlementFor(store: TenantStore, userId: string, o: Row): Row | null {
  return store.list("subscriptions", (x) => x.userId === userId && live(x) && (x.kind === "program_monthly" ? x.offeringId === o.id : true) && (x.kind === "program_monthly" || plusEligible(o) || !x.kind)).sort((a, b) => String(b.currentPeriodEnd ?? b.renewsAt).localeCompare(String(a.currentPeriodEnd ?? a.renewsAt)))[0] ?? null;
}

function chargeOrder(store: TenantStore, sub: Row, amount: number, description: string) {
  return store.insert("orders", { userId: sub.userId, offeringId: sub.offeringId ?? null, sectionId: null, plan: sub.kind, subtotal: amount, discount: 0, tax: 0, total: amount, currency: sub.currency, state: "paid_sandbox", sandboxRef: `sbx_${crypto.randomBytes(5).toString("hex")}`, couponCode: null, installments: [], funding: "self", subscriptionId: sub.id, description }, "ord");
}

export function startSubscription(store: TenantStore, a: Actor, input: { kind: PlanKind; offeringId?: string; acceptTerms: boolean; sandboxCard?: string }) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "Subscriptions can't be started while acting as someone else.", 403);
  if (!PLAN_LABEL[input.kind]) throw new CampusError("invalid", "Choose a plan.", 422);
  if (!input.acceptTerms) throw new CampusError("terms_required", "Read the price, renewal, cancellation and refund terms and tick the box to continue.", 422);
  if (input.sandboxCard && !/^tok_sandbox_/.test(input.sandboxCard)) throw new CampusError("sandbox_only", "This is a sandbox. Use a sandbox token like tok_sandbox_visa — never a real card.", 422);
  const q = quotePlan(store, input.kind, input.offeringId, a.id);
  const mine = store.list("subscriptions", (x) => x.userId === a.id && (live(x) || x.state === "paused"));
  if (input.kind !== "program_monthly" && mine.some((x) => x.kind !== "program_monthly")) throw new CampusError("conflict", "You already have Scholaris Plus. Switch plans from your account instead.", 409);
  if (input.kind === "program_monthly" && mine.some((x) => x.kind === "program_monthly" && x.offeringId === input.offeringId)) throw new CampusError("conflict", "You already subscribe to this program.", 409);
  return store.tx(() => {
    const sub = store.insert("subscriptions", { userId: a.id, kind: input.kind, plan: q.label, offeringId: input.offeringId ?? null, state: q.trialDays ? "trialing" : "active", price: q.price, currency: q.currency, period: q.period, trialEndsAt: q.trialEndsAt, currentPeriodEnd: q.trialDays ? q.trialEndsAt : q.renewsAt, renewsAt: q.trialDays ? q.trialEndsAt : q.renewsAt, cancelAtPeriodEnd: false, pausedAt: null, pauseUntil: null, chargedAt: q.trialDays ? null : nowIso(), disclosure: { text: q.disclosure, acceptedAt: nowIso() }, notices: [], sandboxRef: `sbx_${crypto.randomBytes(5).toString("hex")}` }, "subn");
    if (!q.trialDays) chargeOrder(store, sub, q.price, `${q.label} — first ${q.period}`);
    notify(store, [a.id], "account", q.trialDays ? `Your ${q.trialDays}-day Scholaris Plus trial has started` : `${q.label} is active`, q.disclosure, "/campus/{tenant}/account");
    audit(store, a, "plans.start", `subscriptions/${sub.id}`, `${input.kind}${q.trialDays ? " trial" : ""}`);
    return { subscription: sub, quote: q };
  });
}

function mineOr404(store: TenantStore, a: Actor, id: string) {
  const s = store.get("subscriptions", id);
  if (!s || (s.userId !== a.id && !hasAny(a, ["admin"]))) throw new CampusError("not_found", "Subscription not found", 404);
  return s;
}

/** One step. Access continues to the end of the paid period (or the trial), then ends; progress is kept. */
export function cancelPlan(store: TenantStore, a: Actor, id: string) {
  const s = mineOr404(store, a, id);
  if (!live(s) && s.state !== "paused") throw new CampusError("conflict", "This subscription isn't active.", 409);
  const out = store.tx(() => store.update("subscriptions", s.id, { state: "canceling", cancelAtPeriodEnd: true, canceledAt: nowIso(), pausedAt: null }));
  notify(store, [String(s.userId)], "account", "Subscription canceled", `You won't be charged again. Access continues until ${String(s.currentPeriodEnd).slice(0, 10)}; your progress is kept.`, "/campus/{tenant}/account");
  audit(store, a, "plans.cancel", `subscriptions/${s.id}`);
  return out;
}

export function pausePlan(store: TenantStore, a: Actor, id: string, months: number) {
  const s = mineOr404(store, a, id);
  if (!["active"].includes(String(s.state))) throw new CampusError("conflict", "Only an active paid subscription can be paused.", 409);
  const m = Math.min(3, Math.max(1, Math.round(months || 1)));
  return store.tx(() => store.update("subscriptions", s.id, { state: "paused", pausedAt: nowIso(), pauseUntil: new Date(nowMs() + m * 30 * DAY).toISOString() }));
}

export function resumePlan(store: TenantStore, a: Actor, id: string) {
  const s = mineOr404(store, a, id);
  if (s.state !== "paused" && s.state !== "canceling") throw new CampusError("conflict", "Nothing to resume.", 409);
  return store.tx(() => store.update("subscriptions", s.id, { state: "active", pausedAt: null, pauseUntil: null, cancelAtPeriodEnd: false, canceledAt: null, currentPeriodEnd: String(s.currentPeriodEnd) > nowIso() ? s.currentPeriodEnd : new Date(nowMs() + 30 * DAY).toISOString() }));
}

/** Monthly → annual now (unused days credited); annual → monthly at the end of the year. */
export function switchPlan(store: TenantStore, a: Actor, id: string, to: "plus_monthly" | "plus_annual") {
  const s = mineOr404(store, a, id);
  if (s.kind === "program_monthly" || !live(s)) throw new CampusError("conflict", "Only an active Plus subscription can switch plans.", 409);
  if (s.kind === to) throw new CampusError("conflict", "You're already on that plan.", 409);
  const st = planSettings(store);
  return store.tx(() => {
    if (to === "plus_annual") {
      const left = Math.max(0, Date.parse(String(s.currentPeriodEnd)) - nowMs());
      const credit = s.state === "trialing" ? 0 : Math.round(((Number(s.price) * left) / (30 * DAY)) * 100) / 100;
      const charge = Math.max(0, Math.round((st.plusAnnual - credit) * 100) / 100);
      const upd = store.update("subscriptions", s.id, { kind: "plus_annual", plan: PLAN_LABEL.plus_annual, price: st.plusAnnual, period: "year", state: "active", trialEndsAt: s.trialEndsAt, chargedAt: nowIso(), currentPeriodEnd: new Date(nowMs() + 365 * DAY).toISOString(), renewsAt: new Date(nowMs() + 365 * DAY).toISOString() });
      chargeOrder(store, upd, charge, `Switch to annual (credit ${credit} for unused monthly time)`);
      audit(store, a, "plans.switch", `subscriptions/${s.id}`, "annual");
      return { subscription: upd, chargedToday: charge, credit };
    }
    const upd = store.update("subscriptions", s.id, { switchAtPeriodEnd: "plus_monthly" });
    audit(store, a, "plans.switch", `subscriptions/${s.id}`, "monthly at period end");
    return { subscription: upd, chargedToday: 0, credit: 0 };
  });
}

/** Annual money-back window: full refund inside it; outside it, the policy is explained. */
export function refundPlan(store: TenantStore, a: Actor, id: string) {
  const s = mineOr404(store, a, id);
  const st = planSettings(store);
  const charged = s.chargedAt ? Date.parse(String(s.chargedAt)) : null;
  const days = charged ? (nowMs() - charged) / DAY : null;
  const eligible = s.kind === "plus_annual" && days !== null && days <= st.refundDays;
  return store.tx(() => {
    const r = store.insert("refund_requests", { userId: s.userId, orderId: store.list("orders", (o) => o.subscriptionId === s.id).pop()?.id ?? null, subscriptionId: s.id, kind: "subscription_refund", reason: "Money-back request", decision: eligible ? "approved" : "declined", explanation: [{ rule: `Annual plan, within ${st.refundDays} days of the charge`, ok: eligible, value: s.kind !== "plus_annual" ? "monthly plan" : days === null ? "not charged yet" : `${Math.floor(days)} days` }] }, "rfd");
    if (eligible) {
      for (const o of store.list("orders", (x) => x.subscriptionId === s.id && x.state === "paid_sandbox")) store.update("orders", o.id, { state: "refunded_sandbox" });
      store.update("subscriptions", s.id, { state: "ended", endedAt: nowIso(), refundedAt: nowIso() });
    }
    audit(store, a, "plans.refund", `subscriptions/${s.id}`, eligible ? "approved" : "explained");
    return { decision: eligible ? "refunded" : "policy_explained", explanation: eligible ? "Refunded in full (sandbox). Your progress is kept if you subscribe again." : s.kind === "plus_annual" ? `The ${st.refundDays}-day money-back window has passed. Your plan stays active until ${String(s.currentPeriodEnd).slice(0, 10)}; cancel any time to stop renewal.` : "Monthly plans aren't refunded for part of a month. Cancel to stop the next charge; access continues to the end of the month.", request: r };
  });
}

/**
 * Daily lifecycle run (idempotent): trial reminders, trial conversion, renewal notices, renewals,
 * period-end cancellations, and the end of pauses.
 */
export function tickPlans(store: TenantStore, now = nowMs()) {
  const st = planSettings(store);
  const out = { reminders: 0, converted: 0, notices: 0, renewed: 0, ended: 0, resumed: 0 };
  for (const s of store.list("subscriptions", (x) => !!x.kind)) {
    const notices = (s.notices as string[]) ?? [];
    const sent = (k: string) => notices.includes(k);
    const mark = (k: string) => store.update("subscriptions", s.id, { notices: [...((store.get("subscriptions", s.id)!.notices as string[]) ?? []), k] });
    const end = Date.parse(String(s.currentPeriodEnd));
    store.tx(() => {
      if (s.state === "trialing") {
        const k = `trial_reminder:${s.trialEndsAt}`;
        if (!sent(k) && now >= end - st.trialReminderDays * DAY && now < end) {
          notify(store, [String(s.userId)], "account", `Your Scholaris Plus trial ends ${String(s.trialEndsAt).slice(0, 10)}`, `You'll be charged ${s.currency} ${s.price} on ${String(s.trialEndsAt).slice(0, 10)} unless you cancel. Cancel in one step: Account → Subscriptions → Cancel.`, "/campus/{tenant}/account");
          mark(k);
          out.reminders++;
        }
        if (now >= end) {
          const renews = new Date(end + 30 * DAY).toISOString();
          const upd = store.update("subscriptions", s.id, { state: "active", chargedAt: new Date(now).toISOString(), currentPeriodEnd: renews, renewsAt: renews });
          chargeOrder(store, upd, Number(s.price), `${s.plan} — first month after trial`);
          out.converted++;
        }
      } else if (s.state === "active") {
        const k = `renewal_notice:${s.currentPeriodEnd}`;
        if (!sent(k) && now >= end - st.renewalNoticeDays * DAY && now < end) {
          notify(store, [String(s.userId)], "account", `${s.plan} renews ${String(s.currentPeriodEnd).slice(0, 10)}`, `${s.currency} ${s.price} will be charged on ${String(s.currentPeriodEnd).slice(0, 10)}. Cancel any time before then in one step.`, "/campus/{tenant}/account");
          mark(k);
          out.notices++;
        }
        if (now >= end) {
          const kind = (s.switchAtPeriodEnd as PlanKind | undefined) ?? (s.kind as PlanKind);
          const price = kind === "plus_monthly" ? st.plusMonthly : kind === "plus_annual" ? st.plusAnnual : Number(s.price);
          const next = new Date(end + (kind === "plus_annual" ? 365 : 30) * DAY).toISOString();
          const upd = store.update("subscriptions", s.id, { kind, plan: PLAN_LABEL[kind], price, period: kind === "plus_annual" ? "year" : "month", switchAtPeriodEnd: null, chargedAt: new Date(now).toISOString(), currentPeriodEnd: next, renewsAt: next });
          chargeOrder(store, upd, price, `${PLAN_LABEL[kind]} — renewal`);
          out.renewed++;
        }
      } else if (s.state === "canceling" && now >= end) {
        store.update("subscriptions", s.id, { state: "ended", endedAt: new Date(now).toISOString() });
        out.ended++;
      } else if (s.state === "paused" && s.pauseUntil && now >= Date.parse(String(s.pauseUntil))) {
        const next = new Date(now + 30 * DAY).toISOString();
        const upd = store.update("subscriptions", s.id, { state: "active", pausedAt: null, pauseUntil: null, chargedAt: new Date(now).toISOString(), currentPeriodEnd: next, renewsAt: next });
        chargeOrder(store, upd, Number(s.price), `${s.plan} — resumed after pause`);
        out.resumed++;
      }
    });
  }
  return out;
}

export function mySubscriptions(store: TenantStore, a: Actor) {
  return store.list("subscriptions", (x) => x.userId === a.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).map((x) => ({ id: x.id, kind: (x.kind as string) ?? "legacy", plan: String(x.plan), state: String(x.state), price: Number(x.price), currency: String(x.currency ?? "USD"), period: String(x.period ?? "month"), trialEndsAt: (x.trialEndsAt as string) ?? null, currentPeriodEnd: String(x.currentPeriodEnd ?? x.renewsAt ?? ""), cancelAtPeriodEnd: !!x.cancelAtPeriodEnd, pauseUntil: (x.pauseUntil as string) ?? null, offeringId: (x.offeringId as string) ?? null }));
}

/* ---------------- financial aid ---------------- */

const words = (s: string) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
export const AID_GUIDANCE = { background: [50, 300], need: [100, 500], goals: [100, 400] } as const;

export function applyForAid(store: TenantStore, a: Actor, input: { offeringId: string; background: string; need: string; goals: string; commitment: boolean; requestedPct?: number }) {
  const o = store.get("offerings", input.offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Program not found", 404);
  for (const [k, [min, max]] of Object.entries(AID_GUIDANCE)) {
    const n = words((input as unknown as Record<string, string>)[k]);
    if (n < min || n > max) throw new CampusError("invalid", `${k === "need" ? "Financial need statement" : k === "goals" ? "Career goals" : "Background"}: ${min}–${max} words (you wrote ${n}).`, 422);
  }
  if (!input.commitment) throw new CampusError("invalid", "Confirm you'll complete the program's requirements.", 422);
  if (store.list("aid_applications", (x) => x.userId === a.id && x.offeringId === o.id && ["submitted", "approved"].includes(String(x.state))).length) throw new CampusError("conflict", "You already have an application for this program.", 409);
  const st = planSettings(store);
  const pct = Math.min(st.aidMaxPct, Math.max(10, Math.round(Number(input.requestedPct ?? st.aidMaxPct))));
  return store.tx(() => {
    const app = store.insert("aid_applications", { userId: a.id, offeringId: o.id, background: input.background.slice(0, 4000), need: input.need.slice(0, 5000), goals: input.goals.slice(0, 4000), commitment: true, requestedPct: pct, state: "submitted", decisionDueAt: new Date(nowMs() + st.aidDecisionDays * DAY).toISOString(), approvedPct: null, decidedBy: null, decidedAt: null, decisionNote: null, couponCode: null }, "aid");
    notify(store, [a.id], "account", "Financial aid application received", `A person will review it and you'll hear back by ${String(app.decisionDueAt).slice(0, 10)}.`, "/campus/{tenant}/account");
    audit(store, a, "aid.apply", `aid_applications/${app.id}`, String(o.code));
    return app;
  });
}

/** Reviewer queue. The summary is a short extract to speed reading — it never decides. */
export function aidQueue(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "registrar", "advisor"])) throw new CampusError("forbidden", "Financial aid reviewers only.", 403);
  const first = (s: string, n = 2) => String(s).split(/(?<=[.!?])\s+/).slice(0, n).join(" ");
  return store.list("aid_applications").sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt))).map((x) => {
    const o = store.get("offerings", x.offeringId as string);
    const u = store.get("users", x.userId as string);
    return { id: x.id, learner: (u?.name as string) ?? String(x.userId), program: o ? `${o.code} ${o.title}` : String(x.offeringId), state: String(x.state), requestedPct: Number(x.requestedPct), approvedPct: (x.approvedPct as number) ?? null, decisionDueAt: String(x.decisionDueAt), overdue: x.state === "submitted" && String(x.decisionDueAt) < nowIso(), summary: { label: "AI summary (extract only — a person decides)", background: first(String(x.background)), need: first(String(x.need), 3), goals: first(String(x.goals)) } };
  });
}

/** A person decides. Approval creates a single-use discount for that learner and program. */
export function decideAid(store: TenantStore, a: Actor, id: string, decision: "approved" | "denied", approvedPct: number | undefined, note: string) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only financial aid reviewers can decide.", 403);
  const app = store.get("aid_applications", id);
  if (!app) throw new CampusError("not_found", "Application not found", 404);
  if (app.state !== "submitted") throw new CampusError("conflict", "This application already has a decision.", 409);
  if (app.userId === a.id) throw new CampusError("forbidden", "You can't decide your own application.", 403);
  const st = planSettings(store);
  const pct = decision === "approved" ? Math.min(st.aidMaxPct, Math.max(1, Math.round(Number(approvedPct ?? app.requestedPct)))) : null;
  const o = store.get("offerings", app.offeringId as string)!;
  return store.tx(() => {
    let code: string | null = null;
    if (pct) {
      code = `AID-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      store.insert("coupons", { code, offeringId: o.id, userId: app.userId, percentOff: pct, maxRedemptions: 1, redemptions: 0, expiresAt: new Date(nowMs() + 90 * DAY).toISOString(), source: "financial_aid" }, "cpn");
    }
    const upd = store.update("aid_applications", id, { state: decision, approvedPct: pct, decidedBy: a.id, decidedAt: nowIso(), decisionNote: String(note ?? "").slice(0, 1000), couponCode: code });
    notify(store, [String(app.userId)], "account", decision === "approved" ? `Financial aid approved: ${pct}% off ${o.code}` : `Financial aid decision for ${o.code}`, decision === "approved" ? `Your aid code ${code} applies ${pct}% off ${o.code} ${o.title} at checkout (single use, for your account). ${pct === 100 ? "Nothing is due." : ""}` : `Your application wasn't approved this time.${note ? ` Reviewer's note: ${note}` : ""} You can still audit for free.`, "/campus/{tenant}/account");
    audit(store, a, "aid.decide", `aid_applications/${id}`, `${decision}${pct ? ` ${pct}%` : ""}`);
    return upd;
  });
}

export function myAid(store: TenantStore, a: Actor) {
  return store.list("aid_applications", (x) => x.userId === a.id).map((x) => {
    const o = store.get("offerings", x.offeringId as string);
    return { id: x.id, program: o ? `${o.code} ${o.title}` : String(x.offeringId), offeringId: String(x.offeringId), state: String(x.state), approvedPct: (x.approvedPct as number) ?? null, couponCode: (x.couponCode as string) ?? null, decisionDueAt: String(x.decisionDueAt), note: (x.decisionNote as string) ?? null };
  });
}
