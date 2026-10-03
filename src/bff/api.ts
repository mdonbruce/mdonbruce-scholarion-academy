import QR from "./qr";
import {
  capabilities,
  catalog,
  checkClaims,
  cloudlab,
  commerce,
  credentials,
  cx,
  ensurePlatform,
  entitlements,
  getDb,
  identity,
  live,
  lms,
  publicUser,
  studio,
  tickAll,
  tutor,
  type Action,
  type PlanCode,
  type TutorMode,
  type User,
} from "@/platform";
import { DAY, PlatformError } from "@/platform/util";
import { body, currentUser, errorResponse, json, redirect, safeRedirect, sameOrigin, sessionCookie, withQuery } from "./http";

/**
 * Academy BFF — the only door the browser uses (Integration Spec §2, rule 1).
 * Mounted at /api/v1/* by src/app/api/v1/[...path]/route.ts. Every handler resolves the
 * session, checks entitlements through the platform, and never trusts the client.
 */

type Ctx = { req: Request; params: Record<string, string>; user: User | null; token: string | null; data: Record<string, string> };
type Handler = (ctx: Ctx) => Promise<Response> | Response;
interface Route {
  method: string;
  pattern: string;
  auth?: "user" | "staff" | "reviewer" | "admin";
  handler: Handler;
}

const routes: Route[] = [];
const on = (method: string, pattern: string, handler: Handler, auth?: Route["auth"]) => routes.push({ method, pattern, handler, auth });

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) out[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return out;
}

const back = (c: Ctx, fallback: string) => safeRedirect(c.data.redirect || c.data.back, fallback);

/* ---------------- Auth ---------------- */

on("POST", "auth/signin", (c) => {
  const s = identity.signIn(c.data.email ?? "", c.data.password ?? "");
  return redirect(back(c, "/app"), { "set-cookie": sessionCookie(s.token, 14 * 86400) });
});
on("POST", "auth/signup", (c) => {
  const u = identity.signUp({ name: c.data.name ?? "", email: c.data.email ?? "", password: c.data.password ?? "", acceptTerms: c.data.acceptTerms === "on" || c.data.acceptTerms === "true" });
  const s = identity.createSession(u.id, "academy-public");
  return redirect(back(c, "/app/onboarding"), { "set-cookie": sessionCookie(s.token, 14 * 86400) });
});
on("POST", "auth/signout", (c) => {
  if (c.token) identity.signOut(c.token);
  return redirect("/", { "set-cookie": sessionCookie("", 0) });
});
on("GET", "me", (c) => json({ user: c.user ? publicUser(c.user) : null }));
on(
  "POST",
  "me/onboarding",
  (c) => {
    identity.saveOnboarding(c.user!.id, { goal: c.data.goal ?? "", level: c.data.level ?? "Beginner", topics: (c.data.topics ?? "").split(",").map((t) => t.trim()).filter(Boolean), hoursPerWeek: Number(c.data.hoursPerWeek) || 5 });
    return redirect("/app");
  },
  "user",
);

/* ---------------- Catalog ---------------- */

on("GET", "catalog/products", (c) => {
  const u = new URL(c.req.url);
  const list = (k: string) => u.searchParams.getAll(k).filter(Boolean);
  return json(
    catalog.search({
      q: u.searchParams.get("q") ?? undefined,
      type: list("type") as never,
      level: list("level") as never,
      track: list("track") as never,
      freeToAudit: u.searchParams.get("free") === "1",
      plusEligible: u.searchParams.get("plus") === "1",
      format: (u.searchParams.get("format") as "live" | "self_paced") || undefined,
      sort: (u.searchParams.get("sort") as never) || undefined,
    }),
  );
});
on("GET", "catalog/suggest", (c) => json({ suggestions: catalog.suggest(new URL(c.req.url).searchParams.get("q") ?? "") }));
on("GET", "catalog/products/:slug", (c) => {
  const p = catalog.get(c.params.slug);
  return p ? json({ product: p, modules: catalog.modules(p.id), courses: catalog.courses(p.id), nextSteps: catalog.nextSteps(p.id) }) : json({ error: { code: "not_found", message: "Not found" } }, 404);
});
on("GET", "catalog/pathways", () => json(catalog.pathway()));
on("GET", "commerce/offers/:slug", (c) => json({ offers: commerce.offers(c.params.slug), plans: commerce.plansSummary() }));

/* ---------------- Entitlements ---------------- */

on("POST", "entitlements/check", (c) => {
  const pairs = JSON.parse(c.data.checks ?? "[]") as { action: Action; resource: string }[];
  return json({ results: entitlements.checkBatch(c.user?.id ?? null, pairs.slice(0, 50)) });
});

/* ---------------- LMS ---------------- */

on(
  "POST",
  "lms/enrollments",
  (c) => {
    const product = catalog.get(c.data.productId ?? "");
    if (!product) throw new PlatformError("not_found", "Product not found", 404);
    const enrolls = lms.enroll(c.user!.id, product.id, c.data.level === "full" ? "full" : "audit");
    return redirect(back(c, `/app/course/${enrolls[0].courseId}`));
  },
  "user",
);
on(
  "POST",
  "lms/progress",
  (c) => {
    lms.recordProgress(c.user!.id, c.data.itemId, c.data.status === "completed" ? "completed" : "started", c.data.resumeSec ? Number(c.data.resumeSec) : undefined);
    return c.data.redirect ? redirect(back(c, "/app")) : json({ ok: true });
  },
  "user",
);
on("POST", "lms/attempts", (c) => json({ attempt: redactAttempt(lms.startAttempt(c.user!.id, c.data.itemId)) }), "user");
on("PUT", "lms/attempts/:id", (c) => json({ attempt: redactAttempt(lms.saveAnswers(c.user!.id, c.params.id, JSON.parse(c.data.answers ?? "{}"))) }), "user");
on("POST", "lms/attempts/:id/submit", (c) => json(lms.submitAttempt(c.user!.id, c.params.id, c.data.answers ? JSON.parse(c.data.answers) : undefined)), "user");
on(
  "POST",
  "lms/submissions",
  (c) => {
    lms.submitProject(c.user!.id, c.data.itemId, c.data.text ?? "", c.data.file || undefined);
    return redirect(withQuery(back(c, "/app"), { notice: "Submitted. Course staff will grade it and you'll be notified." }));
  },
  "user",
);
on(
  "POST",
  "lms/deadlines/reset",
  (c) => {
    lms.resetDeadlines(c.user!.id, c.data.courseId);
    return redirect(withQuery(back(c, "/app"), { notice: "Deadlines reset. Your new schedule starts this week — no penalty." }));
  },
  "user",
);
on("GET", "lms/courses/:id/gradebook", (c) => json(lms.gradebook(c.user!.id, c.params.id)), "user");
on("GET", "lms/me/dashboard", (c) => json(lms.dashboard(c.user!.id)), "user");

function redactAttempt(a: { id: string; itemId: string; answers: Record<string, string>; startedAt: string }) {
  return { id: a.id, itemId: a.itemId, answers: a.answers, startedAt: a.startedAt };
}

/* ---------------- Cloud Lab ---------------- */

on(
  "POST",
  "labs/sessions",
  (c) => {
    const s = cloudlab.launch(c.user!.id, c.data.itemId);
    return json({ session: { id: s.id, code: s.code, status: s.status, attachUrlExpiresAt: s.attachUrlExpiresAt }, runner: cloudlab.runnerName() });
  },
  "user",
);
on("PUT", "labs/sessions/:id", (c) => json({ ok: !!cloudlab.saveCode(c.params.id, c.user!.id, c.data.code ?? "") }), "user");
on("POST", "labs/sessions/:id/run", (c) => json(cloudlab.run(c.params.id, c.user!.id, c.data.code)), "user");
on("POST", "labs/sessions/:id/grade", (c) => json(cloudlab.grade(c.params.id, c.user!.id, c.data.code)), "user");
on("GET", "labs/starter/:itemId", (c) => {
  const item = catalog.item(c.params.itemId);
  if (!item?.lab) throw new PlatformError("not_found", "Lab not found", 404);
  if (!entitlements.check(c.user?.id ?? null, "content.view", item.courseId).allow) throw new PlatformError("not_enrolled", "Enroll to download lab files.", 403);
  return new Response(item.lab.starterCode, { headers: { "content-type": "text/x-python; charset=utf-8", "content-disposition": `attachment; filename="${item.lab.starterFile}"` } });
});

/* ---------------- AI Tutor ---------------- */

on("POST", "tutor/messages", (c) => json(tutor.ask({ userId: c.user!.id, courseId: c.data.courseId, itemId: c.data.itemId || undefined, mode: (c.data.mode as TutorMode) || "explain", message: (c.data.message ?? "").slice(0, 2000) })), "user");
on(
  "POST",
  "tutor/escalate",
  (c) => {
    const t = cx.createTicket({ userId: c.user!.id, category: "tutor_escalation", subject: `Question about ${catalog.item(c.data.itemId)?.title ?? catalog.get(c.data.courseId)?.title ?? "a course"}`, body: c.data.message || "Learner asked for an instructor.", context: { courseId: c.data.courseId, itemId: c.data.itemId, conversation: c.data.conversation } });
    return json({ ticketId: t.id, message: "Sent to course staff. You'll get a reply by email and in your notifications." });
  },
  "user",
);

/* ---------------- Commerce (sandbox) ---------------- */

on(
  "POST",
  "commerce/checkout-sessions",
  (c) => {
    const plan = c.data.plan as PlanCode;
    if (!["program_monthly", "plus_monthly", "plus_annual", "one_time", "live_seat"].includes(plan)) throw new PlatformError("invalid_plan", "Choose a plan.");
    const product = c.data.productId ? catalog.get(c.data.productId) : undefined;
    const cs = commerce.createCheckout({ userId: c.user!.id, plan, productId: product?.id ?? null, idempotencyKey: c.data.idempotencyKey || `${c.user!.id}:${plan}:${product?.id ?? "plus"}:${new Date().toISOString().slice(0, 13)}` });
    return redirect(`/checkout/${cs.id}`);
  },
  "user",
);
on(
  "POST",
  "commerce/checkout-sessions/:id/confirm",
  (c) => {
    const { session } = commerce.confirmSandboxPayment(c.params.id, c.user!.id);
    const product = session.productId ? catalog.get(session.productId) : null;
    if (product && (session.plan === "one_time" || session.plan === "program_monthly")) lms.enroll(c.user!.id, product.id, "full");
    if (product && session.plan === "live_seat") return redirect("/app/live?notice=Seat%20reserved.%20Your%20session%20cards%20are%20below.");
    return redirect(withQuery(product ? `/learn/${product.slug}` : "/app/account", { notice: session.trialEndsAt ? "Your free trial has started. We'll remind you before it ends." : "Payment complete (sandbox). You now have full access." }));
  },
  "user",
);
on(
  "POST",
  "commerce/subscriptions/:id/:action",
  (c) => {
    const { id, action } = c.params;
    let notice = "";
    if (action === "cancel") {
      const s = commerce.cancel(id, c.user!.id);
      notice = `Canceled. You keep access until ${new Date(s.currentPeriodEnd).toLocaleDateString("en-US", { dateStyle: "long" })} and your progress is saved.`;
    } else if (action === "pause") {
      commerce.pause(id, c.user!.id);
      notice = "Paused. Your progress is saved; resume any time.";
    } else if (action === "resume") {
      commerce.resume(id, c.user!.id);
      notice = "Resumed. Welcome back.";
    } else if (action === "refund") {
      notice = commerce.requestRefund(id, c.user!.id).message;
    } else throw new PlatformError("not_found", "Unknown action", 404);
    return redirect(withQuery("/app/account", { notice }));
  },
  "user",
);
on(
  "POST",
  "commerce/aid-applications",
  (c) => {
    commerce.applyForAid({ userId: c.user!.id, productId: c.data.productId, background: c.data.background ?? "", need: c.data.need ?? "", goals: c.data.goals ?? "", commitment: c.data.commitment === "on" });
    return redirect(withQuery("/app/account", { notice: `Application received. A person will review it and we'll email you within ${commerce.aidGuidance.decisionDays} days.` }));
  },
  "user",
);
on(
  "POST",
  "commerce/aid-applications/:id/decision",
  (c) => {
    commerce.decideAid(c.params.id, c.user!.id, c.data.decision === "approved" ? "approved" : "declined", Number(c.data.discountPercent) || 100);
    return redirect(withQuery("/admin/aid", { notice: "Decision recorded and the learner was notified." }));
  },
  "reviewer",
);

/* ---------------- Credentials (verify is public) ---------------- */

on("GET", "credentials/verify/:id", (c) => json(credentials.verify(c.params.id)));
on("GET", "credentials/:id/vc", (c) => {
  const cred = credentials.get(c.params.id);
  if (!cred || cred.revokedAt) throw new PlatformError("not_found", "Credential not found", 404);
  return new Response(JSON.stringify(cred.vc, null, 2), { headers: { "content-type": "application/ld+json", "content-disposition": `attachment; filename="${cred.id}.json"` } });
});
on("GET", "credentials/:id/qr", async (c) => {
  const svg = await QR.svg(credentials.verifyUrl(c.params.id));
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
});
on("GET", "credentials/issuer-key", () => json(credentials.publicJwk()));

/* ---------------- HavenConnect ---------------- */

on("POST", "cx/chat", (c) => json(cx.chat({ userId: c.user?.id ?? null, message: (c.data.message ?? "").slice(0, 1000), failedAttempts: Number(c.data.failedAttempts) || 0 })));
on("POST", "cx/tickets", (c) => {
  const t = cx.createTicket({ userId: c.user?.id ?? null, category: (c.data.category as never) || "general", subject: c.data.subject ?? "", body: c.data.body ?? "", context: c.user ? { plan: commerce.subscriptionsFor(c.user.id).map((s) => s.plan), courses: lms.enrollmentsFor(c.user.id).map((e) => e.courseId) } : {} });
  return c.data.redirect ? redirect(withQuery(back(c, "/help"), { notice: `Ticket ${t.id} opened. We'll reply by email.` })) : json({ ticketId: t.id });
});
on("POST", "cx/leads", (c) => {
  cx.createLead({ kind: c.data.kind === "partner" ? "partner" : "teams_demo", name: c.data.name ?? "", email: c.data.email ?? "", organization: c.data.organization ?? "", message: c.data.message ?? "" });
  return redirect(withQuery(back(c, "/teams"), { notice: "Thanks — our team will contact you within two business days." }));
});

/* ---------------- Live sessions ---------------- */

on(
  "GET",
  "live/segments/:id/join",
  (c) => {
    const j = live.join(c.user!.id, c.params.id);
    if (!j.open) return redirect(withQuery("/app/live", { notice: `This segment opens at ${new Date(j.opensAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.` }));
    return redirect(j.url);
  },
  "user",
);

/* ---------------- Admin / staff ---------------- */

on("GET", "status", () => json({ capabilities: capabilities() }));
on(
  "POST",
  "admin/clock",
  (c) => {
    const days = Math.max(0, Math.min(400, Number(c.data.days) || 0));
    getDb().clockOffsetMs += days * DAY;
    const r = tickAll();
    return redirect(withQuery("/admin", { notice: `Sandbox clock +${days} days. Reminders ${r.commerce.reminders}, conversions ${r.commerce.converted}, renewals ${r.commerce.renewed}, expiries ${r.commerce.expired}, deadline notices ${r.lms}, live reminders ${r.live}.` }));
  },
  "admin",
);
on("POST", "admin/studio/:id/approve", (c) => (studio.approve(c.params.id, c.user!.id), redirect(withQuery("/admin/studio", { notice: "Published to learners." }))), "staff");
on("POST", "admin/studio/generate", (c) => (studio.generate(c.data.courseId, Number(c.data.moduleNo)), redirect("/admin/studio")), "staff");
on(
  "POST",
  "admin/submissions/:id/grade",
  (c) => {
    lms.gradeSubmission(c.params.id, Number(c.data.score), Number(c.data.max) || 50, c.data.feedback ?? "");
    return redirect(withQuery("/admin/grading", { notice: "Grade posted." }));
  },
  "staff",
);
on("POST", "admin/claims", (c) => redirect(withQuery("/admin/claims", { text: c.data.text ?? "" })), "admin");
on("POST", "admin/tickets/:id/resolve", (c) => (cx.resolveTicket(c.params.id), redirect("/admin/support")), "admin");
on(
  "POST",
  "admin/live/:sessionId/attendance",
  (c) => {
    live.recordAttendance(c.data.userId, c.params.sessionId, Number(c.data.minutes));
    return redirect(withQuery("/admin/live", { notice: "Attendance recorded (simulated provider webhook)." }));
  },
  "admin",
);
on("POST", "admin/live/:sessionId/failover", (c) => (live.failover(c.params.sessionId), redirect(withQuery("/admin/live", { notice: "Re-provisioned on the other provider." }))), "admin");
on("POST", "admin/credentials/:id/revoke", (c) => (credentials.revoke(c.params.id, c.data.reason || "Revoked by admin"), redirect("/admin")), "admin");

/* ---------------- Dispatcher ---------------- */

export async function handleApi(req: Request, path: string): Promise<Response> {
  ensurePlatform();
  const method = req.method.toUpperCase();
  const candidates = routes.filter((r) => match(r.pattern, path));
  const route = candidates.find((r) => r.method === method);
  if (!route) return json({ error: { code: candidates.length ? "method_not_allowed" : "not_found", message: "Not found" } }, candidates.length ? 405 : 404);

  if (method !== "GET" && !sameOrigin(req)) return json({ error: { code: "bad_origin", message: "Cross-site request blocked." } }, 403);
  const session = currentUser(req);
  const data = await body(req);
  const ctx: Ctx = { req, params: match(route.pattern, path)!, user: session?.user ?? null, token: session?.token ?? null, data };
  const backTo = safeRedirect(data.back || data.redirect || (req.headers.get("referer") ? new URL(req.headers.get("referer")!).pathname : "/"), "/");

  try {
    if (route.auth) {
      if (!ctx.user) {
        if (method === "GET" || data.redirect || data.back) return redirect(withQuery("/login", { next: backTo }));
        return json({ error: { code: "not_signed_in", message: "Sign in to continue." } }, 401);
      }
      const need = { user: [], staff: ["instructor"], reviewer: ["reviewer"], admin: ["platform_admin"] }[route.auth] as never[];
      if (need.length && !identity.hasRole(ctx.user, ...need)) return json({ error: { code: "forbidden", message: "You don't have access to this." } }, 403);
    }
    return await route.handler(ctx);
  } catch (err) {
    return errorResponse(req, err, backTo);
  }
}
