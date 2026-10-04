import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as C from "../src/campus/services/cci";
import { copyCheck } from "../src/campus/services/claims";
import { ai801CourseId } from "../src/campus/academy/ai801-seed";
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";
import { unzip } from "../src/documents";

/** Curriculum & Course Intelligence — acceptance scenario. */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string) => as("academy", k, true);

const GOOD = {
  source: { name: "Partner institution (demo)", owner: "Partner curriculum office" },
  title: "BSc IT program model",
  version: "0.9.0",
  license: "Licensed to Scholarion Academy under agreement for curriculum design",
  creditStatus: "credit-bearing model",
  branding: { keepScholarionBranding: true },
  programs: [{ title: "Applied Computing Year 3", level: "300", weeks: 15, outcomes: ["Design relational databases for a business case.", "Evaluate system security controls.", "Implement web services with tests."] }],
};

before(() => freshCampus());

describe("Curriculum Exchange", () => {
  it("imports a package through quarantine, scan, schema, licence and learner-data checks, then needs a different approver", () => {
    const d = u("designer");
    const p = C.importPackage(d.store, d.actor, JSON.stringify(GOOD));
    assert.equal(p.state, "awaiting_approval");
    assert.deepEqual((p.steps as { ok: boolean }[]).map((s) => s.ok), [true, true, true, true, true]);
    assert.ok(p.alignmentAudit);
    assert.equal(status(() => C.approvePackage(d.store, d.actor, p.id, "Scholarion Academy")), 403);
    const ok = C.approvePackage(storeOf("academy"), u("admin").actor, p.id, "Scholarion Academy");
    assert.equal(ok.state, "approved");
  });

  it("rejects packages carrying learner data or executable content", () => {
    const d = u("designer");
    const leak = C.importPackage(d.store, d.actor, JSON.stringify({ ...GOOD, programs: [{ ...GOOD.programs[0], outcomes: ["x y z"], grades: [{ student: "a", score: 90 }] }] }));
    assert.equal(leak.state, "rejected");
    assert.match(JSON.stringify(leak.steps), /Learner or personal data fields found/);
    const script = C.importPackage(d.store, d.actor, JSON.stringify({ ...GOOD, title: "<script>alert(1)</script>" }));
    assert.equal(script.state, "rejected");
    assert.equal(C.exchangeAudit(d.store, d.actor).learnerDataTransferred, false);
  });

  it("export keeps Academy branding unless a decision is recorded, and waits for an approver", () => {
    const d = u("designer");
    assert.equal(status(() => C.exportPackage(d.store, d.actor, "#2", { partnerLabel: "Partner", keepScholarionBranding: false })), 422);
    const e = C.exportPackage(d.store, d.actor, "#2", { partnerLabel: "Partner", keepScholarionBranding: true });
    assert.equal(e.state, "awaiting_approval");
    assert.equal(e.creditStatus, "non-credit");
  });
});

describe("Program Design Studio and alignment", () => {
  it("drafts a program, flags overlap with an existing program, and claims-checks the catalog copy", () => {
    const d = u("designer");
    const draft = C.draftProgram(d.store, d.actor, { title: "Applied Generative and Agentic AI Builders", audience: "developers", level: "intermediate", weeks: 16, delivery: "live cohort", skills: ["retrieval-augmented generation", "prompt testing", "tool-using agents", "evaluation", "guardrails"] });
    assert.match(draft.status, /AI DRAFT/);
    assert.equal(draft.outcomes.length, 5);
    assert.equal(draft.overlap.length, 5);
    assert.ok(draft.overlap[0].pct > 0);
    assert.deepEqual(draft.claims, []);
    assert.equal(status(() => C.draftProgram(u("instructor").store, u("instructor").actor, { title: "Something long", audience: "x", level: "", weeks: 10, delivery: "", skills: ["a", "b", "c"] })), 403);
  });

  it("the alignment matrix gives a coverage heatmap with Bloom levels and an issues list", () => {
    const al = C.alignment(storeOf("academy"), u("designer").actor, "#1");
    assert.equal(al.outcomes.length, 5);
    assert.ok(al.heat.every((h) => h.weeks.some((w) => w.level === 3)), "every competency is mastered somewhere");
    assert.ok(Array.isArray(al.issues));
  });

  it("standards mapping uses a human-loaded pack and says evidence for review, never compliant", () => {
    const r = u("registrar");
    assert.equal(status(() => C.loadFrameworkPack(r.store, r.actor, { name: "Skills framework (demo)", source: "http://insecure", version: "1", publishedOn: "2026-01-01", items: [{ id: "S1", text: "x" }], verifiedBy: "R" })), 422);
    const pack = C.loadFrameworkPack(r.store, r.actor, { name: "Skills framework (demo)", source: "https://example.org/framework", version: "1.0", publishedOn: "2026-01-15", items: [{ id: "S1", text: "Build retrieval augmented generation applications with citations" }, { id: "S2", text: "Operate underwater welding equipment" }], verifiedBy: "Standards reviewer" });
    const ev = C.evidencePack(r.store, r.actor, "#2", pack.id);
    assert.match(ev.label, /Evidence for review/);
    assert.doesNotMatch(JSON.stringify(ev), /\bcompliant\b|\baccredited\b/i);
    assert.equal(ev.crosswalk.find((c) => c.item === "S1")!.strength !== "none", true);
    assert.ok(ev.gaps.some((g) => g.startsWith("S2")));
  });

  it("a catalog claim about college credit is caught by the Copy Checker", () => {
    assert.ok(copyCheck(storeOf("academy"), "Earn college credit toward your degree").length > 0);
  });
});

describe("Health, assessment, freshness and accessibility", () => {
  it("course health is explainable and leaves unmeasured parts out", () => {
    const h = C.courseHealth(storeOf("academy"), u("designer").actor, ai801CourseId(storeOf("academy")));
    assert.ok(h.completion.length > 0);
    assert.ok(h.notMeasured.length >= 1);
    assert.match(h.explanation, /left out, not guessed/);
  });

  it("item analysis reports difficulty and discrimination from graded attempts", () => {
    const r = C.itemAnalysis(storeOf("academy"), u("designer").actor, ai801CourseId(storeOf("academy")));
    assert.ok(typeof r.attempts === "number");
    assert.match(r.method, /upper-27%/);
  });

  it("the Freshness Sentinel opens one ticket per stale resource with impact analysis", () => {
    const s = storeOf("academy");
    const res = s.list("eco_resources", (x) => /langchain/i.test(String(x.name)))[0] ?? s.list("eco_resources")[0];
    s.tx(() => s.update("eco_resources", res.id, { verifiedAt: "2025-01-01T00:00:00.000Z" }));
    const first = C.freshnessScan(s, u("designer").actor);
    assert.ok(first.opened >= 1);
    assert.equal(C.freshnessScan(s, u("designer").actor).opened, 0, "idempotent");
    assert.ok(first.open.some((t) => t.subject === res.name));
  });

  it("the accessibility audit checks structure, alt text and captions", () => {
    const r = C.accessibilityAudit(storeOf("academy"), u("designer").actor);
    assert.ok(r.checked > 0);
    assert.ok(typeof r.score === "number");
  });
});

describe("Proposals and approvals", () => {
  it("signals become AI-drafted proposals; approvals move stage by stage with separation of duties", () => {
    const s = storeOf("academy");
    const req = u("instructor2");
    const made = C.proposeFromSignals(s, req.actor);
    assert.ok(made.created >= 1);
    const p = s.list("cci_proposals", (x) => x.requestedBy === req.actor.id)[0];
    assert.equal(p.state, "AI Draft");
    assert.equal(status(() => C.advanceProposal(s, req.actor, p.id, "approve", "")), 403); // instructor can't approve the draft stage
    C.advanceProposal(s, u("designer").actor, p.id, "approve", "Looks right");
    assert.equal(status(() => C.advanceProposal(s, u("designer").actor, p.id, "approve", "again")), 409); // different reviewer per stage
    C.advanceProposal(s, u("admin").actor, p.id, "approve", "Designer review ok");
    C.advanceProposal(s, u("instructor").actor, p.id, "approve", "SME ok");
    C.advanceProposal(s, u("designer").actor, p.id, "approve", "Assessment and accessibility ok");
    C.advanceProposal(s, u("admin").actor, p.id, "approve", "QA ok");
    const pub = C.advanceProposal(s, u("registrar").actor, p.id, "approve", "Committee approves");
    assert.equal(pub.state, "Published");
    assert.equal(pub.releaseVersion, "v1.0");
    const own = C.createProposal(s, u("designer").actor, { target: "#3", title: "Tighten week 4", rationale: "Workload" });
    assert.equal(status(() => C.advanceProposal(s, u("designer").actor, own.id, "approve", "self")), 409); // creator can't approve
  });
});

describe("Reports over HTTP", () => {
  it("a program review report downloads as Word", async () => {
    const H = "http://localhost:3000/api/campus/v1/t/academy/";
    const si = await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "designer@academy.scholarion.test", password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin");
    const cookie = si.headers.get("set-cookie")!.split(";")[0];
    const r = await handleCampus(new Request(`${H}cci/reports/2.html?format=docx`, { headers: { cookie } }), "v1/t/academy/cci/reports/2.html");
    assert.equal(r.status, 200);
    const xml = unzip(Buffer.from(await r.arrayBuffer())).find((e) => e.name === "word/document.xml")!.data.toString();
    assert.match(xml, /Program review/);
    assert.match(xml, /Quality gate/);
  });
});
