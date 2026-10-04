# Staging deployment · havenconnect-stage.oakhavensuites.com

HavenConnect v42 adds a login screen in front of the whole application and is ready to publish as a separate staging site. It adds no tables: the migrations in `drizzle/` are unchanged since v39, and all Agentic AI data lives in the existing `cx_records` / `cx_events` tables.

Keep staging completely separate from production: its own site, its own D1 database, its own R2 bucket and its own secrets. Sample data and grade-approval tests must never touch production records.

## What the login screen does

| Visitor | What they see |
| --- | --- |
| Not signed in | The HavenConnect login screen with a **Sign in with ChatGPT** button. On staging it carries a "Staging environment · test data only" badge and the page is marked `noindex`. |
| Signed in with an `@oakhavensuites.com` email, or listed in `HAVEN_XCONNECT_ADMIN_EMAILS` | The full staff workspace (Messages, Calls, Meetings, Tenant Registry, Agentic AI…) with a **Sign out** link under their initials. |
| Signed in with another email that an administrator added to a product room (for example `@scholarisglobal.com` on the Scholaris room) | Only the Agentic AI rooms they belong to, with a sign-out link. They never see the staff workspace. |
| Signed in with any other email | An "access not granted" screen with a sign-out link to switch accounts. |

Every API applies the same rule on the server, so the page gate is not the only protection.

Sign-in uses the host's Sign in with ChatGPT routes (`/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`). The app never sees passwords. The sign-in only establishes the person's email; the checks above decide what that email may open.

## 1. Create the staging site

1. In your Sites hosting, create a **new site** (or a staging environment of the existing one) from this folder.
   - `.openai/hosting.json` currently names the production project (`project_id`). For a separate staging site, let the hosting create a new project and replace `project_id` with the staging one; keep `"d1": "DB"` and `"r2": "BUCKET"`.
2. Give it a new, empty D1 database and R2 bucket. The builder packages `drizzle/` and applies the migrations.
3. Turn on **Sign in with ChatGPT** for the site (the login button depends on the host serving `/signin-with-chatgpt`).
4. Build and publish. The hosted builder runs `npm run install:ci` then `npm run build` (`scripts/build-verified.sh`).

## 2. Point the subdomain

1. In the staging site's settings, add the custom domain `havenconnect-stage.oakhavensuites.com`.
2. At the DNS provider for `oakhavensuites.com`, add the record the hosting shows. It is usually:

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `havenconnect-stage` | *(target shown by the hosting)* |

   If the hosting also asks for a TXT verification record, add that too.
3. Wait for the HTTPS certificate to issue (usually minutes, up to a few hours after DNS propagates).
4. Optional: record the domain in HavenConnect's Tenant Registry for the staging tenant.

## 3. Secrets

Copy the names from `deploy/staging.env.example` into the staging site's **secrets** (not into a committed file). Minimum to get started:

- `HAVEN_ENVIRONMENT=staging`
- `HAVEN_XCONNECT_ADMIN_EMAILS` — at least one administrator
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) — without it, the AI engine shows "Not connected" and every AI button explains why
- `HAVEN_GRADE_SINGLE_APPROVER=true` only if a single tester must finalize and approve grades (never in production)

Optional for fuller testing: `SCHOLARIS_*` pointing at a Scholaris Global Learning **test** tenant, `HAVEN_INBOUND_SECRET_<PRODUCT>` for each product room that will send messages, and the communications gateway values.

### Dedicated-database rooms

Scholaris Global Learning, OakHaven Global University, MEDIGRID and Haven Trading are set to **dedicated** storage and need their own D1 bindings: `DB_SCHOLARIS`, `DB_OAKHAVEN_GLOBAL_UNIVERSITY`, `DB_MEDIGRID`, `DB_HAVEN_TRADING`. `hosting.json` declares a single D1 binding, so if the hosting doesn't offer extra D1 bindings, those rooms stay closed with a clear message ("uses a dedicated database, but the DB_… binding isn't configured yet"); their data is never written to the shared database. For staging you can instead switch a room to **Shared database, separated by room** in Apps & Rooms. Every other room (Oakhaven Suites, HavenUP, VerveStack, IntelliCore, Haven Agentic AI, HomePilot) works on the shared database straight away.

## 4. Restrict who can reach staging

The login screen already refuses unknown accounts. For a second layer, add a hosting access policy (or IP allowlist) limited to the staging testers.

## 5. Smoke test

From any computer with Node 22+:

```bash
node scripts/staging-smoke.mjs https://havenconnect-stage.oakhavensuites.com
```

It checks, without signing in or writing anything: the site answers over HTTPS; anonymous visitors get the login screen with the sign-in link; the staging badge and `noindex` are present; the host handles `/signin-with-chatgpt`; `/api/agentic-ai` refuses anonymous calls; and the inbound API rejects an unsigned message.

Then, signed in:

1. Sign in with an `@oakhavensuites.com` account → the staff workspace opens; **Sign out** returns to the login screen.
2. Sign in with an account outside Oak Haven that isn't in any room → "access not granted".
3. As an administrator, add that account to one room's members in **Agentic AI → Apps & Rooms**, sign in again → only that room opens.
4. Follow "Requires authenticated staging tests" in `VERIFICATION_REPORT.md` (rooms, grades, inbound, guardrails).
5. Remove sample data from every room before promoting the build to production.

## 6. Promote to production

Publish the same build to the production site. The login screen hides the staging badge automatically on any host other than `havenconnect-stage.*` (or set `HAVEN_ENVIRONMENT=production`). Do not copy `HAVEN_GRADE_SINGLE_APPROVER` to production.
