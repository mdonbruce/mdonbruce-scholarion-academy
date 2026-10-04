import type { Block, Doc } from "./model";
import { decodeEntities } from "./parse";
import { unzip } from "./zip";

/** Read Office files and notebooks into the document model (for inline previews). Text only — no macros or scripts run. */

const part = (files: { name: string; data: Buffer }[], name: string) => files.find((f) => f.name === name)?.data.toString("utf8") ?? "";
const txt = (xml: string) => decodeEntities(xml.replace(/<[^>]+>/g, ""));

export function docxToDoc(bytes: Buffer, title: string): Doc {
  const files = unzip(bytes);
  const xml = part(files, "word/document.xml");
  const blocks: Block[] = [];
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const re = /<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p[ >]([\s\S]*?)<\/w:p>/g;
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push({ t: "list", items: list });
    list = [];
  };
  for (const m of body.matchAll(re)) {
    if (m[1] !== undefined) {
      flush();
      const rows = [...m[1].matchAll(/<w:tr[ >]([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => [...c[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => decodeEntities(t[1])).join("")));
      if (rows.length) blocks.push({ t: "table", head: rows[0], rows: rows.slice(1) });
      continue;
    }
    const p = m[2] ?? "";
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const text = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((t) => (t[1] !== undefined ? decodeEntities(t[1]) : " ")).join("").trim();
    if (!text) continue;
    if (/<w:numPr>/.test(p) || /List/i.test(style)) {
      list.push(text);
      continue;
    }
    flush();
    const h = /^(?:Heading|heading)\s?(\d)$/.exec(style) ?? (style === "Title" ? ["", "1"] : null);
    blocks.push(h ? { t: "h", level: Math.min(3, Number(h[1])) as 1 | 2 | 3, text } : { t: "p", text });
  }
  flush();
  const core = part(files, "docProps/core.xml");
  return { title: txt(/<dc:title>([\s\S]*?)<\/dc:title>/.exec(core)?.[1] ?? "") || title, blocks };
}

export function xlsxToDoc(bytes: Buffer, title: string): Doc {
  const files = unzip(bytes);
  const shared = [...part(files, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decodeEntities(t[1])).join(""));
  const wb = part(files, "xl/workbook.xml");
  const rels = part(files, "xl/_rels/workbook.xml.rels");
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: decodeEntities(m[1]), target: /Target="([^"]+)"/.exec(new RegExp(`<Relationship[^>]*Id="${m[2]}"[^>]*>`).exec(rels)?.[0] ?? "")?.[1] ?? "" }));
  const blocks: Block[] = [];
  const colIdx = (ref: string) => {
    const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
    return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  };
  for (const sh of sheets.slice(0, 10)) {
    const xml = part(files, `xl/${sh.target.replace(/^\/?xl\//, "")}`);
    const rows: string[][] = [];
    for (const r of [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 500)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1] ?? "A1";
        const t = /t="([^"]+)"/.exec(c[1])?.[1];
        const v = /<v>([^<]*)<\/v>/.exec(c[2] ?? "")?.[1];
        const inline = /<is>([\s\S]*?)<\/is>/.exec(c[2] ?? "")?.[1];
        row[colIdx(ref)] = t === "s" ? (shared[Number(v)] ?? "") : t === "inlineStr" ? txt(inline ?? "") : decodeEntities(v ?? "");
      }
      rows.push(Array.from({ length: row.length }, (_x, i) => row[i] ?? ""));
    }
    const w = Math.max(1, ...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(w - r.length).fill("")];
    blocks.push({ t: "h", level: 2, text: sh.name });
    if (rows.length) blocks.push({ t: "table", caption: sh.name, head: pad(rows[0]), rows: rows.slice(1).map(pad) });
    else blocks.push({ t: "p", text: "Empty sheet." });
  }
  return { title, blocks };
}

export function pptxToDoc(bytes: Buffer, title: string): Doc {
  const files = unzip(bytes);
  const slides = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a.name)![1]) - Number(/(\d+)\.xml$/.exec(b.name)![1]));
  const blocks: Block[] = [];
  slides.forEach((s, i) => {
    const paras = [...s.data.toString("utf8").matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => decodeEntities(t[1])).join("")).filter(Boolean);
    blocks.push({ t: "h", level: 2, text: `Slide ${i + 1}${paras[0] ? `: ${paras[0]}` : ""}` });
    if (paras.length > 1) blocks.push({ t: "list", items: paras.slice(1) });
  });
  return { title, blocks };
}

export function ipynbToDoc(text: string, title: string): Doc {
  const nb = JSON.parse(text) as { cells?: { cell_type: string; source: string[] | string; outputs?: { text?: string[] | string; data?: Record<string, string[] | string> }[] }[] };
  const blocks: Block[] = [];
  for (const c of nb.cells ?? []) {
    const src = Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "");
    if (c.cell_type === "markdown") {
      for (const line of src.split(/\n\n+/)) {
        const h = /^(#{1,3})\s+(.*)/.exec(line.trim());
        if (h) blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, text: h[2] });
        else if (line.trim()) blocks.push({ t: "p", text: line.trim().replace(/\s*\n\s*/g, " ") });
      }
    } else if (c.cell_type === "code") {
      blocks.push({ t: "code", text: src });
      for (const o of c.outputs ?? []) {
        const out = o.text ?? o.data?.["text/plain"];
        if (out) blocks.push({ t: "p", small: true, text: `Output: ${Array.isArray(out) ? out.join("") : out}`.slice(0, 2000) });
      }
    }
  }
  return { title, blocks };
}

/** Safe, self-contained HTML for a Doc (all text escaped). */
export function toHtml(doc: Doc): string {
  const e = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const body = doc.blocks
    .map((b) => {
      switch (b.t) {
        case "h":
          return `<h${b.level + 1}>${e(b.text)}</h${b.level + 1}>`;
        case "p":
          return `<p${b.small ? ' class="small"' : ""}>${e(b.text)}</p>`;
        case "list":
          return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${e(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
        case "table":
          return `<div class="tw" role="region" tabindex="0" aria-label="${e(b.caption ?? "Table")}"><table>${b.caption ? `<caption>${e(b.caption)}</caption>` : ""}<thead><tr>${b.head.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
        case "code":
          return `<pre><code>${e(b.text)}</code></pre>`;
        default:
          return "<hr>";
      }
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(doc.title)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#10192f;background:#fff}h1{font-size:1.5rem}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #c7ccda;padding:4px 8px;text-align:left;vertical-align:top}th{background:#eaf0fa}pre{background:#f4f6fb;padding:12px;overflow:auto}.small{color:#4a5672;font-size:.85rem}.tw{overflow:auto}.note{background:#fff7e0;border-left:3px solid #f2c66d;padding:8px 12px}@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e6eaf3}th{background:#1b2a4a}pre{background:#121a2c}}</style></head><body><p class="note">Preview — text and tables only. Download the original for full formatting.</p><h1>${e(doc.title)}</h1>\n${body}</body></html>`;
}
