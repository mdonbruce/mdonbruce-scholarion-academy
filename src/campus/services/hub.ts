import { broker, CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { LEARNING_PATHS, LIBRARY, PROPOSED } from "../academy/programs-data-2";
import type { ProgramSpec } from "../academy/programs-data";
import { offeringCard, PRODUCT_LABEL } from "./academy";
import { approvedPolicy } from "./programs";
import { audit, requireTenant } from "./common";

/**
 * "Agentic AI Courses & Certifications" catalog hub and the catalog consolidation report.
 * Everything here is computed from catalog rows: only published programs appear, paths hide
 * steps that aren't in the catalog, and the "Most popular" rail shows only when real
 * enrollment data exists.
 */

const INTRO = [
  "Learn to build AI that does more than answer — AI that plans, uses tools and gets work done.",
  "Scholaris AI Academy courses take you from the core ideas of machine learning, neural networks and natural language processing, through training data and model evaluation, to designing agents and multi-agent systems that operate safely in real organizations. You'll practice with widely used frameworks such as TensorFlow and PyTorch, plus modern retrieval and agent tooling, and earn credentials that stack from a two-hour guided project to a full professional certificate or live cohort program.",
];

const TABS = [
  { key: "guided_project", label: "Guided Projects" },
  { key: "short_course", label: "Short Courses" },
  { key: "specialization", label: "Specializations" },
  { key: "professional_certificate", label: "Professional Certificates" },
  { key: "live", label: "Live & Cohort Programs" },
];
const LIVE_TYPES = ["live_intensive", "cohort_program", "bundle", "pathway"];
const SKILLS = ["ML", "deep learning", "NLP", "TensorFlow", "PyTorch", "RAG", "agents", "multi-agent", "MCP", "evaluation", "governance"];

function specOf(store: TenantStore, o: Row): ProgramSpec | undefined {
  return store.list("program_pages", (p) => p.offeringId === o.id && p.state === "published")[0]?.spec as ProgramSpec | undefined;
}

function skillTags(o: Row, spec: ProgramSpec | undefined) {
  const text = `${o.title} ${o.summary} ${((o.skills as string[]) ?? []).join(" ")} ${((o.libraryKeys as string[]) ?? []).join(" ")} ${spec?.tools.flatMap((t) => t.items).join(" ") ?? ""}`.toLowerCase();
  const map: Record<string, RegExp> = { ML: /\b(ml|machine learning|mlfound|scikit)/, "deep learning": /\b(deep learning|\bdl\b|neural)/, NLP: /\b(nlp|language model|transformer)/, TensorFlow: /tensorflow/, PyTorch: /pytorch/, RAG: /\b(rag|retrieval|vectors)/, agents: /\bagent/, "multi-agent": /(multi-?agent|multiagent|crew)/, MCP: /\bmcp\b/, evaluation: /\b(evaluat|evals)/, governance: /\b(governance|responsible|policy)/ };
  return SKILLS.filter((s) => map[s].test(text));
}

function durationBucket(o: Row, spec: ProgramSpec | undefined) {
  const weeks = spec?.weeks ?? 0;
  const hours = Number(o.hours ?? 0);
  if (o.productType === "guided_project" || hours <= 4) return "under-1-week";
  if (weeks && weeks <= 6) return "1-6-weeks";
  if (weeks && weeks <= 12) return "7-12-weeks";
  return "13-plus-weeks";
}

function hubCard(store: TenantStore, o: Row) {
  const spec = specOf(store, o);
  const c = offeringCard(store, o);
  const slug = store.list("program_pages", (p) => p.offeringId === o.id)[0]?.slug as string | undefined;
  const transfers = store.list("pathway_edges", (e) => e.fromId === o.id && e.kind === "waives").map((e) => String(store.get("offerings", String(e.toId))?.code ?? "")).filter(Boolean);
  const courseCount = spec?.selfPaced ? spec.selfPaced.courses.length : spec?.blocks.length ?? 1;
  return {
    ...c,
    slug: slug ?? null,
    href: slug ? `/campus/${broker.tenant(store.tenantId)!.slug}/programs/${slug}` : null,
    tab: LIVE_TYPES.includes(String(o.productType)) ? "live" : String(o.productType),
    track: spec?.catalogTrack ?? (spec?.codingRequired === false ? "Business & Leadership" : "Builder"),
    codingRequired: spec?.codingRequired ?? !/no coding/i.test(spec?.codingRequirement ?? ""),
    formatKind: spec?.formatKind ?? (o.selfPaced ? "self_paced" : "cohort"),
    duration: durationBucket(o, spec),
    durationText: spec?.selfPaced ? `${c.hours ?? "—"} hours · ${spec.selfPaced.suggestedPace}` : spec ? `${spec.weeks} weeks${spec.hoursPerWeek ? ` · ${spec.hoursPerWeek[0]}–${spec.hoursPerWeek[1]} h/week` : ""}` : `${c.hours ?? "—"} hours`,
    credential: spec?.credential.certificate.replace(/^Scholaris AI Academy /, "") ?? PRODUCT_LABEL[String(o.productType)],
    accessModels: [...(o.auditAvailable ? ["audit"] : []), "paid", ...(o.inPlus ? ["subscription"] : [])],
    skillTags: skillTags(o, spec),
    courseCount,
    transfers: [...new Set(transfers)],
    prerequisites: spec?.prerequisites ?? "",
    capstone: spec?.projects.find((p) => p.kind === "capstone")?.name ?? spec?.projects[0]?.name ?? "",
    hoursPerWeek: spec?.hoursPerWeek ? `${spec.hoursPerWeek[0]}–${spec.hoursPerWeek[1]}` : "—",
    isNew: o.createdAt && Date.parse(String(o.createdAt)) > Date.now() - 90 * 86400_000,
  };
}

export interface HubFilters {
  tab?: string;
  track?: string;
  level?: string;
  coding?: "yes" | "no";
  duration?: string;
  format?: string;
  credential?: string;
  skill?: string;
  access?: string;
  q?: string;
  compare?: string[];
}

/** The hub: tabs, filters, cards, rails, learning paths, comparison, credential explainer, FAQs, structured data. */
export function agenticHub(store: TenantStore, f: HubFilters = {}) {
  const tenant = broker.tenant(store.tenantId)!;
  const all = store.list("offerings", (o) => o.state === "published" && !/^#\d+\.\d+$/.test(String(o.code)) && !!specOf(store, o)).map((o) => hubCard(store, o)).sort((a, b) => Number(a.code.replace(/\D/g, "")) - Number(b.code.replace(/\D/g, "")));
  const items = all
    .filter((c) => !f.tab || c.tab === f.tab)
    .filter((c) => !f.track || c.track === f.track)
    .filter((c) => !f.level || c.level === f.level)
    .filter((c) => !f.coding || (f.coding === "yes") === c.codingRequired)
    .filter((c) => !f.duration || c.duration === f.duration)
    .filter((c) => !f.format || c.formatKind === f.format)
    .filter((c) => !f.credential || c.type === f.credential)
    .filter((c) => !f.skill || c.skillTags.includes(f.skill))
    .filter((c) => !f.access || c.accessModels.includes(f.access))
    .filter((c) => !f.q || `${c.code} ${c.title} ${c.summary} ${c.skillTags.join(" ")}`.toLowerCase().includes(f.q.toLowerCase()));
  const byCode = new Map(all.map((c) => [c.code, c]));
  const enrollCounts = new Map(store.list("offering_enrollments", (e) => e.source !== "audit").reduce((m, e) => m.set(String(e.offeringId), (m.get(String(e.offeringId)) ?? 0) + 1), new Map<string, number>()));
  const popular = all.filter((c) => (enrollCounts.get(c.id) ?? 0) >= 5).sort((a, b) => (enrollCounts.get(b.id) ?? 0) - (enrollCounts.get(a.id) ?? 0)).slice(0, 4);
  const rails = [
    { key: "start-here", title: "Start here", items: ["#32", "#37", "#34"].map((c) => byCode.get(c)).filter(Boolean) },
    // Only real Scholaris enrollment data; hidden otherwise.
    ...(popular.length ? [{ key: "popular", title: "Most popular", items: popular }] : []),
    { key: "new", title: "New", items: all.filter((c) => c.isNew).slice(0, 6) },
    { key: "python-agents", title: "Build agents in Python", items: ["#32", "#30", "#31", "#33", "#35", "#36"].map((c) => byCode.get(c)).filter(Boolean) },
    { key: "leaders", title: "For leaders", items: ["#34", "#20", "#13", "#25"].map((c) => byCode.get(c)).filter(Boolean) },
  ].filter((r) => r.items.length);
  const paths = LEARNING_PATHS.map((p) => {
    const steps = p.steps.map((code) => ({ code, title: byCode.get(code)?.title ?? null, href: byCode.get(code)?.href ?? null }));
    const shown = steps.filter((s) => s.title);
    return { key: p.key, title: p.title, note: p.note ?? null, steps: shown, hiddenSteps: steps.filter((s) => !s.title).map((s) => s.code) };
  }).filter((p) => p.steps.length >= 1);
  const diagram = ["flowchart LR", ...paths.flatMap((p) => p.steps.slice(1).map((s, i) => `  ${p.steps[i].code.replace(/\W/g, "P")}["${p.steps[i].code}"] --> ${s.code.replace(/\W/g, "P")}["${s.code}"]`))].filter((v, i, a) => a.indexOf(v) === i).join("\n");
  const comparison = (f.compare ?? []).slice(0, 4).map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c!.id, title: `${c!.code} ${c!.title}`, rows: { Duration: c!.durationText, "Hours/week": c!.hoursPerWeek, Format: c!.formatKind.replace(/_/g, " "), Prerequisites: c!.prerequisites, Capstone: c!.capstone || "—", Credential: c!.credential, Fee: `${c!.currency} ${c!.price} (sandbox)` } }));
  const refund = approvedPolicy(store, "refund");
  const faqs = [
    { q: "What's the difference between agentic and generative AI?", a: "Generative AI produces content — text, images, code — when asked. Agentic AI uses those models inside a loop that plans, calls tools, checks results and acts toward a goal, usually with people approving important steps." },
    { q: "Do I need to code?", a: "Not for every program. Use the coding filter: leadership and product programs need no code, guided projects need a little Python, and builder programs use Python throughout." },
    { q: "TensorFlow or PyTorch?", a: "Both are widely used. Deep learning labs at Scholaris ship in both versions, so you can pick one and switch later without losing progress." },
    { q: "How long does it take to become job-ready?", a: "It depends on your starting point and the role. We describe the skills each program builds and offer career services — portfolio reviews, mock interviews, role mapping — but we don't promise jobs or timelines." },
    { q: "How do programs stack?", a: "Guided projects and short courses stack into specializations and professional certificates, and completed self-paced credentials waive matching modules in live programs where a transfer rule is listed." },
    ...(refund ? [{ q: "What is the refund and deferral policy?", a: `${refund.text} Requests are decided within ${refund.processingDays} business days; escalate to ${refund.escalationContact}.` }] : []),
  ];
  const testimonials = store.list("program_testimonials", (t) => t.state === "published" && !!t.consentRef).map((t) => ({ name: String(t.learnerName), quote: String(t.quote) }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Agentic AI Courses & Certifications",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Course", name: `${c.code} ${c.title}`, description: c.summary, provider: { "@type": "Organization", name: tenant.name }, ...(c.href ? { url: c.href } : {}), offers: { "@type": "Offer", price: c.price, priceCurrency: c.currency, category: "Sandbox pricing (staging)" } } })),
  };
  return {
    title: "Agentic AI Courses & Certifications",
    intro: INTRO,
    tabs: TABS.map((t) => ({ ...t, count: all.filter((c) => c.tab === t.key).length })),
    facets: {
      track: ["Builder", "No-Code", "Business & Leadership", "Industry", "Data", "Product"].filter((t) => all.some((c) => c.track === t)),
      level: ["beginner", "intermediate", "advanced"],
      duration: [{ value: "under-1-week", label: "A few hours" }, { value: "1-6-weeks", label: "1–6 weeks" }, { value: "7-12-weeks", label: "7–12 weeks" }, { value: "13-plus-weeks", label: "13+ weeks" }],
      format: [{ value: "live_weekend", label: "Live weekend" }, { value: "live_weekday", label: "Live weekday" }, { value: "self_paced", label: "Self-paced" }, { value: "cohort", label: "Cohort" }],
      credential: Object.entries(PRODUCT_LABEL).filter(([k]) => all.some((c) => c.type === k)).map(([value, label]) => ({ value, label })),
      skill: SKILLS,
      access: [{ value: "audit", label: "Free audit" }, { value: "paid", label: "Paid" }, { value: "subscription", label: "Subscription" }],
    },
    items,
    total: all.length,
    rails,
    paths,
    diagram,
    comparison,
    learnAcross: ["Machine learning", "Neural networks", "Natural language processing", "Training data and model evaluation", "Generative AI and LLMs", "Prompting", "Retrieval-augmented generation", "Agents", "Multi-agent systems", "Model Context Protocol", "Guardrails", "Observability", "Deployment", "Responsible AI"],
    credentialTypes: [
      { type: "Completion badge", from: "Guided projects", text: "Earned when the autograded build passes." },
      { type: "Course Certificate", from: "Short courses", text: "Every graded quiz at 80% and the final project complete." },
      { type: "Specialization Certificate + badge", from: "Specializations", text: "All courses plus the capstone; each course also issues its own certificate." },
      { type: "Professional Certificate (Scholaris) + badge", from: "Professional certificates", text: "All courses plus a portfolio capstone." },
      { type: "Certificate of Completion", from: "Live and cohort programs", text: "Program requirements met; some programs add a Graded Performance Certificate showing your final grade." },
      { type: "Open Badges 3.0", from: "Every credential", text: "Digital, verifiable by ID on the Scholaris verification page, and shareable." },
    ],
    stacking: "Credentials stack: courses → specializations or professional certificates → live programs, with transfer rules shown on each card.",
    careerServices: ["Résumé and portfolio review", "Mock interviews", "Role mapping"],
    careerNote: "Career services are services we offer — not job or salary outcomes.",
    faqs,
    resources: [] as { title: string; href: string }[],
    testimonials,
    showSocialProof: testimonials.length > 0,
    structuredData,
  };
}

/* ---------------- "Which program is right for me?" ---------------- */

export const HUB_QUIZ = [
  { id: "role", text: "Which best describes your role?", options: [{ value: "developer", label: "Software developer or engineer" }, { value: "data", label: "Data analyst or scientist" }, { value: "product", label: "Product manager or designer" }, { value: "leader", label: "Executive or manager" }, { value: "career", label: "Changing careers" }] },
  { id: "coding", text: "How comfortable are you with Python?", options: [{ value: "none", label: "I don't code" }, { value: "basic", label: "Basics" }, { value: "working", label: "I use it at work" }, { value: "strong", label: "Strong — APIs, async, packaging" }] },
  { id: "goal", text: "What do you want to be able to do?", options: [{ value: "build-agents", label: "Build and ship agents" }, { value: "ml-foundations", label: "Learn ML and deep learning foundations" }, { value: "prompting", label: "Use LLMs well at work" }, { value: "lead", label: "Lead AI adoption" }, { value: "product", label: "Manage AI products" }, { value: "data", label: "Build data platforms for AI" }] },
  { id: "time", text: "How much time can you give each week?", options: [{ value: "2", label: "About 2 hours" }, { value: "5", label: "3–6 hours" }, { value: "9", label: "7–10 hours" }, { value: "12", label: "More than 10 hours" }] },
  { id: "format", text: "How do you prefer to learn?", options: [{ value: "self_paced", label: "Self-paced" }, { value: "live_weekend", label: "Live on weekends" }, { value: "cohort", label: "Weekly live cohort" }, { value: "any", label: "No preference" }] },
  { id: "length", text: "How long a commitment fits right now?", options: [{ value: "short", label: "Hours to a few weeks" }, { value: "medium", label: "1–3 months" }, { value: "long", label: "4 months or more" }] },
  { id: "credential", text: "What kind of credential matters to you?", options: [{ value: "quick", label: "A quick badge" }, { value: "certificate", label: "A certificate" }, { value: "program", label: "A full program credential" }, { value: "none", label: "Skills matter more than credentials" }] },
  { id: "framework", text: "Any deep learning framework preference?", options: [{ value: "pytorch", label: "PyTorch" }, { value: "tensorflow", label: "TensorFlow/Keras" }, { value: "either", label: "Either / not sure" }] },
  { id: "budget", text: "Budget for this step?", options: [{ value: "low", label: "Under 100" }, { value: "mid", label: "100–1,000" }, { value: "high", label: "Over 1,000" }, { value: "employer", label: "My employer pays" }] },
];

export function hubRecommend(store: TenantStore, answers: Record<string, string>) {
  const cards = agenticHub(store).items;
  const goalSkills: Record<string, string[]> = { "build-agents": ["agents", "multi-agent", "MCP", "RAG"], "ml-foundations": ["ML", "deep learning", "PyTorch", "TensorFlow", "NLP"], prompting: ["evaluation", "RAG"], lead: ["governance"], product: ["evaluation", "governance"], data: ["RAG", "ML"] };
  const hours = Number(answers.time ?? 5);
  const scored = cards.map((c) => {
    let score = 0;
    const why: string[] = [];
    const skills = goalSkills[answers.goal] ?? [];
    const hit = c.skillTags.filter((s) => skills.includes(s));
    if (hit.length) {
      score += 2 + hit.length;
      why.push(`Covers ${hit.slice(0, 3).join(", ")} for your goal`);
    }
    if (answers.coding === "none" && !c.codingRequired) {
      score += 3;
      why.push("No coding required");
    }
    if (answers.coding === "none" && c.codingRequired) score -= 6;
    if (answers.coding === "basic" && c.level === "advanced") score -= 3;
    if ((answers.coding === "strong" || answers.coding === "working") && c.level !== "beginner" && c.codingRequired) {
      score += 2;
      why.push(`Pitched at ${c.level} builders`);
    }
    if (answers.format && answers.format !== "any" && c.formatKind === answers.format) {
      score += 2;
      why.push(`Matches your ${answers.format.replace(/_/g, " ")} preference`);
    }
    const len = answers.length;
    if ((len === "short" && ["under-1-week", "1-6-weeks"].includes(c.duration)) || (len === "medium" && ["1-6-weeks", "7-12-weeks"].includes(c.duration)) || (len === "long" && c.duration === "13-plus-weeks")) {
      score += 2;
      why.push("Fits the length you have in mind");
    }
    if (answers.credential === "quick" && ["guided_project", "short_course"].includes(c.type)) score += 2;
    if (answers.credential === "program" && ["live_intensive", "cohort_program", "pathway", "professional_certificate"].includes(c.type)) score += 2;
    if (answers.budget === "low" && c.price > 100) score -= 2;
    if (answers.budget === "low" && c.accessModels.includes("audit")) {
      score += 1;
      why.push("Free audit available");
    }
    if (answers.role === "leader" && c.track === "Business & Leadership") {
      score += 3;
      why.push("Designed for leaders");
    }
    if (answers.role === "product" && (c.track === "Product" || c.code === "#12")) {
      score += 3;
      why.push("Built for product roles");
    }
    if (answers.role === "data" && c.track === "Data") {
      score += 3;
      why.push("Built for data roles");
    }
    if (hours <= 2 && c.type === "guided_project") {
      score += 2;
      why.push("Fits about two hours");
    }
    if (hours <= 5 && c.hoursPerWeek !== "—" && Number(c.hoursPerWeek.split("–")[0]) > 8) score -= 2;
    return { offering: { id: c.id, code: c.code, title: c.title, href: c.href }, score, why };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return { top: ranked[0] ?? null, alternatives: ranked.slice(1), note: "Recommendations come from your answers and the published catalog. An advisor can help with anything the quiz can't capture." };
}

/* ---------------- Catalog consolidation report (#1–#38, proposed #27) ---------------- */

export function consolidationReport(store: TenantStore, a: Actor) {
  requireTenant(store, a, ["admin", "designer", "registrar"], "catalog.consolidation");
  const offs = store.list("offerings", (o) => !/^#\d+\.\d+$/.test(String(o.code)));
  const codeOf = (id: string) => String(store.get("offerings", id)?.code ?? id);
  const libOf = (o: Row) => new Set(((o.libraryKeys as string[] | undefined) ?? []).filter((k) => k !== "responsible"));
  const includes = (o: Row) => new Set(((o.pathwayIncludes as string[] | undefined) ?? []).map(codeOf));
  const programs = offs.map((o) => {
    const spec = specOf(store, o);
    return {
      code: String(o.code),
      title: String(o.title),
      type: PRODUCT_LABEL[String(o.productType)] ?? String(o.productType),
      status: o.state === "published" ? "in catalog" : String(o.state),
      libraryModules: [...libOf(o)].map((k) => LIBRARY.find((l) => l.key === k)?.title ?? k),
      transfersOut: store.list("pathway_edges", (e) => e.fromId === o.id && e.kind === "waives").map((e) => `${codeOf(String(e.toId))} ${e.moduleKey}`),
      mutuallyExclusive: store.list("pathway_edges", (e) => e.kind === "mutually_exclusive" && (e.fromId === o.id || e.toId === o.id)).map((e) => codeOf(String(e.fromId === o.id ? e.toId : e.fromId))),
      stacksInto: store.list("pathway_edges", (e) => e.fromId === o.id && e.kind === "stacks_into").map((e) => codeOf(String(e.toId))),
      prerequisiteFor: store.list("pathway_edges", (e) => e.fromId === o.id && e.kind === "prerequisite").map((e) => codeOf(String(e.toId))),
      notes: spec?.pathway?.note ?? null,
    };
  }).sort((x, y) => Number(x.code.replace(/\D/g, "")) - Number(y.code.replace(/\D/g, "")) || x.code.localeCompare(y.code));
  const known = new Set(programs.map((p) => p.code));
  const referenced = [...new Set([...LIBRARY.flatMap((l) => l.usedBy), ...LEARNING_PATHS.flatMap((p) => p.steps)].filter((c) => /^#\d+$/.test(c)))].filter((c) => !known.has(c) && !PROPOSED.some((p) => p.code === c)).sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
  const overlaps: { a: string; b: string; overlapPct: number; shared: string[]; relation: string; recommendation: string }[] = [];
  for (let i = 0; i < offs.length; i++)
    for (let j = i + 1; j < offs.length; j++) {
      const A = libOf(offs[i]);
      const B = libOf(offs[j]);
      if (A.size < 2 || B.size < 2) continue;
      const shared = [...A].filter((k) => B.has(k));
      const pct = Math.round((shared.length / Math.min(A.size, B.size)) * 100);
      if (pct < 40) continue;
      const ca = String(offs[i].code);
      const cb = String(offs[j].code);
      const byDesign = includes(offs[i]).has(cb) || includes(offs[j]).has(ca) ? "assembled pathway (by design)" : store.list("pathway_edges", (e) => (e.fromId === offs[i].id && e.toId === offs[j].id) || (e.fromId === offs[j].id && e.toId === offs[i].id)).map((e) => String(e.kind)).join(", ") || "none";
      const recommendation = pct > 60
        ? byDesign === "assembled pathway (by design)" ? "Keep — pathway reuses the program by design"
          : /mutually_exclusive/.test(byDesign) ? "Keep both formats — credit already mutually exclusive"
          : /waives|stacks_into/.test(byDesign) ? "Keep — transfer/stacking rule already recorded"
          : offs[i].selfPaced !== offs[j].selfPaced ? "Keep both formats — add a waives rule from the self-paced offering to the live program"
          : "Merge or retire candidate — overlap above 60%"
        : "Distinct enough; consider a waives rule for the shared modules";
      overlaps.push({ a: `${ca} ${offs[i].title}`, b: `${cb} ${offs[j].title}`, overlapPct: pct, shared: shared.map((k) => LIBRARY.find((l) => l.key === k)?.title ?? k), relation: byDesign, recommendation });
    }
  overlaps.sort((x, y) => y.overlapPct - x.overlapPct);
  const report = {
    generatedAt: nowIso(),
    scope: "Programs #1–#38 in the catalog, proposed #27, and numbers referenced by the library or learning paths",
    programs,
    referencedNotInCatalog: referenced,
    proposed: PROPOSED.map((p) => ({ ...p, status: "proposed — not built until approved" })),
    library: LIBRARY.map((l) => ({ key: l.key, title: l.title, version: l.version, usedBy: l.usedBy, dualFramework: !!l.dualFramework })),
    overlaps,
    mergeOrRetire: overlaps.filter((o) => /Merge or retire/.test(o.recommendation)),
    legacyChanges: [
      "Earlier demo offering “Applied Machine Learning with Python” (#32) is now #37 Course 2 (#37.2); #32 is Agentic Design Patterns.",
      "Earlier demo offering “Deep Learning Live Intensive” (#15) is folded into #18 Weeks 5–6; #15 is the Agentic AI Engineering Weekend Intensive.",
      "Earlier demo offerings “AI Agents Specialization” (#20) and “Machine Learning Professional Certificate” (#38) are retired; #20 and #38 now carry the new programs.",
      "The Python course formerly listed as #1 is #1-R (Week 0 refresher of #1).",
    ],
    decisionsPending: ["Relationship of #13 to #9 (recorded as a recommendation)", "Build #27 MLOps & LLMOps?", "Self-paced access model: free audit, paid per product, and/or Scholaris Plus (all three run in the sandbox until decided)", "Refund, deferral and batch-change policy text"],
  };
  return report;
}

export function submitConsolidation(store: TenantStore, a: Actor) {
  const report = consolidationReport(store, a);
  return store.tx(() => {
    const row = store.insert("consolidation_reports", { report, state: "submitted", submittedBy: a.id, decidedBy: null, decidedAt: null, decisionNote: null }, "ccr");
    audit(store, a, "catalog.consolidation.submit", `consolidation_reports/${row.id}`);
    return { id: row.id, state: "submitted", programs: report.programs.length, mergeOrRetire: report.mergeOrRetire.length };
  });
}

export function decideConsolidation(store: TenantStore, a: Actor, id: string, decision: "approved" | "changes_requested", note?: string) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only the product owner (an admin) decides on the consolidation report.", 403);
  const row = store.get("consolidation_reports", id);
  if (!row) throw new CampusError("not_found", "Report not found", 404);
  if (row.state !== "submitted") throw new CampusError("conflict", "This report already has a decision.", 409);
  return store.tx(() => {
    const out = store.update("consolidation_reports", id, { state: decision, decidedBy: a.id, decidedAt: nowIso(), decisionNote: note ?? null });
    audit(store, a, "catalog.consolidation.decide", `consolidation_reports/${id}`, decision);
    return out;
  });
}
