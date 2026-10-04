import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { parseCsv } from "../../documents/parse";
import { audit, course } from "./common";

/**
 * Outcomes structure (parity 3.13): outcome folders (nested groups), account-level and
 * course-level outcomes, multi-level mastery scales, and standards import from the common
 * outcomes CSV format (vendor_guid, object_type, title, description, display_name,
 * calculation_method, calculation_int, parent_guids, mastery_points, then rating
 * points/label pairs). Imports are idempotent by vendor_guid, support a dry run, and report
 * issues per row; nothing is ever deleted by an import.
 */

export const GROUPS = "outcome_groups";
export const SCALES = "mastery_scales";
export const IMPORTS = "outcome_imports";

const bad = (m: string) => new CampusError("invalid", m, 422);
const METHODS = ["decaying_average", "n_mastery", "latest", "highest", "average"] as const;

/** Account scope: admins and designers. Course scope: also the course's instructors. */
function requireAuthor(store: TenantStore, a: Actor, courseId?: string | null) {
  if (courseId) {
    course(store, courseId);
    if (!hasAny(a, ["admin", "designer", "instructor"], courseId)) throw new CampusError("forbidden", "Only course instructors, designers and admins edit course outcomes.", 403);
  } else if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins and designers edit account outcomes.", 403);
}

/* ---------------- folders ---------------- */

export function createGroup(store: TenantStore, a: Actor, input: { title: string; parentId?: string | null; courseId?: string | null; description?: string; vendorGuid?: string }) {
  requireAuthor(store, a, input.courseId);
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 200) throw bad("A folder title (1–200 characters) is required.");
  if (input.parentId) {
    const p = store.get(GROUPS, input.parentId);
    if (!p) throw new CampusError("not_found", "Parent folder not found", 404);
    if ((p.courseId ?? null) !== (input.courseId ?? null) && p.courseId) throw bad("A folder must stay in its parent's scope.");
  }
  const row = store.tx(() => store.insert(GROUPS, { title, parentId: input.parentId ?? null, courseId: input.courseId ?? null, description: String(input.description ?? "").slice(0, 2000), vendorGuid: input.vendorGuid ?? null }, "ogr"));
  audit(store, a, "outcomes.group.create", `${GROUPS}/${row.id}`);
  return row;
}

function ancestors(store: TenantStore, id: string | null): string[] {
  const seen: string[] = [];
  let cur = id ? store.get(GROUPS, id) : undefined;
  while (cur) {
    if (seen.includes(cur.id)) break;
    seen.push(cur.id);
    cur = cur.parentId ? store.get(GROUPS, String(cur.parentId)) : undefined;
  }
  return seen;
}

/** Move a folder or an outcome. Folders can't move inside themselves. */
export function moveItem(store: TenantStore, a: Actor, input: { kind: "group" | "outcome"; id: string; toGroupId: string | null }) {
  const table = input.kind === "group" ? GROUPS : "outcomes";
  const row = store.get(table, input.id);
  if (!row) throw new CampusError("not_found", "Not found", 404);
  requireAuthor(store, a, (row.courseId as string) ?? null);
  if (input.toGroupId) {
    const to = store.get(GROUPS, input.toGroupId);
    if (!to) throw new CampusError("not_found", "Target folder not found", 404);
    if (to.courseId && to.courseId !== (row.courseId ?? null)) throw bad("Items can't move into another course's folders.");
    if (input.kind === "group" && ancestors(store, to.id).includes(row.id)) throw bad("A folder can't move inside itself.");
  }
  const out = store.tx(() => store.update(table, row.id, input.kind === "group" ? { parentId: input.toGroupId } : { groupId: input.toGroupId }));
  audit(store, a, `outcomes.${input.kind}.move`, `${table}/${row.id}`);
  return out;
}

/* ---------------- mastery scales ---------------- */

export interface Rating {
  label: string;
  points: number;
}

export function validateScale(ratings: Rating[], masteryPoints: number) {
  if (!Array.isArray(ratings) || ratings.length < 2 || ratings.length > 10) throw bad("A mastery scale needs 2–10 ratings.");
  const pts = ratings.map((r) => Number(r.points));
  if (pts.some((p) => !Number.isFinite(p) || p < 0)) throw bad("Rating points must be zero or more.");
  for (let i = 1; i < pts.length; i++) if (pts[i] >= pts[i - 1]) throw bad("List ratings from highest to lowest points, with no ties.");
  if (ratings.some((r) => !String(r.label ?? "").trim() || String(r.label).length > 60)) throw bad("Every rating needs a label (up to 60 characters).");
  if (!pts.includes(Number(masteryPoints))) throw bad("Mastery points must match one of the ratings.");
  return ratings.map((r) => ({ label: String(r.label).trim(), points: Number(r.points) }));
}

export function createScale(store: TenantStore, a: Actor, input: { title: string; ratings: Rating[]; masteryPoints: number; courseId?: string | null }) {
  requireAuthor(store, a, input.courseId);
  const ratings = validateScale(input.ratings, input.masteryPoints);
  const title = String(input.title ?? "").trim();
  if (!title) throw bad("A scale title is required.");
  const row = store.tx(() => store.insert(SCALES, { title, ratings, masteryPoints: Number(input.masteryPoints), courseId: input.courseId ?? null }, "msc"));
  audit(store, a, "outcomes.scale.create", `${SCALES}/${row.id}`);
  return row;
}

/** The rating a percentage earns on a scale (highest rating whose share of the top is reached). */
export function ratingFor(scale: { ratings: Rating[]; masteryPoints: number }, pct: number) {
  const top = scale.ratings[0].points || 1;
  const earned = (pct / 100) * top;
  const r = scale.ratings.find((x) => earned >= x.points - 1e-9) ?? scale.ratings[scale.ratings.length - 1];
  return { label: r.label, points: r.points, mastered: r.points >= scale.masteryPoints };
}

/** Outcomes that apply in a course: account-level outcomes plus that course's own. */
export const outcomesFor = (store: TenantStore, courseId: string) => store.list("outcomes", (o) => !o.courseId || o.courseId === courseId);

/* ---------------- tree ---------------- */

export function outcomeTree(store: TenantStore, a: Actor, courseId?: string | null) {
  if (courseId) {
    course(store, courseId);
    if (!hasAny(a, ["admin", "designer", "instructor", "ta"], courseId)) throw new CampusError("forbidden", "Course staff only.", 403);
  } else if (!hasAny(a, ["admin", "designer", "instructor", "ta", "advisor", "registrar", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  const inScope = (r: Row) => !r.courseId || r.courseId === courseId;
  const groups = store.list(GROUPS, inScope);
  const outcomes = store.list("outcomes", inScope);
  const node = (g: Row | null): { id: string | null; title: string; scope: string; groups: unknown[]; outcomes: unknown[] } => ({
    id: g?.id ?? null,
    title: g ? String(g.title) : "Root",
    scope: g?.courseId ? "course" : "account",
    groups: groups.filter((x) => (x.parentId ?? null) === (g?.id ?? null)).sort((x, y) => String(x.title).localeCompare(String(y.title))).map((x) => node(x)),
    outcomes: outcomes.filter((o) => (o.groupId ?? null) === (g?.id ?? null)).sort((x, y) => String(x.code).localeCompare(String(y.code))).map((o) => ({ id: o.id, code: String(o.code), title: String(o.title), scope: o.courseId ? "course" : "account", scale: o.scaleId ? String(store.get(SCALES, String(o.scaleId))?.title ?? "") : null, method: String(o.calculationMethod ?? "decaying_average"), vendorGuid: (o.vendorGuid as string) ?? null })),
  });
  return { tree: node(null), scales: store.list(SCALES, inScope).map((s) => ({ id: s.id, title: String(s.title), ratings: s.ratings as Rating[], masteryPoints: Number(s.masteryPoints), scope: s.courseId ? "course" : "account" })), counts: { groups: groups.length, outcomes: outcomes.length } };
}

/* ---------------- standards import ---------------- */

export interface ImportIssue {
  row: number;
  vendorGuid: string | null;
  problem: string;
}

/**
 * Import standards from the outcomes CSV. Headers (case-insensitive): vendor_guid, object_type
 * (group | outcome), title, description, display_name, calculation_method, calculation_int,
 * parent_guids (space-separated; first one is used), mastery_points, ratings — where "ratings"
 * and every column after it alternate points, label.
 */
export function importStandards(store: TenantStore, a: Actor, input: { csv: string; courseId?: string | null; dryRun?: boolean; source?: string }) {
  requireAuthor(store, a, input.courseId);
  const text = String(input.csv ?? "");
  if (!text.trim()) throw bad("Paste or upload the standards CSV.");
  if (text.length > 2_000_000) throw bad("The file is too large (2 MB limit).");
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) throw bad("The CSV needs a header row and at least one data row.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  for (const need of ["vendor_guid", "object_type", "title"]) if (col(need) < 0) throw bad(`Missing column: ${need}.`);
  const ratingsAt = col("ratings");
  const scope = input.courseId ?? null;
  const issues: ImportIssue[] = [];
  const plan: { kind: "group" | "outcome"; guid: string; values: Record<string, unknown>; parentGuid: string | null; existing: Row | null; row: number; scale: { ratings: Rating[]; masteryPoints: number } | null }[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const get = (n: string) => (col(n) >= 0 ? String(r[col(n)] ?? "").trim() : "");
    const guid = get("vendor_guid");
    const kind = get("object_type").toLowerCase();
    if (!guid) return issues.push({ row: rowNo, vendorGuid: null, problem: "vendor_guid is empty" });
    if (seen.has(guid)) return issues.push({ row: rowNo, vendorGuid: guid, problem: "duplicate vendor_guid in this file" });
    seen.add(guid);
    if (kind !== "group" && kind !== "outcome") return issues.push({ row: rowNo, vendorGuid: guid, problem: `object_type must be group or outcome (got "${kind}")` });
    const title = get("title");
    if (!title) return issues.push({ row: rowNo, vendorGuid: guid, problem: "title is empty" });
    const parentGuid = get("parent_guids").split(/\s+/).filter(Boolean)[0] ?? null;
    const table = kind === "group" ? GROUPS : "outcomes";
    const existing = store.list(table, (x) => x.vendorGuid === guid && (x.courseId ?? null) === scope)[0] ?? null;
    let scale: { ratings: Rating[]; masteryPoints: number } | null = null;
    const values: Record<string, unknown> = { title, description: get("description").slice(0, 4000) };
    if (kind === "outcome") {
      const method = get("calculation_method").toLowerCase() || "decaying_average";
      if (!(METHODS as readonly string[]).includes(method)) return issues.push({ row: rowNo, vendorGuid: guid, problem: `unknown calculation_method "${method}"` });
      const calcInt = get("calculation_int");
      values.code = (get("display_name") || guid).slice(0, 60);
      values.calculationMethod = method;
      if (calcInt) values[method === "n_mastery" ? "nMastery" : "decayWeight"] = Number(calcInt);
      if (ratingsAt >= 0) {
        const cells = r.slice(ratingsAt).map((c) => c.trim()).filter((c) => c !== "");
        if (cells.length) {
          const ratings: Rating[] = [];
          for (let k = 0; k + 1 < cells.length; k += 2) ratings.push({ points: Number(cells[k]), label: cells[k + 1] });
          try {
            const mp = Number(get("mastery_points"));
            scale = { ratings: validateScale(ratings, mp), masteryPoints: mp };
          } catch (e) {
            return issues.push({ row: rowNo, vendorGuid: guid, problem: `ratings: ${(e as Error).message}` });
          }
          values.masteryThreshold = Math.round((scale.masteryPoints / (scale.ratings[0].points || 1)) * 100);
        }
      }
    }
    plan.push({ kind: kind as "group" | "outcome", guid, values, parentGuid, existing, row: rowNo, scale });
  });
  // Parents must be groups in this file or already imported in the same scope.
  const groupGuids = new Set([...plan.filter((p) => p.kind === "group").map((p) => p.guid), ...store.list(GROUPS, (g) => (g.courseId ?? null) === scope && !!g.vendorGuid).map((g) => String(g.vendorGuid))]);
  const ok = plan.filter((p) => {
    if (p.parentGuid && !groupGuids.has(p.parentGuid)) {
      issues.push({ row: p.row, vendorGuid: p.guid, problem: `parent ${p.parentGuid} is not a group in this file or in this ${scope ? "course" : "account"}` });
      return false;
    }
    return true;
  });
  const summary = { groups: { create: ok.filter((p) => p.kind === "group" && !p.existing).length, update: ok.filter((p) => p.kind === "group" && p.existing).length }, outcomes: { create: ok.filter((p) => p.kind === "outcome" && !p.existing).length, update: ok.filter((p) => p.kind === "outcome" && p.existing).length }, issues };
  if (input.dryRun) return { dryRun: true, ...summary };
  const rec = store.tx(() => {
    const byGuid = new Map<string, string>(store.list(GROUPS, (g) => (g.courseId ?? null) === scope && !!g.vendorGuid).map((g) => [String(g.vendorGuid), g.id]));
    // Groups first (parents before children, by repeated passes).
    let pending = ok.filter((p) => p.kind === "group");
    for (let pass = 0; pending.length && pass < 50; pass++) {
      const next: typeof pending = [];
      for (const p of pending) {
        if (p.parentGuid && !byGuid.has(p.parentGuid)) {
          next.push(p);
          continue;
        }
        const parentId = p.parentGuid ? byGuid.get(p.parentGuid)! : null;
        const row = p.existing ? store.update(GROUPS, p.existing.id, { ...p.values, parentId }) : store.insert(GROUPS, { ...p.values, parentId, courseId: scope, vendorGuid: p.guid }, "ogr");
        byGuid.set(p.guid, row.id);
      }
      pending = next;
    }
    for (const p of pending) issues.push({ row: p.row, vendorGuid: p.guid, problem: "circular parent reference" });
    for (const p of ok.filter((x) => x.kind === "outcome")) {
      let scaleId: string | null = (p.existing?.scaleId as string) ?? null;
      if (p.scale) scaleId = store.insert(SCALES, { title: `${p.values.code} scale`, ratings: p.scale.ratings, masteryPoints: p.scale.masteryPoints, courseId: scope }, "msc").id;
      const vals = { ...p.values, groupId: p.parentGuid ? (byGuid.get(p.parentGuid) ?? null) : null, scaleId, source: input.source ?? "standards import" };
      if (p.existing) store.update("outcomes", p.existing.id, vals);
      else store.insert("outcomes", { ...vals, courseId: scope, vendorGuid: p.guid, framework: input.source ?? "Imported standards" }, "out");
    }
    const r = store.insert(IMPORTS, { courseId: scope, source: input.source ?? null, created: summary.groups.create + summary.outcomes.create, updated: summary.groups.update + summary.outcomes.update, issues, by: a.id, at: nowIso() }, "oim");
    store.emit("outcomes.imported", `${IMPORTS}/${r.id}`, { created: r.created, updated: r.updated, issues: issues.length });
    return r;
  });
  audit(store, a, "outcomes.import", `${IMPORTS}/${rec.id}`, `${rec.created} created, ${rec.updated} updated, ${issues.length} issue(s)`);
  return { dryRun: false, importId: rec.id, ...summary };
}

/** Export the outcomes in a scope back to the same CSV format (round-trips through importStandards). */
export function exportStandards(store: TenantStore, a: Actor, courseId?: string | null) {
  const t = outcomeTree(store, a, courseId);
  void t;
  const scope = courseId ?? null;
  const groups = store.list(GROUPS, (g) => (g.courseId ?? null) === scope);
  const guidOf = (g?: Row) => (g ? String(g.vendorGuid ?? g.id) : "");
  const q = (s: unknown) => {
    const v = String(s ?? "");
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = ["vendor_guid,object_type,title,description,display_name,calculation_method,calculation_int,parent_guids,mastery_points,ratings"];
  for (const g of groups) lines.push([guidOf(g), "group", g.title, g.description ?? "", "", "", "", g.parentId ? guidOf(store.get(GROUPS, String(g.parentId))) : "", "", ""].map(q).join(","));
  for (const o of store.list("outcomes", (x) => (x.courseId ?? null) === scope)) {
    const s = o.scaleId ? store.get(SCALES, String(o.scaleId)) : undefined;
    const ratings = ((s?.ratings as Rating[]) ?? []).flatMap((r) => [r.points, r.label]);
    lines.push([String(o.vendorGuid ?? o.id), "outcome", o.title, o.description ?? "", o.code, o.calculationMethod ?? "decaying_average", o.nMastery ?? o.decayWeight ?? "", o.groupId ? guidOf(store.get(GROUPS, String(o.groupId))) : "", s?.masteryPoints ?? "", ...ratings].map(q).join(","));
  }
  return `${lines.join("\n")}\n`;
}
