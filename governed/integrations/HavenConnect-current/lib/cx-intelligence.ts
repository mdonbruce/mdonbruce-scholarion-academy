export type Guidance = { id: string; title: string; content: string; domain: string; status: string; source?: string };
export type Row = Record<string, any>;

const topics = [
  { intent: "Admissions & registration", persona: "Amara", department: "Student services", terms: /admission|apply|application|enroll|register|registration|course|transcript|grade|tuition|financial aid/i },
  { intent: "Billing & accounts", persona: "Alex", department: "Finance", terms: /bill|payment|refund|invoice|charge|account|loan|card/i },
  { intent: "Technical support", persona: "Kyle", department: "IT support", terms: /login|password|error|technical|device|access|software|connection/i },
];
/** D1 datetime("now") values are UTC without a zone marker. */
export const toMs = (value: unknown) => { const s = String(value || ""); if (!s) return NaN; return Date.parse(/[TZ+]/.test(s.slice(10)) ? s : s.replace(" ", "T") + "Z"); };
export const INTENTS = ["Admissions & registration", "Billing & accounts", "Technical support", "General support"];

export function classify(text: string) {
  const topic = topics.find(t => t.terms.test(text)) || { intent: "General support", persona: "Amara", department: "Support" };
  const urgent = /urgent|emergency|locked out|fraud|security breach|cannot access|deadline today/i.test(text);
  const sensitive = /medical|diagnos|patient|ssn|social security|card number|bank account|password|financial aid|grade/i.test(text);
  return { intent: topic.intent, persona: topic.persona, department: topic.department,
    priority: urgent ? "High" : "Normal", risk: sensitive ? "Sensitive" : "Standard",
    needsHuman: urgent || sensitive };
}

/** Classifier with staff corrections and routing rules applied on top of the base rules. */
export function classifyWith(text: string, opts: { labels?: Row[]; routing?: Row[] } = {}) {
  const base = classify(text);
  const lower = text.toLowerCase();
  const learned = (opts.labels || []).find(l => l.text && lower.includes(String(l.text).toLowerCase()));
  let result = { ...base, learned: false, rule: "" };
  if (learned && INTENTS.includes(learned.label)) {
    const t = topics.find(x => x.intent === learned.label);
    result = { ...result, intent: learned.label, persona: t?.persona || "Amara", department: t?.department || "Support", learned: true };
  }
  const rule = (opts.routing || []).find(r => r.intent === result.intent && r.status !== "Disabled");
  if (rule) {
    result = { ...result, persona: rule.persona || result.persona, department: rule.department || result.department, rule: rule.id || "rule" };
    if (rule.priority === "High") result.priority = "High";
  }
  return result;
}

/** Share of labeled examples the current classifier agrees with. Null when there is nothing to measure. */
export function classifierAccuracy(labels: Row[], routing: Row[] = []) {
  if (!labels.length) return null;
  const others = (i: number) => labels.filter((_, k) => k !== i);
  const hits = labels.filter((l, i) => classifyWith(String(l.text), { labels: others(i), routing }).intent === l.label).length;
  return Math.round(hits / labels.length * 100);
}

const tokens = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(t => !["the","and","for","with","from","this","that","what","how","can","does"].includes(t)) || []);

export function retrieveGuidance(query: string, articles: Guidance[], limit = 3) {
  const queryTokens = tokens(query);
  return articles.filter(a => a.status === "Approved").map(a => {
    const title = tokens(`${a.title} ${a.domain}`);
    const body = tokens(a.content);
    let score = 0;
    for (const token of queryTokens) score += (title.has(token) ? 3 : 0) + (body.has(token) ? 1 : 0);
    return { id: a.id, title: a.title, source: a.source || "Internal guidance", excerpt: a.content.slice(0, 500), score };
  }).filter(a => a.score > 0).sort((a,b) => b.score - a.score).slice(0, limit);
}

export function planFlow(steps: string[]) {
  const external = /\b(send|email|sms|call|payment|charge|refund|register|enroll|update|delete|create|book|schedule|api|database|webhook|transfer)\b/i;
  return steps.map((label, index) => ({ index: index + 1, label, mode: external.test(label) ? "Approval and connector required" : "Staff checklist" }));
}

/** Removes regulated identifiers before text leaves HavenConnect for an AI provider. */
export function redact(text: string, rules: Record<string, boolean> = { PII: true, PCI: true, PHI: true, FERPA: true }) {
  let s = String(text ?? "");
  if (rules.PCI !== false) s = s.replace(/\b(?:\d[ -]?){13,19}\b/g, "[card removed]");
  if (rules.PII !== false) s = s
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/(?<![\d+])\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]?\d{3}[ .-]?\d{3,4}(?!\d)/g, "[phone removed]");
  if (rules.PHI !== false) s = s.replace(/\b(diagnos\w*|prescription|medication|patient record)\b[^.\n]*/gi, "[health detail removed]");
  if (rules.FERPA !== false) s = s.replace(/\b(student id|student number)\s*[:#]?\s*\w+/gi, "[student ID removed]");
  return s;
}

export type GradeItem = { n: string; w: number; score: number | null; scholarisComponentId?: string };
export function gradeTotal(items: GradeItem[]) {
  const graded = items.filter(i => typeof i.score === "number");
  const weight = graded.reduce((a, i) => a + i.w, 0);
  if (!weight) return null;
  return Math.round(graded.reduce((a, i) => a + (i.score as number) * i.w, 0) / weight * 10) / 10;
}
export const letter = (t: number | null) => t === null ? "—" : t >= 90 ? "A" : t >= 80 ? "B" : t >= 70 ? "C" : t >= 60 ? "D" : "F";
export const gradeComplete = (items: GradeItem[]) => items.length > 0 && items.every(i => typeof i.score === "number" && i.score >= 0 && i.score <= 100);

export function prerequisiteMet(course: Row, completed: string[] = []) {
  const pre = String(course.prereq || "").trim();
  return !pre || completed.map(c => c.toUpperCase()).includes(pre.toUpperCase());
}

export const STAGES = ["Inquiry", "Applied", "Documents", "Decision", "Enrolled"];
export function canAdvance(applicant: Row, to: string) {
  if (!STAGES.includes(to)) return { ok: false, reason: "Unknown stage" };
  const missing = Object.entries(applicant.docs || {}).filter(([, v]) => !v).map(([k]) => k);
  if ((to === "Decision" || to === "Enrolled") && missing.length) return { ok: false, reason: `Missing: ${missing.join(", ")}` };
  return { ok: true, reason: "" };
}

/** Alerts derived from recorded data. Nothing here is estimated. */
export function deriveAlerts(records: Row[], events: Row[], now = Date.now(), slaHours = 4) {
  const out: Row[] = [];
  const handoffs = new Set(events.filter(e => e.type === "handoff.requested").map(e => e.sessionId));
  for (const s of records.filter(r => r.kind === "session" && r.status === "Open")) {
    const started = toMs(s.startedAt || s.updatedAt);
    const hours = started ? (now - started) / 3600000 : 0;
    if (hours > slaHours) out.push({ key: `sla:${s.id}`, severity: s.priority === "High" ? "Critical" : "Major", issue: "SLA breach", title: `${s.subject} open ${Math.floor(hours)}h`, sessionId: s.id, at: s.startedAt });
    if (handoffs.has(s.id)) out.push({ key: `handoff:${s.id}`, severity: "Major", issue: "Human handoff", title: `${s.subject} is waiting for staff`, sessionId: s.id, at: s.updatedAt });
    else if (s.needsHuman) out.push({ key: `review:${s.id}`, severity: s.priority === "High" ? "Critical" : "Major", issue: "Review required", title: `${s.subject} flagged ${s.risk === "Sensitive" ? "sensitive" : "urgent"}`, sessionId: s.id, at: s.updatedAt });
  }
  const gaps = events.filter(e => e.type === "ticket.triaged" && e.details?.knowledgeGap);
  const byIntent: Record<string, number> = {};
  for (const g of gaps) byIntent[g.details?.intent || "General support"] = (byIntent[g.details?.intent || "General support"] || 0) + 1;
  for (const [intent, n] of Object.entries(byIntent)) out.push({ key: `gap:${intent}`, severity: n >= 5 ? "Major" : "Minor", issue: "Knowledge gap", title: `${n} ${intent} questions had no approved answer`, at: gaps[0]?.createdAt });
  for (const r of records.filter(r => (r.kind === "knowledge" || r.kind === "flow") && r.status === "Draft")) out.push({ key: `draft:${r.id}`, severity: "Event", issue: "Awaiting approval", title: `${r.kind === "flow" ? "Autoflow" : "Article"} “${r.name || r.title}” needs approval`, at: r.updatedAt });
  for (const g of records.filter(r => r.kind === "grade" && r.status === "Pending approval")) out.push({ key: `grade:${g.id}`, severity: "Major", issue: "Grade approval", title: `Grades for ${g.section} await approval`, at: g.updatedAt });
  for (const g of records.filter(r => r.kind === "grade" && r.lms?.status === "Failed")) out.push({ key: `lms:${g.id}`, severity: "Critical", issue: "Scholaris sync failed", title: `${g.section}: ${g.lms?.error || "Scholaris Global Learning rejected the grade"}`, at: g.lms?.at });
  return out;
}

/** KPIs from recorded sessions and events. A null value means there is not enough data to report it. */
export function computeKpis(records: Row[], events: Row[]) {
  const sessions = records.filter(r => r.kind === "session");
  const resolved = sessions.filter(s => s.status === "Resolved");
  const handoffs = new Set(events.filter(e => e.type === "handoff.requested").map(e => e.sessionId));
  const ratings = events.filter(e => e.type === "feedback.recorded").map(e => Number(e.details?.score)).filter(n => n >= 1 && n <= 5);
  const triaged = events.filter(e => e.type === "ticket.triaged");
  const gaps = triaged.filter(e => e.details?.knowledgeGap);
  const first = (id: string, type: string) => events.filter(e => e.sessionId === id && e.type === type).map(e => toMs(e.createdAt)).sort((a, b) => a - b)[0];
  const responseMins = sessions.map(s => { const a = first(s.id, "message.received"), b = first(s.id, "message.sent"); return a && b && b >= a ? (b - a) / 60000 : null; }).filter((x): x is number => x !== null);
  return {
    open: sessions.filter(s => s.status === "Open").length,
    resolved: resolved.length,
    fcr: resolved.length ? Math.round(resolved.filter(s => !handoffs.has(s.id)).length / resolved.length * 100) : null,
    csat: ratings.length ? Math.round(ratings.filter(n => n >= 4).length / ratings.length * 100) : null,
    ratings: ratings.length,
    handoffs: handoffs.size,
    liveSync: events.filter(e => e.type === "livesync.confirmed").length,
    triaged: triaged.length,
    gaps: gaps.length,
    coverage: triaged.length ? Math.round((triaged.length - gaps.length) / triaged.length * 100) : null,
    firstResponseMin: responseMins.length ? Math.round(responseMins.reduce((a, b) => a + b, 0) / responseMins.length * 10) / 10 : null,
    aiDrafts: events.filter(e => e.type === "ai.generated").length,
  };
}

/** Daily counts for the last `days` days from events of the given types. */
export function dailySeries(events: Row[], types: string[], days = 7, now = Date.now()) {
  const out: { label: string; value: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now - d * 86400000); const key = day.toISOString().slice(0, 10);
    out.push({ label: day.toLocaleDateString("en-US", { weekday: "short" }), value: events.filter(e => types.includes(e.type) && String(e.createdAt).slice(0, 10) === key).length });
  }
  return out;
}

/** Clearly labeled sample records for a staging workspace. Every payload carries sample: true. */
export function sampleData(instructorEmail = "") {
  const comps = [["Module 1 · SecureTech lab", 10], ["Module 3 · Firewalls", 15], ["Module 5 · Northstar VPN activity", 15], ["Midterm", 25], ["Final project", 35]] as const;
  const courses = [
    { code: "CTS2314-01", name: "Network Security", instructor: "Instructor of record", instructorEmail, cap: 28, enrolled: 3, wait: 0, prereq: "CTS1134", days: "Mon/Wed 18:00", mode: "Hybrid" },
    { code: "CTS1134-02", name: "Networking Technologies", instructor: "Dr. Pooja Iyer", instructorEmail: "", cap: 3, enrolled: 3, wait: 1, prereq: "", days: "Tue/Thu 10:00", mode: "Online" },
    { code: "CIS3360-01", name: "Security in Computing", instructor: "Dr. Rajiv Mehta", instructorEmail: "", cap: 30, enrolled: 1, wait: 0, prereq: "CTS2314", days: "Online async", mode: "Online" },
  ];
  const students = [
    { name: "Priya Nair", reference: "S1042", program: "AS Network Security", year: 2, advisor: "Dr. Neha Sharma", sections: ["CTS2314-01"], completed: ["CTS1134"], holds: [], gpa: 3.62, status: "Active", scores: [92, 88, 90, 85, null] },
    { name: "Jasmine Carter", reference: "S1044", program: "AS Network Security", year: 2, advisor: "Dr. Neha Sharma", sections: ["CTS2314-01", "CTS1134-02"], completed: ["CTS1134"], holds: [], gpa: 3.18, status: "Active", scores: [81, 77, 84, 79, 82] },
    { name: "Miguel Alvarez", reference: "S1045", program: "BS Cybersecurity", year: 3, advisor: "Dr. Rajiv Mehta", sections: ["CTS2314-01", "CIS3360-01"], completed: ["CTS1134", "CTS2314"], holds: ["Balance due"], gpa: 2.91, status: "Active", scores: [70, 74, 68, 72, 75] },
    { name: "Ethan Brooks", reference: "S1047", program: "AS Network Security", year: 2, advisor: "Dr. Neha Sharma", sections: ["CTS1134-02"], completed: [], holds: [], gpa: 3.40, status: "Active", scores: [] },
    { name: "Hannah Kim", reference: "S1046", program: "AS Cloud Computing", year: 1, advisor: "Dr. Pooja Iyer", sections: ["CTS1134-02"], completed: [], holds: [], gpa: 3.87, status: "Active", scores: [] },
  ];
  const applicants = [
    { name: "Daniel Okafor", program: "Network Security Certificate", stage: "Documents", docs: { Application: true, Transcript: false, "ID verification": true, Essay: true } },
    { name: "Sofia Rossi", program: "AS Cloud Computing", stage: "Inquiry", docs: { Application: false, Transcript: false, "ID verification": false, Essay: false } },
    { name: "Kwame Mensah", program: "BS Cybersecurity", stage: "Applied", docs: { Application: true, Transcript: true, "ID verification": false, Essay: true } },
    { name: "Leah Goldberg", program: "AS Network Security", stage: "Decision", docs: { Application: true, Transcript: true, "ID verification": true, Essay: true } },
  ];
  const faculty = [
    { name: "Dr. Neha Sharma", title: "Professor", dept: "Engineering", qual: "PhD", exp: 12, status: "Active", load: 12, pubs: 34 },
    { name: "Dr. Rajiv Mehta", title: "Associate Professor", dept: "Engineering", qual: "PhD", exp: 12, status: "Active", load: 9, pubs: 21 },
    { name: "Dr. Pooja Iyer", title: "Assistant Professor", dept: "Science", qual: "M.Phil", exp: 6, status: "Active", load: 15, pubs: 8 },
    { name: "Prof. Laura Chen", title: "Lecturer", dept: "Commerce", qual: "Masters", exp: 4, status: "On leave", load: 0, pubs: 3 },
  ];
  const knowledge = [
    { title: "Registering for courses", domain: "Admissions", source: "Registrar handbook (sample)", status: "Approved", content: "Students register through the student portal. Prerequisites are checked automatically. Full sections offer a waitlist. The Scholaris Global Learning classroom appears within two hours of registration." },
    { title: "Resetting your password", domain: "Technical", source: "IT help center (sample)", status: "Approved", content: "Use Forgot password on the sign-in page. Reset links expire after 30 minutes. If the email does not arrive, check spam and confirm the address on file." },
    { title: "Changing a hotel booking", domain: "Support", source: "Oak Haven front desk policy (sample)", status: "Approved", content: "Bookings can be moved without charge up to 48 hours before check-in, subject to availability. Staff confirm every change in writing." },
  ];
  const flows = [
    { name: "Course registration", trigger: "Admissions & registration", status: "Approved", requiresApproval: true, steps: ["Verify student identity", "Check prerequisites", "Register student in section", "Confirm Scholaris classroom access"],
      nodes: [["trigger", "Trigger", "Intent = registration"], ["verify", "Verify identity", "SSO or date of birth"], ["cond", "Prerequisites met?", "Transcript rule"], ["api", "Register in section", "SIS enrollment"], ["llm", "Confirm with student", "Brand voice"]] },
  ];
  const sessions = [
    { subject: "Course not showing in Scholaris", persona: "Amara", msgs: ["I registered for CTS2314 but it's not in my Scholaris classroom and class starts Monday — urgent"], resolve: false },
    { subject: "Password reset email missing", persona: "Kyle", msgs: ["My password reset email isn't arriving"], reply: "I resent the link. It expires in 30 minutes, so please check spam too.", resolve: true, score: 5 },
    { subject: "Move my booking to Saturday", persona: "Amara", msgs: ["Can I move my Oak Haven booking from Friday to Saturday?"], reply: "Yes, Saturday is available at the same rate. I've noted the change for the front desk to confirm.", resolve: true, score: 4 },
    { subject: "Spring financial aid deadline", persona: "Amara", msgs: ["When is the FAFSA priority deadline for spring?"], resolve: false },
  ];
  return { comps, courses, students, applicants, faculty, knowledge, flows, sessions };
}
