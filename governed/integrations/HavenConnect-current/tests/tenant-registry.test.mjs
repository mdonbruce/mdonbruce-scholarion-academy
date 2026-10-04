import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, assess, classifyChange, dnsChallenge, matchesDnsAnswer, rejectRawSecrets } from "../lib/tenant-registry.ts";

const base = { slug: "oak-haven", name: "Oak Haven", environment: "Production", customDomain: "connect.oakhavensuites.com", primaryRegion: "us-east-1", isolationMode: "Database per tenant", identityRealm: "realm:oak-haven", secretRef: "secret-ref://vault/oak-haven", kmsRef: "kms-ref://aws/key/oak-haven" };

test("rejects raw credentials and non-reference encryption values", () => {
  assert.throws(() => normalizeConfig({ ...base, secretRef: "password=letmein123" }), /Raw secrets/);
  assert.throws(() => normalizeConfig({ ...base, kmsRef: "actual-key-material" }), /kmsRef/);
  assert.throws(() => rejectRawSecrets("api_key=plaintext"), /Raw secrets/);
});

test("requires a public DNS name and tracks identity alignment", () => {
  assert.throws(() => normalizeConfig({ ...base, customDomain: "http://localhost/test" }), /public DNS/);
  const good = normalizeConfig(base);
  assert.equal(assess({ ...good, domainStatus: "Verified" }).ready, true);
  assert.equal(assess({ ...good, identityRealm: "realm:other", domainStatus: "Verified" }).checks.realm, false);
});

test("detects sensitive changes and ignores unchanged fields", () => {
  assert.deepEqual(classifyChange(base, { ...base, name: "Oak Haven Digital" }), { fields: ["name"], classification: "Routine" });
  assert.equal(classifyChange(base, { ...base, primaryRegion: "eu-west-1" }).classification, "Sensitive");
});

test("validates only an exact TXT challenge at the expected DNS name", () => {
  const challenge = dnsChallenge("connect.oakhavensuites.com", "abc123");
  assert.equal(challenge.name, "_havenconnect.connect.oakhavensuites.com");
  assert.equal(matchesDnsAnswer([{ name: challenge.name + ".", type: 16, data: '"havenconnect-verify=abc123"' }], "connect.oakhavensuites.com", "abc123"), true);
  assert.equal(matchesDnsAnswer([{ name: "other.example.com", type: 16, data: '"havenconnect-verify=abc123"' }], "connect.oakhavensuites.com", "abc123"), false);
});
