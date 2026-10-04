#!/usr/bin/env node
/**
 * Anonymous smoke test for a HavenConnect deployment.
 *   node scripts/staging-smoke.mjs https://havenconnect-stage.oakhavensuites.com
 * Checks that the login screen is served, that it is marked staging and noindex, that private APIs refuse
 * anonymous callers, and that the inbound API rejects unsigned messages. It never signs in or writes data.
 */
const base = (process.argv[2] || process.env.HAVEN_STAGE_URL || "https://havenconnect-stage.oakhavensuites.com").replace(/\/+$/, "");
const results = [];
const check = async (name, fn) => { try { const note = await fn(); results.push([true, name, note || ""]); } catch (e) { results.push([false, name, e.message]); } };
const get = (path, init) => fetch(base + path, { redirect: "manual", ...init });

await check("HTTPS certificate and home page respond", async () => { const r = await get("/"); if (r.status !== 200) throw new Error(`status ${r.status}`); return "200"; });
await check("Anonymous visitors see the HavenConnect login screen", async () => {
  const html = await (await get("/")).text();
  if (!html.includes("hc-login")) throw new Error("login screen markup not found (is a hosting access policy intercepting first? that's fine, re-run from an allowed network)");
  if (!html.includes("/signin-with-chatgpt?return_to=")) throw new Error("sign-in link not found");
  return "sign-in link present";
});
await check("Staging badge and noindex are present", async () => {
  const html = await (await get("/")).text();
  if (!html.includes("Staging environment")) throw new Error("staging badge missing: set HAVEN_ENVIRONMENT=staging or use the havenconnect-stage host");
  if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) throw new Error("robots noindex meta missing");
  return "badge + noindex";
});
await check("Sign-in route is handled by the host", async () => { const r = await get("/signin-with-chatgpt?return_to=%2F"); if (![302, 303, 307].includes(r.status)) throw new Error(`expected a redirect, got ${r.status}: enable Sign in with ChatGPT for this site`); return `${r.status} → ${new URL(r.headers.get("location") || "", base).host}`; });
await check("Agentic AI API refuses anonymous callers", async () => { const r = await get("/api/agentic-ai"); if (r.status !== 401 && r.status !== 403) throw new Error(`status ${r.status}`); return String(r.status); });
await check("Inbound API rejects an unsigned message", async () => {
  const r = await get("/api/agentic-ai/inbound", { method: "POST", headers: { "content-type": "application/json", "x-haven-app": "havenup", "x-haven-timestamp": String(Math.floor(Date.now() / 1000)), "x-haven-signature": "sha256=00" }, body: JSON.stringify({ externalId: "smoke", text: "smoke test" }) });
  if (r.status === 401) return "401 invalid signature";
  if (r.status === 503) return "503 inbound not enabled for HavenUP (expected until HAVEN_INBOUND_SECRET_HAVENUP is set)";
  throw new Error(`status ${r.status}`);
});

for (const [ok, name, note] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? `  (${note})` : ""}`);
const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} passed against ${base}`);
process.exit(failed ? 1 : 0);
