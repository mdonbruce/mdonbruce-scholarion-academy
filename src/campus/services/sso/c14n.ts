import { inScope, type XElement } from "./xml";

/**
 * Exclusive XML Canonicalization 1.0, without comments
 * (http://www.w3.org/2001/10/xml-exc-c14n#), over the subtree rooted at an element, optionally
 * excluding one descendant (the enveloped Signature). Cross-checked against lxml's
 * implementation by the test fixtures in tests/fixtures/saml.
 */

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

export function excC14n(el: XElement, opts: { exclude?: XElement | null; inclusivePrefixes?: string[] } = {}): string {
  const inclusive = new Set((opts.inclusivePrefixes ?? []).map((p) => (p === "#default" ? "" : p)));
  const out: string[] = [];
  const render = (e: XElement, rendered: Map<string, string>) => {
    const scope = inScope(e);
    const used = new Set<string>([e.prefix ?? ""]);
    for (const a of e.attrs) if (a.prefix && a.prefix !== "xml") used.add(a.prefix);
    for (const p of inclusive) if (scope.has(p)) used.add(p);
    const decls: [string, string][] = [];
    const next = new Map(rendered);
    for (const p of used) {
      const uri = scope.get(p) ?? "";
      if (p === "") {
        const prev = rendered.get("") ?? "";
        if (uri !== prev) {
          decls.push(["", uri]);
          next.set("", uri);
        }
      } else if (rendered.get(p) !== uri) {
        decls.push([p, uri]);
        next.set(p, uri);
      }
    }
    decls.sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const attrs = [...e.attrs].sort((a, b) => {
      const ua = a.ns ?? "";
      const ub = b.ns ?? "";
      if (ua !== ub) return ua < ub ? -1 : 1;
      return a.local < b.local ? -1 : a.local > b.local ? 1 : 0;
    });
    out.push(`<${e.name}`);
    for (const [p, u] of decls) out.push(p ? ` xmlns:${p}="${escAttr(u)}"` : ` xmlns="${escAttr(u)}"`);
    for (const a of attrs) out.push(` ${a.name}="${escAttr(a.value)}"`);
    out.push(">");
    for (const c of e.children) {
      if (c.kind === "text") out.push(escText(c.value));
      else if (c.kind === "element" && c !== opts.exclude) render(c, next);
    }
    out.push(`</${e.name}>`);
  };
  render(el, new Map());
  return out.join("");
}
