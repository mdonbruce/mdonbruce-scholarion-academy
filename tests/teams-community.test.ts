import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { catalog, community, cx, entitlements, identity, lms, teams } from "../src/platform";
import { getDb } from "../src/platform/store";
import { PlatformError } from "../src/platform/util";
import { fresh } from "./helpers";

beforeEach(() => fresh());

function learner(email: string) {
  return identity.signUp({ name: email.split("@")[0], email, password: "correct-horse-battery", acceptTerms: true });
}

describe("6 · Scholarion for Teams", () => {
  it("buys 10 seats, invites, joins by SSO, assigns a program and sees progress", () => {
    const admin = learner("lead@acme-demo.example");
    const org = teams.purchase({ adminId: admin.id, name: "Acme Demo", seats: 10, domain: "acme-demo.example" });
    assert.equal(org.seats, 10);
    assert.ok(getDb().orders.some((o) => o.sessionId === `org:${org.id}` && o.amount > 0), "sandbox order recorded");

    // Invite by email; the invitee accepts with the matching account.
    const { created } = teams.invite(org.id, admin.id, "ada@partner-mail.example, bad-address");
    assert.equal(created.length, 1);
    assert.ok(cx.outbox("ada@partner-mail.example").some((e) => e.template === "org_invite"), "invite email queued");
    const ada = learner("ada@partner-mail.example");
    teams.acceptInvite(created[0].token, ada.id);

    // Organization sign-in (simulated SSO) by email domain.
    const sam = learner("sam@acme-demo.example");
    assert.equal(teams.ssoMatch(sam)?.id, org.id);
    teams.joinViaSso(org.id, sam.id);

    // Assigning a program grants seat access and enrolls every member.
    teams.assignProgram(org.id, admin.id, "prd_cert_python");
    for (const u of [ada, sam]) {
      assert.equal(entitlements.check(u.id, "lab.launch", "prd_cop1047c").allow, true);
      assert.ok(lms.enrollment(u.id, "prd_cop1047c"));
    }
    lms.recordProgress(sam.id, catalog.items("prd_cop1047c")[0].id, "completed");
    const d = teams.dashboard(org.id, admin.id);
    assert.equal(d.seats.used, 2);
    assert.ok(d.members.find((m) => m.userId === sam.id)!.progress[0].percent > 0);
    assert.match(teams.reportCsv(org.id, admin.id), /sam@acme-demo\.example/);
  });

  it("isolates organizations from each other", () => {
    // Seeded: Brightpath (admin usr_orgadmin, learner usr_kemi) and Riverbend (admin usr_rbadmin, learner usr_dayo).
    const bp = teams.dashboard("org_brightpath", "usr_orgadmin");
    assert.ok(bp.members.some((m) => m.userId === "usr_kemi"));
    assert.ok(!bp.members.some((m) => m.userId === "usr_dayo"), "other organization's learner is invisible");
    assert.throws(() => teams.dashboard("org_riverbend", "usr_orgadmin"), (e: PlatformError) => e.status === 403);
    assert.throws(() => teams.reportCsv("org_riverbend", "usr_orgadmin"), (e: PlatformError) => e.status === 403);
    assert.throws(() => teams.revokeSeat("org_riverbend", "usr_orgadmin", "usr_dayo"), (e: PlatformError) => e.status === 403);
    assert.throws(() => teams.joinViaSso("org_riverbend", "usr_kemi"), (e: PlatformError) => e.code === "sso_not_allowed");
  });

  it("frees and reallocates seats, keeping the learner's progress", () => {
    const admin = learner("boss@tiny-demo.example");
    const org = teams.purchase({ adminId: admin.id, name: "Tiny Demo", seats: 1, domain: "tiny-demo.example" });
    teams.assignProgram(org.id, admin.id, "prd_cert_python");
    const a = learner("a@tiny-demo.example");
    const b = learner("b@tiny-demo.example");
    teams.joinViaSso(org.id, a.id);
    assert.throws(() => teams.joinViaSso(org.id, b.id), (e: PlatformError) => e.code === "no_seats");
    lms.recordProgress(a.id, catalog.items("prd_cop1047c")[0].id, "completed");
    teams.revokeSeat(org.id, admin.id, a.id);
    assert.equal(entitlements.check(a.id, "lab.launch", "prd_cop1047c").allow, false);
    assert.equal(lms.itemStatus(a.id, catalog.items("prd_cop1047c")[0].id), "completed", "progress kept");
    teams.joinViaSso(org.id, b.id);
    assert.equal(teams.dashboard(org.id, admin.id).seats.used, 1);
  });

  it("rejects invitations used by a different account", () => {
    const { created } = teams.invite("org_brightpath", "usr_orgadmin", "someone@else-demo.example");
    assert.throws(() => teams.acceptInvite(created[0].token, "usr_amara"), (e: PlatformError) => e.code === "invite_email_mismatch");
  });
});

describe("3 · peer review", () => {
  it("grades by peer review once reviews are received and given", () => {
    const item = "itm_cop1047c_m5_project";
    const scores = (t: number[]) => Object.fromEntries(catalog.item(item)!.project!.rubric.map((c, i) => [c.criterion, t[i]]));
    // Seeded: Kemi and Ngozi submitted and reviewed each other once.
    assert.equal(lms.reviewQueue("usr_amara", item).next, null, "submit before reviewing");
    lms.submitProject("usr_amara", item, "Records in a dict, four functions, a search and input validation. Report attached.", "amara.py");
    let q = lms.reviewQueue("usr_amara", item);
    assert.equal(q.available, 2);
    lms.submitPeerReview({ reviewerId: "usr_amara", submissionId: q.next!.id, scores: scores([18, 13, 9, 4]), comment: "Solid structure and clear validation; the report explains the design well." });
    q = lms.reviewQueue("usr_amara", item);
    lms.submitPeerReview({ reviewerId: "usr_amara", submissionId: q.next!.id, scores: scores([17, 14, 8, 4]), comment: "Recursion is used well. Consider returning all search matches." });
    assert.throws(() => lms.submitPeerReview({ reviewerId: "usr_amara", submissionId: "sbm_seed_kemi_m5", scores: scores([1, 1, 1, 1]), comment: "Trying to review the same classmate twice." }), (e: PlatformError) => e.code === "already_reviewed");

    // Kemi has 2 received; she gives her second review → her grade posts.
    const kemiSub = getDb().submissions.find((s) => s.userId === "usr_amara" && s.itemId === item)!;
    lms.submitPeerReview({ reviewerId: "usr_kemi", submissionId: kemiSub.id, scores: scores([18, 14, 9, 5]), comment: "Very readable functions and good input checks throughout." });
    const kemiGrade = lms.grade("usr_kemi", item);
    assert.ok(kemiGrade && kemiGrade.source === "peer", "peer grade posted");

    // Amara now has 1 received, 2 given; Ngozi's review completes her grade.
    lms.submitPeerReview({ reviewerId: "usr_ngozi", submissionId: kemiSub.id, scores: scores([17, 13, 9, 4]), comment: "Well organised; add a test for an empty search result." });
    assert.equal(lms.grade("usr_amara", item)?.source, "peer");
    assert.equal(lms.peerStatus("usr_amara", item).received.length, 2);
  });

  it("sends disagreeing reviews to course staff", () => {
    const item = "itm_cop1047c_m5_project";
    const rubric = catalog.item(item)!.project!.rubric;
    const all = (v: number) => Object.fromEntries(rubric.map((c) => [c.criterion, Math.min(v, c.points)]));
    lms.submitProject("usr_amara", item, "A complete records system with tests and a short report.", "amara.py");
    const mine = getDb().submissions.find((s) => s.userId === "usr_amara" && s.itemId === item)!;
    lms.submitPeerReview({ reviewerId: "usr_amara", submissionId: "sbm_seed_kemi_m5", scores: all(20), comment: "Covers every requirement with clean structure." });
    lms.submitPeerReview({ reviewerId: "usr_amara", submissionId: "sbm_seed_ngozi_m5", scores: all(20), comment: "Covers every requirement with clean structure." });
    lms.submitPeerReview({ reviewerId: "usr_kemi", submissionId: mine.id, scores: all(20), comment: "Excellent work, nothing missing that I could find." });
    lms.submitPeerReview({ reviewerId: "usr_ngozi", submissionId: mine.id, scores: all(1), comment: "Several requirements are missing from this submission." });
    assert.equal(lms.grade("usr_amara", item), undefined);
    assert.ok(lms.pendingSubmissions().some((s) => s.id === mine.id && s.needsStaff), "in staff queue");
    lms.gradeSubmission(mine.id, 44, 50, "Staff review: strong submission.");
    assert.equal(lms.grade("usr_amara", item)?.source, "instructor");
  });
});

describe("course discussions", () => {
  it("lets enrolled learners post and reply, and staff moderate reports", () => {
    const item = "itm_cop1047c_m5_discussion";
    const threads = community.threads(item, "usr_amara");
    assert.ok(threads.length >= 3);
    const p = community.post({ userId: "usr_amara", itemId: item, body: "Functions let me fix a rule in one place." });
    assert.equal(lms.itemStatus("usr_amara", item), "completed", "posting completes the discussion item");
    community.post({ userId: "usr_kemi", itemId: item, body: "Agreed, especially for date formats.", parentId: p.id });
    assert.equal(community.threads(item, "usr_amara").find((t) => t.id === p.id)!.replies.length, 1);

    assert.throws(() => community.post({ userId: "usr_dayo", itemId: item, body: "Hello from another organization" }), (e: PlatformError) => e.code === "not_enrolled");
    assert.throws(() => community.moderate(p.id, "usr_amara", "hide"), (e: PlatformError) => e.status === 403);

    const spam = community.queue().find((q) => q.id === "pst_seed_5")!;
    assert.equal(spam.reports.length, 2);
    community.moderate(spam.id, "usr_faculty", "hide");
    const seen = community.threads(item, "usr_amara").find((t) => t.id === spam.id)!;
    assert.equal(seen.hidden, true);
    assert.equal(seen.body, "", "hidden text not sent to learners");
  });
});
