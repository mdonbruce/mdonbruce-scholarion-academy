import { config } from "../communications/_lib";
import { isOakHavenStaff } from "@/lib/access";
import { classifyWith, retrieveGuidance, planFlow, redact, gradeComplete, gradeTotal, letter, prerequisiteMet, canAdvance, sampleData, computeKpis, INTENTS, STAGES, type GradeItem } from "@/lib/cx-intelligence";
import { aiStatus, generate, parseJson, TASKS } from "@/lib/ai";
import { db, T, nid, currentApp, event, getRec, listKind, upsert, upsertPlatform, loadApps, runInApp, databaseFor } from "@/lib/agentic-server";
import { PACKS, DEFAULT_APP, appSlug, canAccessApp, effectiveRedact, secretName, type AppDef, type PackId } from "@/lib/apps";

const clean = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const num = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
const list = (v: unknown, n = 20, len = 120) => Array.isArray(v) ? v.map(x => clean(x, len)).filter(Boolean).slice(0, n) : [];
const channels = ["Web", "Mobile", "Voice", "Email", "SMS", "WhatsApp", "Instagram", "Messenger", "X", "Facebook"];
const basePersonas = ["Alex", "Amara", "Kyle", "Amara"];
const KINDS = ["persona", "context", "session", "knowledge", "flow", "course", "grade", "applicant", "faculty", "campaign", "routing", "label", "insight", "journey", "widget", "alert", "settings", "roi"];
const AGENT_FOR_TASK: Record<string, string> = { reply: "Omnichannel Resolution", summary: "Agent Copilot", article: "Insights & Knowledge Gap", insights: "Insights & Knowledge Gap", journey: "Insights & Knowledge Gap", campaign: "Marketing & Campaign", widget: "Insights & Knowledge Gap", instructions: "Orchestrator", student: "Admissions & Registration", orchestrator: "Orchestrator" };
const allow = (key: string) => String(config()[key] || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
const isAdmin = (email: string) => allow("HAVEN_XCONNECT_ADMIN_EMAILS").includes(email.toLowerCase());
const educationAccess = (email: string) => isAdmin(email) || allow("HAVEN_CX_EDU_EMAILS").includes(email.toLowerCase());
const gradeApprover = (email: string) => isAdmin(email) || allow("HAVEN_GRADE_APPROVER_EMAILS").includes(email.toLowerCase());
const DEFAULT_SETTINGS = { agentsPaused: {} as Record<string, boolean>, redact: { PII: true, PCI: true, PHI: true, FERPA: true }, packs: { saas: true, ecom: false, fin: true, health: false, mobile: false, edu: true, hosp: true }, brand: "Warm, direct and specific. Never over-promise. Always offer the next step.", slaHours: 4, retentionDays: 365 };

const states = () => {
  const c = config();
  return { Web: "Local workspace", Mobile: "Awaiting mobile SDK", Voice: c.HAVEN_COMMUNICATIONS_GATEWAY_URL && c.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN ? "Gateway configured · test required" : "Awaiting voice gateway", Email: c.HAVEN_EMAIL_GATEWAY_URL ? "Gateway configured · test required" : "Awaiting email gateway", SMS: c.HAVEN_COMMUNICATIONS_GATEWAY_URL && c.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN ? "Gateway configured · test required" : "Awaiting messaging gateway", WhatsApp: c.HAVEN_WHATSAPP_GATEWAY_URL && c.HAVEN_WHATSAPP_GATEWAY_TOKEN ? "Gateway configured · test required" : "Awaiting Meta connection", Instagram: "Awaiting Meta connection", Messenger: "Awaiting Meta connection", X: "Awaiting X connection", Facebook: "Awaiting Meta connection" } as Record<string, string>;
};
const scholarisConfigured = () => Boolean(config().SCHOLARIS_API_URL && config().SCHOLARIS_API_TOKEN);
const scholarisTenant = () => currentApp().scholarisTenant || String(config().SCHOLARIS_TENANT_ID || "oakhaven-global-university");
async function settings() { const s = await getRec(nid("settings:agentic"), "settings"); const merged = { ...DEFAULT_SETTINGS, ...(s || {}) }; return { ...merged, packs: { ...merged.packs, edu: Boolean(merged.packs?.edu) && currentApp().education }, redact: effectiveRedact(currentApp().pack, merged.redact) }; }
/** Signed-in identity from the hosting sign-in headers. Oak Haven staff and product-room members (any domain) may continue. */
const identify = (request: Request) => { const email = String(request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase(); if (!email) throw new Error("Sign in to use HavenConnect"); return { email, staff: isOakHavenStaff(email) }; };
const deny = (msg: string, status = 403) => Response.json({ error: msg }, { status });
const fail = (e: unknown) => { const msg = e instanceof Error ? e.message : "HavenConnect AI is unavailable"; return Response.json({ error: msg }, { status: /Sign in/.test(msg) ? 401 : /not allowed/.test(msg) ? 403 : /No workspace/.test(msg) ? 404 : 503 }); };

/** Resolve the requested app (room), check the viewer may enter it, and run the handler inside its scope. */
async function inApp<R>(request: Request, requested: unknown, fn: (user: { email: string }, app: AppDef, apps: AppDef[]) => Promise<R>): Promise<R> {
  const user = identify(request), apps = await loadApps();
  const slug = appSlug(String(requested || "")) || DEFAULT_APP, app = apps.find(a => a.slug === slug);
  if (!app) throw new Error(`No workspace called ${slug}`);
  if (!canAccessApp(app, user.email, isAdmin(user.email), isOakHavenStaff(user.email))) throw new Error(`You're not allowed into ${app.name}. Ask an administrator to add you as a member.`);
  return runInApp(app, () => fn(user, app, apps));
}
const appView = (a: AppDef, email: string) => { const d = databaseFor(a); return { ...a, pack: a.pack, packLabel: PACKS[a.pack]?.label, databaseBound: d.bound, databaseBinding: d.binding, inboundConfigured: Boolean(config()[secretName(a.slug)]), inboundSecret: secretName(a.slug), canEnter: canAccessApp(a, email, isAdmin(email), isOakHavenStaff(email)) }; };

async function access(email: string) {
  const courses = await listKind("course");
  const instructorSections = courses.filter(c => String(c.instructorEmail || "").toLowerCase() === email.toLowerCase()).map(c => c.code);
  const edu = educationAccess(email);
  const canSeeContext = (ctx: any) => edu || (ctx?.type === "Student" && (ctx.sections || []).some((s: string) => instructorSections.includes(s)));
  const canEditGrade = (section: string) => edu || instructorSections.includes(section);
  return { edu, admin: isAdmin(email), instructorSections, canSeeContext, canEditGrade };
}

function sanitize(kind: string, s: any, prior: any | null) {
  const keep = (k: string, d: unknown) => (s[k] !== undefined ? s[k] : prior?.[k] !== undefined ? prior[k] : d);
  switch (kind) {
    case "persona": {
      const name = clean(s.name || prior?.name, 30); if (!name) throw new Error("Persona name is required");
      return { name, tone: clean(keep("tone", "Friendly"), 30), industry: clean(keep("industry", "Education"), 40), locale: clean(keep("locale", "English (US)"), 30), greeting: clean(keep("greeting", `Hi, I'm ${name}. How can I help?`), 300), role: clean(keep("role", ""), 80), instructions: clean(keep("instructions", ""), 3000),
        pitch: num(keep("pitch", 1), 0, 2, 1), speed: num(keep("speed", 1), .5, 2, 1), intonation: num(keep("intonation", 50), 0, 100, 50), stability: num(keep("stability", 50), 0, 100, 50),
        channels: list(keep("channels", ["Web"]), 11, 20).filter(x => channels.includes(x)), actions: list(keep("actions", []), 12), guard: clean(keep("guard", "Standard"), 30), stage: clean(keep("stage", "Idea"), 30),
        status: "Draft", publishedVersion: prior?.publishedVersion || 0 };
    }
    case "context": {
      const d = { name: clean(keep("name", ""), 120), type: ["Student", "Customer"].includes(keep("type", "Student") as string) ? keep("type", "Student") : "Student", reference: clean(keep("reference", ""), 80), note: clean(keep("note", ""), 1000),
        program: clean(keep("program", ""), 120), year: num(keep("year", 1), 0, 8, 1), email: clean(keep("email", ""), 160), advisor: clean(keep("advisor", ""), 120), status: clean(keep("status", "Active"), 30),
        sections: list(keep("sections", []), 12, 20), completed: list(keep("completed", []), 60, 20), holds: list(keep("holds", []), 10, 120), gpa: num(keep("gpa", 0), 0, 4, 0), scholarisStudentId: clean(keep("scholarisStudentId", ""), 60), sample: Boolean(prior?.sample) };
      if (!d.name || !d.reference) throw new Error("Name and reference are required"); return d;
    }
    case "knowledge": { const d = { title: clean(keep("title", ""), 180), content: clean(keep("content", ""), 10000), domain: clean(keep("domain", "General"), 50), source: clean(keep("source", ""), 200), status: "Draft", gapIntent: clean(keep("gapIntent", ""), 80), sample: Boolean(prior?.sample) }; if (!d.title || !d.content) throw new Error("Title and content are required"); return d; }
    case "flow": {
      const nodes = Array.isArray(keep("nodes", [])) ? (keep("nodes", []) as any[]).slice(0, 40).map((n: any) => ({ id: clean(n.id, 20), type: clean(n.type, 20), title: clean(n.title, 60), desc: clean(n.desc, 120), x: num(n.x, 0, 2000, 40), y: num(n.y, 0, 1200, 40) })) : [];
      const edges = Array.isArray(keep("edges", [])) ? (keep("edges", []) as any[]).slice(0, 80).map((e: any) => [clean(e[0], 20), clean(e[1], 20)]) : [];
      const steps = list(keep("steps", []), 12, 180);
      const d = { name: clean(keep("name", ""), 120), trigger: clean(keep("trigger", ""), 120), steps: steps.length ? steps : nodes.filter((n: any) => n.type !== "trigger").map((n: any) => `${n.title}${n.desc ? ` — ${n.desc}` : ""}`).slice(0, 12), nodes, edges, status: "Draft", requiresApproval: true, sample: Boolean(prior?.sample) };
      if (!d.name || !d.trigger || !d.steps.length) throw new Error("Name, trigger, and at least one step are required"); return d;
    }
    case "course": { const d = { code: clean(keep("code", ""), 20).toUpperCase(), name: clean(keep("name", ""), 120), instructor: clean(keep("instructor", ""), 120), instructorEmail: clean(keep("instructorEmail", ""), 160).toLowerCase(), cap: num(keep("cap", 30), 1, 1000, 30), enrolled: num(keep("enrolled", 0), 0, 1000, 0), wait: num(keep("wait", 0), 0, 1000, 0), prereq: clean(keep("prereq", ""), 20).toUpperCase(), days: clean(keep("days", ""), 60), mode: clean(keep("mode", "On campus"), 30), scholarisSectionId: clean(keep("scholarisSectionId", ""), 60), components: Array.isArray(keep("components", null)) ? keep("components", null) : null, sample: Boolean(prior?.sample) }; if (!d.code || !d.name) throw new Error("Course code and name are required"); return d; }
    case "applicant": { const docs = typeof keep("docs", null) === "object" && keep("docs", null) ? keep("docs", {}) : { Application: false, Transcript: false, "ID verification": false, Essay: false }; const d = { name: clean(keep("name", ""), 120), program: clean(keep("program", ""), 120), stage: STAGES.includes(keep("stage", "Inquiry") as string) ? keep("stage", "Inquiry") : "Inquiry", docs, email: clean(keep("email", ""), 160), sample: Boolean(prior?.sample) }; if (!d.name) throw new Error("Applicant name is required"); return d; }
    case "faculty": { const d = { name: clean(keep("name", ""), 120), title: clean(keep("title", ""), 60), dept: clean(keep("dept", ""), 60), qual: clean(keep("qual", ""), 30), exp: num(keep("exp", 0), 0, 70, 0), status: clean(keep("status", "Active"), 20), load: num(keep("load", 0), 0, 60, 0), pubs: num(keep("pubs", 0), 0, 5000, 0), email: clean(keep("email", ""), 160), sample: Boolean(prior?.sample) }; if (!d.name) throw new Error("Name is required"); return d; }
    case "campaign": { const d = { name: clean(keep("name", ""), 120), segment: clean(keep("segment", ""), 120), channel: channels.includes(keep("channel", "Email") as string) ? keep("channel", "Email") : "Email", trigger: clean(keep("trigger", ""), 120), scheduledFor: clean(keep("scheduledFor", ""), 40), copyA: clean(keep("copyA", ""), 1200), copyB: clean(keep("copyB", ""), 1200), status: "Draft" }; if (!d.name || !d.copyA) throw new Error("Campaign name and message are required"); return d; }
    case "routing": { const d = { intent: INTENTS.includes(keep("intent", "") as string) ? keep("intent", "") : "", persona: clean(keep("persona", ""), 30), department: clean(keep("department", ""), 60), priority: keep("priority", "Normal") === "High" ? "High" : "Normal", status: keep("status", "Active") === "Disabled" ? "Disabled" : "Active" }; if (!d.intent) throw new Error("Choose an intent"); return d; }
    case "label": { const d = { text: clean(keep("text", ""), 200), label: INTENTS.includes(keep("label", "") as string) ? keep("label", "") : "", predicted: clean(keep("predicted", ""), 60), sessionId: clean(keep("sessionId", ""), 80) }; if (!d.text || !d.label) throw new Error("Text and label are required"); return d; }
    case "insight": return { title: clean(keep("title", ""), 200), kind: clean(keep("kind", "Emerging issue"), 40), impact: clean(keep("impact", "Medium"), 10), owner: clean(keep("owner", ""), 80), status: clean(keep("status", "New"), 20), recommendation: clean(keep("recommendation", ""), 600), module: clean(keep("module", ""), 30), source: clean(keep("source", "Staff"), 40) };
    case "journey": { const arr = (k: string, n = 8) => list(keep(k, []), n, 160); return { title: clean(keep("title", "Customer journey"), 120), stages: arr("stages", 8), activity: arr("activity"), emotion: (Array.isArray(keep("emotion", [])) ? (keep("emotion", []) as unknown[]) : []).slice(0, 8).map(x => num(x, -2, 1, 0)), thoughts: arr("thoughts"), pain: arr("pain"), opp: arr("opp"), touchpoints: arr("touchpoints"), capabilities: arr("capabilities"), kpis: arr("kpis"), agent: arr("agent") }; }
    case "widget": return { metric: clean(keep("metric", ""), 30), type: clean(keep("type", "bar"), 10), title: clean(keep("title", ""), 80), order: num(keep("order", 0), 0, 1e9, 0) };
    case "alert": return { key: clean(keep("key", ""), 120), status: ["Active", "Acknowledged", "Resolved"].includes(keep("status", "Active") as string) ? keep("status", "Active") : "Active", assignee: clean(keep("assignee", ""), 80), comments: (Array.isArray(keep("comments", [])) ? keep("comments", []) as any[] : []).slice(-20) };
    case "roi": return { volume: num(keep("volume", 1000), 0, 1e7, 1000), aht: num(keep("aht", 6), 0, 120, 6), cost: num(keep("cost", 8), 0, 1000, 8), target: num(keep("target", 20), 0, 100, 20), platform: num(keep("platform", 0), 0, 1e7, 0), impl: num(keep("impl", 0), 0, 1e8, 0), pains: list(keep("pains", []), 12, 120), goal: clean(keep("goal", ""), 200) };
    case "settings": { const d = { ...DEFAULT_SETTINGS, ...(prior || {}), ...(s || {}) }; return { agentsPaused: d.agentsPaused || {}, redact: d.redact, packs: d.packs, brand: clean(d.brand, 400), slaHours: num(d.slaHours, 1, 168, 4), retentionDays: num(d.retentionDays, 30, 3650, 365) }; }
    default: throw new Error("Unsupported record type");
  }
}

/** Final grades go to Scholaris Global Learning, the institution's LMS/SIS of record.
 * SCHOLARIS_API_STYLE=native (default) posts one grade submission per student and section.
 * SCHOLARIS_API_STYLE=canvas uses the Canvas-compatible submissions API exposed by Scholaris's LMS core. */
async function pushScholaris(grade: any, ctx: any, course: any) {
  const c = config(), at = new Date().toISOString();
  if (!scholarisConfigured()) return { status: "Not connected", at };
  const base = String(c.SCHOLARIS_API_URL).replace(/\/$/, ""), auth = { authorization: `Bearer ${c.SCHOLARIS_API_TOKEN}`, "content-type": "application/json" };
  const style = String(c.SCHOLARIS_API_STYLE || "native").toLowerCase();
  if (!course?.scholarisSectionId || !ctx?.scholarisStudentId) return { status: "Mapping required", error: "Add the Scholaris section ID for the course and the student's Scholaris ID", at };
  if (style === "canvas") {
    if (grade.items.some((i: GradeItem) => !i.scholarisComponentId)) return { status: "Mapping required", error: "Add a Scholaris assignment ID for every grade component", at };
    for (const item of grade.items as GradeItem[]) {
      const r = await fetch(`${base}/api/v1/courses/${encodeURIComponent(course.scholarisSectionId)}/assignments/${encodeURIComponent(String(item.scholarisComponentId))}/submissions/${encodeURIComponent(ctx.scholarisStudentId)}`, { method: "PUT", headers: auth, body: JSON.stringify({ submission: { posted_grade: String(item.score) } }) });
      if (!r.ok) return { status: "Failed", error: `Scholaris returned ${r.status} for ${item.n}`, at };
    }
    return { status: "Synced", at };
  }
  const total = gradeTotal(grade.items);
  const r = await fetch(`${base}/v1/tenants/${encodeURIComponent(scholarisTenant())}/grade-submissions`, {
    method: "POST", headers: { ...auth, "idempotency-key": `${grade.id}:v${grade.version || 1}` },
    body: JSON.stringify({ source: "havenconnect", studentId: ctx.scholarisStudentId, studentReference: ctx.reference, sectionId: course.scholarisSectionId, sectionCode: grade.section, components: grade.items.map((i: GradeItem) => ({ name: i.n, weight: i.w, score: i.score, componentId: i.scholarisComponentId || null })), total, letter: letter(total), status: "final", approvedBy: grade.approvedBy, approvedAt: grade.approvedAt, finalizedBy: grade.finalizedBy }),
  });
  if (!r.ok) return { status: "Failed", error: `Scholaris returned ${r.status}`, at };
  const j = await r.json().catch(() => ({})) as any;
  return { status: "Synced", reference: String(j.id || j.submissionId || ""), at };
}

const DEFAULT_COMPONENTS: [string, number][] = [["Module 1", 20], ["Midterm", 30], ["Final project", 50]];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url), scopeParam = url.searchParams.get("scope");
    if (scopeParam === "apps" || scopeParam === "portfolio") {
      const user = identify(request), apps = await loadApps(), mine = apps.filter(x => canAccessApp(x, user.email, isAdmin(user.email), isOakHavenStaff(user.email)));
      if (scopeParam === "apps") return Response.json({ platformAdmin: isAdmin(user.email), apps: apps.filter(x => isAdmin(user.email) || canAccessApp(x, user.email, false, isOakHavenStaff(user.email))).map(x => appView(x, user.email)) }, { headers: { "Cache-Control": "no-store" } });
      const rows = await Promise.all(mine.map(async x => {
        try {
          return await runInApp(x, async () => {
            const [r, e] = await Promise.all([db().prepare("SELECT id, kind, payload FROM cx_records WHERE tenant_id = ? AND kind = 'session' LIMIT 1000").bind(T()).all<any>(), db().prepare("SELECT session_id, event_type, details, created_at FROM cx_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 2000").bind(T()).all<any>()]);
            const recs = (r.results || []).map((y: any) => ({ ...JSON.parse(y.payload), id: y.id, kind: y.kind }));
            const evs = (e.results || []).map((y: any) => ({ sessionId: y.session_id, type: y.event_type, details: JSON.parse(y.details), createdAt: y.created_at }));
            return { slug: x.slug, name: x.name, color: x.color, status: x.status, pack: x.pack, kpis: computeKpis(recs, evs), sessions: recs.length, lastActivity: evs[0]?.createdAt || null };
          });
        } catch (err) { return { slug: x.slug, name: x.name, color: x.color, status: x.status, pack: x.pack, error: err instanceof Error ? err.message : "Unavailable" }; }
      }));
      return Response.json({ apps: rows }, { headers: { "Cache-Control": "no-store" } });
    }
    return await inApp(request, url.searchParams.get("app"), async (user, app, apps) => {
    const a = await access(user.email);
    const [records, events] = await Promise.all([
      db().prepare("SELECT * FROM cx_records WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1500").bind(T()).all<any>(),
      db().prepare("SELECT * FROM cx_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1500").bind(T()).all<any>(),
    ]);
    const rows = (records.results || []).map((r: any) => ({ ...JSON.parse(r.payload), id: r.id, kind: r.kind, version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by }));
    const contexts = new Map(rows.filter((r: any) => r.kind === "context").map((r: any) => [r.id, r]));
    const visibleContext = (id?: string | null) => !id || a.canSeeContext(contexts.get(id));
    const visible = rows.filter((r: any) => {
      if (r.kind === "context") return a.canSeeContext(r);
      if (r.kind === "session") return visibleContext(r.contextId);
      if (r.kind === "grade") return a.canEditGrade(r.section) && visibleContext(r.contextId);
      if (r.kind === "applicant") return a.edu;
      return true;
    });
    const evs = (events.results || []).filter((e: any) => visibleContext(e.context_id)).map((e: any) => ({ id: e.id, sessionId: e.session_id, contextId: e.context_id, channel: e.channel, type: e.event_type, actor: e.actor, details: JSON.parse(e.details), createdAt: e.created_at }));
    const st = await settings();
    return Response.json({ app: appView(app, user.email), pack: PACKS[app.pack as PackId], apps: apps.filter(x => canAccessApp(x, user.email, isAdmin(user.email), isOakHavenStaff(user.email))).map(x => ({ slug: x.slug, name: x.name, color: x.color, status: x.status, pack: x.pack })), viewer: { email: user.email, platformAdmin: isAdmin(user.email), educationAccess: a.edu, admin: a.admin, gradeApprover: gradeApprover(user.email), instructorSections: a.instructorSections }, records: visible, events: evs, connections: states(), ai: aiStatus(config()), lms: { configured: scholarisConfigured(), name: "Scholaris Global Learning", style: String(config().SCHOLARIS_API_STYLE || "native").toLowerCase(), tenant: scholarisTenant() }, settings: st }, { headers: { "Cache-Control": "no-store" } });
  });
  } catch (e) { return fail(e); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as any, action = clean(body.action, 40);
    if (action === "app.save") {
      const user = identify(request);
      if (!isAdmin(user.email)) return deny("Only platform administrators can add or change products");
      const apps = await loadApps(), src = body.data || {}, slug = appSlug(src.slug || src.name), prior = apps.find(x => x.slug === slug);
      if (!slug || !clean(src.name || prior?.name, 80)) return deny("Give the product a name", 400);
      const pack = (Object.keys(PACKS).includes(src.pack) ? src.pack : prior?.pack || "standard") as PackId;
      const data: AppDef = { slug, name: clean(src.name ?? prior?.name, 80), category: clean(src.category ?? prior?.category ?? "Not set yet", 80), description: clean(src.description ?? prior?.description ?? "", 400), pack,
        isolation: src.isolation === "dedicated" || (src.isolation === undefined && prior?.isolation === "dedicated") ? "dedicated" : "shared", education: Boolean(src.education ?? prior?.education), color: /^#[0-9a-f]{6}$/i.test(src.color || "") ? src.color : prior?.color || "#91a3aa",
        status: ["Live", "Pilot", "Planned", "Archived"].includes(src.status) ? src.status : prior?.status || "Planned", members: list(src.members ?? prior?.members ?? [], 200, 160).map(m => m.toLowerCase()), scholarisTenant: clean(src.scholarisTenant ?? prior?.scholarisTenant ?? "", 60) || undefined, parent: clean(src.parent ?? prior?.parent ?? "", 40) || undefined };
      if (prior && prior.isolation !== data.isolation && prior.status !== "Planned") return deny("Moving a live product between shared and dedicated storage needs a data migration; change it in a planned product or migrate first.", 409);
      await upsertPlatform(`app:${slug}`, "app", data, user.email);
      return Response.json({ ok: true, slug, result: `${data.name} saved` });
    }
    return await inApp(request, body.app, async (user, app) => {
    const a = await access(user.email), canView = a.edu;
    const st = await settings();

    if (action === "save") {
      const kind = clean(body.kind, 30), source = body.data || {};
      if (!KINDS.includes(kind) || kind === "grade") return deny("Unsupported record type", 400);
      if (["context", "course", "applicant"].includes(kind) && !canView) return deny("Education records require an authorized registrar or administrator");
      if (["routing", "settings"].includes(kind) && !a.admin) return deny("Only administrators can change routing and governance settings");
      if (kind === "faculty" && !(a.admin || canView)) return deny("Only administrators can edit the faculty directory");
      if (kind === "session") {
        const contextId = clean(source.contextId, 80);
        if (contextId) { const ctx = await getRec(contextId, "context"); if (!ctx) return deny("Context not found", 404); if (!a.canSeeContext(ctx)) return deny("This context is restricted"); }
        const channel = channels.includes(source.channel) ? source.channel : "Web";
        if (channel !== "Web") return deny("External channel sessions require a tested provider connection", 409);
        const personas = [...basePersonas, ...(await listKind("persona")).map(p => p.name)];
        const data = { contextId, persona: personas.includes(source.persona) ? source.persona : "Amara", channel, subject: clean(source.subject, 180) || "New inquiry", status: "Open", startedAt: new Date().toISOString() };
        const id = crypto.randomUUID();
        await upsert(id, "session", data, user.email);
        await event({ sessionId: id, contextId: data.contextId, type: "session.started", actor: user.email, details: { id, kind } });
        return Response.json({ id }, { status: 201 });
      }
      const id = kind === "persona" ? nid(`persona:${clean(source.name, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`) : kind === "settings" ? nid("settings:agentic") : kind === "roi" ? nid("roi:default") : kind === "alert" ? nid(`alert:${clean(source.key, 100)}`).slice(0, 120) : clean(body.id, 120) || crypto.randomUUID();
      const prior = await getRec(id);
      if (prior && prior.kind !== kind) return deny("Record type mismatch", 409);
      if (prior?.kind === "context" && !a.canSeeContext(prior)) return deny("This context is restricted");
      if (prior?.kind === "campaign" && prior.status !== "Draft" && !a.admin) return deny("Approved campaigns can only be changed by an administrator", 409);
      let data: any;
      try { data = sanitize(kind, source, prior); } catch (e) { return deny(e instanceof Error ? e.message : "Invalid record", 400); }
      if (kind === "persona" && prior) data.stage = clean(source.stage ?? prior.stage, 30);
      await upsert(id, kind, data, user.email);
      await event({ sessionId: "workspace", contextId: kind === "context" ? id : undefined, type: `${kind}.saved`, actor: user.email, details: { id, kind, name: data.name || data.title || data.key || "" } });
      return Response.json({ id }, { status: 201 });
    }

    if (action === "delete") {
      const id = clean(body.id, 80), rec = await getRec(id);
      if (!rec) return deny("Record not found", 404);
      const staffKinds = ["widget", "insight", "label", "journey"];
      const ok = staffKinds.includes(rec.kind) || (rec.kind === "campaign" && (rec.status === "Draft" || a.admin)) || (["routing", "faculty"].includes(rec.kind) && a.admin) || (["applicant", "course"].includes(rec.kind) && canView) || (["knowledge", "flow"].includes(rec.kind) && rec.status === "Draft" && canView) || (rec.kind === "persona" && !basePersonas.includes(rec.name) && a.admin);
      if (!ok) return deny("You can't delete this record");
      await db().prepare("DELETE FROM cx_records WHERE id = ? AND tenant_id = ?").bind(id, T()).run();
      await event({ sessionId: "workspace", type: "record.deleted", actor: user.email, details: { id, kind: rec.kind, name: rec.name || rec.title || "" } });
      return Response.json({ ok: true });
    }

    if (action === "context.access") {
      const id = clean(body.contextId, 80), ctx = await getRec(id, "context");
      if (!ctx) return deny("Context not found", 404);
      if (!a.canSeeContext(ctx)) return deny("Education context access requires authorization");
      await event({ sessionId: "workspace", contextId: id, type: "context.accessed", actor: user.email, details: { purpose: clean(body.purpose, 180) || "Support case" } });
      return Response.json({ ok: true });
    }

    if (action === "event") {
      const sessionId = clean(body.sessionId, 80), type = clean(body.type, 40);
      const session = await getRec(sessionId, "session");
      if (!session) return deny("Session not found", 404);
      if (session.contextId && !a.canSeeContext(await getRec(session.contextId, "context"))) return deny("This context is restricted");
      if (!["message.received", "message.sent", "handoff.requested", "session.resolved", "livesync.confirmed", "livesync.field", "transcript.received", "channel.switched"].includes(type)) return deny("Unsupported event", 400);
      if (session.status === "Resolved") return deny("This session is resolved. Start a new inquiry to continue.", 409);
      const text = clean(body.text, 3000);
      if (["message.received", "message.sent", "transcript.received"].includes(type) && !text) return deny("Message is required", 400);
      const channel = type === "channel.switched" && channels.includes(body.channel) ? body.channel : session.channel;
      await event({ sessionId, contextId: session.contextId, channel, type, actor: user.email, details: { text, intent: clean(body.intent, 80), step: clean(body.step, 160), field: clean(body.field, 60), value: clean(body.value, 200), from: session.channel, to: channel } });
      if (type === "channel.switched") await upsert(sessionId, "session", { ...session, channel, channelsUsed: [...new Set([...(session.channelsUsed || [session.channel]), channel])] }, user.email);
      if (type === "message.received" || type === "transcript.received") {
        if (st.agentsPaused["Ticket Classification"]) {
          await event({ sessionId, contextId: session.contextId, channel, type: "ticket.triage.skipped", actor: "HavenConnect classifier", details: { reason: "Ticket Classification agent paused" } });
        } else {
          const [labels, routing, knowledge] = await Promise.all([listKind("label"), listKind("routing"), listKind("knowledge")]);
          const triage = classifyWith(text, { labels, routing });
          const guidance = st.agentsPaused["Insights & Knowledge Gap"] ? [] : retrieveGuidance(text, knowledge as any);
          await event({ sessionId, contextId: session.contextId, channel, type: "ticket.triaged", actor: "HavenConnect classifier", details: { ...triage, guidance, knowledgeGap: !guidance.length } });
          await upsert(sessionId, "session", { ...session, ...triage, lastMessageAt: new Date().toISOString() }, user.email);
        }
      }
      if (type === "handoff.requested") await upsert(sessionId, "session", { ...session, handoff: true, assignee: clean(body.assignee, 80) || "Staff queue" }, user.email);
      if (type === "session.resolved") await upsert(sessionId, "session", { ...session, status: "Resolved", resolvedAt: new Date().toISOString() }, user.email);
      return Response.json({ ok: true });
    }

    if (action === "flow.run") {
      const sessionId = clean(body.sessionId, 80), flowId = clean(body.flowId, 80);
      const [session, flow] = await Promise.all([getRec(sessionId, "session"), getRec(flowId, "flow")]);
      if (!session || !flow) return deny("Session or flow not found", 404);
      if (session.contextId && !a.canSeeContext(await getRec(session.contextId, "context"))) return deny("This context is restricted");
      if (session.status !== "Open" || flow.status !== "Approved") return deny("Select an open session and an approved flow", 409);
      const plan = planFlow(flow.steps || []), runId = crypto.randomUUID();
      await event({ sessionId, contextId: session.contextId, channel: session.channel, type: "flow.run.planned", actor: user.email, details: { runId, flowId, flowName: flow.name, version: flow.version, steps: plan, state: "Awaiting staff execution" } });
      return Response.json({ runId, plan, state: "Awaiting staff execution" });
    }

    if (action === "feedback") {
      const sessionId = clean(body.sessionId, 80), score = Number(body.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) return deny("Rating must be 1–5", 400);
      const session = await getRec(sessionId, "session");
      if (!session) return deny("Session not found", 404);
      if (session.contextId && !a.canSeeContext(await getRec(session.contextId, "context"))) return deny("This context is restricted");
      if (session.status !== "Resolved") return deny("Resolve the session before recording feedback", 409);
      const prior = await db().prepare("SELECT id FROM cx_events WHERE tenant_id = ? AND session_id = ? AND event_type = 'feedback.recorded' LIMIT 1").bind(T(), sessionId).first();
      if (prior) return deny("Feedback has already been recorded for this session", 409);
      await event({ sessionId, contextId: session.contextId, channel: session.channel, type: "feedback.recorded", actor: user.email, details: { score, source: "Staff-entered survey result" } });
      return Response.json({ ok: true });
    }

    if (action === "approve") {
      if (!canView) return deny("Publishing requires an authorized administrator");
      const id = clean(body.id, 80), rec = await getRec(id);
      if (!rec || !["knowledge", "flow", "campaign", "persona"].includes(rec.kind)) return deny("Draft not found", 404);
      if (rec.kind === "campaign" && !a.admin) return deny("Campaign approval requires an administrator");
      const data: any = { ...rec, status: rec.kind === "persona" ? "Published" : "Approved", approvedBy: user.email, approvedAt: new Date().toISOString() };
      if (rec.kind === "persona") data.publishedVersion = (rec.publishedVersion || 0) + 1;
      if (rec.kind === "campaign") data.delivery = states()[rec.channel]?.startsWith("Awaiting") ? `Approved · ${states()[rec.channel]}` : "Approved · ready for gateway test";
      await upsert(id, rec.kind, data, user.email);
      await event({ sessionId: "workspace", type: `${rec.kind}.approved`, actor: user.email, details: { id, name: rec.name || rec.title, version: data.publishedVersion } });
      return Response.json({ ok: true });
    }

    if (action === "label") {
      const text = clean(body.text, 200), label = clean(body.label, 60);
      if (!text || !INTENTS.includes(label)) return deny("Choose a valid label", 400);
      const id = crypto.randomUUID();
      await upsert(id, "label", { text, label, predicted: clean(body.predicted, 60), sessionId: clean(body.sessionId, 80) }, user.email);
      await event({ sessionId: clean(body.sessionId, 80) || "workspace", type: "label.corrected", actor: user.email, details: { id, from: clean(body.predicted, 60), to: label } });
      return Response.json({ id });
    }

    if (action === "grade.save" || action === "grade.finalize") {
      const contextId = clean(body.contextId, 80), section = clean(body.section, 20).toUpperCase();
      const ctx = await getRec(contextId, "context");
      if (!ctx || !(ctx.sections || []).includes(section)) return deny("Student is not enrolled in this section", 404);
      if (!a.canEditGrade(section)) return deny("Only the instructor of record or an education administrator can edit these grades");
      const id = `grade:${contextId}:${section}`, prior = await getRec(id, "grade");
      if (prior && prior.status !== "Draft") return deny(`Grades are ${prior.status.toLowerCase()}. Request a grade change to edit them.`, 409);
      const items = (Array.isArray(body.items) ? body.items : prior?.items || []).slice(0, 20).map((i: any) => ({ n: clean(i.n, 80), w: num(i.w, 0, 100, 0), score: i.score === null || i.score === "" || i.score === undefined ? null : num(i.score, 0, 100, 0), scholarisComponentId: clean(i.scholarisComponentId, 60) }));
      if (Math.round(items.reduce((s: number, i: GradeItem) => s + i.w, 0)) !== 100) return deny("Component weights must add up to 100%", 400);
      const finalize = action === "grade.finalize";
      if (finalize && !gradeComplete(items)) return deny("Enter a score for every component before finalizing", 400);
      const data = { contextId, section, items, status: finalize ? "Pending approval" : "Draft", finalizedBy: finalize ? user.email : "", finalizedAt: finalize ? new Date().toISOString() : "", sample: Boolean(prior?.sample) };
      await upsert(id, "grade", data, user.email);
      await event({ sessionId: "workspace", contextId, type: finalize ? "grade.finalized" : "grade.saved", actor: user.email, details: { id, section } });
      return Response.json({ id });
    }

    if (action === "grade.approve" || action === "grade.return" || action === "grade.reopen") {
      if (!gradeApprover(user.email)) return deny("Only a grade approver can approve or return grades");
      const id = clean(body.id, 120), g = await getRec(id, "grade");
      if (!g) return deny("Grade record not found", 404);
      if (action === "grade.approve") {
        if (g.status !== "Pending approval") return deny("Only finalized grades can be approved", 409);
        if (g.finalizedBy === user.email && config().HAVEN_GRADE_SINGLE_APPROVER !== "true") return deny("A different person must approve grades that you finalized", 409);
        const [ctx, courses] = await Promise.all([getRec(g.contextId, "context"), listKind("course")]);
        const approved = { ...g, status: "Final", approvedBy: user.email, approvedAt: new Date().toISOString(), integrated: true };
        const lms = await pushScholaris(approved, ctx, courses.find(c => c.code === g.section));
        await upsert(id, "grade", { ...approved, lms }, user.email);
        await event({ sessionId: "workspace", contextId: g.contextId, type: "grade.approved", actor: user.email, details: { id, section: g.section, recordedIn: "HavenConnect student record", scholaris: lms.status } });
        return Response.json({ ok: true, lms });
      }
      if (action === "grade.return" && g.status !== "Pending approval") return deny("Only grades awaiting approval can be returned", 409);
      if (action === "grade.reopen" && g.status !== "Final") return deny("Only final grades can be reopened", 409);
      const reason = clean(body.reason, 300); if (!reason) return deny("Give a reason", 400);
      await upsert(id, "grade", { ...g, status: "Draft", finalizedBy: "", lms: g.lms, reopenReason: reason }, user.email);
      await event({ sessionId: "workspace", contextId: g.contextId, type: action === "grade.return" ? "grade.returned" : "grade.change.requested", actor: user.email, details: { id, reason } });
      return Response.json({ ok: true });
    }

    if (action === "grade.lms.retry") {
      if (!gradeApprover(user.email)) return deny("Only a grade approver can retry the Scholaris sync");
      const id = clean(body.id, 120), g = await getRec(id, "grade");
      if (!g || g.status !== "Final") return deny("Only final grades can be sent to Scholaris Global Learning", 409);
      const [ctx, courses] = await Promise.all([getRec(g.contextId, "context"), listKind("course")]);
      const lms = await pushScholaris(g, ctx, courses.find(c => c.code === g.section));
      await upsert(id, "grade", { ...g, lms }, user.email);
      await event({ sessionId: "workspace", contextId: g.contextId, type: "grade.lms.attempted", actor: user.email, details: { id, scholaris: lms.status } });
      return Response.json({ lms });
    }

    if (action === "enroll" || action === "drop") {
      if (!canView) return deny("Enrollment changes require an authorized registrar");
      const contextId = clean(body.contextId, 80), code = clean(body.course, 20).toUpperCase();
      const [ctx, courses] = await Promise.all([getRec(contextId, "context"), listKind("course")]);
      const course = courses.find(c => c.code === code);
      if (!ctx || !course) return deny("Student or course not found", 404);
      const sections: string[] = ctx.sections || [];
      if (action === "drop") {
        if (!sections.includes(code)) return deny("Student is not in this section", 409);
        const promoted = course.wait > 0 ? 1 : 0;
        await upsert(course.id, "course", { ...course, enrolled: Math.max(0, course.enrolled - 1 + promoted), wait: course.wait - promoted }, user.email);
        await upsert(contextId, "context", { ...ctx, sections: sections.filter(s => s !== code) }, user.email);
        await event({ sessionId: "workspace", contextId, type: "enrollment.dropped", actor: user.email, details: { course: code, waitlistPromoted: promoted } });
        return Response.json({ ok: true, result: `Dropped ${code}${promoted ? "; one waitlisted student can be offered the seat" : ""}` });
      }
      if (sections.includes(code)) return deny(`${ctx.name} is already in ${code}`, 409);
      if (!prerequisiteMet(course, ctx.completed)) {
        await event({ sessionId: "workspace", contextId, type: "enrollment.blocked", actor: user.email, details: { course: code, reason: `Prerequisite ${course.prereq} not met` } });
        return deny(`Blocked: ${ctx.name} needs ${course.prereq} before ${code}`, 409);
      }
      if (course.enrolled >= course.cap) {
        await upsert(course.id, "course", { ...course, wait: course.wait + 1 }, user.email);
        await event({ sessionId: "workspace", contextId, type: "enrollment.waitlisted", actor: user.email, details: { course: code, position: course.wait + 1 } });
        return Response.json({ ok: true, result: `${code} is full. ${ctx.name} is #${course.wait + 1} on the waitlist.` });
      }
      await upsert(course.id, "course", { ...course, enrolled: course.enrolled + 1 }, user.email);
      await upsert(contextId, "context", { ...ctx, sections: [...sections, code] }, user.email);
      const comps: [string, number][] = Array.isArray(course.components) && course.components.length ? course.components : DEFAULT_COMPONENTS;
      await upsert(`grade:${contextId}:${code}`, "grade", { contextId, section: code, items: comps.map(([n, w]) => ({ n, w, score: null })), status: "Draft" }, user.email);
      await event({ sessionId: "workspace", contextId, type: "enrollment.created", actor: user.email, details: { course: code } });
      return Response.json({ ok: true, result: `Enrolled ${ctx.name} in ${code}. The Scholaris classroom enrollment follows your Scholaris sync.` });
    }

    if (action === "applicant.move" || action === "applicant.doc" || action === "applicant.remind") {
      if (!canView) return deny("Admissions records require an authorized registrar");
      const id = clean(body.id, 80), ap = await getRec(id, "applicant");
      if (!ap) return deny("Applicant not found", 404);
      if (action === "applicant.doc") {
        const doc = clean(body.doc, 60); if (!(doc in (ap.docs || {}))) return deny("Unknown document", 400);
        await upsert(id, "applicant", { ...ap, docs: { ...ap.docs, [doc]: true } }, user.email);
        await event({ sessionId: "workspace", type: "applicant.document.received", actor: user.email, details: { id, doc } });
        return Response.json({ ok: true });
      }
      if (action === "applicant.remind") {
        const missing = Object.entries(ap.docs || {}).filter(([, v]) => !v).map(([k]) => k);
        const gateway = config().HAVEN_EMAIL_GATEWAY_URL ? "Queued for email gateway" : "Logged · email gateway not connected";
        await event({ sessionId: "workspace", type: "applicant.reminder.queued", actor: user.email, details: { id, missing, delivery: gateway } });
        return Response.json({ ok: true, result: gateway });
      }
      const to = clean(body.stage, 20), check = canAdvance(ap, to);
      if (!check.ok) return deny(check.reason, 409);
      await upsert(id, "applicant", { ...ap, stage: to }, user.email);
      let created = "";
      if (to === "Enrolled") {
        const existing = (await listKind("context")).find(c => c.type === "Student" && c.name === ap.name);
        if (!existing) { created = crypto.randomUUID(); await upsert(created, "context", { name: ap.name, type: "Student", reference: `NEW-${created.slice(0, 6).toUpperCase()}`, program: ap.program, year: 1, email: ap.email || "", status: "Active", sections: [], completed: [], holds: [], gpa: 0, note: "Created from admissions pipeline", sample: Boolean(ap.sample) }, user.email); }
      }
      await event({ sessionId: "workspace", type: "applicant.moved", actor: user.email, details: { id, from: ap.stage, to, studentCreated: Boolean(created) } });
      return Response.json({ ok: true, studentId: created });
    }

    if (action === "ai") {
      const task = clean(body.task, 30), spec = TASKS[task];
      if (!spec) return deny("Unknown AI task", 400);
      const agent = AGENT_FOR_TASK[task];
      if (st.agentsPaused[agent]) return deny(`${agent} is paused in Agent Network`, 409);
      const status = aiStatus(config());
      if (!status.configured) return deny("No AI provider is configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY as a hosted secret.", 503);
      let input = clean(typeof body.input === "string" ? body.input : JSON.stringify(body.input || {}), 12000);
      if (task === "reply" && body.sessionId) {
        const session = await getRec(clean(body.sessionId, 80), "session");
        if (!session) return deny("Session not found", 404);
        if (session.contextId && !a.canSeeContext(await getRec(session.contextId, "context"))) return deny("This context is restricted");
        const evs = await db().prepare("SELECT event_type, details FROM cx_events WHERE tenant_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT 60").bind(T(), session.id).all<any>();
        const history = (evs.results || []).filter((e: any) => ["message.received", "message.sent", "transcript.received"].includes(e.event_type)).map((e: any) => `${e.event_type === "message.sent" ? "Agent" : "Customer"}: ${JSON.parse(e.details).text}`).slice(-10).join("\n");
        const last = history.split("\n").filter(l => l.startsWith("Customer")).pop() || session.subject;
        const guidance = retrieveGuidance(last, (await listKind("knowledge")) as any);
        const persona = (await getRec(nid(`persona:${String(session.persona).toLowerCase()}`))) || { name: session.persona };
        input = `Persona: ${persona.name}${persona.tone ? ` (${persona.tone})` : ""}. Brand voice: ${st.brand}\nApproved guidance:\n${guidance.map(g => `- ${g.title}: ${g.excerpt}`).join("\n") || "- none matched"}\nConversation:\n${history}\n${input ? `Staff note: ${input}` : ""}`;
      }
      const safe = redact(input, st.redact);
      const pack = PACKS[app.pack as PackId], result = await generate(config(), `${spec.system}\nWorkspace: ${app.name} (${app.category}).${pack?.disclosure ? `\nRequired policy: ${pack.disclosure}` : ""}`, safe, spec.max || 700);
      let json: unknown = undefined;
      if (spec.json) { try { json = parseJson(result.text); } catch (e) { return deny(e instanceof Error ? e.message : "Invalid AI reply", 502); } }
      await event({ sessionId: clean(body.sessionId, 80) || "workspace", type: "ai.generated", actor: `${agent} · ${result.provider}`, details: { task, model: result.model, redacted: safe !== input } });
      return Response.json({ text: result.text, json, provider: result.provider, model: result.model, reviewRequired: Boolean(pack?.reviewRequired) });
    }

    if (action === "sample.seed") {
      if (!canView) return deny("Loading sample data requires an education administrator");
      const existing = await db().prepare("SELECT COUNT(*) AS n FROM cx_records WHERE tenant_id = ? AND json_extract(payload, '$.sample') = 1").bind(T()).first<any>();
      if (Number(existing?.n) > 0) return deny("Sample data is already loaded. Remove it first.", 409);
      const S = sampleData(user.email), stmts: any[] = [], now = Date.now();
      const put = (id: string, kind: string, data: any) => stmts.push(db().prepare("INSERT INTO cx_records (id, kind, tenant_id, payload, updated_by) VALUES (?, ?, ?, ?, ?)").bind(id, kind, T(), JSON.stringify({ ...data, sample: true }), "Sample data"));
      const ev = (sessionId: string, type: string, details: any, contextId: string | null = null, minsAgo = 0, actor = "Sample data") => stmts.push(db().prepare("INSERT INTO cx_events (id, tenant_id, session_id, context_id, channel, event_type, actor, details, created_at) VALUES (?, ?, ?, ?, 'Web', ?, ?, ?, ?)").bind(crypto.randomUUID(), T(), sessionId, contextId, type, actor, JSON.stringify({ ...details, sample: true }), new Date(now - minsAgo * 60000).toISOString().replace("T", " ").slice(0, 19)));
      const courseIds: Record<string, string> = {};
      for (const c of S.courses) { const id = crypto.randomUUID(); courseIds[c.code] = id; put(id, "course", { ...c, scholarisSectionId: "", components: S.comps.map(([n, w]) => [n, w]) }); }
      for (const s of S.students) {
        const id = crypto.randomUUID();
        put(id, "context", { name: s.name, type: "Student", reference: s.reference, program: s.program, year: s.year, email: "", advisor: s.advisor, sections: s.sections, completed: s.completed, holds: s.holds, gpa: s.gpa, status: s.status, note: "Sample record", scholarisStudentId: "" });
        for (const sec of s.sections) put(`grade:${id}:${sec}`, "grade", { contextId: id, section: sec, status: "Draft", items: S.comps.map(([n, w], i) => ({ n, w, score: sec === "CTS2314-01" && s.scores.length ? (s.scores[i] ?? null) : null, scholarisComponentId: "" })) });
      }
      for (const ap of S.applicants) put(crypto.randomUUID(), "applicant", ap);
      for (const f of S.faculty) put(crypto.randomUUID(), "faculty", f);
      const kn = S.knowledge.map(k => ({ id: crypto.randomUUID(), ...k }));
      for (const k of kn) put(k.id, "knowledge", { ...k, approvedBy: "Sample data" });
      for (const f of S.flows) put(crypto.randomUUID(), "flow", { name: f.name, trigger: f.trigger, steps: f.steps, status: f.status, requiresApproval: true, approvedBy: "Sample data", nodes: f.nodes.map(([type, title, desc], i) => ({ id: `n${i + 1}`, type, title, desc, x: 40 + i * 230, y: 90 })), edges: f.nodes.slice(1).map((_, i) => [`n${i + 1}`, `n${i + 2}`]) });
      S.sessions.forEach((s, k) => {
        const id = crypto.randomUUID(), started = 60 * (k + 1) * 3, triage = classifyWith(s.msgs[0]), guidance = retrieveGuidance(s.msgs[0], kn as any);
        put(id, "session", { ...triage, contextId: "", persona: s.persona, channel: "Web", subject: s.subject, status: s.resolve ? "Resolved" : "Open", startedAt: new Date(now - started * 60000).toISOString(), resolvedAt: s.resolve ? new Date(now - (started - 20) * 60000).toISOString() : undefined });
        ev(id, "session.started", { id }, null, started);
        ev(id, "message.received", { text: s.msgs[0] }, null, started - 1);
        ev(id, "ticket.triaged", { ...triage, guidance, knowledgeGap: !guidance.length }, null, started - 1, "HavenConnect classifier");
        if (s.reply) ev(id, "message.sent", { text: s.reply }, null, started - 4);
        if (s.resolve) { ev(id, "session.resolved", {}, null, started - 20); ev(id, "feedback.recorded", { score: s.score, source: "Sample survey" }, null, started - 25); }
      });
      await db().batch(stmts);
      await event({ sessionId: "workspace", type: "sample.seeded", actor: user.email, details: { records: stmts.length } });
      return Response.json({ ok: true, count: stmts.length });
    }

    if (action === "sample.clear") {
      if (!canView) return deny("Removing sample data requires an education administrator");
      await db().batch([
        db().prepare("DELETE FROM cx_events WHERE tenant_id = ? AND (actor = 'Sample data' OR json_extract(details, '$.sample') = 1 OR session_id IN (SELECT id FROM cx_records WHERE tenant_id = ? AND json_extract(payload, '$.sample') = 1) OR context_id IN (SELECT id FROM cx_records WHERE tenant_id = ? AND json_extract(payload, '$.sample') = 1))").bind(T(), T(), T()),
        db().prepare("DELETE FROM cx_records WHERE tenant_id = ? AND json_extract(payload, '$.sample') = 1").bind(T()),
      ]);
      await event({ sessionId: "workspace", type: "sample.removed", actor: user.email, details: {} });
      return Response.json({ ok: true });
    }

    return deny("Unsupported action", 400);
    });
  } catch (e) { return fail(e); }
}
