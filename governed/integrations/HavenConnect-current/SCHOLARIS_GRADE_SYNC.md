# Grade sync · HavenConnect → Scholaris Global Learning

Scholaris Global Learning is the LMS/SIS of record. HavenConnect never overwrites a grade silently: a grade is sent only after an instructor finalizes it and a different approver signs off. The approval is recorded in HavenConnect first ("Final grading completed · integrated to the student record"); the Scholaris result is stored beside it.

## Configuration (hosted secrets)

| Variable | Meaning |
| --- | --- |
| `SCHOLARIS_API_URL` | Base URL of the Scholaris API, e.g. `https://api.scholarisglobal.example` |
| `SCHOLARIS_API_TOKEN` | Service token scoped to grade submission for the tenant |
| `SCHOLARIS_TENANT_ID` | Tenant receiving the grades (default `oakhaven-global-university`) |
| `SCHOLARIS_API_STYLE` | `native` (default) or `canvas` |

## Mapping in HavenConnect

- Course → **Scholaris section ID** (Admissions & Registration → Course catalog)
- Student → **Scholaris student ID** (`scholarisStudentId` on the student record)
- Grade component → **Scholaris assignment ID** (grade card; required only in `canvas` style)

Missing IDs leave the grade Final in HavenConnect with Scholaris status "Mapping required".

## `native` style — contract Scholaris should implement

```
POST {SCHOLARIS_API_URL}/v1/tenants/{SCHOLARIS_TENANT_ID}/grade-submissions
Authorization: Bearer {SCHOLARIS_API_TOKEN}
Idempotency-Key: grade:{studentContextId}:{section}:v{version}
Content-Type: application/json

{
  "source": "havenconnect",
  "studentId": "SGL-000123",
  "studentReference": "S1042",
  "sectionId": "sec_cts2314_01_fa26",
  "sectionCode": "CTS2314-01",
  "components": [{ "name": "Module 5 · Northstar VPN activity", "weight": 15, "score": 90, "componentId": null }],
  "total": 87.9,
  "letter": "B",
  "status": "final",
  "approvedBy": "approver@oakhavensuites.com",
  "approvedAt": "2026-09-25T17:40:00.000Z",
  "finalizedBy": "instructor@oakhavensuites.com"
}
```

Expected response: `2xx` with `{ "id": "<submission id>" }`. HavenConnect stores the id as the Scholaris reference. Any non-2xx is recorded as "Failed" with the status code, raises a Critical alert, and can be retried by a grade approver. Scholaris should treat a repeated Idempotency-Key as the same submission.

## `canvas` style

For tenants served by the Canvas-compatible LMS core, HavenConnect sends one request per component:

```
PUT {SCHOLARIS_API_URL}/api/v1/courses/{sectionId}/assignments/{assignmentId}/submissions/{studentId}
{ "submission": { "posted_grade": "90" } }
```
