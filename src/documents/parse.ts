import type { Block, Doc } from "./model";

/* ---------------- HTML ---------------- */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–", hellip: "…", rarr: "→", larr: "←", copy: "©", reg: "®", trade: "™", times: "×", bull: "•", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", deg: "°", ge: "≥", le: "≤", check: "✓" };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const text = (html: string) =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

const oneLine = (html: string) => text(html).replace(/\s*\n\s*/g, " ").trim();

/** Convert an HTML page into a Doc: headings, paragraphs, lists, tables and code, in reading order. */
export function fromHtml(html: string, fallbackTitle = "Document"): Doc {
  let h = String(html);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1];
  h = h
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|head|button|select|textarea|nav)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(input|img|meta|link)\b[^>]*>/gi, (m) => {
      const alt = /\balt="([^"]*)"/i.exec(m)?.[1];
      return /^<img/i.test(m) && alt ? ` [Image: ${alt}] ` : "";
    });
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(h)?.[1];
  const body = main ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(h)?.[1] ?? h;
  const slots: Block[] = [];
  const put = (b: Block) => `\u0000${slots.push(b) - 1}\u0000`;
  let s = body;
  // Tables (innermost first so nested layout tables flatten).
  for (let guard = 0; guard < 200 && /<table\b/i.test(s); guard++) {
    const before = s;
    s = s.replace(/<table\b[^>]*>((?:(?!<table\b)[\s\S])*?)<\/table>/i, (_m, inner: string) => {
      const caption = /<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(inner)?.[1];
      const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({ th: c[1].toLowerCase() === "th", v: oneLine(c[2].replace(/\u0000(\d+)\u0000/g, (_x, i) => flat(slots[Number(i)]))) })));
      const nonEmpty = rows.filter((r) => r.length);
      if (!nonEmpty.length) return " ";
      const hasHead = /<thead\b/i.test(inner) || nonEmpty[0].every((c) => c.th);
      const head = hasHead ? nonEmpty[0].map((c) => c.v) : [];
      const body = (hasHead ? nonEmpty.slice(1) : nonEmpty).map((r) => r.map((c) => c.v));
      const width = Math.max(head.length, ...body.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill("")];
      return put({ t: "table", caption: caption ? oneLine(caption) : undefined, head: head.length ? pad(head) : Array.from({ length: width }, (_x, i) => `Column ${i + 1}`), rows: body.map(pad) });
    });
    if (s === before) break;
  }
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => put({ t: "code", text: decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/^\n+|\s+$/g, "") }));
  // Lists, innermost first; nested items are inlined with an indent marker.
  for (let guard = 0; guard < 500 && /<(ul|ol)\b/i.test(s); guard++) {
    const before = s;
    s = s.replace(/<(ul|ol)\b[^>]*>((?:(?!<(?:ul|ol)\b)[\s\S])*?)<\/\1>/i, (_m, tag: string, inner: string) => {
      const items: string[] = [];
      for (const li of inner.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<li\b|$)/gi)) {
        const raw = li[1].replace(/<\/li>\s*$/i, "");
        const nested: string[] = [];
        const own = raw.replace(/\u0000(\d+)\u0000/g, (_x, i) => {
          const b = slots[Number(i)];
          if (b?.t === "list") nested.push(...b.items.map((x) => `– ${x}`));
          else nested.push(flat(b));
          return " ";
        });
        const t = oneLine(own);
        if (t) items.push(t);
        items.push(...nested);
      }
      return items.length ? put({ t: "list", ordered: tag.toLowerCase() === "ol", items }) : " ";
    });
    if (s === before) break;
  }
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, inner: string) => {
    const t = oneLine(inner);
    return t ? put({ t: "h", level: Math.min(3, Number(n)) as 1 | 2 | 3, text: t }) : " ";
  });
  s = s.replace(/<hr\b[^>]*>/gi, () => put({ t: "hr" }));
  // Block boundaries become paragraph breaks.
  s = s.replace(/<\/?(p|div|section|article|header|footer|main|aside|blockquote|figure|figcaption|dl|dt|dd|li|form|fieldset|legend|details|summary|address)\b[^>]*>/gi, "\n\n");
  const blocks: Block[] = [];
  for (const part of s.split(/(\u0000\d+\u0000)/)) {
    const m = /^\u0000(\d+)\u0000$/.exec(part);
    if (m) {
      blocks.push(slots[Number(m[1])]);
      continue;
    }
    for (const para of part.split(/\n\s*\n/)) {
      const t = text(para).replace(/\n+/g, " ").trim();
      if (t) blocks.push({ t: "p", text: t });
    }
  }
  const firstH1 = blocks.find((b) => b.t === "h" && b.level === 1) as { text: string } | undefined;
  const title = firstH1?.text || (titleTag ? oneLine(titleTag).replace(/\s*·\s*Scholarion Campus$/, "") : "") || fallbackTitle;
  return { title, blocks: dedupe(blocks) };
}

function flat(b: Block | undefined): string {
  if (!b) return "";
  if (b.t === "list") return b.items.join("; ");
  if (b.t === "table") return [b.head.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("; ");
  if (b.t === "hr") return "";
  return b.text;
}

function dedupe(blocks: Block[]) {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.t === "p" && prev && prev.t === "p" && prev.text === b.text) continue;
    if (b.t === "hr" && prev?.t === "hr") continue;
    out.push(b);
  }
  return out;
}

/* ---------------- Markdown ---------------- */

const mdInline = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[Image: $1]")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, u: string) => (t === u ? u : `${t} (${u})`))
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(\S.*?\S|\S)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

export function fromMarkdown(md: string, fallbackTitle = "Document"): Doc {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: mdInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ t: "code", text: code.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      flush();
      blocks.push({ t: "h", level: Math.min(3, h[1].length) as 1 | 2 | 3, text: mdInline(h[2]) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) {
        if (/^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(lines[i])) continue;
        rows.push(lines[i].trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => mdInline(c.replace(/\\\|/g, "|"))));
      }
      i--;
      if (rows.length) blocks.push({ t: "table", head: rows[0], rows: rows.slice(1) });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      flush();
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        if (m[1].length < 2 && /\d/.test(m[2]) !== ordered) break;
        items.push(`${m[1].length >= 2 ? "– " : ""}${mdInline(m[3])}`);
      }
      i--;
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      flush();
      blocks.push({ t: "hr" });
      continue;
    }
    if (/^\s*>\s?/.test(l)) {
      para.push(l.replace(/^\s*>\s?/, ""));
      continue;
    }
    if (!l.trim()) flush();
    else para.push(l.trim());
  }
  flush();
  const first = blocks.find((b) => b.t === "h") as { text: string } | undefined;
  return { title: first?.text || fallbackTitle, blocks };
}

/* ---------------- CSV / text / JSON / calendar ---------------- */

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = String(csv).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function fromCsv(csv: string, title = "Table"): Doc {
  const rows = parseCsv(csv);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  return { title, blocks: rows.length ? [{ t: "table", caption: title, head: pad(rows[0]), rows: rows.slice(1).map(pad) }] : [{ t: "p", text: "No rows." }] };
}

export function fromText(txt: string, title = "Document"): Doc {
  return { title, blocks: String(txt).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => ({ t: "p", text: p.replace(/\s*\n\s*/g, " ") }) as Block) };
}

const cellOf = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function fromJson(value: unknown, title = "Data"): Doc {
  const blocks: Block[] = [];
  const tableOf = (arr: Record<string, unknown>[], caption?: string) => {
    const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
    blocks.push({ t: "table", caption, head: keys, rows: arr.map((o) => keys.map((k) => cellOf(o[k]))) });
  };
  const isRows = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (isRows(value)) tableOf(value, title);
  else if (value && typeof value === "object" && !Array.isArray(value)) {
    const scalars: string[][] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isRows(v)) {
        blocks.push({ t: "h", level: 2, text: k });
        tableOf(v, k);
      } else if (Array.isArray(v) && v.every((x) => typeof x !== "object")) {
        blocks.push({ t: "h", level: 2, text: k });
        blocks.push({ t: "list", items: v.map(cellOf) });
      } else scalars.push([k, cellOf(v)]);
    }
    if (scalars.length) blocks.unshift({ t: "table", caption: "Summary", head: ["Field", "Value"], rows: scalars });
  } else blocks.push({ t: "code", text: JSON.stringify(value, null, 2) });
  return { title, blocks };
}

export function fromIcs(ics: string, title = "Calendar"): Doc {
  const unfold = String(ics).replace(/\r?\n[ \t]/g, "");
  const events = [...unfold.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map((m) => {
    const get = (k: string) => new RegExp(`^${k}[^:]*:(.*)$`, "m").exec(m[1])?.[1]?.trim() ?? "";
    const dt = (v: string) => (/^\d{8}T\d{6}Z$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(9, 11)}:${v.slice(11, 13)} UTC` : v);
    return [get("SUMMARY").replace(/\\([,;\\])/g, "$1"), dt(get("DTSTART")), dt(get("DTEND")), get("LOCATION"), get("DESCRIPTION").replace(/\\n/g, " ").replace(/\\([,;\\])/g, "$1")];
  });
  return { title, blocks: [{ t: "table", caption: `${events.length} events`, head: ["Event", "Starts", "Ends", "Location", "Description"], rows: events }] };
}

/** Pick a parser from a file name. Returns null for files that aren't documents (images, archives, notebooks…). */
export function docFromFile(name: string, content: string | Buffer, title?: string): Doc | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  const base = title ?? name.split("/").pop()!.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const s = Buffer.isBuffer(content) ? content.toString("utf8") : content;
  switch (ext) {
    case "html":
    case "htm":
      return fromHtml(s, base);
    case "md":
    case "markdown":
      return fromMarkdown(s, base);
    case "csv":
      return fromCsv(s, base);
    case "txt":
    case "srt":
    case "vtt":
      return fromText(s, base);
    case "ics":
      return fromIcs(s, base);
    case "json":
      try {
        return fromJson(JSON.parse(s), base);
      } catch {
        return null;
      }
    default:
      return null;
  }
}
