import { CampusError, nowIso, sha256, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { audit } from "../common";
import type { AddSourceInput, FetchedResponse, Fetcher, GenSource, StudioSource } from "./types";

/**
 * Studio sources: pasted notes, uploaded document text and web pages.
 *
 * Source text is untrusted DATA. It is stored and quoted, never interpreted: nothing in it can
 * change generation settings, roles or permissions. URL sources are fetched only through an
 * injectable fetcher; a source that cannot be fetched is stored as "unavailable" with the reason
 * and its content is never invented.
 */

export const MAX_URL_BYTES = 1024 * 1024;
export const URL_TIMEOUT_MS = 5000;
const MAX_TEXT = 400_000;

export const STUDIO_GENERATE_ROLES = ["admin", "designer", "instructor"] as const;
export const STUDIO_STAFF_ROLES = ["admin", "designer", "instructor", "ta"] as const;

/** Is the course key a campus course (so course roles apply)? */
export function isCampusCourse(store: TenantStore, courseKey: string): boolean {
  return !!store.get("courses", courseKey);
}

/** Generation rights: tenant admin/designer, or an instructor of the campus course. */
export function canGenerate(store: TenantStore, a: Actor, courseKey: string): boolean {
  return isCampusCourse(store, courseKey) ? hasAny(a, STUDIO_GENERATE_ROLES, courseKey) : hasAny(a, ["admin", "designer"]);
}
export function canSeeInstructor(store: TenantStore, a: Actor, courseKey: string): boolean {
  return isCampusCourse(store, courseKey) ? hasAny(a, STUDIO_STAFF_ROLES, courseKey) : hasAny(a, ["admin", "designer"]);
}
export function isLearnerOf(store: TenantStore, a: Actor, courseKey: string): boolean {
  return isCampusCourse(store, courseKey) && hasAny(a, ["student", "observer"], courseKey);
}

export function requireGenerate(store: TenantStore, a: Actor, courseKey: string, action: string) {
  if (!canGenerate(store, a, courseKey)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: `studio/${courseKey}`, outcome: "denied", reason: "role" });
    throw new CampusError("forbidden", "Only admins, designers and the course's instructors can use the Course Studio.", 403);
  }
}

/* ---------------- Text cleanup ---------------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

/** Strip HTML to readable text (scripts, styles and comments removed; block tags become breaks). */
export function stripTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(p|div|section|article|li|ul|ol|h[1-6]|br|tr|table|header|footer|main|blockquote|pre)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n")
    .trim();
}

/** Remove control characters; keep newlines and tabs. */
function cleanText(s: string): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, MAX_TEXT);
}

/* ---------------- URL fetching ---------------- */

function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0") return true;
  if (h.includes(":") && (h === "::1" || h === "::" || h.startsWith("fe80:") || /^f[cd][0-9a-f]{0,2}:/.test(h) || h.startsWith("::ffff:"))) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return true;
  }
  return false;
}

/** Validate a URL for fetching. Returns a reason string if it must not be fetched. */
export function urlBlockReason(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Not a valid URL.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return `Only http and https URLs are fetched (got ${u.protocol}).`;
  if (u.username || u.password) return "URLs with embedded credentials are not fetched.";
  if (blockedHost(u.hostname)) return "Private, local and internal addresses are not fetched.";
  return null;
}

export const defaultFetcher: Fetcher = (url, init) => fetch(url, init) as unknown as Promise<FetchedResponse>;

/** Fetch a URL's readable text, or explain why it is unavailable. Never throws. */
export async function fetchUrlText(url: string, fetcher: Fetcher = defaultFetcher, timeoutMs = URL_TIMEOUT_MS): Promise<{ ok: true; text: string; title?: string } | { ok: false; reason: string }> {
  const blocked = urlBlockReason(url);
  if (blocked) return { ok: false, reason: blocked };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      fetcher(url, { signal: ctrl.signal, headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "ScholarionCourseStudio/1.0" }, redirect: "follow" }),
      new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error(`Timed out after ${timeoutMs / 1000} s`)))),
    ]);
    if (!res.ok) return { ok: false, reason: `The site answered HTTP ${res.status}.` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const isHtml = type.includes("text/html");
    if (!isHtml && !type.includes("text/plain")) return { ok: false, reason: `Unsupported content type "${type || "unknown"}" (text/html or text/plain only).` };
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_URL_BYTES) return { ok: false, reason: "The page is larger than 1 MB." };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_URL_BYTES) return { ok: false, reason: "The page is larger than 1 MB." };
    const body = buf.toString("utf8");
    const title = isHtml ? stripTags(body.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1] ?? "").trim() || undefined : undefined;
    const text = cleanText(isHtml ? stripTags(body) : body).trim();
    if (text.length < 40) return { ok: false, reason: "The page had no readable text." };
    return { ok: true, text, title };
  } catch (err) {
    return { ok: false, reason: `Could not reach the URL: ${(err as Error).message || "network error"}.` };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Commands / queries ---------------- */

function asSource(r: Row): StudioSource {
  return r as unknown as StudioSource;
}

export async function addSource(store: TenantStore, a: Actor, input: AddSourceInput, opts: { fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<StudioSource> {
  const courseKey = String(input.courseKey ?? "").trim();
  if (!courseKey) throw new CampusError("invalid", "courseKey is required.");
  requireGenerate(store, a, courseKey, "studio.source.add");
  const moduleNo = Number(input.module);
  if (!Number.isInteger(moduleNo) || moduleNo < 1 || moduleNo > 99) throw new CampusError("invalid", "module must be a whole number from 1 to 99.");
  const topic = String(input.topic ?? "").trim().slice(0, 200);
  if (!topic) throw new CampusError("invalid", "topic is required.");
  if (!["text", "file", "url"].includes(input.kind)) throw new CampusError("invalid", "kind must be text, file or url.");

  let text = "";
  let status: StudioSource["status"] = "available";
  let reason: string | null = null;
  let title = String(input.title ?? "").trim().slice(0, 300);
  let url: string | null = null;
  let filename: string | null = null;

  if (input.kind === "url") {
    url = String(input.url ?? "").trim();
    if (!url) throw new CampusError("invalid", "url is required for a URL source.");
    const got = await fetchUrlText(url, opts.fetcher ?? defaultFetcher, opts.timeoutMs ?? URL_TIMEOUT_MS);
    if (got.ok) {
      text = got.text;
      title ||= got.title ?? url;
    } else {
      status = "unavailable";
      reason = got.reason;
      title ||= url;
    }
  } else {
    text = cleanText(String(input.body ?? "")).trim();
    if (input.kind === "file") {
      filename = String(input.filename ?? "").replace(/[\\/]/g, "_").trim().slice(0, 200) || "upload.txt";
      title ||= filename;
    } else title ||= "Instructor notes";
    if (!text) throw new CampusError("invalid", "The source has no text.");
  }

  return store.tx(() => {
    const row = store.insert(
      "studio_sources",
      {
        courseKey,
        module: moduleNo,
        topic,
        kind: input.kind,
        title,
        url,
        filename,
        author: input.author ? String(input.author).slice(0, 200) : null,
        year: input.year ? String(input.year).slice(0, 20) : null,
        text,
        status,
        reason,
        addedBy: a.id,
        checksum: sha256(`${input.kind}\n${url ?? filename ?? ""}\n${text}`),
      },
      "ssrc",
    );
    audit(store, a, "studio.source.add", `studio_sources/${row.id}`, status);
    return asSource(row);
  });
}

export function listSources(store: TenantStore, a: Actor, filter: { courseKey: string; module?: number; topic?: string }): StudioSource[] {
  if (!canSeeInstructor(store, a, filter.courseKey)) throw new CampusError("forbidden", "You don't have permission to see Studio sources for this course.", 403);
  return store
    .list("studio_sources", (s) => s.courseKey === filter.courseKey && (filter.module === undefined || s.module === filter.module) && (filter.topic === undefined || s.topic === filter.topic))
    .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)) || x.id.localeCompare(y.id))
    .map(asSource);
}

/** Sources for a generation run, with citation refs (S1, S2…) for available ones only. */
export function genSources(store: TenantStore, courseKey: string, moduleNo: number, topic: string, ids?: string[]): GenSource[] {
  const rows = ids?.length
    ? ids.map((id) => store.get("studio_sources", id)).filter((r): r is Row => !!r && r.courseKey === courseKey)
    : store.list("studio_sources", (s) => s.courseKey === courseKey && s.module === moduleNo && s.topic === topic).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)) || x.id.localeCompare(y.id));
  let n = 0;
  return rows.map((r) => {
    const s = asSource(r);
    return { id: s.id, ref: s.status === "available" ? `S${++n}` : null, kind: s.kind, title: s.title, url: s.url, filename: s.filename, author: s.author, year: s.year, text: s.status === "available" ? s.text : "", status: s.status, reason: s.reason, checksum: s.checksum, addedAt: s.createdAt ?? nowIso() };
  });
}
