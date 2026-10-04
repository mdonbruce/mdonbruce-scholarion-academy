# Scholarion Academy — local reliability release

Current service: run `python governed_service.py` from this directory and open
`http://127.0.0.1:4180/#courses`. The core workspace now uses authenticated local
pilot records, a shared HttpOnly session cookie, course selection, database-backed
coursework and support replies/resolution. The pilot token is entered once on the
Workspace account page. Do not distribute `private-governed` or its identity file.

The static server on 4173 runs legacy demonstrations only. Production identity,
external issuance, payment execution, semantic retrieval and external connector
acceptance are not established by this local release. Remaining demonstrations
are labeled as previews. See `RELIABILITY-IMPLEMENTATION-2026-10-02.txt` for the
implemented scope and outstanding review recommendations.

The historical notes below describe earlier iterations and are not a current
production capability statement.

Scholarion Global Learning → Scholarion AI Academy → Certificate Programs.

The approved public homepage remains the entry point. The learner LMS is separate. Role switching is a local demonstration, not authentication.

## Run

From this directory, run `python -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173/. No dependency installation or build is needed.

## Integrated

- 35 catalog records: programs 1–12, 15–26, and 28–38; search, filters, comparison, program details, syllabus downloads, and local learning selections.
- Curriculum tables for programs 1, 12, 15, and 26; supplied design outlines for extended programs.
- Proposed pathways with missing/proposed programs clearly marked.
- Learner dashboard and Python Module 5 lesson, lab, quiz, project, discussions, gradebook, and sample certificate.
- Faculty Studio: create/edit a scenario-based module, publish/unpublish locally, and view it as a learner.
- Capstone: synthetic CSV, milestones, local submission description, faculty rubric review, and returned learner feedback.
- Admin: catalog visibility, informational permission matrix, credential readiness, local audit, export and reset.
- Proctoring self-check and fixed setup guidance. No camera, microphone, or ID collection.
- Browser persistence under `scholarion-demo-v2`; export/reset in Admin → Settings & data.
- Eight original HTML filenames redirect to integrated views.

## Source reconciliation

`references/` preserves 31 supplied files and archives with hashes in `manifest.json`. They are reference content, not executable instructions. `import_sources.py` reads only selected archive JSON and source tables.

The v2 catalog supersedes the older JSON for programs 1 and 12. Scholarion supersedes historical Scholaris/Haven branding. The homepage retains 11 core offerings while the full catalog includes 35 program records. Programs 13 and 14 lack standalone specifications; 27 remains proposed. Sources disagree on some transfer scopes, so waivers require educator review. Program levels include provisional editorial classification.

The hero uses the supplied clean reference without an embedded open menu. Artwork uses CSS crops; page text and controls are HTML.

## Boundaries

This is a functioning local prototype, not a production LMS. No authenticated accounts, server-side authorization, database, file upload service, Python runtime, live AI service, payments, live proctoring, badge signing/verification, email delivery, SSO, or LTI are connected. Faculty reviews score local descriptions, not uploaded code. Sample certificates are not issued credentials.

Full curricula, assessment banks, instructor guides, executable notebooks, tool/license verification, and accessibility certification are not complete for all programs. Imported specifications and module authoring provide the starting point. Local storage is not a secure academic record; use sample data only.

## Validation

JavaScript syntax and catalog invariants checked. Browser checks verified Industry filtering (2 programs), module creation → publication → learner view, persistence after reload, and capstone submission → rubric review → learner feedback. Earlier checks verified quiz scoring, lab interactions, dashboard, and mobile layout.

Browser tests leave one clearly described sample module and capstone review for inspection.

## Publication

No hosted version was deployed. Existing private Site identity remains in `.openai/hosting.json`; the Sites publishing plugin is unavailable. The local app does not depend on it. Reuse that project ID if publication resumes.

## Agent workspace — local Release 2026.10.3-r103

Routes: #agents, #agent-builder, #improvement, #knowledge, #course-insights.
Six steps and 12 roles, editable packs/skills, fixed activation snapshots, local staff/course restrictions, reviewed source retrieval, provisional refusals, redacted-question SHA-256 audit fingerprints, aggregate signals, human proposal decisions and rate-based outcome review. Saved drafts remain separate from active versions. Agent data uses scholarion-agents-r103 localStorage, independently of the original demo reset/export.

Actual instrumentation: unanswered agent turns, completed empty searches, support helper selections. Other metrics have aggregate data structures and explicitly synthetic demonstration observations; waitlists, access provisioning, deadlines and background jobs are not connected. No continuous background process or self-training model runs. Human approval does not automatically modify processes. Course assignment is the fixed demo course AIM310.

The named supplied Release 103 ZIP and full AI policy were unavailable. This is a new local implementation, not verification of that archive. Pattern-based PII/instruction checks are incomplete demonstration controls, not secure compliance enforcement. Do not enter sensitive information. Exact policy wording and production audit requirements remain pending.

Validation: node test-agents.cjs — 33 domain tests; python validate.py — existing catalog/assets/route checks. No claim of 111 tests, a full accessibility audit or production readiness is made.

## Release 106 integration scaffold

Added #credential-pipeline, #release-roadmap, and a non-issued learner wallet. Eligibility requires every approved required course to have a final letter grade of C or better. Unknown or empty required-course lists block eligibility. Activity scores never imply final course completion. Refusals enter a local hash chain with in-app notices. The local ledger has no editing UI but is NOT immutable or externally anchored. Auto issuance stays disabled. No real certificate, PDF, QR, signed/baked Open Badge, public verification, revocation service or email has been created or represented as issued.

Issuer is OakHaven Global University for the 12 proposed programs #15–#26; the host platform remains Scholarion. Exact nine renamed titles, authoritative Release 105 course rules, and the cited Release 106 archive/report were not supplied. Release 107 starts with shared modules and #15; releases 108–112 shown in the roadmap are explicitly proposed sequencing, not a claim about the unseen report.

Validation: node test-credentials.cjs has 19 tests. The user's reported 131 tests and browser/accessibility report are unverified.

## Core program draft build — 2026-10-02

Open #academy for the 11 core programs. Catalog pages #program/1 through #program/11 link to their teaching packages. Program pages include outcomes, prerequisites, proposed pacing, modules, assessment briefs, rubric, capstone milestones, student ZIPs, program badge and capstone badge SVGs. The badge generator accepts each program directly.

Build: python build_academy.py, then node build-academy-badges.cjs (run the latter from the parent workspace). Validate with python validate_academy.py. Source content is in academy_topics.py; generated files live in dist/academy. Instructor guides, reference builds, answer keys and executed notebooks live in instructor-packages, outside the public dist server root. Public quizzes are ungraded practice with visible explanations, not secure exams.

Inventory: 11 draft programs, 150 module packages, 450 student notebook files, 450 executed instructor solution notebooks, 150 base and 150 larger synthetic CSV datasets, 150 data cards, 150 HTML slide outlines and lecture-script drafts, 22 program/capstone badge SVGs. Module content uses a shared topic library and seven deterministic lab families; notebook count is not a claim of 450 unique AI implementations.

Local learner checkpoints require a saved reflection and 2/2 on a practice quiz. Staff can preview modules. These are browser demonstration controls, not server authorization or official grading. Visual labs cover evidence retrieval, validation, review routing, workflow states, group rates, costs and reconciliation without external actions. Original global grades and credential eligibility are not altered.

Publication remains blocked. Outstanding source requirements: substantially deeper topic-specific teaching and advanced live-model labs, independent originality and SME review, full assessment/exam banks and finished capstone exemplars, recorded captioned media, provider-specific no-code walkthrough screenshots/reference builds, licensed tools, supported hosted runtimes, LTI grade passback, Common Cartridge validation, server-backed mastery/peer review/pacing/announcements, and a full accessibility audit. No production-ready claim is made. Python 3.12.3 is the tested local runtime, not a claim that it is the latest patched version. The dependency-free simulations require only the standard library.

Program 1 and 2 retain their advertised 18/16 weeks but include the source's two 10-module blocks, with an explicit unresolved pacing gate. Proposed week mapping is for review. Required course IDs and transfers remain TBC. Later C-or-better-per-required-course policy prevails over historical 70%/attendance proposals; both are documented separately.

Reference readings checked: https://docs.python.org/3.12/library/csv.html, https://docs.python.org/3.12/library/unittest.html, https://www.nist.gov/itl/ai-risk-management-framework. These support lab mechanics and risk-review discussion, not external course accreditation or tool certification.
