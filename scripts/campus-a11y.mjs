/**
 * Accessibility gate (LMS parity acceptance 15): runs axe-core (WCAG 2.0/2.1/2.2 A + AA rules)
 * in Chromium against the rendered campus screens. Fails on serious or critical violations.
 * Run after `npm run campus:render`. Needs the `playwright` and `axe-core` dev dependencies
 * and a Chromium build (`npx playwright install chromium`).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium, axeSource;
try {
  ({ chromium } = await import("playwright"));
  axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch (e) {
  console.error("campus-a11y: playwright or axe-core isn't installed —", e.message);
  process.exit(2);
}

const DIR = path.join(process.cwd(), "preview", "campus");
const KEY = [/dashboard/, /modules/, /grades\.html$/, /grader/, /quizzes-qz-demo-w1/, /catalog/, /signin/, /t-tenant-admin/, /t-registration/, /tutor/];
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".html") && f !== "index.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let failed = 0;
const summary = [];
const tally = new Map();
for (const f of files) {
  await page.goto("file://" + path.join(DIR, f));
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  });
  const bad = res.filter((v) => v.impact === "serious" || v.impact === "critical");
  const key = KEY.some((k) => k.test(f));
  summary.push(`${bad.length ? "FAIL" : "ok"} ${f}${key ? " (key screen)" : ""}${bad.length ? ": " + bad.map((v) => `${v.id} [${v.impact}] ${v.nodes.join(", ")}`).join("; ") : ""}`);
  if (bad.length) failed++;
  for (const v of bad) for (const n of v.nodes) tally.set(`${v.id} [${v.impact}] ${n.replace(/:nth-child\(\d+\)/g, "")}`, (tally.get(`${v.id} [${v.impact}] ${n.replace(/:nth-child\(\d+\)/g, "")}`) ?? 0) + 1);
}
await browser.close();
console.log(summary.join("\n"));
if (tally.size) console.log("Distinct violations:\n" + [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v}× ${k}`).join("\n"));
console.log(`axe: ${files.length - failed}/${files.length} screens without serious or critical violations`);
process.exit(failed ? 1 : 0);
