import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Scholarion Campus foundations (Master Build Prompt §3).
 *
 * - Every tenant has its own physically separate store (its own object graph and, when
 *   persistence is on, its own file under .data/tenants/). There is no shared schema.
 * - Every data access goes through `broker.connect(ctx)`, which requires a resolved
 *   TenantContext and refuses a suspended or unknown tenant before any store is touched.
 * - Every state change and its outbox events commit together (`tx`): on error, both roll back.
 * - Audit, metrics, structured logs and trace ids are recorded for every command.
 *
 * Runtime persistence is file-per-tenant (local + staging). The PostgreSQL migrations in
 * db/campus/ define the dedicated per-tenant databases this maps onto.
 */

/* ---------------- Errors ---------------- */

export class CampusError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public detail?: unknown,
  ) {
    super(message);
  }
}

/* ---------------- Ids, time, hashing ---------------- */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function id(prefix: string): string {
  let t = Date.now();
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const b = randomBytes(12);
  let r = "";
  for (let i = 0; i < 12; i++) r += CROCKFORD[b[i] % 32];
  return `${prefix}_${time}${r}`;
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");
export const token = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** Clock with an offset so scheduled jobs (announcements, retention, holds) can be demoed. */
const clock = { offsetMs: 0 };
export const nowMs = () => Date.now() + clock.offsetMs;
export const nowIso = () => new Date(nowMs()).toISOString();
export function advanceClock(ms: number) {
  clock.offsetMs += ms;
}
export function resetClock() {
  clock.offsetMs = 0;
}

/* ---------------- Roles ---------------- */

export const ROLES = ["admin", "instructor", "ta", "designer", "student", "observer", "advisor", "registrar", "support"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Tenant admin",
  instructor: "Instructor",
  ta: "Teaching assistant",
  designer: "Course designer",
  student: "Student",
  observer: "Observer",
  advisor: "Advisor",
  registrar: "Registrar",
  support: "Support",
};

/* ---------------- Tenants ---------------- */

export type TenantStatus = "provisioning" | "active" | "suspended";
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  kind: "guest" | "internal" | "validation";
  status: TenantStatus;
  /** Verified hosts that resolve to this tenant. */
  domains: { host: string; verified: boolean }[];
  realm: { protocol: "oidc" | "saml" | "local"; issuer: string; mfaRequiredForStaff: boolean; jit: boolean };
  theme: { primary: string; accent: string; logoText: string; logoUrl?: string | null; customCss?: string | null };
  flags: Record<string, boolean>;
  createdAt: string;
  suspendedAt?: string;
  /** For validation tenants created by a restore drill. */
  restoredFrom?: { tenantId: string; snapshotAt: string };
}

export interface TenantContext {
  tenantId: string;
  slug: string;
  /** How the tenant was resolved (verified host or local dev path). */
  via: "host" | "path";
  traceId: string;
}

/* ---------------- Store (one per tenant) ---------------- */

export type Row = { id: string; version: number; createdAt: string; updatedAt: string; deletedAt?: string; [k: string]: unknown };

export interface AuditRecord {
  id: string;
  at: string;
  actorId: string;
  actorRoles: string[];
  action: string;
  resource: string;
  outcome: "allowed" | "denied" | "error";
  reason?: string;
  traceId: string;
  /** Set when an admin is acting as another user: the real person behind the action. */
  realActorId?: string;
}

export interface OutboxEvent {
  id: string;
  type: string;
  tenantId: string;
  subject: string;
  data: Record<string, unknown>;
  at: string;
  traceId: string;
  deliveredTo: string[];
  attempts: number;
  status: "pending" | "delivered" | "dead";
  lastError?: string;
}

export interface TenantData {
  tenantId: string;
  schemaVersion: number;
  tables: Record<string, Record<string, Row>>;
  audit: AuditRecord[];
  outbox: OutboxEvent[];
  /** consumer → event ids already processed (idempotency). */
  processed: Record<string, string[]>;
}

export const CAMPUS_SCHEMA_VERSION = 1;

function emptyData(tenantId: string): TenantData {
  return { tenantId, schemaVersion: CAMPUS_SCHEMA_VERSION, tables: {}, audit: [], outbox: [], processed: {} };
}

/** Per-tenant store handle. Only the broker creates these. */
export class TenantStore {
  /** Request-scoped: the admin behind an act-as session (stamped on every audit record). */
  realActorId?: string;
  constructor(
    readonly tenantId: string,
    private data: TenantData,
    readonly traceId: string,
  ) {}

  table(name: string): Record<string, Row> {
    return (this.data.tables[name] ??= {});
  }
  get(name: string, rid: string, opts: { includeDeleted?: boolean } = {}): Row | undefined {
    const r = this.table(name)[rid];
    if (!r || (r.deletedAt && !opts.includeDeleted)) return undefined;
    return r;
  }
  list(name: string, filter: (r: Row) => boolean = () => true, opts: { includeDeleted?: boolean } = {}): Row[] {
    return Object.values(this.table(name)).filter((r) => (opts.includeDeleted || !r.deletedAt) && filter(r));
  }
  insert<T extends Record<string, unknown>>(name: string, values: T, prefix = name.slice(0, 4)): Row & T {
    const t = nowIso();
    const row = { id: (values.id as string) ?? id(prefix), version: 1, createdAt: t, updatedAt: t, ...values } as Row & T;
    if (this.table(name)[row.id]) throw new CampusError("conflict", `${name} ${row.id} already exists`, 409);
    this.table(name)[row.id] = row;
    return row;
  }
  /** Optimistic concurrency: pass the version you read; a stale version fails with 412. */
  update(name: string, rid: string, patch: Record<string, unknown>, ifVersion?: number): Row {
    const row = this.get(name, rid);
    if (!row) throw new CampusError("not_found", `${name} not found`, 404);
    if (ifVersion !== undefined && ifVersion !== row.version) {
      throw new CampusError("precondition_failed", "This record changed since you loaded it. Reload and try again.", 412, { current: row.version });
    }
    Object.assign(row, patch, { version: row.version + 1, updatedAt: nowIso() });
    return row;
  }
  /** Deletions leave a tombstone. */
  tombstone(name: string, rid: string, ifVersion?: number): Row {
    return this.update(name, rid, { deletedAt: nowIso() }, ifVersion);
  }
  emit(type: string, subject: string, data: Record<string, unknown>): OutboxEvent {
    const e: OutboxEvent = { id: id("evt"), type, tenantId: this.tenantId, subject, data, at: nowIso(), traceId: this.traceId, deliveredTo: [], attempts: 0, status: "pending" };
    this.data.outbox.push(e);
    return e;
  }
  audit(rec: Omit<AuditRecord, "id" | "at" | "traceId">) {
    this.data.audit.push({ id: id("aud"), at: nowIso(), traceId: this.traceId, ...rec, ...(this.realActorId ? { realActorId: this.realActorId } : {}) });
    if (this.data.audit.length > 20000) this.data.audit.splice(0, this.data.audit.length - 20000);
  }
  auditLog(limit = 200): AuditRecord[] {
    return this.data.audit.slice(-limit).reverse();
  }
  outbox(): OutboxEvent[] {
    return this.data.outbox;
  }
  processed(consumer: string): Set<string> {
    return new Set((this.data.processed[consumer] ??= []));
  }
  markProcessed(consumer: string, eventId: string) {
    (this.data.processed[consumer] ??= []).push(eventId);
  }
  /** Snapshot for export, backups and the restore drill. */
  snapshot(): TenantData {
    return JSON.parse(JSON.stringify(this.data));
  }
  /** Transaction: state change + outbox commit together, or neither. */
  tx<T>(fn: () => T): T {
    const before = JSON.stringify(this.data);
    try {
      const out = fn();
      broker.persist(this.tenantId);
      return out;
    } catch (err) {
      const restored = JSON.parse(before) as TenantData;
      this.data.tables = restored.tables;
      this.data.outbox = restored.outbox;
      this.data.processed = restored.processed;
      // Audit is kept (denials and errors must remain recorded).
      throw err;
    }
  }
  raw(): TenantData {
    return this.data;
  }
}

/* ---------------- Platform registry + DB broker ---------------- */

interface PlatformData {
  tenants: Record<string, Tenant>;
  operators: string[]; // platform operator user ids (platform realm)
  backups: { id: string; tenantId: string; at: string; checksum: string; rows: number }[];
  /** Content licenses between tenants (control plane holds the agreement, never learner data). */
  licenses?: { id: string; sourceTenantId: string; sourceCourseId: string; targetTenantId: string; targetCourseId: string; createdAt: string; lastSyncAt?: string; syncs: number }[];
  /** Tenant metadata kept in the control plane (type, region, tier, plan limits). */
  meta?: Record<string, { type: string; region: string; tier: string; limits: Record<string, number>; offboardedAt?: string; provisionedMs?: number }>;
}

const g = globalThis as unknown as { __campus?: { platform: PlatformData; tenants: Map<string, TenantData>; placement: TenantData } };
function holder(): { platform: PlatformData; tenants: Map<string, TenantData>; placement: TenantData } {
  return (g.__campus ??= { platform: loadPlatform() ?? { tenants: {} as Record<string, Tenant>, operators: [], backups: [] }, tenants: new Map(), placement: emptyData("placement") });
}
function loadPlatform(): PlatformData | null {
  if (!persistOn()) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "_platform.json"), "utf8")) as PlatformData;
  } catch {
    return null;
  }
}

const DATA_DIR = path.join(process.cwd(), ".data", "campus");
function persistOn() {
  return process.env.SCHOLARION_PERSIST === "1" && process.env.NODE_ENV !== "test";
}

export const metrics = {
  counters: new Map<string, number>(),
  inc(name: string, labels: Record<string, string>) {
    const key = `${name}{${Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",")}}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  },
  prometheus(): string {
    return [...this.counters.entries()].map(([k, v]) => `campus_${k} ${v}`).join("\n") + "\n";
  },
  reset() {
    this.counters.clear();
  },
};

/** Structured JSON logs (one line per event); silent in tests. */
export function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" || process.env.CAMPUS_LOGS === "0") return;
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const broker = {
  platform(): PlatformData {
    return holder().platform;
  },
  tenant(idOrSlug: string): Tenant | undefined {
    const p = holder().platform.tenants;
    return p[idOrSlug] ?? Object.values(p).find((t) => t.slug === idOrSlug);
  },
  tenants(): Tenant[] {
    return Object.values(holder().platform.tenants);
  },
  /**
   * The only way to reach tenant data. Cross-tenant access is impossible because the
   * returned store holds only this tenant's object graph; an unknown or suspended tenant
   * is refused here, before any data is read.
   */
  connect(ctx: TenantContext): TenantStore {
    const t = holder().platform.tenants[ctx.tenantId];
    if (!t) throw new CampusError("tenant_unknown", "Unknown tenant", 404);
    if (t.status !== "active") throw new CampusError("tenant_suspended", `${t.name} is ${t.status}.`, 423);
    let data = holder().tenants.get(t.id);
    if (!data) {
      data = load(t.id) ?? emptyData(t.id);
      holder().tenants.set(t.id, data);
    }
    metrics.inc("store_connect_total", { tenant: t.slug });
    return new TenantStore(t.id, data, ctx.traceId);
  },
  /** Dedicated placement-service database (Careers sync only). */
  placement(): TenantStore {
    return new TenantStore("placement", holder().placement, "placement-sync");
  },
  provision(input: Omit<Tenant, "status" | "createdAt"> & { status?: TenantStatus }): Tenant {
    const p = holder().platform;
    if (p.tenants[input.id]) throw new CampusError("conflict", "Tenant exists", 409);
    if (Object.values(p.tenants).some((t) => t.slug === input.slug)) throw new CampusError("conflict", "Slug taken", 409);
    for (const d of input.domains) if (Object.values(p.tenants).some((t) => t.domains.some((x) => x.host === d.host))) throw new CampusError("conflict", `Host ${d.host} belongs to another tenant`, 409);
    const t: Tenant = { ...input, status: input.status ?? "active", createdAt: nowIso() };
    p.tenants[t.id] = t;
    holder().tenants.set(t.id, emptyData(t.id));
    persistPlatform();
    return t;
  },
  setStatus(tenantId: string, status: TenantStatus) {
    const t = holder().platform.tenants[tenantId];
    if (!t) throw new CampusError("not_found", "Tenant not found", 404);
    t.status = status;
    t.suspendedAt = status === "suspended" ? nowIso() : undefined;
    persistPlatform();
    return t;
  },
  updateTenant(tenantId: string, patch: Partial<Pick<Tenant, "name" | "theme" | "flags" | "domains" | "realm">>) {
    const t = holder().platform.tenants[tenantId];
    if (!t) throw new CampusError("not_found", "Tenant not found", 404);
    Object.assign(t, patch);
    persistPlatform();
    return t;
  },
  persistPlatform() {
    persistPlatform();
  },
  /** Remove a validation tenant (restore drills). Guests and internal tenants can't be removed here. */
  dropValidationTenant(tenantId: string) {
    const t = holder().platform.tenants[tenantId];
    if (!t || t.kind !== "validation") throw new CampusError("forbidden", "Only validation tenants can be dropped.", 403);
    delete holder().platform.tenants[tenantId];
    holder().tenants.delete(tenantId);
    persistPlatform();
  },
  /** Raw data for platform operations (backup/export/restore). Never used by request paths. */
  rawData(tenantId: string): TenantData {
    let d = holder().tenants.get(tenantId);
    if (!d) {
      d = load(tenantId) ?? emptyData(tenantId);
      holder().tenants.set(tenantId, d);
    }
    return d;
  },
  installData(tenantId: string, data: TenantData) {
    holder().tenants.set(tenantId, data);
    persistTenant(tenantId);
  },
  persist(tenantId: string) {
    if (tenantId === "placement") return;
    persistTenant(tenantId);
  },
  /** Tests: wipe everything. */
  reset() {
    g.__campus = { platform: { tenants: {} as Record<string, Tenant>, operators: [], backups: [] }, tenants: new Map(), placement: emptyData("placement") };
    metrics.reset();
    resetClock();
  },
};

function load(tenantId: string): TenantData | null {
  if (!persistOn()) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${tenantId}.json`), "utf8")) as TenantData;
    return raw.schemaVersion === CAMPUS_SCHEMA_VERSION ? raw : null;
  } catch {
    return null;
  }
}
function persistTenant(tenantId: string) {
  if (!persistOn()) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `${tenantId}.json`), JSON.stringify(holder().tenants.get(tenantId)));
  } catch (err) {
    log("error", "persist_failed", { tenantId, err: String(err) });
  }
}
function persistPlatform() {
  if (!persistOn()) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `_platform.json`), JSON.stringify(holder().platform));
  } catch (err) {
    log("error", "persist_failed", { tenantId: "_platform", err: String(err) });
  }
}

/* ---------------- Tenant resolution ---------------- */

/** Resolve a TenantContext from a verified host, or (local/staging only) a path slug. */
export function resolveTenant(input: { host?: string | null; slug?: string | null; traceId?: string }): TenantContext {
  const traceId = input.traceId ?? randomUUID();
  const host = (input.host ?? "").toLowerCase().split(":")[0];
  if (host) {
    const byHost = broker.tenants().find((t) => t.domains.some((d) => d.verified && d.host === host));
    if (byHost) {
      if (input.slug && input.slug !== byHost.slug) throw new CampusError("tenant_mismatch", "This address belongs to a different school.", 403);
      return { tenantId: byHost.id, slug: byHost.slug, via: "host", traceId };
    }
  }
  if (input.slug) {
    const t = broker.tenant(input.slug);
    if (!t || t.kind === "validation") throw new CampusError("tenant_unknown", "Unknown school", 404);
    return { tenantId: t.id, slug: t.slug, via: "path", traceId };
  }
  throw new CampusError("tenant_unresolved", "Couldn't tell which school this request is for.", 400);
}

/* ---------------- Outbox relay with idempotent consumers ---------------- */

export type Consumer = { name: string; types: string[] | "*"; handle: (store: TenantStore, e: OutboxEvent) => void };
const consumers: Consumer[] = [];
export function registerConsumer(c: Consumer) {
  if (!consumers.some((x) => x.name === c.name)) consumers.push(c);
}
export function consumerNames(): string[] {
  return consumers.map((c) => c.name);
}

/**
 * Delivers pending events to every subscribed consumer exactly once per consumer.
 * A failing consumer is retried with backoff; after 5 attempts the event goes to the
 * dead-letter state and can be replayed from the admin console.
 */
export function relay(store: TenantStore, maxRounds = 10): number {
  let delivered = 0;
  for (let round = 0; round < maxRounds; round++) {
    const pending = store.outbox().filter((e) => e.status === "pending");
    if (!pending.length) break;
    for (const e of pending) {
      let failed = false;
      for (const c of consumers) {
        if (c.types !== "*" && !c.types.includes(e.type)) continue;
        if (store.processed(c.name).has(e.id)) continue;
        try {
          c.handle(store, e);
          store.markProcessed(c.name, e.id);
          e.deliveredTo.push(c.name);
        } catch (err) {
          failed = true;
          e.lastError = `${c.name}: ${err instanceof Error ? err.message : String(err)}`;
          log("warn", "consumer_failed", { tenantId: store.tenantId, consumer: c.name, event: e.type, traceId: e.traceId });
        }
      }
      e.attempts++;
      if (!failed) {
        e.status = "delivered";
        delivered++;
        metrics.inc("outbox_delivered_total", { type: e.type });
      } else if (e.attempts >= 5) {
        e.status = "dead";
        metrics.inc("outbox_dead_total", { type: e.type });
      }
    }
  }
  broker.persist(store.tenantId);
  return delivered;
}

export function replayDead(store: TenantStore, eventId: string) {
  const e = store.outbox().find((x) => x.id === eventId && x.status === "dead");
  if (!e) throw new CampusError("not_found", "No dead-lettered event with that id", 404);
  e.status = "pending";
  e.attempts = 0;
  return relay(store);
}
