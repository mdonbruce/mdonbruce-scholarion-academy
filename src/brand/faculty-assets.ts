import fs from "node:fs";
import path from "node:path";
import { LEAD_FACULTY, type FacultyMember } from "./faculty";

/** Server-only: read an approved faculty image from /public (for PDFs and self-contained HTML). */
export function facultyImageBytes(f: FacultyMember = LEAD_FACULTY, which: "original" | "avatar" = "original"): Uint8Array | null {
  try {
    return new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", which === "original" ? f.photo.src : f.photo.avatar)));
  } catch {
    return null;
  }
}

export function facultyDataUri(f: FacultyMember = LEAD_FACULTY, which: "original" | "avatar" = "original"): string | null {
  const b = facultyImageBytes(f, which);
  return b ? `data:image/png;base64,${Buffer.from(b).toString("base64")}` : null;
}
