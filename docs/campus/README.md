# Scholarion Campus

Multi-tenant SIS + LMS + ERP layer of Scholarion: tenant isolation, identity and policy, LMS parity (modules, assignments, quizzes, gradebook, sequential grader, discussions, calendar, inbox, blueprints…), SIS (admissions, registration, records, finance), governed AI, the Cloud Lab (LTI 1.3), catalog/pathways/sandbox commerce, credentials and the control plane — **48 tabs**, all operational in local and staging.

> Local + staging only. All people, schools and records are fictional demonstration data. Payments are sandbox only. No accreditation or outcome claims.

## Tenants

| Tenant | Slug | Kind | Notes |
|---|---|---|---|
| Scholarion Demo University | `demo` | guest (university template) | Terms, sections, credit, aid, marketplace on |
| Scholaris AI Academy | `academy` | guest (academy template) | Catalog-first: programs #1, #5, #15, #20, #32, #38; cohorts; sandbox commerce; tutor language modes |
| TechDev Institution | `techdev` | internal | Placement sync, live connectors, platform operators |

Each tenant has its own store (one database per tenant in production — `db/campus/001_tenant.sql`); the control plane (`db/campus/000_control_plane.sql`) holds no learner data. More tenants are created from templates (academy, university, school, corporate) in the **Tenant Console**.

## Run it

```bash
npm install
npm run dev                # http://localhost:3000/campus
```

- Pick a school at `/campus`, then sign in. Every demo account uses the password `Scholarion-demo-1`:
  `admin@demo.scholarion.test`, `instructor@…`, `ta@…`, `designer@…`, `registrar@…`, `advisor@…`, `support@…`, `student1@…` … `student6@…`, `parent@…` (same pattern for `academy` and `techdev`; `ops@techdev.scholarion.test` is a platform operator).
- Admins, registrars, support staff and operators need a two-step code: add the demo secret `JBSWY3DPEHPK3PXP` to any authenticator app.
- `SCHOLARION_PERSIST=1` keeps campus data in `.data/campus/` between restarts. `CLOUDLAB_LOCAL_RUNNER=1` runs lab code locally (Python, time/memory limits, no network).

## Interfaces

| Interface | Where |
|---|---|
| Web UI | `/campus/{tenant}/…` — dashboard, courses, calendar, inbox, notifications, search, account and `/t/{tab}` for every tab |
| REST | `/api/campus/v1/t/{tenant}/r/{resource}[/{id}]` — Link-header pagination, `ETag`/`If-Match` (412), `?as_user_id=` act-as for admins (audited) |
| Operations | `GET /q/{name}` (queries) and `POST /a/{name}` (commands) — 259 workflow operations |
| GraphQL | `POST /api/campus/v1/t/{tenant}/graphql` |
| OpenAPI | `/api/campus/v1/t/{tenant}/openapi.json`, committed in `contracts/campus/v1/openapi.json` |
| gRPC (internal) | `npm run campus:grpc` — `contracts/campus/v1/campus.proto` |
| LTI 1.3 | JWKS, OIDC configuration, OAuth2 client credentials, AGS, NRPS, deep linking, dynamic registration |
| Feeds | iCal (`/api/campus/ical/…`), podcasts, Prometheus metrics (`/api/campus/metrics`) |

## Tests

```bash
npm test                   # includes every campus suite below
npm run campus:render      # render every screen (preview/campus/)
npm run campus:a11y        # axe on the rendered screens (needs playwright + chromium)
npm run campus:docs        # regenerate schemas, OpenAPI, runbooks, threat model, status board
```

- `tests/campus-master.test.ts` — master build acceptance 1–16
- `tests/campus-parity.test.ts` — LMS parity acceptance 1–14 (15 = the axe gate)
- `tests/campus-platform.test.ts` — platform scenario 1–11
- `tests/campus-security.test.ts` — authorization matrix and negative cross-tenant suite
- `tests/campus-api.test.ts` — REST, GraphQL, gRPC, OAuth2, LTI, webhooks, OneRoster
- `tests/campus-ui.test.ts`, `tests/campus-naming.test.ts`, `tests/campus-contracts.test.ts`

## Documents

- [Status board](STATUS.md) — every tab and capability with LIVE / CONNECTED / DISABLED / SIMULATED / PLANNED and evidence
- [Runbooks](runbooks.md) — one per tab
- [Threat model](../threat-models/campus.md)

## Code map

```
src/campus/core.ts           tenants, broker (per-tenant stores), outbox + idempotent consumers, audit, metrics
src/campus/iam.ts            actors, sessions, TOTP, role grants, support grants, act-as
src/campus/permissions.ts    permission matrix with account inheritance and locks
src/campus/registry.ts       154 resources and 48 tabs (fields, permissions, runbooks, threats)
src/campus/entity.ts         generic CRUD with authorization, validation, publish checks, tombstones
src/campus/services/*        domain services (curriculum, assessment, grading, sis, ai, lti, academy, tutor, platform…)
src/campus/http/*            REST router, operations registry, OpenAPI, GraphQL, gRPC
src/campus/ui/*              server-rendered UI (shell, kit, views)
src/campus/seed.ts           demonstration data for the three tenants
```
