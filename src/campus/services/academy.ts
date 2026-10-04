import { broker, CampusError, metrics, nowIso, nowMs, registerConsumer, sha256, token, type Row, type TenantStore } from "../core";
import { entitlementFor, plusEligible } from "./plans";
import { addPublishCheck } from "../entity";
import { hasAny, type Actor } from "../iam";
import { audit, notify, requireTenant } from "./common";
import { copyCheck } from "./claims";
import { computeTotals } from "./grading";
import { moduleStates } from "./curriculum";
import { issueCredential } from "./success";
import { afterProgramCompletion, onProgramEnrollment, passNoPassChecks, programCheckoutGuard } from "./programs";

/**
 * Academy engine (Tabs 41–43): catalog hub generated from data, recommender quiz,
 * pathway graph with rule evaluation and waivers, the catalog consolidation report,
 * sandbox commerce (quotes, coupons, early-bird, installments, subscriptions, corporate
 * seats and invoices, simulated tax, refund/deferral policy, aid eligibility), self-paced
 * suggested deadlines, and completion → credential issuance.
 *
 * SANDBOX: no card data is accepted and no money moves. Orders carry a sandbox reference.
 */

export const PRODUCT_LABEL: Record<string, string> = {
  guided_project: "Guided Project",
  short_course: "Short Course",
  specialization: "Specialization",
  professional_certificate: "Professional Certificate",
  live_intensive: "Live Intensive",
  cohort_program: "Cohort Program",
  bundle: "Bundle",
  pathway: "Pathway",
  degree_track: "Degree-track",
};

/* ---------------- Catalog Copy Checker (publish gate) ---------------- */

addPublishCheck("offerings", (store, row) => {
  const issues: string[] = [];
  const flags = copyCheck(store, `${row.title} ${row.summary}`);
  if (flags.length) issues.push(`Catalog Copy Checker: unverified claim(s) — ${flags.map((f) => `${f.label} ("${f.match}")`).join("; ")}. Record an approved claim with evidence or change the wording.`);
  if (row.productType === "degree_track" && !store.list("tenant_settings", (s) => s.key === "tenant_type" && s.value === "university").length) issues.push("Degree-track offerings are for university tenants only.");
  if (row.aidEligible && !row.aidApprovalRef) issues.push("Aid eligibility needs an approval reference; non-credit offerings are not aid-eligible by default.");
  return issues;
});
addPublishCheck("credential_templates", (store, row) => copyCheck(store, `${row.name} ${row.wording}`).map((f) => `Honesty guard: ${f.label} ("${f.match}") needs an approved claim.`));

export function checkCopy(store: TenantStore, a: Actor, text: string) {
  if (!hasAny(a, ["admin", "designer", "registrar", "instructor"]) && !Object.values(a.courseRoles).some((r) => r.includes("instructor"))) throw new CampusError("forbidden", "Staff only.", 403);
  const flags = copyCheck(store, text);
  store.tx(() => store.insert("ai_audit", { agentKey: "catalog_copy_checker", promptCategory: "copy_check", promptHash: sha256(text), sourceIds: [], model: "scholarion-rules-v1 (deterministic)", decision: flags.length ? "flagged" : "clear", userId: a.id }, "aia"));
  return { ok: !flags.length, flags };
}

/* ---------------- Catalog hub ---------------- */

function seatsLeft(store: TenantStore, sec: Row) {
  return Math.max(0, Number(sec.capacity) - Number(sec.seatsTaken ?? 0));
}

function priceNow(o: Row) {
  const early = o.earlyBirdPrice !== undefined && o.earlyBirdPrice !== null && o.earlyBirdEndsAt && String(o.earlyBirdEndsAt) > nowIso();
  return { price: early ? Number(o.earlyBirdPrice) : Number(o.price), earlyBird: !!early, listPrice: Number(o.price), currency: (o.currency as string) ?? "USD" };
}

export function offeringCard(store: TenantStore, o: Row) {
  const secs = store.list("offering_sections", (s) => s.offeringId === o.id && String(s.registrationClosesAt) > nowIso()).sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt)));
  return {
    id: o.id,
    code: o.code as string,
    title: o.title as string,
    type: o.productType as string,
    typeLabel: PRODUCT_LABEL[o.productType as string] ?? String(o.productType),
    summary: o.summary as string,
    level: (o.level as string) ?? null,
    hours: (o.hours as number) ?? null,
    skills: (o.skills as string[]) ?? [],
    format: (o.format as string) ?? "online",
    selfPaced: !!o.selfPaced,
    inPlus: !!o.inPlus,
    aidEligible: !!o.aidEligible && !!o.aidApprovalRef,
    ...priceNow(o),
    nextCohort: secs[0] ? { id: secs[0].id, code: secs[0].code, startsAt: secs[0].startsAt, timeZone: secs[0].timeZone, seatsLeft: seatsLeft(store, secs[0]), closesAt: secs[0].registrationClosesAt } : null,
  };
}

/** Catalog pages built from data: filters, cards, comparison, path diagram and structured data. */
export function catalogHub(store: TenantStore, f: { type?: string; level?: string; skill?: string; q?: string; maxPrice?: number; compare?: string[] } = {}) {
  const all = store.list("offerings", (o) => o.state === "published");
  const items = all
    .filter((o) => (!f.type || o.productType === f.type) && (!f.level || o.level === f.level) && (!f.skill || ((o.skills as string[]) ?? []).includes(f.skill)))
    .filter((o) => !f.q || `${o.code} ${o.title} ${o.summary} ${((o.skills as string[]) ?? []).join(" ")}`.toLowerCase().includes(f.q.toLowerCase()))
    .filter((o) => f.maxPrice === undefined || priceNow(o).price <= f.maxPrice)
    .sort((x, y) => Number(String(x.code).replace(/\D/g, "")) - Number(String(y.code).replace(/\D/g, "")))
    .map((o) => offeringCard(store, o));
  const facets = {
    type: [...new Set(all.map((o) => o.productType as string))].map((t) => ({ value: t, label: PRODUCT_LABEL[t] ?? t, count: all.filter((o) => o.productType === t).length })),
    level: [...new Set(all.map((o) => (o.level as string) ?? "").filter(Boolean))],
    skill: [...new Set(all.flatMap((o) => (o.skills as string[]) ?? []))].sort(),
  };
  const comparison = (f.compare ?? []).slice(0, 4).map((id) => all.find((o) => o.id === id)).filter(Boolean).map((o) => {
    const c = offeringCard(store, o!);
    return { id: c.id, title: `${c.code} ${c.title}`, rows: { Type: c.typeLabel, Level: c.level ?? "—", Hours: c.hours ?? "—", Format: c.selfPaced ? "Self-paced" : c.format, Price: `${c.currency} ${c.price}${c.earlyBird ? " (early-bird)" : ""}`, "Included in subscription": c.inPlus ? "Yes" : "No", Skills: c.skills.join(", ") } };
  });
  const ids = new Set(all.map((o) => o.id));
  const edges = store.list("pathway_edges", (e) => ids.has(e.fromId as string) && ids.has(e.toId as string)).map((e) => ({ from: store.get("offerings", e.fromId as string)?.code, to: store.get("offerings", e.toId as string)?.code, kind: e.kind, moduleKey: e.moduleKey ?? null }));
  const diagram = ["flowchart LR", ...edges.map((e) => `  ${String(e.from).replace(/\W/g, "")}["${e.from}"] -->|${String(e.kind).replace("_", " ")}${e.moduleKey ? ` ${e.moduleKey}` : ""}| ${String(e.to).replace(/\W/g, "")}["${e.to}"]`)].join("\n");
  const tenant = broker.tenant(store.tenantId)!;
  const structuredData = { "@context": "https://schema.org", "@type": "ItemList", name: `${tenant.name} catalog`, itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Course", name: `${c.code} ${c.title}`, description: c.summary, provider: { "@type": "Organization", name: tenant.name }, offers: { "@type": "Offer", price: c.price, priceCurrency: c.currency, category: "Sandbox pricing (demo)" } } })) };
  return { tenant: { name: tenant.name, theme: tenant.theme, poweredBy: tenant.flags.powered_by !== false }, items, facets, comparison, edges, diagram, structuredData };
}

/* ---------------- Recommender quiz ---------------- */

export const RECOMMENDER_QUESTIONS = [
  { id: "goal", text: "What's your main goal?", options: [{ value: "start", label: "Start a new skill" }, { value: "advance", label: "Go deeper in a field I know" }, { value: "credential", label: "Earn a professional certificate" }, { value: "project", label: "Build a portfolio project" }] },
  { id: "experience", text: "How much experience do you have?", options: [{ value: "beginner", label: "New to this" }, { value: "intermediate", label: "Some experience" }, { value: "advanced", label: "Experienced" }] },
  { id: "hours", text: "How many hours a week can you spend?", options: [{ value: "3", label: "Up to 3" }, { value: "6", label: "3–6" }, { value: "10", label: "6–10" }, { value: "20", label: "More than 10" }] },
  { id: "format", text: "How do you like to learn?", options: [{ value: "self", label: "At my own pace" }, { value: "live", label: "Live with a cohort" }, { value: "any", label: "No preference" }] },
  { id: "interest", text: "Which area interests you most?", options: [{ value: "python", label: "Python & programming" }, { value: "ml", label: "Machine learning" }, { value: "deep-learning", label: "Deep learning" }, { value: "agents", label: "AI agents" }, { value: "data", label: "Data analysis" }] },
];

/** Score published offerings against the answers; explain why each was recommended. */
export function recommend(store: TenantStore, answers: Record<string, string>) {
  const goalType: Record<string, string[]> = { start: ["short_course", "guided_project"], advance: ["specialization", "live_intensive"], credential: ["professional_certificate", "specialization"], project: ["guided_project", "cohort_program"] };
  const hours = Number(answers.hours ?? 6);
  const scored = store
    .list("offerings", (o) => o.state === "published" && o.productType !== "degree_track")
    .map((o) => {
      const why: string[] = [];
      let score = 0;
      if (goalType[answers.goal]?.includes(o.productType as string)) {
        score += 3;
        why.push(`A ${PRODUCT_LABEL[o.productType as string]} fits your goal`);
      }
      if (answers.experience && o.level === answers.experience) {
        score += 2;
        why.push(`Matches your ${answers.experience} level`);
      }
      if (answers.interest && ((o.skills as string[]) ?? []).some((s) => s.toLowerCase().includes(answers.interest))) {
        score += 3;
        why.push(`Covers ${answers.interest.replace("-", " ")}`);
      }
      if (answers.format === "self" && o.selfPaced) {
        score += 1;
        why.push("Self-paced");
      }
      if (answers.format === "live" && (o.format === "live" || o.productType === "live_intensive" || o.productType === "cohort_program")) {
        score += 1;
        why.push("Live sessions with a cohort");
      }
      const weeks = o.hours ? Math.ceil(Number(o.hours) / Math.max(hours, 1)) : null;
      if (weeks !== null && weeks <= 12) score += 1;
      return { offering: offeringCard(store, o), score, why, estimatedWeeks: weeks };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return { top: scored[0] ?? null, alternatives: scored.slice(1, 4) };
}

/* ---------------- Pathway rules ---------------- */

function completedOfferings(store: TenantStore, userId: string): Set<string> {
  const done = new Set(store.list("offering_enrollments", (e) => e.userId === userId && !!e.completedAt).map((e) => e.offeringId as string));
  const history = store.list("academic_history", (h) => h.userId === userId && ["A", "B", "C", "P"].includes(String(h.grade))).map((h) => String(h.code));
  for (const r of store.list("transfer_rules", (t) => !t.moduleKey && history.includes(String(t.externalCode)))) done.add(r.offeringId as string);
  return done;
}

export interface PathwayResult {
  allowed: boolean;
  blockers: string[];
  waivedModules: { moduleKey: string; because: string }[];
  alreadyCredited: boolean;
}

/** Evaluate prerequisite / mutually-exclusive / waives rules and transfer credit for an enrollment. */
export function evaluatePathway(store: TenantStore, userId: string, offeringId: string): PathwayResult {
  const done = completedOfferings(store, userId);
  const active = new Set(store.list("offering_enrollments", (e) => e.userId === userId && e.state === "active").map((e) => e.offeringId as string));
  const blockers: string[] = [];
  const waived: { moduleKey: string; because: string }[] = [];
  const code = (id: string) => (store.get("offerings", id)?.code as string) ?? id;
  for (const e of store.list("pathway_edges", (x) => x.toId === offeringId)) {
    if (e.kind === "prerequisite" && !done.has(e.fromId as string)) blockers.push(`Complete ${code(e.fromId as string)} first.`);
    if (e.kind === "waives" && done.has(e.fromId as string) && e.moduleKey) waived.push({ moduleKey: e.moduleKey as string, because: `Completed ${code(e.fromId as string)}` });
  }
  for (const e of store.list("pathway_edges", (x) => x.kind === "mutually_exclusive" && (x.toId === offeringId || x.fromId === offeringId))) {
    const other = (e.toId === offeringId ? e.fromId : e.toId) as string;
    if (done.has(other) || active.has(other)) blockers.push(`You can't take this together with ${code(other)}.`);
  }
  const history = store.list("academic_history", (h) => h.userId === userId && ["A", "B", "C", "P"].includes(String(h.grade))).map((h) => String(h.code));
  for (const r of store.list("transfer_rules", (t) => t.offeringId === offeringId && !!t.moduleKey && history.includes(String(t.externalCode)))) waived.push({ moduleKey: r.moduleKey as string, because: `Transfer credit: ${r.externalCode} (${r.source})` });
  return { allowed: !blockers.length, blockers, waivedModules: waived, alreadyCredited: done.has(offeringId) };
}

function applyWaivers(store: TenantStore, userId: string, offering: Row, waived: PathwayResult["waivedModules"]) {
  if (!offering.courseId) return;
  for (const w of waived) {
    const m = store.list("modules", (x) => x.courseId === offering.courseId && x.moduleKey === w.moduleKey)[0];
    if (!m || store.list("module_waivers", (x) => x.userId === userId && x.moduleId === m.id).length) continue;
    store.insert("module_waivers", { userId, moduleId: m.id, courseId: offering.courseId, reason: w.because }, "mw");
    store.emit("pathway.rule_fired", `offerings/${offering.id}`, { userId, offeringId: offering.id, rule: "waives", moduleKey: w.moduleKey, because: w.because });
    store.audit({ actorId: "pathway-engine", actorRoles: [], action: "pathway.waive", resource: `modules/${m.id}`, outcome: "allowed", reason: `${userId}: ${w.because}` });
    metrics.inc("pathway_rules_fired_total", { rule: "waives" });
  }
}

/* ---------------- Consolidation report ---------------- */

/** Overlap between offerings (skills + modules), transfer rules, and merge/retire candidates. */
export function consolidationReport(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin", "designer", "registrar"], "catalog.consolidation");
  const offs = store.list("offerings");
  const setOf = (o: Row) => new Set([...((o.skills as string[]) ?? []).map((s) => `skill:${s.toLowerCase()}`), ...((o.moduleKeys as string[]) ?? []).map((m) => `module:${m}`)]);
  const pairs: { a: string; b: string; overlapPct: number; shared: string[]; recommendation: string }[] = [];
  for (let i = 0; i < offs.length; i++)
    for (let j = i + 1; j < offs.length; j++) {
      const A = setOf(offs[i]);
      const B = setOf(offs[j]);
      if (!A.size || !B.size) continue;
      const shared = [...A].filter((x) => B.has(x));
      const pct = Math.round((shared.length / new Set([...A, ...B]).size) * 100);
      if (pct === 0) continue;
      const rec = pct >= 60 ? "Merge candidate" : pct >= 35 ? "Add a waives rule or transfer mapping" : "Distinct";
      pairs.push({ a: `${offs[i].code} ${offs[i].title}`, b: `${offs[j].code} ${offs[j].title}`, overlapPct: pct, shared, recommendation: rec });
    }
  pairs.sort((x, y) => y.overlapPct - x.overlapPct);
  const enrollCount = (id: string) => store.list("offering_enrollments", (e) => e.offeringId === id).length;
  const retire = offs.filter((o) => o.state === "published" && enrollCount(o.id) === 0 && Date.parse(String(o.createdAt)) < nowMs() - 180 * 86400_000).map((o) => `${o.code} ${o.title}`);
  const report = { generatedAt: nowIso(), offerings: offs.length, overlaps: pairs, transferRules: store.list("transfer_rules").map((t) => ({ external: t.externalCode, source: t.source, equivalent: store.get("offerings", t.offeringId as string)?.code, module: t.moduleKey ?? "whole offering" })), mergeCandidates: pairs.filter((p) => p.overlapPct >= 60), retireCandidates: retire };
  store.tx(() => store.insert("report_runs", { kind: "catalog_consolidation", rows: pairs.length, csv: JSON.stringify(report), requestedBy: a.id }, "rr"));
  return report;
}

/* ---------------- Commerce (sandbox) ---------------- */

const TAX_RATES: Record<string, number> = { USD: 0, EUR: 0.2, GBP: 0.2, NGN: 0.075, INR: 0.18 }; // SIMULATED rates for the sandbox

function couponFor(store: TenantStore, code: string | undefined, offeringId: string, userId?: string) {
  if (!code) return null;
  const c = store.list("coupons", (x) => String(x.code).toUpperCase() === code.trim().toUpperCase())[0];
  if (!c) throw new CampusError("coupon_invalid", "That coupon code isn't valid.", 422);
  if (c.expiresAt && String(c.expiresAt) < nowIso()) throw new CampusError("coupon_expired", "That coupon has expired.", 422);
  if (c.maxRedemptions && Number(c.redemptions ?? 0) >= Number(c.maxRedemptions)) throw new CampusError("coupon_used_up", "That coupon has been fully used.", 422);
  if (c.offeringId && c.offeringId !== offeringId) throw new CampusError("coupon_invalid", "That coupon is for a different offering.", 422);
  if (c.userId && c.userId !== userId) throw new CampusError("coupon_invalid", userId ? "That code belongs to another account." : "Sign in to use your financial aid code.", 422);
  return c;
}

export function quote(store: TenantStore, input: { offeringId: string; coupon?: string; plan?: "full" | "installments" | "pay_later"; installments?: number; sectionId?: string; userId?: string }) {
  const o = store.get("offerings", input.offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Offering not found", 404);
  const p = priceNow(o);
  const c = couponFor(store, input.coupon, o.id, input.userId);
  const discount = c ? Math.min(p.price, Math.round((c.percentOff ? (p.price * Number(c.percentOff)) / 100 : Number(c.amountOff ?? 0)) * 100) / 100) : 0;
  const net = Math.round((p.price - discount) * 100) / 100;
  const tax = Math.round(net * (TAX_RATES[p.currency] ?? 0) * 100) / 100;
  const total = Math.round((net + tax) * 100) / 100;
  if (input.plan === "pay_later") {
    if (!o.payLaterAllowed) throw new CampusError("pay_later_unavailable", "Enroll now, pay later isn't offered for this program.", 422);
    // Pay later: nothing due today; the full amount is due 3 days before the batch starts (sandbox).
    const sec = input.sectionId ? store.get("offering_sections", input.sectionId) : undefined;
    const dueMs = sec ? new Date(String(sec.startsAt)).getTime() - 3 * 86400_000 : nowMs() + 14 * 86400_000;
    return { offeringId: o.id, currency: p.currency, listPrice: p.listPrice, price: p.price, earlyBird: p.earlyBird, discount, coupon: c?.code ?? null, tax, taxNote: "Simulated tax for the sandbox", total, plan: "pay_later", schedule: [{ due: new Date(Math.max(dueMs, nowMs())).toISOString().slice(0, 10), amount: total }], sandbox: true };
  }
  const n = input.plan === "installments" ? Math.min(Math.max(input.installments ?? 3, 2), 6) : 1;
  const schedule = Array.from({ length: n }, (_, i) => ({ due: new Date(nowMs() + i * 30 * 86400_000).toISOString().slice(0, 10), amount: Math.round((total / n + (i === n - 1 ? total - Math.round((total / n) * 100) / 100 * n : 0)) * 100) / 100 }));
  return { offeringId: o.id, currency: p.currency, listPrice: p.listPrice, price: p.price, earlyBird: p.earlyBird, discount, coupon: c?.code ?? null, tax, taxNote: "Simulated tax for the sandbox", total, plan: n > 1 ? "installments" : "full", schedule, sandbox: true };
}

/** Sandbox checkout → order, program enrollment, LMS enrollment, pathway waivers. */
export function checkout(store: TenantStore, a: Actor, input: { offeringId: string; sectionId?: string; coupon?: string; plan?: "full" | "installments" | "pay_later"; installments?: number; funding?: "self" | "federal_aid" | "employer"; idempotencyKey?: string; sandboxCard?: string }) {
  if (a.masqueradedBy) throw new CampusError("forbidden", "Purchases aren't allowed while acting as someone else.", 403);
  if (input.sandboxCard && !/^tok_sandbox_/.test(input.sandboxCard)) throw new CampusError("sandbox_only", "This is a sandbox. Use a sandbox token like tok_sandbox_visa — never a real card.", 422);
  const key = input.idempotencyKey ?? null;
  if (key) {
    const prior = store.list("orders", (o) => o.userId === a.id && o.idempotencyKey === key)[0];
    if (prior) return { order: prior, enrollment: store.list("offering_enrollments", (e) => e.orderId === prior.id)[0] ?? null };
  }
  const o = store.get("offerings", input.offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Offering not found", 404);
  if (input.funding === "federal_aid" && !(o.aidEligible && o.aidApprovalRef)) throw new CampusError("aid_ineligible", "This non-credit offering isn't eligible for federal aid.", 422);
  const path = evaluatePathway(store, a.id, o.id);
  if (!path.allowed) throw new CampusError("pathway_blocked", path.blockers.join(" "), 409, { blockers: path.blockers });
  if (store.list("offering_enrollments", (e) => e.userId === a.id && e.offeringId === o.id && e.state === "active" && e.source !== "audit").length) throw new CampusError("already_enrolled", "You're already enrolled.", 409);
  programCheckoutGuard(store, a.id, o, input.sectionId ?? null);
  const q = quote(store, { ...input, userId: a.id });
  return store.tx(() => {
    let sec: Row | undefined;
    let state = "active";
    if (input.sectionId) {
      sec = store.get("offering_sections", input.sectionId);
      if (!sec || sec.offeringId !== o.id) throw new CampusError("invalid", "That cohort isn't part of this offering.", 422);
      if (String(sec.registrationClosesAt) < nowIso()) throw new CampusError("closed", "Registration for that cohort has closed.", 423);
      if (seatsLeft(store, sec) <= 0) state = "waitlisted";
      else store.update("offering_sections", sec.id, { seatsTaken: Number(sec.seatsTaken ?? 0) + 1 });
    }
    const order = store.insert("orders", { userId: a.id, offeringId: o.id, sectionId: sec?.id ?? null, plan: q.plan, subtotal: q.price, discount: q.discount, tax: q.tax, total: q.total, currency: q.currency, state: state === "waitlisted" ? "waitlist_hold" : q.plan === "pay_later" ? "pay_later_sandbox" : "paid_sandbox", sandboxRef: `sbx_${token(10)}`, couponCode: q.coupon, installments: q.schedule, funding: input.funding ?? "self", idempotencyKey: key }, "ord");
    if (q.coupon) {
      const c = store.list("coupons", (x) => x.code === q.coupon)[0];
      store.update("coupons", c.id, { redemptions: Number(c.redemptions ?? 0) + 1 });
    }
    const enr = enrollInOffering(store, a.id, o, { sectionId: sec?.id ?? null, source: "purchase", state, orderId: order.id, waived: path.waivedModules });
    store.emit("orders.paid", `orders/${order.id}`, { orderId: order.id, userId: a.id, offeringId: o.id, total: q.total, currency: q.currency, sandbox: true });
    audit(store, a, "commerce.checkout", `orders/${order.id}`, `${o.code} ${q.currency} ${q.total} (sandbox)`);
    metrics.inc("commerce_orders_total", { state: order.state as string });
    return { order, enrollment: enr, waived: path.waivedModules };
  });
}

function enrollInOffering(store: TenantStore, userId: string, o: Row, opts: { sectionId: string | null; source: string; state: string; orderId?: string; waived: PathwayResult["waivedModules"] }) {
  // Upgrading from a free audit: the audit enrollment is closed and graded work unlocks.
  if (opts.state === "active") for (const x of store.list("offering_enrollments", (e) => e.userId === userId && e.offeringId === o.id && e.source === "audit" && e.state === "active")) store.update("offering_enrollments", x.id, { state: "upgraded" });
  const enr = store.insert("offering_enrollments", { userId, offeringId: o.id, sectionId: opts.sectionId, source: opts.source, state: opts.state, orderId: opts.orderId ?? null, waivedModules: opts.waived, completedAt: null, credentialId: null }, "oen");
  if (opts.state === "active" && o.courseId) {
    if (!store.list("enrollments", (e) => e.userId === userId && e.courseId === o.courseId && e.role === "student" && e.state === "active").length) store.insert("enrollments", { userId, courseId: o.courseId, role: "student", state: "active", source: opts.source, offeringEnrollmentId: enr.id }, "enr");
    onProgramEnrollment(store, userId, o, opts.sectionId);
    applyWaivers(store, userId, o, opts.waived);
    if (o.selfPaced) suggestDeadlines(store, userId, o);
  }
  store.emit("offering_enrollments.created", `offering_enrollments/${enr.id}`, { id: enr.id, userId, offeringId: o.id, courseId: o.courseId ?? null });
  notify(store, [userId], "course_invitations", opts.state === "active" ? `You're enrolled in ${o.code} ${o.title}` : `You're on the waitlist for ${o.code} ${o.title}`, "Open your dashboard to begin.", `/campus/{tenant}/dashboard`, (o.courseId as string) ?? null);
  return enr;
}

export function subscribe(store: TenantStore, a: Actor, plan = "Scholaris Plus") {
  if (store.list("subscriptions", (s) => s.userId === a.id && s.state === "active").length) throw new CampusError("conflict", "You already have an active subscription.", 409);
  return store.tx(() => {
    const s = store.insert("subscriptions", { userId: a.id, plan, state: "active", renewsAt: new Date(nowMs() + 30 * 86400_000).toISOString(), price: 39, sandboxRef: `sbx_${token(10)}` }, "subn");
    audit(store, a, "commerce.subscribe", `subscriptions/${s.id}`, plan);
    return s;
  });
}

/** Subscription entitlement: enroll in an offering included in the plan, without an order. */
export function enrollWithSubscription(store: TenantStore, a: Actor, offeringId: string) {
  const o = store.get("offerings", offeringId);
  if (!o || o.state !== "published") throw new CampusError("not_found", "Offering not found", 404);
  const legacy = store.list("subscriptions", (s) => s.userId === a.id && !s.kind && s.state === "active" && String(s.renewsAt) > nowIso())[0];
  const sub = entitlementFor(store, a.id, o) ?? legacy;
  if (!sub) throw new CampusError("no_subscription", "You need an active subscription.", 402);
  if (sub === legacy ? !o.inPlus : !(sub.kind === "program_monthly" ? sub.offeringId === o.id : plusEligible(o))) throw new CampusError("not_included", "This offering isn't included in your subscription.", 403);
  const path = evaluatePathway(store, a.id, o.id);
  if (!path.allowed) throw new CampusError("pathway_blocked", path.blockers.join(" "), 409);
  return store.tx(() => enrollInOffering(store, a.id, o, { sectionId: null, source: "subscription", state: "active", waived: path.waivedModules }));
}

export function cancelSubscription(store: TenantStore, a: Actor) {
  const sub = store.list("subscriptions", (s) => s.userId === a.id && s.state === "active")[0];
  if (!sub) throw new CampusError("not_found", "No active subscription", 404);
  return store.tx(() => store.update("subscriptions", sub.id, { state: "canceled", canceledAt: nowIso() }));
}

/** Corporate seats: assign a learner (counted in the transaction), invoice on creation. */
export function assignSeat(store: TenantStore, a: Actor, licenseId: string, email: string) {
  const lic = store.get("seat_licenses", licenseId);
  if (!lic) throw new CampusError("not_found", "Seat license not found", 404);
  if (!a.roles.includes("admin") && lic.managerId !== a.id) throw new CampusError("forbidden", "Only the seat manager or an admin can assign seats.", 403);
  const u = store.list("users", (x) => x.email === email.trim().toLowerCase())[0];
  if (!u) throw new CampusError("not_found", "No user with that email in this tenant.", 404);
  const assigned = (lic.assigned as string[]) ?? [];
  if (assigned.includes(u.id)) throw new CampusError("conflict", "Already assigned.", 409);
  if (assigned.length >= Number(lic.seats)) throw new CampusError("no_seats", "All seats are assigned.", 409);
  const o = store.get("offerings", lic.offeringId as string)!;
  return store.tx(() => {
    store.update("seat_licenses", lic.id, { assigned: [...assigned, u.id] });
    const path = evaluatePathway(store, u.id, o.id);
    return enrollInOffering(store, u.id, o, { sectionId: null, source: "seat", state: "active", waived: path.waivedModules });
  });
}

export function invoiceSeats(store: TenantStore, a: Actor, licenseId: string) {
  requireTenant(store, a, ["admin"], "commerce.invoice");
  const lic = store.get("seat_licenses", licenseId);
  if (!lic) throw new CampusError("not_found", "Seat license not found", 404);
  const o = store.get("offerings", lic.offeringId as string)!;
  return store.tx(() => {
    const n = store.list("invoices").length + 1;
    const unit = Number(o.price);
    const total = Math.round(unit * Number(lic.seats) * 100) / 100;
    const inv = store.insert("invoices", { number: `SBX-${String(n).padStart(5, "0")}`, billTo: lic.orgName, lines: [{ description: `${o.code} ${o.title} — ${lic.seats} seats`, qty: lic.seats, unit, amount: total }], total, currency: o.currency ?? "USD", state: "issued_sandbox" }, "inv");
    store.update("seat_licenses", lic.id, { invoiceId: inv.id });
    return inv;
  });
}

/**
 * Refund/deferral policy engine (explainable):
 *  - Refund in full within 14 days of purchase when under 20% progress.
 *  - Deferral to a later cohort up to 7 days after the cohort starts.
 *  - Otherwise declined, with the reason.
 */
export function requestRefund(store: TenantStore, a: Actor, orderId: string, kind: "refund" | "deferral", reason: string) {
  const order = store.get("orders", orderId);
  if (!order || (order.userId !== a.id && !a.roles.includes("admin"))) throw new CampusError("not_found", "Order not found", 404);
  const o = store.get("offerings", order.offeringId as string)!;
  const enr = store.list("offering_enrollments", (e) => e.orderId === order.id)[0];
  const daysSince = (nowMs() - Date.parse(String(order.createdAt))) / 86400_000;
  let progress = 0;
  if (o.courseId) {
    try {
      const learner = { ...a, id: order.userId as string, courseRoles: { [o.courseId as string]: ["student" as const] } };
      const states = moduleStates(store, learner, o.courseId as string);
      progress = states.length ? Math.round((states.filter((m) => m.complete).length / states.length) * 100) : 0;
    } catch {
      progress = 0;
    }
  }
  const sec = order.sectionId ? store.get("offering_sections", order.sectionId as string) : undefined;
  const checks = kind === "refund" ? [{ rule: "Within 14 days of purchase", ok: daysSince <= 14, value: `${Math.floor(daysSince)} days` }, { rule: "Under 20% progress", ok: progress < 20, value: `${progress}%` }] : [{ rule: "Cohort started no more than 7 days ago", ok: !sec || nowMs() - Date.parse(String(sec.startsAt)) <= 7 * 86400_000, value: sec ? String(sec.startsAt).slice(0, 10) : "self-paced" }];
  const approved = checks.every((c) => c.ok);
  return store.tx(() => {
    const r = store.insert("refund_requests", { userId: order.userId, orderId: order.id, kind, reason: reason.slice(0, 500), decision: approved ? "approved" : "declined", explanation: checks }, "rfd");
    if (approved && kind === "refund") {
      store.update("orders", order.id, { state: "refunded_sandbox" });
      if (enr) store.update("offering_enrollments", enr.id, { state: "withdrawn" });
      if (enr && o.courseId) for (const e of store.list("enrollments", (x) => x.offeringEnrollmentId === enr.id)) store.update("enrollments", e.id, { state: "inactive" });
      if (sec) store.update("offering_sections", sec.id, { seatsTaken: Math.max(0, Number(sec.seatsTaken ?? 1) - 1) });
    }
    if (approved && kind === "deferral" && enr) store.update("offering_enrollments", enr.id, { state: "deferred" });
    audit(store, a, `commerce.${kind}`, `orders/${order.id}`, approved ? "approved" : "declined");
    return r;
  });
}

/* ---------------- Self-paced: suggested deadlines ---------------- */

/** Spread the course's assignments over the offering's hours from today; never earlier than now. */
export function suggestDeadlines(store: TenantStore, userId: string, o: Row) {
  const items = store.list("assignments", (x) => x.courseId === o.courseId && x.state === "published").sort((x, y) => String(x.dueAt ?? "").localeCompare(String(y.dueAt ?? "")));
  if (!items.length) return 0;
  const weeks = Math.max(1, Math.ceil(Number(o.hours ?? 20) / 5));
  const step = (weeks * 7 * 86400_000) / items.length;
  let n = 0;
  for (const [i, asg] of items.entries()) {
    if (store.list("submissions", (s) => s.assignmentId === asg.id && s.userId === userId).length) continue;
    const due = new Date(nowMs() + (i + 1) * step).toISOString();
    const ex = store.list("assignment_overrides", (x) => x.assignmentId === asg.id && x.target === "student" && x.targetId === userId && x.source === "suggested")[0];
    if (ex) store.update("assignment_overrides", ex.id, { dueAt: due });
    else store.insert("assignment_overrides", { courseId: o.courseId, assignmentId: asg.id, target: "student", targetId: userId, dueAt: due, source: "suggested" }, "ao");
    n++;
  }
  return n;
}

/** Learner presses "Reset my deadlines": unfinished suggested deadlines move forward from today. */
export function resetDeadlines(store: TenantStore, a: Actor, offeringId: string) {
  const o = store.get("offerings", offeringId);
  if (!o?.selfPaced) throw new CampusError("invalid", "Only self-paced offerings have suggested deadlines.", 422);
  if (!store.list("offering_enrollments", (e) => e.userId === a.id && e.offeringId === o.id && e.state === "active").length) throw new CampusError("forbidden", "You're not enrolled.", 403);
  return store.tx(() => ({ moved: suggestDeadlines(store, a.id, o) }));
}

/* ---------------- Completion → credential ---------------- */

/** Check requirements (all modules complete, grade threshold, capstone) and issue the credential. */
export function evaluateCompletion(store: TenantStore, a: Actor | null, userId: string, offeringId: string) {
  const o = store.get("offerings", offeringId);
  if (!o?.courseId) throw new CampusError("not_found", "Offering not found", 404);
  if (a && a.id !== userId && !hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Not allowed", 403);
  const enr = store.list("offering_enrollments", (e) => e.userId === userId && e.offeringId === o.id && e.state === "active")[0];
  if (!enr) throw new CampusError("not_found", "Not enrolled", 404);
  const tpl = o.credentialTemplateId ? store.get("credential_templates", o.credentialTemplateId as string) : undefined;
  const courseIds = [o.courseId as string, ...((o.blockCourseIds as string[] | undefined) ?? [])];
  const learner = { id: userId, tenantId: store.tenantId, name: "", email: "", roles: [], courseRoles: Object.fromEntries(courseIds.map((c) => [c, ["student" as const]])), platformOperator: false, mfa: false, customRoles: [] };
  const mods = courseIds.flatMap((cid) => moduleStates(store, learner, cid).filter((m) => !/^Optional/.test(String(m.module.title)) && !/Program resources/.test(String(m.module.title))));
  const totals = computeTotals(store, o.courseId as string, userId);
  const blockTotals = courseIds.map((cid) => computeTotals(store, cid, userId).finalPct);
  const capstone = store.list("assignments", (x) => courseIds.includes(x.courseId as string) && /capstone/i.test(String(x.title)) && !/milestone/i.test(String(x.title)))[0];
  const capPct = capstone ? (() => {
    const g = store.list("grades", (x) => x.assignmentId === capstone.id && x.userId === userId && !!x.posted)[0];
    return g && capstone.points ? (Number(g.score) / Number(capstone.points)) * 100 : null;
  })() : null;
  const pnp = passNoPassChecks(store, userId, o);
  const checks = pnp ?? [
    { requirement: "All modules complete (waivers count)", ok: mods.length > 0 && mods.every((m) => m.complete) },
    { requirement: `Final grade ≥ ${tpl?.gradeThreshold ?? 70}%${courseIds.length > 1 ? " in every block" : ""}`, ok: blockTotals.every((p) => p !== null && p >= Number(tpl?.gradeThreshold ?? 70)) },
    ...(tpl?.requiresCapstone ? [{ requirement: "Capstone passed (≥ 70%)", ok: capPct !== null && capPct >= 70 }] : []),
  ];
  if (!checks.every((c) => c.ok)) return { completed: false, checks };
  return store.tx(() => {
    store.update("offering_enrollments", enr.id, { completedAt: nowIso(), state: "completed" });
    store.emit("offering_enrollments.completed", `offering_enrollments/${enr.id}`, { id: enr.id, userId, offeringId: o.id });
    if (tpl?.approvalRequired) {
      store.insert("review_queue", { agentKey: "credential_issuance", summary: `Approve credential: ${o.code} ${o.title} for ${userId}`, draft: { userId, offeringId: o.id }, targetType: "offering_enrollments", targetId: enr.id, courseId: o.courseId, requestedBy: "pathway-engine", state: "pending", reviewerId: null }, "rq");
      return { completed: true, checks, credential: null, pendingApproval: true };
    }
    const cred = issueCredential(store, null, { userId, courseId: o.courseId as string, title: `${o.code} ${o.title}`, kind: o.productType === "guided_project" || o.productType === "short_course" ? "badge" : "certificate", templateId: tpl?.id, achievementType: o.productType === "short_course" ? "Badge" : "Certificate", evidence: [{ name: pnp ? "Pass (all pass/no-pass requirements met)" : `Final grade ${totals.finalPct}%` }] });
    store.update("offering_enrollments", enr.id, { credentialId: cred.id });
    const graded = afterProgramCompletion(store, userId, o);
    return { completed: true, checks, credential: cred, gradedPerformance: graded, pendingApproval: false };
  });
}

// When grades are posted, check program completion for affected learners.
registerConsumer({
  name: "completion-evaluator",
  types: ["grades.posted"],
  handle(store, e) {
    const courseId = String(e.data.courseId ?? "");
    const userIds = (e.data.userIds as string[]) ?? [];
    for (const o of store.list("offerings", (x) => x.courseId === courseId))
      for (const uid of userIds) {
        if (!store.list("offering_enrollments", (x) => x.userId === uid && x.offeringId === o.id && x.state === "active").length) continue;
        try {
          evaluateCompletion(store, null, uid, o.id);
        } catch {
          /* not complete yet */
        }
      }
  },
});

/* ---------------- Program & commerce analytics ---------------- */

export function programAnalytics(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin", "registrar", "designer", "advisor"], "analytics.program");
  return store.list("offerings").map((o) => {
    const enr = store.list("offering_enrollments", (e) => e.offeringId === o.id);
    const orders = store.list("orders", (x) => x.offeringId === o.id);
    const completed = enr.filter((e) => e.completedAt).length;
    return {
      offering: `${o.code} ${o.title}`,
      funnel: { orders: orders.length, enrolled: enr.filter((e) => ["active", "completed"].includes(String(e.state))).length, waitlisted: enr.filter((e) => e.state === "waitlisted").length, completed, credentialed: enr.filter((e) => e.credentialId).length },
      completionRate: enr.length ? Math.round((completed / enr.length) * 100) : null,
      waivers: enr.filter((e) => ((e.waivedModules as unknown[]) ?? []).length).length,
      revenueSandbox: orders.filter((x) => x.state === "paid_sandbox").reduce((s, x) => s + Number(x.total), 0),
      refunds: orders.filter((x) => x.state === "refunded_sandbox").length,
    };
  });
}

export function commerceAnalytics(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin"], "analytics.commerce");
  const orders = store.list("orders");
  const paid = orders.filter((o) => o.state === "paid_sandbox");
  return {
    sandbox: true,
    orders: orders.length,
    revenue: paid.reduce((s, o) => s + Number(o.total), 0),
    byCurrency: Object.fromEntries([...new Set(paid.map((o) => String(o.currency)))].map((c) => [c, paid.filter((o) => o.currency === c).reduce((s, o) => s + Number(o.total), 0)])),
    couponRedemptions: store.list("coupons").reduce((s, c) => s + Number(c.redemptions ?? 0), 0),
    activeSubscriptions: store.list("subscriptions", (s) => s.state === "active").length,
    refunds: store.list("refund_requests", (r) => r.decision === "approved" && r.kind === "refund").length,
    deferrals: store.list("refund_requests", (r) => r.decision === "approved" && r.kind === "deferral").length,
    installmentPlans: orders.filter((o) => o.plan === "installments").length,
  };
}
