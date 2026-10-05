# Release notes

## Scholarion Campus 0.3.0 — parity round 3 (2026-10-05)

Version identifier: `campus-0.3.0+parity3`. Staging only.

- **Similarity review:** built-in text-similarity check (within the course) and signed reports from external tools; shown in the grader as a signal for review, never a penalty.
- **Group spaces:** account-level groups that span courses, plus every course group, now have pages (with revisions), a threaded discussion and shared files with quotas.
- **Media library:** personal audio/video library with in-browser recording (up to 5 minutes), WebVTT captions, and sharing with people or into a course.
- **Single sign-on:** OpenID Connect sign-in (authorization code + PKCE, ID tokens verified against the provider's keys, optional just-in-time accounts). The client secret stays in a server environment variable.
- **HTML view:** teachers can edit page HTML; it is converted through an allow-list into safe page blocks and anything removed is reported.
- **Quick grader:** a phone-friendly grader that walks through ungraded submissions.
- **Keyboard gradebook:** edit scores in a grid with arrow keys, Enter and Escape; only changed cells are saved.
- **Localization:** campus navigation and frame in English, Spanish, French, Portuguese and Arabic (right-to-left); dates in each person's own time zone.

Still partial: SAML and LDAP sign-in (configuration records only).

## Scholarion Campus 0.2.0 — parity round 2 (2026-10-04)

Version identifier: `campus-0.2.0+parity2`. Staging only.

### Grading and quizzes
- Late policy per hour (`latePctPerHour`) as well as per day; missing-work scores are stored as grades (source `missing_policy`).
- Pass/fail schemes show Pass/Fail; GPA schemes show grade points; a course-in-progress GPA summary (not a transcript).
- Individual gradebook view; rubric "hide score total" applied for students.
- Quiz calculator (basic/scientific, parsed safely — never evaluated as code).
- Student analysis (rows + CSV) and outcomes analysis per quiz.
- Question banks shared across an account; questions keep a content revision.
- LTI proctoring launch (start-proctoring / start-assessment, single use).

### Administration
- Sub-account admins scoped to an account subtree.
- Audit search with filters and CSV; sign-in log.
- Account settings: trusted embed domains, named CIDR IP filters, terms and privacy links, self-registration with approval.
- Logo image and sanitized, scoped custom CSS.
- Background jobs for reports and SIS imports with progress and issues.
- Identity provider records (SAML/OIDC/LDAP), never connected from staging.

### Agentic Cloud Labs
- Graded lab "Implement a bounded tool runner" with the module rubric (architecture 30, tool bounds 30 — mandatory, task completion 30, code structure 10), a new `bounded-runner` workspace template, and practice checks. Graded without executing learner code. Acceptance map: `docs/campus/agentic-cloud-labs-acceptance.md`.

### Courses
- Student View isolated from rosters, gradebook, analytics and reports; staff can act as their course's test student.
- Home page types: front page and recent activity.
- Page editing roles enforced (students edit body only, with revisions).
- Links to renamed or deleted content update automatically.
- Student toggles for editing and deleting their own posts.
- Group files with group quotas.
- Public portfolio links (revocable).
- Messaging students from analytics charts.
- Live-session recordings with retention and a purge job.

### Still partial
Plagiarism/similarity tool results, cross-course groups, a personal media library with in-browser recording, an HTML source view, a mobile grader, keyboard gradebook editing, localization/RTL, and live SAML/OIDC/LDAP connections. See `docs/campus/STATUS.md`.
