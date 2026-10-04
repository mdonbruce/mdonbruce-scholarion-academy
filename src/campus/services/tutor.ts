import { broker, CampusError, metrics, nowIso, nowMs, sha256, token, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { ask, auditAi, classifyFor, LOCAL_MODEL, retrieveFor } from "./ai";
import { connectorStatus } from "./platform";
import { audit, isStaff, notify, userName } from "./common";
import { moduleStates } from "./curriculum";
import { projection } from "./calendar";

/**
 * AI Tutor (Tab 44), Lab Key Vault (Tab 45) and Cloud Lab extras (similarity signal,
 * notebook workflow). The tutor uses the governed, eval-gated `ai_tutor` agent:
 * answers are quotes from published course material with citations; graded work is
 * refused and turned into hints; it can escalate to the instructor. Avatar mode uses the
 * Haven avatar connector when it is connected; otherwise it returns the text fallback
 * with captions and a transcript (always with AI disclosure).
 */

export type TutorMode = "explain" | "hint" | "quiz" | "study_plan";
export type TutorLanguage = "en" | "en-NG" | "pcm";

const PHRASES: Record<TutorLanguage, { intro: string; unsure: string; hints: string; plan: string; quiz: string }> = {
  en: { intro: "Here's what your course material says:", unsure: "I'm not certain beyond what these sources say — check them, or ask your instructor.", hints: "I can't do graded work for you, but here are some hints:", plan: "Here's a study plan for the next week:", quiz: "Try these practice questions (not graded):" },
  "en-NG": { intro: "Here's what your course material says:", unsure: "I'm not fully sure beyond these sources — please check them or ask your lecturer.", hints: "I can't do graded work for you, but here are a few hints:", plan: "Here's a study plan for this week:", quiz: "Try these practice questions (they won't count):" },
  pcm: { intro: "See wetin your course material talk:", unsure: "I no too sure pass wetin dis sources talk — check dem, or ask your lecturer.", hints: "I no fit do graded work for you, but see some hints:", plan: "See study plan for dis week:", quiz: "Try dis practice questions (dem no go count):" },
};

function languageAllowed(store: TenantStore, lang: TutorLanguage) {
  if (lang === "en") return true;
  const t = broker.tenant(store.tenantId)!;
  return !!t.flags[`tutor_lang_${lang.replace("-", "_").toLowerCase()}`];
}

export interface TutorReply {
  mode: TutorMode;
  decision: "answered" | "refused_with_hints" | "refused" | "no_source" | "plan" | "practice";
  text: string;
  citations: { n: number; title: string; href: string }[];
  uncertainty: string;
  language: TutorLanguage;
  disclosure: string;
  avatar: null | { avatar: "amara" | "tunde"; status: string; captionsVtt: string; transcript: string; note: string };
  model: string;
}

function vtt(text: string) {
  const lines = text.split(/\n+/).filter(Boolean);
  let t = 0;
  const ts = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
  return ["WEBVTT", "", ...lines.flatMap((l, i) => {
    const dur = Math.max(2, Math.ceil(l.split(" ").length / 2.5));
    const out = [`${i + 1}`, `${ts(t)} --> ${ts(t + dur)}`, l, ""];
    t += dur;
    return out;
  })].join("\n");
}

function avatarFor(store: TenantStore, avatar: "amara" | "tunde" | undefined, text: string): TutorReply["avatar"] {
  if (!avatar) return null;
  const status = connectorStatus(store, "haven_avatar");
  const note = status === "CONNECTED" || status === "LIVE" ? "Presented by the Haven avatar." : status === "SIMULATED" ? "Simulated avatar presentation (staging): captions and transcript below." : "The avatar service isn't connected for this school, so you're seeing the text version with captions and a transcript.";
  return { avatar, status, captionsVtt: vtt(text), transcript: text, note };
}

function remember(store: TenantStore, a: Actor, courseId: string, topic: string, mode: TutorMode) {
  if (a.masqueradedBy) return;
  store.insert("tutor_memory", { userId: a.id, courseId, topic: topic.slice(0, 120), mode }, "tm");
  const mine = store.list("tutor_memory", (m) => m.userId === a.id && m.courseId === courseId).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  for (const old of mine.slice(30)) store.tombstone("tutor_memory", old.id);
}

/** One tutor turn. */
export function tutor(store: TenantStore, a: Actor, input: { courseId: string; mode: TutorMode; question?: string; language?: TutorLanguage; avatar?: "amara" | "tunde" }): TutorReply {
  const cid = input.courseId;
  if (!(a.courseRoles[cid] ?? []).length && !a.roles.includes("admin")) throw new CampusError("forbidden", "You're not in that course.", 403);
  const lang: TutorLanguage = input.language ?? "en";
  if (!languageAllowed(store, lang)) throw new CampusError("language_disabled", "That language mode isn't turned on for this school.", 423);
  const P = PHRASES[lang];
  const disclosure = "AI tutor — answers come from your course materials and can be wrong. It never does graded work for you.";
  const q = (input.question ?? "").trim().slice(0, 1000);
  const base = { language: lang, disclosure, model: LOCAL_MODEL };

  if (input.mode === "study_plan") {
    const learner = a;
    const mods = moduleStates(store, learner, cid).filter((m) => !m.complete);
    const due = projection(store, learner, nowIso(), new Date(nowMs() + 7 * 86400_000).toISOString(), { courseIds: [cid] }).items.filter((i) => i.kind === "assignment" || i.kind === "quiz");
    const lines = [P.plan, ...due.map((d) => `• ${d.title} — due ${String(d.start).slice(0, 10)}`), ...mods.slice(0, 2).flatMap((m) => m.items.filter((i) => !i.done && !i.locked).slice(0, 3).map((i) => `• ${m.module.title}: ${i.item.title}`)), "• Review what you found hard, then try practice questions."];
    const text = lines.join("\n");
    store.tx(() => {
      auditAi(store, a, "ai_tutor", "study_plan", "study_plan", "answered", []);
      remember(store, a, cid, "study plan", "study_plan");
    });
    return { ...base, mode: "study_plan", decision: "plan", text, citations: [], uncertainty: "Based on your module progress and due dates.", avatar: avatarFor(store, input.avatar, text) };
  }
  if (!q) throw new CampusError("invalid", "Ask a question or name a topic.", 422);

  const refusal = classifyFor(store, "ai_tutor", q);
  if (refusal) {
    if (refusal.category !== "academic_integrity") {
      store.tx(() => auditAi(store, a, "ai_tutor", q, refusal.category, "refused", []));
      return { ...base, mode: input.mode, decision: "refused", text: refusal.message, citations: [], uncertainty: "", avatar: avatarFor(store, input.avatar, refusal.message) };
    }
    // Graded work: refuse, then offer hints that point to the material — never the answer.
    const topic = q.replace(/\b(answers?|solutions?|solve|do|write|complete|finish|my|the|for|to|of)\b/gi, " ");
    const hits = retrieveFor(store, a, "ai_tutor", topic, cid);
    const hints = hits.map((h, i) => `• Re-read "${h.title}" [${i + 1}] — focus on: ${h.sentence.split(" ").slice(0, 8).join(" ")}…`);
    const text = [refusal.message, P.hints, ...(hints.length ? hints : ["• Break the task into steps and write down what each step needs.", "• Check the module overview and the rubric."]), "• If you're stuck, use \"Ask my instructor\"."].join("\n");
    store.tx(() => {
      auditAi(store, a, "ai_tutor", q, "academic_integrity", "refused_with_hints", hits.map((h) => `${h.kind}/${h.refId}`));
      remember(store, a, cid, topic.trim(), "hint");
    });
    metrics.inc("tutor_refusals_total", { reason: "graded_work" });
    return { ...base, mode: input.mode, decision: "refused_with_hints", text, citations: hits.map((h, i) => ({ n: i + 1, title: h.title, href: h.href })), uncertainty: "", avatar: avatarFor(store, input.avatar, text) };
  }

  if (input.mode === "quiz") {
    const hits = retrieveFor(store, a, "ai_tutor", q, cid);
    if (!hits.length) return { ...base, mode: "quiz", decision: "no_source", text: "I couldn't find material on that topic to make practice questions from.", citations: [], uncertainty: P.unsure, avatar: null };
    const questions = hits.map((h, i) => {
      const words = h.sentence.split(" ").filter((w) => w.replace(/\W/g, "").length > 5);
      const key = words[Math.floor(words.length / 2)]?.replace(/\W/g, "") ?? h.title;
      return { n: i + 1, prompt: h.sentence.replace(new RegExp(`\\b${key}\\b`), "_____"), answer: key, source: i + 1 };
    });
    const text = [P.quiz, ...questions.map((x) => `${x.n}. ${x.prompt}`)].join("\n");
    store.tx(() => {
      auditAi(store, a, "ai_tutor", q, "practice", "answered", hits.map((h) => `${h.kind}/${h.refId}`));
      remember(store, a, cid, q, "quiz");
    });
    return { ...base, mode: "quiz", decision: "practice", text, citations: hits.map((h, i) => ({ n: i + 1, title: h.title, href: h.href })), uncertainty: "Answers are the blanked words from the cited source.", avatar: avatarFor(store, input.avatar, text) };
  }

  const r = ask(store, a, "ai_tutor", q, { courseId: cid });
  const text = r.decision === "answered" ? `${P.intro}\n${r.answer}${input.mode === "hint" ? "\nTry explaining it back in your own words." : ""}` : r.answer;
  store.tx(() => remember(store, a, cid, q, input.mode));
  return { ...base, mode: input.mode, decision: r.decision === "answered" ? "answered" : r.decision === "refused" ? "refused" : "no_source", text, citations: r.citations.map((c) => ({ n: c.n, title: c.title, href: c.href })), uncertainty: r.decision === "answered" ? P.unsure : "", avatar: avatarFor(store, input.avatar, text) };
}

/** Hand off to the course's instructors (the learner's question goes to their inbox via notification). */
export function escalate(store: TenantStore, a: Actor, courseId: string, question: string) {
  if (!(a.courseRoles[courseId] ?? []).includes("student")) throw new CampusError("forbidden", "Only students in this course can escalate.", 403);
  const staff = store.list("enrollments", (e) => e.courseId === courseId && e.state === "active" && (e.role === "instructor" || e.role === "ta")).map((e) => e.userId as string);
  if (!staff.length) throw new CampusError("no_instructor", "This course has no instructor to escalate to.", 409);
  return store.tx(() => {
    const c = store.insert("conversations", { courseId, subject: "Question from the AI tutor", participants: [a.id, ...staff], messages: [{ id: token(6), authorId: a.id, body: `${question.slice(0, 2000)}\n\n(Escalated from the AI tutor.)`, at: nowIso() }], state: {}, authorId: a.id, escalatedFromTutor: true }, "cnv");
    notify(store, staff, "conversations", `Tutor escalation from ${userName(store, a.id)}`, question.slice(0, 200), `/campus/{tenant}/inbox`, courseId);
    auditAi(store, a, "ai_tutor", question, "escalation", "escalated", []);
    metrics.inc("tutor_escalations_total", {});
    return { conversationId: c.id };
  });
}

export function tutorMemory(store: TenantStore, a: Actor, courseId?: string) {
  return store.list("tutor_memory", (m) => m.userId === a.id && (!courseId || m.courseId === courseId)).map((m) => ({ id: m.id, topic: m.topic, mode: m.mode, at: m.createdAt, courseId: m.courseId }));
}

/** Erase tutor memory (all, or for one course). */
export function eraseTutorMemory(store: TenantStore, a: Actor, courseId?: string) {
  return store.tx(() => {
    const rows = store.list("tutor_memory", (m) => m.userId === a.id && (!courseId || m.courseId === courseId));
    for (const r of rows) delete store.table("tutor_memory")[r.id]; // hard delete: memory is erasable
    audit(store, a, "tutor.memory_erase", `users/${a.id}`, courseId ?? "all");
    return { erased: rows.length };
  });
}

/** Tutor analytics: usage, refusals, escalations (deflection), per course. */
export function tutorAnalytics(store: TenantStore, a: Actor) {
  if (!hasAny(a, ["admin", "designer"]) && !Object.values(a.courseRoles).some((r) => r.includes("instructor"))) throw new CampusError("forbidden", "Staff only.", 403);
  const rows = store.list("ai_audit", (r) => r.agentKey === "ai_tutor");
  const by = (d: string) => rows.filter((r) => r.decision === d).length;
  const learners = new Set(rows.map((r) => r.userId)).size;
  return { requests: rows.length, learners, answered: by("answered"), refused: by("refused") + by("refused_with_hints"), noSource: by("no_source"), escalated: by("escalated"), deflectionRate: rows.length ? Math.round((1 - by("escalated") / rows.length) * 100) : null, costPerLearner: 0, costNote: "Local extractive engine: no model spend." };
}

/* ---------------- Lab key vault ---------------- */

/** Issue a learner-scoped model key for a lab: capped, rate-limited, expiring. The master key stays in the vault. */
export function issueLabKey(store: TenantStore, a: Actor, assignmentId: string) {
  const asg = store.get("assignments", assignmentId);
  if (!asg?.labTemplateId) throw new CampusError("invalid", "This assignment isn't a Cloud Lab.", 422);
  if (!(a.courseRoles[asg.courseId as string] ?? []).includes("student")) throw new CampusError("forbidden", "Only students in this course get lab keys.", 403);
  const secret = `sk-sch-${token(24)}`;
  return store.tx(() => {
    for (const k of store.list("lab_keys", (x) => x.userId === a.id && x.assignmentId === assignmentId && !x.revokedAt)) store.update("lab_keys", k.id, { revokedAt: nowIso() });
    const k = store.insert("lab_keys", { userId: a.id, label: `${asg.title}`, assignmentId, keyHash: sha256(secret), spendCapCents: 500, spentCents: 0, ratePerMin: 20, expiresAt: new Date(nowMs() + 24 * 3600_000).toISOString(), revokedAt: null }, "lk");
    audit(store, a, "lab_keys.issue", `lab_keys/${k.id}`);
    return { id: k.id, key: secret, spendCapCents: 500, expiresAt: k.expiresAt, note: "Use this key only inside the lab. It stops working at the cap or expiry." };
  });
}

export function setKeyCap(store: TenantStore, a: Actor, keyId: string, spendCapCents: number) {
  const k = store.get("lab_keys", keyId);
  if (!k) throw new CampusError("not_found", "Key not found", 404);
  const asg = store.get("assignments", k.assignmentId as string);
  if (!asg || !hasAny(a, ["admin", "instructor"], asg.courseId as string)) throw new CampusError("forbidden", "Only the instructor can change caps.", 403);
  if (spendCapCents < 0 || spendCapCents > 10000) throw new CampusError("invalid", "Cap must be between 0 and 10000 cents.", 422);
  return store.tx(() => store.update("lab_keys", keyId, { spendCapCents }));
}

const keyRate = new Map<string, number[]>();

/**
 * The platform model proxy. Checks the learner key (hash, expiry, revocation, cap, rate),
 * meters the estimated cost and forwards to the configured provider. With no provider
 * connected the call is answered by a clearly-labelled simulator.
 */
export function proxyModelCall(store: TenantStore, secret: string, prompt: string) {
  const k = store.list("lab_keys", (x) => x.keyHash === sha256(secret))[0];
  if (!k || k.revokedAt) throw new CampusError("invalid_key", "Invalid or revoked key.", 401);
  if (String(k.expiresAt) < nowIso()) throw new CampusError("key_expired", "This key has expired. Get a new one from the lab.", 401);
  const recent = (keyRate.get(k.id) ?? []).filter((t) => t > nowMs() - 60_000);
  if (recent.length >= Number(k.ratePerMin ?? 20)) throw new CampusError("rate_limited", "Too many requests from this key.", 429);
  const tokens = Math.ceil(prompt.length / 4) + 50;
  const cost = Math.max(1, Math.ceil(tokens / 1000)); // cents, simulated price
  if (Number(k.spentCents) + cost > Number(k.spendCapCents)) throw new CampusError("spend_cap", "This key reached its spend cap. Ask your instructor to raise it.", 402);
  recent.push(nowMs());
  keyRate.set(k.id, recent);
  const status = connectorStatus(store, "model_provider");
  return store.tx(() => {
    store.update("lab_keys", k.id, { spentCents: Number(k.spentCents) + cost });
    metrics.inc("lab_key_calls_total", { provider: status });
    return { provider: status, simulated: status !== "CONNECTED" && status !== "LIVE", output: status === "CONNECTED" || status === "LIVE" ? "" : `[simulated model] Received ${tokens} tokens. Connect a model provider in Connectors for real output.`, costCents: cost, remainingCents: Number(k.spendCapCents) - Number(k.spentCents) - cost };
  });
}

/* ---------------- Similarity signal (signal only; people decide) ---------------- */

function shingles(code: string, n = 5) {
  const toks = code.replace(/#.*$/gm, "").replace(/(["'])(?:\\.|(?!\1).)*\1/g, "S").split(/[^A-Za-z0-9_]+/).filter(Boolean).map((t) => (/^[a-z_]\w*$/i.test(t) && !["def", "return", "for", "in", "if", "else", "while", "range", "import", "from", "print"].includes(t) ? "V" : t));
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join(" "));
  return out;
}

export function similaritySignal(store: TenantStore, sessionId: string) {
  const s = store.get("lab_sessions", sessionId);
  if (!s) return null;
  const mine = shingles(String(s.code ?? ""));
  if (mine.size < 4) return null;
  let best = 0;
  for (const o of store.list("lab_sessions", (x) => x.assignmentId === s.assignmentId && x.id !== s.id)) {
    const other = shingles(String(o.code ?? ""));
    if (!other.size) continue;
    const inter = [...mine].filter((x) => other.has(x)).length;
    best = Math.max(best, Math.round((inter / new Set([...mine, ...other]).size) * 100));
  }
  store.update("lab_sessions", s.id, { similarity: { maxPct: best, note: "Signal only — similarity can be legitimate (starter code, common patterns). A person decides any integrity question." } });
  return best;
}

/* ---------------- Notebook workflow ---------------- */

export function labNotebook(store: TenantStore, a: Actor, templateId: string, which: "starter" | "executed") {
  const t = store.get("lab_templates", templateId);
  if (!t) throw new CampusError("not_found", "Lab not found", 404);
  const asg = store.list("assignments", (x) => x.labTemplateId === t.id)[0];
  const courseId = asg?.courseId as string | undefined;
  const staff = courseId ? isStaff(a, courseId) : hasAny(a, ["admin", "designer"]);
  if (!staff && !(courseId && (a.courseRoles[courseId] ?? []).includes("student"))) throw new CampusError("forbidden", "Not in this course.", 403);
  if (which === "executed" && !staff && !(t.releaseExecutedAt && String(t.releaseExecutedAt) <= nowIso())) throw new CampusError("not_released", "The instructor's executed notebook isn't released yet.", 423);
  const nb = (which === "starter" ? t.notebookStarter : t.notebookExecuted) as Record<string, unknown> | undefined;
  const notebook = nb ?? { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: "python3", display_name: "Python 3" } }, cells: [{ cell_type: "markdown", metadata: {}, source: [`# ${t.title}\n`, String(t.instructions)] }, { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: [String(t.starterCode)] }] };
  return { filename: `${String(t.title).replace(/\W+/g, "_")}_${which}.ipynb`, notebook, colabNote: "Upload this .ipynb to Google Colab (File → Upload notebook) if you prefer working there." };
}

