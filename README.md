# mdonbruce-scholarion-academy

## Platform integration contract

Scholarion Academy is the learner-facing presentation and orchestration layer for
the **Scholarion platform**. It owns no system-of-record data. Every
learner-facing read or action must use the appropriate Scholarion platform
service; the site presents service responses and coordinates the learner
experience, but does not become the authority for platform records.

### Shared identity

All platform-service interactions use the same authenticated learner identity
and session context. Resolve identity once for the learner session and pass the
platform-approved identity context to each service. Each service remains
responsible for its own authorization decisions. Do not create a separate
Academy identity, credentials store, or service-specific learner account.

### Service ownership and routing

| Learner experience | Scholarion service | Integration responsibility |
| --- | --- | --- |
| Browse offerings and learning routes | Catalog & Pathways | Retrieve catalog and pathway data; render it without treating a local copy as authoritative. |
| Select or pay for an offering | Commerce | Send purchase, payment, and enrollment-purchase actions to Commerce; display its result and status. |
| Take courses and track learning | LMS | Delegate course activity and learning progress to the LMS; render returned course and progress data. |
| Use hosted practical environments | Cloud Lab | Request and control lab experiences through Cloud Lab; show the service's availability and lifecycle state. |
| Get learning assistance | AI Tutor | Send tutor interactions to AI Tutor and present its responses in the learner experience. |
| Earn and present credentials | Credentials | Request credential data and actions from Credentials; do not issue or validate credentials locally. |
| Create and access learner work | Studio outputs | Route Studio output creation and retrieval through the Studio outputs service. |
| Get learner support and experience assistance | HavenConnect CX | Route support and customer-experience interactions through HavenConnect CX. |
| Join live instruction | Zoom/Webex live sessions engine | Coordinate session discovery and participation through the live sessions engine; the site does not own meeting state. |

Use the service that owns the requested capability rather than inferring or
reconstructing another service's records. Use the platform's configured API
contracts and service endpoints; this repository does not define endpoint URLs
or transport details.

### Request and state rules

1. Resolve the shared identity and session context before making an
   identity-dependent service request.
2. Route each learner action to the service responsible for that capability,
   with the platform-approved identity context.
3. Render the service response, including its current status. A successful
   browser interaction alone is not evidence that a platform action succeeded.
4. Keep errors and pending states visible to the learner. Do not report a
   mutation as complete until the owning service confirms it.
5. Treat platform services as authoritative. Do not make Academy-local records
   authoritative for catalog, purchases, enrollment, progress, lab state, tutor
   conversations, credentials, Studio outputs, support cases, or live sessions.
