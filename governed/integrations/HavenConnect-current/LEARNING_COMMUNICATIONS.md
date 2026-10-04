# Learning Communications release

The Agentic AI workspace has a new **Education → Learning Communications** module. It uses HavenConnect's existing signed-in product-room access and tenant-scoped `cx_records`/`cx_events` tables. No database migration is required.

## Working in this release

- A free-plan class planner that allocates at most 35 minutes of live instruction per meeting, with 3-minute transitions; 90 minutes of live instruction becomes 3 parts and a 96-minute block.
- Instructor-controlled Session Card drafts with distinct Zoom or Webex links, scheduled timing prompts, link updates, reviewed recaps, and manual attendance evidence.
- Server-side Zoom and Webex identity checks and meeting creation when an administrator configures an encrypted `ZOOM_ACCESS_TOKEN` or `WEBEX_ACCESS_TOKEN`, the corresponding product-room access, and a course instructor assignment.
- A truthful connector registry and an all-disabled Genesys feature list with six deterministic mock checks. The Genesys mock never contacts Genesys.
- Tenant and course permission checks, append-only learning events, and a setup guide.

## Connection requirements and release boundaries

- No Zoom or Webex credential is committed to source. A secret supplied through the hosted Site environment must be checked by an education administrator before API meeting creation. Short-lived access tokens need rotation. A durable OAuth refresh and revocation flow is a later integration requirement.
- Scholarion Academy has not supplied a scoped calendar/roster/session-card API in this source checkout. The approved Session Card is shared by an instructor through an authorized course workflow. Automated publication, reminder delivery, roster reconciliation, recording import, transcription, and learner-facing access need the connected services and permissions.
- The monitor uses scheduled clock time, not a provider presence or media stream. Manual attendance is an instructor-reviewed assertion, not an automatic provider attendance report or SIS writeback.
- A changed meeting link does not cancel the old provider meeting. Cancel or lock it at the provider if the old link leaked.
- Genesys stays disabled in production until subscription, licensed entitlement, data processing, credentials, sandbox test, and explicit administrator activation are complete.

## Pilot checklist

1. Assign the instructor or education administrator to the intended HavenConnect product room and course.
2. Set provider access tokens as encrypted hosted secrets. Use Connector Hub → Test connection. Record provider plan and actual capabilities with the account owner.
3. Plan a class and inspect its complete block duration and segment links. Use manual links until API meeting creation has passed a pilot.
4. Approve the Session Card, share it in the authorized Scholarion course, test learner joins and rejoining, and capture consent before recording.
5. Review and confirm attendance and recaps manually. Keep bulk messaging off until a scoped messaging connector and consent registry are configured.

The source and UI must not describe an untested account as `LIVE`. Zoom Basic and Webex Free currently publish a 40-minute limit, but the current account and its terms take precedence.

## Integration update

The planner now accepts explicit async minutes and a scheduled class block.
The server refuses schedules whose transitions and async work exceed that block.
A 35-minute live + 15-minute async class fits 50 minutes; 90 live minutes needs 96.
Identity checks alone no longer confer CONNECTED state or authorize automated
scheduling. Provider capability verification must be implemented and verified;
manually supplied meeting links remain available. Capability evidence expires
after 90 days. No provider authorization or successful live pilot was established
by this source update. Genesys production paths remain disabled.
