/**
 * Shared contracts for the Scholarion platform services.
 * These mirror the Integration Spec (sections 4–14). When a real service is
 * CONNECTED, its client must return exactly these shapes.
 */

export type ID = string;
export type ISODate = string;

/* ---------- Identity & tenancy ---------- */

export type Role =
  | "learner"
  | "instructor"
  | "reviewer"
  | "org_admin"
  | "support_agent"
  | "platform_admin";

export interface User {
  id: ID;
  email: string;
  name: string;
  passwordHash: string;
  roles: Role[];
  tenantIds: ID[];
  createdAt: ISODate;
  timezone: string;
  onboarding?: { goal: string; level: string; topics: string[]; hoursPerWeek: number };
  emailVerifiedAt?: ISODate;
  /** Base32 TOTP secret once multi-factor sign-in is on; `mfaPendingSecret` during setup. */
  mfaSecret?: string;
  mfaPendingSecret?: string;
  mfaEnabledAt?: ISODate;
  passwordChangedAt?: ISODate;
  deletedAt?: ISODate;
  locale?: string;
  region?: string;
}

export interface AuthToken {
  id: ID;
  hash: string; // sha256 of the secret; the secret itself is only ever emailed
  userId: ID;
  kind: "verify_email" | "reset_password" | "mfa_pending";
  expiresAt: ISODate;
  usedAt?: ISODate;
  next?: string;
}

export interface Session {
  token: string;
  userId: ID;
  tenantId: ID;
  createdAt: ISODate;
  expiresAt: ISODate;
}

export interface Tenant {
  id: ID;
  name: string;
  kind: "public" | "organization";
}

/* ---------- Catalog ---------- */

export type ProductType =
  | "course"
  | "guided_project"
  | "specialization"
  | "professional_certificate"
  | "live_program"
  | "bundle"
  | "degree";

export type Level = "Beginner" | "Foundational" | "Intermediate" | "Advanced";
export type Track = "Foundation" | "Builder" | "Advanced" | "Leadership" | "Core";
export type ItemKind = "video" | "reading" | "lab" | "quiz" | "project" | "capstone" | "discussion" | "summary";
export type AiUsePolicy = "open" | "hints_only" | "closed";

export interface QuizQuestion {
  id: ID;
  prompt: string;
  options: { id: string; text: string }[];
  answer: string; // option id — never sent to the browser
  explanation: string;
}

export interface LabSpec {
  templateId: ID;
  instructions: string[];
  starterFile: string;
  starterCode: string;
  /** Python assertions appended after learner code by the autograder. Hidden from learners. */
  tests: { name: string; code: string; points: number }[];
  resourceClass: "cpu-small" | "gpu-t4";
  timeLimitMinutes: number;
  /** Builder only: the author's reference solution (never sent to learners) and its last check. */
  solution?: string;
  verified?: { at: ISODate; hash: string; score: number; max: number };
}

export interface Item {
  id: ID;
  courseId: ID;
  moduleNo: number;
  order: number;
  kind: ItemKind;
  title: string;
  minutes: number;
  graded: boolean;
  weight: number; // gradebook weight in percent (0 for ungraded)
  aiUsePolicy: AiUsePolicy;
  auditVisible: boolean;
  body?: string; // readings, overviews, transcripts (used for AI Tutor grounding)
  video?: { src: string | null; durationSec: number; captions: string[]; transcript: string };
  quiz?: { timeLimitMinutes: number; passPercent: number; questions: QuizQuestion[] };
  lab?: LabSpec;
  project?: {
    scenario: string;
    deliverables: string[];
    rubric: { criterion: string; points: number }[];
    milestones?: { title: string; due: ISODate }[];
    /** Peer-reviewed: each submission needs `required` reviews and each author gives `required`. */
    peerReview?: { required: number };
  };
  dueOffsetDays?: number; // suggested deadline relative to enrollment
}

export interface Module {
  courseId: ID;
  no: number;
  title: string;
  week: number;
  estimate: string;
  overview: string;
  objectives: string[];
  keyTopics: string[];
  scenario?: string;
}

export interface Product {
  id: ID;
  slug: string;
  code?: string; // course code or program number (#21)
  type: ProductType;
  title: string;
  tagline: string;
  description: string;
  level: Level;
  track?: Track;
  durationLabel: string;
  hours: number;
  language: string;
  subtitles: string[];
  skills: string[];
  roles: string[];
  whatYoullLearn: string[];
  freeToAudit: boolean;
  plusEligible: boolean;
  format: "self_paced" | "live";
  status: "published" | "draft" | "legacy" | "hidden";
  courseIds: ID[]; // for programs; a course lists itself
  educator: string; // "Scholarion Academy" until confirmed instructors are recorded
  partnerIds: ID[]; // must exist in Partner Registry with an active agreement to render
  createdAt: ISODate;
  livePlan?: { weeks: number; sessionHours: number; segmentMinutes: number; schedule: string; capacity: number; cohort: string };
  credential: { kind: "certificate" | "badge"; title: string; criteria: string[] };
  faq: { q: string; a: string }[];
  /** Instructor-built courses: who may edit, and the publish review. */
  authorIds?: ID[];
  review?: CourseReview;
}

export interface CourseReview {
  state: "submitted" | "changes_requested" | "approved";
  submittedAt: ISODate;
  submittedBy: ID;
  decidedAt?: ISODate;
  decidedBy?: ID;
  note?: string;
}

export type EdgeType = "stacks_into" | "credit_toward" | "waives" | "includes" | "prerequisite";
export interface PathwayEdge {
  from: ID;
  to: ID;
  type: EdgeType;
  note?: string;
}

/* ---------- Entitlements ---------- */

export type AccessLevel = "audit" | "full" | "live_seat" | "instructor";
export type EntitlementSource =
  | "audit_enrollment"
  | "purchase"
  | "program_subscription"
  | "plus"
  | "financial_aid"
  | "org_seat"
  | "staff";

export interface Entitlement {
  id: ID;
  userId: ID;
  tenantId: ID;
  resource: { kind: "product" | "plus"; id: ID };
  level: AccessLevel;
  source: EntitlementSource;
  sourceRef?: ID;
  validFrom: ISODate;
  validTo: ISODate | null;
  revokedAt?: ISODate;
}

export type Action =
  | "content.view"
  | "item.graded"
  | "lab.launch"
  | "tutor.use"
  | "credential.earn"
  | "live.join"
  | "studio.manage";

export type DenyReason =
  | "not_signed_in"
  | "needs_upgrade"
  | "trial_expired"
  | "aid_pending"
  | "seat_revoked"
  | "not_enrolled"
  | "no_live_seat";

export interface AccessDecision {
  allow: boolean;
  reason?: DenyReason;
  level?: AccessLevel;
  source?: EntitlementSource;
}

/* ---------- Commerce ---------- */

export type PlanCode = "program_monthly" | "plus_monthly" | "plus_annual" | "one_time" | "live_seat";

export interface Offer {
  code: "audit" | PlanCode | "financial_aid";
  label: string;
  price: number | null;
  currency: string;
  interval: "month" | "year" | "once" | null;
  trialDays?: number;
  refundDays?: number;
  includes: string[];
  excludes: string[];
  renewalTerms: string;
  placeholder: boolean;
}

export interface CheckoutSession {
  id: ID;
  userId: ID;
  productId: ID | null;
  plan: PlanCode;
  amount: number;
  currency: string;
  trialEndsAt: ISODate | null;
  renewsAt: ISODate | null;
  refundPolicy: string;
  status: "open" | "paid" | "expired";
  /** Live seats only: number of monthly installments (1 = pay in full). */
  installments?: number;
  installmentAmount?: number;
  idempotencyKey: string;
  createdAt: ISODate;
}

export interface Subscription {
  id: ID;
  userId: ID;
  plan: PlanCode;
  productId: ID | null; // null for Plus
  status: "trialing" | "active" | "paused" | "canceled" | "expired" | "refunded" | "completed";
  /** Payment plans (live seats): total and paid installments. */
  installmentsTotal?: number;
  installmentsPaid?: number;
  currentPeriodStart: ISODate;
  currentPeriodEnd: ISODate;
  trialEnd: ISODate | null;
  cancelAtPeriodEnd: boolean;
  reminderSentAt?: ISODate;
  amount: number;
  createdAt: ISODate;
}

export interface Order {
  id: ID;
  userId: ID;
  sessionId: ID;
  amount: number;
  currency: string;
  description: string;
  status: "paid" | "refunded";
  createdAt: ISODate;
}

export interface AidApplication {
  id: ID;
  userId: ID;
  productId: ID;
  background: string;
  need: string;
  goals: string;
  commitment: boolean;
  status: "submitted" | "approved" | "declined";
  discountPercent?: number;
  reviewerId?: ID;
  decidedAt?: ISODate;
  createdAt: ISODate;
}

/* ---------- LMS ---------- */

export interface Enrollment {
  id: ID;
  userId: ID;
  productId: ID;
  courseId: ID;
  level: "audit" | "full";
  createdAt: ISODate;
  deadlineAnchor: ISODate; // suggested deadlines count from here; reset moves it
  lastItemId?: ID;
}

export interface ProgressRecord {
  userId: ID;
  itemId: ID;
  status: "started" | "completed";
  updatedAt: ISODate;
  resumeSec?: number;
}

export interface Attempt {
  id: ID;
  userId: ID;
  itemId: ID;
  answers: Record<string, string>;
  startedAt: ISODate;
  submittedAt?: ISODate;
  score?: number;
  max?: number;
}

export interface Submission {
  id: ID;
  userId: ID;
  itemId: ID;
  text: string;
  fileName?: string;
  createdAt: ISODate;
  status: "submitted" | "graded";
  score?: number;
  max?: number;
  feedback?: string;
  /** Peer reviews disagreed beyond the calibration tolerance; course staff decide. */
  needsStaff?: boolean;
}

export interface GradeRecord {
  userId: ID;
  itemId: ID;
  score: number;
  max: number;
  source: "quiz" | "lab" | "instructor" | "attendance" | "peer";
  feedback?: string;
  postedAt: ISODate;
}

export interface PeerReview {
  id: ID;
  submissionId: ID;
  itemId: ID;
  reviewerId: ID;
  scores: Record<string, number>; // criterion → points
  total: number;
  max: number;
  comment: string;
  createdAt: ISODate;
}

/* ---------- Cloud Lab ---------- */

export interface LabSession {
  id: ID;
  userId: ID;
  itemId: ID;
  templateId: ID;
  code: string;
  status: "running" | "stopped";
  createdAt: ISODate;
  lastActiveAt: ISODate;
  attachUrlExpiresAt: ISODate;
}

export interface LabRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  runner: "local-dev-runner" | "disabled";
}

export interface LabGradeResult extends LabRunResult {
  score: number;
  max: number;
  feedback: { name: string; passed: boolean; points: number }[];
}

/* ---------- AI Tutor ---------- */

export type TutorMode = "explain" | "quiz_me" | "summarize" | "hint";

export interface TutorCitation {
  itemId: ID;
  title: string;
  excerpt: string;
}

export interface TutorReply {
  kind: "answer" | "refusal" | "unavailable" | "quota";
  text: string;
  citations: TutorCitation[];
  policy: AiUsePolicy;
  canEscalate: boolean;
}

/* ---------- Credentials ---------- */

export interface IssuedCredential {
  id: ID;
  userId: ID;
  productId: ID;
  title: string;
  holderName: string;
  issuedAt: ISODate;
  revokedAt?: ISODate;
  vc: Record<string, unknown>; // Open Badges 3.0 / W3C VC with proof
}

/* ---------- Studio ---------- */

export interface StudioOutput {
  id: ID;
  courseId: ID;
  moduleNo: number;
  kind: "flashcards" | "study_guide" | "audio_overview" | "mind_map";
  title: string;
  content: unknown;
  state: "draft" | "instructor_approved" | "published";
  approvedBy?: ID;
  createdAt: ISODate;
}

/* ---------- HavenConnect / HavenRoute ---------- */

export interface Ticket {
  id: ID;
  userId: ID | null;
  category: "billing" | "accommodations" | "tutor_escalation" | "technical" | "general";
  subject: string;
  body: string;
  context: Record<string, unknown>;
  status: "open" | "resolved";
  createdAt: ISODate;
}

export interface Lead {
  id: ID;
  kind: "teams_demo" | "partner";
  name: string;
  email: string;
  organization: string;
  message: string;
  createdAt: ISODate;
}

export interface OutboxEmail {
  id: ID;
  to: string;
  template: string;
  subject: string;
  body: string;
  eventId: ID;
  createdAt: ISODate;
}

export interface HelpArticle {
  id: ID;
  title: string;
  body: string;
  tags: string[];
}

/* ---------- Live sessions ---------- */

export interface LiveSegment {
  id: ID;
  sessionId: ID;
  index: number;
  startsAt: ISODate;
  minutes: number;
  provider: "zoom" | "webex";
  meetingId: string;
}

export interface LiveSession {
  id: ID;
  productId: ID;
  cohort: string;
  title: string;
  startsAt: ISODate;
  segments: LiveSegment[];
}

export interface AttendanceRecord {
  userId: ID;
  sessionId: ID;
  minutes: number;
  recordedAt: ISODate;
}

/* ---------- Live program admissions ---------- */

export type ApplicationStatus = "submitted" | "accepted" | "waitlisted" | "declined" | "reserved" | "withdrawn";

export interface LiveApplication {
  id: ID;
  userId: ID;
  productId: ID;
  cohort: string;
  experience: string;
  motivation: string;
  status: ApplicationStatus;
  reviewerId?: ID;
  decisionNote?: string;
  decidedAt?: ISODate;
  reservedAt?: ISODate;
  paymentPlan?: "full" | "installments";
  onboardedAt?: ISODate;
  createdAt: ISODate;
}

/* ---------- Teams & organizations ---------- */

export interface Organization {
  id: ID; // also the tenant id
  name: string;
  domain: string | null; // email domain for organization sign-in (SSO)
  ssoEnabled: boolean;
  seats: number;
  adminIds: ID[];
  programIds: ID[]; // the organization's curated academy
  createdAt: ISODate;
}

export interface OrgMember {
  orgId: ID;
  userId: ID;
  status: "active" | "revoked";
  via: "invite" | "sso" | "admin";
  joinedAt: ISODate;
  revokedAt?: ISODate;
}

export interface OrgInvite {
  token: string;
  orgId: ID;
  email: string;
  createdAt: ISODate;
  acceptedAt?: ISODate;
  revokedAt?: ISODate;
}

/* ---------- Community ---------- */

export interface Post {
  id: ID;
  courseId: ID;
  itemId: ID;
  userId: ID;
  parentId: ID | null;
  body: string;
  createdAt: ISODate;
  reports: ID[]; // user ids who reported it
  hiddenAt?: ISODate;
  hiddenBy?: ID;
}

/* ---------- Partner Registry ---------- */

export type PartnerUse = "logo" | "co_signature" | "credit" | "hiring" | "degree";
export interface Partner {
  id: ID;
  legalName: string;
  type: "university" | "college" | "company" | "credit_evaluator" | "hiring_partner";
  agreementFile: string;
  scope: { productIds: ID[]; uses: PartnerUse[] };
  startsAt: ISODate;
  endsAt: ISODate;
  approvedBy: ID;
}

/* ---------- Events ---------- */

export interface CloudEvent<T = Record<string, unknown>> {
  specversion: "1.0";
  id: ID;
  type: string;
  source: string;
  time: ISODate;
  tenantid: ID;
  subject: string;
  data: T;
}

export type CapabilityStatus = "LIVE" | "CONNECTED" | "SIMULATED" | "DISABLED" | "PLANNED";

/* ---------- Verified learner reviews ---------- */

export type ReviewStatus = "published" | "pending" | "hidden";

/** Only learners holding a valid credential for the product can review it. */
export interface Review {
  id: ID;
  userId: ID;
  productId: ID;
  credentialId: ID;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  status: ReviewStatus;
  /** Why it is pending or hidden (auto-hold reason or moderator note). */
  moderationNote?: string;
  reports: ID[];
  createdAt: ISODate;
  updatedAt?: ISODate;
  moderatedBy?: ID;
}
