import test from "node:test";
import assert from "node:assert/strict";
import { classifyWith, classifierAccuracy, redact, gradeTotal, gradeComplete, letter, prerequisiteMet, canAdvance, deriveAlerts, computeKpis, toMs, sampleData } from "../lib/cx-intelligence.ts";
import { aiStatus, parseJson } from "../lib/ai.ts";

test("staff corrections override the base classifier", () => {
  assert.equal(classifyWith("course not in my scholaris classroom").intent, "Admissions & registration");
  const r = classifyWith("Course not in Scholaris yet", { labels: [{ text: "not in scholaris", label: "Technical support" }] });
  assert.equal(r.intent, "Technical support");
  assert.equal(r.persona, "Kyle");
  assert.equal(r.learned, true);
});

test("routing rules change the specialist and can raise priority", () => {
  const r = classifyWith("I need a refund", { routing: [{ id: "r1", intent: "Billing & accounts", persona: "Amara", department: "Front desk", priority: "High" }] });
  assert.equal(r.persona, "Amara");
  assert.equal(r.department, "Front desk");
  assert.equal(r.priority, "High");
  assert.equal(classifyWith("I need a refund", { routing: [{ id: "r1", intent: "Billing & accounts", persona: "Amara", status: "Disabled" }] }).persona, "Alex");
});

test("classifier accuracy is null without labels and measured leave-one-out", () => {
  assert.equal(classifierAccuracy([]), null);
  assert.equal(classifierAccuracy([{ text: "refund please", label: "Billing & accounts" }, { text: "reset my password", label: "Technical support" }]), 100);
});

test("redaction removes card, email, phone and SSN before AI calls", () => {
  const out = redact("Card 4111 1111 1111 1111, email jane@example.com, phone +234 803 123 4567, SSN 123-45-6789");
  assert.ok(!/4111|jane@|803|123-45/.test(out), out);
  assert.equal(redact("card 4111111111111111", { PCI: false }), "card 4111111111111111");
});

test("grade totals use only graded components and completeness gates finalization", () => {
  const items = [{ n: "A", w: 50, score: 90 }, { n: "B", w: 50, score: null }];
  assert.equal(gradeTotal(items), 90);
  assert.equal(gradeComplete(items), false);
  assert.equal(gradeTotal([{ n: "A", w: 60, score: 80 }, { n: "B", w: 40, score: 100 }]), 88);
  assert.equal(letter(88), "B");
  assert.equal(letter(null), "—");
});

test("prerequisites and admissions stages are enforced", () => {
  assert.equal(prerequisiteMet({ prereq: "CTS1134" }, ["cts1134"]), true);
  assert.equal(prerequisiteMet({ prereq: "CTS2314" }, ["CTS1134"]), false);
  assert.equal(canAdvance({ docs: { Transcript: false } }, "Decision").ok, false);
  assert.equal(canAdvance({ docs: { Transcript: true } }, "Decision").ok, true);
});

test("alerts and KPIs come only from recorded data", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  const records = [
    { id: "s1", kind: "session", status: "Open", priority: "High", subject: "Locked out", startedAt: "2026-09-25T02:00:00Z" },
    { id: "s2", kind: "session", status: "Resolved", subject: "Reset", startedAt: "2026-09-25T11:00:00Z" },
    { id: "g1", kind: "grade", section: "CTS2314-01", status: "Pending approval" },
  ];
  const events = [
    { sessionId: "s2", type: "message.received", createdAt: "2026-09-25 11:00:00" },
    { sessionId: "s2", type: "message.sent", createdAt: "2026-09-25 11:06:00" },
    { sessionId: "s2", type: "feedback.recorded", details: { score: 5 }, createdAt: "2026-09-25 11:10:00" },
    { sessionId: "s1", type: "ticket.triaged", details: { intent: "Technical support", knowledgeGap: true }, createdAt: "2026-09-25 02:00:00" },
  ];
  const alerts = deriveAlerts(records, events, now, 4);
  assert.ok(alerts.some(a => a.key === "sla:s1" && a.severity === "Critical"));
  assert.ok(alerts.some(a => a.issue === "Grade approval"));
  assert.ok(alerts.some(a => a.issue === "Knowledge gap"));
  const k = computeKpis(records, events);
  assert.equal(k.fcr, 100); assert.equal(k.csat, 100); assert.equal(k.firstResponseMin, 6); assert.equal(k.coverage, 0);
  assert.equal(computeKpis([], []).fcr, null);
});

test("D1 timestamps are read as UTC", () => {
  assert.equal(toMs("2026-09-25 11:00:00"), Date.parse("2026-09-25T11:00:00Z"));
  assert.equal(toMs("2026-09-25T11:00:00.000Z"), Date.parse("2026-09-25T11:00:00Z"));
});

test("sample data is internally consistent", () => {
  const S = sampleData("me@oakhavensuites.com");
  for (const c of S.courses) assert.equal(c.enrolled, S.students.filter(s => s.sections.includes(c.code)).length, c.code);
  assert.equal(S.comps.reduce((a, [, w]) => a + w, 0), 100);
  assert.equal(S.courses[0].instructorEmail, "me@oakhavensuites.com");
});

test("AI router prefers the configured provider and parses fenced JSON", () => {
  assert.equal(aiStatus({}).configured, false);
  assert.equal(aiStatus({ ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y" }).provider, "openai");
  assert.equal(aiStatus({ ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y" }).fallback, "anthropic");
  assert.equal(aiStatus({ ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y", AI_PROVIDER: "openai" }).provider, "openai");
  assert.deepEqual(parseJson("Here you go:\n```json\n{\"a\":1}\n```"), { a: 1 });
  assert.throws(() => parseJson("no json here"));
});
