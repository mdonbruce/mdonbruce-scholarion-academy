import crypto from "node:crypto";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../../core";
import { hasAny, type Actor } from "../../iam";
import { audit, notify } from "../common";
import { feedItem } from "./catalog";
import { extractSkills, SKILL_TERMS } from "./discovery";
import { T, hostOf, isAdmin, requireAdmin, safePublicUrl } from "./shared";

/**
 * Scholarion Career Connect and Employer Portal.
 *
 * - External listings are labelled as such; an employer is a "partner" only after an administrator
 *   records an established relationship. Employers are verified before they can search talent.
 * - Learners own their career profile: discoverability is off by default and each field
 *   (headline, skills, certificates, portfolio, contact) is shared only when switched on.
 * - Matching uses published role requirements and demonstrated skills (passbook, passed
 *   assessments, credentials) plus skills the learner states; it never uses personal
 *   characteristics. Every match explains itself.
 * - Nothing is sent automatically: applications are learner-initiated; employer contact requests
 *   wait for the learner's answer.
 */

export const PROFILE_FIELDS = ["headline", "skills", "certificates", "portfolio", "contact"] as const;
type Field = (typeof PROFILE_FIELDS)[number];

/** Competencies → skill tags (AI-801 and the Agentic Cloud Labs). */
const COMPETENCY_SKILLS: Record<string, string[]> = {
  C1: ["agents", "agentic", "llm"],
  C2: ["guardrails", "agents", "api"],
  C3: ["vector databases", "rag"],
  C4: ["evaluation"],
  C5: ["agents", "langgraph", "agentic"],
};

/* ---------------- employers ---------------- */

/* ---------------- automatic checks ---------------- */

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|mail|yandex|zoho)\.[a-z.]+$/i;

/** Automatic employer verification: business-domain email that matches the website, https website, a real name. */
export function employerChecks(input: { name: string; website: string; contactEmail?: string | null }) {
  const reasons: string[] = [];
  const host = hostOf(input.website);
  const mailDomain = String(input.contactEmail ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (!/^https:\/\//i.test(input.website)) reasons.push("The website must use https.");
  if (!mailDomain) reasons.push("A contact email at the company's domain is required.");
  else if (FREE_MAIL.test(mailDomain)) reasons.push(`${mailDomain} is a free email provider, not a business domain.`);
  else if (!(mailDomain === host || mailDomain.endsWith(`.${host}`) || host.endsWith(`.${mailDomain}`))) reasons.push(`The email domain (${mailDomain}) doesn't match the website (${host}).`);
  if (String(input.name ?? "").trim().length < 2) reasons.push("Organization name is missing.");
  return { ok: reasons.length === 0, reasons };
}

const SCAM_PATTERNS: [RegExp, string][] = [
  [/\b(training|registration|application|processing|starter[- ]kit|equipment)\s+fee\b|\bpay(ment)?\s+(to|before)\s+(apply|start)|\bupfront\s+(fee|payment)/i, "Asks applicants to pay a fee"],
  [/\b(wire|western union|moneygram|gift\s*cards?|bitcoin|crypto(currency)?)\b.*\b(pay|send|deposit|purchase)|\b(send|deposit)\b.*\b(check|cheque)\b/i, "Asks applicants to move money"],
  [/\b(social security number|ssn|bank account (number|details)|passport (number|copy))\b/i, "Requests sensitive personal data up front"],
  [/\b(telegram|signal|whats\s?app)\s+(only|interview)\b|\binterview (via|on) (telegram|signal|whats\s?app)\b/i, "Interview only through a messaging app"],
  [/\bearn\s+\$?\d{3,}\s*(per|a|\/)\s*(day|hour)\b|\bno experience\b.*\bguaranteed\b/i, "Unrealistic pay or guarantee"],
];

/** Posting checks: scam patterns, expired deadline, duplicates. Flagged postings are hidden and logged. */
export function postingFlags(store: TenantStore, o: { id?: string; title: string; description?: string; employerId?: string | null; employerName?: string; closesAt?: string | null; applicationUrl?: string | null }) {
  const text = `${o.title} ${o.description ?? ""}`;
  const flags = SCAM_PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
  if (o.closesAt && Date.parse(o.closesAt) < nowMs()) flags.push("Closing date has passed");
  const dup = store.list(T.opportunities, (x) => x.id !== o.id && x.status === "open" && String(x.title).toLowerCase() === o.title.toLowerCase() && String(x.employerName ?? "") === String(o.employerName ?? ""))[0];
  if (dup) flags.push("Duplicate of an open posting");
  if (o.employerId && o.applicationUrl) {
    const e = store.get(T.employers, o.employerId);
    const h = hostOf(o.applicationUrl);
    const site = e ? hostOf(String(e.website)) : "";
    const ats = /(greenhouse\.io|lever\.co|myworkdayjobs\.com|smartrecruiters\.com|ashbyhq\.com|usajobs\.gov|adzuna\.)/i.test(h);
    if (site && h && !ats && !(h === site || h.endsWith(`.${site}`))) flags.push(`Application link (${h}) isn't on the employer's site or a known applicant-tracking system`);
  }
  return flags;
}

export function logPostingFlags(store: TenantStore, opportunityId: string, flags: string[]) {
  if (!flags.length) return;
  store.insert(T.flags, { opportunityId, flags, at: nowIso() }, "eflg");
  store.update(T.opportunities, opportunityId, { status: "pending", hiddenReason: flags.join("; ") });
}

export function flaggedPostings(store: TenantStore, a: Actor) {
  requireAdmin(store, a, "eco.flags.view");
  return store.list(T.flags, () => true).map((f) => ({ id: f.id, opportunity: String(store.get(T.opportunities, String(f.opportunityId))?.title ?? ""), flags: f.flags as string[], at: String(f.at) }));
}

export function registerEmployer(store: TenantStore, a: Actor, input: { name: string; website: string; contactEmail?: string; industries?: string[]; locations?: string[]; about?: string }) {
  const website = safePublicUrl(input.website, "website");
  const name = String(input.name ?? "").trim().slice(0, 160);
  if (!name) throw new CampusError("invalid", "Organization name is required.", 422);
  if (store.list(T.employers, (e) => hostOf(String(e.website)) === hostOf(website)).length) throw new CampusError("conflict", "An organization with that website is already registered.", 409);
  return store.tx(() => {
    // Automatic verification: no manual step when the checks pass; failures stay hidden with reasons.
    const chk = employerChecks({ name, website, contactEmail: input.contactEmail ?? a.email });
    const e = store.insert(T.employers, { name, website, contactEmail: input.contactEmail ?? a.email, relationship: chk.ok ? "verified" : "registered", verification: chk.ok ? "verified" : "pending", verificationReasons: chk.reasons, industries: input.industries ?? [], locations: input.locations ?? [], about: String(input.about ?? "").slice(0, 2000), registeredBy: a.id, verifiedBy: chk.ok ? "automatic-checks" : null, verifiedAt: chk.ok ? nowIso() : null, partnerNote: null }, "eemp");
    store.insert(T.members, { employerId: e.id, userId: a.id, role: "owner" }, "emem");
    audit(store, a, "eco.employer.register", `${T.employers}/${e.id}`, chk.ok ? "auto-verified" : chk.reasons.join("; "));
    if (!chk.ok) {
      const admins = store.list("role_grants", (g) => g.role === "admin").map((g) => String(g.userId));
      notify(store, admins, "employers", `Employer needs review: ${name}`, `Automatic checks didn't pass: ${chk.reasons.join(" ")}`, "/campus/{tenant}/hub/employers");
    }
    return e;
  });
}

/** Admin verification (or rejection). Partnership is a separate, explicit step. */
export function verifyEmployer(store: TenantStore, a: Actor, employerId: string, decision: "verified" | "rejected", note: string) {
  requireAdmin(store, a, "eco.employer.verify");
  const e = store.get(T.employers, employerId);
  if (!e) throw new CampusError("not_found", "Employer not found", 404);
  return store.tx(() => {
    const r = store.update(T.employers, employerId, { verification: decision, relationship: decision === "verified" ? (e.relationship === "partner" ? "partner" : "verified") : e.relationship, verifiedBy: a.id, verifiedAt: nowIso(), verificationNote: String(note ?? "").slice(0, 500) });
    audit(store, a, "eco.employer.verify", `${T.employers}/${employerId}`, decision);
    return r;
  });
}

export function markPartner(store: TenantStore, a: Actor, employerId: string, note: string) {
  requireAdmin(store, a, "eco.employer.partner");
  const e = store.get(T.employers, employerId);
  if (!e) throw new CampusError("not_found", "Employer not found", 404);
  if (e.verification !== "verified") throw new CampusError("not_verified", "Verify the employer before recording a partnership.", 409);
  if (!String(note ?? "").trim()) throw new CampusError("invalid", "Describe the established relationship (agreement, date, contact).", 422);
  return store.tx(() => store.update(T.employers, employerId, { relationship: "partner", partnerNote: String(note).slice(0, 500), partnerSince: nowIso() }));
}

function memberOf(store: TenantStore, a: Actor): Row | null {
  const m = store.list(T.members, (x) => x.userId === a.id)[0];
  return m ? store.get(T.employers, String(m.employerId)) ?? null : null;
}
function requireVerifiedEmployer(store: TenantStore, a: Actor, action: string): Row {
  const e = memberOf(store, a);
  if (!e || e.verification !== "verified") {
    store.audit({ actorId: a.id, actorRoles: a.roles, action, resource: "eco.talent", outcome: "denied", reason: e ? "employer_not_verified" : "not_employer" });
    throw new CampusError("forbidden", e ? "Your organization must be verified by Scholarion before it can do this." : "Employer accounts only.", 403);
  }
  return e;
}

export function employerView(e: Row) {
  const label = e.relationship === "partner" ? "Scholarion partner" : e.relationship === "verified" ? "Verified employer" : e.relationship === "registered" ? "Registered — verification pending" : "External listing (not a Scholarion partner)";
  return { id: e.id, name: String(e.name), website: String(e.website), relationship: String(e.relationship), label, verification: String(e.verification), reasons: (e.verificationReasons as string[]) ?? [], industries: (e.industries as string[]) ?? [], locations: (e.locations as string[]) ?? [], about: String(e.about ?? "") };
}

export function listEmployers(store: TenantStore, a: Actor, f: { relationship?: string } = {}) {
  return store.list(T.employers, (e) => (isAdmin(a) || e.verification === "verified" || e.relationship === "external_discovery") && (!f.relationship || e.relationship === f.relationship)).map(employerView);
}

/* ---------------- opportunities ---------------- */

const TYPES = ["internship", "apprenticeship", "graduate", "entry_level", "full_time", "part_time", "contract"];

export function postOpportunity(store: TenantStore, a: Actor, input: Record<string, unknown>) {
  const e = requireVerifiedEmployer(store, a, "eco.opportunity.post");
  const type = String(input.type ?? "internship");
  if (!TYPES.includes(type)) throw new CampusError("invalid", `type must be one of ${TYPES.join(", ")}.`, 422);
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) throw new CampusError("invalid", "Title is required.", 422);
  const skills = [...new Set([...((input.skills as string[]) ?? []).map((s) => String(s).toLowerCase().trim()).filter(Boolean), ...extractSkills(`${title} ${input.description ?? ""}`)])].slice(0, 20);
  return store.tx(() => {
    const o = store.insert(T.opportunities, { employerId: e.id, employerName: e.name, externalId: null, sourceId: null, source: "employer_posted", title, type, description: String(input.description ?? "").slice(0, 4000), skills, qualifications: ((input.qualifications as string[]) ?? []).map(String).slice(0, 20), certificates: ((input.certificates as string[]) ?? []).map(String), location: input.location ? String(input.location) : null, remote: ["remote", "hybrid", "onsite"].includes(String(input.remote)) ? String(input.remote) : "unknown", workEligibility: input.workEligibility ? String(input.workEligibility) : null, compensation: input.compensation ? String(input.compensation) : null, applicationUrl: input.applicationUrl ? safePublicUrl(input.applicationUrl, "applicationUrl") : null, postedAt: nowIso(), closesAt: input.closesAt ? new Date(String(input.closesAt)).toISOString() : null, status: "open", lastVerifiedAt: nowIso(), legitimacy: [`Posted by verified employer ${e.name}`] }, "eopp");
    const flags = postingFlags(store, { id: o.id, title, description: String(o.description), employerId: e.id, employerName: String(e.name), closesAt: (o.closesAt as string) ?? null, applicationUrl: (o.applicationUrl as string) ?? null });
    if (flags.length) logPostingFlags(store, o.id, flags);
    else feedItem(store, "opportunity", `New opportunity: ${title} (${e.name})`, { opportunityId: o.id, subjects: skills });
    audit(store, a, "eco.opportunity.post", `${T.opportunities}/${o.id}`, flags.length ? `hidden: ${flags.join("; ")}` : "published");
    return store.get(T.opportunities, o.id)!;
  });
}

export function closeOpportunity(store: TenantStore, a: Actor, id: string, reason: string) {
  const o = store.get(T.opportunities, id);
  if (!o) throw new CampusError("not_found", "Opportunity not found", 404);
  const e = memberOf(store, a);
  if (!isAdmin(a) && (!e || e.id !== o.employerId)) throw new CampusError("forbidden", "Only the posting employer can close this.", 403);
  return store.tx(() => store.update(T.opportunities, id, { status: "closed", closedReason: String(reason || "Position filled."), closedAt: nowIso() }));
}

export function opportunityView(store: TenantStore, o: Row) {
  const e = o.employerId ? store.get(T.employers, String(o.employerId)) : null;
  return {
    id: o.id,
    title: String(o.title),
    employer: String(o.employerName ?? e?.name ?? ""),
    employerLabel: e ? employerView(e).label : "External listing (not a Scholarion partner)",
    employerWebsite: e ? String(e.website) : null,
    type: String(o.type),
    source: String(o.source),
    description: String(o.description ?? ""),
    skills: (o.skills as string[]) ?? [],
    qualifications: (o.qualifications as string[]) ?? [],
    location: (o.location as string) ?? null,
    remote: String(o.remote ?? "unknown"),
    workEligibility: (o.workEligibility as string) ?? null,
    compensation: (o.compensation as string) ?? null,
    applicationUrl: (o.applicationUrl as string) ?? null,
    postedAt: (o.postedAt as string) ?? null,
    closesAt: (o.closesAt as string) ?? null,
    status: isOpen(o) ? "open" : o.status === "open" ? "closed" : String(o.status),
    lastVerifiedAt: (o.lastVerifiedAt as string) ?? null,
    legitimacy: (o.legitimacy as string[]) ?? [],
  };
}

/** Open = status open and not past its closing date. */
export const isOpen = (o: Row) => o.status === "open" && (!o.closesAt || Date.parse(String(o.closesAt)) > nowMs());

export function listOpportunities(store: TenantStore, f: { q?: string; type?: string; remote?: string; includeClosed?: boolean; employerId?: string } = {}) {
  const q = (f.q ?? "").toLowerCase();
  return store.list(T.opportunities, (o) => (f.includeClosed || isOpen(o)) && (!f.type || o.type === f.type) && (!f.remote || o.remote === f.remote) && (!f.employerId || o.employerId === f.employerId) && (!q || `${o.title} ${o.employerName} ${((o.skills as string[]) ?? []).join(" ")}`.toLowerCase().includes(q))).sort((x, y) => String(y.postedAt ?? "").localeCompare(String(x.postedAt ?? ""))).map((o) => opportunityView(store, o));
}

/* ---------------- learner career profile ---------------- */

const DEFAULT_VISIBILITY: Record<Field, boolean> = { headline: false, skills: false, certificates: false, portfolio: false, contact: false };

/** Withdraw from Employer Connect at any time: profile becomes private and pending contact requests are cancelled. */
export function withdrawConsent(store: TenantStore, a: Actor) {
  const p = store.list(T.profiles, (x) => x.userId === a.id)[0];
  store.tx(() => {
    if (p) store.update(T.profiles, p.id, { discoverable: false, visible: { ...DEFAULT_VISIBILITY }, withdrawnAt: nowIso() });
    for (const c of store.list(T.contacts, (x) => x.userId === a.id && x.state !== "declined")) store.update(T.contacts, c.id, { state: "withdrawn" });
  });
  audit(store, a, "eco.consent.withdraw", `${T.profiles}/${a.id}`);
  return myProfile(store, a);
}

export function myProfile(store: TenantStore, a: Actor) {
  const p = store.list(T.profiles, (x) => x.userId === a.id)[0];
  const evidence = demonstratedSkills(store, a.id);
  return {
    exists: !!p,
    headline: String(p?.headline ?? ""),
    statedSkills: (p?.statedSkills as string[]) ?? [],
    interests: (p?.interests as string[]) ?? [],
    preferredLocations: (p?.preferredLocations as string[]) ?? [],
    remoteOk: p ? !!p.remoteOk : true,
    portfolioUrl: (p?.portfolioUrl as string) ?? null,
    contactEmail: (p?.contactEmail as string) ?? null,
    discoverable: p ? !!p.discoverable : false,
    visible: { ...DEFAULT_VISIBILITY, ...((p?.visible as Record<Field, boolean>) ?? {}) },
    demonstrated: evidence,
    skillTerms: SKILL_TERMS,
  };
}

export function saveProfile(store: TenantStore, a: Actor, input: Record<string, unknown>) {
  const p = store.list(T.profiles, (x) => x.userId === a.id)[0];
  const visible = { ...DEFAULT_VISIBILITY, ...((p?.visible as Record<Field, boolean>) ?? {}) };
  for (const f of PROFILE_FIELDS) if (input[`show_${f}`] !== undefined) visible[f] = input[`show_${f}`] === true || input[`show_${f}`] === "true" || input[`show_${f}`] === "on";
  const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 30);
  const row = {
    userId: a.id,
    headline: input.headline !== undefined ? String(input.headline).slice(0, 200) : String(p?.headline ?? ""),
    statedSkills: input.statedSkills !== undefined ? list(input.statedSkills) : (p?.statedSkills as string[]) ?? [],
    interests: input.interests !== undefined ? list(input.interests) : (p?.interests as string[]) ?? [],
    preferredLocations: input.preferredLocations !== undefined ? list(input.preferredLocations) : (p?.preferredLocations as string[]) ?? [],
    remoteOk: input.remoteOk !== undefined ? input.remoteOk === true || input.remoteOk === "true" || input.remoteOk === "on" : p ? !!p.remoteOk : true,
    portfolioUrl: input.portfolioUrl ? safePublicUrl(input.portfolioUrl, "portfolioUrl") : (p?.portfolioUrl as string) ?? null,
    contactEmail: input.contactEmail !== undefined ? (String(input.contactEmail).trim() || null) : (p?.contactEmail as string) ?? null,
    discoverable: input.discoverable !== undefined ? input.discoverable === true || input.discoverable === "true" || input.discoverable === "on" : p ? !!p.discoverable : false,
    visible,
  };
  if (row.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.contactEmail)) throw new CampusError("invalid", "contactEmail must be an email address.", 422);
  store.tx(() => (p ? store.update(T.profiles, p.id, row) : store.insert(T.profiles, row, "ecp")));
  audit(store, a, "eco.profile.save", `${T.profiles}/${a.id}`, row.discoverable ? "discoverable" : "private");
  return myProfile(store, a);
}

/** Skills backed by Scholarion evidence: passbook passes, passed graded items and credentials. */
export function demonstratedSkills(store: TenantStore, userId: string) {
  const out: { skill: string; evidence: string }[] = [];
  for (const p of store.list("passbook", (x) => x.userId === userId && x.result === "pass")) {
    const course = String(store.get("courses", String(p.courseId))?.code ?? "");
    for (const s of COMPETENCY_SKILLS[String(p.competency)] ?? []) out.push({ skill: s, evidence: `${course} passbook ${p.competency}: passed “${p.itemTitle}” (${p.score}%)` });
  }
  for (const c of store.list("credentials", (x) => x.userId === userId && !x.revokedAt)) for (const s of extractSkills(String(c.title))) out.push({ skill: s, evidence: `Scholarion credential: ${c.title}` });
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.skill + x.evidence) ? false : (seen.add(x.skill + x.evidence), true)));
}

/* ---------------- matching ---------------- */

export function matchFor(store: TenantStore, userId: string, o: Row) {
  const p = store.list(T.profiles, (x) => x.userId === userId)[0];
  const demo = demonstratedSkills(store, userId);
  const stated = new Set(((p?.statedSkills as string[]) ?? []).map((s) => s.toLowerCase()));
  const req = ((o.skills as string[]) ?? []).map((s) => s.toLowerCase());
  const reasons: string[] = [];
  let points = 0;
  for (const s of req) {
    const d = demo.find((x) => x.skill === s);
    if (d) {
      points += 1;
      reasons.push(`${s}: demonstrated — ${d.evidence}`);
    } else if (stated.has(s)) {
      points += 0.5;
      reasons.push(`${s}: self-reported on your profile (no Scholarion evidence yet)`);
    }
  }
  const missing = req.filter((s) => !demo.some((x) => x.skill === s) && !stated.has(s));
  const interests = ((p?.interests as string[]) ?? []).filter((i) => `${o.title} ${o.type}`.toLowerCase().includes(i));
  if (interests.length) reasons.push(`Matches your stated interest: ${interests.join(", ")}`);
  if (o.remote === "remote" && p?.remoteOk) reasons.push("Remote role, and you accept remote work");
  const score = req.length ? Math.round((points / req.length) * 100) : interests.length ? 50 : 0;
  return { opportunityId: o.id, score, reasons, missing };
}

export function myMatches(store: TenantStore, a: Actor) {
  const rows = store.list(T.opportunities, (o) => isOpen(o)).map((o) => ({ opp: opportunityView(store, o), m: matchFor(store, a.id, o) })).filter((x) => x.m.score > 0).sort((x, y) => y.m.score - x.m.score);
  store.tx(() => {
    for (const r of rows) {
      const ex = store.list(T.matches, (m) => m.userId === a.id && m.opportunityId === r.opp.id)[0];
      const rec = { score: r.m.score, reasons: r.m.reasons, missing: r.m.missing, computedAt: nowIso() };
      if (ex) store.update(T.matches, ex.id, rec);
      else store.insert(T.matches, { userId: a.id, opportunityId: r.opp.id, ...rec }, "emat");
    }
  });
  return rows.map((r) => ({ ...r.opp, match: r.m }));
}

/* ---------------- applications (learner-initiated only) ---------------- */

export function apply(store: TenantStore, a: Actor, opportunityId: string, input: { share?: string[]; note?: string; mode?: string }, idempotencyKey: string) {
  if (!idempotencyKey) throw new CampusError("invalid", "An idempotency key is required.", 422);
  const o = store.get(T.opportunities, opportunityId);
  if (!o) throw new CampusError("not_found", "Opportunity not found", 404);
  const dup = store.list(T.applications, (x) => x.userId === a.id && (x.idempotencyKey === idempotencyKey || (x.opportunityId === opportunityId && x.state !== "withdrawn")))[0];
  if (dup) return { ...dup, duplicate: true };
  if (!isOpen(o)) throw new CampusError("closed", "This opportunity is closed.", 409);
  const share = (input.share ?? []).filter((f): f is Field => (PROFILE_FIELDS as readonly string[]).includes(f));
  // External listings: the learner applies on the official site; Scholarion only records it.
  const external = o.source !== "employer_posted";
  return store.tx(() => {
    const app = store.insert(T.applications, { userId: a.id, opportunityId, employerId: o.employerId ?? null, state: external ? "applied_externally" : "submitted", sharedFields: external ? [] : share, note: String(input.note ?? "").slice(0, 1000), idempotencyKey, authorizedAt: nowIso(), authorizedBy: a.id, history: [{ state: external ? "applied_externally" : "submitted", at: nowIso() }] }, "eapp");
    if (!external && o.employerId) {
      const recruiters = store.list(T.members, (m) => m.employerId === o.employerId).map((m) => String(m.userId));
      notify(store, recruiters, "employers", `New application: ${o.title}`, `A learner applied and chose to share: ${share.join(", ") || "nothing beyond the application"}.`, "/campus/{tenant}/hub/employer");
    }
    audit(store, a, "eco.application.create", `${T.applications}/${app.id}`, external ? "external" : `share=${share.join("|")}`);
    return app;
  });
}

export function myApplications(store: TenantStore, a: Actor) {
  return store.list(T.applications, (x) => x.userId === a.id).map((x) => ({ id: x.id, state: String(x.state), at: String(x.authorizedAt), sharedFields: (x.sharedFields as string[]) ?? [], opportunity: store.get(T.opportunities, String(x.opportunityId)) ? opportunityView(store, store.get(T.opportunities, String(x.opportunityId))!) : null }));
}

export function withdraw(store: TenantStore, a: Actor, id: string) {
  const x = store.get(T.applications, id);
  if (!x || x.userId !== a.id) throw new CampusError("not_found", "Application not found", 404);
  return store.tx(() => store.update(T.applications, id, { state: "withdrawn", history: [...((x.history as unknown[]) ?? []), { state: "withdrawn", at: nowIso() }] }));
}

/** Employer updates an application's status (interview, offer, hired, not selected). Placement ≠ completion. */
export function updateApplication(store: TenantStore, a: Actor, id: string, state: string) {
  const x = store.get(T.applications, id);
  if (!x) throw new CampusError("not_found", "Application not found", 404);
  const e = requireVerifiedEmployer(store, a, "eco.application.update");
  if (x.employerId !== e.id) throw new CampusError("forbidden", "Not your opportunity.", 403);
  if (!["reviewing", "interview", "offer", "hired", "not_selected"].includes(state)) throw new CampusError("invalid", "Unknown state.", 422);
  return store.tx(() => {
    const r = store.update(T.applications, id, { state, history: [...((x.history as unknown[]) ?? []), { state, at: nowIso(), by: a.id }] });
    notify(store, [String(x.userId)], "career", `Application update: ${state.replace("_", " ")}`, "Your application status changed.", "/campus/{tenant}/hub/career");
    return r;
  });
}

/* ---------------- employer portal: talent search & contact ---------------- */

/** Only opted-in learners, and only the fields each learner switched on. */
export function talentSearch(store: TenantStore, a: Actor, f: { skill?: string; opportunityId?: string } = {}) {
  const e = requireVerifiedEmployer(store, a, "eco.talent.search");
  const opp = f.opportunityId ? store.get(T.opportunities, f.opportunityId) : null;
  if (opp && opp.employerId !== e.id) throw new CampusError("forbidden", "Not your opportunity.", 403);
  const rows = store.list(T.profiles, (p) => !!p.discoverable).map((p) => {
    const uid = String(p.userId);
    const vis = { ...DEFAULT_VISIBILITY, ...((p.visible as Record<Field, boolean>) ?? {}) };
    const demo = demonstratedSkills(store, uid);
    const skills = [...new Set([...demo.map((d) => d.skill), ...((p.statedSkills as string[]) ?? [])])];
    if (f.skill && !(vis.skills && skills.includes(f.skill.toLowerCase()))) return null;
    const accepted = store.list(T.contacts, (c) => c.employerId === e.id && c.userId === uid && c.state === "accepted").length > 0;
    return {
      ref: candidateRef(e.id, uid),
      headline: vis.headline ? String(p.headline ?? "") : null,
      skills: vis.skills ? skills : null,
      certificates: vis.certificates ? demo.map((d) => d.evidence) : null,
      portfolio: vis.portfolio ? (p.portfolioUrl as string) ?? null : null,
      contact: vis.contact && accepted ? (p.contactEmail as string) ?? null : null,
      match: opp && vis.skills ? matchFor(store, uid, opp) : null,
    };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  audit(store, a, "eco.talent.search", `${T.employers}/${e.id}`, `${rows.length} results`);
  return rows;
}

/** Pseudonymous, per-employer candidate reference (not linkable across employers). */
export const candidateRef = (employerId: string, userId: string) => `cand_${crypto.createHash("sha256").update(`${employerId}:${userId}`).digest("hex").slice(0, 12)}`;

export function requestContact(store: TenantStore, a: Actor, ref: string, message: string, opportunityId?: string) {
  const e = requireVerifiedEmployer(store, a, "eco.contact.request");
  const p = store.list(T.profiles, (x) => !!x.discoverable && candidateRef(e.id, String(x.userId)) === ref)[0];
  if (!p) throw new CampusError("not_found", "Candidate not found", 404);
  const userId = String(p.userId);
  const open = store.list(T.contacts, (c) => c.employerId === e.id && c.userId === userId && c.state === "requested")[0];
  if (open) return open;
  return store.tx(() => {
    const c = store.insert(T.contacts, { employerId: e.id, userId, opportunityId: opportunityId ?? null, message: String(message ?? "").slice(0, 1000), state: "requested", requestedBy: a.id, requestedAt: nowIso() }, "ecr");
    notify(store, [userId], "career", `${e.name} would like to contact you`, "Accept to share the contact details you've chosen to make visible, or decline. Nothing is shared until you answer.", "/campus/{tenant}/hub/career");
    return c;
  });
}

export function answerContact(store: TenantStore, a: Actor, id: string, accept: boolean) {
  const c = store.get(T.contacts, id);
  if (!c || c.userId !== a.id) throw new CampusError("not_found", "Request not found", 404);
  return store.tx(() => {
    const r = store.update(T.contacts, id, { state: accept ? "accepted" : "declined", answeredAt: nowIso() });
    const recruiters = store.list(T.members, (m) => m.employerId === c.employerId).map((m) => String(m.userId));
    notify(store, recruiters, "employers", `Contact request ${accept ? "accepted" : "declined"}`, accept ? "The candidate accepted; their visible contact details are now shown in Talent search." : "The candidate declined.", "/campus/{tenant}/hub/employer");
    return r;
  });
}

export function myContactRequests(store: TenantStore, a: Actor) {
  return store.list(T.contacts, (c) => c.userId === a.id).map((c) => ({ id: c.id, employer: String(store.get(T.employers, String(c.employerId))?.name ?? ""), message: String(c.message), state: String(c.state), at: String(c.requestedAt) }));
}

export function employerPortal(store: TenantStore, a: Actor) {
  const e = memberOf(store, a);
  if (!e) return { employer: null, opportunities: [], applications: [], contacts: [] };
  const opps = store.list(T.opportunities, (o) => o.employerId === e.id).map((o) => opportunityView(store, o));
  const apps = e.verification === "verified" ? store.list(T.applications, (x) => x.employerId === e.id && x.state !== "withdrawn").map((x) => {
    const p = store.list(T.profiles, (pp) => pp.userId === x.userId)[0];
    const shared = (x.sharedFields as Field[]) ?? [];
    return { id: x.id, opportunity: String(store.get(T.opportunities, String(x.opportunityId))?.title ?? ""), state: String(x.state), at: String(x.authorizedAt), headline: shared.includes("headline") ? String(p?.headline ?? "") : null, skills: shared.includes("skills") ? [...new Set([...demonstratedSkills(store, String(x.userId)).map((d) => d.skill), ...((p?.statedSkills as string[]) ?? [])])] : null, certificates: shared.includes("certificates") ? demonstratedSkills(store, String(x.userId)).map((d) => d.evidence) : null, portfolio: shared.includes("portfolio") ? (p?.portfolioUrl as string) ?? null : null, contact: shared.includes("contact") ? (p?.contactEmail as string) ?? null : null, note: String(x.note ?? "") };
  }) : [];
  return { employer: employerView(e), opportunities: opps, applications: apps, contacts: store.list(T.contacts, (c) => c.employerId === e.id).map((c) => ({ id: c.id, state: String(c.state), at: String(c.requestedAt) })) };
}

/** Placement outcomes are reported separately from course completion. */
export function placementStats(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "advisor", "registrar"])) throw new CampusError("forbidden", "Staff only.", 403);
  const apps = store.list(T.applications, () => true);
  const by = (s: string) => apps.filter((x) => x.state === s).length;
  return { applications: apps.length, interviews: by("interview"), offers: by("offer"), hired: by("hired"), external: by("applied_externally"), note: "Placement outcomes are tracked separately from course completion and are not used as program claims.", at: nowMs() };
}
