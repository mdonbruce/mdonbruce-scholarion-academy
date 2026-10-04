import { CampusError, nowIso, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";
import { downloadUrl, readObject } from "./files";
import { docFromFile, type Doc } from "../../documents";
import { docxToDoc, ipynbToDoc, pptxToDoc, toHtml, xlsxToDoc } from "../../documents/read";

/**
 * Submission formats accepted for assignments, projects, labs and mini labs: Word, Excel,
 * PowerPoint, PDF, Jupyter/Colab notebooks, Python, R, SQL, CSV, JSON, Markdown, text and ZIP —
 * plus a link to a Google Colab notebook, Codelab, GitHub repository or shared document.
 * Every upload goes through the same quarantine → scan → promote pipeline; executables are refused.
 */
export const SUBMISSION_FORMATS: { ext: string; label: string; mime: string }[] = [
  { ext: "docx", label: "Word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { ext: "doc", label: "Word 97–2003", mime: "application/msword" },
  { ext: "xlsx", label: "Excel", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { ext: "xls", label: "Excel 97–2003", mime: "application/vnd.ms-excel" },
  { ext: "pptx", label: "PowerPoint", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { ext: "pdf", label: "PDF", mime: "application/pdf" },
  { ext: "ipynb", label: "Jupyter / Colab notebook", mime: "application/x-ipynb+json" },
  { ext: "py", label: "Python", mime: "text/x-python" },
  { ext: "r", label: "R", mime: "text/x-r" },
  { ext: "sql", label: "SQL", mime: "application/sql" },
  { ext: "csv", label: "CSV", mime: "text/csv" },
  { ext: "json", label: "JSON", mime: "application/json" },
  { ext: "md", label: "Markdown", mime: "text/markdown" },
  { ext: "txt", label: "Text", mime: "text/plain" },
  { ext: "zip", label: "ZIP (project folder)", mime: "application/zip" },
  { ext: "png", label: "Screenshot (PNG)", mime: "image/png" },
  { ext: "jpg", label: "Screenshot (JPEG)", mime: "image/jpeg" },
];

/** Default accepted formats by kind of work. */
export const FORMATS_BY_KIND: Record<string, string[]> = {
  activity: ["docx", "doc", "pdf"],
  lab: ["ipynb", "py", "r", "sql", "pdf", "docx", "doc", "xlsx", "xls", "csv", "zip", "md", "txt"],
  minilab: ["ipynb", "py", "r", "sql", "pdf", "docx", "doc", "xlsx", "xls", "csv", "zip", "md", "txt", "png", "jpg"],
  assignment: ["docx", "doc", "pdf", "xlsx", "xls", "csv", "ipynb", "py", "r", "sql", "zip", "md", "txt", "pptx"],
  project: ["docx", "doc", "pdf", "xlsx", "xls", "csv", "ipynb", "py", "r", "sql", "zip", "pptx", "md", "txt", "json", "png", "jpg"],
};
export const formatsFor = (kind: string) => FORMATS_BY_KIND[kind] ?? FORMATS_BY_KIND.assignment;

export const acceptAttr = (exts: string[]) => exts.map((e) => `.${e.replace(/^\./, "")}`).join(",");
export const formatList = (exts: string[]) => {
  const seen = new Set<string>();
  return exts
    .map((e) => SUBMISSION_FORMATS.find((f) => f.ext === e.replace(/^\./, "").toLowerCase()))
    .filter((f): f is (typeof SUBMISSION_FORMATS)[number] => !!f && !seen.has(f.label.split(" ")[0]) && !!seen.add(f.label.split(" ")[0]))
    .map((f) => `${f.label.replace(/ 97–2003$/, "")} (.${f.ext})`)
    .join(", ");
};

/** The canonical MIME for a file name — browsers often send nothing or a vendor variant. */
export function mimeFor(name: string, declared?: string) {
  const ext = String(name).split(".").pop()?.toLowerCase() ?? "";
  const known = SUBMISSION_FORMATS.find((f) => f.ext === ext)?.mime;
  if (known && (!declared || declared === "application/octet-stream" || /python|ipynb|x-r|sql|msword|ms-excel|officedocument/.test(declared))) return known;
  return declared || known || "application/octet-stream";
}

/** Links accepted as work: Google Colab, Codelab, GitHub, Kaggle, or a shared document on https. */
export function checkWorkLink(url: string) {
  const u = String(url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(u)) throw new CampusError("invalid", "Use a full https:// link (Google Colab, Codelab, GitHub or a shared document).", 422);
  const host = new URL(u).hostname;
  const kind = /colab\.research\.google\.com/.test(host) ? "Google Colab notebook" : /codelabs?\b|codelabs\./.test(u) ? "Codelab" : /github\.com|gitlab\.com/.test(host) ? "Repository" : /kaggle\.com/.test(host) ? "Kaggle notebook" : /docs\.google\.com|onedrive|sharepoint|dropbox/.test(host) ? "Shared document" : "Link";
  return { url: u, kind };
}

/**
 * Attach work to a learning-area item (mini lab, worksheet, quiz or project). Attachments are
 * evidence for the instructor; they never change an auto-graded score or use an attempt.
 */
export function attachWork(store: TenantStore, a: Actor, input: { itemId: string; fileId?: string; url?: string; note?: string }) {
  const it = store.get("graded_items", input.itemId);
  if (!it) throw new CampusError("not_found", "Item not found", 404);
  const courseId = String(it.courseId);
  if (!hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "Only learners in this course can upload work.", 403);
  let file: { id: string; name: string } | null = null;
  if (input.fileId) {
    const f = store.get("files", input.fileId);
    if (!f || f.ownerId !== a.id) throw new CampusError("invalid", "Upload your file first.", 422);
    if (f.state !== "available") throw new CampusError("blocked", "Your file didn't pass the safety scan.", 422);
    const ext = String(f.name).split(".").pop()?.toLowerCase() ?? "";
    const kind = String(it.kind).replace(/[^a-z]/g, "");
    const allowed = formatsFor(kind === "minilab" || kind === "mini_lab" ? "minilab" : kind);
    if (!allowed.includes(ext)) throw new CampusError("type_not_allowed", `Accepted for this item: ${formatList(allowed)}.`, 422);
    file = { id: f.id, name: String(f.name) };
  }
  const link = input.url ? checkWorkLink(input.url) : null;
  if (!file && !link) throw new CampusError("invalid", "Choose a file or paste a link.", 422);
  const row = store.tx(() => store.insert("graded_attachments", { itemId: it.id, courseId, userId: a.id, fileId: file?.id ?? null, fileName: file?.name ?? null, url: link?.url ?? null, linkKind: link?.kind ?? null, note: String(input.note ?? "").slice(0, 500) || null, at: nowIso() }, "gat"));
  store.emit("graded.work_attached", `graded_items/${it.id}`, { itemId: it.id, userId: a.id, attachmentId: row.id });
  audit(store, a, "graded.attach", `graded_items/${it.id}`, file ? file.name : link?.kind);
  return row;
}

export function attachmentsFor(store: TenantStore, a: Actor, itemId: string) {
  const it = store.get("graded_items", itemId);
  if (!it) throw new CampusError("not_found", "Item not found", 404);
  const staff = hasAny(a, ["admin", "instructor", "ta"], String(it.courseId));
  return store
    .list("graded_attachments", (x) => x.itemId === itemId && (staff || x.userId === a.id))
    .sort((x, y) => String(y.at).localeCompare(String(x.at)))
    .map((x) => ({ id: x.id, learner: staff ? String(store.get("users", x.userId as string)?.name ?? x.userId) : null, fileId: (x.fileId as string) ?? null, fileName: (x.fileName as string) ?? null, url: (x.url as string) ?? null, linkKind: (x.linkKind as string) ?? null, note: (x.note as string) ?? null, at: String(x.at) }));
}

/* ---------------- inline preview ---------------- */

/**
 * Inline preview of an uploaded or course file for anyone allowed to download it: PDFs and images
 * show as themselves; Word, Excel, PowerPoint, notebooks, CSV, Markdown and code render as safe
 * HTML text (no scripts, macros or external content).
 */
export function previewFile(store: TenantStore, a: Actor, fileId: string): { kind: "inline"; mime: string; bytes: Buffer; name: string } | { kind: "html"; html: string } {
  downloadUrl(store, a, fileId); // access, scan state and audit
  const o = readObject(store, fileId);
  const name = o.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (o.mime === "application/pdf" || /^image\/(png|jpeg|gif)$/.test(o.mime)) return { kind: "inline", mime: o.mime, bytes: o.bytes, name };
  const title = name;
  let doc: Doc | null = null;
  try {
    if (ext === "docx") doc = docxToDoc(o.bytes, title);
    else if (ext === "xlsx") doc = xlsxToDoc(o.bytes, title);
    else if (ext === "pptx") doc = pptxToDoc(o.bytes, title);
    else if (ext === "ipynb") doc = ipynbToDoc(o.bytes.toString("utf8"), title);
    else if (["py", "r", "sql", "txt", "json", "js", "ts"].includes(ext)) doc = { title, blocks: [{ t: "code", text: o.bytes.toString("utf8").slice(0, 200_000) }] };
    else doc = docFromFile(name, o.bytes, title);
  } catch {
    doc = null;
  }
  if (!doc) return { kind: "html", html: toHtml({ title, blocks: [{ t: "p", text: ext === "doc" || ext === "xls" ? "Older Office files (.doc, .xls) can't be previewed here — download the file, or save it as .docx / .xlsx." : "This file type can't be previewed. Download it to open it." }] }) };
  return { kind: "html", html: toHtml(doc) };
}
