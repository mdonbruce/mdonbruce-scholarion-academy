# Scholarion Campus — threat model

STRIDE-style notes per tab. Cross-cutting controls first.

## Cross-cutting

| Threat | Control | Evidence |
|---|---|---|
| Cross-tenant data access (spoofed host or slug) | TenantContext resolved from a verified host or path slug before any store is opened; host/slug mismatch → 403; unknown/suspended tenant refused at the broker | `tests/campus-security.test.ts` (negative cross-tenant suite) |
| Session or token replay across tenants | Per-tenant cookie names; sessions, API and LTI tokens are stored hashed in the tenant's own store | security suite |
| Privilege escalation | RBAC + permission matrix with account inheritance and locks; course-scoped roles; support access only via approved, time-boxed grants; act-as can't target admins and needs MFA | authorization matrix tests |
| CSRF | SameSite=Lax cookies + Origin check on every state-changing cookie request | API tests |
| Lost updates | Optimistic concurrency (version / If-Match → 412) | master acceptance 6 |
| Silent side effects | Transactional outbox; idempotent consumers; dead-letter + replay | API tests (webhooks), runbooks |
| Repudiation | Append-only audit with trace ids; act-as stamps the real admin on every record | security suite |
| Malicious uploads | Signed short-lived URLs bound to tenant; quarantine → magic-number sniff + EICAR scan → promote | master acceptance 5 |
| AI misuse (answer leakage, injection, PII) | Eval-gated policies; refusal rules; locked content excluded from retrieval; drafts need human approval; prompt hashes only in audit | AI tests, master 9, platform 6 |
| Misleading claims | Catalog Copy Checker and credential honesty guard block unapproved accreditation/degree/outcome wording | platform acceptance 10 |
| Payment fraud | Sandbox only; real card numbers refused; server-side quotes | platform acceptance 3 |

## 1. Identity & Access

- Credential stuffing → lockout after 8 failures/15 min
- Support overreach → time-boxed approved grants, audited
- Session reuse across tenants → sessions stored per tenant

## 2. Curriculum

- Stored XSS in pages → validated block JSON, escaped rendering
- Locked content leakage → server-enforced availability

## 3. Enrollment

- IdP attribute spoofing → enrollment never inferred from IdP
- Direct LMS enrollment → projection created only by SIS events

## 4. Assessment

- Answer leakage → answers never sent to students
- Replay of submit → idempotent submit
- Malicious uploads → quarantine + scan

## 5. Gradebook

- Lost updates → ETag/If-Match 412
- Premature release → explicit audited posting
- Bias → anonymous grading option

## 6. Collaboration

- Cross-tenant/course messaging → recipients resolved server-side from membership
- Harassment → report + moderation via help desk

## 7. Files & Media

- Malware → quarantine/scan/promote
- Link sharing → signed URLs expire in 5 minutes
- MIME spoofing → content sniffing

## 8. Analytics

- Profiling on protected traits → only engagement/grade features used
- Re-identification → pseudonymous actor refs

## 9. Integration

- Secret exposure → only secret references stored
- Webhook spoofing → HMAC-signed payloads

## 10. Admissions

- Decision tampering → decisions immutable, audited
- Document exposure → registrar/admin only

## 11. Registration & Records

- Race on last seat → capacity checked inside the transaction
- Hold bypass → no override path for students or AI

## 12. Financial Aid & Accounts

- Real money movement → sandbox provider only
- Balance tampering → charges immutable, payments append-only

## 13. Calendar & Scheduling

- Feed token leak → hashed at rest, revocable, one user each

## 14. Live Classroom & Attendance

- Meeting hijack → owner-scoped links
- False attendance → imports are assertions until reconciled

## 15. Outcomes & Evidence

- Misleading accreditation claims → exports labeled demonstration only

## 16. Student Success & Advising

- Automated sanctions → none; human decision only
- Note exposure → advisor/admin only unless shared

## 17. Course Evaluations & Surveys

- De-anonymization → one-way respondent hash, minimum-n release

## 18. Credentials & ePortfolio

- Forgery → Ed25519 signature checked on verify

## 19. Careers & Placement

- Guest-tenant data leakage → sync runs only for internal tenant and writes only to the placement DB

## 20. Notifications & Preferences

- Spoofed notifications → generated server-side from events only

## 21. Global Search

- ACL bypass → results filtered by role and enrollment at query time

## 22. AI Agent Control Center

- Prompt injection → policy guard + eval probes
- Cross-tenant retrieval → tenant-dedicated index
- Unapproved actions → drafts need human approval

## 23. AI Curriculum Engine

- Unreviewed publication → designer approval required

## 24. Cloud Lab (LTI 1.3)

- Launch forgery → signed id_token with nonce, 5-minute expiry
- Sandbox escape → time and memory limits, no network

## 25. Admin Console

- Domain takeover → only verified hosts resolve

## 26. Privacy & Compliance

- Over-retention → retention jobs
- Unlawful erasure → legal hold check

## 27. Help Desk & Support

- Social engineering → grants approved by admin, time-boxed, audited

## 28. Operations & Observability

- Operator overreach → platform operators only, audited

## 29. Marketplace

- Malicious tools → curated listings, admin approval

## 30. Mobile & Offline

- Stale data overwrite → version check, server wins with conflict record

## 31. Accommodations

- Disclosure of disability → only kind and effect shown to instructors

## 32. People & Groups

- Membership spoofing → members must be enrolled students

## 33. Library & Reading Lists

- Copyright → links and citations, not copies

## 34. Reports & Exports

- Bulk data exfiltration → admin/registrar only, audited

## 35. Dashboard & Planner

- Leaking other students' items → only the viewer's enrollments

## 36. Mastery Paths, Assign-To & Pacing

- Unlock by tampering → release computed server-side from posted scores

## 37. Copy, Import, Blueprints & Sharing

- Malicious packages → quarantine + scan
- Overwriting local edits → blueprint locks + three-way diff

## 38. Developer Keys & API

- Token theft → hashed tokens, scopes, expiry, revocation
- Abuse → per-key rate limits

## 39. Observers & Family

- Unauthorized observation → link + consent required

## 40. Account & Profile

- QR replay → one-time, 5-minute, hashed codes

## 41. Catalog & Hub

- Misleading claims → copy checker blocks publish
- Price tampering → server-side quote only

## 42. Pathways & Transfer

- Waiver abuse → rules evaluated server-side from completion records only

## 43. Commerce (sandbox)

- Real card data → never accepted; sandbox references only
- Seat over-assignment → counted in the transaction

## 44. AI Tutor

- Answer leakage on graded work → refusal rules + eval gate
- Cross-course retrieval → course-scoped ACL at query time

## 45. Lab Key Vault

- Key exfiltration → short expiry, per-learner cap, revocation
- Spend abuse → cap enforced before each call

## 46. Tenant Console

- Cross-tenant leakage via licensing → content tables only are copied, never learner data
- Operator overreach → operators see de-identified metrics only

## 47. Connectors

- Secret exposure → references only, never raw secrets
- Silent fake integrations → status shown everywhere

## 49. Proctored Assessment Support

- Unapproved or punitive wording → only published talking points; publish blocked by the tone and promise check
- Collecting ID photos or medical details → never requested; uploads refused; question log redacts numbers and emails
- Policy decisions by the assistant → exceptions, accommodations and incidents always escalate to people
