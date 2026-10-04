import fs from "node:fs";
import path from "node:path";
import { CampusError, nowIso, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";

/**
 * Governed Service Bridge (tab 63). The repository now carries two Scholarion builds side by side:
 *
 *   - this Next.js campus (src/), and
 *   - the Python governed service and static academy (governed/site), plus the HavenConnect
 *     Node app (governed/integrations/HavenConnect-current).
 *
 * The bridge shows how they relate: a module crosswalk (which Python module maps to which
 * campus tab, and what was ported), live health probes of the other services on loopback or
 * https only, and the bundle's provenance. The builds keep separate sign-in realms — no
 * session, password or learner record crosses between them.
 */

export const PROBES = "bridge_probes";
export const BUNDLE_SHA256 = "aacb2df559ef8341ba2369c06f9f33bebf74d808649d88751e36350dd3a4177b";

export type Relation = "both" | "ported" | "python_only" | "campus_only";
export const CROSSWALK: { module: string; area: string; tab: string | null; relation: Relation; note: string }[] = [
  { module: "accounts.py", area: "Sign-in with username, password and authenticator; first super-admin setup", tab: "identity", relation: "both", note: "Separate realms: Python accounts are not campus accounts." },
  { module: "lms_service.py / course_formats.json", area: "Coursework, attempts, posting", tab: "assessment", relation: "both", note: "" },
  { module: "curriculum_engine.py", area: "Curriculum package validation", tab: "curriculum-engine", relation: "both", note: "" },
  { module: "curriculum_intelligence.py", area: "Curriculum & Course Intelligence", tab: "curriculum-intelligence", relation: "both", note: "" },
  { module: "curriculum_commons.py", area: "Shared module commons", tab: "module-library", relation: "both", note: "" },
  { module: "studio_engine.py / studio_sources.py / studio_renderers.py", area: "Course Studio builds and native renderers", tab: "course-studio", relation: "both", note: "Campus writes PPTX itself; Python uses python-pptx." },
  { module: "studio_lab_runner.py", area: "Optional lab execution in a digest-pinned container", tab: "agentic-cloud-labs", relation: "python_only", note: "Campus never executes learner code; the Python runner needs Docker and an approved image." },
  { module: "assignment_packages.py", area: "Assignment packages", tab: "assessment-studio", relation: "both", note: "" },
  { module: "assessment_support.py", area: "Proctored assessment setup support", tab: "proctor-support", relation: "both", note: "Campus uses the approved talking points verbatim." },
  { module: "program_shells.py / core_programs.py / additional_programs.py / program15 / program26.py", area: "Program shells and catalog", tab: "program-studio", relation: "both", note: "" },
  { module: "self_paced.py", area: "Self-paced line", tab: "pacing", relation: "both", note: "" },
  { module: "classroom_meetings.py / communications_session_plan.py", area: "Meeting links and the 40-minute session plan", tab: "communications", relation: "both", note: "" },
  { module: "hub_service.py", area: "Help hub", tab: "helpdesk", relation: "both", note: "" },
  { module: "live_dashboard.py", area: "Live dashboard", tab: "dashboard", relation: "both", note: "" },
  { module: "integration_registry.py", area: "Integration planning register", tab: "connectors", relation: "both", note: "" },
  { module: "platform_status.py", area: "Capability status", tab: "status-board", relation: "both", note: "" },
  { module: "agent_runtime.py / agent_workbench.py / hosted_planner.py / model_planner.py", area: "Agent runtime and workbench", tab: "ai-control", relation: "both", note: "Python can call a hosted model when keys are configured; campus agents stay simulated." },
  { module: "enterprise_orchestration.py", area: "Enterprise agent-force turns and cases", tab: "tutor", relation: "both", note: "" },
  { module: "catalog_review.py", area: "Catalog claims review", tab: "catalog", relation: "both", note: "Campus Copy Checker covers the same claims." },
  { module: "engagement_policy.py", area: "Closed-vocabulary concierge", tab: "communications", relation: "both", note: "" },
  { module: "recovery.py", area: "Snapshot and isolated restore drill", tab: "tenant-admin", relation: "both", note: "" },
  { module: "load_pilot.py / pilot_capacity.json", area: "Pilot load test", tab: "operations", relation: "python_only", note: "Run it against the Python service: python load_pilot.py." },
  { module: "local_mcp.py", area: "Local MCP tool server", tab: null, relation: "python_only", note: "Loopback MCP server for the Python service." },
  { module: "department_rules.py / department_service.py", area: "Finance holds, refunds and identity-result rules", tab: "departments", relation: "ported", note: "Ported this round (tab 64)." },
  { module: "voice_studio.py", area: "Voice & Digital Human Studio", tab: "voice-studio", relation: "ported", note: "Ported and extended this round (tab 65)." },
  { module: "operational_acceptance.py", area: "Operational acceptance evidence register", tab: "acceptance", relation: "ported", note: "Ported this round (tab 66)." },
  { module: "readiness_check.py", area: "Advisory readiness self-check", tab: "catalog", relation: "ported", note: "Ported as the public /readiness page." },
];

const targetUrl = (name: "governed" | "havenconnect") => {
  const raw = name === "governed" ? (process.env.SCHOLARION_GOVERNED_URL ?? "http://127.0.0.1:4180") : (process.env.SCHOLARION_HAVENCONNECT_URL ?? "");
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (!(u.protocol === "https:" || (u.protocol === "http:" && loopback))) return null;
  return u.toString().replace(/\/$/, "");
};

export type ProbeFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{ status: number; ok: boolean }>;
const defaultFetch: ProbeFetch = (url, init) => fetch(url, { ...init, redirect: "manual" }) as unknown as Promise<{ status: number; ok: boolean }>;

/** Health probe: a GET of the service root with a 2-second timeout. Records the result; sends no credentials. */
export async function probe(store: TenantStore, a: Actor, target: "governed" | "havenconnect", fetcher: ProbeFetch = defaultFetch) {
  if (!hasAny(a, ["admin", "support"])) throw new CampusError("forbidden", "Only admins probe services.", 403);
  const url = targetUrl(target);
  const started = Date.now();
  let result: { ok: boolean; status: number | null; error: string | null };
  if (!url) result = { ok: false, status: null, error: target === "havenconnect" ? "Not configured: set SCHOLARION_HAVENCONNECT_URL (https, or http on loopback)." : "Invalid SCHOLARION_GOVERNED_URL (https, or http on loopback only)." };
  else {
    try {
      const r = await fetcher(`${url}/`, { signal: AbortSignal.timeout(2000), headers: { "user-agent": "scholarion-campus-bridge" } });
      result = { ok: r.status >= 200 && r.status < 400, status: r.status, error: null };
    } catch (e) {
      result = { ok: false, status: null, error: `Unreachable: ${(e as Error).message}`.slice(0, 200) };
    }
  }
  const row = store.tx(() => store.insert(PROBES, { target, url: url ?? null, ...result, ms: Date.now() - started, at: nowIso(), by: a.id }, "brp"));
  audit(store, a, "bridge.probe", `${PROBES}/${row.id}`, `${target}: ${result.ok ? "up" : "down"}`);
  return { target, url, ...result, ms: row.ms as number, at: row.at as string };
}

function bundleInfo() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "governed", "SOURCE-MANIFEST.json"), "utf8")) as { created?: string; files?: unknown[] | Record<string, unknown> };
    const files = Array.isArray(m.files) ? m.files.length : m.files ? Object.keys(m.files).length : null;
    return { present: true, created: m.created ?? null, files };
  } catch {
    return { present: false, created: null, files: null };
  }
}

export function bridgeStatus(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "support", "designer"])) throw new CampusError("forbidden", "Staff only.", 403);
  const last = (t: string) => {
    const r = store.list(PROBES, (p) => p.target === t).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
    return r ? { ok: !!r.ok, status: (r.status as number) ?? null, error: (r.error as string) ?? null, ms: Number(r.ms), at: String(r.at) } : null;
  };
  const counts = CROSSWALK.reduce<Record<Relation, number>>((acc, c) => ({ ...acc, [c.relation]: acc[c.relation] + 1 }), { both: 0, ported: 0, python_only: 0, campus_only: 0 });
  return {
    services: [
      { key: "governed", name: "Python governed service (governed/site)", url: targetUrl("governed"), run: "cd governed/site && python governed_service.py", last: last("governed") },
      { key: "havenconnect", name: "HavenConnect (governed/integrations/HavenConnect-current)", url: targetUrl("havenconnect"), run: "See its README (Node 22, own package.json).", last: last("havenconnect") },
    ],
    crosswalk: CROSSWALK,
    counts,
    bundle: { sha256: BUNDLE_SHA256, ...bundleInfo() },
    boundaries: [
      "Separate sign-in realms: Python accounts (username, password, authenticator) are not campus accounts; no session is shared.",
      "No learner records are synchronized between the builds.",
      "The Python lab runner executes code only inside a digest-pinned container you provision; the campus never executes learner code.",
      "Probes send no credentials and only reach loopback (http) or https addresses.",
    ],
  };
}
