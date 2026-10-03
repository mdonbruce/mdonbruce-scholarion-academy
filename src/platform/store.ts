import fs from "node:fs";
import path from "node:path";
import type {
  AidApplication,
  Attempt,
  AttendanceRecord,
  AuthToken,
  CheckoutSession,
  CloudEvent,
  Enrollment,
  Entitlement,
  GradeRecord,
  HelpArticle,
  IssuedCredential,
  Item,
  LabSession,
  Lead,
  LiveApplication,
  Organization,
  OrgInvite,
  OrgMember,
  PeerReview,
  Post,
  LiveSession,
  Module,
  Order,
  OutboxEmail,
  Partner,
  PathwayEdge,
  Product,
  ProgressRecord,
  Session,
  StudioOutput,
  Submission,
  Subscription,
  Tenant,
  Ticket,
  User, Review, Notice, Article } from "./types";

/**
 * In-process stand-in for the platform services' own databases.
 * Each service only touches its own collections (see the comments), which keeps
 * the swap to a real service a client change rather than a data migration.
 */
export interface Db {
  version: number;
  clockOffsetMs: number;
  // Identity
  users: User[];
  sessions: Session[];
  tenants: Tenant[];
  authTokens: AuthToken[];
  loginFailures: { email: string; at: string }[];
  // Entitlements
  entitlements: Entitlement[];
  // Catalog
  products: Product[];
  modules: Module[];
  items: Item[];
  pathway: PathwayEdge[];
  // Commerce
  checkouts: CheckoutSession[];
  subscriptions: Subscription[];
  orders: Order[];
  aid: AidApplication[];
  // LMS
  enrollments: Enrollment[];
  progress: ProgressRecord[];
  attempts: Attempt[];
  submissions: Submission[];
  grades: GradeRecord[];
  peerReviews: PeerReview[];
  // Teams
  organizations: Organization[];
  orgMembers: OrgMember[];
  orgInvites: OrgInvite[];
  // Community
  posts: Post[];
  // Cloud Lab
  labSessions: LabSession[];
  // AI Tutor
  tutorUsage: { userId: string; day: string; count: number }[];
  // Credentials
  credentials: IssuedCredential[];
  issuerKey: { publicKeyPem: string; privateKeyPem: string; kid: string } | null;
  // Studio
  studio: StudioOutput[];
  // HavenConnect / HavenRoute
  tickets: Ticket[];
  leads: Lead[];
  outbox: OutboxEmail[];
  help: HelpArticle[];
  // Live engine
  liveSessions: LiveSession[];
  attendance: AttendanceRecord[];
  applications: LiveApplication[];
  // Reviews (credential holders only)
  reviews: Review[];
  notices: Notice[];
  articles: Article[];
  // Partner Registry
  partners: Partner[];
  // Event bus log
  events: CloudEvent[];
  processed: string[]; // consumer:eventId pairs already handled (idempotency)
}

export const DB_VERSION = 5;

export function emptyDb(): Db {
  return {
    version: DB_VERSION,
    clockOffsetMs: 0,
    users: [],
    sessions: [],
    tenants: [],
    authTokens: [],
    loginFailures: [],
    entitlements: [],
    products: [],
    modules: [],
    items: [],
    pathway: [],
    checkouts: [],
    subscriptions: [],
    orders: [],
    aid: [],
    enrollments: [],
    progress: [],
    attempts: [],
    submissions: [],
    grades: [],
    peerReviews: [],
    organizations: [],
    orgMembers: [],
    orgInvites: [],
    posts: [],
    labSessions: [],
    tutorUsage: [],
    credentials: [],
    issuerKey: null,
    studio: [],
    tickets: [],
    leads: [],
    outbox: [],
    help: [],
    liveSessions: [],
    attendance: [],
    applications: [],
    reviews: [],
    notices: [],
    articles: [],
    partners: [],
    events: [],
    processed: [],
  };
}

const DATA_FILE = path.join(process.cwd(), ".data", "db.json");

type Holder = { db: Db | null; seeded: boolean; timer: NodeJS.Timeout | null };
const g = globalThis as unknown as { __scholarion?: Holder };
const holder: Holder = (g.__scholarion ??= { db: null, seeded: false, timer: null });

function persistEnabled(): boolean {
  return process.env.SCHOLARION_PERSIST === "1" && process.env.NODE_ENV !== "test";
}

export function loadPersisted(): Db | null {
  if (!persistEnabled()) return null;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Db;
    return parsed.version === DB_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function getDb(): Db {
  if (!holder.db) holder.db = emptyDb();
  return holder.db;
}

export function setDb(db: Db): void {
  holder.db = db;
}

export function isSeeded(): boolean {
  return holder.seeded;
}
export function markSeeded(): void {
  holder.seeded = true;
}

/** Debounced write-behind so dev restarts keep learner state. */
export function save(): void {
  if (!persistEnabled()) return;
  if (holder.timer) clearTimeout(holder.timer);
  holder.timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(holder.db));
    } catch (err) {
      console.error("[store] persist failed", err);
    }
  }, 150);
}

export function resetPersisted(): void {
  try {
    fs.rmSync(DATA_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

/** Platform clock. Admins can advance it in sandbox to exercise trials and renewals. */
export function now(): Date {
  return new Date(Date.now() + getDb().clockOffsetMs);
}
export function nowIso(): string {
  return now().toISOString();
}
