import { broker, nowMs, relay, type Row, type Tenant, type TenantContext, type TenantStore } from "./core";
import { actorFor, createUser, type Actor } from "./iam";
import { renderBlocks, validateBlocks, type Block } from "./services/curriculum";
import { ensureAgents, ensureStandardTemplate } from "./services/ai";
import { ensureProctorDefaults } from "./services/proctor";
import { ensurePrograms } from "./services/programs";
import { ensureCloudLabTool } from "./services/lti";
import { issueCredential, rebuildIndex, recomputeSignals } from "./services/success";
import { setGrade } from "./services/grading";
import { snapshotQuiz } from "./services/assessment";

/**
 * Demo/staging seed. Two tenants, physically separate stores:
 *  - Scholarion Demo University (guest tenant)
 *  - TechDev Institution (internal tenant; Careers placement sync and live connectors on)
 * Everything here is fictional demo data. Payments are sandbox amounts only.
 */

export const DEMO_PASSWORD = "Scholarion-demo-1";
/** Fixed TOTP secret for seeded staff accounts (local/staging only). */
export const DEMO_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export const TENANTS: Omit<Tenant, "status" | "createdAt">[] = [
  {
    id: "tn_demo",
    slug: "demo",
    name: "Scholarion Demo University",
    kind: "guest",
    domains: [{ host: "demo.campus.scholarion.localhost", verified: true }],
    realm: { protocol: "oidc", issuer: "https://idp.scholarion.local/realms/demo", mfaRequiredForStaff: true, jit: false },
    theme: { primary: "#1f4e79", accent: "#c2410c", logoText: "Scholarion Demo University" },
    flags: { live_connectors: false, marketplace: true, ai_course_assistant: true, offline_mode: true },
  },
  {
    id: "tn_academy",
    slug: "academy",
    name: "Scholaris AI Academy",
    kind: "guest",
    domains: [{ host: "academy.campus.scholarion.localhost", verified: true }],
    realm: { protocol: "oidc", issuer: "https://idp.scholarion.local/realms/academy", mfaRequiredForStaff: true, jit: false },
    theme: { primary: "#4c1d95", accent: "#b45309", logoText: "Scholaris AI Academy" },
    flags: { commerce: true, marketplace: false, ai_course_assistant: true, offline_mode: true, powered_by: true, tutor_lang_en_ng: true, tutor_lang_pcm: true },
  },
  {
    id: "tn_techdev",
    slug: "techdev",
    name: "TechDev Institution",
    kind: "internal",
    domains: [{ host: "techdev.campus.scholarion.localhost", verified: true }],
    realm: { protocol: "saml", issuer: "https://idp.scholarion.local/realms/techdev", mfaRequiredForStaff: true, jit: true },
    theme: { primary: "#14532d", accent: "#1d4ed8", logoText: "TechDev Institution" },
    flags: { live_connectors: true, marketplace: false, ai_course_assistant: true, offline_mode: true },
  },
];

const DAY = 86400_000;
const iso = (offsetDays: number, hour = 12) => {
  const d = new Date(nowMs() + offsetDays * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export interface SeedUsers {
  admin: string;
  registrar: string;
  advisor: string;
  support: string;
  designer: string;
  instructor: string;
  instructor2: string;
  ta: string;
  observer: string;
  ops?: string;
  students: string[];
}

function blocksFor(title: string, paras: string[], extra: Block[] = []): Block[] {
  return validateBlocks([{ type: "heading", level: 2, text: title }, ...paras.map((p) => ({ type: "paragraph", text: p })), ...extra]);
}

function enrollViaSis(store: TenantStore, userId: string, section: Row) {
  const key = `seed:${userId}:${section.id}`;
  const reg = store.insert("registrations", { userId, sectionId: section.id, termId: section.termId, state: "registered", checks: [{ check: "seed", ok: true, message: "Demo enrollment" }], idempotencyKey: key }, "reg");
  store.emit("sis.enrollment.committed", `registrations/${reg.id}`, { registrationId: reg.id, userId, sectionId: section.id, courseId: section.courseId, role: "student" });
}

function seedTenant(t: Omit<Tenant, "status" | "createdAt">): SeedUsers {
  broker.provision(t);
  const ctx: TenantContext = { tenantId: t.id, slug: t.slug, via: "path", traceId: "seed" };
  const store = broker.connect(ctx);
  const dom = `${t.slug}.scholarion.test`;
  const pw = DEMO_PASSWORD;
  const mk = (key: string, name: string, roles: Parameters<typeof createUser>[1]["roles"] = [], mfa = false) => createUser(store, { id: `usr_${t.slug}_${key}`, name, email: `${key}@${dom}`, password: pw, roles, mfaSecret: mfa ? DEMO_MFA_SECRET : undefined }).id;

  const isDemo = t.kind === "guest";
  const u: SeedUsers = {
    admin: mk("admin", isDemo ? "Avery Admin" : "Morgan Admin", ["admin"], true),
    registrar: mk("registrar", "Riley Registrar", ["registrar"], true),
    advisor: mk("advisor", "Alex Advisor", ["advisor"]),
    support: mk("support", "Sam Support", ["support"], true),
    designer: mk("designer", "Dana Designer", ["designer"]),
    instructor: mk("instructor", isDemo ? "Dr. Imani Okafor" : "Prof. Jordan Lee", []),
    instructor2: mk("instructor2", isDemo ? "Prof. Tomás Rivera" : "Dr. Priya Shah", []),
    ta: mk("ta", "Taylor TA", []),
    observer: mk("parent", "Pat Guardian", []),
    students: ["Kofi Mensah", "Lena Fischer", "Mei Chen", "Omar Haddad", "Sofia Rossi", "Noah Williams"].map((n, i) => mk(`student${i + 1}`, n)),
  };
  if (!isDemo) {
    u.ops = mk("ops", "Platform Operations", ["admin"], true);
    broker.platform().operators.push(`${t.id}:${u.ops}`);
  }
  const [s1, s2, s3, s4, s5, s6] = u.students;

  store.insert("tenant_settings", { key: "tenant_type", value: "university" }, "ts");
  (broker.platform().meta ??= {})[t.id] = { type: isDemo ? "university" : "internal", region: "us-east", tier: "standard", limits: { learners: 30000, storageGb: 2000, aiRequestsPerDay: 30000 } };

  /* Accounts, terms, schemes */
  const root = store.insert("accounts", { id: `acc_${t.slug}_root`, name: t.name, parentId: null, defaultTimeZone: "UTC", quotaMb: 500 }, "acc");
  const school = store.insert("accounts", { id: `acc_${t.slug}_computing`, name: "School of Computing", parentId: root.id, quotaMb: 1000 }, "acc");
  const fall = store.insert("terms", { id: `trm_${t.slug}_fall`, name: "Fall 2026", startsAt: iso(-28, 0), endsAt: iso(70, 0), registrationOpens: iso(-90, 0), registrationCloses: iso(-30, 0), maxCredits: 18, sisId: "FA26" }, "trm");
  const spring = store.insert("terms", { id: `trm_${t.slug}_spring`, name: "Spring 2027", startsAt: iso(100, 0), endsAt: iso(200, 0), registrationOpens: iso(-7, 0), registrationCloses: iso(60, 0), maxCredits: 18, sisId: "SP27" }, "trm");
  const scheme = store.insert("grading_schemes", { name: "Standard letter", kind: "letter", bands: [{ label: "A", min: 90 }, { label: "B", min: 80 }, { label: "C", min: 70 }, { label: "D", min: 60 }, { label: "F", min: 0 }] }, "gsc");
  store.insert("grading_periods", { termId: fall.id, name: "Fall 2026", startsAt: fall.startsAt, endsAt: fall.endsAt, closeAt: iso(80, 0) }, "gp");

  /* Courses */
  const mkCourse = (key: string, code: string, title: string, desc: string, extra: Record<string, unknown> = {}) =>
    store.insert("courses", { id: `crs_${t.slug}_${key}`, code, title, description: desc, credits: 3, state: "published", publishedAt: iso(-30), accountId: school.id, termId: fall.id, homeType: "modules", gradingSchemeId: scheme.id, latePolicy: { latePctPerDay: 10, floorPct: 50, missingScorePct: 0 }, startAt: fall.startsAt, endAt: fall.endsAt, visibility: "course", format: "online", language: "en", sisId: code, ...extra }, "crs");
  const cs101 = mkCourse("cs101", "CS-101", "Foundations of Programming", "Variables, control flow, functions and testing in Python, with weekly Cloud Lab practice.");
  const data210 = mkCourse("data210", "DATA-210", "Data Analysis with Python", "Cleaning, summarizing and visualizing data responsibly.", { prerequisites: ["CS-101"] });
  const writ120 = mkCourse("writ120", "WRIT-120", "Academic Writing", "Argument, evidence and revision for university writing.");
  const cs102 = mkCourse("cs102", "CS-102", "Data Structures", "Lists, trees, hashing and complexity.", { termId: spring.id, state: "unpublished", publishedAt: null, startAt: spring.startsAt, endAt: spring.endsAt, prerequisites: ["CS-101"] });
  const bp = mkCourse("bp", "BP-CS", "Computing Blueprint", "Shared template for computing courses.", { isBlueprint: true, state: "unpublished", publishedAt: null, blueprintLocks: ["content", "points"] });
  for (const c of [cs101, data210, writ120, cs102]) store.insert("catalog_entries", { code: c.code, title: c.title, credits: 3, courseId: c.id, prerequisites: (c.prerequisites as string[]) ?? [] }, "cat");
  store.insert("academic_history", { userId: s1, code: "CS-101", termName: "Spring 2026", credits: 3, grade: "A" }, "ah");
  store.insert("academic_history", { userId: s1, code: "MATH-110", termName: "Spring 2026", credits: 3, grade: "B" }, "ah");
  store.insert("academic_history", { userId: s2, code: "CS-101", termName: "Spring 2026", credits: 3, grade: "B" }, "ah");

  const sec = (c: Row, code: string, instructorId: string, meeting: string, termId = fall.id, capacity = 30) => {
    const s = store.insert("sections", { id: `sec_${t.slug}_${String(c.code).toLowerCase().replace(/-/g, "")}_${code.toLowerCase()}`, courseId: c.id, code, termId, capacity, meetingPattern: meeting, instructorId, sisId: `${c.code}-${code}` }, "sec");
    store.emit("sections.created", `sections/${s.id}`, { id: s.id, courseId: c.id });
    return s;
  };
  const cs101a = sec(cs101, "A", u.instructor, "Mon/Wed 10:00-11:15");
  const cs101b = sec(cs101, "B", u.instructor, "Tue/Thu 14:00-15:15");
  const dataA = sec(data210, "A", u.instructor2, "Tue/Thu 10:00-11:15");
  const writA = sec(writ120, "A", u.instructor2, "Fri 09:00-11:45");
  sec(cs102, "A", u.instructor, "Mon/Wed 10:00-11:15", spring.id, 2);
  for (const s of [s1, s2, s3, s4]) enrollViaSis(store, s, cs101a);
  for (const s of [s5, s6]) enrollViaSis(store, s, cs101b);
  for (const s of [s1, s2, s5]) enrollViaSis(store, s, dataA);
  for (const s of [s2, s3, s4, s6]) enrollViaSis(store, s, writA);
  relay(store);
  store.insert("enrollments", { userId: u.ta, courseId: cs101.id, sectionId: cs101a.id, role: "ta", state: "active", source: "manual" }, "enr");
  store.insert("enrollments", { userId: u.designer, courseId: bp.id, role: "designer", state: "active", source: "manual" }, "enr");
  store.insert("enrollments", { userId: u.instructor, courseId: cs102.id, role: "instructor", state: "active", source: "manual" }, "enr");

  /* CS-101 content */
  const cid = cs101.id;
  const groups = {
    asg: store.insert("assignment_groups", { courseId: cid, name: "Assignments", weight: 40, dropLowest: 0 }, "ag").id,
    quiz: store.insert("assignment_groups", { courseId: cid, name: "Quizzes", weight: 30, dropLowest: 1 }, "ag").id,
    lab: store.insert("assignment_groups", { courseId: cid, name: "Labs", weight: 30 }, "ag").id,
  };
  const outcome = store.insert("outcomes", { code: "CS.1", title: "Write and test small programs", description: "Writes correct, readable programs with tests.", masteryThreshold: 3, framework: "Program outcomes", calculationMethod: "decaying_average" }, "out");
  store.insert("outcomes", { code: "CS.2", title: "Explain program behavior", masteryThreshold: 3, framework: "Program outcomes", calculationMethod: "highest" }, "out");
  const rubric = store.insert("rubrics", { title: "Programming assignment rubric", courseId: cid, style: "analytic", state: "published", version: 1, useForGrading: true, criteria: [
    { id: "correct", name: "Correctness", outcomeId: outcome.id, bands: [{ label: "Exemplary", points: 6 }, { label: "Proficient", points: 4 }, { label: "Developing", points: 2 }, { label: "Missing", points: 0 }] },
    { id: "style", name: "Readability", bands: [{ label: "Clear", points: 4 }, { label: "Mostly clear", points: 2 }, { label: "Unclear", points: 0 }] },
  ] }, "rb");
  store.insert("outcome_alignments", { outcomeId: outcome.id, targetType: "rubric_criterion", targetId: `${rubric.id}:correct` }, "oa");

  const mod = (n: number, title: string, extra: Record<string, unknown> = {}) => store.insert("modules", { id: `mod_${t.slug}_cs101_${n}`, courseId: cid, title, position: n, week: n, state: "published", requireAll: true, ...extra }, "mod");
  const m1 = mod(1, "Week 1: Getting started");
  const m2 = mod(2, "Week 2: Decisions and loops", { prerequisiteModuleIds: [m1.id], sequential: true });
  const m3 = mod(3, "Week 3: Functions", { prerequisiteModuleIds: [m2.id], unlockAt: iso(10, 0) });
  let pos = 0;
  const item = (m: Row, kind: string, refId: string | null, title: string, requirement = "none", extra: Record<string, unknown> = {}) => store.insert("module_items", { courseId: cid, moduleId: m.id, kind, refId, title, position: ++pos, indent: 0, requirement, state: "published", ...extra }, "mi");
  const page = (m: Row, key: string, title: string, paras: string[], extra: Block[] = [], front = false) => {
    const blocks = blocksFor(title, paras, extra);
    return store.insert("pages", { id: `pg_${t.slug}_${key}`, courseId: cid, moduleId: m.id, title, blocks, html: renderBlocks(store, blocks, cid), position: 1, state: "published", frontPage: front, editingRoles: "teachers" }, "pg");
  };
  const welcome = page(m1, "welcome", "Welcome to CS-101", ["This course teaches you to write, test and explain small Python programs.", "Each week has a reading, a practice lab in the Cloud Lab, and a short quiz. Variables store values; a variable name refers to a value in memory."], [{ type: "list", items: ["Read the weekly overview", "Try the lab", "Take the quiz"] }], true);
  item(m1, "page", welcome.id, welcome.title as string, "view");
  const vars = page(m1, "variables", "Variables and types", ["A variable is a name bound to a value. Python has integers, floats, strings and booleans.", "Use the type() function to check a value's type. Assignment uses a single equals sign."], [{ type: "code", lang: "python", text: "age = 21\nname = \"Ada\"\nprint(type(age))" }]);
  item(m1, "page", vars.id, vars.title as string, "view");
  const a1 = store.insert("assignments", { id: `asg_${t.slug}_hello`, courseId: cid, moduleId: m1.id, title: "Hello, program", instructions: "Write a program that asks for your name and greets you. Explain each line in a sentence.", points: 10, groupId: groups.asg, dueAt: iso(-14, 23), submissionTypes: ["text", "file"], rubricId: rubric.id, state: "published", gradingType: "points", outcomeIds: [outcome.id] }, "asg");
  item(m1, "assignment", a1.id, a1.title as string, "submit");
  const bank = store.insert("question_banks", { id: `qb_${t.slug}_w1`, courseId: cid, title: "Week 1 bank" }, "qb");
  const q = (kind: string, prompt: string, extra: Record<string, unknown>) => store.insert("questions", { courseId: cid, bankId: bank.id, kind, prompt, points: 1, tags: ["week1"], version: 1, ...extra }, "qn");
  q("multiple_choice", "Which of these is a valid variable name?", { choices: ["2fast", "my_score", "class", "my-score"], answer: "my_score" });
  q("true_false", "In Python, = compares two values.", { answer: "False" });
  q("numeric", "What does 7 // 2 evaluate to?", { config: { exact: 3, margin: 0 }, answer: "3" });
  q("fill_blank", "The built-in function that shows a value's type is ____.", { answer: "type", config: { accepted: ["type", "type()"] } });
  q("essay", "In two sentences, explain what a variable is.", { points: 2 });
  const quiz1 = store.insert("quizzes", { id: `qz_${t.slug}_w1`, courseId: cid, moduleId: m1.id, title: "Week 1 quiz", bankId: bank.id, questionCount: 5, timeLimitMin: 20, allowedAttempts: 2, points: 6, groupId: groups.quiz, availableFrom: iso(-21, 0), availableUntil: iso(30, 0), kind: "graded", scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, state: "published" }, "qz");
  item(m1, "quiz", quiz1.id, quiz1.title as string, "submit");
  snapshotQuiz(store, quiz1.id);
  const proctoredQuiz = store.insert("quizzes", { id: `qz_${t.slug}_proctored`, courseId: cid, title: "Proctored check-in (practice)", bankId: bank.id, questionCount: 3, timeLimitMin: 15, allowedAttempts: 3, points: 0, availableFrom: iso(-7, 0), availableUntil: iso(30, 0), kind: "practice", proctored: true, scoringPolicy: "highest", shuffleAnswers: true, showResponses: true, state: "published" }, "qz");
  snapshotQuiz(store, proctoredQuiz.id);
  const loops = page(m2, "loops", "Decisions and loops", ["An if statement runs code only when a condition is true. A for loop repeats code for each item in a sequence.", "A while loop repeats while its condition stays true — make sure the condition eventually becomes false."]);
  item(m2, "page", loops.id, loops.title as string, "view");
  const lab = store.insert("lab_templates", { id: `lt_${t.slug}_sum`, title: "Sum of evens", kind: "python", instructions: "Write sum_evens(n) that returns the sum of even numbers from 0 to n inclusive.", starterCode: "def sum_evens(n):\n    # your code here\n    return 0\n", tests: [{ name: "small", code: "assert sum_evens(4) == 6", points: 5 }, { name: "zero", code: "assert sum_evens(0) == 0", points: 2 }, { name: "odd bound", code: "assert sum_evens(7) == 12", points: 3 }], maxScore: 10 }, "lt");
  const labAsg = store.insert("assignments", { id: `asg_${t.slug}_lab1`, courseId: cid, moduleId: m2.id, title: "Lab 1: Sum of evens", instructions: "Open the Cloud Lab, solve the task and submit. Your score is passed back for your instructor to review.", points: 10, groupId: groups.lab, dueAt: iso(5, 23), submissionTypes: ["lti"], labTemplateId: lab.id, state: "published", gradingType: "points" }, "asg");
  item(m2, "assignment", labAsg.id, labAsg.title as string, "submit");
  const a2 = store.insert("assignments", { id: `asg_${t.slug}_loops`, courseId: cid, moduleId: m2.id, title: "Loop practice", instructions: "Write three loops: count up, count down and sum a list. Submit your code as text.", points: 10, groupId: groups.asg, dueAt: iso(3, 23), submissionTypes: ["text"], state: "published", gradingType: "points" }, "asg");
  item(m2, "assignment", a2.id, a2.title as string, "submit");
  const topic = store.insert("discussion_topics", { id: `dt_${t.slug}_intro`, courseId: cid, moduleId: m1.id, title: "Introduce yourself", prompt: "Share your name, what you want to build, and one question about programming. Reply to two classmates.", kind: "threaded", allowLiking: true, state: "published" }, "dt");
  item(m1, "discussion", topic.id, topic.title as string, "contribute");
  const fn = page(m3, "functions", "Functions", ["A function groups steps under a name so you can reuse them. Parameters are the inputs; return sends a value back."]);
  item(m3, "page", fn.id, fn.title as string, "view");
  store.insert("posts", { topicId: topic.id, courseId: cid, authorId: s1, body: "Hi! I'm Kofi. I want to build a budgeting app. How do I read a CSV file?", parentId: null, likes: [], edits: [], mentions: [] }, "pst");
  store.insert("posts", { topicId: topic.id, courseId: cid, authorId: s2, body: "Hello, I'm Lena — interested in data visualization.", parentId: null, likes: [s1], edits: [], mentions: [] }, "pst");
  store.insert("announcements", { courseId: cid, title: "Welcome to CS-101", body: "Start with the Week 1 module. Office hours are Wednesdays 13:00–14:00 — book a slot in the Scheduler.", state: "published", publishAt: iso(-28), allowReplies: true, readBy: [s1] }, "ann");
  store.insert("announcements", { courseId: cid, title: "Lab 1 is open", body: "Lab 1 runs in the Cloud Lab. Your score goes to the gradebook for review before it's released.", state: "published", publishAt: iso(-2), readBy: [] }, "ann");
  store.insert("announcements", { courseId: cid, title: "Week 3 preview", body: "Functions next week.", state: "scheduled", publishAt: iso(6), readBy: [] }, "ann");
  store.insert("posting_policies", { courseId: cid, mode: "automatic" }, "pp");
  store.insert("reading_items", { courseId: cid, title: "Think Python (3rd ed.), chapters 1–3", citation: "Downey, A. Think Python. Open textbook.", url: "https://greenteapress.com/wp/think-python-3rd-edition/", required: true, moduleId: m1.id, accessible: true }, "rd");
  store.insert("comment_library", { text: "Great start — add a test for the edge case.", ownerId: u.instructor }, "cl");
  const gs = store.insert("group_sets", { courseId: cid, name: "Project teams", selfSignup: true, maxSize: 3, bySection: false }, "gs");
  store.insert("groups", { courseId: cid, setId: gs.id, name: "Team Ada", memberIds: [s1, s2], maxSize: 3 }, "grp");
  store.insert("groups", { courseId: cid, setId: gs.id, name: "Team Grace", memberIds: [s3], maxSize: 3 }, "grp");
  store.insert("calendar_events", { title: "CS-101 study session", startsAt: iso(2, 17), endsAt: iso(2, 18), courseId: cid, recurrence: "weekly", recurUntil: iso(40).slice(0, 10) }, "ev");
  const ag = store.insert("appointment_groups", { courseId: cid, title: "Office hours", location: "Online", limitPerSlot: 1 }, "apg");
  for (let i = 0; i < 4; i++) store.insert("appointment_slots", { courseId: cid, groupId: ag.id, startsAt: iso(2 + i, 13), endsAt: new Date(Date.parse(iso(2 + i, 13)) + 30 * 60_000).toISOString(), attendeeIds: [] }, "aps");
  store.insert("accommodations", { userId: s2, kind: "extra_time", multiplier: 1.5, courseId: null }, "acm");
  store.insert("accommodations", { userId: s2, kind: "deadline_extension", days: 2, courseId: cid }, "acm");
  store.insert("conversations", { courseId: cid, subject: "Lab 1 tips", participantIds: [u.instructor, s1, s2, s3, s4], messages: [{ id: "m1", authorId: u.instructor, body: "Remember: range(0, n + 1, 2) gives the even numbers up to n.", at: iso(-1), attachments: [], mediaUrl: null }], state: { [u.instructor]: { folder: "sent", read: true }, ...Object.fromEntries([s1, s2, s3, s4].map((x) => [x, { folder: "inbox", read: false }])) } }, "cv");

  /* Submissions & grades */
  store.insert("submissions", { createdAt: iso(-15), assignmentId: a1.id, userId: s1, courseId: cid, mode: "text", body: "name = input('Name? ')\nprint('Hello, ' + name)\nThe first line asks for a name; the second greets the person.", attempt: 1, state: "submitted", late: false, groupId: null, groupMemberIds: [s1] }, "sub");
  store.insert("submissions", { createdAt: iso(-13), assignmentId: a1.id, userId: s2, courseId: cid, mode: "text", body: "print('Hello')", attempt: 1, state: "submitted", late: true, groupId: null, groupMemberIds: [s2] }, "sub");
  store.insert("submissions", { createdAt: iso(-15), assignmentId: a1.id, userId: s4, courseId: cid, mode: "text", body: "n = input()\nprint(f'Hi {n}')", attempt: 1, state: "submitted", late: false, groupId: null, groupMemberIds: [s4] }, "sub");
  const grader = actorFor(store, u.instructor, true);
  setGrade(store, grader, { assignmentId: a1.id, userId: s1, score: 9, source: "manual", comment: "Clear explanation of each line. Nice work." });
  setGrade(store, grader, { assignmentId: a1.id, userId: s4, score: 6, source: "manual" });

  /* SIS: admissions, holds, finance */
  const app1 = store.insert("applicants", { name: "Jamie Applicant", email: `jamie@applicants.${dom}` }, "apc");
  const ap = store.insert("applications", { applicantId: app1.id, program: "BSc Computing", termId: spring.id, state: "submitted" }, "apl");
  for (const k of ["transcript", "id", "statement"]) store.insert("admission_documents", { applicationId: ap.id, kind: k, verified: k !== "statement" }, "adoc");
  const app2 = store.insert("applicants", { name: "Rowan Prospect", email: `rowan@applicants.${dom}` }, "apc");
  store.insert("applications", { applicantId: app2.id, program: "BSc Data Science", termId: spring.id, state: "submitted" }, "apl");
  store.insert("holds", { userId: s6, kind: "advising", reason: "Meet your advisor before registering for Spring.", active: true, blocksRegistration: true }, "hld");
  store.insert("charges", { userId: s1, description: "Fall 2026 tuition (sandbox)", amount: 900, dueAt: iso(10, 0), termId: fall.id }, "chg");
  store.insert("aid_awards", { userId: s1, kind: "grant", amount: 400, termId: fall.id, state: "offered" }, "aid");
  store.insert("charges", { userId: s3, description: "Fall 2026 tuition (sandbox)", amount: 900, dueAt: iso(-5, 0), termId: fall.id }, "chg");

  /* Success, credentials, privacy */
  const c1 = store.insert("advising_cases", { studentId: s3, advisorId: u.advisor, summary: "Missed early work in CS-101; check in about workload.", status: "open" }, "adv");
  store.insert("advising_notes", { caseId: c1.id, body: "Student reports a heavy work schedule. Agreed on a weekly plan.", authorId: u.advisor, shared: false }, "adn");
  store.insert("referrals", { caseId: c1.id, service: "tutoring", status: "sent" }, "ref");
  const sv = store.insert("surveys", { title: "CS-101 mid-term course evaluation", courseId: cid, questions: [{ id: "q1", kind: "likert", text: "The course materials helped me learn." }, { id: "q2", kind: "likert", text: "Feedback was timely." }, { id: "q3", kind: "text", text: "What should we keep doing?" }], minResponses: 3, state: "published" }, "svy");
  store.insert("evaluation_windows", { surveyId: sv.id, label: "Mid-term", opensAt: iso(-3, 0), closesAt: iso(7, 0) }, "evw");
  store.insert("consents", { studentId: s1, observerId: u.observer, purpose: "grade_summary" }, "cns");
  store.insert("observer_links", { observerId: u.observer, studentId: s1, alertGradeBelow: 70, alertMissing: true, alertAnnouncements: false }, "obl");
  store.insert("enrollments", { userId: u.observer, courseId: cid, sectionId: cs101a.id, role: "observer", state: "active", source: "pairing", observingId: s1 }, "enr");
  store.insert("retention_policies", { table: "learning_events", days: 730, action: "anonymize" }, "rp");
  store.insert("retention_policies", { table: "login_failures", days: 30, action: "tombstone" }, "rp");
  store.insert("notification_templates", { eventType: "grades.posted", subject: "New grade in {course}", body: "A grade was posted for {item}. Open {link} to see it." }, "ntp");
  store.insert("notification_templates", { eventType: "announcements.published", subject: "{course}: {title}", body: "{body}" }, "ntp");

  /* Help desk, marketplace, ops */
  for (const [title, body] of [
    ["Reset your password", "Use 'Forgot password' on the sign-in page. Staff accounts also need a two-step code from your authenticator app."],
    ["How registration holds work", "A hold blocks registration until the office that placed it clears it. Your registration page shows who to contact."],
    ["Submitting a Cloud Lab assignment", "Open the lab from the module, run the tests, then Submit. Scores reach the gradebook for your instructor to release."],
  ]) store.insert("kb_articles", { title, body, tags: ["help"], state: "published" }, "kb");
  const tk = store.insert("tickets", { requesterId: s2, subject: "Can't log in on my phone", body: "The sign in code from my authenticator app isn't accepted.", category: "other", tier: "1", status: "open" }, "tkt");
  store.emit("tickets.created", `tickets/${tk.id}`, { id: tk.id });
  store.insert("listings", { name: "Open Textbook Pack: Intro Python", kind: "content_pack", vendor: "Demo Open Content (fictional)", description: "Three openly licensed readings with practice questions.", reviewed: true, package: {} }, "lst");
  store.insert("listings", { name: "Peer Code Review Tool", kind: "lti_tool", vendor: "Demo Tools Ltd (fictional)", description: "Structured peer review of code submissions (LTI 1.3).", reviewed: true, issuer: "https://tools.example.test", launchUrl: "https://tools.example.test/launch" }, "lst");
  if (!isDemo) {
    store.insert("incidents", { title: "Delayed notification delivery (staging)", severity: "sev3", status: "resolved", summary: "Digest job paused for 20 minutes during a deploy; backlog drained automatically." }, "inc");
    store.insert("connector_consents", { provider: "zoom", grantedBy: u.admin, scope: "meetings, attendance reports", revokedAt: null }, "cc");
    store.insert("live_sessions", { courseId: cid, sectionId: cs101a.id, title: "Live review: loops", startsAt: iso(1, 15), minutes: 50, provider: "zoom", joinUrl: `https://live.scholarion.local/zoom/ls_seed_${t.slug}`, meetingOwnerId: u.instructor, recordingRetentionDays: 30, recordings: [] }, "ls");
    const opp = store.insert("opportunities", { title: "Junior QA intern (internal placement)", employer: "TechDev Labs (internal)", kind: "internship", location: "Hybrid" }, "opp");
    store.insert("placement_profiles", { userId: s1, headline: "CS student, Python and testing", seeking: "internship", consentToShare: true, skills: ["python", "testing"] }, "plp");
    store.insert("internships", { userId: s1, opportunityId: opp.id, status: "applied" }, "int");
  }

  /* Blueprint content */
  const bpm = store.insert("modules", { courseId: bp.id, title: "Orientation", position: 1, state: "published", requireAll: true }, "mod");
  const bpBlocks = blocksFor("Academic integrity", ["Work you submit must be your own. Cite sources and tools you used, including AI assistants where allowed."]);
  store.insert("pages", { courseId: bp.id, moduleId: bpm.id, title: "Academic integrity", blocks: bpBlocks, html: renderBlocks(store, bpBlocks, bp.id), position: 1, state: "published", blueprintLocked: true }, "pg");

  /* AI, labs, tools */
  ensureAgents(store);
  ensureProctorDefaults(store);
  ensureStandardTemplate(store);
  ensureCloudLabTool(store);
  store.insert("role_templates", { name: "Course designer bundle", roles: ["designer"] }, "rt");
  store.insert("custom_roles", { key: "grading_assistant", label: "Grading assistant", baseRole: "ta" }, "cr");
  store.insert("global_announcements", { title: "Staging environment", body: "This is a demonstration site with fictional data. Payments are sandbox only.", roles: [], startsAt: iso(-30), endsAt: iso(365), dismissedBy: [] }, "gan");

  relay(store);
  const admin: Actor = actorFor(store, u.admin, true);
  issueCredential(store, admin, { userId: s1, title: "CS-101 Foundations of Programming — completion (Spring 2026)", kind: "certificate" });
  recomputeSignals(store, null);
  rebuildIndex(store, admin);
  relay(store);
  broker.persist(t.id);
  return u;
}

let seeded: Record<string, SeedUsers> | null = null;

/** Seed both tenants once per process (or reuse persisted stores). */
export function ensureCampusSeed(): Record<string, SeedUsers> {
  if (seeded && broker.tenants().length) return seeded;
  seeded = {};
  for (const t of TENANTS) {
    if (broker.tenant(t.id)) {
      seeded[t.slug] = usersFor(t.slug);
      continue;
    }
    seeded[t.slug] = t.id === "tn_academy" ? seedAcademy(t) : seedTenant(t);
  }
  return seeded;
}

/** Scholaris AI Academy: catalog-first tenant with programs, pathways, cohorts and sandbox commerce. */
function seedAcademy(t: Omit<Tenant, "status" | "createdAt">): SeedUsers {
  broker.provision(t);
  const store = broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: "seed" });
  const dom = `${t.slug}.scholarion.test`;
  const mk = (key: string, name: string, roles: Parameters<typeof createUser>[1]["roles"] = [], mfa = false) => createUser(store, { id: `usr_${t.slug}_${key}`, name, email: `${key}@${dom}`, password: DEMO_PASSWORD, roles, mfaSecret: mfa ? DEMO_MFA_SECRET : undefined }).id;
  const u: SeedUsers = {
    admin: mk("admin", "Ada Academy-Admin", ["admin"], true),
    registrar: mk("registrar", "Remi Records", ["registrar"], true),
    advisor: mk("advisor", "Ayo Advisor", ["advisor"]),
    support: mk("support", "Sade Support", ["support"], true),
    designer: mk("designer", "Dayo Designer", ["designer"]),
    instructor: mk("instructor", "Dr. Ngozi Adeyemi", []),
    instructor2: mk("instructor2", "Prof. Ravi Menon", []),
    ta: mk("ta", "Tola TA", []),
    observer: mk("parent", "Femi Sponsor", []),
    students: ["Chidi Okeke", "Aisha Bello", "Kemi Lawal", "Jonas Berg", "Priya Nair", "Diego Santos"].map((n, i) => mk(`student${i + 1}`, n)),
  };
  store.insert("tenant_settings", { key: "tenant_type", value: "academy" }, "ts");
  (broker.platform().meta ??= {})[t.id] = { type: "academy", region: "af-west", tier: "standard", limits: { learners: 50000, storageGb: 500, aiRequestsPerDay: 50000 } };
  const root = store.insert("accounts", { id: `acc_${t.slug}_root`, name: t.name, parentId: null, defaultTimeZone: "Africa/Lagos", quotaMb: 1000 }, "acc");
  const scheme = store.insert("grading_schemes", { name: "Pass mark", kind: "letter", bands: [{ label: "Distinction", min: 85 }, { label: "Pass", min: 70 }, { label: "Not yet", min: 0 }] }, "gsc");

  const mkCourse = (key: string, code: string, title: string, desc: string, extra: Record<string, unknown> = {}) => store.insert("courses", { id: `crs_${t.slug}_${key}`, code, title, description: desc, credits: 0, state: "published", publishedAt: iso(-60), accountId: root.id, homeType: "modules", gradingSchemeId: scheme.id, latePolicy: { latePctPerDay: 0, floorPct: 0, missingScorePct: 0 }, visibility: "course", format: "online", language: "en", ...extra }, "crs");
  const c32 = mkCourse("p32", "#32", "Applied Machine Learning with Python", "Build, evaluate and explain supervised learning models in Python.");
  const c15 = mkCourse("p15", "#15", "Deep Learning Live Intensive", "Neural networks and PyTorch in a live cohort.", { format: "live" });
  const c1 = mkCourse("p01", "#1-R", "Python & Tooling Refresher", "Python, data structures, notebooks and Git for AI work (the optional Week 0 of Program #1, also sold on its own).");
  for (const [c, inst] of [[c32, u.instructor], [c15, u.instructor2], [c1, u.instructor]] as const) store.insert("enrollments", { userId: inst, courseId: c.id, role: "instructor", state: "active", source: "manual" }, "enr");
  store.insert("enrollments", { userId: u.ta, courseId: c32.id, role: "ta", state: "active", source: "manual" }, "enr");

  const tpl = store.insert("credential_templates", { name: "Short Course skill badge", kind: "skill_badge", wording: "Completed the Short Course and passed the capstone project.", gradeThreshold: 70, requiresCapstone: true, approvalRequired: false, state: "published" }, "ctpl");

  // #32 content
  let pos = 0;
  const grp = store.insert("assignment_groups", { courseId: c32.id, name: "Labs and project", weight: 100 }, "ag");
  const page = (c: Row, m: Row, key: string, title: string, paras: string[]) => {
    const blocks = blocksFor(title, paras);
    return store.insert("pages", { id: `pg_${t.slug}_${key}`, courseId: c.id, moduleId: m.id, title, blocks, html: renderBlocks(store, blocks, c.id), position: 1, state: "published" }, "pg");
  };
  const item = (c: Row, m: Row, kind: string, refId: string, title: string, requirement: string) => store.insert("module_items", { courseId: c.id, moduleId: m.id, kind, refId, title, position: ++pos, indent: 0, requirement, state: "published" }, "mi");
  const m321 = store.insert("modules", { id: `mod_${t.slug}_p32_1`, courseId: c32.id, title: "Data and models", position: 1, moduleKey: "ml-m1", state: "published", requireAll: true }, "mod");
  const m322 = store.insert("modules", { id: `mod_${t.slug}_p32_2`, courseId: c32.id, title: "Training and evaluation", position: 2, moduleKey: "ml-m2", state: "published", requireAll: true, prerequisiteModuleIds: [m321.id] }, "mod");
  const m323 = store.insert("modules", { id: `mod_${t.slug}_p32_3`, courseId: c32.id, title: "Capstone", position: 3, moduleKey: "ml-m3", state: "published", requireAll: true, prerequisiteModuleIds: [m322.id] }, "mod");
  const p1 = page(c32, m321, "p32_overfit", "Overfitting and generalization", ["Overfitting happens when a model learns noise in the training data and performs worse on new data.", "Use a held-out validation set and cross-validation to estimate how well a model generalizes. Regularization and simpler models reduce overfitting."]);
  item(c32, m321, "page", p1.id, p1.title as string, "view");
  const p2 = page(c32, m322, "p32_metrics", "Evaluation metrics", ["Accuracy is the share of correct predictions. Precision and recall matter when classes are imbalanced.", "A confusion matrix shows true positives, false positives, true negatives and false negatives."]);
  item(c32, m322, "page", p2.id, p2.title as string, "view");
  const lab32 = store.insert("lab_templates", { id: `lt_${t.slug}_acc`, title: "Accuracy from a confusion matrix", kind: "python", image: "scholarion/lab-python:3.12-slim (pinned)", instructions: "Write accuracy(tp, fp, tn, fn) returning the share of correct predictions (0 when there are no predictions).", starterCode: "def accuracy(tp, fp, tn, fn):\n    # TODO\n    return 0\n", tests: [{ name: "basic", code: "assert abs(accuracy(5,0,5,0)-1.0)<1e-9", points: 4 }, { name: "mixed", code: "assert abs(accuracy(3,1,4,2)-0.7)<1e-9", points: 4 }, { name: "empty", code: "assert accuracy(0,0,0,0)==0", points: 2 }], maxScore: 10, egressAllowlist: [], cpuSeconds: 5, memoryMb: 512, idleMinutes: 30 }, "lt");
  const a321 = store.insert("assignments", { id: `asg_${t.slug}_p32_lab`, courseId: c32.id, moduleId: m322.id, title: "Lab: accuracy", instructions: "Open the Cloud Lab and complete the function.", points: 10, groupId: grp.id, submissionTypes: ["lti"], labTemplateId: lab32.id, state: "published", gradingType: "points" }, "asg");
  item(c32, m322, "assignment", a321.id, a321.title as string, "submit");
  const cap = store.insert("assignments", { id: `asg_${t.slug}_p32_capstone`, courseId: c32.id, moduleId: m323.id, title: "Capstone: model report", instructions: "Train a model on the provided dataset and write a one-page report on its performance and limits.", points: 20, groupId: grp.id, submissionTypes: ["text"], state: "published", gradingType: "points" }, "asg");
  item(c32, m323, "assignment", cap.id, cap.title as string, "submit");

  // #15 content (a PyTorch-style lab that runs on the CPU runner without the torch package)
  const m151 = store.insert("modules", { id: `mod_${t.slug}_p15_1`, courseId: c15.id, title: "Foundations of neural networks", position: 1, moduleKey: "dl-m1", state: "published", requireAll: true }, "mod");
  const m152 = store.insert("modules", { id: `mod_${t.slug}_p15_2`, courseId: c15.id, title: "PyTorch tensors and layers", position: 2, moduleKey: "dl-m2", state: "published", requireAll: true, prerequisiteModuleIds: [m151.id] }, "mod");
  const p3 = page(c15, m151, "p15_neurons", "Neurons, layers and activation", ["A neural network stacks layers of weighted sums followed by non-linear activation functions such as ReLU.", "Training adjusts the weights with gradient descent to reduce a loss function."]);
  item(c15, m151, "page", p3.id, p3.title as string, "view");
  const lab15 = store.insert("lab_templates", { id: `lt_${t.slug}_conv`, title: "Conv2d output size (PyTorch lab)", kind: "pytorch", gpu: false, image: "scholarion/lab-pytorch:2.4.1-cpu (pinned; GPU pool planned)", instructions: "Write conv_out(size, kernel, stride=1, padding=0) returning the output width of a Conv2d layer, as PyTorch computes it.", starterCode: "def conv_out(size, kernel, stride=1, padding=0):\n    # TODO\n    return size\n", tests: [{ name: "same", code: "assert conv_out(28,3,1,1)==28", points: 4 }, { name: "valid", code: "assert conv_out(28,5)==24", points: 3 }, { name: "stride", code: "assert conv_out(32,3,2,1)==16", points: 3 }], maxScore: 10, egressAllowlist: ["pypi.org"], cpuSeconds: 5, memoryMb: 1024, idleMinutes: 30 }, "lt");
  const grp15 = store.insert("assignment_groups", { courseId: c15.id, name: "Labs", weight: 100 }, "ag");
  const a151 = store.insert("assignments", { id: `asg_${t.slug}_p15_lab`, courseId: c15.id, moduleId: m152.id, title: "PyTorch lab: Conv2d output size", instructions: "Open the Cloud Lab. Your score is passed back unposted for the instructor to post.", points: 10, groupId: grp15.id, submissionTypes: ["lti"], labTemplateId: lab15.id, state: "published", gradingType: "points" }, "asg");
  item(c15, m152, "assignment", a151.id, a151.title as string, "submit");
  store.insert("posting_policies", { courseId: c15.id, mode: "manual" }, "pp");
  store.insert("posting_policies", { courseId: c32.id, mode: "automatic" }, "pp");

  // Offerings (sandbox prices; no outcome or accreditation claims)
  const off = (code: string, title: string, productType: string, extra: Record<string, unknown>) => store.insert("offerings", { id: `off_${t.slug}_${code.replace("#", "")}`, code, title, productType, currency: "USD", aidEligible: false, state: "published", format: "online", ...extra }, "off");
  const o1 = store.insert("offerings", { id: `off_${t.slug}_1r`, code: "#1-R", title: "Python & Tooling Refresher", productType: "short_course", currency: "USD", aidEligible: false, state: "published", format: "online", courseId: c1.id, summary: "Python basics, data structures, notebooks and Git for AI work — the optional Week 0 of Program #1, also available on its own.", level: "beginner", hours: 15, skills: ["python", "notebooks"], price: 49, inPlus: true, selfPaced: true }, "off");
  const o32 = off("#32", "Applied Machine Learning with Python", "short_course", { courseId: c32.id, summary: "Train and evaluate supervised models, and explain their limits in a capstone report.", level: "intermediate", hours: 20, skills: ["python", "ml", "evaluation"], moduleKeys: ["ml-m1", "ml-m2", "ml-m3"], price: 129, inPlus: true, selfPaced: true, credentialTemplateId: tpl.id });
  const o15 = off("#15", "Deep Learning Live Intensive", "live_intensive", { courseId: c15.id, summary: "Neural networks and PyTorch with live sessions and graded labs.", level: "intermediate", hours: 30, skills: ["deep-learning", "pytorch", "ml"], moduleKeys: ["dl-m1", "dl-m2"], price: 399, earlyBirdPrice: 349, earlyBirdEndsAt: iso(14), format: "live" });
  const o20 = off("#20", "AI Agents Specialization", "specialization", { summary: "Design, evaluate and deploy tool-using AI agents responsibly.", level: "advanced", hours: 60, skills: ["agents", "evaluation", "python"], price: 499 });
  const o38 = off("#38", "Machine Learning Professional Certificate", "professional_certificate", { summary: "A stack of short courses and a capstone across the ML workflow.", level: "intermediate", hours: 120, skills: ["python", "ml", "deep-learning", "evaluation"], price: 899 });
  off("#5", "Prompting and Evaluation Guided Project", "guided_project", { summary: "A two-hour project: write prompts and measure their quality.", level: "beginner", hours: 2, skills: ["agents", "evaluation"], price: 19, inPlus: true, selfPaced: true });
  store.insert("offering_sections", { offeringId: o15.id, code: "DL-OCT", startsAt: iso(10, 15), endsAt: iso(52, 15), timeZone: "Africa/Lagos", capacity: 20, registrationClosesAt: iso(8, 23), schedule: "Tue/Thu 16:00–18:00 WAT", seatsTaken: 0 }, "osec");
  store.insert("offering_sections", { offeringId: o15.id, code: "DL-JAN", startsAt: iso(95, 15), endsAt: iso(137, 15), timeZone: "Africa/Lagos", capacity: 2, registrationClosesAt: iso(90, 23), schedule: "Sat 10:00–14:00 WAT", seatsTaken: 0 }, "osec");
  for (const [from, to, kind, moduleKey] of [[o32, o15, "waives", "dl-m1"], [o1, o20, "prerequisite", null], [o1, o38, "stacks_into", null], [o32, o38, "stacks_into", null], [o15, o38, "stacks_into", null]] as const) store.insert("pathway_edges", { fromId: from.id, toId: to.id, kind, moduleKey }, "pe");
  store.insert("transfer_rules", { externalCode: "CS-101", source: "Scholarion Demo University (demo)", offeringId: o1.id, moduleKey: null, note: "Equivalent introductory programming." }, "tr");
  store.insert("coupons", { code: "WELCOME10", percentOff: 10, maxRedemptions: 1000, redemptions: 0, expiresAt: iso(120) }, "cpn");
  store.insert("seat_licenses", { orgName: "Demo Corp (fictional)", offeringId: o32.id, seats: 3, managerId: u.admin, assigned: [] }, "seat");
  for (const [title, body] of [["How sandbox checkout works", "This staging site never takes real payments. Use the sandbox token tok_sandbox_visa at checkout."], ["Using the AI tutor", "The tutor answers from your course pages with citations. It won't do graded work, but it gives hints and can pass your question to your instructor."]]) store.insert("kb_articles", { title, body, tags: ["help"], state: "published" }, "kb");
  store.insert("global_announcements", { title: "Staging environment", body: "Demonstration site with fictional data. Payments are sandbox only.", roles: [], startsAt: iso(-30), endsAt: iso(365), dismissedBy: [] }, "gan");
  ensurePrograms(store);
  ensureAgents(store);
  ensureProctorDefaults(store);
  ensureStandardTemplate(store);
  ensureCloudLabTool(store);
  relay(store);
  rebuildIndex(store, actorFor(store, u.admin, true));
  relay(store);
  broker.persist(t.id);
  void o20;
  return u;
}

export function usersFor(slug: string): SeedUsers {
  const k = (key: string) => `usr_${slug}_${key}`;
  return { admin: k("admin"), registrar: k("registrar"), advisor: k("advisor"), support: k("support"), designer: k("designer"), instructor: k("instructor"), instructor2: k("instructor2"), ta: k("ta"), observer: k("parent"), ops: slug === "techdev" ? k("ops") : undefined, students: [1, 2, 3, 4, 5, 6].map((i) => k(`student${i}`)) };
}

export function resetCampusSeed() {
  seeded = null;
}
