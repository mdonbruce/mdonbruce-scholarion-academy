# Scholarion Free Education Resource Hub, Career Connect & Auto-Discovery

Tabs 57–59. The code is in `src/campus/services/ecosystem/`, the UI is at `/campus/{tenant}/hub/{section}`, and the tests are in `tests/campus-ecosystem.test.ts`.

## Modules

| Area | Route | Who |
|---|---|---|
| Overview: summary cards, activity panel and role-specific panel | `hub/overview` | everyone |
| Free Tools Directory | `hub/tools` | everyone |
| AI & Machine Intelligence | `hub/ai` | everyone |
| Agentic AI Tools & Templates | `hub/agentic` | everyone |
| Virtual Instructor & Avatar Studio | `hub/avatar` | everyone |
| Live Classroom Hub | `hub/live` | course members; staff schedule sessions |
| Video & Audio Studio | `hub/media` | everyone |
| Open Courses & Reading Library | `hub/library` | everyone |
| Course Resource Recommendations | `hub/recommendations` | course members; instructors map resources |
| What's New, with subscriptions | `hub/whats-new` | everyone |
| Career Connect: profile, matches and applications | `hub/career` | learners |
| Internship & Employment Board | `hub/board` | everyone |
| Employer Portal | `hub/employer` | employer members |
| Integration Connections | `hub/integrations` | admins |
| Employer Verification | `hub/employers` | admins |
| Discovery & Update Settings | `hub/automation` | admins |
| Integration JSON Schema | `hub/schema` | admins |

The learning area's Sources section, at `learn/{courseId}/sources`, also lists the free resources mapped to that course.

## Availability classes

A record's free-access class is one of:

- ongoing free plan
- open-source / self-hosted
- open educational resource
- education benefit (eligibility required)
- limited free credits
- time-limited trial
- unknown

Some things are tracked separately because they're often confused:

- **API access is separate from the free app.** A free consumer app doesn't mean the API is free.
- **Hosting cost is separate from the software licence.** Free software can still cost money to run.
- **Provider certificates are separate from Scholarion certificates.**

A record is **verified** only when every limit and classification it states was confirmed on a fetched official page. Anything incomplete or conflicting stays **pending**. Learners see only these states:

- verified
- stale (labelled)
- unavailable (labelled)

## Initial catalog (researched 2026-10-04)

The catalog has 28 records: 21 verified and 7 pending. The evidence came from official pricing, documentation, licence and course pages. The research tool returned page summaries rather than verbatim text, which is why `evidence.summary` exists. The monthly terms review re-fetches every page itself.

Meeting limits confirmed on the official pages:

| Service | Limits | Source |
|---|---|---|
| Zoom Basic | 40 minutes and 100 participants per meeting | zoom.us/pricing |
| Webex Free | Up to 40 minutes and 100 attendees per meeting | pricing.webex.com |
| Google Meet, free Google Account | Group meetings up to 60 minutes; one-to-one calls have no time limit; 100 participants | workspace.google.com/products/meet |

The seven records still pending, and why:

- **CrewAI:** the licence wasn't quoted.
- **ElevenLabs:** it isn't confirmed whether the free plan includes API access.
- **HeyGen:** some limits are confirmed only from a summary.
- **D-ID:** the trial length and credits aren't stated.
- **Stanford CS224N:** there's no licence.
- **Kaggle Learn:** the certificate terms aren't confirmed.
- **DeepLearning.AI short courses:** the current free terms aren't stated.

## Workflow blueprint

The discovery pipeline runs these stages in order:

> scheduled trigger → source selection → fetch → extraction → normalization → verification → deduplication → classification → matching → publication → notification → revalidation

### Trigger

- **Inputs:** a cron expression and an IANA time zone, or an authorized Run now request, or an API request (`POST /discovery/jobs`, which takes an Idempotency-Key).
- **Output:** a job row with a unique key, `schedule:period`.
- **Duplicates and missed runs:** a duplicate tick finds the existing key and creates nothing. If several periods were missed, they collapse into one catch-up job with the trigger `missed_run_catch_up`.

### Source selection

- **Input:** enabled, trusted sources (`eco_sources`). There are three kinds:
  - `official_page`: hosts of evidence pages
  - `rss`: RSS or Atom feeds
  - `greenhouse`: public Job Board API
- **Output:** the list of sources to fetch.
- **Failure:** if no sources are configured, the job finishes with "nothing to do".

### Fetch

- **Input:** URLs on trusted hosts only.
- **Output:** the HTTP status, content type and body (up to 2 MB, 8-second timeout).
- **Refused:** private, internal and unconfigured hosts. There is no arbitrary-URL proxy.
- **Budget:** `max_requests` and `max_runtime_ms` per job.

### Extract

- **Input:** the response body.
- **Output:** feed items, job-board listings, or page text with tags stripped.
- **Safety:** retrieved content is treated as data only. It can't change permissions, schedules or publication rules.

### Normalize

- **Output:**
  - canonical URLs (no tracking parameters or fragments)
  - an employment type
  - a skill vocabulary
- **Provenance:** the source and retrieval date are kept with each record.

### Verify

- **Input:** evidence pages and their check terms (the verified numeric limits).
- **Outcomes:**
  - All terms present → **verified**.
  - The page is reachable but a term is missing → **pending**, with the reason.
  - The page is unreachable after the review date plus 7 days → **stale**.
  - The page returns 404 or 410 → **unavailable**.

### Deduplicate

- **Matching keys:** the canonical URL for resources; the source plus the external ID for jobs.
- **Effect:** an existing record is updated rather than duplicated, and a new version is written only when something meaningful changed.

### Classify

- A feed item publishes as verified only when its source has a provider-wide terms or licence page and declared defaults.
- Everything else stays **pending**.

### Match

- **Resources ↔ courses:** by keywords from the course title, description and modules, against each resource's subjects and use cases.
- **Jobs ↔ learners:** by published skills against passbook, credential and stated-skill evidence.

### Publish

- Records publish automatically when they meet the rules above. There's no approval gate.
- A record that fails a check gets a pending or blocked state with a clear reason.

### Notify

- In-site What's New items and notifications go to subscribers.
- Instructors of affected courses are notified when a resource changes, along with a suggested verified alternative.
- Nothing goes outside the site unless a notification service is configured.

### Revalidate

| Check | Schedule (America/New_York) | Cron |
|---|---|---|
| Link checks | Daily at 5:00 AM | `0 5 * * *` |
| Job discovery | Daily at 6:00 AM | `0 6 * * *` |
| Resource discovery | Mondays at 7:00 AM | `0 7 * * 1` |
| Terms review | The 1st of each month at 8:00 AM | `0 8 1 * *` |
| Integration health | Every six hours | `0 */6 * * *` |

Revalidation also closes listings that disappeared from their source or whose deadline has passed.

### Retries and failure handling

- **Retry backoff:** exponential with jitter: 1 min × 2^(attempt−1), ±25%, capped at 6 hours.
- **Dead-letter:** a job dead-letters after `max_retries + 1` attempts, and admins are notified.
- **Leases:** each run takes a 10-minute lease, which prevents overlapping runs.
- **Checkpoints:** a job that runs out of budget saves its position and resumes from that checkpoint on the next tick.

## Running the scheduler

- **In-process loop:** the campus starts a loop that ticks every minute (`startEcoScheduler`). It doesn't run in tests, and `SCHOLARION_SCHEDULER=off` disables it.
- **External cron alternative:** call `POST /api/campus/v1/t/{tenant}/a/eco.tick` as an admin, or the existing `ops.run_jobs`, which now includes the ecosystem tick.
- **Running both is safe:** job leases and unique period keys stop them from duplicating work.

## API v1

All paths are under `/api/campus/v1/t/{tenant}/`:

| Method | Path |
|---|---|
| GET | `resources`, `resources/{id}`, `tools`, `courses/free`, `employers`, `opportunities`, `integrations` |
| POST | `integrations/{id}/connections` |
| GET | `connections/{id}/health` |
| DELETE | `connections/{id}` |
| POST | `discovery/jobs` |
| GET | `discovery/jobs/{id}` |
| GET, POST | `schedules` |
| PATCH | `schedules/{id}` |
| GET | `courses/{id}/resources` |
| POST | `courses/{id}/resource-mappings` |
| GET, PATCH | `me/career-profile` |
| GET | `me/opportunity-matches` |
| POST | `opportunities/{id}/applications` (needs an Idempotency-Key) |

Every operation is also listed in `contracts/campus/v1/openapi.json`, under the `eco.*` operations.

## Privacy and authorization

- **Learner profiles:** discoverability is off by default, and each field has its own visibility setting.
- **Candidate references:** each employer sees pseudonymous references that can't be linked across employers.
- **Contact details:** shared only after the learner accepts a contact request.
- **Applications:** only the learner starts one. External listings are recorded after the learner applies on the official site.
- **Employers:** each one is verified before it can search talent. The "partner" label needs a recorded relationship.
- **Connections:** they store a key-vault reference name, never a secret. Integration definitions are schema-checked for credentials.
- **Faculty likeness:** the approved photograph is used for branding only. Animating Dr. Martins Idahosa's likeness or synthesizing his voice needs his explicit authorization, and none has been recorded.

## Configuration still required

- **Egress:** the staging runtime needs outbound access to the trusted hosts so discovery and verification can fetch live pages. Until then, jobs run and record honest failures, then retry and dead-letter.
- **Job sources:** the owner chooses which public job boards to ingest (for example, a Greenhouse board token). LinkedIn, Indeed and Handshake need partner API agreements.
- **Email and SMS:** delivery needs an authorized notification service.
- **Provider credentials:** any connected API service needs credentials placed in the key vault by the account owner.

## Sources and terms of use (README for the auto-updating hubs)

| Source | How Scholarion reads it | Terms that apply | Configuration |
|---|---|---|---|
| Vendor and course pages (official sites) | Trusted-host fetch, parsed as data; limits recorded only with an evidence URL | Each vendor's own terms; content is linked, never copied | Egress to the trusted hosts |
| Openly licensed courses and textbooks (CC BY, CC BY-SA, MIT OCW and similar) | Imported with attribution and license link (`contentUse: import_with_attribution`) | The named license; attribution and share-alike kept | None |
| Everything else in the library | Linked or embedded only (`contentUse: link_only`) | Copyright of the owner | None |
| USAJOBS Search API | `api.usajobs.gov` with `Authorization-Key` and `User-Agent` headers | USAJOBS API terms; listings link to the official posting | `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT` |
| Adzuna API | `api.adzuna.com` with `app_id` / `app_key` | Adzuna API terms, including attribution | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Greenhouse Job Board API | Public `boards-api.greenhouse.io` board for an employer that publishes one | Greenhouse's public job board API | Board token per employer |
| Lever Postings API | Public `api.lever.co/v0/postings/{company}` | Lever's public postings API | Company slug per employer |
| RSS / Atom feeds | Feeds the owner adds | The publisher's terms | Feed URL |

**Not scraped:** LinkedIn, Indeed and Glassdoor. Their terms prohibit automated collection, so they are only usable through an official partner agreement.

A source without its key is recorded as **Configuration required** (`needs_configuration`) rather than an error. Adding a source (Discovery & Update Settings → Sources) checks the URL against the allowed pattern for its kind and rejects URLs that carry credentials.

**Automatic posting checks.** Every discovered or employer-posted job is checked before it is listed: verified employer domain (company email domain matches the https website; free-mail addresses are refused), no fees charged to applicants, no requests to move money or send ID or bank details, no chat-app-only interviews, realistic pay, not expired, not a duplicate, and an application link on the employer's or the board's own site. A posting that fails is hidden and logged in "Postings hidden by automatic checks" with the reasons.

**Schedules (America/New_York):** jobs daily, tools and library weekly, full re-verification monthly, link checks daily, weekly digest Monday 09:00. Changes publish automatically with a "What changed" note and appear on the public changelog (`/campus/{tenant}/changelog`). A limit that can't be confirmed on an official page is shown as "unverified", never as a number.

**Digests.** The weekly admin digest summarizes runs, new and retired records, hidden postings and failures. The learner digest goes only to learners who subscribed to it.

**Learner consent (FERPA).** Employer Connect is opt-in with per-field choices. "Withdraw" makes the profile private and cancels open contact requests at once.
