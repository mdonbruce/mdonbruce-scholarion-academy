/**
 * Server helpers shared by /api/agentic-ai and /api/agentic-ai/inbound.
 * Each request runs inside a scope that fixes the app (tenant) and its database, so records from
 * different Haven products never mix. Apps marked "dedicated" must have their own D1 binding.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "cloudflare:workers";
import { mergeApps, dbBinding, PLATFORM_TENANT, DEFAULT_APP, type AppDef } from "./apps";

type D1Stmt = { bind(...a: unknown[]): D1Stmt; first<R = any>(): Promise<R | null>; all<R = any>(): Promise<{ results?: R[] }>; run(): Promise<{ meta?: { changes?: number } }> };
/** The subset of Cloudflare D1 used here; the real D1Database satisfies it. */
export type D1Like = { prepare(query: string): D1Stmt; batch(statements: D1Stmt[]): Promise<unknown> };
type Scope = { tenant: string; db: D1Like; app: AppDef };
const store = new AsyncLocalStorage<Scope>();
const cfg = () => env as unknown as Record<string, any>;

export const sharedDb = (): D1Like => { const d = cfg().DB as D1Like | undefined; if (!d) throw new Error("HavenConnect data store is unavailable"); return d; };
export const scope = () => { const s = store.getStore(); if (!s) throw new Error("No app scope for this request"); return s; };
export const db = (): D1Like => scope().db;
export const T = () => scope().tenant;
export const currentApp = () => scope().app;

/** Stable record ids are namespaced per app so two rooms can never collide (Oak Haven keeps its v40 ids). */
export const nid = (id: string) => T() === DEFAULT_APP ? id : `${T()}/${id}`;

export const loadAppsFromShared = () => loadApps();
export async function loadApps(): Promise<AppDef[]> {
  const rows = await sharedDb().prepare("SELECT payload FROM cx_records WHERE tenant_id = ? AND kind = 'app' LIMIT 200").bind(PLATFORM_TENANT).all<any>();
  return mergeApps((rows.results || []).map((r: any) => JSON.parse(r.payload)));
}
export function databaseFor(app: AppDef) {
  if (app.isolation !== "dedicated") return { db: sharedDb(), bound: true, binding: "DB" };
  const binding = dbBinding(app.slug), d = cfg()[binding] as D1Like | undefined;
  return { db: (d || null) as D1Like | null, bound: Boolean(d), binding };
}
export async function runInApp<R>(app: AppDef, fn: () => Promise<R>): Promise<R> {
  const { db: d, bound, binding } = databaseFor(app);
  if (!bound) throw new Error(`${app.name} uses a dedicated database, but the ${binding} binding isn't configured yet. Its data is never stored in the shared database.`);
  return store.run({ tenant: app.slug, db: d as D1Like, app }, fn);
}

export async function event(input: { sessionId: string; contextId?: string | null; channel?: string; type: string; actor: string; details: Record<string, unknown> }) {
  await db().prepare("INSERT INTO cx_events (id, tenant_id, session_id, context_id, channel, event_type, actor, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), T(), input.sessionId, input.contextId || null, input.channel || "Web", input.type, input.actor, JSON.stringify(input.details)).run();
}
export async function getRec(id: string, kind?: string): Promise<any | null> {
  const row = kind
    ? await db().prepare("SELECT * FROM cx_records WHERE id = ? AND tenant_id = ? AND kind = ?").bind(id, T(), kind).first<any>()
    : await db().prepare("SELECT * FROM cx_records WHERE id = ? AND tenant_id = ?").bind(id, T()).first<any>();
  return row ? { ...JSON.parse(row.payload), id: row.id, kind: row.kind, version: row.version } : null;
}
export async function listKind(kind: string): Promise<any[]> {
  const rows = await db().prepare("SELECT id, payload, version FROM cx_records WHERE tenant_id = ? AND kind = ? LIMIT 500").bind(T(), kind).all<any>();
  return (rows.results || []).map((r: any) => ({ ...JSON.parse(r.payload), id: r.id, version: r.version }));
}
/** Insert or update a record in the current app. An id owned by another tenant is refused rather than overwritten. */
export async function upsert(id: string, kind: string, data: Record<string, unknown>, email: string, target = { db: db(), tenant: T() }) {
  const { id: _i, kind: _k, version: _v, ...payload } = data as any;
  const r = await target.db.prepare("INSERT INTO cx_records (id, kind, tenant_id, payload, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_by = excluded.updated_by, version = version + 1, updated_at = datetime('now') WHERE cx_records.tenant_id = excluded.tenant_id")
    .bind(id, kind, target.tenant, JSON.stringify(payload), email).run();
  if (r?.meta && r.meta.changes === 0) throw new Error("That record id belongs to another workspace");
}
/** Save to the platform registry (shared database). */
export const upsertPlatform = (id: string, kind: string, data: Record<string, unknown>, email: string) => upsert(id, kind, data, email, { db: sharedDb(), tenant: PLATFORM_TENANT });
