import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { registerHooks } from "../entity";
import { hasAny, type Actor } from "../iam";
import { audit, course, esc, isStaff, requireCourse, toMs } from "./common";

/**
 * Curriculum: rich-content blocks (validated JSON + rendered, sanitized, accessible HTML),
 * the accessibility checker, publish validation, module availability (prerequisites,
 * lock dates, sequential progression, requirements, assign-to, mastery paths — all
 * enforced on the server), page revisions, syllabus summary and course navigation.
 */

/* ---------------- Blocks ---------------- */

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string; align?: "left" | "center" | "right" }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "image"; src: string; alt?: string; decorative?: boolean }
  | { type: "code"; lang?: string; text: string }
  | { type: "callout"; tone?: "info" | "warning" | "success"; text: string }
  | { type: "equation"; tex: string }
  | { type: "table"; header?: boolean; rows: string[][]; caption?: string }
  | { type: "media"; mediaId: string }
  | { type: "link"; text?: string; href?: string; ref?: { table: string; id: string } }
  | { type: "embed"; toolId?: string; src?: string; title: string };

const BLOCK_TYPES = ["heading", "paragraph", "list", "image", "code", "callout", "equation", "table", "media", "link", "embed"];
const LINKABLE = ["pages", "assignments", "quizzes", "discussion_topics", "files", "modules"];
/** Embeds are allowed from these hosts only (plus registered LTI tools). */
export const EMBED_ALLOWLIST = ["www.youtube-nocookie.com", "player.vimeo.com", "docs.google.com", "media.scholarion.local"];

export function validateBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) throw new CampusError("invalid", "Content must be a list of blocks.", 422);
  if (raw.length > 500) throw new CampusError("invalid", "Too many blocks.", 422);
  return raw.map((b, i) => {
    if (!b || typeof b !== "object" || !BLOCK_TYPES.includes((b as Block).type)) throw new CampusError("invalid", `Block ${i + 1} has an unknown type.`, 422);
    const blk = b as Block;
    if (blk.type === "heading" && ![2, 3, 4].includes(Number(blk.level))) throw new CampusError("invalid", `Block ${i + 1}: headings use levels 2–4 (the page title is level 1).`, 422);
    if (blk.type === "image" && !/^(https:\/\/|\/api\/campus\/)/.test(blk.src ?? "")) throw new CampusError("invalid", `Block ${i + 1}: images must be https or uploaded files.`, 422);
    if (blk.type === "embed" && blk.src) {
      let host = "";
      try {
        host = new URL(blk.src).host;
      } catch {
        /* invalid */
      }
      if (!EMBED_ALLOWLIST.includes(host)) throw new CampusError("invalid", `Block ${i + 1}: embeds are limited to approved sites.`, 422);
    }
    if (blk.type === "link" && blk.href && !/^(https?:\/\/|\/)/.test(blk.href)) throw new CampusError("invalid", `Block ${i + 1}: unsupported link.`, 422);
    if (blk.type === "link" && blk.ref && !LINKABLE.includes(blk.ref.table)) throw new CampusError("invalid", `Block ${i + 1}: links can point to course content only.`, 422);
    return blk;
  });
}

function titleOf(store: TenantStore, table: string, id: string): string | null {
  const r = store.get(table, id);
  return r ? String(r.title ?? r.name ?? id) : null;
}

/** Renders sanitized, accessible HTML. Links to course content always show the current title. */
export function renderBlocks(store: TenantStore, blocks: Block[], courseId?: string): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
        case "paragraph":
          return `<p${b.align && b.align !== "left" ? ` style="text-align:${b.align}"` : ""}>${esc(b.text)}</p>`;
        case "list":
          return `<${b.ordered ? "ol" : "ul"}>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "image":
          return `<img src="${esc(b.src)}" alt="${b.decorative ? "" : esc(b.alt)}"${b.decorative ? ' role="presentation"' : ""}>`;
        case "code":
          return `<pre><code class="lang-${esc(b.lang ?? "text")}">${esc(b.text)}</code></pre>`;
        case "callout":
          return `<aside class="callout callout-${esc(b.tone ?? "info")}" role="note">${esc(b.text)}</aside>`;
        case "equation":
          return `<span class="math" role="math" aria-label="${esc(b.tex)}">${esc(b.tex)}</span>`;
        case "table": {
          const [head, ...body] = b.rows;
          const caption = b.caption ? `<caption>${esc(b.caption)}</caption>` : "";
          const thead = b.header !== false && head ? `<thead><tr>${head.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>` : "";
          const rows = (b.header !== false ? body : b.rows).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
          return `<table>${caption}${thead}<tbody>${rows}</tbody></table>`;
        }
        case "media": {
          const m = store.get("media", b.mediaId);
          return m ? `<figure class="media"><a href="/campus/media/${esc(m.id)}">${esc(m.title)}</a></figure>` : `<p class="broken">[missing media]</p>`;
        }
        case "link": {
          if (b.ref) {
            const t = titleOf(store, b.ref.table, b.ref.id);
            if (!t) return `<p class="broken">[link to deleted content]</p>`;
            return `<p><a href="/campus/link/${esc(b.ref.table)}/${esc(b.ref.id)}${courseId ? `?course=${esc(courseId)}` : ""}">${esc(b.text || t)}</a></p>`;
          }
          return `<p><a href="${esc(b.href)}" rel="noopener noreferrer">${esc(b.text || b.href)}</a></p>`;
        }
        case "embed":
          return `<iframe title="${esc(b.title)}" src="${esc(b.src ?? `/api/campus/lti/embed/${b.toolId}`)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
      }
    })
    .join("\n");
}

/** Accessibility checker: contrast-safe (no raw colors), heading order, alt text, table headers, link text. */
export function a11yCheck(store: TenantStore, blocks: Block[]): { issue: string; fix: string; block: number }[] {
  const out: { issue: string; fix: string; block: number }[] = [];
  let last = 1;
  blocks.forEach((b, i) => {
    if (b.type === "heading") {
      if (b.level > last + 1) out.push({ issue: `Heading jumps from level ${last} to ${b.level}.`, fix: `Use level ${last + 1}.`, block: i });
      last = b.level;
      if (!b.text.trim()) out.push({ issue: "Empty heading.", fix: "Add heading text or remove it.", block: i });
    }
    if (b.type === "image" && !b.decorative && !(b.alt ?? "").trim()) out.push({ issue: "Image has no alt text.", fix: "Describe the image, or mark it decorative.", block: i });
    if (b.type === "image" && (b.alt ?? "").length > 150) out.push({ issue: "Alt text is very long.", fix: "Keep alt text under 150 characters; put detail in the page.", block: i });
    if (b.type === "table" && b.header === false) out.push({ issue: "Table has no header row.", fix: "Turn on the header row so screen readers announce columns.", block: i });
    if (b.type === "table" && !b.caption) out.push({ issue: "Table has no caption.", fix: "Add a short caption.", block: i });
    if (b.type === "link" && /^(click here|here|read more|link)$/i.test((b.text ?? "").trim())) out.push({ issue: "Link text doesn't say where it goes.", fix: "Use descriptive link text.", block: i });
    if (b.type === "paragraph" && b.text.length > 20 && b.text === b.text.toUpperCase() && /[A-Z]/.test(b.text)) out.push({ issue: "Long all-caps text is hard to read.", fix: "Use sentence case.", block: i });
    if (b.type === "media") {
      const m = store.get("media", b.mediaId);
      if (m && !hasCaptions(store, m.id) && !m.captionException) out.push({ issue: "Media has no captions.", fix: "Add a caption track or record an exception.", block: i });
    }
    if (b.type === "link" && b.ref && !titleOf(store, b.ref.table, b.ref.id)) out.push({ issue: "Link points to deleted content.", fix: "Remove or relink.", block: i });
  });
  return out;
}

export function hasCaptions(store: TenantStore, mediaId: string) {
  return store.list("caption_tracks", (c) => c.mediaId === mediaId && c.kind === "captions").length > 0;
}

export function wordCount(blocks: Block[]) {
  return blocks
    .map((b) => ("text" in b ? b.text : b.type === "list" ? b.items.join(" ") : ""))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/* ---------------- Hooks: pages, modules, courses, items ---------------- */

registerHooks("pages", {
  beforeWrite(store, actor, values, existing) {
    if (values.blocks !== undefined) {
      const blocks = validateBlocks(values.blocks);
      values.blocks = blocks;
      values.html = renderBlocks(store, blocks, (values.courseId ?? existing?.courseId) as string);
    }
    if (values.frontPage) for (const p of store.list("pages", (p) => p.courseId === (values.courseId ?? existing?.courseId) && !!p.frontPage && p.id !== existing?.id)) store.update("pages", p.id, { frontPage: false });
    if (existing && (values.blocks !== undefined || values.title !== undefined)) {
      const n = store.list("page_revisions", (r) => r.pageId === existing.id).length + 1;
      store.insert("page_revisions", { pageId: existing.id, courseId: existing.courseId, title: existing.title, blocks: existing.blocks, authorId: actor.id, revision: n }, "pr");
    }
  },
  publishChecks(store, row) {
    const issues = a11yCheck(store, (row.blocks as Block[]) ?? []).map((x) => x.issue);
    const mod = store.get("modules", row.moduleId as string);
    if (!mod) issues.push("The page's module no longer exists.");
    return issues;
  },
  canRead(store, a, row) {
    if (isStaff(a, row.courseId as string)) return true;
    return itemAccessible(store, a, "page", row.id).ok;
  },
});

registerHooks("modules", {
  publishChecks(store, row) {
    const issues: string[] = [];
    const same = store.list("modules", (m) => m.courseId === row.courseId && m.position === row.position && m.id !== row.id);
    if (same.length) issues.push(`Another module already uses position ${row.position}.`);
    for (const pre of (row.prerequisiteModuleIds as string[]) ?? []) {
      const m = store.get("modules", pre);
      if (!m) issues.push("A prerequisite module no longer exists.");
      else if (Number(m.position) >= Number(row.position)) issues.push(`Prerequisite "${m.title}" must come before this module.`);
    }
    if (row.unlockAt && Number.isNaN(toMs(row.unlockAt))) issues.push("Lock-until date is invalid.");
    return issues;
  },
});

registerHooks("module_items", {
  beforeWrite(store, _a, values, existing) {
    const kind = (values.kind ?? existing?.kind) as string;
    const refId = (values.refId ?? existing?.refId) as string | undefined;
    const table = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussion_topics", file: "files" }[kind];
    if (table) {
      if (!refId || !store.get(table, refId)) throw new CampusError("invalid", `Pick an existing ${kind} for this item.`, 422);
    }
    if ((values.requirement ?? existing?.requirement) === "min_score" && !(kind === "assignment" || kind === "quiz")) throw new CampusError("invalid", "A minimum score needs an assignment or quiz item.", 422);
  },
  publishChecks(store, row) {
    const table = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussion_topics", file: "files" }[row.kind as string];
    if (table && !store.get(table, row.refId as string)) return ["The linked content was deleted."];
    if (row.kind === "lti" && !row.url) return ["External tool items need a launch URL."];
    return [];
  },
});

registerHooks("courses", {
  publishChecks(store, row) {
    const issues: string[] = [];
    if (!store.list("modules", (m) => m.courseId === row.id && m.state === "published").length) issues.push("Publish at least one module first.");
    for (const a of store.list("assignments", (x) => x.courseId === row.id && x.state === "published")) {
      if (a.dueAt && row.endAt && toMs(a.dueAt) > toMs(row.endAt)) issues.push(`"${a.title}" is due after the course ends.`);
    }
    for (const p of store.list("pages", (x) => x.courseId === row.id && x.state === "published")) {
      const a11y = a11yCheck(store, (p.blocks as Block[]) ?? []);
      if (a11y.length) issues.push(`Page "${p.title}" has ${a11y.length} accessibility issue(s).`);
    }
    return issues;
  },
  beforeWrite(store, _a, values, existing) {
    // Blueprint locks: associated courses can't change locked settings.
    if (existing?.blueprintId && values.__fromBlueprint !== true) {
      const bp = store.get("courses", existing.blueprintId as string);
      const locks = (bp?.blueprintLocks as string[]) ?? [];
      if (locks.includes("settings") && Object.keys(values).some((k) => ["latePolicy", "gradingSchemeId", "navigation", "homeType"].includes(k))) throw new CampusError("blueprint_locked", "These settings are locked by the blueprint course.", 409);
    }
    delete values.__fromBlueprint;
  },
});

/* ---------------- Assign-to & effective dates ---------------- */

export function groupIdsOf(store: TenantStore, userId: string, courseId: string): string[] {
  return store.list("groups", (g) => g.courseId === courseId && ((g.memberIds as string[]) ?? []).includes(userId)).map((g) => g.id);
}
export function sectionIdsOf(store: TenantStore, userId: string, courseId: string): string[] {
  return store.list("enrollments", (e) => e.userId === userId && e.courseId === courseId && e.state === "active" && !!e.sectionId).map((e) => e.sectionId as string);
}

/** Dates that apply to one student: student override > group > section > everyone. */
export function effectiveDates(store: TenantStore, item: Row, userId: string): { dueAt: string | null; unlockAt: string | null; lockAt: string | null; source: string; assigned: boolean } {
  const base = { dueAt: (item.dueAt as string) ?? null, unlockAt: (item.unlockAt as string) ?? (item.availableFrom as string) ?? null, lockAt: (item.lockAt as string) ?? (item.availableUntil as string) ?? null };
  const overrides = store.list("assignment_overrides", (o) => o.assignmentId === item.id);
  if (!overrides.length) return { ...base, source: "everyone", assigned: true };
  const courseId = item.courseId as string;
  const pick =
    overrides.find((o) => o.target === "student" && o.targetId === userId) ??
    overrides.find((o) => o.target === "group" && groupIdsOf(store, userId, courseId).includes(o.targetId as string)) ??
    overrides.find((o) => o.target === "section" && sectionIdsOf(store, userId, courseId).includes(o.targetId as string));
  if (!pick) {
    // "Everyone else" gets the base dates unless the item is assigned only to the listed people.
    return { ...base, source: "everyone", assigned: !item.onlyAssigned };
  }
  return { dueAt: (pick.dueAt as string) ?? base.dueAt, unlockAt: (pick.unlockAt as string) ?? base.unlockAt, lockAt: (pick.lockAt as string) ?? base.lockAt, source: `${pick.target}:${pick.targetId}`, assigned: true };
}

function assignedTo(store: TenantStore, assignTo: unknown, userId: string, courseId: string): boolean {
  if (!assignTo || typeof assignTo !== "object") return true;
  const t = assignTo as { sections?: string[]; groups?: string[]; students?: string[] };
  if (!t.sections?.length && !t.groups?.length && !t.students?.length) return true;
  return !!(t.students?.includes(userId) || t.sections?.some((s) => sectionIdsOf(store, userId, courseId).includes(s)) || t.groups?.some((g) => groupIdsOf(store, userId, courseId).includes(g)));
}

/* ---------------- Module progression ---------------- */

export interface ItemState {
  item: Row;
  visible: boolean;
  locked: boolean;
  reason?: string;
  done: boolean;
  requirement: string;
}
export interface ModuleState {
  module: Row;
  visible: boolean;
  locked: boolean;
  reason?: string;
  complete: boolean;
  waived?: boolean;
  items: ItemState[];
}

function postedPct(store: TenantStore, userId: string, assignmentId: string): number | null {
  const g = store.list("grades", (x) => x.userId === userId && x.assignmentId === assignmentId && !!x.posted)[0];
  if (!g || g.score === null || g.score === undefined) return null;
  const asg = store.get("assignments", assignmentId) ?? store.get("quizzes", assignmentId);
  const pts = Number(asg?.points ?? 0);
  return pts > 0 ? (Number(g.score) / pts) * 100 : null;
}

function requirementMet(store: TenantStore, userId: string, item: Row): boolean {
  const req = (item.requirement as string) ?? "none";
  if (req === "none") return true;
  const progress = store.list("module_progress", (p) => p.userId === userId && p.itemId === item.id);
  if (req === "view") return progress.some((p) => p.kind === "view" || p.kind === "mark_done");
  if (req === "mark_done") return progress.some((p) => p.kind === "mark_done");
  if (req === "contribute") return store.list("posts", (p) => p.topicId === item.refId && p.authorId === userId).length > 0;
  if (req === "submit") {
    if (item.kind === "quiz") return store.list("attempts", (x) => x.quizId === item.refId && x.userId === userId && x.state !== "in_progress").length > 0;
    return store.list("submissions", (s) => s.assignmentId === item.refId && s.userId === userId).length > 0 || store.list("lab_sessions", (s) => s.assignmentId === item.refId && s.userId === userId && s.state === "graded").length > 0;
  }
  if (req === "min_score") {
    const pct = postedPct(store, userId, item.refId as string);
    return pct !== null && pct >= Number(item.minScore ?? 0);
  }
  return false;
}

/** Items gated by mastery paths, and whether this student has unlocked them. */
function masteryGate(store: TenantStore, userId: string, courseId: string, itemId: string): { gated: boolean; open: boolean; label?: string } {
  const paths = store.list("mastery_paths", (m) => m.courseId === courseId);
  let gated = false;
  for (const p of paths) {
    for (const r of (p.ranges as { min: number; max: number; itemIds: string[]; label?: string }[]) ?? []) {
      if (!r.itemIds?.includes(itemId)) continue;
      gated = true;
      const pct = postedPct(store, userId, p.triggerAssignmentId as string);
      if (pct !== null && pct >= r.min && pct <= r.max) return { gated, open: true, label: r.label };
    }
  }
  return { gated, open: false };
}

export function moduleStates(store: TenantStore, a: Actor, courseId: string, forUserId?: string): ModuleState[] {
  const staffView = isStaff(a, courseId) && !forUserId;
  const userId = forUserId ?? a.id;
  const modules = store.list("modules", (m) => m.courseId === courseId).sort((x, y) => Number(x.position) - Number(y.position));
  const out: ModuleState[] = [];
  const completeById: Record<string, boolean> = {};
  for (const m of modules) {
    const items = store.list("module_items", (i) => i.moduleId === m.id).sort((x, y) => Number(x.position) - Number(y.position));
    if (staffView) {
      out.push({ module: m, visible: true, locked: false, complete: false, items: items.map((item) => ({ item, visible: true, locked: false, done: false, requirement: (item.requirement as string) ?? "none" })) });
      continue;
    }
    const visible = m.state === "published" && assignedTo(store, m.assignTo, userId, courseId);
    let locked = false;
    let reason: string | undefined;
    if (m.unlockAt && toMs(m.unlockAt) > Date.parse(nowIso())) {
      locked = true;
      reason = `Locked until ${new Date(String(m.unlockAt)).toUTCString().slice(0, 16)}`;
    }
    for (const pre of (m.prerequisiteModuleIds as string[]) ?? []) {
      if (!completeById[pre]) {
        locked = true;
        reason = `Complete "${store.get("modules", pre)?.title ?? "the previous module"}" first`;
      }
    }
    const states: ItemState[] = [];
    let prevDone = true;
    for (const item of items) {
      let iv = visible && item.state === "published";
      const gate = masteryGate(store, userId, courseId, item.id);
      if (gate.gated && !gate.open) iv = false;
      // Items whose linked content is unpublished stay hidden.
      const table = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussion_topics" }[item.kind as string];
      if (table) {
        const ref = store.get(table, item.refId as string);
        if (!ref || (ref.state !== undefined && ref.state !== "published")) iv = false;
        else if (table !== "pages") {
          const d = effectiveDates(store, ref, userId);
          if (!d.assigned) iv = false;
        }
      }
      const done = requirementMet(store, userId, item);
      let il = locked;
      let ir = reason;
      if (!il && m.sequential && !prevDone) {
        il = true;
        ir = "Complete the previous item first";
      }
      states.push({ item, visible: iv, locked: il, reason: ir, done, requirement: (item.requirement as string) ?? "none" });
      if (iv && (item.requirement ?? "none") !== "none") prevDone = prevDone && done;
    }
    const reqs = states.filter((s) => s.visible && s.requirement !== "none");
    // A pathway waiver (from prior completion or credit transfer) counts the module as complete.
    const waived = store.list("module_waivers", (w) => w.userId === userId && w.moduleId === m.id).length > 0;
    const complete = waived || (reqs.length === 0 ? true : m.requireAll === false ? reqs.some((s) => s.done) : reqs.every((s) => s.done));
    completeById[m.id] = complete;
    out.push({ module: m, visible, locked, reason, complete, waived, items: states.filter((s) => s.visible).map((s) => (waived ? { ...s, done: true } : s)) });
  }
  return out.filter((m) => m.visible);
}

/** Is a piece of content reachable for this student (via the modules it appears in)? */
export function itemAccessible(store: TenantStore, a: Actor, kind: string, refId: string): { ok: boolean; reason?: string; itemId?: string } {
  const items = store.list("module_items", (i) => i.kind === kind && i.refId === refId);
  if (!items.length) return { ok: true };
  const courseId = items[0].courseId as string;
  if (isStaff(a, courseId)) return { ok: true };
  const states = moduleStates(store, a, courseId);
  for (const m of states) for (const s of m.items) if (s.item.refId === refId && s.item.kind === kind && !s.locked) return { ok: true, itemId: s.item.id };
  for (const m of states) for (const s of m.items) if (s.item.refId === refId && s.item.kind === kind) return { ok: false, reason: s.reason ?? m.reason ?? "Locked", itemId: s.item.id };
  return { ok: false, reason: "This item isn't available to you yet." };
}

export function assertAccessible(store: TenantStore, a: Actor, kind: string, refId: string) {
  const r = itemAccessible(store, a, kind, refId);
  if (!r.ok) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: `${kind}.open`, resource: `${kind}/${refId}`, outcome: "denied", reason: r.reason });
    throw new CampusError("locked", r.reason ?? "Locked", 423);
  }
}

/** Opening a module item records "view", and returns previous/next items the student can reach. */
export function openItem(store: TenantStore, a: Actor, itemId: string) {
  const item = store.get("module_items", itemId);
  if (!item) throw new CampusError("not_found", "Item not found", 404);
  const courseId = item.courseId as string;
  if (!hasAny(a, ["admin", "instructor", "ta", "designer", "student", "observer"], courseId)) throw new CampusError("forbidden", "You're not in this course.", 403);
  const states = moduleStates(store, a, courseId);
  const flat = states.flatMap((m) => m.items.map((s) => ({ ...s, moduleLocked: m.locked, moduleReason: m.reason })));
  const idx = flat.findIndex((s) => s.item.id === itemId);
  if (idx < 0) throw new CampusError("locked", "This item isn't available to you yet.", 423);
  const s = flat[idx];
  if (s.locked) throw new CampusError("locked", s.reason ?? "Locked", 423);
  if (!isStaff(a, courseId) && !store.list("module_progress", (p) => p.userId === a.id && p.itemId === itemId && p.kind === "view").length) {
    store.tx(() => {
      store.insert("module_progress", { userId: a.id, courseId, itemId, kind: "view", at: nowIso() }, "mp");
      store.emit("module.item.viewed", `module_items/${itemId}`, { courseId, itemId, userId: a.id });
    });
  }
  const prev = flat.slice(0, idx).reverse().find((x) => !x.locked && x.item.kind !== "header");
  const next = flat.slice(idx + 1).find((x) => x.item.kind !== "header");
  return { item, prev: prev ? { id: prev.item.id, title: prev.item.title } : null, next: next ? { id: next.item.id, title: next.item.title, locked: next.locked, reason: next.reason } : null };
}

export function markDone(store: TenantStore, a: Actor, itemId: string, done = true) {
  const item = store.get("module_items", itemId);
  if (!item || item.requirement !== "mark_done") throw new CampusError("invalid", "This item doesn't use 'mark as done'.", 400);
  assertAccessible(store, a, item.kind as string, item.refId as string);
  return store.tx(() => {
    const existing = store.list("module_progress", (p) => p.userId === a.id && p.itemId === itemId && p.kind === "mark_done");
    if (done && !existing.length) store.insert("module_progress", { userId: a.id, courseId: item.courseId, itemId, kind: "mark_done", at: nowIso() }, "mp");
    if (!done) for (const p of existing) store.tombstone("module_progress", p.id);
    store.emit("module.item.marked", `module_items/${itemId}`, { userId: a.id, done });
    return { done };
  });
}

/** Progress for all students (teacher view). */
export function progressReport(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta", "designer"], "modules.progress");
  return store.list("enrollments", (e) => e.courseId === courseId && e.role === "student" && e.state === "active").map((e) => {
    const states = moduleStates(store, a, courseId, e.userId as string);
    return { userId: e.userId, name: store.get("users", e.userId as string)?.name, modules: states.map((m) => ({ id: m.module.id, title: m.module.title, complete: m.complete, locked: m.locked, done: m.items.filter((i) => i.done).length, total: m.items.filter((i) => i.requirement !== "none").length })) };
  });
}

/** Duplicate a module with its items (unpublished). */
export function duplicateModule(store: TenantStore, a: Actor, moduleId: string) {
  const m = store.get("modules", moduleId);
  if (!m) throw new CampusError("not_found", "Module not found", 404);
  requireCourse(store, a, m.courseId as string, ["admin", "instructor", "designer"], "modules.duplicate");
  return store.tx(() => {
    const maxPos = Math.max(0, ...store.list("modules", (x) => x.courseId === m.courseId).map((x) => Number(x.position)));
    const copy = store.insert("modules", { courseId: m.courseId, title: `${m.title} (copy)`, position: maxPos + 1, week: m.week, prereq: m.prereq, state: "unpublished", sequential: m.sequential, requireAll: m.requireAll }, "mod");
    for (const it of store.list("module_items", (i) => i.moduleId === m.id)) {
      const { id: _i, version: _v, createdAt: _c, updatedAt: _u, ...rest } = it;
      void _i;
      void _v;
      void _c;
      void _u;
      store.insert("module_items", { ...rest, moduleId: copy.id, state: "unpublished" }, "mi");
    }
    store.emit("modules.created", `modules/${copy.id}`, { id: copy.id, courseId: m.courseId });
    audit(store, a, "modules.duplicate", `modules/${moduleId}`);
    return copy;
  });
}

/** Move an item to another module/position (drag and drop). */
export function moveItem(store: TenantStore, a: Actor, itemId: string, moduleId: string, position: number, indent?: number) {
  const item = store.get("module_items", itemId);
  const m = store.get("modules", moduleId);
  if (!item || !m || m.courseId !== item.courseId) throw new CampusError("not_found", "Item or module not found", 404);
  requireCourse(store, a, item.courseId as string, ["admin", "instructor", "designer", "ta"], "module_items.move");
  return store.tx(() => {
    const siblings = store.list("module_items", (i) => i.moduleId === moduleId && i.id !== itemId).sort((x, y) => Number(x.position) - Number(y.position));
    siblings.splice(Math.max(0, Math.min(position - 1, siblings.length)), 0, item);
    siblings.forEach((s, i) => {
      if (s.id === itemId) store.update("module_items", s.id, { moduleId, position: i + 1, ...(indent !== undefined ? { indent: Math.max(0, Math.min(3, indent)) } : {}) });
      else if (Number(s.position) !== i + 1) store.update("module_items", s.id, { position: i + 1 });
    });
    store.emit("module_items.updated", `module_items/${itemId}`, { id: itemId, courseId: item.courseId });
    return store.get("module_items", itemId);
  });
}

/* ---------------- Pages: revisions ---------------- */

export function restoreRevision(store: TenantStore, a: Actor, revisionId: string) {
  const r = store.get("page_revisions", revisionId);
  if (!r) throw new CampusError("not_found", "Revision not found", 404);
  requireCourse(store, a, r.courseId as string, ["admin", "instructor", "designer", "ta"], "pages.restore_revision");
  const page = store.get("pages", r.pageId as string);
  if (!page) throw new CampusError("not_found", "Page not found", 404);
  return store.tx(() => {
    const n = store.list("page_revisions", (x) => x.pageId === page.id).length + 1;
    store.insert("page_revisions", { pageId: page.id, courseId: page.courseId, title: page.title, blocks: page.blocks, authorId: a.id, revision: n }, "pr");
    const out = store.update("pages", page.id, { title: r.title, blocks: r.blocks, html: renderBlocks(store, r.blocks as Block[], page.courseId as string) });
    store.emit("pages.updated", `pages/${page.id}`, { id: page.id, courseId: page.courseId, restoredFrom: r.revision });
    audit(store, a, "pages.restore_revision", `pages/${page.id}`, `rev ${r.revision}`);
    return out;
  });
}

/** Can this user edit the page per its editing roles? */
export function canEditPage(a: Actor, page: Row): boolean {
  const c = page.courseId as string;
  if (isStaff(a, c)) return true;
  if (page.editingRoles === "teachers_students") return (a.courseRoles[c] ?? []).includes("student");
  if (page.editingRoles === "anyone") return true;
  return false;
}

export function renderPage(store: TenantStore, page: Row) {
  return renderBlocks(store, (page.blocks as Block[]) ?? [], page.courseId as string);
}

/* ---------------- Syllabus & course navigation ---------------- */

export function syllabus(store: TenantStore, a: Actor, courseId: string) {
  const c = course(store, courseId);
  const staff = isStaff(a, courseId);
  const rows: { date: string | null; kind: string; title: string; id: string; href: string }[] = [];
  for (const asg of store.list("assignments", (x) => x.courseId === courseId && (staff || x.state === "published"))) {
    const d = staff ? { dueAt: asg.dueAt as string, assigned: true } : effectiveDates(store, asg, a.id);
    if (d.assigned) rows.push({ date: d.dueAt ?? null, kind: "Assignment", title: asg.title as string, id: asg.id, href: `assignments/${asg.id}` });
  }
  for (const q of store.list("quizzes", (x) => x.courseId === courseId && (staff || x.state === "published"))) {
    const d = staff ? { dueAt: q.availableUntil as string, assigned: true } : effectiveDates(store, { ...q, dueAt: q.availableUntil }, a.id);
    if (d.assigned) rows.push({ date: d.dueAt ?? null, kind: "Quiz", title: q.title as string, id: q.id, href: `quizzes/${q.id}` });
  }
  for (const t of store.list("discussion_topics", (x) => x.courseId === courseId && (staff || x.state === "published") && !!x.checkpoints)) {
    const cp = t.checkpoints as { replyToTopic?: { dueAt?: string } };
    rows.push({ date: cp.replyToTopic?.dueAt ?? null, kind: "Discussion", title: t.title as string, id: t.id, href: `discussions/${t.id}` });
  }
  for (const e of store.list("calendar_events", (x) => x.courseId === courseId)) rows.push({ date: e.startsAt as string, kind: "Event", title: e.title as string, id: e.id, href: `calendar` });
  rows.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
  return { description: (c.syllabusBody as string) ?? "", items: rows };
}

export const COURSE_TABS = [
  { tab: "home", label: "Home" },
  { tab: "announcements", label: "Announcements" },
  { tab: "syllabus", label: "Syllabus" },
  { tab: "modules", label: "Modules" },
  { tab: "assignments", label: "Assignments" },
  { tab: "discussions", label: "Discussions" },
  { tab: "quizzes", label: "Quizzes" },
  { tab: "grades", label: "Grades" },
  { tab: "people", label: "People" },
  { tab: "pages", label: "Pages" },
  { tab: "files", label: "Files" },
  { tab: "outcomes", label: "Outcomes" },
  { tab: "rubrics", label: "Rubrics" },
  { tab: "collaborations", label: "Collaborations" },
  { tab: "live", label: "Live sessions" },
  { tab: "analytics", label: "Analytics" },
  { tab: "library", label: "Reading list" },
  { tab: "settings", label: "Settings" },
] as const;
export type CourseTab = (typeof COURSE_TABS)[number]["tab"];

const TEACHER_ONLY: CourseTab[] = ["settings", "rubrics", "analytics"];

/** Course navigation in the teacher's order; hidden and empty tabs disappear for students. */
export function courseNav(store: TenantStore, a: Actor, courseId: string) {
  const c = course(store, courseId);
  const staff = isStaff(a, courseId);
  const saved = (c.navigation as { tab: string; hidden?: boolean }[] | undefined) ?? [];
  const order = [...saved.map((s) => s.tab), ...COURSE_TABS.map((t) => t.tab).filter((t) => !saved.some((s) => s.tab === t))];
  const empty: Record<string, () => boolean> = {
    announcements: () => !store.list("announcements", (x) => x.courseId === courseId && x.state === "published").length,
    discussions: () => !store.list("discussion_topics", (x) => x.courseId === courseId && x.state === "published").length,
    quizzes: () => !store.list("quizzes", (x) => x.courseId === courseId && x.state === "published").length,
    pages: () => !store.list("pages", (x) => x.courseId === courseId && x.state === "published").length,
    files: () => !store.list("files", (x) => x.courseId === courseId && !!x.published).length,
    outcomes: () => !store.list("outcome_alignments", (x) => x.courseId === courseId).length,
    collaborations: () => !store.list("collaborations", (x) => x.courseId === courseId).length,
    live: () => !store.list("live_sessions", (x) => x.courseId === courseId).length,
    library: () => !store.list("reading_items", (x) => x.courseId === courseId).length,
    assignments: () => !store.list("assignments", (x) => x.courseId === courseId && x.state === "published").length,
  };
  return order
    .map((tab) => {
      const found = COURSE_TABS.find((t) => t.tab === tab);
      if (!found) return null;
      const meta: { tab: CourseTab; label: string } = { tab: found.tab, label: found.label };
      const hidden = !!saved.find((s) => s.tab === tab)?.hidden;
      if (staff) return { ...meta, hidden };
      if (hidden || TEACHER_ONLY.includes(tab as CourseTab)) return null;
      if (tab !== "home" && empty[tab]?.()) return null;
      return { ...meta, hidden: false };
    })
    .filter((x): x is { tab: CourseTab; label: string; hidden: boolean } => !!x);
}

/** Course setup checklist for new courses. */
export function setupChecklist(store: TenantStore, courseId: string) {
  const c = course(store, courseId);
  return [
    { label: "Add a syllabus description", done: !!(c.syllabusBody as string)?.trim() },
    { label: "Create and publish a module", done: store.list("modules", (m) => m.courseId === courseId && m.state === "published").length > 0 },
    { label: "Add an assignment", done: store.list("assignments", (x) => x.courseId === courseId).length > 0 },
    { label: "Set up assignment groups and weights", done: store.list("assignment_groups", (x) => x.courseId === courseId).length > 0 },
    { label: "Choose a home page", done: !!c.homeType },
    { label: "Post a welcome announcement", done: store.list("announcements", (x) => x.courseId === courseId).length > 0 },
    { label: "Publish the course", done: c.state === "published" },
  ];
}

/** Student View: a resettable test student enrolled in every section of the course. */
export function studentView(store: TenantStore, a: Actor, courseId: string, reset = false) {
  requireCourse(store, a, courseId, ["admin", "instructor", "designer", "ta"], "courses.student_view");
  return store.tx(() => {
    let u = store.list("users", (x) => x.testStudentOf === courseId)[0];
    if (u && reset) {
      for (const t of ["submissions", "attempts", "grades", "module_progress", "posts", "planner_marks"]) for (const r of store.list(t, (r) => r.userId === u!.id || r.authorId === u!.id)) store.tombstone(t, r.id);
    }
    if (!u) {
      u = store.insert("users", { name: "Test Student", email: `test-student+${courseId}@scholarion.invalid`, status: "active", testStudentOf: courseId, passwordHash: null }, "usr");
      store.insert("enrollments", { userId: u.id, courseId, role: "student", state: "active", source: "student_view" }, "enr");
    }
    audit(store, a, reset ? "courses.student_view_reset" : "courses.student_view", `courses/${courseId}`);
    return u;
  });
}
