# HavenConnect Agentic AI — implementation and architecture

## Current release (v40)

v40 turns the Agentic AI view into a 22-module suite while keeping the v39 principles: the existing `cx_records` and `cx_events` tables, the staff sign-in boundary, human approval for consequential actions, and no fabricated metrics.

### What changed

| Area | v40 behavior | Still gated |
| --- | --- | --- |
| AI provider | Server-side router: Anthropic (`ANTHROPIC_API_KEY`) or OpenAI (`OPENAI_API_KEY`); `AI_PROVIDER` picks when both exist. Text is redacted (PII, PCI, PHI, FERPA rules) before any model call; every call is logged as `ai.generated` without content. | Staff review every draft before it is recorded or sent. |
| Classification | Base rules + staff corrections (`label` records) + routing rules (`routing` records, admin only). Accuracy is measured against corrections, never assumed. | Model-assisted classification still needs a labeled evaluation set. |
| Sessions | Recorded replies, channel switches with carried context, Live Sync fields and confirmations, handoffs, survey ratings, Copilot summaries. Browser speech capture works where the browser supports it. | External delivery needs a tested gateway. |
| Autoflows | Visual canvas (agentic, rule-based and staff-approval nodes), dry runs that change nothing, approval by an authorized administrator, plans attached to sessions. | External steps stay "Approval and connector required". |
| Education | Student 360 dropdown (each view logged), grade drafts, finalize → second-person approval → **Final, recorded in the HavenConnect student record**, then sent to Scholaris Global Learning; enrollment with prerequisite, duplicate and capacity checks; admissions pipeline; classroom view; faculty directory. | Scholaris sync runs only with `SCHOLARIS_API_URL`, `SCHOLARIS_API_TOKEN`, the tenant ID, and section and student ID mapping (plus assignment IDs in Canvas-compatible mode). |
| Alerts | Derived from records: SLA breach, handoff/review, knowledge gaps, drafts awaiting approval, grade approvals, Scholaris sync failures. Acknowledge, assign, note, resolve. | Paging/notification delivery needs a connector. |
| Agent Network | Orchestrator + 10 agents with memory and tools; admins can pause an agent (pausing Ticket Classification or an AI task is enforced server-side); per-session reasoning trace (perception → memory → reasoning → decision → execution → feedback). | — |
| Savings & ROI | Estimated avoided cost = sessions resolved without handoff × your cost per inquiry; scenario with platform and implementation cost; business case download. | All dollar figures are labeled estimates. |
| Platform & Services | Live health check of HavenConnect service endpoints and a service/cloud map. | — |

### Access model

| Capability | Who |
| --- | --- |
| View/edit student contexts, enrollment, admissions | `HAVEN_CX_EDU_EMAILS` or `HAVEN_XCONNECT_ADMIN_EMAILS` |
| Instructor view of own sections and their grades | Course `instructorEmail` matches the signed-in staff email |
| Approve knowledge, Autoflows, personas | Education/admin list |
| Approve grades | `HAVEN_GRADE_APPROVER_EMAILS` or admin list; must differ from the person who finalized unless `HAVEN_GRADE_SINGLE_APPROVER=true` (staging only) |
| Approve campaigns, edit routing, install packs, pause agents, change redaction | `HAVEN_XCONNECT_ADMIN_EMAILS` |

### Sample data

`sample.seed` loads labeled records (`sample: true`) — courses, students, grades, applicants, faculty, approved knowledge, one approved Autoflow and four sessions — and `sample.clear` removes them and their events. The workspace shows a banner while sample data exists.

## v39 baseline


This release extends the existing HavenConnect Site and its `cx_records` and `cx_events` tables. It preserves the staff workspace, authentication boundary, communications routes, number registry, and deployed URL. The Agentic AI view now records web inquiries, classifies incoming messages, assigns a specialist and priority, retrieves only approved knowledge, flags gaps, creates audited Autoflow plans, logs handoffs, and records one survey rating per resolved session. Its assumptions calculator estimates potential avoided handling cost; it does not report realized savings.

External channels and Live Sync media remain in connection-required states. Browser speech preview and speech capture depend on the user's browser. A saved persona setting is not a connected real-time TTS model. Copilot uses the existing OpenAI Responses connection only when its server-side key is configured; it drafts text for human review. No payment, SIS, healthcare, or account mutation is represented as completed without a verified service action.

## AI-infused workflow map

| Stage | Mode | Current behavior | Next integration gate |
| --- | --- | --- | --- |
| Receive web inquiry | Automated | Staff opens a web session and records a message or captured transcript | Public widget, authenticated inbound webhook, spam controls |
| Identify person | Manual | Authorized staff selects an existing dossier; access is logged | Trusted identity provider and field-level SIS/CRM permission checks |
| Detect intent and risk | AI-enhanced | Deterministic classifier routes admissions, finance, IT, and general support; urgent or sensitive content flags human review | Evaluate model-assisted classification against labeled cases before enabling |
| Retrieve guidance | Automated | Term-weighted search returns approved articles with source labels | Ingestion, versioned citations, tenant-isolated vector index, revalidation |
| Plan work | AI-enhanced | Approved Autoflow steps are copied into an auditable session plan | Durable workflow engine with retries, idempotency, timers, approval signals |
| Make consequential changes | Manual | Staff reviews the plan; external steps explicitly remain pending | Per-tool authorization, identity checks, consent, verified connector, receipt |
| Respond | AI-enhanced | Copilot can draft a response if configured; staff records an approved message | Channel gateway, quality checks, delivery receipts |
| Live Sync | Manual | Staff records an on-screen confirmation | Call-linked WebRTC identity, consent, synchronized form state, signed acknowledgements |
| Resolve and learn | Automated | Resolution, handoff, survey rating, and audit events feed KPIs and gap counts | Outcome taxonomy, QA sampling, cost baseline, forecasting |

## Enterprise technology path

| Layer | Present | Recommended expansion |
| --- | --- | --- |
| Operator UI | Existing React/Vinext application and Shadcn primitives | Keep a shared design system; dedicated student and customer views |
| Transaction store | Existing tenant-tagged D1 records and events | PostgreSQL/Aurora for multi-tenant production workloads with tenant policy enforcement, migrations, backup and retention design |
| Orchestration | Audited session events and gated plan creation | Temporal workflows for long-running approval, retry, and compensating actions |
| AI | Existing server-side OpenAI Copilot when configured | Versioned prompts, retrieval citations, evaluation dataset, model gateway and policy checks; alternate provider only after data-processing review |
| Knowledge | Approved text lookup | S3/object storage ingestion and Qdrant/Pinecone or a suitable managed index scoped by tenant and document permissions |
| Channels | Web workspace; existing HavenConnect gateway routes | Amazon Connect Customer or existing communications gateway, with channel-specific verification for voice, chat, SMS, email, WhatsApp, and social channels |
| Voice and Live Sync | Browser preview/capture | Telephony provider + WebRTC media and synchronized signed form events; measure round-trip latency |
| Analytics | Event-derived FCR, confirmation count, CSAT, ticket routing and scenario calculator | Warehouse/event pipeline; Power BI REST integration for governed reporting |

The current deployment is not an AWS trust boundary. Moving or connecting protected data to AWS requires an architecture and contractual review. Vendor compliance eligibility never certifies HavenConnect itself. HIPAA, FERPA, PCI DSS, GDPR, FedRAMP, SOC 2, and ISO 27001 each require their own applicable controls, agreements, assessment, and operational evidence.

Official capability references: [Amazon Connect Customer channels](https://docs.aws.amazon.com/connect/latest/adminguide/set-channels.html), [Amazon Connect security](https://docs.aws.amazon.com/connect/latest/adminguide/security.html), [Temporal workflow message passing](https://docs.temporal.io/develop/typescript/workflows/message-passing), [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses), and [Power BI REST APIs](https://learn.microsoft.com/en-us/rest/api/power-bi/).

## Dashboard and wireframe specification

| Region | Controls and data | Empty or blocked state |
| --- | --- | --- |
| Header | Staff identity, authorized dossier selector, Agentic AI workspace | Selection disabled without education access |
| Overview | FCR, Live Sync confirmations, CSAT, gap alerts, gateway readiness, start inquiry | Missing denominators show an em dash, never a fabricated percentage |
| Ticket intelligence | Subject, detected intent, route, priority, state; click opens session | Awaiting first message |
| Live sessions | Event timeline, message/transcript capture, handoff, visual confirmation, approved flow plan, survey entry | Call-linked synchronization marked as unconnected |
| Personas & voice | Alex, Jessica, Kyle, Hannah; pitch, speed, intonation, stability; browser preview; channel matrix | Unconnected channels cannot be activated |
| Autoflows and knowledge | Draft authoring, authorized approval, version, approved guidance | External steps remain pending; draft content is excluded from retrieval |
| Copilot | Draft suggestion and staff-approved recording | Key missing yields a connection error |
| Insights | Interaction counts, knowledge gaps, audit trail, editable ROI assumptions | Forecast and realized savings are not inferred from sparse data |
| Channels | Provider readiness and authorized dossier creation | Explicit credentials and test requirements |

KPI definitions: **FCR** = resolved sessions without a handoff / resolved sessions. **CSAT** = ratings of 4 or 5 / recorded ratings. **Live Sync confirmations** = recorded visual confirmation events, not call-linked completion velocity. **Autonomous deflection** and **Copilot SLA speedup** need channel outcomes and timing baselines; they remain blank. The ROI scenario is `monthly inquiries × cost per inquiry × assumed deflection percentage` and excludes implementation and operating costs.

## Production readiness gates

1. Establish tenant identity, role and field policies, retention periods, consent, and audit export before adding regulated records.
2. Connect one inbound and outbound channel at a time, with signed webhooks, delivery receipts, opt-in and opt-out, replay protection, and end-to-end tests.
3. Connect SIS, CRM, payment, and other write actions only through scoped service accounts and idempotent APIs. Require human approval and receipts for consequential actions.
4. Use a labeled evaluation set to measure routing accuracy, knowledge grounding, harmful actions, escalation quality, latency, FCR, CSAT, and cost before enabling autonomous resolution.
5. Validate regulatory scope with legal and security owners; do not claim compliance from infrastructure choices alone.
