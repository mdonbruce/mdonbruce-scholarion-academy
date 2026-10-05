import { randomBytes } from "node:crypto";
import { CampusError, nowMs, sha256, type Row, type TenantStore } from "../../core";
import { createUser } from "../../iam";

/**
 * Shared end of every federated sign-in (OIDC, SAML, LDAP): match the person by verified email,
 * optionally create the account (just-in-time provisioning, only when the provider allows it),
 * and open a campus session. MFA is carried over only when the provider asserted it.
 */
export function federatedSignIn(store: TenantStore, idp: Row, who: { email: string; name?: string; subject?: string; mfa: boolean; via: "oidc" | "saml" | "ldap" }) {
  const email = String(who.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CampusError("sso_email", "The sign-in provider didn't share a usable email address.", 403);
  let user = store.list("users", (u) => u.email === email)[0];
  if (!user) {
    if (!idp.jitProvisioning) throw new CampusError("sso_no_account", "No campus account uses that email. Ask an administrator for access.", 403);
    user = store.tx(() => createUser(store, { name: String(who.name || email.split("@")[0]).slice(0, 120), email }));
    store.tx(() => store.update("users", user!.id, { idpId: idp.id, idpSubject: String(who.subject ?? "") }));
  }
  if (user.status !== "active") throw new CampusError("sso_inactive", "This account is suspended.", 403);
  const token = randomBytes(32).toString("base64url");
  store.tx(() => {
    store.insert("sessions", { tokenHash: sha256(token), userId: user!.id, mfa: !!who.mfa, via: `${who.via}:${idp.id}`, expiresAt: new Date(nowMs() + 12 * 3600_000).toISOString() }, "ses");
    store.audit({ actorId: user!.id, actorRoles: [], action: "session.create", resource: "session", outcome: "allowed", reason: `${who.via}:${String(idp.name)}` });
  });
  return { token, userId: user.id };
}
