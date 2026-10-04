import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as B from "../src/campus/services/bridge";
import * as D from "../src/campus/services/departments";
import * as V from "../src/campus/services/voice";
import * as A from "../src/campus/services/acceptance";
import { readinessQuestions, readinessScore } from "../src/campus/services/readiness";

/** Tabs 63–66 and the readiness check: the bridge to the Python governed service and what was ported from it. */

const status = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string, mfa = true) => as("academy", k, mfa);
const DAY = 86400;

before(() => {
  freshCampus();
});

describe("Governed Service Bridge (63)", () => {
  it("every Python module in the crosswalk exists in governed/site", () => {
    const site = path.join(process.cwd(), "governed", "site");
    for (const c of B.CROSSWALK) {
      for (const m of c.module.split(" / ")) {
        const file = m.trim().replace(/ .*$/, "");
        if (!/\.(py|json)$/.test(file)) continue;
        assert.ok(fs.existsSync(path.join(site, file)), `${file} missing`);
      }
    }
  });

  it("probes over loopback with no credentials and records up/down; staff only", async () => {
    const a = u("admin");
    let seen: Record<string, string> = {};
    const up = await B.probe(a.store, a.actor, "governed", async (url, init) => {
      seen = { url, ...init.headers };
      return { status: 200, ok: true };
    });
    assert.equal(up.ok, true);
    assert.equal(seen.url, "http://127.0.0.1:4180/");
    assert.ok(!Object.keys(seen).some((k) => /authorization|cookie/i.test(k)));
    const down = await B.probe(a.store, a.actor, "governed", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    assert.equal(down.ok, false);
    assert.match(String(down.error), /ECONNREFUSED/);
    const hc = await B.probe(a.store, a.actor, "havenconnect", async () => ({ status: 200, ok: true }));
    assert.match(String(hc.error), /Not configured/);
    assert.equal(await status(() => B.probe(storeOf("academy"), u("student1", false).actor, "governed", async () => ({ status: 200, ok: true }))), 403);
    const s = B.bridgeStatus(a.store, a.actor);
    assert.equal(s.services[0].last?.ok, false);
    assert.ok(s.counts.ported >= 4);
    assert.equal(s.bundle.present, true);
  });
});

describe("Departments & Policy Rules (64)", () => {
  const P = D.EXAMPLE_POLICY;
  const due = 1_000_000;

  it("holds: reminders, notice before enforcement, placement after notice, release at zero balance", () => {
    assert.deepEqual(D.holdActions(P, { balance_minor: 5000, due_at: due }, due).map((x) => x.type), []);
    const day2 = D.holdActions(P, { balance_minor: 5000, due_at: due }, due + 2 * DAY);
    assert.deepEqual(day2.map((x) => x.key), ["reminder:1"]);
    const late = D.holdActions(P, { balance_minor: 5000, due_at: due }, due + 20 * DAY);
    const soft = late.find((x) => x.key === "notice:soft") as Record<string, unknown>;
    // A late run announces now and postpones enforcement by the notice period.
    assert.equal(soft.effective_at, due + 20 * DAY + 3 * DAY);
    const placed = D.holdActions(P, { balance_minor: 5000, due_at: due, announcements: { soft: due + 11 * DAY } }, due + 15 * DAY);
    assert.ok(placed.some((x) => x.key === "place:soft"));
    assert.deepEqual(D.holdActions(P, { balance_minor: 0, due_at: due, active_holds: ["soft"] }, due + 40 * DAY), [{ key: "release:soft", type: "hold.released", hold: "soft" }]);
    assert.throws(() => D.holdActions({}, { balance_minor: 1, due_at: due }, due), /Missing policy.finance.holds/);
  });

  it("refunds: schedule, scope by payment model, approval limit, prior refunds", () => {
    const q = D.refundQuote(P, { model: "pay_in_full", scope: "program", scope_id: "p1", paid_minor: 120000, refunded_minor: 0 }, 10);
    assert.deepEqual([q.decision, q.amount_minor], ["staff_review", 60000]); // 50% of 1,200.00 is above the 500.00 limit
    assert.equal(D.refundQuote(P, { model: "pay_as_you_go", scope: "course", scope_id: "c1", paid_minor: 40000, refunded_minor: 0 }, 3).decision, "eligible_within_policy");
    assert.equal(D.refundQuote(P, { model: "pay_in_full", scope: "program", scope_id: "p1", paid_minor: 120000, refunded_minor: 20000 }, 20).amount_minor, 10000);
    assert.equal(D.refundQuote(P, { model: "pay_in_full", scope: "program", scope_id: "p1", paid_minor: 100, refunded_minor: 0 }, 60).decision, "staff_review");
    assert.throws(() => D.refundQuote(P, { model: "pay_as_you_go", scope: "program", scope_id: "x", paid_minor: 1, refunded_minor: 0 }, 1), /scope must match/);
  });

  it("identity results never accept ID images or numbers, and retries are bounded", () => {
    assert.throws(() => D.identityResult(P, { result: "verified", provider_reference: "r", verified_at: "2026-01-01T00:00:00Z", id_number: "123" }, 0), /never accepted/);
    const ok = D.identityResult(P, { result: "verified", provider_reference: "r", verified_at: "2026-01-01T00:00:00Z", verified_name: "Test Learner", verified_dob: "1990-02-03" }, 0);
    assert.equal(ok.result, "verified");
    const failed = D.identityResult(P, { result: "failed", provider_reference: "r", verified_at: "2026-01-01T00:00:00Z", verified_name: "x" }, 2);
    assert.equal(failed.retry_allowed, false);
    assert.equal(failed.requires_review, true);
    assert.ok(!("verified_name" in (failed as { record: object }).record));
  });

  it("fails closed with no policy; admins load versions; previews need synthetic data and never execute", async () => {
    const r = u("registrar");
    const s0 = D.departmentStatus(r.store, r.actor);
    assert.equal(s0.missing.length, 4);
    assert.equal(await status(() => D.preview(r.store, r.actor, { kind: "holds", synthetic: true, invoice: { balance_minor: 1, due_at: 1 } })), 409);
    assert.equal(await status(() => D.setPolicy(storeOf("academy"), u("instructor").actor, { versionLabel: "x", policy: P })), 403);
    D.setPolicy(r.store, r.actor, { versionLabel: "synthetic-1", policy: P });
    assert.equal(await status(() => D.setPolicy(r.store, r.actor, { versionLabel: "bad", policy: { finance: { refunds: { auto_approve_limit_minor: 1, schedule: [{ through_day: 7, refund_basis_points: 20000 }] } } } })), 422);
    assert.equal(await status(() => D.preview(r.store, r.actor, { kind: "refund", synthetic: false })), 422);
    const p = D.preview(r.store, r.actor, { kind: "holds", synthetic: true, invoice: { balance_minor: 5000, due_at: due }, now: due + 20 * DAY });
    assert.equal(p.executed, false);
    assert.equal(p.policyVersion, "synthetic-1");
    assert.equal(D.departmentStatus(r.store, r.actor).missing.length, 0);
  });
});

describe("Voice & Digital Human Studio (65)", () => {
  it("personas reply in the chosen language with AI disclosure; high-risk topics switch to Standard English and a person", () => {
    const pcm = V.personaReply("amara", "pcm", "I wan enroll for program");
    assert.match(pcm.reply, /enroll/);
    assert.equal(pcm.language, "pcm");
    assert.match(pcm.disclosure, /fictional AI personas/);
    assert.equal(pcm.voicePlayback, "PLANNED");
    const risky = V.personaReply("tunde", "pcm", "Can you help with my refund payment?");
    assert.equal(risky.language, "en");
    assert.equal(risky.switchedToStandardEnglish, true);
    assert.equal(risky.handoff, true);
  });

  it("every capability carries exactly one status label, and nothing generative is LIVE", () => {
    const caps = V.capabilityStatus();
    assert.ok(caps.every((c) => ["LIVE", "CONNECTED", "DISABLED", "SIMULATED", "PLANNED"].includes(c.label)));
    assert.ok(caps.filter((c) => /Text to speech|cloning|voice playback/i.test(c.capability)).every((c) => c.label !== "LIVE"));
    assert.ok(caps.filter((c) => c.label !== "LIVE").every((c) => c.blocker.length > 10));
  });

  it("licence gate: non-commercial weights never route to paid plans; unverified licences block paid routes", async () => {
    const a = u("admin");
    V.ensureVoiceSeed(a.store);
    const f5 = a.store.list(V.V.models, (m) => m.key === "f5-tts")[0];
    const kokoro = a.store.list(V.V.models, (m) => m.key === "kokoro-82m")[0];
    assert.equal(await status(() => V.setRoute(a.store, a.actor, { plan: "pro", capability: "tts_cloning", modelId: f5.id })), 409);
    V.setRoute(a.store, a.actor, { plan: "free", capability: "tts_cloning", modelId: f5.id });
    assert.equal(await status(() => V.setRoute(a.store, a.actor, { plan: "creator", capability: "tts", modelId: kokoro.id })), 409);
    V.verifyLicense(a.store, a.actor, kokoro.id, "https://example.org/licence-review/kokoro");
    V.setRoute(a.store, a.actor, { plan: "creator", capability: "tts", modelId: kokoro.id });
    assert.equal(V.licenseGate(a.store).passed, true);
  });

  it("consent: all checks, evidence recorders can't approve, two different reviewers, revocation blocks the voice", async () => {
    const d = u("designer");
    const a = u("admin");
    const r = u("registrar");
    const exp = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
    const c = V.openConsentCase(d.store, d.actor, { subjectName: "Contracted voice talent (synthetic test)", purposes: "Course narration for Scholarion Academy, web only, 12 months", expiresOn: exp, kind: "voice" });
    assert.equal(await status(() => V.createVoice(d.store, d.actor, { name: "Narrator", kind: "cloned", language: "en", consentId: c.id })), 409);
    assert.equal(await status(() => V.recordConsentEvidence(d.store, d.actor, c.id, "identity", "id-scan.jpg")), 422);
    for (const k of V.CONSENT_CHECKS) V.recordConsentEvidence(d.store, d.actor, c.id, k.key, `ref-${k.key}-001`);
    assert.equal(await status(() => V.approveConsent(d.store, d.actor, c.id)), 403);
    V.approveConsent(a.store, a.actor, c.id);
    assert.equal(await status(() => V.approveConsent(a.store, a.actor, c.id)), 403);
    V.approveConsent(r.store, r.actor, c.id);
    assert.equal(V.consentActive(d.store, c.id), true);
    const voice = V.createVoice(d.store, d.actor, { name: "Narrator", kind: "cloned", language: "en", consentId: c.id });
    assert.equal(voice.state, "awaiting_served_model");
    const story = V.createStory(d.store, d.actor, "Welcome video");
    V.storyCommand(d.store, d.actor, story.id, "scene", { revision: 1, speaker: "Narrator", avatar: "amara", voice: voice.id, language: "en", script: "Welcome to Module 1." });
    const rev = V.revokeConsent(a.store, a.actor, c.id, "Talent withdrew consent");
    assert.deepEqual(rev.affected.voices, ["Narrator"]);
    assert.deepEqual(rev.affected.projects, ["Welcome video"]);
    const g = V.requestGeneration(d.store, d.actor, { capability: "tts", text: "Hello", voiceId: voice.id });
    assert.equal(g.state, "moderation_blocked");
    assert.match(g.flags.join(), /consent/);
  });

  it("generation is moderated and costed but never produces output without a served model", () => {
    const d = u("designer");
    const ok = V.requestGeneration(d.store, d.actor, { capability: "tts", text: "Welcome to Scholarion Academy. ".repeat(60) });
    assert.equal(ok.state, "not_operational");
    assert.equal(ok.output, null);
    assert.equal(ok.charged, 0);
    assert.equal(ok.estimatedCredits, 200);
    for (const t of ["Make it sound like Barack Obama endorsing us", "Record a message telling people to vote for this candidate", "Use my voice to log in to the bank"]) assert.equal(V.requestGeneration(d.store, d.actor, { capability: "tts", text: t }).state, "moderation_blocked", t);
  });

  it("storyboards keep immutable revisions, enforce pairing, and confirm change-all after a dry run", async () => {
    const i = u("instructor");
    const s = V.createStory(i.store, i.actor, "Orientation");
    const r2 = V.storyCommand(i.store, i.actor, s.id, "scene", { revision: 1, speaker: "Guide", avatar: "amara", voice: "amara-synthetic-design", language: "en-NG", script: "Welcome." }) as { revision: number };
    assert.equal(await status(() => V.storyCommand(i.store, i.actor, s.id, "scene", { revision: r2.revision, speaker: "Guide", avatar: "amara", voice: "tunde-synthetic-design", language: "en", script: "x" })), 422);
    assert.equal(await status(() => V.storyCommand(i.store, i.actor, s.id, "scene", { revision: 1, speaker: "Guide", avatar: "amara", voice: "amara-synthetic-design", language: "en", script: "stale" })), 412);
    const dry = V.storyCommand(i.store, i.actor, s.id, "change_all", { revision: r2.revision, speaker: "Guide", avatar: "tunde", voice: "tunde-synthetic-design", language: "pcm", dryRun: true }) as { count: number };
    assert.equal(dry.count, 1);
    assert.equal(await status(() => V.storyCommand(i.store, i.actor, s.id, "change_all", { revision: r2.revision, speaker: "Guide", avatar: "tunde", voice: "tunde-synthetic-design", language: "pcm" })), 422);
    V.storyCommand(i.store, i.actor, s.id, "change_all", { revision: r2.revision, speaker: "Guide", avatar: "tunde", voice: "tunde-synthetic-design", language: "pcm", confirmed: true });
    const h = V.storyCommand(i.store, i.actor, s.id, "history", {}) as { versions: unknown[] };
    assert.equal(h.versions.length, 3);
    const ex = V.storyCommand(i.store, i.actor, s.id, "export", {}) as { provenance: { mediaGenerated: boolean; sha256: string } };
    assert.equal(ex.provenance.mediaGenerated, false);
    assert.match(ex.provenance.sha256, /^[0-9a-f]{64}$/);
    assert.equal(await status(() => V.storyCommand(storeOf("academy"), u("designer").actor, s.id, "archive", { revision: 3 })), 403);
  });
});

describe("Operational Acceptance (66) and the readiness check", () => {
  it("evidence stays unverified until a different admin verifies; production is never allowed by the register", async () => {
    const d = u("designer");
    const a = u("admin");
    const e = A.recordEvidence(d.store, d.actor, { area: "recovery", release: "r1", owner: "Ops", reference: "drill-2026-10-04", note: "Restore drill passed" });
    assert.equal(e.productionAllowed, false);
    assert.equal(await status(() => A.verifyEvidence(d.store, d.actor, e.id, "verified", "ok")), 403);
    A.verifyEvidence(a.store, a.actor, e.id, "verified", "Checked the drill report");
    const s = A.acceptanceStatus(a.store, a.actor, "r1");
    assert.equal(s.areas.find((x) => x.id === "recovery")!.status, "verified");
    assert.equal(s.readiness, "blocked");
    assert.equal(s.productionAllowed, false);
    A.signOff(a.store, a.actor, "Platform owner", "r1");
    assert.equal(await status(() => A.signOff(a.store, a.actor, "Security lead", "r1")), 409);
  });

  it("readiness self-check routes like the Python version and stores nothing", () => {
    assert.equal(readinessQuestions().questions.length, 10);
    const perfect = [1, 1, 0, 1, 1, 0, 0, 1, 1, 0];
    assert.deepEqual(readinessScore(perfect, "agents").recommendedPrograms, [15]);
    assert.deepEqual(readinessScore(perfect, "data").recommendedPrograms, [21, 18]);
    assert.deepEqual(readinessScore([0, 0, 1, 0, 0, 1, 1, 0, 0, 1], "agents").recommendedPrograms, [19, 16]);
    assert.equal(readinessScore(perfect, "agents").admissionDecision, false);
    assert.throws(() => readinessScore([1, 2], "agents"), /all ten/);
  });
});
