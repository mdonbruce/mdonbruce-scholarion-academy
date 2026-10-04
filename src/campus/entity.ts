import { CampusError, metrics, nowIso, type Role, type Row, type TenantStore } from "./core";
import { effectiveRoles, type Actor } from "./iam";
import { actorHas, TABLE_PERMISSION } from "./permissions";
import { ENTITY, type EntityDef, type FieldDef, type Op } from "./registry";

/**
 * Generic, registry-driven entity layer: validation, authorization (roles + permission
 * matrix + ownership + publish visibility), optimistic concurrency, tombstones, events
 * and audit. Workflow services use the same checks through `canOp`.
 */

export interface Hooks {
  /** Normalize/derive values before insert/update (e.g. render page HTML). */
  beforeWrite?: (store: TenantStore, actor: Actor, values: Record<string, unknown>, existing?: Row) => void;
  /** Problems that block publishing (accessibility, references, captions…). */
  publishChecks?: (store: TenantStore, row: Row) => string[];
  /** Runs after a successful write inside the same transaction. */
  afterWrite?: (store: TenantStore, actor: Actor, row: Row, op: Op | "unpublish") => void;
  /** Extra row-level read rule (return false to hide). */
  canRead?: (store: TenantStore, actor: Actor, row: Row) => boolean;
}
const HOOKS: Record<string, Hooks> = {};
export function registerHooks(table: string, h: Hooks) {
  HOOKS[table] = { ...HOOKS[table], ...h };
}

/** Add a publish check without replacing the ones another service registered. */
export function addPublishCheck(table: string, check: (store: TenantStore, row: Row) => string[]) {
  const prev = HOOKS[table]?.publishChecks;
  HOOKS[table] = { ...HOOKS[table], publishChecks: (store, row) => [...(prev?.(store, row) ?? []), ...check(store, row)] };
}
/** Add a before-write hook, keeping any existing one (runs after it). */
export function addBeforeWrite(table: string, fn: NonNullable<Hooks["beforeWrite"]>) {
  const prev = HOOKS[table]?.beforeWrite;
  HOOKS[table] = { ...HOOKS[table], beforeWrite: (store, a, values, existing) => { prev?.(store, a, values, existing); fn(store, a, values, existing); } };
}
/** Add an after-write hook, keeping any existing one. */
export function addAfterWrite(table: string, fn: NonNullable<Hooks["afterWrite"]>) {
  const prev = HOOKS[table]?.afterWrite;
  HOOKS[table] = { ...HOOKS[table], afterWrite: (store, a, row, op) => { prev?.(store, a, row, op); fn(store, a, row, op); } };
}

export function def(table: string): EntityDef {
  const d = ENTITY[table];
  if (!d) throw new CampusError("not_found", `Unknown resource ${table}`, 404);
  return d;
}

function courseIdOf(d: EntityDef, row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  if (d.table === "courses") return (row.id as string) ?? null;
  return (row.courseId as string) || null;
}

export function accountOf(store: TenantStore, courseId: string | null): string | null {
  if (!courseId) return null;
  return (store.get("courses", courseId)?.accountId as string) ?? null;
}

/** Roles that may do `op` here, after the permission matrix is applied. */
function grantedRoles(store: TenantStore, a: Actor, d: EntityDef, op: Op, courseId: string | null): Role[] {
  const allowed = d.perms[op] ?? [];
  const eff = effectiveRoles(a, courseId).filter((r) => allowed.includes(r));
  if (op === "read") return eff;
  const perm = TABLE_PERMISSION[d.table];
  if (!perm) return eff;
  const acc = accountOf(store, courseId);
  return eff.filter((r) => actorHas(store, { ...a, customRoles: [] }, [r], perm, acc));
}

function isOwner(d: EntityDef, a: Actor, row: Record<string, unknown> | undefined, op: Op) {
  return !!(d.owner && row && row[d.owner] === a.id && d.ownerOps?.includes(op));
}

const MANAGE_OPS: Op[] = ["update", "publish"];

export function canOp(store: TenantStore, a: Actor, d: EntityDef, op: Op, row?: Record<string, unknown>): boolean {
  const courseId = courseIdOf(d, row);
  if (isOwner(d, a, row, op)) return true;
  if (grantedRoles(store, a, d, op, courseId).length === 0) {
    // Custom roles carry only matrix permissions.
    const perm = TABLE_PERMISSION[d.table];
    if (op !== "read" && perm && a.customRoles.length && actorHas(store, { ...a, roles: [] }, [], perm, accountOf(store, courseId))) return true;
    return false;
  }
  if (op === "read" && row) {
    // Unpublished content is only visible to people who can manage it.
    if (d.publishable && row.state !== "published" && !MANAGE_OPS.some((m) => grantedRoles(store, a, d, m, courseId).length)) return false;
    const h = HOOKS[d.table]?.canRead;
    if (h && !h(store, a, row as Row)) return false;
  }
  return true;
}

export function assertOp(store: TenantStore, a: Actor, d: EntityDef, op: Op, row?: Record<string, unknown>) {
  metrics.inc("authz_decisions_total", { action: `${d.table}.${op}`, outcome: "check" });
  if (!canOp(store, a, d, op, row)) {
    store.audit({ actorId: a.id, actorRoles: effectiveRoles(a, courseIdOf(d, row)), action: `${d.table}.${op}`, resource: row?.id ? `${d.table}/${row.id}` : d.table, outcome: "denied", reason: "policy" });
    throw new CampusError("forbidden", `You don't have permission to ${op} ${d.plural.toLowerCase()}.`, 403);
  }
}

/* ---------------- Validation ---------------- */

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function coerce(store: TenantStore, field: FieldDef, raw: unknown): unknown {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return field.type === "boolean" ? false : field.type === "tags" ? [] : null;
  switch (field.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new CampusError("invalid", `${field.label} must be a number.`, 422, { field: field.name });
      if (field.min !== undefined && n < field.min) throw new CampusError("invalid", `${field.label} must be at least ${field.min}.`, 422, { field: field.name });
      if (field.max !== undefined && n > field.max) throw new CampusError("invalid", `${field.label} must be at most ${field.max}.`, 422, { field: field.name });
      return n;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === "1";
    case "tags":
      return Array.isArray(raw) ? raw.map(String).map((x) => x.trim()).filter(Boolean) : String(raw).split(",").map((x) => x.trim()).filter(Boolean);
    case "json":
      if (typeof raw !== "string") return raw;
      try {
        return JSON.parse(raw);
      } catch {
        throw new CampusError("invalid", `${field.label} isn't valid JSON.`, 422, { field: field.name });
      }
    case "date":
    case "datetime": {
      const s = String(raw);
      if (!ISO.test(s) || Number.isNaN(Date.parse(s))) throw new CampusError("invalid", `${field.label} must be a date (YYYY-MM-DD${field.type === "datetime" ? "THH:MM" : ""}).`, 422, { field: field.name });
      return field.type === "date" ? s.slice(0, 10) : new Date(s).toISOString();
    }
    case "enum":
      if (!field.options?.includes(String(raw))) throw new CampusError("invalid", `${field.label} must be one of: ${field.options?.join(", ")}.`, 422, { field: field.name });
      return String(raw);
    case "email":
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw))) throw new CampusError("invalid", `${field.label} must be an email address.`, 422, { field: field.name });
      return String(raw).trim().toLowerCase();
    case "url":
      if (!/^https?:\/\/[^\s]+$/.test(String(raw)) && !/^vault:\/\//.test(String(raw))) throw new CampusError("invalid", `${field.label} must be a URL.`, 422, { field: field.name });
      return String(raw).trim();
    case "ref": {
      const v = String(raw);
      // References resolve only inside this tenant's store.
      if (field.ref && !store.get(field.ref, v)) throw new CampusError("invalid", `${field.label}: no such ${ENTITY[field.ref]?.label.toLowerCase() ?? "record"} in this school.`, 422, { field: field.name });
      return v;
    }
    default: {
      const s = String(raw);
      if (s.length > (field.type === "text" ? 50000 : 500)) throw new CampusError("invalid", `${field.label} is too long.`, 422, { field: field.name });
      return field.type === "text" ? s : s.trim();
    }
  }
}

export function validate(store: TenantStore, d: EntityDef, input: Record<string, unknown>, mode: "create" | "update"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of d.fields) {
    if (field.system) continue;
    if (!(field.name in input)) {
      if (mode === "create" && field.required) throw new CampusError("invalid", `${field.label} is required.`, 422, { field: field.name });
      continue;
    }
    const v = coerce(store, field, input[field.name]);
    if (mode === "create" && field.required && (v === null || v === "" || (Array.isArray(v) && !v.length))) throw new CampusError("invalid", `${field.label} is required.`, 422, { field: field.name });
    out[field.name] = v;
  }
  return out;
}

/** Strip secrets. Callers who manage the entity may see answer keys via `includeSecrets`. */
export function present(d: EntityDef, row: Row, opts: { includeSecrets?: boolean } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  if (!opts.includeSecrets) for (const f of d.fields) if (f.secret) delete out[f.name];
  delete out.passwordHash;
  delete out.mfaSecret;
  delete out.tokenHash;
  return out;
}

function managesRow(store: TenantStore, a: Actor, d: EntityDef, row: Row) {
  return grantedRoles(store, a, d, "update", courseIdOf(d, row)).length > 0;
}

/* ---------------- CRUD ---------------- */

export function list(store: TenantStore, a: Actor, table: string, q: { courseId?: string; where?: Record<string, string>; search?: string; cursor?: string; limit?: number; includeDeleted?: boolean; sort?: string } = {}) {
  const d = def(table);
  if (q.includeDeleted && !a.roles.includes("admin")) throw new CampusError("forbidden", "Only admins can view deleted records.", 403);
  let rows = store.list(table, (r) => (!q.courseId || r.courseId === q.courseId || (table === "courses" && r.id === q.courseId)), { includeDeleted: q.includeDeleted });
  if (q.where) for (const [k, v] of Object.entries(q.where)) rows = rows.filter((r) => String(r[k] ?? "") === v);
  if (q.search) {
    const s = q.search.toLowerCase();
    rows = rows.filter((r) => d.fields.some((f) => !f.secret && typeof r[f.name] === "string" && (r[f.name] as string).toLowerCase().includes(s)));
  }
  rows = rows.filter((r) => canOp(store, a, d, "read", r));
  const sortKey = q.sort ?? (d.fields.some((f) => f.name === "position") ? "position" : "createdAt");
  rows.sort((x, y) => (typeof x[sortKey] === "number" ? (x[sortKey] as number) - (y[sortKey] as number) : String(x[sortKey] ?? "").localeCompare(String(y[sortKey] ?? ""))));
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = q.cursor ? Number(Buffer.from(q.cursor, "base64url").toString()) || 0 : 0;
  const page = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  metrics.inc("entity_list_total", { table });
  return { items: page.map((r) => present(d, r, { includeSecrets: managesRow(store, a, d, r) })), total: rows.length, next };
}

export function read(store: TenantStore, a: Actor, table: string, id: string, opts: { includeDeleted?: boolean } = {}) {
  const d = def(table);
  const row = store.get(table, id, opts);
  if (!row) throw new CampusError("not_found", `${d.label} not found`, 404);
  assertOp(store, a, d, "read", row);
  return present(d, row, { includeSecrets: managesRow(store, a, d, row) });
}

export function create(store: TenantStore, a: Actor, table: string, input: Record<string, unknown>) {
  const d = def(table);
  if (d.workflow) throw new CampusError("workflow_only", `${d.plural} are created through their workflow, not directly.`, 405);
  const values = validate(store, d, input, "create");
  if (d.owner && d.ownerOps?.includes("create") && !canOp(store, a, d, "create", values)) values[d.owner] = a.id;
  const probe = { ...values, ...(d.owner && d.ownerOps?.includes("create") ? { [d.owner]: values[d.owner] ?? a.id } : {}) };
  assertOp(store, a, d, "create", probe);
  return store.tx(() => {
    HOOKS[table]?.beforeWrite?.(store, a, probe);
    const row = store.insert(table, { ...probe, ...(d.publishable ? { state: "unpublished" } : {}) }, d.prefix);
    store.emit(`${table}.created`, `${table}/${row.id}`, { id: row.id, courseId: row.courseId ?? null });
    store.audit({ actorId: a.id, actorRoles: a.roles, action: `${table}.create`, resource: `${table}/${row.id}`, outcome: "allowed" });
    HOOKS[table]?.afterWrite?.(store, a, row, "create");
    metrics.inc("entity_write_total", { table, op: "create" });
    return present(d, row, { includeSecrets: true });
  });
}

export function update(store: TenantStore, a: Actor, table: string, id: string, input: Record<string, unknown>, ifVersion?: number) {
  const d = def(table);
  const existing = store.get(table, id);
  if (!existing) throw new CampusError("not_found", `${d.label} not found`, 404);
  assertOp(store, a, d, "update", existing);
  if (d.immutableWhenPublished && existing.state === "published") throw new CampusError("immutable", `Published ${d.plural.toLowerCase()} can't be changed. Create a new version instead.`, 409);
  const values = validate(store, d, input, "update");
  if (d.owner && values[d.owner] !== undefined && values[d.owner] !== existing[d.owner] && !a.roles.includes("admin")) delete values[d.owner];
  return store.tx(() => {
    HOOKS[table]?.beforeWrite?.(store, a, values, existing);
    const row = store.update(table, id, values, ifVersion);
    store.emit(`${table}.updated`, `${table}/${id}`, { id, courseId: row.courseId ?? null, fields: Object.keys(values) });
    store.audit({ actorId: a.id, actorRoles: a.roles, action: `${table}.update`, resource: `${table}/${id}`, outcome: "allowed", reason: Object.keys(values).join(",") });
    HOOKS[table]?.afterWrite?.(store, a, row, "update");
    metrics.inc("entity_write_total", { table, op: "update" });
    return present(d, row, { includeSecrets: true });
  });
}

export function archive(store: TenantStore, a: Actor, table: string, id: string, ifVersion?: number) {
  const d = def(table);
  const existing = store.get(table, id);
  if (!existing) throw new CampusError("not_found", `${d.label} not found`, 404);
  assertOp(store, a, d, "archive", existing);
  return store.tx(() => {
    const row = store.tombstone(table, id, ifVersion);
    store.emit(`${table}.deleted`, `${table}/${id}`, { id, courseId: row.courseId ?? null });
    store.audit({ actorId: a.id, actorRoles: a.roles, action: `${table}.delete`, resource: `${table}/${id}`, outcome: "allowed" });
    HOOKS[table]?.afterWrite?.(store, a, row, "archive");
    metrics.inc("entity_write_total", { table, op: "delete" });
    return { id, deletedAt: row.deletedAt };
  });
}

/** Restore a tombstoned record (admins, "View and restore deleted content"). */
export function restore(store: TenantStore, a: Actor, table: string, id: string) {
  const d = def(table);
  const row = store.get(table, id, { includeDeleted: true });
  if (!row?.deletedAt) throw new CampusError("not_found", "Nothing to restore", 404);
  if (!actorHas(store, a, effectiveRoles(a), "view_restore_deleted", accountOf(store, courseIdOf(d, row)))) throw new CampusError("forbidden", "You can't restore deleted content.", 403);
  return store.tx(() => {
    row.deletedAt = undefined;
    row.version++;
    row.updatedAt = nowIso();
    store.emit(`${table}.restored`, `${table}/${id}`, { id });
    store.audit({ actorId: a.id, actorRoles: a.roles, action: `${table}.restore`, resource: `${table}/${id}`, outcome: "allowed" });
    return present(d, row);
  });
}

export function publish(store: TenantStore, a: Actor, table: string, id: string, on = true) {
  const d = def(table);
  if (!d.publishable) throw new CampusError("not_publishable", `${d.plural} aren't published.`, 400);
  const row = store.get(table, id);
  if (!row) throw new CampusError("not_found", `${d.label} not found`, 404);
  assertOp(store, a, d, "publish", row);
  if (on) {
    const issues = HOOKS[table]?.publishChecks?.(store, row) ?? [];
    if (issues.length) {
      store.audit({ actorId: a.id, actorRoles: a.roles, action: `${table}.publish`, resource: `${table}/${id}`, outcome: "denied", reason: issues.join("; ").slice(0, 300) });
      throw new CampusError("publish_blocked", `Can't publish yet: ${issues.join(" ")}`, 422, { issues });
    }
  }
  return store.tx(() => {
    const out = store.update(table, id, on ? { state: "published", publishedAt: nowIso() } : { state: "unpublished" });
    store.emit(on ? `${table}.published` : `${table}.unpublished`, `${table}/${id}`, { id, courseId: out.courseId ?? null });
    store.audit({ actorId: a.id, actorRoles: a.roles, action: on ? `${table}.publish` : `${table}.unpublish`, resource: `${table}/${id}`, outcome: "allowed" });
    HOOKS[table]?.afterWrite?.(store, a, out, on ? "publish" : "unpublish");
    return present(d, out, { includeSecrets: true });
  });
}
