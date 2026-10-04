import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handleApi } from "../src/bff/api";
import { EXPLORE_CANONICAL, exploreLd, homeLd, hubLd, productLd } from "../src/bff/seo";
import { checkoutVM, commerceAdminVM, dashboardVM, educatorVM, exploreVM, homeVM, hubVM, itemVM, myLearningVM, productVM } from "../src/bff/views";
import { authoring, catalog, cloudlab, commerce, cx, entitlements, identity, library, lms, recommend, studio, tickAll } from "../src/platform";
import { AUDIO_NOT_CONNECTED } from "../src/platform/studio";
import { getDb } from "../src/platform/store";
import type { AudioOverview, MindMapNode } from "../src/platform/types";
import { PlatformError } from "../src/platform/util";
import { PricingCalculator } from "../src/ui/components/client/PricingCalculator";
import { advanceDays, fresh } from "./helpers";

/** Site gaps 1–14, exercised at the platform and BFF level (no Next.js needed). */

const BASE = "http://localhost:3000";

function learner(name = "Gap Tester") {
  return identity.signUp({ name, email: `gap${Math.random().toString(36).slice(2, 9)}@example.com`, password: "correct-horse-battery", acceptTerms: true });
}

function cookieFor(userId: string) {
  return `sch_session=${identity.createSession(userId, "academy-public").token}`;
}

async function call(method: string, path: string, opts: { form?: Record<string, string>; json?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000" };
  let body: string | undefined;
  if (opts.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  if (opts.cookie) headers.cookie = opts.cookie;
  return handleApi(new Request(`${BASE}/api/v1/${path}`, { method, headers, body }), path.split("?")[0]);
}

/** Server-renders a client component (hooks run once) without a browser. */
async function renderStatic(component: unknown, props: Record<string, unknown>): Promise<string> {
  const reactName = "react";
  const serverName = "react-dom/server";
  const React = (await import(reactName)) as { createElement: (c: unknown, p: unknown) => unknown };
  const { renderToStaticMarkup } = (await import(serverName)) as { renderToStaticMarkup: (el: unknown) => string };
  // Client components compile with the classic JSX runtime under tsx (tsconfig "jsx": "preserve").
  (globalThis as { React?: unknown }).React = React;
  return renderToStaticMarkup(React.createElement(component, props));
}

const LONG = (topic: string) => Array.from({ length: 160 }, (_, i) => `${topic}${i % 7}`).join(" ");

beforeEach(() => fresh());

describe("1 · explore facets: skills, duration, subtitles, language", () => {
  it("filters and counts each facet end to end", async () => {
    const all = catalog.search({});
    assert.ok(all.facets.skills.Python > 0 && all.facets.language.English > 0 && all.facets.subtitles.English > 0);
    assert.ok(all.facets.duration.short > 0 && all.facets.duration.long > 0);

    const py = catalog.search({ skills: ["Python"] });
    assert.ok(py.total > 0 && py.items.every((p) => p.skills.includes("Python")));
    const short = catalog.search({ duration: ["short"] });
    assert.ok(short.items.every((p) => p.hours < 5) && short.items.some((p) => p.type === "guided_project"));
    assert.equal(catalog.search({ language: "Klingon" }).total, 0);
    assert.equal(catalog.search({ subtitles: ["Spanish"] }).total, catalog.search({}).items.filter((p) => p.subtitles.includes("Spanish")).length);

    // exploreVM now passes language and the new facets through.
    const vm = exploreVM({ skill: ["RAG"], duration: "short", language: "English", subtitles: "English" });
    assert.deepEqual(vm.filters.skills, ["RAG"]);
    assert.equal(vm.filters.language, "English");
    assert.ok(vm.result.items.length > 0 && vm.result.items.every((p) => p.skills.includes("RAG") && p.hours < 5));
    assert.equal(vm.durationLabels.short, "Under 5 hours");

    const res = await call("GET", "catalog/products?skill=RAG&duration=short&language=English");
    const data = (await res.json()) as { items: { slug: string }[] };
    assert.deepEqual(data.items.map((p) => p.slug), vm.result.items.map((p) => p.slug));
  });
});

describe("2 · educator profile", () => {
  it("shows only catalog facts and links from product pages", async () => {
    const vm = productVM("python-programming-cop1047c", null)!;
    assert.equal(vm.educatorHref, "/educators/scholarion-academy");
    const e = educatorVM("scholarion-academy")!;
    assert.equal(e.name, "Scholarion Academy");
    assert.ok(e.bio && !/accredited|degree|learners|rating/i.test(e.bio), "bio is a confirmed, claim-free statement");
    assert.ok(e.courses.some((p) => p.slug === "python-programming-cop1047c"));
    assert.ok(e.credentials.length > 0 && e.credentials.every((c) => e.products.some((p) => p.credential.title === c.title)));
    assert.deepEqual(e.qualifications, [], "no invented qualifications");
    assert.equal(educatorVM("nobody"), null);
    assert.equal((await call("GET", "catalog/educators/scholarion-academy")).status, 200);
    assert.equal((await call("GET", "catalog/educators/nobody")).status, 404);
  });
});

describe("3 · guided project page and Cloud Lab launch", () => {
  it("describes the build and launches the lab only for entitled learners", async () => {
    const u = learner();
    const vm = productVM("guided-project-rag-chatbot", u.id)!;
    assert.ok(vm.guided);
    assert.equal(vm.guided.minutes, 120);
    assert.ok(vm.guided.steps.length >= 3 && vm.guided.autograded);
    assert.equal(vm.guided.canLaunch, false);
    const cookie = cookieFor(u.id);
    const denied = await call("POST", "labs/launch", { form: { productId: "prd_gp_rag" }, cookie });
    assert.match(denied.headers.get("location")!, /\/learn\/guided-project-rag-chatbot\?enroll=1/);

    const cs = commerce.createCheckout({ userId: u.id, plan: "one_time", productId: "prd_gp_rag", idempotencyKey: "gp" });
    commerce.confirmSandboxPayment(cs.id, u.id);
    assert.equal(productVM("guided-project-rag-chatbot", u.id)!.guided!.canLaunch, true);
    const ok = await call("POST", "labs/launch", { form: { productId: "prd_gp_rag" }, cookie });
    assert.match(ok.headers.get("location")!, /^\/app\/course\/prd_gp_rag\/item\/itm_gp_rag_lab/);
    assert.ok(getDb().labSessions.some((s) => s.userId === u.id && s.itemId === "itm_gp_rag_lab" && s.status === "running"));
    assert.ok(lms.enrollment(u.id, "prd_gp_rag"), "first launch enrolls");
  });
});

describe("4 · pricing calculator", () => {
  it("compares real plan prices honestly", async () => {
    const plans = homeVM().plans;
    assert.equal(plans.annualSavings, Math.max(0, plans.plusMonthly * 12 - plans.plusAnnual));
    const html = await renderStatic(PricingCalculator, { plusMonthly: 55, plusAnnual: 420, currency: "USD", trialDays: 7, refundDays: 14 });
    assert.match(html, /6 × \$55 = <strong>\$330<\/strong>/);
    assert.match(html, /1 × \$420 = <strong>\$420<\/strong>/);
    assert.match(html, /For 6 months, monthly costs \$90 less than annual/);
    assert.ok(!/was|now only|save up to/i.test(html), "no fake was/now pricing");
  });
});

describe("5 · onboarding-driven, explainable recommendations with opt-out", () => {
  it("uses goal, role, level, topics and weekly time, and can be turned off", async () => {
    const u = learner();
    const cookie = cookieFor(u.id);
    const r = await call("POST", "me/onboarding", { form: { goal: "Start a new career", role: "Data Analyst", level: "Beginner", topics: "Python", hoursPerWeek: "6" }, cookie });
    assert.equal(r.status, 303);
    assert.equal(identity.getUser(u.id)!.onboarding!.role, "Data Analyst");
    const recs = recommend.forUser(u.id);
    assert.ok(recs.length > 0);
    assert.ok(recs.every((x) => /^Because you chose/.test(x.because)), recs.map((x) => x.because).join(" | "));
    assert.ok(recs.some((x) => x.reasons.some((y) => /role/.test(y))));
    assert.ok(recs.some((x) => x.reasons.some((y) => /beginner level/.test(y))));
    assert.ok(recs.some((x) => x.reasons.some((y) => /start a new career/.test(y))));
    assert.ok(recs.some((x) => x.reasons.some((y) => /hrs\/week/.test(y))));
    assert.ok(dashboardVM(u.id).recommendations.length > 0);

    const auditable = recs.find((x) => x.product.freeToAudit) ?? recommend.forUser(u.id, 50).find((x) => x.product.freeToAudit)!;
    lms.enroll(u.id, auditable.product.id, "audit");
    assert.ok(!recommend.forUser(u.id, 50).some((x) => x.product.id === auditable.product.id), "enrolled items drop out");

    await call("POST", "me/recommendations", { form: { enabled: "off" }, cookie });
    assert.equal(recommend.forUser(u.id).length, 0);
    assert.equal(dashboardVM(u.id).recommendationsOn, false);
    recommend.setEnabled(u.id, true);
    assert.ok(recommend.forUser(u.id).length > 0);
  });
});

describe("6 · My Learning: saved list and explicit Completed", () => {
  it("saves from the product page, lists, removes; completions come from passes and credentials", async () => {
    const u = learner();
    const cookie = cookieFor(u.id);
    await call("POST", "me/saved", { form: { productId: "prd_p16", back: "/learn/x" }, cookie });
    assert.equal(productVM("prd_p16", u.id)!.saved, true);
    assert.deepEqual(myLearningVM(u.id).saved.map((s) => s.product.id), ["prd_p16"]);
    await call("POST", "me/saved/prd_p16/remove", { form: { back: "/app/courses" }, cookie });
    assert.equal(myLearningVM(u.id).saved.length, 0);
    assert.throws(() => library.save(u.id, "degrees"), (e: PlatformError) => e.code === "not_found");

    // usr_ngozi holds the Agentic AI Foundations credential in the seed.
    const done = myLearningVM("usr_ngozi").completed;
    assert.ok(done.some((d) => d.product.id === "prd_agentic_foundations" && d.credentialId));
    assert.equal(myLearningVM(u.id).completed.length, 0);
  });
});

describe("7 · video notes and bookmarks", () => {
  it("creates, lists in time order, jumps (atSec) and deletes, per user and server-side", async () => {
    const video = catalog.items("prd_cop1047c").find((i) => i.kind === "video")!;
    const amara = "usr_amara";
    const cookie = cookieFor(amara);
    const r1 = await call("POST", `lms/items/${video.id}/notes`, { json: { atSec: 42, text: "Key idea here", kind: "note" }, cookie });
    assert.equal(r1.status, 200);
    library.addNote(amara, video.id, { atSec: 5, kind: "bookmark" });
    const list = library.notes(amara, video.id);
    assert.deepEqual(list.map((n) => [n.atSec, n.kind]), [[5, "bookmark"], [42, "note"]]);
    assert.deepEqual(itemVM(amara, "prd_cop1047c", video.id)!.notes.map((n) => n.atSec), [5, 42]);
    assert.equal(library.notes("usr_tunde", video.id).length, 0, "private to the learner");
    assert.throws(() => library.addNote(amara, video.id, { atSec: 999999, text: "x" }), (e: PlatformError) => e.code === "invalid_time");
    assert.throws(() => library.addNote(learner().id, video.id, { atSec: 1, text: "x" }), (e: PlatformError) => e.code === "not_enrolled");
    assert.throws(() => library.deleteNote("usr_tunde", list[0].id), (e: PlatformError) => e.code === "not_found");
    const del = await call("POST", `lms/notes/${list[0].id}/delete`, { json: {}, cookie });
    assert.equal(del.status, 200);
    assert.equal(library.notes(amara, video.id).length, 1);
  });
});

describe("8 · Studio audio overview and mind map", () => {
  it("generates a labelled script + transcript (no TTS connected) and an outline tree", () => {
    const outs = studio.generate("prd_cop1047c", 3);
    const audio = outs.find((o) => o.kind === "audio_overview")!;
    const map = outs.find((o) => o.kind === "mind_map")!;
    const a = audio.content as AudioOverview;
    assert.equal(a.audioUrl, null);
    assert.equal(a.audioStatus, AUDIO_NOT_CONNECTED);
    assert.match(a.audioStatus, /script — audio narration not connected/i);
    assert.ok(a.script.length >= 3 && a.transcript.includes(a.script[0].text));
    const root = (map.content as { root: MindMapNode }).root;
    assert.match(root.label, /^Module 3:/);
    assert.ok(root.children.some((c) => c.label === "Key topics" && c.children.length > 0));
    assert.equal(studio.forModule("prd_cop1047c", 3).length, 0, "drafts stay hidden until approved");
  });
});

describe("9 · switch plan, annual upgrade with proration, invoices", () => {
  it("switches program ↔ Plus monthly and upgrades to annual with an honest quote", async () => {
    const u = learner();
    const cs = commerce.createCheckout({ userId: u.id, plan: "program_monthly", productId: "prd_cert_python", idempotencyKey: "pm" });
    const { subscription } = commerce.confirmSandboxPayment(cs.id, u.id);
    advanceDays(10);
    const q = commerce.quoteChange(subscription!.id, u.id, "plus_monthly");
    assert.equal(q.allowed, true);
    assert.equal(q.remainingDays, 20);
    assert.equal(q.credit, 30); // 45 × 20/30
    assert.ok(Math.abs(q.chargeToday - (55 - 45) * (20 / 30)) < 0.01);
    assert.match(q.explanation, /20 of 30 days/);
    commerce.changePlan(subscription!.id, u.id, "plus_monthly");
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_gp_rag").allow, true, "Plus access now");
    assert.equal(commerce.quoteChange(subscription!.id, u.id, "plus_monthly").allowed, false);

    // Back to a program: credit for the difference goes to the next bill.
    const back = commerce.changePlan(subscription!.id, u.id, "program_monthly", "prd_cert_python");
    assert.equal(back.quote.chargeToday, 0);
    assert.ok(back.quote.creditToNextBill > 0 && back.subscription.credit! > 0);
    assert.throws(() => commerce.changePlan(subscription!.id, u.id, "program_monthly", "prd_cop1047c"), (e: PlatformError) => e.code === "change_not_allowed");

    // Plus monthly → annual: unused days credited against the annual price.
    const u2 = learner();
    const c2 = commerce.createCheckout({ userId: u2.id, plan: "plus_monthly", productId: null, idempotencyKey: "pl" });
    const s2 = commerce.confirmSandboxPayment(c2.id, u2.id).subscription!;
    advanceDays(7.5); // trial converts to paid monthly
    tickAll();
    advanceDays(15);
    const qa = commerce.quoteChange(s2.id, u2.id, "plus_annual");
    assert.ok(qa.allowed && qa.credit > 0 && qa.chargeToday === Math.round((420 - qa.credit) * 100) / 100);
    const up = commerce.changePlan(s2.id, u2.id, "plus_annual");
    assert.equal(up.subscription.plan, "plus_annual");
    const order = commerce.ordersFor(u2.id)[0];
    assert.equal(order.amount, qa.chargeToday);
    assert.equal(order.discount, qa.credit);

    // Invoice PDF for the owner only.
    const pdf = await call("GET", `commerce/orders/${order.id}/invoice`, { cookie: cookieFor(u2.id) });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
    assert.equal((await call("GET", `commerce/orders/${order.id}/invoice`, { cookie: cookieFor(u.id) })).status, 404);
  });
});

describe("10 · pre-renewal notice", () => {
  it("emails N days before a renewal charge, once per period, alongside the trial reminder", () => {
    const u = learner();
    const cs = commerce.createCheckout({ userId: u.id, plan: "program_monthly", productId: "prd_cert_python", idempotencyKey: "rn" });
    commerce.confirmSandboxPayment(cs.id, u.id);
    advanceDays(20);
    assert.equal(commerce.tick().renewalNotices, 0);
    advanceDays(4); // 6 days before the 30-day renewal (default notice: 7 days)
    const r = tickAll();
    assert.ok(r.commerce.renewalNotices >= 1);
    const mails = cx.outbox(u.email).filter((e) => e.template === "renewal_upcoming");
    assert.equal(mails.length, 1);
    assert.match(mails[0].body, /renews on .* and we'll charge \$45 \(sandbox\)/);
    tickAll();
    assert.equal(cx.outbox(u.email).filter((e) => e.template === "renewal_upcoming").length, 1, "no duplicates");
    // Trials still get the trial reminder, not the renewal notice.
    const t = learner();
    commerce.confirmSandboxPayment(commerce.createCheckout({ userId: t.id, plan: "plus_monthly", productId: null, idempotencyKey: "tr" }).id, t.id);
    advanceDays(5.5);
    tickAll();
    assert.ok(cx.outbox(t.email).some((e) => e.template === "trial_ending"));
    assert.ok(!cx.outbox(t.email).some((e) => e.template === "renewal_upcoming"));
  });
});

describe("11 · partial financial aid discounts checkout", () => {
  it("approves 40% → discounted price (not free access); 100% stays free access", () => {
    const u = learner();
    const app = commerce.applyForAid({ userId: u.id, productId: "prd_cert_python", background: "b", need: LONG("need"), goals: LONG("goal"), commitment: true });
    commerce.decideAid(app.id, "usr_admin", "approved", 40);
    assert.equal(entitlements.check(u.id, "item.graded", "prd_cert_python").allow, false, "partial aid is not free access");
    assert.equal(productVM("prd_cert_python", u.id)!.aidDiscount, 40);
    const cs = commerce.createCheckout({ userId: u.id, plan: "program_monthly", productId: "prd_cert_python", idempotencyKey: "aid" });
    assert.equal(cs.listAmount, 45);
    assert.equal(cs.amount, 27);
    assert.equal(cs.aidDiscountPercent, 40);
    assert.equal(cs.dueToday, 27);
    assert.equal(checkoutVM(cs.id, u.id)!.canUseCoupon, false, "codes don't stack with aid");
    const { subscription } = commerce.confirmSandboxPayment(cs.id, u.id);
    assert.equal(subscription!.amount, 27, "each monthly payment is discounted");
    assert.equal(entitlements.check(u.id, "item.graded", "prd_cert_python").allow, true);
    assert.match(cx.outbox(u.email).find((e) => e.template === "aid_decision")!.body, /applied automatically when you check out/);
  });
});

describe("12 · instructor Plus-eligibility toggle", () => {
  it("defaults on and can be turned off and on", () => {
    const p = authoring.createCourse("usr_faculty", { title: "Toggle Test Course" });
    assert.equal(p.plusEligible, true);
    authoring.updateCourse("usr_faculty", p.id, { plusEligible: "false" });
    assert.equal(getDb().products.find((x) => x.id === p.id)!.plusEligible, false);
    authoring.updateCourse("usr_faculty", p.id, { plusEligible: "on" });
    assert.equal(getDb().products.find((x) => x.id === p.id)!.plusEligible, true);
    assert.equal(authoring.createCourse("usr_faculty", { title: "Not In Plus", plusEligible: false }).plusEligible, false);
  });
});

describe("13 · commerce admin (sandbox)", () => {
  it("edits prices, trial length and simulated tax; manages coupons; decides refunds", async () => {
    commerce.updateSettings("usr_admin", { plusMonthly: "60", trialDays: "14", renewalNoticeDays: "5", tax_GB: "20" });
    assert.equal(commerce.plansSummary("US").plusMonthly, 60);
    assert.throws(() => commerce.updateSettings("usr_admin", { plusAnnual: "-5" }), (e: PlatformError) => e.code === "invalid_price");
    const u = learner();
    const trial = commerce.createCheckout({ userId: u.id, plan: "plus_monthly", productId: null, idempotencyKey: "t14" });
    assert.equal(Math.round((Date.parse(trial.trialEndsAt!) - Date.parse(trial.createdAt)) / 86400000), 14);
    const gb = commerce.createCheckout({ userId: u.id, plan: "one_time", productId: "prd_gp_patient", region: "GB", idempotencyKey: "gb" });
    assert.equal(gb.taxRate, 20);
    assert.equal(gb.tax, Math.round(gb.amount * 0.2 * 100) / 100);
    assert.equal(gb.dueToday, Math.round((gb.amount + gb.tax!) * 100) / 100);

    // Coupons: create, validate, redeem, expire.
    commerce.createCoupon("usr_admin", { code: "learn10", percentOff: 10, maxRedemptions: 1 });
    assert.throws(() => commerce.createCoupon("usr_admin", { code: "LEARN10", percentOff: 5 }), (e: PlatformError) => e.code === "duplicate_code");
    assert.throws(() => commerce.applyCoupon(trial.id, u.id, "LEARN10"), (e: PlatformError) => e.code === "coupon_trial");
    assert.throws(() => commerce.applyCoupon(gb.id, u.id, "NOPE"), (e: PlatformError) => e.code === "coupon_invalid");
    const us = commerce.createCheckout({ userId: u.id, plan: "one_time", productId: "prd_gp_rag", idempotencyKey: "us" });
    const withCode = commerce.applyCoupon(us.id, u.id, "learn10");
    assert.equal(withCode.discount, 1.5);
    assert.equal(withCode.dueToday, 13.5);
    commerce.confirmSandboxPayment(us.id, u.id);
    assert.equal(commerce.coupons()[0].redemptions, 1);
    assert.equal(commerce.ordersFor(u.id)[0].amount, 13.5);
    const again = commerce.createCheckout({ userId: u.id, plan: "one_time", productId: "prd_gp_patient", idempotencyKey: "again" });
    assert.throws(() => commerce.applyCoupon(again.id, u.id, "LEARN10"), (e: PlatformError) => e.code === "coupon_used_up");
    commerce.createCoupon("usr_admin", { code: "SPRING", percentOff: 20, expiresInDays: 3 });
    advanceDays(4);
    assert.throws(() => commerce.applyCoupon(again.id, u.id, "SPRING"), (e: PlatformError) => e.code === "coupon_expired");
    commerce.createCoupon("usr_admin", { code: "STOPME", percentOff: 20 });
    commerce.expireCoupon("stopme");
    assert.throws(() => commerce.validateCoupon("STOPME"), (e: PlatformError) => e.code === "coupon_expired");

    // Refund queue for one-time purchases.
    const order = commerce.ordersFor(u.id).find((o) => o.productId === "prd_gp_rag")!;
    commerce.requestOrderRefund(order.id, u.id, "Bought the wrong project");
    assert.throws(() => commerce.requestOrderRefund(order.id, u.id, ""), (e: PlatformError) => e.code === "not_refundable");
    const vm = commerceAdminVM();
    assert.equal(vm.refunds.length, 1);
    assert.equal(vm.refunds[0].gradedItems, 0);
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_gp_rag").allow, true);
    const admin = cookieFor("usr_admin");
    const learnerCookie = cookieFor(u.id);
    assert.equal((await call("POST", `admin/commerce/refunds/${vm.refunds[0].id}/approve`, { form: { note: "ok" }, cookie: learnerCookie })).status, 403);
    assert.equal((await call("POST", `admin/commerce/refunds/${vm.refunds[0].id}/approve`, { form: { note: "ok" }, cookie: admin })).status, 303);
    assert.equal(commerce.ordersFor(u.id).find((o) => o.id === order.id)!.status, "refunded");
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_gp_rag").allow, false, "access from the refunded order ends");
    assert.ok(cx.outbox(u.email).some((e) => e.template === "refund"));

    // Admin routes over HTTP.
    assert.equal((await call("POST", "admin/commerce/coupons", { form: { code: "API5", percentOff: "5" }, cookie: admin })).status, 303);
    assert.ok(commerce.coupons().some((c) => c.code === "API5"));
    assert.equal((await call("POST", "admin/commerce/settings", { form: { programMonthly: "50" }, cookie: learnerCookie })).status, 403);
  });
});

describe("14 · SEO structured data", () => {
  it("adds BreadcrumbList on product and hub pages, ItemList on explore and home", () => {
    const prod = productLd(productVM("python-programming-cop1047c", null)!);
    const crumbs = prod.find((x) => x["@type"] === "BreadcrumbList") as { itemListElement: { name: string; position: number; item: string }[] };
    assert.ok(crumbs);
    assert.deepEqual(crumbs.itemListElement.map((x) => x.name), ["Home", "Explore", "Courses", "Python Programming"]);
    assert.match(crumbs.itemListElement[3].item, /\/learn\/python-programming-cop1047c$/);
    assert.ok(!prod.some((x) => "aggregateRating" in x), "no rating without verified reviews");

    const hub = hubLd(hubVM("agentic-ai")!);
    assert.ok(hub.some((x) => x["@type"] === "BreadcrumbList") && hub.some((x) => x["@type"] === "ItemList"));
    const ex = exploreLd(exploreVM({ q: "python" }));
    const list = ex.find((x) => x["@type"] === "ItemList") as { itemListElement: unknown[] };
    assert.ok(list.itemListElement.length > 0);
    assert.equal(EXPLORE_CANONICAL, "/explore");
    const home = homeLd(homeVM());
    assert.ok(home.some((x) => x["@type"] === "ItemList"));
    assert.ok(homeVM().pathway.foundation.length > 0, "home carries the learning-paths diagram data");
  });
});
