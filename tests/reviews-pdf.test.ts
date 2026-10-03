import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { handleApi } from "../src/bff/api";
import { certificatePdf, pdfSafe } from "../src/bff/certificate-pdf";
import { credentials, privacy, reviews } from "../src/platform";
import { DEMO } from "../src/platform/seed";
import { getDb } from "../src/platform/store";
import type { PlatformError } from "../src/platform/util";
import { fresh } from "./helpers";

const NGOZI = "usr_ngozi";
const AGF = "prd_agentic_foundations";
const GOOD = { productId: AGF, rating: 5, title: "Clear and practical", body: "The tool-calling labs made the agent loop finally click for me. Module 3 on guardrails was the best part." };

beforeEach(() => fresh());

describe("Verified reviews", () => {
  it("only credential holders can review", () => {
    assert.ok(reviews.eligibility(NGOZI, AGF));
    assert.throws(() => reviews.submit("usr_amara", GOOD), (e: PlatformError) => e.code === "not_eligible");
    const r = reviews.submit(NGOZI, GOOD);
    assert.equal(r.status, "published");
    assert.deepEqual(reviews.summary(AGF), { count: 1, average: 5, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } });
  });

  it("one review per learner per program; editing replaces it", () => {
    reviews.submit(NGOZI, GOOD);
    reviews.submit(NGOZI, { ...GOOD, rating: 3, title: "Good but fast" });
    const mine = getDb().reviews.filter((r) => r.userId === NGOZI);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].rating, 3);
    assert.ok(mine[0].updatedAt);
  });

  it("validates rating and length", () => {
    assert.throws(() => reviews.submit(NGOZI, { ...GOOD, rating: 6 }), /1 to 5/);
    assert.throws(() => reviews.submit(NGOZI, { ...GOOD, body: "Great!" }), /at least 30/);
  });

  it("holds links, contact details and unverified claims for moderation", () => {
    assert.equal(reviews.submit(NGOZI, { ...GOOD, body: `${GOOD.body} More at www.example.com` }).status, "pending");
    assert.equal(reviews.submit(NGOZI, { ...GOOD, body: `${GOOD.body} It counts as college credit too.` }).status, "pending");
    assert.equal(reviews.submit(NGOZI, { ...GOOD, body: `${GOOD.body} Call me on +234 803 123 4567.` }).status, "pending");
    // Years and plain numbers are fine.
    assert.equal(reviews.submit(NGOZI, { ...GOOD, body: `${GOOD.body} Took me from 2024 - 2026 to start, 3 weeks to finish.` }).status, "published");
    assert.equal(reviews.summary(AGF).count, 1);
  });

  it("pending reviews are visible only to their author until a moderator publishes", () => {
    const r = reviews.submit(NGOZI, { ...GOOD, body: `${GOOD.body} See https://x.example` });
    assert.equal(reviews.forProduct(AGF, null).length, 0);
    assert.equal(reviews.forProduct(AGF, NGOZI).length, 1);
    assert.throws(() => reviews.moderate(r.id, "usr_amara", "publish"), /staff/);
    reviews.moderate(r.id, "usr_admin", "publish");
    assert.equal(reviews.forProduct(AGF, null).length, 1);
  });

  it("three reports hold a review; moderator removal sticks", () => {
    const r = reviews.submit(NGOZI, GOOD);
    assert.throws(() => reviews.report(r.id, NGOZI), /own review/);
    for (const u of ["usr_amara", "usr_kemi", "usr_tunde"]) reviews.report(r.id, u);
    assert.equal(getDb().reviews[0].status, "pending");
    reviews.moderate(r.id, "usr_admin", "hide", "Off-topic");
    assert.throws(() => reviews.submit(NGOZI, GOOD), /removed by a moderator/);
  });

  it("revoking the credential takes the review down", () => {
    reviews.submit(NGOZI, GOOD);
    credentials.revoke(credentials.forUser(NGOZI)[0].id, "test");
    assert.equal(reviews.summary(AGF).count, 0);
    assert.equal(reviews.eligibility(NGOZI, AGF), null);
  });

  it("shows first name and last initial only", () => {
    reviews.submit(NGOZI, GOOD);
    assert.equal(reviews.forProduct(AGF, null)[0].author, "Ngozi E.");
  });

  it("are included in export and removed on account deletion", () => {
    reviews.submit(NGOZI, GOOD);
    assert.equal(privacy.exportData(NGOZI).reviews.length, 1);
    privacy.deleteAccount(NGOZI, DEMO.graduate.password, "DELETE");
    assert.equal(getDb().reviews.length, 0);
  });
});

describe("Certificate PDF", () => {
  it("renders a one-page PDF with the holder, program and verification link", async () => {
    const bytes = await certificatePdf({ id: "crd_x", holderName: "Ngozi Eze", title: "Agentic AI Foundations badge", programTitle: "Agentic AI Foundations", kind: "badge", issuedAt: "2026-10-03T12:00:00.000Z", verifyUrl: "https://academy.example/verify/crd_x", hours: 6 });
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    assert.match(doc.getTitle() ?? "", /Ngozi Eze/);
    assert.match(doc.getSubject() ?? "", /verify\/crd_x/);
    assert.match(doc.getSubject() ?? "", /Non-credit/);
  });

  it("folds characters the standard fonts can't draw", () => {
    assert.equal(pdfSafe("Ngọzi Ézè — “ok”"), 'Ngozi Eze - "ok"');
  });

  it("is downloadable only by the holder", async () => {
    const id = credentials.forUser(NGOZI)[0].id;
    const signIn = async (email: string, password: string) => {
      const r = await handleApi(new Request("http://localhost:3000/api/v1/auth/signin", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email, password }).toString() }), "auth/signin");
      return r.headers.getSetCookie()[0].split(";")[0];
    };
    const get = (cookie?: string) => handleApi(new Request(`http://localhost:3000/api/v1/credentials/${id}/pdf`, { headers: { host: "localhost:3000", ...(cookie ? { cookie } : {}) } }), `credentials/${id}/pdf`);
    const mine = await get(await signIn(DEMO.graduate.email, DEMO.graduate.password));
    assert.equal(mine.status, 200);
    assert.equal(mine.headers.get("content-type"), "application/pdf");
    assert.equal((await get(await signIn(DEMO.learner.email, DEMO.learner.password))).status, 404);
    assert.notEqual((await get()).status, 200);
  });
});
