import { FORMATS, FORMAT_LABEL, isFormat, MIME, slugFile, type Doc, type Format } from "./model";
import { docFromFile } from "./parse";
import { toPdf } from "./pdf";
import { toDocx } from "./docx";
import { toXlsx } from "./xlsx";

export * from "./model";
export { docFromFile, fromCsv, fromHtml, fromIcs, fromJson, fromMarkdown, fromText, parseCsv } from "./parse";
export { zipDeflate, unzip } from "./zip";
export { toPdf, toDocx, toXlsx };

export async function render(doc: Doc, format: Format): Promise<Uint8Array> {
  if (format === "pdf") return toPdf(doc);
  if (format === "docx") return new Uint8Array(await toDocx(doc));
  return new Uint8Array(await toXlsx(doc));
}

/** A download response for a Doc in the requested format. */
export async function docResponse(doc: Doc, format: Format, baseName: string, inline = false): Promise<Response> {
  const bytes = await render(doc, format);
  const name = `${slugFile(baseName)}.${format}`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "content-type": MIME[format], "content-disposition": `${inline && format === "pdf" ? "inline" : "attachment"}; filename="${name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/** Requested office format from a URL (?format=pdf|docx|xlsx), or null. Also accepts word/excel. */
export function requestedFormat(url: URL | string): Format | null {
  const v = (typeof url === "string" ? new URL(url, "http://x") : url).searchParams.get("format")?.toLowerCase();
  const alias = v === "word" || v === "doc" ? "docx" : v === "excel" || v === "xls" ? "xlsx" : v;
  return isFormat(alias) ? alias : null;
}

/** Files inside bundles that we convert (documents only — not images, notebooks, archives or code). */
export const CONVERTIBLE = /\.(html?|md|csv|txt|ics)$/i;
const SKIP = /(^|\/)(manifest\.json|_formats\.json)$|\.(srt|vtt)$/i;

/**
 * For a bundle: add PDF, Word and Excel copies next to every document, so each one can be opened in
 * the format the reader needs. Returns the new entries plus an index of what was generated.
 */
export async function withOfficeCopies(entries: { name: string; data: Buffer }[], opts: { formats?: readonly Format[]; maxDocs?: number } = {}) {
  const formats = opts.formats ?? FORMATS;
  const out = [...entries];
  const generated: { source: string; copies: string[] }[] = [];
  const skipped: { source: string; reason: string }[] = [];
  const names = new Set(entries.map((e) => e.name));
  let n = 0;
  for (const e of entries) {
    if (!CONVERTIBLE.test(e.name) || SKIP.test(e.name) || !e.data.length) continue;
    if (n >= (opts.maxDocs ?? 400)) {
      skipped.push({ source: e.name, reason: "bundle conversion limit reached" });
      continue;
    }
    const doc = docFromFile(e.name, e.data);
    if (!doc || !doc.blocks.length) continue;
    n++;
    const base = e.name.replace(/\.[^.\/]+$/, "");
    const copies: string[] = [];
    for (const f of formats) {
      let target = `${base}.${f}`;
      if (names.has(target)) target = `${base}.${e.name.split(".").pop()}.${f}`;
      if (names.has(target)) continue;
      try {
        out.push({ name: target, data: Buffer.from(await render({ ...doc, footer: `${doc.title} · ${e.name.split("/").pop()}` }, f)) });
        names.add(target);
        copies.push(target);
      } catch (err) {
        skipped.push({ source: e.name, reason: `${FORMAT_LABEL[f]}: ${(err as Error).message}` });
      }
    }
    generated.push({ source: e.name, copies });
  }
  const root = entries[0]?.name.includes("/") ? `${entries[0].name.split("/")[0]}/` : "";
  out.push({ name: `${root}_formats.json`, data: Buffer.from(JSON.stringify({ note: "Every document in this package is also provided as PDF, Word (.docx) and Excel (.xlsx). Tables become Excel sheets; text is kept in reading order.", generated, skipped }, null, 2)) });
  return { entries: out, generated, skipped };
}
