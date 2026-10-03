import {
  capabilities,
  catalog,
  checkClaims,
  commerce,
  credentials,
  cx,
  DENY_COPY,
  ensurePlatform,
  entitlements,
  getDb,
  live,
  lms,
  nowIso,
  partners,
  publicQuiz,
  community,
  studio,
  teams,
  type Item,
  type Product,
  type User,
} from "@/platform";
import type { SearchFilters } from "@/platform/catalog";

/**
 * BFF read models: one function per screen. Pages call these on the server and pass
 * plain data to views; nothing here leaks answers, other learners' data or PII.
 */

export type Viewer = { id: string; name: string; roles: string[]; orgAdminOf?: string } | null;
export const viewerOf = (u: User | null): Viewer => (u ? { id: u.id, name: u.name, roles: u.roles, orgAdminOf: teams.adminOf(u.id)[0]?.id } : null);

export function homeVM() {
  ensurePlatform();
  return {
    free: catalog.rail("free"),
    certificates: catalog.rail("certificates"),
    agentic: catalog.rail("agentic"),
    guided: catalog.rail("guided"),
    newest: catalog.rail("new", 6),
    programCount: catalog.all().filter((p) => p.type !== "course" && p.type !== "guided_project").length,
    plans: commerce.plansSummary(),
  };
}

export function exploreVM(sp: Record<string, string | string[] | undefined>) {
  ensurePlatform();
  const arr = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[]) : sp[k] ? [sp[k] as string] : []);
  const filters: SearchFilters = {
    q: (sp.q as string) || undefined,
    type: arr("type") as never,
    level: arr("level") as never,
    track: arr("track") as never,
    freeToAudit: sp.free === "1",
    plusEligible: sp.plus === "1",
    format: (sp.format as "live" | "self_paced") || undefined,
    sort: (sp.sort as never) || "relevance",
  };
  return { filters, result: catalog.search(filters) };
}

export function productVM(slug: string, userId: string | null) {
  ensurePlatform();
  const product = catalog.get(slug);
  if (!product) return null;
  const isCourse = product.type === "course";
  const modules = catalog.modules(product.id).map((m) => ({ ...m, items: catalog.items(product.id, m.no).map((i) => ({ id: i.id, title: i.title, kind: i.kind, minutes: i.minutes, graded: i.graded })) }));
  const access = userId ? (entitlements.check(userId, "item.graded", product.id).allow ? "full" : entitlements.check(userId, "content.view", product.id).allow ? "audit" : "none") : "none";
  const enrolled = userId ? lms.enrollmentsFor(userId).some((e) => e.productId === product.id || e.courseId === product.id) : false;
  const firstCourse = product.courseIds[0] ?? (isCourse ? product.id : null);
  return {
    product,
    modules,
    courses: catalog.courses(product.id).filter((c) => c.id !== product.id),
    includedIn: catalog.includedIn(product.id),
    nextSteps: catalog.nextSteps(product.id),
    offers: commerce.offers(product.id),
    plans: commerce.plansSummary(),
    pace: catalog.pace(product),
    partnerLogos: partners.forProduct(product, "logo"),
    access,
    enrolled,
    continueHref: firstCourse && (enrolled || access !== "none") ? `/app/course/${firstCourse}` : null,
    edges: getDb().pathway.filter((e) => e.from === product.id || e.to === product.id),
    sessions: product.format === "live" ? getDb().liveSessions.filter((s) => s.productId === product.id).slice(0, 7) : [],
    hours: product.hours,
  };
}

export function pathwayVM() {
  ensurePlatform();
  const { nodes, edges } = catalog.pathway();
  // Lane order follows the approved stacking map.
  const ORDER = ["#21", "#18", "#19", "#16", "#26", "#22", "#17", "#15", "GC-AAGE", "#24", "#20", "#23", "#25"];
  const byTrack = (t: string) => nodes.filter((n) => n.track === t && n.type !== "course" && n.type !== "guided_project").sort((a, b) => ORDER.indexOf(a.code ?? "") - ORDER.indexOf(b.code ?? ""));
  return { foundation: byTrack("Foundation"), builder: byTrack("Builder"), advanced: byTrack("Advanced"), leadership: byTrack("Leadership"), edges, products: Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, Product> };
}

export function dashboardVM(userId: string) {
  ensurePlatform();
  const d = lms.dashboard(userId);
  const next = d.courses.map((c) => ({ course: c.course, item: c.progress.nextItem })).find((x) => x.item);
  const user = getDb().users.find((u) => u.id === userId)!;
  const sso = teams.ssoMatch(user);
  return {
    ...d,
    next,
    live: live.sessionsFor(userId).filter((s) => s.session.startsAt >= nowIso()).slice(0, 2),
    recommendations: recommendationsFor(userId),
    ssoOffer: sso ? { id: sso.id, name: sso.name, domain: sso.domain } : null,
    orgs: teams.membershipsOf(userId).map((m) => ({ id: m.org.id, name: m.org.name })),
  };
}

function recommendationsFor(userId: string) {
  const enrolled = new Set(lms.enrollmentsFor(userId).flatMap((e) => [e.productId, e.courseId]));
  const out: { product: Product; because: string }[] = [];
  for (const e of lms.enrollmentsFor(userId)) {
    const src = catalog.get(e.productId);
    for (const p of catalog.nextSteps(e.productId)) {
      if (!enrolled.has(p.id) && !out.some((o) => o.product.id === p.id)) out.push({ product: p, because: `Because you're taking ${src?.title}` });
    }
  }
  return out.slice(0, 3);
}

export function courseHomeVM(userId: string, courseId: string) {
  ensurePlatform();
  const course = catalog.get(courseId);
  if (!course) return null;
  const access = lms.accessLevel(userId, courseId);
  const items = catalog.items(courseId);
  const enrollment = lms.enrollment(userId, courseId);
  return {
    course,
    access,
    enrollment,
    progress: lms.courseProgress(userId, courseId),
    counts: {
      modules: catalog.modules(courseId).length,
      assignments: items.filter((i) => i.kind === "quiz").length,
      labs: items.filter((i) => i.kind === "lab").length,
      projects: items.filter((i) => i.kind === "project").length,
      capstone: items.filter((i) => i.kind === "capstone").length,
    },
    intro: items.find((i) => i.kind === "video") ?? null,
    modules: catalog.modules(courseId).map((m) => {
      const mi = catalog.items(courseId, m.no);
      const done = mi.filter((i) => lms.itemStatus(userId, i.id) === "completed").length;
      return { ...m, total: mi.length, done };
    }),
    program: enrollment ? catalog.get(enrollment.productId) : undefined,
    denyCopy: access === "audit" ? DENY_COPY.needs_upgrade : access === "none" ? DENY_COPY.not_enrolled : null,
  };
}

function itemLocked(userId: string, item: Item): string | null {
  if (item.auditVisible) {
    const d = entitlements.check(userId, "content.view", item.courseId);
    if (!d.allow) return DENY_COPY[d.reason ?? "not_enrolled"];
    if (item.kind === "lab") {
      const l = entitlements.check(userId, "lab.launch", item.courseId);
      return l.allow ? null : DENY_COPY[l.reason ?? "needs_upgrade"];
    }
    return null;
  }
  const d = entitlements.check(userId, "item.graded", item.courseId);
  return d.allow ? null : DENY_COPY[d.reason ?? "needs_upgrade"];
}

export function moduleVM(userId: string, courseId: string, moduleNo: number) {
  ensurePlatform();
  const course = catalog.get(courseId);
  const mod = catalog.module(courseId, moduleNo);
  if (!course || !mod) return null;
  const items = catalog.items(courseId, moduleNo).map((i) => ({ id: i.id, title: i.title, kind: i.kind, minutes: i.minutes, graded: i.graded, status: lms.itemStatus(userId, i.id), locked: !!itemLocked(userId, i), grade: lms.grade(userId, i.id) ?? null }));
  const total = catalog.modules(courseId).length;
  return { course, mod, items, total, access: lms.accessLevel(userId, courseId), extras: studio.forModule(courseId, moduleNo), tutorEnabled: entitlements.check(userId, "content.view", courseId).allow };
}

export function itemVM(userId: string, courseId: string, itemId: string) {
  ensurePlatform();
  const item = catalog.item(itemId);
  const course = catalog.get(courseId);
  if (!item || !course || item.courseId !== courseId) return null;
  const siblings = catalog.items(courseId);
  const idx = siblings.findIndex((i) => i.id === itemId);
  const locked = itemLocked(userId, item);
  const progress = getDb().progress.find((p) => p.userId === userId && p.itemId === itemId);
  const lab = item.lab && !locked ? getDb().labSessions.find((s) => s.userId === userId && s.itemId === itemId) : undefined;
  const best = lms.grade(userId, itemId);
  return {
    course,
    module: catalog.module(courseId, item.moduleNo)!,
    item: { ...item, quiz: undefined, lab: item.lab ? { ...item.lab, tests: [] as never[] } : undefined },
    quiz: item.quiz && !locked ? publicQuiz(item) : null,
    locked,
    status: lms.itemStatus(userId, itemId),
    resumeSec: progress?.resumeSec ?? 0,
    best: best ? { score: best.score, max: best.max } : null,
    labCode: lab?.code ?? null,
    submissions: lms.submissionsFor(userId, itemId),
    dueDate: lms.dueDate(userId, item),
    prev: siblings[idx - 1] ?? null,
    next: siblings[idx + 1] ?? null,
    moduleItems: catalog.items(courseId, item.moduleNo).map((i) => ({ id: i.id, title: i.title, kind: i.kind, status: lms.itemStatus(userId, i.id) })),
    tutorEnabled: entitlements.check(userId, "content.view", courseId).allow,
    canView: entitlements.check(userId, "content.view", courseId).allow,
    threads: item.kind === "discussion" && !locked ? community.threads(item.id, userId) : [],
    peer: item.project?.peerReview && !locked ? peerVM(userId, item.id) : null,
  };
}

function peerVM(userId: string, itemId: string) {
  const status = lms.peerStatus(userId, itemId);
  const q = lms.reviewQueue(userId, itemId);
  const rubric = catalog.item(itemId)!.project!.rubric;
  return {
    ...status,
    available: q.available,
    // Classmate's work is shown without their name (anonymous review).
    next: q.next ? { id: q.next.id, text: q.next.text, fileName: q.next.fileName ?? null, createdAt: q.next.createdAt } : null,
    rubric,
  };
}

export function gradebookVM(userId: string, courseId: string) {
  ensurePlatform();
  const course = catalog.get(courseId);
  if (!course) return null;
  return { course, ...lms.gradebook(userId, courseId) };
}

export function gradesOverviewVM(userId: string) {
  ensurePlatform();
  return lms.enrollmentsFor(userId).map((e) => ({ course: catalog.get(e.courseId)!, gb: lms.gradebook(userId, e.courseId) }));
}

export function credentialsVM(userId: string) {
  ensurePlatform();
  const issued = credentials.forUser(userId).map((c) => ({ ...c, vc: undefined, verifyUrl: credentials.verifyUrl(c.id), linkedIn: credentials.linkedInUrl(c), product: catalog.get(c.productId) }));
  const inProgress = lms
    .productsWithProgress(userId)
    .filter((p) => !issued.some((c) => c.productId === p.id))
    .map((p) => {
      const courseIds = p.courseIds.length ? p.courseIds : [p.id];
      const pct = Math.round(courseIds.reduce((a, c) => a + lms.courseProgress(userId, c).percent, 0) / courseIds.length);
      return { product: p, percent: pct, canEarn: entitlements.check(userId, "credential.earn", p.id).allow };
    });
  const mine = new Set(lms.enrollmentsFor(userId).flatMap((e) => [e.productId, e.courseId]));
  const pathways = [...new Map(lms.productsWithProgress(userId).flatMap((p) => catalog.nextSteps(p.id)).filter((p) => !mine.has(p.id)).map((p) => [p.id, p])).values()].slice(0, 4);
  return { issued, inProgress, pathways };
}

export function verifyVM(id: string) {
  ensurePlatform();
  const r = credentials.verify(id);
  const product = r.credential ? catalog.get(r.credential.productId) : undefined;
  return { ...r, product, verifyUrl: credentials.verifyUrl(id) };
}

export function accountVM(user: User) {
  ensurePlatform();
  return {
    user: { id: user.id, name: user.name, email: user.email },
    subscriptions: commerce.subscriptionsFor(user.id).map((s) => ({ ...s, product: s.productId ? catalog.get(s.productId) : null })),
    orders: commerce.ordersFor(user.id),
    aid: commerce.aidFor(user.id).map((a) => ({ ...a, product: catalog.get(a.productId) })),
    plans: commerce.plansSummary(),
    now: nowIso(),
  };
}

export function liveVM(userId: string) {
  ensurePlatform();
  const sessions = live.sessionsFor(userId);
  const attendance = live.attendanceFor(userId);
  return { sessions: sessions.map((s) => ({ ...s, attended: attendance.find((a) => a.sessionId === s.session.id)?.minutes ?? null })), now: nowIso() };
}

export function calendarVM(userId: string) {
  ensurePlatform();
  const rows = lms
    .enrollmentsFor(userId)
    .filter((e) => lms.accessLevel(userId, e.courseId) === "full")
    .flatMap((e) =>
      catalog
        .items(e.courseId)
        .filter((i) => i.graded)
        .map((i) => ({ item: i, course: catalog.get(e.courseId)!, due: lms.dueDate(userId, i), done: !!lms.grade(userId, i.id) })),
    )
    .filter((r) => r.due && !r.done)
    .sort((a, b) => a.due!.localeCompare(b.due!));
  const sessions = live.sessionsFor(userId).map((s) => ({ title: s.session.title, startsAt: s.session.startsAt, product: s.productTitle }));
  return { rows: rows.slice(0, 30), sessions };
}

export function notificationsVM(user: User) {
  ensurePlatform();
  return cx.outbox(user.email).slice(0, 50);
}

export function adminVM() {
  ensurePlatform();
  const db = getDb();
  return {
    capabilities: capabilities(),
    clockOffsetDays: Math.round(db.clockOffsetMs / 86400000),
    now: nowIso(),
    events: [...db.events].reverse().slice(0, 40),
    outbox: cx.outbox().slice(0, 20),
    counts: { users: db.users.length, enrollments: db.enrollments.length, credentials: db.credentials.length, aidPending: commerce.aidQueue().length, studioDrafts: studio.drafts().length, tickets: db.tickets.filter((t) => t.status === "open").length, reported: community.queue().filter((p) => p.reports.length && !p.hiddenAt).length, submissions: lms.pendingSubmissions().length },
    credentials: db.credentials.slice(-10).reverse().map((c) => ({ id: c.id, title: c.title, holderName: c.holderName, issuedAt: c.issuedAt, revokedAt: c.revokedAt })),
  };
}

export function aidQueueVM() {
  ensurePlatform();
  return commerce.aidQueue().map((a) => ({ ...a, product: catalog.get(a.productId), summary: commerce.summariseAid(a) }));
}

export function studioVM() {
  ensurePlatform();
  return { drafts: studio.drafts().map((d) => ({ ...d, course: catalog.get(d.courseId) })), courses: catalog.all().filter((p) => p.type === "course") };
}

export function gradingVM() {
  ensurePlatform();
  return lms.pendingSubmissions().map((s) => ({ ...s, item: catalog.item(s.itemId), learner: getDb().users.find((u) => u.id === s.userId)?.name ?? "Learner", peerReviews: lms.peerReviewsOf(s.id) }));
}

export function claimsVM(text: string) {
  ensurePlatform();
  return { text, issues: text ? checkClaims(text) : [] };
}

export function supportVM() {
  ensurePlatform();
  return { tickets: cx.tickets(), leads: cx.leads() };
}

export function liveAdminVM() {
  ensurePlatform();
  const db = getDb();
  return db.liveSessions.map((s) => ({ ...s, product: catalog.get(s.productId)?.title, seats: db.entitlements.filter((e) => e.level === "live_seat" && e.resource.id === s.productId && !e.revokedAt).map((e) => ({ userId: e.userId, name: db.users.find((u) => u.id === e.userId)?.name ?? e.userId, minutes: db.attendance.find((a) => a.userId === e.userId && a.sessionId === s.id)?.minutes ?? null })) }));
}

export function helpVM(q?: string) {
  ensurePlatform();
  return cx.articles(q);
}

export function checkoutVM(id: string, userId: string) {
  ensurePlatform();
  const cs = commerce.getCheckout(id, userId);
  if (!cs) return null;
  return { cs, product: cs.productId ? catalog.get(cs.productId) : null };
}

export function aidApplyVM(slug: string) {
  ensurePlatform();
  return { product: catalog.get(slug) ?? null, guidance: commerce.aidGuidance };
}

export function moderationVM() {
  ensurePlatform();
  return community.queue();
}

export function orgVM(orgId: string, userId: string) {
  ensurePlatform();
  const d = teams.dashboard(orgId, userId);
  const assignable = catalog.all().filter((p) => p.format === "self_paced" && p.type !== "guided_project" && !d.org.programIds.includes(p.id));
  return { ...d, assignable };
}

export function joinVM(token: string) {
  ensurePlatform();
  return teams.invitation(token);
}

export function teamsQuote(seats = 10) {
  ensurePlatform();
  return teams.quote(seats);
}
