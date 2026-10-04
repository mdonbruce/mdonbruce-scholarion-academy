import crypto from "node:crypto";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { audit, notify } from "../common";
import { validateDefinition } from "./schema";
import { DAY, REVIEW_DAYS, T, canonicalUrl, daysFromNow, displayClassification, displayConnection, hostOf, isAdmin, isCurator, iso, requireAdmin, requireCurator, safePublicUrl, slugify } from "./shared";

/**
 * Free Education Resource Hub: the verified catalog (tools, courses, readings), evidence and
 * version history, publication rules, bookmarks, course mappings, recommendations, "What's New",
 * subscriptions, provider connections and the provider-neutral live classroom.
 */

export const GROUPS: Record<string, { title: string; categories: string[]; subjects?: RegExp }> = {
  tools: { title: "Free Tools Directory", categories: ["ai_tool", "agentic_ai", "meeting", "avatar", "video", "audio", "cloud_lab", "reading"] },
  ai: { title: "AI and Machine Intelligence Resources", categories: ["ai_tool", "cloud_lab"] },
  agentic: { title: "Agentic AI Tools and Templates", categories: ["agentic_ai"] },
  avatar: { title: "Virtual Instructor and Avatar Studio", categories: ["avatar"] },
  live: { title: "Live Classroom Hub", categories: ["meeting"] },
  media: { title: "Video and Audio Studio", categories: ["video", "audio", "avatar"] },
  library: { title: "Open Courses and Reading Library", categories: ["course", "reading"] },
};

/* ---------------- publication rules ---------------- */

/** Decide a record's status from its evidence. Never marks something verified without evidence. */
export function publicationDecision(r: Row, evidence: Row[]): { status: string; reason: string | null } {
  if (r.status === "archived") return { status: "archived", reason: (r.statusReason as string) ?? null };
  if (!evidence.length) return { status: "pending", reason: "No supporting evidence from an official source yet." };
  if (r.classification === "trial" && !r.expiresAt) return { status: "pending", reason: "Trial without a confirmed expiration." };
  if (r.classification === "unknown") return { status: "pending", reason: "Free-access terms couldn't be confirmed." };
  if (evidence.some((e) => e.conflict)) return { status: "pending", reason: "Sources disagree; waiting for consistent evidence." };
  if (evidence.every((e) => e.confirmed)) return { status: "verified", reason: null };
  return { status: "pending", reason: (r.statusReason as string) || "Some claims haven't been confirmed on an official page." };
}

/** Write a new version (meaningful changes only) and publish per the rules. Emits What's New items. */
export function saveResource(store: TenantStore, id: string, patch: Record<string, unknown>, reason: string, jobId: string | null = null) {
  const before = { ...store.get(T.resources, id)! };
  const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
  if (!changed.length) return { row: before, changed };
  const version = Number(before.version ?? 1) + 1;
  const row = store.update(T.resources, id, { ...patch, version });
  store.insert(T.versions, { resourceId: id, version, changedFields: changed, before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, patch[k] ?? null])), reason, jobId, changedAt: nowIso() }, "erv");
  if (changed.includes("status")) statusFeed(store, row, String(before.status));
  if (changed.includes("limits") && before.status === "verified") feedItem(store, "limits_changed", `${row.name}: free-plan limits changed`, { resourceId: id, subjects: row.subjects as string[] });
  return { row, changed };
}

function statusFeed(store: TenantStore, r: Row, from: string) {
  const to = String(r.status);
  if (to === "verified" && from !== "verified") feedItem(store, r.kind === "tool" ? "new_tool" : "new_resource", `Newly verified: ${r.name}`, { resourceId: r.id, subjects: r.subjects as string[] });
  if (to === "unavailable" || to === "archived") {
    feedItem(store, "discontinued", `${r.name} is ${to === "archived" ? "archived" : "unavailable"}`, { resourceId: r.id, subjects: r.subjects as string[] });
    affectedCourses(store, r, `${r.name} is no longer available.`);
  }
  if (from === "verified" && to === "pending") {
    feedItem(store, "limits_changed", `${r.name}: terms changed — re-verification pending`, { resourceId: r.id, subjects: r.subjects as string[] });
    affectedCourses(store, r, `${r.name}'s free terms changed and are being re-verified.`);
  }
  if (to === "stale") feedItem(store, "stale", `${r.name}: verification is out of date`, { resourceId: r.id, subjects: r.subjects as string[] });
}

/** Notify the staff of courses that use a resource and suggest a verified alternative (never moves data). */
function affectedCourses(store: TenantStore, r: Row, msg: string) {
  const maps = store.list(T.mappings, (m) => m.resourceId === r.id);
  if (!maps.length) return;
  const alt = store.list(T.resources, (x) => x.status === "verified" && x.category === r.category && x.id !== r.id)[0];
  for (const m of maps) {
    store.update(T.mappings, m.id, { flagged: true, flagReason: msg, suggestedAlternativeId: alt?.id ?? null });
    const staff = store.list("enrollments", (e) => e.courseId === m.courseId && (e.role === "instructor" || e.role === "ta") && e.state === "active").map((e) => String(e.userId));
    notify(store, staff, "resources", `Course resource changed: ${r.name}`, `${msg}${alt ? ` A verified alternative: ${alt.name}.` : ""} Nothing was changed for your learners.`, `/campus/{tenant}/hub/recommendations?course=${m.courseId}`, String(m.courseId));
  }
}

export function feedItem(store: TenantStore, kind: string, title: string, x: { resourceId?: string; opportunityId?: string; subjects?: string[]; courseId?: string }) {
  const item = store.insert(T.feed, { kind, title, resourceId: x.resourceId ?? null, opportunityId: x.opportunityId ?? null, subjects: x.subjects ?? [], courseId: x.courseId ?? null, at: nowIso() }, "efd");
  // In-site notifications for matching subscriptions only (no external channels unless configured).
  const subs = store.list(T.subscriptions, (s) => (s.kind === "subject" && (x.subjects ?? []).some((sub) => sub.toLowerCase().includes(String(s.value).toLowerCase()))) || (s.kind === "career" && kind === "opportunity") || (s.kind === "course" && x.courseId === s.value) || (s.kind === "all"));
  notify(store, [...new Set(subs.map((s) => String(s.userId)))], "whats_new", title, "New in the Scholarion Free Education Resource Hub.", "/campus/{tenant}/hub/whats-new");
  return item;
}

/* ---------------- seeding from the researched catalog ---------------- */

export interface SeedRecord {
  id: string;
  name: string;
  provider: string;
  official_url: string;
  category: string;
  subjects: string[];
  description: string;
  use_cases: string[];
  classification: string;
  account_required: boolean | null;
  payment_card_required: boolean | null;
  api_access: string;
  limits: { metric: string; value: number | string; unit: string; reset_period: string | null }[];
  license: string | null;
  embedding: string;
  redistribution: string;
  attribution_required: boolean | null;
  certificate: string | null;
  integration_method: string;
  status: string;
  evidence: { url: string; retrieved_at: string; claims: string[]; summary: string | null }[];
  notes: string;
}

/** Terms a later review must still find on the official page for the record to stay verified. */
export function checkTermsFor(rec: { limits: { value: number | string }[]; license?: string | null }): string[] {
  const nums = rec.limits.map((l) => l.value).filter((v) => typeof v === "number" && v >= 1 && Number.isInteger(v)).map(String);
  return [...new Set(nums)];
}

export function upsertSeedRecord(store: TenantStore, rec: SeedRecord, source = "catalog-2026-10-04") {
  const existing = store.list(T.resources, (r) => r.key === rec.id)[0];
  if (existing) return existing;
  const kind = rec.category === "course" ? "course" : rec.category === "reading" && /textbook|openstax/i.test(rec.name + rec.description) ? "reading" : "tool";
  const verified = rec.status === "verified";
  const r = store.insert(
    T.resources,
    {
      key: rec.id,
      kind,
      name: rec.name,
      provider: rec.provider,
      officialUrl: rec.official_url,
      canonicalUrl: canonicalUrl(rec.official_url),
      category: rec.category,
      subjects: rec.subjects,
      description: rec.description,
      useCases: rec.use_cases,
      classification: rec.classification,
      accountRequired: rec.account_required,
      cardRequired: rec.payment_card_required,
      apiAccess: rec.api_access,
      limits: rec.limits,
      license: rec.license,
      embedding: rec.embedding,
      redistribution: rec.redistribution,
      attributionRequired: rec.attribution_required,
      certificate: rec.certificate,
      integrationMethod: rec.integration_method,
      docsUrl: rec.integration_method === "api" ? (rec.evidence.find((e) => /\/docs\//.test(e.url)) ?? rec.evidence[0])?.url ?? null : null,
      connectionState: rec.integration_method === "embed" ? "embedded" : rec.integration_method === "self_hosted" ? "self_hosted" : "link",
      accessibility: [],
      geographicRestrictions: [],
      eligibility: rec.classification === "education_benefit" ? ["education eligibility"] : [],
      expiresAt: null,
      status: verified ? "verified" : "pending",
      statusReason: verified ? null : rec.notes || "Some claims couldn't be confirmed on an official page.",
      notes: rec.notes,
      verifiedAt: verified ? rec.evidence[0]?.retrieved_at ?? nowIso() : null,
      nextReviewAt: daysFromNow(REVIEW_DAYS),
      version: 1,
      origin: source,
    },
    "eres",
  );
  for (const e of rec.evidence) store.insert(T.evidence, { resourceId: r.id, url: e.url, host: hostOf(e.url), retrievedAt: e.retrieved_at, claims: e.claims, summary: e.summary, checkTerms: checkTermsFor(rec), confirmed: verified, conflict: false }, "eev");
  store.insert(T.versions, { resourceId: r.id, version: 1, changedFields: ["created"], before: {}, after: { status: r.status }, reason: `Imported from the researched catalog (${source}).`, jobId: null, changedAt: nowIso() }, "erv");
  return r;
}

/* ---------------- queries ---------------- */

export interface ResourceFilter {
  q?: string;
  group?: string;
  category?: string;
  kind?: string;
  subject?: string;
  freeOnly?: boolean;
  noCard?: boolean;
  api?: boolean;
  selfHosted?: boolean;
  accessible?: boolean;
  status?: string;
  connection?: string;
  includePending?: boolean;
  page?: number;
  pageSize?: number;
}

const GENUINELY_FREE = ["ongoing_free", "open_source", "open_resource"];

export function resourceView(store: TenantStore, r: Row, a?: Actor) {
  const ev = store.list(T.evidence, (e) => e.resourceId === r.id);
  const maps = store.list(T.mappings, (m) => m.resourceId === r.id).map((m) => ({ courseId: String(m.courseId), course: String(store.get("courses", String(m.courseId))?.code ?? m.courseId), topic: (m.topic as string) ?? null, flagged: !!m.flagged }));
  const conn = store.list(T.connections, (c) => c.resourceId === r.id && c.state !== "removed")[0];
  return {
    id: r.id,
    key: String(r.key),
    kind: String(r.kind),
    name: String(r.name),
    provider: String(r.provider),
    officialUrl: String(r.officialUrl),
    category: String(r.category),
    subjects: (r.subjects as string[]) ?? [],
    description: String(r.description ?? ""),
    useCases: (r.useCases as string[]) ?? [],
    classification: String(r.classification),
    classificationLabel: displayClassification(String(r.classification)),
    genuinelyFree: GENUINELY_FREE.includes(String(r.classification)) && r.status === "verified",
    accountRequired: (r.accountRequired as boolean | null) ?? null,
    cardRequired: (r.cardRequired as boolean | null) ?? null,
    apiAccess: String(r.apiAccess),
    limits: (r.limits as { metric: string; value: number | string; unit: string; reset_period: string | null }[]) ?? [],
    license: (r.license as string) ?? null,
    embedding: String(r.embedding ?? "unknown"),
    redistribution: String(r.redistribution ?? "unknown"),
    attributionRequired: (r.attributionRequired as boolean | null) ?? null,
    certificate: (r.certificate as string) ?? null,
    integrationMethod: String(r.integrationMethod),
    connectionState: conn ? String(conn.state) : String(r.connectionState),
    connectionLabel: displayConnection(conn ? String(conn.state) : String(r.connectionState)),
    accessibility: (r.accessibility as string[]) ?? [],
    geographicRestrictions: (r.geographicRestrictions as string[]) ?? [],
    status: String(r.status),
    statusReason: (r.statusReason as string) ?? null,
    verifiedAt: (r.verifiedAt as string) ?? null,
    nextReviewAt: (r.nextReviewAt as string) ?? null,
    version: Number(r.version ?? 1),
    notes: (r.notes as string) ?? "",
    evidence: ev.map((e) => ({ url: String(e.url), retrievedAt: String(e.retrievedAt), claims: (e.claims as string[]) ?? [], confirmed: !!e.confirmed, summary: (e.summary as string) ?? null })),
    mappings: maps,
    bookmarked: a ? store.list(T.bookmarks, (b) => b.userId === a.id && b.resourceId === r.id).length > 0 : false,
  };
}
export type ResourceView = ReturnType<typeof resourceView>;

export function listResources(store: TenantStore, a: Actor, f: ResourceFilter = {}) {
  const staffView = isCurator(a) || f.includePending === true;
  const cats = f.group ? GROUPS[f.group]?.categories : undefined;
  const q = (f.q ?? "").trim().toLowerCase();
  let rows = store.list(T.resources, (r) => {
    if (!staffView && !["verified", "stale", "unavailable"].includes(String(r.status))) return false;
    if (r.status === "archived" && f.status !== "archived") return false;
    if (cats && !cats.includes(String(r.category))) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.subject && !((r.subjects as string[]) ?? []).some((s) => s.toLowerCase().includes(f.subject!.toLowerCase()))) return false;
    if (f.freeOnly && !(GENUINELY_FREE.includes(String(r.classification)) && r.status === "verified")) return false;
    if (f.noCard && r.cardRequired !== false && !["open_source", "open_resource"].includes(String(r.classification))) return false;
    if (f.api && !["free", "mixed", "paid"].includes(String(r.apiAccess))) return false;
    if (f.selfHosted && r.integrationMethod !== "self_hosted" && r.classification !== "open_source") return false;
    if (f.accessible && !((r.accessibility as string[]) ?? []).length) return false;
    if (f.connection && r.connectionState !== f.connection) return false;
    if (q && !`${r.name} ${r.provider} ${r.description} ${((r.subjects as string[]) ?? []).join(" ")} ${((r.useCases as string[]) ?? []).join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((x, y) => (x.status === "verified" ? 0 : 1) - (y.status === "verified" ? 0 : 1) || String(x.name).localeCompare(String(y.name)));
  const total = rows.length;
  const size = Math.min(100, Math.max(1, f.pageSize ?? 50));
  const page = Math.max(1, f.page ?? 1);
  rows = rows.slice((page - 1) * size, page * size);
  return { items: rows.map((r) => resourceView(store, r, a)), total, page, pageSize: size };
}

export function getResource(store: TenantStore, a: Actor, idOrKey: string) {
  const r = store.get(T.resources, idOrKey) ?? store.list(T.resources, (x) => x.key === idOrKey)[0];
  if (!r || (!isCurator(a) && !["verified", "stale", "unavailable"].includes(String(r.status)))) throw new CampusError("not_found", "Resource not found", 404);
  const versions = store.list(T.versions, (v) => v.resourceId === r.id).sort((x, y) => Number(y.version) - Number(x.version)).map((v) => ({ version: Number(v.version), changedFields: v.changedFields as string[], reason: String(v.reason), at: String(v.changedAt) }));
  const checks = isCurator(a) ? store.list(T.checks, (c) => c.resourceId === r.id).slice(-10).reverse().map((c) => ({ kind: String(c.kind), ok: !!c.ok, detail: String(c.detail ?? ""), at: String(c.at) })) : [];
  return { ...resourceView(store, r, a), versions, checks, definition: definitionOf(store, r) };
}

/** The record as a Scholarion Integration Definition (schema 1.1.0) — never includes credentials. */
export function definitionOf(store: TenantStore, r: Row) {
  const ev = store.list(T.evidence, (e) => e.resourceId === r.id);
  const method = String(r.integrationMethod);
  return {
    schema_version: "1.1.0",
    id: String(r.key),
    name: String(r.name),
    category: String(r.category),
    provider: { name: String(r.provider), official_url: String(r.officialUrl) },
    access: { classification: String(r.classification), account_required: (r.accountRequired as boolean | null) ?? null, payment_card_required: (r.cardRequired as boolean | null) ?? null, api_access: String(r.apiAccess), eligibility: (r.eligibility as string[]) ?? [], limits: (r.limits as unknown[]) ?? [], expires_at: (r.expiresAt as string) ?? null },
    connection: { method, auth: method === "oauth" ? "oauth2" : method === "api" ? "api_key" : "none", ...(method === "api" && r.docsUrl ? { documentation_url: String(r.docsUrl) } : {}), allowed_operations: method === "embed" ? ["embed"] : method === "self_hosted" ? ["setup_instructions"] : ["launch_link"] },
    content_permissions: { license: (r.license as string) ?? null, embedding: String(r.embedding ?? "unknown"), redistribution: String(r.redistribution ?? "unknown"), attribution_required: (r.attributionRequired as boolean | null) ?? null },
    verification: { status: String(r.status), verified_at: (r.verifiedAt as string) ?? null, next_review_at: (r.nextReviewAt as string) ?? null, evidence: ev.map((e) => ({ url: String(e.url), retrieved_at: String(e.retrievedAt), claims: (e.claims as string[]) ?? [] })) },
    description: String(r.description ?? ""),
    subjects: (r.subjects as string[]) ?? [],
    use_cases: (r.useCases as string[]) ?? [],
    accessibility: (r.accessibility as string[]) ?? [],
    geographic_restrictions: (r.geographicRestrictions as string[]) ?? [],
    certificate: (r.certificate as string) ?? null,
  };
}

export function hubSummary(store: TenantStore, a: Actor) {
  const all = store.list(T.resources, (r) => r.status !== "archived");
  const recentJobs = store.list(T.jobs, () => true).sort((x, y) => String(y.updatedAt ?? y.createdAt).localeCompare(String(x.updatedAt ?? x.createdAt))).slice(0, 8);
  return {
    verified: all.filter((r) => r.status === "verified").length,
    pending: all.filter((r) => r.status === "pending").length,
    stale: all.filter((r) => r.status === "stale").length,
    unavailable: all.filter((r) => r.status === "unavailable").length,
    connected: store.list(T.connections, (c) => c.state === "connected").length,
    activeOpportunities: store.list(T.opportunities, (o) => o.status === "open").length,
    feed: store.list(T.feed, () => true).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 12).map((f) => ({ kind: String(f.kind), title: String(f.title), at: String(f.at), resourceId: (f.resourceId as string) ?? null, opportunityId: (f.opportunityId as string) ?? null })),
    jobs: isAdmin(a) ? recentJobs.map((j) => ({ id: j.id, kind: String(j.kind), state: String(j.state), at: String(j.finishedAt ?? j.updatedAt ?? j.createdAt), summary: String(j.summary ?? "") })) : [],
  };
}

/* ---------------- curation ---------------- */

/** Add or update a resource by hand (admins/designers). It publishes automatically only with confirmed evidence. */
export function curateResource(store: TenantStore, a: Actor, input: Record<string, unknown>) {
  requireCurator(store, a, "eco.resource.curate");
  const officialUrl = safePublicUrl(input.officialUrl, "officialUrl");
  const canon = canonicalUrl(officialUrl);
  const existing = store.list(T.resources, (r) => r.canonicalUrl === canon || (!!input.key && r.key === input.key))[0];
  const fields = {
    name: String(input.name ?? "").trim().slice(0, 200),
    provider: String(input.provider ?? "").trim().slice(0, 200),
    officialUrl,
    canonicalUrl: canon,
    category: String(input.category ?? "ai_tool"),
    kind: String(input.kind ?? (input.category === "course" ? "course" : "tool")),
    subjects: ((input.subjects as string[]) ?? []).map(String).slice(0, 20),
    description: String(input.description ?? "").slice(0, 2000),
    classification: String(input.classification ?? "unknown"),
    apiAccess: String(input.apiAccess ?? "unknown"),
    integrationMethod: String(input.integrationMethod ?? "link"),
    license: input.license ? String(input.license) : null,
    redistribution: String(input.redistribution ?? "unknown"),
    embedding: String(input.embedding ?? "unknown"),
    cardRequired: input.cardRequired === undefined ? null : !!input.cardRequired,
    accountRequired: input.accountRequired === undefined ? null : !!input.accountRequired,
    accessibility: ((input.accessibility as string[]) ?? []).map(String),
    limits: (input.limits as unknown[]) ?? [],
  };
  if (!fields.name || !fields.provider) throw new CampusError("invalid", "Name and provider are required.", 422);
  return store.tx(() => {
    const r = existing ? saveResource(store, existing.id, fields, `Curated by ${a.name}.`).row : store.insert(T.resources, { key: slugify(String(input.key ?? fields.name)), ...fields, useCases: [], connectionState: fields.integrationMethod === "embed" ? "embedded" : fields.integrationMethod === "self_hosted" ? "self_hosted" : "link", status: "pending", statusReason: "No supporting evidence from an official source yet.", verifiedAt: null, nextReviewAt: daysFromNow(REVIEW_DAYS), version: 1, origin: "curated", certificate: null, eligibility: [], geographicRestrictions: [], expiresAt: null }, "eres");
    audit(store, a, "eco.resource.curate", `${T.resources}/${r.id}`);
    return resourceView(store, store.get(T.resources, r.id)!, a);
  });
}

/** Attach official evidence. The claims are confirmed only by the verification job that fetches the page. */
export function addEvidence(store: TenantStore, a: Actor, resourceId: string, input: { url: string; claims: string[]; checkTerms?: string[] }) {
  requireCurator(store, a, "eco.evidence.add");
  const r = store.get(T.resources, resourceId);
  if (!r) throw new CampusError("not_found", "Resource not found", 404);
  const url = safePublicUrl(input.url);
  return store.tx(() => {
    const e = store.insert(T.evidence, { resourceId, url, host: hostOf(url), retrievedAt: null, claims: (input.claims ?? []).map(String).slice(0, 20), summary: null, checkTerms: (input.checkTerms ?? []).map(String).slice(0, 20), confirmed: false, conflict: false, addedBy: a.id }, "eev");
    // The evidence host becomes a trusted verification source for this record only.
    if (!store.list(T.sources, (s) => s.host === hostOf(url) && s.kind === "official_page").length) store.insert(T.sources, { key: `page-${hostOf(url)}`, name: `${hostOf(url)} official pages`, kind: "official_page", url, host: hostOf(url), trusted: true, enabled: true, rateLimitPerMin: 10, subjects: [], defaults: {} }, "esrc");
    saveResource(store, resourceId, { status: "pending", statusReason: "New evidence awaiting verification." }, `Evidence added by ${a.name}.`);
    audit(store, a, "eco.evidence.add", `${T.resources}/${resourceId}`, url);
    return e;
  });
}

export function archiveResource(store: TenantStore, a: Actor, resourceId: string, reason: string) {
  requireCurator(store, a, "eco.resource.archive");
  if (!store.get(T.resources, resourceId)) throw new CampusError("not_found", "Resource not found", 404);
  return store.tx(() => saveResource(store, resourceId, { status: "archived", statusReason: reason || "Archived by a curator." }, `Archived by ${a.name}.`).row);
}

/* ---------------- learner features ---------------- */

export function toggleBookmark(store: TenantStore, a: Actor, resourceId: string) {
  if (!store.get(T.resources, resourceId)) throw new CampusError("not_found", "Resource not found", 404);
  const b = store.list(T.bookmarks, (x) => x.userId === a.id && x.resourceId === resourceId)[0];
  return store.tx(() => {
    if (b) {
      store.tombstone(T.bookmarks, b.id);
      return { bookmarked: false };
    }
    store.insert(T.bookmarks, { userId: a.id, resourceId }, "ebm");
    return { bookmarked: true };
  });
}

export function myBookmarks(store: TenantStore, a: Actor) {
  return store.list(T.bookmarks, (b) => b.userId === a.id).map((b) => store.get(T.resources, String(b.resourceId))).filter((r): r is Row => !!r).map((r) => resourceView(store, r, a));
}

/** Learner-provided evidence of an external completion. Opening a resource is never treated as completion. */
export function reportExternalCompletion(store: TenantStore, a: Actor, resourceId: string, evidenceUrl: string, note: string) {
  const r = store.get(T.resources, resourceId);
  if (!r) throw new CampusError("not_found", "Resource not found", 404);
  const url = safePublicUrl(evidenceUrl, "evidenceUrl");
  return store.tx(() => store.insert(T.completions, { userId: a.id, resourceId, evidenceUrl: url, note: String(note ?? "").slice(0, 500), status: "self_reported", reportedAt: nowIso() }, "ecmp"));
}

export function subscribe(store: TenantStore, a: Actor, kind: string, value: string) {
  if (!["subject", "course", "career", "all"].includes(kind)) throw new CampusError("invalid", "kind must be subject, course, career or all.", 422);
  const existing = store.list(T.subscriptions, (s) => s.userId === a.id && s.kind === kind && s.value === value)[0];
  if (existing) return existing;
  return store.tx(() => store.insert(T.subscriptions, { userId: a.id, kind, value: String(value ?? "").slice(0, 80) }, "esub"));
}
export function unsubscribe(store: TenantStore, a: Actor, id: string) {
  const s = store.get(T.subscriptions, id);
  if (!s || s.userId !== a.id) throw new CampusError("not_found", "Subscription not found", 404);
  store.tx(() => store.tombstone(T.subscriptions, id));
  return { removed: true };
}
export function mySubscriptions(store: TenantStore, a: Actor) {
  return store.list(T.subscriptions, (s) => s.userId === a.id).map((s) => ({ id: s.id, kind: String(s.kind), value: String(s.value) }));
}

export function whatsNew(store: TenantStore, limit = 40) {
  return store.list(T.feed, () => true).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, limit).map((f) => ({ id: f.id, kind: String(f.kind), title: String(f.title), at: String(f.at), resourceId: (f.resourceId as string) ?? null, opportunityId: (f.opportunityId as string) ?? null }));
}

/* ---------------- course mappings & recommendations ---------------- */

function canMapCourse(a: Actor, courseId: string) {
  return isCurator(a) || hasAny(a, ["instructor"], courseId);
}

export function mapToCourse(store: TenantStore, a: Actor, input: { courseId: string; resourceId: string; topic?: string; note?: string }, idempotencyKey?: string) {
  if (!store.get("courses", input.courseId)) throw new CampusError("not_found", "Course not found", 404);
  if (!canMapCourse(a, input.courseId)) throw new CampusError("forbidden", "Only the course's instructors (or admins and designers) can map resources.", 403);
  const r = store.get(T.resources, input.resourceId);
  if (!r) throw new CampusError("not_found", "Resource not found", 404);
  const dup = store.list(T.mappings, (m) => (idempotencyKey && m.idempotencyKey === idempotencyKey) || (m.courseId === input.courseId && m.resourceId === input.resourceId && (m.topic ?? null) === (input.topic ?? null)))[0];
  if (dup) return dup;
  return store.tx(() => {
    const m = store.insert(T.mappings, { courseId: input.courseId, resourceId: input.resourceId, topic: input.topic ?? null, note: String(input.note ?? "").slice(0, 500), mappedBy: a.id, idempotencyKey: idempotencyKey ?? null, flagged: false }, "emap");
    audit(store, a, "eco.mapping.create", `${T.mappings}/${m.id}`);
    return m;
  });
}

export function courseResources(store: TenantStore, a: Actor, courseId: string) {
  const course = store.get("courses", courseId);
  if (!course) throw new CampusError("not_found", "Course not found", 404);
  const visible = isCurator(a) || hasAny(a, ["instructor", "ta", "student", "observer"], courseId);
  if (!visible) throw new CampusError("forbidden", "Not in this course.", 403);
  return store.list(T.mappings, (m) => m.courseId === courseId).map((m) => {
    const r = store.get(T.resources, String(m.resourceId));
    if (!r || (!isCurator(a) && !hasAny(a, ["instructor", "ta"], courseId) && !["verified", "stale"].includes(String(r.status)))) return null;
    return { mappingId: m.id, topic: (m.topic as string) ?? null, note: String(m.note ?? ""), flagged: !!m.flagged, flagReason: (m.flagReason as string) ?? null, suggestedAlternativeId: (m.suggestedAlternativeId as string) ?? null, resource: resourceView(store, r, a) };
  }).filter((x): x is NonNullable<typeof x> => !!x);
}

/** Recommendations for a course: topic and objective keywords × subjects, verified free resources first. */
export function recommendForCourse(store: TenantStore, a: Actor, courseId: string, opts: { level?: string; accessible?: boolean } = {}) {
  const course = store.get("courses", courseId);
  if (!course) throw new CampusError("not_found", "Course not found", 404);
  const text = [course.title, course.description, ...store.list("modules", (m) => m.courseId === courseId).map((m) => m.title)].join(" ").toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const mapped = new Set(store.list(T.mappings, (m) => m.courseId === courseId).map((m) => String(m.resourceId)));
  return store.list(T.resources, (r) => r.status === "verified" && !mapped.has(r.id) && (!opts.accessible || ((r.accessibility as string[]) ?? []).length > 0))
    .map((r) => {
      const hay = `${r.name} ${r.description} ${((r.subjects as string[]) ?? []).join(" ")} ${((r.useCases as string[]) ?? []).join(" ")}`.toLowerCase().split(/[^a-z0-9]+/);
      const hits = [...new Set(hay.filter((w) => words.has(w)))];
      return { r, hits };
    })
    .filter((x) => x.hits.length)
    .sort((x, y) => y.hits.length - x.hits.length)
    .slice(0, 12)
    .map((x) => ({ resource: resourceView(store, x.r, a), why: `Matches this course on: ${x.hits.slice(0, 5).join(", ")}. ${displayClassification(String(x.r.classification))}, verified ${String(x.r.verifiedAt ?? "").slice(0, 10)}.` }));
}

/* ---------------- connections ---------------- */

/** Record an account connection. Only a credential *reference* (a key-vault name) is stored; never the secret. */
export function connect(store: TenantStore, a: Actor, resourceId: string, input: { credentialRef?: string; scopes?: string[]; eligibilityConfirmed?: boolean }, idempotencyKey?: string) {
  requireAdmin(store, a, "eco.connection.create");
  const r = store.get(T.resources, resourceId);
  if (!r) throw new CampusError("not_found", "Resource not found", 404);
  if (idempotencyKey) {
    const dup = store.list(T.connections, (c) => c.idempotencyKey === idempotencyKey)[0];
    if (dup) return connectionView(dup);
  }
  if (input.credentialRef && !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(input.credentialRef)) throw new CampusError("invalid", "credentialRef must be a key-vault reference name, not a secret value.", 422);
  const method = String(r.integrationMethod);
  let state = method === "embed" ? "embedded" : method === "self_hosted" ? "self_hosted" : "link";
  let note = "Catalog listing only — opened by link.";
  if (method === "api" || method === "oauth") {
    if (r.classification === "education_benefit" && !input.eligibilityConfirmed) {
      state = "eligibility_required";
      note = "Eligibility must be verified with the provider first.";
    } else if (!input.credentialRef) {
      state = "account_required";
      note = "An account owner must add credentials to the key vault and reference them here.";
    } else {
      state = "connected";
      note = "Credential reference stored; health checks run every six hours.";
    }
  }
  return store.tx(() => {
    const c = store.insert(T.connections, { resourceId, ownerId: a.id, state, scopes: (input.scopes ?? []).map(String), credentialRef: input.credentialRef ?? null, quota: null, note, idempotencyKey: idempotencyKey ?? null, connectedAt: nowIso(), lastHealthAt: null, lastHealthOk: null }, "econ");
    audit(store, a, "eco.connection.create", `${T.connections}/${c.id}`, state);
    return connectionView(c);
  });
}

export function connectionView(c: Row) {
  return { id: c.id, resourceId: String(c.resourceId), state: String(c.state), label: displayConnection(String(c.state)), scopes: (c.scopes as string[]) ?? [], hasCredential: !!c.credentialRef, note: String(c.note ?? ""), connectedAt: String(c.connectedAt ?? ""), lastHealthAt: (c.lastHealthAt as string) ?? null, lastHealthOk: (c.lastHealthOk as boolean | null) ?? null };
}

export function listConnections(store: TenantStore, a: Actor) {
  requireAdmin(store, a, "eco.connection.list");
  return store.list(T.connections, (c) => c.state !== "removed").map((c) => ({ ...connectionView(c), resource: String(store.get(T.resources, String(c.resourceId))?.name ?? "") }));
}

export function connectionHealth(store: TenantStore, a: Actor, id: string) {
  requireAdmin(store, a, "eco.connection.health");
  const c = store.get(T.connections, id);
  if (!c) throw new CampusError("not_found", "Connection not found", 404);
  return { ...connectionView(c), history: store.list(T.health, (h) => h.connectionId === id).slice(-10).map((h) => ({ ok: !!h.ok, detail: String(h.detail), at: String(h.at) })) };
}

export function disconnect(store: TenantStore, a: Actor, id: string) {
  requireAdmin(store, a, "eco.connection.delete");
  const c = store.get(T.connections, id);
  if (!c) throw new CampusError("not_found", "Connection not found", 404);
  store.tx(() => store.update(T.connections, id, { state: "removed", credentialRef: null, removedAt: nowIso() }));
  audit(store, a, "eco.connection.delete", `${T.connections}/${id}`);
  return { removed: true };
}

/* ---------------- live classroom ---------------- */

const durationLimit = (r: Row) => {
  const l = ((r.limits as { metric: string; value: number | string; unit: string }[]) ?? []).find((x) => /duration/.test(x.metric) && !/one_to_one/.test(x.metric) && typeof x.value === "number" && x.unit === "minutes");
  return l ? Number(l.value) : null;
};

/**
 * Schedule a live session on a verified provider. When the provider's verified free plan caps
 * meeting length, the lecture is split into labelled teaching blocks that fit, with breaks.
 */
export function scheduleLiveSession(store: TenantStore, a: Actor, input: { courseId: string; title: string; providerId: string; startsAt: string; totalMinutes: number; joinUrl?: string; breakMinutes?: number }) {
  if (!store.get("courses", input.courseId)) throw new CampusError("not_found", "Course not found", 404);
  if (!(isCurator(a) || hasAny(a, ["instructor", "ta"], input.courseId))) throw new CampusError("forbidden", "Course staff only.", 403);
  const p = store.get(T.resources, input.providerId);
  if (!p || p.category !== "meeting") throw new CampusError("invalid", "Choose a meeting provider from the catalog.", 422);
  if (p.status !== "verified") throw new CampusError("not_verified", `${p.name}'s free terms aren't verified right now, so it can't be scheduled. Pick a verified provider.`, 409);
  const start = Date.parse(input.startsAt);
  if (Number.isNaN(start)) throw new CampusError("invalid", "startsAt must be a date-time.", 422);
  const total = Math.round(Number(input.totalMinutes));
  if (!(total >= 10 && total <= 480)) throw new CampusError("invalid", "Sessions run 10–480 minutes.", 422);
  const limit = durationLimit(p);
  const brk = Math.max(0, Math.min(30, Math.round(Number(input.breakMinutes ?? 5))));
  // Blocks end two minutes before the verified cap so the provider never cuts a block off.
  const blockLen = limit ? Math.max(5, limit - 2) : total;
  const blocks: { n: number; startsAt: string; minutes: number; joinUrl: string | null; label: string }[] = [];
  let remaining = total;
  let t = start;
  const self = String(p.integrationMethod) === "self_hosted" || /jitsi/i.test(String(p.name));
  const room = `Scholarion-${String(store.get("courses", input.courseId)?.code ?? "course").replace(/\W+/g, "")}-${crypto.randomBytes(4).toString("hex")}`;
  while (remaining > 0) {
    const m = Math.min(blockLen, remaining);
    const n = blocks.length + 1;
    const join = input.joinUrl ? safePublicUrl(input.joinUrl, "joinUrl") : self && /jitsi/i.test(String(p.name)) ? `https://meet.jit.si/${room}${limit ? `-${n}` : ""}` : null;
    blocks.push({ n, startsAt: iso(t), minutes: m, joinUrl: join, label: limit ? `Teaching block ${n} (${m} min, within the verified ${limit}-minute free limit)` : `Session (${m} min)` });
    remaining -= m;
    t += (m + (remaining > 0 ? brk : 0)) * 60_000;
  }
  return store.tx(() => {
    const s = store.insert(T.sessions, { courseId: input.courseId, title: String(input.title ?? "Live session").slice(0, 200), providerId: p.id, provider: p.name, startsAt: iso(start), endsAt: iso(t), totalMinutes: total, providerLimitMinutes: limit, blocks, createdBy: a.id, recordingNote: "Recording is not assumed. Link a recording here only if the provider's plan supports it and participants are informed.", asyncMaterials: `/campus/{tenant}/learn/${input.courseId}/lecture-studio` }, "elive");
    for (const b of blocks) store.insert("calendar_events", { courseId: input.courseId, title: `${s.title} — ${b.label}`, startsAt: b.startsAt, endsAt: iso(Date.parse(b.startsAt) + b.minutes * 60_000), location: b.joinUrl ?? `${p.name} (join link added by the instructor)`, recurrence: "none", liveSessionId: s.id }, "ce");
    const learners = store.list("enrollments", (e) => e.courseId === input.courseId && e.role === "student" && e.state === "active").map((e) => String(e.userId));
    notify(store, learners, "live", `Live session scheduled: ${s.title}`, `${blocks.length} block(s) on ${p.name}, starting ${iso(start).slice(0, 16).replace("T", " ")} UTC. Lecture materials stay available in the learning area.`, `/campus/{tenant}/hub/live?course=${input.courseId}`, input.courseId);
    audit(store, a, "eco.live.schedule", `${T.sessions}/${s.id}`, `${blocks.length} blocks`);
    return s;
  });
}

export function liveSessions(store: TenantStore, a: Actor, courseId?: string) {
  return store.list(T.sessions, (s) => (!courseId || s.courseId === courseId) && (isCurator(a) || hasAny(a, ["instructor", "ta", "student"], String(s.courseId)))).sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt))).map((s) => ({ id: s.id, courseId: String(s.courseId), course: String(store.get("courses", String(s.courseId))?.code ?? ""), title: String(s.title), provider: String(s.provider), startsAt: String(s.startsAt), totalMinutes: Number(s.totalMinutes), limit: (s.providerLimitMinutes as number) ?? null, blocks: s.blocks as { n: number; startsAt: string; minutes: number; joinUrl: string | null; label: string }[], recordingNote: String(s.recordingNote) }));
}

export const REVIEW_MS = REVIEW_DAYS * DAY;
export { nowMs };
