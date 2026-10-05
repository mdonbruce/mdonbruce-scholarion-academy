import { CampusError, nowIso, nowMs, registerConsumer, token, type Row, type TenantStore } from "../core";
import { type Actor } from "../iam";
import { audit, isStaff, notify, requireCourse } from "./common";
import { decodeJwt, platformIssuer, rsaKey, signJwt, toolPublicPem, verifyJwt } from "./lti";

/**
 * Similarity review for assignment submissions (parity §3.5).
 *
 * When an assignment names a similarity tool, each submission queues a request
 * (`submissions.similarity_requested`). Two providers post results back:
 *  - The built-in Scholarion text-similarity provider compares the submission with every other
 *    submission to the same assignment (3-word shingles, Jaccard). It never contacts the internet.
 *  - A registered external tool posts a signed report (JWT signed with the tool's registered key)
 *    to `similarity.report`; the platform verifies the signature, the tool and the submission.
 * Results are a signal for a person to review — never an automatic penalty.
 */

export const BUILTIN_SIMILARITY_CLIENT = "scholarion-similarity";

export function ensureSimilarityTool(store: TenantStore): Row {
  const ex = store.list("tool_registrations", (t) => t.clientId === BUILTIN_SIMILARITY_CLIENT)[0];
  if (ex) return ex;
  rsaKey(store, "lti_tool");
  return store.insert("tool_registrations", { name: "Scholarion text similarity (built-in)", clientId: BUILTIN_SIMILARITY_CLIENT, issuer: BUILTIN_SIMILARITY_CLIENT, launchUrl: "internal://similarity", jwksUrl: null, services: ["similarity"], enabled: true, secretRef: "internal://similarity", deploymentId: "dep-similarity", builtIn: true }, "lti");
}

const shingles = (t: string) => {
  const w = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
};

/** Built-in provider: highest overlap with other students' submissions for the same assignment. */
export function builtinScore(store: TenantStore, sub: Row) {
  const mine = shingles(String(sub.body ?? ""));
  if (mine.size < 10) return { score: 0, matches: [] as { submissionId: string; pct: number }[], note: "Too little text to compare." };
  const matches: { submissionId: string; pct: number }[] = [];
  for (const o of store.list("submissions", (x) => x.assignmentId === sub.assignmentId && x.userId !== sub.userId && !!x.body)) {
    const theirs = shingles(String(o.body));
    if (theirs.size < 10) continue;
    let inter = 0;
    for (const x of mine) if (theirs.has(x)) inter++;
    const pct = Math.round((inter / mine.size) * 100);
    if (pct > 0) matches.push({ submissionId: o.id, pct });
  }
  matches.sort((a, b) => b.pct - a.pct);
  return { score: matches[0]?.pct ?? 0, matches: matches.slice(0, 5), note: "Overlap with other submissions in this course only. A signal for review, not a finding." };
}

function record(store: TenantStore, subId: string, result: { score: number; provider: string; reportUrl?: string | null; matches?: unknown[]; note?: string; status?: string }) {
  const sub = store.get("submissions", subId)!;
  const prev = (sub.similarity as Record<string, unknown>) ?? {};
  const out = store.update("submissions", subId, { similarity: { ...prev, status: result.status ?? "scored", score: result.score, provider: result.provider, reportUrl: result.reportUrl ?? null, matches: result.matches ?? [], note: result.note ?? null, scoredAt: nowIso() } });
  store.emit("submissions.similarity_scored", `submissions/${subId}`, { submissionId: subId, score: result.score });
  if (result.score >= 40) {
    const staff = store.list("enrollments", (e) => e.courseId === sub.courseId && ["instructor", "ta"].includes(String(e.role)) && e.state === "active").map((e) => String(e.userId));
    notify(store, staff, "submissions", "Similarity review suggested", `A submission shows ${result.score}% overlap. Review it in the grader.`, `/campus/{tenant}/courses/${sub.courseId}/grader?assignmentId=${sub.assignmentId}`, String(sub.courseId));
  }
  return out;
}

registerConsumer({
  name: "similarity-builtin",
  types: ["submissions.similarity_requested"],
  handle: (store, e) => {
    const tool = store.get("tool_registrations", String(e.data.toolId));
    if (!tool || tool.clientId !== BUILTIN_SIMILARITY_CLIENT) return; // external tools post back via similarity.report
    const sub = store.get("submissions", String(e.data.submissionId));
    if (!sub) return;
    const r = builtinScore(store, sub);
    store.tx(() => record(store, sub.id, { ...r, provider: String(tool.name) }));
  },
});

/** External tool posts a signed report. Claims: submission_id, score (0–100), report_url (https), status. */
export function receiveReport(store: TenantStore, jwt: string) {
  let d: ReturnType<typeof decodeJwt>;
  try {
    d = decodeJwt(jwt);
  } catch {
    throw new CampusError("invalid_token", "Malformed report token", 401);
  }
  const tool = store.list("tool_registrations", (t) => t.clientId === d.payload.iss)[0];
  if (!tool || !tool.enabled) throw new CampusError("invalid_token", "Unknown or disabled tool", 401);
  const p = verifyJwt(jwt, toolPublicPem(store, tool), { aud: platformIssuer(store) });
  const sub = store.get("submissions", String(p.submission_id ?? ""));
  const sim = (sub?.similarity as { toolId?: string } | undefined) ?? undefined;
  if (!sub || sim?.toolId !== tool.id) throw new CampusError("not_found", "No similarity request from this tool for that submission", 404);
  const score = Number(p.score);
  if (!(score >= 0 && score <= 100)) throw new CampusError("invalid", "score must be 0–100", 422);
  const reportUrl = p.report_url ? String(p.report_url) : null;
  if (reportUrl && !/^https:\/\//.test(reportUrl)) throw new CampusError("invalid", "report_url must be https", 422);
  const status = ["scored", "error", "pending"].includes(String(p.status)) ? String(p.status) : "scored";
  return store.tx(() => {
    const out = record(store, sub.id, { score: Math.round(score), provider: String(tool.name), reportUrl, status });
    store.audit({ actorId: `tool:${tool.clientId}`, actorRoles: [], action: "similarity.report", resource: `submissions/${sub.id}`, outcome: "allowed", reason: String(score) });
    return { submissionId: out.id, status, score: Math.round(score) };
  });
}

/** Staff re-run the built-in check (e.g. after more submissions arrive). */
export function rescan(store: TenantStore, a: Actor, submissionId: string) {
  const sub = store.get("submissions", submissionId);
  if (!sub) throw new CampusError("not_found", "Submission not found", 404);
  requireCourse(store, a, String(sub.courseId), ["admin", "instructor", "ta"], "similarity.rescan");
  const tool = ensureSimilarityTool(store);
  const r = builtinScore(store, sub);
  return store.tx(() => {
    if (!sub.similarity) store.update("submissions", sub.id, { similarity: { toolId: tool.id, status: "requested", requestedAt: nowIso() } });
    const out = record(store, sub.id, { ...r, provider: String(tool.name) });
    audit(store, a, "similarity.rescan", `submissions/${sub.id}`, String(r.score));
    return out.similarity;
  });
}

export function similarityFor(store: TenantStore, a: Actor, submissionId: string) {
  const sub = store.get("submissions", submissionId);
  if (!sub) throw new CampusError("not_found", "Submission not found", 404);
  if (!isStaff(a, String(sub.courseId)) && sub.userId !== a.id) throw new CampusError("forbidden", "Not yours", 403);
  const s = (sub.similarity as Record<string, unknown>) ?? null;
  if (!s) return null;
  // Learners see their score and the report link, never other students' submission ids.
  return isStaff(a, String(sub.courseId)) ? s : { status: s.status, score: s.score, provider: s.provider, reportUrl: s.reportUrl, note: s.note };
}

/** Test/sandbox helper: sign a report as the built-in tool key (stands in for an external tool). */
export function signToolReport(store: TenantStore, clientId: string, claims: Record<string, unknown>) {
  const k = rsaKey(store, "lti_tool");
  const now = Math.floor(nowMs() / 1000);
  return signJwt({ iss: clientId, aud: platformIssuer(store), iat: now, exp: now + 300, jti: token(8), ...claims }, String(k.privatePem), String(k.kid));
}
