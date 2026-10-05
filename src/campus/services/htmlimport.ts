import type { Block } from "./curriculum";

/**
 * HTML editing view (parity §8). Teachers can paste or edit HTML; it is converted to validated
 * page blocks through an allow-list, so what is stored and rendered is always the platform's own
 * escaped markup. Scripts, styles, event handlers, forms and unknown elements are dropped and
 * reported. Nothing from the input is ever echoed back as raw HTML.
 */

const DROP_WITH_CONTENT = new Set(["script", "style", "noscript", "template", "object", "embed", "applet", "form", "select", "textarea", "button", "svg", "math", "head", "title", "meta", "link", "base"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const VOID = new Set(["img", "br", "hr", "input", "source", "meta", "link", "wbr", "area", "col"]);
type Tok = { t: "open" | "close" | "self"; name: string; attrs: Record<string, string> } | { t: "text"; text: string };

function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const s = m[0];
    if (s.startsWith("<!")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const attrs: Record<string, string> = {};
      for (const a of (m[2] ?? "").matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
      const isClose = s.startsWith("</");
      out.push({ t: isClose ? "close" : m[3] || VOID.has(name) ? "self" : "open", name, attrs });
    } else out.push({ t: "text", text: s === "<" ? "<" : decodeEntities(s) });
  }
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const safeUrl = (u: string) => (/^(https:\/\/|\/(?!\/))/i.test(u.trim()) ? u.trim() : null);

export function htmlToBlocks(html: string): { blocks: Block[]; removed: string[] } {
  const toks = tokenize(String(html ?? "").slice(0, 200_000));
  const blocks: Block[] = [];
  const removed = new Set<string>();
  let i = 0;
  // Collect text (and note links) until the matching close tag of `name`.
  const collect = (name: string): { text: string; links: { href: string; text: string }[] } => {
    let text = "";
    const links: { href: string; text: string }[] = [];
    let depth = 1;
    let href: string | null = null;
    let linkText = "";
    while (i < toks.length && depth > 0) {
      const k = toks[i++];
      if (k.t === "text") {
        text += k.text;
        if (href !== null) linkText += k.text;
      } else if (k.t === "open" && DROP_WITH_CONTENT.has(k.name)) {
        removed.add(k.name);
        skip(k.name);
      } else if (k.name === name) depth += k.t === "open" ? 1 : k.t === "close" ? -1 : 0;
      else if (k.name === "br") text += " ";
      else if (k.name === "a" && k.t === "open") {
        href = safeUrl(k.attrs.href ?? "");
        if (k.attrs.href && !href) removed.add("unsafe link");
        linkText = "";
      } else if (k.name === "a" && k.t === "close") {
        if (href) links.push({ href, text: clean(linkText) });
        href = null;
      }
      if (k.t !== "text") for (const a of Object.keys(k.attrs)) if (a.startsWith("on")) removed.add("event handler");
    }
    return { text: clean(text), links };
  };
  const skip = (name: string) => {
    let depth = 1;
    while (i < toks.length && depth > 0) {
      const k = toks[i++];
      if (k.t !== "text" && k.name === name) depth += k.t === "open" ? 1 : k.t === "close" ? -1 : 0;
    }
  };
  while (i < toks.length) {
    const k = toks[i++];
    if (k.t === "text") {
      const tx = clean(k.text);
      if (tx) blocks.push({ type: "paragraph", text: tx });
      continue;
    }
    if (k.t === "close") continue;
    const n = k.name;
    if (DROP_WITH_CONTENT.has(n)) {
      removed.add(n);
      if (k.t === "open") skip(n);
      continue;
    }
    for (const a of Object.keys(k.attrs)) if (a.startsWith("on")) removed.add("event handler");
    if (/^h[1-6]$/.test(n)) {
      const { text } = collect(n);
      if (text) blocks.push({ type: "heading", level: Math.min(4, Math.max(2, Number(n[1]) + (n === "h1" ? 1 : 0))) as 2 | 3 | 4, text });
    } else if (n === "p" || n === "div" || n === "section" || n === "article") {
      const { text, links } = collect(n);
      if (links.length === 1 && clean(text) === links[0].text) blocks.push({ type: "link", href: links[0].href, text: links[0].text });
      else if (text) blocks.push({ type: "paragraph", text });
    } else if (n === "ul" || n === "ol") {
      const items: string[] = [];
      let depth = 1;
      while (i < toks.length && depth > 0) {
        const t = toks[i++];
        if (t.t !== "text" && t.name === n) depth += t.t === "open" ? 1 : -1;
        else if (t.t === "open" && t.name === "li") {
          const { text } = collect("li");
          if (text) items.push(text);
        }
      }
      if (items.length) blocks.push({ type: "list", ordered: n === "ol", items });
    } else if (n === "img") {
      const src = safeUrl(k.attrs.src ?? "");
      if (src) blocks.push({ type: "image", src, alt: clean(k.attrs.alt ?? ""), decorative: k.attrs.alt === "" });
      else removed.add("image with unsafe source");
    } else if (n === "pre") {
      let text = "";
      let depth = 1;
      let lang: string | undefined;
      while (i < toks.length && depth > 0) {
        const t = toks[i++];
        if (t.t === "text") text += t.text;
        else if (t.name === "pre") depth += t.t === "open" ? 1 : -1;
        else if (t.name === "code" && t.t === "open") lang = /language-([\w+-]+)/.exec(t.attrs.class ?? "")?.[1];
      }
      if (text.trim()) blocks.push({ type: "code", text: text.replace(/^\n|\n$/g, ""), ...(lang ? { lang } : {}) });
    } else if (n === "blockquote" || n === "aside") {
      const { text } = collect(n);
      if (text) blocks.push({ type: "callout", tone: "info", text });
    } else if (n === "table") {
      const rows: string[][] = [];
      let header = false;
      let caption: string | undefined;
      let depth = 1;
      let row: string[] | null = null;
      while (i < toks.length && depth > 0) {
        const t = toks[i++];
        if (t.t === "text") continue;
        if (t.name === "table") depth += t.t === "open" ? 1 : -1;
        else if (t.name === "caption" && t.t === "open") caption = collect("caption").text;
        else if (t.name === "tr" && t.t === "open") row = [];
        else if (t.name === "tr" && t.t === "close" && row) {
          if (row.length) rows.push(row);
          row = null;
        } else if ((t.name === "td" || t.name === "th") && t.t === "open") {
          if (t.name === "th" && rows.length === 0) header = true;
          (row ??= []).push(collect(t.name).text);
        }
      }
      if (rows.length) blocks.push({ type: "table", header, rows, ...(caption ? { caption } : {}) });
    } else if (n === "iframe") {
      const src = safeUrl(k.attrs.src ?? "");
      if (src) blocks.push({ type: "embed", src, title: clean(k.attrs.title ?? "Embedded content") || "Embedded content" });
      else removed.add("iframe with unsafe source");
      // consume to </iframe>
      let j = i;
      while (j < toks.length && !(toks[j].t === "close" && (toks[j] as { name: string }).name === "iframe")) j++;
      if (j < toks.length) i = j + 1;
    } else if (["span", "strong", "em", "b", "i", "u", "a", "code", "small", "sup", "sub", "mark"].includes(n)) {
      // Inline at top level: gather as a paragraph.
      i--;
      let text = "";
      while (i < toks.length) {
        const t = toks[i];
        if (t.t === "text") text += t.text;
        else if (!["span", "strong", "em", "b", "i", "u", "a", "code", "small", "sup", "sub", "mark", "br"].includes(t.name)) break;
        else if (t.name === "a" && t.t === "open" && t.attrs.href && !safeUrl(t.attrs.href)) removed.add("unsafe link");
        i++;
      }
      if (clean(text)) blocks.push({ type: "paragraph", text: clean(text) });
    } else if (!["br", "hr", "body", "html", "main", "header", "footer", "nav", "figure", "figcaption", "tbody", "thead"].includes(n)) removed.add(n);
  }
  return { blocks: blocks.slice(0, 500), removed: [...removed] };
}

/** Convert HTML and keep only blocks that pass page validation (unapproved embeds, relative images, etc. are reported). */
export function htmlToValidBlocks(html: string, validate: (b: Block[]) => Block[]) {
  const r = htmlToBlocks(html);
  const kept: Block[] = [];
  const removed = [...r.removed];
  for (const b of r.blocks) {
    try {
      kept.push(...validate([b]));
    } catch (e) {
      removed.push(`${b.type}: ${(e as Error).message.replace(/^Block 1: /, "")}`);
    }
  }
  return { blocks: kept, removed };
}
