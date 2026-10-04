import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Block, Doc } from "./model";

/**
 * PDF writer (US Letter, standard fonts). Standard PDF fonts use the Windows-1252 character set, so
 * text outside it is transliterated (é stays é; → becomes ->). Tables repeat their header row on
 * each new page. Every page carries the document title and "Page n of N".
 */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const MAP: Record<string, string> = { "→": "->", "←": "<-", "↔": "<->", "≥": ">=", "≤": "<=", "≠": "!=", "✓": "v", "✔": "v", "✗": "x", "✕": "x", "★": "*", "☆": "*", "▸": ">", "▶": ">", "●": "•", "◦": "-", "−": "-", "‑": "-", "≈": "~", "∞": "inf", " ": " ", "​": "", " ": " " };
export function winAnsi(s: string): string {
  let out = "";
  for (const ch of String(s).replace(/\t/g, "    ")) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)) out += ch;
    else if (MAP[ch] !== undefined) out += MAP[ch];
    else if (ch === "\n") out += "\n";
    else {
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += [...base].every((x) => x.codePointAt(0)! < 0x7f) ? base : "?";
    }
  }
  return out;
}

const PAGE: [number, number] = [612, 792];
const M = 56;
const W = PAGE[0] - M * 2;
const TOP = PAGE[1] - M;
const BOTTOM = M + 18;
const INK = rgb(0.06, 0.1, 0.2);
const MUTED = rgb(0.35, 0.39, 0.47);
const RULE = rgb(0.78, 0.8, 0.86);
const HEAD_FILL = rgb(0.92, 0.94, 0.98);
const BRAND = rgb(0.04, 0.12, 0.3);

export async function toPdf(doc: Doc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(doc.title));
  pdf.setAuthor(winAnsi(doc.author ?? "Scholaris AI Academy"));
  if (doc.subject) pdf.setSubject(winAnsi(doc.subject));
  pdf.setCreator("Scholarion");
  pdf.setProducer("Scholarion document export");
  pdf.setLanguage("en");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  let page: PDFPage = pdf.addPage(PAGE);
  let y = TOP;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const wrap = (s: string, f: PDFFont, size: number, width: number): string[] => {
    const out: string[] = [];
    for (const para of winAnsi(s).split("\n")) {
      let line = "";
      for (const word of para.split(/ +/)) {
        const cand = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(cand, size) <= width) {
          line = cand;
          continue;
        }
        if (line) out.push(line);
        // Break very long words (URLs, ids).
        let w = word;
        while (f.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let n = w.length;
          while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        line = w;
      }
      out.push(line);
    }
    return out;
  };
  const lines = (s: string, f: PDFFont, size: number, opts: { x?: number; width?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const lh = size * 1.35;
    for (const l of wrap(s, f, size, opts.width ?? W - (opts.x ?? 0))) {
      ensure(lh);
      page.drawText(l, { x: M + (opts.x ?? 0), y: y - size, size, font: f, color: opts.color ?? INK });
      y -= lh;
    }
    y -= opts.gap ?? 0;
  };

  // Title block.
  page.drawRectangle({ x: M, y: y - 4, width: 64, height: 4, color: BRAND });
  y -= 14;
  lines(doc.title, bold, 20, { gap: 4 });
  if (doc.subtitle) lines(doc.subtitle, font, 11, { color: MUTED, gap: 6 });
  y -= 6;

  const table = (b: Extract<Block, { t: "table" }>) => {
    const size = b.head.length > 6 ? 7.5 : b.head.length > 4 ? 8.5 : 9.5;
    const pad = 4;
    const cols = Math.max(1, b.head.length);
    // Column widths from content length, bounded.
    const len = Array.from({ length: cols }, (_x, i) => Math.min(60, Math.max(4, winAnsi(b.head[i] ?? "").length, ...b.rows.slice(0, 200).map((r) => winAnsi(r[i] ?? "").length))));
    const total = len.reduce((a, c) => a + c, 0);
    const widths = len.map((l) => Math.max(36, (l / total) * W));
    const scale = W / widths.reduce((a, c) => a + c, 0);
    for (let i = 0; i < widths.length; i++) widths[i] *= scale;
    const lh = size * 1.3;
    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((c, i) => wrap(c ?? "", header ? bold : font, size, widths[i] - pad * 2));
      const h = Math.max(1, ...wrapped.map((w) => w.length)) * lh + pad * 2;
      if (y - h < BOTTOM) {
        newPage();
        if (!header) drawRow(b.head, true);
      }
      let x = M;
      if (header) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: HEAD_FILL });
      for (let i = 0; i < cols; i++) {
        page.drawRectangle({ x, y: y - h, width: widths[i], height: h, borderColor: RULE, borderWidth: 0.6 });
        wrapped[i]?.forEach((l, k) => page.drawText(l, { x: x + pad, y: y - pad - size - k * lh + 1, size, font: header ? bold : font, color: INK }));
        x += widths[i];
      }
      y -= h;
    };
    if (b.caption) lines(b.caption, bold, 10, { color: MUTED, gap: 2 });
    ensure(lh * 3);
    drawRow(b.head, true);
    for (const r of b.rows) drawRow(r, false);
    y -= 10;
  };

  for (const b of doc.blocks) {
    switch (b.t) {
      case "h": {
        const size = b.level === 1 ? 16 : b.level === 2 ? 13 : 11.5;
        y -= b.level === 1 ? 10 : 6;
        ensure(size * 3);
        lines(b.text, bold, size, { gap: 3 });
        break;
      }
      case "p":
        lines(b.text, font, b.small ? 8.5 : 10.5, { gap: 6, color: b.small ? MUTED : INK });
        break;
      case "list":
        b.items.forEach((it, i) => {
          const nested = it.startsWith("– ");
          const marker = b.ordered && !nested ? `${i + 1}.` : nested ? "–" : "•";
          const indent = nested ? 28 : 12;
          ensure(14);
          page.drawText(winAnsi(marker), { x: M + indent - 10, y: y - 10.5, size: 10.5, font, color: INK });
          lines(nested ? it.slice(2) : it, font, 10.5, { x: indent + 4, gap: 1 });
        });
        y -= 5;
        break;
      case "table":
        table(b);
        break;
      case "code": {
        const ls = wrap(b.text, mono, 8.5, W - 12);
        for (const l of ls) {
          ensure(11.5);
          page.drawRectangle({ x: M, y: y - 11.5, width: W, height: 11.5, color: rgb(0.96, 0.97, 0.99) });
          page.drawText(l, { x: M + 6, y: y - 9, size: 8.5, font: mono, color: INK });
          y -= 11.5;
        }
        y -= 8;
        break;
      }
      case "hr":
        ensure(12);
        page.drawLine({ start: { x: M, y: y - 5 }, end: { x: M + W, y: y - 5 }, thickness: 0.6, color: RULE });
        y -= 12;
        break;
    }
  }

  const pages = pdf.getPages();
  const foot = winAnsi(doc.footer ?? doc.title).slice(0, 90);
  pages.forEach((p, i) => {
    p.drawText(foot, { x: M, y: M - 20, size: 8, font, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: PAGE[0] - M - font.widthOfTextAtSize(n, 8), y: M - 20, size: 8, font, color: MUTED });
  });
  return pdf.save();
}
