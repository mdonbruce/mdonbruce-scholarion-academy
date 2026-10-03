import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handleApi } from "../src/bff/api";
import { fresh } from "./helpers";

/** BFF router tests over real Request/Response objects (no Next.js needed). */

const BASE = "http://localhost:3000";

async function call(method: string, path: string, opts: { form?: Record<string, string>; json?: unknown; cookie?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000" };
  let bodyInit: BodyInit | undefined;
  if (opts.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    bodyInit = new URLSearchParams(opts.form).toString();
  } else if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    bodyInit = JSON.stringify(opts.json);
  }
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  return handleApi(new Request(`${BASE}/api/v1/${path}`, { method, headers, body: bodyInit }), path.split("?")[0]);
}

async function signIn(email = "amara@demo.scholarion.test", password = "LearnEarnBuild1") {
  const res = await call("POST", "auth/signin", { form: { email, password } });
  assert.equal(res.status, 303);
  const cookie = res.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return cookie.split(";")[0];
}

beforeEach(() => fresh());

describe("BFF router", () => {
  it("serves faceted search to anonymous visitors", async () => {
    const res = await call("GET", "catalog/products?q=agentic%20ai&free=1&level=Beginner");
    const data = (await res.json()) as { items: { slug: string }[] };
    assert.ok(data.items.some((p) => p.slug === "agentic-ai-foundations"));
  });

  it("returns 404 for the hidden degrees product", async () => {
    assert.equal((await call("GET", "catalog/products/degrees")).status, 404);
  });

  it("requires sign-in for learner APIs and redirects form posts to login", async () => {
    assert.equal((await call("POST", "lms/attempts", { json: { itemId: "x" } })).status, 401);
    const r = await call("POST", "lms/enrollments", { form: { productId: "agentic-ai-foundations", level: "audit", redirect: "/learn/agentic-ai-foundations" } });
    assert.equal(r.status, 303);
    assert.match(r.headers.get("location")!, /^\/login\?next=/);
  });

  it("blocks cross-site POSTs", async () => {
    const r = await call("POST", "cx/chat", { json: { message: "hi" }, origin: "https://evil.example" });
    assert.equal(r.status, 403);
  });

  it("never returns quiz answers to the browser", async () => {
    const cookie = await signIn();
    const r = await call("POST", "lms/attempts", { json: { itemId: "itm_cop1047c_m5_quiz" }, cookie });
    const text = await r.text();
    assert.equal(r.status, 200);
    assert.ok(!text.includes('"answer"'));
  });

  it("refuses open redirects after sign-in", async () => {
    const r = await call("POST", "auth/signin", { form: { email: "amara@demo.scholarion.test", password: "LearnEarnBuild1", redirect: "//evil.example/x" } });
    assert.equal(r.headers.get("location"), "/app");
  });

  it("runs a full audit → checkout → lab flow", async () => {
    const signup = await call("POST", "auth/signup", { form: { name: "New Learner", email: "new@example.com", password: "long-enough-pass", acceptTerms: "on" } });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    await call("POST", "lms/enrollments", { form: { productId: "python-programming-cop1047c", level: "audit" }, cookie });
    const locked = await call("POST", "labs/sessions", { json: { itemId: "itm_cop1047c_m1_lab" }, cookie });
    assert.equal(locked.status, 403);
    assert.equal(((await locked.json()) as { error: { code: string } }).error.code, "needs_upgrade");

    const co = await call("POST", "commerce/checkout-sessions", { form: { plan: "plus_monthly" }, cookie });
    const csId = co.headers.get("location")!.split("/").pop()!;
    await call("POST", `commerce/checkout-sessions/${csId}/confirm`, { form: {}, cookie });
    const lab = await call("POST", "labs/sessions", { json: { itemId: "itm_cop1047c_m1_lab" }, cookie });
    const { session } = (await lab.json()) as { session: { id: string } };
    const graded = await call("POST", `labs/sessions/${session.id}/grade`, { json: { code: "def greet(name):\n    return f'Hello, {name}!'\n" }, cookie });
    const g = (await graded.json()) as { score: number; max: number };
    assert.equal(g.score, g.max);
  });

  it("restricts admin routes by role", async () => {
    const cookie = await signIn();
    assert.equal((await call("POST", "admin/clock", { form: { days: "1" }, cookie })).status, 403);
    const admin = await signIn("admin@demo.scholarion.test", "ScholarionAdmin1");
    assert.equal((await call("POST", "admin/clock", { form: { days: "1" }, cookie: admin })).status, 303);
  });

  it("verifies credentials publicly", async () => {
    const r = await call("GET", "credentials/verify/crd_missing");
    assert.equal(((await r.json()) as { status: string }).status, "not_found");
  });
});
