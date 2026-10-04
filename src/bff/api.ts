import QR from "./qr";
import { attachDoc, officeResponse } from "../documents/http";
import { isLocale, LOCALE_COOKIE, REGION_COOKIE } from "@/i18n";
import { formatMoney, isRegion } from "@/platform/pricing";
import { certificatePdf } from "./certificate-pdf";
import { invoiceDoc, invoicePdf } from "./invoice-pdf";
import {
  capabilities,
  catalog,
  cloudlab,
  commerce,
  credentials,
  cx,
  ensurePlatform,
  entitlements,
  getDb,
  identity,
  privacy,
  reviews,
  authoring,
  content,
  live,
  lms,
  publicUser,
  admissions,
  community,
  studio,
  teams,
  tickAll,
  tutor,
  library,
  recommend,
  type Action,
  type PlanCode,
  type TutorMode,
  type User,
} from "@/platform";
import { DAY, PlatformError } from "@/platform/util";
import { DURATION_BUCKETS, type DurationBucket } from "@/platform/catalog";
import type { PlanChangeTarget } from "@/platform/commerce";
import { body, currentUser, errorResponse, json, mfaCookie, prefCookie, readCookie, MFA_COOKIE, redirect, redirectWithCookies, safeRedirect, sameOrigin, sessionCookie, withQuery } from "./http";

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
  const next = back(c, "/app");
  const r = identity.beginSignIn(c.data.email ?? "", c.data.password ?? "", next);
  if ("mfaToken" in r) return redirectWithCookies(withQuery("/login/mfa", { next }), [mfaCookie(r.mfaToken, 300)]);
  return redirect(next, { "set-cookie": sessionCookie(r.session.token, 14 * 86400) });
});
on("POST", "auth/mfa", (c) => {
  const r = identity.completeMfa(readCookie(c.req, MFA_COOKIE) ?? "", c.data.code ?? "");
  return redirectWithCookies(safeRedirect(r.next, "/app"), [sessionCookie(r.session.token, 14 * 86400), mfaCookie("", 0)]);
});
on("POST", "auth/forgot", (c) => {
  identity.requestPasswordReset(c.data.email ?? "");
  return redirect(withQuery("/forgot-password", { sent: "1" }));
});
on("POST", "auth/reset", (c) => {
  if ((c.data.password ?? "") !== (c.data.confirm ?? "")) throw new PlatformError("mismatch", "The two passwords don't match.");
  identity.resetPassword(c.data.token ?? "", c.data.password ?? "");
  return redirect(withQuery("/login", { notice: "Password changed. Sign in with your new password." }));
});
on("POST", "auth/verify-email", (c) => {
  identity.verifyEmail(c.data.token ?? "");
  return redirect(withQuery(c.user ? "/app" : "/login", { notice: "Email confirmed. Thank you." }));
});

/* ---------------- Language & region ---------------- */

on("POST", "prefs", (c) => {
  const cookies: string[] = [];
  const locale = isLocale(c.data.locale) ? c.data.locale : undefined;
  const region = isRegion(c.data.region) ? c.data.region : undefined;
  if (locale) cookies.push(prefCookie(LOCALE_COOKIE, locale));
  if (region) cookies.push(prefCookie(REGION_COOKIE, region));
  if (c.user) identity.setPreferences(c.user.id, { locale, region });
  // Return to the page the form was on.
  const ref = c.req.headers.get("referer");
  let from = "/";
  try {
    if (ref) {
      const u = new URL(ref);
      if (u.host === new URL(c.req.url).host) from = u.pathname + u.search;
    }
  } catch {
    /* keep "/" */
  }
  return redirectWithCookies(back(c, from), cookies);
});

/* ---------------- Account security & privacy ---------------- */

const SEC = "/app/security";
on("POST", "me/verification/resend", (c) => (identity.sendVerification(c.user!.id), redirect(withQuery(SEC, { notice: "We've sent a new confirmation link. Check your email." }))), "user");
on("POST", "me/password", (c) => {
  if ((c.data.next ?? "") !== (c.data.confirm ?? "")) throw new PlatformError("mismatch", "The two new passwords don't match.");
  identity.changePassword(c.user!.id, c.data.current ?? "", c.data.next ?? "");
  return redirect(withQuery(SEC, { notice: "Password changed." }));
}, "user");
on("POST", "me/mfa/setup", (c) => (identity.beginMfaSetup(c.user!.id), redirect(withQuery(SEC, { setup: "1" }))), "user");
on("POST", "me/mfa/confirm", (c) => (identity.confirmMfaSetup(c.user!.id, c.data.code ?? ""), redirect(withQuery(SEC, { notice: "Two-step sign-in is on." }))), "user");
on("POST", "me/mfa/disable", (c) => (identity.disableMfa(c.user!.id, c.data.password ?? "", c.data.code ?? ""), redirect(withQuery(SEC, { notice: "Two-step sign-in is off." }))), "user");
on("POST", "me/sessions/revoke-all", (c) => {
  identity.signOutEverywhere(c.user!.id);
  return redirectWithCookies(withQuery("/login", { notice: "Signed out on every device." }), [sessionCookie("", 0)]);
}, "user");
on("GET", "me/notifications", (c) => json({ unread: cx.unreadCount(c.user!.id), notifications: cx.notices(c.user!.id) }), "user");
on("POST", "me/notifications/read-all", (c) => (cx.markAllRead(c.user!.id), redirect(withQuery("/app/notifications", { notice: "All caught up." }))), "user");
on("POST", "me/notifications/:id/open", (c) => redirect(safeRedirect(cx.openNotice(c.user!.id, c.params.id), "/app")), "user");
on("GET", "me/export", (c) => {
  const data = privacy.exportData(c.user!.id);
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="scholarion-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
}, "user");
on("POST", "me/delete", (c) => {
  privacy.deleteAccount(c.user!.id, c.data.password ?? "", c.data.confirm ?? "");
  return redirectWithCookies(withQuery("/", { notice: "Your account and personal data were deleted." }), [sessionCookie("", 0)]);
}, "user");
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
    const roles = catalog.roles();
    const role = roles.includes(c.data.role ?? "") ? c.data.role : undefined;
    const hours = Math.min(40, Math.max(1, Math.round(Number(c.data.hoursPerWeek) || 5)));
    identity.saveOnboarding(c.user!.id, { goal: (c.data.goal ?? "").slice(0, 80), level: ["Beginner", "Intermediate", "Advanced"].includes(c.data.level ?? "") ? c.data.level! : "Beginner", role, topics: (c.data.topics ?? "").split(",").map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 10), hoursPerWeek: hours });
    if (c.data.recommendations !== undefined) recommend.setEnabled(c.user!.id, c.data.recommendations === "on" || c.data.recommendations === "true");
    return redirect(withQuery("/app", { notice: "Thanks — your recommendations now use your answers." }));
  },
  "user",
);

on("POST", "me/recommendations", (c) => {
  const on = c.data.enabled === "on" || c.data.enabled === "true";
  recommend.setEnabled(c.user!.id, on);
  return redirect(withQuery(back(c, "/app/account"), { notice: on ? "Personalised recommendations are on." : "Personalised recommendations are off. We won't suggest programs based on your answers or enrollments." }));
}, "user");

/* ---------------- My Learning: saved & completed ---------------- */

on("GET", "me/learning", (c) => json({ saved: library.saved(c.user!.id).map((s) => ({ slug: s.product.slug, title: s.product.title, savedAt: s.savedAt })), completed: library.completed(c.user!.id).map((x) => ({ slug: x.product.slug, title: x.product.title, completedAt: x.completedAt, credentialId: x.credentialId })) }), "user");
on("POST", "me/saved", (c) => {
  const p = library.save(c.user!.id, c.data.productId ?? "");
  return c.data.redirect || c.data.back ? redirect(withQuery(back(c, `/learn/${p.slug}`), { notice: `Saved. Find ${p.title} in My Learning.` })) : json({ saved: true });
}, "user");
on("POST", "me/saved/:productId/remove", (c) => {
  library.unsave(c.user!.id, c.params.productId);
  return c.data.redirect || c.data.back ? redirect(withQuery(back(c, "/app/courses"), { notice: "Removed from your saved list." })) : json({ saved: false });
}, "user");

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
      language: u.searchParams.get("language") || undefined,
      skills: list("skill"),
      duration: list("duration").filter((d): d is DurationBucket => d in DURATION_BUCKETS),
      subtitles: list("subtitles"),
      sort: (u.searchParams.get("sort") as never) || undefined,
    }),
  );
});
on("GET", "catalog/educators/:slug", (c) => {
  const e = catalog.educator(c.params.slug);
  if (!e) throw new PlatformError("not_found", "Educator not found", 404);
  return json({ name: e.name, slug: e.slug, bio: e.bio, qualifications: e.qualifications, credentials: e.credentials, products: e.products.map((p) => ({ slug: p.slug, title: p.title, type: p.type })) });
});
on("GET", "catalog/suggest", (c) => json({ suggestions: catalog.suggest(new URL(c.req.url).searchParams.get("q") ?? "") }));
on("GET", "catalog/products/:slug", (c) => {
  const p = catalog.get(c.params.slug);
  return p ? json({ product: p, modules: catalog.modules(p.id), courses: catalog.courses(p.id), nextSteps: catalog.nextSteps(p.id) }) : json({ error: { code: "not_found", message: "Not found" } }, 404);
});
on("GET", "catalog/pathways", () => json(catalog.pathway()));
on("GET", "commerce/offers/:slug", (c) => {
  const q = new URL(c.req.url).searchParams.get("region") ?? readCookie(c.req, REGION_COOKIE) ?? c.user?.region;
  const region = isRegion(q) ? q : "US";
  return json({ region, offers: commerce.offers(c.params.slug, region), plans: commerce.plansSummary(region) });
});

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
on("GET", "lms/items/:id/notes", (c) => json({ notes: library.notes(c.user!.id, c.params.id) }), "user");
on("POST", "lms/items/:id/notes", (c) => {
  const n = library.addNote(c.user!.id, c.params.id, { atSec: Number(c.data.atSec), text: c.data.text, kind: c.data.kind });
  return c.data.redirect ? redirect(withQuery(back(c, "/app"), { notice: n.kind === "bookmark" ? "Bookmark added." : "Note saved." })) : json({ note: n });
}, "user");
on("POST", "lms/notes/:id/delete", (c) => {
  library.deleteNote(c.user!.id, c.params.id);
  return c.data.redirect ? redirect(withQuery(back(c, "/app"), { notice: "Deleted." })) : json({ ok: true });
}, "user");
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
/** Guided project "Launch": opens the Cloud Lab for entitled learners (enrolls them on first launch). */
on("POST", "labs/launch", (c) => {
  const product = catalog.get(c.data.productId ?? "");
  if (!product) throw new PlatformError("not_found", "Project not found", 404);
  const item = catalog.items(product.id).find((i) => i.kind === "lab");
  if (!item) throw new PlatformError("not_found", "This project has no lab.", 404);
  const d = entitlements.check(c.user!.id, "lab.launch", product.id);
  if (!d.allow) return redirect(withQuery(`/learn/${product.slug}`, { enroll: "1", error: "Choose an access option to launch the Cloud Lab." }));
  if (!lms.enrollment(c.user!.id, item.courseId)) lms.enroll(c.user!.id, product.id, "full");
  cloudlab.launch(c.user!.id, item.id);
  return redirect(withQuery(`/app/course/${item.courseId}/item/${item.id}`, { notice: "Cloud Lab workspace ready. Your work saves as you go." }));
}, "user");
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
    const installments = plan === "live_seat" && c.data.installments === "3" ? 3 : undefined;
    // Price-book region: cookie, then the account's saved choice, then US.
    const cookieRegion = readCookie(c.req, REGION_COOKIE);
    const region = isRegion(cookieRegion) ? cookieRegion : isRegion(c.user!.region) ? c.user!.region : "US";
    const cs = commerce.createCheckout({ userId: c.user!.id, plan, productId: product?.id ?? null, installments, region, idempotencyKey: c.data.idempotencyKey || `${c.user!.id}:${plan}:${product?.id ?? "plus"}:${installments ?? 1}:${region}:${new Date().toISOString().slice(0, 13)}` });
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
on("POST", "commerce/checkout-sessions/:id/coupon", (c) => {
  try {
    if (c.data.remove === "1") commerce.removeCoupon(c.params.id, c.user!.id);
    else commerce.applyCoupon(c.params.id, c.user!.id, c.data.code ?? "");
  } catch (err) {
    if (err instanceof PlatformError) return redirect(withQuery(`/checkout/${c.params.id}`, { error: err.message }));
    throw err;
  }
  return redirect(withQuery(`/checkout/${c.params.id}`, { notice: c.data.remove === "1" ? "Code removed." : "Code applied to today's payment (sandbox)." }));
}, "user");
const CHANGE_TARGETS: PlanChangeTarget[] = ["plus_monthly", "program_monthly", "plus_annual"];
on("GET", "commerce/subscriptions/:id/quote", (c) => {
  const to = new URL(c.req.url).searchParams.get("to") as PlanChangeTarget;
  if (!CHANGE_TARGETS.includes(to)) throw new PlatformError("invalid_plan", "Choose a plan.");
  return json({ quote: commerce.quoteChange(c.params.id, c.user!.id, to) });
}, "user");
on("POST", "commerce/subscriptions/:id/change", (c) => {
  const to = c.data.to as PlanChangeTarget;
  if (!CHANGE_TARGETS.includes(to)) throw new PlatformError("invalid_plan", "Choose a plan.");
  const { subscription, quote } = commerce.changePlan(c.params.id, c.user!.id, to, c.data.productId || null);
  if (subscription.productId) lms.enroll(c.user!.id, subscription.productId, "full");
  return redirect(withQuery("/app/account", { notice: `Plan changed (sandbox). Charged today: ${formatMoney(quote.chargeToday, quote.currency)}${quote.creditToNextBill ? `; ${formatMoney(quote.creditToNextBill, quote.currency)} credit on your next bill` : ""}. The invoice is under Receipts.` }));
}, "user");
on("GET", "commerce/orders/:id/invoice", async (c) => {
  const order = getDb().orders.find((o) => o.id === c.params.id);
  if (!order || (order.userId !== c.user!.id && !identity.hasRole(c.user!, "support_agent", "platform_admin"))) throw new PlatformError("not_found", "Order not found", 404);
  const buyer = identity.getUser(order.userId);
  const input = { order, buyerName: buyer?.name ?? "Learner", buyerEmail: buyer?.email ?? "" };
  const pdf = await invoicePdf(input);
  return attachDoc(new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="scholarion-receipt-${order.id}.pdf"`, "cache-control": "private, no-store" } }), invoiceDoc(input));
}, "user");
on("POST", "commerce/orders/:id/refund", (c) => {
  commerce.requestOrderRefund(c.params.id, c.user!.id, c.data.reason ?? "");
  return redirect(withQuery("/app/account", { notice: "Refund request sent. A person reviews it and we'll email you the decision." }));
}, "user");
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
on("GET", "credentials/:id/pdf", async (c) => {
  const cred = credentials.get(c.params.id);
  // The PDF is for the holder (and staff); employers use the public verification page.
  if (!cred || (cred.userId !== c.user!.id && !identity.hasRole(c.user!, "support_agent"))) throw new PlatformError("not_found", "Credential not found", 404);
  if (cred.revokedAt) throw new PlatformError("revoked", "This credential was revoked, so there's no certificate to download.", 410);
  const product = catalog.get(cred.productId);
  const certDoc = {
    title: cred.title,
    subtitle: `${product?.credential.kind === "badge" ? "Badge" : "Certificate"} · Scholarion Academy`,
    footer: `Credential ${cred.id}`,
    blocks: [
      { t: "table" as const, caption: "Credential", head: ["Field", "Value"], rows: [["Awarded to", cred.holderName], ["Achievement", cred.title], ["Program", product?.title ?? cred.title], ["Issued", new Date(cred.issuedAt).toISOString().slice(0, 10)], ["Credential ID", cred.id], ["Verify at", credentials.verifyUrl(cred.id)], ...(product?.hours ? [["Learning hours", String(product.hours)]] : [])] },
      { t: "p" as const, small: true, text: "Non-credit credential issued by Scholarion Academy. Anyone can confirm it at the verification link." },
    ],
  };
  const pdf = await certificatePdf({
    id: cred.id,
    holderName: cred.holderName,
    title: cred.title,
    programTitle: product?.title ?? cred.title,
    kind: product?.credential.kind === "badge" ? "badge" : "certificate",
    issuedAt: cred.issuedAt,
    verifyUrl: credentials.verifyUrl(cred.id),
    hours: product?.hours,
  });
  const file = `scholarion-${(product?.slug ?? cred.id).slice(0, 60)}-${cred.id}.pdf`;
  return attachDoc(new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${file}"`, "cache-control": "private, no-store" } }), certDoc);
}, "user");
on("GET", "credentials/issuer-key", () => json(credentials.publicJwk()));

/* ---------------- Course builder (instructors) ---------------- */

const T = (id: string) => `/teach/${id}`;
const TI = (courseId: string, itemId: string) => `/teach/${courseId}/item/${itemId}`;
const itemCourse = (itemId: string) => getDb().items.find((i) => i.id === itemId)?.courseId ?? "";
on("POST", "teach/courses", (c) => {
  const p = authoring.createCourse(c.user!.id, { title: c.data.title ?? "", tagline: c.data.tagline, level: c.data.level, description: c.data.description, skills: c.data.skills });
  return redirect(withQuery(T(p.id), { notice: "Draft created. Add modules and items, then submit it for review." }));
}, "staff");
on("POST", "teach/courses/:id", (c) => (authoring.updateCourse(c.user!.id, c.params.id, c.data), redirect(withQuery(T(c.params.id), { notice: "Course details saved." }))), "staff");
on("POST", "teach/courses/:id/modules", (c) => (authoring.addModule(c.user!.id, c.params.id, { title: c.data.title ?? "", overview: c.data.overview, objectives: c.data.objectives }), redirect(withQuery(T(c.params.id), { notice: "Module added." }) + "#modules")), "staff");
on("POST", "teach/courses/:id/modules/:no", (c) => (authoring.updateModule(c.user!.id, c.params.id, Number(c.params.no), c.data), redirect(withQuery(T(c.params.id), { notice: "Module saved." }) + "#modules")), "staff");
on("POST", "teach/courses/:id/modules/:no/delete", (c) => (authoring.deleteModule(c.user!.id, c.params.id, Number(c.params.no)), redirect(withQuery(T(c.params.id), { notice: "Module deleted." }) + "#modules")), "staff");
on("POST", "teach/courses/:id/items", (c) => {
  const it = authoring.addItem(c.user!.id, c.params.id, Number(c.data.moduleNo), c.data.kind ?? "", c.data.title ?? "");
  return redirect(withQuery(TI(c.params.id, it.id), { notice: "Item added. Fill it in below." }));
}, "staff");
on("POST", "teach/courses/:id/submit", (c) => (authoring.submitForReview(c.user!.id, c.params.id), redirect(withQuery(T(c.params.id), { notice: "Submitted for review. A reviewer will publish it or ask for changes." }))), "staff");
on("POST", "teach/courses/:id/withdraw", (c) => (authoring.withdraw(c.user!.id, c.params.id), redirect(withQuery(T(c.params.id), { notice: "Withdrawn from review. You can edit again." }))), "staff");
on("GET", "teach/courses/:id/checklist", (c) => json({ issues: authoring.checklist(c.user!.id, c.params.id) }), "staff");
on("POST", "teach/items/:id", (c) => {
  const it = authoring.updateItem(c.user!.id, c.params.id, c.data);
  return redirect(withQuery(TI(it.courseId, it.id), { notice: "Saved." }));
}, "staff");
on("POST", "teach/items/:id/move", (c) => {
  const course = itemCourse(c.params.id);
  authoring.moveItem(c.user!.id, c.params.id, c.data.dir === "up" ? "up" : "down");
  return redirect(T(course) + "#modules");
}, "staff");
on("POST", "teach/items/:id/delete", (c) => {
  const course = itemCourse(c.params.id);
  authoring.deleteItem(c.user!.id, c.params.id);
  return redirect(withQuery(T(course), { notice: "Item deleted." }) + "#modules");
}, "staff");
on("POST", "teach/items/:id/questions", (c) => {
  authoring.addQuestion(c.user!.id, c.params.id, { prompt: c.data.prompt ?? "", options: c.data.options ?? "", answer: c.data.answer ?? "", explanation: c.data.explanation ?? "" });
  return redirect(withQuery(TI(itemCourse(c.params.id), c.params.id), { notice: "Question added." }) + "#questions");
}, "staff");
on("POST", "teach/items/:id/questions/:qid/delete", (c) => (authoring.removeQuestion(c.user!.id, c.params.id, c.params.qid), redirect(withQuery(TI(itemCourse(c.params.id), c.params.id), { notice: "Question removed." }) + "#questions")), "staff");
on("POST", "teach/items/:id/tests", (c) => {
  authoring.addTest(c.user!.id, c.params.id, { name: c.data.name ?? "", code: c.data.code ?? "", points: c.data.points ?? "5" });
  return redirect(withQuery(TI(itemCourse(c.params.id), c.params.id), { notice: "Test added. Run it against your solution." }) + "#tests");
}, "staff");
on("POST", "teach/items/:id/tests/:idx/delete", (c) => (authoring.removeTest(c.user!.id, c.params.id, Number(c.params.idx)), redirect(withQuery(TI(itemCourse(c.params.id), c.params.id), { notice: "Test removed." }) + "#tests")), "staff");
on("POST", "teach/items/:id/verify", (c) => {
  const r = authoring.verifyLab(c.user!.id, c.params.id);
  const to = TI(itemCourse(c.params.id), c.params.id);
  if (!r.ran) return redirect(withQuery(to, { error: r.error ?? "The lab runner isn't connected here." }) + "#tests");
  const failed = r.feedback.filter((f) => !f.passed).map((f) => f.name);
  return redirect(withQuery(to, failed.length ? { error: `Your solution scored ${r.score}/${r.max}. Failing: ${failed.join(", ")}${r.error ? ` (${r.error})` : ""}` } : { notice: `All tests pass: ${r.score}/${r.max}.` }) + "#tests");
}, "staff");
on("POST", "admin/course-reviews/:id/:decision", (c) => {
  const d = c.params.decision === "approve" ? "approve" : c.params.decision === "changes" ? "changes" : null;
  if (!d) throw new PlatformError("not_found", "Unknown decision", 404);
  const p = authoring.decide(c.user!.id, c.params.id, d, c.data.note);
  return redirect(withQuery("/admin/course-reviews", { notice: d === "approve" ? `${p.title} is published.` : "Changes requested. The author has been emailed." }));
}, "reviewer");

/* ---------------- Blog (staff) ---------------- */

on("POST", "admin/blog", (c) => {
  const hubs = Object.keys(c.data).filter((k) => k.startsWith("hub_") && c.data[k] === "on").map((k) => k.slice(4));
  try {
    const a = content.saveArticle(c.user!.id, { id: c.data.id || undefined, title: c.data.title ?? "", summary: c.data.summary ?? "", body: c.data.body ?? "", tags: c.data.tags, hubs, sources: c.data.sources });
    return redirect(withQuery(`/admin/blog/${a.id}`, { notice: c.data.id ? "Saved." : "Draft created." }));
  } catch (err) {
    if (err instanceof PlatformError && err.code === "claims" && c.data.id) return redirect(withQuery(`/admin/blog/${c.data.id}`, { error: err.message }));
    throw err;
  }
}, "staff");
on("POST", "admin/blog/:id/publish", (c) => {
  const a = content.publishArticle(c.user!.id, c.params.id);
  return redirect(withQuery(`/admin/blog/${a.id}`, { notice: "Published." }));
}, "staff");
on("POST", "admin/blog/:id/unpublish", (c) => (content.unpublishArticle(c.user!.id, c.params.id), redirect(withQuery(`/admin/blog/${c.params.id}`, { notice: "Moved back to draft." }))), "staff");
on("GET", "content/articles", () => json({ articles: content.articles().map(({ body: _b, authorId: _a, ...a }) => (void _b, void _a, a)) }));

/* ---------------- Verified reviews ---------------- */

const productPath = (productId: string) => `/learn/${catalog.get(productId)?.slug ?? ""}`;
on("GET", "catalog/products/:slug/reviews", (c) => {
  const p = catalog.get(c.params.slug);
  if (!p) throw new PlatformError("not_found", "Program not found", 404);
  const q = new URL(c.req.url).searchParams.get("sort") ?? "";
  const sort = (["recent", "highest", "lowest"].includes(q) ? q : "recent") as "recent" | "highest" | "lowest";
  return json({ summary: reviews.summary(p.id), reviews: reviews.forProduct(p.id, c.user?.id ?? null, sort) });
});
on("POST", "reviews", (c) => {
  const r = reviews.submit(c.user!.id, { productId: c.data.productId ?? "", rating: Number(c.data.rating), title: c.data.title ?? "", body: c.data.body ?? "" });
  const notice = r.status === "published" ? "Thanks — your review is live." : "Thanks — your review will appear after a quick check by our team.";
  return redirect(withQuery(productPath(r.productId), { notice }) + "#reviews");
}, "user");
on("POST", "reviews/:id/delete", (c) => {
  const r = getDb().reviews.find((x) => x.id === c.params.id);
  reviews.remove(c.user!.id, c.params.id);
  return redirect(withQuery(back(c, r ? productPath(r.productId) : "/app"), { notice: "Your review was removed." }));
}, "user");
on("POST", "reviews/:id/report", (c) => {
  const r = reviews.report(c.params.id, c.user!.id);
  return redirect(withQuery(back(c, productPath(r.productId)), { notice: "Thanks — our team will take a look." }));
}, "user");
on("POST", "admin/reviews/:id/:action", (c) => {
  const action = c.params.action as "publish" | "hide";
  if (!["publish", "hide"].includes(action)) throw new PlatformError("not_found", "Unknown action", 404);
  reviews.moderate(c.params.id, c.user!.id, action, c.data.note);
  return redirect(withQuery(back(c, "/admin/moderation"), { notice: action === "publish" ? "Review published." : "Review hidden." }));
}, "staff");

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

/* ---------------- Teams & organizations ---------------- */

const orgBack = (id: string) => `/org/${id}`;
on(
  "POST",
  "teams/orgs",
  (c) => {
    const o = teams.purchase({ adminId: c.user!.id, name: c.data.name ?? "", seats: Number(c.data.seats), domain: c.data.domain || null, ssoEnabled: c.data.sso === "on" });
    return redirect(withQuery(orgBack(o.id), { notice: `${o.name} is set up with ${o.seats} seats (sandbox). Assign a program, then invite your people.` }));
  },
  "user",
);
on(
  "POST",
  "teams/orgs/:id/invites",
  (c) => {
    const r = teams.invite(c.params.id, c.user!.id, c.data.emails ?? "");
    const parts = [`${r.created.length} invitation${r.created.length === 1 ? "" : "s"} sent.`];
    if (r.skipped.length) parts.push(`Skipped: ${r.skipped.join("; ")}.`);
    return redirect(withQuery(orgBack(c.params.id), { notice: parts.join(" ") }));
  },
  "user",
);
on("POST", "teams/orgs/:id/invites/:token/revoke", (c) => (teams.revokeInvite(c.params.id, c.user!.id, c.params.token), redirect(withQuery(orgBack(c.params.id), { notice: "Invitation cancelled." }))), "user");
on(
  "POST",
  "teams/orgs/:id/programs",
  (c) => {
    const p = catalog.get(c.data.productId ?? "");
    teams.assignProgram(c.params.id, c.user!.id, p?.id ?? "");
    return redirect(withQuery(orgBack(c.params.id), { notice: `${p?.title} added. Every member now has access and is enrolled.` }));
  },
  "user",
);
on("POST", "teams/orgs/:id/programs/:pid/remove", (c) => (teams.unassignProgram(c.params.id, c.user!.id, c.params.pid), redirect(withQuery(orgBack(c.params.id), { notice: "Program removed. Members keep their progress and any credentials they earned." }))), "user");
on("POST", "teams/orgs/:id/seats", (c) => {
  const o = teams.addSeats(c.params.id, c.user!.id, Number(c.data.extra));
  return redirect(withQuery(orgBack(c.params.id), { notice: `You now have ${o.seats} seats (sandbox order recorded).` }));
}, "user");
on("POST", "teams/orgs/:id/sso", (c) => {
  const o = teams.updateSso(c.params.id, c.user!.id, c.data.domain || null, c.data.enabled === "on");
  return redirect(withQuery(orgBack(c.params.id), { notice: o.ssoEnabled ? `Anyone signing in with an @${o.domain} address can now take a seat.` : "Organization sign-in is off. People join by invitation only." }));
}, "user");
on("POST", "teams/orgs/:id/members/:userId/revoke", (c) => (teams.revokeSeat(c.params.id, c.user!.id, c.params.userId), redirect(withQuery(orgBack(c.params.id), { notice: "Seat freed. The learner keeps their progress and credentials." }))), "user");
on("GET", "teams/orgs/:id/report.csv", (c) => {
  if (!c.user) throw new PlatformError("not_signed_in", "Sign in to download reports.", 401);
  const csv = teams.reportCsv(c.params.id, c.user.id);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="scholarion-${c.params.id}-progress.csv"`, "cache-control": "no-store" } });
});
on("POST", "teams/invites/:token/accept", (c) => {
  const o = teams.acceptInvite(c.params.token, c.user!.id);
  return redirect(withQuery("/app", { notice: `Welcome to ${o.name} on Scholarion. Your organization's programs are below.` }));
}, "user");
on("POST", "teams/orgs/:id/sso-join", (c) => {
  const o = teams.joinViaSso(c.params.id, c.user!.id);
  return redirect(withQuery("/app", { notice: `Signed in with ${o.name}. Your organization's programs are below.` }));
}, "user");

/* ---------------- Live admissions ---------------- */

on("POST", "live/applications", (c) => {
  const p = catalog.get(c.data.productId ?? "");
  if (!p) throw new PlatformError("not_found", "Program not found", 404);
  admissions.apply({ userId: c.user!.id, productId: p.id, experience: c.data.experience ?? "", motivation: c.data.motivation ?? "" });
  return redirect(withQuery(`/learn/${p.slug}/apply`, { notice: "Application sent. We'll email you a decision." }));
}, "user");
on("POST", "live/applications/:id/withdraw", (c) => {
  const a = admissions.withdraw(c.params.id, c.user!.id);
  return redirect(withQuery(`/learn/${catalog.get(a.productId)?.slug}/apply`, { notice: "Application withdrawn." }));
}, "user");
on("POST", "live/applications/:id/onboard", (c) => {
  admissions.onboard(c.params.id, c.user!.id, c.data.ack === "on");
  return redirect(withQuery("/app/live", { notice: "You're onboarded. See you at the first session." }));
}, "user");
on("POST", "admin/admissions/:id/decide", (c) => {
  const decision = c.data.decision as "accepted" | "waitlisted" | "declined";
  if (!["accepted", "waitlisted", "declined"].includes(decision)) throw new PlatformError("invalid", "Choose a decision.");
  admissions.decide(c.params.id, c.user!.id, decision, c.data.note ?? "");
  return redirect(withQuery("/admin/admissions", { notice: `Applicant ${decision}. They've been emailed.` }));
}, "reviewer");

/* ---------------- Community & peer review ---------------- */

on("POST", "community/posts", (c) => {
  community.post({ userId: c.user!.id, itemId: c.data.itemId ?? "", body: c.data.body ?? "", parentId: c.data.parentId || null });
  return redirect(withQuery(back(c, "/app"), { notice: "Posted." }));
}, "user");
on("POST", "community/posts/:id/report", (c) => (community.report(c.params.id, c.user!.id), redirect(withQuery(back(c, "/app"), { notice: "Thanks — course staff will review this post." }))), "user");
on("POST", "admin/community/posts/:id/:action", (c) => {
  const action = c.params.action as "hide" | "restore" | "dismiss";
  if (!["hide", "restore", "dismiss"].includes(action)) throw new PlatformError("not_found", "Unknown action", 404);
  community.moderate(c.params.id, c.user!.id, action);
  return redirect(withQuery(back(c, "/admin/moderation"), { notice: action === "hide" ? "Post hidden." : action === "restore" ? "Post restored." : "Reports dismissed." }));
}, "staff");
on("POST", "lms/peer-reviews", (c) => {
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.data)) if (k.startsWith("score:")) scores[k.slice(6)] = Number(v);
  lms.submitPeerReview({ reviewerId: c.user!.id, submissionId: c.data.submissionId ?? "", scores, comment: c.data.comment ?? "" });
  return redirect(withQuery(back(c, "/app"), { notice: "Review submitted. Thank you — your feedback goes to your classmate anonymously." }));
}, "user");

/* ---------------- Admin / staff ---------------- */

on("GET", "status", () => json({ capabilities: capabilities() }));
on(
  "POST",
  "admin/clock",
  (c) => {
    const days = Math.max(0, Math.min(400, Number(c.data.days) || 0));
    getDb().clockOffsetMs += days * DAY;
    const r = tickAll();
    return redirect(withQuery("/admin", { notice: `Sandbox clock +${days} days. Reminders ${r.commerce.reminders}, renewal notices ${r.commerce.renewalNotices}, conversions ${r.commerce.converted}, renewals ${r.commerce.renewed}, expiries ${r.commerce.expired}, deadline notices ${r.lms}, live reminders ${r.live}.` }));
  },
  "admin",
);
/* ---------------- Commerce admin (sandbox; platform admins) ---------------- */

const CA = "/admin/commerce";
on("POST", "admin/commerce/settings", (c) => (commerce.updateSettings(c.user!.id, c.data), redirect(withQuery(CA, { notice: "Sandbox price book and billing settings saved. New checkouts use them." }))), "admin");
on("POST", "admin/commerce/coupons", (c) => {
  const k = commerce.createCoupon(c.user!.id, { code: c.data.code ?? "", percentOff: Number(c.data.percentOff), expiresInDays: c.data.expiresInDays ? Number(c.data.expiresInDays) : null, maxRedemptions: c.data.maxRedemptions ? Number(c.data.maxRedemptions) : null });
  return redirect(withQuery(CA, { notice: `Code ${k.code} created (${k.percentOff}% off today's payment).` }) + "#coupons");
}, "admin");
on("POST", "admin/commerce/coupons/:code/expire", (c) => (commerce.expireCoupon(c.params.code), redirect(withQuery(CA, { notice: `Code ${c.params.code.toUpperCase()} expired.` }) + "#coupons")), "admin");
on("POST", "admin/commerce/refunds/:id/:decision", (c) => {
  const d = c.params.decision === "approve" ? "approved" : c.params.decision === "deny" ? "denied" : null;
  if (!d) throw new PlatformError("not_found", "Unknown decision", 404);
  commerce.decideRefund(c.params.id, c.user!.id, d, c.data.note ?? "");
  return redirect(withQuery(CA, { notice: d === "approved" ? "Refund approved (sandbox). Access from that order has ended and the learner was emailed." : "Refund denied. The learner was emailed." }) + "#refunds");
}, "admin");
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

/** Every download can be fetched as PDF, Word or Excel (?format=pdf|docx|xlsx). */
export async function handleApi(req: Request, path: string): Promise<Response> {
  const res = await handleApiInner(req, path);
  try {
    return await officeResponse(req, res, path.split("/").filter(Boolean).slice(-1)[0] ?? "document");
  } catch (e) {
    return json({ error: { code: "conversion_failed", message: `The document couldn't be converted: ${(e as Error).message}` } }, 500);
  }
}

async function handleApiInner(req: Request, path: string): Promise<Response> {
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
      if (need.length && identity.needsMfaSetup(ctx.user)) {
        if (method !== "GET" && (data.redirect || data.back || !req.headers.get("content-type")?.includes("json"))) return redirect(withQuery("/app/security", { required: "1" }));
        return json({ error: { code: "mfa_required", message: "Turn on two-step sign-in to use admin tools." } }, 403);
      }
    }
    return await route.handler(ctx);
  } catch (err) {
    return errorResponse(req, err, backTo);
  }
}
