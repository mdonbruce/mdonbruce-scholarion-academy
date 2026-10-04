/**
 * HavenConnect app registry: every Haven product gets its own Agentic AI workspace ("room").
 * Defaults live here; administrators can edit them or add new products, and those edits are stored as
 * `app` records in the platform tenant.
 */
export type PackId = "standard" | "hospitality" | "education" | "health" | "finance";
export type AppDef = {
  slug: string; name: string; category: string; description: string; pack: PackId;
  isolation: "shared" | "dedicated"; education: boolean; color: string; status: "Live" | "Pilot" | "Planned" | "Archived";
  members: string[]; scholarisTenant?: string; parent?: string;
};

export const PACKS: Record<PackId, { label: string; forceRedact: string[]; disclosure: string; reviewRequired: boolean; note: string }> = {
  standard: { label: "Standard", forceRedact: ["PII", "PCI"], disclosure: "", reviewRequired: false, note: "Personal and card data are removed before any AI call." },
  hospitality: { label: "Hospitality", forceRedact: ["PII", "PCI"], disclosure: "Never take card numbers in chat; direct payments to the secure booking page. Staff confirm every booking change.", reviewRequired: false, note: "Card numbers are never accepted in chat; staff confirm booking changes." },
  education: { label: "Education · student records", forceRedact: ["PII", "FERPA"], disclosure: "Protect student records. Never share grades, holds or enrollment details without verified identity.", reviewRequired: false, note: "Student-record rules apply; grades need two-person approval." },
  health: { label: "Health · PHI", forceRedact: ["PII", "PCI", "PHI"], disclosure: "You are not a clinician or pharmacist. Do not give diagnoses, dosing or medical advice, and never reveal prescription details. Direct clinical questions to a licensed pharmacist.", reviewRequired: true, note: "Health data is always redacted; every AI draft needs staff review; no clinical advice." },
  finance: { label: "Finance · trading", forceRedact: ["PII", "PCI"], disclosure: "Do not give personalized investment advice or recommend buying or selling any security. Say that trading involves risk and that this is not investment advice.", reviewRequired: true, note: "No investment advice; every AI draft needs staff review; risk disclosure is required." },
};

export const DEFAULT_APPS: AppDef[] = [
  { slug: "oak-haven", name: "Oakhaven Suites", category: "Hospitality · HavenConnect home", description: "Oak Haven staff workspace: guests, front desk, and the education pilot that started in v40.", pack: "hospitality", isolation: "shared", education: true, color: "#3bd7ad", status: "Live", members: [] },
  { slug: "havenup", name: "HavenUP", category: "Hospitality · front desk", description: "Walk-in and online bookings, check-in and check-out, room changes.", pack: "hospitality", isolation: "shared", education: false, color: "#4aa8ff", status: "Pilot", members: [] },
  { slug: "vervestack", name: "VerveStack", category: "Hospitality · distribution", description: "Multi-tenant hotel distribution, booking and guest service.", pack: "hospitality", isolation: "shared", education: false, color: "#6d5ae6", status: "Planned", members: [] },
  { slug: "scholaris", name: "Scholaris Global Learning", category: "Education · LMS + SIS", description: "All-in-one school, learning and student platform.", pack: "education", isolation: "dedicated", education: true, color: "#a855f7", status: "Pilot", members: [], scholarisTenant: "scholaris" },
  { slug: "oakhaven-global-university", name: "OakHaven Global University", category: "Education · guest on Scholaris", description: "Online demonstration catalog for working adults, hosted on Scholaris Global Learning.", pack: "education", isolation: "dedicated", education: true, color: "#e04fd0", status: "Planned", members: [], scholarisTenant: "oakhaven-global-university", parent: "scholaris" },
  { slug: "medigrid", name: "MEDIGRID", category: "Health · pharmacy distribution", description: "Centralized pharmacy distribution and delivery.", pack: "health", isolation: "dedicated", education: false, color: "#ff6170", status: "Planned", members: [] },
  { slug: "haven-trading", name: "Haven Trading", category: "Finance · trading platform", description: "Dual-market trading for US and Nigerian exchanges.", pack: "finance", isolation: "dedicated", education: false, color: "#f2b33d", status: "Planned", members: [] },
  { slug: "intellicore", name: "IntelliCore", category: "SaaS · agentic analytics", description: "Enterprise agentic BI run by AI agents.", pack: "standard", isolation: "shared", education: false, color: "#12a0a6", status: "Planned", members: [] },
  { slug: "haven-agentic-ai", name: "Haven Agentic AI", category: "SaaS · GridLink dashboards", description: "Agent-automated dashboards and the AI document builder.", pack: "standard", isolation: "shared", education: false, color: "#4ade80", status: "Planned", members: [] },
  { slug: "homepilot", name: "HomePilot", category: "Not set yet", description: "Add HomePilot's description, members and guardrail pack in Apps & Rooms.", pack: "standard", isolation: "shared", education: false, color: "#ff8a5b", status: "Planned", members: [] },
];

export const PLATFORM_TENANT = "haven-platform";
export const DEFAULT_APP = "oak-haven";
export const appSlug = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
/** Cloudflare binding name for an app's dedicated database, e.g. medigrid → DB_MEDIGRID. */
export const dbBinding = (slug: string) => `DB_${slug.replace(/-/g, "_").toUpperCase()}`;
export const secretName = (slug: string) => `HAVEN_INBOUND_SECRET_${slug.replace(/-/g, "_").toUpperCase()}`;

/** Merge stored edits over the defaults. Stored apps that are not defaults are new products. */
export function mergeApps(stored: Partial<AppDef>[]): AppDef[] {
  const bySlug = new Map(stored.filter(a => a.slug).map(a => [a.slug as string, a]));
  const merged = DEFAULT_APPS.map(d => ({ ...d, ...(bySlug.get(d.slug) || {}) }) as AppDef);
  for (const a of stored) if (a.slug && !DEFAULT_APPS.some(d => d.slug === a.slug)) merged.push({ ...DEFAULT_APPS[DEFAULT_APPS.length - 1], category: "Not set yet", description: "", color: "#91a3aa", members: [], ...a } as AppDef);
  return merged;
}

/** Oak Haven stays open to all Oak Haven staff as in v40; every other room lists its members (emails or @domains),
 * who may be outside Oak Haven (for example @scholarisglobal.com). */
export function canAccessApp(app: AppDef, email: string, platformAdmin: boolean, oakHavenStaff = true) {
  if (!email) return false;
  if (platformAdmin) return true;
  if (app.status === "Archived") return false;
  const e = email.toLowerCase();
  if (app.slug === DEFAULT_APP && !app.members.length) return oakHavenStaff;
  return app.members.some(m => { const x = m.toLowerCase().trim(); return x === e || (x.startsWith("@") && e.endsWith(x)); });
}

/** Redaction for an app: the pack's forced rules stay on even if a room's settings turn them off. */
export function effectiveRedact(pack: PackId, settings: Record<string, boolean> = {}) {
  const out: Record<string, boolean> = { PII: true, PCI: true, PHI: true, FERPA: true, ...settings };
  for (const k of PACKS[pack]?.forceRedact || []) out[k] = true;
  return out;
}
