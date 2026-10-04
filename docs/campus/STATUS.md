# Scholarion Campus — status board

Generated 2026-10-04 by `scripts/campus-docs.ts`. Environment: local + staging only (demonstration data, sandbox payments).

**Capabilities:** 37 LIVE · 0 CONNECTED · 3 SIMULATED · 8 DISABLED · 6 PLANNED

## Tabs (66)

A tab is OPERATIONAL when it has persisted resources, enforced authorization, audited writes, an API surface (REST + operations + GraphQL), a working screen, and a passing test. Tabs that depend on outside services report the connector state honestly.

| # | Tab | Group | Status | Evidence |
|---|---|---|---|---|
| 1 | Identity & Access | Foundations | OPERATIONAL | master 2, security suite |
| 2 | Curriculum | Teaching & Learning | OPERATIONAL | parity 1, master 3 |
| 3 | Enrollment | Teaching & Learning | OPERATIONAL | master 4 |
| 4 | Assessment | Teaching & Learning | OPERATIONAL | parity 5, master 5 |
| 5 | Gradebook | Teaching & Learning | OPERATIONAL | parity 3/4/8, master 6 |
| 6 | Collaboration | Teaching & Learning | OPERATIONAL | parity 7/12 |
| 7 | Files & Media | Teaching & Learning | OPERATIONAL | master 5 |
| 8 | Analytics | Student Success | OPERATIONAL | master 8 |
| 9 | Integration | Platform | OPERATIONAL | API tests (OneRoster, webhooks, LTI) |
| 10 | Admissions | Student Information | OPERATIONAL | master 12 (holds), registration UI |
| 11 | Registration & Records | Student Information | OPERATIONAL | master 12 |
| 12 | Financial Aid & Accounts | Student Information | OPERATIONAL | platform commerce test |
| 13 | Calendar & Scheduling | Teaching & Learning | OPERATIONAL | parity 2 |
| 14 | Live Classroom & Attendance | Teaching & Learning | OPERATIONAL (Zoom connector SIMULATED) | connector status test |
| 15 | Outcomes & Evidence | Student Success | OPERATIONAL | parity 6, mastery gradebook |
| 16 | Student Success & Advising | Student Success | OPERATIONAL | master 8 |
| 17 | Course Evaluations & Surveys | Student Success | OPERATIONAL | survey service |
| 18 | Credentials & ePortfolio | Student Success | OPERATIONAL | platform 3, credential tests |
| 19 | Careers & Placement | Student Success | OPERATIONAL | master 16 |
| 20 | Notifications & Preferences | Platform | OPERATIONAL | parity 11 |
| 21 | Global Search | Platform | OPERATIONAL | security suite (ACL) |
| 22 | AI Agent Control Center | Intelligence | OPERATIONAL | master 9/13, platform 6 |
| 23 | AI Curriculum Engine | Intelligence | OPERATIONAL | master 13 |
| 24 | Cloud Lab (LTI 1.3) | Teaching & Learning | OPERATIONAL | master 14, parity 14, platform 5 |
| 25 | Admin Console | Platform | OPERATIONAL | parity 13, act-as tests |
| 26 | Privacy & Compliance | Platform | OPERATIONAL | master 15 |
| 27 | Help Desk & Support | Platform | OPERATIONAL | authorization matrix (support grants) |
| 28 | Operations & Observability | Platform | OPERATIONAL | platform 11, master 11 |
| 29 | Marketplace | Platform | OPERATIONAL (behind flag) | flagged; install approval flow |
| 30 | Mobile & Offline | Platform | OPERATIONAL | offline draft conflict flow |
| 31 | Accommodations | Added | OPERATIONAL | parity 5 |
| 32 | People & Groups | Added | OPERATIONAL | UI + group services |
| 33 | Library & Reading Lists | Added | OPERATIONAL | UI |
| 34 | Reports & Exports | Added | OPERATIONAL | report runs |
| 35 | Dashboard & Planner | Added | OPERATIONAL | UI render test |
| 36 | Mastery Paths, Assign-To & Pacing | Added | OPERATIONAL | pacing service |
| 37 | Copy, Import, Blueprints & Sharing | Added | OPERATIONAL | parity 9/10 |
| 38 | Developer Keys & API | Added | OPERATIONAL | API tests (OAuth2, tokens, rate limits) |
| 39 | Observers & Family | Added | OPERATIONAL | parity 11, master 7 |
| 40 | Account & Profile | Added | OPERATIONAL | UI render test |
| 41 | Catalog & Hub | Academy & Commerce | OPERATIONAL | platform 2/10 |
| 42 | Pathways & Transfer | Academy & Commerce | OPERATIONAL | platform 4 |
| 43 | Commerce (sandbox) | Academy & Commerce | OPERATIONAL | platform 3 + commerce policy test; plans suite (trial disclosures and reminders, one-step cancel at period end, annual refund window, program plans, pause, financial aid with human decision) + platform commerce test |
| 44 | AI Tutor | Intelligence | OPERATIONAL | platform 6 |
| 45 | Lab Key Vault | Teaching & Learning | OPERATIONAL | platform 5 |
| 46 | Tenant Console | Platform | OPERATIONAL | platform 1/7/9 |
| 47 | Connectors | Platform | OPERATIONAL | status board test |
| 48 | Capability Status | Platform | OPERATIONAL | status board test |
| 49 | Proctored Assessment Support | Student Success | OPERATIONAL | proctor suite (10 tests) |
| 50 | Program Studio | Academy & Commerce | OPERATIONAL | programs suite (Tab 50) |
| 53 | Assessment & Project Studio | Intelligence | OPERATIONAL | labs suite (Tab 53: generators, approvals, QTI, simulated labs) |
| 54 | Agentic Cloud Labs | Intelligence | OPERATIONAL | labs suite (Tab 54: workspaces, bounded autonomous runner, permissions, run logs, rubric grading, 2 attempts) |
| 55 | Hosted Learning Area (Agentic Cloud Labs) | Intelligence | OPERATIONAL | learning-area suite (Tab 55: 15 sections, workspaces, practice vs graded, idempotent submit and posting, infra failure, Check Answers, passbook, projection lock, protected downloads) |
| 56 | Course Studio (Master Studio Generator) | Intelligence | OPERATIONAL | studio suite (Tab 56: sources, resumable pipeline, 10-slide deck, folder tree, release gate, honest media status) + learning-area suite |
| 57 | Free Education Resource Hub | Intelligence | OPERATIONAL | ecosystem suite (Tab 57: seeded verified catalog, schema validation, filters, live blocks, mappings, connections) |
| 58 | Career Connect & Employer Portal | Student Success | OPERATIONAL | ecosystem suite (Tab 58: opt-in talent search, consent contact, idempotent applications, partner rule) |
| 59 | Auto-Discovery & Workflow Automation | Platform | OPERATIONAL | ecosystem suite (Tab 59: terms review, link checks, dedupe, retries/dead-letter, missed runs, API v1) |
| 63 | Governed Service Bridge | Platform | OPERATIONAL | governed suite (Tab 63: crosswalk modules exist, loopback probes with no credentials, staff only) |
| 64 | Departments & Policy Rules | Student Information | OPERATIONAL | governed suite (Tab 64: holds, refunds, identity results, fail-closed policy, synthetic non-executing previews) |
| 65 | Voice & Digital Human Studio | Intelligence | OPERATIONAL | governed suite (Tab 65: persona replies and language switch, status labels, licence gate, consent separation of duties and revocation, moderation, immutable storyboards) |
| 66 | Operational Acceptance | Platform | OPERATIONAL | governed suite (Tab 66: unverified evidence, different verifier, sign-offs, production never allowed) |
| 62 | CX & Live Sessions Hub | Platform | OPERATIONAL | comms suite (Tab 62: segmentation table, pre-created meetings, Session Card, reminders, 33-minute warning, next link, recap approval, support agent with disclosure, failover, link regeneration, segment attendance, captioned recordings, Genesys checklist/licences/mock suite) |
| 61 | Curriculum & Course Intelligence | Intelligence | OPERATIONAL | cci suite (Tab 61: exchange pipeline with learner-data block, design studio overlap, alignment heatmap, human-loaded standards packs as evidence for review, course health, item analysis, freshness tickets, accessibility audit, proposal workflow with separation of duties, report downloads) |
| 60 | Program Marketing & Campaigns | Academy & Commerce | OPERATIONAL | campaigns suite (Tab 60: DST-aware 18-session schedule, flyers with the approved photo and no invented meeting details, Copy Checker on every asset, opt-in sends held without a provider, unsubscribe, manual channels, program folder export) |
| 52 | Module Library & Catalog Consolidation | Academy & Commerce | OPERATIONAL | agentic suite (Tab 52: hub, library, policies, consolidation) |
| 51 | LMS Parity Status | Platform | OPERATIONAL | programs suite (Tab 51) |

## Capabilities

| Area | Capability | Status | Evidence | Blockers |
|---|---|---|---|---|
| Tenancy | Per-tenant stores, verified-host resolution, deny before data access | LIVE | cross-tenant suite (tests/campus-*.test.ts) | — |
| Tenancy | Tenant templates, provisioning, suspend/resume/offboard | LIVE | platform acceptance 1 (tests/campus-*.test.ts) | — |
| Tenancy | Backups and restore drill into a validation tenant | LIVE | restore drill test (tests/campus-*.test.ts) | — |
| Tenancy | Domain verification (DNS TXT) | LIVE | domain test with a fake resolver (tests/campus-*.test.ts) | — |
| Identity | Password + TOTP sign-in, lockout, sessions, act-as with audit | LIVE | identity tests (tests/campus-*.test.ts) | — |
| Identity | RBAC + ABAC, permission matrix with locks, support grants | LIVE | authorization matrix (tests/campus-*.test.ts) | — |
| Identity | External SSO federation | SIMULATED | Tenant realms use local password + TOTP sign-in; external IdP federation isn't connected. | Needs the provider account, credentials and network access (go-live decision). |
| LMS | Modules, prerequisites, sequential locking, Mastery Paths, assign-to | LIVE | parity acceptance (tests/campus-*.test.ts) | — |
| LMS | Assignments, submissions, late/missing policies, peer review | LIVE | parity acceptance (tests/campus-*.test.ts) | — |
| LMS | Gradebook, posting policies, history, What-If, CSV, mastery | LIVE | parity acceptance (tests/campus-*.test.ts) | — |
| LMS | Quiz engine, item banks, accommodations, moderation, regrade | LIVE | quiz tests (tests/campus-*.test.ts) | — |
| Assessment | Proctored-assessment setup assistant (approved talking points only, accommodations routing, escalation with response time, redacted log) and the pre-test checklist gate | LIVE | proctor suite (tests/campus-*.test.ts) | — |
| Assessment | Remote proctoring vendor (live webcam / ID verification) | DISABLED | Quizzes can reference a proctoring LTI tool; no vendor is connected in staging. Scholarion never collects ID images. | Needs a proctoring vendor agreement, an LTI registration and a go-live decision. |
| LMS | Discussions with checkpoints, announcements, inbox | LIVE | collaboration tests (tests/campus-*.test.ts) | — |
| LMS | Calendar, scheduler, pacing, iCal | LIVE | calendar tests (tests/campus-*.test.ts) | — |
| LMS | Blueprints, copy with date shift, package import/export (CC + QTI) | LIVE | content tests (tests/campus-*.test.ts) | — |
| SIS | Admissions, registration → enrollment projection, reconciliation, holds, transcript | LIVE | master acceptance (tests/campus-*.test.ts) | — |
| Catalog | Product types, catalog hub, recommender, Catalog Copy Checker | LIVE | platform acceptance 2–3, 10 (tests/campus-*.test.ts) | — |
| Catalog | Academy program pages (#1, #12, #13, #14, #26) generated from catalog data, brochure PDF, apply → admission → sandbox seat, inquiries, prerequisite self-check, pass/no-pass completion | LIVE | programs suite (tests/campus-*.test.ts) | — |
| Catalog | Agentic AI hub (tabs, filters, rails from real data, learning paths, 9-question quiz, comparison, credential explainer, ItemList JSON-LD); programs #15–#25 and self-paced #28–#38 with batches, pay-later, audit access, autograded Cloud Lab notebooks, stacking certificates | LIVE | agentic suite (tests/campus-*.test.ts) | — |
| Curriculum | Assessment & Project Studio: labs, in-class activities, quizzes with 3× item banks (QTI 2.1), practice exercises, mini-projects, real-world projects and senior capstones — Four Project Pillars, alignment tables, student/instructor editions, AI DRAFT with two-person approval; simulated Student/Instructor labs (10-question worksheet, instructor control panel) and application demos | LIVE | labs suite (Tab 53) (tests/campus-*.test.ts) | — |
| Cloud Lab | Agentic Cloud Labs: saved workspaces with history, bounded autonomous agent runner (declarative agent specs; nothing learner-written is executed), per-tool permissions with violation tracking, operational run logs, rubric auto-grading posted to the gradebook with pass/no-pass, two graded attempts (best counts) | LIVE | labs suite (Tab 54) (tests/campus-*.test.ts) | — |
| Cloud Lab | Hosted learning area (Tab 55): 15 course sections; persistent simulated workspaces (files, editor, simulated terminal over a virtual filesystem, run/stop/reset/save/resume, autosave, snapshots, usage and budget); bounded autonomous agent runs with the policy enforced outside the model; two graded attempts with unlimited practice, frozen rubric versions, idempotent submit and posting with retry, Check Answers after grading, competency passbook, projection lock | LIVE | learning-area suite (tests/campus-*.test.ts) | — |
| Cloud Lab | Real code execution in isolated containers (Python, Docker, Kubernetes) for learner workspaces | PLANNED | Simulated shell and declarative agent specs only; nothing learners write is executed | Container runner, isolation review and owner approval. |
| Curriculum | Course Studio (Tab 56): source-grounded topic packages in the 01_Sources … 13_Environment_Templates folder tree — 10-slide deck with notes, notes, study guide, mind map, infographic, 20+ flashcards, practice quiz, two mini-labs with server-side checks, environment templates, rubrics, cover variants A/B with the approved faculty photograph, QA report, manifest, protected instructor files, release gate | LIVE | studio suite (tests/campus-*.test.ts) | — |
| Curriculum | Narrated audio lecture, two-host deep dive and narrated MP4 videos | PLANNED | Scripts, transcripts, captions and storyboards generated; silent 1280×720 preview rendered with ffmpeg when enabled; narration marked awaiting rendering | Text-to-speech provider and media renderer. |
| Catalog | Free Education Resource Hub (Tab 57): evidence-backed catalog of free tools, open courses and readings (initial catalog researched from official provider pages 2026-10-04; unverified claims stay pending), availability classes, API access tracked separately, live classroom blocks within verified free meeting limits, course mappings, bookmarks, What's New | LIVE | ecosystem suite (tests/campus-*.test.ts) | — |
| Careers | Career Connect & Employer Portal (Tab 58): verified employer onboarding, partner label only after a recorded relationship, opt-in learner profiles with per-field visibility, explainable matching from passbook evidence, learner-initiated applications, consent-based contact | LIVE | ecosystem suite (tests/campus-*.test.ts) | — |
| Platform | Auto-Discovery (Tab 59): cron schedules in America/New_York, durable jobs with unique period keys, leases, budgets, checkpoints, backoff with jitter, dead-letter, run-now/pause/resume; trusted-source adapters (official pages, RSS/Atom, Greenhouse public job boards); Integration JSON Schema (Draft 2020-12) with semantic checks; REST API v1 | LIVE | ecosystem suite (tests/campus-*.test.ts) | — |
| Platform | Live outbound fetching for discovery jobs in staging | PLANNED | Adapters, scheduler and job engine are tested against a fixture network | Egress to the trusted provider hosts from the staging runtime; job-board sources (e.g. a Greenhouse board token) chosen by the owner. |
| Careers | External job-board APIs (LinkedIn, Indeed, Handshake) and email/SMS delivery | PLANNED | Not connected; in-site notifications only | Partner API agreements and credentials; an authorized notification service. |
| Catalog | Shared module library, policy approval gate (refund / deferral / batch change) and catalog consolidation report with product-owner decision | LIVE | agentic suite (Tab 52) (tests/campus-*.test.ts) | — |
| Pathways | Prerequisite / stacks / waives / mutually-exclusive rules, transfer credit, consolidation report | LIVE | platform acceptance 4 (tests/campus-*.test.ts) | — |
| Commerce | Checkout, coupons, installments, subscriptions, seats, invoices, refunds | SIMULATED | Sandbox only; policy engine tested | Payment provider and go-live decision. |
| Credentials | Open Badges 3.0 / VC signing, verification portal, revocation, reissue, CLR, honesty guard | LIVE | credential tests (tests/campus-*.test.ts) | — |
| AI | Governed agents, eval gates, review queue, audit | LIVE | AI tests (tests/campus-*.test.ts) | — |
| AI | AI Tutor: cited answers, refusals with hints, study plans, practice, escalation, erasable memory | LIVE | platform acceptance 6 (tests/campus-*.test.ts) | — |
| AI | External model providers | DISABLED | AI features use the local extractive engine; the lab key proxy answers with a labelled simulator. | Needs the provider account, credentials and network access (go-live decision). |
| AI | Amara / Tunde avatar mode | DISABLED | Tutor avatar mode falls back to text with captions and a transcript, always with AI disclosure. | Needs the provider account, credentials and network access (go-live decision). |
| Cloud Lab | LTI 1.3 launch, AGS passback (unposted), NRPS, deep linking, dynamic registration | LIVE | platform acceptance 5 (tests/campus-*.test.ts) | — |
| Cloud Lab | Sandboxed Python runner | DISABLED | Python runs locally with time and memory limits and no network (development runner). | Enable on the server. |
| Cloud Lab | GPU templates (PyTorch / TensorFlow) | PLANNED | PyTorch/TensorFlow templates are defined and pinned; GPU execution needs a container cluster. | Needs the provider account, credentials and network access (go-live decision). |
| Cloud Lab | Learner API-key vault with caps, rate limits, expiry | LIVE | key vault tests (tests/campus-*.test.ts) | — |
| Analytics | Learning, program, commerce (sandbox), AI and ops analytics; de-identified platform metrics | LIVE | analytics tests (tests/campus-*.test.ts) | — |
| Integrations | Zoom live classroom | DISABLED | Scheduling, join links and attendance import run against a sandbox connector; no calls reach Zoom from staging. | Needs the provider account, credentials and network access (go-live decision). |
| Integrations | HavenConnect agents | DISABLED | Registration guide and support triage run in-house (read-only drafts) until connected. | Needs the provider account, credentials and network access (go-live decision). |
| Integrations | HavenRoute email | DISABLED | Email notifications are recorded in the delivery log; in-app notifications are live. | Needs the provider account, credentials and network access (go-live decision). |
| Integrations | OneRoster 1.2, webhooks (signed, retry, DLQ), OAuth2, developer keys | LIVE | integration tests (tests/campus-*.test.ts) | — |
| Integrations | Outbound webhook HTTP | SIMULATED | Signed deliveries with retry and dead-letter; outbound HTTP is off in staging (local sink receives them). | Enable on the server. |
| Integrations | TechDev placement sync | DISABLED | Consenting profiles sync to the separate placement database (internal tenant only). | Enable on the server. |
| Platform | REST + OpenAPI, GraphQL, gRPC (internal), metrics, audit, outbox | LIVE | API tests (tests/campus-*.test.ts) | — |
| Platform | Content licensing between tenants (content only) | LIVE | platform acceptance 7 (tests/campus-*.test.ts) | — |
| Platform | Offboard purge after retention window | PLANNED | Runbook manual step today | Needs a scheduled purge job with operator approval. |
| Naming | Legacy platform names migrated to Scholarion (no old names in code, docs or data) | LIVE | naming check test (tests/campus-*.test.ts) | — |

## Acceptance results

- Master build scenario 1–16: `tests/campus-master.test.ts` — all pass.
- LMS parity 1–14: `tests/campus-parity.test.ts` — all pass. Parity 15 (accessibility gate): `scripts/campus-a11y.mjs` runs axe (WCAG 2.0/2.1/2.2 A+AA) on every rendered screen in CI.
- Platform scenario 1–11: `tests/campus-platform.test.ts` — all pass.
- Tenant isolation and authorization: `tests/campus-security.test.ts` (authorization matrix + negative cross-tenant suite).
- APIs: `tests/campus-api.test.ts` (REST, Link pagination, ETag/412, act-as, OAuth2, rate limits, GraphQL, OpenAPI, gRPC, LTI AGS/NRPS, webhooks, OneRoster, iCal, metrics).
- Every tab renders for its users: `tests/campus-ui.test.ts`.

## AI evaluation results

Every agent's active policy passed the evaluation suite (refusal of graded work, grade changes, other people's data and prompt injection; no answer without sources; never writes grades; bounded citations; tenant-scoped retrieval; human review for drafting agents). The engine is local extractive retrieval — no external model is called.

## Naming migration

- [x] Platform name is Scholarion everywhere (code, docs, contracts, data). Checked by `tests/campus-naming.test.ts`.
- [x] The guest university tenant is **Scholarion Demo University**; the internal tenant is **TechDev Institution**; the first-party academy tenant is **Scholaris AI Academy**.

## Open risks and decisions for the product owner

1. Outside services (Haven avatars/HavenConnect/HavenRoute, model providers, Zoom API, GPU pools, SSO federation, payments) need accounts, credentials and network access — kept DISABLED/SIMULATED until the go-live decision.
2. Stores are in-memory with optional JSON persistence; production needs the generated Postgres schema (`db/campus/`) behind the same store interface, one database per tenant.
3. Offboarding purge after the retention window is a manual operator step (PLANNED as a scheduled job).
4. Penetration test and a manual screen-reader pass are required before any go-live decision.
