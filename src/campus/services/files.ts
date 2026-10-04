import { broker, CampusError, hmac, nowIso, nowMs, registerConsumer, sha256, type Row, type TenantStore } from "../core";
import { registerHooks } from "../entity";
import { hasAny, type Actor } from "../iam";
import { audit, isStaff, requireCourse } from "./common";
import { hasCaptions } from "./curriculum";

/**
 * Files & media. Uploads go to a per-tenant object namespace through short-lived signed
 * URLs, land in quarantine, are scanned (malware signature, MIME sniffing, extension and
 * policy classification) and only then promoted. Downloads use signed 5-minute URLs.
 * Media is transcoded to renditions; captions are required to publish unless an
 * authorized exception is recorded.
 */

const SIGNING_KEY = process.env.CAMPUS_SIGNING_KEY ?? `dev-${sha256(String(process.pid) + __dirname)}`;
const MAX_BYTES = 10 * 1024 * 1024;
export const URL_TTL_MS = 5 * 60_000;
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const BLOCKED_EXT = ["exe", "bat", "cmd", "msi", "scr", "js", "vbs", "ps1", "jar", "com", "dll"];

export function signUrl(tenantId: string, op: "put" | "get", fileId: string, ttl = URL_TTL_MS) {
  const exp = nowMs() + ttl;
  const sig = hmac(`${SIGNING_KEY}:${tenantId}`, `${op}:${fileId}:${exp}`);
  return { url: `/api/campus/objects/${broker.tenant(tenantId)?.slug ?? tenantId}/${fileId}?exp=${exp}&sig=${sig}`, method: op === "put" ? "PUT" : "GET", exp };
}
export function verifySignature(tenantId: string, op: "put" | "get", fileId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) throw new CampusError("bad_signature", "Missing signature", 403);
  if (Number(exp) < nowMs()) throw new CampusError("url_expired", "This link has expired.", 403);
  const want = hmac(`${SIGNING_KEY}:${tenantId}`, `${op}:${fileId}:${exp}`);
  if (want !== sig) throw new CampusError("bad_signature", "Invalid signature", 403);
}

function quotaBytes(store: TenantStore, courseId?: string | null, userId?: string): { used: number; limit: number } {
  if (courseId) {
    const c = store.get("courses", courseId);
    const acc = c?.accountId ? store.get("accounts", c.accountId as string) : store.list("accounts", (a) => !a.parentId)[0];
    const limit = Number(c?.quotaMb ?? acc?.quotaMb ?? 500) * 1024 * 1024;
    const used = store.list("files", (f) => f.courseId === courseId).reduce((s, f) => s + Number(f.size ?? 0), 0);
    return { used, limit };
  }
  const used = store.list("files", (f) => f.ownerId === userId && !f.courseId).reduce((s, f) => s + Number(f.size ?? 0), 0);
  return { used, limit: 50 * 1024 * 1024 };
}

/** Step 1: ask for an upload slot (returns a signed PUT URL). */
export function requestUpload(store: TenantStore, a: Actor, input: { name: string; mime: string; size: number; courseId?: string | null; folderId?: string | null; purpose?: "course" | "submission" | "personal" | "application" }) {
  const name = String(input.name ?? "").trim().slice(0, 200);
  if (!name) throw new CampusError("invalid", "File name is required.", 422);
  const size = Number(input.size);
  if (!(size > 0) || size > MAX_BYTES) throw new CampusError("too_large", `Files must be under ${MAX_BYTES / 1024 / 1024} MB.`, 413);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXT.includes(ext)) throw new CampusError("blocked_type", "Executable files can't be uploaded.", 415);
  const courseId = input.courseId || null;
  if (courseId && input.purpose !== "submission") requireCourse(store, a, courseId, ["admin", "instructor", "ta", "designer"], "files.upload");
  if (courseId && input.purpose === "submission" && !hasAny(a, ["student"], courseId)) throw new CampusError("forbidden", "You're not a student in this course.", 403);
  const q = quotaBytes(store, input.purpose === "submission" ? null : courseId, a.id);
  if (q.used + size > q.limit) throw new CampusError("quota_exceeded", "Storage quota exceeded.", 507);
  return store.tx(() => {
    const f = store.insert("files", { name, mime: input.mime || "application/octet-stream", size, ownerId: a.id, courseId: input.purpose === "submission" ? null : courseId, submissionCourseId: input.purpose === "submission" ? courseId : null, folderId: input.folderId ?? null, purpose: input.purpose ?? (courseId ? "course" : "personal"), state: "pending_upload", objectKey: null, published: false }, "fil");
    audit(store, a, "files.request_upload", `files/${f.id}`);
    return { file: f, upload: signUrl(store.tenantId, "put", f.id) };
  });
}

/** Step 2: the signed PUT stores bytes in quarantine. */
export function receiveUpload(store: TenantStore, fileId: string, bytes: Buffer) {
  const f = store.get("files", fileId);
  if (!f || f.state !== "pending_upload") throw new CampusError("not_found", "No upload pending for this file.", 404);
  if (bytes.length > MAX_BYTES) throw new CampusError("too_large", "File too large", 413);
  return store.tx(() => {
    store.insert("objects", { id: `quarantine/${fileId}`, data: bytes.toString("base64") }, "obj");
    const out = store.update("files", fileId, { state: "quarantined", objectKey: `quarantine/${fileId}`, size: bytes.length, sha256: sha256(bytes.toString("binary")) });
    store.emit("files.uploaded", `files/${fileId}`, { fileId });
    return out;
  });
}

/** Content sniffing by magic numbers. */
export function sniff(bytes: Buffer): string {
  const hex = bytes.subarray(0, 8).toString("hex");
  if (hex.startsWith("25504446")) return "application/pdf";
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("47494638")) return "image/gif";
  if (hex.startsWith("504b0304")) return "application/zip";
  if (hex.startsWith("d0cf11e0a1b11ae1")) return "application/x-cfb"; // legacy Office (.doc, .xls, .ppt)
  if (hex.startsWith("4d5a")) return "application/x-msdownload";
  if (bytes.subarray(0, 4).toString() === "WEBV") return "text/vtt";
  if (hex.startsWith("000000") && bytes.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  const text = bytes.subarray(0, 512).toString("utf8");
  return /^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(text) ? "text/plain" : "application/octet-stream";
}

const COMPATIBLE: Record<string, string[]> = {
  "application/zip": ["application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/epub+zip"],
  "text/plain": ["text/plain", "text/csv", "text/markdown", "text/x-python", "text/x-python-script", "application/x-python-code", "application/x-ipynb+json", "text/x-r", "application/sql", "text/x-sql", "application/json", "text/vtt", "text/html", "application/xml", "text/xml"],
  "application/x-cfb": ["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"],
};

/** Scanner consumer: quarantine → scan → promote or reject. */
export function scanFile(store: TenantStore, fileId: string) {
  const f = store.get("files", fileId);
  if (!f || f.state !== "quarantined") return f;
  const obj = store.get("objects", `quarantine/${fileId}`);
  const bytes = Buffer.from(String(obj?.data ?? ""), "base64");
  const detected = sniff(bytes);
  let verdict: "clean" | "infected" | "mismatch" = "clean";
  if (bytes.toString("latin1").includes(EICAR) || detected === "application/x-msdownload") verdict = "infected";
  else {
    const declared = String(f.mime);
    const ok = declared === detected || (COMPATIBLE[detected] ?? []).includes(declared) || declared === "application/octet-stream";
    if (!ok) verdict = "mismatch";
  }
  const text = detected === "text/plain" ? bytes.toString("utf8") : "";
  const classification = /\b\d{3}-\d{2}-\d{4}\b/.test(text) ? "sensitive_pii" : "general";
  if (verdict === "clean") {
    store.insert("objects", { id: `objects/${fileId}`, data: obj?.data }, "obj");
    store.tombstone("objects", `quarantine/${fileId}`);
    store.update("files", fileId, { state: "available", detectedMime: detected, objectKey: `objects/${fileId}`, classification });
    store.emit("files.promoted", `files/${fileId}`, { fileId, courseId: f.courseId ?? null });
  } else {
    store.update("files", fileId, { state: verdict === "infected" ? "infected" : "rejected", detectedMime: detected, classification });
    store.emit("files.rejected", `files/${fileId}`, { fileId, verdict });
  }
  return store.get("files", fileId);
}

registerConsumer({ name: "file-scanner", types: ["files.uploaded"], handle: (store, e) => void scanFile(store, String(e.data.fileId)) });

export function canDownload(store: TenantStore, a: Actor, f: Row): boolean {
  if (f.state !== "available") return false;
  if (f.ownerId === a.id) return true;
  const courseId = (f.courseId ?? f.submissionCourseId) as string | null;
  if (!courseId) return a.roles.includes("admin");
  if (isStaff(a, courseId)) return true;
  if (f.submissionCourseId) return false; // other students' submissions
  const now = nowIso();
  if (!f.published && !f.hiddenLinkable) return false;
  if (f.availableFrom && String(f.availableFrom) > now) return false;
  if (f.availableUntil && String(f.availableUntil) < now) return false;
  if (f.folderId) {
    const folder = store.get("folders", f.folderId as string);
    if (folder && folder.state !== "published" && !folder.hiddenLinkable) return false;
  }
  return hasAny(a, ["student", "observer", "ta"], courseId);
}

export function downloadUrl(store: TenantStore, a: Actor, fileId: string) {
  const f = store.get("files", fileId);
  if (!f) throw new CampusError("not_found", "File not found", 404);
  if (f.state === "quarantined" || f.state === "pending_upload") throw new CampusError("not_ready", "This file is still being scanned.", 409);
  if (f.state !== "available") throw new CampusError("blocked", "This file failed the safety scan.", 410);
  if (!canDownload(store, a, f)) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "files.download", resource: `files/${fileId}`, outcome: "denied" });
    throw new CampusError("forbidden", "You can't open this file.", 403);
  }
  return signUrl(store.tenantId, "get", fileId);
}

export function readObject(store: TenantStore, fileId: string): { name: string; mime: string; bytes: Buffer } {
  const f = store.get("files", fileId);
  if (!f || f.state !== "available") throw new CampusError("not_found", "File not available", 404);
  const obj = store.get("objects", `objects/${fileId}`);
  return { name: f.name as string, mime: (f.detectedMime as string) ?? (f.mime as string), bytes: Buffer.from(String(obj?.data ?? ""), "base64") };
}

/** Publish a course file: usage rights are required. */
export function setFilePublished(store: TenantStore, a: Actor, fileId: string, published: boolean) {
  const f = store.get("files", fileId);
  if (!f?.courseId) throw new CampusError("not_found", "Course file not found", 404);
  requireCourse(store, a, f.courseId as string, ["admin", "instructor", "designer", "ta"], "files.publish");
  if (published && !f.usageRights) throw new CampusError("usage_rights_required", "Set usage rights before publishing this file.", 422);
  if (published && f.state !== "available") throw new CampusError("not_ready", "Only scanned, clean files can be published.", 409);
  return store.tx(() => {
    const out = store.update("files", fileId, { published });
    store.emit(published ? "files.published" : "files.unpublished", `files/${fileId}`, { fileId, courseId: f.courseId });
    audit(store, a, published ? "files.publish" : "files.unpublish", `files/${fileId}`);
    return out;
  });
}

export function bulkFiles(store: TenantStore, a: Actor, courseId: string, action: "move" | "delete" | "publish" | "unpublish", fileIds: string[], folderId?: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "designer", "ta"], `files.bulk_${action}`);
  return store.tx(() => {
    for (const id of fileIds) {
      const f = store.get("files", id);
      if (!f || f.courseId !== courseId) throw new CampusError("not_found", `File ${id} not in this course`, 404);
      if (action === "move") {
        if (folderId && store.get("folders", folderId)?.courseId !== courseId) throw new CampusError("invalid", "Folder isn't in this course", 422);
        store.update("files", id, { folderId: folderId ?? null });
      } else if (action === "delete") store.tombstone("files", id);
      else {
        if (action === "publish" && !f.usageRights) throw new CampusError("usage_rights_required", `"${f.name}" needs usage rights before publishing.`, 422);
        store.update("files", id, { published: action === "publish" });
      }
    }
    store.emit("files.bulk", `courses/${courseId}`, { action, count: fileIds.length });
    audit(store, a, `files.bulk_${action}`, `courses/${courseId}`, String(fileIds.length));
    return { ok: true, count: fileIds.length };
  });
}

/** Minimal ZIP (stored, no compression) for "download as zip". */
export function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, e.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function zipFiles(store: TenantStore, a: Actor, fileIds: string[]): Buffer {
  return zip(
    fileIds.map((id) => {
      const f = store.get("files", id);
      if (!f || !canDownload(store, a, f)) throw new CampusError("forbidden", "You can't download one of these files.", 403);
      const o = readObject(store, id);
      return { name: o.name, data: o.bytes };
    }),
  );
}

/* ---------------- Media ---------------- */

registerConsumer({
  name: "media-transcoder",
  types: ["media.created"],
  handle(store, e) {
    const m = store.get("media", String(e.data.id));
    if (!m) return;
    store.update("media", m.id, { renditions: [{ label: "1080p", bitrate: 5000 }, { label: "720p", bitrate: 2500 }, { label: "360p", bitrate: 800 }, { label: "HLS adaptive", manifest: `/api/campus/media/${m.id}/master.m3u8` }] });
  },
});

registerHooks("media", {
  beforeWrite(store, a, values, existing) {
    const fileId = (values.fileId ?? existing?.fileId) as string;
    const f = store.get("files", fileId);
    if (!f || f.state !== "available") throw new CampusError("invalid", "Choose a scanned, clean media file.", 422);
    if (values.captionException !== undefined && values.captionException) {
      if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins or designers can approve a caption exception.", 403);
      values.captionExceptionBy = a.id;
    }
  },
  publishChecks(store, row) {
    if (!hasCaptions(store, row.id) && !row.captionException) return ["Add captions (or record an approved exception) before students can see this media."];
    return [];
  },
});

registerHooks("caption_tracks", {
  beforeWrite(_s, _a, values) {
    const t = String(values.text ?? "");
    if (values.kind === "captions" && t && !t.startsWith("WEBVTT")) throw new CampusError("invalid", "Captions must be WebVTT (start with WEBVTT).", 422);
  },
});
