/**
 * Renders the campus UI to static HTML for every tab and the key flows, as real users
 * (seeded personas), without a running server. Used by the UI test (fails on any render
 * error), the accessibility (axe) check and the hosted preview.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/campus-render.tsx [--check]
 */
import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "../src/campus";
import { broker, type TenantStore } from "../src/campus/core";
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

process.env.CAMPUS_LOGS = "0";
process.env.CLOUDLAB_LOCAL_RUNNER ??= "1";
const check = process.argv.includes("--check");
const OUT = path.join(process.cwd(), "preview", "campus");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
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
  fs.writeFileSync(path.join(OUT, file), doc(title, html));
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
page("academy", "instructor", "courses/crs_academy_p15/modules", "#15 course shell (weekends)");
page("academy", "instructor", "courses/crs_academy_p32/modules", "#32 self-paced course (modules)");
page("academy", "instructor", "courses/crs_academy_p26/modules", "#26 course shell (modules)");
page("academy", "admin", "t/pathways?run=pathways.consolidation_report", "Consolidation report");

const list = index.map((i) => `<li><a href="${i.file}">${i.title}</a> <small>(${i.who})</small></li>`).join("");
fs.writeFileSync(path.join(OUT, "index.html"), doc("Campus screens", `<main class="container campus-public-main"><h1 class="page-title">Scholarion Campus — rendered screens</h1><p>${index.length} screens rendered from the real views and seeded data.</p><ol>${list}</ol></main>`));
console.log(`rendered ${index.length} screens to ${OUT}`);
if (failures.length) {
  console.error(`${failures.length} render problem(s):\n${failures.join("\n")}`);
  if (check) process.exit(1);
}
