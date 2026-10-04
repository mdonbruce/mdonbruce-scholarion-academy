import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

/** Renders every campus tab and key flow as seeded users; fails on any render error. */
describe("Campus UI renders", () => {
  it("renders all tabs and flows without errors", () => {
    const out = execFileSync("npx", ["--no-install", "tsx", "--tsconfig", "tsconfig.scripts.json", "scripts/campus-render.tsx", "--check"], { env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8", timeout: 240_000 });
    const m = /rendered (\d+) screens/.exec(out);
    assert.ok(m && Number(m[1]) >= 90, out);
  });
});
