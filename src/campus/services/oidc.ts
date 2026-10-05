import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from "node:crypto";
import { broker, CampusError, nowIso, nowMs, sha256, type Row, type TenantStore } from "../core";
import { createUser } from "../iam";

/**
 * OpenID Connect sign-in (authorization code flow with PKCE, RS256 ID tokens).
 *
 * An administrator records the provider (issuer, client id, scopes) under Admin Console →
 * Identity providers, checks it, and enables it. The client secret, if the provider needs one,
 * is read from the server environment variable named in `clientSecretEnv` — never stored in the
 * database. Every ID token is verified: signature against the provider's JWKS, issuer, audience,
 * expiry, nonce, and a verified email. Users are matched by email; new users are created only
 * when the provider allows just-in-time provisioning.
 *
 * SAML and LDAP records remain configuration only.
 */

export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
let fetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
  return { ok: r.ok, status: r.status, json: () => r.json() };
};
/** Tests and sandboxes inject a fake provider. */
export function setOidcFetcher(f: Fetcher | null) {
  fetcher =
    f ??
    (async (url, init) => {
      const r = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
      return { ok: r.ok, status: r.status, json: () => r.json() };
    });
}

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
const b64url = (b: Buffer) => b.toString("base64url");

function assertHttps(u: string, what: string) {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new CampusError("oidc_config", `${what} isn't a valid URL.`, 422);
  }
  if (url.protocol !== "https:") throw new CampusError("oidc_config", `${what} must use https.`, 422);
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(url.hostname) || /\.(local|internal)$/.test(url.hostname)) throw new CampusError("oidc_config", `${what} can't be a private address.`, 422);
  return url;
}

async function discover(issuer: string): Promise<Discovery> {
  assertHttps(issuer, "Issuer");
  const r = await fetcher(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!r.ok) throw new CampusError("oidc_unreachable", `The provider's discovery document returned ${r.status}.`, 502);
  const d = (await r.json()) as Discovery;
  if (d.issuer?.replace(/\/$/, "") !== issuer.replace(/\/$/, "")) throw new CampusError("oidc_config", "Discovery issuer doesn't match the configured issuer.", 502);
  for (const [k, v] of [["authorization endpoint", d.authorization_endpoint], ["token endpoint", d.token_endpoint], ["JWKS", d.jwks_uri]] as const) assertHttps(String(v), `The provider's ${k}`);
  return d;
}

function idpRow(store: TenantStore, idpId: string, requireEnabled = true): Row & { config: Record<string, unknown> } {
  const idp = store.get("identity_providers", idpId);
  if (!idp || idp.kind !== "oidc") throw new CampusError("not_found", "Sign-in provider not found", 404);
  if (requireEnabled && idp.state !== "enabled") throw new CampusError("oidc_disabled", "This sign-in provider isn't enabled.", 409);
  return idp as Row & { config: Record<string, unknown> };
}

export function redirectUri(store: TenantStore, base: string) {
  return `${base.replace(/\/$/, "")}/api/campus/v1/t/${broker.tenant(store.tenantId)!.slug}/auth/oidc/callback`;
}

/** Live check: fetch discovery and JWKS. On success the provider can be enabled. */
export async function checkOidc(store: TenantStore, idpId: string) {
  const idp = idpRow(store, idpId, false);
  const d = await discover(String(idp.config.issuer ?? ""));
  const jw = await fetcher(d.jwks_uri);
  const keys = jw.ok ? (((await jw.json()) as { keys?: unknown[] }).keys ?? []) : [];
  const result = { at: nowIso(), configComplete: true, connected: keys.length > 0, missing: [] as string[], note: keys.length ? `Discovery and ${keys.length} signing key(s) reachable.` : "JWKS unreachable or empty." };
  store.tx(() => store.update("identity_providers", idp.id, { lastTest: result, discovery: { authorization_endpoint: d.authorization_endpoint, token_endpoint: d.token_endpoint, jwks_uri: d.jwks_uri } }));
  return result;
}

export function setOidcEnabled(store: TenantStore, idpId: string, on: boolean) {
  const idp = idpRow(store, idpId, false);
  const t = idp.lastTest as { connected?: boolean } | undefined;
  if (on && !t?.connected) throw new CampusError("oidc_unchecked", "Run a successful configuration check before enabling this provider.", 409);
  if (on && !idp.config.clientId) throw new CampusError("oidc_config", "Set a client id first.", 422);
  return store.tx(() => store.update("identity_providers", idp.id, { state: on ? "enabled" : "not_connected" }));
}

export function enabledOidc(store: TenantStore) {
  return store.list("identity_providers", (p) => p.kind === "oidc" && p.state === "enabled").map((p) => ({ id: p.id, name: String(p.name) }));
}

/** Step 1: build the authorization URL (state, nonce and PKCE verifier kept server-side, single use, 10 minutes). */
export async function startOidc(store: TenantStore, idpId: string, base: string, next: string) {
  const idp = idpRow(store, idpId);
  const d = await discover(String(idp.config.issuer));
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  store.tx(() => store.insert("oidc_states", { stateHash: sha256(state), idpId: idp.id, nonce, verifier, next, expiresAt: new Date(nowMs() + 10 * 60_000).toISOString(), usedAt: null }, "ost"));
  const u = new URL(d.authorization_endpoint);
  u.search = new URLSearchParams({ response_type: "code", client_id: String(idp.config.clientId), redirect_uri: redirectUri(store, base), scope: String(idp.config.scopes ?? "openid email profile"), state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return u.toString();
}

function verifyRs256(jwt: string, jwks: { keys: (Record<string, unknown> & { kid?: string; kty?: string })[] }) {
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) throw new CampusError("oidc_token", "Malformed ID token", 401);
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new CampusError("oidc_token", "Only RS256 ID tokens are accepted.", 401);
  const jwk = jwks.keys.find((k) => k.kty === "RSA" && (!header.kid || k.kid === header.kid));
  if (!jwk) throw new CampusError("oidc_token", "No matching signing key", 401);
  const key = createPublicKey({ key: jwk as never, format: "jwk" });
  if (!cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) throw new CampusError("oidc_token", "ID token signature is invalid", 401);
  return JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>;
}

/** Step 2: exchange the code, verify the ID token, and return the matched (or provisioned) user. */
export async function finishOidc(store: TenantStore, input: { state: string; code: string; base: string }) {
  const row = store.list("oidc_states", (s) => s.stateHash === sha256(String(input.state ?? "")))[0];
  if (!row || row.usedAt || String(row.expiresAt) < nowIso()) throw new CampusError("oidc_state", "This sign-in link expired. Start again.", 401);
  store.tx(() => store.update("oidc_states", row.id, { usedAt: nowIso() }));
  const idp = idpRow(store, String(row.idpId));
  const d = await discover(String(idp.config.issuer));
  const secretEnv = idp.config.clientSecretEnv ? String(idp.config.clientSecretEnv) : "";
  const secret = secretEnv && /^[A-Z0-9_]+$/.test(secretEnv) ? process.env[secretEnv] : undefined;
  const form = new URLSearchParams({ grant_type: "authorization_code", code: String(input.code ?? ""), redirect_uri: redirectUri(store, input.base), client_id: String(idp.config.clientId), code_verifier: String(row.verifier) });
  if (secret) form.set("client_secret", secret);
  const tr = await fetcher(d.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form.toString() });
  if (!tr.ok) throw new CampusError("oidc_token", `The provider refused the code (${tr.status}).`, 401);
  const tok = (await tr.json()) as { id_token?: string };
  if (!tok.id_token) throw new CampusError("oidc_token", "The provider returned no ID token.", 401);
  const jr = await fetcher(d.jwks_uri);
  const claims = verifyRs256(tok.id_token, (await jr.json()) as { keys: Record<string, unknown>[] });
  const now = Math.floor(nowMs() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
  if (String(claims.iss).replace(/\/$/, "") !== String(idp.config.issuer).replace(/\/$/, "")) throw new CampusError("oidc_token", "Issuer mismatch", 401);
  if (!aud.includes(String(idp.config.clientId))) throw new CampusError("oidc_token", "Audience mismatch", 401);
  if (!(Number(claims.exp) > now - 60)) throw new CampusError("oidc_token", "ID token expired", 401);
  if (claims.nonce !== row.nonce) throw new CampusError("oidc_token", "Nonce mismatch", 401);
  const email = String(claims.email ?? "").toLowerCase();
  if (!email || claims.email_verified === false) throw new CampusError("oidc_email", "The provider didn't share a verified email address.", 403);
  let user = store.list("users", (u) => u.email === email)[0];
  if (!user) {
    if (!idp.jitProvisioning) throw new CampusError("oidc_no_account", "No campus account uses that email. Ask an administrator for access.", 403);
    user = store.tx(() => createUser(store, { name: String(claims.name ?? email.split("@")[0]), email }));
    store.tx(() => store.update("users", user!.id, { idpId: idp.id, idpSubject: String(claims.sub ?? "") }));
  }
  if (user.status !== "active") throw new CampusError("oidc_inactive", "This account is suspended.", 403);
  const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [];
  const mfa = amr.some((x) => ["mfa", "otp", "hwk", "swk", "fido"].includes(x));
  const secretToken = b64url(randomBytes(32));
  store.tx(() => {
    store.insert("sessions", { tokenHash: sha256(secretToken), userId: user!.id, mfa, via: `oidc:${idp.id}`, expiresAt: new Date(nowMs() + 12 * 3600_000).toISOString() }, "ses");
    store.audit({ actorId: user!.id, actorRoles: [], action: "session.create", resource: "session", outcome: "allowed", reason: `oidc:${String(idp.name)}` });
  });
  return { token: secretToken, userId: user.id, next: String(row.next || "") };
}
