import type { CapabilityStatus } from "./types";

/**
 * Capability status board (Integration Spec §16). Honest status for every connection.
 * In this codebase every platform service is an in-process stand-in → SIMULATED.
 * Flip an entry to CONNECTED only when its client calls the real service end to end.
 */

export interface Capability {
  key: string;
  name: string;
  phase: string;
  status: CapabilityStatus;
  implementation: string;
  fallback: string;
}

export function capabilities(): Capability[] {
  const runner = process.env.CLOUDLAB_LOCAL_RUNNER === "1";
  return [
    { key: "identity", name: "Identity & Entitlements", phase: "1", status: "SIMULATED", implementation: "Local accounts (scrypt), session cookie, entitlement resolver", fallback: "Cached entitlements, sign-in retry" },
    { key: "catalog", name: "Catalog & Pathways", phase: "1", status: "SIMULATED", implementation: "Seeded catalog, faceted search with synonyms and typo tolerance, pathway graph", fallback: "Last cached pages, keyword search" },
    { key: "lms", name: "LMS (video, readings, quizzes, grades)", phase: "1", status: "SIMULATED", implementation: "Enrollments, progress statements, autosaved attempts, gradebook, completion events", fallback: "Offline progress queue, quiz autosave" },
    { key: "commerce", name: "Commerce (sandbox)", phase: "2", status: "SIMULATED", implementation: "Sandbox checkout, trials, cancel, pause, refunds, financial aid queue", fallback: "Retry state; never grants access" },
    { key: "credentials", name: "Credentials & verification", phase: "2", status: "SIMULATED", implementation: "Ed25519-signed Open Badges 3.0-shaped VC, public verify, LinkedIn share", fallback: "\"Being issued\"; registry-only verify" },
    { key: "cloudlab", name: "Cloud Lab", phase: "3", status: runner ? "SIMULATED" : "DISABLED", implementation: runner ? "Local dev runner (Python with timeout + limits) — not isolated" : "Runner off (CLOUDLAB_LOCAL_RUNNER≠1)", fallback: "Queue + downloadable starter files" },
    { key: "tutor", name: "AI Tutor", phase: "3", status: "SIMULATED", implementation: "Lexical retrieval with citations; policy gate enforced server-side", fallback: "Panel hidden, \"Ask an instructor\"" },
    { key: "studio", name: "Studio outputs", phase: "3", status: "SIMULATED", implementation: "Deterministic flashcards and study guides; staff approval before publish", fallback: "Extras strip hidden" },
    { key: "havenconnect", name: "HavenConnect CX + HavenRoute", phase: "4", status: "SIMULATED", implementation: "Help-center agent, tickets, leads; email outbox (nothing sent)", fallback: "Contact form, email retry" },
    { key: "live", name: "Zoom/Webex live engine + admissions", phase: "4", status: "SIMULATED", implementation: "Applications with staff review and cohort capacity, seat reservation (full or 3 installments), onboarding, 40-minute segments, per-user links (example.invalid), attendance", fallback: "Switch provider, manual attendance" },
    { key: "teams", name: "Teams & organizations", phase: "4", status: "SIMULATED", implementation: "Seat purchase (sandbox), invites, org sign-in by email domain, curated programs, admin dashboard, CSV report; SAML/OIDC SSO and SCIM planned", fallback: "Invite links; seats keep working from entitlements" },
    { key: "community", name: "Discussions & peer review", phase: "3", status: "SIMULATED", implementation: "Threaded course discussions with reports and staff moderation; rubric peer review with calibration check", fallback: "Staff grading queue" },
    { key: "partners", name: "Partner Registry features (§15)", phase: "5+", status: "PLANNED", implementation: "Registry model + claims checker in place; no partner records", fallback: "Default Scholarion-only wording" },
    { key: "degrees", name: "Degrees section", phase: "5+", status: "PLANNED", implementation: "Route returns 404; product type hidden", fallback: "—" },
  ];
}
