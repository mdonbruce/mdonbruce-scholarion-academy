# Administrator guide

For school (tenant) administrators. Everything here runs on staging; outside services stay disconnected until configured for a deployment.

## Accounts and roles

- Accounts form a tree (root → schools → departments). Courses belong to an account.
- **Sub-account admins:** grant a person admin rights for one account. They are admins only in courses under that account and its sub-accounts — never tenant-wide, never in the Admin Console. (Admin Console → Sub-account admins.)
- Custom roles and the permission matrix (with locks that sub-accounts can't change) are unchanged.

## Audit and sign-in logs

- **Audit log** filters by type (grade changes, sign-ins, enrollments, courses, content, admin, denied), course, user, outcome, dates and text, and downloads as CSV.
- **Sign-in log** shows successful and failed sign-ins and the number of failures in the last 24 hours.
- Actions taken while acting as another user record both people.

## Account settings

- **Trusted domains** decide which outside sites may be embedded in pages (`video.example.edu`, `*.example.edu`). With none set, any https embed is allowed.
- **IP filters** are named lists of IPv4 addresses or CIDR ranges (`Lab: 10.1.0.0/16`). Teachers apply them to quizzes as `@Lab`.
- **Terms of use** and **privacy policy** links appear in public footers and on the account request form.
- **Self-registration** is off by default. When set to "approval", people can request an account (optionally only from listed email domains); every request waits for an admin or registrar to approve it. The form answers the same way whether or not an email already exists.

## Branding

- Colors are contrast-checked (white text on the primary color must reach 4.5:1).
- **Logo image:** an https image or a campus file link.
- **Custom CSS:** plain rules only, automatically scoped to the campus. Not allowed: `@` rules, `url()`, imports, `content:`, fixed positioning, escapes, or rules for `html`, `body` or `:root`.

## Background jobs

Queue account reports and SIS imports as background jobs. Each shows its state (queued, running, completed, completed with errors, failed), progress and issue list; finished reports download as CSV. The scheduler (or the "Run jobs" operation) works the queue.

## Identity providers

Record SAML, OIDC or LDAP settings. Secrets are never stored: for client secrets and LDAP bind passwords you enter the **name** of a server environment variable. **Live check** tests the provider for real (OIDC discovery and keys, SAML certificate and pin, an LDAP bind over TLS); a provider can only be enabled after a passing check. Campus passwords with two-step verification keep working alongside.

## Retention

Retention policies (Privacy) and the recording retention job remove data on schedule; legal holds block erasure.

## Single sign-on (OpenID Connect)

1. Identity providers → save an OIDC provider: issuer (https), client id, scopes, and `clientSecretEnv` — the **name** of the server environment variable holding the secret (leave it out for public clients using PKCE).
2. Register the redirect URI with your provider: `https://<campus host>/api/campus/v1/t/<school>/auth/oidc/callback`.
3. **Live check** fetches the discovery document and signing keys; then **Enable sign-in**. The sign-in page shows "Sign in with …".
4. People are matched by verified email. Turn on "create users on first sign-in" only if anyone at the provider should get an account.

## Single sign-on (SAML 2.0)

1. Identity providers → save a SAML provider: the IdP entity ID, its single sign-on URL (https), and its signing certificate (PEM). Optionally pin the certificate's SHA-256 fingerprint.
2. Give your IdP the service-provider metadata at `https://<campus host>/api/campus/v1/t/<school>/auth/saml/metadata?idp=<provider id>`. The assertion consumer service is `…/auth/saml/acs` (HTTP-POST).
3. The IdP must sign the **assertion** (RSA-SHA256, exclusive canonicalization) and release an email attribute (`mail`/`email`) or an email-format NameID. Encrypted assertions aren't accepted.
4. **Live check**, then **Enable sign-in**. An AuthnContext of multifactor or a `amr`-style MFA class counts as two-step verification.

Each sign-in is checked for: a request this campus started (single use), the destination, a valid signature over the assertion by the configured certificate, issuer, audience, recipient, time window (two minutes' clock skew) and replay of the assertion ID. Documents with DTDs or entity declarations are refused outright.

## Directory sign-in (LDAP)

1. Identity providers → save an LDAP provider: host, port (636), base DN, user filter with `{username}` (for example `(&(objectClass=person)(uid={username}))`), and optionally a service bind DN with `bindPasswordEnv` (the environment variable name). Add the directory's CA certificate if it isn't publicly trusted.
2. **Live check** connects over TLS and binds as the service account; then **Enable sign-in**. The sign-in page shows a directory username/password form.

The campus searches for the person (the username is always one literal value in the filter, never filter syntax), then binds as them with their password. Empty passwords are refused, repeated failures lock out like campus passwords, and every failure gives the same message.

## Lab terminal: Run in container

Real command execution for lab workspaces runs in a separate **lab runner** service (`runner/`), never in the campus web app. Deploy it on a dedicated host (gVisor recommended) and set `SCHOLARION_RUNNER_URL` and `SCHOLARION_RUNNER_SECRET`. Learners then see **Run in container** next to the simulated terminal. Each command gets a fresh container with no network, a read-only root, uid 1000, CPU/memory/process limits and a time limit taken from the lab's runtime budget; changed files come back and are saved only where the lab policy allows writing. See `runner/README.md`.

## Narration

**Render narration** in the Lecture Studio produces the narrated lecture and deep-dive MP3s, the narrated video overview and one narrated video per requirement (MP4, 1280×720, captions timed to the audio). Voices are offline synthetic voices (ffmpeg with Flite) and every file is labelled as synthetic narration. Rendering runs as a background job; its status shows on the Studio page. Without ffmpeg+Flite each file says what's needed. `SCHOLARION_TTS=off` turns rendering off.

## Account groups

Create groups that span courses (clubs, cohorts) from Groups. "Anyone can join" lets people join themselves; otherwise add members.
