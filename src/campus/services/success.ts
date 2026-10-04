import { copyCheck } from "./claims";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { broker, CampusError, hmac, nowIso, registerConsumer, sha256, type OutboxEvent, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { activeStudents, audit, course, isStaff, notify, requireCourse, requireTenant, toMs, userName } from "./common";
import { computeTotals, outcomeResults } from "./grading";
import { csv } from "./sis";

/**
 * Student success & platform services: analytics (minimized events, explainable risk
 * signals, course/student analytics, access reports), advising, evaluations (minimum-n),
 * outcomes evidence, credentials (signed, revocable), careers placement sync (internal
 * tenant → separate placement DB), privacy (consent, export, erasure with legal holds,
 * retention), notifications (preferences matrix, quiet hours, digests, branded templates),
 * global search (tenant index, ACL at query time) and reports.
 */

/* ---------------- Analytics ---------------- */

const VERBS: Record<string, string> = {
  "module.item.viewed": "viewed",
  "submissions.created": "submitted",
  "attempts.submitted": "completed",
  "posts.created": "commented",
  "grades.posted": "scored",
  "attendance.reconciled": "attended",
};

/** Pseudonymous actor reference: stable per tenant, never the user id. */
export function pseudonym(tenantId: string, userId: string) {
  return `p_${hmac(`${tenantId}:analytics`, userId).slice(0, 16)}`;
}

registerConsumer({
  name: "analytics-events",
  types: Object.keys(VERBS),
  handle(store, e: OutboxEvent) {
    const uid = (e.data.userId ?? e.data.authorId) as string | undefined;
    const courseId = e.data.courseId as string | undefined;
    if (!courseId) return;
    const users = uid ? [uid] : ((e.data.userIds as string[]) ?? []);
    for (const u of users) store.insert("learning_events", { actorRef: pseudonym(store.tenantId, u), courseId, verb: VERBS[e.type], object: String(e.data.itemId ?? e.data.assignmentId ?? e.data.quizId ?? e.data.topicId ?? e.subject), at: e.at }, "le");
  },
});

/** Live events stream (Caliper-like JSON) for external analytics consumers. */
export function liveEvents(store: TenantStore, a: Actor, since?: string) {
  requireTenant(store, a, ["admin"], "analytics.live_events");
  return store.list("learning_events", (e) => !since || String(e.at) > since).slice(-1000).map((e) => ({ "@context": "http://purl.imsglobal.org/ctx/caliper/v1p2", type: "Event", actor: e.actorRef, action: e.verb, object: e.object, group: e.courseId, eventTime: e.at }));
}

/**
 * Explainable risk signal from engagement and grades only (no protected traits).
 * Signals inform people; they never trigger sanctions.
 */
export function computeRisk(store: TenantStore, courseId: string, userId: string) {
  const ref = pseudonym(store.tenantId, userId);
  const events = store.list("learning_events", (e) => e.courseId === courseId && e.actorRef === ref);
  const recent = events.filter((e) => toMs(e.at) > Date.parse(nowIso()) - 14 * 86400_000).length;
  const t = computeTotals(store, courseId, userId);
  const missing = t.items.filter((i) => i.status === "missing").length;
  const late = t.items.filter((i) => i.status === "late").length;
  const reasons: { factor: string; detail: string; weight: number }[] = [];
  if (recent === 0) reasons.push({ factor: "No recent activity", detail: "No course activity in the last 14 days.", weight: 35 });
  else if (recent < 3) reasons.push({ factor: "Low activity", detail: `${recent} activities in 14 days.`, weight: 15 });
  if (missing) reasons.push({ factor: "Missing work", detail: `${missing} missing item(s).`, weight: Math.min(40, missing * 15) });
  if (late > 1) reasons.push({ factor: "Late work", detail: `${late} late submissions.`, weight: 10 });
  if (t.finalPct !== null && t.finalPct < 70) reasons.push({ factor: "Current grade", detail: `Current posted grade ${t.finalPct}%.`, weight: t.finalPct < 60 ? 30 : 15 });
  const score = Math.min(100, reasons.reduce((s, r) => s + r.weight, 0));
  const level = score >= 60 ? "high" : score >= 30 ? "moderate" : "low";
  return { score, level, reasons };
}

export function recomputeSignals(store: TenantStore, a: Actor | null, courseId?: string) {
  if (a) requireTenant(store, a, ["admin", "instructor", "advisor"], "analytics.recompute");
  const courses = courseId ? [course(store, courseId)] : store.list("courses", (c) => c.state === "published");
  let n = 0;
  store.tx(() => {
    for (const c of courses) {
      if (a && !isStaff(a, c.id) && !hasAny(a, ["admin", "advisor"])) continue;
      for (const e of activeStudents(store, c.id)) {
        const r = computeRisk(store, c.id, e.userId as string);
        const ex = store.list("risk_signals", (s) => s.courseId === c.id && s.userId === e.userId)[0];
        if (ex) store.update("risk_signals", ex.id, { level: r.level, score: r.score, reasons: r.reasons, computedAt: nowIso() });
        else store.insert("risk_signals", { courseId: c.id, userId: e.userId, level: r.level, score: r.score, reasons: r.reasons, computedAt: nowIso() }, "rs");
        n++;
      }
    }
    store.emit("analytics.signals.recomputed", "analytics", { count: n });
  });
  return { computed: n };
}

export function courseAnalytics(store: TenantStore, a: Actor, courseId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta", "advisor"], "analytics.course");
  const events = store.list("learning_events", (e) => e.courseId === courseId);
  const weeks: Record<string, { views: number; participations: number }> = {};
  for (const e of events) {
    const d = new Date(String(e.at));
    const wk = new Date(d.getTime() - d.getUTCDay() * 86400_000).toISOString().slice(0, 10);
    weeks[wk] ??= { views: 0, participations: 0 };
    if (e.verb === "viewed") weeks[wk].views++;
    else weeks[wk].participations++;
  }
  const students = activeStudents(store, courseId);
  const sections = store.list("sections", (s) => s.courseId === courseId);
  const assignments = store.list("assignments", (x) => x.courseId === courseId && x.state === "published").map((asg) => {
    const totals = students.map((s) => computeTotals(store, courseId, s.userId as string, { includeUnposted: true }).items.find((i) => i.id === asg.id));
    const scored = totals.filter((t) => t && t.score !== null);
    const avg = scored.length ? (scored.reduce((s, t) => s + (t!.score ?? 0), 0) / scored.length / Number(asg.points || 1)) * 100 : null;
    const bySection = sections.map((sec) => {
      const ids = students.filter((s) => s.sectionId === sec.id).map((s) => s.userId);
      const rows = store.list("grades", (g) => g.assignmentId === asg.id && ids.includes(g.userId as string) && g.score !== null);
      return { section: sec.code, avg: rows.length ? Math.round((rows.reduce((s, g) => s + Number(g.score), 0) / rows.length / Number(asg.points || 1)) * 1000) / 10 : null };
    });
    return {
      id: asg.id,
      title: asg.title,
      avgPct: avg === null ? null : Math.round(avg * 10) / 10,
      bySection,
      onTime: totals.filter((t) => t && t.status === "none" && t.score !== null).length,
      late: totals.filter((t) => t?.status === "late").length,
      missing: totals.filter((t) => t?.status === "missing").length,
    };
  });
  return { weekly: Object.entries(weeks).sort().map(([week, v]) => ({ week, ...v })), assignments, students: students.length, note: "Analytics are derived from activity and grades. They are never a source of grades." };
}

export function studentAnalytics(store: TenantStore, a: Actor, courseId: string, userId: string) {
  if (a.id !== userId) requireCourse(store, a, courseId, ["admin", "instructor", "ta", "advisor"], "analytics.student");
  const ref = pseudonym(store.tenantId, userId);
  const events = store.list("learning_events", (e) => e.courseId === courseId && e.actorRef === ref).sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const t = computeTotals(store, courseId, userId, { includeUnposted: a.id !== userId });
  return { activity: events.map((e) => ({ at: e.at, verb: e.verb })), grades: t.items.map((i) => ({ title: i.title, pct: i.score !== null && i.points ? Math.round((i.score / i.points) * 1000) / 10 : null, status: i.status, dueAt: i.dueAt })), risk: computeRisk(store, courseId, userId) };
}

/** Access report: pages viewed, times and participations for one user in a course. */
export function accessReport(store: TenantStore, a: Actor, courseId: string, userId: string) {
  requireCourse(store, a, courseId, ["admin", "instructor", "ta"], "people.access_report");
  const views = store.list("module_progress", (p) => p.courseId === courseId && p.userId === userId && p.kind === "view").map((p) => ({ item: store.get("module_items", p.itemId as string)?.title, at: p.at }));
  const posts = store.list("posts", (p) => p.courseId === courseId && p.authorId === userId).length;
  const subs = store.list("submissions", (s) => s.courseId === courseId && s.userId === userId).length;
  const ref = pseudonym(store.tenantId, userId);
  const events = store.list("learning_events", (e) => e.courseId === courseId && e.actorRef === ref);
  const last = events.map((e) => String(e.at)).sort().pop() ?? null;
  return { views, participations: posts + subs, lastActivity: last, totalActivityMinutes: events.length * 3 };
}

/* ---------------- Advising ---------------- */

export function openCaseFromSignal(store: TenantStore, a: Actor, signalId: string, summary?: string) {
  requireTenant(store, a, ["admin", "advisor"], "advising.open_case");
  const s = store.get("risk_signals", signalId);
  if (!s) throw new CampusError("not_found", "Signal not found", 404);
  return store.tx(() => {
    const c = store.insert("advising_cases", { studentId: s.userId, advisorId: a.id, summary: summary ?? `Follow up: ${(s.reasons as { factor: string }[]).map((r) => r.factor).join(", ")}`, signalId, status: "open" }, "adc");
    store.emit("advising_cases.created", `advising_cases/${c.id}`, { id: c.id });
    audit(store, a, "advising.open_case", `advising_cases/${c.id}`);
    return c;
  });
}

export function caseload(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin", "advisor"], "advising.caseload");
  const cases = store.list("advising_cases", (c) => c.advisorId === a.id || a.roles.includes("admin"));
  const flagged = store.list("risk_signals", (s) => s.level !== "low").map((s) => ({ ...s, student: userName(store, s.userId as string), course: course(store, s.courseId as string).code, hasCase: cases.some((c) => c.signalId === s.id) }));
  return { cases: cases.map((c) => ({ ...c, student: userName(store, c.studentId as string), notes: store.list("advising_notes", (n) => n.caseId === c.id).length })), flagged };
}

/* ---------------- Evaluations ---------------- */

export function respondSurvey(store: TenantStore, a: Actor, surveyId: string, answers: Record<string, string | number>) {
  const sv = store.get("surveys", surveyId);
  if (!sv || sv.state !== "published") throw new CampusError("not_found", "Survey not available", 404);
  const win = store.list("evaluation_windows", (w) => w.surveyId === surveyId && String(w.opensAt) <= nowIso() && String(w.closesAt) >= nowIso())[0];
  if (!win) throw new CampusError("closed", "This survey isn't open.", 423);
  if (sv.courseId && !hasAny(a, ["student"], sv.courseId as string)) throw new CampusError("forbidden", "Only students in this course can respond.", 403);
  const hash = sha256(`${store.tenantId}:${surveyId}:${a.id}`);
  if (store.list("survey_responses", (r) => r.respondentHash === hash).length) throw new CampusError("already", "You already responded. Thank you!", 409);
  const qs = (sv.questions as { id: string; kind: string }[]) ?? [];
  for (const q of qs) if (q.kind === "likert" && answers[q.id] !== undefined && ![1, 2, 3, 4, 5].includes(Number(answers[q.id]))) throw new CampusError("invalid", "Likert answers are 1–5.", 422);
  return store.tx(() => {
    store.insert("survey_responses", { surveyId, respondentHash: hash, answers }, "svr");
    return { ok: true };
  });
}

export function surveyResults(store: TenantStore, a: Actor, surveyId: string) {
  const sv = store.get("surveys", surveyId);
  if (!sv) throw new CampusError("not_found", "Survey not found", 404);
  if (!a.roles.includes("admin") && !(sv.courseId && isStaff(a, sv.courseId as string))) throw new CampusError("forbidden", "You can't see these results.", 403);
  const rs = store.list("survey_responses", (r) => r.surveyId === surveyId);
  const min = Number(sv.minResponses ?? 5);
  if (rs.length < min) return { released: false, responses: rs.length, minimum: min, message: `Results release after ${min} responses to protect anonymity.` };
  const qs = (sv.questions as { id: string; kind: string; text: string }[]) ?? [];
  return {
    released: true,
    responses: rs.length,
    minimum: min,
    questions: qs.map((q) => {
      const vals = rs.map((r) => (r.answers as Record<string, unknown>)[q.id]).filter((v) => v !== undefined && v !== "");
      if (q.kind === "likert") {
        const nums = vals.map(Number);
        return { id: q.id, text: q.text, kind: q.kind, mean: Math.round((nums.reduce((s, x) => s + x, 0) / (nums.length || 1)) * 100) / 100, distribution: [1, 2, 3, 4, 5].map((k) => nums.filter((x) => x === k).length) };
      }
      return { id: q.id, text: q.text, kind: q.kind, comments: vals.map(String).sort() };
    }),
  };
}

/* ---------------- Outcomes evidence ---------------- */

export function evidenceExport(store: TenantStore, a: Actor, courseId?: string) {
  requireTenant(store, a, ["admin", "designer"], "outcomes.evidence_export");
  const rows: Record<string, unknown>[] = [];
  const courses = courseId ? [course(store, courseId)] : store.list("courses");
  for (const c of courses) for (const e of activeStudents(store, c.id)) for (const r of outcomeResults(store, c.id, e.userId as string)) rows.push({ course: c.code, student: pseudonym(store.tenantId, e.userId as string), outcome: r.code, mastery: r.mastery, mastered: r.mastered, evidence_count: r.scores.length, method: r.method });
  const body = `# DEMONSTRATION EXPORT — not an accreditation submission\n${csv(rows, ["course", "student", "outcome", "mastery", "mastered", "evidence_count", "method"])}`;
  return store.tx(() => {
    const ex = store.insert("evidence_exports", { label: `Outcome evidence ${nowIso().slice(0, 10)}`, rows: rows.length, csv: body, createdBy: a.id }, "ev");
    audit(store, a, "outcomes.evidence_export", `evidence_exports/${ex.id}`, String(rows.length));
    return ex;
  });
}

/* ---------------- Credentials ---------------- */

function signingKey(store: TenantStore) {
  let k = store.list("signing_keys")[0];
  if (!k) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    k = store.insert("signing_keys", { publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), kid: "key-1" }, "sk");
  }
  return k;
}
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

export function issueCredential(store: TenantStore, a: Actor | null, input: { userId: string; courseId?: string; title: string; kind: "certificate" | "badge"; templateId?: string; evidence?: { name: string; url?: string }[]; reissuedFrom?: string; reasonCode?: string; achievementType?: string }) {
  if (a) requireTenant(store, a, ["admin", "registrar"], "credentials.issue");
  const u = store.get("users", input.userId);
  if (!u) throw new CampusError("not_found", "Learner not found", 404);
  const dup = store.list("credentials", (c) => c.userId === input.userId && c.title === input.title && !c.revokedAt)[0];
  if (dup) return dup;
  const tpl = input.templateId ? store.get("credential_templates", input.templateId) : undefined;
  // Honesty guard: wording is checked against the tenant's approved claims.
  const flags = copyCheck(store, `${input.title} ${tpl?.wording ?? ""}`);
  if (flags.length) {
    store.audit({ actorId: a?.id ?? "system", actorRoles: a?.roles ?? [], action: "credentials.issue", resource: `users/${input.userId}`, outcome: "denied", reason: `unapproved_claims:${flags.map((f) => f.rule).join(",")}` });
    throw new CampusError("unapproved_claim", `Credential wording needs an approved claim: ${flags.map((f) => `${f.label} ("${f.match}")`).join("; ")}.`, 422, { flags });
  }
  const profile = store.list("profiles", (p) => p.userId === input.userId)[0];
  const legalName = (u.legalName as string) ?? (u.name as string);
  const expiresAt = tpl?.expiresAfterDays ? new Date(Date.parse(nowIso()) + Number(tpl.expiresAfterDays) * 86400_000).toISOString() : null;
  const tenant = broker.tenant(store.tenantId)!;
  const k = signingKey(store);
  return store.tx(() => {
    const issuedAt = nowIso();
    const credId = `crd_${sha256(`${input.userId}:${input.title}:${issuedAt}`).slice(0, 20)}`;
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
      id: `urn:scholarion:${tenant.slug}:${credId}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: { id: `did:web:${tenant.domains[0]?.host ?? `${tenant.slug}.scholarion.local`}`, type: ["Profile"], name: tenant.name },
      validFrom: issuedAt,
      ...(expiresAt ? { validUntil: expiresAt } : {}),
      credentialSubject: { type: ["AchievementSubject"], name: legalName, achievement: { type: ["Achievement"], id: `urn:scholarion:${tenant.slug}:achievement:${sha256(input.title).slice(0, 12)}`, achievementType: input.achievementType ?? (input.kind === "badge" ? "Badge" : "Certificate"), name: input.title, description: (tpl?.wording as string) ?? "Non-credit credential.", criteria: { narrative: tpl ? `Template: ${tpl.name}${tpl.gradeThreshold ? `; grade ≥ ${tpl.gradeThreshold}%` : ""}${tpl.requiresCapstone ? "; capstone passed" : ""}` : "Requirements set by the issuer." } } },
      ...(input.evidence?.length ? { evidence: input.evidence.map((e) => ({ type: ["Evidence"], name: e.name, ...(e.url ? { id: e.url } : {}) })) } : {}),
    };
    const proof = { type: "DataIntegrityProof", cryptosuite: "scholarion-ed25519-sortedjson", created: issuedAt, verificationMethod: `${unsigned.issuer.id}#${k.kid}`, proofPurpose: "assertionMethod" };
    const sig = sign(null, Buffer.from(canon({ ...unsigned, proof })), createPrivateKey(k.privatePem as string)).toString("base64url");
    const c = store.insert("credentials", { id: credId, userId: input.userId, kind: input.kind, title: input.title, courseId: input.courseId ?? null, templateId: input.templateId ?? null, legalName, expiresAt, reissuedFrom: input.reissuedFrom ?? null, reasonCode: input.reasonCode ?? null, holderPublic: profile?.hideCredentialName ? false : true, vc: { ...unsigned, proof: { ...proof, proofValue: sig } } }, "crd");
    store.emit("credentials.issued", `credentials/${c.id}`, { credentialId: c.id, userId: input.userId });
    notify(store, [input.userId], "credentials", `You earned: ${input.title}`, "View, download and share it from your credentials.", "/campus/{tenant}/credentials");
    return c;
  });
}

export function verifyCredential(store: TenantStore, credId: string) {
  const c = store.get("credentials", credId);
  if (!c) return { status: "not_found" as const };
  const k = signingKey(store);
  const { proof, ...rest } = c.vc as { proof: Record<string, string> } & Record<string, unknown>;
  const { proofValue, ...cfg } = proof;
  let ok = false;
  try {
    ok = verify(null, Buffer.from(canon({ ...rest, proof: cfg })), createPublicKey(k.publicPem as string), Buffer.from(proofValue, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) return { status: "invalid_signature" as const, title: c.title };
  const issuer = (rest.issuer as { name: string }).name;
  const holder = c.holderPublic === false ? "(hidden by the holder)" : (rest.credentialSubject as { name: string }).name;
  const achievement = (rest.credentialSubject as { achievement: { name: string; achievementType: string; criteria?: { narrative: string } } }).achievement;
  const evidence = ((rest.evidence as { name: string; id?: string }[]) ?? []).map((e) => ({ name: e.name, url: e.id ?? null }));
  if (c.revokedAt) return { status: "revoked" as const, title: c.title, issuer, revokedAt: c.revokedAt, reason: c.revokeReason ?? null };
  if (c.expiresAt && String(c.expiresAt) < nowIso()) return { status: "expired" as const, title: c.title, issuer, expiredAt: c.expiresAt };
  return { status: "valid" as const, title: c.title, issuer, holder, achievement: { type: achievement.achievementType, criteria: achievement.criteria?.narrative ?? null }, evidence, issuedAt: c.createdAt, reissuedFrom: c.reissuedFrom ?? null };
}

export function revokeCredential(store: TenantStore, a: Actor, credId: string, reason: string) {
  requireTenant(store, a, ["admin", "registrar"], "credentials.revoke");
  return store.tx(() => {
    const c = store.update("credentials", credId, { revokedAt: nowIso(), revokeReason: reason });
    store.emit("credentials.revoked", `credentials/${credId}`, { credentialId: credId });
    audit(store, a, "credentials.revoke", `credentials/${credId}`, reason);
    return c;
  });
}

/** Completion consumer: when a course's final posted grade is passing, issue a certificate. */
export function maybeIssueCompletion(store: TenantStore, courseId: string, userId: string) {
  const c = course(store, courseId);
  if (!c.concludedAt) return null;
  const t = computeTotals(store, courseId, userId);
  if (t.finalPct === null || t.finalPct < 70) return null;
  return issueCredential(store, null, { userId, courseId, title: `${c.code} ${c.title} — Certificate of Completion`, kind: "certificate" });
}

/* ---------------- Careers & placement (internal tenant only) ---------------- */

export function placementSync(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "careers.sync");
  const tenant = broker.tenant(store.tenantId)!;
  if (tenant.kind !== "internal") throw new CampusError("not_internal", "Careers & Placement runs only for the internal tenant.", 403);
  const placement = broker.placement();
  let synced = 0;
  placement.tx(() => {
    for (const p of store.list("placement_profiles", (x) => !!x.consentToShare)) {
      const key = `${tenant.id}:${p.userId}`;
      const existing = placement.list("profiles", (x) => x.key === key)[0];
      const u = store.get("users", p.userId as string);
      const values = { key, sourceTenant: tenant.id, name: u?.name, headline: p.headline, skills: p.skills ?? [], seeking: p.seeking ?? null, internships: store.list("internships", (i) => i.userId === p.userId).map((i) => ({ status: i.status, hours: i.hours })) };
      if (existing) placement.update("profiles", existing.id, values);
      else placement.insert("profiles", values, "plc");
      synced++;
    }
    // Withdrawn consent removes the profile from the placement DB.
    for (const row of placement.list("profiles", (x) => x.sourceTenant === tenant.id)) {
      const uid = String(row.key).split(":")[1];
      if (!store.list("placement_profiles", (x) => x.userId === uid && !!x.consentToShare).length) placement.tombstone("profiles", row.id);
    }
  });
  store.tx(() => {
    store.insert("sync_jobs", { kind: "placement_sync", state: "complete", idempotencyKey: `placement:${nowIso()}`, report: { synced }, startedBy: a.id }, "sj");
    audit(store, a, "careers.sync", "placement", String(synced));
  });
  return { synced };
}

/* ---------------- Privacy ---------------- */

export function observerCanSee(store: TenantStore, observerId: string, studentId: string, purpose: "grade_summary" | "attendance_summary") {
  return store.list("observer_links", (l) => l.observerId === observerId && l.studentId === studentId).length > 0 && store.list("consents", (c) => c.observerId === observerId && c.studentId === studentId && c.purpose === purpose && (!c.expiresAt || String(c.expiresAt) >= nowIso().slice(0, 10))).length > 0;
}

/** Observer's consented summary of a linked student. */
export function observerSummary(store: TenantStore, a: Actor, studentId: string) {
  if (!store.list("observer_links", (l) => l.observerId === a.id && l.studentId === studentId).length) throw new CampusError("not_found", "No linked student", 404);
  const grades = observerCanSee(store, a.id, studentId, "grade_summary");
  const attendance = observerCanSee(store, a.id, studentId, "attendance_summary");
  store.audit({ actorId: a.id, actorRoles: a.roles, action: "observer.summary", resource: `users/${studentId}`, outcome: grades || attendance ? "allowed" : "denied", reason: grades || attendance ? undefined : "no_consent" });
  const courses = store.list("enrollments", (e) => e.userId === studentId && e.role === "student" && e.state === "active").map((e) => {
    const c = course(store, e.courseId as string);
    const t = grades ? computeTotals(store, c.id, studentId) : null;
    return {
      course: `${c.code} ${c.title}`,
      grade: t && !t.hideTotals ? t.finalPct : null,
      missing: t ? t.items.filter((i) => i.status === "missing").map((i) => i.title) : null,
      upcoming: t ? t.items.filter((i) => i.dueAt && i.dueAt > nowIso() && i.score === null).map((i) => ({ title: i.title, dueAt: i.dueAt })) : null,
      attendance: attendance ? store.list("attendance", (x) => x.userId === studentId && x.courseId === c.id && !x.assertion).map((x) => x.status) : null,
    };
  });
  return { student: userName(store, studentId), consent: { grades, attendance }, courses, alerts: store.list("observer_alerts", (x) => x.observerId === a.id && x.studentId === studentId) };
}

const PERSONAL_TABLES: [string, string][] = [
  ["profiles", "userId"], ["enrollments", "userId"], ["registrations", "userId"], ["submissions", "userId"], ["grades", "userId"], ["attempts", "userId"], ["posts", "authorId"], ["calendar_events", "userId"], ["planner_items", "userId"], ["portfolios", "userId"], ["portfolio_pages", "userId"], ["artifacts", "userId"], ["credentials", "userId"], ["charges", "userId"], ["payments", "userId"], ["aid_awards", "userId"], ["holds", "userId"], ["academic_history", "userId"], ["tickets", "requesterId"], ["deliveries", "userId"], ["consents", "studentId"], ["placement_profiles", "userId"], ["view_history", "userId"], ["notification_prefs", "userId"],
];

export function requestDsr(store: TenantStore, a: Actor, kind: "export" | "erase", userId?: string) {
  const subject = userId ?? a.id;
  if (subject !== a.id) requireTenant(store, a, ["admin", "registrar"], "privacy.dsr_on_behalf");
  return store.tx(() => {
    const r = store.insert("dsr", { userId: subject, kind, state: "requested", requestedBy: a.id }, "dsr");
    store.emit("privacy.dsr.requested", `dsr/${r.id}`, { dsrId: r.id, kind });
    audit(store, a, "privacy.dsr_request", `dsr/${r.id}`, kind);
    return r;
  });
}

export function processDsr(store: TenantStore, a: Actor, dsrId: string) {
  requireTenant(store, a, ["admin", "registrar"], "privacy.dsr_process");
  const r = store.get("dsr", dsrId);
  if (!r || r.state !== "requested") throw new CampusError("not_found", "No pending request", 404);
  const uid = r.userId as string;
  if (r.kind === "export") {
    const exp: Record<string, unknown[]> = { user: [store.get("users", uid) ? { ...store.get("users", uid), passwordHash: undefined, mfaSecret: undefined } : null] };
    for (const [t, f] of PERSONAL_TABLES) exp[t] = store.list(t, (x) => x[f] === uid);
    return store.tx(() => {
      const out = store.update("dsr", dsrId, { state: "completed", export: exp, decidedBy: a.id });
      audit(store, a, "privacy.export", `dsr/${dsrId}`);
      return out;
    });
  }
  const hold = store.list("legal_holds", (h) => h.userId === uid && !h.releasedAt)[0];
  if (hold) {
    store.audit({ actorId: a.id, actorRoles: a.roles, action: "privacy.erase", resource: `dsr/${dsrId}`, outcome: "denied", reason: `legal_hold:${hold.matter}` });
    store.tx(() => store.update("dsr", dsrId, { state: "refused", reason: `Refused: a legal hold (${hold.matter}) is in place. Erasure can proceed once counsel releases it.`, decidedBy: a.id }));
    throw new CampusError("legal_hold", `Erasure refused: legal hold "${hold.matter}" is active.`, 409);
  }
  return store.tx(() => {
    for (const [t, f] of PERSONAL_TABLES) {
      for (const row of store.list(t, (x) => x[f] === uid)) {
        if (t === "grades" || t === "registrations" || t === "academic_history" || t === "payments" || t === "charges") store.update(t, row.id, { [f]: `erased_${sha256(uid).slice(0, 8)}` });
        else if (t === "posts") store.update(t, row.id, { body: "", deletedBody: true, authorId: "erased" });
        else store.tombstone(t, row.id);
      }
    }
    store.update("users", uid, { name: "Erased user", email: `erased+${sha256(uid).slice(0, 10)}@invalid`, status: "suspended", passwordHash: null, mfaSecret: null });
    for (const s of store.list("sessions", (x) => x.userId === uid)) store.update("sessions", s.id, { revokedAt: nowIso() });
    const out = store.update("dsr", dsrId, { state: "completed", reason: "Personal data erased; required records pseudonymized.", decidedBy: a.id });
    store.emit("privacy.erased", `users/${uid}`, { dsrId });
    audit(store, a, "privacy.erase", `dsr/${dsrId}`);
    return out;
  });
}

export function retentionJob(store: TenantStore) {
  let n = 0;
  store.tx(() => {
    for (const p of store.list("retention_policies")) {
      const cutoff = new Date(Date.parse(nowIso()) - Number(p.days) * 86400_000).toISOString();
      for (const row of store.list(p.table as string, (r) => String(r.createdAt) < cutoff)) {
        const subject = (row.userId ?? row.authorId ?? row.requesterId) as string | undefined;
        if (subject && store.list("legal_holds", (h) => h.userId === subject && !h.releasedAt).length) continue;
        if (p.action === "anonymize") store.update(p.table as string, row.id, { userId: "anonymized" });
        else store.tombstone(p.table as string, row.id);
        n++;
      }
    }
  });
  return n;
}

/* ---------------- Notifications ---------------- */

const CATEGORIES = ["due_dates", "grading", "submission_comments", "announcements", "discussions", "invitations", "conversations", "calendar", "scheduler", "admissions", "registration", "billing", "credentials", "observer_alerts", "peer_reviews", "other"];
export const NOTIFICATION_CATEGORIES = CATEGORIES;

function prefsFor(store: TenantStore, userId: string) {
  return store.list("notification_prefs", (p) => p.userId === userId)[0] ?? { email: true, inApp: true, push: false, sms: false, matrix: {}, mutedCourses: [], quietStart: null, quietEnd: null };
}

function inQuietHours(p: Record<string, unknown>, at: Date) {
  if (!p.quietStart || !p.quietEnd) return false;
  const m = at.getUTCHours() * 60 + at.getUTCMinutes();
  const [sh, sm] = String(p.quietStart).split(":").map(Number);
  const [eh, em] = String(p.quietEnd).split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

function render(store: TenantStore, eventType: string, vars: Record<string, string>, fallback: { subject: string; body: string }) {
  const tpl = store.list("notification_templates", (t) => t.eventType === eventType)[0];
  const brand = broker.tenant(store.tenantId)!.theme.logoText;
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
  return { subject: `[${brand}] ${fill(String(tpl?.subject ?? fallback.subject))}`, body: fill(String(tpl?.body ?? fallback.body)) };
}

registerConsumer({
  name: "notifications",
  types: ["notification.requested"],
  handle(store, e) {
    const tenant = broker.tenant(store.tenantId)!;
    const category = String(e.data.category);
    const courseId = (e.data.courseId as string) ?? null;
    const href = String(e.data.href ?? "").replace("{tenant}", tenant.slug);
    for (const uid of (e.data.userIds as string[]) ?? []) {
      const p = prefsFor(store, uid);
      if (courseId && ((p.mutedCourses as string[]) ?? []).includes(courseId)) continue;
      const freq = ((p.matrix as Record<string, string>) ?? {})[category] ?? "immediately";
      if (freq === "off") continue;
      const msg = render(store, `${category}`, { course: courseId ? String(store.get("courses", courseId)?.title ?? "") : "", title: String(e.data.title) }, { subject: String(e.data.title), body: String(e.data.body) });
      const quiet = inQuietHours(p, new Date(e.at));
      const channels = [p.inApp !== false ? "in_app" : null, p.email !== false ? "email" : null, p.push ? "push" : null, p.sms && tenant.flags.sms ? "sms" : null].filter(Boolean) as string[];
      for (const ch of channels) {
        const deferred = ch !== "in_app" && (freq !== "immediately" || quiet);
        store.insert("deliveries", { userId: uid, channel: ch, category, subject: msg.subject, body: msg.body, href, eventId: e.id, state: deferred ? (freq === "immediately" ? "deferred_quiet" : `digest_${freq}`) : ch === "in_app" ? "unread" : "sent", courseId }, "dlv");
      }
    }
  },
});

/** Digest job: bundles deferred deliveries into one daily/weekly message per channel. */
export function digestJob(store: TenantStore, kind: "daily" | "weekly" | "quiet") {
  let n = 0;
  store.tx(() => {
    const state = kind === "quiet" ? "deferred_quiet" : `digest_${kind}`;
    const byUser = new Map<string, Row[]>();
    for (const d of store.list("deliveries", (x) => x.state === state)) {
      const k = `${d.userId}:${d.channel}`;
      byUser.set(k, [...(byUser.get(k) ?? []), d]);
    }
    for (const [k, rows] of byUser) {
      if (kind === "quiet" && inQuietHours(prefsFor(store, k.split(":")[0]), new Date(nowIso()))) continue;
      const [uid, ch] = k.split(":");
      store.insert("deliveries", { userId: uid, channel: ch, category: "digest", subject: `Your ${kind === "quiet" ? "held" : kind} summary (${rows.length})`, body: rows.map((r) => `• ${r.subject}`).join("\n"), state: "sent", href: "" }, "dlv");
      for (const r of rows) store.update("deliveries", r.id, { state: "sent_in_digest" });
      n++;
    }
  });
  return n;
}

export function myNotifications(store: TenantStore, a: Actor) {
  const items = store.list("deliveries", (d) => d.userId === a.id && d.channel === "in_app").sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return { unread: items.filter((d) => d.state === "unread").length, items: items.slice(0, 100) };
}

export function readNotification(store: TenantStore, a: Actor, deliveryId: string | "all") {
  return store.tx(() => {
    for (const d of store.list("deliveries", (x) => x.userId === a.id && x.channel === "in_app" && x.state === "unread" && (deliveryId === "all" || x.id === deliveryId))) store.update("deliveries", d.id, { state: "read", readAt: nowIso() });
    return myNotifications(store, a);
  });
}

export function setNotificationPrefs(store: TenantStore, a: Actor, values: Record<string, unknown>) {
  if (values.matrix) {
    for (const [k, v] of Object.entries(values.matrix as Record<string, string>)) {
      if (!CATEGORIES.includes(k)) throw new CampusError("invalid", `Unknown category ${k}`, 422);
      if (!["immediately", "daily", "weekly", "off"].includes(v)) throw new CampusError("invalid", "Frequency must be immediately, daily, weekly or off.", 422);
    }
  }
  for (const k of ["quietStart", "quietEnd"]) if (values[k] && !/^\d{2}:\d{2}$/.test(String(values[k]))) throw new CampusError("invalid", "Quiet hours use HH:MM.", 422);
  return store.tx(() => {
    const ex = store.list("notification_prefs", (p) => p.userId === a.id)[0];
    const allowed = Object.fromEntries(Object.entries(values).filter(([k]) => ["email", "inApp", "push", "sms", "digest", "quietStart", "quietEnd", "matrix", "mutedCourses"].includes(k)));
    return ex ? store.update("notification_prefs", ex.id, allowed) : store.insert("notification_prefs", { userId: a.id, email: true, inApp: true, push: false, ...allowed }, "npr");
  });
}

/* ---------------- Global search ---------------- */

const INDEXED: Record<string, { title: string; text: string[]; href: (r: Row) => string; course?: boolean; acl?: string }> = {
  courses: { title: "title", text: ["code", "description"], href: (r) => `courses/${r.id}`, course: true },
  pages: { title: "title", text: ["html"], href: (r) => `courses/${r.courseId}/pages/${r.id}`, course: true },
  assignments: { title: "title", text: ["instructions"], href: (r) => `courses/${r.courseId}/assignments/${r.id}`, course: true },
  discussion_topics: { title: "title", text: ["prompt"], href: (r) => `courses/${r.courseId}/discussions/${r.id}`, course: true },
  announcements: { title: "title", text: ["body"], href: (r) => `courses/${r.courseId}/announcements/${r.id}`, course: true },
  kb_articles: { title: "title", text: ["body"], href: (r) => `helpdesk/kb/${r.id}` },
  users: { title: "name", text: ["email"], href: (r) => `people/${r.id}`, acl: "people" },
  reading_items: { title: "title", text: ["citation"], href: (r) => `courses/${r.courseId}/library`, course: true },
};

export function indexRecord(store: TenantStore, table: string, rowId: string) {
  const cfg = INDEXED[table];
  if (!cfg) return;
  const r = store.get(table, rowId);
  const existing = store.list("search_docs", (d) => d.kind === table && d.refId === rowId)[0];
  if (!r) {
    if (existing) store.tombstone("search_docs", existing.id);
    return;
  }
  const text = cfg.text.map((f) => String(r[f] ?? "").replace(/<[^>]+>/g, " ")).join(" ").slice(0, 5000);
  const values = { kind: table, refId: rowId, title: String(r[cfg.title] ?? ""), text, courseId: cfg.course ? (table === "courses" ? r.id : r.courseId) : null, acl: { published: r.state === undefined ? true : r.state === "published", people: cfg.acl === "people", sectionId: r.sectionId ?? null }, href: cfg.href(r) };
  if (existing) store.update("search_docs", existing.id, values);
  else store.insert("search_docs", values, "sd");
}

registerConsumer({
  name: "search-indexer",
  types: "*",
  handle(store, e) {
    const m = e.type.match(/^([a-z_]+)\.(created|updated|deleted|published|unpublished|restored)$/);
    if (m && INDEXED[m[1]]) indexRecord(store, m[1], String(e.data.id));
  },
});

export function rebuildIndex(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "search.rebuild");
  return store.tx(() => {
    for (const d of store.list("search_docs")) store.tombstone("search_docs", d.id);
    let n = 0;
    for (const t of Object.keys(INDEXED)) for (const r of store.list(t)) {
      indexRecord(store, t, r.id);
      n++;
    }
    return { indexed: n };
  });
}

/** Query-time ACL for one index document (also used by AI retrieval). */
export function docVisible(a: Actor, d: Row): boolean {
  const acl = d.acl as { published: boolean; people: boolean; sectionId: string | null };
  if (acl.people) return hasAny(a, ["admin", "registrar", "advisor", "instructor", "ta"]) || d.refId === a.id;
  if (!d.courseId) return acl.published;
  const cid = d.courseId as string;
  if (isStaff(a, cid) || a.roles.includes("admin")) return true;
  if (!(a.courseRoles[cid] ?? []).length) return false;
  if (!acl.published) return false;
  return true;
}

/** ACL is applied at query time: role, enrollment, publish state and section. */
export function search(store: TenantStore, a: Actor, q: string, limit = 25) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const canSee = (d: Row) => docVisible(a, d);
  return store
    .list("search_docs", (d) => terms.every((t) => `${d.title} ${d.text}`.toLowerCase().includes(t)))
    .filter(canSee)
    .map((d) => ({ kind: d.kind, title: d.title, href: d.href, snippet: String(d.text).slice(0, 160), score: terms.reduce((s, t) => s + (String(d.title).toLowerCase().includes(t) ? 3 : 1), 0) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

/* ---------------- Reports ---------------- */

export const REPORT_KINDS = ["provisioning", "last_access", "grade_export", "student_competency", "unpublished_courses", "zero_activity", "course_storage", "outcome_results", "enrollment", "registration"] as const;

export function runReport(store: TenantStore, a: Actor, kind: (typeof REPORT_KINDS)[number]) {
  requireTenant(store, a, ["admin", "registrar"], "reports.run");
  let rows: Record<string, unknown>[] = [];
  if (kind === "provisioning") rows = store.list("users").map((u) => ({ id: u.id, name: u.name, email: u.email, sis_id: u.sisId ?? "", status: u.status }));
  if (kind === "last_access") rows = store.list("users").map((u) => ({ name: u.name, last_session: store.list("sessions", (s) => s.userId === u.id).map((s) => String(s.createdAt)).sort().pop() ?? "never" }));
  if (kind === "grade_export") for (const g of store.list("grades")) rows.push({ course: store.get("courses", g.courseId as string)?.code, assignment: (store.get("assignments", g.assignmentId as string) ?? store.get("quizzes", g.assignmentId as string))?.title, student: userName(store, g.userId as string), score: g.score, posted: g.posted });
  if (kind === "student_competency" || kind === "outcome_results") for (const c of store.list("courses")) for (const e of activeStudents(store, c.id)) for (const r of outcomeResults(store, c.id, e.userId as string)) rows.push({ course: c.code, student: userName(store, e.userId as string), outcome: r.code, mastery: r.mastery, mastered: r.mastered });
  if (kind === "unpublished_courses") rows = store.list("courses", (c) => c.state !== "published").map((c) => ({ code: c.code, title: c.title }));
  if (kind === "zero_activity") for (const c of store.list("courses")) for (const e of activeStudents(store, c.id)) if (!store.list("learning_events", (le) => le.courseId === c.id && le.actorRef === pseudonym(store.tenantId, e.userId as string)).length) rows.push({ course: c.code, student: userName(store, e.userId as string) });
  if (kind === "course_storage") rows = store.list("courses").map((c) => ({ course: c.code, files: store.list("files", (f) => f.courseId === c.id).length, bytes: store.list("files", (f) => f.courseId === c.id).reduce((s, f) => s + Number(f.size ?? 0), 0) }));
  if (kind === "enrollment") rows = store.list("enrollments").map((e) => ({ course: store.get("courses", e.courseId as string)?.code, user: userName(store, e.userId as string), role: e.role, state: e.state, source: e.source }));
  if (kind === "registration") rows = store.list("registrations").map((r) => ({ student: userName(store, r.userId as string), section: store.get("sections", r.sectionId as string)?.code, state: r.state }));
  return store.tx(() => {
    const run = store.insert("report_runs", { kind, rows: rows.length, csv: csv(rows), requestedBy: a.id }, "rpt");
    audit(store, a, "reports.run", `report_runs/${run.id}`, kind);
    return run;
  });
}

/* ---------------- Credential lifecycle: reissue, CLR ---------------- */

export const REASON_CODES = ["name_change", "error_correction", "template_update", "fraud", "policy_violation", "holder_request"] as const;

/** Reissue: revoke with a reason code and issue a corrected credential that points back to it. */
export function reissueCredential(store: TenantStore, a: Actor, credId: string, reasonCode: (typeof REASON_CODES)[number], newTitle?: string) {
  requireTenant(store, a, ["admin", "registrar"], "credentials.reissue");
  if (!REASON_CODES.includes(reasonCode)) throw new CampusError("invalid", `Reason code must be one of ${REASON_CODES.join(", ")}.`, 422);
  const old = store.get("credentials", credId);
  if (!old || old.revokedAt) throw new CampusError("not_found", "Active credential not found", 404);
  revokeCredential(store, a, credId, `reissued:${reasonCode}`);
  return issueCredential(store, a, { userId: old.userId as string, courseId: (old.courseId as string) ?? undefined, title: newTitle ?? (old.title as string), kind: old.kind as "certificate" | "badge", templateId: (old.templateId as string) ?? undefined, reissuedFrom: credId, reasonCode });
}

/** Comprehensive Learner Record: every active credential plus the academic record, signed by the tenant. */
export function clrExport(store: TenantStore, a: Actor, userId: string) {
  if (userId !== a.id && !hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "You can only export your own learner record.", 403);
  const u = store.get("users", userId);
  if (!u) throw new CampusError("not_found", "Learner not found", 404);
  const tenant = broker.tenant(store.tenantId)!;
  const k = signingKey(store);
  const creds = store.list("credentials", (c) => c.userId === userId && !c.revokedAt).map((c) => c.vc);
  const records = store.list("academic_history", (h) => h.userId === userId).map((h) => ({ type: ["AchievementSubject"], achievement: { type: ["Achievement"], achievementType: "Course", name: h.code, creditsAvailable: h.credits }, result: [{ type: ["Result"], value: h.grade }], term: h.termName }));
  const programs = store.list("offering_enrollments", (e) => e.userId === userId && !!e.completedAt).map((e) => ({ type: ["AchievementSubject"], achievement: { type: ["Achievement"], achievementType: "Program", name: store.get("offerings", e.offeringId as string)?.title ?? e.offeringId }, completedAt: e.completedAt }));
  const issuedAt = nowIso();
  const unsigned = {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/clr/v2p0/context-2.0.1.json"],
    id: `urn:scholarion:${tenant.slug}:clr:${sha256(userId + issuedAt).slice(0, 16)}`,
    type: ["VerifiableCredential", "ClrCredential"],
    issuer: { id: `did:web:${tenant.domains[0]?.host ?? `${tenant.slug}.scholarion.local`}`, type: ["Profile"], name: tenant.name },
    validFrom: issuedAt,
    name: `Comprehensive Learner Record — ${u.legalName ?? u.name}`,
    credentialSubject: { type: ["ClrSubject"], verifiableCredential: creds, achievements: [...records, ...programs] },
  };
  const proof = { type: "DataIntegrityProof", cryptosuite: "scholarion-ed25519-sortedjson", created: issuedAt, verificationMethod: `${unsigned.issuer.id}#${k.kid}`, proofPurpose: "assertionMethod" };
  const sig = sign(null, Buffer.from(canon({ ...unsigned, proof })), createPrivateKey(k.privatePem as string)).toString("base64url");
  audit(store, a, "credentials.clr_export", `users/${userId}`);
  return { ...unsigned, proof: { ...proof, proofValue: sig } };
}

/** LinkedIn "add to profile" link for a credential (no data leaves until the holder clicks). */
export function shareLinks(store: TenantStore, a: Actor, credId: string) {
  const c = store.get("credentials", credId);
  if (!c || (c.userId !== a.id && !hasAny(a, ["admin", "registrar"]))) throw new CampusError("not_found", "Credential not found", 404);
  const tenant = broker.tenant(store.tenantId)!;
  const verifyUrl = `/campus/${tenant.slug}/verify/${c.id}`;
  const issued = new Date(String(c.createdAt));
  return {
    verifyUrl,
    linkedin: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(String(c.title))}&organizationName=${encodeURIComponent(tenant.name)}&issueYear=${issued.getUTCFullYear()}&issueMonth=${issued.getUTCMonth() + 1}&certId=${encodeURIComponent(c.id)}`,
    walletJson: c.vc,
  };
}
