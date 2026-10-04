# Scholarion Campus — runbooks

Generated from the tab registry (`src/campus/registry.ts`). One section per tab.

Common tools for every tab:

- **Audit log:** Admin Console → Recent audit, or `GET /q/audit.log`. Every denial is recorded with the reason; act-as records carry the real admin.
- **Outbox:** `GET /q/outbox.status?status=dead`; replay with `POST /a/outbox.replay`. Consumers: file-scanner, media-transcoder, lms-enrollment-projection, observer-alerts, analytics-events, notifications, search-indexer, ai-support-triage, webhook-fanout, bundle-badge, completion-evaluator.
- **Metrics:** `/api/campus/metrics` (Prometheus text). Health: `/api/campus/health`.
- **Jobs:** `POST /a/ops.run_jobs` (announcements, missing work, overdue holds, retention, digests, outbox relay, webhooks).

## 1. Identity & Access

Users, role grants, MFA and time-boxed support access.

- **Purpose:** Authentication, MFA, authorization policy, delegated access.
- **Depends on:** Tenant store, realm config, TOTP.
- **Typical failures:** Sign-in errors, lockouts, expired grants.
- **Recovery:** Check login_failures and audit; unlock by waiting 15 min; re-issue grants via admin.
- **Resources:** `users`, `role_grants`, `support_grants`
- **Operations:** `me`, `roles.grant`, `roles.revoke`, `support.request`, `support.decide`
- **Who sees it:** admin, support

## 2. Curriculum

Courses, sections, modules and accessible block pages with publish validation, prerequisites, blueprints and imports.

- **Purpose:** Course structure, versions and publishing.
- **Depends on:** Files (media captions), Assessment (references).
- **Typical failures:** Publish blocked by validation; blueprint conflicts.
- **Recovery:** Read the validation report; fix references/alt text/captions; re-run the blueprint push (idempotent).
- **Resources:** `courses`, `sections`, `modules`, `module_items`, `pages`, `page_revisions`, `module_progress`
- **Operations:** `course.modules`, `course.nav`, `course.syllabus`, `course.checklist`, `course.progress`, `module.open_item`, `module.mark_done`, `module.duplicate`, `module.move_item`, `page.restore_revision`, `page.a11y`, `course.student_view`, `page.save_text`, `course.statistics`, `course.conclude`, `course.reset`, `page.word_count`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 3. Enrollment

LMS access projection from SIS registrations, waitlists and reconciliation.

- **Purpose:** LMS access projection; SIS remains the source.
- **Depends on:** Registration outbox events.
- **Typical failures:** Missing/extra/stale access.
- **Recovery:** Run reconciliation; apply the report; replay dead-lettered EnrollmentCommitted events.
- **Resources:** `enrollments`, `waitlist`
- **Operations:** `enrollment.reconcile`
- **Who sees it:** admin, registrar, instructor, advisor

## 4. Assessment

Assignments, quizzes with snapshots and seeded randomization, question banks, attempts and submissions.

- **Purpose:** Assessment definitions, attempts and submissions.
- **Depends on:** Files (scanned uploads), Gradebook, Accommodations.
- **Typical failures:** Attempt start refused; submission blocked by scan.
- **Recovery:** Check availability, attempt count, accommodations; re-scan file; idempotent resubmit.
- **Resources:** `assignments`, `quizzes`, `question_banks`, `questions`, `attempts`, `submissions`
- **Operations:** `submission.create`, `submission.mine`, `peer.assign`, `peer.complete`, `peer.mine`, `quiz.start`, `quiz.attempt`, `quiz.autosave`, `quiz.finish`, `quiz.submit`, `quiz.grade_question`, `quiz.moderate`, `quiz.regrade`, `quiz.item_analysis`, `quiz.manual_queue`, `assignments.bulk_dates`
- **Who sees it:** admin, instructor, ta, designer, student

## 5. Gradebook

Weighted groups, drop rules, late/missing policies, versioned rubrics, posting, moderation, peer review and annotations.

- **Purpose:** Official LMS grade calculation and release.
- **Depends on:** Assessment, Rubrics, Outcomes.
- **Typical failures:** 412 on stale edits; unposted grades not visible.
- **Recovery:** Reload and re-apply edits; post explicitly; check audit for release history.
- **Resources:** `assignment_groups`, `grades`, `rubrics`, `posting_policies`, `peer_reviews`, `annotations`, `grading_periods`, `grading_schemes`, `grade_history`, `comment_library`, `submission_comments`, `gradebook_notes`
- **Operations:** `grader.queue`, `gradebook.grid`, `grades.set`, `grades.post`, `grades.select_provisional`, `grades.final_override`, `grades.curve`, `grades.default`, `grades.message_students_who`, `grades.export_csv`, `grades.import_csv`, `grades.history`, `grades.totals`, `rubric.new_version`, `submission.annotate`, `submission.comment`, `submission.comments`, `ai.draft_feedback`, `gradebook.cell`, `grades.set_group`
- **Who sees it:** admin, instructor, ta, student, observer

## 6. Collaboration

Nested discussions with tombstones, scheduled announcements and a course-scoped inbox.

- **Purpose:** Course communication.
- **Depends on:** Enrollment (recipients), Notifications (outbox).
- **Typical failures:** Announcements not delivered; recipients rejected.
- **Recovery:** Run the announcement scheduler; check outbox dead letters; recipients must be active course members.
- **Resources:** `discussion_topics`, `posts`, `announcements`, `conversations`, `collaborations`
- **Operations:** `discussion.create_student_topic`, `discussion.post`, `discussion.edit`, `discussion.delete`, `discussion.like`, `discussion.report`, `discussion.subscribe`, `discussion.mark_all_read`, `discussion.thread`, `discussion.grade_checkpoints`, `announcement.read`, `inbox.send`, `inbox.reply`, `inbox.state`, `inbox.list`, `inbox.conversation`, `announcement.reply`, `announcement.like`, `announcement.replies`, `inbox.forward`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 7. Files & Media

Signed short-lived uploads into quarantine, scan, MIME check, promotion; media renditions and required captions.

- **Purpose:** Object metadata and lifecycle.
- **Depends on:** Object namespace per tenant, scanner, transcoder.
- **Typical failures:** Files stuck in quarantine; media can't publish without captions.
- **Recovery:** Re-run scan; add caption track or record an authorized exception.
- **Resources:** `files`, `folders`, `media`, `caption_tracks`
- **Operations:** `files.request_upload`, `files.download_url`, `files.publish`, `files.bulk`
- **Who sees it:** admin, instructor, ta, designer, student

## 8. Analytics

Minimized learning events, explainable risk signals and interventions.

- **Purpose:** Derived metrics, never academic truth.
- **Depends on:** Outbox events from Assessment, Gradebook, Collaboration.
- **Typical failures:** Stale signals.
- **Recovery:** Recompute signals; replay events.
- **Resources:** `learning_events`, `risk_signals`, `interventions`
- **Operations:** `analytics.course`, `analytics.student`, `analytics.access_report`, `analytics.events`, `analytics.recompute_risk`, `analytics.program`, `analytics.export_csv`
- **Who sees it:** admin, instructor, advisor

## 9. Integration

LTI 1.3 tools, OneRoster sync jobs with diff reports, signed webhooks with retries, dead letters and replay.

- **Purpose:** Connector config and delivery state.
- **Depends on:** Secret manager references, outbox.
- **Typical failures:** Webhook failures, sync conflicts.
- **Recovery:** Replay from dead letter; re-run the idempotent sync with the same key.
- **Resources:** `tool_registrations`, `sync_jobs`, `webhooks`, `webhook_deliveries`
- **Operations:** `oneroster.export`, `oneroster.import`, `sis.import`, `webhooks.create`, `webhooks.deliver`, `webhooks.replay`, `outbox.replay`, `lti.deep_link`, `lti.deep_link_return`, `lti.register`, `lti.rotate_key`
- **Who sees it:** admin

## 10. Admissions

Applicants, applications, document checklists, review and decision letters.

- **Purpose:** Application intake and decisions (SIS authoritative).
- **Depends on:** Files, Notifications.
- **Typical failures:** Decision blocked by incomplete checklist.
- **Recovery:** Mark documents received/verified, then decide.
- **Resources:** `applicants`, `applications`, `admission_documents`, `decisions`
- **Operations:** `admissions.checklist`, `admissions.decide`
- **Who sees it:** admin, registrar, student

## 11. Registration & Records

Terms, catalog, holds, validated registration (window, holds, prerequisites, conflicts, capacity, credits) and unofficial transcripts.

- **Purpose:** Authoritative registration; emits EnrollmentCommitted.
- **Depends on:** Holds, academic history, sections.
- **Typical failures:** Registration refused with a reason; waitlisted when full.
- **Recovery:** Release hold / adjust capacity; idempotent retry with the same key.
- **Resources:** `terms`, `catalog_entries`, `registrations`, `holds`, `academic_history`
- **Operations:** `registration.check`, `registration.register`, `registration.drop`, `records.transcript`, `ai.registration_guide`
- **Who sees it:** admin, registrar, advisor, student

## 12. Financial Aid & Accounts

Charges, aid awards, sandbox payments and pay-as-you-go plans; overdue balances place holds.

- **Purpose:** Student accounts (sandbox payments only).
- **Depends on:** Holds.
- **Typical failures:** Overdue holds.
- **Recovery:** Record sandbox payment; hold releases automatically when balance clears.
- **Resources:** `student_accounts`, `charges`, `aid_awards`, `payment_plans`, `payments`
- **Operations:** `finance.account`, `finance.aid_respond`, `finance.pay`, `finance.payment_plan`
- **Who sees it:** admin, registrar, student

## 13. Calendar & Scheduling

Projection of due dates, section meetings and personal events; revocable iCal feeds hashed at rest.

- **Purpose:** Calendar projections and feeds.
- **Depends on:** Assessment, Sections, Live sessions.
- **Typical failures:** Feed 404 after revocation (expected).
- **Recovery:** Issue a new feed token.
- **Resources:** `calendar_events`, `ical_tokens`, `appointment_groups`, `appointment_slots`
- **Operations:** `calendar.items`, `calendar.reschedule`, `calendar.feed`, `calendar.revoke_feed`, `scheduler.sign_up`, `scheduler.cancel`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 14. Live Classroom & Attendance

Zoom/Teams sessions through scoped connectors (disabled by default) and attendance imports reconciled by staff.

- **Purpose:** Live sessions and attendance.
- **Depends on:** Zoom/Teams connector (tenant consent).
- **Typical failures:** Connector disabled; imports unreconciled.
- **Recovery:** Enable connector in Tenant Admin; reconcile imports.
- **Resources:** `live_sessions`, `attendance`
- **Operations:** `live.schedule`, `live.import_attendance`, `live.reconcile_attendance`, `live.roll_call`
- **Who sees it:** admin, instructor, ta, student (feature flag `live_connectors`)

## 15. Outcomes & Evidence

Outcomes aligned to rubric criteria and questions, mastery rollups and evidence exports (demonstration only).

- **Purpose:** Outcome alignment and mastery.
- **Depends on:** Rubrics, grades, questions.
- **Typical failures:** Empty rollups when nothing aligned.
- **Recovery:** Align criteria/questions, regrade or recompute.
- **Resources:** `outcomes`, `outcome_alignments`, `evidence_exports`
- **Operations:** `mastery.gradebook`, `outcomes.results`, `outcomes.evidence_export`
- **Who sees it:** admin, designer, instructor

## 16. Student Success & Advising

Advisor caseloads from explainable risk signals, notes, referrals and interventions. People decide; signals never sanction.

- **Purpose:** Advising workflows.
- **Depends on:** Analytics risk signals.
- **Typical failures:** Missing cases for new signals.
- **Recovery:** Open cases from the signal list.
- **Resources:** `advising_cases`, `advising_notes`, `referrals`
- **Operations:** `advising.open_case`, `advising.caseload`, `ai.early_warning`
- **Who sees it:** admin, advisor

## 17. Course Evaluations & Surveys

Anonymous end-of-term evaluations released only above a minimum response count.

- **Purpose:** Surveys and evaluation release.
- **Depends on:** Enrollment (eligibility).
- **Typical failures:** Results withheld below minimum n (expected).
- **Recovery:** Extend window; results release once n is met.
- **Resources:** `surveys`, `evaluation_windows`, `survey_responses`
- **Operations:** `surveys.respond`, `surveys.results`
- **Who sees it:** admin, instructor, designer, student

## 18. Credentials & ePortfolio

Signed, revocable Open Badges 3.0-shaped certificates and student portfolios.

- **Purpose:** Issuance and verification.
- **Depends on:** Gradebook completion, signing key.
- **Typical failures:** Verification shows revoked.
- **Recovery:** Re-issue after correcting the record.
- **Resources:** `credentials`, `credential_templates`, `portfolios`, `portfolio_pages`, `artifacts`
- **Operations:** `credentials.issue`, `credentials.revoke`, `offerings.evaluate_completion`, `credentials.reissue`, `credentials.clr`, `credentials.share`
- **Who sees it:** admin, registrar, student, advisor

## 19. Careers & Placement

Job-ready profiles, opportunities and internships. Syncs to a separate placement database.

- **Purpose:** Placement data for TechDev Institution.
- **Depends on:** Placement DB (separate), consent.
- **Typical failures:** Profiles without consent aren't synced (expected).
- **Recovery:** Re-run the sync job.
- **Resources:** `placement_profiles`, `opportunities`, `internships`
- **Operations:** `careers.placement_sync`
- **Who sees it:** admin, advisor, student (internal tenant only)

## 20. Notifications & Preferences

Branded templates, per-user channels, digests and quiet hours, fed by the outbox.

- **Purpose:** Deliveries from domain events.
- **Depends on:** Outbox relay.
- **Typical failures:** Deferred during quiet hours (expected).
- **Recovery:** Run the digest job; check dead letters.
- **Resources:** `notification_templates`, `notification_prefs`, `deliveries`
- **Operations:** `notifications.mine`, `notifications.read`, `notifications.prefs`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 21. Global Search

Tenant-scoped, ACL-filtered search across courses, pages, people and help.

- **Purpose:** Search index per tenant.
- **Depends on:** Outbox (indexer consumer).
- **Typical failures:** Missing results after edits.
- **Recovery:** Rebuild the index.
- **Resources:** `search_docs`
- **Operations:** `search`, `search.rebuild`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 22. AI Agent Control Center

Agent definitions, versioned policies, evaluation gates, the human review queue and AI audit.

- **Purpose:** Governed AI.
- **Depends on:** Search index (retrieval), policies.
- **Typical failures:** Agent disabled until its evaluation gate passes.
- **Recovery:** Fix policy; re-run the evaluation.
- **Resources:** `agents`, `policy_versions`, `eval_runs`, `review_queue`, `ai_audit`
- **Operations:** `ai.control_center`, `ai.ask`, `ai.policy.save`, `ai.eval.run`, `ai.policy.activate`, `ai.agent.toggle`, `ai.review_queue`, `ai.review`, `ai.accessibility_scan`
- **Who sees it:** admin, instructor, designer, advisor

## 23. AI Curriculum Engine

Generates draft courses to the standard template; nothing is visible to students until a designer publishes.

- **Purpose:** Draft course generation.
- **Depends on:** Curriculum, Assessment, Announcements.
- **Typical failures:** Gaps flagged in draft.
- **Recovery:** Edit draft; publish via Curriculum validation.
- **Resources:** `course_templates`, `generation_jobs`
- **Operations:** `ai.generate_course`, `ai.template_conformance`
- **Who sees it:** admin, designer

## 24. Cloud Lab (LTI 1.3)

First-party LTI tool: signed launches from assignments, sandboxed runs and AGS score passback as unposted grades.

- **Purpose:** Sandboxed coding labs.
- **Depends on:** LTI keys, local runner (dev) / container runner (staging).
- **Typical failures:** Runner disabled; launch token expired.
- **Recovery:** Relaunch from the assignment; enable runner.
- **Resources:** `lab_templates`, `lab_sessions`
- **Operations:** `lti.launch`, `lab.open`, `lab.save`, `lab.submit`, `lab.sessions`, `lab.notebook`
- **Who sees it:** admin, instructor, ta, designer, student

## 25. Admin Console

Accounts and sub-accounts, the permission matrix with locks, custom roles, themes and domains, feature options, global announcements, SIS import, act-as and connector enablement.

- **Purpose:** Tenant configuration.
- **Depends on:** Platform registry.
- **Typical failures:** Unverified domains don't resolve (expected).
- **Recovery:** Verify domain; toggle flags.
- **Resources:** `accounts`, `custom_roles`, `permission_overrides`, `global_announcements`, `feature_options`, `masquerades`, `sis_imports`, `role_templates`
- **Operations:** `permissions.matrix`, `permissions.set`, `admin.overview`, `admin.theme`, `admin.flag`, `features.matrix`, `features.set`, `admin.add_domain`, `admin.verify_domain`, `global_announcements.active`, `global_announcements.dismiss`, `admin.help_links`, `admin.help_links.get`, `custom_roles.grant`, `audit.log`, `outbox.status`
- **Who sees it:** admin

## 26. Privacy & Compliance

Observer consent, export and erasure requests, retention jobs and legal holds (holds block erasure).

- **Purpose:** FERPA/GDPR workflows.
- **Depends on:** All tenant tables.
- **Typical failures:** Erasure refused under legal hold (expected, audited).
- **Recovery:** Release hold through counsel; re-submit.
- **Resources:** `consents`, `dsr`, `retention_policies`, `legal_holds`
- **Operations:** `privacy.request`, `privacy.process`
- **Who sees it:** admin, registrar, student

## 27. Help Desk & Support

Tiered tickets, knowledge base, AI triage drafts and time-boxed delegated access.

- **Purpose:** Tiered support.
- **Depends on:** Identity SupportGrants.
- **Typical failures:** Support can't see data without a grant (expected).
- **Recovery:** Request a grant; admin approves.
- **Resources:** `tickets`, `kb_articles`
- **Operations:** `helpdesk.mine`, `helpdesk.queue`, `helpdesk.ticket`, `helpdesk.reply`, `helpdesk.update`, `helpdesk.stats`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 28. Operations & Observability

SLOs, metrics, incidents, backups and point-in-time restore drills into isolated validation tenants.

- **Purpose:** Platform operations.
- **Depends on:** Backups, metrics.
- **Typical failures:** Restore integrity mismatch.
- **Recovery:** Re-run drill from an earlier backup; open an incident.
- **Resources:** `incidents`
- **Operations:** `ops.overview`, `ops.backup`, `ops.restore_drill`, `ops.tenant_status`, `ops.run_jobs`
- **Who sees it:** platform operators

## 29. Marketplace

Curated LTI tools and content packs; tenant-approved installs. Disabled by default.

- **Purpose:** Curated installs.
- **Depends on:** Integration (LTI tools).
- **Typical failures:** Disabled by default.
- **Recovery:** Enable flag in Tenant Admin.
- **Resources:** `listings`, `installs`
- **Operations:** `marketplace.catalog`, `marketplace.request`, `marketplace.decide`
- **Who sees it:** admin, instructor, designer (feature flag `marketplace`)

## 30. Mobile & Offline

Offline reading packages and offline draft submissions with server-side conflict resolution.

- **Purpose:** Offline sync.
- **Depends on:** Curriculum, Assessment.
- **Typical failures:** Conflicts when the assignment changed.
- **Recovery:** Student reviews the conflict and resubmits.
- **Resources:** `sync_cursors`, `offline_packages`, `offline_drafts`
- **Operations:** `offline.package`, `offline.sync`, `offline.save_draft`, `offline.sync_draft`
- **Who sees it:** admin, student

## 31. Accommodations

Extra time, attempts and deadline extensions applied automatically to quizzes and due dates.

- **Purpose:** Accessibility services accommodations.
- **Depends on:** Quiz engine, calendar.
- **Typical failures:** Accommodation not applied to an already started attempt.
- **Recovery:** Instructor grants an extra attempt.
- **Resources:** `accommodations`
- **Operations:** `accommodations.mine`, `accommodations.course`
- **Who sees it:** admin, advisor, instructor, ta, student

## 32. People & Groups

Roster, group sets with self sign-up and auto-assign, team assignments and the faculty journal.

- **Purpose:** Course groups.
- **Depends on:** Enrollment.
- **Typical failures:** Members not enrolled.
- **Recovery:** Fix membership.
- **Resources:** `group_sets`, `groups`, `faculty_journal`
- **Operations:** `people.roster`, `people.add`, `people.set_state`, `groups.set`, `groups.join`, `groups.leave`, `groups.auto_assign`, `groups.clone`, `groups.export_csv`, `groups.import_csv`, `people.edit_enrollment`
- **Who sees it:** admin, instructor, ta, designer, student

## 33. Library & Reading Lists

Course reading lists with citations and accessible-format flags; feeds the AI Companion as assigned reading.

- **Purpose:** Assigned readings.
- **Depends on:** Curriculum.
- **Typical failures:** Broken links.
- **Recovery:** Edit item.
- **Resources:** `reading_items`
- **Operations:** —
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 34. Reports & Exports

Enrollment, grade distribution, registration and engagement reports as CSV.

- **Purpose:** Operational reports.
- **Depends on:** All contexts (read).
- **Typical failures:** Empty report.
- **Recovery:** Check filters; re-run.
- **Resources:** `report_runs`
- **Operations:** `reports.run`
- **Who sees it:** admin, registrar

## 35. Dashboard & Planner

Card, list (planner) and recent-activity views, to-dos, coming up, recent feedback and global announcements.

- **Purpose:** Personal landing page.
- **Depends on:** Courses, assessments, announcements.
- **Typical failures:** Empty to-do (nothing due).
- **Recovery:** None needed.
- **Resources:** `dashboard_prefs`, `planner_items`, `planner_marks`
- **Operations:** `dashboard`, `dashboard.activity`, `dashboard.prefs`, `planner`, `planner.mark`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 36. Mastery Paths, Assign-To & Pacing

Differentiated due dates per section, group or student; conditional release by score; pace plans with blackout dates.

- **Purpose:** Differentiation and pacing.
- **Depends on:** Assessment, Gradebook.
- **Typical failures:** Student sees wrong date.
- **Recovery:** Check override precedence: student > group > section > everyone.
- **Resources:** `assignment_overrides`, `mastery_paths`, `pace_plans`, `blackout_dates`
- **Operations:** `pacing.apply`
- **Who sees it:** admin, instructor, designer, ta

## 37. Copy, Import, Blueprints & Sharing

Course copy with date shifting, package import/export, blueprint sync with locks and history, and the shared content library.

- **Purpose:** Content movement and reuse.
- **Depends on:** Curriculum, Assessment, Files (quarantine).
- **Typical failures:** Import issues listed in report; locked items blocked.
- **Recovery:** Fix issues and rerun (idempotent).
- **Resources:** `content_jobs`, `blueprint_syncs`, `shared_content`
- **Operations:** `ai.migration_plan`, `content.copy`, `content.import_package`, `blueprint.associate`, `blueprint.lock`, `blueprint.preview`, `blueprint.sync`, `library.share`, `library.list`, `library.import`
- **Who sees it:** admin, designer, instructor

## 38. Developer Keys & API

API and LTI 1.3 keys with scopes, OAuth2 tokens, rate limits, and the OpenAPI, GraphQL and gRPC contracts.

- **Purpose:** API access.
- **Depends on:** Identity.
- **Typical failures:** 429 when rate limited; 401 when token revoked.
- **Recovery:** Back off per Retry-After; issue a new token.
- **Resources:** `developer_keys`, `access_tokens`
- **Operations:** `developer_keys.create`, `developer_keys.toggle`, `oauth.authorize`, `tokens.create`, `tokens.revoke`, `tokens.mine`
- **Who sees it:** admin

## 39. Observers & Family

Observers linked to students see consented grades, calendar and missing work, with alert thresholds.

- **Purpose:** Parent/observer access.
- **Depends on:** Privacy consent, Gradebook.
- **Typical failures:** No data without consent (expected).
- **Recovery:** Student grants consent in Privacy.
- **Resources:** `observer_links`, `observer_alerts`
- **Operations:** `privacy.observer_summary`, `observers.pairing_code`, `observers.pair`, `observers.mine`
- **Who sees it:** admin, registrar, observer

## 40. Account & Profile

Profile, pronouns, accessibility settings, language and time zone, history, QR login for mobile.

- **Purpose:** Personal settings.
- **Depends on:** Identity.
- **Typical failures:** QR code expired.
- **Recovery:** Generate a new code.
- **Resources:** `profiles`, `view_history`, `qr_logins`
- **Operations:** `account.profile`, `account.profile.update`, `account.history`, `account.qr_login`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 41. Catalog & Hub

Product types, cohorts with seats-left, catalog pages generated from data (filters, cards, comparison, path diagram, structured data), a recommender quiz and the Catalog Copy Checker.

- **Purpose:** Public catalog generated from catalog data.
- **Depends on:** Offerings, pathway graph, approved claims.
- **Typical failures:** Offering won't publish (unverified claim).
- **Recovery:** Remove the wording or record an approved claim with evidence.
- **Resources:** `offerings`, `offering_sections`, `approved_claims`
- **Operations:** `catalog.hub`, `catalog.recommender_questions`, `catalog.recommend`, `catalog.check_copy`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 42. Pathways & Transfer

Program graph (prerequisite, stacks-into, waives, mutually-exclusive), credit transfer rules, rule evaluation at enrollment and issuance, and the automatic consolidation report.

- **Purpose:** Stacking and waivers.
- **Depends on:** Offerings, completions.
- **Typical failures:** Waiver not applied.
- **Recovery:** Check the rule and the learner's completion; re-evaluate enrollment (audited).
- **Resources:** `pathway_edges`, `transfer_rules`
- **Operations:** `pathways.evaluate`, `pathways.consolidation_report`
- **Who sees it:** admin, designer, registrar, advisor, student

## 43. Commerce (sandbox)

Quotes, coupons and referrals, early-bird, installments, subscriptions, corporate seats and invoices, simulated tax, refund/deferral policy engine, aid eligibility flags. Sandbox only — no real payments.

- **Purpose:** Sandbox checkout and entitlements.
- **Depends on:** Catalog, pathways, LMS enrollment.
- **Typical failures:** Checkout refused (sold out, aid ineligible, coupon expired).
- **Recovery:** Join the waitlist / choose another cohort; check coupon window.
- **Resources:** `coupons`, `orders`, `subscriptions`, `seat_licenses`, `invoices`, `refund_requests`, `offering_enrollments`
- **Operations:** `commerce.quote`, `commerce.checkout`, `commerce.subscribe`, `commerce.cancel_subscription`, `commerce.enroll_with_subscription`, `commerce.assign_seat`, `commerce.invoice_seats`, `commerce.refund`, `commerce.reset_deadlines`, `analytics.commerce`, `commerce.batch_change`, `commerce.audit`, `plans.options`, `plans.quote`, `plans.settings_view`, `plans.settings`, `plans.start`, `plans.cancel`, `plans.pause`, `plans.resume`, `plans.switch`, `plans.refund`, `plans.mine`, `plans.tick`, `aid.apply`, `aid.queue`, `aid.decide`, `aid.mine`
- **Who sees it:** admin, student

## 44. AI Tutor

Explain, hint, practice quiz and study plan from published course material with citations; refuses graded work; escalates to the instructor; language modes; avatar mode with disclosure, captions and transcript; erasable memory.

- **Purpose:** Learner-facing tutor.
- **Depends on:** Search index, agent policy (eval-gated), avatar connector (optional).
- **Typical failures:** Tutor answers 'not found'.
- **Recovery:** Publish the material; rebuild the index; check the policy is active.
- **Resources:** `tutor_memory`
- **Operations:** `tutor.ask`, `tutor.escalate`, `tutor.memory`, `tutor.erase_memory`, `tutor.analytics`
- **Who sees it:** student, instructor, ta, admin

## 45. Lab Key Vault

Per-learner model API keys for labs with spend caps, rate limits and expiry; the master key is never exposed; calls are metered through the platform proxy.

- **Purpose:** Safe model access in labs.
- **Depends on:** Model provider connector (disabled until configured).
- **Typical failures:** Key over cap or expired.
- **Recovery:** Instructor raises the cap or issues a new key.
- **Resources:** `lab_keys`
- **Operations:** `lab_keys.issue`, `lab_keys.set_cap`, `lab_keys.call`
- **Who sees it:** admin, instructor, student

## 46. Tenant Console

Platform operators: create tenants from templates (academy, university, school, corporate), region and tier, plan limits, suspend/resume/export/offboard, content licensing between tenants via blueprint copy, de-identified platform metrics.

- **Purpose:** Tenant lifecycle.
- **Depends on:** Control plane registry, DB broker.
- **Typical failures:** Slug or host conflict.
- **Recovery:** Choose another slug; verify host ownership.
- **Resources:** —
- **Operations:** `tenants.provision`, `tenants.limits`, `tenants.offboard`, `licenses.create`, `licenses.sync`, `platform.metrics`
- **Who sees it:** platform operators

## 47. Connectors

Zoom, Haven avatar/HavenConnect/HavenRoute, model providers, GPU pools, SSO, email — each with an honest status (LIVE / CONNECTED / DISABLED / SIMULATED / PLANNED), consent and secret references.

- **Purpose:** Outside services.
- **Depends on:** Secret manager references, consent.
- **Typical failures:** Connector disabled.
- **Recovery:** Record consent and a secret reference; switch to simulated for staging demos.
- **Resources:** `connectors`
- **Operations:** `connectors.list`, `connectors.configure`
- **Who sees it:** admin

## 48. Capability Status

Every capability marked LIVE / CONNECTED / DISABLED / SIMULATED / PLANNED with evidence and blockers, plus the naming-migration checklist.

- **Purpose:** Honest status reporting.
- **Depends on:** Connectors, tests.
- **Typical failures:** —
- **Recovery:** —
- **Resources:** —
- **Operations:** `status.board`
- **Who sees it:** admin, designer, registrar, instructor

## 49. Proctored Assessment Support

Setup assistant that answers testing-environment questions with approved talking points only, a pre-test checklist that proctored assessments require, routing to the accommodations process, escalation with a response time, and a redacted question log for updating the talking points.

- **Purpose:** Consistent, supportive answers about proctored-assessment setup.
- **Depends on:** Approved talking points (published), settings, Help Desk for escalations, governed agent policy.
- **Typical failures:** Assistant escalates a question it has no approved answer for.
- **Recovery:** Support reviews the question log, drafts a talking point, an admin reviews and publishes it.
- **Resources:** `proctor_settings`, `proctor_talking_points`, `proctor_readiness`, `proctor_questions`
- **Operations:** `proctor.ask`, `proctor.reply`, `proctor.my_assessments`, `proctor.readiness`, `proctor.save_readiness`, `proctor.staff_guide`, `proctor.overview`, `proctor.promote`
- **Who sees it:** admin, instructor, ta, designer, student, observer, advisor, registrar, support

## 50. Program Studio

Academy program designs (#1, #12, #13, #14, #26): website pages generated from catalog data, course shells, credentials, apply → admission → sandbox seat → orientation, brochures, team and advisor inquiries, prerequisite self-checks, consented testimonials and the design-package status report.

- **Purpose:** Program design packages and their public pages.
- **Depends on:** Catalog offerings and cohorts, Admissions, Commerce (sandbox), Curriculum, Credentials.
- **Typical failures:** Program page won't publish (copy check, missing fee or unconfirmed faculty).
- **Recovery:** Fix the flagged wording or field and publish again; the page reads fees and dates from the catalog.
- **Resources:** `program_pages`, `program_testimonials`, `program_inquiries`, `selfcheck_attempts`
- **Operations:** `agentic.hub`, `agentic.quiz_questions`, `agentic.recommend`, `programs.index`, `programs.page`, `programs.self_check_questions`, `programs.self_check`, `programs.inquire`, `programs.apply`, `programs.review`, `programs.quality_gate`, `programs.publish_shells`, `programs.design`, `programs.design_signoff`, `programs.status`, `programs.progress`
- **Who sees it:** admin, designer, registrar, advisor, instructor

## 53. Assessment & Project Studio

Curriculum Engine generators for every module: hands-on labs, in-class activities, quizzes with item banks (QTI export), practice exercises, mini-projects, real-world scenario projects, senior capstones and simulated Student/Instructor labs with an application demo — Four Project Pillars, alignment tables, student and instructor editions, AI DRAFT until an SME and an instructional designer approve.

- **Purpose:** Turn the program design into assessable, aligned learning activities fast — with humans approving every word that reaches learners.
- **Depends on:** Program pages (outcomes, weeks, tools, data cards), module shells, the copy checker, sandbox scenarios.
- **Typical failures:** [SME] slots open, copy-check flags or a missing approval block publishing.
- **Recovery:** Fill the slots, re-run approvals with two different people, publish (creates unpublished course items).
- **Resources:** `assessment_drafts`
- **Operations:** `assess.programs`, `assess.context`, `assess.generate`, `assess.drafts`, `assess.view`, `assess.fill`, `assess.approve`, `assess.publish`, `simlab.scenarios`
- **Who sees it:** admin, designer, instructor

## 54. Agentic Cloud Labs

Scholarion's hosted agent-building area: saved workspaces with version history, a bounded autonomous agent runner (no approval gates; step and tool-call budgets), per-tool permissions with violation tracking, an operational run log, rubric auto-grading posted to the gradebook with a pass/no-pass mark, and two graded attempts per lab (best counts; staff can grant one more).

- **Purpose:** Practice and assess agent design safely and at scale.
- **Depends on:** Courses and assignments, gradebook, sandbox scenarios.
- **Typical failures:** Invalid agent spec (shown in the workspace); attempts exhausted (409).
- **Recovery:** Fix the spec and re-run practice; staff grant an extra attempt with a reason (audited).
- **Resources:** `agent_labs`, `agent_lab_runs`, `agent_lab_grants`, `agent_workspaces`
- **Operations:** `agentlabs.mine`, `agentlabs.open`, `agentlabs.save`, `agentlabs.run`, `agentlabs.restore`, `agentlabs.reset`, `agentlabs.run_detail`, `agentlabs.roster`, `agentlabs.grant_attempt`, `agentlabs.verify`
- **Who sees it:** admin, designer, instructor, ta, student

## 55. Hosted Learning Area (Agentic Cloud Labs)

Scholarion's own hosted learning area for each course: dashboard, modules and topics, sources, Lecture Studio, Agentic Cloud Labs, interactive mini-labs, in-class activities, assignments and projects, quizzes and practice, saved workspaces, application demonstrations, gradebook and passbook, instructor control panel, environment and tool permissions, and the Studio output library. Persistent workspaces (files, editor, simulated terminal, run/stop/reset/save/resume, autosave, snapshots, usage and budget); a bounded autonomous runner with policy enforced outside the model; two graded attempts with unlimited practice; frozen rubric versions; idempotent submission and grade posting with automatic retry; Check Answers after grading; competency passbook; projection lock for instructor answer keys.

- **Purpose:** Learners practise and are assessed in one place; instructors run class and see progress without exposing answers.
- **Depends on:** Courses and enrollments, gradebook, workspace templates, Course Studio outputs.
- **Typical failures:** Grading environment unavailable (submission marked infra_failed, no attempt used); gradebook post failure (posting_failed, retried automatically); attempts exhausted (409).
- **Recovery:** Learner resubmits after an infra failure; staff or the scheduler run graded.retry; instructor grants an extra attempt in the item settings.
- **Resources:** `graded_items`, `graded_item_versions`, `graded_submissions`, `passbook`, `lab_workspaces`, `workspace_snapshots`, `workspace_policies`, `workspace_agent_runs`, `workspace_teams`, `projection_locks`
- **Operations:** `learn.overview`, `learn.sections`, `graded.view`, `graded.practice`, `graded.submit`, `graded.submit_project`, `graded.review`, `graded.gradebook`, `graded.regrade`, `graded.retry`, `workspace.templates`, `workspace.mine`, `workspace.launch`, `workspace.get`, `workspace.files`, `workspace.read`, `workspace.write`, `workspace.command`, `workspace.save`, `workspace.stop`, `workspace.resume`, `workspace.reset`, `workspace.snapshot`, `workspace.agent_run`, `workspace.agent_stop`, `workspace.agent_runs`, `workspace.pause`, `workspace.unpause`, `workspace.policy`, `workspace.set_policy`, `workspace.progress`, `projection.state`, `projection.lock`, `projection.set_pin`, `projection.unlock`
- **Who sees it:** admin, designer, instructor, ta, student

## 56. Course Studio (Master Studio Generator)

Source-grounded generation per topic into the Scholarion_Academy/[Program]/[Course]/Module_[NN]/[Topic]/01_Sources … 13_Environment_Templates folder tree: 10-slide deck with notes, overview, notes, study guide, mind map, 16:9 infographic, 20+ flashcards, 10-question practice quiz, two mini-labs, lab/programming/DevOps environments, rubrics, cover variants A and B with the approved faculty photograph, video and audio scripts with honest media status, QA report, manifest, protected instructor bundle and regeneration commands. Every output is labelled AI DRAFT until an instructor releases it.

- **Purpose:** Produce a complete, reviewable teaching package for any topic from the instructor's own sources.
- **Depends on:** Studio sources, faculty photograph, ffmpeg for silent preview video; a TTS provider for narration (not configured).
- **Typical failures:** Step failure (run is resumable from the failed step); unavailable URL source (stored as unavailable, never invented); narration awaiting rendering.
- **Recovery:** Resume the run; replace the source; configure a TTS provider and regenerate media.
- **Resources:** `studio_sources`, `studio_runs`, `studio_outputs`
- **Operations:** `studio.add_source`, `studio.sources`, `studio.start`, `studio.resume`, `studio.regenerate`, `studio.regenerate_quiz`, `studio.release`, `studio.runs`, `studio.run`, `studio.outputs`, `studio.edit_output`, `studio.check_minilab`
- **Who sees it:** admin, designer, instructor

## 57. Free Education Resource Hub

Scholarion AI Tools Registry and Free Course Library: an evidence-backed catalog of free tools, open courses, textbooks and readings with accurate availability classes (ongoing free, open-source, OER, education benefit, limited credits, trial), verified limits, API access tracked separately from free apps, licenses, connection states, last-verified dates, bookmarks, course mappings and recommendations, the Live Classroom Hub (lectures split into blocks within verified free meeting limits), the Video, Audio and Avatar studio, integration connections (key-vault references only) and an in-site What's New feed.

- **Purpose:** Give learners and faculty free, verified tools and materials without overstating what is free.
- **Depends on:** Discovery jobs, official provider pages, course catalog.
- **Typical failures:** A provider changes its free terms (record drops to pending, courses are notified with a verified alternative); a page disappears (unavailable).
- **Recovery:** Add fresh official evidence; the next verification run republishes automatically.
- **Resources:** `eco_resources`, `eco_resource_versions`, `eco_evidence`, `eco_course_mappings`, `eco_bookmarks`, `eco_external_completions`, `eco_subscriptions`, `eco_feed`, `eco_connections`, `eco_health`, `eco_live_sessions`
- **Operations:** `eco.summary`, `eco.resources`, `eco.resource`, `eco.curate`, `eco.add_evidence`, `eco.archive`, `eco.bookmark`, `eco.bookmarks`, `eco.report_completion`, `eco.subscribe`, `eco.unsubscribe`, `eco.whats_new`, `eco.map_course`, `eco.course_resources`, `eco.recommend`, `eco.connect`, `eco.connections`, `eco.connection_health`, `eco.disconnect`, `eco.live_schedule`, `eco.live_sessions`, `eco.library_by_course`, `eco.changelog`
- **Who sees it:** admin, designer, instructor, ta, student, advisor

## 58. Career Connect & Employer Portal

Internship and employment board (employer-posted and externally discovered listings, labelled accurately), verified employer onboarding, partner status only after an established relationship, learner career profiles with opt-in discoverability and per-field visibility, explainable matching from passbook and credential evidence, learner-initiated applications, consent-based employer contact, and placement tracking kept separate from course completion.

- **Purpose:** Connect learners with real opportunities while they control what employers see.
- **Depends on:** Passbook, credentials, discovery jobs, employer verification.
- **Typical failures:** Unverified employer (403 on talent search); closed listing (409 on apply).
- **Recovery:** Admin verifies the employer; learners pick another listing.
- **Resources:** `eco_employers`, `eco_employer_members`, `eco_opportunities`, `eco_career_profiles`, `eco_matches`, `eco_applications`, `eco_contact_requests`
- **Operations:** `eco.opportunities`, `eco.employers`, `eco.profile`, `eco.profile_save`, `eco.matches`, `eco.apply`, `eco.applications`, `eco.withdraw`, `eco.contact_requests`, `eco.answer_contact`, `eco.employer_register`, `eco.employer_verify`, `eco.employer_partner`, `eco.employer_portal`, `eco.post_opportunity`, `eco.close_opportunity`, `eco.talent`, `eco.request_contact`, `eco.application_update`, `eco.withdraw_consent`, `eco.flags`, `eco.placements`
- **Who sees it:** admin, advisor, student

## 59. Auto-Discovery & Workflow Automation

Scheduled, bounded discovery and maintenance: cron schedules in America/New_York (jobs daily 6:00, resources Monday 7:00, terms review monthly, link checks daily 5:00, integration health every six hours), durable jobs with unique period keys, leases, request/runtime budgets, checkpoints, backoff with jitter and dead-letter, run-now/pause/resume, trusted-source adapters (official pages, RSS/Atom, public job-board API — no arbitrary-URL proxy), automatic publication of evidence-backed records, the versioned Scholarion Integration JSON Schema (Draft 2020-12) with semantic checks, and the API integration layer.

- **Purpose:** Keep the catalog and job board current without human approval gates, inside fixed permissions.
- **Depends on:** Network egress to trusted hosts; the in-process scheduler or an external cron calling ops.run_jobs.
- **Typical failures:** Source unreachable (retries with backoff, then dead-letter and an admin notification); budget exhausted (checkpoint and resume).
- **Recovery:** Fix or disable the source, then Run now; dead jobs can be re-queued by Run now.
- **Resources:** `eco_schedules`, `eco_jobs`, `eco_sources`, `eco_candidates`, `eco_checks`
- **Operations:** `eco.automation`, `eco.schedule_save`, `eco.schedule_pause`, `eco.schedule_resume`, `eco.run_now`, `eco.tick`, `eco.job`, `eco.job_create`, `eco.source_add`, `eco.source_toggle`, `eco.schemas`, `eco.validate`
- **Who sees it:** admin

## 61. Curriculum & Course Intelligence

AI drafts, humans decide: curriculum knowledge graph, Program Design Studio with overlap analysis, alignment matrix and coverage heatmaps (Bloom fit, orphans, scaffolding), skills and roles map, standards mapper over human-loaded framework packs (evidence for review only), pathways and consolidation, course health from aggregated learning data, assessment intelligence (item difficulty and discrimination), freshness sentinel with impact analysis, accessibility audit, proposal → review → versioned-release workflow with separation of duties, the governed Curriculum Exchange (curriculum packages only — never learner data) and program review reports.

- **Purpose:** Keep every program aligned, current, accessible and honest, with a human decision at every step.
- **Depends on:** Program catalog and design packages, LMS learning data (aggregated), Free Education Resource Hub verification dates, human-loaded framework packs.
- **Typical failures:** Signals with too little data (shown as not measured); a package fails a pipeline check (rejected with the reason).
- **Recovery:** Collect more data or fix the package and resubmit; proposals go back to revision.
- **Resources:** `cci_drafts`, `cci_proposals`, `cci_framework_packs`, `cci_packages`, `cci_freshness_tickets`
- **Operations:** `cci.dashboard`, `cci.graph`, `cci.draft_program`, `cci.alignment`, `cci.skills`, `cci.load_framework`, `cci.evidence_pack`, `cci.overlap`, `cci.course_health`, `cci.item_analysis`, `cci.freshness_scan`, `cci.accessibility`, `cci.propose`, `cci.propose_from_signals`, `cci.advance`, `cci.exchange_import`, `cci.exchange_export`, `cci.exchange_approve`, `cci.exchange_audit`
- **Who sees it:** admin, designer, instructor, registrar

## 60. Program Marketing & Campaigns

Launch kit for the 9-weekend GenAI, Agentic AI & AI Agents program (#39): program and free Day 1 flyers with the approved faculty photo, landing outline, LinkedIn/Instagram/WhatsApp copy, 60-second promo script, three-email sequence with unsubscribe links, all 18 sessions in seven time zones (.md/.csv/.ics), Copy Checker flags on every asset, consented opt-in audiences, email sends held until a provider is configured, a manual channel checklist with platform rules (never auto-posted), the meeting-platform duration check and the Scholarion_GenAI_Agentic_Program/ folder export.

- **Purpose:** Promote programs honestly and lawfully from one reviewed kit.
- **Depends on:** Program #39 catalog entry, Copy Checker, Free Education Resource Hub (meeting limits), email connector (HavenRoute).
- **Typical failures:** No email provider (sends held); copy flagged (send blocked until fixed).
- **Recovery:** Configure the email connector; fix the flagged wording and send again.
- **Resources:** `campaigns`, `campaign_channels`, `campaign_contacts`, `campaign_sends`
- **Operations:** `campaign.overview`, `campaign.settings`, `campaign.send`, `campaign.posted`, `campaign.subscribe`
- **Who sees it:** admin, designer, advisor

## 52. Module Library & Catalog Consolidation

The versioned shared module library (blueprint course), the catalog consolidation report for programs #1–#38 (shared modules, credit transfers, mutually exclusive pairs, merge/retire recommendations, proposed #27) with product-owner approval, and the refund, deferral and batch-change policies that only display once approved.

- **Purpose:** Build once, reuse everywhere; keep the catalog coherent.
- **Depends on:** Offerings, pathway graph, blueprint courses.
- **Typical failures:** Overlap above 60% flagged; policy not displayed (not approved).
- **Recovery:** Merge or retire per the approved report; product owner approves the policy.
- **Resources:** `library_modules`, `catalog_policies`, `consolidation_reports`
- **Operations:** `catalog.consolidation`, `catalog.consolidation_submit`, `catalog.consolidation_decide`, `policies.approve`, `policies.reopen`
- **Who sees it:** admin, designer, registrar

## 51. LMS Parity Status

Every feature in the LMS feature-parity specification marked DONE / PARTIAL / NOT STARTED with evidence and the gap, plus the 15 acceptance tests and their test files.

- **Purpose:** Honest parity reporting after each build stage.
- **Depends on:** Parity audit list (src/campus/parity.ts), tests.
- **Typical failures:** —
- **Recovery:** —
- **Resources:** —
- **Operations:** —
- **Who sees it:** admin, designer, instructor, registrar
