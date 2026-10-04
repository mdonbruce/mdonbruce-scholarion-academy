import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import * as O from "../src/campus/services/outcomes";
import * as T from "../src/campus/services/terms";
import * as A from "../src/campus/services/apps";
import * as L from "../src/campus/services/lmsimport";
import { zip } from "../src/campus/services/files";
import * as asm from "../src/campus/services/assessment";
import { outcomeResults } from "../src/campus/services/grading";

/** Parity closures: outcome folders, standards import and mastery scales; term role access and grading-period sets; LTI placements; Moodle/Blackboard/D2L import. */

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
const C2 = "crs_demo_cs102";

before(() => {
  freshCampus();
});

describe("Outcomes: folders, course outcomes, mastery scales, standards import", () => {
  const CSV = `vendor_guid,object_type,title,description,display_name,calculation_method,calculation_int,parent_guids,mastery_points,ratings,,,,,,,
std-root,group,Computing Standards,Synthetic test framework,,,,,,,,,,,,,
std-prog,group,Programming,,,,,std-root,,,,,,,,,
std-1,outcome,Write a function with parameters,,CS.P.1,decaying_average,65,std-prog,3,4,Exceeds,3,Mastery,2,Near,1,Below
std-2,outcome,"Trace a loop, step by step",,CS.P.2,n_mastery,2,std-prog,,,,,,,,,
bad-1,outcome,Orphan,,X.1,average,,missing-parent,,,,,,,,,
bad-2,widget,Odd,,,,,,,,,,,,,,
std-1,outcome,Duplicate,,,,,,,,,,,,,,
`;

  it("dry run reports what would happen without writing anything", () => {
    const a = d("admin");
    const before = a.store.list("outcomes").length;
    const r = O.importStandards(a.store, a.actor, { csv: CSV, dryRun: true });
    assert.equal(r.dryRun, true);
    assert.deepEqual([r.groups.create, r.outcomes.create], [2, 2]);
    assert.equal(r.issues.length, 3);
    assert.ok(r.issues.some((i) => /parent missing-parent/.test(i.problem)));
    assert.ok(r.issues.some((i) => /object_type/.test(i.problem)));
    assert.ok(r.issues.some((i) => /duplicate/.test(i.problem)));
    assert.equal(a.store.list("outcomes").length, before);
  });

  it("imports folders, outcomes and scales; re-importing updates instead of duplicating; export round-trips", () => {
    const a = d("admin");
    const r = O.importStandards(a.store, a.actor, { csv: CSV, source: "Synthetic Computing Standards" });
    assert.equal(r.outcomes.create, 2);
    const o1 = a.store.list("outcomes", (o) => o.vendorGuid === "std-1")[0];
    assert.equal(o1.code, "CS.P.1");
    const scale = a.store.get(O.SCALES, String(o1.scaleId))!;
    assert.deepEqual((scale.ratings as O.Rating[]).map((x) => x.label), ["Exceeds", "Mastery", "Near", "Below"]);
    assert.equal(o1.masteryThreshold, 75);
    const prog = a.store.list(O.GROUPS, (g) => g.vendorGuid === "std-prog")[0];
    assert.equal(o1.groupId, prog.id);
    assert.equal(a.store.get(O.GROUPS, String(prog.parentId))?.vendorGuid, "std-root");
    const again = O.importStandards(a.store, a.actor, { csv: CSV.replace("Write a function with parameters", "Write a function with parameters and defaults") });
    assert.deepEqual([again.outcomes.create, again.outcomes.update], [0, 2]);
    assert.equal(a.store.list("outcomes", (o) => o.vendorGuid === "std-1").length, 1);
    const csv = O.exportStandards(a.store, a.actor, null);
    assert.match(csv, /std-1,outcome,Write a function with parameters and defaults/);
    assert.match(csv, /"Trace a loop, step by step"/);
  });

  it("folders can't move inside themselves; course outcomes stay in their course", () => {
    const a = d("admin");
    const root = a.store.list(O.GROUPS, (g) => g.vendorGuid === "std-root")[0];
    const prog = a.store.list(O.GROUPS, (g) => g.vendorGuid === "std-prog")[0];
    assert.equal(status(() => O.moveItem(a.store, a.actor, { kind: "group", id: root.id, toGroupId: prog.id })), 422);
    const i = d("instructor");
    const g = O.createGroup(i.store, i.actor, { title: "CS-101 local outcomes", courseId: C1 });
    assert.equal(status(() => O.createGroup(storeOf("demo"), d("student1", false).actor, { title: "x", courseId: C1 })), 403);
    assert.equal(status(() => O.createGroup(i.store, i.actor, { title: "account" })), 403);
    i.store.insert("outcomes", { code: "CS101.L1", title: "Course-only outcome", courseId: C1, groupId: g.id, masteryThreshold: 70 }, "out");
    assert.ok(O.outcomeTree(i.store, i.actor, C1).tree.groups.some((x) => (x as { title: string }).title === "CS-101 local outcomes"));
    assert.ok(!JSON.stringify(O.outcomeTree(a.store, a.actor, C2).tree).includes("Course-only outcome"));
    assert.ok(O.outcomesFor(a.store, C2).every((o) => o.code !== "CS101.L1"));
    // Results never include another course's outcomes.
    for (const r of outcomeResults(a.store, C2, "usr_demo_student1")) assert.notEqual(r.code, "CS101.L1");
  });

  it("scales validate ordering and the mastery level, and map percentages to ratings", () => {
    const a = d("admin");
    assert.equal(status(() => O.createScale(a.store, a.actor, { title: "x", ratings: [{ label: "Low", points: 1 }, { label: "High", points: 3 }], masteryPoints: 3 })), 422);
    assert.equal(status(() => O.createScale(a.store, a.actor, { title: "x", ratings: [{ label: "High", points: 3 }, { label: "Low", points: 1 }], masteryPoints: 2 })), 422);
    const s = { ratings: [{ label: "Exceeds", points: 4 }, { label: "Mastery", points: 3 }, { label: "Near", points: 2 }, { label: "Below", points: 1 }], masteryPoints: 3 };
    assert.deepEqual([O.ratingFor(s, 100).label, O.ratingFor(s, 80).label, O.ratingFor(s, 74).label, O.ratingFor(s, 10).label], ["Exceeds", "Mastery", "Near", "Below"]);
    assert.equal(O.ratingFor(s, 75).mastered, true);
    assert.equal(O.ratingFor(s, 60).mastered, false);
  });
});

describe("Terms: role access windows and grading-period sets", () => {
  it("an enforcing term blocks student submissions outside the student window; other roles follow their overrides", () => {
    const r = d("registrar");
    const term = r.store.get("courses", C1)!.termId as string;
    assert.equal(status(() => T.setRoleOverride(storeOf("demo"), d("instructor").actor, { termId: term, role: "student", endsAt: "2020-01-01" })), 403);
    assert.equal(status(() => T.setRoleOverride(r.store, r.actor, { termId: term, role: "student", startsAt: "2026-02-01", endsAt: "2026-01-01" })), 422);
    T.setRoleOverride(r.store, r.actor, { termId: term, role: "student", endsAt: "2020-01-01T00:00:00Z" });
    // Not enforced yet: nothing changes.
    assert.equal(T.accessWindow(r.store, C1, "student").source, "role override");
    assert.equal(T.accessWindow(r.store, C1, "instructor").source, "unrestricted for this role");
    const st = d("student1", false);
    T.setEnforcement(r.store, r.actor, term, true);
    assert.equal(status(() => asm.submit(st.store, st.actor, "asg_demo_hello", { mode: "text", body: "late" })), 423);
    T.setRoleOverride(r.store, r.actor, { termId: term, role: "student", endsAt: "2099-01-01T00:00:00Z" });
    assert.notEqual(status(() => asm.submit(st.store, st.actor, "asg_demo_hello", { mode: "text", body: "print('hi')" })), 423);
    T.setEnforcement(r.store, r.actor, term, false);
    const s = T.termAccessSummary(r.store, r.actor, term);
    assert.equal(s.roles.find((x) => x.role === "student")!.source, "override");
  });

  it("grading-period sets attach to terms; periods can't overlap; a course reads its term's set", () => {
    const r = d("registrar");
    const term = r.store.get("courses", C1)!.termId as string;
    const set = T.createPeriodSet(r.store, r.actor, { title: "Fall quarters", termIds: [term], weighted: true });
    assert.equal(status(() => T.createPeriodSet(r.store, r.actor, { title: "Other", termIds: [term] })), 409);
    T.addPeriodToSet(r.store, r.actor, { setId: set.id, name: "Q1", startsAt: "2026-08-01", endsAt: "2026-10-01", closeAt: "2026-10-08", weight: 50 });
    assert.equal(status(() => T.addPeriodToSet(r.store, r.actor, { setId: set.id, name: "Bad", startsAt: "2026-09-15", endsAt: "2026-11-01", closeAt: "2026-11-02" })), 409);
    T.addPeriodToSet(r.store, r.actor, { setId: set.id, name: "Q2", startsAt: "2026-10-01", endsAt: "2026-12-15", closeAt: "2026-12-20", weight: 50 });
    const p = T.periodsForCourse(r.store, C1);
    assert.equal(p.source, "term's set");
    assert.deepEqual(p.periods.map((x) => x.name), ["Q1", "Q2"]);
  });
});

describe("LTI app installs and placements", () => {
  it("account installs are inherited, a course can hide them, and the nearest install wins", () => {
    const a = d("admin");
    const tool = a.store.insert("tool_registrations", { name: "Synthetic Reading App", clientId: "syn-1", issuer: "https://reader.example", launchUrl: "https://reader.example/launch", services: ["deep_linking"], enabled: true }, "lti");
    const plain = a.store.insert("tool_registrations", { name: "Plain App", clientId: "syn-2", issuer: "https://plain.example", launchUrl: "https://plain.example/launch", services: [], enabled: true }, "lti");
    const acct = String(a.store.get("courses", C1)!.accountId);
    A.installTool(a.store, a.actor, { toolId: tool.id, scope: "account", accountId: acct, placements: [{ key: "course_navigation", label: "Readings" }, { key: "link_selection" }] });
    assert.equal(status(() => A.installTool(a.store, a.actor, { toolId: plain.id, scope: "account", accountId: acct, placements: [{ key: "assignment_selection" }] })), 422);
    assert.equal(status(() => A.installTool(storeOf("demo"), d("instructor").actor, { toolId: plain.id, scope: "account", accountId: acct, placements: [{ key: "course_navigation" }] })), 403);
    const st = d("student1", false);
    const nav = A.placementsFor(st.store, st.actor, { courseId: C1, placement: "course_navigation" });
    assert.equal(nav.apps[0].label, "Readings");
    assert.match(nav.apps[0].source, /^account:/);
    const i = d("instructor");
    A.installTool(i.store, i.actor, { toolId: tool.id, scope: "course", courseId: C1, placements: [{ key: "course_navigation", label: "Course readings" }] });
    assert.equal(A.placementsFor(st.store, st.actor, { courseId: C1, placement: "course_navigation" }).apps[0].source, "this course");
    A.setHiddenInCourse(i.store, i.actor, { toolId: tool.id, courseId: C1, hidden: true });
    assert.equal(A.placementsFor(st.store, st.actor, { courseId: C1, placement: "link_selection" }).apps.length, 0);
    A.setHiddenInCourse(i.store, i.actor, { toolId: tool.id, courseId: C1, hidden: false });
    assert.equal(A.placementsFor(st.store, st.actor, { courseId: C1, placement: "link_selection" }).apps.length, 1);
  });
});

/* ---------------- foreign package fixtures (synthetic) ---------------- */

function tar(files: { name: string; data: string }[]) {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const data = Buffer.from(f.data);
    const h = Buffer.alloc(512);
    h.write(f.name, 0, 100);
    h.write("0000644\0", 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write("0", 156);
    h.write("ustar\0", 257);
    h.write("00", 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const MOODLE = [
  { name: "moodle_backup.xml", data: `<?xml version="1.0"?><moodle_backup><information><original_course_fullname>Synthetic Python Basics</original_course_fullname><contents><activities><activity><moduleid>1</moduleid><modulename>page</modulename><title>Welcome</title><directory>activities/page_1</directory></activity><activity><moduleid>2</moduleid><modulename>quiz</modulename><title>Check-in quiz</title><directory>activities/quiz_2</directory></activity><activity><moduleid>3</moduleid><modulename>forum</modulename><title>Questions forum</title><directory>activities/forum_3</directory></activity></activities></contents></information></moodle_backup>` },
  { name: "activities/page_1/page.xml", data: `<activity><page id="1"><name>Welcome</name><content>&lt;p&gt;Welcome to Python basics.&lt;/p&gt;</content></page></activity>` },
  { name: "activities/quiz_2/quiz.xml", data: `<activity><quiz id="2"><name>Check-in quiz</name><question_instances><question_instance><questionid>10</questionid></question_instance><question_instance><questionid>11</questionid></question_instance><question_instance><questionid>12</questionid></question_instance></question_instances></quiz></activity>` },
  { name: "activities/forum_3/forum.xml", data: `<activity><forum id="3"><name>Questions forum</name></forum></activity>` },
  {
    name: "questions.xml",
    data: `<question_categories><question_category><questions>
<question id="10"><name>q1</name><questiontext>&lt;p&gt;Which keyword defines a function?&lt;/p&gt;</questiontext><qtype>multichoice</qtype><defaultmark>2</defaultmark><plugin_qtype_multichoice_question><answers><answer id="1"><answertext>def</answertext><fraction>1.0000000</fraction></answer><answer id="2"><answertext>func</answertext><fraction>0.0000000</fraction></answer></answers></plugin_qtype_multichoice_question></question>
<question id="11"><name>q2</name><questiontext>Python lists are mutable.</questiontext><qtype>truefalse</qtype><defaultmark>1</defaultmark><answers><answer id="3"><answertext>True</answertext><fraction>1.0000000</fraction></answer><answer id="4"><answertext>False</answertext><fraction>0.0000000</fraction></answer></answers></question>
<question id="12"><name>q3</name><questiontext>Drag the words into place.</questiontext><qtype>ddwtos</qtype><defaultmark>1</defaultmark></question>
</questions></question_category></question_categories>`,
  },
];

describe("Import from Moodle, Blackboard and D2L", () => {
  it("reads gzipped tar safely and refuses path traversal", () => {
    assert.equal(L.untar(gzipSync(Buffer.alloc(0)).length ? Buffer.alloc(1024) : Buffer.alloc(0)).length, 0);
    assert.throws(() => L.readArchive(tar([{ name: "../evil.txt", data: "x" }])), /Unsafe path/);
    assert.equal(L.detectPlatform(L.readArchive(tar(MOODLE))), "moodle");
  });

  it("converts a Moodle backup into pages and a quiz, reporting what it couldn't convert", () => {
    const i = d("instructor");
    const r = L.importForeignPackage(i.store, i.actor, C2, tar(MOODLE), { idempotencyKey: "moodle-1" });
    assert.equal(r.platform, "moodle");
    assert.deepEqual([r.converted!.pages, r.converted!.quizzes, r.converted!.questions], [1, 1, 2]);
    const issues = (r.job.issues as { message: string }[]).map((x) => x.message).join("\n");
    assert.match(issues, /ddwtos/);
    assert.match(issues, /forum/);
    const quiz = i.store.list("quizzes", (q) => q.courseId === C2 && q.title === "Check-in quiz")[0];
    const qs = i.store.list("questions", (q) => q.bankId === quiz.bankId);
    assert.equal(qs.find((q) => q.kind === "multiple_choice")!.answer, "def");
    assert.equal(qs.find((q) => q.kind === "true_false")!.answer, "True");
    assert.ok(i.store.list("pages", (p) => p.courseId === C2 && p.title === "Welcome").length);
    // Same key → same job, no duplicates.
    const again = L.importForeignPackage(i.store, i.actor, C2, tar(MOODLE), { idempotencyKey: "moodle-1" });
    assert.equal(again.job.id, r.job.id);
    assert.equal(i.store.list("quizzes", (q) => q.courseId === C2 && q.title === "Check-in quiz").length, 1);
  });

  it("converts Blackboard documents and tests, and quarantines executables", () => {
    const i = d("instructor");
    const manifest = `<?xml version="1.0"?><manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><resources><resource bb:file="res00001.dat" bb:title="Syllabus" identifier="res00001" type="resource/x-bb-document"/><resource bb:file="res00002.dat" bb:title="Week 1 test" identifier="res00002" type="assessment/x-bb-qti-test"/></resources></manifest>`;
    const doc = `<CONTENT><TITLE value="Syllabus"/><BODY><TEXT>&lt;p&gt;Course syllabus text.&lt;/p&gt;</TEXT></BODY></CONTENT>`;
    const test = `<questestinterop><assessment title="Week 1 test"><section><item><itemmetadata><bbmd_questiontype>Multiple Choice</bbmd_questiontype><qmd_absolutescore_max>5</qmd_absolutescore_max></itemmetadata><presentation><flow class="Block"><flow class="QUESTION_BLOCK"><flow class="FORMATTED_TEXT_BLOCK"><material><mat_extension><mat_formattedtext type="HTML">2 + 2 = ?</mat_formattedtext></mat_extension></material></flow></flow><flow class="RESPONSE_BLOCK"><response_lid ident="response"><render_choice><flow_label><response_label ident="a1"><flow_mat><material><mat_extension><mat_formattedtext type="HTML">3</mat_formattedtext></mat_extension></material></flow_mat></response_label><response_label ident="a2"><flow_mat><material><mat_extension><mat_formattedtext type="HTML">4</mat_formattedtext></mat_extension></material></flow_mat></response_label></flow_label></render_choice></response_lid></flow></flow></presentation><resprocessing><respcondition title="correct"><conditionvar><varequal respident="response">a2</varequal></conditionvar></respcondition></resprocessing></item><item><itemmetadata><bbmd_questiontype>Hot Spot</bbmd_questiontype></itemmetadata><presentation><flow class="Block"><flow class="QUESTION_BLOCK"><mat_formattedtext>Click the CPU</mat_formattedtext></flow></flow></presentation></item></section></assessment></questestinterop>`;
    const pkg = zip([
      { name: "imsmanifest.xml", data: Buffer.from(manifest) },
      { name: "res00001.dat", data: Buffer.from(doc) },
      { name: "res00002.dat", data: Buffer.from(test) },
      { name: "csfiles/setup.exe", data: Buffer.from("MZ") },
    ]);
    const r = L.importForeignPackage(i.store, i.actor, C2, pkg);
    assert.equal(r.platform, "blackboard");
    assert.deepEqual([r.converted!.pages, r.converted!.questions], [1, 1]);
    const issues = JSON.stringify(r.job.issues);
    assert.match(issues, /Hot Spot/);
    assert.match(issues, /Quarantined/);
    const quiz = i.store.list("quizzes", (q) => q.courseId === C2 && q.title === "Week 1 test")[0];
    assert.equal(i.store.list("questions", (q) => q.bankId === quiz.bankId)[0].answer, "4");
  });

  it("converts D2L content and quizzes", () => {
    const i = d("instructor");
    const manifest = `<?xml version="1.0"?><manifest xmlns:d2l_2p0="http://desire2learn.com/xsd/d2lcp_v2p0"><resources><resource identifier="r1" type="webcontent" href="Unit1/intro.html" d2l_2p0:title="Unit 1 intro"/><resource identifier="r2" type="webcontent" d2l_2p0:material_type="d2lquiz" href="quiz_d2l_1.xml" d2l_2p0:title="Unit 1 quiz"/></resources></manifest>`;
    const quiz = `<questestinterop><assessment title="Unit 1 quiz"><section><item><itemmetadata><qtimetadata><qti_metadatafield><fieldlabel>qmd_questiontype</fieldlabel><fieldentry>Multiple Choice</fieldentry></qti_metadatafield></qtimetadata></itemmetadata><presentation><material><mattext>Capital of Nigeria?</mattext></material><response_lid ident="L1"><render_choice><response_label ident="c1"><flow_mat><material><mattext>Lagos</mattext></material></flow_mat></response_label><response_label ident="c2"><flow_mat><material><mattext>Abuja</mattext></material></flow_mat></response_label></render_choice></response_lid></presentation><resprocessing><respcondition><conditionvar><varequal respident="L1">c2</varequal></conditionvar><setvar action="Set">100</setvar></respcondition></resprocessing></item></section></assessment></questestinterop>`;
    const pkg = zip([
      { name: "imsmanifest.xml", data: Buffer.from(manifest) },
      { name: "Unit1/intro.html", data: Buffer.from("<html><body><h1>Unit 1</h1><p>Read chapter 1.</p></body></html>") },
      { name: "quiz_d2l_1.xml", data: Buffer.from(quiz) },
    ]);
    const r = L.importForeignPackage(i.store, i.actor, C2, pkg);
    assert.equal(r.platform, "d2l");
    assert.deepEqual([r.converted!.pages, r.converted!.questions], [1, 1]);
    const q = i.store.list("quizzes", (x) => x.courseId === C2 && x.title === "Unit 1 quiz")[0];
    assert.equal(i.store.list("questions", (x) => x.bankId === q.bankId)[0].answer, "Abuja");
  });

  it("students can't import", () => {
    assert.equal(status(() => L.importForeignPackage(storeOf("demo"), d("student1", false).actor, C2, tar(MOODLE))), 403);
  });
});

describe("Registry invariants", () => {
  it("no entity declares the same field twice (base fields plus extensions)", async () => {
    const { ENTITIES } = await import("../src/campus/registry");
    for (const e of ENTITIES) {
      const names = e.fields.map((f) => f.name);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      assert.deepEqual(dup, [], `${e.table} repeats ${dup.join(", ")}`);
    }
  });
});
