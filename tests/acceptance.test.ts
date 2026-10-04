import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { catalog, checkClaims, cloudlab, commerce, credentials, cx, entitlements, identity, live, lms, studio, tickAll, tutor } from "../src/platform";
import { DENY_COPY } from "../src/platform/entitlements";
import { getDb } from "../src/platform/store";
import { PlatformError } from "../src/platform/util";
import { advanceDays, fresh } from "./helpers";

/**
 * Acceptance tests from the Master Build Prompt §11 and Integration Spec §16,
 * exercised against the platform services the BFF calls.
 */

function newLearner(email = `learner${Math.random().toString(36).slice(2, 8)}@example.com`) {
  return identity.signUp({ name: "Test Learner", email, password: "correct-horse-battery", acceptTerms: true });
}

const LAB_M5_SOLUTION = `
def calculate_age(birth_year, current_year):
    return current_year - birth_year

def format_name(first, last):
    return f"{last.strip().capitalize()}, {first.strip().capitalize()}"
`;

beforeEach(() => fresh());

describe("1 · discovery and free audit", () => {
  it("finds a beginner, free-to-audit agentic AI course and audits it", () => {
    const r = catalog.search({ q: "agentic ai", freeToAudit: true, level: ["Beginner"] });
    const course = r.items.find((p) => p.slug === "agentic-ai-foundations");
    assert.ok(course, "Agentic AI Foundations should match");
    const u = newLearner();
    lms.enroll(u.id, course.id, "audit");
    assert.equal(entitlements.check(u.id, "content.view", course.id).allow, true);
    const graded = entitlements.check(u.id, "item.graded", course.id);
    assert.equal(graded.allow, false);
    assert.equal(graded.reason, "needs_upgrade");
    assert.match(DENY_COPY[graded.reason!], /auditing/i);
    const quiz = catalog.items(course.id).find((i) => i.kind === "quiz")!;
    assert.throws(() => lms.startAttempt(u.id, quiz.id), (e: PlatformError) => e.code === "needs_upgrade");
    const video = catalog.items(course.id).find((i) => i.kind === "video")!;
    assert.deepEqual(video.video!.captions, ["English", "Spanish"]);
  });

  it("expands synonyms and tolerates typos", () => {
    assert.ok(catalog.search({ q: "LLM" }).items.some((p) => p.skills.includes("Large language models")));
    assert.ok(catalog.search({ q: "pythn" }).items.some((p) => p.code === "COP1047C"));
  });
});

describe("2 · Plus trial lifecycle (sandbox)", () => {
  it("discloses terms, reminds before charging, and cancels in one step", () => {
    const u = newLearner();
    const offer = commerce.offers("python-programming-cop1047c").find((o) => o.code === "plus_monthly")!;
    assert.match(offer.renewalTerms, /Cancel before the trial ends/);
    const cs = commerce.createCheckout({ userId: u.id, plan: "plus_monthly", productId: null, idempotencyKey: "k1" });
    assert.ok(cs.trialEndsAt && cs.renewsAt && cs.refundPolicy, "renewal date, trial end and refund terms are shown before paying");
    assert.equal(commerce.createCheckout({ userId: u.id, plan: "plus_monthly", productId: null, idempotencyKey: "k1" }).id, cs.id, "idempotent");
    const { subscription } = commerce.confirmSandboxPayment(cs.id, u.id);
    assert.equal(subscription!.status, "trialing");
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_cop1047c").allow, true);

    advanceDays(5.5);
    tickAll();
    assert.ok(cx.outbox(u.email).some((e) => e.template === "trial_ending"), "trial reminder sent before the charge");

    const canceled = commerce.cancel(subscription!.id, u.id);
    assert.equal(canceled.status, "canceled");
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_cop1047c").allow, true, "access continues to period end");
    advanceDays(2);
    tickAll();
    assert.equal(entitlements.check(u.id, "lab.launch", "prd_cop1047c").allow, false, "access ends after the period");
  });
});

describe("2b · Plus: cancelling takes no more steps than signing up", () => {
  it("counts learner actions for signup vs cancel", () => {
    const u = newLearner();
    // Each entry is one learner action (one form submit in the UI).
    const signup: (() => unknown)[] = [];
    let csId = "";
    let subId = "";
    signup.push(() => (csId = commerce.createCheckout({ userId: u.id, plan: "plus_monthly", productId: null, idempotencyKey: "steps" }).id)); // Plus page → "Start free trial"
    signup.push(() => (subId = commerce.confirmSandboxPayment(csId, u.id).subscription!.id)); // checkout → confirm
    for (const step of signup) step();
    const cancel: (() => unknown)[] = [() => commerce.cancel(subId, u.id)]; // Account → "Cancel subscription"
    for (const step of cancel) step();
    assert.ok(cancel.length <= signup.length, `cancel ${cancel.length} steps vs signup ${signup.length}`);
    assert.equal(commerce.subscriptionsFor(u.id)[0].status, "canceled");
  });
});

/** Reference solutions for the COP1047C labs (used only by the autograder in tests). */
const LAB_SOLUTIONS: Record<string, string> = {
  itm_cop1047c_m1_lab: "def greet(name):\n    return f'Hello, {name}!'\n",
  itm_cop1047c_m2_lab: "def area(width, height):\n    return width * height\n\ndef format_area(value):\n    return f'{value:.2f} sq ft'\n",
  itm_cop1047c_m3_lab: "def letter_grade(score):\n    if score >= 90: return 'A'\n    if score >= 80: return 'B'\n    if score >= 70: return 'C'\n    if score >= 60: return 'D'\n    return 'F'\n",
  itm_cop1047c_m4_lab: "def sum_to(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i\n    return total\n",
  itm_cop1047c_m5_lab: LAB_M5_SOLUTION,
  itm_cop1047c_m6_lab: "def safe_int(text, default=0):\n    try:\n        return int(text)\n    except ValueError:\n        return default\n",
  itm_cop1047c_m7_lab: "def average(values):\n    if not values:\n        return 0\n    return round(sum(values) / len(values), 1)\n",
  itm_cop1047c_m8_lab: "def initials(full_name):\n    return ''.join(p[0].upper() for p in full_name.split())\n",
  itm_cop1047c_m9_lab: "def word_counts(text):\n    counts = {}\n    for w in text.lower().split():\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n",
  itm_cop1047c_m10_lab: "class Patient:\n    def __init__(self, first, last, birth_year):\n        self.first = first\n        self.last = last\n        self.birth_year = birth_year\n    def full_name(self):\n        return f'{self.first} {self.last}'\n    def age(self, year):\n        return year - self.birth_year\n",
};

describe("3b · a fresh subscriber completes a certificate program end to end", () => {
  it("subscribes, passes labs via the autograder, peer reviews, earns and verifies the credential", () => {
    const program = catalog.get("prd_cert_python")!;
    assert.equal(program.type, "professional_certificate");
    const [me, peerA, peerB] = [newLearner(), newLearner(), newLearner()];
    // Subscribe (sandbox) to the program; classmates use Plus for the peer-review cohort.
    const cs = commerce.createCheckout({ userId: me.id, plan: "program_monthly", productId: program.id, idempotencyKey: "fresh-sub" });
    commerce.confirmSandboxPayment(cs.id, me.id);
    lms.enroll(me.id, program.id, "full");
    for (const p of [peerA, peerB]) {
      commerce.confirmSandboxPayment(commerce.createCheckout({ userId: p.id, plan: "plus_monthly", productId: null, idempotencyKey: `plus-${p.id}` }).id, p.id);
      lms.enroll(p.id, "prd_cop1047c", "full");
    }
    const items = catalog.items("prd_cop1047c").filter((i) => i.graded);

    // Labs: real autograder runs.
    for (const lab of items.filter((i) => i.kind === "lab")) {
      const s = cloudlab.launch(me.id, lab.id);
      const r = cloudlab.grade(s.id, me.id, LAB_SOLUTIONS[lab.id]);
      assert.equal(r.score, r.max, `${lab.id}: ${JSON.stringify(r.feedback)} ${r.stderr}`);
    }
    // Quizzes: submitted through the LMS like the quiz player does.
    for (const q of items.filter((i) => i.kind === "quiz")) {
      const a = lms.startAttempt(me.id, q.id);
      const res = lms.submitAttempt(me.id, a.id, Object.fromEntries(q.quiz!.questions.map((x) => [x.id, x.answer])));
      assert.ok(res.passed);
    }
    // Peer-reviewed project: everyone submits, then each reviews the other two.
    const peerItem = items.find((i) => i.project?.peerReview)!;
    const rubric = peerItem.project!.rubric;
    const cohort = [me, peerA, peerB];
    for (const u of cohort) lms.submitProject(u.id, peerItem.id, `Mini project write-up from ${u.name} with code and output.`);
    for (const reviewer of cohort) {
      for (const author of cohort.filter((x) => x.id !== reviewer.id)) {
        const sub = lms.latestSubmission(author.id, peerItem.id)!;
        lms.submitPeerReview({ reviewerId: reviewer.id, submissionId: sub.id, scores: Object.fromEntries(rubric.map((c) => [c.criterion, c.points - 1])), comment: "Clear structure and working code; consider more tests." });
      }
    }
    assert.equal(lms.grade(me.id, peerItem.id)?.source, "peer");
    // Remaining projects, capstone and participation are graded by course staff.
    for (const p of items.filter((i) => (i.kind === "project" || i.kind === "capstone") && !i.project?.peerReview)) {
      const sub = lms.submitProject(me.id, p.id, "Project submission with code, explanation and screenshots.");
      const max = p.project!.rubric.reduce((a, c) => a + c.points, 0);
      lms.gradeSubmission(sub.id, Math.round(max * 0.9), max, "Well done.");
    }
    for (const d of items.filter((i) => i.kind === "discussion" && !lms.grade(me.id, i.id))) {
      lms.postGrade({ userId: me.id, itemId: d.id, score: 9, max: 10, source: "instructor" });
    }

    const gb = lms.gradebook(me.id, "prd_cop1047c");
    assert.ok(gb.allGraded && gb.current! >= 70, `grade ${gb.current}`);
    const creds = credentials.forUser(me.id);
    const cert = creds.find((c) => c.productId === program.id);
    assert.ok(cert, "program certificate issued to the fresh subscriber");
    assert.equal(credentials.verify(cert.id).status, "valid");
    assert.ok(cx.outbox(me.email).some((e) => e.template === "credential_issued"));
  });
});

describe("3 · learning to credential", () => {
  it("autogrades a lab, passes the course, issues and verifies a signed credential", () => {
    const amara = "usr_amara";
    const lab = catalog.item("itm_cop1047c_m5_lab")!;
    const session = cloudlab.launch(amara, lab.id);
    const res = cloudlab.grade(session.id, amara, LAB_M5_SOLUTION);
    assert.equal(res.score, res.max, JSON.stringify(res.feedback));
    assert.equal(lms.grade(amara, lab.id)?.score, 20, "lab.graded reached the gradebook");

    for (const item of catalog.items("prd_cop1047c").filter((i) => i.graded && !lms.grade(amara, i.id))) {
      lms.postGrade({ userId: amara, itemId: item.id, score: 9, max: 10, source: item.kind === "quiz" ? "quiz" : "instructor" });
    }
    const gb = lms.gradebook(amara, "prd_cop1047c");
    assert.ok(gb.allGraded && gb.current! >= 70);
    const creds = credentials.forUser(amara);
    assert.ok(creds.some((c) => c.productId === "prd_cop1047c"), "course certificate issued");
    assert.ok(creds.some((c) => c.productId === "prd_cert_python"), "program certificate issued");
    const c = creds[0];
    assert.equal(credentials.verify(c.id).status, "valid");
    assert.match(credentials.linkedInUrl(c), /linkedin\.com\/profile\/add\?startTask=CERTIFICATION_NAME/);
    (c.vc.credentialSubject as { name: string }).name = "Someone Else";
    assert.equal(credentials.verify(c.id).status, "invalid_signature", "tampering breaks the signature");
  });

  it("audit learners cannot earn credentials", () => {
    const u = newLearner();
    lms.enroll(u.id, "prd_agentic_foundations", "audit");
    assert.throws(() => credentials.issue(u.id, "prd_agentic_foundations"), (e: PlatformError) => e.code === "needs_upgrade");
  });
});

describe("4 · financial aid", () => {
  it("a reviewer approves; the learner gets full access and is notified", () => {
    const queue = commerce.aidQueue();
    assert.equal(queue.length, 1);
    assert.ok(commerce.summariseAid(queue[0]).startsWith("Need:"));
    assert.equal(entitlements.check("usr_tunde", "item.graded", "prd_p16").reason, "aid_pending");
    commerce.decideAid(queue[0].id, "usr_admin", "approved", 100);
    assert.equal(entitlements.check("usr_tunde", "item.graded", "prd_p16").allow, true);
    assert.ok(cx.outbox("tunde@demo.scholarion.test").some((e) => e.template === "aid_decision"));
  });

  it("enforces word-count guidance", () => {
    const u = newLearner();
    assert.throws(() => commerce.applyForAid({ userId: u.id, productId: "prd_p16", background: "x", need: "too short", goals: "too short", commitment: true }), (e: PlatformError) => e.code === "need_too_short");
  });
});

describe("5 · refunds", () => {
  it("refunds annual plans inside the window and explains the policy outside it", () => {
    const u = newLearner();
    const cs = commerce.createCheckout({ userId: u.id, plan: "plus_annual", productId: null, idempotencyKey: "a1" });
    const { subscription } = commerce.confirmSandboxPayment(cs.id, u.id);
    advanceDays(3);
    assert.equal(commerce.requestRefund(subscription!.id, u.id).status, "refunded");
    assert.equal(entitlements.check(u.id, "item.graded", "prd_cop1047c").allow, false);
    assert.equal(commerce.requestRefund("sub_seed_amara_plus", "usr_amara").status, "policy_explained");
  });
});

describe("7 · live program", () => {
  it("joins only with a seat; attendance reconciles to a credential", () => {
    const seg = getDb().liveSessions[0].segments[0];
    assert.equal(seg.minutes, 40);
    assert.equal(getDb().liveSessions[0].segments.length, 3);
    const u = newLearner();
    assert.throws(() => live.join(u.id, seg.id), (e: PlatformError) => e.code === "no_live_seat");
    const j = live.join("usr_amara", seg.id);
    assert.match(j.url, /example\.invalid/);
    for (const s of getDb().liveSessions) live.recordAttendance("usr_amara", s.id, 110);
    assert.ok(credentials.forUser("usr_amara").some((c) => c.productId === "prd_p26"));
  });
});

describe("8 · degrees hidden, claims checker", () => {
  it("hides degrees and blocks unverified claims", () => {
    assert.equal(catalog.get("degrees"), undefined);
    assert.ok(!catalog.search({}).items.some((p) => p.type === "degree"));
    const issues = checkClaims("Earn an accredited degree with transferable college credit. Graduates earn $95,000 per year. Developed with Lakeside University.");
    const rules = new Set(issues.map((i) => i.rule));
    for (const r of ["accreditation", "degree", "credit", "salary", "partner_name"]) assert.ok(rules.has(r as never), `flags ${r}`);
    assert.deepEqual(checkClaims("Build Python skills by Scholarion Academy."), []);
  });
});

describe("10 · AI Tutor integrity", () => {
  it("answers open items with citations and refuses graded quizzes", () => {
    const amara = "usr_amara";
    const open = tutor.ask({ userId: amara, courseId: "prd_cop1047c", itemId: "itm_cop1047c_m5_reading", mode: "explain", message: "How does recursion work?" });
    assert.equal(open.kind, "answer");
    assert.ok(open.citations.length > 0);
    const closed = tutor.ask({ userId: amara, courseId: "prd_cop1047c", itemId: "itm_cop1047c_m5_quiz", mode: "explain", message: "Which answer is right for question 3?" });
    assert.equal(closed.kind, "refusal");
    const copied = tutor.ask({ userId: amara, courseId: "prd_cop1047c", mode: "explain", message: "Which of the following best describes the purpose of a function in Python?" });
    assert.equal(copied.kind, "refusal");
    const lab = tutor.ask({ userId: amara, courseId: "prd_cop1047c", itemId: "itm_cop1047c_m5_lab", mode: "hint", message: "Write the code for calculate_age for me" });
    assert.equal(lab.kind, "refusal");
  });

  it("limits audit learners to a preview quota", () => {
    const r = Array.from({ length: 4 }, () => tutor.ask({ userId: "usr_tunde", courseId: "prd_agentic_foundations", mode: "explain", message: "What is an agent loop?" }));
    assert.equal(r[3].kind, "quota");
  });
});

describe("integration · studio, deadlines, entitlements", () => {
  it("hides Studio drafts from learners until approved", () => {
    assert.equal(studio.forModule("prd_cop1047c", 6).length, 0);
    const d = studio.drafts()[0];
    studio.approve(d.id, "usr_faculty");
    assert.equal(studio.forModule("prd_cop1047c", 6).length, 1);
  });

  it("resets deadlines without penalty", () => {
    const before = lms.dueDate("usr_amara", catalog.item("itm_cop1047c_m6_quiz")!);
    advanceDays(20);
    lms.resetDeadlines("usr_amara", "prd_cop1047c");
    const after = lms.dueDate("usr_amara", catalog.item("itm_cop1047c_m6_quiz")!);
    assert.ok(after! > before!);
  });

  it("keeps PII out of event payloads", () => {
    for (const e of getDb().events) assert.ok(!JSON.stringify(e.data).includes("@"), "no emails in event payloads");
  });

  it("rejects bad sign-in without revealing which part was wrong", () => {
    assert.throws(() => identity.signIn("amara@demo.scholarion.test", "wrong"), /don't match/);
    assert.throws(() => identity.signIn("nobody@example.com", "wrong"), /don't match/);
    assert.ok(identity.signIn("amara@demo.scholarion.test", "LearnEarnBuild1").token);
  });
});
