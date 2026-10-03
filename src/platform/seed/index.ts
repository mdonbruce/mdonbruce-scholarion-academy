import { catalog } from "../catalog";
import { hashPassword } from "../identity";
import { live } from "../live";
import { lms } from "../lms";
import { emptyDb, getDb, setDb } from "../store";
import { studio } from "../studio";
import { teams } from "../teams";
import type { Entitlement, HelpArticle, User } from "../types";
import { CERT_PY, COURSE_AGENTIC, COURSE_AI, COURSE_DB, COURSE_PY, PATHWAY, PRODUCTS, buildContent } from "./catalog-data";

/**
 * Demo state for local development and the preview. Demo accounts are documented in
 * the README and shown on the sign-in page only when NODE_ENV !== "production".
 */

/** Demo admin's authenticator secret (development and CI only — add it to an authenticator app to sign in when MFA is enforced). */
export const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const DEMO = {
  learner: { email: "amara@demo.scholarion.test", password: "LearnEarnBuild1", name: "Amara Chukwu" },
  admin: { email: "admin@demo.scholarion.test", password: "ScholarionAdmin1", name: "Platform Admin" },
  instructor: { email: "faculty@demo.scholarion.test", password: "ScholarionFaculty1", name: "Course Staff" },
  visitor: { email: "tunde@demo.scholarion.test", password: "LearnEarnBuild2", name: "Tunde Bello" },
  orgAdmin: { email: "orgadmin@demo.scholarion.test", password: "ScholarionTeams1", name: "Grace Okafor" },
  orgLearner: { email: "kemi@brightpath.example", password: "LearnEarnBuild3", name: "Kemi Adeyemi" },
  /** Signs in to Brightpath through organization sign-in (simulated SSO): same email domain, not yet a member. */
  ssoLearner: { email: "chidi@brightpath.example", password: "LearnEarnBuild4", name: "Chidi Nwosu" },
  /** Holds the Agentic AI Foundations badge: can download the certificate PDF and write a verified review. */
  graduate: { email: "ngozi@demo.scholarion.test", password: "LearnEarnBuild5", name: "Ngozi Eze" },
};

const HELP: HelpArticle[] = [
  { id: "hlp_audit", title: "What does auditing a course include?", body: "Auditing is free. You can watch video lectures and read course materials. Graded quizzes, labs, projects, the AI Tutor and the certificate need a subscription, Scholarion Plus, a purchase or approved financial aid.", tags: ["audit", "free", "certificate"] },
  { id: "hlp_cancel", title: "How do I cancel my subscription?", body: "Go to Account, then Billing, and select Cancel subscription. It takes one step. You keep access until the end of the period you paid for and your progress is saved.", tags: ["cancel", "billing", "subscription", "plus"] },
  { id: "hlp_trial", title: "How does the Scholarion Plus free trial work?", body: "The free trial lasts the number of days shown at checkout. We email you before the first charge. Cancel before the trial ends and you won't be charged.", tags: ["trial", "plus", "charge", "billing"] },
  { id: "hlp_refund", title: "Refunds", body: "Annual Scholarion Plus plans can be refunded within the money-back window shown at checkout. Monthly plans aren't refunded, but you can cancel any time and keep access to the end of the month.", tags: ["refund", "money back", "billing", "annual"] },
  { id: "hlp_aid", title: "Applying for financial aid", body: "Open the program page and choose Apply for financial aid. Tell us about your background, financial need and goals. A person reviews every application and we email the decision, usually within 15 days.", tags: ["financial aid", "scholarship", "cost"] },
  { id: "hlp_verify", title: "Sharing and verifying your certificate", body: "Every credential has a public verification page and QR code. Share it to LinkedIn from Credentials, or send the verification link to an employer. The page checks the digital signature each time it's opened.", tags: ["certificate", "credential", "linkedin", "verify"] },
  { id: "hlp_deadlines", title: "Missed a deadline?", body: "Self-paced courses have suggested deadlines. Use Reset deadlines on the course home to move your schedule forward with no penalty.", tags: ["deadline", "late", "reset"] },
  { id: "hlp_accommodations", title: "Requesting accommodations", body: "If you use assistive technology or need extra time on proctored assessments, request an accommodation from the Proctored Assessments page before your assessment date. Our support team will follow up.", tags: ["accessibility", "accommodation", "proctored", "extra time"] },
  { id: "hlp_password", title: "Resetting your password", body: "Choose Forgot password on the sign-in page and we'll email you a reset link. Reset emails are sent by Scholarion Identity; until it's connected in this environment, contact support and we'll help you get back in.", tags: ["password", "reset", "sign in", "login"] },
  { id: "hlp_lab", title: "Cloud Lab won't open", body: "Cloud Lab needs full access to the course. If capacity is busy, download the starter files, work locally, and upload your code for grading.", tags: ["lab", "cloud lab", "code editor"] },
];

function user(id: string, d: { email: string; password: string; name: string }, roles: User["roles"]): User {
  return { id, email: d.email, name: d.name, passwordHash: hashPassword(d.password), roles, tenantIds: ["academy-public"], createdAt: "2026-08-15T14:00:00.000Z", timezone: "America/New_York", emailVerifiedAt: "2026-08-15T14:05:00.000Z" };
}

export function seed(): void {
  setDb(emptyDb());
  const db = getDb();
  db.tenants.push({ id: "academy-public", name: "Scholarion Academy", kind: "public" });
  db.products.push(...structuredClone(PRODUCTS));
  db.pathway.push(...PATHWAY);
  const content = buildContent();
  db.modules.push(...content.modules);
  db.items.push(...content.items);
  db.help.push(...HELP);

  const amara = user("usr_amara", DEMO.learner, ["learner"]);
  amara.onboarding = { goal: "Start a new career", level: "Beginner", topics: ["Python", "Artificial intelligence"], hoursPerWeek: 8 };
  const adminUser = user("usr_admin", DEMO.admin, ["platform_admin", "reviewer", "instructor", "support_agent"]);
  adminUser.mfaSecret = DEMO_ADMIN_TOTP_SECRET;
  adminUser.mfaEnabledAt = "2026-08-15T14:10:00.000Z";
  db.users.push(amara, adminUser, user("usr_faculty", DEMO.instructor, ["instructor"]), user("usr_tunde", DEMO.visitor, ["learner"]));

  const ent = (e: Omit<Entitlement, "id" | "tenantId">): void => {
    db.entitlements.push({ id: `ent_seed_${db.entitlements.length + 1}`, tenantId: "academy-public", ...e });
  };

  // Amara: Scholarion Plus annual (outside the refund window), a live seat in #26.
  db.subscriptions.push({ id: "sub_seed_amara_plus", userId: amara.id, plan: "plus_annual", productId: null, status: "active", currentPeriodStart: "2026-08-20T14:00:00.000Z", currentPeriodEnd: "2027-08-20T14:00:00.000Z", trialEnd: null, cancelAtPeriodEnd: false, amount: 420, createdAt: "2026-08-20T14:00:00.000Z" });
  db.orders.push({ id: "ord_seed_amara_plus", userId: amara.id, sessionId: "cs_seed_amara_plus", amount: 420, currency: "USD", description: "Scholarion Plus — annual", status: "paid", createdAt: "2026-08-20T14:00:00.000Z" });
  ent({ userId: amara.id, resource: { kind: "plus", id: "plus" }, level: "full", source: "plus", sourceRef: "sub_seed_amara_plus", validFrom: "2026-08-20T14:00:00.000Z", validTo: "2027-08-20T14:00:00.000Z" });
  ent({ userId: amara.id, resource: { kind: "product", id: "prd_p26" }, level: "live_seat", source: "purchase", sourceRef: "ord_seed_amara_live", validFrom: "2026-09-15T14:00:00.000Z", validTo: null });
  db.orders.push({ id: "ord_seed_amara_live", userId: amara.id, sessionId: "cs_seed_amara_live", amount: 1260, currency: "USD", description: "Agentic AI Systems Design (7-Week Live Intensive) — seat", status: "paid", createdAt: "2026-09-15T14:00:00.000Z" });

  // Staff assignments.
  for (const c of [COURSE_PY, COURSE_AI, COURSE_DB]) {
    ent({ userId: "usr_faculty", resource: { kind: "product", id: c }, level: "instructor", source: "staff", validFrom: "2026-08-01T00:00:00.000Z", validTo: null });
    ent({ userId: "usr_admin", resource: { kind: "product", id: c }, level: "instructor", source: "staff", validFrom: "2026-08-01T00:00:00.000Z", validTo: null });
  }

  // Enrollments with history.
  const enroll = (productId: string, courseId: string, anchor: string) =>
    db.enrollments.push({ id: `enr_seed_${courseId}`, userId: amara.id, productId, courseId, level: "full", createdAt: anchor, deadlineAnchor: anchor });
  enroll(CERT_PY, COURSE_PY, "2026-09-03T14:00:00.000Z");
  enroll(COURSE_AI, COURSE_AI, "2026-08-25T14:00:00.000Z");
  enroll(COURSE_DB, COURSE_DB, "2026-09-08T14:00:00.000Z");

  const complete = (courseId: string, upToModule: number, partial: string[] = []) => {
    for (const i of catalog.items(courseId)) {
      if (i.moduleNo <= upToModule && i.kind !== "capstone" && !(i.kind === "discussion" && i.graded)) {
        db.progress.push({ userId: amara.id, itemId: i.id, status: "completed", updatedAt: "2026-09-28T20:00:00.000Z" });
      }
    }
    for (const id of partial) db.progress.push({ userId: amara.id, itemId: id, status: "completed", updatedAt: "2026-10-01T20:00:00.000Z" });
  };
  const grade = (itemId: string, score: number, max: number, source: "quiz" | "lab" | "instructor") =>
    db.grades.push({ userId: amara.id, itemId, score, max, source, postedAt: "2026-09-28T20:00:00.000Z" });

  // Python: modules 1–4 done, module 5 lessons done and Mini Lab 2 in progress.
  complete(COURSE_PY, 4, ["itm_cop1047c_m5_overview", "itm_cop1047c_m5_lesson", "itm_cop1047c_m5_reading"]);
  const pyScores: [number, number, number][] = [
    [1, 3, 20],
    [2, 2, 18],
    [3, 3, 20],
    [4, 2, 20],
  ];
  for (const [m, quiz, lab] of pyScores) {
    grade(`itm_cop1047c_m${m}_quiz`, quiz, 3, "quiz");
    grade(`itm_cop1047c_m${m}_lab`, lab, 20, "lab");
  }
  grade("itm_cop1047c_m3_project", 45, 50, "instructor");
  db.submissions.push({ id: "sbm_seed_m3", userId: amara.id, itemId: "itm_cop1047c_m3_project", text: "Triage rules with five tests and a one-page explanation.", createdAt: "2026-09-21T20:00:00.000Z", status: "graded", score: 45, max: 50, feedback: "Clear rules and good tests. Add validation for negative pain scores." });
  const lab = catalog.item("itm_cop1047c_m5_lab")!;
  db.labSessions.push({ id: "lab_seed_amara_m5", userId: amara.id, itemId: lab.id, templateId: lab.lab!.templateId, code: lab.lab!.starterCode, status: "stopped", createdAt: "2026-10-01T21:00:00.000Z", lastActiveAt: "2026-10-01T21:30:00.000Z", attachUrlExpiresAt: "2026-10-01T21:40:00.000Z" });
  db.progress.push({ userId: amara.id, itemId: lab.id, status: "started", updatedAt: "2026-10-01T21:30:00.000Z" });

  // AI: modules 1–5 done; DB: modules 1–2 done.
  complete(COURSE_AI, 5);
  [3, 2, 3, 3, 2].forEach((s, i) => grade(`itm_cai4505c_m${i + 1}_quiz`, s, 3, "quiz"));
  complete(COURSE_DB, 2);
  [3, 3].forEach((s, i) => grade(`itm_cgs1540c_m${i + 1}_quiz`, s, 3, "quiz"));

  // Tunde: auditing Agentic AI Foundations, aid application pending for #16.
  ent({ userId: "usr_tunde", resource: { kind: "product", id: "prd_agentic_foundations" }, level: "audit", source: "audit_enrollment", validFrom: "2026-09-25T14:00:00.000Z", validTo: null });
  db.enrollments.push({ id: "enr_seed_tunde", userId: "usr_tunde", productId: "prd_agentic_foundations", courseId: "prd_agentic_foundations", level: "audit", createdAt: "2026-09-25T14:00:00.000Z", deadlineAnchor: "2026-09-25T14:00:00.000Z" });
  const filler = "I am currently working part time while supporting my family, and the program fee is more than I can manage this year. ".repeat(14);
  db.aid.push({ id: "aid_seed_tunde", userId: "usr_tunde", productId: "prd_p16", background: "Self-taught developer moving into AI engineering.", need: filler.trim(), goals: ("I want to build agentic AI tools for small clinics in my community and move into an AI developer role within a year. ".repeat(8)).trim(), commitment: true, status: "submitted", createdAt: "2026-09-30T15:00:00.000Z" });

  // Live cohort for #26: seven Saturdays, 2:00–4:00 PM ET, three 40-minute segments.
  for (let w = 0; w < 7; w++) {
    const start = new Date(Date.parse("2026-10-10T18:00:00.000Z") + w * 7 * 86400_000).toISOString();
    live.schedule({ productId: "prd_p26", cohort: "Fall 2026", title: `Week ${w + 1}: ${["Agent architectures", "Retrieval for agents", "Tool use and MCP", "Multi-agent coordination", "Evaluation and guardrails", "Deployment and observability", "Capstone reviews"][w]}`, startsAt: start, totalMinutes: 120 });
  }

  // Studio: Module 5 aids published, Module 6 waiting for staff review.
  for (const o of studio.generate(COURSE_PY, 5)) {
    o.state = "published";
    o.approvedBy = "usr_faculty";
  }
  studio.generate(COURSE_PY, 6);

  /* ---------- Live admissions ---------- */
  db.applications.push(
    { id: "app_seed_amara", userId: amara.id, productId: "prd_p26", cohort: "Fall 2026", experience: "Two years building Python data tools for a clinic; completed Agentic AI Foundations and a RAG guided project.", motivation: "I want to design multi-agent intake and triage assistants with proper human checkpoints for small clinics.", status: "reserved", reviewerId: "usr_admin", decidedAt: "2026-09-12T15:00:00.000Z", reservedAt: "2026-09-15T14:00:00.000Z", paymentPlan: "full", onboardedAt: "2026-09-16T14:00:00.000Z", createdAt: "2026-09-10T15:00:00.000Z" },
    { id: "app_seed_tunde", userId: "usr_tunde", productId: "prd_p15", cohort: "Winter 2027", experience: "Self-taught developer. I've built two Flask APIs and a small LLM chatbot for a local business, and I'm comfortable with Python and Git.", motivation: "I want production depth — evaluation, observability and deployment — so I can move from prototypes to agents a company can rely on.", status: "submitted", createdAt: "2026-10-01T16:00:00.000Z" },
  );

  /* ---------- Teams: two organizations that must never see each other ---------- */
  db.users.push(
    user("usr_orgadmin", DEMO.orgAdmin, ["learner"]),
    user("usr_kemi", DEMO.orgLearner, ["learner"]),
    user("usr_chidi", DEMO.ssoLearner, ["learner"]),
    user("usr_rbadmin", { email: "ops-admin@riverbend.example", password: "RiverbendAdmin1", name: "Riverbend Admin" }, ["learner"]),
    user("usr_dayo", { email: "dayo@riverbend.example", password: "RiverbendLearn1", name: "Dayo Musa" }, ["learner"]),
    user("usr_ngozi", { email: "ngozi@demo.scholarion.test", password: "LearnEarnBuild5", name: "Ngozi Eze" }, ["learner"]),
    user("usr_spam", { email: "deals4u@demo.scholarion.test", password: "NotARealLearner1", name: "Unverified account" }, ["learner"]),
  );
  const brightpath = teams.purchase({ id: "org_brightpath", adminId: "usr_orgadmin", name: "Brightpath Health (demo)", seats: 10, domain: "brightpath.example" });
  teams.assignProgram(brightpath.id, "usr_orgadmin", CERT_PY);
  teams.assignProgram(brightpath.id, "usr_orgadmin", "prd_agentic_foundations");
  teams.addMember(brightpath, db.users.find((u) => u.id === "usr_kemi")!, "sso");
  teams.invite(brightpath.id, "usr_orgadmin", "new.hire@brightpath.example");
  const riverbend = teams.purchase({ id: "org_riverbend", adminId: "usr_rbadmin", name: "Riverbend Logistics (demo)", seats: 5, domain: "riverbend.example" });
  teams.assignProgram(riverbend.id, "usr_rbadmin", COURSE_DB);
  teams.addMember(riverbend, db.users.find((u) => u.id === "usr_dayo")!, "sso");
  // Kemi is partway through Python.
  for (const i of catalog.items(COURSE_PY).filter((x) => x.moduleNo <= 2 && !x.graded)) db.progress.push({ userId: "usr_kemi", itemId: i.id, status: "completed", updatedAt: "2026-09-30T18:00:00.000Z" });

  /* ---------- Peer review: classmates who submitted the Module 5 mini project ---------- */
  ent({ userId: "usr_ngozi", resource: { kind: "plus", id: "plus" }, level: "full", source: "plus", sourceRef: "sub_seed_ngozi", validFrom: "2026-09-01T00:00:00.000Z", validTo: "2027-09-01T00:00:00.000Z" });
  db.enrollments.push({ id: "enr_seed_ngozi", userId: "usr_ngozi", productId: COURSE_PY, courseId: COURSE_PY, level: "full", createdAt: "2026-09-01T14:00:00.000Z", deadlineAnchor: "2026-09-01T14:00:00.000Z" });
  db.submissions.push(
    { id: "sbm_seed_kemi_m5", userId: "usr_kemi", itemId: "itm_cop1047c_m5_project", text: "patients.py stores records in a dict keyed by patient id. Functions: add_patient, calculate_age, format_name, search_by_last_name and a menu loop. Input validation rejects birth years in the future and blank names. Report attached as PDF.", fileName: "patients.py", createdAt: "2026-10-01T15:00:00.000Z", status: "submitted" },
    { id: "sbm_seed_ngozi_m5", userId: "usr_ngozi", itemId: "itm_cop1047c_m5_project", text: "Records live in a list of dictionaries. Five functions plus a recursive function that totals visits across nested department folders. Validation uses try/except around int(). Includes a short PDF report with sample runs.", fileName: "records_system.py", createdAt: "2026-10-02T13:00:00.000Z", status: "submitted" },
  );
  db.peerReviews.push(
    { id: "prv_seed_1", submissionId: "sbm_seed_ngozi_m5", itemId: "itm_cop1047c_m5_project", reviewerId: "usr_kemi", scores: { Correctness: 18, "Use of functions and structure": 14, "Validation and error handling": 8, "Report clarity": 4 }, total: 44, max: 50, comment: "Nice use of recursion for the department folders. The search could return all matches, not just the first.", createdAt: "2026-10-02T16:00:00.000Z" },
    { id: "prv_seed_2", submissionId: "sbm_seed_kemi_m5", itemId: "itm_cop1047c_m5_project", reviewerId: "usr_ngozi", scores: { Correctness: 17, "Use of functions and structure": 13, "Validation and error handling": 9, "Report clarity": 4 }, total: 43, max: 50, comment: "Clear functions and good validation on birth year. Consider splitting the menu loop into its own function.", createdAt: "2026-10-02T17:00:00.000Z" },
  );

  /* ---------- Course discussions ---------- */
  const post = (id: string, itemId: string, courseId: string, userId: string, body: string, createdAt: string, parentId: string | null = null, reports: string[] = []) =>
    db.posts.push({ id, itemId, courseId, userId, parentId, body, createdAt, reports });
  post("pst_seed_1", "itm_cop1047c_m5_discussion", COURSE_PY, "usr_ngozi", "At the clinic where I volunteer, staff retype the same patient name formatting rules in three spreadsheets. A single format_name function would remove a lot of small errors.", "2026-10-01T14:00:00.000Z");
  post("pst_seed_2", "itm_cop1047c_m5_discussion", COURSE_PY, "usr_kemi", "Same at my hospital. We also calculate age in two different ways depending on the form, which is how mismatches happen.", "2026-10-01T16:30:00.000Z", "pst_seed_1");
  post("pst_seed_3", "itm_cop1047c_m5_discussion", COURSE_PY, "usr_faculty", "Good examples. Notice that both are about one rule living in one place — that's the main argument for functions. Try to name the inputs and outputs before you write the body.", "2026-10-01T18:00:00.000Z", "pst_seed_1");
  post("pst_seed_4", "itm_cop1047c_m5_discussion", COURSE_PY, "usr_amara", "Recursion still feels like magic to me. Is there a simple way to picture the base case?", "2026-10-02T09:00:00.000Z");
  post("pst_seed_5", "itm_cop1047c_m5_discussion", COURSE_PY, "usr_spam", "Selling exam answers, message me", "2026-10-02T10:00:00.000Z", null, ["usr_ngozi", "usr_amara"]);
  post("pst_seed_6", "itm_cai4505c_m6_discussion", COURSE_AI, "usr_amara", "Automated inference in triage tools is only as fair as the rules we encode. Who reviews the knowledge base when guidelines change?", "2026-09-29T15:00:00.000Z");

  /* ---------- A credential holder (sandbox): Ngozi finished Agentic AI Foundations ---------- */
  // Goes through the real grade → course.passed → credential path, so the record is consistent.
  // No reviews are seeded: reviews on the site come only from real credential holders.
  db.enrollments.push({ id: "enr_seed_ngozi_agf", userId: "usr_ngozi", productId: COURSE_AGENTIC, courseId: COURSE_AGENTIC, level: "full", createdAt: "2026-09-01T14:00:00.000Z", deadlineAnchor: "2026-09-01T14:00:00.000Z" });
  for (const i of catalog.items(COURSE_AGENTIC)) {
    db.progress.push({ userId: "usr_ngozi", itemId: i.id, status: "completed", updatedAt: "2026-09-28T18:00:00.000Z" });
    if (i.graded) lms.postGrade({ userId: "usr_ngozi", itemId: i.id, score: 9, max: 10, source: i.kind === "quiz" ? "quiz" : "instructor" });
  }

  // Seeding must not leave events or emails behind.
  db.events = [];
  db.processed = [];
  db.outbox = [];
}
