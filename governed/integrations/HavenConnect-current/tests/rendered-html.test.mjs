import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

// The signed-in page imports Cloudflare bindings and must run in workerd;
// Node cannot invoke the generated Worker entrypoint directly.
test("build includes the branded sign-in surface and logo", async () => {
  const bundle = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(bundle, /HavenConnect Agentic AI \| Haven Digital Systems/);
  assert.match(bundle, /Sign in with ChatGPT/);
  assert.match(bundle, /Enter HavenConnect/);
  assert.match(bundle, /Use another account/);
  assert.match(bundle, /hc-login/);
  assert.ok((await stat(new URL("../dist/client/havenconnect-logo.png", import.meta.url))).size > 0);
});
