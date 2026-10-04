import test from "node:test";
import assert from "node:assert/strict";
import { classify, retrieveGuidance, planFlow } from "../lib/cx-intelligence.ts";

test("routes urgent education requests to staff review", () => {
  assert.deepEqual(classify("Urgent: registration deadline today"), {
    intent: "Admissions & registration", persona: "Amara", department: "Student services",
    priority: "High", risk: "Standard", needsHuman: true,
  });
});

test("flags sensitive finance requests rather than authorizing a transaction", () => {
  const result = classify("Refund to my bank account");
  assert.equal(result.persona, "Alex");
  assert.equal(result.risk, "Sensitive");
  assert.equal(result.needsHuman, true);
});

test("retrieval never returns draft guidance", () => {
  const results = retrieveGuidance("registration hold", [
    { id: "draft", title: "Registration hold", content: "Unreviewed instructions", domain: "Admissions", status: "Draft" },
    { id: "approved", title: "Registration hold policy", content: "Contact the registrar", domain: "Admissions", status: "Approved", source: "Policy A" },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "approved");
});

test("external workflow steps remain approval gated", () => {
  const plan = planFlow(["Review the policy", "Update student record", "Send SMS confirmation"]);
  assert.equal(plan[0].mode, "Staff checklist");
  assert.equal(plan[1].mode, "Approval and connector required");
  assert.equal(plan[2].mode, "Approval and connector required");
});
