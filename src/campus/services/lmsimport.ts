import { gunzipSync } from "node:zlib";
import { CampusError, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { importPackage, unzip } from "./content";
import { zip } from "./files";

/**
 * Import packages exported from other learning platforms (parity §7). Each converter turns the
 * foreign export into an IMS content package (web pages + QTI 1.2 quizzes) in memory and hands it
 * to the normal importer, so quarantine, the issue report and idempotency work the same way.
 *
 *   - Moodle course backups (.mbz: gzipped tar, or the older zip form) — pages, labels, URLs,
 *     assignments (as pages with their instructions) and quizzes from the question bank
 *     (multiple choice, true/false, short answer, numerical, essay).
 *   - Blackboard Learn course exports (zip with imsmanifest.xml and resource/x-bb-* .dat files) —
 *     documents and tests (multiple choice, true/false, essay, fill-in).
 *   - D2L Brightspace exports (IMS packages with d2l_2p0 resources) — content pages and quizzes.
 *   - Anything else with an imsmanifest.xml goes to the importer unchanged.
 *
 * Archive reading is bounded (50 MB expanded, safe paths only). Nothing in a package executes.
 */

export type Platform = "moodle" | "blackboard" | "d2l" | "ims";
interface Page {
  title: string;
  html: string;
}
interface QItem {
  type: "multiple_choice" | "true_false" | "essay" | "numeric" | "multiple_answer" | "fill_blank";
  prompt: string;
  choices: string[];
  correct: number[];
  answer?: string;
  points: number;
}
interface Quiz {
  title: string;
  items: QItem[];
}
interface Converted {
  platform: Platform;
  title: string;
  pages: Page[];
  quizzes: Quiz[];
  notes: string[];
}

const MAX = 50 * 1024 * 1024;
const esc = (s: unknown) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const unesc = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? unesc(m[1]).trim() : "";
};
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Minimal ustar reader with the same bounds as the zip reader. */
export function untar(buf: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  let p = 0;
  let total = 0;
  let longName: string | null = null;
  while (p + 512 <= buf.length) {
    const header = buf.subarray(p, p + 512);
    if (header.every((b) => b === 0)) break;
    const field = (o: number, l: number) => header.subarray(o, o + l).toString("utf8").replace(/\0.*$/s, "");
    let name = field(0, 100);
    const prefix = field(345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    if (!Number.isFinite(size) || size < 0) throw new CampusError("invalid_package", "Corrupt archive header.", 422);
    const data = buf.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = data.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    if (longName) {
      name = longName;
      longName = null;
    }
    if (type !== "0" && type !== "\0" && type !== "7") continue; // files only; no links or devices
    name = name.replace(/^\.\//, "");
    if (!name || name.includes("..") || name.startsWith("/")) throw new CampusError("invalid_package", `Unsafe path in package: ${name}`, 422);
    total += size;
    if (total > MAX) throw new CampusError("too_large", "Package expands to more than 50 MB.", 413);
    out.push({ name, data: Buffer.from(data) });
  }
  return out;
}

export function readArchive(buf: Buffer): { name: string; data: Buffer }[] {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    let raw: Buffer;
    try {
      raw = gunzipSync(buf, { maxOutputLength: MAX });
    } catch {
      throw new CampusError("too_large", "The archive is corrupt or expands to more than 50 MB.", 413);
    }
    return untar(raw);
  }
  return unzip(buf);
}

export function detectPlatform(entries: { name: string; data: Buffer }[]): Platform {
  if (entries.some((e) => e.name === "moodle_backup.xml")) return "moodle";
  const manifest = entries.find((e) => e.name === "imsmanifest.xml")?.data.toString("utf8") ?? "";
  if (/resource\/x-bb-|bb:title|x-bb-/i.test(manifest)) return "blackboard";
  if (/d2l_2p0|xmlns:d2l/i.test(manifest)) return "d2l";
  if (manifest) return "ims";
  throw new CampusError("invalid_package", "Unrecognized package: no moodle_backup.xml or imsmanifest.xml.", 422);
}

/* ---------------- Moodle ---------------- */

function moodle(entries: { name: string; data: Buffer }[]): Converted {
  const file = (n: string) => entries.find((e) => e.name === n)?.data.toString("utf8") ?? "";
  const backup = file("moodle_backup.xml");
  const title = tag(backup, "original_course_fullname") || tag(file("course/course.xml"), "fullname") || "Imported Moodle course";
  const pages: Page[] = [];
  const quizzes: Quiz[] = [];
  const notes: string[] = [];
  // Question bank: questions.xml at the backup root.
  const qxml = file("questions.xml");
  const bank = new Map<string, QItem | { unsupported: string; prompt: string }>();
  for (const m of qxml.matchAll(/<question id="(\d+)">([\s\S]*?)<\/question>/g)) {
    const [, id, q] = m;
    const qtype = tag(q, "qtype");
    const prompt = plain(tag(q, "questiontext")) || tag(q, "name");
    const points = Number(tag(q, "defaultmark")) || 1;
    const answers = [...q.matchAll(/<answer id="\d+">([\s\S]*?)<\/answer>/g)].map((a) => ({ text: plain(tag(a[1], "answertext")), fraction: Number(tag(a[1], "fraction")) }));
    if (qtype === "multichoice") {
      const correct = answers.map((a, i) => (a.fraction > 0 ? i : -1)).filter((i) => i >= 0);
      bank.set(id, { type: correct.length > 1 ? "multiple_answer" : "multiple_choice", prompt, choices: answers.map((a) => a.text), correct, points });
    } else if (qtype === "truefalse") {
      const t = answers.find((a) => /^true$/i.test(a.text));
      bank.set(id, { type: "true_false", prompt, choices: ["True", "False"], correct: [t && t.fraction > 0 ? 0 : 1], points });
    } else if (qtype === "shortanswer") bank.set(id, { type: "fill_blank", prompt, choices: [], correct: [], answer: answers.find((a) => a.fraction >= 1)?.text ?? answers[0]?.text ?? "", points });
    else if (qtype === "numerical") bank.set(id, { type: "numeric", prompt, choices: [], correct: [], answer: answers.find((a) => a.fraction >= 1)?.text ?? "", points });
    else if (qtype === "essay") bank.set(id, { type: "essay", prompt, choices: [], correct: [], points });
    else bank.set(id, { unsupported: qtype || "unknown", prompt });
  }
  const activities = [...backup.matchAll(/<activity>([\s\S]*?)<\/activity>/g)].map((m) => ({ module: tag(m[1], "modulename"), dir: tag(m[1], "directory"), title: tag(m[1], "title") }));
  for (const act of activities) {
    const x = file(`${act.dir}/${act.module}.xml`);
    if (!x) {
      notes.push(`${act.title}: activity file missing from the backup.`);
      continue;
    }
    if (act.module === "page") pages.push({ title: tag(x, "name") || act.title, html: tag(x, "content") });
    else if (act.module === "label") pages.push({ title: act.title || "Label", html: tag(x, "intro") });
    else if (act.module === "url") pages.push({ title: tag(x, "name") || act.title, html: `<p>${esc(tag(x, "intro"))}</p><p>Link: ${esc(tag(x, "externalurl"))}</p>` });
    else if (act.module === "assign") pages.push({ title: `${tag(x, "name") || act.title} (assignment instructions)`, html: tag(x, "intro") });
    else if (act.module === "quiz") {
      const items: QItem[] = [];
      for (const ref of x.matchAll(/<questionid>(\d+)<\/questionid>|<question_reference[\s\S]*?<questionbankentryid>(\d+)<\/questionbankentryid>/g)) {
        const q = bank.get(ref[1] ?? ref[2]);
        if (!q) continue;
        if ("unsupported" in q) notes.push(`${act.title}: question type "${q.unsupported}" isn't supported — "${q.prompt.slice(0, 60)}"`);
        else items.push(q);
      }
      if (!items.length && bank.size) for (const q of bank.values()) if (!("unsupported" in q)) items.push(q);
      quizzes.push({ title: tag(x, "name") || act.title, items });
    } else notes.push(`${act.title}: Moodle activity "${act.module}" isn't converted.`);
  }
  return { platform: "moodle", title, pages, quizzes, notes };
}

/* ---------------- Blackboard ---------------- */

function blackboard(entries: { name: string; data: Buffer }[]): Converted {
  const manifest = entries.find((e) => e.name === "imsmanifest.xml")!.data.toString("utf8");
  const pages: Page[] = [];
  const quizzes: Quiz[] = [];
  const notes: string[] = [];
  let title = "Imported Blackboard course";
  for (const r of manifest.matchAll(/<resource\b([^>]*)\/?>/g)) {
    const attrs = r[1];
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const href = /bb:file="([^"]+)"/.exec(attrs)?.[1] ?? /href="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const rTitle = unesc(/bb:title="([^"]*)"/.exec(attrs)?.[1] ?? "");
    const dat = entries.find((e) => e.name === href)?.data.toString("utf8") ?? "";
    if (!dat) continue;
    if (type === "course/x-bb-coursesetting") title = tag(dat, "TITLE") || /<TITLE value="([^"]*)"/.exec(dat)?.[1] || title;
    else if (type === "resource/x-bb-document") {
      const t = /<TITLE value="([^"]*)"/.exec(dat)?.[1] ?? rTitle;
      const body = tag(dat, "TEXT");
      if (body || t) pages.push({ title: unesc(t || "Document"), html: body });
    } else if (type === "assessment/x-bb-qti-test" || type === "assessment/x-bb-qti-pool") {
      const items: QItem[] = [];
      for (const it of dat.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
        const x = it[0];
        const kind = tag(x, "bbmd_questiontype");
        const prompt = plain(unesc(/<flow class="QUESTION_BLOCK">[\s\S]*?<mat_formattedtext[^>]*>([\s\S]*?)<\/mat_formattedtext>/.exec(x)?.[1] ?? ""));
        const labels = [...x.matchAll(/<response_label ident="([^"]+)"[^>]*>[\s\S]*?<mat_formattedtext[^>]*>([\s\S]*?)<\/mat_formattedtext>/g)].map((m) => ({ id: m[1], text: plain(unesc(m[2])) }));
        const correctIds = [...x.matchAll(/<varequal[^>]*>([^<]*)<\/varequal>/g)].map((m) => m[1]);
        const points = Number(/<qmd_absolutescore_max>([^<]*)</.exec(x)?.[1] ?? 1) || 1;
        if (/Multiple Choice|Either\/Or/i.test(kind)) items.push({ type: "multiple_choice", prompt, choices: labels.map((l) => l.text), correct: labels.map((l, i) => (correctIds.includes(l.id) ? i : -1)).filter((i) => i >= 0).slice(0, 1), points });
        else if (/Multiple Answer/i.test(kind)) items.push({ type: "multiple_answer", prompt, choices: labels.map((l) => l.text), correct: labels.map((l, i) => (correctIds.includes(l.id) ? i : -1)).filter((i) => i >= 0), points });
        else if (/True\/False/i.test(kind)) items.push({ type: "true_false", prompt, choices: ["True", "False"], correct: [/true/i.test(correctIds[0] ?? "") ? 0 : 1], points });
        else if (/Essay|Short Response/i.test(kind)) items.push({ type: "essay", prompt, choices: [], correct: [], points });
        else if (/Fill in the Blank/i.test(kind)) items.push({ type: "fill_blank", prompt, choices: [], correct: [], answer: correctIds[0] ?? "", points });
        else notes.push(`${rTitle || "Test"}: Blackboard question type "${kind || "unknown"}" isn't supported — "${prompt.slice(0, 60)}"`);
      }
      quizzes.push({ title: unesc(/<assessment[^>]*title="([^"]*)"/.exec(dat)?.[1] ?? rTitle) || "Imported test", items });
    } else if (type && !/x-bb-(coursesetting|announcement|discussionboard|gradebook|conference|coursenavigation|link|lineitem|rubric|user|membership|group|staffinfo|wiki|blog|journal|toolsettings|crs)/.test(type)) notes.push(`${rTitle || href}: Blackboard resource "${type}" isn't converted.`);
  }
  return { platform: "blackboard", title, pages, quizzes, notes };
}

/* ---------------- D2L ---------------- */

function d2l(entries: { name: string; data: Buffer }[]): Converted {
  const manifest = entries.find((e) => e.name === "imsmanifest.xml")!.data.toString("utf8");
  const pages: Page[] = [];
  const quizzes: Quiz[] = [];
  const notes: string[] = [];
  for (const r of manifest.matchAll(/<resource\b([^>]*)>/g)) {
    const attrs = r[1];
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const href = /href="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const rTitle = unesc(/d2l_2p0:title="([^"]*)"|title="([^"]*)"/.exec(attrs)?.slice(1).find(Boolean) ?? "");
    const f = entries.find((e) => e.name === href)?.data.toString("utf8");
    if (!f) continue;
    if (/\.html?$/i.test(href)) pages.push({ title: rTitle || tag(f, "title") || href, html: /<body[^>]*>([\s\S]*)<\/body>/i.exec(f)?.[1] ?? f });
    else if (/quiz|qti/i.test(`${type} ${attrs} ${href}`)) {
      const items: QItem[] = [];
      for (const it of f.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
        const x = it[0];
        const qtype = (/<fieldlabel>qmd_questiontype<\/fieldlabel>\s*<fieldentry>([^<]*)</.exec(x)?.[1] ?? "").toLowerCase();
        const prompt = plain(unesc(/<mattext[^>]*>([\s\S]*?)<\/mattext>/.exec(x)?.[1] ?? ""));
        const labels = [...x.matchAll(/<response_label ident="([^"]+)"[^>]*>[\s\S]*?<mattext[^>]*>([\s\S]*?)<\/mattext>/g)].map((m) => ({ id: m[1], text: plain(unesc(m[2])) }));
        const correct = [...x.matchAll(/<varequal[^>]*>([^<]*)<\/varequal>[\s\S]{0,200}?<setvar[^>]*>\s*([1-9][\d.]*)/g)].map((m) => m[1]);
        const pts = Number(/<fieldlabel>qmd_weighting<\/fieldlabel>\s*<fieldentry>([^<]*)</.exec(x)?.[1] ?? 1) || 1;
        if (qtype.includes("multiple choice") || qtype === "mc") items.push({ type: "multiple_choice", prompt, choices: labels.map((l) => l.text), correct: labels.map((l, i) => (correct.includes(l.id) ? i : -1)).filter((i) => i >= 0).slice(0, 1), points: pts });
        else if (qtype.includes("true") || qtype === "tf") items.push({ type: "true_false", prompt, choices: labels.length === 2 ? labels.map((l) => l.text) : ["True", "False"], correct: [Math.max(0, labels.findIndex((l) => correct.includes(l.id)))], points: pts });
        else if (qtype.includes("multi-select") || qtype === "m-s") items.push({ type: "multiple_answer", prompt, choices: labels.map((l) => l.text), correct: labels.map((l, i) => (correct.includes(l.id) ? i : -1)).filter((i) => i >= 0), points: pts });
        else if (qtype.includes("long answer") || qtype.includes("written")) items.push({ type: "essay", prompt, choices: [], correct: [], points: pts });
        else notes.push(`${rTitle || "Quiz"}: D2L question type "${qtype || "unknown"}" isn't supported — "${prompt.slice(0, 60)}"`);
      }
      quizzes.push({ title: rTitle || "Imported quiz", items });
    } else if (type) notes.push(`${rTitle || href}: D2L resource "${type}" isn't converted.`);
  }
  return { platform: "d2l", title: tag(manifest, "title") || "Imported D2L course", pages, quizzes, notes };
}

/* ---------------- IMS package writer ---------------- */

const QTI: Record<QItem["type"], string> = { multiple_choice: "multiple_choice_question", true_false: "true_false_question", essay: "essay_question", numeric: "numerical_question", multiple_answer: "multiple_answers_question", fill_blank: "short_answer_question" };

function qtiXml(q: Quiz) {
  const items = q.items
    .map((it, n) => {
      const choices = it.choices.map((c, i) => `<response_label ident="c${i}"><material><mattext texttype="text/plain">${esc(c)}</mattext></material></response_label>`).join("");
      const correct = it.choices.length ? (it.correct[0] !== undefined ? `c${it.correct[0]}` : null) : (it.answer ?? null);
      return `<item ident="q${n + 1}" title="${esc(it.prompt.slice(0, 60))}"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${QTI[it.type]}</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${it.points}</fieldentry></qtimetadatafield></qtimetadata></itemmetadata><presentation><material><mattext texttype="text/plain">${esc(it.prompt || "(no prompt)")}</mattext></material>${choices ? `<response_lid ident="response1"><render_choice>${choices}</render_choice></response_lid>` : ""}</presentation>${correct !== null ? `<resprocessing><respcondition><conditionvar><varequal respident="response1">${esc(correct)}</varequal></conditionvar><setvar action="Set">100</setvar></respcondition></resprocessing>` : ""}</item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="a1" title="${esc(q.title)}"><section ident="root_section">${items}</section></assessment></questestinterop>`;
}

export function toImsPackage(c: Converted, quarantine: { name: string; data: Buffer }[] = []): Buffer {
  const files: { name: string; data: Buffer }[] = [];
  const res: string[] = [];
  c.pages.forEach((p, i) => {
    const name = `pages/page_${i + 1}.html`;
    files.push({ name, data: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)}</title></head><body>${p.html}</body></html>`) });
    res.push(`<resource identifier="pg${i + 1}" type="webcontent" href="${name}"><file href="${name}"/></resource>`);
  });
  c.quizzes.forEach((q, i) => {
    const name = `quizzes/quiz_${i + 1}.qti.xml`;
    files.push({ name, data: Buffer.from(qtiXml(q)) });
    res.push(`<resource identifier="qz${i + 1}" type="imsqti_xmlv1p2" href="${name}"><file href="${name}"/></resource>`);
  });
  // Executables found in the original are carried through so the importer quarantines and reports them.
  for (const q of quarantine) files.push({ name: `original/${q.name.replace(/[^\w./-]/g, "_")}`, data: q.data });
  files.unshift({ name: "imsmanifest.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><manifest identifier="converted" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"><metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata><organizations/><resources>${res.join("")}</resources></manifest>`) });
  return zip(files);
}

const BLOCKED = /\.(exe|bat|cmd|com|scr|js|vbs|ps1|sh|jar|msi|dll|php)$/i;

/** Detect, convert and import. Returns the importer's job with the converter's notes added to its issue report. */
export function importForeignPackage(store: TenantStore, a: Actor, courseId: string, pkg: Buffer, opts: { idempotencyKey?: string; platform?: Platform } = {}) {
  const entries = readArchive(pkg);
  const platform = opts.platform ?? detectPlatform(entries);
  if (platform === "ims") return { platform, converted: null, job: importPackage(store, a, courseId, pkg, { idempotencyKey: opts.idempotencyKey }) };
  const conv = platform === "moodle" ? moodle(entries) : platform === "blackboard" ? blackboard(entries) : d2l(entries);
  const ims = toImsPackage(conv, entries.filter((e) => BLOCKED.test(e.name)));
  const job = importPackage(store, a, courseId, ims, { idempotencyKey: opts.idempotencyKey });
  const notes = conv.notes.map((m) => ({ severity: "warning" as const, item: platform, message: m }));
  // A repeated idempotency key returns the earlier job unchanged.
  const merged = job.sourcePlatform ? job : store.tx(() => store.update("content_jobs", String(job.id), { issues: [...((job.issues as unknown[]) ?? []), ...notes], sourcePlatform: platform, sourceTitle: conv.title }));
  return { platform, converted: { title: conv.title, pages: conv.pages.length, quizzes: conv.quizzes.length, questions: conv.quizzes.reduce((n, q) => n + q.items.length, 0), notes: conv.notes.length }, job: merged };
}
