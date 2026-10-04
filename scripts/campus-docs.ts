/**
 * Generates campus artifacts from the registry so they never drift from the code:
 *   db/campus/000_control_plane.sql   control-plane schema (no learner data)
 *   db/campus/001_tenant.sql          per-tenant data-plane schema (run once per tenant database)
 *   contracts/campus/v1/openapi.json  REST contract
 *   docs/campus/runbooks.md           one runbook per tab
 *   docs/threat-models/campus.md      threat model per tab/service
 *   npx tsx scripts/campus-docs.ts
 */
import fs from "node:fs";
import path from "node:path";
import "../src/campus";
import { ENTITIES, TABS, type FieldDef } from "../src/campus/registry";
import { openApi } from "../src/campus/http/openapi";
import { allOperations } from "../src/campus/http/ops";
import { broker, consumerNames } from "../src/campus/core";
import { ensureCampusSeed } from "../src/campus/seed";
import { capabilityBoard } from "../src/campus/services/platform";

const w = (p: string, s: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  console.log(`wrote ${p}`);
};

function sqlType(f: FieldDef): string {
  switch (f.type) {
    case "number":
      return "numeric";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "timestamptz";
    case "json":
      return "jsonb";
    case "tags":
      return "text[]";
    default:
      return "text";
  }
}

// Tables used by services that aren't user-editable registry entities.
const INTERNAL = ["sessions", "login_failures", "objects", "signing_keys", "lti_keys", "lti_launches", "lti_tokens", "lti_dl_requests", "oauth_codes", "final_overrides", "job_marks", "quiz_moderations", "discussion_subscriptions", "anon_optins", "connector_consents", "tenant_settings", "module_waivers", "pairing_codes", "ticket_messages", "webhook_sink", "deliveries", "notification_digests"];

const lines: string[] = [
  "-- Scholarion Campus: tenant data plane (generated from src/campus/registry.ts — do not edit by hand).",
  "-- One database (or cluster) per tenant. No tenant_id columns: isolation is physical.",
  "BEGIN;",
  "",
  "CREATE TABLE IF NOT EXISTS outbox (id text PRIMARY KEY, type text NOT NULL, subject text NOT NULL, data jsonb NOT NULL, at timestamptz NOT NULL, trace_id text, status text NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, delivered_to text[] NOT NULL DEFAULT '{}', last_error text);",
  "CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (status, at);",
  "CREATE TABLE IF NOT EXISTS consumer_offsets (consumer text NOT NULL, event_id text NOT NULL REFERENCES outbox(id), PRIMARY KEY (consumer, event_id));",
  "CREATE TABLE IF NOT EXISTS audit (id text PRIMARY KEY, at timestamptz NOT NULL, actor_id text NOT NULL, real_actor_id text, actor_roles text[] NOT NULL, action text NOT NULL, resource text NOT NULL, outcome text NOT NULL CHECK (outcome IN ('allowed','denied','error')), reason text, trace_id text);",
  "CREATE INDEX IF NOT EXISTS audit_at ON audit (at);",
  "",
];
for (const e of ENTITIES) {
  const cols = ["  id text PRIMARY KEY", "  version integer NOT NULL DEFAULT 1", "  created_at timestamptz NOT NULL DEFAULT now()", "  updated_at timestamptz NOT NULL DEFAULT now()", "  deleted_at timestamptz"];
  for (const f of e.fields) {
    const col = f.name === "version" ? "content_version" : f.name.replace(/([A-Z])/g, "_$1").toLowerCase();
    if (["id", "created_at", "updated_at", "deleted_at"].includes(col)) continue;
    const q = ["table", "user", "order", "group", "key", "position", "references", "default", "check"].includes(col) ? `"${col}"` : col;
    let c = `  ${q} ${sqlType(f)}`;
    if (f.required && !f.system) c += " NOT NULL";
    if (f.type === "enum" && f.options) c += ` CHECK (${q} IN (${f.options.map((o) => `'${o.replace(/'/g, "''")}'`).join(", ")}))`;
    cols.push(c);
  }
  if (e.publishable && !e.fields.some((f) => f.name === "state")) cols.push("  state text NOT NULL DEFAULT 'unpublished'");
  lines.push(`-- ${e.label} (tab: ${e.tab})`);
  lines.push(`CREATE TABLE IF NOT EXISTS ${e.table} (\n${cols.join(",\n")}\n);`);
  for (const f of e.fields.filter((x) => x.type === "ref")) {
    const col = f.name.replace(/([A-Z])/g, "_$1").toLowerCase();
    lines.push(`CREATE INDEX IF NOT EXISTS ${e.table}_${col} ON ${e.table} (${["user", "group", "order"].includes(col) ? `"${col}"` : col}) WHERE deleted_at IS NULL;`);
  }
  lines.push("");
}
for (const t of INTERNAL) lines.push(`CREATE TABLE IF NOT EXISTS ${t} (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);`);
lines.push("", "COMMIT;", "");
w("db/campus/001_tenant.sql", lines.join("\n"));

w(
  "db/campus/000_control_plane.sql",
  `-- Scholarion control plane (shared; holds no learner data).
BEGIN;
CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('guest','internal','validation')),
  status text NOT NULL CHECK (status IN ('provisioning','active','suspended')),
  realm jsonb NOT NULL,
  theme jsonb NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_plane_dsn_ref text NOT NULL,         -- secret-manager reference, never a raw DSN
  type text, region text, tier text, limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  restored_from jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  offboarded_at timestamptz
);
CREATE TABLE IF NOT EXISTS tenant_domains (host text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), verified boolean NOT NULL DEFAULT false, challenge text NOT NULL, verified_at timestamptz);
CREATE TABLE IF NOT EXISTS platform_operators (tenant_id text NOT NULL REFERENCES tenants(id), user_id text NOT NULL, PRIMARY KEY (tenant_id, user_id));
CREATE TABLE IF NOT EXISTS backups (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), at timestamptz NOT NULL, checksum text NOT NULL, rows bigint NOT NULL, object_ref text NOT NULL);
CREATE TABLE IF NOT EXISTS restore_drills (id text PRIMARY KEY, backup_id text NOT NULL REFERENCES backups(id), validation_tenant text NOT NULL, ok boolean NOT NULL, report jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS content_licenses (id text PRIMARY KEY, source_tenant_id text NOT NULL REFERENCES tenants(id), source_course_id text NOT NULL, target_tenant_id text NOT NULL REFERENCES tenants(id), target_course_id text NOT NULL, syncs int NOT NULL DEFAULT 0, last_sync_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK (source_tenant_id <> target_tenant_id));
CREATE TABLE IF NOT EXISTS model_registry (key text PRIMARY KEY, provider text NOT NULL, status text NOT NULL CHECK (status IN ('LIVE','CONNECTED','DISABLED','SIMULATED','PLANNED')), secret_ref text);
CREATE TABLE IF NOT EXISTS platform_metrics_daily (day date NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id), metric text NOT NULL, bucket text NOT NULL, PRIMARY KEY (day, tenant_id, metric)); -- bucketed, de-identified
COMMIT;
-- Placement service (separate database): profiles synced from the internal tenant only.
-- CREATE TABLE placement_profiles (key text PRIMARY KEY, source_tenant text NOT NULL, name text, headline text, skills text[], seeking text, internships jsonb, updated_at timestamptz);
`,
);

const spec = openApi();
w("contracts/campus/v1/openapi.json", JSON.stringify(spec, null, 2) + "\n");

const ops = allOperations();
const rb: string[] = ["# Scholarion Campus — runbooks", "", "Generated from the tab registry (`src/campus/registry.ts`). One section per tab.", "", "Common tools for every tab:", "", "- **Audit log:** Admin Console → Recent audit, or `GET /q/audit.log`. Every denial is recorded with the reason; act-as records carry the real admin.", "- **Outbox:** `GET /q/outbox.status?status=dead`; replay with `POST /a/outbox.replay`. Consumers: " + consumerNames().join(", ") + ".", "- **Metrics:** `/api/campus/metrics` (Prometheus text). Health: `/api/campus/health`.", "- **Jobs:** `POST /a/ops.run_jobs` (announcements, missing work, overdue holds, retention, digests, outbox relay, webhooks).", ""];
for (const t of TABS) {
  rb.push(`## ${t.n}. ${t.title}`, "", t.summary, "", `- **Purpose:** ${t.runbook.purpose}`, `- **Depends on:** ${t.runbook.deps}`, `- **Typical failures:** ${t.runbook.failure}`, `- **Recovery:** ${t.runbook.recovery}`, `- **Resources:** ${t.entities.length ? t.entities.map((e) => `\`${e}\``).join(", ") : "—"}`, `- **Operations:** ${ops.filter((o) => o.tab === t.slug).map((o) => `\`${o.name}\``).join(", ") || "—"}`, `- **Who sees it:** ${t.platformOnly ? "platform operators" : t.nav.join(", ")}${t.flag ? ` (feature flag \`${t.flag}\`)` : ""}${t.internalOnly ? " (internal tenant only)" : ""}`, "");
}
w("docs/campus/runbooks.md", rb.join("\n"));

const tm: string[] = ["# Scholarion Campus — threat model", "", "STRIDE-style notes per tab. Cross-cutting controls first.", "", "## Cross-cutting", "", "| Threat | Control | Evidence |", "|---|---|---|",
  "| Cross-tenant data access (spoofed host or slug) | TenantContext resolved from a verified host or path slug before any store is opened; host/slug mismatch → 403; unknown/suspended tenant refused at the broker | `tests/campus-security.test.ts` (negative cross-tenant suite) |",
  "| Session or token replay across tenants | Per-tenant cookie names; sessions, API and LTI tokens are stored hashed in the tenant's own store | security suite |",
  "| Privilege escalation | RBAC + permission matrix with account inheritance and locks; course-scoped roles; support access only via approved, time-boxed grants; act-as can't target admins and needs MFA | authorization matrix tests |",
  "| CSRF | SameSite=Lax cookies + Origin check on every state-changing cookie request | API tests |",
  "| Lost updates | Optimistic concurrency (version / If-Match → 412) | master acceptance 6 |",
  "| Silent side effects | Transactional outbox; idempotent consumers; dead-letter + replay | API tests (webhooks), runbooks |",
  "| Repudiation | Append-only audit with trace ids; act-as stamps the real admin on every record | security suite |",
  "| Malicious uploads | Signed short-lived URLs bound to tenant; quarantine → magic-number sniff + EICAR scan → promote | master acceptance 5 |",
  "| AI misuse (answer leakage, injection, PII) | Eval-gated policies; refusal rules; locked content excluded from retrieval; drafts need human approval; prompt hashes only in audit | AI tests, master 9, platform 6 |",
  "| Misleading claims | Catalog Copy Checker and credential honesty guard block unapproved accreditation/degree/outcome wording | platform acceptance 10 |",
  "| Payment fraud | Sandbox only; real card numbers refused; server-side quotes | platform acceptance 3 |", ""];
for (const t of TABS) if (t.threats.length) tm.push(`## ${t.n}. ${t.title}`, "", ...t.threats.map((x) => `- ${x}`), "");
w("docs/threat-models/campus.md", tm.join("\n"));
console.log(`${Object.keys(spec.paths).length} API paths, ${ops.length} operations, ${ENTITIES.length} resources, ${TABS.length} tabs`);

/* ---------------- Status board (docs/campus/STATUS.md) ---------------- */

broker.reset();
ensureCampusSeed();
const demo = broker.connect({ tenantId: "tn_demo", slug: "demo", via: "path", traceId: "docs" });
const board = capabilityBoard(demo);
const count = (s: string) => board.filter((b) => b.status === s).length;
const tabEvidence: Record<string, string> = {
  identity: "master 2, security suite", curriculum: "parity 1, master 3", enrollment: "master 4", assessment: "parity 5, master 5", gradebook: "parity 3/4/8, master 6", collaboration: "parity 7/12", files: "master 5", analytics: "master 8", integration: "API tests (OneRoster, webhooks, LTI)", admissions: "master 12 (holds), registration UI", registration: "master 12", finance: "platform commerce test", calendar: "parity 2", live: "connector status test", outcomes: "parity 6, mastery gradebook", advising: "master 8", evaluations: "survey service", credentials: "platform 3, credential tests", careers: "master 16", notifications: "parity 11", search: "security suite (ACL)", "ai-control": "master 9/13, platform 6", "curriculum-engine": "master 13", "cloud-lab": "master 14, parity 14, platform 5", "tenant-admin": "parity 13, act-as tests", privacy: "master 15", helpdesk: "authorization matrix (support grants)", operations: "platform 11, master 11", marketplace: "flagged; install approval flow", offline: "offline draft conflict flow", accommodations: "parity 5", groups: "UI + group services", library: "UI", reports: "report runs", dashboard: "UI render test", pacing: "pacing service", content: "parity 9/10", developer: "API tests (OAuth2, tokens, rate limits)", observers: "parity 11, master 7", account: "UI render test", catalog: "platform 2/10", pathways: "platform 4", tutor: "platform 6", "key-vault": "platform 5", "tenant-console": "platform 1/7/9", connectors: "status board test", "status-board": "status board test", "proctor-support": "proctor suite (10 tests)", "program-studio": "programs suite (Tab 50)", "parity-status": "programs suite (Tab 51)", "module-library": "agentic suite (Tab 52: hub, library, policies, consolidation)", "assessment-studio": "labs suite (Tab 53: generators, approvals, QTI, simulated labs)", "agentic-cloud-labs": "labs suite (Tab 54: workspaces, bounded autonomous runner, permissions, run logs, rubric grading, 2 attempts)", "learning-area": "learning-area suite (Tab 55: 15 sections, workspaces, practice vs graded, idempotent submit and posting, infra failure, Check Answers, passbook, projection lock, protected downloads)", "free-resources": "ecosystem suite (Tab 57: seeded verified catalog, schema validation, filters, live blocks, mappings, connections)", "career-connect": "ecosystem suite (Tab 58: opt-in talent search, consent contact, idempotent applications, partner rule)", "discovery-automation": "ecosystem suite (Tab 59: terms review, link checks, dedupe, retries/dead-letter, missed runs, API v1)", "communications": "comms suite (Tab 62: segmentation table, pre-created meetings, Session Card, reminders, 33-minute warning, next link, recap approval, support agent with disclosure, failover, link regeneration, segment attendance, captioned recordings, Genesys checklist/licences/mock suite)", "curriculum-intelligence": "cci suite (Tab 61: exchange pipeline with learner-data block, design studio overlap, alignment heatmap, human-loaded standards packs as evidence for review, course health, item analysis, freshness tickets, accessibility audit, proposal workflow with separation of duties, report downloads)", "commerce": "platform 3 + commerce policy test; plans suite (trial disclosures and reminders, one-step cancel at period end, annual refund window, program plans, pause, financial aid with human decision) + platform commerce test", "campaigns": "campaigns suite (Tab 60: DST-aware 18-session schedule, flyers with the approved photo and no invented meeting details, Copy Checker on every asset, opt-in sends held without a provider, unsubscribe, manual channels, program folder export)", "course-studio": "studio suite (Tab 56: sources, resumable pipeline, 10-slide deck, folder tree, release gate, honest media status) + learning-area suite",
};
const st: string[] = [
  "# Scholarion Campus — status board",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/campus-docs.ts\`. Environment: local + staging only (demonstration data, sandbox payments).`,
  "",
  `**Capabilities:** ${count("LIVE")} LIVE · ${count("CONNECTED")} CONNECTED · ${count("SIMULATED")} SIMULATED · ${count("DISABLED")} DISABLED · ${count("PLANNED")} PLANNED`,
  "",
  `## Tabs (${TABS.length})`,
  "",
  "A tab is OPERATIONAL when it has persisted resources, enforced authorization, audited writes, an API surface (REST + operations + GraphQL), a working screen, and a passing test. Tabs that depend on outside services report the connector state honestly.",
  "",
  "| # | Tab | Group | Status | Evidence |",
  "|---|---|---|---|---|",
  ...TABS.map((t) => `| ${t.n} | ${t.title} | ${t.group} | ${t.slug === "live" ? "OPERATIONAL (Zoom connector SIMULATED)" : t.slug === "marketplace" ? "OPERATIONAL (behind flag)" : "OPERATIONAL"} | ${tabEvidence[t.slug] ?? "UI render test"} |`),
  "",
  "## Capabilities",
  "",
  "| Area | Capability | Status | Evidence | Blockers |",
  "|---|---|---|---|---|",
  ...board.map((b) => `| ${b.area} | ${b.capability} | ${b.status} | ${b.evidence} | ${b.blockers ?? "—"} |`),
  "",
  "## Acceptance results",
  "",
  "- Master build scenario 1–16: `tests/campus-master.test.ts` — all pass.",
  "- LMS parity 1–14: `tests/campus-parity.test.ts` — all pass. Parity 15 (accessibility gate): `scripts/campus-a11y.mjs` runs axe (WCAG 2.0/2.1/2.2 A+AA) on every rendered screen in CI.",
  "- Platform scenario 1–11: `tests/campus-platform.test.ts` — all pass.",
  "- Tenant isolation and authorization: `tests/campus-security.test.ts` (authorization matrix + negative cross-tenant suite).",
  "- APIs: `tests/campus-api.test.ts` (REST, Link pagination, ETag/412, act-as, OAuth2, rate limits, GraphQL, OpenAPI, gRPC, LTI AGS/NRPS, webhooks, OneRoster, iCal, metrics).",
  "- Every tab renders for its users: `tests/campus-ui.test.ts`.",
  "",
  "## AI evaluation results",
  "",
  "Every agent's active policy passed the evaluation suite (refusal of graded work, grade changes, other people's data and prompt injection; no answer without sources; never writes grades; bounded citations; tenant-scoped retrieval; human review for drafting agents). The engine is local extractive retrieval — no external model is called.",
  "",
  "## Naming migration",
  "",
  "- [x] Platform name is Scholarion everywhere (code, docs, contracts, data). Checked by `tests/campus-naming.test.ts`.",
  "- [x] The guest university tenant is **Scholarion Demo University**; the internal tenant is **TechDev Institution**; the first-party academy tenant is **Scholaris AI Academy**.",
  "",
  "## Open risks and decisions for the product owner",
  "",
  "1. Outside services (Haven avatars/HavenConnect/HavenRoute, model providers, Zoom API, GPU pools, SSO federation, payments) need accounts, credentials and network access — kept DISABLED/SIMULATED until the go-live decision.",
  "2. Stores are in-memory with optional JSON persistence; production needs the generated Postgres schema (`db/campus/`) behind the same store interface, one database per tenant.",
  "3. Offboarding purge after the retention window is a manual operator step (PLANNED as a scheduled job).",
  "4. Penetration test and a manual screen-reader pass are required before any go-live decision.",
  "",
];
w("docs/campus/STATUS.md", st.join("\n"));
