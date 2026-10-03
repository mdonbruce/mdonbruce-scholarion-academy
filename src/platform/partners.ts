import { getDb, nowIso } from "./store";
import type { Partner, PartnerUse, Product } from "./types";

/**
 * Partner Registry + claims checker (Integration Spec §15).
 * Nothing renders a partner name, credit statement, degree, salary or outcome claim
 * unless it traces to an active registry record or a cited, dated source.
 */

export const partners = {
  active(at = nowIso()): Partner[] {
    return getDb().partners.filter((p) => p.startsAt <= at && p.endsAt > at);
  },

  /** Partners that may be shown for a product and a specific use (logo, co_signature, …). */
  forProduct(product: Product, use: PartnerUse): Partner[] {
    return this.active().filter((p) => product.partnerIds.includes(p.id) && p.scope.productIds.includes(product.id) && p.scope.uses.includes(use));
  },
};

export interface ClaimIssue {
  rule: "partner_name" | "accreditation" | "credit" | "degree" | "salary" | "outcome_stat" | "learner_count" | "rating";
  match: string;
  message: string;
}

const RULES: { rule: ClaimIssue["rule"]; re: RegExp; message: string }[] = [
  { rule: "accreditation", re: /\baccredit(ed|ation)\b/gi, message: "Accreditation claims need an accredited partner agreement in the Partner Registry." },
  { rule: "degree", re: /\b(bachelor'?s|master'?s|associate'?s)?\s?degree(s)?\b/gi, message: "Degree offerings stay hidden until an accredited degree-granting partner signs." },
  { rule: "credit", re: /\b(college|academic|transfer(able)?|university)\s+credit(s)?\b|\bcredit\s+hours?\b|\bACE[- ]recommended\b/gi, message: "Credit statements need an evaluation report or articulation agreement on file." },
  { rule: "salary", re: /\$\s?\d{2,3}(,\d{3}|k)\b[^.]{0,40}\b(salary|per year|annually|\/yr|a year)\b|\b(salary|salaries|earn(ing)?s?)\b[^.]{0,30}\$\s?\d/gi, message: "Salary figures need a cited, dated primary source." },
  { rule: "outcome_stat", re: /\b\d{1,3}\s?%\s+of\s+(our\s+)?(graduates|learners|students|completers)\b|\bjob[- ]placement\b|\bguarantee(d)?\s+(a\s+)?job\b/gi, message: "Outcome statistics need real Scholarion data or a cited source; job guarantees are not allowed." },
  { rule: "learner_count", re: /\b\d[\d,.]*\s?(k|m|million|thousand)?\+?\s+(learners|students|enrollments)\b/gi, message: "Learner counts must come from live platform metrics." },
  { rule: "rating", re: /\b[1-5](\.\d)?\s?(\/\s?5|stars?|★)/gi, message: "Ratings must come from verified learner reviews." },
];

const INSTITUTION = /\b([A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,4})\s+(University|College|Institute|Polytechnic)\b|\b(University|College)\s+of\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/g;

/** Scan CMS drafts and product payloads before publish. Empty result = publishable. */
export function checkClaims(text: string, opts: { citedSources?: string[] } = {}): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const cited = (opts.citedSources ?? []).length > 0;
  for (const r of RULES) {
    if ((r.rule === "salary" || r.rule === "outcome_stat") && cited) continue;
    for (const m of text.matchAll(r.re)) issues.push({ rule: r.rule, match: m[0].trim(), message: r.message });
  }
  const registered = partners.active().map((p) => p.legalName.toLowerCase());
  for (const m of text.matchAll(INSTITUTION)) {
    const name = m[0].trim();
    if (!registered.some((r) => r.includes(name.toLowerCase()) || name.toLowerCase().includes(r))) {
      issues.push({ rule: "partner_name", match: name, message: "Institution names render only from an active Partner Registry agreement." });
    }
  }
  return issues;
}
