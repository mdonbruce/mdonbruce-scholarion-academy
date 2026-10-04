# One Agentic AI for every Haven product (v41)

HavenConnect Agentic AI now serves each Haven Digital Systems product from its own **room**. A room has its own agents and personas, knowledge, routing, Autoflows, campaigns, alerts, analytics, settings and audit log. Staff switch rooms from the selector at the top of the workspace; **Haven Portfolio** shows every room side by side and **Apps & Rooms** is the product registry.

## Rooms included

| Room | Product | Guardrail pack | Storage |
| --- | --- | --- | --- |
| `oak-haven` | Oakhaven Suites (existing v40 data) | Hospitality | Shared |
| `havenup` | HavenUP front desk | Hospitality | Shared |
| `vervestack` | VerveStack distribution | Hospitality | Shared |
| `scholaris` | Scholaris Global Learning | Education | Dedicated · `DB_SCHOLARIS` |
| `oakhaven-global-university` | OakHaven Global University (guest on Scholaris) | Education | Dedicated · `DB_OAKHAVEN_GLOBAL_UNIVERSITY` |
| `medigrid` | MEDIGRID pharmacy distribution | Health · PHI | Dedicated · `DB_MEDIGRID` |
| `haven-trading` | Haven Trading | Finance · trading | Dedicated · `DB_HAVEN_TRADING` |
| `intellicore` | IntelliCore | Standard | Shared |
| `haven-agentic-ai` | Haven Agentic AI (GridLink) | Standard | Shared |
| `homepilot` | HomePilot | Standard (edit when defined) | Shared |

Platform administrators add more products in **Apps & Rooms**; new rooms appear in the selector immediately. Existing Oak Haven records keep their v40 ids, so nothing moves.

## Access

- Platform administrators (`HAVEN_XCONNECT_ADMIN_EMAILS`) can enter every room and edit the registry.
- Oak Haven stays open to all signed-in staff, as in v40.
- Every other room admits its listed **members**: individual emails or whole domains such as `@scholarisglobal.com`. With no members, only administrators can enter.
- Education, grade-approver and instructor rules from v40 apply inside each room.

## Storage and isolation

- **Shared** rooms use the main D1 database; every row carries the room's `tenant_id` and every query is scoped to it. Fixed record ids (settings, personas, ROI, alerts) are prefixed with the room slug, and an id owned by another room is refused rather than overwritten.
- **Dedicated** rooms use their own D1 database bound as `DB_<ROOM>` (hyphens become underscores). Create the database, add the binding in hosting, and apply the migrations in `drizzle/`. Until the binding exists the room shows a clear error; its data is never written to the shared database.
- A live room can't be switched between shared and dedicated in the registry; that needs a planned data migration.

## Guardrail packs

| Pack | Always redacted before AI | Extra policy given to the AI | Staff review of every AI draft |
| --- | --- | --- | --- |
| Standard | PII, card numbers | — | No |
| Hospitality | PII, card numbers | Never take card numbers in chat; staff confirm booking changes | No |
| Education | PII, student IDs | Protect student records; verified identity before sharing | No (grades keep two-person approval) |
| Health · PHI | PII, card numbers, health details | No diagnoses, dosing or medical advice; never reveal prescriptions | **Yes** |
| Finance · trading | PII, card numbers | No personalized investment advice; risk disclosure | **Yes** |

MEDIGRID and Haven Trading should not go live until their legal and compliance owners review these packs.

## Sending messages in from a product

Each product's **backend** posts signed messages to `POST /api/agentic-ai/inbound`:

| Header | Value |
| --- | --- |
| `x-haven-app` | room slug, e.g. `havenup` |
| `x-haven-timestamp` | Unix seconds (must be within 5 minutes) |
| `x-haven-signature` | `sha256=` + hex HMAC-SHA256 of `${timestamp}.${rawBody}` using `HAVEN_INBOUND_SECRET_<ROOM>` |

Body: `{ externalId, messageId?, channel, subject?, text, customer?: { name, reference } }`. The same `externalId` continues a session (a resolved session starts a new one); the same `messageId` is ignored as a duplicate. The message is classified and routed in that room; nothing is replied automatically. See `examples/inbound/send-message.mjs`.

An embeddable browser chat widget is not included yet: a public widget needs origin allow-lists and abuse protection, so products should call the inbound API from their servers for now.
