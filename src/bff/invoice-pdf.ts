import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Order } from "@/platform/types";
import { pdfSafe } from "./certificate-pdf";

/**
 * Downloadable receipt per order (US Letter, portrait). SANDBOX: no real payment was
 * taken, and the receipt says so. Amounts use ISO currency codes so every currency
 * renders with the standard PDF fonts.
 */

const NAVY = rgb(0.043, 0.122, 0.302);
const INK = rgb(0.17, 0.2, 0.27);
const MUTED = rgb(0.38, 0.42, 0.5);
const RULE = rgb(0.85, 0.87, 0.92);

export interface InvoiceInput {
  order: Order;
  buyerName: string;
  buyerEmail: string;
}

export function invoiceMoney(amount: number, currency: string): string {
  const whole = Math.abs(amount % 1) < 1e-9;
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amount)}`;
}

/** Invoice lines from the order (older orders without line detail show the total only). */
export function invoiceLines(o: Order): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [];
  const subtotal = o.subtotal ?? o.amount;
  lines.push({ label: o.description, amount: subtotal });
  if (o.discount) lines.push({ label: o.couponCode ? `Code ${o.couponCode}` : o.description.startsWith("Plan change") ? "Proration credit (unused time on previous plan)" : "Credit applied", amount: -o.discount });
  if (o.tax) lines.push({ label: `Simulated tax (${o.taxRate ?? 0}%)`, amount: o.tax });
  return lines;
}

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = INK) {
  page.drawText(pdfSafe(s), { x, y, size, font, color });
}

function right(page: PDFPage, s: string, xRight: number, y: number, font: PDFFont, size: number, color = INK) {
  const t = pdfSafe(s);
  page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
}

/** Wraps to the width, returning lines. */
function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of pdfSafe(s).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export async function invoicePdf({ order: o, buyerName, buyerEmail }: InvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const created = new Date(o.createdAt);
  doc.setTitle(pdfSafe(`Receipt ${o.id}`));
  doc.setAuthor("Scholarion Academy");
  doc.setSubject("Sandbox receipt - no real payment was taken");
  doc.setCreator("Scholarion Academy commerce (sandbox)");
  doc.setProducer("Scholarion Academy");
  doc.setCreationDate(created);
  doc.setModificationDate(created);

  const page = doc.addPage([612, 792]);
  const W = page.getWidth();
  const H = page.getHeight();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 56;
  const R = W - 56;

  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
  text(page, "SCHOLARION ACADEMY", L, H - 50, bold, 16, rgb(1, 1, 1));
  text(page, "Receipt", L, H - 72, sans, 12, rgb(0.85, 0.89, 0.97));
  right(page, "SANDBOX - NO REAL PAYMENT", R, H - 50, bold, 10, rgb(1, 0.85, 0.5));

  let y = H - 132;
  const row = (k: string, v: string) => {
    text(page, k, L, y, bold, 10, MUTED);
    text(page, v, L + 110, y, sans, 10);
    y -= 16;
  };
  row("Receipt number", o.id);
  row("Date", created.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }));
  row("Billed to", buyerName);
  if (buyerEmail) row("Email", buyerEmail);
  row("Status", o.status === "refunded" ? "Refunded" : "Paid (sandbox)");

  y -= 18;
  page.drawLine({ start: { x: L, y: y + 12 }, end: { x: R, y: y + 12 }, thickness: 1, color: NAVY });
  text(page, "Description", L, y, bold, 10, NAVY);
  right(page, "Amount", R, y, bold, 10, NAVY);
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.6, color: RULE });
  y -= 16;
  for (const line of invoiceLines(o)) {
    const wrapped = wrap(line.label, sans, 10, R - L - 120);
    wrapped.forEach((w, i) => text(page, w, L, y - i * 13, sans, 10));
    right(page, invoiceMoney(line.amount, o.currency), R, y, sans, 10);
    y -= 13 * wrapped.length + 6;
  }
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.6, color: RULE });
  y -= 10;
  text(page, o.status === "refunded" ? "Total (refunded)" : "Total paid", L, y, bold, 11);
  right(page, invoiceMoney(o.amount, o.currency), R, y, bold, 11);

  y -= 40;
  for (const note of [
    "This is a sandbox receipt. Scholarion Academy is not taking real payments in this environment; no card was charged.",
    "Prices are placeholders set by the product owner. Any tax shown is a simulated rate set by staff, not a tax calculation.",
    "Questions about this receipt? Open a ticket in the Help Center and quote the receipt number.",
  ]) {
    for (const w of wrap(note, sans, 9, R - L)) {
      text(page, w, L, y, sans, 9, MUTED);
      y -= 12;
    }
    y -= 4;
  }
  text(page, "Scholarion Academy - Haven Digital Systems", L, 48, sans, 8.5, MUTED);
  return doc.save();
}

/** The same receipt as a document (for the Word and Excel downloads). */
export function invoiceDoc({ order: o, buyerName, buyerEmail }: InvoiceInput): import("@/documents").Doc {
  const created = new Date(o.createdAt);
  return {
    title: `Receipt ${o.id}`,
    subtitle: "Scholarion Academy · SANDBOX — no real payment was taken",
    subject: "Sandbox receipt",
    footer: `Receipt ${o.id} · sandbox`,
    blocks: [
      { t: "table", caption: "Receipt", head: ["Field", "Value"], rows: [["Receipt number", o.id], ["Date", created.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })], ["Billed to", buyerName], ...(buyerEmail ? [["Email", buyerEmail]] : []), ["Status", o.status === "refunded" ? "Refunded" : "Paid (sandbox)"]] },
      { t: "table", caption: "Charges", head: ["Description", "Amount", "Currency"], rows: [...invoiceLines(o).map((l) => [l.label, l.amount.toFixed(2), o.currency]), ["Total", o.amount.toFixed(2), o.currency]] },
      { t: "p", small: true, text: "Prices are placeholders set by the product owner. Any tax shown is a simulated rate set by staff, not a tax calculation." },
    ],
  };
}
