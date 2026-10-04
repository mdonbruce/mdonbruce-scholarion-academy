/**
 * One document model for every download. Pages, Markdown, CSV and structured exports are turned
 * into a Doc, and a Doc is rendered to PDF, Word (.docx) or Excel (.xlsx).
 */
export type Block =
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "p"; text: string; small?: boolean }
  | { t: "list"; ordered?: boolean; items: string[] }
  | { t: "table"; caption?: string; head: string[]; rows: string[][] }
  | { t: "code"; text: string }
  | { t: "hr" };

export interface Doc {
  title: string;
  subtitle?: string;
  author?: string;
  subject?: string;
  /** Short line printed in the footer of every page / sheet. */
  footer?: string;
  blocks: Block[];
}

export const FORMATS = ["pdf", "docx", "xlsx"] as const;
export type Format = (typeof FORMATS)[number];
export const isFormat = (v: unknown): v is Format => typeof v === "string" && (FORMATS as readonly string[]).includes(v);

export const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const FORMAT_LABEL: Record<Format, string> = { pdf: "PDF", docx: "Word", xlsx: "Excel" };

/** Remove characters that are invalid in XML 1.0 and normalise whitespace. */
export function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/\r\n?/g, "\n");
}

export const xml = (s: unknown) => clean(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function slugFile(s: string) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "document";
}
