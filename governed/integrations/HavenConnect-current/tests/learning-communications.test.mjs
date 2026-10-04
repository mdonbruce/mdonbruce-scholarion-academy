import test from "node:test";
import assert from "node:assert/strict";
import { planClass, capabilityFresh, runGenesysMock } from "../lib/learning-communications.ts";

test("async work is explicit and transitions cannot overrun the class silently", () => {
  const hybrid = planClass(35, [], 15, 50);
  assert.equal(hybrid.segments.length, 1);
  assert.equal(hybrid.asyncMinutes, 15);
  assert.equal(hybrid.blockMinutes, 50);
  assert.equal(hybrid.overrunMinutes, 0);
  assert.equal(planClass(90, [], 0, 90).overrunMinutes, 6);
  assert.throws(() => planClass(35, [], -1, 50));
  assert.throws(() => planClass(35, [], 0, NaN));
});

test("capabilities expire quarterly and future evidence is invalid", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(capabilityFresh("2026-10-02T00:00:00Z", now), true);
  assert.equal(capabilityFresh("2026-06-01T00:00:00Z", now), false);
  assert.equal(capabilityFresh("2027-01-01T00:00:00Z", now), false);
  assert.equal(capabilityFresh(null, now), false);
});

test("fully live free-plan classes cover all instruction and include rejoin time", () => {
  for (const [minutes, count, block] of [[50,2,53],[90,3,96],[120,4,129],[240,7,258]]) {
    const plan = planClass(minutes);
    assert.equal(plan.segments.length, count);
    assert.equal(plan.segments.reduce((sum, part) => sum + part.liveMinutes, 0), minutes);
    assert.equal(plan.blockMinutes, block);
    assert.ok(plan.segments.every(part => part.liveMinutes > 0 && part.liveMinutes <= 35));
  }
});

test("invalid class duration cannot create meetings", () => {
  assert.throws(() => planClass(0));
  assert.throws(() => planClass(481));
  assert.throws(() => planClass(90.5));
});

test("Genesys mock exercises governance cases without provider requests", () => {
  const results = runGenesysMock();
  assert.equal(results.length, 6);
  assert.ok(results.every(test => test.passed));
  assert.match(results.find(test => test.name === "Outbound consent").result, /opted-out/);
});
