import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/** Naming migration: the platform is Scholarion; legacy names must not appear anywhere we ship. */
const FORBIDDEN = [["Oak", "Haven"].join(""), ["Scholaris", "Global", "Learning"].join(" "), ["TechDev", "University"].join(" "), ["Dev", "Tech"].join("") + " ("];
const ROOTS = ["src", "docs", "scripts", "db", "contracts", "tests", "public", "README.md"];

function walk(p: string, out: string[] = []): string[] {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (/\.(ts|tsx|mjs|js|md|sql|json|proto|css|html|txt|webmanifest)$/.test(p)) out.push(p);
    return out;
  }
  for (const f of fs.readdirSync(p)) if (!["node_modules", ".next", "preview"].includes(f)) walk(path.join(p, f), out);
  return out;
}

describe("Naming migration", () => {
  it("no legacy platform or tenant names in code, docs, data or contracts", () => {
    const hits: string[] = [];
    for (const f of ROOTS.flatMap((r) => walk(r))) {
      const text = fs.readFileSync(f, "utf8");
      for (const n of FORBIDDEN) if (text.toLowerCase().includes(n.toLowerCase())) hits.push(`${f}: ${n}`);
    }
    assert.deepEqual(hits, []);
  });
});
