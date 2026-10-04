import { CampusError, nowIso, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";

/**
 * Operational Acceptance (tab 66) — ported from governed/site/operational_acceptance.py.
 * An evidence register for the ten operational-acceptance areas. Evidence is recorded as
 * "submitted, unverified"; a different person verifies it. The register can never authorize a
 * production deployment by itself: production stays blocked until every area is verified and
 * the named owners sign off.
 */

export const EVIDENCE = "acceptance_evidence";
export const SIGNOFFS = "acceptance_signoffs";

export const AREAS: Record<string, string> = {
  functional: "End-to-end learner journey",
  performance: "Load at three times expected peak",
  resilience: "Service and dependency failure recovery",
  recovery: "RPO 15 minutes / RTO 4 hours restore drill",
  security: "Security assessment with no high or critical findings",
  integrity: "SIS/LMS reconciliation",
  accessibility: "Automated and manual accessibility checks",
  observability: "Owned alerts, dashboards and traces",
  operations: "On-call, runbooks and trained staff",
  compliance: "Published privacy, consent, retention and financial policies",
};
export const SIGNOFF_ROLES = ["Platform owner", "Security lead", "Academic operations"] as const;

const bad = (m: string) => new CampusError("invalid", m, 422);
const str = (v: unknown, name: string, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) throw bad(`${name} is required (at most ${max} characters).`);
  return s;
};

export function recordEvidence(store: TenantStore, a: Actor, input: { area: string; release: string; owner: string; reference: string; note: string }) {
  if (!hasAny(a, ["admin", "support", "designer"])) throw new CampusError("forbidden", "Staff only.", 403);
  if (!AREAS[input.area]) throw bad("Unknown acceptance area.");
  const row = store.tx(() => {
    const r = store.insert(EVIDENCE, { area: input.area, release: str(input.release, "Release", 120), owner: str(input.owner, "Owner", 120), reference: str(input.reference, "Reference", 1000), note: str(input.note, "Note", 2000), state: "submitted_unverified", by: a.id, verifiedBy: null }, "oae");
    store.emit("acceptance.evidence.submitted", `${EVIDENCE}/${r.id}`, { area: input.area, release: r.release });
    return r;
  });
  audit(store, a, "acceptance.evidence", `${EVIDENCE}/${row.id}`, input.area);
  return { id: row.id, state: row.state, productionAllowed: false };
}

/** A different person verifies or rejects the evidence. */
export function verifyEvidence(store: TenantStore, a: Actor, id: string, decision: "verified" | "rejected", note: string) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only admins verify evidence.", 403);
  const e = store.get(EVIDENCE, id);
  if (!e) throw new CampusError("not_found", "Evidence not found", 404);
  if (e.by === a.id) throw new CampusError("separation_of_duties", "The person who submitted evidence can't verify it.", 403);
  if (e.state !== "submitted_unverified") throw new CampusError("already_decided", "This evidence was already decided.", 409);
  const row = store.tx(() => store.update(EVIDENCE, id, { state: decision === "verified" ? "verified" : "rejected", verifiedBy: a.id, verifiedAt: nowIso(), verifyNote: str(note, "Note", 1000) }));
  audit(store, a, `acceptance.${decision}`, `${EVIDENCE}/${id}`);
  return row;
}

export function signOff(store: TenantStore, a: Actor, role: string, release: string) {
  if (!hasAny(a, ["admin", "registrar", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  if (!(SIGNOFF_ROLES as readonly string[]).includes(role)) throw bad("Unknown sign-off role.");
  if (store.list(SIGNOFFS, (s) => s.release === release && s.by === a.id).length) throw new CampusError("separation_of_duties", "Each sign-off must come from a different person.", 409);
  const row = store.tx(() => store.insert(SIGNOFFS, { role, release: str(release, "Release", 120), by: a.id, at: nowIso() }, "oas"));
  audit(store, a, "acceptance.signoff", `${SIGNOFFS}/${row.id}`, role);
  return row;
}

export function acceptanceStatus(store: TenantStore, a: Actor, release?: string) {
  if (!hasAny(a, ["admin", "support", "designer", "registrar"])) throw new CampusError("forbidden", "Staff only.", 403);
  const ev = store.list(EVIDENCE, (e) => !release || e.release === release).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const areas = Object.entries(AREAS).map(([id, name]) => {
    const rows = ev.filter((e) => e.area === id);
    const status = rows.some((e) => e.state === "verified") ? "verified" : rows.some((e) => e.state === "submitted_unverified") ? "submitted_unverified" : "not_verified";
    return { id, name, status, evidence: rows.length };
  });
  const signoffs = store.list(SIGNOFFS, (s) => !release || s.release === release).map((s) => ({ role: String(s.role), by: String(s.by), at: String(s.at), release: String(s.release) }));
  const missingSignoffs = SIGNOFF_ROLES.filter((r) => !signoffs.some((s) => s.role === r));
  const allVerified = areas.every((x) => x.status === "verified");
  const blockers = [
    ...areas.filter((x) => x.status !== "verified").map((x) => `${x.name}: ${x.status.replace(/_/g, " ")}`),
    ...missingSignoffs.map((r) => `${r} sign-off missing`),
    "Production deployment is a separate decision outside this register",
  ];
  return {
    liveness: "running",
    readiness: allVerified && !missingSignoffs.length ? "ready_for_go_live_review" : "blocked",
    productionAllowed: false,
    areas,
    evidence: ev.slice(0, 100).map((e) => ({ id: e.id, area: String(e.area), release: String(e.release), owner: String(e.owner), reference: String(e.reference), state: String(e.state), by: String(e.by), at: String(e.createdAt) })),
    signoffs,
    blockers,
  };
}
