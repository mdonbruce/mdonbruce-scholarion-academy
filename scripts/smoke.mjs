/**
 * Smoke test against a running server (CI runs it after `next build && next start`).
 * Loads every page as a visitor, a learner and an admin, and drives the key form flows.
 *   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failures = 0;

async function req(path, { method = "GET", cookie, form } = {}) {
  const headers = { origin: BASE };
  if (cookie) headers.cookie = cookie;
  let body;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  return fetch(BASE + path, { method, headers, body, redirect: "manual" });
}

async function expect(label, path, status, opts) {
  const r = await req(path, opts);
  const text = r.status === 200 ? await r.text() : "";
  const ok = r.status === status && !/Application error|Internal Server Error/.test(text);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.status} ${label} ${path}${ok ? "" : ` (expected ${status})`}`);
  return { r, text };
}

/** RFC 6238 TOTP for the seeded demo admin (two-step sign-in is on for that account). */
const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
function totp(secret) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const key = [];
  for (const ch of secret) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { key.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(key)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

async function signIn(email, password) {
  let r = await req("/api/v1/auth/signin", { method: "POST", form: { email, password, redirect: "/app" } });
  if (r.status === 303 && (r.headers.get("location") ?? "").includes("/login/mfa")) {
    const pending = r.headers.getSetCookie().find((x) => x.startsWith("sch_mfa="));
    await expect("two-step sign-in page", "/login/mfa", 200, { cookie: pending?.split(";")[0] });
    r = await req("/api/v1/auth/mfa", { method: "POST", cookie: pending?.split(";")[0], form: { code: totp(DEMO_ADMIN_TOTP_SECRET) } });
    if (r.status !== 303) failures++;
    console.log(`${r.status === 303 ? "ok  " : "FAIL"} ${r.status} admin two-step code accepted`);
  }
  const c = r.headers.getSetCookie().find((x) => !x.startsWith("sch_mfa="));
  if (r.status !== 303 || !c) {
    failures++;
    console.log(`FAIL sign in ${email} (${r.status})`);
    return "";
  }
  return c.split(";")[0];
}

const PUBLIC = ["/", "/explore", "/explore?q=agentic%20ai&free=1&level=Beginner", "/explore?q=pythn", "/programs", "/plus", "/pricing", "/financial-aid", "/teams", "/teams?kind=partner", "/help", "/help?q=cancel", "/verify", "/login", "/signup", "/learn/python-programming-cop1047c", "/learn/agentic-ai-foundations", "/learn/26-agentic-ai-systems-design-7-week-live-intensive", "/learn/17-generative-ai-professional-pathway", "/forgot-password", "/learn/26-agentic-ai-systems-design-7-week-live-intensive/apply", "/robots.txt", "/sitemap.xml", "/api/v1/status", "/api/v1/catalog/products?q=llm"];

const LEARNER = ["/app", "/app/courses", "/app/calendar", "/app/live", "/app/grades", "/app/credentials", "/app/tutor", "/app/proctoring", "/app/account", "/app/security", "/learn/26-agentic-ai-systems-design-7-week-live-intensive/apply", "/app/notifications", "/app/onboarding", "/app/course/prd_cop1047c", "/app/course/prd_cop1047c/modules", "/app/course/prd_cop1047c/module/5", "/app/course/prd_cop1047c/grades", "/app/course/prd_cop1047c/resources", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_lesson", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_reading", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_lab", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_quiz", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_project", "/app/course/prd_cop1047c/item/itm_cop1047c_capstone", "/app/course/prd_cai4505c/module/6", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_discussion", "/app/course/prd_cai4505c/item/itm_cai4505c_m6_discussion", "/financial-aid/apply?product=16-certificate-in-agentic-ai-for-developers"];

const ADMIN = ["/admin", "/admin/admissions", "/app/security", "/admin/moderation", "/admin/aid", "/admin/grading", "/admin/studio", "/admin/live", "/admin/support", "/admin/claims?text=accredited%20degree"];

console.log(`Smoke testing ${BASE}`);
for (const p of PUBLIC) await expect("public", p, 200);
await expect("hidden degrees", "/degrees", 404);
await expect("unknown page", "/learn/does-not-exist", 404);
await expect("app needs sign-in", "/app", 307);

const learner = await signIn("amara@demo.scholarion.test", "LearnEarnBuild1");
for (const p of LEARNER) await expect("learner", p, 200, { cookie: learner });
await expect("learner blocked from admin", "/admin/aid", 307, { cookie: learner });

// Flows: audit enrollment, Plus trial checkout, cancel, verify a credential.
const visitor = await signIn("tunde@demo.scholarion.test", "LearnEarnBuild2");
await expect("audit enroll", "/api/v1/lms/enrollments", 303, { method: "POST", cookie: visitor, form: { productId: "python-programming-cop1047c", level: "audit" } });
await expect("audited lab shows instructions", "/app/course/prd_cop1047c/item/itm_cop1047c_m1_lab", 200, { cookie: visitor });
const co = await req("/api/v1/commerce/checkout-sessions", { method: "POST", cookie: visitor, form: { plan: "plus_monthly" } });
const checkoutPath = co.headers.get("location") ?? "";
await expect("checkout page", checkoutPath, 200, { cookie: visitor });
await expect("confirm trial", `/api/v1${checkoutPath.replace("/checkout/", "/commerce/checkout-sessions/")}/confirm`, 303, { method: "POST", cookie: visitor, form: {} });
const acct = await expect("account after trial", "/app/account", 200, { cookie: visitor });
if (!/Free trial ends/.test(acct.text)) {
  failures++;
  console.log("FAIL account page does not show the trial");
}

// Discussion post + peer review flow as Amara.
await expect("post to discussion", "/api/v1/community/posts", 303, { method: "POST", cookie: learner, form: { itemId: "itm_cop1047c_m5_discussion", body: "Smoke test post about functions.", back: "/app/course/prd_cop1047c/item/itm_cop1047c_m5_discussion" } });
await expect("submit peer-reviewed project", "/api/v1/lms/submissions", 303, { method: "POST", cookie: learner, form: { itemId: "itm_cop1047c_m5_project", text: "Records system with four functions, search and validation.", back: "/app/course/prd_cop1047c/item/itm_cop1047c_m5_project" } });
const proj = await expect("peer review queue", "/app/course/prd_cop1047c/item/itm_cop1047c_m5_project", 200, { cookie: learner });
if (!/Review a classmate/.test(proj.text)) {
  failures++;
  console.log("FAIL project page has no peer review form");
}

// Teams: organization admin, isolation, invite page, SSO offer.
const orgAdmin = await signIn("orgadmin@demo.scholarion.test", "ScholarionTeams1");
const org = await expect("org dashboard", "/org/org_brightpath", 200, { cookie: orgAdmin });
if (!/Kemi Adeyemi/.test(org.text) || /Dayo Musa/.test(org.text)) {
  failures++;
  console.log("FAIL org dashboard shows the wrong people");
}
await expect("other org is off limits", "/org/org_riverbend", 307, { cookie: orgAdmin });
await expect("other org report blocked", "/api/v1/teams/orgs/org_riverbend/report.csv", 403, { cookie: orgAdmin });
const csv = await req("/api/v1/teams/orgs/org_brightpath/report.csv", { cookie: orgAdmin });
if (csv.status !== 200 || !/kemi@brightpath\.example/.test(await csv.text())) {
  failures++;
  console.log("FAIL CSV report");
} else console.log("ok   200 csv report");
await expect("teams page", "/teams", 200, { cookie: orgAdmin });
const chidi = await signIn("chidi@brightpath.example", "LearnEarnBuild4");
const dash = await expect("sso offer on dashboard", "/app", 200, { cookie: chidi });
if (!/Sign in with (<!-- -->)?Brightpath/.test(dash.text)) {
  failures++;
  console.log("FAIL dashboard has no organization sign-in offer");
}
await expect("join via org sign-in", "/api/v1/teams/orgs/org_brightpath/sso-join", 303, { method: "POST", cookie: chidi, form: { back: "/app" } });
await expect("seat gives lab access", "/app/course/prd_cop1047c/item/itm_cop1047c_m1_lab", 200, { cookie: chidi });
await expect("bad invite link", "/join/not-a-token", 200);

// Graduate: certificate PDF and a verified review.
const grad = await signIn("ngozi@demo.scholarion.test", "LearnEarnBuild5");
const creds = await expect("graduate credentials", "/app/credentials", 200, { cookie: grad });
const credId = (creds.text.match(/\/api\/v1\/credentials\/(crd_[\w-]+)\/pdf/) ?? [])[1];
const pdf = credId ? await req(`/api/v1/credentials/${credId}/pdf`, { cookie: grad }) : null;
const pdfHead = pdf && pdf.status === 200 ? Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() : "";
if (pdfHead !== "%PDF-") {
  failures++;
  console.log(`FAIL certificate PDF (${pdf?.status ?? "no link"})`);
} else console.log("ok   200 certificate PDF");
if (credId) await expect("PDF is private to the holder", `/api/v1/credentials/${credId}/pdf`, 404, { cookie: learner });
await expect("post verified review", "/api/v1/reviews", 303, { method: "POST", cookie: grad, form: { productId: "prd_agentic_foundations", rating: "4", title: "Practical labs", body: "The agent loop and tool-calling labs were clear and hands-on. I wanted more on evaluation." } });
const prod = await expect("product shows review", "/learn/agentic-ai-foundations", 200);
if (!/Practical labs/.test(prod.text) || !/AggregateRating/.test(prod.text)) {
  failures++;
  console.log("FAIL product page is missing the review or its rating data");
}
await expect("non-holder cannot review", "/api/v1/reviews", 303, { method: "POST", cookie: learner, form: { productId: "prd_agentic_foundations", rating: "5", title: "Nope", body: "I have not earned this credential so this must be refused." } });
const reviewsJson = await (await req("/api/v1/catalog/products/agentic-ai-foundations/reviews")).json();
if (reviewsJson.summary?.count !== 1) {
  failures++;
  console.log(`FAIL reviews API count ${reviewsJson.summary?.count}`);
} else console.log("ok   200 reviews API");

// Live admissions: apply as Tunde.
const tunde = await signIn("tunde@demo.scholarion.test", "LearnEarnBuild2");
await expect("apply to live program", "/api/v1/live/applications", 303, { method: "POST", cookie: tunde, form: { productId: "prd_p26", experience: "Two years building Python data pipelines and a small LangChain prototype at work.", motivation: "I want to design a production agent with evaluation and guardrails for our support team." } });
const app = await expect("application status", "/learn/26-agentic-ai-systems-design-7-week-live-intensive/apply", 200, { cookie: tunde });
if (!/In review/.test(app.text)) {
  failures++;
  console.log("FAIL application not shown as in review");
}

const admin = await signIn("admin@demo.scholarion.test", "ScholarionAdmin1");
for (const p of ADMIN) await expect("admin", p, 200, { cookie: admin });
const status = await (await req("/api/v1/status")).json();
console.log(`status board: ${status.capabilities.map((c) => `${c.key}=${c.status}`).join(", ")}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
