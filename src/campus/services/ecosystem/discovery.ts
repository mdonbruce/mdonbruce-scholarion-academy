import crypto from "node:crypto";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { audit, notify } from "../common";
import { stripTags, urlBlockReason } from "../studio/sources";
import type { FetchedResponse, Fetcher } from "../studio/types";
import { feedItem, publicationDecision, saveResource } from "./catalog";
import { logPostingFlags, postingFlags } from "./career";
import { nextFire, prevFire, validTimeZone } from "./cron";
import { validate, SCHEDULE_V1 } from "./schema";
import { DAY, REVIEW_DAYS, STALE_GRACE_DAYS, T, canonicalUrl, daysFromNow, hostOf, iso, requireAdmin, safePublicUrl, slugify } from "./shared";

/**
 * Scholarion Auto-Discovery Workflow:
 * scheduled trigger → source selection → fetch → extraction → normalization → verification →
 * deduplication → classification → matching → publication → notification → revalidation.
 *
 * Jobs are durable rows with unique keys per schedule period (no duplicates), leases (no overlap),
 * request/runtime budgets, checkpoints (resumable batches), exponential backoff with jitter and a
 * dead-letter state. Fetching uses only configured, trusted sources through fixed adapters — there
 * is no arbitrary-URL proxy — and retrieved content is treated as untrusted data.
 */

export type JobKind = "job_discovery" | "resource_discovery" | "terms_review" | "link_check" | "integration_health" | "digest";
export const DEFAULT_TZ = "America/New_York";
export const DEFAULT_SCHEDULES: { key: string; kind: JobKind; cron: string; title: string }[] = [
  { key: "jobs-daily", kind: "job_discovery", cron: "0 6 * * *", title: "Job and internship discovery (daily 6:00 AM)" },
  { key: "resources-weekly", kind: "resource_discovery", cron: "0 7 * * 1", title: "Educational-resource discovery (Monday 7:00 AM)" },
  { key: "terms-monthly", kind: "terms_review", cron: "0 8 1 * *", title: "Terms, limits and licensing review (1st of month 8:00 AM)" },
  { key: "links-daily", kind: "link_check", cron: "0 5 * * *", title: "Link checks (daily 5:00 AM)" },
  { key: "health-6h", kind: "integration_health", cron: "0 */6 * * *", title: "Integration health (every six hours)" },
  { key: "digest-weekly", kind: "digest", cron: "0 9 * * 1", title: "Weekly digest: admins and opted-in learners (Monday 9:00 AM)" },
];
const DEFAULT_BUDGET = { max_requests: 60, max_runtime_ms: 120_000, max_retries: 4 };
const LEASE_MS = 10 * 60_000;

/* ---------------- network access (fixed adapters, trusted hosts only) ---------------- */

const offline: Fetcher = async () => {
  throw new Error("Network access is disabled in this environment.");
};
/** Tests and staging override this; production uses the platform fetch. */
export const ecoNet: { fetcher: Fetcher } = { fetcher: process.env.NODE_ENV === "test" ? offline : (url, init) => fetch(url, init) as unknown as Promise<FetchedResponse> };

function trustedHosts(store: TenantStore): Set<string> {
  return new Set(store.list(T.sources, (s) => !!s.trusted && !!s.enabled).map((s) => String(s.host)));
}

interface FetchResult {
  ok: boolean;
  status: number;
  type: string;
  body: string;
  error?: string;
}

async function fetchTrusted(store: TenantStore, url: string, budget: { left: number }, timeoutMs = 8000, extraHeaders: Record<string, string> = {}): Promise<FetchResult> {
  const why = urlBlockReason(url);
  if (why) return { ok: false, status: 0, type: "", body: "", error: why };
  const host = hostOf(url);
  if (!trustedHosts(store).has(host)) return { ok: false, status: 0, type: "", body: "", error: `${host} isn't a configured, trusted source.` };
  if (budget.left <= 0) return { ok: false, status: 0, type: "", body: "", error: "budget" };
  budget.left--;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      ecoNet.fetcher(url, { signal: ctrl.signal, headers: { accept: "text/html,application/json,application/rss+xml,application/atom+xml,text/xml;q=0.9,*/*;q=0.5", "user-agent": "ScholarionDiscovery/1.0 (+education catalog; respects robots and rate limits)", ...extraHeaders }, redirect: "follow" }),
      new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error(`Timed out after ${timeoutMs / 1000} s`)))),
    ]);
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return { ok: false, status: res.status, type, body: "", error: "Response larger than 2 MB." };
    return { ok: res.ok, status: res.status, type, body: buf.toString("utf8") };
  } catch (e) {
    return { ok: false, status: 0, type: "", body: "", error: (e as Error).message || "network error" };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- extraction adapters ---------------- */

export interface FeedItem {
  title: string;
  url: string;
  summary: string;
  published: string | null;
  id: string | null;
}

/** RSS 2.0 / Atom items. Content is data: titles and links only, tags stripped. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const tag = (b: string, t: string) => b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, "i"))?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ?? "";
  for (const b of blocks.slice(0, 200)) {
    const link = tag(b, "link") || b.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] || "";
    const title = stripTags(tag(b, "title")).slice(0, 300);
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, url: link.trim(), summary: stripTags(tag(b, "description") || tag(b, "summary")).slice(0, 600), published: tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || null, id: tag(b, "guid") || tag(b, "id") || null });
  }
  return items;
}

/** Greenhouse public Job Board API (boards-api.greenhouse.io/v1/boards/{token}/jobs). */
export function parseGreenhouse(json: string) {
  const d = JSON.parse(json) as { jobs?: { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; content?: string }[] };
  return (d.jobs ?? []).slice(0, 500).map((j) => ({ externalId: `gh:${j.id}`, title: String(j.title).slice(0, 200), url: String(j.absolute_url), location: j.location?.name ?? null, postedAt: j.updated_at ?? null, text: stripTags(String(j.content ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).slice(0, 4000) }));
}

type Listing = { externalId: string; title: string; url: string; location: string | null; postedAt: string | null; text: string; employer?: string; closesAt?: string | null; pay?: string | null };

/** Lever public postings API (api.lever.co/v0/postings/{company}?mode=json). */
export function parseLever(json: string): Listing[] {
  const d = JSON.parse(json) as { id: string; text: string; hostedUrl: string; categories?: { location?: string; commitment?: string }; createdAt?: number; descriptionPlain?: string }[];
  return (Array.isArray(d) ? d : []).slice(0, 500).map((j) => ({ externalId: `lever:${j.id}`, title: String(j.text).slice(0, 200), url: String(j.hostedUrl), location: j.categories?.location ?? null, postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null, text: String(j.descriptionPlain ?? "").slice(0, 4000) }));
}

/** USAJOBS Search API (data.usajobs.gov/api/search) — needs an API key and a contact user-agent. */
export function parseUsajobs(json: string): Listing[] {
  const d = JSON.parse(json) as { SearchResult?: { SearchResultItems?: { MatchedObjectId: string; MatchedObjectDescriptor: { PositionTitle: string; PositionURI: string; PositionLocationDisplay?: string; PublicationStartDate?: string; ApplicationCloseDate?: string; OrganizationName?: string; QualificationSummary?: string; PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[] } }[] } };
  return (d.SearchResult?.SearchResultItems ?? []).slice(0, 500).map((i) => {
    const m = i.MatchedObjectDescriptor;
    const pay = m.PositionRemuneration?.[0];
    return { externalId: `usajobs:${i.MatchedObjectId}`, title: String(m.PositionTitle).slice(0, 200), url: String(m.PositionURI), location: m.PositionLocationDisplay ?? null, postedAt: m.PublicationStartDate ?? null, closesAt: m.ApplicationCloseDate ?? null, employer: m.OrganizationName, text: String(m.QualificationSummary ?? "").slice(0, 4000), pay: pay ? `${pay.MinimumRange}–${pay.MaximumRange} ${pay.RateIntervalCode ?? ""}`.trim() : null };
  });
}

/** Adzuna Jobs API (api.adzuna.com/v1/api/jobs/{country}/search/{page}) — needs app_id and app_key. */
export function parseAdzuna(json: string): Listing[] {
  const d = JSON.parse(json) as { results?: { id: string; title: string; redirect_url: string; location?: { display_name?: string }; created?: string; description?: string; company?: { display_name?: string }; salary_min?: number; salary_max?: number; salary_is_predicted?: string }[] };
  return (d.results ?? []).slice(0, 500).map((j) => ({ externalId: `adzuna:${j.id}`, title: String(j.title).slice(0, 200), url: String(j.redirect_url), location: j.location?.display_name ?? null, postedAt: j.created ?? null, employer: j.company?.display_name, text: String(j.description ?? "").slice(0, 4000), pay: j.salary_min && j.salary_is_predicted !== "1" ? `${j.salary_min}–${j.salary_max ?? j.salary_min}` : null }));
}

/** Credentials for job APIs come from the environment (secrets manager), never from the database or content. */
function sourceAuth(src: Row): { url: string; headers: Record<string, string> } | { missing: string } {
  const url = String(src.url);
  if (src.kind === "usajobs") {
    const key = process.env.USAJOBS_API_KEY;
    const ua = process.env.USAJOBS_USER_AGENT;
    if (!key || !ua) return { missing: "Set USAJOBS_API_KEY and USAJOBS_USER_AGENT (your registered email) in the secrets manager." };
    return { url, headers: { "authorization-key": key, "user-agent": ua, host: "data.usajobs.gov" } };
  }
  if (src.kind === "adzuna") {
    const id = process.env.ADZUNA_APP_ID;
    const key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) return { missing: "Set ADZUNA_APP_ID and ADZUNA_APP_KEY in the secrets manager." };
    const u = new URL(url);
    u.searchParams.set("app_id", id);
    u.searchParams.set("app_key", key);
    return { url: u.toString(), headers: {} };
  }
  return { url, headers: {} };
}

/* ---------------- schedules ---------------- */

export function ensureSchedules(store: TenantStore) {
  for (const s of DEFAULT_SCHEDULES) {
    if (store.list(T.schedules, (x) => x.key === s.key).length) continue;
    const now = nowMs();
    store.insert(T.schedules, { key: s.key, kind: s.kind, title: s.title, cron: s.cron, timeZone: DEFAULT_TZ, enabled: true, paused: false, budget: DEFAULT_BUDGET, lastPeriod: prevFire(s.cron, DEFAULT_TZ, now), nextRunAt: iso(nextFire(s.cron, DEFAULT_TZ, now)!), lastRunAt: null, lastSuccessAt: null }, "esch");
  }
}

export function listSchedules(store: TenantStore) {
  return store.list(T.schedules, () => true).map((s) => ({ id: s.id, key: String(s.key), kind: String(s.kind), title: String(s.title), cron: String(s.cron), timeZone: String(s.timeZone), enabled: !!s.enabled, paused: !!s.paused, budget: s.budget as typeof DEFAULT_BUDGET, lastRunAt: (s.lastRunAt as string) ?? null, lastSuccessAt: (s.lastSuccessAt as string) ?? null, nextRunAt: (s.nextRunAt as string) ?? null }));
}

export function upsertSchedule(store: TenantStore, a: Actor, input: { id?: string; key?: string; kind?: string; cron?: string; timeZone?: string; enabled?: boolean; paused?: boolean; budget?: Record<string, number> }) {
  requireAdmin(store, a, "eco.schedule.save");
  const cur = input.id ? store.get(T.schedules, input.id) : undefined;
  if (input.id && !cur) throw new CampusError("not_found", "Schedule not found", 404);
  const next = { key: String(input.key ?? cur?.key ?? ""), kind: String(input.kind ?? cur?.kind ?? ""), cron: String(input.cron ?? cur?.cron ?? ""), time_zone: String(input.timeZone ?? cur?.timeZone ?? DEFAULT_TZ), enabled: input.enabled ?? (cur ? !!cur.enabled : true), budget: { ...((cur?.budget as Record<string, number>) ?? DEFAULT_BUDGET), ...(input.budget ?? {}) } };
  const errs = validate(SCHEDULE_V1, { schema_version: "1.0.0", ...next });
  if (!validTimeZone(next.time_zone)) errs.push("time_zone: unknown IANA time zone");
  let nr: number | null = null;
  try {
    nr = nextFire(next.cron, next.time_zone, nowMs());
  } catch (e) {
    errs.push(`cron: ${(e as Error).message}`);
  }
  if (errs.length) throw new CampusError("invalid", errs.join("; "), 422, { errors: errs });
  return store.tx(() => {
    const row = { key: next.key, kind: next.kind, cron: next.cron, timeZone: next.time_zone, enabled: next.enabled, budget: next.budget, paused: input.paused ?? (cur ? !!cur.paused : false), nextRunAt: nr ? iso(nr) : null };
    const s = cur ? store.update(T.schedules, cur.id, row) : store.insert(T.schedules, { ...row, title: next.key, lastPeriod: prevFire(next.cron, next.time_zone, nowMs()), lastRunAt: null, lastSuccessAt: null }, "esch");
    audit(store, a, "eco.schedule.save", `${T.schedules}/${s.id}`, `${next.cron} ${next.time_zone}`);
    return s;
  });
}

export function setSchedulePaused(store: TenantStore, a: Actor, id: string, paused: boolean) {
  requireAdmin(store, a, paused ? "eco.schedule.pause" : "eco.schedule.resume");
  if (!store.get(T.schedules, id)) throw new CampusError("not_found", "Schedule not found", 404);
  return store.tx(() => store.update(T.schedules, id, { paused }));
}

/** Authorized "Run now": queues a job immediately (unique key per request). */
export function runNow(store: TenantStore, a: Actor, scheduleId: string) {
  requireAdmin(store, a, "eco.schedule.run_now");
  const s = store.get(T.schedules, scheduleId);
  if (!s) throw new CampusError("not_found", "Schedule not found", 404);
  const running = store.list(T.jobs, (j) => j.scheduleId === s.id && ["queued", "running", "retrying"].includes(String(j.state)))[0];
  if (running) return running;
  return enqueue(store, s, `manual:${nowIso()}`, "manual");
}

function enqueue(store: TenantStore, s: Row, period: string, trigger: string) {
  const key = `${s.key}:${period}`;
  const dup = store.list(T.jobs, (j) => j.key === key)[0];
  if (dup) return dup;
  const budget = (s.budget as typeof DEFAULT_BUDGET) ?? DEFAULT_BUDGET;
  return store.insert(T.jobs, { key, scheduleId: s.id, kind: s.kind, period, trigger, state: "queued", attempts: 0, maxAttempts: Number(budget.max_retries ?? 4) + 1, runAfter: nowIso(), leaseUntil: null, checkpoint: 0, counts: {}, errors: [], summary: "", budget }, "ejob");
}

/** Create due jobs (one per schedule period; missed periods coalesce into one catch-up run). */
export function planDueJobs(store: TenantStore) {
  const now = nowMs();
  const created: Row[] = [];
  for (const s of store.list(T.schedules, (x) => !!x.enabled && !x.paused)) {
    const prev = prevFire(String(s.cron), String(s.timeZone), now);
    if (prev === null) continue;
    const last = Number(s.lastPeriod ?? 0);
    if (prev > last) {
      const missed = now - prev > 60 * 60_000;
      created.push(enqueue(store, s, iso(prev), missed ? "missed_run_catch_up" : "schedule"));
      store.update(T.schedules, s.id, { lastPeriod: prev, nextRunAt: iso(nextFire(String(s.cron), String(s.timeZone), now)!) });
    }
  }
  return created;
}

/* ---------------- worker ---------------- */

interface Ctx {
  store: TenantStore;
  job: Row;
  budget: { left: number };
  deadline: number;
  counts: Record<string, number>;
  errors: string[];
  checkpoint: number;
}
const inc = (c: Ctx, k: string, n = 1) => (c.counts[k] = (c.counts[k] ?? 0) + n);

/** Lease and run every due job. Returns a summary per job. */
export async function workJobs(store: TenantStore, maxJobs = 10) {
  const now = nowMs();
  const due = store.list(T.jobs, (j) => ["queued", "retrying", "partial"].includes(String(j.state)) && Date.parse(String(j.runAfter)) <= now && (!j.leaseUntil || Date.parse(String(j.leaseUntil)) < now)).sort((x, y) => String(x.runAfter).localeCompare(String(y.runAfter))).slice(0, maxJobs);
  const out: { id: string; kind: string; state: string; summary: string }[] = [];
  for (const j of due) {
    const lease = crypto.randomBytes(6).toString("hex");
    store.update(T.jobs, j.id, { state: "running", leaseId: lease, leaseUntil: iso(nowMs() + LEASE_MS), startedAt: j.startedAt ?? nowIso(), attempts: Number(j.attempts ?? 0) + 1 });
    const budget = (j.budget as typeof DEFAULT_BUDGET) ?? DEFAULT_BUDGET;
    const ctx: Ctx = { store, job: store.get(T.jobs, j.id)!, budget: { left: Number(budget.max_requests) }, deadline: nowMs() + Number(budget.max_runtime_ms), counts: {}, errors: [], checkpoint: Number(j.checkpoint ?? 0) };
    let state = "succeeded";
    try {
      const r = await RUNNERS[String(j.kind) as JobKind](ctx);
      state = r.complete ? (ctx.errors.length && !r.anyOk ? "failed_attempt" : ctx.errors.length ? "partial_done" : "succeeded") : "partial";
    } catch (e) {
      ctx.errors.push((e as Error).message);
      state = "failed_attempt";
    }
    const cur = store.get(T.jobs, j.id)!;
    if (cur.leaseId !== lease) continue; // lease lost; another worker owns it
    const attempts = Number(cur.attempts);
    const summary = `${Object.entries(ctx.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing to do"}${ctx.errors.length ? ` · ${ctx.errors.length} error(s)` : ""}`;
    const base = { counts: { ...(cur.counts as Record<string, number>), ...ctx.counts }, errors: [...((cur.errors as string[]) ?? []), ...ctx.errors].slice(-20), checkpoint: ctx.checkpoint, leaseId: null, leaseUntil: null, summary };
    if (state === "partial") store.update(T.jobs, j.id, { ...base, state: "partial", runAfter: nowIso() });
    else if (state === "failed_attempt") {
      if (attempts >= Number(cur.maxAttempts)) {
        store.update(T.jobs, j.id, { ...base, state: "dead", finishedAt: nowIso() });
        const admins = store.list("role_grants", (g) => g.role === "admin" && !g.revokedAt).map((g) => String(g.userId));
        notify(store, admins, "ops", `Discovery job failed: ${cur.kind}`, `${cur.key} exhausted ${attempts} attempts. Last error: ${ctx.errors.at(-1) ?? "unknown"}.`, "/campus/{tenant}/hub/automation");
      } else {
        const backoff = Math.min(6 * 3600_000, 60_000 * 2 ** (attempts - 1)) * (0.75 + Math.random() * 0.5);
        store.update(T.jobs, j.id, { ...base, state: "retrying", runAfter: iso(nowMs() + backoff) });
      }
    } else {
      store.update(T.jobs, j.id, { ...base, state: state === "partial_done" ? "succeeded_with_errors" : "succeeded", finishedAt: nowIso() });
      if (cur.scheduleId) store.update(T.schedules, String(cur.scheduleId), { lastRunAt: nowIso(), lastSuccessAt: nowIso() });
    }
    if (cur.scheduleId && state !== "partial") store.update(T.schedules, String(cur.scheduleId), { lastRunAt: nowIso() });
    const fin = store.get(T.jobs, j.id)!;
    out.push({ id: j.id, kind: String(j.kind), state: String(fin.state), summary });
  }
  return out;
}

/** One scheduler tick: plan due jobs, then work them. Cron (or the in-process scheduler) calls this. */
export async function ecoTick(store: TenantStore, maxJobs = 10) {
  const planned = store.tx(() => planDueJobs(store)).map((j) => j.key as string);
  const worked = await workJobs(store, maxJobs);
  return { planned, worked };
}

/* ---------------- job runners ---------------- */

type Runner = (c: Ctx) => Promise<{ complete: boolean; anyOk: boolean }>;
const timeLeft = (c: Ctx) => c.budget.left > 0 && nowMs() < c.deadline;

/** Monthly terms review: re-fetch evidence pages and confirm their check terms are still present. */
const termsReview: Runner = async (c) => {
  const { store } = c;
  const rows = store.list(T.resources, (r) => r.status !== "archived").sort((x, y) => String(x.id).localeCompare(String(y.id)));
  let anyOk = false;
  for (; c.checkpoint < rows.length; c.checkpoint++) {
    if (!timeLeft(c)) return { complete: false, anyOk };
    const r = rows[c.checkpoint];
    const ev = store.list(T.evidence, (e) => e.resourceId === r.id);
    if (!ev.length) {
      inc(c, "no_evidence");
      continue;
    }
    let fetchedAll = true;
    for (const e of ev) {
      const res = await fetchTrusted(store, String(e.url), c.budget);
      if (!res.ok) {
        fetchedAll = false;
        store.insert(T.checks, { resourceId: r.id, jobId: c.job.id, kind: "terms", ok: false, httpStatus: res.status, detail: res.error ?? `HTTP ${res.status}`, at: nowIso() }, "echk");
        if (res.error !== "budget") c.errors.push(`${r.key}: ${res.error ?? `HTTP ${res.status}`}`);
        continue;
      }
      anyOk = true;
      const text = (res.type.includes("html") ? stripTags(res.body) : res.body).toLowerCase();
      const missing = ((e.checkTerms as string[]) ?? []).filter((t) => !text.includes(String(t).toLowerCase()));
      store.update(T.evidence, e.id, { retrievedAt: nowIso(), confirmed: missing.length === 0, missingTerms: missing });
      store.insert(T.checks, { resourceId: r.id, jobId: c.job.id, kind: "terms", ok: missing.length === 0, httpStatus: res.status, detail: missing.length ? `Not found on the official page: ${missing.join(", ")}` : "All checked terms present.", at: nowIso() }, "echk");
    }
    const fresh = store.list(T.evidence, (e) => e.resourceId === r.id);
    store.tx(() => {
      if (fetchedAll) {
        const d = publicationDecision(r, fresh);
        const missing = fresh.flatMap((e) => (e.missingTerms as string[]) ?? []);
        const reason = d.status === "verified" ? null : missing.length ? `The official page no longer shows: ${missing.join(", ")}. Re-verification pending.` : d.reason;
        saveResource(store, r.id, { status: d.status, statusReason: reason, ...(d.status === "verified" ? { verifiedAt: nowIso(), nextReviewAt: daysFromNow(REVIEW_DAYS) } : {}) }, "Monthly terms review.", c.job.id);
        inc(c, d.status === "verified" ? "verified" : "pending");
      } else if (r.status === "verified" && Date.parse(String(r.nextReviewAt ?? 0)) + STALE_GRACE_DAYS * DAY < nowMs()) {
        saveResource(store, r.id, { status: "stale", statusReason: "The official page couldn't be re-checked after the review date." }, "Terms review could not reach the source.", c.job.id);
        inc(c, "stale");
      } else inc(c, "unreachable");
    });
  }
  return { complete: true, anyOk: anyOk || rows.length === 0 };
};

/** Daily link check: official URLs that answer 404/410 become unavailable; recovered ones return to pending. */
const linkCheck: Runner = async (c) => {
  const { store } = c;
  const rows = store.list(T.resources, (r) => r.status !== "archived").sort((x, y) => String(x.id).localeCompare(String(y.id)));
  let anyOk = false;
  for (; c.checkpoint < rows.length; c.checkpoint++) {
    if (!timeLeft(c)) return { complete: false, anyOk };
    const r = rows[c.checkpoint];
    const res = await fetchTrusted(store, String(r.officialUrl), c.budget);
    store.insert(T.checks, { resourceId: r.id, jobId: c.job.id, kind: "link", ok: res.ok, httpStatus: res.status, detail: res.ok ? `HTTP ${res.status}` : res.error ?? `HTTP ${res.status}`, at: nowIso() }, "echk");
    if (res.ok) anyOk = true;
    store.tx(() => {
      if (res.status === 404 || res.status === 410) {
        saveResource(store, r.id, { status: "unavailable", statusReason: `The official page answered HTTP ${res.status}.` }, "Daily link check.", c.job.id);
        inc(c, "unavailable");
      } else if (res.ok && r.status === "unavailable") {
        saveResource(store, r.id, { status: "pending", statusReason: "The page is back; terms will be re-verified." }, "Daily link check.", c.job.id);
        inc(c, "recovered");
      } else if (res.ok) inc(c, "ok");
      else if (res.error !== "budget") {
        c.errors.push(`${r.key}: ${res.error ?? `HTTP ${res.status}`}`);
        inc(c, "unreachable");
      }
    });
  }
  // Opportunities: past their closing date → closed (kept for history).
  for (const o of store.list(T.opportunities, (x) => x.status === "open" && !!x.closesAt && Date.parse(String(x.closesAt)) < nowMs())) {
    store.update(T.opportunities, o.id, { status: "closed", closedReason: "Closing date passed.", closedAt: nowIso() });
    inc(c, "closed");
  }
  return { complete: true, anyOk: anyOk || rows.length === 0 };
};

/** Every six hours: connection health for connected and embedded services. */
const integrationHealth: Runner = async (c) => {
  const { store } = c;
  const conns = store.list(T.connections, (x) => ["connected", "embedded"].includes(String(x.state)));
  let anyOk = false;
  for (const conn of conns) {
    if (!timeLeft(c)) return { complete: false, anyOk };
    const r = store.get(T.resources, String(conn.resourceId));
    if (!r) continue;
    const res = await fetchTrusted(store, String(r.officialUrl), c.budget);
    store.insert(T.health, { connectionId: conn.id, resourceId: r.id, ok: res.ok, detail: res.ok ? `HTTP ${res.status}` : res.error ?? `HTTP ${res.status}`, at: nowIso() }, "ehl");
    store.update(T.connections, conn.id, { lastHealthAt: nowIso(), lastHealthOk: res.ok });
    if (res.ok) anyOk = true;
    else if (res.error !== "budget") c.errors.push(`${r.key}: ${res.error ?? `HTTP ${res.status}`}`);
    inc(c, res.ok ? "healthy" : "unhealthy");
  }
  return { complete: true, anyOk: anyOk || conns.length === 0 };
};

/** Weekly resource discovery from configured feeds (RSS/Atom). New items publish only with source-level evidence. */
const resourceDiscovery: Runner = async (c) => {
  const { store } = c;
  const sources = store.list(T.sources, (s) => !!s.enabled && !!s.trusted && s.kind === "rss" && s.purpose === "resources");
  if (!sources.length) {
    inc(c, "sources", 0);
    c.counts.note_no_sources = 1;
    return { complete: true, anyOk: true };
  }
  let anyOk = false;
  for (const src of sources) {
    if (!timeLeft(c)) return { complete: false, anyOk };
    const res = await fetchTrusted(store, String(src.url), c.budget);
    store.update(T.sources, src.id, { lastFetchedAt: nowIso(), lastFetchOk: res.ok, lastError: res.ok ? null : res.error ?? `HTTP ${res.status}` });
    if (!res.ok) {
      c.errors.push(`${src.key}: ${res.error ?? `HTTP ${res.status}`}`);
      continue;
    }
    anyOk = true;
    const items = parseFeed(res.body);
    inc(c, "fetched", items.length);
    const defaults = (src.defaults as Record<string, string>) ?? {};
    for (const it of items) {
      const url = canonicalUrl(it.url);
      if (urlBlockReason(url)) continue;
      const existing = store.list(T.resources, (r) => r.canonicalUrl === url)[0];
      store.tx(() => {
        if (existing) {
          const { changed } = saveResource(store, existing.id, { name: it.title, description: it.summary || existing.description }, `Feed ${src.key}.`, c.job.id);
          store.insert(T.candidates, { jobId: c.job.id, sourceId: src.id, title: it.title, url, decision: changed.length ? "updated" : "unchanged", resourceId: existing.id }, "ecand");
          inc(c, changed.length ? "updated" : "unchanged");
          return;
        }
        const evidenceOk = !!src.evidenceUrl && !!defaults.classification && !!defaults.license;
        const r = store.insert(T.resources, { key: `${slugify(String(src.key))}-${slugify(it.title)}`.slice(0, 79), kind: defaults.kind ?? "course", name: it.title, provider: String(src.provider ?? src.name), officialUrl: it.url, canonicalUrl: url, category: defaults.category ?? "course", subjects: (src.subjects as string[]) ?? [], description: it.summary, useCases: [], classification: defaults.classification ?? "unknown", accountRequired: null, cardRequired: null, apiAccess: "unavailable", limits: [], license: defaults.license ?? null, embedding: "unknown", redistribution: defaults.redistribution ?? "unknown", attributionRequired: true, certificate: defaults.certificate ?? "unknown", integrationMethod: "link", connectionState: "link", accessibility: [], geographicRestrictions: [], eligibility: [], expiresAt: null, status: "pending", statusReason: "Discovered — awaiting evidence.", verifiedAt: null, nextReviewAt: daysFromNow(REVIEW_DAYS), version: 1, origin: `feed:${src.key}`, contentUse: defaults.redistribution === "allowed" && defaults.license ? "import_with_attribution" : "link_only" }, "eres");
        if (evidenceOk) store.insert(T.evidence, { resourceId: r.id, url: String(src.evidenceUrl), host: hostOf(String(src.evidenceUrl)), retrievedAt: nowIso(), claims: [`Provider-wide terms: ${defaults.classification}, license ${defaults.license}`], summary: "Source-level license/terms page configured by an administrator.", checkTerms: [], confirmed: true, conflict: false }, "eev");
        const d = publicationDecision(store.get(T.resources, r.id)!, store.list(T.evidence, (e) => e.resourceId === r.id));
        saveResource(store, r.id, { status: d.status, statusReason: d.reason, verifiedAt: d.status === "verified" ? nowIso() : null }, `Discovered via ${src.key}.`, c.job.id);
        store.insert(T.candidates, { jobId: c.job.id, sourceId: src.id, title: it.title, url, decision: d.status === "verified" ? "published" : "pending", resourceId: r.id, reason: d.reason }, "ecand");
        inc(c, d.status === "verified" ? "published" : "pending");
      });
    }
  }
  return { complete: true, anyOk };
};

/** Daily job discovery from configured job feeds (Greenhouse board API, RSS). Missing listings close. */
const jobDiscovery: Runner = async (c) => {
  const { store } = c;
  const sources = store.list(T.sources, (s) => !!s.enabled && !!s.trusted && (["greenhouse", "lever", "usajobs", "adzuna"].includes(String(s.kind)) || (s.kind === "rss" && s.purpose === "jobs")));
  let anyOk = sources.length === 0;
  for (const src of sources) {
    if (!timeLeft(c)) return { complete: false, anyOk };
    const auth = sourceAuth(src);
    if ("missing" in auth) {
      store.update(T.sources, src.id, { lastFetchedAt: nowIso(), lastFetchOk: false, lastError: `Configuration required: ${auth.missing}` });
      inc(c, "needs_configuration");
      anyOk = true;
      continue;
    }
    const res = await fetchTrusted(store, auth.url, c.budget, 8000, auth.headers);
    store.update(T.sources, src.id, { lastFetchedAt: nowIso(), lastFetchOk: res.ok, lastError: res.ok ? null : res.error ?? `HTTP ${res.status}` });
    if (!res.ok) {
      c.errors.push(`${src.key}: ${res.error ?? `HTTP ${res.status}`}`);
      continue;
    }
    anyOk = true;
    let listings: Listing[] = [];
    try {
      listings = src.kind === "greenhouse" ? parseGreenhouse(res.body) : src.kind === "lever" ? parseLever(res.body) : src.kind === "usajobs" ? parseUsajobs(res.body) : src.kind === "adzuna" ? parseAdzuna(res.body) : parseFeed(res.body).map((i) => ({ externalId: `rss:${i.id ?? canonicalUrl(i.url)}`, title: i.title, url: i.url, location: null, postedAt: i.published, text: i.summary }));
    } catch (e) {
      c.errors.push(`${src.key}: unreadable response (${(e as Error).message})`);
      continue;
    }
    inc(c, "fetched", listings.length);
    const employer = store.get(T.employers, String(src.employerId ?? "")) ?? null;
    const seen = new Set<string>();
    for (const l of listings) {
      if (urlBlockReason(l.url)) continue;
      seen.add(l.externalId);
      const type = /intern/i.test(l.title) ? "internship" : /apprentice/i.test(l.title) ? "apprenticeship" : /graduate|new grad|entry/i.test(l.title) ? "entry_level" : "full_time";
      if (src.entryLevelOnly && type === "full_time") continue;
      const skills = extractSkills(`${l.title} ${l.text}`);
      const existing = store.list(T.opportunities, (o) => o.externalId === l.externalId && o.sourceId === src.id)[0];
      store.tx(() => {
        const employerName = String(l.employer ?? employer?.name ?? src.provider ?? src.name);
        const flags = postingFlags(store, { id: existing?.id as string | undefined, title: l.title, description: l.text, employerName, closesAt: l.closesAt ?? null });
        const fields = { title: l.title, description: l.text.slice(0, 1500), applicationUrl: l.url, location: l.location, remote: /remote/i.test(`${l.location} ${l.title}`) ? "remote" : /hybrid/i.test(`${l.location}`) ? "hybrid" : "unknown", skills, lastVerifiedAt: nowIso(), lastSeenAt: nowIso(), closesAt: l.closesAt ?? null, compensation: l.pay ?? null, status: "open", hiddenReason: null };
        const api = { greenhouse: "the employer's public Greenhouse job board API", lever: "the employer's public Lever postings API", usajobs: "the USAJOBS Search API", adzuna: "the Adzuna Jobs API", rss: "a configured feed" }[String(src.kind)] ?? "a configured source";
        let id = existing?.id;
        if (existing) {
          store.update(T.opportunities, existing.id, fields);
          inc(c, "updated");
        } else {
          const o = store.insert(T.opportunities, { ...fields, employerId: employer?.id ?? null, employerName, externalId: l.externalId, sourceId: src.id, source: src.kind === "rss" ? "feed" : "job_board_api", type, qualifications: [], workEligibility: null, postedAt: l.postedAt, legitimacy: [`Listed on ${hostOf(l.url)} via ${api}`] }, "eopp");
          id = o.id;
          if (!flags.length) feedItem(store, "opportunity", `New opportunity: ${l.title} (${employerName})`, { opportunityId: o.id, subjects: skills });
          inc(c, "created");
        }
        if (flags.length && id) {
          logPostingFlags(store, id, flags);
          inc(c, "hidden");
        }
      });
    }
    // Listings that disappeared from the employer's board are closed, not deleted.
    for (const o of store.list(T.opportunities, (x) => x.sourceId === src.id && x.status === "open" && !seen.has(String(x.externalId)))) {
      store.update(T.opportunities, o.id, { status: "closed", closedReason: "No longer listed by the source.", closedAt: nowIso() });
      inc(c, "closed");
    }
  }
  return { complete: true, anyOk };
};

/** Weekly digest: admins get the run summary; learners who opted in get new tools, courses and matching roles. */
const digest: Runner = async (c) => {
  const { store } = c;
  const last = store.list(T.digests, () => true).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
  const since = last ? String(last.at) : "1970-01-01T00:00:00.000Z";
  const items = store.list(T.feed, (f) => String(f.at) > since);
  const jobs = store.list(T.jobs, (j) => String(j.createdAt) > since);
  const by = (k: string) => items.filter((f) => f.kind === k).length;
  const adminBody = `Since ${since.slice(0, 10)}: ${jobs.length} discovery job(s) (${jobs.filter((j) => j.state === "dead").length} dead-lettered); ${by("new_tool")} newly verified tools, ${by("new_resource")} new resources, ${by("limits_changed")} changed limits, ${by("discontinued")} discontinued, ${by("opportunity")} new opportunities.`;
  const admins = store.list("role_grants", (g) => g.role === "admin").map((g) => String(g.userId));
  notify(store, admins, "digest", "Weekly Resource Hub digest", adminBody, "/campus/{tenant}/hub/automation");
  const learners = [...new Set(store.list(T.subscriptions, (s) => s.kind === "digest").map((s) => String(s.userId)))];
  const learnerBody = items.filter((f) => ["new_tool", "new_resource", "opportunity"].includes(String(f.kind))).slice(0, 10).map((f) => `• ${f.title}`).join("\n") || "No new items this week.";
  notify(store, learners, "digest", "Your weekly Scholarion digest", learnerBody, "/campus/{tenant}/hub/whats-new");
  store.insert(T.digests, { at: nowIso(), since, adminBody, learnerItems: items.length, adminRecipients: admins.length, learnerRecipients: learners.length, delivery: "in-site (email needs a configured provider)" }, "edg");
  inc(c, "admins", admins.length);
  inc(c, "learners", learners.length);
  return { complete: true, anyOk: true };
};

const RUNNERS: Record<JobKind, Runner> = { terms_review: termsReview, link_check: linkCheck, integration_health: integrationHealth, resource_discovery: resourceDiscovery, job_discovery: jobDiscovery, digest };

/* ---------------- sources ---------------- */

export const SKILL_TERMS = ["python", "javascript", "typescript", "sql", "machine learning", "deep learning", "pytorch", "tensorflow", "llm", "rag", "agents", "agentic", "langgraph", "prompt engineering", "mlops", "docker", "kubernetes", "aws", "azure", "gcp", "data analysis", "nlp", "computer vision", "evaluation", "guardrails", "vector databases", "api", "git", "linux", "communication"];
export function extractSkills(text: string): string[] {
  const t = text.toLowerCase();
  return SKILL_TERMS.filter((s) => new RegExp(`\\b${s.replace(/ /g, "\\s+")}\\b`).test(t));
}

export function addSource(store: TenantStore, a: Actor, input: { key: string; name: string; kind: string; url: string; purpose?: string; provider?: string; subjects?: string[]; employerId?: string; evidenceUrl?: string; defaults?: Record<string, string>; rateLimitPerMin?: number; entryLevelOnly?: boolean }) {
  requireAdmin(store, a, "eco.source.add");
  if (!["rss", "greenhouse", "lever", "usajobs", "adzuna", "official_page"].includes(input.kind)) throw new CampusError("invalid", "kind must be rss, greenhouse, lever, usajobs, adzuna or official_page.", 422);
  const url = safePublicUrl(input.url);
  if (input.kind === "greenhouse" && !/^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/[a-z0-9_-]+\/jobs/i.test(url)) throw new CampusError("invalid", "Greenhouse sources use https://boards-api.greenhouse.io/v1/boards/{board}/jobs.", 422);
  if (input.kind === "lever" && !/^https:\/\/api\.lever\.co\/v0\/postings\/[a-z0-9_-]+/i.test(url)) throw new CampusError("invalid", "Lever sources use https://api.lever.co/v0/postings/{company}?mode=json.", 422);
  if (input.kind === "usajobs" && !/^https:\/\/data\.usajobs\.gov\/api\/search/i.test(url)) throw new CampusError("invalid", "USAJOBS sources use https://data.usajobs.gov/api/search?… (keys come from the secrets manager).", 422);
  if (input.kind === "adzuna" && !/^https:\/\/api\.adzuna\.com\/v1\/api\/jobs\/[a-z]{2}\/search\/\d+/i.test(url)) throw new CampusError("invalid", "Adzuna sources use https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?what=… (keys come from the secrets manager).", 422);
  if (/[?&](app_key|app_id|api_key|key|token)=/i.test(url)) throw new CampusError("invalid", "Don't put credentials in a source URL; they're read from the secrets manager.", 422);
  const key = slugify(input.key || input.name);
  if (store.list(T.sources, (s) => s.key === key).length) throw new CampusError("conflict", "A source with that key exists.", 409);
  return store.tx(() => {
    const s = store.insert(T.sources, { key, name: String(input.name).slice(0, 120), kind: input.kind, url, host: hostOf(url), purpose: input.purpose ?? (input.kind === "greenhouse" ? "jobs" : "resources"), provider: input.provider ?? input.name, subjects: input.subjects ?? [], employerId: input.employerId ?? null, evidenceUrl: input.evidenceUrl ? safePublicUrl(input.evidenceUrl, "evidenceUrl") : null, defaults: input.defaults ?? {}, rateLimitPerMin: Math.max(1, Math.min(60, Number(input.rateLimitPerMin ?? 10))), trusted: true, enabled: true, entryLevelOnly: !!input.entryLevelOnly, addedBy: a.id }, "esrc");
    // The evidence page's host is trusted for verification fetches, too.
    if (s.evidenceUrl && !store.list(T.sources, (x) => x.host === hostOf(String(s.evidenceUrl))).length) store.insert(T.sources, { key: `page-${hostOf(String(s.evidenceUrl))}`, name: `${hostOf(String(s.evidenceUrl))} terms page`, kind: "official_page", url: s.evidenceUrl, host: hostOf(String(s.evidenceUrl)), trusted: true, enabled: true, rateLimitPerMin: 10, subjects: [], defaults: {} }, "esrc");
    audit(store, a, "eco.source.add", `${T.sources}/${s.id}`, url);
    return s;
  });
}

export function setSourceEnabled(store: TenantStore, a: Actor, id: string, enabled: boolean) {
  requireAdmin(store, a, "eco.source.toggle");
  if (!store.get(T.sources, id)) throw new CampusError("not_found", "Source not found", 404);
  return store.tx(() => store.update(T.sources, id, { enabled }));
}

export function automationOverview(store: TenantStore, a: Actor) {
  requireAdmin(store, a, "eco.automation.view");
  const jobs = store.list(T.jobs, () => true).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return {
    schedules: listSchedules(store),
    jobs: jobs.slice(0, 30).map((j) => ({ id: j.id, key: String(j.key), kind: String(j.kind), trigger: String(j.trigger), state: String(j.state), attempts: Number(j.attempts), maxAttempts: Number(j.maxAttempts), runAfter: String(j.runAfter), checkpoint: Number(j.checkpoint ?? 0), summary: String(j.summary ?? ""), errors: (j.errors as string[]) ?? [], finishedAt: (j.finishedAt as string) ?? null })),
    dead: jobs.filter((j) => j.state === "dead").length,
    sources: store.list(T.sources, () => true).map((s) => ({ id: s.id, key: String(s.key), name: String(s.name), kind: String(s.kind), purpose: (s.purpose as string) ?? null, url: String(s.url), host: String(s.host), enabled: !!s.enabled, trusted: !!s.trusted, lastFetchedAt: (s.lastFetchedAt as string) ?? null, lastFetchOk: (s.lastFetchOk as boolean | null) ?? null, lastError: (s.lastError as string) ?? null })),
    exceptions: store.list(T.resources, (r) => ["pending", "stale", "unavailable"].includes(String(r.status))).map((r) => ({ id: r.id, name: String(r.name), status: String(r.status), reason: (r.statusReason as string) ?? null })),
    network: ecoNet.fetcher === offline ? "disabled (test environment)" : "platform fetch (trusted hosts only)",
  };
}

export function getJob(store: TenantStore, a: Actor, id: string) {
  requireAdmin(store, a, "eco.job.view");
  const j = store.get(T.jobs, id);
  if (!j) throw new CampusError("not_found", "Job not found", 404);
  return { ...j, candidates: store.list(T.candidates, (x) => x.jobId === id).slice(0, 100), checks: store.list(T.checks, (x) => x.jobId === id).slice(0, 100) };
}

/** Create a one-off discovery job of any kind (POST /discovery/jobs). */
export function createJob(store: TenantStore, a: Actor, kind: string, idempotencyKey?: string) {
  requireAdmin(store, a, "eco.job.create");
  const s = store.list(T.schedules, (x) => x.kind === kind)[0];
  if (!s) throw new CampusError("invalid", "Unknown job kind.", 422);
  if (idempotencyKey) {
    const dup = store.list(T.jobs, (j) => j.idempotencyKey === idempotencyKey)[0];
    if (dup) return dup;
  }
  return store.tx(() => {
    const j = enqueue(store, s, `api:${idempotencyKey ?? nowIso()}`, "api");
    store.update(T.jobs, j.id, { idempotencyKey: idempotencyKey ?? null });
    return store.get(T.jobs, j.id)!;
  });
}

export { iso };
