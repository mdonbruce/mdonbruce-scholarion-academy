-- Scholarion platform — reference PostgreSQL schema (16+)
-- Mirrors src/platform/types.ts. In production each service owns its own schema
-- (identity, catalog, entitlements, commerce, lms, cloudlab, credentials, studio, cx, live).
-- Row-level security isolates organization tenants (Integration Spec §4, rule 6).

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector; -- pgvector, AI Tutor retrieval

-- Every request sets: SET app.tenant_id = '...'; SET app.user_id = '...';
CREATE OR REPLACE FUNCTION app_tenant() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;
CREATE OR REPLACE FUNCTION app_user() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('app.user_id', true) $$;

/* ======================= identity ======================= */
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.tenants (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('public', 'organization')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.users (
  id             text PRIMARY KEY,
  email          citext NOT NULL UNIQUE,
  name           text NOT NULL,
  password_hash  text,                 -- null for SSO-only accounts
  mfa_enabled    boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  timezone       text NOT NULL DEFAULT 'UTC',
  onboarding     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz           -- GDPR/CCPA erasure tombstone
);

CREATE TABLE identity.memberships (
  user_id    text NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  tenant_id  text NOT NULL REFERENCES identity.tenants(id) ON DELETE CASCADE,
  roles      text[] NOT NULL DEFAULT '{learner}',
  PRIMARY KEY (user_id, tenant_id),
  CHECK (roles <@ ARRAY['learner','instructor','reviewer','org_admin','support_agent','platform_admin'])
);

CREATE TABLE identity.sessions (
  token_hash  text PRIMARY KEY,         -- store a hash, never the raw token
  user_id     text NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL REFERENCES identity.tenants(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX ON identity.sessions (user_id);

/* ======================= catalog ======================= */
CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE catalog.products (
  id               text PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  code             text,
  type             text NOT NULL CHECK (type IN ('course','guided_project','specialization','professional_certificate','live_program','bundle','degree')),
  title            text NOT NULL,
  tagline          text NOT NULL,
  description      text NOT NULL,
  level            text NOT NULL,
  track            text,
  duration_label   text NOT NULL,
  hours            numeric(6,1) NOT NULL,
  language         text NOT NULL DEFAULT 'English',
  subtitles        text[] NOT NULL DEFAULT '{}',
  skills           text[] NOT NULL DEFAULT '{}',
  roles            text[] NOT NULL DEFAULT '{}',
  what_youll_learn text[] NOT NULL DEFAULT '{}',
  free_to_audit    boolean NOT NULL DEFAULT false,
  plus_eligible    boolean NOT NULL DEFAULT false,
  format           text NOT NULL CHECK (format IN ('self_paced','live')),
  status           text NOT NULL CHECK (status IN ('published','draft','legacy','hidden')),
  educator         text NOT NULL DEFAULT 'Scholarion Academy',
  live_plan        jsonb,
  credential       jsonb NOT NULL,
  faq              jsonb NOT NULL DEFAULT '[]',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Degrees stay hidden until an accredited partner signs (Spec §15).
  CHECK (type <> 'degree' OR status = 'hidden')
);

CREATE TABLE catalog.product_courses (
  product_id text NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  course_id  text NOT NULL REFERENCES catalog.products(id),
  position   int NOT NULL,
  PRIMARY KEY (product_id, course_id)
);

CREATE TABLE catalog.pathway_edges (
  from_id text NOT NULL REFERENCES catalog.products(id),
  to_id   text NOT NULL REFERENCES catalog.products(id),
  type    text NOT NULL CHECK (type IN ('stacks_into','credit_toward','waives','includes','prerequisite')),
  note    text,
  PRIMARY KEY (from_id, to_id, type)
);

CREATE TABLE catalog.modules (
  course_id  text NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
  no         int NOT NULL,
  title      text NOT NULL,
  week       int NOT NULL,
  estimate   text NOT NULL,
  overview   text NOT NULL,
  objectives text[] NOT NULL DEFAULT '{}',
  key_topics text[] NOT NULL DEFAULT '{}',
  scenario   text,
  PRIMARY KEY (course_id, no)
);

CREATE TABLE catalog.items (
  id              text PRIMARY KEY,
  course_id       text NOT NULL,
  module_no       int NOT NULL,
  position        int NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('video','reading','lab','quiz','project','capstone','discussion','summary')),
  title           text NOT NULL,
  minutes         int NOT NULL,
  graded          boolean NOT NULL DEFAULT false,
  weight          numeric(5,2) NOT NULL DEFAULT 0,
  ai_use_policy   text NOT NULL CHECK (ai_use_policy IN ('open','hints_only','closed')),
  audit_visible   boolean NOT NULL DEFAULT true,
  due_offset_days int,
  body            text,
  video           jsonb,   -- {hls_asset_id, duration_sec, captions[], transcript}
  quiz            jsonb,   -- answers live here; never selected into learner-facing views
  lab             jsonb,   -- hidden tests live here
  project         jsonb,
  FOREIGN KEY (course_id, module_no) REFERENCES catalog.modules(course_id, no) ON DELETE CASCADE
);
CREATE INDEX ON catalog.items (course_id, module_no, position);

/* ======================= entitlements ======================= */
CREATE SCHEMA IF NOT EXISTS entitlements;

CREATE TABLE entitlements.grants (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES identity.users(id),
  tenant_id     text NOT NULL REFERENCES identity.tenants(id),
  resource_kind text NOT NULL CHECK (resource_kind IN ('product','plus')),
  resource_id   text NOT NULL,
  level         text NOT NULL CHECK (level IN ('audit','full','live_seat','instructor')),
  source        text NOT NULL CHECK (source IN ('audit_enrollment','purchase','program_subscription','plus','financial_aid','org_seat','staff')),
  source_ref    text,
  valid_from    timestamptz NOT NULL DEFAULT now(),
  valid_to      timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX ON entitlements.grants (user_id, resource_id) WHERE revoked_at IS NULL;
CREATE INDEX ON entitlements.grants (source_ref);
ALTER TABLE entitlements.grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON entitlements.grants USING (tenant_id = app_tenant());

/* ======================= commerce ======================= */
CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TABLE commerce.price_books (
  region     text NOT NULL,
  currency   char(3) NOT NULL,
  plan       text NOT NULL,
  product_id text,
  amount     numeric(10,2) NOT NULL,
  PRIMARY KEY (region, plan, product_id)
);

CREATE TABLE commerce.checkout_sessions (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES identity.users(id),
  product_id      text,
  plan            text NOT NULL CHECK (plan IN ('program_monthly','plus_monthly','plus_annual','one_time','live_seat')),
  amount          numeric(10,2) NOT NULL,
  currency        char(3) NOT NULL,
  trial_ends_at   timestamptz,
  renews_at       timestamptz,
  refund_policy   text NOT NULL,
  status          text NOT NULL CHECK (status IN ('open','paid','expired')),
  idempotency_key text NOT NULL,
  processor_ref   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE commerce.subscriptions (
  id                   text PRIMARY KEY,
  user_id              text NOT NULL REFERENCES identity.users(id),
  plan                 text NOT NULL,
  product_id           text,
  status               text NOT NULL CHECK (status IN ('trialing','active','paused','canceled','expired','refunded')),
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL,
  trial_end            timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  reminder_sent_at     timestamptz,
  amount               numeric(10,2) NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commerce.orders (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES identity.users(id),
  session_id  text NOT NULL,
  amount      numeric(10,2) NOT NULL,
  currency    char(3) NOT NULL,
  tax         numeric(10,2) NOT NULL DEFAULT 0,
  description text NOT NULL,
  status      text NOT NULL CHECK (status IN ('paid','refunded')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commerce.aid_applications (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES identity.users(id),
  product_id       text NOT NULL REFERENCES catalog.products(id),
  background       text NOT NULL,
  need             text NOT NULL,
  goals            text NOT NULL,
  commitment       boolean NOT NULL,
  status           text NOT NULL CHECK (status IN ('submitted','approved','declined')),
  discount_percent int CHECK (discount_percent BETWEEN 1 AND 100),
  reviewer_id      text REFERENCES identity.users(id),   -- a human always decides
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_aid_per_product ON commerce.aid_applications (user_id, product_id) WHERE status = 'submitted';

/* ======================= lms ======================= */
CREATE SCHEMA IF NOT EXISTS lms;

CREATE TABLE lms.enrollments (
  id              text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES identity.users(id),
  tenant_id       text NOT NULL REFERENCES identity.tenants(id),
  product_id      text NOT NULL,
  course_id       text NOT NULL,
  level           text NOT NULL CHECK (level IN ('audit','full')),
  deadline_anchor timestamptz NOT NULL,
  last_item_id    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE TABLE lms.progress (
  user_id    text NOT NULL,
  item_id    text NOT NULL,
  tenant_id  text NOT NULL,
  status     text NOT NULL CHECK (status IN ('started','completed')),
  resume_sec int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE lms.attempts (
  id           text PRIMARY KEY,
  user_id      text NOT NULL,
  tenant_id    text NOT NULL,
  item_id      text NOT NULL,
  answers      jsonb NOT NULL DEFAULT '{}',
  started_at   timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score        int,
  max          int
);

CREATE TABLE lms.submissions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  tenant_id  text NOT NULL,
  item_id    text NOT NULL,
  text       text NOT NULL,
  file_key   text,                      -- object storage key
  status     text NOT NULL CHECK (status IN ('submitted','graded')),
  score      int,
  max        int,
  feedback   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lms.grades (
  user_id   text NOT NULL,
  tenant_id text NOT NULL,
  item_id   text NOT NULL,
  score     numeric(7,2) NOT NULL,
  max       numeric(7,2) NOT NULL CHECK (max > 0),
  source    text NOT NULL CHECK (source IN ('quiz','lab','instructor','attendance','peer')),
  feedback  text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE lms.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms.progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms.attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms.grades      ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lms.enrollments USING (tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON lms.progress    USING (tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON lms.attempts    USING (tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON lms.submissions USING (tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON lms.grades      USING (tenant_id = app_tenant());

CREATE TABLE lms.peer_reviews (
  id            text PRIMARY KEY,
  submission_id text NOT NULL REFERENCES lms.submissions(id) ON DELETE CASCADE,
  item_id       text NOT NULL,
  reviewer_id   text NOT NULL,
  tenant_id     text NOT NULL,
  scores        jsonb NOT NULL,   -- criterion → points
  total         int NOT NULL,
  max           int NOT NULL CHECK (max > 0),
  comment       text NOT NULL CHECK (length(comment) >= 20),
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- one review per reviewer per classmate per item is enforced in the service (latest submission may change)
CREATE INDEX ON lms.peer_reviews (submission_id);
ALTER TABLE lms.submissions ADD COLUMN needs_staff boolean NOT NULL DEFAULT false;
ALTER TABLE lms.peer_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lms.peer_reviews USING (tenant_id = app_tenant());

/* ======================= teams ======================= */
CREATE SCHEMA IF NOT EXISTS teams;

CREATE TABLE teams.organizations (
  id          text PRIMARY KEY REFERENCES identity.tenants(id),
  name        text NOT NULL,
  domain      citext UNIQUE,              -- organization sign-in domain
  sso_enabled boolean NOT NULL DEFAULT false,
  seats       int NOT NULL CHECK (seats BETWEEN 1 AND 5000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT sso_enabled OR domain IS NOT NULL)
);

CREATE TABLE teams.admins (
  org_id  text NOT NULL REFERENCES teams.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES identity.users(id),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE teams.programs (
  org_id     text NOT NULL REFERENCES teams.organizations(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES catalog.products(id),
  PRIMARY KEY (org_id, product_id)
);

CREATE TABLE teams.members (
  org_id     text NOT NULL REFERENCES teams.organizations(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES identity.users(id),
  status     text NOT NULL CHECK (status IN ('active','revoked')),
  via        text NOT NULL CHECK (via IN ('invite','sso','admin')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE teams.invites (
  token       text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES teams.organizations(id) ON DELETE CASCADE,
  email       citext NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);

ALTER TABLE teams.members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams.invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teams.members  USING (org_id = app_tenant());
CREATE POLICY tenant_isolation ON teams.invites  USING (org_id = app_tenant());
CREATE POLICY tenant_isolation ON teams.programs USING (org_id = app_tenant());

/* ======================= community ======================= */
CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE community.posts (
  id         text PRIMARY KEY,
  course_id  text NOT NULL,
  item_id    text NOT NULL,
  user_id    text NOT NULL REFERENCES identity.users(id),
  parent_id  text REFERENCES community.posts(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(body) BETWEEN 2 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at  timestamptz,
  hidden_by  text
);
CREATE INDEX ON community.posts (item_id, created_at);

CREATE TABLE community.reports (
  post_id     text NOT NULL REFERENCES community.posts(id) ON DELETE CASCADE,
  reporter_id text NOT NULL REFERENCES identity.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reporter_id)
);

/* ======================= cloud lab ======================= */
CREATE SCHEMA IF NOT EXISTS cloudlab;

CREATE TABLE cloudlab.sessions (
  id             text PRIMARY KEY,
  user_id        text NOT NULL,
  item_id        text NOT NULL,
  template_id    text NOT NULL,
  workspace_key  text NOT NULL,
  status         text NOT NULL CHECK (status IN ('running','stopped')),
  resource_class text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE TABLE cloudlab.usage (
  user_id  text NOT NULL,
  day      date NOT NULL,
  cpu_sec  int NOT NULL DEFAULT 0,
  gpu_sec  int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

/* ======================= ai tutor ======================= */
CREATE SCHEMA IF NOT EXISTS tutor;

CREATE TABLE tutor.chunks (
  id        bigserial PRIMARY KEY,
  course_id text NOT NULL,
  item_id   text NOT NULL,
  text      text NOT NULL,
  embedding vector(1024)
);
CREATE INDEX ON tutor.chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE tutor.usage (
  user_id text NOT NULL,
  day     date NOT NULL,
  count   int NOT NULL DEFAULT 0,
  tokens  int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

/* ======================= credentials ======================= */
CREATE SCHEMA IF NOT EXISTS credentials;

CREATE TABLE credentials.issued (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  product_id  text NOT NULL,
  title       text NOT NULL,
  holder_name text NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoke_reason text,
  vc          jsonb NOT NULL   -- signed Open Badges 3.0 credential
);
CREATE UNIQUE INDEX one_active_credential ON credentials.issued (user_id, product_id) WHERE revoked_at IS NULL;

/* ======================= studio ======================= */
CREATE SCHEMA IF NOT EXISTS studio;

CREATE TABLE studio.outputs (
  id          text PRIMARY KEY,
  course_id   text NOT NULL,
  module_no   int NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('flashcards','study_guide','audio_overview','mind_map')),
  title       text NOT NULL,
  content     jsonb NOT NULL,
  state       text NOT NULL CHECK (state IN ('draft','instructor_approved','published')),
  approved_by text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (state = 'draft' OR approved_by IS NOT NULL)
);

/* ======================= havenconnect / havenroute ======================= */
CREATE SCHEMA IF NOT EXISTS cx;

CREATE TABLE cx.tickets (
  id         text PRIMARY KEY,
  user_id    text,
  category   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  context    jsonb NOT NULL DEFAULT '{}',
  status     text NOT NULL CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cx.leads (
  id           text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('teams_demo','partner')),
  name         text NOT NULL,
  email        citext NOT NULL,
  organization text NOT NULL,
  message      text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cx.outbox (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  template   text NOT NULL,
  event_id   text NOT NULL,
  locale     text NOT NULL DEFAULT 'en',
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, template)           -- idempotent delivery
);

/* ======================= live sessions ======================= */
CREATE SCHEMA IF NOT EXISTS live;

CREATE TABLE live.sessions (
  id         text PRIMARY KEY,
  product_id text NOT NULL,
  cohort     text NOT NULL,
  title      text NOT NULL,
  starts_at  timestamptz NOT NULL
);

CREATE TABLE live.segments (
  id         text PRIMARY KEY,
  session_id text NOT NULL REFERENCES live.sessions(id) ON DELETE CASCADE,
  idx        int NOT NULL,
  starts_at  timestamptz NOT NULL,
  minutes    int NOT NULL CHECK (minutes BETWEEN 1 AND 40),
  provider   text NOT NULL CHECK (provider IN ('zoom','webex')),
  meeting_id text NOT NULL
);

CREATE TABLE live.attendance (
  user_id     text NOT NULL,
  session_id  text NOT NULL REFERENCES live.sessions(id),
  minutes     int NOT NULL,
  source      text NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook','manual')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

/* ======================= partner registry (Spec §15) ======================= */
CREATE SCHEMA IF NOT EXISTS partners;

CREATE TABLE partners.partners (
  id             text PRIMARY KEY,
  legal_name     text NOT NULL,
  type           text NOT NULL CHECK (type IN ('university','college','company','credit_evaluator','hiring_partner')),
  agreement_file text NOT NULL,          -- required: no agreement, no record
  product_ids    text[] NOT NULL,
  uses           text[] NOT NULL CHECK (uses <@ ARRAY['logo','co_signature','credit','hiring','degree']),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  approved_by    text NOT NULL,
  CHECK (ends_at > starts_at)
);

/* ======================= event log ======================= */
CREATE SCHEMA IF NOT EXISTS events;

CREATE TABLE events.log (
  id        text PRIMARY KEY,
  type      text NOT NULL,
  source    text NOT NULL,
  time      timestamptz NOT NULL,
  tenant_id text NOT NULL,
  subject   text NOT NULL,
  data      jsonb NOT NULL      -- ids only, no PII
);
CREATE INDEX ON events.log (type, time);

CREATE TABLE events.processed (
  consumer text NOT NULL,
  event_id text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
