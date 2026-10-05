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

Record SAML, OIDC or LDAP settings (no secrets — client secrets and bind passwords belong in the deployment's secret manager; LDAP must use TLS). **Check configuration** confirms required fields. Providers stay "not connected": people sign in with campus passwords and two-step verification until a deployment connects one.

## Retention

Retention policies (Privacy) and the recording retention job remove data on schedule; legal holds block erasure.

## Single sign-on (OpenID Connect)

1. Identity providers → save an OIDC provider: issuer (https), client id, scopes, and `clientSecretEnv` — the **name** of the server environment variable holding the secret (leave it out for public clients using PKCE).
2. Register the redirect URI with your provider: `https://<campus host>/api/campus/v1/t/<school>/auth/oidc/callback`.
3. **Live check** fetches the discovery document and signing keys; then **Enable sign-in**. The sign-in page shows "Sign in with …".
4. People are matched by verified email. Turn on "create users on first sign-in" only if anyone at the provider should get an account.

SAML and LDAP records are configuration only in this release.

## Account groups

Create groups that span courses (clubs, cohorts) from Groups. "Anyone can join" lets people join themselves; otherwise add members.
