import { CampusError, nowIso, sha256, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";

/**
 * Departments & Policy Rules (tab 64) — ported from the Python governed service
 * (governed/site/department_rules.py, department_service.py).
 *
 * Deterministic sandbox rules for finance holds, refunds and identity-verification results.
 * Nothing here executes: previews return the intents a future transactional worker would
 * apply. Missing policy fails closed. No policy values are installed by default — a person
 * (admin or registrar) loads a versioned policy. Money is always in integer minor units.
 * Identity results never accept ID images or ID numbers.
 */

export const POLICIES = "department_policies";
export const PREVIEWS = "department_previews";

export class PolicyMissing extends CampusError {
  constructor(path: string) {
    super("policy_missing", `Missing policy.${path}`, 409);
  }
}

export interface DepartmentPolicy {
  version?: string;
  finance?: {
    holds?: { advance_notice_seconds: number; reminder_days: number[]; levels: { name: "soft" | "hard"; after_days: number }[] };
    refunds?: { auto_approve_limit_minor: number; schedule: { through_day: number; refund_basis_points: number }[] };
  };
  identity?: { provider?: { mode: string; name: string }; retries?: { max_attempts: number } };
}

const bad = (m: string) => new CampusError("invalid", m, 422);
function int(v: unknown, name: string, min = 0): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw bad(`${name} must be an integer${min ? ` of at least ${min}` : ""}.`);
  return v;
}
function section<T>(policy: DepartmentPolicy, ...path: string[]): T {
  let v: unknown = policy;
  for (const k of path) {
    if (!v || typeof v !== "object" || !(k in (v as object))) throw new PolicyMissing(path.join("."));
    v = (v as Record<string, unknown>)[k];
  }
  return v as T;
}

/* ---------------- rules (pure) ---------------- */

export interface Invoice {
  balance_minor: number;
  due_at: number; // epoch seconds
  active_holds?: string[];
  announcements?: Partial<Record<"soft" | "hard", number>>;
}

/** Idempotent notice / hold intents. Notice always precedes enforcement; a late run postpones enforcement by the notice period. */
export function holdActions(policy: DepartmentPolicy, invoice: Invoice, now: number) {
  const rules = section<NonNullable<NonNullable<DepartmentPolicy["finance"]>["holds"]>>(policy, "finance", "holds");
  const notice = int(rules.advance_notice_seconds, "advance_notice_seconds", 1);
  if (!Array.isArray(rules.reminder_days) || !Array.isArray(rules.levels) || !rules.levels.length) throw bad("A hold schedule (reminder_days and levels) is required.");
  const amount = int(invoice?.balance_minor, "balance_minor");
  const due = int(invoice?.due_at, "due_at");
  int(now, "now");
  if (amount === 0) return (invoice.active_holds ?? []).map((h) => ({ key: `release:${h}`, type: "hold.released", hold: h }));
  const out: Record<string, unknown>[] = [];
  for (const day of rules.reminder_days) {
    int(day, "reminder day");
    if (now >= due + day * 86400) out.push({ key: `reminder:${day}`, type: "payment.reminder", amount_minor: amount, clearance: "Pay the outstanding invoice balance." });
  }
  for (const level of rules.levels) {
    if (level?.name !== "soft" && level?.name !== "hard") throw bad("Unknown hold level.");
    const effective = due + int(level.after_days, "after_days") * 86400;
    const announced = invoice.announcements?.[level.name];
    if (announced === undefined || announced === null) {
      if (now >= effective - notice) out.push({ key: `notice:${level.name}`, type: "hold.announced", hold: level.name, amount_minor: amount, clearance: "Pay the outstanding invoice balance.", effective_at: Math.max(effective, now + notice) });
    } else {
      int(announced, "announcement timestamp");
      if (now >= Math.max(effective, announced + notice) && now > announced && !(invoice.active_holds ?? []).includes(level.name)) out.push({ key: `place:${level.name}`, type: "hold.placed", hold: level.name });
    }
  }
  return out;
}

export interface Purchase {
  model: "pay_as_you_go" | "pay_in_full" | "installments";
  scope: "course" | "program";
  scope_id: string;
  paid_minor: number;
  refunded_minor: number;
}

/** Refund entitlement from the published schedule; over-limit or out-of-schedule goes to staff review. Never executes. */
export function refundQuote(policy: DepartmentPolicy, purchase: Purchase, elapsedDays: number) {
  const rules = section<NonNullable<NonNullable<DepartmentPolicy["finance"]>["refunds"]>>(policy, "finance", "refunds");
  const limit = int(rules.auto_approve_limit_minor, "auto_approve_limit_minor");
  if (!Array.isArray(rules.schedule) || !rules.schedule.length) throw bad("A refund schedule is required.");
  int(elapsedDays, "elapsed days");
  let prev = -1;
  let selected: number | null = null;
  for (const band of rules.schedule) {
    const day = int(band?.through_day, "through_day");
    const bps = int(band?.refund_basis_points, "refund_basis_points");
    if (day <= prev || bps > 10000) throw bad("Invalid refund schedule (days must ascend; at most 10,000 basis points).");
    prev = day;
    if (selected === null && elapsedDays <= day) selected = bps;
  }
  if (!["pay_as_you_go", "pay_in_full", "installments"].includes(purchase?.model)) throw bad("Unsupported payment model.");
  const scope = purchase.model === "pay_as_you_go" ? "course" : "program";
  if (purchase.scope !== scope || !purchase.scope_id) throw bad("Refund scope must match the payment model (pay-as-you-go → course; full or installments → program).");
  const paid = int(purchase.paid_minor, "paid_minor");
  const refunded = int(purchase.refunded_minor, "refunded_minor");
  if (refunded > paid) throw bad("Refunds exceed the collected amount.");
  if (selected === null) return { decision: "staff_review" as const, reason: "Outside the published schedule", scope, amount_minor: null, executed: false };
  const amount = Math.max(0, Math.floor((paid * selected) / 10000) - refunded);
  return { decision: amount > limit ? ("staff_review" as const) : ("eligible_within_policy" as const), reason: amount > limit ? "Above the automatic approval limit" : "Within schedule", scope, scope_id: purchase.scope_id, amount_minor: amount, executed: false };
}

const IDENTITY_FIELDS = new Set(["result", "provider_reference", "verified_at", "verified_name", "verified_dob"]);

/** Validate a sandbox identity-provider result. ID images and numbers are refused outright. */
export function identityResult(policy: DepartmentPolicy, payload: Record<string, unknown>, priorFailures: number) {
  const provider = section<{ mode: string; name: string }>(policy, "identity", "provider");
  const retries = section<{ max_attempts: number }>(policy, "identity", "retries");
  if (!provider || provider.mode !== "sandbox" || !provider.name) throw bad("A sandbox identity provider is required.");
  const max = int(retries?.max_attempts, "max_attempts", 1);
  int(priorFailures, "prior_failures");
  if (priorFailures >= max) return { result: "needs_review", retry_allowed: false, requires_review: true };
  const extra = Object.keys(payload ?? {}).filter((k) => !IDENTITY_FIELDS.has(k));
  if (extra.length) throw bad("Unexpected identity fields; ID images and ID numbers are never accepted.");
  const result = payload.result;
  if (result !== "verified" && result !== "failed" && result !== "needs_review") throw bad("Invalid provider result.");
  for (const k of ["provider_reference", "verified_at"]) {
    const v = payload[k];
    if (typeof v !== "string" || v.length < 1 || v.length > 200) throw bad("Provider reference and verification time are required.");
  }
  if (!/(Z|[+-]\d\d:\d\d)$/.test(String(payload.verified_at)) || Number.isNaN(Date.parse(String(payload.verified_at)))) throw bad("Verification time needs a time zone.");
  if (result === "verified") {
    const n = payload.verified_name;
    if (typeof n !== "string" || n.length < 1 || n.length > 200) throw bad("Verified name is required.");
    const dob = String(payload.verified_dob ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(`${dob}T00:00:00Z`))) throw bad("Verified date of birth must be YYYY-MM-DD.");
  }
  const record = Object.fromEntries(Object.entries(payload).filter(([k]) => IDENTITY_FIELDS.has(k) && (result === "verified" || (k !== "verified_name" && k !== "verified_dob"))));
  return { record, result, retry_allowed: result === "failed" && priorFailures + 1 < max, requires_review: result === "needs_review" || (result === "failed" && priorFailures + 1 >= max) };
}

/* ---------------- service ---------------- */

const REQUIRED = ["finance.holds", "finance.refunds", "identity.provider", "identity.retries"];

export function currentPolicy(store: TenantStore): { row: Record<string, unknown> | null; policy: DepartmentPolicy } {
  const row = store.list(POLICIES, (p) => p.state === "active").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
  return { row, policy: (row?.policy as DepartmentPolicy) ?? {} };
}

export function departmentStatus(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "registrar", "advisor", "instructor", "support"])) throw new CampusError("forbidden", "Staff only.", 403);
  const { row, policy } = currentPolicy(store);
  const missing = REQUIRED.filter((k) => k.split(".").reduce<unknown>((v, p) => (v && typeof v === "object" ? (v as Record<string, unknown>)[p] : undefined), policy) === undefined).map((k) => `policy.${k}`);
  return {
    mode: "sandbox",
    policyVersion: (row?.versionLabel as string) ?? null,
    policyChecksum: (row?.checksum as string) ?? null,
    missing,
    financialExecution: false,
    identityProviderConnected: false,
    departments: [
      { name: "Identity", status: policy.identity?.provider ? "Sandbox rules loaded; provider not connected" : "Blocked: no identity policy loaded" },
      { name: "Registration", status: "First-enrollment verification uses the Registration tab; identity provider not connected" },
      { name: "Admissions", status: "Operational in the Admissions tab (decisions are human)" },
      { name: "Finance", status: policy.finance?.holds && policy.finance?.refunds ? "Policy loaded — previews only; no processor or scheduler executes holds or refunds" : "Blocked: hold or refund policy missing" },
      { name: "Learning operations", status: "Operational in the LMS tabs" },
    ],
    previews: store
      .list(PREVIEWS)
      .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))
      .slice(0, 20)
      .map((p) => ({ id: p.id, kind: p.kind, policyVersion: p.policyVersion, executed: false, by: p.by, at: p.createdAt, summary: p.summary })),
  };
}

/** Load a new versioned policy (admin or registrar). The previous active policy is superseded, never edited. */
export function setPolicy(store: TenantStore, a: Actor, input: { versionLabel: string; policy: DepartmentPolicy }) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Only admins and registrars load department policy.", 403);
  const label = String(input.versionLabel ?? "").trim();
  if (!label || label.length > 60) throw bad("A version label (1–60 characters) is required.");
  const policy = input.policy;
  if (!policy || typeof policy !== "object") throw bad("Policy JSON is required.");
  // Validate each section that is present with representative sandbox inputs.
  const now = 1_000_000_000;
  if (policy.finance?.holds) holdActions(policy, { balance_minor: 1, due_at: now }, now);
  if (policy.finance?.refunds) refundQuote(policy, { model: "pay_in_full", scope: "program", scope_id: "validation", paid_minor: 1, refunded_minor: 0 }, 0);
  if (policy.identity?.provider || policy.identity?.retries) identityResult(policy, { result: "failed", provider_reference: "validation", verified_at: "2026-01-01T00:00:00Z" }, 0);
  const body = JSON.stringify(policy);
  const row = store.tx(() => {
    for (const p of store.list(POLICIES, (x) => x.state === "active")) store.update(POLICIES, p.id, { state: "superseded" });
    const r = store.insert(POLICIES, { versionLabel: label, policy: { ...policy, version: label }, checksum: sha256(body), state: "active", by: a.id, at: nowIso() }, "dpol");
    store.emit("department.policy.loaded", `${POLICIES}/${r.id}`, { versionLabel: label });
    return r;
  });
  audit(store, a, "department.policy.set", `${POLICIES}/${row.id}`, label);
  return { id: row.id, versionLabel: label, checksum: row.checksum };
}

/** Non-executing preview on synthetic data; every preview is recorded with the policy version. */
export function preview(store: TenantStore, a: Actor, input: { kind: "holds" | "refund" | "identity"; synthetic: boolean; invoice?: Invoice; purchase?: Purchase; elapsedDays?: number; identity?: Record<string, unknown>; priorFailures?: number; now?: number }) {
  if (!hasAny(a, ["admin", "registrar", "advisor", "instructor"])) throw new CampusError("forbidden", "Staff only.", 403);
  if (input.synthetic !== true) throw bad("Previews accept synthetic sandbox data only — confirm the data is synthetic.");
  const { row, policy } = currentPolicy(store);
  if (!row) throw new PolicyMissing("version (load a versioned policy first)");
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const result = input.kind === "holds" ? holdActions(policy, input.invoice as Invoice, now) : input.kind === "refund" ? refundQuote(policy, input.purchase as Purchase, Number(input.elapsedDays)) : identityResult(policy, input.identity ?? {}, Number(input.priorFailures ?? 0));
  const summary = Array.isArray(result) ? `${result.length} intent(s): ${result.map((x) => String(x.type)).join(", ") || "none"}` : String((result as { decision?: string; result?: string }).decision ?? (result as { result?: string }).result);
  const rec = store.tx(() => store.insert(PREVIEWS, { kind: input.kind, policyVersion: row.versionLabel, executed: false, by: a.id, summary }, "dprv"));
  audit(store, a, `department.preview.${input.kind}`, `${PREVIEWS}/${rec.id}`, summary);
  return { preview: result, executed: false, policyVersion: row.versionLabel, auditId: rec.id };
}

/** A synthetic example policy (clearly labelled) staff can load to try the previews. */
export const EXAMPLE_POLICY: DepartmentPolicy = {
  finance: {
    holds: { advance_notice_seconds: 3 * 86400, reminder_days: [1, 7], levels: [{ name: "soft", after_days: 14 }, { name: "hard", after_days: 30 }] },
    refunds: { auto_approve_limit_minor: 50000, schedule: [{ through_day: 7, refund_basis_points: 10000 }, { through_day: 14, refund_basis_points: 5000 }, { through_day: 28, refund_basis_points: 2500 }] },
  },
  identity: { provider: { mode: "sandbox", name: "Synthetic sandbox provider" }, retries: { max_attempts: 3 } },
};
