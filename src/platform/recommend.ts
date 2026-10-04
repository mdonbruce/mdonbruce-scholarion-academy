import { catalog } from "./catalog";
import { identity } from "./identity";
import { lms } from "./lms";
import { getDb, save } from "./store";
import type { Level, Product } from "./types";
import { PlatformError } from "./util";

/**
 * "Recommended next" (Spec §5.3 personalisation). Uses the learner's own onboarding
 * answers (goal, role, level, topics, weekly time) and enrollments, and explains every
 * suggestion in plain words. Learners can turn it off; nothing else is inferred.
 */

export interface Recommendation {
  product: Product;
  /** The main reason, e.g. "Because you chose Python". */
  because: string;
  reasons: string[];
  score: number;
}

const LEVEL_FIT: Record<string, Level[]> = {
  Beginner: ["Beginner", "Foundational"],
  Intermediate: ["Foundational", "Intermediate"],
  Advanced: ["Intermediate", "Advanced"],
};

const AI_RE = /\b(ai|agent|agentic|llm|machine learning|generative|prompt|rag)\b/i;

function text(p: Product): string {
  return [p.title, p.tagline, p.skills.join(" "), p.code ?? ""].join(" ").toLowerCase();
}

export const recommend = {
  enabled(userId: string): boolean {
    return !identity.getUser(userId)?.recommendationsOff;
  },

  setEnabled(userId: string, enabled: boolean): void {
    const u = getDb().users.find((x) => x.id === userId);
    if (!u) throw new PlatformError("not_found", "User not found", 404);
    u.recommendationsOff = enabled ? undefined : true;
    save();
  },

  forUser(userId: string, limit = 4): Recommendation[] {
    const u = identity.getUser(userId);
    if (!u || u.recommendationsOff) return [];
    const enrollments = lms.enrollmentsFor(userId);
    const taken = new Set(enrollments.flatMap((e) => [e.productId, e.courseId]));
    const scored = new Map<string, Recommendation>();
    const bump = (p: Product, points: number, reason: string) => {
      if (taken.has(p.id) || p.status !== "published") return;
      const r = scored.get(p.id) ?? { product: p, because: reason, reasons: [], score: 0 };
      r.score += points;
      if (!r.reasons.includes(reason)) r.reasons.push(reason);
      scored.set(p.id, r);
    };

    // 1. The program map: next steps from what they're taking.
    for (const e of enrollments) {
      const src = catalog.get(e.productId);
      for (const p of catalog.nextSteps(e.productId)) bump(p, 5, `Because you're taking ${src?.title ?? "a related course"}`);
    }

    // 2. Their onboarding answers.
    const o = u.onboarding;
    if (o) {
      const all = catalog.all();
      for (const p of all) {
        const hay = text(p);
        const topic = o.topics.find((t) => t.trim() && hay.includes(t.trim().toLowerCase()));
        if (topic) bump(p, 3, `Because you chose “${topic.trim()}”`);
        if (o.role && p.roles.includes(o.role)) bump(p, 3, `Because you chose the ${o.role} role`);
      }
      // Secondary signals only strengthen something that already matched (no "everything for beginners" lists).
      for (const r of scored.values()) {
        const p = r.product;
        if ((LEVEL_FIT[o.level] ?? []).includes(p.level)) {
          r.score += 2;
          r.reasons.push(`Matches your ${o.level.toLowerCase()} level`);
        }
        const goal = o.goal.toLowerCase();
        if (goal.includes("career") && ["professional_certificate", "specialization", "bundle"].includes(p.type)) {
          r.score += 2;
          r.reasons.push("Because your goal is to start a new career");
        } else if (goal.includes("ai skills") && (AI_RE.test(text(p)) || p.track === "Builder")) {
          r.score += 2;
          r.reasons.push("Because your goal is to build AI skills");
        } else if (goal.includes("fun") && p.freeToAudit) {
          r.score += 2;
          r.reasons.push("Free to audit, for learning at your own pace");
        } else if (goal.includes("current role") && (p.type === "course" || p.type === "guided_project")) {
          r.score += 2;
          r.reasons.push("A shorter option to grow in your current role");
        }
        if (o.hoursPerWeek > 0 && p.format === "self_paced") {
          const weeks = Math.max(1, Math.ceil(p.hours / o.hoursPerWeek));
          if (weeks <= 16) {
            r.score += 1;
            r.reasons.push(`About ${weeks} week${weeks === 1 ? "" : "s"} at your ${o.hoursPerWeek} hrs/week`);
          }
        }
      }
    }
    return [...scored.values()]
      .map((r) => ({ ...r, because: r.reasons[0] }))
      .sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title))
      .slice(0, limit);
  },
};
