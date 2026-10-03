/**
 * Renders key screens to static HTML in ./preview using the real views, BFF read
 * models and seeded platform state. Used for design review and the hosted preview.
 * Client components render their initial state only (no hydration).
 *
 *   npm run preview:render
 */
import fs from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as V from "../src/bff/views";
import { authoring, catalog, commerce, ensurePlatform, identity, lms } from "../src/platform";
import { getDb } from "../src/platform/store";
import { AdminHomeView, AdminClaimsView, AdminCourseReviewsView, AdminModerationView } from "../src/ui/views/admin";
import { SecurityView } from "../src/ui/views/account";
import { ApplyView } from "../src/ui/views/admissions";
import { ArticleView, HubView } from "../src/ui/views/content";
import { TeachCourseView, TeachItemView } from "../src/ui/views/teach";
import { NotificationsView } from "../src/ui/views/learner";
import { OrgView } from "../src/ui/views/teams";
import { AccountView, CourseHomeView, CredentialsView, DashboardView, GradebookView, ItemView, LiveView, ModuleView } from "../src/ui/views/learner";
import { CheckoutView, ExploreView, HomeView, LoginView, PlusView, ProductView, ProgramsView, TeamsView, VerifyView } from "../src/ui/views/public";

process.env.CLOUDLAB_LOCAL_RUNNER = "1";
ensurePlatform();

const OUT = path.join(process.cwd(), "preview");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "brand"), { recursive: true });
for (const f of ["scholarion-emblem.png", "scholarion-logo-full.png"]) fs.copyFileSync(path.join("public/brand", f), path.join(OUT, "brand", f));
const css = fs.readFileSync("src/ui/styles/globals.css", "utf8");

// Demo activity so screens show real flows: Amara earns the Agentic AI Foundations badge.
const amara = identity.getUser("usr_amara")!;
const viewer = V.viewerOf(amara)!;
lms.enroll(amara.id, "prd_agentic_foundations", "full");
for (const i of catalog.items("prd_agentic_foundations")) {
  lms.recordProgress(amara.id, i.id, "completed");
  if (i.graded) lms.postGrade({ userId: amara.id, itemId: i.id, score: 3, max: 3, source: "quiz" });
}
const badge = getDb().credentials.find((c) => c.userId === amara.id)!;
// Amara submits the peer-reviewed Module 5 project so the review form shows.
lms.submitProject(amara.id, "itm_cop1047c_m5_project", "Records in a dict, four functions, a search and input validation. Short PDF report attached.", "amara_records.py");
const orgAdmin = identity.getUser("usr_orgadmin")!;
const checkout = commerce.createCheckout({ userId: "usr_tunde", plan: "plus_monthly", productId: null, idempotencyKey: "preview" });

// Course builder: the instructor drafts a short course (quiz still needs questions, so the checklist shows).
const fac = identity.getUser("usr_faculty")!;
const draft = authoring.createCourse(fac.id, { title: "Prompt Design Basics", level: "Beginner", skills: "Prompt engineering, LLM evaluation" });
authoring.updateCourse(fac.id, draft.id, { tagline: "Write prompts that work the first time", description: "A short, hands-on course on structuring prompts, giving examples and checking model output before you rely on it at work.", whatYoullLearn: "Structure a prompt\nUse examples well\nCheck output before relying on it" });
authoring.addModule(fac.id, draft.id, { title: "Prompt structure", overview: "Roles, context, format and examples." });
const rd = authoring.addItem(fac.id, draft.id, 1, "reading", "Anatomy of a prompt");
authoring.updateItem(fac.id, rd.id, { body: "A good prompt states the task, the context, the format you want back and one example of a good answer." });
const vid = authoring.addItem(fac.id, draft.id, 1, "video", "Walkthrough: rewriting a vague prompt");
authoring.updateItem(fac.id, vid.id, { src: "https://media.example/walkthrough.mp4", captions: "en, es, fr", transcript: "In this walkthrough we take a vague one-line prompt and rewrite it step by step into a structured one." });
const qz = authoring.addItem(fac.id, draft.id, 1, "quiz", "Check your understanding");
authoring.addQuestion(fac.id, qz.id, { prompt: "Which part of a prompt tells the model how to shape its answer?", options: "The format instruction\nThe greeting\nThe model name", answer: "1", explanation: "The format instruction sets the structure of the answer." });
// Ngozi (graduate) sees the verified-review form on Agentic AI Foundations.
const ngozi = identity.getUser("usr_ngozi")!;
// Tunde's live application (#15) is in review.
const tunde = identity.getUser("usr_tunde")!;

const ROUTES: Record<string, string> = {
  "/": "home.html",
  "/explore": "explore.html",
  "/programs": "programs.html",
  "/plus": "plus.html",
  "/login": "login.html",
  "/learn/python-programming-cop1047c": "course-page.html",
  "/app": "dashboard.html",
  "/app/course/prd_cop1047c": "course-home.html",
  "/app/course/prd_cop1047c/module/5": "module-5.html",
  "/app/course/prd_cop1047c/item/itm_cop1047c_m5_lab": "mini-lab.html",
  "/app/course/prd_cop1047c/item/itm_cop1047c_m5_quiz": "quiz.html",
  "/app/course/prd_cop1047c/item/itm_cop1047c_m5_project": "mini-project.html",
  "/app/course/prd_cop1047c/item/itm_cop1047c_capstone": "capstone.html",
  "/app/course/prd_cop1047c/grades": "gradebook.html",
  "/app/credentials": "credentials.html",
  "/app/live": "live.html",
  "/app/account": "account.html",
  [`/verify/${badge.id}`]: "verify.html",
  "/admin": "admin.html",
  "/admin/claims": "claims.html",
  [`/checkout/${checkout.id}`]: "checkout.html",
  "/org/org_brightpath": "org.html",
  "/teams": "teams.html",
  "/app/course/prd_cop1047c/item/itm_cop1047c_m5_discussion": "discussion.html",
  "/admin/moderation": "moderation.html",
  "/learn/15-advanced-certificate-in-agentic-ai-engineering-weekend-intensive/apply": "apply.html",
  "/app/security": "security.html",
  "/app/notifications": "notifications.html",
  [`/teach/${draft.id}`]: "teach-course.html",
  [`/teach/${draft.id}/item/${qz.id}`]: "teach-quiz.html",
  "/hubs/agentic-ai": "hub.html",
  "/blog/how-to-choose-your-first-ai-course": "article.html",
  "/learn/agentic-ai-foundations": "reviews.html",
};

const pages: [string, string, ReactElement][] = [
  ["home.html", "Home", <HomeView viewer={null} vm={V.homeVM()} />],
  ["explore.html", "Explore", <ExploreView viewer={null} vm={V.exploreVM({ q: "agentic ai", free: "1" })} />],
  ["programs.html", "How the programs stack", <ProgramsView viewer={null} vm={V.pathwayVM()} />],
  ["plus.html", "Scholarion Plus", <PlusView viewer={null} plans={V.homeVM().plans} />],
  ["login.html", "Sign in", <LoginView demo={[{ label: "Learner", email: "amara@demo.scholarion.test", password: "LearnEarnBuild1" }]} />],
  ["course-page.html", "Course page", <ProductView viewer={null} vm={V.productVM("python-programming-cop1047c", null)!} flash={{}} />],
  ["dashboard.html", "Dashboard", <DashboardView viewer={viewer} vm={V.dashboardVM(amara.id)} flash={{}} />],
  ["course-home.html", "Course home", <CourseHomeView viewer={viewer} vm={V.courseHomeVM(amara.id, "prd_cop1047c")!} flash={{}} />],
  ["module-5.html", "Module 5", <ModuleView viewer={viewer} vm={V.moduleVM(amara.id, "prd_cop1047c", 5)!} />],
  ["mini-lab.html", "Mini Lab 2", <ItemView viewer={viewer} vm={V.itemVM(amara.id, "prd_cop1047c", "itm_cop1047c_m5_lab")!} flash={{}} />],
  ["quiz.html", "Scenario quiz", <ItemView viewer={viewer} vm={V.itemVM(amara.id, "prd_cop1047c", "itm_cop1047c_m5_quiz")!} flash={{}} />],
  ["mini-project.html", "Mini project", <ItemView viewer={viewer} vm={V.itemVM(amara.id, "prd_cop1047c", "itm_cop1047c_m5_project")!} flash={{}} />],
  ["capstone.html", "Capstone", <ItemView viewer={viewer} vm={V.itemVM(amara.id, "prd_cop1047c", "itm_cop1047c_capstone")!} flash={{}} />],
  ["gradebook.html", "Gradebook", <GradebookView viewer={viewer} vm={V.gradebookVM(amara.id, "prd_cop1047c")!} />],
  ["credentials.html", "Credentials", <CredentialsView viewer={viewer} vm={V.credentialsVM(amara.id)} />],
  ["live.html", "Live sessions", <LiveView viewer={viewer} vm={V.liveVM(amara.id)} flash={{}} />],
  ["account.html", "Account & billing", <AccountView viewer={viewer} vm={V.accountVM(amara)} flash={{}} />],
  ["verify.html", "Verification", <VerifyView viewer={null} vm={V.verifyVM(badge.id)} />],
  ["admin.html", "Staff & admin", <AdminHomeView viewer={{ id: "usr_admin", name: "Platform Admin", roles: ["platform_admin"] }} vm={V.adminVM()} flash={{}} />],
  ["claims.html", "Claims checker", <AdminClaimsView viewer={{ id: "usr_admin", name: "Platform Admin", roles: ["platform_admin"] }} vm={V.claimsVM("Earn an accredited degree with transferable college credit. Graduates earn $95,000 per year. Developed with Lakeside University.")} />],
  ["org.html", "Organization dashboard", <OrgView viewer={V.viewerOf(orgAdmin)!} vm={V.orgVM("org_brightpath", orgAdmin.id)} flash={{}} origin="http://localhost:3000" />],
  ["teams.html", "Scholarion for Teams", <TeamsView viewer={V.viewerOf(orgAdmin)} flash={{}} quote={V.teamsQuote(10)} />],
  ["discussion.html", "Module 5 discussion", <ItemView viewer={viewer} vm={V.itemVM(amara.id, "prd_cop1047c", "itm_cop1047c_m5_discussion")!} flash={{}} />],
  ["moderation.html", "Moderation", <AdminModerationView viewer={{ id: "usr_admin", name: "Platform Admin", roles: ["platform_admin"] }} vm={V.moderationVM()} flash={{}} />],
  ["apply.html", "Live program application", <ApplyView viewer={V.viewerOf(tunde)} vm={V.applyVM("15-advanced-certificate-in-agentic-ai-engineering-weekend-intensive", tunde.id)!} flash={{}} />],
  ["security.html", "Security & privacy", <SecurityView viewer={viewer} vm={{ email: amara.email, emailVerified: true, mfaEnabled: false, mfaEnabledAt: null, setup: null, sessions: [{ createdAt: new Date().toISOString(), current: true }], required: false, passwordChangedAt: null }} flash={{}} />],
  ["notifications.html", "Notifications", <NotificationsView viewer={V.viewerOf(amara)!} notices={V.notificationsVM(amara)} />],
  ["teach-course.html", "Course builder", <TeachCourseView viewer={V.viewerOf(fac)!} vm={V.teachCourseVM(fac.id, draft.id)!} flash={{}} />],
  ["teach-quiz.html", "Quiz builder", <TeachItemView viewer={V.viewerOf(fac)!} vm={V.teachItemVM(fac.id, qz.id)!} flash={{}} />],
  ["hub.html", "Agentic AI topic hub", <HubView viewer={null} vm={V.hubVM("agentic-ai")!} />],
  ["article.html", "Blog article", <ArticleView viewer={null} vm={V.articleVM("how-to-choose-your-first-ai-course")!} />],
  ["reviews.html", "Verified reviews", <ProductView viewer={V.viewerOf(ngozi)} vm={V.productVM("agentic-ai-foundations", ngozi.id)!} flash={{}} />],
  ["checkout.html", "Sandbox checkout", <CheckoutView viewer={{ id: "usr_tunde", name: "Tunde Bello", roles: ["learner"] }} vm={V.checkoutVM(checkout.id, "usr_tunde")!} />],
];

const qrPlaceholder = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1z" fill="none" stroke="#0b1f4d" stroke-width="1.2"/><path d="M3 3h3v3H3zM15 3h3v3h-3zM3 15h3v3H3zM10 2h1v2h-1zM10 6h2v1h-2zM9 9h3v3H9zM14 10h2v2h-2zM18 10h1v3h-1zM10 14h1v5h-1zM13 14h3v1h-3zM15 16h4v1h-4zM13 18h2v2h-2zM17 18h3v2h-3z" fill="#0b1f4d"/></svg>')}`;

function rewrite(html: string): string {
  return html
    .replace(/(href|action)="(\/[^"#?]*)([^"]*)"/g, (_m, attr, p, rest) => {
      if (ROUTES[p]) return `${attr}="${ROUTES[p]}"`;
      if (p.startsWith("/brand/")) return `${attr}="${p.slice(1)}"`;
      return `${attr}="#" data-route="${p}${rest}"`;
    })
    .replace(/src="\/brand\//g, 'src="brand/')
    .replace(/src="\/api\/v1\/credentials\/[^"]+\/qr"/g, `src="${qrPlaceholder}"`);
}

for (const [file, title, el] of pages) {
  const body = rewrite(renderToStaticMarkup(el));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Scholarion Academy</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet"><style>${css}</style></head><body>${body}</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html);
}
console.log(`Rendered ${pages.length} screens to ${OUT}`);
