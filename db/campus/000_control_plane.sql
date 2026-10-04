-- Scholarion control plane (shared; holds no learner data).
BEGIN;
CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('guest','internal','validation')),
  status text NOT NULL CHECK (status IN ('provisioning','active','suspended')),
  realm jsonb NOT NULL,
  theme jsonb NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_plane_dsn_ref text NOT NULL,         -- secret-manager reference, never a raw DSN
  type text, region text, tier text, limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  restored_from jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  offboarded_at timestamptz
);
CREATE TABLE IF NOT EXISTS tenant_domains (host text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), verified boolean NOT NULL DEFAULT false, challenge text NOT NULL, verified_at timestamptz);
CREATE TABLE IF NOT EXISTS platform_operators (tenant_id text NOT NULL REFERENCES tenants(id), user_id text NOT NULL, PRIMARY KEY (tenant_id, user_id));
CREATE TABLE IF NOT EXISTS backups (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), at timestamptz NOT NULL, checksum text NOT NULL, rows bigint NOT NULL, object_ref text NOT NULL);
CREATE TABLE IF NOT EXISTS restore_drills (id text PRIMARY KEY, backup_id text NOT NULL REFERENCES backups(id), validation_tenant text NOT NULL, ok boolean NOT NULL, report jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS content_licenses (id text PRIMARY KEY, source_tenant_id text NOT NULL REFERENCES tenants(id), source_course_id text NOT NULL, target_tenant_id text NOT NULL REFERENCES tenants(id), target_course_id text NOT NULL, syncs int NOT NULL DEFAULT 0, last_sync_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK (source_tenant_id <> target_tenant_id));
CREATE TABLE IF NOT EXISTS model_registry (key text PRIMARY KEY, provider text NOT NULL, status text NOT NULL CHECK (status IN ('LIVE','CONNECTED','DISABLED','SIMULATED','PLANNED')), secret_ref text);
CREATE TABLE IF NOT EXISTS platform_metrics_daily (day date NOT NULL, tenant_id text NOT NULL REFERENCES tenants(id), metric text NOT NULL, bucket text NOT NULL, PRIMARY KEY (day, tenant_id, metric)); -- bucketed, de-identified
COMMIT;
-- Placement service (separate database): profiles synced from the internal tenant only.
-- CREATE TABLE placement_profiles (key text PRIMARY KEY, source_tenant text NOT NULL, name text, headline text, skills text[], seeking text, internships jsonb, updated_at timestamptz);
