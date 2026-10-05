import { randomBytes } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { broker, CampusError, nowIso, nowMs, type Row, type TenantStore } from "../../core";
import { certFingerprint, idpKey, verifyEnveloped } from "./dsig";
import { federatedSignIn } from "./session";
import { attr, child, children, descendants, parseXml, textOf, XmlError } from "./xml";

/**
 * SAML 2.0 Web Browser SSO — service provider (SP-initiated; HTTP-Redirect request, HTTP-POST response).
 *
 * What is checked on every Response (any failure refuses the sign-in):
 *  - XML is parsed strictly (no DOCTYPE/entities); IDs are unique.
 *  - Status is Success; the Response is addressed to our ACS (Destination) and answers a request
 *    we issued (InResponseTo, single use, 10 minutes).
 *  - Exactly one Assertion; encrypted assertions are refused with a clear message.
 *  - The Assertion itself carries a valid enveloped RSA-SHA256 signature from the configured IdP
 *    certificate (optionally pinned by SHA-256 fingerprint). Data is read ONLY from that element.
 *  - Issuer is the configured IdP; AudienceRestriction includes our entity ID; NotBefore /
 *    NotOnOrAfter (2-minute skew); a bearer SubjectConfirmation for our ACS and request.
 *  - Each Assertion ID is accepted once (replay protection).
 */

const P = "urn:oasis:names:tc:SAML:2.0:protocol";
const A = "urn:oasis:names:tc:SAML:2.0:assertion";
const SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success";
const BEARER = "urn:oasis:names:tc:SAML:2.0:cm:bearer";
const SKEW_MS = 120_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function idp(store: TenantStore, id: string, requireEnabled = true) {
  const p = store.get("identity_providers", id);
  if (!p || p.kind !== "saml") throw new CampusError("not_found", "SAML provider not found", 404);
  if (requireEnabled && p.state !== "enabled") throw new CampusError("saml_disabled", "This sign-in provider isn't enabled.", 409);
  return p as Row & { config: Record<string, string> };
}

export const spUrls = (store: TenantStore, base: string, idpId: string) => {
  const root = `${base.replace(/\/$/, "")}/api/campus/v1/t/${broker.tenant(store.tenantId)!.slug}/auth/saml`;
  return { entityId: `${root}/metadata?idp=${encodeURIComponent(idpId)}`, acs: `${root}/acs` };
};

export function spMetadata(store: TenantStore, base: string, idpId: string) {
  idp(store, idpId, false);
  const u = spUrls(store, base, idpId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${esc(u.entityId)}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${esc(u.acs)}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>
`;
}

/** Build the redirect to the IdP with a fresh AuthnRequest (deflated, base64, URL-encoded). */
export function startSaml(store: TenantStore, idpId: string, base: string, next: string) {
  const p = idp(store, idpId);
  if (!/^https:\/\//.test(String(p.config.ssoUrl ?? ""))) throw new CampusError("saml_config", "The IdP SSO URL must be https.", 422);
  const u = spUrls(store, base, p.id);
  const id = `_${randomBytes(20).toString("hex")}`;
  const xml = `<samlp:AuthnRequest xmlns:samlp="${P}" xmlns:saml="${A}" ID="${id}" Version="2.0" IssueInstant="${nowIso()}" Destination="${esc(String(p.config.ssoUrl))}" AssertionConsumerServiceURL="${esc(u.acs)}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${esc(u.entityId)}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/></samlp:AuthnRequest>`;
  const relay = randomBytes(16).toString("base64url");
  store.tx(() => store.insert("saml_requests", { requestId: id, idpId: p.id, relayState: relay, next, expiresAt: new Date(nowMs() + 10 * 60_000).toISOString(), usedAt: null }, "sreq"));
  const url = new URL(String(p.config.ssoUrl));
  url.searchParams.set("SAMLRequest", deflateRawSync(Buffer.from(xml, "utf8")).toString("base64"));
  url.searchParams.set("RelayState", relay);
  return { url: url.toString(), requestId: id };
}

const within = (instant: string | null, cmp: "before" | "after", now: number) => {
  if (!instant) return true;
  const t = Date.parse(instant);
  if (Number.isNaN(t)) return false;
  return cmp === "before" ? now + SKEW_MS >= t : now - SKEW_MS < t;
};

/** Consume the POSTed SAMLResponse. Returns the session token and where to go next. */
export function consumeSaml(store: TenantStore, input: { samlResponse: string; relayState?: string; base: string }) {
  let xml: string;
  try {
    xml = Buffer.from(String(input.samlResponse ?? ""), "base64").toString("utf8");
  } catch {
    throw new CampusError("saml_invalid", "SAMLResponse isn't base64.", 400);
  }
  try {
    const root = parseXml(xml);
    if (root.ns !== P || root.local !== "Response") throw new XmlError("Not a SAML Response");
    const inResponseTo = attr(root, "InResponseTo");
    const req = store.list("saml_requests", (r) => r.requestId === inResponseTo)[0];
    if (!req || req.usedAt || String(req.expiresAt) < nowIso()) throw new XmlError("Unknown, expired or already-used request (InResponseTo)");
    if (input.relayState !== undefined && req.relayState !== input.relayState) throw new XmlError("RelayState mismatch");
    store.tx(() => store.update("saml_requests", req.id, { usedAt: nowIso() }));
    const p = idp(store, String(req.idpId));
    const u = spUrls(store, input.base, p.id);
    const dest = attr(root, "Destination");
    if (dest && dest !== u.acs) throw new XmlError("Response Destination is not this service");
    const status = child(root, P, "Status");
    const code = status ? child(status, P, "StatusCode") : null;
    if (attr(code ?? root, "Value") !== SUCCESS) throw new XmlError("The identity provider reported an unsuccessful sign-in");
    if (descendants(root, A, "EncryptedAssertion").length) throw new XmlError("Encrypted assertions aren't supported; ask the IdP to sign (not encrypt) assertions over HTTPS");
    const assertions = descendants(root, A, "Assertion");
    if (assertions.length !== 1 || assertions[0].parent !== root) throw new XmlError("Exactly one Assertion is required, directly inside the Response");
    const as = assertions[0];
    const material = String(p.config.certificatePem ?? "");
    if (!material) throw new XmlError("No IdP signing certificate is configured");
    const pin = String(p.config.certificateFingerprint ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
    if (pin) {
      const fp = (certFingerprint(material) ?? "").replace(/:/g, "").toUpperCase();
      if (fp !== pin) throw new XmlError("Configured certificate doesn't match the pinned fingerprint");
    }
    verifyEnveloped(root, as, idpKey(material));
    // Everything below reads only from the verified Assertion.
    const now = nowMs();
    const issuer = textOf(child(as, A, "Issuer") ?? as).trim();
    if (issuer !== String(p.config.entityId ?? "")) throw new XmlError("Assertion Issuer is not the configured IdP");
    const cond = child(as, A, "Conditions");
    if (!cond) throw new XmlError("Assertion has no Conditions");
    if (!within(attr(cond, "NotBefore"), "before", now) || !within(attr(cond, "NotOnOrAfter"), "after", now)) throw new XmlError("Assertion is not currently valid (NotBefore/NotOnOrAfter)");
    const audiences = children(cond, A, "AudienceRestriction").flatMap((r) => children(r, A, "Audience").map((x) => textOf(x).trim()));
    if (!audiences.includes(u.entityId)) throw new XmlError("Assertion audience is not this service");
    const subject = child(as, A, "Subject");
    if (!subject) throw new XmlError("Assertion has no Subject");
    const confirmed = children(subject, A, "SubjectConfirmation").some((sc) => {
      if (attr(sc, "Method") !== BEARER) return false;
      const d = child(sc, A, "SubjectConfirmationData");
      if (!d) return false;
      return attr(d, "Recipient") === u.acs && attr(d, "InResponseTo") === inResponseTo && !!attr(d, "NotOnOrAfter") && within(attr(d, "NotOnOrAfter"), "after", now) && !attr(d, "NotBefore");
    });
    if (!confirmed) throw new XmlError("No valid bearer SubjectConfirmation for this service and request");
    const asId = String(attr(as, "ID"));
    if (store.list("saml_assertions_seen", (x) => x.assertionId === asId && x.idpId === p.id).length) throw new XmlError("This assertion was already used (replay)");
    store.tx(() => store.insert("saml_assertions_seen", { assertionId: asId, idpId: p.id, seenAt: nowIso() }, "sas"));
    const nameId = child(subject, A, "NameID");
    const attrs = new Map<string, string>();
    const stmt = child(as, A, "AttributeStatement");
    for (const a of stmt ? children(stmt, A, "Attribute") : []) {
      const v = children(a, A, "AttributeValue").map((x) => textOf(x).trim())[0];
      if (v) for (const n of [attr(a, "Name"), attr(a, "FriendlyName")]) if (n) attrs.set(n.toLowerCase(), v);
    }
    const email = attrs.get("email") ?? attrs.get("mail") ?? attrs.get("urn:oid:0.9.2342.19200300.100.1.3") ?? (attr(nameId ?? as, "Format")?.endsWith("emailAddress") ? textOf(nameId!).trim() : "");
    const name = attrs.get("displayname") ?? attrs.get("cn") ?? attrs.get("urn:oid:2.16.840.1.113730.3.1.241") ?? [attrs.get("givenname"), attrs.get("sn") ?? attrs.get("surname")].filter(Boolean).join(" ");
    const ctx = descendants(as, A, "AuthnContextClassRef").map((x) => textOf(x));
    const mfa = ctx.some((c) => /MultiFactor|mfa|TimeSyncToken|MobileTwoFactor/i.test(c));
    const r = federatedSignIn(store, p, { email, name, subject: nameId ? textOf(nameId).trim() : "", mfa, via: "saml" });
    return { ...r, next: String(req.next ?? "") };
  } catch (e) {
    if (e instanceof XmlError) {
      store.audit({ actorId: "anonymous", actorRoles: [], action: "session.create", resource: "session", outcome: "denied", reason: `saml: ${e.message}` });
      throw new CampusError("saml_refused", `SAML sign-in refused: ${e.message}`, 401);
    }
    throw e;
  }
}

/** Configuration check: certificate parses (and matches its pin), URLs are https, entity ID set. */
export function checkSaml(store: TenantStore, idpId: string) {
  const p = idp(store, idpId, false);
  const missing = ["entityId", "ssoUrl", "certificatePem"].filter((k) => !p.config[k]);
  const problems: string[] = [];
  if (p.config.ssoUrl && !/^https:\/\//.test(String(p.config.ssoUrl))) problems.push("SSO URL must be https");
  if (p.config.certificatePem) {
    try {
      idpKey(String(p.config.certificatePem));
      const pin = String(p.config.certificateFingerprint ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
      if (pin && (certFingerprint(String(p.config.certificatePem)) ?? "").replace(/:/g, "").toUpperCase() !== pin) problems.push("certificate doesn't match the pinned fingerprint");
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  const ok = !missing.length && !problems.length;
  const result = { at: nowIso(), configComplete: !missing.length, connected: ok, missing, problems, note: ok ? "Certificate and endpoints look right. Sign-in works once enabled; the IdP must sign assertions with RSA-SHA256." : "Fix the configuration first." };
  store.tx(() => store.update("identity_providers", p.id, { lastTest: result }));
  return result;
}
