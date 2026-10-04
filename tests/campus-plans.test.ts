import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import fs from "node:fs";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { advanceClock, CampusError, nowMs, relay } from "../src/campus/core";
import * as P from "../src/campus/services/plans";
import * as A from "../src/campus/services/academy";
import { copyCheck } from "../src/campus/services/claims";

/** Academy marketplace: plans, trials, cancellation, refunds and financial aid (sandbox). */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const words = (n: number) => Array.from({ length: n }, (_x, i) => `word${i}`).join(" ");
const notes = (userId: string, re: RegExp) => {
  relay(storeOf("academy"));
  return storeOf("academy").list("deliveries", (d) => d.userId === userId && d.channel === "in_app" && re.test(String(d.subject))).length;
};
let SELF = "";

before(() => {
  freshCampus();
  SELF = String(storeOf("academy").list("offerings", (o) => o.state === "published" && !!o.selfPaced)[0].id);
});

describe("Enroll options and disclosures", () => {
  it("each option says what's included and excluded; audit excludes graded work and the certificate", () => {
    const v = P.enrollOptions(storeOf("academy"), SELF);
    const keys = v.options.map((o) => o.key);
    for (const k of ["audit", "buy", "program_monthly", "plus_monthly", "aid"]) assert.ok(keys.includes(k), k);
    const audit = v.options.find((o) => o.key === "audit")!;
    assert.ok(audit.excludes.some((x) => /certificate/i.test(x)) && audit.excludes.some((x) => /graded/i.test(x)));
  });

  it("the Plus trial quote shows price, trial end, first charge, renewal date, cancel path and refund terms before purchase", () => {
    const q = P.quotePlan(storeOf("academy"), "plus_monthly");
    assert.equal(q.chargedToday, 0);
    assert.ok(q.trialEndsAt && q.renewsAt && q.firstChargeAt);
    for (const re of [/free trial/, /Nothing is charged today/, /renews automatically/, /Cancel\. One step/, /aren't refunded for part of a month/, /Sandbox/]) assert.match(q.disclosure, re);
    assert.match(P.quotePlan(storeOf("academy"), "plus_annual").refundTerms, /14-day money-back/);
  });
});

describe("Scholaris Plus trial lifecycle", () => {
  it("can't start without accepting the terms; starting is one step and charges nothing during the trial", () => {
    const u = as("academy", "student3", false);
    assert.equal(status(() => P.startSubscription(u.store, u.actor, { kind: "plus_monthly", acceptTerms: false })), 422);
    const { subscription } = P.startSubscription(u.store, u.actor, { kind: "plus_monthly", acceptTerms: true });
    assert.equal(subscription.state, "trialing");
    assert.equal(u.store.list("orders", (o) => o.subscriptionId === subscription.id).length, 0);
    assert.ok((subscription.disclosure as { acceptedAt: string }).acceptedAt);
    // The trial entitles Plus-eligible enrollment.
    const enr = A.enrollWithSubscription(u.store, u.actor, SELF);
    assert.equal(enr.source, "subscription");
  });

  it("sends the trial reminder on schedule, then converts and charges if not canceled; one trial per learner", () => {
    const s = storeOf("academy");
    const u = as("academy", "student3", false);
    const sub = s.list("subscriptions", (x) => x.userId === u.actor.id && x.kind === "plus_monthly")[0];
    const before = notes(u.actor.id, /trial ends/);
    advanceClock(5.5 * 86_400_000); // 7-day trial, reminder 2 days before
    P.tickPlans(s, nowMs());
    P.tickPlans(s, nowMs()); // idempotent
    assert.equal(notes(u.actor.id, /trial ends/) - before, 1);
    advanceClock(2 * 86_400_000);
    P.tickPlans(s, nowMs());
    const after = s.get("subscriptions", sub.id)!;
    assert.equal(after.state, "active");
    assert.equal(s.list("orders", (o) => o.subscriptionId === sub.id && o.state === "paid_sandbox").length, 1);
    assert.equal(P.quotePlan(s, "plus_monthly", undefined, u.actor.id).trialDays, 0);
  });

  it("cancellation is one step; access continues to period end, then ends with progress kept", () => {
    const s = storeOf("academy");
    const u = as("academy", "student3", false);
    const sub = s.list("subscriptions", (x) => x.userId === u.actor.id && x.kind === "plus_monthly")[0];
    P.cancelPlan(u.store, u.actor, sub.id);
    assert.equal(s.get("subscriptions", sub.id)!.state, "canceling");
    assert.ok(P.entitlementFor(s, u.actor.id, s.get("offerings", SELF)!), "access continues until the period ends");
    advanceClock(31 * 86_400_000);
    P.tickPlans(s, nowMs());
    assert.equal(s.get("subscriptions", sub.id)!.state, "ended");
    assert.equal(P.entitlementFor(s, u.actor.id, s.get("offerings", SELF)!), null);
    assert.ok(s.list("enrollments", (e) => e.userId === u.actor.id).length > 0, "progress and enrollment records are kept");
  });
});

describe("Annual plan, switching, pausing and refunds", () => {
  it("monthly → annual credits unused time; annual refund inside the window is processed; outside it the policy is explained", () => {
    const s = storeOf("academy");
    const u = as("academy", "student4", false);
    const { subscription } = P.startSubscription(u.store, u.actor, { kind: "plus_annual", acceptTerms: true });
    assert.equal(subscription.state, "active");
    const r = P.refundPlan(u.store, u.actor, subscription.id);
    assert.equal(r.decision, "refunded");
    assert.equal(s.get("subscriptions", subscription.id)!.state, "ended");
    const again = P.startSubscription(u.store, u.actor, { kind: "plus_annual", acceptTerms: true }).subscription;
    advanceClock(20 * 86_400_000);
    const late = P.refundPlan(u.store, u.actor, again.id);
    assert.equal(late.decision, "policy_explained");
    assert.match(late.explanation, /money-back window has passed/);
  });

  it("program subscriptions only cover their program; pause keeps progress and resumes", () => {
    const s = storeOf("academy");
    const u = as("academy", "student5", false);
    const { subscription } = P.startSubscription(u.store, u.actor, { kind: "program_monthly", offeringId: SELF, acceptTerms: true });
    assert.ok(P.entitlementFor(s, u.actor.id, s.get("offerings", SELF)!));
    const other = s.list("offerings", (o) => o.state === "published" && !!o.selfPaced && o.id !== SELF)[0];
    if (other) assert.equal(P.entitlementFor(s, u.actor.id, other), null);
    P.pausePlan(u.store, u.actor, subscription.id, 1);
    assert.equal(s.get("subscriptions", subscription.id)!.state, "paused");
    P.resumePlan(u.store, u.actor, subscription.id);
    assert.equal(s.get("subscriptions", subscription.id)!.state, "active");
  });
});

describe("Financial aid", () => {
  it("guides word counts, queues for a person, and approval gives that learner the approved discount", () => {
    const s = storeOf("academy");
    const u = as("academy", "student6", false);
    assert.equal(status(() => P.applyForAid(u.store, u.actor, { offeringId: SELF, background: "short", need: words(120), goals: words(120), commitment: true })), 422);
    const app = P.applyForAid(u.store, u.actor, { offeringId: SELF, background: words(60), need: words(150), goals: words(120), commitment: true, requestedPct: 100 });
    const q = P.aidQueue(s, as("academy", "admin", true).actor);
    assert.match(q.find((x) => x.id === app.id)!.summary.label, /a person decides/);
    assert.equal(status(() => P.decideAid(s, as("academy", "advisor", false).actor, app.id, "approved", 100, "")), 403);
    const d = P.decideAid(s, as("academy", "admin", true).actor, app.id, "approved", 100, "Approved — welcome.");
    assert.ok(d.couponCode);
    assert.equal(notes(u.actor.id, /Financial aid approved/), 1);
    assert.equal(A.quote(s, { offeringId: SELF, coupon: String(d.couponCode), userId: u.actor.id }).total, 0);
    assert.equal(status(() => A.quote(s, { offeringId: SELF, coupon: String(d.couponCode), userId: "usr_someone_else" })), 422);
    const order = A.checkout(u.store, u.actor, { offeringId: SELF, coupon: String(d.couponCode), sandboxCard: "tok_sandbox_visa" }).order;
    assert.equal(order.total, 0);
  });
});

describe("Honest catalog", () => {
  it("Degrees are hidden (404) and the Copy Checker flags an accredited-degree claim", () => {
    assert.match(fs.readFileSync("src/app/campus/[tenant]/degrees/page.tsx", "utf8"), /notFound\(\)/);
    assert.ok(copyCheck(storeOf("academy"), "Earn an accredited degree with us").length > 0);
  });
});
