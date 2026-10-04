import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { freshCampus, storeOf } from "./campus-helpers";
import * as prog from "../src/campus/services/programs";
import * as hub from "../src/campus/services/hub";
import { PROGRAMS_3 } from "../src/campus/academy/programs-data-3";
import type { ProgramSpec } from "../src/campus/academy/programs-data";

/** Scholaris AI Academy certificate programs #2–#11. */

const NUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const off = (n: number) => `off_academy_${n}`;
const specOf = (n: number) => storeOf("academy").list("program_pages", (p) => p.offeringId === off(n))[0].spec as ProgramSpec;
const courseIds = (n: number) => {
  const o = storeOf("academy").get("offerings", off(n))!;
  return [String(o.courseId), ...((o.blockCourseIds as string[] | undefined) ?? [])];
};

describe("Academy certificate programs #2–#11", () => {
  before(() => {
    freshCampus();
  });

  it("ships in production order", () => {
    assert.deepEqual(PROGRAMS_3.map((p) => p.code), ["#2", "#7", "#6", "#5", "#8", "#9", "#3", "#4", "#10", "#11"]);
  });

  it("loads every offering, published, with a published program page", () => {
    const store = storeOf("academy");
    for (const n of NUMS) {
      const o = store.get("offerings", off(n));
      assert.ok(o, `#${n} loaded`);
      assert.equal(o.code, `#${n}`);
      assert.equal(o.state, "published", `#${n} offering`);
      assert.equal(o.productType, "cohort_program");
      const pages = store.list("program_pages", (p) => p.offeringId === o.id);
      assert.equal(pages.length, 1);
      assert.equal(pages[0].state, "published", `#${n} page`);
      assert.ok(store.list("offering_sections", (s) => s.offeringId === o.id).length, `#${n} cohort`);
      assert.ok(Number(o.price) > 0);
      assert.ok(store.get("credential_templates", String(o.credentialTemplateId)));
    }
  });

  it("every program passes the quality gate", () => {
    const store = storeOf("academy");
    for (const n of NUMS) {
      const gate = prog.qualityGate(store, off(n));
      assert.ok(gate.every((g) => g.ok), `#${n}: ${JSON.stringify(gate.filter((g) => !g.ok))}`);
    }
  });

  it("week modules match the spec; long programs have two blocks; capstone in the last week", () => {
    const store = storeOf("academy");
    const expectedWeeks: Record<number, number> = { 2: 16, 3: 20, 4: 14, 5: 14, 6: 12, 7: 6, 8: 12, 9: 12, 10: 10, 11: 10 };
    for (const n of NUMS) {
      const spec = specOf(n);
      assert.equal(spec.weeks, expectedWeeks[n], `#${n} weeks`);
      assert.equal(spec.curriculum.length, spec.weeks, `#${n} one entry per week`);
      const ids = courseIds(n);
      const mods = store.list("modules", (m) => ids.includes(String(m.courseId)) && /^Week \d/.test(String(m.title)));
      assert.equal(mods.length, spec.curriculum.length, `#${n} week modules`);
      assert.equal(ids.length, spec.blocks.length, `#${n} block courses`);
      if (spec.weeks >= 16) {
        assert.equal(spec.blocks.length, 2, `#${n} two blocks`);
        assert.ok(spec.curriculum.every((w) => w.block === "A" || w.block === "B"));
      } else assert.equal(spec.blocks.length, 1, `#${n} single block`);
      assert.equal(spec.outcomes.length, 5);
      const caps = spec.projects.filter((p) => p.kind === "capstone");
      assert.equal(caps.length, 1, `#${n} capstone`);
      assert.equal(caps[0].week, String(spec.weeks), `#${n} capstone in last week`);
      assert.equal(spec.curriculum[spec.curriculum.length - 1].kind, "capstone");
      assert.ok(store.list("assignments", (a) => ids.includes(String(a.courseId)) && String(a.title) === `Capstone: ${caps[0].name}` && !!a.rubricId).length, `#${n} capstone assignment`);
      assert.match(spec.credential.certificate, /^Scholaris AI Academy Certificate of Completion — /);
    }
    // #3: deep learning weeks ship dual-framework labs.
    const p3 = specOf(3);
    assert.ok(p3.curriculum.filter((w) => w.dual).length >= 3);
    assert.ok(store.list("assignments", (a) => courseIds(3).includes(String(a.courseId)) && !!(a.tags as string[] | undefined)?.includes("dual_framework")).length >= 3);
  });

  it("tracks, coding flags, format and weekly hours", () => {
    const want: Record<number, [string, boolean]> = {
      2: ["Builder", true], 3: ["Builder", true], 4: ["Builder", true],
      5: ["No-Code", false], 6: ["No-Code", false], 7: ["No-Code", false],
      8: ["Business & Leadership", false], 9: ["Business & Leadership", false],
      10: ["Industry", false], 11: ["Industry", false],
    };
    const items = hub.agenticHub(storeOf("academy")).items;
    for (const n of NUMS) {
      const spec = specOf(n);
      assert.equal(spec.catalogTrack, want[n][0], `#${n} track`);
      assert.equal(spec.codingRequired, want[n][1], `#${n} coding`);
      assert.equal(spec.formatKind, "cohort");
      const [lo, hi] = spec.hoursPerWeek!;
      if (want[n][1]) assert.ok(lo >= 6 && hi <= 10, `#${n} builder hours`);
      else assert.ok(lo >= 4 && hi <= 6, `#${n} hours`);
      const item = items.find((c) => c.id === off(n));
      if (item) {
        assert.equal(item.codingRequired, want[n][1]);
        assert.equal(item.track, want[n][0]);
      }
    }
  });

  it("stacking edges: #7 into #5 and #6, #2 into Program 1", () => {
    const store = storeOf("academy");
    const waives = (from: number, to: number) => store.list("pathway_edges", (e) => e.fromId === off(from) && e.toId === off(to) && e.kind === "waives").map((e) => String(e.moduleKey)).sort();
    assert.deepEqual(waives(7, 5), ["p5-w1", "p5-w2"]);
    assert.deepEqual(waives(7, 6), ["p6-w1", "p6-w2", "p6-w3"]);
    assert.deepEqual(waives(2, 1), ["p1-w1", "p1-w2", "p1-w3", "p1-w4", "p1-w5", "p1-w6"]);
    // Every waived module exists in the target program.
    for (const e of store.list("pathway_edges", (x) => x.kind === "waives" && [off(2), off(7)].includes(String(x.fromId)))) {
      const target = store.get("offerings", String(e.toId))!;
      assert.ok((target.moduleKeys as string[]).includes(String(e.moduleKey)), `${e.moduleKey} exists in ${target.code}`);
    }
  });

  it("industry boundaries: #10 never builds investment-advice agents, #11 never builds clinical decision agents", () => {
    const store = storeOf("academy");
    const json = (n: number) => JSON.stringify(store.list("program_pages", (p) => p.offeringId === off(n))[0].spec);
    const p10 = json(10);
    assert.match(p10, /Learners do not build agents that give personalized investment advice\./);
    for (const bad of [/investment recommendation/i, /portfolio recommendation/i, /robo-?advis/i, /trading agent/i, /stock pick/i, /buy or sell/i, /wealth advis/i]) assert.doesNotMatch(p10, bad);
    const p11 = json(11);
    assert.match(p11, /Learners do not build diagnostic or treatment-decision agents\./);
    for (const bad of [/symptom checker/i, /treatment recommendation/i, /\bdiagnose/i, /diagnostic agent/i, /prescrib/i, /triage patients/i, /clinical decision support agent/i]) assert.doesNotMatch(p11, bad);
    assert.ok(specOf(11).dataCards.every((d) => /non-clinical|no clinical|administrative|generic/i.test(`${d.name} ${d.caveats}`)), "#11 uses non-clinical synthetic data");
    assert.ok(specOf(10).dataCards.every((d) => /synthetic/i.test(d.name) && /scholaris/i.test(d.source)));
  });

  it("copy stays honest: no restricted claims or outside names", () => {
    for (const spec of PROGRAMS_3) {
      const text = JSON.stringify(spec);
      for (const bad of [/accredit/i, /\bdegree\b/i, /post-?graduate/i, /\bPG\b/, /industry-recognized/i, /guarantee/i, /salary/i, /\bjob placement\b/i, /\b(best|top|leading)\b/i, new RegExp(["Oak", "Haven"].join("\\s?"), "i"), /\bCanvas\b/, /Instructure/i, /Coursera/i, /Great Learning/i, /\bMIT\b/, /Johns Hopkins/i, /UT Austin/i]) assert.doesNotMatch(text, bad, `${spec.code} ${bad}`);
    }
  });
});
