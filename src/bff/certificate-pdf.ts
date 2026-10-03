import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Printable certificate PDF (US Letter, landscape) with a QR code to the public
 * verification page. The PDF is a convenience copy: the verification page re-checks
 * the signed credential every time, so the PDF itself is never the proof.
 */

export interface CertificateInput {
  id: string;
  holderName: string;
  title: string; // credential title
  programTitle: string;
  kind: "badge" | "certificate";
  issuedAt: string;
  verifyUrl: string;
  hours?: number;
}

const NAVY = rgb(0.043, 0.122, 0.302); // #0b1f4d
const GOLD = rgb(0.725, 0.576, 0.239); // #b9933d
const INK = rgb(0.17, 0.2, 0.27);
const MUTED = rgb(0.38, 0.42, 0.5);

/** Standard PDF fonts only cover WinAnsi; fold accents and drop anything else. */
export function pdfSafe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");
}

type QrMatrix = { size: number; get: (row: number, col: number) => boolean };

async function qrMatrix(text: string): Promise<QrMatrix | null> {
  try {
    const mod = (await import("qrcode")) as unknown as { create?: QrCreate; default?: { create: QrCreate } };
    const create = mod.create ?? mod.default?.create;
    if (!create) return null;
    const q = create(text, { errorCorrectionLevel: "M" });
    return { size: q.modules.size, get: (r, c) => !!q.modules.get(r, c) };
  } catch {
    return null;
  }
}
type QrCreate = (t: string, o: Record<string, unknown>) => { modules: { size: number; get: (r: number, c: number) => number | boolean } };

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK) {
  const t = pdfSafe(text);
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

/** Shrinks text until it fits the width (long names and titles). */
function fitSize(font: PDFFont, text: string, max: number, width: number, min = 12): number {
  let s = max;
  while (s > min && font.widthOfTextAtSize(pdfSafe(text), s) > width) s -= 1;
  return s;
}

export async function certificatePdf(c: CertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const issued = new Date(c.issuedAt);
  doc.setTitle(pdfSafe(`${c.title} - ${c.holderName}`));
  doc.setAuthor("Scholarion Academy");
  doc.setSubject(pdfSafe(`${c.programTitle}. Non-credit professional training. Verify at ${c.verifyUrl}`));
  doc.setKeywords(["Scholarion Academy", "certificate", "verifiable credential", c.id]);
  doc.setCreator("Scholarion Academy credentials service");
  doc.setProducer("Scholarion Academy");
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);

  const page = doc.addPage([792, 612]);
  const W = page.getWidth();
  const H = page.getHeight();
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Frame.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.995, 0.99, 0.975) });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: NAVY, borderWidth: 3 });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: GOLD, borderWidth: 1 });

  // Emblem.
  try {
    const png = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "brand", "scholarion-emblem.png")));
    const h = 62;
    const w = (png.width / png.height) * h;
    page.drawImage(png, { x: (W - w) / 2, y: H - 58 - h, width: w, height: h });
  } catch {
    /* emblem is optional */
  }

  centered(page, "SCHOLARION ACADEMY", H - 140, sansBold, 12, NAVY);
  centered(page, c.kind === "badge" ? "Digital Badge" : "Certificate of Completion", H - 182, serifBold, 34, NAVY);
  centered(page, "This certifies that", H - 216, serifItalic, 15, MUTED);
  const nameSize = fitSize(serifBold, c.holderName, 40, W - 200, 20);
  centered(page, c.holderName, H - 262, serifBold, nameSize, INK);
  page.drawLine({ start: { x: W / 2 - 200, y: H - 274 }, end: { x: W / 2 + 200, y: H - 274 }, thickness: 0.8, color: GOLD });
  centered(page, "has successfully completed", H - 302, serifItalic, 15, MUTED);
  const titleSize = fitSize(sansBold, c.programTitle, 20, W - 220, 11);
  centered(page, c.programTitle, H - 332, sansBold, titleSize, NAVY);
  const meta = [issued.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }), c.hours ? `${c.hours} hours` : null, "Non-credit professional training"].filter(Boolean).join("  |  ");
  centered(page, meta, H - 358, sans, 11, MUTED);

  // Signature line (issuer, not a person).
  page.drawLine({ start: { x: 96, y: 128 }, end: { x: 300, y: 128 }, thickness: 0.8, color: INK });
  page.drawText("Scholarion Academy", { x: 96, y: 112, size: 11, font: sansBold, color: INK });
  page.drawText("Credential issuer (digitally signed)", { x: 96, y: 98, size: 9, font: sans, color: MUTED });

  // QR code to the verification page.
  const qr = await qrMatrix(c.verifyUrl);
  const qrSize = 92;
  const qx = W - 96 - qrSize;
  const qy = 84;
  page.drawRectangle({ x: qx - 6, y: qy - 6, width: qrSize + 12, height: qrSize + 12, color: rgb(1, 1, 1), borderColor: NAVY, borderWidth: 0.6 });
  if (qr) {
    const cell = qrSize / qr.size;
    for (let r = 0; r < qr.size; r++) for (let col = 0; col < qr.size; col++) {
      if (qr.get(r, col)) page.drawRectangle({ x: qx + col * cell, y: qy + qrSize - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: NAVY });
    }
  } else {
    page.drawText("Scan or visit", { x: qx + 14, y: qy + 50, size: 9, font: sans, color: NAVY });
    page.drawText("the link below", { x: qx + 12, y: qy + 38, size: 9, font: sans, color: NAVY });
  }
  page.drawText("Scan to verify", { x: qx + 18, y: qy - 20, size: 9, font: sans, color: MUTED });

  // Footer.
  centered(page, `Credential ID ${c.id}  |  Verify: ${c.verifyUrl}`, 58, sans, 8.5, MUTED);
  centered(page, "The verification page checks the digital signature and revocation status. This printout alone is not proof.", 46, sans, 7.5, MUTED);

  // Clickable verification link over the QR.
  const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [qx - 6, qy - 6, qx + qrSize + 6, qy + qrSize + 6], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(c.verifyUrl) } });
  page.node.addAnnot(doc.context.register(link));

  return doc.save();
}
