import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { identity, privacy } from "../src/platform";
import { DEMO, DEMO_ADMIN_TOTP_SECRET } from "../src/platform/seed";
import { getDb } from "../src/platform/store";
import { base32Encode, hotp, totp, verifyTotp } from "../src/platform/totp";
import { fresh } from "./helpers";

beforeEach(() => fresh());

/** The newest link HavenRoute emailed to an address for a template. */
function linkFrom(to: string, template: string): string {
  const mail = getDb().outbox.filter((e) => e.to === to && e.template === template).at(-1);
  assert.ok(mail, `expected a ${template} email to ${to}`);
  return mail.body.match(/https?:\/\/\S+/)![0];
}
const secretOf = (link: string) => link.split("/").at(-1)!;

describe("TOTP", () => {
  it("matches the RFC 4226 test vectors", () => {
    const key = base32Encode(Buffer.from("12345678901234567890"));
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, i) => assert.equal(hotp(key, i), code));
  });
  it("accepts one step of clock drift and nothing more", () => {
    const t = 1_700_000_000_000;
    assert.ok(verifyTotp(DEMO_ADMIN_TOTP_SECRET, totp(DEMO_ADMIN_TOTP_SECRET, t - 30_000), t));
    assert.ok(!verifyTotp(DEMO_ADMIN_TOTP_SECRET, totp(DEMO_ADMIN_TOTP_SECRET, t - 90_000), t));
    assert.ok(!verifyTotp(DEMO_ADMIN_TOTP_SECRET, "12345", t));
  });
});

describe("Email verification", () => {
  it("sends a one-time link that confirms the address", () => {
    const u = identity.signUp({ name: "Ife Ade", email: "ife@example.com", password: "LongEnough123", acceptTerms: true });
    assert.equal(u.emailVerifiedAt, undefined);
    const secret = secretOf(linkFrom("ife@example.com", "verify_email"));
    assert.equal(identity.verifyEmail(secret).id, u.id);
    assert.ok(identity.getUser(u.id)!.emailVerifiedAt);
    assert.throws(() => identity.verifyEmail(secret), /already used/);
  });
  it("stores only a hash of the secret", () => {
    identity.signUp({ name: "Ife Ade", email: "ife@example.com", password: "LongEnough123", acceptTerms: true });
    const secret = secretOf(linkFrom("ife@example.com", "verify_email"));
    assert.ok(!JSON.stringify(getDb().authTokens).includes(secret));
  });
});

describe("Password reset", () => {
  it("does not reveal whether an account exists", () => {
    const before = getDb().outbox.length;
    assert.doesNotThrow(() => identity.requestPasswordReset("nobody@example.com"));
    assert.equal(getDb().outbox.length, before);
  });
  it("resets once, signs out everywhere, and the old password stops working", () => {
    const s = identity.signIn(DEMO.learner.email, DEMO.learner.password);
    identity.requestPasswordReset(DEMO.learner.email);
    const secret = secretOf(linkFrom(DEMO.learner.email, "password_reset"));
    assert.throws(() => identity.resetPassword(secret, "short"), /10 characters/);
    identity.resetPassword(secret, "BrandNewPassword9");
    assert.ok(!identity.resolveSession(s.token));
    assert.throws(() => identity.signIn(DEMO.learner.email, DEMO.learner.password));
    assert.ok(identity.signIn(DEMO.learner.email, "BrandNewPassword9").token);
    assert.throws(() => identity.resetPassword(secret, "AnotherPassword9"), /already used/);
  });
});

describe("Two-step sign-in", () => {
  it("requires a code for the demo admin and accepts the right one", () => {
    const r = identity.beginSignIn(DEMO.admin.email, DEMO.admin.password, "/admin");
    assert.ok("mfaToken" in r);
    assert.throws(() => identity.completeMfa(r.mfaToken, "000000"), /code/i);
    const done = identity.completeMfa(r.mfaToken, totp(DEMO_ADMIN_TOTP_SECRET));
    assert.equal(done.next, "/admin");
    assert.ok(identity.resolveSession(done.session.token));
    assert.throws(() => identity.completeMfa(r.mfaToken, totp(DEMO_ADMIN_TOTP_SECRET)), /sign in again/i);
  });
  it("lets a learner turn it on and off", () => {
    const u = identity.getUser(identity.signIn(DEMO.learner.email, DEMO.learner.password).userId)!;
    const { secret, otpauth } = identity.beginMfaSetup(u.id);
    assert.match(otpauth, /^otpauth:\/\/totp\//);
    assert.throws(() => identity.confirmMfaSetup(u.id, "000000"));
    identity.confirmMfaSetup(u.id, totp(secret));
    assert.throws(() => identity.signIn(DEMO.learner.email, DEMO.learner.password), /code/i);
    identity.disableMfa(u.id, DEMO.learner.password, totp(secret));
    assert.ok(identity.signIn(DEMO.learner.email, DEMO.learner.password).token);
  });
  it("is required for platform admins when enforced", () => {
    const prev = process.env.REQUIRE_ADMIN_MFA;
    process.env.REQUIRE_ADMIN_MFA = "1";
    try {
      assert.equal(identity.needsMfaSetup({ roles: ["platform_admin"], mfaSecret: undefined }), true);
      assert.equal(identity.needsMfaSetup({ roles: ["platform_admin"], mfaSecret: DEMO_ADMIN_TOTP_SECRET }), false);
      assert.equal(identity.needsMfaSetup({ roles: ["learner"], mfaSecret: undefined }), false);
    } finally {
      if (prev === undefined) delete process.env.REQUIRE_ADMIN_MFA;
      else process.env.REQUIRE_ADMIN_MFA = prev;
    }
  });
});

describe("Lockout", () => {
  it("locks an email after repeated failures, even with the right password", () => {
    for (let i = 0; i < 8; i++) assert.throws(() => identity.signIn(DEMO.learner.email, "wrong-password"));
    assert.throws(() => identity.signIn(DEMO.learner.email, DEMO.learner.password), /Too many attempts/);
  });
});

describe("Privacy", () => {
  it("exports the learner's own data and no one else's", () => {
    const id = identity.signIn(DEMO.learner.email, DEMO.learner.password).userId;
    const data = privacy.exportData(id);
    assert.equal(data.account.email, DEMO.learner.email);
    assert.ok(data.enrollments.length > 0);
    assert.ok(data.enrollments.every((e) => e.userId === id));
    assert.ok(!JSON.stringify(data).includes("passwordHash"));
    assert.ok(!JSON.stringify(data).includes(DEMO.visitor.email));
  });
  it("deletes an account: needs password and DELETE, then signs out and anonymizes", () => {
    const s = identity.signIn(DEMO.learner.email, DEMO.learner.password);
    const id = s.userId;
    assert.throws(() => privacy.deleteAccount(id, DEMO.learner.password, "nope"), /DELETE/);
    assert.throws(() => privacy.deleteAccount(id, "wrong", "DELETE"), /password/i);
    const hadCred = getDb().credentials.some((c) => c.userId === id);
    privacy.deleteAccount(id, DEMO.learner.password, "delete");
    const db = getDb();
    assert.ok(!identity.getUser(id));
    assert.ok(!identity.resolveSession(s.token));
    assert.ok(!db.users.some((u) => u.email === DEMO.learner.email));
    assert.equal(db.enrollments.filter((e) => e.userId === id).length, 0);
    assert.ok(db.subscriptions.every((x) => x.userId !== id));
    assert.ok(db.orders.every((o) => o.userId !== id));
    if (hadCred) assert.ok(db.credentials.filter((c) => c.userId === id).every((c) => c.revokedAt && c.holderName === "Deleted account"));
    assert.throws(() => identity.signIn(DEMO.learner.email, DEMO.learner.password));
  });
  it("won't delete the only admin of an organization", () => {
    const id = identity.signIn(DEMO.orgAdmin.email, DEMO.orgAdmin.password).userId;
    assert.throws(() => privacy.deleteAccount(id, DEMO.orgAdmin.password, "DELETE"), /only admin/);
  });
});
