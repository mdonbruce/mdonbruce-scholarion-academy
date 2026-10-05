"""Independent SAML test fixtures: signed with lxml's exclusive C14N + cryptography (not the
campus implementation), so the campus verifier is checked against a second implementation.
Run: python3 tests/fixtures/saml/make_fixtures.py   (regenerates the files in this folder)."""
import base64, copy, datetime, hashlib, json, os
from lxml import etree
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

HERE = os.path.dirname(os.path.abspath(__file__))
P = "urn:oasis:names:tc:SAML:2.0:protocol"; A = "urn:oasis:names:tc:SAML:2.0:assertion"; DS = "http://www.w3.org/2000/09/xmldsig#"
EXC = "http://www.w3.org/2001/10/xml-exc-c14n#"
BASE = "https://campus.example.edu/api/campus/v1/t/demo/auth/saml"
IDP_ID = "idp_fixture_saml"; IDP_ENTITY = "https://idp.example.edu/saml"
SP_ENTITY = f"{BASE}/metadata?idp={IDP_ID}"; ACS = f"{BASE}/acs"

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Fixture IdP")])
now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1)
        .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=3650)).sign(key, hashes.SHA256()))
other = rsa.generate_private_key(public_exponent=65537, key_size=2048)

def response(req_id, email, assertion_id=None, name_id=None, extra_assertion=None):
    assertion_id = assertion_id or "_a" + req_id.strip("_")
    nid = name_id if name_id is not None else email
    xml = f'''<samlp:Response xmlns:samlp="{P}" xmlns:saml="{A}" ID="_r1" Version="2.0" IssueInstant="2026-06-01T00:00:00Z" Destination="{ACS}" InResponseTo="{req_id}"><saml:Issuer>{IDP_ENTITY}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ID="{assertion_id}" Version="2.0" IssueInstant="2026-06-01T00:00:00Z"><saml:Issuer>{IDP_ENTITY}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">{nid}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="{req_id}" NotOnOrAfter="2036-01-01T00:00:00Z" Recipient="{ACS}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="2026-01-01T00:00:00Z" NotOnOrAfter="2036-01-01T00:00:00Z"><saml:AudienceRestriction><saml:Audience>{SP_ENTITY}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="2026-06-01T00:00:00Z"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:MultiFactor</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="displayName"><saml:AttributeValue xsi:type="xs:string">SAML Learner</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>'''
    return etree.fromstring(xml.encode())

def sign(el, signer=key):
    digest = base64.b64encode(hashlib.sha256(etree.tostring(el, method="c14n", exclusive=True, with_comments=False)).digest()).decode()
    sig = etree.Element(f"{{{DS}}}Signature", nsmap={"ds": DS})
    si = etree.SubElement(sig, f"{{{DS}}}SignedInfo")
    etree.SubElement(si, f"{{{DS}}}CanonicalizationMethod", Algorithm=EXC)
    etree.SubElement(si, f"{{{DS}}}SignatureMethod", Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256")
    ref = etree.SubElement(si, f"{{{DS}}}Reference", URI="#" + el.get("ID"))
    tr = etree.SubElement(ref, f"{{{DS}}}Transforms")
    etree.SubElement(tr, f"{{{DS}}}Transform", Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature")
    etree.SubElement(tr, f"{{{DS}}}Transform", Algorithm=EXC)
    etree.SubElement(ref, f"{{{DS}}}DigestMethod", Algorithm="http://www.w3.org/2001/04/xmlenc#sha256")
    etree.SubElement(ref, f"{{{DS}}}DigestValue").text = digest
    el.insert(1, sig)  # after Issuer
    c = etree.tostring(si, method="c14n", exclusive=True, with_comments=False)
    etree.SubElement(sig, f"{{{DS}}}SignatureValue").text = base64.b64encode(signer.sign(c, padding.PKCS1v15(), hashes.SHA256())).decode()
    return el

def b64(root): return base64.b64encode(etree.tostring(root)).decode()
def assertion(root): return root.find(f"{{{A}}}Assertion")

out = {"idpId": IDP_ID, "idpEntityId": IDP_ENTITY, "acs": ACS, "spEntityId": SP_ENTITY,
       "certificatePem": cert.public_bytes(serialization.Encoding.PEM).decode(),
       "fingerprint": cert.fingerprint(hashes.SHA256()).hex().upper()}
r = response("_req_valid", "saml.learner@example.edu"); sign(assertion(r)); out["valid"] = b64(r)
r = response("_req_tamper", "saml.learner@example.edu"); sign(assertion(r))
assertion(r).find(f"{{{A}}}Subject/{{{A}}}NameID").text = "admin@example.edu"; out["tampered"] = b64(r)
r = response("_req_unsigned", "saml.learner@example.edu"); out["unsigned"] = b64(r)
r = response("_req_wrongkey", "saml.learner@example.edu"); sign(assertion(r), other); out["wrongKey"] = b64(r)
# Comment-splitting: the signature covers "admin@example.edu.evil.test" (comments are not signed).
r = response("_req_comment", "x", name_id="admin@example.edu<!---->.evil.test")
sign(assertion(r)); out["commentSplit"] = b64(r)
# Wrapping: keep the signed assertion but add an unsigned evil assertion first, with the same ID.
r = response("_req_wrap", "saml.learner@example.edu"); sign(assertion(r))
evil = copy.deepcopy(assertion(r)); evil.remove(evil.find(f"{{{DS}}}Signature"))
evil.find(f"{{{A}}}Subject/{{{A}}}NameID").text = "admin@example.edu"; r.insert(2, evil); out["wrapped"] = b64(r)
r = response("_req_replay", "saml.learner@example.edu", assertion_id="_a_replay"); sign(assertion(r)); out["replayA"] = b64(r)
r = response("_req_replay2", "saml.learner@example.edu", assertion_id="_a_replay"); sign(assertion(r)); out["replayB"] = b64(r)
with open(os.path.join(HERE, "fixtures.json"), "w") as f: json.dump(out, f, indent=1)
print("wrote", len(out), "entries")
