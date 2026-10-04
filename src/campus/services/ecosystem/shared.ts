import { CampusError, nowMs, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { urlBlockReason } from "../studio/sources";

/** Shared helpers for the Scholarion ecosystem (Free Education Resource Hub, Career Connect, discovery). */

export const T = {
  resources: "eco_resources",
  versions: "eco_resource_versions",
  evidence: "eco_evidence",
  sources: "eco_sources",
  schedules: "eco_schedules",
  jobs: "eco_jobs",
  candidates: "eco_candidates",
  checks: "eco_checks",
  mappings: "eco_course_mappings",
  bookmarks: "eco_bookmarks",
  completions: "eco_external_completions",
  subscriptions: "eco_subscriptions",
  feed: "eco_feed",
  connections: "eco_connections",
  health: "eco_health",
  sessions: "eco_live_sessions",
  employers: "eco_employers",
  members: "eco_employer_members",
  opportunities: "eco_opportunities",
  profiles: "eco_career_profiles",
  matches: "eco_matches",
  applications: "eco_applications",
  contacts: "eco_contact_requests",
  topicLinks: "eco_topic_links",
  digests: "eco_digests",
  changelog: "eco_changelog",
  flags: "eco_posting_flags",
} as const;

export const DAY = 86_400_000;
export const REVIEW_DAYS = 30;
export const STALE_GRACE_DAYS = 7;

export const isAdmin = (a: Actor) => hasAny(a, ["admin"]);
export const isCurator = (a: Actor) => hasAny(a, ["admin", "designer"]);
export const teachesAny = (a: Actor) => Object.values(a.courseRoles ?? {}).some((r) => r.includes("instructor") || r.includes("ta"));

export function requireAdmin(store: TenantStore, a: Actor, action: string) {
  if (!isAdmin(a)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: "ecosystem", outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "Administrators only.", 403);
  }
}
export function requireCurator(store: TenantStore, a: Actor, action: string) {
  if (!isCurator(a)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: "ecosystem", outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "Administrators and designers only.", 403);
  }
}

/** Canonical URL for deduplication: lower-case host, no fragment, no tracking params, no trailing slash. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|ref$|source$|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}
export const hostOf = (raw: string) => {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "item";
export const iso = (ms: number) => new Date(ms).toISOString();
export const daysFromNow = (d: number) => iso(nowMs() + d * DAY);

/** A public http(s) URL that may be stored or linked (never private/internal). */
export function safePublicUrl(raw: unknown, field = "url"): string {
  const s = String(raw ?? "").trim();
  const why = urlBlockReason(s);
  if (why) throw new CampusError("invalid", `${field}: ${why}`, 422, { field });
  return s;
}

export function displayClassification(c: string) {
  return ({ ongoing_free: "Ongoing free plan", open_source: "Open-source / self-hosted", open_resource: "Open educational resource", education_benefit: "Education benefit (eligibility required)", limited_credits: "Limited free credits", trial: "Time-limited trial", unknown: "Availability unknown" } as Record<string, string>)[c] ?? c;
}
export function displayConnection(state: string) {
  return ({ link: "Available through link", embedded: "Embedded", connected: "Connected", account_required: "Account connection required", eligibility_required: "Eligibility verification required", quota_exhausted: "Free quota exhausted", unavailable: "Unavailable", self_hosted: "Self-host (setup instructions)" } as Record<string, string>)[state] ?? state;
}

export type { Row };
