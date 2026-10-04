import { inflateRawSync } from "node:zlib";
import { CampusError, metrics, nowIso, sha256, type Row, type TenantStore } from "../core";
import { addBeforeWrite } from "../entity";
import { hasAny, type Actor } from "../iam";
import { renderBlocks, validateBlocks, type Block } from "./curriculum";
import { audit, course, isStaff, requireCourse, STAFF_COURSE, toMs } from "./common";
import { zip } from "./files";

/**
 * Content movement (Tab 37): course copy with date adjustment, package export/import
 * (Common Cartridge-style manifest + QTI 1.2 quizzes, with quarantine and an issue
 * report), blueprint sync with locks and a three-way diff, and the shared content library.
 */

/** Copy order respects references (banks before questions, modules before items…). */
export const CONTENT_TABLES = ["assignment_groups", "question_banks", "questions", "rubrics", "modules", "pages", "assignments", "quizzes", "discussion_topics", "module_items", "announcements", "reading_items", "mastery_paths"] as const;
const DATE_FIELDS = ["dueAt", "unlockAt", "lockAt", "availableFrom", "availableUntil", "publishAt", "todoDate", "peerReviewsDueAt", "showCorrectAfter"];
const SKIP_FIELDS = new Set(["id", "version", "createdAt", "updatedAt", "deletedAt", "state", "publishedAt", "snapshot", "readBy", "blueprintBase", "blueprintSourceId"]);

function remap(v: unknown, map: Map<string, string>): unknown {
  if (typeof v === "string") return map.get(v) ?? v;
  if (Array.isArray(v)) return v.map((x) => remap(x, map));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, remap(x, map)]));
  return v;
}

function shiftDate(v: unknown, shift: { days?: number; remove?: boolean }) {
  if (!v) return v;
  if (shift.remove) return null;
  if (!shift.days) return v;
  return new Date(toMs(v) + shift.days * 86400_000).toISOString();
}

interface CopyOptions {
  shift?: { days?: number; oldStart?: string; newStart?: string; remove?: boolean };
  only?: string[];
}

/** Copy content rows between courses. Returns the id map (source → copy). */
export function copyRows(store: TenantStore, rows: Record<string, Row[]>, targetCourseId: string, opts: CopyOptions, extra: (table: string, src: Row) => Record<string, unknown> = () => ({})) {
  const map = new Map<string, string>();
  const shift = { ...opts.shift, days: opts.shift?.days ?? (opts.shift?.oldStart && opts.shift?.newStart ? Math.round((toMs(opts.shift.newStart) - toMs(opts.shift.oldStart)) / 86400_000) : 0) };
  const created: Record<string, number> = {};
  // Pre-assign ids so forward references (e.g. prerequisites) map correctly.
  for (const t of CONTENT_TABLES) for (const r of rows[t] ?? []) map.set(r.id, `${r.id.split("_")[0]}_${sha256(r.id + targetCourseId + nowIso() + Math.random()).slice(0, 12)}`);
  for (const t of CONTENT_TABLES) {
    if (opts.only && !opts.only.includes(t)) continue;
    for (const r of rows[t] ?? []) {
      const vals: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (!SKIP_FIELDS.has(k)) vals[k] = DATE_FIELDS.includes(k) ? shiftDate(v, shift) : remap(v, map);
      vals.courseId = targetCourseId;
      if (["modules", "pages", "assignments", "quizzes", "discussion_topics", "module_items"].includes(t)) vals.state = "unpublished";
      if (t === "announcements") vals.state = "draft";
      if (t === "pages" && Array.isArray(vals.blocks)) vals.html = renderBlocks(store, vals.blocks as Block[], targetCourseId);
      store.insert(t, { ...vals, ...extra(t, r), id: map.get(r.id) }, t.slice(0, 3));
      created[t] = (created[t] ?? 0) + 1;
    }
  }
  return { map, created, shiftDays: shift.days };
}

export function contentOf(store: TenantStore, courseId: string): Record<string, Row[]> {
  return Object.fromEntries(CONTENT_TABLES.map((t) => [t, store.list(t, (r) => r.courseId === courseId)]));
}

function idempotent(store: TenantStore, kind: string, key?: string) {
  return key ? store.list("content_jobs", (j) => j.kind === kind && j.idempotencyKey === key)[0] : undefined;
}

/** Copy a whole course (or selected kinds) into another course, adjusting or removing dates. */
export function copyCourse(store: TenantStore, a: Actor, sourceCourseId: string, targetCourseId: string, opts: CopyOptions & { idempotencyKey?: string } = {}) {
  course(store, sourceCourseId);
  course(store, targetCourseId);
  if (!isStaff(a, sourceCourseId) && !a.roles.includes("admin")) throw new CampusError("forbidden", "You need access to the source course.", 403);
  requireCourse(store, a, targetCourseId, ["admin", "instructor", "designer"], "content.copy");
  const prior = idempotent(store, "copy", opts.idempotencyKey);
  if (prior) return prior;
  return store.tx(() => {
    const res = copyRows(store, contentOf(store, sourceCourseId), targetCourseId, opts);
    const job = store.insert("content_jobs", { kind: "copy", sourceCourseId, targetCourseId, state: "completed", progress: 100, issues: [], dateShift: { days: res.shiftDays, removed: !!opts.shift?.remove }, startedBy: a.id, idempotencyKey: opts.idempotencyKey ?? null, output: res.created }, "cj");
    store.emit("content.copied", `courses/${targetCourseId}`, { jobId: job.id, sourceCourseId, targetCourseId });
    audit(store, a, "content.copy", `courses/${targetCourseId}`, sourceCourseId);
    metrics.inc("content_jobs_total", { kind: "copy" });
    return job;
  });
}

/* ---------------- Package export (manifest + QTI) ---------------- */

const xmlEsc = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const xmlUnesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const QTI_TYPE: Record<string, string> = { multiple_choice: "multiple_choice_question", true_false: "true_false_question", essay: "essay_question", numeric: "numerical_question", multiple_answer: "multiple_answers_question", fill_blank: "short_answer_question" };

export function quizToQti(store: TenantStore, quiz: Row): string {
  const qs = store.list("questions", (q) => q.bankId === quiz.bankId);
  const items = qs
    .map((q) => {
      const choices = ((q.choices as string[]) ?? []).map((c, i) => `<response_label ident="c${i}"><material><mattext>${xmlEsc(c)}</mattext></material></response_label>`).join("");
      const correct = ((q.choices as string[]) ?? []).findIndex((c) => c === q.answer);
      return `<item ident="${xmlEsc(q.id)}" title="${xmlEsc(String(q.prompt).slice(0, 60))}"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${QTI_TYPE[q.kind as string] ?? String(q.kind)}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${Number(q.points ?? 1)}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata><presentation><material><mattext texttype="text/plain">${xmlEsc(q.prompt)}</mattext></material>${choices ? `<response_lid ident="response1"><render_choice>${choices}</render_choice></response_lid>` : ""}</presentation>${correct >= 0 ? `<resprocessing><respcondition><conditionvar><varequal respident="response1">c${correct}</varequal></conditionvar><setvar action="Set">100</setvar></respcondition></resprocessing>` : q.answer !== undefined && q.answer !== null ? `<resprocessing><respcondition><conditionvar><varequal respident="response1">${xmlEsc(q.answer)}</varequal></conditionvar></respcondition></resprocessing>` : ""}</item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="${xmlEsc(quiz.id)}" title="${xmlEsc(quiz.title)}"><qtimetadata><qtimetadatafield><fieldlabel>qmd_timelimit</fieldlabel><fieldentry>${Number(quiz.timeLimitMin ?? 0)}</fieldentry></qtimetadatafield></qtimetadata><section ident="root_section">${items}</section></assessment></questestinterop>`;
}

export function exportCourse(store: TenantStore, a: Actor, courseId: string) {
  const c = course(store, courseId);
  requireCourse(store, a, courseId, ["admin", "instructor", "designer"], "content.export");
  const content = contentOf(store, courseId);
  const entries: { name: string; data: Buffer }[] = [];
  const resources: string[] = [];
  for (const p of content.pages) {
    const name = `wiki_content/${p.id}.html`;
    entries.push({ name, data: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>${xmlEsc(p.title)}</title></head><body>${p.html ?? ""}</body></html>`) });
    resources.push(`<resource identifier="${p.id}" type="webcontent" href="${name}"><file href="${name}"/></resource>`);
  }
  for (const q of content.quizzes) {
    const name = `quizzes/${q.id}.qti.xml`;
    entries.push({ name, data: Buffer.from(quizToQti(store, q)) });
    resources.push(`<resource identifier="${q.id}" type="imsqti_xmlv1p2" href="${name}"><file href="${name}"/></resource>`);
  }
  const pkg = { format: "scholarion-course-package", version: 1, exportedAt: nowIso(), course: { code: c.code, title: c.title, description: c.description, startAt: c.startAt ?? null }, content };
  entries.push({ name: "course.json", data: Buffer.from(JSON.stringify(pkg)) });
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest identifier="${xmlEsc(c.id)}" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion><lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest"><lomimscc:general><lomimscc:title><lomimscc:string>${xmlEsc(c.title)}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata><organizations/><resources>${resources.join("")}<resource identifier="course-json" type="associatedcontent/x-scholarion" href="course.json"><file href="course.json"/></resource></resources></manifest>`;
  entries.unshift({ name: "imsmanifest.xml", data: Buffer.from(manifest) });
  store.tx(() => {
    store.insert("content_jobs", { kind: "export", sourceCourseId: courseId, targetCourseId: null, state: "completed", progress: 100, issues: [], startedBy: a.id, output: { files: entries.length } }, "cj");
    audit(store, a, "content.export", `courses/${courseId}`);
  });
  return zip(entries);
}

/* ---------------- Unzip (stored + deflate) ---------------- */

export function unzip(buf: Buffer): { name: string; data: Buffer }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) {
    eocd = i;
    break;
  }
  if (eocd < 0) throw new CampusError("invalid_package", "This isn't a zip package.", 422);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: Buffer }[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new CampusError("invalid_package", "Corrupt zip directory.", 422);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    if (name.includes("..") || name.startsWith("/")) throw new CampusError("invalid_package", `Unsafe path in package: ${name}`, 422);
    total += usize;
    if (total > 50 * 1024 * 1024) throw new CampusError("too_large", "Package expands to more than 50 MB.", 413);
    const lnlen = buf.readUInt16LE(local + 26);
    const lxlen = buf.readUInt16LE(local + 28);
    const raw = buf.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new CampusError("invalid_package", `Unsupported compression in ${name}`, 422);
    out.push({ name, data });
  }
  return out;
}

/* ---------------- Package import (quarantine + report) ---------------- */

const BLOCKED_EXT = /\.(exe|bat|cmd|com|scr|js|vbs|ps1|sh|jar|msi|dll|php)$/i;
const SUPPORTED_QTI: Record<string, string> = Object.fromEntries(Object.entries(QTI_TYPE).map(([k, v]) => [v, k]));

function parseQti(xml: string) {
  const items: { prompt: string; kind: string | null; rawType: string; choices: string[]; answer: string | null; points: number }[] = [];
  const title = xmlUnesc(xml.match(/<assessment[^>]*title="([^"]*)"/)?.[1] ?? "Imported quiz");
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const it = m[0];
    const rawType = it.match(/<fieldlabel>question_type<\/fieldlabel>\s*<fieldentry>([^<]*)<\/fieldentry>/)?.[1] ?? "multiple_choice_question";
    const points = Number(it.match(/<fieldlabel>points_possible<\/fieldlabel>\s*<fieldentry>([^<]*)<\/fieldentry>/)?.[1] ?? 1);
    const prompt = xmlUnesc(it.match(/<presentation>\s*<material>\s*<mattext[^>]*>([\s\S]*?)<\/mattext>/)?.[1] ?? "").replace(/<[^>]+>/g, " ").trim();
    const labels = [...it.matchAll(/<response_label ident="([^"]+)">\s*<material>\s*<mattext[^>]*>([\s\S]*?)<\/mattext>/g)].map((x) => ({ id: x[1], text: xmlUnesc(x[2]).trim() }));
    const correctId = it.match(/<varequal[^>]*>([^<]*)<\/varequal>/)?.[1] ?? null;
    const answer = labels.length ? (labels.find((l) => l.id === correctId)?.text ?? null) : correctId ? xmlUnesc(correctId) : null;
    items.push({ prompt, kind: SUPPORTED_QTI[rawType] ?? null, rawType, choices: labels.map((l) => l.text), answer, points: Number.isFinite(points) ? points : 1 });
  }
  return { title, items };
}

/** Import a package into a course. Unsafe files are quarantined; unsupported items are reported, not dropped silently. */
export function importPackage(store: TenantStore, a: Actor, targetCourseId: string, pkg: Buffer, opts: CopyOptions & { idempotencyKey?: string } = {}) {
  const target = course(store, targetCourseId);
  requireCourse(store, a, targetCourseId, ["admin", "instructor", "designer"], "content.import");
  const prior = idempotent(store, "import", opts.idempotencyKey);
  if (prior) return prior;
  const entries = unzip(pkg);
  const issues: { severity: "warning" | "error"; item: string; message: string }[] = [];
  const quarantined: string[] = [];
  for (const e of entries) if (BLOCKED_EXT.test(e.name)) {
    quarantined.push(e.name);
    issues.push({ severity: "error", item: e.name, message: "Quarantined: executable or script files aren't imported." });
  }
  const manifest = entries.find((e) => e.name === "imsmanifest.xml")?.data.toString("utf8");
  if (!manifest) throw new CampusError("invalid_package", "No imsmanifest.xml — this doesn't look like a course package.", 422);
  return store.tx(() => {
    const created: Record<string, number> = {};
    const json = entries.find((e) => e.name === "course.json");
    if (json) {
      const pkgData = JSON.parse(json.data.toString("utf8")) as { format: string; course: { startAt?: string }; content: Record<string, Row[]> };
      if (pkgData.format !== "scholarion-course-package") issues.push({ severity: "warning", item: "course.json", message: "Unknown package format; imported what could be read." });
      const shift = opts.shift ?? (pkgData.course.startAt && target.startAt ? { oldStart: pkgData.course.startAt, newStart: String(target.startAt) } : undefined);
      const res = copyRows(store, pkgData.content, targetCourseId, { ...opts, shift });
      Object.assign(created, res.created);
    } else {
      // Generic cartridge: web pages and QTI quizzes.
      let mod = store.list("modules", (m) => m.courseId === targetCourseId && m.title === "Imported content")[0];
      mod ??= store.insert("modules", { courseId: targetCourseId, title: "Imported content", position: store.list("modules", (m) => m.courseId === targetCourseId).length + 1, state: "unpublished" }, "mod");
      for (const r of manifest.matchAll(/<resource\b[^>]*identifier="([^"]+)"[^>]*type="([^"]+)"[^>]*href="([^"]+)"/g)) {
        const [, ident, type, href] = r;
        const file = entries.find((e) => e.name === href);
        if (!file) {
          issues.push({ severity: "warning", item: ident, message: `Referenced file ${href} is missing from the package.` });
          continue;
        }
        if (quarantined.includes(href)) continue;
        if (type === "webcontent" && /\.html?$/i.test(href)) {
          const html = file.data.toString("utf8");
          const title = xmlUnesc(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ident).trim();
          const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "\n").split(/\n+/).map((s) => xmlUnesc(s).trim()).filter(Boolean);
          if (/<script/i.test(html)) issues.push({ severity: "warning", item: title, message: "Scripts were removed from this page." });
          const blocks = validateBlocks(text.slice(0, 200).map((t) => ({ type: "paragraph", text: t.slice(0, 5000) })));
          store.insert("pages", { courseId: targetCourseId, moduleId: mod.id, title, blocks, html: renderBlocks(store, blocks, targetCourseId), position: (created.pages ?? 0) + 1, state: "unpublished" }, "pg");
          created.pages = (created.pages ?? 0) + 1;
        } else if (type.startsWith("imsqti")) {
          const q = parseQti(file.data.toString("utf8"));
          const bank = store.insert("question_banks", { courseId: targetCourseId, title: `${q.title} (imported)` }, "qb");
          let ok = 0;
          for (const it of q.items) {
            if (!it.kind) {
              issues.push({ severity: "warning", item: q.title, message: `Unsupported question type "${it.rawType}" — kept in this report, not imported: "${it.prompt.slice(0, 80)}"` });
              continue;
            }
            store.insert("questions", { courseId: targetCourseId, bankId: bank.id, kind: it.kind, prompt: it.prompt || "(no prompt)", choices: it.choices, answer: it.answer, points: it.points }, "qn");
            ok++;
          }
          store.insert("quizzes", { courseId: targetCourseId, moduleId: mod.id, title: q.title, bankId: bank.id, questionCount: ok, timeLimitMin: 30, allowedAttempts: 1, kind: "graded", state: "unpublished" }, "qz");
          created.quizzes = (created.quizzes ?? 0) + 1;
          created.questions = (created.questions ?? 0) + ok;
        } else {
          issues.push({ severity: "warning", item: ident, message: `Resource type "${type}" isn't supported yet; skipped.` });
        }
      }
    }
    const job = store.insert("content_jobs", { kind: "import", sourceCourseId: null, targetCourseId, state: issues.some((i) => i.severity === "error") ? "completed_with_issues" : "completed", progress: 100, issues, startedBy: a.id, idempotencyKey: opts.idempotencyKey ?? null, output: { created, quarantined } }, "cj");
    audit(store, a, "content.import", `courses/${targetCourseId}`, `${issues.length} issue(s)`);
    metrics.inc("content_jobs_total", { kind: "import" });
    return job;
  });
}

/* ---------------- Blueprints ---------------- */

const SYNCED = ["assignment_groups", "question_banks", "questions", "rubrics", "modules", "pages", "assignments", "quizzes", "discussion_topics", "module_items"] as const;
const CONTENT_KEYS: Record<string, string[]> = {
  modules: ["title", "position", "prerequisiteModuleIds", "sequential", "requireAll"],
  pages: ["title", "blocks"],
  assignments: ["title", "instructions", "points", "dueAt", "unlockAt", "lockAt", "submissionTypes", "groupId", "rubricId"],
  quizzes: ["title", "questionCount", "timeLimitMin", "allowedAttempts", "availableFrom", "availableUntil", "points"],
  discussion_topics: ["title", "prompt"],
  module_items: ["title", "position", "indent", "requirement", "refId", "moduleId"],
  assignment_groups: ["name", "weight", "dropLowest"],
  question_banks: ["title"],
  questions: ["prompt", "choices", "answer", "points", "kind"],
  rubrics: ["title", "criteria"],
};
const LOCK_FOR: Record<string, string> = { title: "content", blocks: "content", instructions: "content", prompt: "content", choices: "content", answer: "content", criteria: "content", points: "points", dueAt: "due_dates", unlockAt: "availability", lockAt: "availability", availableFrom: "availability", availableUntil: "availability" };

const hashOf = (table: string, r: Record<string, unknown>) => sha256(JSON.stringify(CONTENT_KEYS[table].map((k) => r[k] ?? null)));

export function associate(store: TenantStore, a: Actor, blueprintId: string, courseIds: string[]) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins and designers manage blueprints.", 403);
  const bp = course(store, blueprintId);
  if (!bp.isBlueprint) throw new CampusError("invalid", "That course isn't a blueprint.", 422);
  return store.tx(() => {
    for (const cid of courseIds) {
      const c = course(store, cid);
      if (c.isBlueprint) throw new CampusError("invalid", "A blueprint can't be associated with another blueprint.", 422);
      if (c.blueprintId && c.blueprintId !== blueprintId) throw new CampusError("conflict", `${c.code} already follows another blueprint.`, 409);
      store.update("courses", cid, { blueprintId });
    }
    audit(store, a, "blueprint.associate", `courses/${blueprintId}`, courseIds.join(","));
    return { blueprintId, associated: store.list("courses", (c) => c.blueprintId === blueprintId).map((c) => c.id) };
  });
}

export function setItemLock(store: TenantStore, a: Actor, table: string, id: string, locked: boolean) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins and designers manage blueprint locks.", 403);
  const r = store.get(table, id);
  if (!r || !store.get("courses", r.courseId as string)?.isBlueprint) throw new CampusError("not_found", "Blueprint item not found", 404);
  return store.tx(() => store.update(table, id, { blueprintLocked: locked }));
}

/**
 * Push blueprint content to associated courses.
 * Three-way: base (hash at last sync) vs downstream (current copy) vs blueprint (current).
 *  - downstream unchanged → take the blueprint version;
 *  - downstream changed and the item/attribute is locked → blueprint wins (recorded);
 *  - downstream changed and unlocked → keep the local edit (recorded as a conflict).
 * The same idempotency key returns the earlier result instead of syncing twice.
 */
export function blueprintSync(store: TenantStore, a: Actor, blueprintId: string, idempotencyKey: string) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins and designers sync blueprints.", 403);
  const bp = course(store, blueprintId);
  if (!bp.isBlueprint) throw new CampusError("invalid", "That course isn't a blueprint.", 422);
  const prior = store.list("blueprint_syncs", (s) => s.blueprintId === blueprintId && s.idempotencyKey === idempotencyKey)[0];
  if (prior) return prior;
  const targets = store.list("courses", (c) => c.blueprintId === blueprintId);
  const courseLocks = (bp.blueprintLocks as string[]) ?? [];
  return store.tx(() => {
    const diff: { courseId: string; table: string; itemId: string; title: string; action: "created" | "updated" | "kept_local" | "forced" | "deleted" | "unchanged" }[] = [];
    for (const t of targets) {
      // id map for references (blueprint id → downstream id)
      const map = new Map<string, string>();
      for (const table of SYNCED) for (const r of store.list(table, (x) => x.courseId === t.id && !!x.blueprintSourceId)) map.set(r.blueprintSourceId as string, r.id);
      for (const table of SYNCED) {
        for (const src of store.list(table, (x) => x.courseId === blueprintId)) {
          const copy = store.list(table, (x) => x.courseId === t.id && x.blueprintSourceId === src.id, { includeDeleted: true })[0];
          const srcHash = hashOf(table, src);
          const title = String(src.title ?? src.name ?? src.prompt ?? src.id).slice(0, 80);
          if (!copy) {
            const vals: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(src)) if (!SKIP_FIELDS.has(k) && k !== "blueprintLocked") vals[k] = remap(v, map);
            const newId = `${src.id.split("_")[0]}_${sha256(src.id + t.id).slice(0, 12)}`;
            map.set(src.id, newId);
            const row = store.insert(table, { ...vals, id: newId, courseId: t.id, blueprintSourceId: src.id, blueprintBase: srcHash, state: src.state ?? undefined, ...(table === "pages" ? { html: renderBlocks(store, (src.blocks as Block[]) ?? [], t.id) } : {}) }, table.slice(0, 3));
            diff.push({ courseId: t.id, table, itemId: row.id, title, action: "created" });
            continue;
          }
          if (copy.deletedAt) continue; // deleted downstream on purpose: leave it
          const localHash = hashOf(table, copy);
          if (srcHash === copy.blueprintBase && localHash === copy.blueprintBase) {
            diff.push({ courseId: t.id, table, itemId: copy.id, title, action: "unchanged" });
            continue;
          }
          const changedLocally = localHash !== copy.blueprintBase;
          const locked = !!src.blueprintLocked || CONTENT_KEYS[table].some((k) => LOCK_FOR[k] && courseLocks.includes(LOCK_FOR[k]));
          if (changedLocally && !locked) {
            store.update(table, copy.id, { blueprintConflict: { at: nowIso(), blueprintHash: srcHash } });
            diff.push({ courseId: t.id, table, itemId: copy.id, title, action: "kept_local" });
            continue;
          }
          if (srcHash === copy.blueprintBase && !changedLocally) continue;
          const patch: Record<string, unknown> = {};
          for (const k of CONTENT_KEYS[table]) patch[k] = remap(src[k], map);
          if (table === "pages") patch.html = renderBlocks(store, (src.blocks as Block[]) ?? [], t.id);
          store.update(table, copy.id, { ...patch, blueprintBase: srcHash, blueprintConflict: null });
          diff.push({ courseId: t.id, table, itemId: copy.id, title, action: changedLocally ? "forced" : "updated" });
        }
        // Items deleted in the blueprint: remove downstream copies that weren't changed locally.
        for (const copy of store.list(table, (x) => x.courseId === t.id && !!x.blueprintSourceId)) {
          const src = store.get(table, copy.blueprintSourceId as string);
          if (src) continue;
          if (hashOf(table, copy) === copy.blueprintBase) {
            store.tombstone(table, copy.id);
            diff.push({ courseId: t.id, table, itemId: copy.id, title: String(copy.title ?? copy.id), action: "deleted" });
          } else diff.push({ courseId: t.id, table, itemId: copy.id, title: String(copy.title ?? copy.id), action: "kept_local" });
        }
      }
    }
    const changed = diff.filter((d) => d.action !== "unchanged");
    const impact = { courses: targets.length, created: changed.filter((d) => d.action === "created").length, updated: changed.filter((d) => d.action === "updated").length, forced: changed.filter((d) => d.action === "forced").length, keptLocal: changed.filter((d) => d.action === "kept_local").length, deleted: changed.filter((d) => d.action === "deleted").length };
    const rec = store.insert("blueprint_syncs", { blueprintId, targets: targets.map((t) => t.id), diff: changed, impact, state: "completed", idempotencyKey, by: a.id }, "bps");
    store.emit("blueprint.synced", `courses/${blueprintId}`, { syncId: rec.id, impact });
    audit(store, a, "blueprint.sync", `courses/${blueprintId}`, JSON.stringify(impact));
    metrics.inc("blueprint_syncs_total", {});
    return rec;
  });
}

/** Preview what a sync would do, without changing anything. */
export function blueprintPreview(store: TenantStore, a: Actor, blueprintId: string) {
  const snap = JSON.stringify(store.raw().tables);
  const outboxLen = store.outbox().length;
  const auditLen = store.raw().audit.length;
  try {
    const rec = blueprintSync(store, a, blueprintId, `preview-${nowIso()}-${Math.random()}`);
    return { diff: rec.diff, impact: rec.impact };
  } finally {
    store.raw().tables = JSON.parse(snap);
    store.raw().outbox.splice(outboxLen);
    store.raw().audit.splice(auditLen);
  }
}

// Downstream edits to locked attributes are refused.
for (const table of SYNCED) {
  addBeforeWrite(table, (store, _a, values, existing) => {
    if (!existing?.blueprintSourceId || values.blueprintBase !== undefined) return;
    const src = store.get(table, existing.blueprintSourceId as string);
    const bp = store.get("courses", (store.get("courses", existing.courseId as string)?.blueprintId as string) ?? "");
    if (!src || !bp) return;
    const courseLocks = (bp.blueprintLocks as string[]) ?? [];
    const touched = Object.keys(values).filter((k) => (CONTENT_KEYS[table] ?? []).includes(k) && JSON.stringify(values[k]) !== JSON.stringify(existing[k]));
    const blocked = touched.filter((k) => src.blueprintLocked || (LOCK_FOR[k] && courseLocks.includes(LOCK_FOR[k])));
    if (blocked.length) throw new CampusError("blueprint_locked", `Locked by the blueprint course: ${blocked.join(", ")}.`, 409, { fields: blocked });
  });
}

/* ---------------- Shared content library ---------------- */

const SHAREABLE = ["pages", "assignments", "quizzes", "discussion_topics", "modules"];

export function shareItem(store: TenantStore, a: Actor, input: { table: string; id: string; scope: "user" | "institution"; recipientId?: string; tags?: string[] }) {
  if (!SHAREABLE.includes(input.table)) throw new CampusError("invalid", "That kind of item can't be shared.", 422);
  const r = store.get(input.table, input.id);
  if (!r) throw new CampusError("not_found", "Item not found", 404);
  if (!isStaff(a, r.courseId as string)) throw new CampusError("forbidden", "Only course staff can share course content.", 403);
  if (input.scope === "user" && (!input.recipientId || !store.get("users", input.recipientId))) throw new CampusError("invalid", "Choose who to share with.", 422);
  const bundle: Record<string, Row[]> = { [input.table]: [r] };
  if (input.table === "quizzes" && r.bankId) {
    bundle.question_banks = store.list("question_banks", (b) => b.id === r.bankId);
    bundle.questions = store.list("questions", (q) => q.bankId === r.bankId);
  }
  if (input.table === "modules") {
    for (const t of ["pages", "assignments", "quizzes", "discussion_topics", "module_items"]) bundle[t] = [...(bundle[t] ?? []), ...store.list(t, (x) => x.moduleId === r.id)];
  }
  return store.tx(() => {
    const prev = store.list("shared_content", (s) => s.sourceId === r.id && s.scope === input.scope && (s.recipientId ?? null) === (input.recipientId ?? null)).length;
    const s = store.insert("shared_content", { kind: input.table, title: String(r.title), snapshot: bundle, scope: input.scope, recipientId: input.recipientId ?? null, sharedBy: a.id, version: prev + 1, tags: input.tags ?? [], sourceId: r.id }, "shc");
    audit(store, a, "content.share", `${input.table}/${r.id}`, input.scope);
    return s;
  });
}

export function sharedLibrary(store: TenantStore, a: Actor, q?: string) {
  if (!hasAny(a, STAFF_COURSE) && !Object.values(a.courseRoles).some((rs) => rs.some((r) => STAFF_COURSE.includes(r)))) throw new CampusError("forbidden", "The shared library is for teaching staff.", 403);
  const term = (q ?? "").toLowerCase();
  return store
    .list("shared_content", (s) => s.scope === "institution" || s.recipientId === a.id || s.sharedBy === a.id)
    .filter((s) => !term || `${s.title} ${((s.tags as string[]) ?? []).join(" ")}`.toLowerCase().includes(term))
    .map((s) => ({ id: s.id, kind: s.kind, title: s.title, scope: s.scope, version: s.version, tags: s.tags, sharedBy: s.sharedBy, createdAt: s.createdAt }));
}

export function importShared(store: TenantStore, a: Actor, sharedId: string, courseId: string) {
  const s = store.get("shared_content", sharedId);
  if (!s || !(s.scope === "institution" || s.recipientId === a.id || s.sharedBy === a.id)) throw new CampusError("not_found", "Shared item not found", 404);
  requireCourse(store, a, courseId, ["admin", "instructor", "designer"], "content.import_shared");
  return store.tx(() => {
    const res = copyRows(store, s.snapshot as Record<string, Row[]>, courseId, {}, (table, src) => (table !== "modules" && src.moduleId && !(s.snapshot as Record<string, Row[]>).modules?.some((m) => m.id === src.moduleId) ? { moduleId: firstModule(store, courseId) } : {}));
    audit(store, a, "content.import_shared", `courses/${courseId}`, sharedId);
    return { created: res.created };
  });
}

function firstModule(store: TenantStore, courseId: string) {
  const m = store.list("modules", (x) => x.courseId === courseId).sort((x, y) => Number(x.position) - Number(y.position))[0];
  return m?.id ?? store.insert("modules", { courseId, title: "Imported", position: 1, state: "unpublished" }, "mod").id;
}
