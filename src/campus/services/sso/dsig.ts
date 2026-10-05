import { createHash, createPublicKey, verify as cryptoVerify, X509Certificate, type KeyObject } from "node:crypto";
import { excC14n } from "./c14n";
import { attr, child, childElements, children, textOf, XmlError, type XElement } from "./xml";

/**
 * XML Signature verification for SAML (enveloped signatures only).
 *
 * Accepted, and nothing else:
 *  - CanonicalizationMethod: exclusive c14n without comments.
 *  - SignatureMethod: RSA-SHA256 (SHA-1 is refused).
 *  - Exactly one Reference, URI="#<ID of the signed element>", whose transforms are
 *    enveloped-signature followed by exclusive c14n (optionally with InclusiveNamespaces).
 *  - DigestMethod: SHA-256.
 * The caller decides WHICH element must be signed and only ever reads data from that element,
 * which (together with the unique-ID check) defeats signature-wrapping attacks.
 */

export const DS = "http://www.w3.org/2000/09/xmldsig#";
const EXC = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

/** Accepts a PEM certificate, a PEM public key, or base64 DER of a certificate. */
export function idpKey(material: string): KeyObject {
  const m = material.trim();
  if (/-----BEGIN CERTIFICATE-----/.test(m)) return new X509Certificate(m).publicKey;
  if (/-----BEGIN PUBLIC KEY-----/.test(m)) return createPublicKey(m);
  const b64 = m.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(b64)) return new X509Certificate(Buffer.from(b64, "base64")).publicKey;
  throw new XmlError("IdP signing certificate is not recognised (PEM certificate or public key expected).");
}

export function certFingerprint(material: string): string | null {
  const m = material.trim();
  try {
    const cert = /-----BEGIN CERTIFICATE-----/.test(m) ? new X509Certificate(m) : new X509Certificate(Buffer.from(m.replace(/\s+/g, ""), "base64"));
    return cert.fingerprint256;
  } catch {
    return null;
  }
}

/** Every element carrying an ID attribute, keyed by value; duplicates are an error (wrapping defence). */
export function idIndex(root: XElement): Map<string, XElement> {
  const map = new Map<string, XElement>();
  const walk = (e: XElement) => {
    for (const a of e.attrs) {
      if (a.ns === null && (a.local === "ID" || a.local === "Id" || a.local === "id")) {
        if (map.has(a.value)) throw new XmlError(`Duplicate ID "${a.value}" — possible signature wrapping`);
        map.set(a.value, e);
      }
    }
    childElements(e).forEach(walk);
  };
  walk(root);
  return map;
}

/**
 * Verify that `signed` carries a valid enveloped signature (a direct ds:Signature child) over itself.
 * Throws XmlError with a reason on any problem.
 */
export function verifyEnveloped(root: XElement, signed: XElement, key: KeyObject): void {
  const ids = idIndex(root);
  const id = attr(signed, "ID");
  if (!id || ids.get(id) !== signed) throw new XmlError("Signed element has no unique ID");
  const sigs = children(signed, DS, "Signature");
  if (sigs.length !== 1) throw new XmlError(sigs.length ? "More than one signature on the element" : "Element is not signed");
  const sig = sigs[0];
  const si = child(sig, DS, "SignedInfo");
  const sv = child(sig, DS, "SignatureValue");
  if (!si || !sv) throw new XmlError("Malformed signature");
  const cm = child(si, DS, "CanonicalizationMethod");
  if (attr(cm ?? si, "Algorithm") !== EXC) throw new XmlError("Only exclusive canonicalization (without comments) is accepted");
  if (attr(child(si, DS, "SignatureMethod") ?? si, "Algorithm") !== RSA_SHA256) throw new XmlError("Only RSA-SHA256 signatures are accepted");
  const refs = children(si, DS, "Reference");
  if (refs.length !== 1) throw new XmlError("Exactly one signature reference is required");
  const ref = refs[0];
  if (attr(ref, "URI") !== `#${id}`) throw new XmlError("Signature reference does not point at the signed element");
  const tx = child(ref, DS, "Transforms");
  const transforms = tx ? children(tx, DS, "Transform") : [];
  const algs = transforms.map((t) => attr(t, "Algorithm"));
  if (algs.length !== 2 || algs[0] !== ENVELOPED || algs[1] !== EXC) throw new XmlError("Unsupported signature transforms");
  const incl = transforms[1].children.find((c): c is XElement => c.kind === "element" && c.ns === EXC && c.local === "InclusiveNamespaces");
  const prefixes = incl ? (attr(incl, "PrefixList") ?? "").split(/\s+/).filter(Boolean) : [];
  if (attr(child(ref, DS, "DigestMethod") ?? ref, "Algorithm") !== SHA256) throw new XmlError("Only SHA-256 digests are accepted");
  const digestValue = textOf(child(ref, DS, "DigestValue") ?? ref).replace(/\s+/g, "");
  const digest = createHash("sha256").update(excC14n(signed, { exclude: sig, inclusivePrefixes: prefixes }), "utf8").digest("base64");
  if (digest !== digestValue) throw new XmlError("Digest mismatch — the signed content was changed");
  const siIncl = cm ? cm.children.find((c): c is XElement => c.kind === "element" && c.ns === EXC && c.local === "InclusiveNamespaces") : undefined;
  const siPrefixes = siIncl ? (attr(siIncl, "PrefixList") ?? "").split(/\s+/).filter(Boolean) : [];
  const canonicalSi = excC14n(si, { inclusivePrefixes: siPrefixes });
  const sigBytes = Buffer.from(textOf(sv).replace(/\s+/g, ""), "base64");
  if (!cryptoVerify("RSA-SHA256", Buffer.from(canonicalSi, "utf8"), key, sigBytes)) throw new XmlError("Signature value is invalid");
}
