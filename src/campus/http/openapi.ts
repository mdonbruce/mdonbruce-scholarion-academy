import { ENTITIES, TABS, type FieldDef } from "../registry";
import { allOperations, type ParamType } from "./ops";

/** OpenAPI 3.1 document generated from the registry and the operations list (served at /openapi.json; exported to /contracts). */

function fieldSchema(f: FieldDef): Record<string, unknown> {
  const base: Record<string, unknown> = { description: f.label + (f.help ? ` — ${f.help}` : "") };
  switch (f.type) {
    case "number":
      return { ...base, type: "number", ...(f.min !== undefined ? { minimum: f.min } : {}), ...(f.max !== undefined ? { maximum: f.max } : {}) };
    case "boolean":
      return { ...base, type: "boolean" };
    case "tags":
      return { ...base, type: "array", items: { type: "string" } };
    case "json":
      return { ...base };
    case "date":
      return { ...base, type: "string", format: "date" };
    case "datetime":
      return { ...base, type: "string", format: "date-time" };
    case "enum":
      return { ...base, type: "string", enum: f.options };
    case "email":
      return { ...base, type: "string", format: "email" };
    case "url":
      return { ...base, type: "string", format: "uri" };
    case "ref":
      return { ...base, type: "string", "x-ref": f.ref };
    default:
      return { ...base, type: "string" };
  }
}

const P_TYPE: Record<ParamType, Record<string, unknown>> = { string: { type: "string" }, text: { type: "string" }, number: { type: "number" }, boolean: { type: "boolean" }, json: {}, list: { type: "array", items: { type: "string" } }, date: { type: "string", format: "date-time" } };
const err = { $ref: "#/components/responses/Error" };

export function openApi(tenantSlug = "{tenant}") {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {
    Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, detail: {} }, required: ["code", "message"] } } },
    Meta: { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, deletedAt: { type: "string", format: "date-time" } } },
  };
  for (const e of ENTITIES) {
    const name = e.table.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());
    const props = Object.fromEntries(e.fields.filter((f) => !f.secret).map((f) => [f.name, fieldSchema(f)]));
    schemas[name] = { allOf: [{ $ref: "#/components/schemas/Meta" }, { type: "object", properties: props }], description: `${e.label} (tab: ${e.tab})` };
    const input = { type: "object", properties: Object.fromEntries(e.fields.filter((f) => !f.system).map((f) => [f.name, fieldSchema(f)])), required: e.fields.filter((f) => f.required && !f.system).map((f) => f.name) };
    const tag = TABS.find((t) => t.slug === e.tab)?.title ?? e.tab;
    paths[`/r/${e.table}`] = {
      get: { tags: [tag], summary: `List ${e.plural.toLowerCase()}`, parameters: [{ name: "cursor", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } }, { name: "q", in: "query", schema: { type: "string" } }, { name: "courseId", in: "query", schema: { type: "string" } }], responses: { 200: { description: "Page of results. Next page in the Link header (rel=\"next\"); total in X-Total-Count.", headers: { Link: { schema: { type: "string" } }, "X-Total-Count": { schema: { type: "integer" } } }, content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${name}` } } } } } } }, 401: err, 403: err } },
      ...(e.workflow ? {} : { post: { tags: [tag], summary: `Create a ${e.label.toLowerCase()}`, requestBody: { content: { "application/json": { schema: input } } }, responses: { 201: { description: "Created" }, 403: err, 422: err } } }),
    };
    paths[`/r/${e.table}/{id}`] = {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { tags: [tag], summary: `Get a ${e.label.toLowerCase()}`, responses: { 200: { description: "OK (ETag = version)" }, 404: err } },
      ...(e.workflow ? {} : { patch: { tags: [tag], summary: `Update a ${e.label.toLowerCase()} (send If-Match: version)`, parameters: [{ name: "If-Match", in: "header", schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { ...input, required: [] } } } }, responses: { 200: { description: "OK" }, 409: err, 412: { description: "Changed since you loaded it" }, 422: err } } }),
      delete: { tags: [tag], summary: `Delete (tombstone) a ${e.label.toLowerCase()}`, responses: { 200: { description: "Deleted" }, 403: err } },
    };
    if (e.publishable) paths[`/r/${e.table}/{id}/publish`] = { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], post: { tags: [tag], summary: "Publish (validation runs first)", responses: { 200: { description: "Published" }, 422: err } }, delete: { tags: [tag], summary: "Unpublish", responses: { 200: { description: "Unpublished" } } } };
  }
  for (const op of allOperations()) {
    const tag = TABS.find((t) => t.slug === op.tab)?.title ?? op.tab;
    const params = op.params.map((p) => ({ name: p.name, required: !!p.required, description: p.help, schema: p.options ? { type: "string", enum: p.options } : P_TYPE[p.type ?? "string"] }));
    if (op.kind === "query") paths[`/q/${op.name}`] = { get: { tags: [tag], operationId: op.name, summary: op.summary, parameters: params.map((p) => ({ ...p, in: "query" })), responses: { 200: { description: "OK" }, 401: err, 403: err } } };
    else paths[`/a/${op.name}`] = { post: { tags: [tag], operationId: op.name, summary: op.summary, requestBody: { content: { "application/json": { schema: { type: "object", properties: Object.fromEntries(params.map((p) => [p.name, { ...p.schema, description: p.description }])), required: params.filter((p) => p.required).map((p) => p.name) } } } }, responses: { 200: { description: "OK" }, 401: err, 403: err, 409: err, 422: err } } };
  }
  Object.assign(paths, {
    "/auth/signin": { post: { tags: ["Identity"], summary: "Sign in (email, password, TOTP code for staff)", security: [], responses: { 200: { description: "Session cookie set" }, 401: { description: "Bad credentials or { needsMfa: true }" } } } },
    "/auth/signout": { post: { tags: ["Identity"], summary: "Sign out", responses: { 200: { description: "OK" } } } },
    "/auth/masquerade": { post: { tags: ["Admin Console"], summary: "Start acting as a user (admins with MFA; audited)", responses: { 200: { description: "OK" } } }, delete: { tags: ["Admin Console"], summary: "Stop acting as a user", responses: { 200: { description: "OK" } } } },
    "/me": { get: { tags: ["Identity"], summary: "The signed-in person", responses: { 200: { description: "OK" } } } },
    "/tabs": { get: { tags: ["Identity"], summary: "Tabs visible to me", responses: { 200: { description: "OK" } } } },
    "/graphql": { post: { tags: ["Platform"], summary: "GraphQL endpoint (queries over every resource, plus create/update mutations)", responses: { 200: { description: "GraphQL response" } } } },
    "/oauth2/token": { post: { tags: ["Developer"], summary: "OAuth2 token endpoint (authorization_code, refresh_token, client_credentials with JWT assertion for LTI)", security: [], responses: { 200: { description: "Token" }, 400: err, 401: err } } },
    "/.well-known/jwks.json": { get: { tags: ["Integration"], summary: "Platform signing keys (LTI)", security: [], responses: { 200: { description: "JWKS" } } } },
    "/.well-known/openid-configuration": { get: { tags: ["Integration"], summary: "Platform configuration for LTI dynamic registration", security: [], responses: { 200: { description: "OK" } } } },
    "/lti/lineitems/{assignmentId}/scores": { post: { tags: ["Integration"], summary: "AGS: post a score (stored unposted)", responses: { 200: { description: "OK" } } } },
    "/lti/courses/{courseId}/lineitems": { get: { tags: ["Integration"], summary: "AGS: line items", responses: { 200: { description: "OK" } } } },
    "/lti/courses/{courseId}/memberships": { get: { tags: ["Integration"], summary: "NRPS: course memberships", responses: { 200: { description: "OK" } } } },
    "/verify/{credentialId}": { get: { tags: ["Credentials"], summary: "Public credential verification", security: [], responses: { 200: { description: "Status and consented fields" } } } },
  });
  return {
    openapi: "3.1.0",
    info: { title: "Scholarion Campus API", version: "1.0.0", description: "Tenant-scoped API. Every path is under /api/campus/v1/t/{tenant}. Pagination: Link header (rel=\"next\"). Concurrency: If-Match with the record version (412 on conflict). Admins may add ?as_user_id= to act as a user (audited). Local and staging only — demonstration data." },
    servers: [{ url: `/api/campus/v1/t/${tenantSlug}` }],
    security: [{ session: [] }, { bearer: [] }],
    tags: TABS.map((t) => ({ name: t.title, description: t.summary })),
    paths,
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "scc_<tenantId>" }, bearer: { type: "http", scheme: "bearer", description: "Personal access token or OAuth2 access token (scopes: read, write, <resource>:read|write)" } },
      responses: { Error: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      schemas,
    },
  };
}
