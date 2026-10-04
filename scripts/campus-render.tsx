/**
 * Renders the campus UI to static HTML for every tab and the key flows, as real users
 * (seeded personas), without a running server. Used by the UI test (fails on any render
 * error), the accessibility (axe) check and the hosted preview.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/campus-render.tsx [--check]
 */
process.env.SCHOLARION_SCHEDULER ??= "off";
import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "../src/campus";
import { broker, relay, type TenantStore } from "../src/campus/core";
import { actorFor, type Actor } from "../src/campus/iam";
import { ensureCampusSeed } from "../src/campus/seed";
import { TABS } from "../src/campus/registry";
import { CampusShell, PublicFrame } from "../src/campus/ui/shell";
import { CampusPage } from "../src/campus/ui/views/dispatch";
import { CatalogView, SigninView, TenantHome, TenantPicker, VerifyLookupView, VerifyView } from "../src/campus/ui/views/public";
import { AgenticHubView } from "../src/campus/ui/views/hub";
import { startAttempt } from "../src/campus/services/assessment";
import { checkout } from "../src/campus/services/academy";
import { openItem, moduleStates } from "../src/campus/services/curriculum";
import { proctorAsk, saveReadiness } from "../src/campus/services/proctor";
import { applyToProgram, programIndex, reviewProgramApplication, selfCheck } from "../src/campus/services/programs";
import { ProgramIndexView, ProgramPageView } from "../src/campus/ui/views/program";
import { PublicChangelog } from "../src/campus/ui/views/ecohub";
import { AidView, PlusView, PricingView } from "../src/campus/ui/views/market";
import { kitAssets } from "../src/campus/services/campaigns";
import { generateDraft } from "../src/campus/services/assess";
import { runLab } from "../src/campus/services/agentlabs";
import { simLabHtml } from "../src/campus/services/simlab";
import { coverHtml } from "../src/campus/services/covers";
import { submit as gradedSubmit } from "../src/campus/services/graded";
import { launchWorkspace, writeFile as wsWrite, runCommand as wsCommand, runAgent } from "../src/campus/services/workspace";
import { listOutputs as studioListOutputs, readOutput as studioReadOutput } from "../src/campus/services/studio";
import { setProjectionLock } from "../src/campus/services/projection";
import { scheduleLiveSession as ecoSchedule } from "../src/campus/services/ecosystem";
import { AI801_LAB_KEY, submitProject } from "../src/campus/academy/ai801-seed";
import { AI801_MINILABS, AI801_QUIZ } from "../src/campus/academy/ai801";
import { SIM_SCENARIOS } from "../src/campus/academy/sim-scenarios";

process.env.CAMPUS_LOGS = "0";
process.env.CLOUDLAB_LOCAL_RUNNER ??= "1";
const check = process.argv.includes("--check");
const OUT = path.join(process.cwd(), "preview", "campus");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join("public", "brand", "faculty"), path.join(OUT, "brand", "faculty"), { recursive: true });
const css = fs.readFileSync("src/ui/styles/globals.css", "utf8");

broker.reset();
ensureCampusSeed();

const CRASH = /(TypeError|ReferenceError|RangeError|SyntaxError|Cannot read prop|is not a function|is not iterable|undefined is not|Something went wrong)/;
const failures: string[] = [];
const index: { file: string; title: string; who: string }[] = [];

function doc(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Scholarion Campus</title><style>${css}</style></head><body>${body}</body></html>`;
}

function save(file: string, title: string, who: string, el: ReactElement) {
  let html = "";
  try {
    html = renderToStaticMarkup(el);
  } catch (e) {
    failures.push(`${file}: render threw ${(e as Error).stack?.split("\n").slice(0, 4).join(" | ")}`);
    return;
  }
  const m = CRASH.exec(html);
  if (m) failures.push(`${file}: page shows "${html.slice(Math.max(0, m.index - 120), m.index + 160).replace(/<[^>]+>/g, " ")}"`);
  // Static preview: serve the approved brand images from the preview folder itself.
  fs.writeFileSync(path.join(OUT, file), doc(title, html.replace(/src="\/brand\//g, 'src="brand/')));
  index.push({ file, title, who });
}

function as(slug: string, key: string): { store: TenantStore; actor: Actor } {
  const t = broker.tenant(slug)!;
  const store = broker.connect({ tenantId: t.id, slug, via: "path", traceId: "render" });
  return { store, actor: actorFor(store, `usr_${slug}_${key}`, true) };
}

function page(slug: string, key: string, p: string, title: string) {
  const { store, actor } = as(slug, key);
  const [pathPart, qs] = p.split("?");
  const sp = Object.fromEntries(new URLSearchParams(qs ?? ""));
  const pathArr = pathPart.split("/").filter(Boolean);
  const t = broker.tenant(slug)!;
  const file = `${slug}-${key}-${pathPart.replace(/[^a-z0-9]+/gi, "-")}${qs ? `-${qs.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}` : ""}.html`.toLowerCase();
  save(file, title, `${key}@${slug}`, (
    <CampusShell tenant={t} store={store} actor={actor} current={pathPart}>
      <CampusPage store={store} actor={actor} slug={slug} path={pathArr} sp={sp} />
    </CampusShell>
  ));
}

// Public pages
save("index-tenants.html", "Choose a school", "public", <TenantPicker />);
for (const slug of ["demo", "academy", "techdev"]) {
  const t = broker.tenant(slug)!;
  const store = broker.connect({ tenantId: t.id, slug, via: "path", traceId: "render" });
  save(`${slug}-public-home.html`, `${t.name}`, "public", <PublicFrame tenant={t}><TenantHome tenant={t} store={store} /></PublicFrame>);
  save(`${slug}-public-signin.html`, "Sign in", "public", <PublicFrame tenant={t}><SigninView tenant={t} sp={{}} /></PublicFrame>);
  save(`${slug}-public-catalog.html`, "Catalog", "public", <PublicFrame tenant={t}><CatalogView tenant={t} store={store} actor={null} sp={{ r_goal: "start", r_experience: "intermediate", r_interest: "ml", r_format: "self", r_hours: "6", compare: "off_academy_37_2,off_academy_18" }} /></PublicFrame>);
}
{
  const t = broker.tenant("academy")!;
  const s = as("academy", "student2");
  save("academy-public-offering.html", "#37.2 Supervised and Unsupervised Learning", "student2@academy", <PublicFrame tenant={t}><CatalogView tenant={t} store={s.store} actor={s.actor} sp={{ offering: "off_academy_37_2", coupon: "WELCOME10" }} /></PublicFrame>);
  const demo = broker.tenant("demo")!;
  const ds = as("demo", "admin");
  const cred = ds.store.list("credentials")[0];
  save("demo-public-verify.html", "Verify a credential", "public", <PublicFrame tenant={demo}><VerifyView tenant={demo} store={ds.store} id={cred.id} /></PublicFrame>);
}

// Student flows (demo)
const C = "courses/crs_demo_cs101";
{
  const s = as("demo", "student1");
  for (const m of moduleStates(s.store, s.actor, "crs_demo_cs101").slice(0, 1)) for (const i of m.items) if (i.requirement === "view") openItem(as("demo", "student1").store, s.actor, i.item.id);
  startAttempt(as("demo", "student1").store, s.actor, "qz_demo_w1");
}
for (const [p, title] of [
  ["dashboard", "Dashboard"],
  ["dashboard?view=list", "Dashboard — list"],
  ["dashboard?view=activity", "Dashboard — activity"],
  ["courses", "Courses"],
  [`${C}/modules`, "Modules"],
  [`${C}/pages/pg_demo_welcome`, "Page"],
  [`${C}/assignments/asg_demo_hello`, "Assignment"],
  [`${C}/assignments/asg_demo_lab1`, "Lab assignment"],
  [`${C}/quizzes/qz_demo_w1`, "Quiz taking"],
  [`${C}/discussions/dt_demo_intro`, "Discussion"],
  [`${C}/grades?wi_asg_demo_loops=9`, "Grades with What-If"],
  [`${C}/syllabus`, "Syllabus"],
  [`${C}/announcements`, "Announcements"],
  [`${C}/people`, "People"],
  [`${C}/tutor?ask=1&mode=explain&q=what+is+a+variable&avatar=amara`, "AI tutor"],
  [`${C}/tutor?ask=1&mode=explain&q=write+my+essay+for+the+assignment`, "AI tutor refusal"],
  ["calendar", "Calendar"],
  ["inbox", "Inbox"],
  ["notifications", "Notifications"],
  ["search?q=variables", "Search"],
  ["account", "Account"],
  ["t/registration", "Registration"],
]) page("demo", "student1", p, title);

// Instructor flows
for (const [p, title] of [
  [`${C}/modules`, "Modules (teacher)"],
  [`${C}/grades`, "Gradebook"],
  [`${C}/grader?assignmentId=asg_demo_hello`, "Sequential grader"],
  [`${C}/pages/pg_demo_welcome?edit=1`, "Page editor"],
  [`${C}/quizzes/qz_demo_w1`, "Quiz (teacher)"],
  [`${C}/settings`, "Course settings"],
  [`${C}/files`, "Files"],
  [`${C}/people`, "People (teacher)"],
  [`${C}/outcomes`, "Mastery gradebook"],
  [`${C}/analytics`, "Course analytics"],
]) page("demo", "instructor", p, title);

// Every tab, as the people who use it
for (const tab of TABS) {
  const who = tab.platformOnly ? ["techdev", "ops"] : tab.internalOnly ? ["techdev", "admin"] : ["demo", "admin"];
  page(who[0], who[1], `t/${tab.slug}`, tab.title);
}
page("demo", "registrar", "t/registration", "Registration (registrar)");
{
  const s1 = as("demo", "student1");
  const r = proctorAsk(s1.store, s1.actor, "What do I need to set up before my exam?");
  page("demo", "student1", `t/proctor-support?reply=${r.id}`, "Proctored assessment setup assistant");
  const s2 = as("demo", "student2");
  const esc = proctorAsk(s2.store, s2.actor, "Can you make an exception and let me keep my phone on the desk?");
  page("demo", "student2", `t/proctor-support?reply=${esc.id}`, "Setup assistant escalation");
  page("demo", "student1", `${C}/quizzes/qz_demo_proctored`, "Proctored quiz: pre-test checklist");
  saveReadiness(as("demo", "student3").store, as("demo", "student3").actor, "qz_demo_proctored", ["id", "webcam", "mic"]);
  page("demo", "instructor", "t/proctor-support", "Proctored support (instructor)");
}
page("demo", "advisor", "t/advising", "Advising");
page("demo", "parent", "t/observers", "Observers");
page("demo", "admin", "t/tenant-admin?accountId=acc_demo_computing", "Permissions (sub-account)");

// Academy: commerce + tutor in Pidgin
{
  const s = as("academy", "student1");
  checkout(s.store, s.actor, { offeringId: "off_academy_37_2", sandboxCard: "tok_sandbox_visa" });
}
page("academy", "student1", "dashboard", "Academy dashboard");
page("academy", "student1", "courses/crs_academy_p37_2/tutor?ask=1&mode=explain&q=what+is+overfitting&lang=pcm", "Tutor (Pidgin)");
page("academy", "admin", "t/commerce", "Commerce");
page("academy", "admin", "t/program-studio", "Program Studio");
page("demo", "student1", "calendar?view=month", "Calendar — month");
page("demo", "student1", "calendar?view=week", "Calendar — week");
{
  const t = broker.tenant("academy")!;
  const pub = broker.connect({ tenantId: t.id, slug: "academy", via: "path", traceId: "render" });
  save("academy-programs-index.html", "Programs", "public", <PublicFrame tenant={t}><ProgramIndexView tenant={t} store={pub} /></PublicFrame>);
  save("academy-public-pricing.html", "Plans and pricing", "public", <PublicFrame tenant={t}><PricingView tenant={t} store={pub} actor={null} /></PublicFrame>);
  save("academy-public-plus.html", "Scholaris Plus", "public", <PublicFrame tenant={t}><PlusView tenant={t} store={pub} actor={null} /></PublicFrame>);
  {
    const s7 = as("academy", "student6");
    save("academy-financial-aid.html", "Financial aid — apply", "student6@academy", <PublicFrame tenant={t}><AidView tenant={t} store={s7.store} actor={s7.actor} sp={{}} /></PublicFrame>);
  }
  for (const p of programIndex(pub)) save(`academy-program-${p.slug}.html`, `${p.code} ${p.title}`, "public", <PublicFrame tenant={t}><ProgramPageView tenant={t} store={pub} actor={null} slug={p.slug} sp={{}} /></PublicFrame>);
  // #26 as a signed-in learner: self-check passed, applied, admitted → seat reservation step.
  const s5 = as("academy", "student5");
  const sc = selfCheck(s5.store, s5.actor, "off_academy_26", { py1: "[0, 2, 4]", py2: "dict", ds1: "queue", py3: "1 2", llm1: "the number of tokens it can consider at once", llm2: "code must parse the model's answer reliably" });
  const app = applyToProgram(as("academy", "student5").store, s5.actor, { offeringId: "off_academy_26", statement: "I build backend services and want to design reliable multi-agent systems with proper evaluation." });
  reviewProgramApplication(as("academy", "registrar").store, as("academy", "registrar").actor, app.application.id, "admit");
  save("academy-program-26-admitted.html", "#26 — admitted, reserve seat", "student5@academy", <PublicFrame tenant={t}><ProgramPageView tenant={t} store={as("academy", "student5").store} actor={as("academy", "student5").actor} slug="agentic-systems-live-intensive" sp={{ selfcheck: sc.id }} /></PublicFrame>);
  const s6 = as("academy", "student6");
  const fail = selfCheck(s6.store, s6.actor, "off_academy_26", { py1: "6" });
  save("academy-program-26-selfcheck-routed.html", "#26 — self-check routes elsewhere", "student6@academy", <PublicFrame tenant={t}><ProgramPageView tenant={t} store={s6.store} actor={s6.actor} slug="agentic-systems-live-intensive" sp={{ selfcheck: fail.id }} /></PublicFrame>);
}
{
  const t = broker.tenant("academy")!;
  const pub = broker.connect({ tenantId: t.id, slug: "academy", via: "path", traceId: "render" });
  save("academy-agentic-hub.html", "Agentic AI Courses & Certifications", "public", <PublicFrame tenant={t}><AgenticHubView tenant={t} store={pub} sp={{}} /></PublicFrame>);
  save("academy-agentic-hub-filtered.html", "Agentic AI hub — no-coding filter + comparison", "public", <PublicFrame tenant={t}><AgenticHubView tenant={t} store={pub} sp={{ coding: "no", compare: ["off_academy_20", "off_academy_34"] }} /></PublicFrame>);
  save("academy-agentic-hub-quiz.html", "Agentic AI hub — quiz recommendation", "public", <PublicFrame tenant={t}><AgenticHubView tenant={t} store={pub} sp={{ tab: "short_course", ans_role: "developer", ans_coding: "strong", ans_goal: "build-agents", ans_time: "5", ans_format: "self_paced", ans_length: "short" }} /></PublicFrame>);
  save("academy-verify-lookup.html", "Verify a credential", "public", <PublicFrame tenant={t}><VerifyLookupView tenant={t} /></PublicFrame>);
}
page("academy", "admin", "t/module-library", "Module Library & Catalog Consolidation");
{
  const d = as("academy", "designer");
  const q = generateDraft(d.store, d.actor, { offeringId: "off_academy_15", week: "3", kind: "quiz", n: 10 });
  generateDraft(as("academy", "designer").store, d.actor, { offeringId: "off_academy_15", week: "3", kind: "real_world_project" });
  page("academy", "admin", `t/assessment-studio?program=off_academy_15&draft=${q.id}`, "Assessment & Project Studio — quiz draft");
  // Learner in the Agentic Cloud Lab with a practice run and a graded attempt.
  const s4 = as("academy", "student4");
  checkout(s4.store, s4.actor, { offeringId: "off_academy_32", sandboxCard: "tok_sandbox_visa" });
  relay(broker.connect({ tenantId: broker.tenant("academy")!.id, slug: "academy", via: "path", traceId: "render" }));
  const lab = as("academy", "admin").store.list("agent_labs", (l) => l.scenario === "haven-guest-services")[0];
  runLab(as("academy", "student4").store, as("academy", "student4").actor, lab.id, "practice");
  const g = runLab(as("academy", "student4").store, as("academy", "student4").actor, lab.id, "graded", String(lab.referenceCode));
  page("academy", "student4", `agent-labs/${lab.id}?run=${g.runId}`, "Agentic Cloud Lab — workspace and run log");
  for (const kind of ["slide", "title-card"] as const) {
    const file = `cover-p15-weekend3-${kind}.html`;
    fs.writeFileSync(path.join(OUT, file), coverHtml(as("academy", "admin").store, "off_academy_15", "3", kind));
    index.push({ file, title: `#15 Weekend 3 — ${kind === "slide" ? "lecture cover slide" : "video title card"}`, who: "instructor" });
  }
  for (const sc of SIM_SCENARIOS) for (const ed of ["student", "instructor", "app"] as const) {
    const file = `simlab-${sc.key}-${ed}.html`;
    fs.writeFileSync(path.join(OUT, file), simLabHtml(sc.key, ed, { module: "3" }));
    index.push({ file, title: `${sc.title} — ${ed === "app" ? "Simulated Application Demo" : ed === "instructor" ? "Instructor Lab" : "Student Lab"}`, who: ed === "instructor" ? "instructor" : "public" });
  }
}
{
  // Hosted learning area (AI-801): learner activity, then every section for a learner and the instructor.
  const C = "crs_academy_ai801";
  const st = as("academy", "student1");
  const items = st.store.list("graded_items", (i) => i.courseId === C);
  const byKey = (k: string) => items.find((i) => i.key === k)!;
  const ml = byKey("m01-perception-minilab-1");
  const tasks = AI801_MINILABS.perception[0].tasks;
  gradedSubmit(st.store, st.actor, ml.id, Object.fromEntries(tasks.map((t) => [t.id, t.kind === "match" || t.kind === "order" ? t.key : t.key[0]])), "render-ml-1");
  const quiz = byKey("m01-course-quiz");
  const q1 = gradedSubmit(st.store, st.actor, quiz.id, Object.fromEntries(AI801_QUIZ.map((v, i) => [v[0].id, i < 6 ? v[0].answer : [(v[0].answer[0] + 1) % v[0].options.length]])), "render-q-1");
  const ws = launchWorkspace(st.store, st.actor, { courseId: C, labKey: AI801_LAB_KEY, templateId: "agent-builder" });
  wsWrite(st.store, st.actor, ws.id, "agent/spec.yaml", "name: guest-services\ngoal: Answer booking questions from data\nmax_steps: 6\ntools:\n  - FILE_READ\n  - HTTP_REQUEST\nguardrail:\n  block: [ignore previous, system prompt, grant all]\n");
  wsWrite(st.store, st.actor, ws.id, "report.md", "# Guest services agent\n## Perception\nTyped records with provenance.\n## Memory\nShort-term context; long-term vector memory.\n## Requirements\nFinance: one refund per booking.\n## Validation\nscholarion validate: 2/2 checks passing\n");
  wsCommand(st.store, st.actor, ws.id, "scholarion validate");
  runAgent(st.store, st.actor, ws.id, { name: "read-schedule", onBlocked: "continue", steps: [{ tool: "FILE_READ", args: { path: "/workspace/data/schedule.csv" } }, { tool: "HTTP_REQUEST", args: { url: "sim://api.scholarion.local/v1/schedule" } }, { tool: "FILE_READ", args: { path: "/etc/passwd" } }] });
  submitProject(st.store, st.actor, byKey("m01-activity-project").id, ws.id, "render-proj-1");
  const run = st.store.list("studio_runs", (r) => r.courseKey === C)[0];
  const L = (sec: string, q = "") => `learn/${C}/${sec}${q}`;
  page("academy", "student1", L("dashboard"), "Learning area — course dashboard (learner)");
  page("academy", "student1", L("modules"), "Learning area — modules and topics");
  page("academy", "student1", L("sources"), "Learning area — sources and reading library");
  page("academy", "student1", L("lecture-studio"), "Learning area — Lecture Studio (learner)");
  page("academy", "student1", L("cloud-labs"), "Learning area — Agentic Cloud Labs with run log");
  page("academy", "student1", L("mini-labs", `?item=${ml.id}&review=${st.store.list("graded_submissions", (x) => x.itemId === ml.id)[0].id}`), "Learning area — mini-lab with Check Answers");
  page("academy", "student1", L("activities"), "Learning area — hands-on in-class activity");
  page("academy", "student1", L("assignments", `?item=${byKey("m01-activity-project").id}`), "Learning area — workspace project (graded snapshot)");
  page("academy", "student1", L("quizzes", `?item=${quiz.id}&sub=${q1.id}`), "Learning area — graded quiz, attempt 2 variants");
  page("academy", "student1", L("workspaces", `?ws=${ws.id}`), "Learning area — saved workspace, editor and terminal");
  page("academy", "student1", L("demos"), "Learning area — application demonstrations");
  page("academy", "student1", L("gradebook"), "Learning area — gradebook and passbook (learner)");
  page("academy", "student1", L("environment"), "Learning area — environment and tool permissions");
  page("academy", "student1", L("outputs", run ? `?run=${run.id}` : ""), "Learning area — Studio output library (learner)");
  page("academy", "lead", L("instructor"), "Learning area — Instructor Control Panel (locked)");
  page("academy", "lead", L("gradebook"), "Learning area — class gradebook and passbook");
  page("academy", "lead", L("lecture-studio"), "Learning area — Lecture Studio (instructor)");
  page("academy", "lead", L("outputs", run ? `?run=${run.id}` : ""), "Learning area — Studio output library (instructor)");
  if (run) {
    const lead = as("academy", "lead");
    for (const rel of ["03_Lecture_Deck/lecture_deck.html", "03_Lecture_Deck/cover_variant_A.html", "03_Lecture_Deck/cover_variant_B.html", "11_Application_Demo/agentic_demo.html", "09_Student_Labs/minilab_1.html", "06_Infographics_and_Mind_Maps/infographic.html"]) {
      const o = studioListOutputs(lead.store, lead.actor, run.id).find((x) => x.relPath === rel);
      if (!o) continue;
      const file = `studio-ai801-${rel.split("/").pop()}`;
      fs.writeFileSync(path.join(OUT, file), String(studioReadOutput(lead.store, lead.actor, String(o.id)).content));
      index.push({ file, title: `Course Studio — AI-801 ${rel}`, who: "learner" });
    }
  }
  setProjectionLock(as("academy", "lead").store, as("academy", "lead").actor, C, false);
  page("academy", "lead", L("instructor", "?view=unlocked"), "Learning area — Instructor Control Panel (unlocked, INSTRUCTOR MODE banner)");
}
{
  // Free Education Resource Hub, Career Connect, Employer Portal and Auto-Discovery.
  const zoom = as("academy", "admin").store.list("eco_resources", (r) => r.key === "zoom-basic")[0];
  const webex = as("academy", "admin").store.list("eco_resources", (r) => r.key === "webex-free")[0];
  const inst = as("academy", "instructor");
  ecoSchedule(inst.store, inst.actor, { courseId: "crs_academy_ai801", title: "Module 1 live lecture", providerId: webex.id, startsAt: "2026-10-10T14:00:00Z", totalMinutes: 90, joinUrl: "https://example.webex.com/meet/scholarion-ai801" });
  page("academy", "student1", "hub/overview", "Resource Hub — learner overview");
  page("academy", "student1", "hub/tools", "Free Tools Directory");
  page("academy", "student1", `hub/tools?r=${zoom.id}`, "Free Tools Directory — detail with evidence");
  page("academy", "student1", "hub/agentic", "Agentic AI Tools & Templates");
  page("academy", "student1", "hub/avatar", "Virtual Instructor & Avatar Studio");
  page("academy", "student1", "hub/live", "Live Classroom Hub — blocks within verified limits");
  page("academy", "student1", "hub/media", "Video & Audio Studio");
  page("academy", "student1", "hub/library", "Open Courses & Reading Library");
  page("academy", "instructor", "hub/recommendations?course=crs_academy_ai801", "Course Resource Recommendations");
  page("academy", "student1", "hub/whats-new", "What's New");
  page("academy", "student1", "hub/career", "Career Connect — profile, matches, applications");
  page("academy", "student1", "hub/board", "Internship & Employment Board");
  page("academy", "employer1", "hub/employer", "Employer Portal — verified employer");
  page("academy", "employer2", "hub/employer", "Employer Portal — awaiting verification");
  page("academy", "admin", "hub/integrations", "Integration Connections");
  page("academy", "admin", "hub/employers", "Employer Verification");
  page("academy", "admin", "hub/automation", "Discovery & Update Settings");
  page("academy", "admin", "hub/schema", "Integration JSON Schema");
  page("academy", "admin", "hub/library?status=pending", "Library — curator view");
  page("academy", "admin", "t/free-resources", "Tab 57 — Free Education Resource Hub");
  page("academy", "admin", "t/career-connect", "Tab 58 — Career Connect");
  page("academy", "admin", "t/discovery-automation", "Tab 59 — Auto-Discovery");
}
page("academy", "instructor", "t/agentic-cloud-labs", "Agentic Cloud Labs — instructor");
page("academy", "student1", "agent-labs", "Agentic Cloud Labs — my labs");
page("academy", "instructor", "courses/crs_academy_p15/modules", "#15 course shell (weekends)");
page("academy", "instructor", "courses/crs_academy_p32/modules", "#32 self-paced course (modules)");
page("academy", "instructor", "courses/crs_academy_p26/modules", "#26 course shell (modules)");
page("academy", "admin", "t/pathways?run=pathways.consolidation_report", "Consolidation report");

{
  // Tab 60 — Program Marketing & Campaigns, with the kit files themselves.
  page("academy", "admin", "t/campaigns", "Tab 60 — Program Marketing & Campaigns");
  page("academy", "admin", "t/commerce", "Commerce — financial aid queue and plan settings");
  page("academy", "student1", "account", "Account — subscriptions and financial aid");
  page("academy", "designer", "t/program-studio", "Program Studio — design packages for #1–#11");
  for (const [sec, title] of [["dashboard", "Dashboard"], ["programs", "Programs & Design Studio"], ["alignment?program=%232", "Alignment Matrix (#2)"], ["skills", "Skills & Roles Map"], ["standards", "Standards Mapper"], ["pathways", "Pathways & Consolidation"], ["health", "Course Health"], ["assessment", "Assessment Lab"], ["freshness", "Freshness"], ["accessibility", "Accessibility"], ["proposals", "Proposals & Approvals"], ["exchange", "Curriculum Exchange"], ["reports", "Reports"]] as const) page("academy", "designer", `cci/${sec}`, `Curriculum Intelligence — ${title}`);
  const ca = as("academy", "admin");
  const cmp = ca.store.list("campaigns", (c) => c.key === "genai-2027")[0];
  for (const x of kitAssets(ca.store, cmp).filter((k) => k.kind === "html")) {
    const body = x.body.replace(/src="\/brand\//g, 'src="brand/');
    const m = CRASH.exec(body);
    if (m) failures.push(`campaign-${x.path}: ${body.slice(m.index - 80, m.index + 80)}`);
    fs.writeFileSync(path.join(OUT, `campaign-${x.path}`), body);
    index.push({ file: `campaign-${x.path}`, title: `#39 kit — ${x.title}`, who: "admin@academy" });
  }
  const at = broker.tenant("academy")!;
  save("academy-public-changelog.html", "Catalog changelog", "public", <PublicFrame tenant={at}><PublicChangelog store={ca.store} /></PublicFrame>);
}

const list = index.map((i) => `<li><a href="${i.file}">${i.title}</a> <small>(${i.who})</small></li>`).join("");
fs.writeFileSync(path.join(OUT, "index.html"), doc("Campus screens", `<main class="container campus-public-main"><h1 class="page-title">Scholarion Campus — rendered screens</h1><p>${index.length} screens rendered from the real views and seeded data.</p><ol>${list}</ol></main>`));
console.log(`rendered ${index.length} screens to ${OUT}`);
if (failures.length) {
  console.error(`${failures.length} render problem(s):\n${failures.join("\n")}`);
  if (check) process.exit(1);
}
