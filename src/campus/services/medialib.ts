import { CampusError, type Row, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { audit, isStaff } from "./common";

/**
 * Personal media library (parity §2). People keep their own audio/video (uploaded or recorded in
 * the browser), add captions, and share an item with specific people or into a course they
 * teach. Sharing never copies bytes: course items point at the same scanned file.
 */

const MEDIA_MIME = /^(audio|video)\//;

export function addToLibrary(store: TenantStore, a: Actor, input: { fileId: string; title?: string }) {
  const f = store.get("files", input.fileId);
  if (!f || f.ownerId !== a.id) throw new CampusError("not_found", "File not found in your files", 404);
  if (f.state !== "available") throw new CampusError("not_ready", "The file hasn't passed the safety scan yet.", 409);
  const mime = String(f.detectedMime ?? f.mime);
  if (!MEDIA_MIME.test(mime) && !MEDIA_MIME.test(String(f.mime))) throw new CampusError("invalid", "Only audio and video go in the media library.", 422);
  const title = String(input.title ?? f.name).trim().slice(0, 120) || "Recording";
  return store.tx(() => {
    const m = store.insert("media", { courseId: null, ownerId: a.id, scope: "personal", title, fileId: f.id, state: "available", sharedWith: [], renditions: [] }, "med");
    audit(store, a, "media.add", `media/${m.id}`);
    return m;
  });
}

function canSee(store: TenantStore, a: Actor, m: Row) {
  if (m.ownerId === a.id) return true;
  if (((m.sharedWith as string[]) ?? []).includes(a.id)) return true;
  if (m.courseId) return isStaff(a, String(m.courseId)) || (a.courseRoles[String(m.courseId)] ?? []).length > 0;
  return false;
}

export function myLibrary(store: TenantStore, a: Actor) {
  const view = (m: Row) => ({ id: m.id, title: String(m.title), fileId: String(m.fileId), owner: String(store.get("users", String(m.ownerId))?.name ?? ""), mine: m.ownerId === a.id, course: m.courseId ? String(store.get("courses", String(m.courseId))?.code ?? "") : null, captions: store.list("caption_tracks", (c) => c.mediaId === m.id).map((c) => ({ id: c.id, language: String(c.language), kind: String(c.kind) })), sharedWith: ((m.sharedWith as string[]) ?? []).length });
  return {
    mine: store.list("media", (m) => m.ownerId === a.id && m.scope === "personal").map(view),
    sharedWithMe: store.list("media", (m) => m.ownerId !== a.id && ((m.sharedWith as string[]) ?? []).includes(a.id)).map(view),
  };
}

export function shareMedia(store: TenantStore, a: Actor, mediaId: string, input: { userIds?: string[]; courseId?: string }) {
  const m = store.get("media", mediaId);
  if (!m || m.ownerId !== a.id) throw new CampusError("not_found", "Media not found in your library", 404);
  return store.tx(() => {
    let courseCopy: Row | null = null;
    if (input.courseId) {
      if (!isStaff(a, input.courseId)) throw new CampusError("forbidden", "You can share into courses you teach.", 403);
      courseCopy = store.insert("media", { courseId: input.courseId, ownerId: a.id, scope: "course", title: m.title, fileId: m.fileId, state: "unpublished", sourceMediaId: m.id, sharedWith: [], renditions: [] }, "med");
      for (const c of store.list("caption_tracks", (x) => x.mediaId === m.id)) store.insert("caption_tracks", { courseId: input.courseId, mediaId: courseCopy.id, language: c.language, kind: c.kind, text: c.text }, "cap");
    }
    const users = (input.userIds ?? []).filter((u) => u !== a.id && store.get("users", u));
    const updated = users.length ? store.update("media", m.id, { sharedWith: [...new Set([...((m.sharedWith as string[]) ?? []), ...users])] }) : m;
    audit(store, a, "media.share", `media/${m.id}`, `${users.length} people${courseCopy ? ` + course ${input.courseId}` : ""}`);
    return { media: updated, courseMediaId: courseCopy?.id ?? null };
  });
}

export function addCaptions(store: TenantStore, a: Actor, mediaId: string, input: { language: string; text: string; kind?: "captions" | "transcript" }) {
  const m = store.get("media", mediaId);
  if (!m) throw new CampusError("not_found", "Media not found", 404);
  if (m.ownerId !== a.id && !(m.courseId && isStaff(a, String(m.courseId)))) throw new CampusError("forbidden", "Only the owner (or course staff) adds captions.", 403);
  const kind = input.kind ?? "captions";
  if (kind === "captions" && !/^WEBVTT/.test(String(input.text).trim())) throw new CampusError("invalid", "Captions must be WebVTT (start with WEBVTT).", 422);
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(input.language)) throw new CampusError("invalid", "Language like en or es-MX.", 422);
  return store.tx(() => store.insert("caption_tracks", { courseId: m.courseId ?? null, mediaId: m.id, language: input.language, kind, text: input.text }, "cap"));
}

export function mediaForPlayback(store: TenantStore, a: Actor, mediaId: string) {
  const m = store.get("media", mediaId);
  if (!m || !canSee(store, a, m)) throw new CampusError("not_found", "Media not found", 404);
  return { id: m.id, title: String(m.title), fileId: String(m.fileId), tracks: store.list("caption_tracks", (c) => c.mediaId === m.id && c.kind === "captions").map((c) => ({ id: c.id, language: String(c.language) })) };
}
