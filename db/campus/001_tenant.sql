-- Scholarion Campus: tenant data plane (generated from src/campus/registry.ts — do not edit by hand).
-- One database (or cluster) per tenant. No tenant_id columns: isolation is physical.
BEGIN;

CREATE TABLE IF NOT EXISTS outbox (id text PRIMARY KEY, type text NOT NULL, subject text NOT NULL, data jsonb NOT NULL, at timestamptz NOT NULL, trace_id text, status text NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, delivered_to text[] NOT NULL DEFAULT '{}', last_error text);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (status, at);
CREATE TABLE IF NOT EXISTS consumer_offsets (consumer text NOT NULL, event_id text NOT NULL REFERENCES outbox(id), PRIMARY KEY (consumer, event_id));
CREATE TABLE IF NOT EXISTS audit (id text PRIMARY KEY, at timestamptz NOT NULL, actor_id text NOT NULL, real_actor_id text, actor_roles text[] NOT NULL, action text NOT NULL, resource text NOT NULL, outcome text NOT NULL CHECK (outcome IN ('allowed','denied','error')), reason text, trace_id text);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at);

-- User (tab: identity)
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  email text NOT NULL,
  status text CHECK (status IN ('active', 'suspended')),
  password_hash text,
  mfa_secret text
);

-- Role grant (tab: identity)
CREATE TABLE IF NOT EXISTS role_grants (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'instructor', 'ta', 'designer', 'student', 'observer', 'advisor', 'registrar', 'support')),
  scope text,
  granted_by text,
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS role_grants_user_id ON role_grants (user_id) WHERE deleted_at IS NULL;

-- Support grant (tab: identity)
CREATE TABLE IF NOT EXISTS support_grants (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  support_user_id text,
  reason text NOT NULL,
  ticket_id text,
  target_user_id text,
  status text,
  hours numeric,
  expires_at timestamptz,
  approved_by text
);
CREATE INDEX IF NOT EXISTS support_grants_ticket_id ON support_grants (ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS support_grants_target_user_id ON support_grants (target_user_id) WHERE deleted_at IS NULL;

-- Course (tab: curriculum)
CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  credits numeric,
  blueprint_id text,
  is_blueprint boolean,
  sequential boolean,
  prerequisites text[],
  state text,
  published_at timestamptz,
  account_id text,
  term_id text,
  time_zone text,
  image text,
  home_type text CHECK (home_type IN ('activity', 'front_page', 'modules', 'assignments', 'syllabus')),
  syllabus_body text,
  navigation jsonb,
  late_policy jsonb,
  grading_scheme_id text,
  hide_totals boolean,
  hide_distribution boolean,
  visibility text CHECK (visibility IN ('course', 'institution', 'public')),
  format text CHECK (format IN ('online', 'on_campus', 'blended')),
  language text,
  license text,
  students_create_discussions boolean,
  blueprint_locks text[],
  pacing boolean,
  start_at timestamptz,
  end_at timestamptz,
  concluded_at timestamptz
);
CREATE INDEX IF NOT EXISTS courses_blueprint_id ON courses (blueprint_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS courses_account_id ON courses (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS courses_term_id ON courses (term_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS courses_grading_scheme_id ON courses (grading_scheme_id) WHERE deleted_at IS NULL;

-- Section (tab: curriculum)
CREATE TABLE IF NOT EXISTS sections (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  code text NOT NULL,
  term_id text NOT NULL,
  capacity numeric NOT NULL,
  meeting_pattern text,
  instructor_id text,
  cross_listed_with text[],
  start_at timestamptz,
  end_at timestamptz
);
CREATE INDEX IF NOT EXISTS sections_course_id ON sections (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sections_term_id ON sections (term_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sections_instructor_id ON sections (instructor_id) WHERE deleted_at IS NULL;

-- Module (tab: curriculum)
CREATE TABLE IF NOT EXISTS modules (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL,
  "position" numeric NOT NULL,
  week numeric,
  prereq jsonb,
  state text,
  module_key text,
  unlock_at timestamptz,
  prerequisite_module_ids text[],
  require_all boolean,
  sequential boolean,
  assign_to jsonb
);
CREATE INDEX IF NOT EXISTS modules_course_id ON modules (course_id) WHERE deleted_at IS NULL;

-- Content page (tab: curriculum)
CREATE TABLE IF NOT EXISTS pages (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  module_id text NOT NULL,
  title text NOT NULL,
  blocks jsonb NOT NULL,
  html text,
  "position" numeric,
  state text,
  front_page boolean,
  editing_roles text CHECK (editing_roles IN ('teachers', 'teachers_students', 'anyone')),
  todo_date timestamptz,
  assign_to jsonb
);
CREATE INDEX IF NOT EXISTS pages_course_id ON pages (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pages_module_id ON pages (module_id) WHERE deleted_at IS NULL;

-- Enrollment (tab: enrollment)
CREATE TABLE IF NOT EXISTS enrollments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  course_id text NOT NULL,
  section_id text,
  role text NOT NULL CHECK (role IN ('student', 'instructor', 'ta', 'designer', 'observer')),
  state text,
  source text,
  sis_registration_id text,
  start_at timestamptz,
  end_at timestamptz
);
CREATE INDEX IF NOT EXISTS enrollments_user_id ON enrollments (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS enrollments_course_id ON enrollments (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS enrollments_section_id ON enrollments (section_id) WHERE deleted_at IS NULL;

-- Waitlist entry (tab: enrollment)
CREATE TABLE IF NOT EXISTS waitlist (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  section_id text NOT NULL,
  "position" numeric,
  state text
);
CREATE INDEX IF NOT EXISTS waitlist_user_id ON waitlist (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS waitlist_section_id ON waitlist (section_id) WHERE deleted_at IS NULL;

-- Assignment (tab: assessment)
CREATE TABLE IF NOT EXISTS assignments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  module_id text,
  title text NOT NULL,
  instructions text,
  points numeric NOT NULL,
  group_id text,
  due_at timestamptz,
  submission_types text[],
  allowed_extensions text[],
  rubric_id text,
  peer_reviews numeric,
  anonymous_grading boolean,
  moderated boolean,
  lti_tool_id text,
  lab_template_id text,
  grading_type text CHECK (grading_type IN ('points', 'pass_fail', 'percent')),
  state text,
  display_grade_as text CHECK (display_grade_as IN ('points', 'percent', 'complete_incomplete', 'letter', 'gpa', 'not_graded')),
  exclude_from_final boolean,
  attempts numeric,
  group_set_id text,
  grade_individually boolean,
  peer_review_mode text CHECK (peer_review_mode IN ('manual', 'automatic')),
  peer_review_anonymous boolean,
  peer_reviews_due_at timestamptz,
  grader_count numeric,
  annotation_file_id text,
  plagiarism_tool_id text,
  only_assigned boolean,
  unlock_at timestamptz,
  lock_at timestamptz,
  outcome_ids text[],
  final_grader_id text
);
CREATE INDEX IF NOT EXISTS assignments_course_id ON assignments (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_module_id ON assignments (module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_group_id ON assignments (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_rubric_id ON assignments (rubric_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_lti_tool_id ON assignments (lti_tool_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_lab_template_id ON assignments (lab_template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_group_set_id ON assignments (group_set_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_annotation_file_id ON assignments (annotation_file_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_plagiarism_tool_id ON assignments (plagiarism_tool_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_final_grader_id ON assignments (final_grader_id) WHERE deleted_at IS NULL;

-- Quiz (tab: assessment)
CREATE TABLE IF NOT EXISTS quizzes (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  module_id text,
  title text NOT NULL,
  bank_id text,
  question_count numeric NOT NULL,
  time_limit_min numeric NOT NULL,
  allowed_attempts numeric NOT NULL,
  available_from timestamptz,
  available_until timestamptz,
  points numeric,
  group_id text,
  proctoring_tool_id text,
  snapshot jsonb,
  state text,
  kind text CHECK (kind IN ('graded', 'practice', 'graded_survey', 'survey')),
  scoring_policy text CHECK (scoring_policy IN ('highest', 'latest', 'average')),
  cooling_minutes numeric,
  shuffle_questions boolean,
  shuffle_answers boolean,
  one_at_a_time boolean,
  lock_after_answer boolean,
  access_code text,
  ip_filter text[],
  show_responses boolean,
  show_correct_answers boolean,
  show_correct_after timestamptz,
  calculator text CHECK (calculator IN ('none', 'basic', 'scientific')),
  only_assigned boolean,
  pools jsonb,
  anonymous_survey boolean,
  proctored boolean
);
CREATE INDEX IF NOT EXISTS quizzes_course_id ON quizzes (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quizzes_module_id ON quizzes (module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quizzes_bank_id ON quizzes (bank_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quizzes_group_id ON quizzes (group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quizzes_proctoring_tool_id ON quizzes (proctoring_tool_id) WHERE deleted_at IS NULL;

-- Question bank (tab: assessment)
CREATE TABLE IF NOT EXISTS question_banks (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL
);
CREATE INDEX IF NOT EXISTS question_banks_course_id ON question_banks (course_id) WHERE deleted_at IS NULL;

-- Question (tab: assessment)
CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  bank_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('multiple_choice', 'multiple_answer', 'true_false', 'fill_blank', 'multi_blank', 'matching', 'ordering', 'categorization', 'hot_spot', 'numeric', 'formula', 'essay', 'file_upload', 'stimulus', 'text')),
  prompt text NOT NULL,
  choices text[],
  answer text,
  points numeric NOT NULL,
  outcome_id text,
  tags text[],
  config jsonb,
  stimulus_id text,
  content_version numeric
);
CREATE INDEX IF NOT EXISTS questions_course_id ON questions (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS questions_bank_id ON questions (bank_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS questions_outcome_id ON questions (outcome_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS questions_stimulus_id ON questions (stimulus_id) WHERE deleted_at IS NULL;

-- Quiz attempt (tab: assessment)
CREATE TABLE IF NOT EXISTS attempts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  quiz_id text,
  user_id text,
  course_id text NOT NULL,
  seed text,
  question_ids jsonb,
  answers jsonb,
  state text,
  score numeric,
  deadline timestamptz,
  needs_manual boolean
);
CREATE INDEX IF NOT EXISTS attempts_course_id ON attempts (course_id) WHERE deleted_at IS NULL;

-- Submission (tab: assessment)
CREATE TABLE IF NOT EXISTS submissions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  assignment_id text,
  user_id text,
  course_id text NOT NULL,
  mode text,
  body text,
  url text,
  file_id text,
  attempt numeric,
  state text,
  late boolean,
  offline boolean
);
CREATE INDEX IF NOT EXISTS submissions_course_id ON submissions (course_id) WHERE deleted_at IS NULL;

-- Assignment group (tab: gradebook)
CREATE TABLE IF NOT EXISTS assignment_groups (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  name text NOT NULL,
  weight numeric NOT NULL,
  drop_lowest numeric,
  late_penalty_per_day numeric,
  missing_score numeric,
  drop_highest numeric,
  never_drop text[]
);
CREATE INDEX IF NOT EXISTS assignment_groups_course_id ON assignment_groups (course_id) WHERE deleted_at IS NULL;

-- Grade entry (tab: gradebook)
CREATE TABLE IF NOT EXISTS grades (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  assignment_id text,
  user_id text,
  course_id text NOT NULL,
  score numeric,
  excused boolean,
  posted boolean,
  posted_at timestamptz,
  source text,
  rubric_version numeric,
  moderation_state text
);
CREATE INDEX IF NOT EXISTS grades_course_id ON grades (course_id) WHERE deleted_at IS NULL;

-- Rubric (tab: gradebook)
CREATE TABLE IF NOT EXISTS rubrics (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  course_id text,
  style text NOT NULL CHECK (style IN ('analytic', 'holistic')),
  criteria jsonb NOT NULL,
  content_version numeric,
  previous_id text,
  state text,
  hide_score_total boolean,
  free_form_comments boolean,
  use_for_grading boolean
);
CREATE INDEX IF NOT EXISTS rubrics_course_id ON rubrics (course_id) WHERE deleted_at IS NULL;

-- Posting policy (tab: gradebook)
CREATE TABLE IF NOT EXISTS posting_policies (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  assignment_id text,
  mode text NOT NULL CHECK (mode IN ('automatic', 'manual'))
);
CREATE INDEX IF NOT EXISTS posting_policies_course_id ON posting_policies (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posting_policies_assignment_id ON posting_policies (assignment_id) WHERE deleted_at IS NULL;

-- Peer review (tab: gradebook)
CREATE TABLE IF NOT EXISTS peer_reviews (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  assignment_id text,
  submission_id text,
  reviewer_id text,
  course_id text NOT NULL,
  state text,
  comments text,
  due_at timestamptz
);
CREATE INDEX IF NOT EXISTS peer_reviews_course_id ON peer_reviews (course_id) WHERE deleted_at IS NULL;

-- Annotation (tab: gradebook)
CREATE TABLE IF NOT EXISTS annotations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  submission_id text,
  file_id text,
  course_id text NOT NULL,
  author_id text,
  page numeric,
  comment text,
  quote text
);
CREATE INDEX IF NOT EXISTS annotations_course_id ON annotations (course_id) WHERE deleted_at IS NULL;

-- Discussion topic (tab: collaboration)
CREATE TABLE IF NOT EXISTS discussion_topics (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  module_id text,
  title text NOT NULL,
  prompt text NOT NULL,
  graded boolean,
  section_id text,
  state text,
  kind text CHECK (kind IN ('threaded', 'focused')),
  must_post_first boolean,
  allow_liking boolean,
  only_graders_like boolean,
  sort_by_likes boolean,
  podcast boolean,
  pinned boolean,
  closed boolean,
  anonymous text CHECK (anonymous IN ('off', 'full', 'partial')),
  group_set_id text,
  available_from timestamptz,
  points numeric,
  checkpoints jsonb,
  assignment_id text
);
CREATE INDEX IF NOT EXISTS discussion_topics_course_id ON discussion_topics (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS discussion_topics_module_id ON discussion_topics (module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS discussion_topics_section_id ON discussion_topics (section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS discussion_topics_group_set_id ON discussion_topics (group_set_id) WHERE deleted_at IS NULL;

-- Discussion post (tab: collaboration)
CREATE TABLE IF NOT EXISTS posts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  topic_id text,
  course_id text NOT NULL,
  author_id text,
  parent_id text,
  path text,
  depth numeric,
  body text,
  likes jsonb,
  edits jsonb,
  mentions jsonb,
  reports jsonb
);
CREATE INDEX IF NOT EXISTS posts_course_id ON posts (course_id) WHERE deleted_at IS NULL;

-- Announcement (tab: collaboration)
CREATE TABLE IF NOT EXISTS announcements (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  section_id text,
  title text NOT NULL,
  body text NOT NULL,
  publish_at timestamptz,
  state text,
  auto boolean,
  allow_replies boolean,
  allow_likes boolean,
  lock_replies boolean,
  podcast boolean,
  attachments text[],
  read_by jsonb,
  replies jsonb,
  likes jsonb
);
CREATE INDEX IF NOT EXISTS announcements_course_id ON announcements (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS announcements_section_id ON announcements (section_id) WHERE deleted_at IS NULL;

-- Conversation (tab: collaboration)
CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  subject text,
  participant_ids jsonb,
  messages jsonb
);
CREATE INDEX IF NOT EXISTS conversations_course_id ON conversations (course_id) WHERE deleted_at IS NULL;

-- File (tab: files)
CREATE TABLE IF NOT EXISTS files (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text,
  mime text,
  detected_mime text,
  size numeric,
  owner_id text,
  course_id text,
  object_key text,
  state text,
  classification text,
  sha256 text,
  folder_id text,
  usage_rights text CHECK (usage_rights IN ('own_copyright', 'public_domain', 'permission', 'fair_use', 'creative_commons')),
  license text,
  available_from timestamptz,
  available_until timestamptz,
  hidden_linkable boolean,
  published boolean,
  purpose text,
  submission_course_id text
);
CREATE INDEX IF NOT EXISTS files_course_id ON files (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS files_folder_id ON files (folder_id) WHERE deleted_at IS NULL;

-- Media (tab: files)
CREATE TABLE IF NOT EXISTS media (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL,
  file_id text NOT NULL,
  renditions jsonb,
  caption_exception text,
  caption_exception_by text,
  state text
);
CREATE INDEX IF NOT EXISTS media_course_id ON media (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_file_id ON media (file_id) WHERE deleted_at IS NULL;

-- Caption track (tab: files)
CREATE TABLE IF NOT EXISTS caption_tracks (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  media_id text NOT NULL,
  language text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('captions', 'transcript')),
  text text NOT NULL
);
CREATE INDEX IF NOT EXISTS caption_tracks_course_id ON caption_tracks (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS caption_tracks_media_id ON caption_tracks (media_id) WHERE deleted_at IS NULL;

-- Learning event (tab: analytics)
CREATE TABLE IF NOT EXISTS learning_events (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  actor_ref text,
  course_id text NOT NULL,
  verb text,
  object text,
  at timestamptz
);
CREATE INDEX IF NOT EXISTS learning_events_course_id ON learning_events (course_id) WHERE deleted_at IS NULL;

-- Risk signal (tab: analytics)
CREATE TABLE IF NOT EXISTS risk_signals (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  course_id text NOT NULL,
  level text,
  score numeric,
  reasons jsonb,
  computed_at timestamptz
);
CREATE INDEX IF NOT EXISTS risk_signals_course_id ON risk_signals (course_id) WHERE deleted_at IS NULL;

-- Intervention (tab: analytics)
CREATE TABLE IF NOT EXISTS interventions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('outreach', 'tutoring', 'extension', 'meeting')),
  signal_id text,
  notes text,
  outcome text CHECK (outcome IN ('open', 'helped', 'no_response', 'closed'))
);
CREATE INDEX IF NOT EXISTS interventions_course_id ON interventions (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS interventions_user_id ON interventions (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS interventions_signal_id ON interventions (signal_id) WHERE deleted_at IS NULL;

-- LTI tool (tab: integration)
CREATE TABLE IF NOT EXISTS tool_registrations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  client_id text NOT NULL,
  issuer text NOT NULL,
  launch_url text NOT NULL,
  jwks_url text,
  services text[],
  enabled boolean,
  secret_ref text
);

-- Sync job (tab: integration)
CREATE TABLE IF NOT EXISTS sync_jobs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  state text,
  idempotency_key text,
  report jsonb,
  started_by text
);

-- Webhook (tab: integration)
CREATE TABLE IF NOT EXISTS webhooks (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  url text NOT NULL,
  events text[] NOT NULL,
  secret_ref text NOT NULL,
  enabled boolean
);

-- Webhook delivery (tab: integration)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  webhook_id text,
  event_id text,
  state text,
  attempts numeric,
  next_attempt_at timestamptz,
  signature text,
  last_status numeric
);

-- Applicant (tab: admissions)
CREATE TABLE IF NOT EXISTS applicants (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  email text NOT NULL,
  program text,
  user_id text
);
CREATE INDEX IF NOT EXISTS applicants_user_id ON applicants (user_id) WHERE deleted_at IS NULL;

-- Application (tab: admissions)
CREATE TABLE IF NOT EXISTS applications (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  applicant_id text NOT NULL,
  user_id text,
  program text NOT NULL,
  term_id text,
  statement text,
  checklist jsonb,
  state text,
  reviewer_id text,
  offering_id text,
  section_id text,
  required_docs jsonb
);
CREATE INDEX IF NOT EXISTS applications_applicant_id ON applications (applicant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS applications_user_id ON applications (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS applications_term_id ON applications (term_id) WHERE deleted_at IS NULL;

-- Application document (tab: admissions)
CREATE TABLE IF NOT EXISTS admission_documents (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  application_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('transcript', 'id', 'statement', 'recommendation', 'resume')),
  file_id text,
  received boolean,
  verified boolean
);
CREATE INDEX IF NOT EXISTS admission_documents_application_id ON admission_documents (application_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS admission_documents_file_id ON admission_documents (file_id) WHERE deleted_at IS NULL;

-- Decision (tab: admissions)
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  application_id text,
  outcome text,
  letter text,
  decided_by text,
  released_at timestamptz
);

-- Term (tab: registration)
CREATE TABLE IF NOT EXISTS terms (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  registration_opens timestamptz NOT NULL,
  registration_closes timestamptz NOT NULL,
  max_credits numeric
);

-- Catalog entry (tab: registration)
CREATE TABLE IF NOT EXISTS catalog_entries (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  title text NOT NULL,
  credits numeric NOT NULL,
  description text,
  prerequisites text[],
  course_id text
);
CREATE INDEX IF NOT EXISTS catalog_entries_course_id ON catalog_entries (course_id) WHERE deleted_at IS NULL;

-- Registration (tab: registration)
CREATE TABLE IF NOT EXISTS registrations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  section_id text,
  term_id text,
  state text,
  checks jsonb,
  idempotency_key text,
  grade text
);

-- Hold (tab: registration)
CREATE TABLE IF NOT EXISTS holds (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('financial', 'advising', 'records', 'conduct', 'immunization')),
  reason text NOT NULL,
  blocks_registration boolean,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS holds_user_id ON holds (user_id) WHERE deleted_at IS NULL;

-- Academic history (tab: registration)
CREATE TABLE IF NOT EXISTS academic_history (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  code text NOT NULL,
  term_name text NOT NULL,
  credits numeric NOT NULL,
  grade text NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'F', 'P', 'W', 'I'))
);
CREATE INDEX IF NOT EXISTS academic_history_user_id ON academic_history (user_id) WHERE deleted_at IS NULL;

-- Student account (tab: finance)
CREATE TABLE IF NOT EXISTS student_accounts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  balance numeric,
  currency text
);

-- Charge (tab: finance)
CREATE TABLE IF NOT EXISTS charges (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  due_at date NOT NULL,
  paid boolean
);
CREATE INDEX IF NOT EXISTS charges_user_id ON charges (user_id) WHERE deleted_at IS NULL;

-- Aid award (tab: finance)
CREATE TABLE IF NOT EXISTS aid_awards (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('grant', 'scholarship', 'work_study', 'loan')),
  amount numeric NOT NULL,
  term_id text NOT NULL,
  state text
);
CREATE INDEX IF NOT EXISTS aid_awards_user_id ON aid_awards (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS aid_awards_term_id ON aid_awards (term_id) WHERE deleted_at IS NULL;

-- Payment plan (tab: finance)
CREATE TABLE IF NOT EXISTS payment_plans (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  total numeric,
  installments numeric,
  paid numeric,
  state text
);

-- Payment (sandbox) (tab: finance)
CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  amount numeric,
  provider text,
  provider_ref text,
  plan_id text
);

-- Calendar event (tab: calendar)
CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  course_id text,
  section_id text,
  group_id text,
  recurrence text CHECK (recurrence IN ('none', 'daily', 'weekly')),
  recur_until date
);
CREATE INDEX IF NOT EXISTS calendar_events_course_id ON calendar_events (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS calendar_events_section_id ON calendar_events (section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS calendar_events_group_id ON calendar_events (group_id) WHERE deleted_at IS NULL;

-- Calendar feed (tab: calendar)
CREATE TABLE IF NOT EXISTS ical_tokens (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  label text,
  token_hash text,
  revoked_at timestamptz,
  last_used_at timestamptz
);

-- Live session (tab: live)
CREATE TABLE IF NOT EXISTS live_sessions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  section_id text,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  minutes numeric NOT NULL,
  provider text NOT NULL CHECK (provider IN ('zoom', 'teams')),
  join_url text,
  meeting_owner_id text,
  recording_retention_days numeric
);
CREATE INDEX IF NOT EXISTS live_sessions_course_id ON live_sessions (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS live_sessions_section_id ON live_sessions (section_id) WHERE deleted_at IS NULL;

-- Attendance record (tab: live)
CREATE TABLE IF NOT EXISTS attendance (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  session_id text,
  user_id text,
  course_id text NOT NULL,
  minutes numeric,
  status text,
  source text,
  assertion boolean,
  reconciled_by text
);
CREATE INDEX IF NOT EXISTS attendance_course_id ON attendance (course_id) WHERE deleted_at IS NULL;

-- Outcome (tab: outcomes)
CREATE TABLE IF NOT EXISTS outcomes (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  mastery_threshold numeric,
  framework text,
  calculation_method text CHECK (calculation_method IN ('decaying_average', 'n_mastery', 'latest', 'highest', 'average')),
  n_mastery numeric
);

-- Outcome alignment (tab: outcomes)
CREATE TABLE IF NOT EXISTS outcome_alignments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  outcome_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('rubric_criterion', 'question', 'assignment')),
  target_id text NOT NULL,
  course_id text
);
CREATE INDEX IF NOT EXISTS outcome_alignments_outcome_id ON outcome_alignments (outcome_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS outcome_alignments_course_id ON outcome_alignments (course_id) WHERE deleted_at IS NULL;

-- Evidence export (tab: outcomes)
CREATE TABLE IF NOT EXISTS evidence_exports (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  label text,
  rows numeric,
  csv text,
  created_by text
);

-- Advising case (tab: advising)
CREATE TABLE IF NOT EXISTS advising_cases (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  student_id text NOT NULL,
  advisor_id text NOT NULL,
  summary text NOT NULL,
  signal_id text,
  status text CHECK (status IN ('open', 'monitoring', 'closed'))
);
CREATE INDEX IF NOT EXISTS advising_cases_student_id ON advising_cases (student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS advising_cases_advisor_id ON advising_cases (advisor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS advising_cases_signal_id ON advising_cases (signal_id) WHERE deleted_at IS NULL;

-- Advising note (tab: advising)
CREATE TABLE IF NOT EXISTS advising_notes (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  case_id text NOT NULL,
  body text NOT NULL,
  visible_to_student boolean
);
CREATE INDEX IF NOT EXISTS advising_notes_case_id ON advising_notes (case_id) WHERE deleted_at IS NULL;

-- Referral (tab: advising)
CREATE TABLE IF NOT EXISTS referrals (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  case_id text NOT NULL,
  service text NOT NULL CHECK (service IN ('tutoring', 'counseling', 'disability_services', 'financial_aid', 'career')),
  status text CHECK (status IN ('sent', 'accepted', 'completed'))
);
CREATE INDEX IF NOT EXISTS referrals_case_id ON referrals (case_id) WHERE deleted_at IS NULL;

-- Survey (tab: evaluations)
CREATE TABLE IF NOT EXISTS surveys (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  course_id text,
  questions jsonb NOT NULL,
  anonymous boolean,
  min_responses numeric,
  state text
);
CREATE INDEX IF NOT EXISTS surveys_course_id ON surveys (course_id) WHERE deleted_at IS NULL;

-- Evaluation window (tab: evaluations)
CREATE TABLE IF NOT EXISTS evaluation_windows (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  survey_id text NOT NULL,
  label text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluation_windows_survey_id ON evaluation_windows (survey_id) WHERE deleted_at IS NULL;

-- Survey response (tab: evaluations)
CREATE TABLE IF NOT EXISTS survey_responses (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  survey_id text,
  respondent_hash text,
  answers jsonb
);

-- Credential (tab: credentials)
CREATE TABLE IF NOT EXISTS credentials (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  kind text,
  title text,
  course_id text,
  vc jsonb,
  revoked_at timestamptz,
  revoke_reason text,
  template_id text,
  legal_name text,
  expires_at timestamptz,
  reissued_from text,
  reason_code text
);

-- Portfolio (tab: credentials)
CREATE TABLE IF NOT EXISTS portfolios (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  title text NOT NULL,
  summary text,
  public boolean,
  sections text[]
);

-- Portfolio artifact (tab: credentials)
CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  portfolio_id text NOT NULL,
  title text NOT NULL,
  description text,
  submission_id text,
  credential_id text,
  url text
);
CREATE INDEX IF NOT EXISTS artifacts_portfolio_id ON artifacts (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS artifacts_submission_id ON artifacts (submission_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS artifacts_credential_id ON artifacts (credential_id) WHERE deleted_at IS NULL;

-- Placement profile (tab: careers)
CREATE TABLE IF NOT EXISTS placement_profiles (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  headline text NOT NULL,
  skills text[],
  seeking text CHECK (seeking IN ('internship', 'full_time', 'part_time', 'apprenticeship')),
  consent_to_share boolean
);

-- Opportunity (tab: careers)
CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  employer text NOT NULL,
  kind text CHECK (kind IN ('internship', 'full_time', 'part_time', 'apprenticeship')),
  skills text[],
  closes_at date
);

-- Internship (tab: careers)
CREATE TABLE IF NOT EXISTS internships (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  opportunity_id text NOT NULL,
  status text CHECK (status IN ('applied', 'interviewing', 'offered', 'active', 'completed')),
  hours numeric
);
CREATE INDEX IF NOT EXISTS internships_user_id ON internships (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS internships_opportunity_id ON internships (opportunity_id) WHERE deleted_at IS NULL;

-- Notification template (tab: notifications)
CREATE TABLE IF NOT EXISTS notification_templates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  event_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  channels text[]
);

-- Notification preference (tab: notifications)
CREATE TABLE IF NOT EXISTS notification_prefs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  email boolean,
  in_app boolean,
  push boolean,
  digest text CHECK (digest IN ('off', 'daily', 'weekly')),
  quiet_start text,
  quiet_end text,
  matrix jsonb,
  muted_courses text[],
  sms boolean
);

-- Delivery (tab: notifications)
CREATE TABLE IF NOT EXISTS deliveries (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  channel text,
  subject text,
  body text,
  event_id text,
  state text,
  read_at timestamptz,
  deferred_until timestamptz
);

-- Search document (tab: search)
CREATE TABLE IF NOT EXISTS search_docs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  ref_id text,
  title text,
  text text,
  course_id text,
  acl jsonb,
  href text
);

-- Agent (tab: ai-control)
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "key" text NOT NULL,
  name text NOT NULL,
  audience text NOT NULL,
  can_do text,
  must_never text,
  enabled boolean,
  policy_version_id text
);

-- Policy version (tab: ai-control)
CREATE TABLE IF NOT EXISTS policy_versions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  agent_id text NOT NULL,
  label text NOT NULL,
  policy jsonb NOT NULL,
  content_version numeric
);
CREATE INDEX IF NOT EXISTS policy_versions_agent_id ON policy_versions (agent_id) WHERE deleted_at IS NULL;

-- Evaluation run (tab: ai-control)
CREATE TABLE IF NOT EXISTS eval_runs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  agent_key text,
  policy_version_id text,
  results jsonb,
  passed boolean
);

-- AI draft for review (tab: ai-control)
CREATE TABLE IF NOT EXISTS review_queue (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  agent_key text,
  summary text,
  draft jsonb,
  target_type text,
  target_id text,
  requested_by text,
  course_id text,
  state text,
  reviewer_id text
);

-- AI audit record (tab: ai-control)
CREATE TABLE IF NOT EXISTS ai_audit (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  agent_key text,
  prompt_category text,
  prompt_hash text,
  source_ids jsonb,
  model text,
  decision text,
  user_id text
);

-- Course standard template (tab: curriculum-engine)
CREATE TABLE IF NOT EXISTS course_templates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  spec jsonb NOT NULL
);

-- Generation job (tab: curriculum-engine)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  topic text,
  code text,
  template_id text,
  state text,
  draft_course_id text,
  gaps jsonb,
  requested_by text
);

-- Lab template (tab: cloud-lab)
CREATE TABLE IF NOT EXISTS lab_templates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('python', 'jupyter', 'pytorch', 'tensorflow', 'agents', 'database', 'vector_db', 'containers', 'network')),
  instructions text NOT NULL,
  starter_code text NOT NULL,
  tests jsonb NOT NULL,
  max_score numeric NOT NULL,
  image text,
  gpu boolean,
  egress_allowlist text[],
  cpu_seconds numeric,
  memory_mb numeric,
  idle_minutes numeric,
  notebook_starter jsonb,
  notebook_executed jsonb,
  release_executed_at timestamptz
);

-- Lab session (tab: cloud-lab)
CREATE TABLE IF NOT EXISTS lab_sessions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  template_id text,
  assignment_id text,
  course_id text,
  launch_jti text,
  state text,
  code text,
  score numeric,
  ags_posted_at timestamptz
);

-- Role template (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS role_templates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  roles text[] NOT NULL
);

-- Consent record (tab: privacy)
CREATE TABLE IF NOT EXISTS consents (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  student_id text,
  observer_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('grade_summary', 'attendance_summary')),
  expires_at date
);
CREATE INDEX IF NOT EXISTS consents_observer_id ON consents (observer_id) WHERE deleted_at IS NULL;

-- Data subject request (tab: privacy)
CREATE TABLE IF NOT EXISTS dsr (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  kind text,
  state text,
  reason text,
  export jsonb,
  decided_by text
);

-- Retention policy (tab: privacy)
CREATE TABLE IF NOT EXISTS retention_policies (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "table" text NOT NULL,
  days numeric NOT NULL,
  action text CHECK (action IN ('tombstone', 'anonymize'))
);

-- Legal hold (tab: privacy)
CREATE TABLE IF NOT EXISTS legal_holds (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  matter text NOT NULL,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS legal_holds_user_id ON legal_holds (user_id) WHERE deleted_at IS NULL;

-- Ticket (tab: helpdesk)
CREATE TABLE IF NOT EXISTS tickets (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  requester_id text,
  subject text NOT NULL,
  body text NOT NULL,
  category text CHECK (category IN ('access', 'course', 'grades', 'registration', 'billing', 'technical', 'assessment', 'other')),
  tier text CHECK (tier IN ('1', '2', '3')),
  status text CHECK (status IN ('open', 'pending', 'solved')),
  triage jsonb
);

-- Knowledge article (tab: helpdesk)
CREATE TABLE IF NOT EXISTS kb_articles (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  body text NOT NULL,
  tags text[],
  state text
);

-- Listing (tab: marketplace)
CREATE TABLE IF NOT EXISTS listings (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lti_tool', 'content_pack')),
  vendor text NOT NULL,
  description text,
  reviewed boolean
);

-- Install (tab: marketplace)
CREATE TABLE IF NOT EXISTS installs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  listing_id text,
  approved_by text,
  state text
);

-- Sync cursor (tab: offline)
CREATE TABLE IF NOT EXISTS sync_cursors (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  device_id text,
  "position" numeric
);

-- Offline package (tab: offline)
CREATE TABLE IF NOT EXISTS offline_packages (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  course_id text,
  pages jsonb,
  built_at timestamptz
);

-- Offline draft (tab: offline)
CREATE TABLE IF NOT EXISTS offline_drafts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  assignment_id text,
  body text,
  base_version numeric,
  state text,
  conflict jsonb
);

-- Accommodation (tab: accommodations)
CREATE TABLE IF NOT EXISTS accommodations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('extra_time', 'extra_attempt', 'deadline_extension', 'captions', 'screen_reader')),
  multiplier numeric,
  days numeric,
  course_id text,
  expires_at date
);
CREATE INDEX IF NOT EXISTS accommodations_user_id ON accommodations (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS accommodations_course_id ON accommodations (course_id) WHERE deleted_at IS NULL;

-- Group (tab: groups)
CREATE TABLE IF NOT EXISTS groups (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  name text NOT NULL,
  member_ids text[] NOT NULL,
  assignment_id text,
  set_id text,
  leader_id text,
  max_size numeric
);
CREATE INDEX IF NOT EXISTS groups_course_id ON groups (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS groups_assignment_id ON groups (assignment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS groups_set_id ON groups (set_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS groups_leader_id ON groups (leader_id) WHERE deleted_at IS NULL;

-- Reading (tab: library)
CREATE TABLE IF NOT EXISTS reading_items (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL,
  citation text NOT NULL,
  url text,
  required boolean,
  module_id text,
  accessible boolean
);
CREATE INDEX IF NOT EXISTS reading_items_course_id ON reading_items (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reading_items_module_id ON reading_items (module_id) WHERE deleted_at IS NULL;

-- Report run (tab: reports)
CREATE TABLE IF NOT EXISTS report_runs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  rows numeric,
  csv text,
  requested_by text
);

-- Incident (tab: operations)
CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
  status text CHECK (status IN ('investigating', 'mitigated', 'resolved')),
  summary text
);

-- Folder (tab: files)
CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  name text NOT NULL,
  parent_id text,
  hidden boolean,
  locked boolean
);
CREATE INDEX IF NOT EXISTS folders_course_id ON folders (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folders_parent_id ON folders (parent_id) WHERE deleted_at IS NULL;

-- Offering (tab: catalog)
CREATE TABLE IF NOT EXISTS offerings (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  title text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('guided_project', 'short_course', 'specialization', 'professional_certificate', 'live_intensive', 'cohort_program', 'bundle', 'pathway', 'degree_track')),
  course_id text,
  summary text NOT NULL,
  level text CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  hours numeric,
  skills text[],
  module_keys text[],
  price numeric NOT NULL,
  currency text CHECK (currency IN ('USD', 'EUR', 'GBP', 'NGN', 'INR')),
  early_bird_price numeric,
  early_bird_ends_at timestamptz,
  in_plus boolean,
  self_paced boolean,
  aid_eligible boolean,
  aid_approval_ref text,
  credential_template_id text,
  format text CHECK (format IN ('online', 'live', 'blended')),
  state text,
  copy_flags jsonb,
  requires_application boolean,
  self_check_required boolean,
  block_course_ids jsonb,
  late_enrollment_days numeric
);
CREATE INDEX IF NOT EXISTS offerings_course_id ON offerings (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS offerings_credential_template_id ON offerings (credential_template_id) WHERE deleted_at IS NULL;

-- Cohort (tab: catalog)
CREATE TABLE IF NOT EXISTS offering_sections (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  offering_id text NOT NULL,
  code text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  time_zone text NOT NULL,
  capacity numeric NOT NULL,
  registration_closes_at timestamptz NOT NULL,
  schedule text,
  seats_taken numeric,
  application_deadline timestamptz
);
CREATE INDEX IF NOT EXISTS offering_sections_offering_id ON offering_sections (offering_id) WHERE deleted_at IS NULL;

-- Approved claim (tab: catalog)
CREATE TABLE IF NOT EXISTS approved_claims (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  phrase text NOT NULL,
  evidence text NOT NULL,
  approved_by text NOT NULL,
  expires_at date
);

-- Pathway rule (tab: pathways)
CREATE TABLE IF NOT EXISTS pathway_edges (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  from_id text NOT NULL,
  to_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('prerequisite', 'stacks_into', 'waives', 'mutually_exclusive')),
  module_key text,
  note text
);
CREATE INDEX IF NOT EXISTS pathway_edges_from_id ON pathway_edges (from_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pathway_edges_to_id ON pathway_edges (to_id) WHERE deleted_at IS NULL;

-- Transfer rule (tab: pathways)
CREATE TABLE IF NOT EXISTS transfer_rules (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  external_code text NOT NULL,
  source text NOT NULL,
  offering_id text NOT NULL,
  module_key text,
  note text
);
CREATE INDEX IF NOT EXISTS transfer_rules_offering_id ON transfer_rules (offering_id) WHERE deleted_at IS NULL;

-- Coupon (tab: commerce)
CREATE TABLE IF NOT EXISTS coupons (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  percent_off numeric,
  amount_off numeric,
  offering_id text,
  expires_at timestamptz,
  max_redemptions numeric,
  referrer_id text,
  redemptions numeric
);
CREATE INDEX IF NOT EXISTS coupons_offering_id ON coupons (offering_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS coupons_referrer_id ON coupons (referrer_id) WHERE deleted_at IS NULL;

-- Order (tab: commerce)
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  offering_id text,
  section_id text,
  plan text,
  subtotal numeric,
  discount numeric,
  tax numeric,
  total numeric,
  currency text,
  state text,
  sandbox_ref text,
  coupon_code text,
  installments jsonb
);

-- Subscription (tab: commerce)
CREATE TABLE IF NOT EXISTS subscriptions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  plan text,
  state text,
  renews_at timestamptz,
  price numeric
);

-- Seat license (tab: commerce)
CREATE TABLE IF NOT EXISTS seat_licenses (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  org_name text NOT NULL,
  offering_id text NOT NULL,
  seats numeric NOT NULL,
  manager_id text,
  assigned jsonb,
  invoice_id text
);
CREATE INDEX IF NOT EXISTS seat_licenses_offering_id ON seat_licenses (offering_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS seat_licenses_manager_id ON seat_licenses (manager_id) WHERE deleted_at IS NULL;

-- Invoice (tab: commerce)
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text,
  bill_to text,
  lines jsonb,
  total numeric,
  currency text,
  state text
);

-- Refund or deferral (tab: commerce)
CREATE TABLE IF NOT EXISTS refund_requests (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  order_id text,
  kind text,
  reason text,
  decision text,
  explanation jsonb
);

-- Program enrollment (tab: commerce)
CREATE TABLE IF NOT EXISTS offering_enrollments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  offering_id text,
  section_id text,
  source text,
  state text,
  waived_modules jsonb,
  completed_at timestamptz,
  credential_id text
);

-- Credential template (tab: credentials)
CREATE TABLE IF NOT EXISTS credential_templates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('completion', 'graded_performance', 'course_certificate', 'specialization_certificate', 'professional_certificate', 'skill_badge', 'program_transcript')),
  wording text NOT NULL,
  grade_threshold numeric,
  requires_capstone boolean,
  approval_required boolean,
  expires_after_days numeric,
  copy_flags jsonb
);

-- Tutor memory (tab: tutor)
CREATE TABLE IF NOT EXISTS tutor_memory (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  course_id text,
  topic text,
  mode text
);

-- Lab API key (tab: key-vault)
CREATE TABLE IF NOT EXISTS lab_keys (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  label text,
  assignment_id text,
  key_hash text,
  spend_cap_cents numeric,
  spent_cents numeric,
  rate_per_min numeric,
  expires_at timestamptz,
  revoked_at timestamptz
);

-- Connector (tab: connectors)
CREATE TABLE IF NOT EXISTS connectors (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "key" text,
  name text,
  category text,
  status text,
  secret_ref text,
  consent_by text,
  note text
);

-- Proctoring support settings (tab: proctor-support)
CREATE TABLE IF NOT EXISTS proctor_settings (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  institution text NOT NULL,
  assessment_policy_url text NOT NULL,
  accommodations_url text NOT NULL,
  accessibility_office text NOT NULL,
  escalation_team text NOT NULL,
  support_channel text NOT NULL,
  escalation_method text NOT NULL,
  response_sla text NOT NULL
);

-- Approved talking point (tab: proctor-support)
CREATE TABLE IF NOT EXISTS proctor_talking_points (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "key" text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  triggers text[],
  escalate boolean,
  state text
);

-- Pre-test checklist (tab: proctor-support)
CREATE TABLE IF NOT EXISTS proctor_readiness (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text,
  user_id text,
  quiz_id text,
  checks jsonb,
  complete boolean,
  completed_at timestamptz
);

-- Logged question (tab: proctor-support)
CREATE TABLE IF NOT EXISTS proctor_questions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  question text,
  intent text,
  decision text,
  talking_point_key text,
  ticket_id text,
  promoted_to text,
  reply text,
  asker_hash text
);

-- Program page (tab: program-studio)
CREATE TABLE IF NOT EXISTS program_pages (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  offering_id text NOT NULL,
  slug text NOT NULL,
  spec jsonb NOT NULL,
  advisor_email text,
  advisor_phone text,
  brochure_note text,
  package_status jsonb,
  copy_flags jsonb,
  state text
);
CREATE INDEX IF NOT EXISTS program_pages_offering_id ON program_pages (offering_id) WHERE deleted_at IS NULL;

-- Learner testimonial (tab: program-studio)
CREATE TABLE IF NOT EXISTS program_testimonials (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  offering_id text NOT NULL,
  learner_name text NOT NULL,
  quote text NOT NULL,
  consent_ref text NOT NULL,
  consent_at date NOT NULL,
  state text
);
CREATE INDEX IF NOT EXISTS program_testimonials_offering_id ON program_testimonials (offering_id) WHERE deleted_at IS NULL;

-- Program inquiry (tab: program-studio)
CREATE TABLE IF NOT EXISTS program_inquiries (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  offering_id text,
  kind text,
  name text,
  email text,
  organization text,
  seats numeric,
  preferred_time text,
  time_zone text,
  message text,
  state text
);

-- Prerequisite self-check (tab: program-studio)
CREATE TABLE IF NOT EXISTS selfcheck_attempts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  offering_id text,
  user_id text,
  score numeric,
  of numeric,
  passed boolean,
  route_to jsonb
);

-- Account (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  parent_id text,
  sis_id text,
  default_time_zone text,
  quota_mb numeric
);
CREATE INDEX IF NOT EXISTS accounts_parent_id ON accounts (parent_id) WHERE deleted_at IS NULL;

-- Custom role (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS custom_roles (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "key" text NOT NULL,
  label text NOT NULL,
  base_role text NOT NULL CHECK (base_role IN ('admin', 'instructor', 'ta', 'designer', 'student', 'observer', 'advisor', 'registrar', 'support'))
);

-- Permission override (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS permission_overrides (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  account_id text,
  role text,
  permission text,
  enabled boolean,
  locked boolean
);

-- Global announcement (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS global_announcements (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  body text NOT NULL,
  roles text[],
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  dismissed_by jsonb
);

-- Feature option (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS feature_options (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  "key" text NOT NULL CHECK ("key" IN ('course_pacing', 'mastery_paths', 'faculty_journal', 'sms_notifications', 'student_annotation', 'podcast_feeds')),
  account_id text,
  course_id text,
  enabled boolean,
  locked boolean
);
CREATE INDEX IF NOT EXISTS feature_options_account_id ON feature_options (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS feature_options_course_id ON feature_options (course_id) WHERE deleted_at IS NULL;

-- Act-as session (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS masquerades (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  admin_id text,
  target_user_id text,
  reason text,
  expires_at timestamptz,
  ended_at timestamptz
);

-- SIS import (tab: tenant-admin)
CREATE TABLE IF NOT EXISTS sis_imports (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  diffing boolean,
  state text,
  counts jsonb,
  errors jsonb,
  started_by text
);

-- Module item (tab: curriculum)
CREATE TABLE IF NOT EXISTS module_items (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  module_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('page', 'assignment', 'quiz', 'discussion', 'file', 'header', 'url', 'lti')),
  ref_id text,
  title text NOT NULL,
  url text,
  "position" numeric NOT NULL,
  indent numeric,
  requirement text CHECK (requirement IN ('none', 'view', 'mark_done', 'contribute', 'submit', 'min_score')),
  min_score numeric,
  state text
);
CREATE INDEX IF NOT EXISTS module_items_course_id ON module_items (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS module_items_module_id ON module_items (module_id) WHERE deleted_at IS NULL;

-- Module progress (tab: curriculum)
CREATE TABLE IF NOT EXISTS module_progress (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  course_id text NOT NULL,
  item_id text,
  kind text,
  at timestamptz
);
CREATE INDEX IF NOT EXISTS module_progress_course_id ON module_progress (course_id) WHERE deleted_at IS NULL;

-- Page revision (tab: curriculum)
CREATE TABLE IF NOT EXISTS page_revisions (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  page_id text,
  course_id text NOT NULL,
  title text,
  blocks jsonb,
  author_id text,
  revision numeric
);
CREATE INDEX IF NOT EXISTS page_revisions_course_id ON page_revisions (course_id) WHERE deleted_at IS NULL;

-- Assign-to override (tab: pacing)
CREATE TABLE IF NOT EXISTS assignment_overrides (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  assignment_id text NOT NULL,
  target text NOT NULL CHECK (target IN ('section', 'group', 'student')),
  target_id text NOT NULL,
  due_at timestamptz,
  unlock_at timestamptz,
  lock_at timestamptz
);
CREATE INDEX IF NOT EXISTS assignment_overrides_course_id ON assignment_overrides (course_id) WHERE deleted_at IS NULL;

-- Mastery path (tab: pacing)
CREATE TABLE IF NOT EXISTS mastery_paths (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  trigger_assignment_id text NOT NULL,
  ranges jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS mastery_paths_course_id ON mastery_paths (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS mastery_paths_trigger_assignment_id ON mastery_paths (trigger_assignment_id) WHERE deleted_at IS NULL;

-- Pace plan (tab: pacing)
CREATE TABLE IF NOT EXISTS pace_plans (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('course', 'section', 'student')),
  target_id text,
  weeks numeric NOT NULL,
  skip_weekends boolean,
  start_at date
);
CREATE INDEX IF NOT EXISTS pace_plans_course_id ON pace_plans (course_id) WHERE deleted_at IS NULL;

-- Blackout date (tab: pacing)
CREATE TABLE IF NOT EXISTS blackout_dates (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  label text NOT NULL
);
CREATE INDEX IF NOT EXISTS blackout_dates_course_id ON blackout_dates (course_id) WHERE deleted_at IS NULL;

-- Grading period (tab: gradebook)
CREATE TABLE IF NOT EXISTS grading_periods (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  term_id text NOT NULL,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  close_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS grading_periods_term_id ON grading_periods (term_id) WHERE deleted_at IS NULL;

-- Grading scheme (tab: gradebook)
CREATE TABLE IF NOT EXISTS grading_schemes (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('letter', 'pass_fail', 'gpa')),
  bands jsonb NOT NULL,
  course_id text
);
CREATE INDEX IF NOT EXISTS grading_schemes_course_id ON grading_schemes (course_id) WHERE deleted_at IS NULL;

-- Gradebook history (tab: gradebook)
CREATE TABLE IF NOT EXISTS grade_history (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  grade_id text,
  course_id text NOT NULL,
  assignment_id text,
  user_id text,
  grader_id text,
  before jsonb,
  after jsonb,
  reason text
);
CREATE INDEX IF NOT EXISTS grade_history_course_id ON grade_history (course_id) WHERE deleted_at IS NULL;

-- Saved comment (tab: gradebook)
CREATE TABLE IF NOT EXISTS comment_library (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  text text NOT NULL
);

-- Submission comment (tab: gradebook)
CREATE TABLE IF NOT EXISTS submission_comments (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  submission_id text,
  course_id text NOT NULL,
  author_id text,
  body text,
  media_url text,
  file_ids jsonb,
  hidden_until_posted boolean
);
CREATE INDEX IF NOT EXISTS submission_comments_course_id ON submission_comments (course_id) WHERE deleted_at IS NULL;

-- Gradebook note (tab: gradebook)
CREATE TABLE IF NOT EXISTS gradebook_notes (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  user_id text NOT NULL,
  body text NOT NULL
);
CREATE INDEX IF NOT EXISTS gradebook_notes_course_id ON gradebook_notes (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gradebook_notes_user_id ON gradebook_notes (user_id) WHERE deleted_at IS NULL;

-- Group set (tab: groups)
CREATE TABLE IF NOT EXISTS group_sets (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  name text NOT NULL,
  self_signup boolean,
  max_size numeric,
  by_section boolean
);
CREATE INDEX IF NOT EXISTS group_sets_course_id ON group_sets (course_id) WHERE deleted_at IS NULL;

-- Faculty journal entry (tab: groups)
CREATE TABLE IF NOT EXISTS faculty_journal (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  author_id text,
  student_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL
);
CREATE INDEX IF NOT EXISTS faculty_journal_student_id ON faculty_journal (student_id) WHERE deleted_at IS NULL;

-- Appointment group (tab: calendar)
CREATE TABLE IF NOT EXISTS appointment_groups (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL,
  location text,
  per_slot numeric,
  group_signup boolean,
  state text
);
CREATE INDEX IF NOT EXISTS appointment_groups_course_id ON appointment_groups (course_id) WHERE deleted_at IS NULL;

-- Time slot (tab: calendar)
CREATE TABLE IF NOT EXISTS appointment_slots (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  group_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  signups jsonb
);
CREATE INDEX IF NOT EXISTS appointment_slots_course_id ON appointment_slots (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS appointment_slots_group_id ON appointment_slots (group_id) WHERE deleted_at IS NULL;

-- Content job (tab: content)
CREATE TABLE IF NOT EXISTS content_jobs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  source_course_id text,
  target_course_id text,
  state text,
  progress numeric,
  issues jsonb,
  date_shift jsonb,
  started_by text,
  idempotency_key text,
  output jsonb
);

-- Blueprint sync (tab: content)
CREATE TABLE IF NOT EXISTS blueprint_syncs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  blueprint_id text,
  targets jsonb,
  diff jsonb,
  impact jsonb,
  state text,
  idempotency_key text
);

-- Shared item (tab: content)
CREATE TABLE IF NOT EXISTS shared_content (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  kind text,
  title text,
  snapshot jsonb,
  scope text,
  recipient_id text,
  shared_by text,
  content_version numeric,
  tags jsonb
);

-- Developer key (tab: developer)
CREATE TABLE IF NOT EXISTS developer_keys (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text,
  kind text,
  client_id text,
  secret_hash text,
  scopes jsonb,
  enabled boolean,
  redirect_uri text,
  rate_limit_per_min numeric
);

-- Access token (tab: developer)
CREATE TABLE IF NOT EXISTS access_tokens (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  key_id text,
  user_id text,
  token_hash text,
  scopes jsonb,
  expires_at timestamptz,
  revoked_at timestamptz
);

-- Observer link (tab: observers)
CREATE TABLE IF NOT EXISTS observer_links (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  observer_id text NOT NULL,
  student_id text NOT NULL,
  alert_grade_below numeric,
  alert_missing boolean,
  alert_announcements boolean
);
CREATE INDEX IF NOT EXISTS observer_links_observer_id ON observer_links (observer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS observer_links_student_id ON observer_links (student_id) WHERE deleted_at IS NULL;

-- Observer alert (tab: observers)
CREATE TABLE IF NOT EXISTS observer_alerts (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  observer_id text,
  student_id text,
  kind text,
  title text,
  ref_id text,
  read_at timestamptz
);

-- Profile (tab: account)
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  display_name text,
  pronouns text,
  bio text,
  avatar_url text,
  contact_methods text[],
  language text CHECK (language IN ('en', 'es', 'fr')),
  time_zone text,
  high_contrast boolean,
  dyslexia_font boolean,
  underline_links boolean,
  reduced_motion boolean
);

-- Dashboard settings (tab: dashboard)
CREATE TABLE IF NOT EXISTS dashboard_prefs (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  view text CHECK (view IN ('cards', 'list', 'activity')),
  card_order text[],
  favorites text[],
  colors jsonb,
  nicknames jsonb
);

-- To-do (tab: dashboard)
CREATE TABLE IF NOT EXISTS planner_items (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  title text NOT NULL,
  due_at timestamptz,
  course_id text,
  done boolean,
  details text
);
CREATE INDEX IF NOT EXISTS planner_items_course_id ON planner_items (course_id) WHERE deleted_at IS NULL;

-- Planner completion (tab: dashboard)
CREATE TABLE IF NOT EXISTS planner_marks (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  ref_type text,
  ref_id text,
  done boolean
);

-- Recently viewed (tab: account)
CREATE TABLE IF NOT EXISTS view_history (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  title text,
  href text,
  kind text,
  course_id text
);

-- QR login (tab: account)
CREATE TABLE IF NOT EXISTS qr_logins (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  code_hash text,
  expires_at timestamptz,
  used_at timestamptz
);

-- Portfolio page (tab: credentials)
CREATE TABLE IF NOT EXISTS portfolio_pages (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id text,
  portfolio_id text NOT NULL,
  section text NOT NULL,
  title text NOT NULL,
  body text,
  submission_ids text[]
);
CREATE INDEX IF NOT EXISTS portfolio_pages_portfolio_id ON portfolio_pages (portfolio_id) WHERE deleted_at IS NULL;

-- Collaboration (tab: collaboration)
CREATE TABLE IF NOT EXISTS collaborations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  course_id text NOT NULL,
  title text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('document', 'spreadsheet', 'whiteboard')),
  member_ids text[],
  group_id text,
  url text
);
CREATE INDEX IF NOT EXISTS collaborations_course_id ON collaborations (course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS collaborations_group_id ON collaborations (group_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS login_failures (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS objects (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS signing_keys (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS lti_keys (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS lti_launches (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS lti_tokens (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS lti_dl_requests (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS oauth_codes (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS final_overrides (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS job_marks (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS quiz_moderations (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS discussion_subscriptions (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS anon_optins (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS connector_consents (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS tenant_settings (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS module_waivers (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS pairing_codes (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS ticket_messages (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS webhook_sink (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS deliveries (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS notification_digests (id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, doc jsonb NOT NULL DEFAULT '{}'::jsonb);

COMMIT;
