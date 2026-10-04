import { CampusError, nowIso, sha256, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { audit } from "./common";

/**
 * Voice & Digital Human Studio (tab 65) — the governed part of the Haven Voice & Digital Human
 * platform that can run honestly here, ported and extended from the Python governed service
 * (governed/site/voice_studio.py).
 *
 * What is real: Amara & Tunde as original fictional personas with text-only, AI-disclosed persona
 * replies and an explicit language switch; immutable storyboard projects with pairing rules;
 * the Consent & Identity Center with separation of duties, expiry and revocation impact; the
 * model registry with licence enforcement (non-commercial weights can never route to a paid
 * plan); moderation of every generation request; the pronunciation dictionary; provenance
 * records on exports; and a capability status report where every capability is exactly one of
 * LIVE / CONNECTED / DISABLED / SIMULATED / PLANNED.
 *
 * What is not: no audio, video, cloning, training or lip-sync is produced — there are no served
 * models. Generation requests are recorded, moderated and costed, then stop at
 * "not operational: no served model". Nothing is ever shown as "Completed" without a backend result.
 */

export const V = {
  models: "voice_models",
  routes: "voice_routes",
  consent: "voice_consent_cases",
  assets: "voice_assets",
  stories: "voice_story_versions",
  jobs: "voice_jobs",
  pron: "voice_pronunciations",
} as const;

export type Label = "LIVE" | "CONNECTED" | "DISABLED" | "SIMULATED" | "PLANNED";
export const AI_DISCLOSURE = "AI-generated content. Amara and Tunde are original fictional AI personas, not real people.";
const STAFF = ["admin", "designer", "instructor"] as const;
const bad = (m: string) => new CampusError("invalid", m, 422);
const text = (v: unknown, name: string, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) throw bad(`${name} is required (at most ${max} characters).`);
  return s;
};

/* ---------------- personas ---------------- */

export const LANGUAGES = [
  { code: "en", label: "Standard English", status: "LIVE" as Label },
  { code: "en-NG", label: "Nigerian English", status: "LIVE" as Label },
  { code: "pcm", label: "Nigerian Pidgin", status: "LIVE" as Label },
];

export const PERSONAS = [
  {
    id: "amara",
    name: "Amara",
    classification: "Original fictional Nigerian female AI persona",
    character: "Professional, warm, intelligent, empathetic, confident, culturally respectful",
    bestFor: "Customer service, education, guidance, presentations, support",
    voice: "amara-synthetic-design",
    openers: { en: "Hello, I'm Amara, an AI assistant with Scholarion Academy. How may I help you?", "en-NG": "Hello, I'm Amara, your AI assistant with Scholarion Academy. How can I help you today?", pcm: "Hello, na Amara be this. I be AI assistant for Scholarion Academy. How I fit help you?" },
  },
  {
    id: "tunde",
    name: "Tunde",
    classification: "Original fictional Nigerian male AI persona",
    character: "Professional, calm, knowledgeable, reassuring, culturally respectful",
    bestFor: "Operational guidance, education, navigation, technical support",
    voice: "tunde-synthetic-design",
    openers: { en: "Hello, I'm Tunde, your AI assistant with Scholarion Academy. How may I help you?", "en-NG": "Hello, I'm Tunde, your Scholarion Academy AI assistant. How can I help?", pcm: "Hello, my name na Tunde. I be Scholarion Academy AI assistant. Wetin you need help with?" },
  },
];

/** Approved replies only (closed vocabulary) — the persona never improvises facts. */
const REPLIES: Record<string, Record<string, string>> = {
  courses: { en: "I can show you the programs in the catalog. Open Programs to compare them.", "en-NG": "I can show you our programs. Open Programs and you can compare them side by side.", pcm: "Make I show you the programs. Open Programs, you go see dem and compare." },
  enroll: { en: "Enrollment happens on the program page. Choose a section, then follow the steps.", "en-NG": "You can enroll from the program page — pick a section and follow the steps.", pcm: "You fit enroll for the program page. Choose section, then follow the steps." },
  help: { en: "Your request has reached the right team. A person will reply in the help desk.", "en-NG": "Your request has reached the right team; someone will reply on the help desk.", pcm: "Your request don reach the right team. Person go reply you for help desk." },
  date: { en: "Please confirm the date you want to select.", "en-NG": "Kindly confirm the date you want.", pcm: "Abeg, confirm the date you wan select." },
  fallback: { en: "I can't verify an answer to that. I've noted it so a person can help.", "en-NG": "I can't confirm that one; I've noted it for a person to help.", pcm: "I no fit confirm that one. I don note am make person help you." },
};
const HIGH_RISK = /\b(medical|medicine|doctor|diagnos|prescri|dose|legal|lawyer|lawsuit|court|emergency|suicid|self[- ]harm|bank|loan|refund|payment|card number|disciplin|appeal)\b/i;

/** Text-only persona reply with AI disclosure and captions. Language is chosen by the person, never inferred. */
export function personaReply(personaId: string, language: string, message: string) {
  const p = PERSONAS.find((x) => x.id === personaId);
  if (!p) throw new CampusError("not_found", "Persona not found", 404);
  if (!LANGUAGES.some((l) => l.code === language)) throw bad("Choose a language with the language switch.");
  const m = text(message, "Message", 1000);
  const risky = HIGH_RISK.test(m);
  // Standard English and a human handoff for high-risk topics.
  const lang = risky ? "en" : language;
  const intent = risky ? "help" : /\b(enrol|register|sign ?up|join)\w*/i.test(m) ? "enroll" : /\b(course|program|catalog|class)\w*/i.test(m) ? "courses" : /\b(date|when|schedule)\b/i.test(m) ? "date" : /\b(help|support|problem|issue)\b/i.test(m) ? "help" : "fallback";
  const reply = REPLIES[intent][lang];
  return {
    persona: p.name,
    language: lang,
    switchedToStandardEnglish: risky && language !== "en",
    handoff: risky || intent === "help" || intent === "fallback",
    reply,
    captions: [{ start: 0, end: Math.max(2, Math.round(reply.split(/\s+/).length / 2.5)), text: reply }],
    disclosure: AI_DISCLOSURE,
    voicePlayback: "PLANNED" as Label,
    note: risky ? "This topic needs a person. I'll keep to Standard English and pass it to the right team." : undefined,
  };
}

/* ---------------- capability status ---------------- */

export function capabilityStatus(): { group: string; capability: string; label: Label; blocker: string }[] {
  const P = (group: string, capability: string, blocker: string) => ({ group, capability, label: "PLANNED" as Label, blocker });
  const D = (group: string, capability: string, blocker: string) => ({ group, capability, label: "DISABLED" as Label, blocker });
  const L = (group: string, capability: string, blocker = "") => ({ group, capability, label: "LIVE" as Label, blocker });
  return [
    L("Digital Humans", "Amara & Tunde persona chat (text, captions, language switch, AI disclosure)"),
    P("Digital Humans", "Amara & Tunde voice playback and avatar rendering", "No served TTS or avatar renderer; licensed assets and cultural-review sign-off required."),
    D("Digital Humans", "Digital Double capture and training", "Needs the full consent case, liveness checks, biometric storage controls and a served model."),
    L("Governance", "Consent & Identity Center (cases, separation of duties, expiry, revocation impact)"),
    L("Governance", "Model registry with licence enforcement"),
    L("Governance", "Moderation of generation requests"),
    L("Governance", "Provenance records on exports (no media watermark yet)"),
    L("Studio", "Storyboards with immutable history, pairing rules, change-all with confirmation"),
    L("Voices", "Synthetic voice designs and the pronunciation dictionary"),
    D("Voices", "Voice cloning", "Requires an approved, unexpired consent case and a served model; no model is served."),
    P("Playground", "Text to speech, speech to text, voice changer, sound effects, music, dialogue", "No approved served models or GPU inference layer."),
    P("Studio", "Dubbing, audiobooks, voiceover, video editor, ads engine", "Depends on served TTS, alignment and rendering."),
    P("Audio Tools", "Voice isolator, forced alignment, audio & media detector", "No served models."),
    P("Live Experiences", "Live avatar conversations, voice agents, kiosk, device profiles", "No streaming STT/TTS or renderer; telephony not connected."),
    D("Integrations", "External AI provider routing", "Legal, contract and data-processing review required before any provider connector is enabled."),
    P("Publish", "Audio Native player, avatar widget, verification portal", "Needs generated media to publish."),
    D("Commercial", "Credits charging", "Sandbox estimates only; nothing is charged because nothing is generated."),
  ];
}

/* ---------------- model registry + licence gate ---------------- */

/** Seed entries record licences as published by their projects; staff must verify before any commercial use. */
const SEED_MODELS = [
  { key: "kokoro-82m", name: "Kokoro-82M", capability: "tts", codeLicense: "Apache-2.0", weightsLicense: "Apache-2.0", commercialUse: true },
  { key: "parler-tts", name: "Parler-TTS", capability: "voice_design", codeLicense: "Apache-2.0", weightsLicense: "Apache-2.0", commercialUse: true },
  { key: "chatterbox", name: "Chatterbox", capability: "tts_cloning", codeLicense: "MIT", weightsLicense: "MIT", commercialUse: true },
  { key: "f5-tts", name: "F5-TTS", capability: "tts_cloning", codeLicense: "MIT", weightsLicense: "CC-BY-NC-4.0", commercialUse: false },
  { key: "whisper", name: "Whisper", capability: "stt", codeLicense: "MIT", weightsLicense: "MIT", commercialUse: true },
  { key: "musicgen", name: "MusicGen", capability: "music", codeLicense: "MIT", weightsLicense: "CC-BY-NC-4.0", commercialUse: false },
  { key: "audioseal", name: "AudioSeal", capability: "watermark", codeLicense: "MIT", weightsLicense: "MIT", commercialUse: true },
];
export const PLANS = ["free", "starter", "creator", "pro", "business", "enterprise"] as const;
const PAID = new Set(["starter", "creator", "pro", "business", "enterprise"]);

export function ensureVoiceSeed(store: TenantStore) {
  if (store.list(V.models).length) return;
  for (const m of SEED_MODELS) store.insert(V.models, { ...m, licenseVerifiedBy: null, rollout: "not_served", served: false }, "vmod");
}

/** The build gate: every route must point at a model whose licence allows that plan. */
export function licenseGate(store: TenantStore) {
  ensureVoiceSeed(store);
  const violations = store.list(V.routes).flatMap((r) => {
    const m = store.get(V.models, String(r.modelId));
    if (!m) return [{ route: r.id, plan: r.plan, capability: r.capability, problem: "Model missing" }];
    if (PAID.has(String(r.plan)) && !m.commercialUse) return [{ route: r.id, plan: r.plan, capability: r.capability, problem: `${m.name} weights are ${m.weightsLicense} (non-commercial)` }];
    if (PAID.has(String(r.plan)) && !m.licenseVerifiedBy) return [{ route: r.id, plan: r.plan, capability: r.capability, problem: `${m.name} licence not yet verified by staff` }];
    return [];
  });
  return { passed: !violations.length, violations };
}

export function setRoute(store: TenantStore, a: Actor, input: { plan: string; capability: string; modelId: string }) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only admins route models.", 403);
  ensureVoiceSeed(store);
  if (!(PLANS as readonly string[]).includes(input.plan)) throw bad("Unknown plan.");
  const m = store.get(V.models, input.modelId);
  if (!m) throw new CampusError("not_found", "Model not found", 404);
  if (m.capability !== input.capability) throw bad(`${m.name} serves ${m.capability}, not ${input.capability}.`);
  if (PAID.has(input.plan) && !m.commercialUse) throw new CampusError("license_blocked", `${m.name} weights are ${m.weightsLicense}: non-commercial models can't route to the ${input.plan} plan.`, 409);
  if (PAID.has(input.plan) && !m.licenseVerifiedBy) throw new CampusError("license_unverified", `Verify ${m.name}'s licence before routing it to a paid plan.`, 409);
  const cur = store.list(V.routes, (r) => r.plan === input.plan && r.capability === input.capability)[0];
  const row = store.tx(() => (cur ? store.update(V.routes, cur.id, { modelId: m.id }) : store.insert(V.routes, { plan: input.plan, capability: input.capability, modelId: m.id }, "vrte")));
  audit(store, a, "voice.route.set", `${V.routes}/${row.id}`, `${input.plan}/${input.capability} → ${m.name}`);
  return row;
}

export function verifyLicense(store: TenantStore, a: Actor, modelId: string, reference: string) {
  if (!hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only admins verify licences.", 403);
  const m = store.get(V.models, modelId);
  if (!m) throw new CampusError("not_found", "Model not found", 404);
  const row = store.tx(() => store.update(V.models, m.id, { licenseVerifiedBy: a.id, licenseReference: text(reference, "Licence reference (URL or document)", 500), licenseVerifiedAt: nowIso() }));
  audit(store, a, "voice.license.verified", `${V.models}/${m.id}`, String(m.name));
  return row;
}

/* ---------------- Consent & Identity Center ---------------- */

export const CONSENT_CHECKS = [
  { key: "identity", label: "Identity verified (by reference — no ID images or numbers stored here)" },
  { key: "written", label: "Explicit written consent on file" },
  { key: "spoken", label: "Live spoken consent with liveness and anti-replay checks" },
  { key: "authority", label: "Authority to grant the rights verified" },
  { key: "scope", label: "Purposes, audiences, applications, geography and usage period recorded" },
  { key: "retention", label: "Training-data and model retention and the revocation procedure recorded" },
  { key: "terms", label: "Compensation or contract terms recorded (where applicable)" },
  { key: "legal", label: "Legal and organizational review completed" },
] as const;

export function openConsentCase(store: TenantStore, a: Actor, input: { subjectName: string; purposes: string; expiresOn: string; kind: "voice" | "digital_double" }) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Only admins and designers open consent cases.", 403);
  const exp = Date.parse(`${input.expiresOn}T23:59:59Z`);
  if (!Number.isFinite(exp) || exp <= Date.now()) throw bad("Set an expiry date in the future.");
  const row = store.tx(() => store.insert(V.consent, { subjectName: text(input.subjectName, "Subject name", 120), kind: input.kind === "digital_double" ? "digital_double" : "voice", purposes: text(input.purposes, "Approved purposes", 1000), expiresOn: input.expiresOn, checks: {}, evidenceBy: null, approvedBy: null, secondReviewerBy: null, state: "open", openedBy: a.id }, "vcc"));
  audit(store, a, "voice.consent.opened", `${V.consent}/${row.id}`);
  return row;
}

/** Record evidence for a check (references only). The person recording evidence can't approve the case. */
export function recordConsentEvidence(store: TenantStore, a: Actor, caseId: string, check: string, reference: string) {
  if (!hasAny(a, ["admin", "designer"])) throw new CampusError("forbidden", "Staff only.", 403);
  const c = store.get(V.consent, caseId);
  if (!c) throw new CampusError("not_found", "Consent case not found", 404);
  if (c.state !== "open") throw new CampusError("not_open", "This case is no longer open.", 409);
  if (!CONSENT_CHECKS.some((x) => x.key === check)) throw bad("Unknown check.");
  const ref = text(reference, "Evidence reference", 300);
  if (/\.(jpe?g|png|heic|pdf)$/i.test(ref) && check === "identity") throw bad("Record the verification reference, not an ID image or document.");
  const row = store.tx(() => store.update(V.consent, c.id, { checks: { ...(c.checks as Record<string, unknown>), [check]: { reference: ref, by: a.id, at: nowIso() } }, evidenceBy: c.evidenceBy ?? a.id }));
  audit(store, a, "voice.consent.evidence", `${V.consent}/${c.id}`, check);
  return row;
}

/** Approval needs every check and two different reviewers, neither of whom recorded the evidence. */
export function approveConsent(store: TenantStore, a: Actor, caseId: string) {
  if (!hasAny(a, ["admin", "registrar", "designer"])) throw new CampusError("forbidden", "Staff only.", 403);
  const c = store.get(V.consent, caseId);
  if (!c) throw new CampusError("not_found", "Consent case not found", 404);
  const checks = (c.checks as Record<string, { by: string }>) ?? {};
  const missing = CONSENT_CHECKS.filter((x) => !checks[x.key]).map((x) => x.label);
  if (missing.length) throw new CampusError("incomplete", `Still missing: ${missing.join("; ")}.`, 409);
  const evidencePeople = new Set(Object.values(checks).map((x) => x.by));
  if (evidencePeople.has(a.id)) throw new CampusError("separation_of_duties", "Someone who recorded evidence can't approve the case.", 403);
  if (c.state === "open") {
    const row = store.tx(() => store.update(V.consent, c.id, { approvedBy: a.id, state: "awaiting_second_review" }));
    audit(store, a, "voice.consent.approved", `${V.consent}/${c.id}`);
    return row;
  }
  if (c.state === "awaiting_second_review") {
    if (c.approvedBy === a.id) throw new CampusError("separation_of_duties", "A second, different reviewer must sign off.", 403);
    const row = store.tx(() => store.update(V.consent, c.id, { secondReviewerBy: a.id, state: "active", activatedAt: nowIso() }));
    audit(store, a, "voice.consent.second_review", `${V.consent}/${c.id}`);
    return row;
  }
  throw new CampusError("not_open", `This case is ${c.state}.`, 409);
}

export const consentActive = (store: TenantStore, caseId?: string | null) => {
  const c = caseId ? store.get(V.consent, caseId) : null;
  return !!c && c.state === "active" && Date.parse(`${c.expiresOn}T23:59:59Z`) > Date.now();
};

/** Revocation blocks new generation immediately and lists everything affected. */
export function revokeConsent(store: TenantStore, a: Actor, caseId: string, reason: string) {
  if (!hasAny(a, ["admin", "registrar", "designer"])) throw new CampusError("forbidden", "Staff only.", 403);
  const c = store.get(V.consent, caseId);
  if (!c) throw new CampusError("not_found", "Consent case not found", 404);
  const affectedVoices = store.list(V.assets, (v) => v.consentId === c.id);
  const affectedVoiceIds = new Set(affectedVoices.map((v) => v.id));
  const latest = latestStories(store);
  const affectedProjects = latest.filter((s) => ((s.payload as { scenes: { voice: string }[] }).scenes ?? []).some((sc) => affectedVoiceIds.has(sc.voice)));
  store.tx(() => {
    store.update(V.consent, c.id, { state: "revoked", revokedBy: a.id, revokedAt: nowIso(), revokeReason: text(reason, "Reason", 500) });
    for (const v of affectedVoices) store.update(V.assets, v.id, { state: "blocked_revoked" });
    store.emit("voice.consent.revoked", `${V.consent}/${c.id}`, { voices: affectedVoices.map((v) => v.id), projects: affectedProjects.map((p) => p.storyId) });
  });
  audit(store, a, "voice.consent.revoked", `${V.consent}/${c.id}`, `${affectedVoices.length} voice(s), ${affectedProjects.length} project(s)`);
  return { revoked: true, generationBlocked: true, affected: { voices: affectedVoices.map((v) => String(v.name)), projects: affectedProjects.map((p) => String((p.payload as { title: string }).title)) }, next: ["Unpublish or flag where contractually required", "Schedule data and model deletion per retention rules", "Notify the owners"] };
}

/* ---------------- voices + pronunciations ---------------- */

export function createVoice(store: TenantStore, a: Actor, input: { name: string; kind: "synthetic" | "cloned"; description?: string; consentId?: string; language: string }) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  if (!LANGUAGES.some((l) => l.code === input.language)) throw bad("Unsupported language.");
  if (input.kind === "cloned" && !consentActive(store, input.consentId)) throw new CampusError("consent_required", "Cloning needs an active, unexpired consent case for this voice owner.", 409);
  const row = store.tx(() =>
    store.insert(V.assets, { name: text(input.name, "Voice name", 80), kind: input.kind === "cloned" ? "cloned" : "synthetic", description: String(input.description ?? "").slice(0, 400), consentId: input.kind === "cloned" ? input.consentId : null, language: input.language, ownerId: a.id, state: input.kind === "cloned" ? "awaiting_served_model" : "design_only" }, "vvoc"),
  );
  audit(store, a, "voice.asset.created", `${V.assets}/${row.id}`, String(row.kind));
  return row;
}

export function addPronunciation(store: TenantStore, a: Actor, input: { term: string; say: string; language: string }) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  const term = text(input.term, "Term", 80);
  const cur = store.list(V.pron, (p) => String(p.term).toLowerCase() === term.toLowerCase() && p.language === input.language)[0];
  const row = store.tx(() => (cur ? store.update(V.pron, cur.id, { say: text(input.say, "Pronunciation", 120) }) : store.insert(V.pron, { term, say: text(input.say, "Pronunciation", 120), language: input.language, by: a.id }, "vprn")));
  return row;
}

/* ---------------- storyboards (immutable revisions) ---------------- */

const voiceOptions = (store: TenantStore) => [...PERSONAS.map((p) => ({ id: p.voice, persona: p.id, blocked: false })), ...store.list(V.assets).map((v) => ({ id: String(v.id), persona: null as string | null, blocked: String(v.state).startsWith("blocked") || (v.kind === "cloned" && !consentActive(store, v.consentId as string)) }))];

export function pairing(store: TenantStore, avatar: string, voice: string, language: string) {
  const p = PERSONAS.find((x) => x.id === avatar);
  if (!p) return { valid: false, code: "avatar_restricted", alternatives: [] as string[] };
  const v = voiceOptions(store).find((x) => x.id === voice);
  if (!v) return { valid: false, code: "voice_unknown", alternatives: [p.voice] };
  if (v.blocked) return { valid: false, code: "consent_required", alternatives: [p.voice] };
  if (v.persona && v.persona !== p.id) return { valid: false, code: "pairing_incompatible", alternatives: [p.voice] };
  if (!LANGUAGES.some((l) => l.code === language)) return { valid: false, code: "language_unsupported", alternatives: [] };
  return { valid: true, code: "draft_pairing_only", generationAllowed: false, note: "Script planning only; no speech or lip-sync is generated." };
}

interface Story {
  title: string;
  scenes: { id: string; speaker: string; avatar: string; voice: string; language: string; script: string; state: string }[];
  archived: boolean;
}
function latestStories(store: TenantStore) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of store.list(V.stories)) {
    const cur = byId.get(String(r.storyId));
    if (!cur || Number(r.revision) > Number(cur.revision)) byId.set(String(r.storyId), r);
  }
  return [...byId.values()];
}
function latest(store: TenantStore, a: Actor, storyId: string) {
  const rows = store.list(V.stories, (r) => r.storyId === storyId).sort((x, y) => Number(y.revision) - Number(x.revision));
  if (!rows.length) throw new CampusError("not_found", "Project not found", 404);
  if (rows[0].ownerId !== a.id && !hasAny(a, ["admin"])) throw new CampusError("forbidden", "Only the project owner can change it.", 403);
  return rows[0];
}
function writeRevision(store: TenantStore, a: Actor, storyId: string, revision: number, payload: Story, action: string) {
  const row = store.tx(() => store.insert(V.stories, { storyId, revision, ownerId: a.id, payload, checksum: sha256(JSON.stringify(payload)) }, "vstv"));
  audit(store, a, `voice.story.${action}`, `${V.stories}/${storyId}`, `revision ${revision}`);
  return { id: storyId, revision, ...payload, rowId: row.id };
}

export function createStory(store: TenantStore, a: Actor, title: string) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  return writeRevision(store, a, `vsty_${sha256(`${a.id}${nowIso()}${Math.random()}`).slice(0, 16)}`, 1, { title: text(title, "Title", 160), scenes: [], archived: false }, "created");
}

export function listStories(store: TenantStore, a: Actor) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  return latestStories(store)
    .filter((r) => r.ownerId === a.id || hasAny(a, ["admin"]))
    .map((r) => ({ id: String(r.storyId), revision: Number(r.revision), ...(r.payload as Story) }))
    .sort((x, y) => x.title.localeCompare(y.title));
}

export function storyCommand(store: TenantStore, a: Actor, storyId: string, action: "scene" | "change_all" | "archive" | "restore" | "history" | "export", data: Record<string, unknown>) {
  const row = latest(store, a, storyId);
  const payload = JSON.parse(JSON.stringify(row.payload)) as Story;
  const rev = Number(row.revision);
  if (action === "history") return { versions: store.list(V.stories, (r) => r.storyId === storyId).map((r) => ({ revision: Number(r.revision), at: String(r.createdAt), checksum: String(r.checksum) })).sort((x, y) => y.revision - x.revision) };
  if (action === "export") {
    const provenance = { exportId: `vexp_${sha256(`${storyId}${rev}${nowIso()}`).slice(0, 12)}`, project: storyId, revision: rev, organization: store.tenantId, exportedBy: a.id, at: nowIso(), sha256: String(row.checksum), mediaGenerated: false, disclosure: AI_DISCLOSURE };
    audit(store, a, "voice.story.export", `${V.stories}/${storyId}`, provenance.exportId);
    return { project: payload, provenance };
  }
  if (Number(data.revision) !== rev) throw new CampusError("precondition_failed", "This project changed. Reload before editing.", 412);
  if (action === "restore") {
    const old = store.list(V.stories, (r) => r.storyId === storyId && Number(r.revision) === Number(data.targetRevision))[0];
    if (!old) throw bad("That version doesn't exist.");
    return writeRevision(store, a, storyId, rev + 1, old.payload as Story, "restored");
  }
  if (action === "archive") return writeRevision(store, a, storyId, rev + 1, { ...payload, archived: true }, "archived");
  if (payload.archived) throw bad("Restore an earlier active version before editing.");
  if (action === "scene") {
    const avatar = String(data.avatar ?? "");
    const f = { speaker: text(data.speaker, "Speaker", 80), avatar, voice: String(data.voice || PERSONAS.find((p) => p.id === avatar)?.voice || ""), language: String(data.language ?? ""), script: text(data.script, "Script", 4000) };
    const ok = pairing(store, f.avatar, f.voice, f.language);
    if (!ok.valid) throw new CampusError(ok.code, `Pairing refused: ${ok.code.replace(/_/g, " ")}.`, 422);
    if (payload.scenes.length >= 30) throw bad("Draft limit: 30 scenes.");
    payload.scenes.push({ id: `scn_${payload.scenes.length + 1}`, ...f, state: "draft" });
    return writeRevision(store, a, storyId, rev + 1, payload, "scene");
  }
  // change_all: dry run lists affected scenes; applying requires confirmation.
  const speaker = String(data.speaker ?? "");
  const ok = pairing(store, String(data.avatar), String(data.voice), String(data.language));
  if (!ok.valid) throw new CampusError(ok.code, `Pairing refused: ${ok.code.replace(/_/g, " ")}.`, 422);
  const affected = payload.scenes.filter((s) => s.speaker === speaker).map((s) => s.id);
  if (!affected.length) throw bad("That speaker has no scenes.");
  if (data.dryRun === true) return { affected, count: affected.length, revision: rev };
  if (data.confirmed !== true) throw bad("Confirm the affected scenes before applying.");
  for (const s of payload.scenes) if (s.speaker === speaker) Object.assign(s, { avatar: String(data.avatar), voice: String(data.voice), language: String(data.language), state: "draft" });
  return writeRevision(store, a, storyId, rev + 1, payload, "change_all");
}

/* ---------------- generation requests (moderated, costed, not executed) ---------------- */

export const CREDIT_RATES: Record<string, { unit: string; credits: number }> = {
  tts: { unit: "1,000 characters", credits: 100 },
  stt: { unit: "minute", credits: 30 },
  voice_changer: { unit: "minute", credits: 120 },
  sound_effects: { unit: "generation", credits: 40 },
  music: { unit: "minute", credits: 400 },
  dubbing: { unit: "minute", credits: 600 },
};
const NEVER = [
  { re: /\b(sound|speak|talk|pretend|impersonat\w*)\b.{0,40}\b(as|like)\b.{0,40}\b(president|senator|governor|ceo|celebrity|minister|pastor|[A-Z][a-z]+ [A-Z][a-z]+)\b/, why: "Impersonating a real person" },
  { re: /\b(vote|elect|campaign|candidate|ballot)\b/i, why: "Political persuasion" },
  { re: /\b(voice ?print|voice id|bank verification|authenticat\w*|log ?in to|password)\b/i, why: "Using a voice for authentication" },
  { re: /\b(nude|sexual|explicit|porn)\w*/i, why: "Sexual content" },
  { re: /\b(robocall|pretend to be (?:the )?bank|scam|deceptive call)\b/i, why: "Deceptive calls" },
];

export function requestGeneration(store: TenantStore, a: Actor, input: { capability: string; text: string; voiceId?: string; plan?: string }) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  const rate = CREDIT_RATES[input.capability];
  if (!rate) throw bad("Unknown capability.");
  const body = text(input.text, "Input", 10000);
  const flags = NEVER.filter((n) => n.re.test(body)).map((n) => n.why);
  if (input.voiceId) {
    const v = voiceOptions(store).find((x) => x.id === input.voiceId);
    if (!v) throw bad("Unknown voice.");
    if (v.blocked) flags.push("Voice consent missing, expired or revoked");
  }
  const units = input.capability === "tts" ? Math.max(1, Math.ceil(body.length / 1000)) : 1;
  const route = store.list(V.routes, (r) => r.plan === (input.plan ?? "free") && r.capability === (input.capability === "tts" ? "tts" : input.capability))[0];
  const state = flags.length ? "moderation_blocked" : "not_operational";
  const row = store.tx(() =>
    store.insert(V.jobs, { capability: input.capability, chars: body.length, inputHash: sha256(body), voiceId: input.voiceId ?? null, plan: input.plan ?? "free", estimatedCredits: units * rate.credits, charged: 0, state, flags, reason: flags.length ? `Blocked: ${flags.join("; ")}` : route ? "No served model behind this route yet." : "No model routed for this plan and capability, and no served model.", by: a.id }, "vjob"),
  );
  store.emit(flags.length ? "voice.moderation.blocked" : "voice.generation.not_operational", `${V.jobs}/${row.id}`, { capability: input.capability });
  audit(store, a, flags.length ? "voice.moderation.blocked" : "voice.generation.requested", `${V.jobs}/${row.id}`, flags.join("; ") || input.capability);
  return { id: row.id, state, flags, estimatedCredits: row.estimatedCredits, charged: 0, output: null, reason: row.reason, disclosure: AI_DISCLOSURE };
}

export function voiceOverview(store: TenantStore, a: Actor) {
  if (!hasAny(a, STAFF)) throw new CampusError("forbidden", "Staff only.", 403);
  ensureVoiceSeed(store);
  return {
    personas: PERSONAS,
    languages: LANGUAGES,
    capabilities: capabilityStatus(),
    models: store.list(V.models).map((m) => ({ id: m.id, name: String(m.name), capability: String(m.capability), codeLicense: String(m.codeLicense), weightsLicense: String(m.weightsLicense), commercialUse: !!m.commercialUse, verified: !!m.licenseVerifiedBy, served: false })),
    routes: store.list(V.routes).map((r) => ({ id: r.id, plan: String(r.plan), capability: String(r.capability), model: String(store.get(V.models, String(r.modelId))?.name ?? r.modelId) })),
    gate: licenseGate(store),
    consent: store.list(V.consent).map((c) => ({ id: c.id, subjectName: String(c.subjectName), kind: String(c.kind), state: String(c.state), expiresOn: String(c.expiresOn), checks: Object.keys((c.checks as object) ?? {}).length, total: CONSENT_CHECKS.length })),
    voices: store.list(V.assets).map((v) => ({ id: v.id, name: String(v.name), kind: String(v.kind), state: String(v.state), language: String(v.language) })),
    pronunciations: store.list(V.pron).map((p) => ({ id: p.id, term: String(p.term), say: String(p.say), language: String(p.language) })),
    jobs: store.list(V.jobs).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 15).map((j) => ({ id: j.id, capability: String(j.capability), state: String(j.state), estimatedCredits: Number(j.estimatedCredits), reason: String(j.reason) })),
    rates: CREDIT_RATES,
    disclosure: AI_DISCLOSURE,
  };
}
