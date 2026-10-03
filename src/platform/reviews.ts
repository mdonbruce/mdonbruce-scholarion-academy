import { publish } from "./bus";
import { catalog } from "./catalog";
import { identity } from "./identity";
import { checkClaims } from "./partners";
import { getDb, nowIso, save } from "./store";
import type { Review } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Verified learner reviews. Only someone holding a valid (unrevoked) credential for
 * the product can review it, once per product (editing replaces). Reviews with links,
 * contact details or claims the claims checker flags are held for moderation; three
 * reports from different learners also hold a review. Ratings are only aggregated
 * from published reviews, and structured-data ratings appear only when real reviews exist.
 */

const MIN_BODY = 30;
const MAX_BODY = 2000;
const MAX_TITLE = 100;
const REPORTS_TO_HOLD = 3;

export interface ReviewView {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  mine: boolean;
  reportedByMe: boolean;
  status: Review["status"];
}

export interface RatingSummary {
  count: number;
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/** Shows first name and last initial only. */
function displayName(userId: string): string {
  const u = identity.getUser(userId);
  if (!u) return "Former learner";
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

function holdReason(title: string, body: string): string | null {
  const text = `${title}\n${body}`;
  if (/https?:\/\/|www\.|\b[\w.-]+\.(com|net|org|io|ng)\b/i.test(text)) return "Contains a link";
  const phone = [...text.matchAll(/\+?\d[\d\s().-]{8,}\d/g)].some((m) => m[0].replace(/\D/g, "").length >= 10);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || phone) return "Contains contact details";
  // A learner's own star rating or headcount talk isn't a marketing claim; credit, salary, outcome and institution claims are held.
  const issues = checkClaims(text).filter((i) => i.rule !== "rating" && i.rule !== "learner_count");
  if (issues.length) return `Claims check: ${issues.map((i) => i.rule).join(", ")}`;
  return null;
}

function toView(r: Review, viewerId: string | null): ReviewView {
  return {
    id: r.id,
    author: displayName(r.userId),
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? null,
    mine: r.userId === viewerId,
    reportedByMe: !!viewerId && r.reports.includes(viewerId),
    status: r.status,
  };
}

export const reviews = {
  /** The credential that lets this learner review this product, if any. */
  eligibility(userId: string, productId: string): { credentialId: string } | null {
    const c = getDb().credentials.find((x) => x.userId === userId && x.productId === productId && !x.revokedAt);
    return c ? { credentialId: c.id } : null;
  },

  mine(userId: string, productId: string): Review | undefined {
    return getDb().reviews.find((r) => r.userId === userId && r.productId === productId && r.status !== "hidden");
  },

  submit(userId: string, input: { productId: string; rating: number; title: string; body: string }): Review {
    const db = getDb();
    const product = catalog.get(input.productId);
    if (!product) throw new PlatformError("not_found", "Program not found", 404);
    const elig = this.eligibility(userId, product.id);
    if (!elig) throw new PlatformError("not_eligible", "Reviews come only from learners who earned this credential.", 403);
    const rating = Math.round(Number(input.rating));
    if (!(rating >= 1 && rating <= 5)) throw new PlatformError("invalid_rating", "Choose a rating from 1 to 5 stars.");
    const title = (input.title ?? "").trim().slice(0, MAX_TITLE);
    const body = (input.body ?? "").trim();
    if (title.length < 3) throw new PlatformError("title_required", "Add a short title.");
    if (body.length < MIN_BODY) throw new PlatformError("too_short", `Write at least ${MIN_BODY} characters about your experience.`);
    if (body.length > MAX_BODY) throw new PlatformError("too_long", `Keep your review under ${MAX_BODY} characters.`);
    const hold = holdReason(title, body);
    const status: Review["status"] = hold ? "pending" : "published";
    const existing = db.reviews.find((r) => r.userId === userId && r.productId === product.id);
    if (existing) {
      if (existing.status === "hidden" && existing.moderatedBy) throw new PlatformError("removed", "Your review was removed by a moderator. Contact support if you think that's a mistake.", 403);
      Object.assign(existing, { rating, title, body, status, moderationNote: hold ?? undefined, reports: [], updatedAt: nowIso(), credentialId: elig.credentialId });
      save();
      publish("reviews.review.updated", "reviews", `product/${product.id}`, { reviewId: existing.id, productId: product.id, status });
      return existing;
    }
    const r: Review = { id: newId("rev"), userId, productId: product.id, credentialId: elig.credentialId, rating: rating as Review["rating"], title, body, status, moderationNote: hold ?? undefined, reports: [], createdAt: nowIso() };
    db.reviews.push(r);
    save();
    publish("reviews.review.submitted", "reviews", `product/${product.id}`, { reviewId: r.id, productId: product.id, userId, status });
    return r;
  },

  remove(userId: string, reviewId: string): void {
    const db = getDb();
    const i = db.reviews.findIndex((r) => r.id === reviewId && r.userId === userId);
    if (i < 0) throw new PlatformError("not_found", "Review not found", 404);
    db.reviews.splice(i, 1);
    save();
  },

  report(reviewId: string, userId: string): Review {
    const r = getDb().reviews.find((x) => x.id === reviewId);
    if (!r || r.status !== "published") throw new PlatformError("not_found", "Review not found", 404);
    if (r.userId === userId) throw new PlatformError("own_review", "You can't report your own review.");
    if (!r.reports.includes(userId)) r.reports.push(userId);
    if (r.reports.length >= REPORTS_TO_HOLD) {
      r.status = "pending";
      r.moderationNote = `Reported by ${r.reports.length} learners`;
    }
    save();
    return r;
  },

  moderate(reviewId: string, moderatorId: string, action: "publish" | "hide", note?: string): Review {
    const mod = identity.getUser(moderatorId);
    if (!mod || !(identity.hasRole(mod, "support_agent") || identity.hasRole(mod, "instructor"))) throw new PlatformError("forbidden", "Only staff can moderate reviews.", 403);
    const r = getDb().reviews.find((x) => x.id === reviewId);
    if (!r) throw new PlatformError("not_found", "Review not found", 404);
    r.status = action === "publish" ? "published" : "hidden";
    r.moderatedBy = moderatorId;
    r.moderationNote = note?.trim() || (action === "publish" ? "Approved" : "Removed by moderator");
    if (action === "publish") r.reports = [];
    save();
    publish("reviews.review.moderated", "reviews", `product/${r.productId}`, { reviewId: r.id, action });
    return r;
  },

  queue(): (Review & { productTitle: string; author: string })[] {
    return getDb()
      .reviews.filter((r) => r.status === "pending")
      .map((r) => ({ ...r, productTitle: catalog.get(r.productId)?.title ?? r.productId, author: displayName(r.userId) }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  forProduct(productId: string, viewerId: string | null, sort: "recent" | "highest" | "lowest" = "recent"): ReviewView[] {
    const list = getDb().reviews.filter((r) => r.productId === productId && (r.status === "published" || (viewerId && r.userId === viewerId && r.status === "pending")));
    const cmp: Record<typeof sort, (a: Review, b: Review) => number> = {
      recent: (a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
      highest: (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
      lowest: (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
    };
    return list.sort(cmp[sort]).map((r) => toView(r, viewerId));
  },

  summary(productId: string): RatingSummary {
    const pub = getDb().reviews.filter((r) => r.productId === productId && r.status === "published");
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary["distribution"];
    for (const r of pub) distribution[r.rating]++;
    const average = pub.length ? Math.round((pub.reduce((s, r) => s + r.rating, 0) / pub.length) * 10) / 10 : null;
    return { count: pub.length, average, distribution };
  },

  /** Revoking a credential takes its review down too. */
  onCredentialRevoked(credentialId: string): void {
    for (const r of getDb().reviews) if (r.credentialId === credentialId && r.status !== "hidden") {
      r.status = "hidden";
      r.moderationNote = "Credential revoked";
    }
    save();
  },
};
