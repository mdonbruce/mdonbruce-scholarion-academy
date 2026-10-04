export type TenantConfig = {
  slug: string; name: string; environment: string; customDomain: string;
  primaryRegion: string; isolationMode: string; identityRealm: string;
  secretRef: string; kmsRef: string;
};

const secretPattern = /(?:sk-[A-Za-z0-9_-]{12,}|-----BEGIN |password\s*[:=]|api[_-]?key\s*[:=]|client[_-]?secret\s*[:=]|bearer\s+[A-Za-z0-9_-]{12,})/i;
export function rejectRawSecrets(value: string) {
  if (secretPattern.test(value)) throw new Error("Raw secrets are not allowed in tenant metadata or change notes.");
}
const domainPattern = /^(?=.{4,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const slugPattern = /^[a-z][a-z0-9-]{2,62}$/;
const realmPattern = /^[a-z][a-z0-9:._/-]{2,159}$/;
const refPattern = /^(secret-ref|kms-ref):\/\/[a-z0-9][a-z0-9._/-]{3,199}$/;
export const environments = ["Development", "Staging", "Production"];
export const isolationModes = ["Shared schema", "Schema per tenant", "Database per tenant"];

export function normalizeConfig(input: Record<string, unknown>): TenantConfig {
  const pick = (key: keyof TenantConfig, max = 200) => String(input[key] ?? "").trim().slice(0, max);
  const data: TenantConfig = {
    slug: pick("slug", 64).toLowerCase(), name: pick("name", 120),
    environment: pick("environment", 30), customDomain: pick("customDomain", 253).toLowerCase().replace(/\.$/, ""),
    primaryRegion: pick("primaryRegion", 80), isolationMode: pick("isolationMode", 40),
    identityRealm: pick("identityRealm", 160), secretRef: pick("secretRef"), kmsRef: pick("kmsRef"),
  };
  Object.values(data).forEach(rejectRawSecrets);
  if (!slugPattern.test(data.slug) || !data.name) throw new Error("A name and a slug of 3–63 letters, digits, or hyphens are required.");
  if (!environments.includes(data.environment)) throw new Error("Choose a supported environment.");
  if (data.customDomain && (!domainPattern.test(data.customDomain) || data.customDomain.split(".").some(label => label.length > 63 || label.endsWith("-")) || /\.(local|internal|localhost|test|invalid)$/.test(data.customDomain))) throw new Error("Enter a public DNS domain without a scheme or path.");
  if (data.primaryRegion && !/^[a-z]{2}(?:-[a-z0-9]+){1,4}$/.test(data.primaryRegion)) throw new Error("Use a cloud region identifier such as us-east-1.");
  if (data.isolationMode && !isolationModes.includes(data.isolationMode)) throw new Error("Choose a supported isolation mode.");
  if (data.identityRealm && !realmPattern.test(data.identityRealm)) throw new Error("Use an identity realm identifier, not credentials or a URL.");
  for (const [key, prefix] of [["secretRef", "secret-ref"], ["kmsRef", "kms-ref"]] as const) {
    const value = data[key];
    if (value && (!refPattern.test(value) || !value.startsWith(`${prefix}://`))) throw new Error(`${key} must be an opaque ${prefix}:// vault reference.`);
  }
  return data;
}

export function assess(config: TenantConfig & { domainStatus?: string }) {
  const checks = {
    domain: !!config.customDomain && config.domainStatus === "Verified",
    region: !!config.primaryRegion,
    isolation: !!config.isolationMode,
    realm: !!config.identityRealm && config.identityRealm.toLowerCase().includes(config.slug),
    encryption: !!config.secretRef && !!config.kmsRef,
  };
  const recommendations: string[] = [];
  if (!config.customDomain) recommendations.push("Add a custom domain and publish its DNS challenge.");
  else if (!checks.domain) recommendations.push("Run domain validation after publishing the TXT challenge.");
  if (!checks.region) recommendations.push("Select a primary region before provisioning.");
  if (!checks.isolation) recommendations.push("Choose and review the tenant isolation mode.");
  if (!checks.realm) recommendations.push("Align the identity realm with the tenant slug.");
  if (!checks.encryption) recommendations.push("Provide secret-ref and kms-ref identifiers; verify them in the vault integration.");
  return { checks, score: Math.round(Object.values(checks).filter(Boolean).length / 5 * 100), ready: Object.values(checks).every(Boolean), recommendations };
}

export function classifyChange(previous: TenantConfig, next: TenantConfig) {
  const fields = (Object.keys(next) as (keyof TenantConfig)[]).filter(key => previous[key] !== next[key]);
  return { fields, classification: fields.some(key => key !== "name") ? "Sensitive" : "Routine" };
}

export function dnsChallenge(domain: string, token: string) { return { name: `_havenconnect.${domain}`, type: "TXT", value: `havenconnect-verify=${token}` }; }

export function matchesDnsAnswer(answer: Array<{ name?: string; type?: number; data?: string }> | undefined, domain: string, token: string) {
  const challenge = dnsChallenge(domain, token);
  return Boolean(answer?.some(record => record.type === 16 && record.name?.toLowerCase().replace(/\.$/, "") === challenge.name &&
    record.data?.replace(/"\s*"/g, "").replaceAll('"', "") === challenge.value));
}
