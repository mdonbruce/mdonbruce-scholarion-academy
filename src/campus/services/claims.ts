import { nowIso, type TenantStore } from "../core";

/**
 * Honesty guard / Catalog Copy Checker. Flags claims that need verified evidence:
 * accreditation, degrees, postgraduate wording, rankings, partnerships, guarantees and
 * outcome statistics. A flag is cleared only by an approved claim recorded by an admin
 * with evidence (Catalog → Approved claims).
 */

const RULES: { id: string; label: string; re: RegExp }[] = [
  { id: "accreditation", label: "Accreditation claim", re: /\baccredit(ed|ation|s)?\b/i },
  { id: "degree", label: "Degree wording", re: /\b(degree|bachelor'?s|master'?s|doctorate|diploma)\b/i },
  { id: "postgraduate", label: "Postgraduate (PG) wording", re: /\b(PG|post-?graduate)\b/ },
  { id: "ranking", label: "Ranking claim", re: /\b(ranked|#\s?1\b|number one|top[- ]\d+|world[- ]class|best in)\b/i },
  { id: "partnership", label: "Partnership claim", re: /\b(partner(ed|ship)? with|in partnership|endorsed by|official partner)\b/i },
  { id: "guarantee", label: "Guarantee", re: /\bguarantee(d|s)?\b/i },
  { id: "outcome_stat", label: "Outcome statistic", re: /\b\d{1,3}\s?%\s+(of\s+)?(graduates|learners|students|alumni|placement|employment|hired|pass)/i },
  { id: "salary", label: "Salary claim", re: /\b(salary|earn up to|\$\d[\d,]*\s*(k|per year|\/yr))\b/i },
];

export interface CopyFlag {
  rule: string;
  label: string;
  match: string;
}

/** Names of public standards that look like claims but aren't (e.g. the OWASP Top 10 for LLM applications). */
const NOT_CLAIMS = [/\bOWASP (?:LLM )?Top 10\b/gi];

export function copyCheck(store: TenantStore, raw: string): CopyFlag[] {
  const text = NOT_CLAIMS.reduce((t, re) => t.replace(re, "OWASP list"), raw);
  const approved = store.list("approved_claims", (c) => !c.expiresAt || String(c.expiresAt) >= nowIso().slice(0, 10)).map((c) => String(c.phrase).toLowerCase());
  const flags: CopyFlag[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    // Approved if an approved phrase covers the sentence containing the match.
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => r.re.test(s)) ?? text;
    if (approved.some((p) => sentence.toLowerCase().includes(p))) continue;
    flags.push({ rule: r.id, label: r.label, match: m[0] });
  }
  return flags;
}
