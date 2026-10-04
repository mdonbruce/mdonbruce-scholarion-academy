/**
 * Scholarion Integration JSON Schemas (Draft 2020-12), versioned, plus a validator for the subset
 * of keywords they use (type, const, enum, required, properties, additionalProperties:false,
 * items, uniqueItems, minLength, pattern, minimum, and the formats uri and date-time — format
 * validation is ON) and the semantic rules that sit on top of structure.
 */

type J = Record<string, unknown>;
const DT = { type: ["string", "null"], format: "date-time" };
const URI = { type: "string", format: "uri" };
const STR = { type: "string" };
const STRS = { type: "array", items: STR };

export const CLASSIFICATIONS = ["ongoing_free", "open_source", "open_resource", "education_benefit", "limited_credits", "trial", "unknown"] as const;
export const CATEGORIES = ["ai_tool", "agentic_ai", "meeting", "avatar", "video", "audio", "cloud_lab", "course", "reading", "career"] as const;
export const VERIFY_STATES = ["verified", "pending", "stale", "unavailable", "archived"] as const;
export const METHODS = ["api", "oauth", "embed", "feed", "self_hosted", "link"] as const;

export const INTEGRATION_DEFINITION_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/integration-definition/1.0.0",
  title: "Scholarion Integration Definition",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "id", "name", "category", "provider", "access", "connection", "verification"],
  properties: {
    schema_version: { const: "1.0.0" },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{2,79}$" },
    name: { type: "string", minLength: 1 },
    category: { enum: [...CATEGORIES] },
    provider: { type: "object", additionalProperties: false, required: ["name", "official_url"], properties: { name: { type: "string", minLength: 1 }, official_url: URI } },
    access: {
      type: "object",
      additionalProperties: false,
      required: ["classification", "account_required", "payment_card_required", "api_access"],
      properties: {
        classification: { enum: [...CLASSIFICATIONS] },
        account_required: { type: ["boolean", "null"] },
        payment_card_required: { type: ["boolean", "null"] },
        api_access: { enum: ["free", "paid", "mixed", "unavailable", "unknown"] },
        eligibility: STRS,
        limits: { type: "array", items: { type: "object", additionalProperties: false, required: ["metric", "value", "unit"], properties: { metric: STR, value: { type: ["number", "string"] }, unit: STR, reset_period: { type: ["string", "null"] } } } },
        expires_at: DT,
      },
    },
    connection: {
      type: "object",
      additionalProperties: false,
      required: ["method", "auth", "allowed_operations"],
      properties: { method: { enum: [...METHODS] }, auth: { enum: ["none", "api_key", "oauth2", "service_account"] }, documentation_url: URI, allowed_operations: { type: "array", uniqueItems: true, items: STR }, allowed_hosts: { type: "array", uniqueItems: true, items: STR } },
    },
    content_permissions: {
      type: "object",
      additionalProperties: false,
      properties: { license: { type: ["string", "null"] }, embedding: { enum: ["allowed", "prohibited", "unknown"] }, redistribution: { enum: ["allowed", "prohibited", "unknown"] }, attribution_required: { type: ["boolean", "null"] } },
    },
    verification: {
      type: "object",
      additionalProperties: false,
      required: ["status", "evidence"],
      properties: {
        status: { enum: [...VERIFY_STATES] },
        verified_at: DT,
        next_review_at: DT,
        evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "retrieved_at", "claims"], properties: { url: URI, retrieved_at: { type: "string", format: "date-time" }, claims: STRS } } },
      },
    },
  },
};

/** 1.1.0 extends 1.0.0 with educational fields (subjects, use cases, accessibility, geography, certificate). */
export const INTEGRATION_DEFINITION_V1_1: J = {
  ...INTEGRATION_DEFINITION_V1,
  $id: "https://scholarion.local/schemas/integration-definition/1.1.0",
  properties: {
    ...(INTEGRATION_DEFINITION_V1.properties as J),
    schema_version: { enum: ["1.0.0", "1.1.0"] },
    description: STR,
    subjects: STRS,
    use_cases: STRS,
    accessibility: STRS,
    geographic_restrictions: STRS,
    certificate: { enum: ["free", "paid", "none", "unknown", null] },
  },
};

export const EDUCATIONAL_RESOURCE_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/educational-resource/1.0.0",
  title: "Scholarion Educational Resource",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "id", "title", "provider", "official_url", "format", "free_access", "license", "verification_status"],
  properties: {
    schema_version: { const: "1.0.0" },
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{2,79}$" },
    title: { type: "string", minLength: 1 },
    provider: STR,
    author: { type: ["string", "null"] },
    official_url: URI,
    subjects: STRS,
    level: { enum: ["beginner", "intermediate", "advanced", "mixed", "unknown"] },
    prerequisites: STRS,
    duration: { type: ["string", "null"] },
    language: STR,
    objectives: STRS,
    format: { enum: ["course", "textbook", "lecture", "tutorial", "dataset", "practice", "video"] },
    free_access: { type: "boolean" },
    assessment_available: { type: ["boolean", "null"] },
    certificate: { enum: ["free", "paid", "none", "unknown"] },
    license: { type: ["string", "null"] },
    redistribution: { enum: ["allowed", "prohibited", "unknown"] },
    mapped_courses: STRS,
    verification_status: { enum: [...VERIFY_STATES] },
    verified_at: DT,
  },
};

export const EMPLOYER_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/employer/1.0.0",
  title: "Scholarion Employer",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "name", "website", "relationship", "verification"],
  properties: {
    schema_version: { const: "1.0.0" },
    name: { type: "string", minLength: 1 },
    website: URI,
    relationship: { enum: ["external_discovery", "registered", "verified", "partner"] },
    verification: { enum: ["pending", "verified", "rejected"] },
    industries: STRS,
    locations: STRS,
  },
};

export const OPPORTUNITY_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/opportunity/1.0.0",
  title: "Scholarion Opportunity",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "title", "employer", "employment_type", "application_url", "source", "status"],
  properties: {
    schema_version: { const: "1.0.0" },
    external_id: { type: ["string", "null"] },
    title: { type: "string", minLength: 1 },
    employer: { type: "string", minLength: 1 },
    employment_type: { enum: ["internship", "apprenticeship", "graduate", "entry_level", "full_time", "part_time", "contract"] },
    skills: STRS,
    qualifications: STRS,
    location: { type: ["string", "null"] },
    remote: { enum: ["remote", "hybrid", "onsite", "unknown"] },
    work_eligibility: { type: ["string", "null"] },
    compensation: { type: ["string", "null"] },
    application_url: URI,
    posted_at: DT,
    closes_at: DT,
    source: { enum: ["employer_posted", "official_careers_page", "job_board_api", "feed", "partner_program"] },
    status: { enum: ["open", "closed", "pending"] },
  },
};

export const SCHEDULE_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/schedule/1.0.0",
  title: "Scholarion Discovery Schedule",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "key", "kind", "cron", "time_zone", "enabled"],
  properties: {
    schema_version: { const: "1.0.0" },
    key: { type: "string", pattern: "^[a-z0-9_-]{3,40}$" },
    kind: { enum: ["job_discovery", "resource_discovery", "terms_review", "link_check", "integration_health", "digest"] },
    cron: { type: "string", pattern: "^\\S+ \\S+ \\S+ \\S+ \\S+$" },
    time_zone: { type: "string", minLength: 3 },
    enabled: { type: "boolean" },
    budget: { type: "object", additionalProperties: false, properties: { max_requests: { type: "number", minimum: 1 }, max_runtime_ms: { type: "number", minimum: 100 }, max_retries: { type: "number", minimum: 0 } } },
  },
};

export const INGESTION_RESULT_V1: J = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://scholarion.local/schemas/ingestion-result/1.0.0",
  title: "Scholarion Ingestion Result",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "job_id", "kind", "state", "counts"],
  properties: {
    schema_version: { const: "1.0.0" },
    job_id: STR,
    kind: STR,
    state: { enum: ["succeeded", "partial", "failed", "dead"] },
    counts: { type: "object", additionalProperties: false, properties: { fetched: { type: "number" }, created: { type: "number" }, updated: { type: "number" }, unchanged: { type: "number" }, pending: { type: "number" }, closed: { type: "number" }, errors: { type: "number" } } },
    errors: STRS,
  },
};

export const SCHEMAS: Record<string, J> = {
  "integration-definition@1.0.0": INTEGRATION_DEFINITION_V1,
  "integration-definition@1.1.0": INTEGRATION_DEFINITION_V1_1,
  "educational-resource@1.0.0": EDUCATIONAL_RESOURCE_V1,
  "employer@1.0.0": EMPLOYER_V1,
  "opportunity@1.0.0": OPPORTUNITY_V1,
  "schedule@1.0.0": SCHEDULE_V1,
  "ingestion-result@1.0.0": INGESTION_RESULT_V1,
};

/* ---------------- validator ---------------- */

const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const isUri = (s: string) => {
  try {
    const u = new URL(s);
    return !!u.protocol && u.protocol.length > 1;
  } catch {
    return false;
  }
};
const isDateTime = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));

export function validate(schema: J, value: unknown, path = "$"): string[] {
  const errs: string[] = [];
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errs.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).some((e) => e === value)) errs.push(`${path}: must be one of ${(schema.enum as unknown[]).map((e) => JSON.stringify(e)).join(", ")}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const t = typeOf(value);
    if (!types.some((x) => x === t || (x === "number" && t === "integer"))) {
      errs.push(`${path}: must be ${types.join(" or ")}`);
      return errs;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errs.push(`${path}: too short`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern as string, "u").test(value)) errs.push(`${path}: does not match ${schema.pattern}`);
    if (schema.format === "uri" && !isUri(value)) errs.push(`${path}: must be a URI`);
    if (schema.format === "date-time" && !isDateTime(value)) errs.push(`${path}: must be an RFC 3339 date-time`);
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) errs.push(`${path}: must be ≥ ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errs.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items as J, v, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as J;
    const props = (schema.properties as Record<string, J>) ?? {};
    for (const r of (schema.required as string[]) ?? []) if (!(r in obj)) errs.push(`${path}.${r}: is required`);
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) errs.push(...validate(props[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: is not allowed`);
    }
  }
  return errs;
}

const SECRET_KEYS = /(secret|password|token|api[_-]?key|client[_-]?secret|private[_-]?key|bearer)/i;
const SECRET_VALUES = /(sk-[A-Za-z0-9]{16,}|xox[abp]-|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

function findSecrets(v: unknown, path = "$"): string[] {
  if (typeof v === "string") return SECRET_VALUES.test(v) ? [`${path}: looks like a credential`] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => findSecrets(x, `${path}[${i}]`));
  if (v && typeof v === "object")
    return Object.entries(v as J).flatMap(([k, x]) => [...(SECRET_KEYS.test(k) && k !== "auth" ? [`${path}.${k}: credential fields are not allowed in a definition`] : []), ...findSecrets(x, `${path}.${k}`)]);
  return [];
}

/** Semantic rules on top of structure. `trustedHosts` = hosts configured for network access. */
export function semanticChecks(def: J, trustedHosts: string[] = []): string[] {
  const errs: string[] = [];
  const access = (def.access as J) ?? {};
  const conn = (def.connection as J) ?? {};
  const ver = (def.verification as J) ?? {};
  const perms = (def.content_permissions as J) ?? {};
  const evidence = (ver.evidence as unknown[]) ?? [];
  if (ver.status === "verified" && (!evidence.length || !ver.verified_at)) errs.push("Verified entries need supporting evidence and a verification date.");
  if (access.classification === "trial" && !access.expires_at && ver.status !== "pending") errs.push("Trial entries need a known expiration, or must stay pending.");
  if (conn.method === "api" && !conn.documentation_url) errs.push("API integrations need documented API support (documentation_url).");
  if (conn.method === "api" && (access.api_access === "unavailable" || access.api_access === "unknown") && ver.status === "verified") errs.push("An API connection can't be verified while API access is unknown or unavailable.");
  if (perms.redistribution !== "allowed" && ((conn.allowed_operations as string[]) ?? []).includes("import_full_content")) errs.push("Full-content import needs redistribution permission.");
  for (const h of (conn.allowed_hosts as string[]) ?? []) if (!trustedHosts.includes(h)) errs.push(`Provider host ${h} isn't in the trusted network configuration yet.`);
  errs.push(...findSecrets(def));
  return errs;
}

export function validateDefinition(def: unknown, trustedHosts: string[] = []) {
  const version = (def as J)?.schema_version === "1.1.0" ? "integration-definition@1.1.0" : "integration-definition@1.0.0";
  const structural = validate(SCHEMAS[version], def);
  const semantic = structural.length ? [] : semanticChecks(def as J, trustedHosts);
  return { valid: !structural.length && !semantic.length, schema: version, structural, semantic };
}
