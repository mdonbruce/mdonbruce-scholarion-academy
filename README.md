# Scholarion Academy

The public website, learner app and BFF for **Scholarion Academy** — "Learn. Earn. Build Your Future." Built on the Scholarion platform per the *Master Build Prompt* and the *Platform Integration Spec*.

This is the **Phase 1 + integrations** build, plus Scholarion for Teams, course discussions, peer review, live program admissions with payment plans, and account security & privacy (email confirmation, password reset, two-step sign-in, data export and account deletion). Phase 1 screens are complete. All nine platform connections — Catalog & Pathways, Commerce, LMS, Cloud Lab, AI Tutor, Credentials, Studio, HavenConnect/HavenRoute, and the Zoom/Webex live engine — are wired end to end against in-process stand-ins. Every stand-in reports **SIMULATED** on the status board until its real service is connected.

## Run it

Requires Node 20.11+ (and Python 3 for the local Cloud Lab runner).

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
npm test               # 32 acceptance + API tests (node:test, no browser needed)
npm run smoke          # page + flow checks against a running server (CI runs it after next build)
npm run build          # production build (type-checks)
```

### Demo accounts (development only — hidden when NODE_ENV=production)

| Role | Email | Password |
| --- | --- | --- |
| Learner (Plus annual, live seat in #26, three courses in progress) | `amara@demo.scholarion.test` | `LearnEarnBuild1` |
| Admin, reviewer, instructor, support (two-step sign-in on; the development sign-in page shows the current code, or add key `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` to an authenticator app) | `admin@demo.scholarion.test` | `ScholarionAdmin1` |
| Instructor | `faculty@demo.scholarion.test` | `ScholarionFaculty1` |
| Auditing learner with an aid application in review | `tunde@demo.scholarion.test` | `LearnEarnBuild2` |
| Organization admin, Brightpath Health (demo) | `orgadmin@demo.scholarion.test` | `ScholarionTeams1` |
| Brightpath learner (joined by organization sign-in) | `kemi@brightpath.example` | `LearnEarnBuild3` |
| Not yet a member — sees "Sign in with Brightpath" | `chidi@brightpath.example` | `LearnEarnBuild4` |
| Graduate holding the Agentic AI Foundations badge (certificate PDF, verified review) | `ngozi@demo.scholarion.test` | `LearnEarnBuild5` |

State persists to `.data/db.json` when `SCHOLARION_PERSIST=1`. Run `npm run db:reset` to start fresh.

## Try the flows

1. **Search and audit:** open Explore and search *agentic ai* with *Free to audit* and *Beginner*. Open Agentic AI Foundations, choose *Audit for free*, and play a lesson (captions, transcript, speed). Quizzes and labs show the plain-language upgrade explanation.
2. **Plus trial:** as a new user, choose *Start free trial*. Checkout shows the price, renewal date, cancel path and refund terms before you confirm. Then go to *Staff → Sandbox clock*, advance 6 days, and see the trial reminder in *Notifications*. Cancel from *Account & Billing* in one click.
3. **Lab to credential:** as Amara, open COP1047C → Module 5 → Mini Lab 2 → *Open in Code Editor*. Solve it and submit: the hidden tests run and the grade lands in the gradebook. Credentials issue automatically when a course is passed; verify any one at `/verify/{id}`.
4. **Financial aid:** as admin, open *Staff → Financial aid*, approve Tunde's application, and see the entitlement and email.
5. **Live:** as Amara, open *Live Sessions* to see 40-minute segment cards. As admin, record attendance under *Staff → Live sessions*.
6. **Integrity:** in any graded quiz the AI Tutor is off. In a lab, ask the tutor to *write the code* and it refuses with a hint and citations.
7. **Teams:** sign in as the organization admin and open *My Organization*: seats, the curated academy, progress per person, invitations, organization sign-in and CSV export. Sign in as Chidi to join with organization sign-in. The Riverbend Logistics organization is never visible to Brightpath.
8. **Peer review:** as Amara, submit the Module 5 mini project, then review the two waiting classmates. Grades post when two reviews are received and two given; if reviewers disagree by more than 25% of the maximum, the project goes to *Staff → Grading*.
9. **Discussions:** post and reply on the Module 5 discussion; report a post; hide it under *Staff → Moderation*.
10. **Live admissions:** as Tunde, open the #15 live program and choose *Apply*. As admin, accept it under *Staff → Admissions*. Back as Tunde, reserve the seat in full or in 3 monthly installments; onboarding then appears in *Live Sessions*. Advance the sandbox clock to see each installment charged.
11. **Security & privacy:** open *Security & Privacy* to turn on two-step sign-in, change your password, sign out everywhere, download your data as JSON, or delete your account. *Forgot password?* on the sign-in page emails a one-hour reset link (in the sandbox, open it from the HavenRoute outbox on the *Staff* home page). With `NODE_ENV=production` (or `REQUIRE_ADMIN_MFA=1`), platform admins must turn on two-step sign-in before any staff tool opens.
12. **Verified reviews and certificate PDF:** sign in as Ngozi (the graduate). *Credentials* has *Download PDF* (a printable certificate with a QR code to the verification page) and *Review this program*. Reviews come only from credential holders; links, contact details or flagged claims hold a review for *Staff → Moderation*. The product page shows the rating, and its structured data includes it, only once real reviews exist.
13. **Course builder:** as the instructor (or admin), open *Teach*, create a draft, add a module and items (reading, captioned video, quiz, lab with tests and a reference solution, project rubric). The checklist on the right lists everything blocking publication, including uncaptioned videos, short quizzes, labs whose reference solution fails its tests, and any credit, salary, outcome or institution claim. Submit for review; a reviewer approves under *Staff → Course reviews* and the course goes live. *Analytics* then shows completion per item and per-question difficulty.
14. **Claims checker:** *Staff → Claims checker* blocks degree, credit, salary and unregistered-partner claims. `/degrees` returns 404.

## Architecture

```
Browser ──► Next.js pages (SSR) ──► BFF read models   (src/bff/views.ts)
        └─► /api/v1/* ───────────► BFF router         (src/bff/api.ts)
                                      │  session, CSRF origin check, role + entitlement checks
                                      ▼
                         Platform façade (src/platform/index.ts)
     identity · entitlements · catalog · commerce · lms · cloudlab · tutor
     credentials · studio · cx/havenroute · live · partners
                                      │
                         Event bus (CloudEvents, idempotent consumers)
```

- **The site owns no records.** Each service owns its collections. The BFF talks only to the façade, so connecting a real service means swapping that module for an HTTP/gRPC client with the same types (`src/platform/types.ts`). See `docs/adr/0001-bff-and-platform-stand-ins.md`.
- **Entitlements decide access** (`entitlements.check(user, action, resource)`). Pages never infer access from plan names.
- **Events carry ids, not PII.** HavenRoute turns events into emails (shown under *Notifications* and the admin outbox; nothing is sent).
- **Credentials** are Open Badges 3.0-shaped W3C VCs signed with Ed25519. The verify page re-checks the signature on every view. The production issuer must use a conformant Data Integrity library (see the note in `credentials.ts`).
- **Cloud Lab local runner** executes learner Python on the dev machine with a timeout and resource limits. It is **not isolated** — development only. Set `CLOUDLAB_LOCAL_RUNNER=0` anywhere shared.
- **Reference schema:** `db/schema.sql` (PostgreSQL 16, per-service schemas, row-level security on tenant data, pgvector for the tutor).

## Honesty rules enforced in code

- Prices are sandbox placeholders from env vars. There are no fake discounts, ratings, learner counts or salary figures.
- Partner names, credit and degree claims render only from the Partner Registry (empty), and the claims checker blocks them in copy.
- Degrees are hidden (`/degrees` → 404; DB constraint keeps `degree` products hidden).
- Credentials say *non-credit professional training*.

## Project layout

```
src/app/            Next.js routes (thin: session + read model + view)
src/bff/            BFF router, read models, HTTP helpers, session
src/platform/       Service stand-ins, event bus, seed data, types
src/ui/             Design system CSS, components, client islands, views
tests/              Acceptance and API tests (node:test via tsx)
db/schema.sql       Reference PostgreSQL schema
scripts/            Preview renderer, data reset
docs/               Integration notes and ADRs
```

## Status board

| Connection | Phase | Status |
| --- | --- | --- |
| Identity & Entitlements | 1 | SIMULATED |
| Catalog & Pathways | 1 | SIMULATED |
| LMS | 1 | SIMULATED |
| Commerce (sandbox) | 2 | SIMULATED |
| Credentials & verification | 2 | SIMULATED |
| Cloud Lab | 3 | SIMULATED (local runner) |
| AI Tutor | 3 | SIMULATED |
| Studio outputs | 3 | SIMULATED |
| HavenConnect CX + HavenRoute | 4 | SIMULATED |
| Zoom/Webex live engine | 4 | SIMULATED |
| Teams & organizations | 4 | SIMULATED (SAML/OIDC SSO and SCIM planned) |
| Discussions & peer review | 3 | SIMULATED |
| Live admissions & payment plans | 3 | SIMULATED |
| Account security & privacy | 1 | SIMULATED (email via HavenRoute outbox) |
| Instructor course builder | 3 | SIMULATED |
| Verified reviews & certificate PDF | 3 | SIMULATED |
| Partner Registry features | 5+ | PLANNED |
| Degrees | 5+ | PLANNED |

## Open decisions for the product owner

- Final prices, trial length and refund window (`.env` placeholders)
- Event bus (Kafka or NATS JetStream) and search engine (Meilisearch, OpenSearch or Algolia)
- Cloud Lab GPU quota per plan; AI Tutor quota for audit learners
- Primary live provider (Zoom or Webex); launch regions, currencies and tax registration
- Financial-aid review timeline and approval policy
- Legal review of auto-renewal and consumer-protection terms before go-live
