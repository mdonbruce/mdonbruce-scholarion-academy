import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { advanceClock, broker, CampusError, nowIso, sha256 } from "../src/campus/core";
import * as col from "../src/campus/services/collaboration";
import * as entity from "../src/campus/entity";
import * as grading from "../src/campus/services/grading";
import * as asm from "../src/campus/services/assessment";
import * as qt from "../src/campus/services/quiztools";
import { evaluate, calculatorHtml } from "../src/campus/services/calculator";
import * as acfg from "../src/campus/services/accountcfg";
import * as cur from "../src/campus/services/curriculum";
import * as cal from "../src/campus/services/calendar";
import * as lti from "../src/campus/services/lti";
import * as pfo from "../src/campus/services/portfolio";
import * as fil from "../src/campus/services/files";
import { activeStudents } from "../src/campus/services/common";
import { courseAnalytics } from "../src/campus/services/success";
import { actorFor, grantAccountAdmin, hasAny, resolveSession, signIn } from "../src/campus/iam";
import { startMasquerade } from "../src/campus/services/admin";
import { PARITY, paritySummary } from "../src/campus/parity";

/** Parity round 2: grading/quizzes, account administration, course features. */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const d = (k: string, mfa = true) => as("demo", k, mfa);
const C1 = "crs_demo_cs101";

function makeQuiz(title: string, extra: Record<string, unknown> = {}) {
  const inst = d("instructor");
  const bank = entity.create(inst.store, inst.actor, "question_banks", { courseId: C1, title: `${title} bank` });
  for (let i = 1; i <= 3; i++) entity.create(inst.store, inst.actor, "questions", { courseId: C1, bankId: bank.id, kind: "multiple_choice", prompt: `${title} Q${i}`, choices: ["a", "b"], answer: "a", points: 1, tags: ["mc"] });
  const qz = entity.create(inst.store, inst.actor, "quizzes", { courseId: C1, title, bankId: bank.id, questionCount: 3, timeLimitMin: 20, allowedAttempts: 3, points: 3, ...extra });
  entity.publish(inst.store, inst.actor, "quizzes", String(qz.id));
  return { quizId: String(qz.id), bankId: String(bank.id) };
}

before(() => {
  freshCampus();
});

describe("Grading: per-hour late deduction, stored missing grades, GPA and pass/fail", () => {
  it("deducts per hour late when the course sets latePctPerHour", () => {
    const store = storeOf("demo");
    store.update("courses", C1, { latePolicy: { latePctPerHour: 5, floorPct: 0 } });
    const asg = store.insert("assignments", { courseId: C1, title: "Hourly late", points: 10, dueAt: new Date(Date.parse(nowIso()) - 3 * 3600_000 + 60_000).toISOString(), state: "published", submissionTypes: ["text"] }, "asg");
    const s = d("student1", false);
    asm.submit(s.store, s.actor, asg.id, { mode: "text", body: "late work" });
    const r = grading.latePenalty(storeOf("demo"), storeOf("demo").get("assignments", asg.id)!, s.actor.id, 10);
    assert.equal(r.hoursLate, 3);
    assert.equal(r.penaltyPct, 15);
    assert.equal(r.score, 8.5);
    store.update("courses", C1, { latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 } });
  });

  it("stores the missing-score policy as a real grade (source missing_policy)", () => {
    const store = storeOf("demo");
    store.update("courses", C1, { latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 40 } });
    const asg = store.insert("assignments", { courseId: C1, title: "Never submitted", points: 10, dueAt: new Date(Date.parse(nowIso()) - 2 * 86400_000).toISOString(), state: "published", submissionTypes: ["text"] }, "asg");
    grading.missingJob(storeOf("demo"));
    const g = storeOf("demo").list("grades", (x) => x.assignmentId === asg.id && x.userId === "usr_demo_student3")[0];
    assert.ok(g, "missing grade stored");
    assert.equal(g.status, "missing");
    assert.equal(Number(g.score), 4);
    store.update("courses", C1, { latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 } });
  });

  it("maps letters to grade points and pass/fail schemes to Pass/Fail with no GPA", () => {
    assert.equal(grading.gpaFor({ kind: "gpa", bands: [] } as never, "B+"), 3.3);
    assert.equal(grading.gpaFor({ kind: "letter", bands: [{ label: "A", min: 90, gpa: 4 }] } as never, "A"), 4);
    const pf = { kind: "pass_fail", bands: [{ label: "Pass", min: 65 }, { label: "Fail", min: 0 }] } as never;
    assert.equal(grading.letterFor(pf, 70), "Pass");
    assert.equal(grading.letterFor(pf, 60), "Fail");
    assert.equal(grading.gpaFor(pf, "Pass"), null);
    const sum = grading.gpaSummary(storeOf("demo"), "usr_demo_student1");
    assert.match(sum.note, /not an official transcript/);
  });
});

describe("Quizzes: calculator, student and outcomes analysis, shared banks, content versions", () => {
  it("evaluates basic and scientific expressions without eval and refuses unsafe input", () => {
    assert.equal(evaluate("2 + 3 × 4"), 14);
    assert.equal(evaluate("(1 + 2) ÷ 4"), 0.75);
    assert.equal(evaluate("50%"), 0.5);
    assert.equal(evaluate("2^10", "scientific"), 1024);
    assert.equal(evaluate("sqrt(16) + abs(-2)", "scientific"), 6);
    assert.throws(() => evaluate("2^3"), /scientific/);
    assert.throws(() => evaluate("process.exit()", "scientific"), /Unknown function|Unexpected/);
    assert.throws(() => evaluate("1/0"), /divide by zero/);
    assert.match(calculatorHtml("basic", "<script>"), /&lt;script&gt;/);
  });

  it("bumps a question's content version on every content edit", () => {
    const inst = d("instructor");
    const bank = entity.create(inst.store, inst.actor, "question_banks", { courseId: C1, title: "Versioned" });
    const q = entity.create(inst.store, inst.actor, "questions", { courseId: C1, bankId: bank.id, kind: "multiple_choice", prompt: "v1", choices: ["a", "b"], answer: "a", points: 1 });
    assert.equal(q.contentRevision, 1);
    const q2 = entity.update(d("instructor").store, inst.actor, "questions", String(q.id), { prompt: "v2" });
    assert.equal(q2.contentRevision, 2);
    const q3 = entity.update(d("instructor").store, inst.actor, "questions", String(q.id), { tags: ["x"] });
    assert.equal(q3.contentRevision, 2, "metadata-only edits keep the version");
  });

  it("reports every attempt's answers per question (rows and CSV) to staff only", () => {
    const { quizId } = makeQuiz("Analysis quiz");
    const s = d("student4", false);
    const at = asm.startAttempt(s.store, s.actor, quizId);
    asm.autosave(d("student4", false).store, s.actor, at.attempt.id, Object.fromEntries(at.questions.map((q: { id: string }) => [q.id, "a"])), Number(at.attempt.version));
    asm.submitAttempt(d("student4", false).store, s.actor, at.attempt.id);
    const r = qt.studentAnalysis(d("instructor").store, d("instructor").actor, quizId);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].responses.length, 3);
    const csv = qt.studentAnalysisCsv(d("instructor").store, d("instructor").actor, quizId);
    assert.match(csv.split("\n")[0], /Q1 answer/);
    assert.equal(status(() => qt.studentAnalysis(d("student4", false).store, d("student4", false).actor, quizId)), 403);
    const oa = qt.outcomesAnalysis(d("instructor").store, d("instructor").actor, quizId);
    assert.equal(oa.attempts >= 0, true);
  });

  it("shares a bank with the account so another course under it can draw from it", () => {
    const { bankId } = makeQuiz("Shared source");
    const inst = d("instructor");
    assert.equal(qt.banksFor(d("admin").store, d("admin").actor, "crs_demo_data210").some((b) => b.id === bankId), false);
    qt.shareBank(inst.store, inst.actor, bankId, true);
    // Instructor of DATA-210 (admin here) sees it as shared.
    const adm = d("admin");
    assert.ok(qt.banksFor(adm.store, adm.actor, "crs_demo_data210").some((b) => b.id === bankId && /shared by/.test(b.source)));
  });
});

describe("Admin: sub-account admins, audit search, account settings, themes, jobs, IdPs", () => {
  it("a sub-account admin is admin only in courses under that account", () => {
    const adm = d("admin");
    const other = adm.store.insert("accounts", { name: "School of Arts", parentId: "acc_demo_root" }, "acc");
    const artsCourse = adm.store.insert("courses", { code: "ART-1", title: "Drawing", state: "unpublished", accountId: other.id }, "crs");
    grantAccountAdmin(adm.store, adm.actor, "usr_demo_advisor", "acc_demo_computing");
    const a = actorFor(storeOf("demo"), "usr_demo_advisor");
    assert.deepEqual(a.accountAdminOf, ["acc_demo_computing"]);
    assert.equal(a.roles.includes("admin"), false, "never tenant-wide");
    assert.equal(hasAny(a, ["admin"], C1), true);
    assert.equal(hasAny(a, ["admin"], artsCourse.id), false);
    assert.equal(hasAny(a, ["admin"]), false);
    assert.equal(status(() => grantAccountAdmin(storeOf("demo"), a, "usr_demo_ta", "acc_demo_computing")), 403);
  });

  it("filters the audit log by type, course and user, and keeps a sign-in log", () => {
    const store = storeOf("demo");
    assert.equal(status(() => signIn(store, "admin@nobody.invalid", "wrong")), 401);
    const adm = d("admin");
    grading.setGrade(adm.store, adm.actor, { assignmentId: "asg_demo_hello", userId: "usr_demo_student5", score: 7 });
    const g = acfg.auditSearch(adm.store, adm.actor, { type: "grade_change", courseId: C1 });
    assert.ok(g.rows.length > 0);
    assert.ok(g.rows.every((r) => r.action.includes("grade")));
    const auth = acfg.authLog(adm.store, adm.actor);
    assert.ok(auth.rows.some((r) => r.outcome === "denied"));
    const byUser = acfg.auditSearch(adm.store, adm.actor, { userId: "usr_demo_admin" });
    assert.ok(byUser.rows.every((r) => r.actorId === "usr_demo_admin" || r.realActorId === "usr_demo_admin" || r.resource.includes("usr_demo_admin")));
    assert.match(acfg.auditSearchCsv(adm.store, adm.actor, { type: "auth" }).split("\n")[0], /^at,actor/);
    assert.equal(status(() => acfg.auditSearch(d("instructor").store, d("instructor").actor, {})), 403);
  });

  it("account settings: trusted domains gate embeds, named IP filters gate quizzes, legal links", () => {
    const adm = d("admin");
    assert.equal(status(() => acfg.setAccountSettings(adm.store, adm.actor, { trustedDomains: ["not a domain"] })), 422);
    assert.equal(status(() => acfg.setAccountSettings(adm.store, adm.actor, { ipFilters: [{ name: "Lab", ranges: ["999.1.1.1"] }] })), 422);
    acfg.setAccountSettings(adm.store, adm.actor, { trustedDomains: ["*.example.edu"], ipFilters: [{ name: "Lab", ranges: ["10.1.0.0/16"] }], termsUrl: "https://example.edu/terms", privacyUrl: "/privacy" });
    const store = storeOf("demo");
    assert.equal(acfg.embedAllowed(store, "https://video.example.edu/x"), true);
    assert.equal(acfg.embedAllowed(store, "https://evil.test/x"), false);
    assert.equal(acfg.embedAllowed(store, "http://video.example.edu/x"), false);
    assert.match(cur.renderBlocks(store, [{ type: "embed", title: "Elsewhere", src: "https://evil.test/x" } as never]), /not a trusted domain/);
    assert.equal(acfg.ipInRange("10.1.200.3", "10.1.0.0/16"), true);
    assert.equal(acfg.ipInRange("10.2.0.1", "10.1.0.0/16"), false);
    const { quizId } = makeQuiz("IP quiz");
    storeOf("demo").update("quizzes", quizId, { ipFilter: ["@Lab"] });
    const s = d("student4", false);
    assert.equal(status(() => asm.startAttempt(s.store, s.actor, quizId, { ip: "192.168.0.9" })), 403);
    assert.ok(asm.startAttempt(d("student4", false).store, s.actor, quizId, { ip: "10.1.4.4" }).attempt.id);
    assert.deepEqual(acfg.legalLinks(storeOf("demo")), { termsUrl: "https://example.edu/terms", privacyUrl: "/privacy", selfRegistration: false });
  });

  it("self-registration is off by default; with approval it creates an account only when approved", () => {
    const store = storeOf("demo");
    assert.equal(status(() => acfg.selfRegister(store, { name: "New Person", email: "new@demo.example.edu" })), 403);
    const adm = d("admin");
    acfg.setAccountSettings(adm.store, adm.actor, { selfRegistration: "approval", selfRegistrationDomains: ["demo.example.edu"] });
    assert.equal(status(() => acfg.selfRegister(storeOf("demo"), { name: "Out", email: "x@else.test" })), 422);
    const r = acfg.selfRegister(storeOf("demo"), { name: "New Person", email: "new@demo.example.edu" });
    assert.equal(r.received, true);
    assert.equal(storeOf("demo").list("users", (u) => u.email === "new@demo.example.edu").length, 0);
    const req = storeOf("demo").list("self_registrations", (x) => x.email === "new@demo.example.edu")[0];
    acfg.decideSelfRegistration(d("admin").store, d("admin").actor, req.id, true);
    assert.equal(storeOf("demo").list("users", (u) => u.email === "new@demo.example.edu").length, 1);
    acfg.setAccountSettings(d("admin").store, d("admin").actor, { selfRegistration: "off" });
  });

  it("custom CSS is sanitized and scoped; a logo image must be https or a campus link", () => {
    assert.equal(acfg.sanitizeCss(".card { border-radius: 12px; }"), ".campus-custom .card { border-radius: 12px; }");
    for (const bad of ["@import url(x.css);", ".a { background: url(https://x) }", "body { color: red }", ".a { content: 'x' }", ".a { position: fixed }", "</style><script>"]) assert.throws(() => acfg.sanitizeCss(bad), CampusError, bad);
    const adm = d("admin");
    assert.equal(status(() => acfg.setThemeExtras(adm.store, adm.actor, { logoUrl: "javascript:alert(1)" })), 422);
    const t = acfg.setThemeExtras(adm.store, adm.actor, { logoUrl: "https://example.edu/logo.png", customCss: ".page-title { letter-spacing: 0.01em; }" });
    assert.equal(t.logoUrl, "https://example.edu/logo.png");
    assert.match(String(broker.tenant(storeOf("demo").tenantId)!.theme.customCss), /^\.campus-custom \.page-title/);
  });

  it("queues reports and SIS imports as background jobs with progress and issues", () => {
    const adm = d("admin");
    const j = acfg.enqueueJob(adm.store, adm.actor, "report", { kind: "enrollment" });
    assert.equal(j.state, "queued");
    const j2 = acfg.enqueueJob(adm.store, adm.actor, "sis_import", { kind: "users", csv: "sis_id,email,name\nS-1,bulk1@demo.example.edu,Bulk One\n,broken,\n" });
    const rows = acfg.jobStatus(d("admin").store, d("admin").actor);
    const done = rows.find((x) => x.id === j.id)!;
    assert.equal(done.state, "completed");
    assert.equal(done.progress, 100);
    assert.match(String(done.resultRef), /^report_runs\//);
    const sis = rows.find((x) => x.id === j2.id)!;
    assert.equal(sis.state, "completed_with_errors");
    assert.ok(sis.issues.length >= 1);
    assert.equal(status(() => acfg.enqueueJob(d("instructor").store, d("instructor").actor, "report", { kind: "enrollment" })), 403);
  });

  it("records identity providers without secrets and never claims a connection", () => {
    const adm = d("admin");
    assert.equal(status(() => acfg.configureIdp(adm.store, adm.actor, { kind: "oidc", name: "Campus SSO", config: { issuer: "https://id.example.edu", clientSecret: "x" } })), 422);
    assert.equal(status(() => acfg.configureIdp(adm.store, adm.actor, { kind: "ldap", name: "Dir", config: { host: "ldap.example.edu", useTls: false } })), 422);
    const p = acfg.configureIdp(adm.store, adm.actor, { kind: "saml", name: "Campus SAML", config: { entityId: "urn:example", ssoUrl: "https://sso.example.edu/saml" } });
    assert.equal(p.state, "not_connected");
    const t = acfg.testIdp(adm.store, adm.actor, String(p.id));
    assert.equal(t.configComplete, true);
    assert.equal(t.connected, false);
  });
});

describe("Course: Student View, home types, page editing roles, live links, group quota, portfolio, recordings, proctoring", () => {
  it("the test student is excluded from rosters and analytics, and staff can act as it (only it)", () => {
    const inst = d("instructor", false);
    const ts = cur.studentView(inst.store, inst.actor, C1);
    assert.equal(activeStudents(storeOf("demo"), C1).some((e) => e.userId === ts.id), false);
    assert.equal(courseAnalytics(storeOf("demo"), d("instructor").actor, C1).students, activeStudents(storeOf("demo"), C1).length);
  });

  it("act-as for Student View: allowed for the course's staff without MFA, refused for real students", () => {
    const store = storeOf("demo");
    const ts = store.list("users", (u) => u.testStudentOf === C1)[0];
    const secret = "test-session-secret-student-view";
    store.insert("sessions", { tokenHash: sha256(secret), userId: "usr_demo_instructor", mfa: false, expiresAt: new Date(Date.parse(nowIso()) + 3600_000).toISOString() }, "ses");
    const inst = actorFor(store, "usr_demo_instructor", false);
    assert.equal(status(() => startMasquerade(storeOf("demo"), inst, secret, "usr_demo_student1", "checking")), 403);
    startMasquerade(storeOf("demo"), inst, secret, ts.id, "");
    const acting = resolveSession(storeOf("demo"), secret)!;
    assert.equal(acting.id, ts.id);
    assert.equal(acting.masqueradedBy?.id, "usr_demo_instructor");
  });

  it("home page: front page and activity stream", () => {
    const store = storeOf("demo");
    store.update("courses", C1, { homeType: "activity" });
    const items = cur.courseActivity(store, d("student1", false).actor, C1);
    assert.ok(items.length > 0);
    assert.ok(items.every((x, i) => i === 0 || items[i - 1].at >= x.at));
    store.update("courses", C1, { homeType: "modules" });
  });

  it("students edit a page only when its editing roles allow; teachers keep the title", () => {
    const store = storeOf("demo");
    const page = store.list("pages", (p) => p.courseId === C1 && p.state === "published")[0];
    const s = d("student1", false);
    assert.equal(status(() => cur.savePageText(s.store, s.actor, page.id, "## Student edit")), 403);
    store.update("pages", page.id, { editingRoles: "teachers_students" });
    const ok = cur.savePageText(d("student1", false).store, s.actor, page.id, "## Student edit\n\nAdded a note.");
    assert.ok(ok && String(ok.html).includes("Student edit"));
    assert.equal(status(() => cur.savePageText(d("student1", false).store, s.actor, page.id, "x", "Renamed by student")), 403);
    assert.ok(storeOf("demo").list("page_revisions", (r) => r.pageId === page.id && r.authorId === s.actor.id).length >= 1);
    assert.equal(cur.savePageText(d("instructor").store, d("instructor").actor, page.id, "x"), null, "staff use the normal update path");
  });

  it("renaming linked content re-renders the pages that link to it", () => {
    const inst = d("instructor");
    const mod = storeOf("demo").list("modules", (m) => m.courseId === C1)[0];
    const target = entity.create(inst.store, inst.actor, "pages", { courseId: C1, moduleId: mod.id, title: "Old target title", blocks: [{ type: "paragraph", text: "t" }] });
    const linker = entity.create(d("instructor").store, inst.actor, "pages", { courseId: C1, moduleId: mod.id, title: "Linker", blocks: [{ type: "link", ref: { table: "pages", id: target.id } }] });
    assert.match(String(storeOf("demo").get("pages", String(linker.id))!.html), /Old target title/);
    entity.update(d("instructor").store, inst.actor, "pages", String(target.id), { title: "New target title" });
    assert.match(String(storeOf("demo").get("pages", String(linker.id))!.html), /New target title/);
  });

  it("group files respect the group quota and are visible only to members and staff", () => {
    const inst = d("instructor");
    const g = entity.create(inst.store, inst.actor, "groups", { courseId: C1, name: "Team Quota", memberIds: ["usr_demo_student1", "usr_demo_student2"], quotaMb: 1 });
    const s1 = d("student1", false);
    const r = fil.requestUpload(s1.store, s1.actor, { name: "notes.txt", mime: "text/plain", size: 600 * 1024, groupId: String(g.id), purpose: "group" });
    assert.ok(r.file.id);
    assert.equal(status(() => fil.requestUpload(d("student1", false).store, s1.actor, { name: "big.txt", mime: "text/plain", size: 600 * 1024, groupId: String(g.id), purpose: "group" })), 507);
    assert.equal(status(() => fil.requestUpload(d("student3", false).store, d("student3", false).actor, { name: "x.txt", mime: "text/plain", size: 10, groupId: String(g.id), purpose: "group" })), 403);
    const f = { ...storeOf("demo").get("files", String(r.file.id))!, state: "available" };
    assert.equal(fil.canDownload(storeOf("demo"), d("student2", false).actor, f), true);
    assert.equal(fil.canDownload(storeOf("demo"), d("student3", false).actor, f), false);
  });

  it("public portfolio link works only while the owner keeps it on", () => {
    const s = d("student1", false);
    const p = s.store.insert("portfolios", { userId: s.actor.id, title: "My work", summary: "Projects" }, "pf");
    s.store.insert("portfolio_pages", { userId: s.actor.id, portfolioId: p.id, section: "Projects", title: "Greeter", body: "A small program." }, "pfp");
    assert.equal(status(() => pfo.setPortfolioPublic(d("student2", false).store, d("student2", false).actor, p.id, true)), 404);
    const on = pfo.setPortfolioPublic(d("student1", false).store, s.actor, p.id, true);
    assert.ok(on.token && on.path?.includes("/portfolio/"));
    const view = pfo.publicPortfolio(storeOf("demo"), on.token!);
    assert.equal(view.pages[0].title, "Greeter");
    pfo.setPortfolioPublic(d("student1", false).store, s.actor, p.id, false);
    assert.equal(status(() => pfo.publicPortfolio(storeOf("demo"), on.token!)), 404);
  });

  it("recordings get a delete-after date from the session's retention and are purged by the job", () => {
    const store = storeOf("demo");
    const ls = store.insert("live_sessions", { courseId: C1, title: "Week 3 live", startsAt: nowIso(), minutes: 60, provider: "zoom", recordingRetentionDays: 1 }, "ls");
    const file = store.insert("files", { name: "rec.mp4", mime: "video/mp4", size: 10, ownerId: "usr_demo_instructor", courseId: C1, state: "available", objectKey: "objects/rec" }, "fil");
    const inst = d("instructor");
    const rec = cal.addLiveRecording(inst.store, inst.actor, { liveSessionId: ls.id, fileId: file.id });
    assert.equal(cal.recordingRetentionJob(storeOf("demo")).purged, 0);
    advanceClock(2 * 86400_000);
    assert.equal(cal.recordingRetentionJob(storeOf("demo")).purged, 1);
    assert.equal(storeOf("demo").get("live_recordings", rec.id)!.state, "purged");
    assert.equal(storeOf("demo").get("files", file.id)!.state, "purged");
    store.update("live_sessions", ls.id, { recordingRetentionDays: 0 });
    assert.equal(status(() => cal.addLiveRecording(d("instructor").store, inst.actor, { liveSessionId: ls.id, fileId: file.id })), 409);
  });

  it("LTI proctoring: start-proctoring launch, signed start-assessment return, single use", () => {
    const { quizId } = makeQuiz("Proctored via LTI");
    const store = storeOf("demo");
    const tool = lti.ensureCloudLabTool(store);
    store.update("quizzes", quizId, { proctoringToolId: tool.id });
    const s = d("student2", false);
    const launch = lti.proctorLaunch(s.store, s.actor, quizId);
    assert.ok(launch.idToken.split(".").length === 3);
    const back = lti.cloudLabStartAssessment(storeOf("demo"), launch.idToken);
    const r = lti.proctorStartAssessment(d("student2", false).store, s.actor, back);
    assert.equal(r.cleared, true);
    assert.ok(storeOf("demo").list("proctor_readiness", (x) => x.quizId === quizId && x.userId === s.actor.id && !!x.complete).length);
    assert.equal(status(() => lti.proctorStartAssessment(d("student2", false).store, s.actor, back)), 401, "replay refused");
    assert.equal(status(() => lti.proctorLaunch(d("instructor").store, d("instructor").actor, quizId)), 403);
  });

  it("course toggles: students can be stopped from deleting their own posts", () => {
    const store = storeOf("demo");
    const topic = store.list("discussion_topics", (t) => t.courseId === C1)[0];
    const post = store.insert("posts", { topicId: topic.id, courseId: C1, authorId: "usr_demo_student1", body: "hello" }, "pst");
    store.update("courses", C1, { studentsDeletePosts: false });
    assert.equal(status(() => col.deletePost(d("student1", false).store, d("student1", false).actor, post.id)), 403);
    store.update("courses", C1, { studentsDeletePosts: true });
  });
});

describe("Parity ledger", () => {
  it("rows closed in this round are DONE with evidence", () => {
    const s = paritySummary();
    assert.equal(s.notStarted, 0);
    for (const f of ["Late/missing policies (missing grade, %/day/hour, floor)", "Calculator", "Student analysis", "Account admin / sub-account admin / custom roles", "Async reports CSV", "Proctoring via LTI"]) {
      const row = PARITY.find((r) => r.feature === f);
      assert.ok(row, f);
      assert.equal(row!.status, "DONE", f);
      assert.ok(row!.evidence.length > 10, f);
    }
  });
});
