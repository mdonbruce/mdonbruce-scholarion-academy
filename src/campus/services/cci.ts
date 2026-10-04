import crypto from "node:crypto";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import type { ProgramSpec } from "../academy/programs-data";
import { bloomOf, BLOOM, designFor, isDesignProgram, tokens } from "../academy/design";
import { copyCheck } from "./claims";
import { audit } from "./common";
import { designGate } from "./design";

/**
 * Curriculum & Course Intelligence (CCI). AI drafts, humans decide:
 * - Everything generated here is an AI DRAFT (template-based; no model is called) until approved
 *   through the proposal workflow, where the creator can never approve.
 * - Standards mapping uses framework packs that a person loads and verifies; outputs are
 *   "evidence for review", never "compliant", "approved" or "accredited".
 * - The Curriculum Exchange moves curriculum packages only — never learner data, grades,
 *   identities, analytics, tutor memory or issued credentials. Credit status stays explicit;
 *   Academy content is non-credit and credit-equivalence candidates are never shown as credit.
 * - Course-health and assessment analytics use aggregates only.
 */

export const CCI_DRAFT = "AI DRAFT — requires review and approval before use.";
const STAFF = ["admin", "designer", "instructor", "registrar"] as const;
const requireStaff = (a: Actor) => {
  if (!hasAny(a, [...STAFF])) throw new CampusError("forbidden", "Curriculum staff only.", 403);
};

const specs = (store: TenantStore) => store.list("program_pages").map((p) => p.spec as ProgramSpec).filter(Boolean).sort((a, b) => Number(a.code.replace(/\D/g, "")) - Number(b.code.replace(/\D/g, "")));
const programText = (s: ProgramSpec) => [s.title, s.valueStatement, ...s.outcomes, ...s.curriculum.map((w) => `${w.title} ${w.focus}`), ...s.projects.map((p) => `${p.name} ${p.description}`)].join(" ");

/* ---------------- knowledge graph ---------------- */

export function graph(store: TenantStore, a: Actor) {
  requireStaff(a);
  const nodes: { id: string; type: string; label: string; attrs?: Record<string, unknown> }[] = [];
  const edges: { from: string; to: string; type: string }[] = [];
  nodes.push({ id: "src:scholarion", type: "Institution source", label: "Scholarion Academy (Scholaris standard, non-credit)" });
  for (const p of store.list("cci_packages", (x) => x.state === "approved")) nodes.push({ id: `pkg:${p.id}`, type: "Institution source", label: `${p.sourceName} package ${p.version} (${p.creditStatus})` });
  for (const s of specs(store)) {
    const pid = `prog:${s.code}`;
    nodes.push({ id: pid, type: "Program", label: `${s.code} ${s.title}`, attrs: { weeks: s.weeks, level: s.level, credit: "non-credit" } });
    edges.push({ from: pid, to: "src:scholarion", type: "derived_from_package" });
    s.outcomes.forEach((o, i) => {
      const id = `${pid}:C${i + 1}`;
      nodes.push({ id, type: "Competency", label: o, attrs: { bloom: BLOOM[bloomOf(o).level] } });
      edges.push({ from: pid, to: id, type: "teaches" });
    });
    for (const p of s.projects) {
      const id = `${pid}:${p.key}`;
      nodes.push({ id, type: "Assessment", label: p.name, attrs: { kind: p.kind } });
      edges.push({ from: id, to: pid, type: "assesses" });
      for (const sk of p.skills) {
        const sid = `skill:${sk.toLowerCase()}`;
        if (!nodes.some((n) => n.id === sid)) nodes.push({ id: sid, type: "Skill", label: sk });
        edges.push({ from: id, to: sid, type: "maps_to_skill" });
      }
    }
    for (const g of s.tools) for (const t of g.items) {
      const tid = `tool:${t.toLowerCase()}`;
      if (!nodes.some((n) => n.id === tid)) nodes.push({ id: tid, type: "Tool / version", label: t });
      edges.push({ from: pid, to: tid, type: "uses_tool" });
    }
    for (const w of s.waives ?? []) edges.push({ from: pid, to: `prog:${w.toCode}`, type: "builds_on" });
  }
  const counts = nodes.reduce<Record<string, number>>((m, n) => ((m[n.type] = (m[n.type] ?? 0) + 1), m), {});
  return { nodes: nodes.length, edges: edges.length, byType: counts, sample: { nodes: nodes.slice(0, 40), edges: edges.slice(0, 40) } };
}

/* ---------------- overlap ---------------- */

export function overlapPct(a: string, b: string) {
  const A = tokens(a);
  const B = tokens(b);
  const inter = [...A].filter((x) => B.has(x));
  const union = new Set([...A, ...B]).size || 1;
  return { pct: Math.round((inter.length / union) * 1000) / 10, shared: inter.slice(0, 12) };
}

export function overlapMatrix(store: TenantStore, a: Actor, threshold = 35) {
  requireStaff(a);
  const all = specs(store);
  const pairs: { a: string; b: string; pct: number; shared: string[]; recommendation: string }[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const o = overlapPct(programText(all[i]), programText(all[j]));
      if (o.pct >= threshold) pairs.push({ a: `${all[i].code} ${all[i].title}`, b: `${all[j].code} ${all[j].title}`, pct: o.pct, shared: o.shared, recommendation: o.pct >= 60 ? "Merge or make mutually exclusive" : o.pct >= 45 ? "Differentiate, or share modules with a credit-transfer rule" : "Shared module candidate" });
    }
  return pairs.sort((x, y) => y.pct - x.pct);
}

/* ---------------- Program Design Studio ---------------- */

const LADDER = ["Explain", "Apply", "Analyze", "Evaluate", "Design"];
export function draftProgram(store: TenantStore, a: Actor, input: { title: string; audience: string; level: string; weeks: number; delivery: string; skills: string[]; roles?: string[]; constraints?: string }) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Program drafts are created by designers.", 403);
  const title = String(input.title ?? "").trim();
  if (title.length < 6) throw new CampusError("invalid", "Give the program a working title.", 422);
  const weeks = Math.min(52, Math.max(4, Math.round(Number(input.weeks) || 10)));
  const skills = (input.skills ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  if (skills.length < 3) throw new CampusError("invalid", "List at least three target skills.", 422);
  const outcomes = LADDER.map((v, i) => `${v} ${skills[i % skills.length].toLowerCase()}${i >= 3 ? " for a realistic scenario, stating trade-offs and limits" : ""}.`);
  const blocks = weeks >= 16 ? 2 : 1;
  const standard = weeks <= 6 ? "Scaled 6-week standard" : weeks >= 16 ? "Two 10-week blocks" : weeks >= 12 ? "Extended block (capstone weeks)" : "10-week block";
  const sequence = Array.from({ length: weeks }, (_x, i) => ({ week: i + 1, title: i === weeks - 1 ? "Capstone defense and demo" : i === Math.floor(weeks / 2) - 1 ? "Midterm build week" : `${skills[i % skills.length]}${i >= skills.length ? " — applied" : ""}` }));
  const text = `${title} ${outcomes.join(" ")} ${skills.join(" ")}`;
  const overlaps = specs(store).map((s) => ({ code: s.code, title: s.title, ...overlapPct(text, programText(s)) })).sort((x, y) => y.pct - x.pct).slice(0, 5);
  const top = overlaps[0];
  const copy = `${title}. A ${weeks}-week ${input.delivery} program for ${input.audience}. You will ${outcomes.map((o) => o.charAt(0).toLowerCase() + o.slice(1)).join(" ")} Scholaris AI Academy certificate of completion (non-credit).`;
  const claims = copyCheck(store, copy);
  const draft = {
    title,
    status: CCI_DRAFT,
    audience: input.audience,
    level: input.level,
    weeks,
    delivery: input.delivery,
    standard,
    blocks,
    outcomes: outcomes.map((o, i) => ({ id: `C${i + 1}`, text: o, bloom: BLOOM[bloomOf(o).level] })),
    sequence,
    capstone: `Capstone: apply ${skills.slice(0, 3).join(", ")} to one realistic sandbox scenario with synthetic data, an evaluation report and a live defense.`,
    workload: { hoursPerWeek: input.delivery === "self-paced" ? [4, 6] : [6, 10], totalHours: weeks * (input.delivery === "self-paced" ? 5 : 8) },
    pathway: top && top.pct >= 45 ? `Place after ${top.code} or share modules with it; propose a waiver for overlapping weeks.` : "Stands alone; add prerequisite edges once modules are mapped.",
    overlap: overlaps,
    overlapFlag: top && top.pct >= 60 ? `High overlap (${top.pct}%) with ${top.code} ${top.title} — differentiate or merge.` : top && top.pct >= 45 ? `Moderate overlap (${top.pct}%) with ${top.code} — consider shared modules.` : null,
    catalogDraft: copy,
    claims: claims.map((c) => `${c.label}: "${c.match}"`),
    constraints: input.constraints ?? null,
  };
  const row = store.tx(() => store.insert("cci_drafts", { kind: "program", title, payload: draft, state: "AI Draft", createdBy: a.id }, "cdr"));
  audit(store, a, "cci.draft_program", `cci_drafts/${row.id}`);
  return { id: row.id, ...draft };
}

/* ---------------- alignment & skills ---------------- */

export function alignment(store: TenantStore, a: Actor, code: string) {
  requireStaff(a);
  const s = specs(store).find((x) => x.code === code);
  if (!s) throw new CampusError("not_found", "Program not found", 404);
  if (!isDesignProgram(s.code)) {
    // Generic: outcomes × weeks from text overlap.
    const outs = s.outcomes.map((o, i) => ({ id: `C${i + 1}`, text: o, bloom: BLOOM[bloomOf(o).level] }));
    const heat = outs.map((o) => ({ outcome: o.id, weeks: s.curriculum.map((w) => ({ week: w.week, level: tokens(o.text).size && [...tokens(o.text)].some((t) => tokens(`${w.title} ${w.focus}`).has(t)) ? 1 : 0 })) }));
    return { code: s.code, title: s.title, outcomes: outs, heat, issues: outs.filter((o) => !heat.find((h) => h.outcome === o.id)!.weeks.some((w) => w.level)).map((o) => ({ kind: "orphan_outcome", target: o.id, detail: "No week mentions this outcome's key terms.", fix: "Map a module and an assessment to it." })), assessments: [] };
  }
  const d = designFor(s);
  const heat = d.outcomes.map((o) => {
    const m = d.matrix.find((x) => x.outcome === o.id)!;
    return { outcome: o.id, weeks: d.weeks.filter((w) => !w.optional).map((w) => ({ week: w.week, level: w.week === m.mastered ? 3 : w.week === m.developed ? 2 : w.week === m.introduced ? 1 : w.outcomes.includes(o.id) ? 1 : 0 })) };
  });
  return { code: s.code, title: s.title, outcomes: d.outcomes.map((o) => ({ id: o.id, text: o.text, bloom: o.bloomName })), heat, issues: d.issues, assessments: d.assessments.map((x) => ({ id: x.id, kind: x.kind, week: x.week, outcomes: x.outcomes, bloomCap: BLOOM[x.bloomCap] })) };
}

export function skillsMap(store: TenantStore, a: Actor) {
  requireStaff(a);
  const bySkill = new Map<string, Set<string>>();
  const roles = new Map<string, Set<string>>();
  for (const s of specs(store)) {
    for (const p of s.projects) for (const sk of p.skills) (bySkill.get(sk.toLowerCase()) ?? bySkill.set(sk.toLowerCase(), new Set()).get(sk.toLowerCase())!).add(s.code);
    if (isDesignProgram(s.code)) for (const r of designFor(s).career.roles) (roles.get(r) ?? roles.set(r, new Set()).get(r)!).add(s.code);
  }
  return {
    skills: [...bySkill.entries()].map(([skill, codes]) => ({ skill, programs: [...codes], coverage: codes.size })).sort((x, y) => y.coverage - x.coverage),
    roles: [...roles.entries()].map(([role, codes]) => ({ role, programs: [...codes] })),
    taxonomies: [{ name: "O*NET", status: "not loaded", note: "Load with its licence (public domain, US DOL) and version date before mapping." }, { name: "ESCO", status: "not loaded", note: "EU taxonomy; verify licence terms and version before loading." }, { name: "SFIA", status: "not loaded", note: "Licensed framework; needs an agreement before use." }],
    note: "Roles are where these skills are used. No salary or demand statistics are shown without a verified, dated primary source.",
  };
}

/* ---------------- standards mapper ---------------- */

export function loadFrameworkPack(store: TenantStore, a: Actor, input: { name: string; source: string; version: string; publishedOn: string; items: { id: string; text: string }[]; verifiedBy: string }) {
  if (!hasAny(a, ["admin", "registrar"])) throw new CampusError("forbidden", "Framework packs are loaded by standards reviewers.", 403);
  if (!input.name || !input.source || !input.version || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.publishedOn))) throw new CampusError("invalid", "A framework pack needs a name, source, version and published date (YYYY-MM-DD).", 422);
  if (!/^https:\/\//.test(input.source)) throw new CampusError("invalid", "Source must be the official https:// location of the framework.", 422);
  const items = (input.items ?? []).filter((x) => x && x.id && x.text).slice(0, 500);
  if (!items.length) throw new CampusError("invalid", "Paste the framework's items (id and text) exactly as published.", 422);
  if (!String(input.verifiedBy ?? "").trim()) throw new CampusError("invalid", "Record who verified the pack against its source.", 422);
  const row = store.tx(() => store.insert("cci_framework_packs", { name: input.name, source: input.source, version: input.version, publishedOn: input.publishedOn, items, verifiedBy: input.verifiedBy, loadedBy: a.id, checksum: crypto.createHash("sha256").update(JSON.stringify(items)).digest("hex") }, "cfp"));
  audit(store, a, "cci.framework_pack", `cci_framework_packs/${row.id}`, `${input.name} ${input.version}`);
  return row;
}

export function evidencePack(store: TenantStore, a: Actor, code: string, packId: string) {
  requireStaff(a);
  const s = specs(store).find((x) => x.code === code);
  const pack = store.get("cci_framework_packs", packId);
  if (!s || !pack) throw new CampusError("not_found", "Program or framework pack not found", 404);
  const items = pack.items as { id: string; text: string }[];
  const outs = s.outcomes.map((o, i) => ({ id: `C${i + 1}`, text: o }));
  // Coverage: share of the framework item's key terms found in the competency and the weeks that teach it.
  const cover = (item: string, text: string) => {
    const A = tokens(item);
    const B = tokens(text);
    return A.size ? Math.round(([...A].filter((x) => B.has(x)).length / A.size) * 100) : 0;
  };
  const crosswalk = items.map((it) => {
    const best = outs.map((o) => ({ o, sc: cover(it.text, `${o.text} ${s.curriculum.filter((w) => [...tokens(o.text)].some((t) => tokens(w.focus).has(t))).map((w) => w.focus).join(" ")}`) })).sort((x, y) => y.sc - x.sc)[0];
    return { item: it.id, text: it.text, candidate: best && best.sc >= 25 ? best.o.id : null, coveragePct: best?.sc ?? 0, strength: best ? (best.sc >= 50 ? "strong" : best.sc >= 25 ? "partial" : "none") : "none" };
  });
  const hours = s.weeks * ((s.hoursPerWeek?.[0] ?? 5) + (s.hoursPerWeek?.[1] ?? 7)) / 2;
  return {
    label: "Evidence for review — not a compliance, approval or accreditation determination.",
    program: `${s.code} ${s.title}`,
    framework: `${pack.name} ${pack.version} (${pack.publishedOn}, ${pack.source})`,
    crosswalk,
    gaps: crosswalk.filter((c) => c.strength === "none").map((c) => `${c.item}: ${c.text}`),
    learningHours: { weeks: s.weeks, estimatedTotal: Math.round(hours), note: "Learning hours, not credit hours. Academy programs are non-credit." },
    reviewer: "A Standards/Authorization Reviewer must check every candidate mapping.",
  };
}

/* ---------------- course health & assessment intelligence ---------------- */

export function courseHealth(store: TenantStore, a: Actor, courseId: string) {
  requireStaff(a);
  const c = store.get("courses", courseId);
  if (!c) throw new CampusError("not_found", "Course not found", 404);
  const learners = store.list("enrollments", (e) => e.courseId === courseId && e.role === "student" && e.state === "active" && e.source !== "student_view").map((e) => String(e.userId));
  const mods = store.list("modules", (m) => m.courseId === courseId && m.state === "published").sort((x, y) => Number(x.position) - Number(y.position));
  const items = store.list("module_items", (i) => i.courseId === courseId && !!i.requirement);
  const prog = store.list("module_progress", (p) => p.courseId === courseId);
  const done = (uid: string, modId: string) => {
    const req = items.filter((i) => i.moduleId === modId);
    return req.length > 0 && req.every((i) => prog.some((p) => p.userId === uid && p.itemId === i.id));
  };
  const completion = mods.map((m) => ({ module: String(m.title), completed: learners.filter((u) => done(u, m.id)).length }));
  const drop = completion.map((m, i) => (i === 0 ? Math.max(0, learners.length - m.completed) : Math.max(0, completion[i - 1].completed - m.completed)));
  const avgDrop = drop.length ? drop.reduce((x, y) => x + y, 0) / drop.length : 0;
  const subs = store.list("graded_submissions", (g) => g.courseId === courseId && ["graded", "posted"].includes(String(g.state)));
  const gitems = store.list("graded_items", (g) => g.courseId === courseId);
  const comp = new Map<string, number[]>();
  for (const g of subs) {
    const it = gitems.find((x) => x.id === g.itemId);
    for (const cId of (it?.competencies as string[] | undefined) ?? []) (comp.get(cId) ?? comp.set(cId, []).get(cId)!).push(Number(g.score ?? 0));
  }
  const mastery = [...comp.entries()].map(([cId, sc]) => ({ competency: cId, learnersAttempts: sc.length, masteryPct: Math.round((sc.filter((x) => x >= 70).length / sc.length) * 100) }));
  const alerts: string[] = [];
  completion.forEach((m, i) => {
    if (learners.length >= 3 && avgDrop > 0 && drop[i] >= 2 * avgDrop && drop[i] >= 2) alerts.push(`${m.module}: drop-off is ${(drop[i] / avgDrop).toFixed(1)}× the course average.`);
  });
  for (const m of mastery) if (m.learnersAttempts >= 3 && m.masteryPct < 60) alerts.push(`Competency ${m.competency}: mastery is ${m.masteryPct}% (below 60%).`);
  const parts = {
    engagement: learners.length ? Math.round((completion.reduce((x, m) => x + m.completed, 0) / Math.max(1, mods.length * learners.length)) * 100) : null,
    mastery: mastery.length ? Math.round(mastery.reduce((x, m) => x + m.masteryPct, 0) / mastery.length) : null,
    accessibility: accessibilityAudit(store, a, courseId).score,
  };
  const known = Object.values(parts).filter((v): v is number => v !== null);
  return { course: `${c.code} ${c.title}`, learners: learners.length, completion, dropOff: drop, mastery, alerts, score: known.length ? Math.round(known.reduce((x, y) => x + y, 0) / known.length) : null, parts, explanation: "Score = average of the measured parts (engagement: module completion; mastery: share of graded attempts at 70%+; accessibility: audit pass rate). Parts without data are left out, not guessed.", notMeasured: ["Time-on-task vs estimate (no timing events yet)", "Tutor question clusters (de-identified clustering not enabled)"] };
}

export function itemAnalysis(store: TenantStore, a: Actor, courseId: string) {
  requireStaff(a);
  const attempts = store.list("attempts", (x) => x.courseId === courseId && ["submitted", "graded"].includes(String(x.state)));
  const qs = new Map(store.list("questions", (q) => q.courseId === courseId).map((q) => [q.id, q]));
  const norm = (v: unknown) => (Array.isArray(v) ? v.map(String).sort().join("|") : String(v ?? "")).trim().toLowerCase();
  const scored = attempts.map((at) => ({ at, score: Number(at.score ?? 0) })).sort((x, y) => y.score - x.score);
  const k = Math.max(1, Math.round(scored.length * 0.27));
  const upper = new Set(scored.slice(0, k).map((x) => x.at.id));
  const lower = new Set(scored.slice(-k).map((x) => x.at.id));
  const rows: { questionId: string; prompt: string; responses: number; difficulty: number | null; discrimination: number | null; flag: string | null }[] = [];
  for (const [qid, q] of qs) {
    const seen = attempts.filter((at) => ((at.questionIds as string[]) ?? []).includes(qid));
    if (!seen.length) continue;
    const correct = (at: Row) => norm((at.answers as Record<string, unknown>)?.[qid]) === norm(q.answer);
    const p = seen.filter(correct).length / seen.length;
    const u = seen.filter((at) => upper.has(at.id));
    const l = seen.filter((at) => lower.has(at.id));
    const disc = u.length && l.length ? u.filter(correct).length / u.length - l.filter(correct).length / l.length : null;
    rows.push({ questionId: qid, prompt: String(q.prompt).slice(0, 120), responses: seen.length, difficulty: Math.round(p * 100) / 100, discrimination: disc === null ? null : Math.round(disc * 100) / 100, flag: seen.length < 5 ? "too few responses" : disc !== null && disc < 0.2 ? "low discrimination — revise" : p > 0.95 ? "very easy" : p < 0.2 ? "very hard — check the key" : null });
  }
  const aiPolicies = store.list("assignments", (x) => x.courseId === courseId);
  return { attempts: attempts.length, items: rows.sort((x, y) => (x.discrimination ?? 1) - (y.discrimination ?? 1)), aiUsePolicyCoverage: aiPolicies.length ? Math.round((aiPolicies.filter((x) => !!x.aiPolicy).length / aiPolicies.length) * 100) : null, authenticRatio: aiPolicies.length ? Math.round((aiPolicies.filter((x) => /project|lab|capstone|assignment/i.test(`${x.title} ${(x.tags as string[] | undefined)?.join(" ") ?? ""}`)).length / aiPolicies.length) * 100) : null, method: "Difficulty = share correct; discrimination = upper-27% minus lower-27% share correct. Advisory only; items are revised through proposals." };
}

/* ---------------- freshness & accessibility ---------------- */

export function freshnessScan(store: TenantStore, a: Actor) {
  requireStaff(a);
  const tickets: Row[] = [];
  const all = specs(store);
  const now = nowMs();
  for (const r of store.list("eco_resources", (x) => ["tool", "model", "framework", "meeting", "platform"].includes(String(x.category)) || !!x.kind)) {
    const age = r.verifiedAt ? (now - Date.parse(String(r.verifiedAt))) / 86_400_000 : Infinity;
    const stale = age > 90 || r.status === "unavailable" || r.status === "retired";
    if (!stale) continue;
    const name = String(r.name);
    const first = name.split(/[\s(]/)[0].toLowerCase();
    const impact = all.filter((s) => s.tools.some((g) => g.items.some((i) => i.toLowerCase().includes(first)))).map((s) => s.code);
    const key = `${r.id}:${String(r.verifiedAt ?? "never")}`;
    if (store.list("cci_freshness_tickets", (t) => t.key === key).length) continue;
    tickets.push(store.insert("cci_freshness_tickets", { key, subject: name, reason: r.status === "unavailable" || r.status === "retired" ? `Resource is ${r.status}` : age === Infinity ? "Never verified" : `Last verified ${Math.round(age)} days ago`, impact: impact.map((c) => ({ program: c, affects: "labs and tool lists that name this tool; notebooks re-executed after the version update is approved" })), state: "open", openedAt: nowIso() }, "cft"));
  }
  const unpinned = all.flatMap((s) => s.tools.flatMap((g) => g.items.filter((i) => !/\d+\.\d+/.test(i)).map((i) => ({ program: s.code, tool: i })))).length;
  if (tickets.length) audit(store, a, "cci.freshness_scan", "cci_freshness_tickets", `${tickets.length} opened`);
  return { opened: tickets.length, open: store.list("cci_freshness_tickets", (t) => t.state === "open").map((t) => ({ id: t.id, subject: t.subject, reason: t.reason, impact: t.impact })), unpinnedToolMentions: unpinned, rule: "Pinned lab environments are never auto-updated; a version change goes through a proposal and then notebooks are re-executed." };
}

export function accessibilityAudit(store: TenantStore, a: Actor, courseId?: string) {
  requireStaff(a);
  const pages = store.list("pages", (p) => (!courseId || p.courseId === courseId) && p.state === "published");
  const issues: { where: string; issue: string; fix: string }[] = [];
  for (const p of pages) {
    const html = String(p.html ?? "");
    if (!/<h[1-6]\b/i.test(html) && !((p.blocks as { type: string }[] | undefined) ?? []).some((b) => b.type === "heading")) issues.push({ where: `Page: ${p.title}`, issue: "No headings", fix: "Add a heading so screen-reader users can navigate." });
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt="[^"]+"/i.test(m[0])) issues.push({ where: `Page: ${p.title}`, issue: "Image without alt text", fix: "Describe the image or mark it decorative." });
    if (/style="[^"]*color:\s*(#[0-9a-f]{3,6}|red|green)[^"]*"/i.test(html) && !/<(strong|em|b)\b/i.test(html)) issues.push({ where: `Page: ${p.title}`, issue: "Meaning may rely on color alone", fix: "Add text or an icon alongside color." });
  }
  const media = store.list("media", (m) => !courseId || m.courseId === courseId);
  for (const m of media) if (!store.list("caption_tracks", (c) => c.mediaId === m.id).length) issues.push({ where: `Media: ${m.title ?? m.id}`, issue: "No captions or transcript", fix: "Add captions (WebVTT) and a transcript before publishing." });
  const checked = pages.length + media.length;
  return { checked, issues, score: checked ? Math.round(((checked - new Set(issues.map((i) => i.where)).size) / checked) * 100) : null, note: "Automated checks cover structure, alt text, color-only cues and captions. Keyboard and screen-reader testing still need a person." };
}

/* ---------------- proposals & approvals ---------------- */

export const STATES = ["AI Draft", "Designer Review", "SME Review", "Assessment & Accessibility Review", "QA", "Committee Approval", "Published", "Under Revision", "Retired"] as const;
const STAGE_ROLE: Record<string, string[]> = { "AI Draft": ["designer", "admin"], "Designer Review": ["designer", "admin"], "SME Review": ["instructor", "admin"], "Assessment & Accessibility Review": ["designer", "instructor", "admin"], QA: ["admin", "designer"], "Committee Approval": ["admin", "registrar"] };

export function createProposal(store: TenantStore, a: Actor, input: { target: string; title: string; rationale: string; before?: unknown; after?: unknown; signal?: string; expectedImpact?: string }, byAgent = false) {
  requireStaff(a);
  if (!input.title || !input.rationale) throw new CampusError("invalid", "A proposal needs a title and a rationale.", 422);
  const row = store.tx(() => store.insert("cci_proposals", { target: input.target, title: input.title, rationale: input.rationale, signal: input.signal ?? "manual", expectedImpact: input.expectedImpact ?? null, diff: { before: input.before ?? null, after: input.after ?? null }, state: "AI Draft", releaseVersion: null, createdBy: byAgent ? "agent:cci" : a.id, requestedBy: a.id, history: [{ state: "AI Draft", by: byAgent ? "agent:cci" : a.id, at: nowIso(), note: byAgent ? CCI_DRAFT : "Created" }], applyTo: "next cohort" }, "cpr"));
  store.emit("cci.ProposalCreated", `cci_proposals/${row.id}`, { id: row.id, target: input.target });
  audit(store, a, "cci.proposal", `cci_proposals/${row.id}`, input.title);
  return row;
}

/** Move a proposal one stage forward (or back to revision). The creator and the requester can't approve. */
export function advanceProposal(store: TenantStore, a: Actor, id: string, action: "approve" | "return", note: string) {
  const p = store.get("cci_proposals", id);
  if (!p) throw new CampusError("not_found", "Proposal not found", 404);
  const state = String(p.state);
  if (state === "Published" || state === "Retired") throw new CampusError("conflict", `This proposal is ${state.toLowerCase()}.`, 409);
  const roles = STAGE_ROLE[state === "Under Revision" ? "AI Draft" : state] ?? ["admin"];
  if (!hasAny(a, roles as never)) throw new CampusError("forbidden", `The ${state} stage needs: ${roles.join(" or ")}.`, 403);
  if (action === "approve" && (p.createdBy === a.id || p.requestedBy === a.id)) throw new CampusError("separation_of_duties", "Whoever created or requested a proposal can't approve it.", 409);
  const hist = (p.history as { state: string; by: string }[]) ?? [];
  // One person may not approve two consecutive review stages.
  const last = hist[hist.length - 1];
  if (action === "approve" && hist.length > 1 && last?.by === a.id) throw new CampusError("separation_of_duties", "A different reviewer must approve the next stage.", 409);
  const order = STATES as readonly string[];
  const next = action === "return" ? "Under Revision" : state === "Under Revision" ? "Designer Review" : order[order.indexOf(state) + 1];
  const version = next === "Published" ? `v${(store.list("cci_proposals", (x) => x.target === p.target && x.state === "Published").length + 1)}.0` : (p.releaseVersion as string | null);
  const upd = store.tx(() => store.update("cci_proposals", id, { state: next, releaseVersion: version, history: [...hist, { state: next, by: a.id, at: nowIso(), note: String(note ?? "").slice(0, 500) }] }));
  if (next === "Published") store.emit("cci.CourseVersionPublished", `cci_proposals/${id}`, { id, target: p.target, version, applyTo: p.applyTo });
  audit(store, a, `cci.proposal_${action}`, `cci_proposals/${id}`, next);
  return upd;
}

/** Signals → AI-drafted proposals (health alerts, alignment issues, freshness tickets). Idempotent per signal. */
export function proposeFromSignals(store: TenantStore, a: Actor) {
  requireStaff(a);
  const made: Row[] = [];
  const exists = (sig: string) => store.list("cci_proposals", (x) => x.signal === sig).length > 0;
  for (const s of specs(store).filter((x) => isDesignProgram(x.code))) {
    for (const i of designFor(s).issues.filter((x) => x.kind === "bloom_mismatch" || x.kind === "under_assessed")) {
      const sig = `alignment:${s.code}:${i.kind}:${i.target}`;
      if (!exists(sig)) made.push(createProposal(store, a, { target: s.code, title: `${s.code} ${i.target}: ${i.kind.replace(/_/g, " ")}`, rationale: `${i.detail} ${i.fix}`, signal: sig, expectedImpact: "Every competency assessed at its Bloom level.", after: { addRubricCriterion: i.target } }, true));
    }
  }
  for (const t of store.list("cci_freshness_tickets", (x) => x.state === "open")) {
    const sig = `freshness:${t.key}`;
    if (!exists(sig)) made.push(createProposal(store, a, { target: String(t.subject), title: `Update and re-pin: ${t.subject}`, rationale: `${t.reason}. Affected programs: ${((t.impact as { program: string }[]) ?? []).map((x) => x.program).join(", ") || "none listed"}.`, signal: sig, expectedImpact: "Labs run on a current, verified version." }, true));
  }
  return { created: made.length };
}

/* ---------------- curriculum exchange ---------------- */

const LEARNER_KEYS = /^(user_?id|learner|student|email|grade|grades|score|scores|enrollment|enrollments|submission|submissions|attempts?|transcript|credential_?id|issued_credentials|tutor_?memory|analytics|password|ssn|dob|date_of_birth|phone)$/i;
function findLearnerData(v: unknown, path = "$", out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (Array.isArray(v)) v.forEach((x, i) => findLearnerData(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (LEARNER_KEYS.test(k)) out.push(`${path}.${k}`);
      findLearnerData(x, `${path}.${k}`, out);
    }
  else if (typeof v === "string" && /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v) && !/@scholarion\.(test|academy)$/i.test(v)) out.push(`${path} (email address)`);
  return out;
}

export interface PackageManifest {
  source: { name: string; owner: string };
  title: string;
  version: string;
  license: string;
  creditStatus: "non-credit" | "credit-bearing model";
  branding: { keepScholarionBranding?: boolean; rebrandDecisionRef?: string | null };
  programs: { title: string; level?: string; weeks?: number; outcomes: string[]; courses?: { code: string; title: string; hours?: number }[] }[];
  approvals?: { side: string; by: string; at: string }[];
}

/** Import pipeline: quarantine → content scan → schema → licence/ownership → learner-data check → graph mapping → alignment audit → approval. */
export function importPackage(store: TenantStore, a: Actor, raw: string) {
  if (!hasAny(a, ["admin", "designer", "registrar"])) throw new CampusError("forbidden", "Curriculum staff only.", 403);
  const steps: { step: string; ok: boolean; detail: string }[] = [];
  const size = Buffer.byteLength(String(raw ?? ""));
  steps.push({ step: "Quarantine", ok: size > 0 && size <= 2_000_000, detail: `${size} bytes held in quarantine${size > 2_000_000 ? " — too large (2 MB limit for manifests)" : ""}.` });
  const scan = /<script\b|javascript:|\beval\(|\bnew Function\(|data:text\/html|\\u003cscript/i.test(String(raw));
  steps.push({ step: "Content scan", ok: !scan, detail: scan ? "Executable content found; package rejected." : "No executable content. (No antivirus engine is configured; binaries are not accepted in manifests.)" });
  let m: PackageManifest | null = null;
  try {
    m = JSON.parse(String(raw)) as PackageManifest;
  } catch {
    steps.push({ step: "Schema validation", ok: false, detail: "Not valid JSON." });
  }
  if (m) {
    const errs: string[] = [];
    if (!m.source?.name || !m.source?.owner) errs.push("source.name and source.owner are required");
    if (!m.title || !m.version) errs.push("title and version are required");
    if (!["non-credit", "credit-bearing model"].includes(m.creditStatus)) errs.push('creditStatus must be "non-credit" or "credit-bearing model"');
    if (!Array.isArray(m.programs) || !m.programs.length || m.programs.some((p) => !p.title || !Array.isArray(p.outcomes) || !p.outcomes.length)) errs.push("programs[] with title and outcomes[] are required");
    steps.push({ step: "Schema validation", ok: !errs.length, detail: errs.join("; ") || "Manifest matches the curriculum package schema." });
    const licOk = !!m.license && /cc|by|owned|internal|licensed|agreement|mit|apache/i.test(m.license);
    steps.push({ step: "Licence and ownership", ok: licOk, detail: licOk ? `Licence: ${m.license}; owner: ${m.source?.owner}.` : "A licence or ownership statement is required." });
    const leaks = findLearnerData(m);
    steps.push({ step: "No learner data", ok: !leaks.length, detail: leaks.length ? `Learner or personal data fields found (${leaks.slice(0, 6).join(", ")}). Packages carry curriculum only.` : "No learner data, grades, identities, analytics, tutor memory or issued credentials." });
  }
  const ok = steps.every((s) => s.ok);
  const row = store.tx(() => store.insert("cci_packages", { direction: "import", sourceName: m?.source?.name ?? "unknown", owner: m?.source?.owner ?? null, title: m?.title ?? "invalid package", version: m?.version ?? null, license: m?.license ?? null, creditStatus: m?.creditStatus ?? null, manifest: ok ? m : null, steps, state: ok ? "awaiting_approval" : "rejected", checksum: crypto.createHash("sha256").update(String(raw ?? "")).digest("hex"), submittedBy: a.id, approvals: [] }, "cpk"));
  audit(store, a, "cci.exchange_import", `cci_packages/${row.id}`, ok ? "awaiting approval" : "rejected");
  if (ok && m) {
    const audits = m.programs.map((p) => ({ program: p.title, outcomes: p.outcomes.length, bloom: p.outcomes.map((o) => BLOOM[bloomOf(o).level]), issues: p.outcomes.length < 3 ? ["Fewer than three outcomes"] : [] }));
    store.update("cci_packages", row.id, { alignmentAudit: audits });
  }
  return store.get("cci_packages", row.id)!;
}

/** An Exchange Approver from the owning side approves; the submitter can't. */
export function approvePackage(store: TenantStore, a: Actor, id: string, side: string) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Exchange Approvers only.", 403);
  const p = store.get("cci_packages", id);
  if (!p) throw new CampusError("not_found", "Package not found", 404);
  if (p.state !== "awaiting_approval") throw new CampusError("conflict", "This package isn't awaiting approval.", 409);
  if (p.submittedBy === a.id) throw new CampusError("separation_of_duties", "The person who submitted a package can't approve it.", 409);
  const upd = store.tx(() => store.update("cci_packages", id, { state: "approved", approvals: [...((p.approvals as unknown[]) ?? []), { side: String(side || "Scholarion Academy"), by: a.id, at: nowIso() }], approvedAt: nowIso() }));
  store.emit(p.direction === "export" ? "cci.PackageExported" : "cci.PackageImported", `cci_packages/${id}`, { id, title: p.title, version: p.version });
  audit(store, a, "cci.exchange_approve", `cci_packages/${id}`);
  return upd;
}

/** Export an Academy program as a curriculum package (curriculum only). Rebranding is a recorded decision. */
export function exportPackage(store: TenantStore, a: Actor, code: string, input: { partnerLabel: string; keepScholarionBranding: boolean; rebrandDecisionRef?: string }) {
  if (!hasAny(a, ["admin", "designer", "registrar"])) throw new CampusError("forbidden", "Curriculum staff only.", 403);
  const s = specs(store).find((x) => x.code === code);
  if (!s) throw new CampusError("not_found", "Program not found", 404);
  if (!input.keepScholarionBranding && !String(input.rebrandDecisionRef ?? "").trim()) throw new CampusError("decision_required", "Removing Scholarion Academy branding needs a recorded decision reference.", 422);
  const manifest: PackageManifest = { source: { name: "Scholarion Academy", owner: "Scholaris AI Academy" }, title: `${s.code} ${s.title}`, version: "1.0.0", license: "Scholarion Academy curriculum — licensed for the named partner under agreement; not for redistribution", creditStatus: "non-credit", branding: { keepScholarionBranding: input.keepScholarionBranding, rebrandDecisionRef: input.rebrandDecisionRef ?? null }, programs: [{ title: s.title, level: s.level, weeks: s.weeks, outcomes: s.outcomes, courses: s.blocks.map((b) => ({ code: `${s.code}-${b.key}`, title: b.title })) }] };
  if (findLearnerData(manifest).length) throw new CampusError("learner_data", "Export blocked: learner data detected.", 409);
  const row = store.tx(() => store.insert("cci_packages", { direction: "export", sourceName: "Scholarion Academy", owner: "Scholaris AI Academy", partnerLabel: String(input.partnerLabel || "Partner institution").slice(0, 120), title: manifest.title, version: manifest.version, license: manifest.license, creditStatus: "non-credit", manifest, steps: [{ step: "No learner data", ok: true, detail: "Curriculum only." }, { step: "Branding rule", ok: true, detail: input.keepScholarionBranding ? "Scholarion Academy branding kept." : `Rebranding per decision ${input.rebrandDecisionRef}.` }], state: "awaiting_approval", checksum: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), submittedBy: a.id, approvals: [] }, "cpk"));
  audit(store, a, "cci.exchange_export", `cci_packages/${row.id}`, s.code);
  return row;
}

export function exchangeAudit(store: TenantStore, a: Actor) {
  requireStaff(a);
  const pk = store.list("cci_packages");
  return { packages: pk.map((p) => ({ id: p.id, direction: p.direction, title: p.title, version: p.version, source: p.sourceName, partner: p.partnerLabel ?? null, credit: p.creditStatus, state: p.state, approvals: p.approvals, steps: p.steps })), learnerDataTransferred: false, statement: "Every package is checked for learner data before it can be approved; none has crossed the Exchange." };
}

/* ---------------- dashboard & reports ---------------- */

export function dashboard(store: TenantStore, a: Actor) {
  requireStaff(a);
  const design = specs(store).filter((s) => isDesignProgram(s.code));
  const gates = design.map((s) => ({ code: s.code, title: s.title, ...summaryOf(designGate(store, s.code).checks) }));
  return {
    programs: specs(store).length,
    designGates: gates,
    proposalsAwaiting: store.list("cci_proposals", (p) => !["Published", "Retired"].includes(String(p.state))).length,
    freshnessOpen: store.list("cci_freshness_tickets", (t) => t.state === "open").length,
    packagesAwaiting: store.list("cci_packages", (p) => p.state === "awaiting_approval").length,
    drafts: store.list("cci_drafts").length,
    frameworkPacks: store.list("cci_framework_packs").length,
  };
}
const summaryOf = (checks: { status: string }[]) => ({ pass: checks.filter((c) => c.status === "pass").length, open: checks.filter((c) => c.status !== "pass").length, fail: checks.filter((c) => c.status === "fail").length });

/** Program review report (a document — downloadable as PDF, Word or Excel). */
export function programReviewHtml(store: TenantStore, a: Actor, code: string) {
  requireStaff(a);
  const s = specs(store).find((x) => x.code === code);
  if (!s) throw new CampusError("not_found", "Program not found", 404);
  const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const al = alignment(store, a, code);
  const gate = isDesignProgram(code) ? designGate(store, code).checks : [];
  const ov = overlapMatrix(store, a, 30).filter((p) => p.a.startsWith(`${code} `) || p.b.startsWith(`${code} `)).slice(0, 5);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Program review — ${esc(s.code)} ${esc(s.title)}</title></head><body><main><h1>Program review — ${esc(s.code)} ${esc(s.title)}</h1><p>${esc(CCI_DRAFT)} Generated ${esc(nowIso().slice(0, 10))}.</p>
<h2>Competencies</h2><table><thead><tr><th>ID</th><th>Competency</th><th>Bloom</th></tr></thead><tbody>${al.outcomes.map((o) => `<tr><td>${esc(o.id)}</td><td>${esc(o.text)}</td><td>${esc(o.bloom)}</td></tr>`).join("")}</tbody></table>
<h2>Alignment issues</h2>${al.issues.length ? `<ul>${al.issues.map((i) => `<li>${esc(i.kind)} ${esc(i.target)}: ${esc(i.detail)}</li>`).join("")}</ul>` : "<p>None.</p>"}
${gate.length ? `<h2>Quality gate</h2><table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>${gate.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.status)}</td><td>${esc(c.detail)}</td></tr>`).join("")}</tbody></table>` : ""}
<h2>Overlap with other programs</h2>${ov.length ? `<table><thead><tr><th>Programs</th><th>Overlap %</th><th>Recommendation</th></tr></thead><tbody>${ov.map((p) => `<tr><td>${esc(p.a)} / ${esc(p.b)}</td><td>${p.pct}</td><td>${esc(p.recommendation)}</td></tr>`).join("")}</tbody></table>` : "<p>No program overlaps by 30% or more.</p>"}
<h2>Credit status</h2><p>${esc(s.creditStatement)}</p></main></body></html>`;
}
