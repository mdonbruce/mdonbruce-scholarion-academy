import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { handleCampus } from "../src/campus/http/router";
import { advanceClock, relay, resetClock } from "../src/campus/core";
import { DEMO_PASSWORD } from "../src/campus/seed";
import * as entity from "../src/campus/entity";
import * as prog from "../src/campus/services/programs";
import * as academy from "../src/campus/services/academy";
import * as plus from "../src/campus/services/lmsplus";
import * as asm from "../src/campus/services/assessment";
import * as dash from "../src/campus/services/dashboard";
import { PROGRAMS } from "../src/campus/academy/programs-data";
import { paritySummary, PARITY } from "../src/campus/parity";
import { TAB } from "../src/campus/registry";

const BASE = "http://localhost:3000/api/campus/";
const P26 = "off_academy_26";
const SELF_OK = { py1: "[0, 2, 4]", py2: "dict", ds1: "queue", py3: "1 2", llm1: "the number of tokens it can consider at once", llm2: "code must parse the model's answer reliably" };

function status(fn: () => unknown): number {
  try {
    fn();
    return 200;
  } catch (e) {
    return (e as { status?: number }).status ?? 500;
  }
}
async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await handleCampus(new Request(BASE + path, { ...init, headers }), path.split("?")[0]);
  return res;
}
async function signin(key: string) {
  const r = await call("v1/t/academy/auth/signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${key}@academy.scholarion.test`, password: DEMO_PASSWORD }) });
  return r.headers.get("set-cookie")!.split(";")[0];
}
const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000", host: "localhost:3000" }, body: new URLSearchParams(o) });

describe("Academy programs #1, #12, #13, #14, #26 (Tab 50)", () => {
  before(() => {
    resetClock();
    freshCampus();
  });

  it("loads every program into the catalog with pages, cohorts, shells and credentials", () => {
    const store = storeOf("academy");
    assert.equal(TAB["program-studio"].n, 50);
    for (const spec of PROGRAMS) {
      const o = store.list("offerings", (x) => x.code === spec.code)[0];
      assert.ok(o, spec.code);
      assert.equal(o.state, "published");
      assert.equal(o.requiresApplication, true);
      const page = store.list("program_pages", (p) => p.offeringId === o.id)[0];
      assert.equal(page.state, "published", spec.code);
      assert.ok(store.list("offering_sections", (s) => s.offeringId === o.id).length);
      const courses = [o.courseId, ...((o.blockCourseIds as string[]) ?? [])];
      assert.equal(courses.length, spec.blocks.length, `${spec.code} blocks`);
      for (const cid of courses) assert.equal(store.get("courses", String(cid))!.state, "unpublished", "shells load unpublished until the quality gate");
      assert.ok(prog.qualityGate(store, o.id).every((g) => g.ok), `${spec.code} gate`);
      assert.ok(store.get("credential_templates", String(o.credentialTemplateId)));
    }
    // #13 parts are sold separately and stack into the bundle; the Python refresher moved to #1-R.
    assert.ok(store.get("offerings", "off_academy_13_1") && store.get("offerings", "off_academy_13_2"));
    assert.equal(store.list("pathway_edges", (e) => e.toId === "off_academy_13" && e.kind === "stacks_into").length, 2);
    assert.equal(store.get("offerings", "off_academy_1r")!.code, "#1-R");
    // #26 waives Program #1 Weeks 1–8 and #15 Weekends 3–5 (consolidation table).
    const w = store.list("pathway_edges", (e) => e.fromId === P26 && e.kind === "waives");
    assert.equal(w.filter((e) => e.toId === "off_academy_1").length, 8);
    assert.equal(w.filter((e) => e.toId === "off_academy_15").length, 3);
    // #26: 7 sequential modules, 12 labs, 6 published weekly quizzes, live calendar of 20 sessions.
    const c26 = "crs_academy_p26";
    assert.equal(store.list("assignments", (a) => a.courseId === c26 && /^Lab \d+[AB]:/.test(String(a.title))).length, 12);
    assert.equal(store.list("quizzes", (q) => q.courseId === c26 && q.state === "published").length, 6);
    assert.equal(store.list("calendar_events", (e) => e.courseId === c26).length, 20);
    assert.ok(store.list("modules", (m) => m.courseId === c26 && !!m.sequential).length >= 7);
  });

  it("builds the website page from the catalog: fees, cohorts, JSON-LD, honest credential and social proof rules", () => {
    const store = storeOf("academy");
    const p = prog.programPage(store, null, "applied-agentic-ai");
    assert.equal(p.code, "#14");
    assert.equal(p.facts.fee, 2200);
    assert.match(p.ceuStatement, /No CEUs are issued/);
    assert.equal(p.jsonLd["@type"], "Course");
    assert.equal(p.showSocialProof, false, "hidden without consented testimonials");
    // Fee is read live from the catalog (single source of truth).
    const admin = as("academy", "admin");
    entity.update(admin.store, admin.actor, "offerings", "off_academy_14", { price: 2350 });
    assert.equal(prog.programPage(storeOf("academy"), null, "#14").fees.price, 2350);
    // #26 schedule shows ET times generated from the calendar.
    const p26 = prog.programPage(storeOf("academy"), null, "agentic-systems-live-intensive");
    assert.equal(p26.liveSchedule.length, 20);
    assert.ok(p26.spec.research!.every((r) => r.year >= 2020 && r.venue));
    // Consented testimonial appears; the copy check blocks borrowed claims.
    const t = entity.create(as("academy", "admin").store, admin.actor, "program_testimonials", { offeringId: "off_academy_14", learnerName: "Priya N.", quote: "The MCP project changed how I design tools.", consentRef: "consent-2026-0042", consentAt: "2026-09-01" });
    entity.publish(as("academy", "admin").store, admin.actor, "program_testimonials", String(t.id));
    assert.equal(prog.programPage(storeOf("academy"), null, "#14").showSocialProof, true);
    const bad = entity.create(as("academy", "admin").store, admin.actor, "program_testimonials", { offeringId: "off_academy_14", learnerName: "X", quote: "Guaranteed job after this!", consentRef: "c1", consentAt: "2026-09-01" });
    assert.equal(status(() => entity.publish(as("academy", "admin").store, admin.actor, "program_testimonials", String(bad.id))), 422);
    // A page edit that adds an unverified claim can't be published.
    const row = storeOf("academy").list("program_pages", (x) => x.offeringId === "off_academy_12")[0];
    const spec = { ...(row.spec as object), overview: ["Ranked #1 by everyone, with an average salary of $150k."] };
    entity.publish(as("academy", "admin").store, admin.actor, "program_pages", row.id, false);
    entity.update(as("academy", "admin").store, admin.actor, "program_pages", row.id, { spec });
    assert.equal(status(() => entity.publish(as("academy", "admin").store, admin.actor, "program_pages", row.id)), 422);
  });

  it("#26: self-check → apply → admission review → sandbox seat → orientation; routing when not ready", () => {
    const s = as("academy", "student4", false);
    assert.equal(status(() => academy.checkout(s.store, s.actor, { offeringId: P26, sandboxCard: "tok_sandbox_visa" })), 409, "admission first");
    assert.equal(status(() => prog.applyToProgram(as("academy", "student4", false).store, s.actor, { offeringId: P26, statement: "I want to learn agent design properly with evaluation." })), 409, "self-check first");
    const fail = prog.selfCheck(as("academy", "student4", false).store, s.actor, P26, { py1: "6" });
    assert.equal(fail.passed, false);
    assert.deepEqual(fail.routeTo, ["#16", "#19"]);
    assert.match(fail.message, /advisor/);
    assert.equal(prog.selfCheck(as("academy", "student4", false).store, s.actor, P26, SELF_OK).passed, true);
    const app = prog.applyToProgram(as("academy", "student4", false).store, s.actor, { offeringId: P26, statement: "I build backend services and want reliable multi-agent systems." });
    assert.equal(app.application.state, "submitted");
    assert.equal(status(() => prog.reviewProgramApplication(as("academy", "student4", false).store, s.actor, app.application.id, "admit")), 403);
    const reg = as("academy", "registrar");
    prog.reviewProgramApplication(reg.store, reg.actor, app.application.id, "admit");
    const sec = storeOf("academy").list("offering_sections", (x) => x.offeringId === P26)[0];
    const co = academy.checkout(as("academy", "student4", false).store, s.actor, { offeringId: P26, sectionId: sec.id, sandboxCard: "tok_sandbox_visa", plan: "installments", installments: 3 });
    assert.equal(co.order.state, "paid_sandbox");
    assert.ok(storeOf("academy").list("enrollments", (e) => e.userId === "usr_academy_student4" && e.courseId === "crs_academy_p26" && e.role === "student").length);
    assert.ok(storeOf("academy").list("pages", (p) => p.courseId === "crs_academy_p26" && p.title === "Orientation and getting started").length);
  });

  it("late enrollment within 7 days extends Week 1 lab deadlines automatically; after that it's closed", () => {
    const store = storeOf("academy");
    const sec = store.list("offering_sections", (x) => x.offeringId === P26)[0];
    const toStart = new Date(String(sec.startsAt)).getTime() - Date.now();
    advanceClock(toStart + 3 * 86400_000); // 3 days after the start
    try {
      const s = as("academy", "student5", false);
      prog.selfCheck(s.store, s.actor, P26, SELF_OK);
      const app = prog.applyToProgram(as("academy", "student5", false).store, s.actor, { offeringId: P26, statement: "Late joiner — data scientist moving into agent systems and evaluation." });
      prog.reviewProgramApplication(as("academy", "registrar").store, as("academy", "registrar").actor, app.application.id, "admit");
      academy.checkout(as("academy", "student5", false).store, s.actor, { offeringId: P26, sectionId: sec.id, sandboxCard: "tok_sandbox_visa" });
      const ov = storeOf("academy").list("assignment_overrides", (o) => o.targetId === "usr_academy_student5");
      assert.ok(ov.length >= 2, "Week 1 labs extended");
      advanceClock(6 * 86400_000); // day 9
      const s6 = as("academy", "student6", false);
      prog.selfCheck(s6.store, s6.actor, P26, SELF_OK);
      const app6 = prog.applyToProgram(as("academy", "student6", false).store, s6.actor, { offeringId: P26, statement: "Platform engineer interested in agent observability and guardrails." });
      prog.reviewProgramApplication(as("academy", "registrar").store, as("academy", "registrar").actor, app6.application.id, "admit");
      assert.equal(status(() => academy.checkout(as("academy", "student6", false).store, s6.actor, { offeringId: P26, sectionId: sec.id, sandboxCard: "tok_sandbox_visa" })), 423);
    } finally {
      resetClock();
    }
  });

  it("#26 is pass/no-pass: all labs, quizzes ≥ 70%, capstone threshold and presentation", () => {
    const admin = as("academy", "admin");
    prog.publishProgramShells(admin.store, admin.actor, P26);
    const store = storeOf("academy");
    const uid = "usr_academy_student4";
    const inst = as("academy", "instructor");
    const pending = academy.evaluateCompletion(store, as("academy", "registrar").actor, uid, P26);
    assert.equal(pending.completed, false);
    assert.equal(pending.checks.length, 4);
    const c = "crs_academy_p26";
    const grade = (title: RegExp, frac: number) => {
      for (const a of storeOf("academy").list("assignments", (x) => x.courseId === c && title.test(String(x.title)))) {
        storeOf("academy").tx(() => storeOf("academy").insert("grades", { assignmentId: a.id, userId: uid, score: Math.round(Number(a.points) * frac), posted: true, status: "none" }, "grd"));
      }
    };
    grade(/^Lab \d+[AB]:/, 0.8);
    for (const q of storeOf("academy").list("quizzes", (x) => x.courseId === c)) storeOf("academy").tx(() => storeOf("academy").insert("attempts", { quizId: q.id, userId: uid, state: "graded", score: 3, attemptNo: 1 }, "att"));
    grade(/^Capstone:/, 0.6);
    grade(/^Final presentation/, 1);
    const notYet = academy.evaluateCompletion(storeOf("academy"), as("academy", "registrar").actor, uid, P26);
    assert.equal(notYet.completed, false, "capstone below the pass threshold");
    for (const g of storeOf("academy").list("grades", (x) => x.userId === uid && /^Capstone:/.test(String(storeOf("academy").get("assignments", String(x.assignmentId))?.title)))) storeOf("academy").tx(() => storeOf("academy").update("grades", g.id, { score: 35 }));
    const done = academy.evaluateCompletion(storeOf("academy"), as("academy", "registrar").actor, uid, P26);
    assert.equal(done.completed, true, JSON.stringify(done.checks));
    assert.ok("credential" in done && done.credential);
  });

  it("#13 bundle badge is issued when both courses are completed", () => {
    const store = storeOf("academy");
    const uid = "usr_academy_student3";
    for (const id of ["off_academy_13_1", "off_academy_13_2"]) {
      store.tx(() => {
        const e = store.insert("offering_enrollments", { userId: uid, offeringId: id, state: "completed", completedAt: new Date().toISOString(), source: "purchase" }, "oen");
        store.emit("offering_enrollments.completed", `offering_enrollments/${e.id}`, { id: e.id, userId: uid, offeringId: id });
      });
    }
    relay(store);
    assert.ok(storeOf("academy").list("credentials", (c) => c.userId === uid && /bundle badge/.test(String(c.title))).length);
  });

  it("serves the brochure PDF, public inquiries (same-origin, rate-limited) and public self-checks over HTTP", async () => {
    const pdf = await call("v1/t/academy/programs/applied-agentic-ai/brochure.pdf");
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
    const inq = { back: "/campus/academy/programs/applied-agentic-ai#teams", offeringId: "off_academy_14", kind: "team", name: "Dana Lead", email: "dana@example.org", organization: "Example Org", seats: "5" };
    const r = await call("v1/t/academy/a/programs.inquire", form(inq));
    assert.equal(r.status, 303);
    const cross = await call("v1/t/academy/a/programs.inquire", { ...form(inq), headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", host: "localhost:3000" } });
    const before = storeOf("academy").list("program_inquiries").length;
    assert.match(new URL(cross.headers.get("location") ?? "http://x/?error=x", "http://x").searchParams.get("error") ?? String(cross.status), /Cross-site|403/);
    assert.equal(storeOf("academy").list("program_inquiries").length, before, "cross-site form did nothing");
    for (let i = 0; i < 4; i++) await call("v1/t/academy/a/programs.inquire", form(inq));
    const limited = await call("v1/t/academy/a/programs.inquire", form(inq));
    assert.equal(new URL(limited.headers.get("location")!, "http://x").searchParams.get("error") !== null || limited.status === 429, true);
    const sc = await call("v1/t/academy/a/programs.self_check", form({ back: "/campus/academy/programs/agentic-systems-live-intensive#self-check", offeringId: P26, result_param: "selfcheck", ...Object.fromEntries(Object.entries(SELF_OK).map(([k, v]) => [`ans__${k}`, v])) }));
    assert.equal(sc.status, 303);
    const id = new URL(sc.headers.get("location")!, "http://x").searchParams.get("selfcheck")!;
    assert.equal(storeOf("academy").get("selfcheck_attempts", id)!.passed, true);
    const page = await call("v1/t/academy/q/programs.page?slug=agentic-systems-live-intensive");
    assert.equal(page.status, 200);
    const cookie = await signin("student2");
    const st = await call("v1/t/academy/q/programs.status", { cookie });
    assert.equal(st.status, 403, "studio status is staff only");
  });
});

describe("LMS parity gap closures (Tab 51)", () => {
  before(() => {
    resetClock();
    freshCampus();
  });

  it("reports parity honestly with evidence for every feature", () => {
    const s = paritySummary();
    assert.equal(TAB["parity-status"].n, 51);
    assert.equal(s.total, PARITY.length);
    assert.equal(s.done + s.partial + s.notStarted, s.total);
    assert.ok(PARITY.every((r) => r.evidence && (r.status === "DONE" || r.gap)), "every non-done item names its gap");
    assert.equal(s.acceptance.length, 15);
  });

  it("announcements: replies, likes and locked replies", () => {
    const ann = storeOf("demo").list("announcements", (a) => a.title === "Welcome to CS-101")[0];
    const st = as("demo", "student2", false);
    plus.replyAnnouncement(st.store, st.actor, ann.id, "Thanks — booked a slot.");
    assert.equal(status(() => plus.likeAnnouncement(as("demo", "student2", false).store, st.actor, ann.id)), 409, "likes off");
    const inst = as("demo", "instructor");
    entity.update(inst.store, inst.actor, "announcements", ann.id, { allowLikes: true, lockReplies: true });
    assert.equal(plus.likeAnnouncement(as("demo", "student2", false).store, st.actor, ann.id).liked, true);
    assert.equal(status(() => plus.replyAnnouncement(as("demo", "student2", false).store, st.actor, ann.id, "One more")), 423);
    assert.equal(plus.announcementReplies(as("demo", "student3", false).store, as("demo", "student3", false).actor, ann.id).replies.length, 1);
  });

  it("bulk date shift, grade detail tray, enrollment edits, forwarding, analytics CSV and statistics", () => {
    const inst = as("demo", "instructor");
    const cid = "crs_demo_cs101";
    const before = storeOf("demo").get("assignments", "asg_demo_hello")!.dueAt as string;
    plus.bulkEditDates(inst.store, inst.actor, cid, { shiftDays: 2 });
    assert.equal(new Date(String(storeOf("demo").get("assignments", "asg_demo_hello")!.dueAt)).getTime() - new Date(before).getTime(), 2 * 86400_000);
    assert.equal(status(() => plus.bulkEditDates(as("demo", "student1", false).store, as("demo", "student1", false).actor, cid, { shiftDays: 1 })), 403);
    const tray = plus.gradeDetail(as("demo", "instructor").store, inst.actor, "asg_demo_hello", "usr_demo_student1");
    assert.ok(Array.isArray(tray.history) && tray.statusOptions.includes("excused"));
    const enr = storeOf("demo").list("enrollments", (e) => e.courseId === cid && e.userId === "usr_demo_student3")[0];
    const otherSection = storeOf("demo").list("sections", (s) => s.courseId === cid && s.id !== enr.sectionId)[0];
    if (otherSection) assert.equal(plus.editEnrollment(as("demo", "instructor").store, inst.actor, enr.id, { sectionId: otherSection.id }).sectionId, otherSection.id);
    assert.equal(status(() => plus.editEnrollment(as("demo", "instructor").store, inst.actor, enr.id, { role: "instructor" })), 403, "only admins promote to teacher");
    const conv = storeOf("demo").list("conversations", (c) => c.subject === "Lab 1 tips")[0];
    const fw = plus.forwardConversation(as("demo", "instructor").store, inst.actor, conv.id, { courseId: cid, role: "ta" });
    assert.ok(fw.recipients >= 1);
    assert.equal(status(() => plus.forwardConversation(as("demo", "instructor").store, inst.actor, conv.id, { courseId: cid, userIds: ["usr_academy_student1"] })), 422, "no cross-tenant recipients");
    assert.match(plus.courseAnalyticsCsv(as("demo", "instructor").store, inst.actor, cid), /^section,item,metric,value/);
    assert.ok(plus.courseStatistics(as("demo", "instructor").store, inst.actor, cid).items.modules > 0);
  });

  it("conclude makes a course read-only; reset is refused when there is student work", () => {
    const inst = as("demo", "instructor");
    const cid = "crs_demo_cs101";
    plus.concludeCourse(inst.store, inst.actor, cid);
    const st = as("demo", "student2", false);
    assert.equal(status(() => asm.submit(st.store, st.actor, "asg_demo_hello", { mode: "text", body: "late" })), 423);
    plus.concludeCourse(as("demo", "instructor").store, inst.actor, cid, false);
    assert.equal(status(() => plus.resetCourseContent(as("demo", "instructor").store, inst.actor, cid, "CS-101")), 409);
    assert.equal(status(() => plus.resetCourseContent(as("demo", "instructor").store, inst.actor, cid, "wrong")), 422);
  });

  it("grade display formats, page to-dos in the planner, include/exclude on REST", async () => {
    assert.equal(plus.displayGrade(9, 10, "percent"), "90%");
    assert.equal(plus.displayGrade(9, 10, "letter"), "A");
    assert.equal(plus.displayGrade(7.5, 10, "gpa"), "2.0");
    assert.equal(plus.displayGrade(1, 10, "complete_incomplete"), "Complete");
    const inst = as("demo", "instructor");
    const pg = storeOf("demo").list("pages", (p) => p.courseId === "crs_demo_cs101")[0];
    const due = new Date(Date.now() + 2 * 86400_000).toISOString();
    entity.update(inst.store, inst.actor, "pages", pg.id, { todoDate: due });
    const st = as("demo", "student1", false);
    const items = dash.planner(st.store, st.actor, new Date().toISOString(), new Date(Date.now() + 5 * 86400_000).toISOString());
    assert.ok(items.some((i) => i.kind === "page" && i.id === pg.id));
    const cookieRes = await handleCampus(new Request(`${BASE}v1/t/demo/auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "student1@demo.scholarion.test", password: DEMO_PASSWORD }) }), "v1/t/demo/auth/signin");
    const cookie = cookieRes.headers.get("set-cookie")!.split(";")[0];
    const r = await handleCampus(new Request(`${BASE}v1/t/demo/r/assignments/asg_demo_hello?include[]=course&exclude[]=instructions`, { headers: { cookie } }), "v1/t/demo/r/assignments/asg_demo_hello");
    const body = (await r.json()) as { data: Record<string, unknown> };
    assert.equal((body.data.course as { id: string }).id, "crs_demo_cs101");
    assert.equal(body.data.instructions, undefined);
  });
});
