import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { getDb, nowIso, save } from "./store";
import type { Product, VideoNote } from "./types";
import { newId, PlatformError } from "./util";

/**
 * My Learning extras (LMS-owned learner data): a saved list for later, the explicit
 * Completed list, and private timestamped notes and bookmarks on lesson videos.
 */

const NOTE_MAX = 500;
const NOTES_PER_ITEM = 200;

export const library = {
  /* ---------------- Saved for later ---------------- */

  save(userId: string, productId: string): Product {
    const p = catalog.get(productId);
    if (!p) throw new PlatformError("not_found", "Program not found", 404);
    const db = getDb();
    if (!db.saved.some((s) => s.userId === userId && s.productId === p.id)) {
      db.saved.push({ userId, productId: p.id, createdAt: nowIso() });
      save();
    }
    return p;
  },

  unsave(userId: string, productId: string): void {
    const db = getDb();
    const p = catalog.get(productId);
    const id = p?.id ?? productId;
    const before = db.saved.length;
    db.saved = db.saved.filter((s) => !(s.userId === userId && s.productId === id));
    if (db.saved.length !== before) save();
  },

  isSaved(userId: string | null, productId: string): boolean {
    return !!userId && getDb().saved.some((s) => s.userId === userId && s.productId === productId);
  },

  /** Newest first; products that were unpublished since are left out. */
  saved(userId: string): { product: Product; savedAt: string }[] {
    return getDb()
      .saved.filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ product: catalog.get(s.productId), savedAt: s.createdAt }))
      .filter((x): x is { product: Product; savedAt: string } => !!x.product);
  },

  /* ---------------- Completed ---------------- */

  /**
   * Explicit completions: a passed course, a completed program, or an issued credential.
   * Taken from the LMS completion events and Credentials, never from progress estimates.
   */
  completed(userId: string): { product: Product; completedAt: string; credentialId: string | null }[] {
    const db = getDb();
    const out = new Map<string, { product: Product; completedAt: string; credentialId: string | null }>();
    const add = (productId: string, at: string) => {
      const product = catalog.get(productId);
      if (!product) return;
      const cred = db.credentials.find((c) => c.userId === userId && c.productId === product.id && !c.revokedAt);
      const prev = out.get(product.id);
      if (!prev || at < prev.completedAt) out.set(product.id, { product, completedAt: at, credentialId: cred?.id ?? null });
    };
    for (const e of db.events) {
      if (e.data.userId !== userId) continue;
      if (e.type === "lms.course.passed") add(String(e.data.courseId), e.time);
      else if (e.type === "lms.program.completed") add(String(e.data.productId), e.time);
    }
    for (const c of db.credentials) if (c.userId === userId && !c.revokedAt) add(c.productId, c.issuedAt);
    return [...out.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },

  /* ---------------- Video notes & bookmarks ---------------- */

  notes(userId: string, itemId: string): VideoNote[] {
    return getDb()
      .videoNotes.filter((n) => n.userId === userId && n.itemId === itemId)
      .sort((a, b) => a.atSec - b.atSec || a.createdAt.localeCompare(b.createdAt));
  },

  addNote(userId: string, itemId: string, input: { atSec: number; text?: string; kind?: string }): VideoNote {
    const item = catalog.item(itemId);
    if (!item || item.kind !== "video" || !item.video) throw new PlatformError("not_found", "Video not found", 404);
    if (!entitlements.check(userId, "content.view", item.courseId).allow) throw new PlatformError("not_enrolled", "Enroll to take notes on this lesson.", 403);
    const kind = input.kind === "bookmark" ? "bookmark" : "note";
    const atSec = Math.round(Number(input.atSec));
    if (!Number.isFinite(atSec) || atSec < 0 || atSec > item.video.durationSec) throw new PlatformError("invalid_time", "That time isn't in this video.");
    const text = (input.text ?? "").trim();
    if (kind === "note" && !text) throw new PlatformError("note_required", "Write something for your note.");
    if (text.length > NOTE_MAX) throw new PlatformError("note_too_long", `Notes can be up to ${NOTE_MAX} characters.`);
    const db = getDb();
    if (db.videoNotes.filter((n) => n.userId === userId && n.itemId === itemId).length >= NOTES_PER_ITEM) throw new PlatformError("too_many_notes", "You've reached the note limit for this lesson. Delete some to add more.");
    const n: VideoNote = { id: newId("vnt"), userId, itemId, courseId: item.courseId, kind, atSec, text: text || "Bookmark", createdAt: nowIso() };
    db.videoNotes.push(n);
    publish("lms.video_note.created", "lms", `user/${userId}`, { userId, noteId: n.id, itemId, kind });
    save();
    return n;
  },

  deleteNote(userId: string, noteId: string): VideoNote {
    const db = getDb();
    const n = db.videoNotes.find((x) => x.id === noteId && x.userId === userId);
    if (!n) throw new PlatformError("not_found", "Note not found", 404);
    db.videoNotes = db.videoNotes.filter((x) => x.id !== noteId);
    save();
    return n;
  },
};
