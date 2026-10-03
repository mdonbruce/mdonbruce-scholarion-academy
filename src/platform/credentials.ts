import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify as edVerify } from "node:crypto";
import { publish } from "./bus";
import { catalog } from "./catalog";
import { publicUrl } from "./config";
import { entitlements } from "./entitlements";
import { identity } from "./identity";
import { getDb, nowIso, save } from "./store";
import type { IssuedCredential } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Credentials (Integration Spec §10). Issues an Open Badges 3.0-shaped W3C Verifiable
 * Credential automatically when the LMS reports completion. Signed with Ed25519 over a
 * canonical (sorted-key) JSON serialisation.
 * NOTE: the local signer uses a project-specific cryptosuite label; the production
 * issuer must use a conformant Data Integrity library (eddsa-rdfc-2022 / eddsa-jcs-2022).
 */

const CRYPTOSUITE = "scholarion-ed25519-sortedjson-2026";

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function issuerKey() {
  const db = getDb();
  if (!db.issuerKey) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    db.issuerKey = {
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      kid: "key-1",
    };
    save();
  }
  return db.issuerKey;
}

function issuerDid(): string {
  return `did:web:${new URL(publicUrl()).host.replace(":", "%3A")}`;
}

export interface VerificationResult {
  valid: boolean;
  status: "valid" | "revoked" | "invalid_signature" | "not_found";
  credential?: Omit<IssuedCredential, "vc" | "userId">;
  checkedAt: string;
}

export const credentials = {
  publicJwk() {
    const k = issuerKey();
    return { id: `${issuerDid()}#${k.kid}`, ...createPublicKey(k.publicKeyPem).export({ format: "jwk" }) };
  },

  issue(userId: string, productId: string): IssuedCredential {
    const db = getDb();
    const existing = db.credentials.find((c) => c.userId === userId && c.productId === productId && !c.revokedAt);
    if (existing) return existing;
    const product = catalog.get(productId);
    const user = identity.getUser(userId);
    if (!product || !user) throw new PlatformError("not_found", "Learner or product not found", 404);
    if (!entitlements.check(userId, "credential.earn", productId).allow) {
      throw new PlatformError("needs_upgrade", "Credentials are earned with full access (subscription, Plus, purchase or approved aid).", 403);
    }
    const id = newId("crd");
    const issuedAt = nowIso();
    const k = issuerKey();
    const unsigned = {
      "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
      id: `${publicUrl()}/verify/${id}`,
      type: ["VerifiableCredential", "OpenBadgeCredential"],
      issuer: { id: issuerDid(), type: ["Profile"], name: "Scholarion Academy", url: publicUrl() },
      validFrom: issuedAt,
      name: product.credential.title,
      credentialSubject: {
        type: ["AchievementSubject"],
        name: user.name,
        achievement: {
          id: `${publicUrl()}/learn/${product.slug}#credential`,
          type: ["Achievement"],
          achievementType: product.credential.kind === "badge" ? "Badge" : "Certificate",
          name: product.credential.title,
          description: `${product.title}. Non-credit professional training by Scholarion Academy.`,
          criteria: { narrative: product.credential.criteria.join("; ") },
        },
      },
    };
    const proofConfig = { type: "DataIntegrityProof", cryptosuite: CRYPTOSUITE, created: issuedAt, verificationMethod: `${issuerDid()}#${k.kid}`, proofPurpose: "assertionMethod" };
    const signature = sign(null, Buffer.from(canonical({ ...unsigned, proof: proofConfig })), createPrivateKey(k.privateKeyPem));
    const vc = { ...unsigned, proof: { ...proofConfig, proofValue: signature.toString("base64url") } };
    const cred: IssuedCredential = { id, userId, productId, title: product.credential.title, holderName: user.name, issuedAt, vc };
    db.credentials.push(cred);
    publish("credential.issued", "credentials", `user/${userId}`, { userId, credentialId: id, productId });
    save();
    return cred;
  },

  /** Public verification reads the registry and re-checks the signature — never trusts a PDF. */
  verify(id: string): VerificationResult {
    const checkedAt = nowIso();
    const cred = getDb().credentials.find((c) => c.id === id);
    if (!cred) return { valid: false, status: "not_found", checkedAt };
    const { proof, ...rest } = cred.vc as { proof: Record<string, string> } & Record<string, unknown>;
    const { proofValue, ...config } = proof;
    let sigOk = false;
    try {
      sigOk = edVerify(null, Buffer.from(canonical({ ...rest, proof: config })), createPublicKey(issuerKey().publicKeyPem), Buffer.from(proofValue, "base64url"));
    } catch {
      sigOk = false;
    }
    const { vc: _vc, userId: _u, ...pub } = cred;
    void _vc;
    void _u;
    if (!sigOk) return { valid: false, status: "invalid_signature", credential: pub, checkedAt };
    if (cred.revokedAt) return { valid: false, status: "revoked", credential: pub, checkedAt };
    return { valid: true, status: "valid", credential: pub, checkedAt };
  },

  revoke(id: string, reason: string): IssuedCredential {
    const cred = getDb().credentials.find((c) => c.id === id);
    if (!cred) throw new PlatformError("not_found", "Credential not found", 404);
    cred.revokedAt = nowIso();
    publish("credential.revoked", "credentials", `user/${cred.userId}`, { userId: cred.userId, credentialId: id, reason });
    save();
    return cred;
  },

  forUser(userId: string): IssuedCredential[] {
    return getDb().credentials.filter((c) => c.userId === userId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  },

  get(id: string): IssuedCredential | undefined {
    return getDb().credentials.find((c) => c.id === id);
  },

  verifyUrl(id: string): string {
    return `${publicUrl()}/verify/${id}`;
  },

  /** Prefilled LinkedIn "Add license or certification" link. */
  linkedInUrl(c: IssuedCredential): string {
    const d = new Date(c.issuedAt);
    const p = new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: c.title,
      organizationName: "Scholarion Academy",
      issueYear: String(d.getUTCFullYear()),
      issueMonth: String(d.getUTCMonth() + 1),
      certUrl: this.verifyUrl(c.id),
      certId: c.id,
    });
    return `https://www.linkedin.com/profile/add?${p.toString()}`;
  },

  /** Consumer for lms.course.passed and lms.program.completed. */
  onCompletion(userId: string, productId: string): IssuedCredential | null {
    try {
      return this.issue(userId, productId);
    } catch (err) {
      if (err instanceof PlatformError && err.code === "needs_upgrade") return null;
      throw err;
    }
  },
};
