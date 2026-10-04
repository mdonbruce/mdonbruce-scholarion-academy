import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APPS, PACKS, mergeApps, canAccessApp, effectiveRedact, dbBinding, secretName, appSlug } from "../lib/apps.ts";

test("every Haven product has a room, including HomePilot", () => {
  const slugs = DEFAULT_APPS.map(a => a.slug);
  for (const s of ["oak-haven", "havenup", "vervestack", "scholaris", "oakhaven-global-university", "medigrid", "haven-trading", "intellicore", "haven-agentic-ai", "homepilot"]) assert.ok(slugs.includes(s), s);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("stored edits override defaults and new products are added", () => {
  const apps = mergeApps([{ slug: "homepilot", category: "Property · smart home", members: ["@homepilot.example"] }, { slug: "new-product", name: "New Product" }]);
  assert.equal(apps.find(a => a.slug === "homepilot").category, "Property · smart home");
  const added = apps.find(a => a.slug === "new-product");
  assert.equal(added.name, "New Product"); assert.equal(added.pack, "standard"); assert.equal(added.isolation, "shared");
});

test("room access: Oak Haven open to staff, other rooms by membership, admins everywhere", () => {
  const [oak] = mergeApps([]), medigrid = mergeApps([]).find(a => a.slug === "medigrid");
  assert.equal(canAccessApp(oak, "desk@oakhavensuites.com", false), true);
  assert.equal(canAccessApp(oak, "partner@scholarisglobal.com", false, false), false);
  assert.equal(canAccessApp({ ...mergeApps([]).find(a => a.slug === "scholaris"), members: ["@scholarisglobal.com"] }, "dev@scholarisglobal.com", false, false), true);
  assert.equal(canAccessApp(oak, "", true), false);
  assert.equal(canAccessApp(medigrid, "desk@oakhavensuites.com", false), false);
  assert.equal(canAccessApp({ ...medigrid, members: ["@medigrid.example"] }, "rx@medigrid.example", false), true);
  assert.equal(canAccessApp(medigrid, "anyone@x.com", true), true);
  assert.equal(canAccessApp({ ...medigrid, status: "Archived", members: ["a@b.c"] }, "a@b.c", false), false);
});

test("guardrail packs force redaction that room settings cannot switch off", () => {
  assert.equal(effectiveRedact("health", { PHI: false, PII: false }).PHI, true);
  assert.equal(effectiveRedact("health", { PHI: false }).PII, true);
  assert.equal(effectiveRedact("standard", { PHI: false }).PHI, false);
  assert.equal(PACKS.finance.reviewRequired, true);
  assert.equal(PACKS.health.reviewRequired, true);
});

test("health and finance rooms default to dedicated storage", () => {
  for (const s of ["medigrid", "haven-trading", "scholaris"]) assert.equal(DEFAULT_APPS.find(a => a.slug === s).isolation, "dedicated", s);
  assert.equal(dbBinding("haven-trading"), "DB_HAVEN_TRADING");
  assert.equal(secretName("homepilot"), "HAVEN_INBOUND_SECRET_HOMEPILOT");
  assert.equal(appSlug("  Home Pilot! "), "home-pilot");
});
