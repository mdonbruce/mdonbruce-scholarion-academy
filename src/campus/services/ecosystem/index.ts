import { broker, nowIso, type TenantStore } from "../../core";
import { createUser } from "../../iam";
import { ECO_CATALOG } from "../../academy/eco-catalog";
import { upsertSeedRecord, type SeedRecord } from "./catalog";
import { ensureSchedules } from "./discovery";
import { T, daysFromNow, hostOf } from "./shared";

/** Scholarion ecosystem: Free Education Resource Hub, Career Connect, Employer Portal and Auto-Discovery. */
export * from "./shared";
export * from "./schema";
export * from "./cron";
export * from "./catalog";
export * from "./discovery";
export * from "./career";
export * from "./scheduler";

const AI801_MAP: Record<string, { topic: string; note: string }> = {
  ollama: { topic: "Bounded Tool Execution", note: "Run open models locally for agent experiments (free software; your own hardware)." },
  langgraph: { topic: "Reasoning & Planning Engines", note: "Graph-based orchestration for multi-step agents." },
  "hf-agents-course": { topic: "Reasoning & Planning Engines", note: "Free companion course on agents; its certificate is issued by the provider, not Scholarion." },
  "openai-whisper": { topic: "The Perception Layer", note: "Speech-to-text as a perception input (open source)." },
  "hugging-face-hub": { topic: "Memory Architectures", note: "Open embedding models for vector memory; inference credits are limited and separate." },
  "google-colab-free": { topic: "Memory Architectures", note: "Free notebooks for experiments; resources aren't guaranteed." },
  "jitsi-meet": { topic: "The Perception Layer", note: "Open-source live sessions with no account for guests." },
};

/** Seed the researched catalog, schedules, trusted verification sources, demo employers and mappings. Idempotent. */
export function ensureEcosystem(store: TenantStore) {
  if (store.list(T.resources, () => true).length) return;
  const t = broker.tenant(store.tenantId)!;
  store.tx(() => {
    for (const rec of ECO_CATALOG) upsertSeedRecord(store, rec as unknown as SeedRecord);
    // Official evidence hosts are the only hosts discovery may fetch (no arbitrary-URL proxy).
    const hosts = new Set<string>();
    for (const rec of ECO_CATALOG) {
      for (const e of rec.evidence) hosts.add(hostOf(e.url));
      hosts.add(hostOf(rec.official_url));
    }
    for (const h of hosts) if (h) store.insert(T.sources, { key: `page-${h}`, name: `${h} official pages`, kind: "official_page", url: `https://${h}/`, host: h, trusted: true, enabled: true, rateLimitPerMin: 10, subjects: [], defaults: {} }, "esrc");
    ensureSchedules(store);
    // Course mappings for the AI-801 sample course.
    const ai801 = `crs_${t.slug}_ai801`;
    if (store.get("courses", ai801)) {
      for (const [key, m] of Object.entries(AI801_MAP)) {
        const r = store.list(T.resources, (x) => x.key === key)[0];
        if (r) store.insert(T.mappings, { courseId: ai801, resourceId: r.id, topic: m.topic, note: m.note, mappedBy: "seed", idempotencyKey: null, flagged: false }, "emap");
      }
    }
    // Demo employers (fictional, staging only). One verified, one awaiting verification.
    const mk = (key: string, name: string) => store.get("users", `usr_${t.slug}_${key}`)?.id ?? createUser(store, { id: `usr_${t.slug}_${key}`, name, email: `${key}@${t.slug}.scholarion.test`, password: "Scholarion-demo-1", roles: [] }).id;
    const rec1 = mk("employer1", "Riley Recruiter (Demo Corp, fictional)");
    const rec2 = mk("employer2", "Morgan Hiring (Northwind Labs, fictional)");
    const demo = store.insert(T.employers, { name: "Demo Corp (fictional)", website: "https://democorp.example", relationship: "verified", verification: "verified", industries: ["software"], locations: ["Remote", "Lagos"], about: "A fictional employer used to demonstrate the Employer Portal in staging.", registeredBy: rec1, verifiedBy: "seed", verifiedAt: nowIso(), partnerNote: null }, "eemp");
    store.insert(T.members, { employerId: demo.id, userId: rec1, role: "owner" }, "emem");
    const nw = store.insert(T.employers, { name: "Northwind Labs (fictional)", website: "https://northwind.example", relationship: "registered", verification: "pending", industries: ["analytics"], locations: ["Remote"], about: "A fictional employer awaiting verification.", registeredBy: rec2, verifiedBy: null, verifiedAt: null, partnerNote: null }, "eemp");
    store.insert(T.members, { employerId: nw.id, userId: rec2, role: "owner" }, "emem");
    const opp = (title: string, type: string, skills: string[], extra: Record<string, unknown> = {}) => store.insert(T.opportunities, { employerId: demo.id, employerName: demo.name, externalId: null, sourceId: null, source: "employer_posted", title, type, description: `${title} at a fictional demo employer (staging data).`, skills, qualifications: [], certificates: [], location: "Remote", remote: "remote", workEligibility: "Fictional — staging demonstration", compensation: null, applicationUrl: null, postedAt: nowIso(), closesAt: daysFromNow(45), status: "open", lastVerifiedAt: nowIso(), legitimacy: ["Posted by a verified employer (fictional demo)"], ...extra }, "eopp");
    opp("Agentic AI Intern (demo)", "internship", ["agents", "guardrails", "evaluation", "python"]);
    opp("Junior ML Engineer (demo)", "entry_level", ["python", "machine learning", "evaluation"]);
    opp("Data Apprentice (demo)", "apprenticeship", ["sql", "data analysis"], { closesAt: daysFromNow(-1) });
    // Learner career profiles: student1 opted in (skills + headline visible), student2 private.
    store.insert(T.profiles, { userId: `usr_${t.slug}_student1`, headline: "Building safe, bounded AI agents", statedSkills: ["python"], interests: ["intern"], preferredLocations: ["remote"], remoteOk: true, portfolioUrl: null, contactEmail: `student1@${t.slug}.scholarion.test`, discoverable: true, visible: { headline: true, skills: true, certificates: true, portfolio: false, contact: true } }, "ecp");
    store.insert(T.profiles, { userId: `usr_${t.slug}_student2`, headline: "Private profile", statedSkills: ["sql"], interests: [], preferredLocations: [], remoteOk: true, portfolioUrl: null, contactEmail: null, discoverable: false, visible: { headline: false, skills: false, certificates: false, portfolio: false, contact: false } }, "ecp");
  });
}
