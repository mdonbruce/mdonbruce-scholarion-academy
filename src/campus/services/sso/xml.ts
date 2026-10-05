/**
 * A small, strict XML parser for SAML messages.
 *
 * Security posture:
 *  - DOCTYPE, ENTITY declarations and processing instructions (other than the XML declaration)
 *    are rejected outright — no external entities, no entity expansion (XXE / billion laughs).
 *  - Only the five predefined entities and numeric character references are recognised.
 *  - Input size and nesting depth are bounded.
 *  - Line endings are normalised and attribute values normalised as the XML spec requires,
 *    so canonicalization sees exactly what a conforming parser would.
 * Comments and CDATA are kept as nodes so callers can reason about them (text extraction joins
 * every text node, which defeats comment-splitting attacks on NameID values).
 */

export type XText = { kind: "text"; value: string; parent: XElement | null };
export type XComment = { kind: "comment"; value: string; parent: XElement | null };
export type XAttr = { name: string; prefix: string | null; local: string; value: string; ns: string | null };
export interface XElement {
  kind: "element";
  name: string;
  prefix: string | null;
  local: string;
  ns: string | null;
  /** Namespace declarations made on this element (prefix "" = default namespace). */
  nsDecls: Map<string, string>;
  attrs: XAttr[];
  children: XNode[];
  parent: XElement | null;
}
export type XNode = XElement | XText | XComment;

export class XmlError extends Error {}

const MAX_BYTES = 1_000_000;
const MAX_DEPTH = 64;
const NAME = /^[A-Za-z_][A-Za-z0-9._-]*(:[A-Za-z_][A-Za-z0-9._-]*)?$/;
const XML_NS = "http://www.w3.org/XML/1998/namespace";

function decodeRefs(s: string, where: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);|&/g, (m, ref: string | undefined) => {
    if (!ref) throw new XmlError(`Bare '&' in ${where}`);
    if (ref[0] === "#") {
      const cp = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!(cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff))) throw new XmlError("Invalid character reference");
      return String.fromCodePoint(cp);
    }
    const map: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (!(ref in map)) throw new XmlError(`Undeclared entity &${ref}; (entities are not supported)`);
    return map[ref];
  });
}

export function parseXml(input: string): XElement {
  if (input.length > MAX_BYTES) throw new XmlError("XML too large");
  let src = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(src)) throw new XmlError("DOCTYPE and entity declarations are not allowed");
  const decl = /^<\?xml\s[^?]*\?>/.exec(src);
  if (decl) src = src.slice(decl[0].length);
  if (/<\?/.test(src)) throw new XmlError("Processing instructions are not allowed");

  let i = 0;
  let root: XElement | null = null;
  const stack: XElement[] = [];
  const pushChild = (n: XNode) => {
    const top = stack[stack.length - 1];
    if (top) {
      n.parent = top;
      top.children.push(n);
    } else if (n.kind === "element") {
      if (root) throw new XmlError("More than one root element");
      root = n;
    } else if (n.kind === "text" && n.value.trim()) throw new XmlError("Text outside the root element");
  };

  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end < 0) throw new XmlError("Unterminated comment");
      const value = src.slice(i + 4, end);
      if (value.includes("--")) throw new XmlError("'--' inside a comment");
      pushChild({ kind: "comment", value, parent: null });
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end < 0) throw new XmlError("Unterminated CDATA");
      if (!stack.length) throw new XmlError("CDATA outside the root element");
      pushChild({ kind: "text", value: src.slice(i + 9, end), parent: null });
      i = end + 3;
    } else if (src.startsWith("</", i)) {
      const end = src.indexOf(">", i);
      if (end < 0) throw new XmlError("Unterminated end tag");
      const name = src.slice(i + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new XmlError(`Mismatched end tag </${name}>`);
      i = end + 1;
    } else if (src[i] === "<") {
      // Start tag.
      let j = i + 1;
      const nm = /^[^\s/>]+/.exec(src.slice(j));
      if (!nm || !NAME.test(nm[0])) throw new XmlError("Invalid element name");
      const name = nm[0];
      j += name.length;
      const raw: { name: string; value: string }[] = [];
      for (;;) {
        const ws = /^\s*/.exec(src.slice(j))![0];
        j += ws.length;
        if (src[j] === ">" || src.startsWith("/>", j)) break;
        if (!ws) throw new XmlError("Expected whitespace between attributes");
        const am = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(j));
        if (!am || !NAME.test(am[1])) throw new XmlError(`Invalid attribute in <${name}>`);
        const rawVal = am[3] ?? am[4] ?? "";
        if (rawVal.includes("<")) throw new XmlError("'<' in attribute value");
        // Attribute-value normalisation: literal whitespace characters become spaces; references keep their character.
        const norm = decodeRefs(rawVal.replace(/[\t\n\r]/g, " "), `attribute ${am[1]}`);
        if (raw.some((a) => a.name === am[1])) throw new XmlError(`Duplicate attribute ${am[1]}`);
        raw.push({ name: am[1], value: norm });
        j += am[0].length;
      }
      const selfClose = src.startsWith("/>", j);
      j += selfClose ? 2 : 1;
      const nsDecls = new Map<string, string>();
      for (const a of raw) {
        if (a.name === "xmlns") nsDecls.set("", a.value);
        else if (a.name.startsWith("xmlns:")) {
          const p = a.name.slice(6);
          if (!a.value) throw new XmlError("Empty namespace for a prefix");
          nsDecls.set(p, a.value);
        }
      }
      const parent = stack[stack.length - 1] ?? null;
      const lookup = (p: string): string | null => {
        if (p === "xml") return XML_NS;
        if (nsDecls.has(p)) return nsDecls.get(p) || null;
        for (let e: XElement | null = parent; e; e = e.parent) if (e.nsDecls.has(p)) return e.nsDecls.get(p) || null;
        return null;
      };
      const [prefix, local] = name.includes(":") ? [name.split(":")[0], name.split(":")[1]] : [null, name];
      const ns = lookup(prefix ?? "");
      if (prefix && !ns) throw new XmlError(`Unbound prefix ${prefix}`);
      const attrs: XAttr[] = raw
        .filter((a) => a.name !== "xmlns" && !a.name.startsWith("xmlns:"))
        .map((a) => {
          const [ap, al] = a.name.includes(":") ? [a.name.split(":")[0], a.name.split(":")[1]] : [null, a.name];
          const ans = ap ? lookup(ap) : null;
          if (ap && !ans) throw new XmlError(`Unbound attribute prefix ${ap}`);
          return { name: a.name, prefix: ap, local: al, value: a.value, ns: ans };
        });
      const seen = new Set(attrs.map((a) => `${a.ns ?? ""}|${a.local}`));
      if (seen.size !== attrs.length) throw new XmlError("Duplicate namespaced attribute");
      const el: XElement = { kind: "element", name, prefix, local, ns, nsDecls, attrs, children: [], parent: null };
      if (stack.length >= MAX_DEPTH) throw new XmlError("XML nested too deeply");
      pushChild(el);
      if (!selfClose) stack.push(el);
      i = j;
    } else {
      const end = src.indexOf("<", i);
      const raw = src.slice(i, end < 0 ? src.length : end);
      if (raw.includes("]]>")) throw new XmlError("']]>' in text");
      pushChild({ kind: "text", value: decodeRefs(raw, "text"), parent: null });
      i = end < 0 ? src.length : end;
    }
  }
  if (stack.length) throw new XmlError(`Unclosed element <${stack[stack.length - 1].name}>`);
  if (!root) throw new XmlError("No root element");
  return root;
}

/* ---------------- helpers ---------------- */

export const childElements = (e: XElement) => e.children.filter((c): c is XElement => c.kind === "element");
export const children = (e: XElement, ns: string, local: string) => childElements(e).filter((c) => c.ns === ns && c.local === local);
export const child = (e: XElement, ns: string, local: string) => children(e, ns, local)[0] ?? null;
export function descendants(e: XElement, ns: string, local: string): XElement[] {
  const out: XElement[] = [];
  const walk = (x: XElement) => {
    for (const c of childElements(x)) {
      if (c.ns === ns && c.local === local) out.push(c);
      walk(c);
    }
  };
  walk(e);
  return out;
}
export const attr = (e: XElement, local: string, ns: string | null = null) => e.attrs.find((a) => a.local === local && a.ns === ns)?.value ?? null;
/** All text inside the element, comments ignored (every text node is joined). */
export function textOf(e: XElement): string {
  let s = "";
  for (const c of e.children) {
    if (c.kind === "text") s += c.value;
    else if (c.kind === "element") s += textOf(c);
  }
  return s;
}
/** In-scope namespace bindings at an element (nearest declaration wins). */
export function inScope(e: XElement): Map<string, string> {
  const chain: XElement[] = [];
  for (let x: XElement | null = e; x; x = x.parent) chain.unshift(x);
  const m = new Map<string, string>();
  for (const x of chain) for (const [p, u] of x.nsDecls) m.set(p, u);
  return m;
}
