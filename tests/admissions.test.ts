import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { admissions, commerce, credentials, cx, entitlements, identity, live, tickAll } from "../src/platform";
import { getDb } from "../src/platform/store";
import { PlatformError } from "../src/platform/util";
import { advanceDays, fresh } from "./helpers";

beforeEach(() => fresh());

const longText = (s: string) => `${s} `.repeat(6).trim();

function learner(email: string) {
  return identity.signUp({ name: email.split("@")[0], email, password: "correct-horse-battery", acceptTerms: true });
}

describe("7 · live program admissions", () => {
  it("apply → accept → reserve in installments → join → attend → credential", () => {
    const u = learner("cohort.member@example.com");
    // A seat can't be bought before acceptance.
    assert.throws(() => commerce.createCheckout({ userId: u.id, plan: "live_seat", productId: "prd_p26", idempotencyKey: "x" }), (e: PlatformError) => e.code === "apply_first");
    const app = admissions.apply({ userId: u.id, productId: "prd_p26", experience: longText("Built Python services."), motivation: longText("Want to design agent systems.") });
    assert.ok(cx.outbox(u.email).some((e) => e.template === "application_received"));
    assert.throws(() => admissions.decide(app.id, u.id, "accepted"), (e: PlatformError) => e.status === 403, "learners can't decide");
    admissions.decide(app.id, "usr_admin", "accepted", "Strong background");
    assert.ok(cx.outbox(u.email).some((e) => e.template === "application_decision"));

    const cs = commerce.createCheckout({ userId: u.id, plan: "live_seat", productId: "prd_p26", idempotencyKey: "seat", installments: 3 });
    assert.ok(cs.installmentAmount && Math.abs(cs.installmentAmount * 3 - cs.amount) < 0.03, "three equal installments");
    commerce.confirmSandboxPayment(cs.id, u.id);
    assert.equal(admissions.current(u.id, "prd_p26")!.status, "reserved");
    assert.equal(entitlements.check(u.id, "live.join", "prd_p26").allow, true);
    admissions.onboard(app.id, u.id, true);

    advanceDays(31);
    tickAll();
    advanceDays(31);
    tickAll();
    const plan = getDb().subscriptions.find((s) => s.userId === u.id && s.plan === "live_seat")!;
    assert.equal(plan.installmentsPaid, 3);
    assert.equal(plan.status, "completed");
    assert.equal(getDb().orders.filter((o) => o.userId === u.id).length, 3);

    const seg = getDb().liveSessions.find((s) => s.productId === "prd_p26")!.segments[0];
    assert.match(live.join(u.id, seg.id).url, /example\.invalid/);
    for (const s of getDb().liveSessions.filter((x) => x.productId === "prd_p26")) live.recordAttendance(u.id, s.id, 115);
    assert.ok(credentials.forUser(u.id).some((c) => c.productId === "prd_p26"));
  });

  it("enforces cohort capacity: a full cohort can only waitlist", () => {
    const p = getDb().products.find((x) => x.id === "prd_p26")!;
    p.livePlan!.capacity = 2; // Amara already holds one reserved seat
    const a = learner("a@example.com");
    const b = learner("b@example.com");
    const appA = admissions.apply({ userId: a.id, productId: p.id, experience: longText("Experience A."), motivation: longText("Motivation A.") });
    const appB = admissions.apply({ userId: b.id, productId: p.id, experience: longText("Experience B."), motivation: longText("Motivation B.") });
    admissions.decide(appA.id, "usr_admin", "accepted");
    assert.throws(() => admissions.decide(appB.id, "usr_admin", "accepted"), (e: PlatformError) => e.code === "cohort_full");
    admissions.decide(appB.id, "usr_admin", "waitlisted");
    assert.equal(admissions.capacity(p.id).waitlisted, 1);
    admissions.withdraw(appA.id, a.id);
    admissions.decide(appB.id, "usr_admin", "accepted");
    assert.equal(admissions.current(b.id, p.id)!.status, "accepted");
  });

  it("rejects duplicate and thin applications", () => {
    assert.throws(() => admissions.apply({ userId: "usr_amara", productId: "prd_p26", experience: longText("x y z"), motivation: longText("a b c") }), (e: PlatformError) => e.code === "already_applied");
    const u = learner("thin@example.com");
    assert.throws(() => admissions.apply({ userId: u.id, productId: "prd_p15", experience: "short", motivation: "short" }), (e: PlatformError) => e.code === "experience_short");
  });
});
