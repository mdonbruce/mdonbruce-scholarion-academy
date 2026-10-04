import { broker, CampusError, metrics, nowIso, sha256, type Row, type TenantStore } from "../core";
import { addPublishCheck } from "../entity";
import { hasAny, type Actor } from "../iam";
import { auditAi, classifyFor } from "./ai";
import { audit, requireTenant, userName } from "./common";

/**
 * Proctored Assessment Support (Tab 49).
 *
 * The setup assistant explains testing-environment expectations using only approved
 * talking points (published rows in `proctor_talking_points`, with the institution's
 * placeholders filled from `proctor_settings`). It never makes policy: exceptions,
 * accommodation decisions, incidents and anything it has no approved answer for are
 * escalated to people as a Help Desk ticket with the expected response time. Students
 * are never asked for ID photos or medical details, and the question log is redacted.
 *
 * Proctored quizzes require the pre-test checklist before an attempt can start.
 */

export const EXPECTATIONS = [
  "Bring a current, government-issued photo ID. Expired IDs can't be accepted.",
  "Keep a webcam view that clearly shows your face, hands and workspace for the entire assessment.",
  "Keep your microphone on.",
  "Remove unapproved devices from the testing area, and don't play music.",
  "Don't use head- or facial-movement mouse-control software (unless approved through the accommodations process).",
  "Don't wear smart glasses.",
  "Don't copy or paste assessment content.",
  "Wear appropriate attire.",
];

export const FOCUS = [
  { key: "webcam", label: "Webcam view", text: "Your face, hands and workspace need to stay clearly visible throughout testing." },
  { key: "id", label: "Valid ID", text: "Your government-issued photo ID must be current (not expired)." },
  { key: "area", label: "Testing area", text: "Unapproved devices need to be removed from your testing area." },
];

export const NOT_CHANGING = [
  "You can still use features built into the testing platform when they're available, including highlighting.",
  "The full Assessment Policy remains the source of truth for requirements and exceptions.",
];

export const CHECKLIST = [
  { key: "id", label: "Current government-issued photo ID ready" },
  { key: "webcam", label: "Webcam shows face, hands and workspace (raise it with a stand or tripod if needed)" },
  { key: "mic", label: "Microphone on and working" },
  { key: "devices", label: "Unapproved devices removed; no music" },
  { key: "glasses_mouse", label: "No smart glasses; no head/face-movement mouse control (unless approved through accommodations)" },
  { key: "attire", label: "Appropriate attire" },
  { key: "system", label: "System check completed before test day" },
];

export const STAFF_NOTES = [
  "Review this guidance before student messaging begins.",
  "Share only approved talking points.",
  "Reinforce expectations through normal student support channels (chat, email, course announcements, tutoring sessions).",
  "Send unresolved questions to the escalation team for consistent follow-up.",
  "Review the full Assessment Policy.",
];

export const DEFAULT_TALKING_POINTS: { key: string; question: string; answer: string; triggers: string[]; escalate?: boolean }[] = [
  {
    key: "webcam_position",
    question: "Where should I put my webcam?",
    answer: "You'll need a webcam view that clearly shows your face, hands, and workspace for the whole assessment. Depending on your setup, you may need to raise the camera using a tripod, stand, or another stable method. It's a good idea to test your camera position before test day so you can adjust it without pressure.",
    triggers: ["webcam", "camera", "cam", "tripod", "angle", "hands visible", "show my hands", "workspace"],
  },
  {
    key: "highlighting",
    question: "Can I highlight assessment content without an approved accommodation?",
    answer: "Yes. You can highlight assessment content when highlighting is available as an approved tool in the testing platform. Copying or pasting assessment content isn't allowed.",
    triggers: ["highlight", "highlighter", "copy", "paste", "built-in tool", "platform tool"],
  },
  {
    key: "rules_changed",
    question: "The rules seem different from before. Did something change?",
    answer: "I understand this may feel different from past testing experiences. The expectations for webcam placement and valid ID were already part of the Assessment Policy, and {{INSTITUTION}} is now applying them more consistently to help prevent test-day delays and protect assessment integrity. Other updates are being added to better protect the assessment experience for all students.",
    triggers: ["different", "changed", "change", "used to", "new rule", "new rules", "never had to", "last time", "why are"],
  },
  {
    key: "id_expired",
    question: "My ID is expired / about to expire. What should I do?",
    answer: "Expired IDs can't be accepted on test day, so please bring a current, government-issued photo ID. If you won't have a current ID before your scheduled assessment, contact {{ESCALATION_TEAM}} through {{SUPPORT_CHANNEL}} as soon as possible so they can advise you on next steps.",
    triggers: ["expired", "expire", "expiring", "renew", "id card", "my id", "license", "licence", "passport", "photo id", "identification"],
  },
  {
    key: "phone_nearby",
    question: "Can I keep my phone nearby?",
    answer: "Unapproved devices need to be removed from your testing area. Please check the Assessment Policy ({{ASSESSMENT_POLICY_LINK}}) for which items are approved.",
    triggers: ["phone", "smartphone", "tablet", "smartwatch", "watch", "second monitor", "device", "devices", "headphones", "earbuds", "music", "smart glasses", "glasses"],
  },
];

export interface ProctorSettings {
  institution: string;
  assessmentPolicyUrl: string;
  accommodationsUrl: string;
  accessibilityOffice: string;
  escalationTeam: string;
  supportChannel: string;
  escalationMethod: string;
  responseSla: string;
}

export function proctorSettings(store: TenantStore): ProctorSettings {
  const row = store.list("proctor_settings")[0];
  const t = broker.tenant(store.tenantId);
  const slug = t?.slug ?? "school";
  return {
    institution: String(row?.institution ?? t?.name ?? "your school"),
    assessmentPolicyUrl: String(row?.assessmentPolicyUrl ?? `https://${slug}.scholarion.test/policies/assessment`),
    accommodationsUrl: String(row?.accommodationsUrl ?? `https://${slug}.scholarion.test/accessibility/accommodations`),
    accessibilityOffice: String(row?.accessibilityOffice ?? "the Accessibility Services office"),
    escalationTeam: String(row?.escalationTeam ?? "Academic Delivery"),
    supportChannel: String(row?.supportChannel ?? "the Help Desk"),
    escalationMethod: String(row?.escalationMethod ?? "a Help Desk ticket"),
    responseSla: String(row?.responseSla ?? "within 1 business day"),
  };
}

const PLACEHOLDERS: Record<string, keyof ProctorSettings> = {
  INSTITUTION: "institution",
  ASSESSMENT_POLICY_LINK: "assessmentPolicyUrl",
  ACCOMMODATIONS_LINK: "accommodationsUrl",
  ACCESSIBILITY_OFFICE: "accessibilityOffice",
  ESCALATION_TEAM: "escalationTeam",
  SUPPORT_CHANNEL: "supportChannel",
  ESCALATION_METHOD: "escalationMethod",
  RESPONSE_SLA: "responseSla",
};

export function fillPlaceholders(text: string, s: ProctorSettings) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => (PLACEHOLDERS[k] ? s[PLACEHOLDERS[k]] : m));
}

/** Wording the assistant must never use: punitive framing, suspicion, promises, criticism. */
const TONE_BLOCK = /\b(cheat\w*|suspect\w*|suspicio\w*|punish\w*|penalt\w*|caught|misconduct|violat\w*|you(?:'ll| will) (?:definitely|surely) be fine|guarantee\w*|promise\w*|stupid|ridiculous|exception (?:is |has been )?granted|i(?:'ll| will) (?:approve|waive|allow))\b/i;

export function toneIssues(text: string): string[] {
  const issues: string[] = [];
  const m = TONE_BLOCK.exec(text);
  if (m) issues.push(`Tone check: "${m[0]}" reads as punitive, suspicious or a promise. Keep answers supportive and policy-based.`);
  const unknown = [...text.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((x) => x[1]).filter((k) => !PLACEHOLDERS[k]);
  if (unknown.length) issues.push(`Unknown placeholder(s): ${unknown.join(", ")}.`);
  if (/\b(upload|send|attach)\b.{0,30}\b(photo|picture|scan|image)\b/i.test(text)) issues.push("Talking points must not ask students to send photos of IDs, rooms or documents.");
  return issues;
}

addPublishCheck("proctor_talking_points", (_store, row) => toneIssues(`${row.question} ${row.answer}`));

/** Settings + approved talking points for a tenant (idempotent). */
export function ensureProctorDefaults(store: TenantStore) {
  if (!store.list("proctor_settings").length) {
    const t = broker.tenant(store.tenantId)!;
    const s = proctorSettings(store);
    store.insert("proctor_settings", { ...s, institution: t.name }, "pcs");
  }
  for (const tp of DEFAULT_TALKING_POINTS) {
    if (store.list("proctor_talking_points", (x) => x.key === tp.key).length) continue;
    store.insert("proctor_talking_points", { ...tp, escalate: !!tp.escalate, state: "published" }, "ptp");
  }
}

/* ---------------- The assistant ---------------- */

const RX = {
  content: /\b(answers?|solutions?|questions?)\b.{0,15}\b(to|on|for|from|in)\b.{0,10}\b(exam|test|assessment|quiz|midterm|final)\b|\bwhat(?:'s| is| will be) on the (exam|test|assessment|quiz|midterm|final)\b|\b(quote|paraphrase|reword)\b.{0,25}\b(question|exam|test|assessment)\b/i,
  upload: /\b(upload|send|attach|share|post)\b.{0,30}\b(photo|picture|pic|image|scan|selfie)\b|\b(photo|picture|pic|scan)\b.{0,15}\b(of )?(my )?(id|license|licence|passport|room|desk|workspace)\b.{0,30}\b(here|to you|check|look)\b/i,
  /** Disability-related needs: always routed to the accommodations process. */
  accommodation: /\b(disabilit\w*|disabled|assistive|head[- ]?(?:movement|tracking|tracker|mouse)|facial[- ]?(?:movement|tracking)|face[- ]?(?:tracking|movement)|eye[- ]?track\w*|screen ?reader|mobility|motor (?:impairment|condition)|can'?t use (?:a |my )?(?:hands|mouse|keyboard))\b/i,
  /** The word alone: routed to accommodations only when no approved answer fits. */
  accommodationWord: /\baccommodat\w*/i,
  incident: /\b(flag(?:ged)?|incident|investigat\w*|violation|accused|kicked (?:me )?out|disqualif\w*|invalidat\w*|dispute|appeal|my (?:score|result|grade)s? (?:was|were|got))\b/i,
  exception: /\b(exception|waive|waiver|exempt\w*|special permission|bypass|let me (?:use|keep|wear|have)|allow me to|can you (?:approve|allow|let))\b/i,
  future: /\b(will|going to|plan(?:ning)? to|next (?:term|year|semester)|in the future|eventually)\b.{0,40}\b(change|policy|polic(?:ies)|rules?|allow|ban)\w*/i,
  technical: /\b(no way to|can'?t|cannot|unable to|don'?t (?:have|own))\b.{0,30}\b(position|raise|move|mount|webcam|camera|tripod|stand|microphone|mic)\b/i,
  urgent: /\b(tomorrow|today|tonight|this week|in (?:a|one|two|three|\d+) days?|few days|this weekend|in an hour|right now)\b/i,
  setup: /\b(set ?up|prepare|ready|checklist|what do i need|requirements?|expectations?|rules|before (?:the|my) (?:exam|test|assessment)|testing (?:area|environment|room))\b/i,
};

export type ProctorIntent = "prompt_injection" | "assessment_content" | "photo_upload" | "accommodations" | "incident" | "exception" | "future_policy" | "talking_point" | "setup" | "unanswered";
export interface ProctorReply {
  /** Logged question id (the reply can be shown again to the same person). */
  id: string;
  intent: ProctorIntent;
  decision: "answered" | "focus" | "accommodations" | "escalated" | "boundary" | "refused";
  text: string;
  talkingPointKey: string | null;
  focus: typeof FOCUS | null;
  checklist: typeof CHECKLIST | null;
  policyLink: string;
  escalation: null | { ticketId: string; team: string; responseTime: string; reason: string };
  disclosure: string;
}

const DISCLOSURE = "Setup assistant — shares approved guidance only. The full Assessment Policy is the source of truth; people on the assessment team handle exceptions and accommodations.";

/** Remove things that could identify a person before logging (emails, phone/ID-like numbers). */
export function redact(q: string) {
  return q
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/\b(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}\b/gi, "[number]")
    .slice(0, 500);
}

function words(s: string) {
  return ` ${s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ")} `;
}

function matchTalkingPoint(store: TenantStore, q: string): Row | undefined {
  const w = words(q);
  let best: { row: Row; score: number } | undefined;
  for (const tp of store.list("proctor_talking_points", (x) => x.state === "published")) {
    const triggers = ((tp.triggers as string[]) ?? []).map((t) => t.toLowerCase());
    const score = triggers.reduce((n, t) => n + (w.includes(` ${t.trim()} `) ? Math.max(1, t.trim().split(" ").length) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { row: tp, score };
  }
  return best?.row;
}

function escalateTicket(store: TenantStore, a: Actor, q: string, reason: string, s: ProctorSettings) {
  const reasonLabel: Record<string, string> = {
    exception: "Exception request",
    incident: "Prior testing incident / result",
    accommodations: "Accommodations question (time-sensitive)",
    technical_limitation: "Technical limitation (webcam / microphone)",
    expired_id_near_test: "Expired ID close to test day",
    unanswered: "Question without an approved answer",
    talking_point: "Follow-up requested by talking point",
  };
  const tk = store.insert("tickets", {
    requesterId: a.id,
    subject: `Proctored assessment: ${reasonLabel[reason] ?? reason}`,
    body: `${redact(q)}\n\n— Forwarded by the proctored-assessment setup assistant to ${s.escalationTeam} for consistent follow-up. No ID images or medical details were collected.`,
    category: "assessment",
    tier: "2",
    status: "open",
  }, "tkt");
  store.emit("tickets.created", `tickets/${tk.id}`, { id: tk.id });
  metrics.inc("proctor_escalations_total", { reason });
  return tk;
}

/** One assistant turn. Only approved talking points; anything else escalates to people. */
export function proctorAsk(store: TenantStore, a: Actor, question: string): ProctorReply {
  const q = String(question ?? "").trim().slice(0, 1000);
  if (!q) throw new CampusError("invalid", "Ask a question about your testing setup.", 422);
  if (a.masqueradedBy) throw new CampusError("forbidden", "The setup assistant isn't available while acting as another user.", 403);
  const s = proctorSettings(store);
  const policyLink = s.assessmentPolicyUrl;
  const base = { talkingPointKey: null, focus: null, checklist: null, policyLink, escalation: null, disclosure: DISCLOSURE };
  const fill = (t: string) => fillPlaceholders(t, s);

  // Governed agent: must be enabled with an evaluated policy; shared refusals (injection, others' data, grades).
  const shared = classifyFor(store, "proctor_setup", q);
  let reply: Omit<ProctorReply, "escalation" | "id"> & { escalate?: string };
  if (shared && shared.category !== "academic_integrity") {
    reply = { ...base, intent: "prompt_injection", decision: "refused", text: shared.category === "prompt_injection" ? "I can only share the approved guidance for proctored-assessment setup. What would you like to know about your testing setup?" : shared.message };
  } else if (RX.content.test(q)) {
    reply = { ...base, intent: "assessment_content", decision: "boundary", text: "I can't share, quote or discuss assessment content. I'm happy to help with your testing setup — your webcam view, ID or testing area." };
  } else if (RX.upload.test(q)) {
    reply = { ...base, intent: "photo_upload", decision: "boundary", text: `Please don't send photos of your ID, room or documents here — this channel doesn't collect them. I can explain what's expected, and the full Assessment Policy is here: ${policyLink}.` };
  } else if (RX.accommodation.test(q)) {
    const urgent = RX.urgent.test(q);
    reply = {
      ...base,
      intent: "accommodations",
      decision: urgent ? "escalated" : "accommodations",
      text: fill(`Thanks for letting me know. Head- or facial-movement mouse-control software and other setups the expectations would affect can only be used when they're approved through the accommodations process. If you rely on assistive technology, please contact {{ACCESSIBILITY_OFFICE}} through {{ACCOMMODATIONS_LINK}} and request support well before your assessment date. You don't need to share any medical details with me.`),
      escalate: urgent ? "accommodations" : undefined,
    };
  } else if (RX.incident.test(q)) {
    reply = { ...base, intent: "incident", decision: "escalated", text: fill("I'm sorry that experience was stressful. I can't discuss specific testing incidents, flags or results, so I'm forwarding your message to {{ESCALATION_TEAM}} for consistent follow-up."), escalate: "incident" };
  } else if (RX.exception.test(q)) {
    reply = { ...base, intent: "exception", decision: "escalated", text: fill("I can't grant exceptions or change requirements, but I've forwarded your request to {{ESCALATION_TEAM}} so they can review it and advise you."), escalate: "exception" };
  } else if (RX.future.test(q)) {
    reply = { ...base, intent: "future_policy", decision: "boundary", text: `I can't speak to future policy changes. The current requirements are in the full Assessment Policy: ${policyLink}.` };
  } else {
    const tp = matchTalkingPoint(store, q);
    if (tp) {
      const technical = RX.technical.test(q);
      const idUrgent = tp.key === "id_expired" && RX.urgent.test(q);
      const esc = technical ? "technical_limitation" : idUrgent ? "expired_id_near_test" : tp.escalate ? "talking_point" : undefined;
      reply = { ...base, intent: "talking_point", decision: esc ? "escalated" : "answered", talkingPointKey: String(tp.key), text: fill(String(tp.answer)), escalate: esc };
    } else if (RX.accommodationWord.test(q)) {
      const urgent = RX.urgent.test(q);
      reply = {
        ...base,
        intent: "accommodations",
        decision: urgent ? "escalated" : "accommodations",
        text: fill("Accommodations are decided through the accommodations process, not by this assistant. Please contact {{ACCESSIBILITY_OFFICE}} through {{ACCOMMODATIONS_LINK}} and request support well before your assessment date. You don't need to share any medical details with me."),
        escalate: urgent ? "accommodations" : undefined,
      };
    } else if (RX.setup.test(q)) {
      reply = {
        ...base,
        intent: "setup",
        decision: "focus",
        focus: FOCUS,
        checklist: CHECKLIST,
        text: ["Here's what matters most for your testing setup:", ...FOCUS.map((f) => `• ${f.label}: ${f.text}`), "Clear expectations help avoid delays and interruptions on test day. A quick pre-test checklist is below.", `Full details: ${policyLink}`].join("\n"),
      };
    } else if (RX.technical.test(q)) {
      reply = { ...base, intent: "talking_point", decision: "escalated", text: fill("Thanks for flagging that early. Your webcam needs to show your face, hands and workspace for the whole assessment. I've forwarded your setup question to {{ESCALATION_TEAM}} so they can advise you on next steps."), escalate: "technical_limitation" };
    } else {
      reply = { ...base, intent: "unanswered", decision: "escalated", text: fill("That's a good question, and I don't have an approved answer for it. I've forwarded it to {{ESCALATION_TEAM}} for consistent follow-up.") , escalate: "unanswered" };
    }
  }

  // Tone guard on everything that leaves the assistant (defence in depth; talking points are checked at publish).
  if (toneIssues(reply.text).length) {
    reply = { ...base, intent: "unanswered", decision: "escalated", text: fill("I don't have an approved answer I can share for that. I've forwarded it to {{ESCALATION_TEAM}} for consistent follow-up."), escalate: "unanswered" };
  }

  let escalation: ProctorReply["escalation"] = null;
  let logId = "";
  const { escalate: escReason, ...rest } = reply;
  const out = store.tx(() => {
    if (escReason) {
      const tk = escalateTicket(store, a, q, escReason, s);
      escalation = { ticketId: tk.id, team: s.escalationTeam, responseTime: s.responseSla, reason: escReason };
    }
    const esc = escalation as ProctorReply["escalation"];
    const text = esc ? `${reply.text}\nYou can expect a response ${esc.responseTime}. Reference: ${esc.ticketId}.` : reply.text;
    const result = { ...rest, text, escalation: esc };
    const row = store.insert("proctor_questions", { question: redact(q), intent: reply.intent, decision: reply.decision, talkingPointKey: reply.talkingPointKey, ticketId: esc?.ticketId ?? null, promotedTo: null, reply: JSON.stringify(result), askerHash: askerHash(store, a) }, "pq");
    logId = row.id;
    auditAi(store, a, "proctor_setup", redact(q), reply.intent, reply.decision, reply.talkingPointKey ? [`proctor_talking_points/${reply.talkingPointKey}`] : []);
    return result;
  });
  return { id: logId, ...out };
}

function askerHash(store: TenantStore, a: Actor) {
  return sha256(`${store.tenantId}:proctor:${a.id}`);
}

/** Show a reply again to the person who asked (the log stores no identity, only a one-way hash). */
export function proctorReply(store: TenantStore, a: Actor, id: string): ProctorReply {
  const row = store.get("proctor_questions", id);
  if (!row || row.askerHash !== askerHash(store, a) || typeof row.reply !== "string") throw new CampusError("not_found", "Reply not found", 404);
  return { id: row.id, ...(JSON.parse(row.reply) as Omit<ProctorReply, "id">) };
}

/* ---------------- Pre-test checklist ---------------- */

function proctoredQuiz(store: TenantStore, quizId: string) {
  const quiz = store.get("quizzes", quizId);
  if (!quiz || quiz.state !== "published") throw new CampusError("not_found", "Assessment not found", 404);
  if (!quiz.proctored) throw new CampusError("not_proctored", "This assessment isn't proctored, so no pre-test checklist is needed.", 409);
  return quiz;
}

export function readiness(store: TenantStore, a: Actor, quizId: string) {
  const quiz = proctoredQuiz(store, quizId);
  if (!hasAny(a, ["student", "instructor", "ta", "admin"], quiz.courseId as string)) throw new CampusError("forbidden", "You're not in that course.", 403);
  const row = store.list("proctor_readiness", (r) => r.quizId === quizId && r.userId === a.id)[0];
  const done = new Set((row?.checks as string[]) ?? []);
  return {
    quizId,
    quizTitle: String(quiz.title),
    items: CHECKLIST.map((c) => ({ ...c, done: done.has(c.key) })),
    complete: !!row?.complete,
    completedAt: (row?.completedAt as string) ?? null,
    expectations: EXPECTATIONS,
    notChanging: NOT_CHANGING,
    policyLink: proctorSettings(store).assessmentPolicyUrl,
  };
}

export function saveReadiness(store: TenantStore, a: Actor, quizId: string, checks: string[]) {
  const quiz = proctoredQuiz(store, quizId);
  if (!hasAny(a, ["student"], quiz.courseId as string)) throw new CampusError("forbidden", "Only students taking this assessment complete its checklist.", 403);
  if (a.masqueradedBy) throw new CampusError("forbidden", "Students confirm their own checklist.", 403);
  const valid = new Set(CHECKLIST.map((c) => c.key));
  const picked = [...new Set(checks.filter((c) => valid.has(c)))];
  const complete = picked.length === CHECKLIST.length;
  store.tx(() => {
    const row = store.list("proctor_readiness", (r) => r.quizId === quizId && r.userId === a.id)[0];
    const values = { checks: picked, complete, completedAt: complete ? (row?.completedAt as string) ?? nowIso() : null };
    if (row) store.update("proctor_readiness", row.id, values);
    else store.insert("proctor_readiness", { courseId: quiz.courseId, userId: a.id, quizId, ...values }, "prd");
    audit(store, a, "proctor.readiness", `quizzes/${quizId}`, complete ? "complete" : `${picked.length}/${CHECKLIST.length}`);
  });
  return readiness(store, a, quizId);
}

/** Proctored quizzes a learner can see, with their checklist status. */
export function myProctoredAssessments(store: TenantStore, a: Actor) {
  return store
    .list("quizzes", (q) => !!q.proctored && q.state === "published" && (a.courseRoles[q.courseId as string] ?? []).includes("student"))
    .map((q) => {
      const r = store.list("proctor_readiness", (x) => x.quizId === q.id && x.userId === a.id)[0];
      return { quizId: q.id, title: String(q.title), courseId: String(q.courseId), availableFrom: (q.availableFrom as string) ?? null, checked: ((r?.checks as string[]) ?? []).length, of: CHECKLIST.length, complete: !!r?.complete };
    });
}

/* ---------------- Staff ---------------- */

const STAFF_ROLES = ["admin", "support", "advisor", "instructor", "ta"] as const;

function requireStaff(a: Actor) {
  if (!hasAny(a, [...STAFF_ROLES]) && !Object.values(a.courseRoles).some((r) => r.includes("instructor") || r.includes("ta"))) throw new CampusError("forbidden", "Staff only.", 403);
}

/** Staff guidance: expectations, focus, what isn't changing, approved answers and staff notes. */
export function staffGuide(store: TenantStore, a: Actor) {
  requireStaff(a);
  const s = proctorSettings(store);
  return {
    settings: s,
    expectations: EXPECTATIONS,
    focus: FOCUS,
    notChanging: NOT_CHANGING,
    approvedAnswers: store.list("proctor_talking_points", (x) => x.state === "published").map((x) => ({ key: x.key, question: x.question, answer: fillPlaceholders(String(x.answer), s) })),
    checklist: CHECKLIST,
    staffNotes: STAFF_NOTES.map((n) => (n.startsWith("Review the full") ? `${n} ${s.assessmentPolicyUrl}` : n.replace("the escalation team", s.escalationTeam))),
  };
}

/** Question volume, escalations, readiness completion and questions awaiting an approved answer. */
export function proctorOverview(store: TenantStore, a: Actor) {
  requireStaff(a);
  const log = store.list("proctor_questions");
  const by = (k: string) => log.reduce<Record<string, number>>((m, r) => ((m[String(r[k])] = (m[String(r[k])] ?? 0) + 1), m), {});
  const isAdminish = hasAny(a, ["admin", "support"]);
  const quizzes = store.list("quizzes", (q) => !!q.proctored && q.state === "published" && (isAdminish || (a.courseRoles[q.courseId as string] ?? []).some((r) => r === "instructor" || r === "ta")));
  const readinessByQuiz = quizzes.map((q) => {
    const students = store.list("enrollments", (e) => e.courseId === q.courseId && e.role === "student" && e.state === "active").length;
    const complete = store.list("proctor_readiness", (r) => r.quizId === q.id && !!r.complete).length;
    return { quizId: q.id, title: String(q.title), students, complete, pct: students ? Math.round((complete / students) * 100) : 0 };
  });
  return {
    questions: log.length,
    byIntent: by("intent"),
    byDecision: by("decision"),
    escalations: log.filter((r) => r.ticketId).length,
    readiness: readinessByQuiz,
    awaitingApprovedAnswer: isAdminish ? log.filter((r) => r.intent === "unanswered" && !r.promotedTo).map((r) => ({ id: r.id, question: r.question, ticketId: r.ticketId, at: r.createdAt })) : [],
  };
}

/** Turn a logged question into a draft talking point; an admin reviews and publishes it. */
export function promoteQuestion(store: TenantStore, a: Actor, logId: string, input: { key: string; answer: string; triggers: string[]; question?: string }) {
  requireTenant(store, a, ["admin", "support"], "proctor.promote");
  const row = store.get("proctor_questions", logId);
  if (!row) throw new CampusError("not_found", "Logged question not found", 404);
  if (row.promotedTo) throw new CampusError("conflict", "This question already has a draft talking point.", 409);
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!key) throw new CampusError("invalid", "Give the talking point a key.", 422);
  if (store.list("proctor_talking_points", (x) => x.key === key).length) throw new CampusError("conflict", "That key is already used.", 409);
  const issues = toneIssues(input.answer);
  if (issues.length) throw new CampusError("tone", issues.join(" "), 422);
  return store.tx(() => {
    const tp = store.insert("proctor_talking_points", { key, question: input.question?.trim() || String(row.question), answer: input.answer.trim(), triggers: input.triggers.map((t) => t.toLowerCase()), escalate: false, state: "draft" }, "ptp");
    store.update("proctor_questions", logId, { promotedTo: tp.id });
    audit(store, a, "proctor.promote", `proctor_talking_points/${tp.id}`, `from ${logId}`);
    return { talkingPoint: tp, note: `Draft created by ${userName(store, a.id)}. An admin reviews and publishes it before the assistant uses it.` };
  });
}
