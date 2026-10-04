/**
 * Product-owner decisions for Scholaris AI Academy, recorded in code so every environment
 * (local, staging, a reseed) applies the same choices. Each entry names who decided and when.
 */

export const DECIDED_BY = "Product owner (Lead Faculty, Scholaris AI Academy)";

export const DECISIONS = {
  /** Self-paced access: every self-paced product offers all three models. */
  accessModel: {
    decidedOn: "2026-10-04",
    models: ["audit", "paid", "subscription"] as const,
    summary: "Self-paced products offer a free audit (content open, graded work and the credential locked), purchase per product, and the Scholaris Plus subscription.",
  },
  /** Refund, deferral and batch-change policy text approved as written in Tab 52. */
  policies: { decidedOn: "2026-10-04", approved: ["refund", "deferral", "batch_change"] as const },
  /** Catalog consolidation report (#1–#38) approved; recommendations stand as written. */
  consolidation: { decidedOn: "2026-10-04", note: "Approved by the product owner. Recommendations stand as written; the only open item is how #13 relates to #9." },
  /** Proposed #27 MLOps & LLMOps: approved to build. */
  build27: { decidedOn: "2026-10-04" },
};

export const decisionIso = (d: string) => `${d}T12:00:00.000Z`;

/** What the product owner has decided, for the consolidation report and Tab 52. */
export const DECISION_LOG = [
  `Self-paced access model: free audit, pay per product and Scholaris Plus subscription — all three offered (${DECISIONS.accessModel.decidedOn}).`,
  `Refund, deferral and batch-change policy text approved (${DECISIONS.policies.decidedOn}).`,
  `Catalog consolidation report approved (${DECISIONS.consolidation.decidedOn}).`,
  `#27 Certificate in MLOps & LLMOps approved and built (${DECISIONS.build27.decidedOn}).`,
];
