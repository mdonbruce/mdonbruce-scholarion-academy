import { docResponse, requestedFormat, withOfficeCopies } from "./index";
import { FORMAT_LABEL, type Doc } from "./model";
import { fromCsv, fromHtml, fromIcs, fromJson, fromMarkdown, fromText } from "./parse";
import { unzip, zipDeflate } from "./zip";

/**
 * One rule for every download: add ?format=pdf, ?format=docx or ?format=xlsx to any document link
 * and the same content comes back as PDF, Word or Excel. Bundles (.zip) carry PDF, Word and Excel
 * copies of each document inside them. Handlers that build a PDF from data (receipts, certificates,
 * brochures) attach the underlying Doc so the Word and Excel versions hold the same content.
 */
const attached = new WeakMap<Response, Doc>();
export function attachDoc<R extends Response>(res: R, doc: Doc): R {
  attached.set(res, doc);
  return res;
}

const fileName = (res: Response) => /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "";

export async function officeResponse(req: Request, res: Response, fallbackName: string): Promise<Response> {
  if (res.status !== 200 || req.method.toUpperCase() !== "GET") return res;
  const url = new URL(req.url);
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const name = fileName(res);
  const fmt = requestedFormat(url);

  // Bundles: add office copies unless the archive is a standards package (Common Cartridge) or ?office=0.
  if (!fmt && type.startsWith("application/zip") && /\.zip$/i.test(name) && url.searchParams.get("office") !== "0") {
    const entries = unzip(Buffer.from(await res.arrayBuffer()));
    const { entries: all } = await withOfficeCopies(entries);
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(new Uint8Array(zipDeflate(all)), { status: 200, headers });
  }
  if (!fmt) return res;
  const base = (name || fallbackName || "document").replace(/\.[^.]+$/, "");
  const doc = attached.get(res);
  if (doc) return docResponse(doc, fmt, base);
  if (type.startsWith("application/pdf") || type.includes("officedocument") || type.startsWith("application/zip") || type.startsWith("image/")) {
    if ((type.startsWith("application/pdf") && fmt === "pdf") || (type.includes("wordprocessingml") && fmt === "docx") || (type.includes("spreadsheetml") && fmt === "xlsx")) return res;
    return new Response(JSON.stringify({ error: { code: "format_unavailable", message: `This file can't be converted to ${FORMAT_LABEL[fmt]}.` } }), { status: 415, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const body = await res.text();
  const title = base.replace(/[_-]+/g, " ");
  let d: Doc;
  if (type.startsWith("text/html")) d = fromHtml(body, title);
  else if (type.startsWith("text/markdown")) d = fromMarkdown(body, title);
  else if (type.startsWith("text/csv")) d = fromCsv(body, title);
  else if (type.startsWith("text/calendar")) d = fromIcs(body, title);
  else if (type.includes("json")) {
    let v: unknown = body;
    try {
      v = JSON.parse(body);
    } catch {
      /* keep text */
    }
    const data = v && typeof v === "object" && !Array.isArray(v) && "data" in (v as object) && Object.keys(v as object).length <= 3 ? (v as { data: unknown }).data : v;
    d = fromJson(data, title);
  } else if (type.startsWith("text/") || type.includes("xml")) d = type.includes("xml") ? { title, blocks: [{ t: "code", text: body }] } : fromText(body, title);
  else return res;
  return docResponse(d, fmt, base);
}
