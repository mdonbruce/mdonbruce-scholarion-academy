import { broker, CampusError, id, metrics, nowIso, nowMs, sha256, token, type Row, type Tenant, type TenantStore } from "../core";
import { createUser, hashPassword, type Actor } from "../iam";
import { audit, requireTenant } from "./common";
import { CONTENT_TABLES, contentOf } from "./content";
import { exportTenant } from "./admin";
import { ensureAgents, ensureStandardTemplate } from "./ai";
import { ensureProctorDefaults } from "./proctor";
import { ensureCloudLabTool } from "./lti";

/**
 * Control plane (Tabs 46–48): tenant templates and provisioning, offboarding, content
 * licensing between tenants (copy of content tables only), de-identified platform
 * metrics, the connector registry with honest status, and the capability status board.
 */

export type CapabilityStatus = "LIVE" | "CONNECTED" | "DISABLED" | "SIMULATED" | "PLANNED";

/* ---------------- Connectors ---------------- */

interface ConnectorDef {
  key: string;
  name: string;
  category: string;
  external: boolean;
  defaultStatus: (store: TenantStore) => CapabilityStatus;
  note: string;
}

export const CONNECTORS: ConnectorDef[] = [
  { key: "zoom", name: "Zoom (live classroom)", category: "Video", external: true, defaultStatus: (s) => (broker.tenant(s.tenantId)?.flags.live_connectors && s.list("connector_consents", (c) => c.provider === "zoom" && !c.revokedAt).length ? "SIMULATED" : "DISABLED"), note: "Scheduling, join links and attendance import run against a sandbox connector; no calls reach Zoom from staging." },
  { key: "haven_avatar", name: "Haven Voice & Digital Human (Amara / Tunde)", category: "Haven", external: true, defaultStatus: () => "DISABLED", note: "Tutor avatar mode falls back to text with captions and a transcript, always with AI disclosure." },
  { key: "havenconnect", name: "HavenConnect (support & admissions agents)", category: "Haven", external: true, defaultStatus: () => "DISABLED", note: "Registration guide and support triage run in-house (read-only drafts) until connected." },
  { key: "havenroute", name: "HavenRoute (email)", category: "Haven", external: true, defaultStatus: () => "DISABLED", note: "Email notifications are recorded in the delivery log; in-app notifications are live." },
  { key: "model_provider", name: "Model provider hub", category: "AI", external: true, defaultStatus: () => "DISABLED", note: "AI features use the local extractive engine; the lab key proxy answers with a labelled simulator." },
  { key: "gpu_pool", name: "GPU lab pool", category: "Cloud Lab", external: true, defaultStatus: () => "PLANNED", note: "PyTorch/TensorFlow templates are defined and pinned; GPU execution needs a container cluster." },
  { key: "container_runner", name: "Sandboxed lab runner", category: "Cloud Lab", external: false, defaultStatus: () => (process.env.CLOUDLAB_LOCAL_RUNNER === "1" ? "LIVE" : "DISABLED"), note: "Python runs locally with time and memory limits and no network (development runner)." },
  { key: "sso", name: "SSO (SAML / OIDC federation)", category: "Identity", external: true, defaultStatus: () => "SIMULATED", note: "Tenant realms use local password + TOTP sign-in; external IdP federation isn't connected." },
  { key: "payments", name: "Payments", category: "Commerce", external: true, defaultStatus: () => "SIMULATED", note: "Sandbox only: orders carry sandbox references; no card data accepted." },
  { key: "oneroster", name: "OneRoster 1.2 (CSV)", category: "Rostering", external: false, defaultStatus: () => "LIVE", note: "Import and export run in-house." },
  { key: "lti", name: "LTI 1.3 Advantage", category: "Integration", external: false, defaultStatus: () => "LIVE", note: "Launch, AGS, NRPS, deep linking and dynamic registration (Cloud Lab is the first tool)." },
  { key: "webhooks", name: "Outbound webhooks", category: "Integration", external: false, defaultStatus: () => (process.env.CAMPUS_WEBHOOK_HTTP === "1" ? "LIVE" : "SIMULATED"), note: "Signed deliveries with retry and dead-letter; outbound HTTP is off in staging (local sink receives them)." },
  { key: "placement_sync", name: "TechDev placement sync", category: "Careers", external: false, defaultStatus: (s) => (broker.tenant(s.tenantId)?.kind === "internal" ? "LIVE" : "DISABLED"), note: "Consenting profiles sync to the separate placement database (internal tenant only)." },
];

export function connectorStatus(store: TenantStore, key: string): CapabilityStatus {
  const row = store.list("connectors", (c) => c.key === key)[0];
  if (row) return row.status as CapabilityStatus;
  return CONNECTORS.find((c) => c.key === key)?.defaultStatus(store) ?? "PLANNED";
}

export function connectorList(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "connectors.list");
  return CONNECTORS.map((c) => {
    const row = store.list("connectors", (x) => x.key === c.key)[0];
    return { key: c.key, name: c.name, category: c.category, status: connectorStatus(store, c.key), note: c.note, secretRef: (row?.secretRef as string) ?? null, consentBy: (row?.consentBy as string) ?? null, external: c.external };
  });
}

/** Configure a connector. External services can't be marked connected from an environment without access to them. */
export function configureConnector(store: TenantStore, a: Actor, key: string, input: { mode: "disabled" | "simulated" | "connected"; secretRef?: string; consent?: boolean }) {
  requireTenant(store, a, ["admin"], "connectors.configure");
  const def = CONNECTORS.find((c) => c.key === key);
  if (!def) throw new CampusError("not_found", "Unknown connector", 404);
  if (input.mode === "connected") {
    if (def.external) throw new CampusError("not_reachable", `${def.name} can't be connected from this environment (local/staging has no access to it). Use "simulated" for demos.`, 409);
    if (def.key === "container_runner" && process.env.CLOUDLAB_LOCAL_RUNNER !== "1") throw new CampusError("not_reachable", "Set CLOUDLAB_LOCAL_RUNNER=1 on the server to enable the local runner.", 409);
  }
  if (input.mode !== "disabled" && def.external && !input.consent) throw new CampusError("consent_required", "Record the institution's consent to use this service first.", 422);
  if (input.secretRef && !/^(vault|env|internal):\/\//.test(input.secretRef)) throw new CampusError("invalid", "Use a secret reference (vault://…, env://…) — never paste a raw secret.", 422);
  const status: CapabilityStatus = input.mode === "disabled" ? "DISABLED" : input.mode === "simulated" ? "SIMULATED" : "LIVE";
  return store.tx(() => {
    const ex = store.list("connectors", (c) => c.key === key)[0];
    const vals = { key, name: def.name, category: def.category, status, secretRef: input.secretRef ?? ex?.secretRef ?? null, consentBy: input.consent ? a.id : (ex?.consentBy ?? null), note: def.note };
    const row = ex ? store.update("connectors", ex.id, vals) : store.insert("connectors", vals, "con");
    if (key === "zoom" && input.mode !== "disabled" && input.consent && !store.list("connector_consents", (c) => c.provider === "zoom" && !c.revokedAt).length) store.insert("connector_consents", { provider: "zoom", grantedBy: a.id, scope: "meetings, attendance reports", revokedAt: null }, "cc");
    audit(store, a, "connectors.configure", `connectors/${key}`, status);
    return row;
  });
}

/* ---------------- Tenant templates & provisioning ---------------- */

export type TenantType = "academy" | "university" | "school" | "corporate";

export const TENANT_TEMPLATES: Record<TenantType, { label: string; flags: Record<string, boolean>; kind: Tenant["kind"]; limits: Record<string, number>; description: string }> = {
  academy: { label: "Academy", kind: "guest", flags: { commerce: true, marketplace: false, ai_course_assistant: true, offline_mode: true, powered_by: true }, limits: { learners: 50000, storageGb: 500, aiRequestsPerDay: 50000 }, description: "Catalog-first: self-paced and cohort offerings, commerce on." },
  university: { label: "University", kind: "guest", flags: { commerce: false, marketplace: true, ai_course_assistant: true, offline_mode: true, powered_by: true }, limits: { learners: 30000, storageGb: 2000, aiRequestsPerDay: 30000 }, description: "SIS-first: terms, sections, credit and financial aid." },
  school: { label: "School", kind: "guest", flags: { commerce: false, marketplace: false, ai_course_assistant: false, offline_mode: true, powered_by: true }, limits: { learners: 3000, storageGb: 200, aiRequestsPerDay: 2000 }, description: "Terms and classes; AI off by default; observers on." },
  corporate: { label: "Corporate", kind: "guest", flags: { commerce: false, marketplace: false, ai_course_assistant: true, offline_mode: false, powered_by: false, sso_only: true, seats: true }, limits: { learners: 10000, storageGb: 200, aiRequestsPerDay: 10000 }, description: "Seats and assignments, compliance training, SSO-only sign-in." },
};

function requireOperator(a: Actor) {
  if (!a.platformOperator) throw new CampusError("forbidden", "Platform operators only.", 403);
}

/** Create a tenant from a template with an isolated data plane and a verified platform host. */
export function provisionTenant(a: Actor | null, input: { name: string; slug: string; type: TenantType; region: string; tier: "standard" | "enterprise"; adminName: string; adminEmail: string }) {
  if (a) requireOperator(a);
  const started = nowMs();
  const tpl = TENANT_TEMPLATES[input.type];
  if (!tpl) throw new CampusError("invalid", "Unknown tenant type", 422);
  if (!/^[a-z][a-z0-9-]{2,30}$/.test(input.slug)) throw new CampusError("invalid", "Slug: 3–31 lowercase letters, digits or dashes.", 422);
  if (!["us-east", "eu-west", "af-west", "ap-south"].includes(input.region)) throw new CampusError("invalid", "Region must be us-east, eu-west, af-west or ap-south.", 422);
  const tid = `tn_${input.slug.replace(/-/g, "_")}`;
  const t = broker.provision({ id: tid, slug: input.slug, name: input.name.trim(), kind: tpl.kind, domains: [{ host: `${input.slug}.campus.scholarion.localhost`, verified: true }], realm: { protocol: input.type === "corporate" ? "saml" : "oidc", issuer: `https://idp.scholarion.local/realms/${input.slug}`, mfaRequiredForStaff: true, jit: input.type === "corporate" }, theme: { primary: "#1f2937", accent: "#2563eb", logoText: input.name.trim().slice(0, 40) }, flags: { ...tpl.flags } });
  const store = broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: `provision-${token(4)}` });
  const tempPassword = `Tmp-${token(9)}`;
  const mfaSecret = Array.from(sha256(token(16)).slice(0, 16)).map((c) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(c, 16) * 2 % 32]).join("");
  store.tx(() => {
    store.insert("accounts", { id: `acc_${input.slug}_root`, name: t.name, parentId: null, defaultTimeZone: "UTC", quotaMb: 500 }, "acc");
    for (const [key, value] of Object.entries({ tenant_type: input.type, region: input.region, tier: input.tier })) store.insert("tenant_settings", { key, value }, "ts");
    const admin = createUser(store, { name: input.adminName, email: input.adminEmail, passwordHash: hashPassword(tempPassword), roles: ["admin"], mfaSecret });
    store.update("users", admin.id, { mustChangePassword: true });
  });
  // Baseline platform services for every tenant.
  store.tx(() => {
    ensureAgents(store);
    ensureProctorDefaults(store);
    ensureStandardTemplate(store);
    ensureCloudLabTool(store);
  });
  const platform = broker.platform();
  platform.meta ??= {};
  const ms = nowMs() - started;
  platform.meta[t.id] = { type: input.type, region: input.region, tier: input.tier, limits: tpl.limits, provisionedMs: ms };
  broker.persistPlatform();
  metrics.inc("tenants_provisioned_total", { type: input.type });
  return { tenant: t, template: input.type, provisionedMs: ms, host: t.domains[0].host, admin: { email: input.adminEmail.toLowerCase(), temporaryPassword: tempPassword, mfaSecret, note: "Shown once. The admin must change the password at first sign-in." } };
}

export function setPlanLimits(a: Actor, tenantId: string, limits: Record<string, number>) {
  requireOperator(a);
  const p = broker.platform();
  p.meta ??= {};
  const m = p.meta[tenantId];
  if (!m) throw new CampusError("not_found", "Tenant metadata not found", 404);
  for (const [k, v] of Object.entries(limits)) if (!Number.isFinite(v) || v < 0) throw new CampusError("invalid", `${k} must be a positive number.`, 422);
  m.limits = { ...m.limits, ...limits };
  broker.persistPlatform();
  return m;
}

/** Offboard: export the tenant's data for hand-back, then suspend. Data is retained for the agreed window. */
export function offboardTenant(a: Actor, tenantId: string) {
  requireOperator(a);
  const t = broker.tenant(tenantId);
  if (!t || t.kind === "internal") throw new CampusError("forbidden", "That tenant can't be offboarded here.", 403);
  const ex = exportTenant(tenantId);
  broker.setStatus(tenantId, "suspended");
  const p = broker.platform();
  p.meta ??= {};
  p.meta[tenantId] = { ...(p.meta[tenantId] ?? { type: "unknown", region: "us-east", tier: "standard", limits: {} }), offboardedAt: nowIso() };
  broker.persistPlatform();
  return { tenantId, exportChecksum: ex.checksum, rows: ex.rows, status: "suspended", retention: "Data kept for 30 days for hand-back, then purged by an operator (manual step in the runbook)." };
}

/* ---------------- Content licensing (blueprint copy across tenants) ---------------- */

function systemStore(tenantId: string) {
  const t = broker.tenant(tenantId);
  if (!t) throw new CampusError("not_found", "Tenant not found", 404);
  return broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: `license-${token(4)}` });
}

export function createLicense(a: Actor, input: { sourceTenantId: string; sourceCourseId: string; targetTenantId: string; title?: string }) {
  requireOperator(a);
  if (input.sourceTenantId === input.targetTenantId) throw new CampusError("invalid", "Source and target must be different tenants.", 422);
  const src = systemStore(input.sourceTenantId);
  const course = src.get("courses", input.sourceCourseId);
  if (!course) throw new CampusError("not_found", "Source course not found", 404);
  const dst = systemStore(input.targetTenantId);
  const targetCourseId = `crs_lic_${sha256(input.sourceTenantId + input.sourceCourseId).slice(0, 10)}`;
  dst.tx(() => {
    if (!dst.get("courses", targetCourseId)) dst.insert("courses", { id: targetCourseId, code: course.code, title: input.title ?? course.title, description: course.description, credits: course.credits ?? 3, state: "unpublished", licensed: true, licenseSource: { tenant: broker.tenant(input.sourceTenantId)!.name }, homeType: "modules" }, "crs");
  });
  const lic = { id: id("lic"), sourceTenantId: input.sourceTenantId, sourceCourseId: input.sourceCourseId, targetTenantId: input.targetTenantId, targetCourseId, createdAt: nowIso(), syncs: 0 };
  const p = broker.platform();
  (p.licenses ??= []).push(lic);
  broker.persistPlatform();
  return lic;
}

const hashRow = (r: Row) => sha256(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["id", "version", "createdAt", "updatedAt", "courseId", "licenseSourceId", "licenseBase", "state", "html"].includes(k)))));

/**
 * Sync licensed content: only CONTENT tables are read from the source tenant (never users,
 * enrollments, submissions or grades). New items are created; items unchanged downstream
 * are updated; local edits are kept and reported. Idempotent: a second run with no source
 * changes does nothing.
 */
export function syncLicense(a: Actor | null, licenseId: string) {
  if (a) requireOperator(a);
  const lic = broker.platform().licenses?.find((l) => l.id === licenseId);
  if (!lic) throw new CampusError("not_found", "License not found", 404);
  const src = systemStore(lic.sourceTenantId);
  const dst = systemStore(lic.targetTenantId);
  const content = contentOf(src, lic.sourceCourseId);
  const snapshot = JSON.parse(JSON.stringify(content)) as Record<string, Row[]>;
  const allowed = new Set<string>(CONTENT_TABLES);
  for (const t of Object.keys(snapshot)) if (!allowed.has(t)) delete snapshot[t];
  const result = { created: 0, updated: 0, keptLocal: 0, unchanged: 0 };
  dst.tx(() => {
    const map = new Map<string, string>();
    for (const t of CONTENT_TABLES) for (const r of dst.list(t, (x) => x.courseId === lic.targetCourseId && !!x.licenseSourceId)) map.set(r.licenseSourceId as string, r.id);
    for (const t of CONTENT_TABLES) for (const r of snapshot[t] ?? []) if (!map.has(r.id)) map.set(r.id, `${r.id.split("_")[0]}_${sha256(lic.id + r.id).slice(0, 12)}`);
    const remap = (v: unknown): unknown => (typeof v === "string" ? (map.get(v) ?? v) : Array.isArray(v) ? v.map(remap) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, remap(x)])) : v);
    for (const t of CONTENT_TABLES) {
      for (const r of snapshot[t] ?? []) {
        const targetId = map.get(r.id)!;
        const vals: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (!["id", "version", "createdAt", "updatedAt", "deletedAt", "blueprintSourceId", "blueprintBase", "readBy"].includes(k)) vals[k] = remap(v);
        vals.courseId = lic.targetCourseId;
        const base = hashRow(r);
        const existing = dst.get(t, targetId);
        if (!existing) {
          dst.insert(t, { ...vals, id: targetId, licenseSourceId: r.id, licenseBase: base, ...(t === "announcements" ? { state: "draft" } : {}) }, t.slice(0, 3));
          result.created++;
        } else if (existing.licenseBase === base) result.unchanged++;
        else if (hashRow(existing) !== existing.licenseBase) result.keptLocal++;
        else {
          dst.update(t, targetId, { ...vals, licenseBase: base });
          result.updated++;
        }
      }
    }
    dst.insert("content_jobs", { kind: "license_sync", sourceCourseId: null, targetCourseId: lic.targetCourseId, state: "completed", progress: 100, issues: [], startedBy: "control-plane", output: { ...result, licenseId: lic.id } }, "cj");
    dst.emit("content.license_synced", `courses/${lic.targetCourseId}`, { licenseId: lic.id, ...result });
  });
  lic.syncs++;
  lic.lastSyncAt = nowIso();
  broker.persistPlatform();
  return { licenseId: lic.id, targetCourseId: lic.targetCourseId, ...result };
}

/* ---------------- De-identified platform metrics ---------------- */

const bucket = (n: number) => (n < 5 ? "<5" : n < 50 ? "5–49" : n < 500 ? "50–499" : "500+");

/** What a platform operator sees across tenants: bucketed counts and health — no learner records. */
export function platformMetrics(a: Actor) {
  requireOperator(a);
  return broker.tenants().filter((t) => t.kind !== "validation").map((t) => {
    if (t.status !== "active") return { tenant: t.slug, status: t.status };
    const s = systemStore(t.id);
    const m = broker.platform().meta?.[t.id];
    return {
      tenant: t.slug,
      status: t.status,
      type: m?.type ?? (t.kind === "internal" ? "internal" : "university"),
      region: m?.region ?? "us-east",
      learners: bucket(s.list("users").length),
      courses: bucket(s.list("courses").length),
      activeEnrollments: bucket(s.list("enrollments", (e) => e.state === "active").length),
      aiRequests: bucket(s.list("ai_audit").length),
      outboxDead: s.outbox().filter((e) => e.status === "dead").length,
    };
  });
}

/* ---------------- Capability status board ---------------- */

export interface Capability {
  area: string;
  capability: string;
  status: CapabilityStatus;
  evidence: string;
  blockers?: string;
}

/** The board: in-house capabilities are LIVE only when a test proves them; connectors report their real state. */
export function capabilityBoard(store: TenantStore): Capability[] {
  const T = "tests/campus-*.test.ts";
  const live = (area: string, capability: string, evidence: string): Capability => ({ area, capability, status: "LIVE", evidence: `${evidence} (${T})` });
  const conn = (area: string, key: string, capability: string): Capability => {
    const c = CONNECTORS.find((x) => x.key === key)!;
    const st = connectorStatus(store, key);
    return { area, capability, status: st, evidence: c.note, blockers: st === "LIVE" || st === "CONNECTED" ? undefined : c.external ? "Needs the provider account, credentials and network access (go-live decision)." : "Enable on the server." };
  };
  return [
    live("Tenancy", "Per-tenant stores, verified-host resolution, deny before data access", "cross-tenant suite"),
    live("Tenancy", "Tenant templates, provisioning, suspend/resume/offboard", "platform acceptance 1"),
    live("Tenancy", "Backups and restore drill into a validation tenant", "restore drill test"),
    live("Tenancy", "Domain verification (DNS TXT)", "domain test with a fake resolver"),
    live("Identity", "Password + TOTP sign-in, lockout, sessions, act-as with audit", "identity tests"),
    live("Identity", "RBAC + ABAC, permission matrix with locks, support grants", "authorization matrix"),
    conn("Identity", "sso", "External SSO federation"),
    live("LMS", "Modules, prerequisites, sequential locking, Mastery Paths, assign-to", "parity acceptance"),
    live("LMS", "Assignments, submissions, late/missing policies, peer review", "parity acceptance"),
    live("LMS", "Gradebook, posting policies, history, What-If, CSV, mastery", "parity acceptance"),
    live("LMS", "Quiz engine, item banks, accommodations, moderation, regrade", "quiz tests"),
    live("Assessment", "Proctored-assessment setup assistant (approved talking points only, accommodations routing, escalation with response time, redacted log) and the pre-test checklist gate", "proctor suite"),
    { area: "Assessment", capability: "Remote proctoring vendor (live webcam / ID verification)", status: "DISABLED", evidence: "Quizzes can reference a proctoring LTI tool; no vendor is connected in staging. Scholarion never collects ID images.", blockers: "Needs a proctoring vendor agreement, an LTI registration and a go-live decision." },
    live("LMS", "Discussions with checkpoints, announcements, inbox", "collaboration tests"),
    live("LMS", "Calendar, scheduler, pacing, iCal", "calendar tests"),
    live("LMS", "Blueprints, copy with date shift, package import/export (CC + QTI)", "content tests"),
    live("SIS", "Admissions, registration → enrollment projection, reconciliation, holds, transcript", "master acceptance"),
    live("Catalog", "Product types, catalog hub, recommender, Catalog Copy Checker", "platform acceptance 2–3, 10"),
    live("Catalog", "Academy program pages (#1, #12, #13, #14, #26) generated from catalog data, brochure PDF, apply → admission → sandbox seat, inquiries, prerequisite self-check, pass/no-pass completion", "programs suite"),
    live("Catalog", "Agentic AI hub (tabs, filters, rails from real data, learning paths, 9-question quiz, comparison, credential explainer, ItemList JSON-LD); programs #15–#25 and self-paced #28–#38 with batches, pay-later, audit access, autograded Cloud Lab notebooks, stacking certificates", "agentic suite"),
    live("Curriculum", "Assessment & Project Studio: labs, in-class activities, quizzes with 3× item banks (QTI 2.1), practice exercises, mini-projects, real-world projects and senior capstones — Four Project Pillars, alignment tables, student/instructor editions, AI DRAFT with two-person approval; simulated Student/Instructor labs (10-question worksheet, instructor control panel) and application demos", "labs suite (Tab 53)"),
    live("Cloud Lab", "Agentic Cloud Labs: saved workspaces with history, bounded autonomous agent runner (declarative agent specs; nothing learner-written is executed), per-tool permissions with violation tracking, operational run logs, rubric auto-grading posted to the gradebook with pass/no-pass, two graded attempts (best counts)", "labs suite (Tab 54)"),
    live("Cloud Lab", "Hosted learning area (Tab 55): 15 course sections; persistent simulated workspaces (files, editor, simulated terminal over a virtual filesystem, run/stop/reset/save/resume, autosave, snapshots, usage and budget); bounded autonomous agent runs with the policy enforced outside the model; two graded attempts with unlimited practice, frozen rubric versions, idempotent submit and posting with retry, Check Answers after grading, competency passbook, projection lock", "learning-area suite"),
    { area: "Cloud Lab", capability: "Real code execution in isolated containers (Python, Docker, Kubernetes) for learner workspaces", status: "PLANNED", evidence: "Simulated shell and declarative agent specs only; nothing learners write is executed", blockers: "Container runner, isolation review and owner approval." },
    live("Curriculum", "Course Studio (Tab 56): source-grounded topic packages in the 01_Sources … 13_Environment_Templates folder tree — 10-slide deck with notes, notes, study guide, mind map, infographic, 20+ flashcards, practice quiz, two mini-labs with server-side checks, environment templates, rubrics, cover variants A/B with the approved faculty photograph, QA report, manifest, protected instructor files, release gate", "studio suite"),
    { area: "Curriculum", capability: "Narrated audio lecture, two-host deep dive and narrated MP4 videos", status: "PLANNED", evidence: "Scripts, transcripts, captions and storyboards generated; silent 1280×720 preview rendered with ffmpeg when enabled; narration marked awaiting rendering", blockers: "Text-to-speech provider and media renderer." },
    live("Catalog", "Free Education Resource Hub (Tab 57): evidence-backed catalog of free tools, open courses and readings (initial catalog researched from official provider pages 2026-10-04; unverified claims stay pending), availability classes, API access tracked separately, live classroom blocks within verified free meeting limits, course mappings, bookmarks, What's New", "ecosystem suite"),
    live("Careers", "Career Connect & Employer Portal (Tab 58): verified employer onboarding, partner label only after a recorded relationship, opt-in learner profiles with per-field visibility, explainable matching from passbook evidence, learner-initiated applications, consent-based contact", "ecosystem suite"),
    live("Platform", "Auto-Discovery (Tab 59): cron schedules in America/New_York, durable jobs with unique period keys, leases, budgets, checkpoints, backoff with jitter, dead-letter, run-now/pause/resume; trusted-source adapters (official pages, RSS/Atom, Greenhouse public job boards); Integration JSON Schema (Draft 2020-12) with semantic checks; REST API v1", "ecosystem suite"),
    { area: "Platform", capability: "Live outbound fetching for discovery jobs in staging", status: "PLANNED", evidence: "Adapters, scheduler and job engine are tested against a fixture network", blockers: "Egress to the trusted provider hosts from the staging runtime; job-board sources (e.g. a Greenhouse board token) chosen by the owner." },
    { area: "Careers", capability: "External job-board APIs (LinkedIn, Indeed, Handshake) and email/SMS delivery", status: "PLANNED", evidence: "Not connected; in-site notifications only", blockers: "Partner API agreements and credentials; an authorized notification service." },
    live("Catalog", "Shared module library, policy approval gate (refund / deferral / batch change) and catalog consolidation report with product-owner decision", "agentic suite (Tab 52)"),
    live("Pathways", "Prerequisite / stacks / waives / mutually-exclusive rules, transfer credit, consolidation report", "platform acceptance 4"),
    { area: "Commerce", capability: "Checkout, coupons, installments, subscriptions, seats, invoices, refunds", status: "SIMULATED", evidence: "Sandbox only; policy engine tested", blockers: "Payment provider and go-live decision." },
    live("Credentials", "Open Badges 3.0 / VC signing, verification portal, revocation, reissue, CLR, honesty guard", "credential tests"),
    live("AI", "Governed agents, eval gates, review queue, audit", "AI tests"),
    live("AI", "AI Tutor: cited answers, refusals with hints, study plans, practice, escalation, erasable memory", "platform acceptance 6"),
    conn("AI", "model_provider", "External model providers"),
    conn("AI", "haven_avatar", "Amara / Tunde avatar mode"),
    live("Cloud Lab", "LTI 1.3 launch, AGS passback (unposted), NRPS, deep linking, dynamic registration", "platform acceptance 5"),
    conn("Cloud Lab", "container_runner", "Sandboxed Python runner"),
    conn("Cloud Lab", "gpu_pool", "GPU templates (PyTorch / TensorFlow)"),
    live("Cloud Lab", "Learner API-key vault with caps, rate limits, expiry", "key vault tests"),
    live("Analytics", "Learning, program, commerce (sandbox), AI and ops analytics; de-identified platform metrics", "analytics tests"),
    conn("Integrations", "zoom", "Zoom live classroom"),
    conn("Integrations", "havenconnect", "HavenConnect agents"),
    conn("Integrations", "havenroute", "HavenRoute email"),
    live("Integrations", "OneRoster 1.2, webhooks (signed, retry, DLQ), OAuth2, developer keys", "integration tests"),
    conn("Integrations", "webhooks", "Outbound webhook HTTP"),
    conn("Integrations", "placement_sync", "TechDev placement sync"),
    live("Platform", "REST + OpenAPI, GraphQL, gRPC (internal), metrics, audit, outbox", "API tests"),
    live("Platform", "Content licensing between tenants (content only)", "platform acceptance 7"),
    { area: "Platform", capability: "Offboard purge after retention window", status: "PLANNED", evidence: "Runbook manual step today", blockers: "Needs a scheduled purge job with operator approval." },
    live("Naming", "Legacy platform names migrated to Scholarion (no old names in code, docs or data)", "naming check test"),
  ];
}
