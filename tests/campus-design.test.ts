import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import { PROGRAMS } from "../src/campus/academy/programs-data";
import { PROGRAMS_3 } from "../src/campus/academy/programs-data-3";
import { activityEditions, bloomOf, boundaryViolations, datasetCsv, designFor, DESIGN_CODES, notebook } from "../src/campus/academy/design";
import * as D from "../src/campus/services/design";
import { offeringIdFor } from "../src/campus/services/programs";
import { unzip } from "../src/documents";
import { handleCampus } from "../src/campus/http/router";
import { DEMO_PASSWORD } from "../src/campus/seed";

/** The 11 certificate programs built to the Scholaris course standard and design package. */

const SPECS = [...PROGRAMS, ...PROGRAMS_3].filter((p) => DESIGN_CODES.includes(p.code));
const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const spec = (code: string) => SPECS.find((s) => s.code === code)!;

before(() => freshCampus());

describe("Course standard per program", () => {
  it("all 11 programs are covered", () => assert.deepEqual(SPECS.map((s) => s.code).sort(), [...DESIGN_CODES].sort()));

  it("16–20 week programs use two 10-week blocks; the second block's final is the capstone defense", () => {
    for (const code of ["#1", "#2", "#3"]) {
      const d = designFor(spec(code));
      assert.equal(d.blocks.length, 2, code);
      assert.equal(d.blocks[1].counts.final, "capstone_defense");
      for (const b of d.blocks) {
        const n = (k: string) => d.assessments.filter((a) => a.block === b.key && a.kind === k).length;
        assert.equal(n("assignment"), 5, `${code}${b.key} assignments`);
        assert.ok(n("lab") >= 3, `${code}${b.key} labs`);
        assert.ok(n("project") + n("midterm_project") >= 2, `${code}${b.key} projects`);
        assert.ok(n("quiz") >= 7 && n("quiz") <= 8, `${code}${b.key} quizzes`);
        assert.equal(n("midterm_exam"), 1);
      }
    }
  });

  it("12–14 week programs are one extended block; #7 uses the scaled 6-week standard", () => {
    for (const code of ["#4", "#5", "#6", "#8", "#9"]) {
      const d = designFor(spec(code));
      assert.equal(d.blocks.length, 1);
      assert.equal(d.blocks[0].standard, "Extended block (capstone weeks)", code);
      const n = (k: string) => d.assessments.filter((a) => a.kind === k).length;
      assert.deepEqual([n("assignment"), n("lab"), n("quiz"), n("midterm_exam"), n("final_exam"), n("capstone")], [5, 3, 8, 1, 1, 1], code);
    }
    const d7 = designFor(spec("#7"));
    const n7 = (k: string) => d7.assessments.filter((a) => a.kind === k).length;
    assert.equal(d7.blocks[0].standard, "Scaled 6-week standard");
    assert.deepEqual([d7.weeks.length, n7("assignment"), n7("lab"), n7("quiz"), n7("final_practical")], [6, 3, 2, 6, 1]);
  });

  it("the LMS shells load with sequential locking, quiz and exam shells, weekly announcements and AI-use policies", () => {
    const s = storeOf("academy");
    for (const code of DESIGN_CODES) {
      const g = D.designGate(s, code).checks.find((c) => c.key === "shells")!;
      assert.equal(g.status, "pass", `${code}: ${g.detail}`);
    }
    const o = s.get("offerings", offeringIdFor("academy", "#10"))!;
    const ann = s.list("announcements", (x) => x.courseId === o.courseId && !!x.auto);
    assert.equal(ann.length, 10);
    const lab = s.list("assignments", (x) => x.courseId === o.courseId && !!(x.tags as string[] | undefined)?.includes("lab"))[0];
    assert.equal(lab.aiPolicy, "Allowed with disclosure");
    const quiz = s.list("quizzes", (x) => x.courseId === o.courseId)[0];
    assert.equal(quiz.state, "unpublished"); // items await SME authoring; never published empty
    assert.equal(quiz.aiPolicy, "Not allowed");
  });
});

describe("Alignment and Bloom fit", () => {
  it("Bloom levels come from the outcome verb", () => {
    assert.equal(bloomOf("Design a multi-agent system").level, 6);
    assert.equal(bloomOf("Evaluate an agent").level, 5);
    assert.equal(bloomOf("Explain tokens").level, 2);
  });

  it("every competency is assessed, at or above its Bloom level; every assessment maps to a competency", () => {
    for (const s of SPECS) {
      const d = designFor(s);
      for (const o of d.outcomes) {
        const m = d.matrix.find((x) => x.outcome === o.id)!;
        assert.ok(m.assessments.length > 0, `${s.code} ${o.id} orphan`);
        assert.ok(m.maxCap >= o.bloom, `${s.code} ${o.id} assessed below ${o.bloomName}`);
      }
      assert.ok(d.assessments.every((a) => a.outcomes.length > 0), s.code);
    }
  });

  it("weights sum to 100 per block", () => {
    for (const s of SPECS) {
      const d = designFor(s);
      for (const b of d.blocks) assert.ok(Math.abs(d.assessments.filter((a) => a.block === b.key).reduce((x, a) => x + a.weight, 0) - 100) < 0.2, `${s.code}${b.key}`);
    }
  });
});

describe("Editions, notebooks and datasets", () => {
  it("student editions have no answers; instructor editions add the sample, answer key and common mistakes", () => {
    const s = spec("#2");
    const d = designFor(s);
    const w = d.weeks.find((x) => !x.kind)!;
    const ed = activityEditions(s, d, w);
    for (const h of ["## Objective", "## Activity Overview", "## Step 1", "## Step 2: Hands-On Implementation", "## Step 3: Task", "## Step 4: Research, Discussion & Reflection", "## Step 5: Wrap-Up (5 min)", "## Reflection Questions", "## Submission", "## Reminders"]) assert.ok(ed.student.includes(h), h);
    assert.doesNotMatch(ed.student, /Answer key|Instructor-led sample/);
    assert.match(ed.instructor, /## Answer key/);
    assert.match(ed.instructor, /## Instructor Emphasizes/);
    assert.match(ed.student, /Due Sunday 11:59 PM/);
  });

  it("builder notebooks are valid nbformat 4 with TODOs in the starter and none in the solution", () => {
    const s = spec("#1");
    const d = designFor(s);
    const w = d.weeks.find((x) => !x.kind && !x.optional)!;
    const st = JSON.parse(notebook(s, d, w, false));
    const so = JSON.parse(notebook(s, d, w, true));
    assert.equal(st.nbformat, 4);
    assert.ok(st.cells.some((c: { source: string[] }) => c.source.join("").includes("TODO")));
    assert.ok(!so.cells.filter((c: { cell_type: string }) => c.cell_type === "code").some((c: { source: string[] }) => c.source.join("").includes("TODO")));
    assert.equal(so.metadata.scholarion.executed, false); // honest: not executed here
  });

  it("no-code programs get tool walkthroughs instead of notebooks", () => {
    assert.equal(designFor(spec("#6")).notebooks, false);
    assert.equal(designFor(spec("#10")).notebooks, true);
  });

  it("datasets are synthetic, deterministic and fully carded", () => {
    for (const s of SPECS) {
      for (const ds of designFor(s).datasets) {
        assert.ok(ds.license && ds.intendedUse && ds.knownBiases && ds.synthetic, `${s.code} ${ds.key}`);
        const a = datasetCsv(ds, 20);
        assert.equal(a, datasetCsv(ds, 20));
        assert.equal(a.trim().split("\n")[0].split(",").length, ds.fields.length);
      }
    }
  });
});

describe("Boundaries, gate and sign-offs", () => {
  it("finance and healthcare boundaries hold for the shipped programs, and catch a violating brief", () => {
    assert.deepEqual(boundaryViolations(spec("#10")), []);
    assert.deepEqual(boundaryViolations(spec("#11")), []);
    const bad = { ...spec("#11"), projects: [{ key: "x", kind: "capstone" as const, week: "10", name: "Triage bot", description: "An agent that can diagnose patients from symptoms.", skills: [] }] };
    assert.equal(boundaryViolations(bad).length, 1);
    const ok = { ...bad, projects: [{ ...bad.projects[0], description: "The agent must not diagnose patients; it routes scheduling requests." }] };
    assert.equal(boundaryViolations(ok).length, 0);
  });

  it("the gate passes the automatable checks and leaves human and execution steps open", () => {
    const g = D.designGate(storeOf("academy"), "#2");
    const st = Object.fromEntries(g.checks.map((c) => [c.key, c.status]));
    for (const k of ["originality", "claims", "datasets", "responsible_ai", "shells", "editions", "credit"]) assert.equal(st[k], "pass", k);
    assert.equal(st.notebooks, "needs_action");
    assert.equal(st.peer_review, "needs_action");
    assert.equal(g.publishable, false);
  });

  it("sign-off needs a designer and an SME, and one person can't be both", () => {
    const s = storeOf("academy");
    const designer = as("academy", "designer", true);
    const inst = as("academy", "instructor", true);
    const admin = as("academy", "admin", true);
    assert.equal(status(() => D.signOff(s, designer.actor, "#5", "designer", "")), 422);
    D.signOff(s, designer.actor, "#5", "designer", "Checked alignment and editions.");
    assert.equal(status(() => D.signOff(s, designer.actor, "#5", "sme", "x")), 403);
    D.signOff(s, admin.actor, "#5", "sme", "Content accuracy reviewed.");
    assert.equal(status(() => D.signOff(s, admin.actor, "#5", "designer", "both")), 409);
    D.signOff(s, inst.actor, "#5", "sme", "Re-reviewed by the instructor.");
    assert.equal(D.designGate(s, "#5").checks.find((c) => c.key === "peer_review")!.status, "pass");
    const st = as("academy", "student1", false);
    assert.equal(status(() => D.designSummary(s, st.actor, "#5")), 403);
  });
});

describe("Design package download", () => {
  it("has every section in order, datasets with cards, Common Cartridge per block and a manifest", () => {
    const admin = as("academy", "admin", true);
    const pk = D.designPackage(admin.store, admin.actor, "#3");
    const names = unzip(pk.zip).map((e) => e.name.replace(`${pk.root}/`, ""));
    for (const dir of ["01_Catalog_Page/", "02_Outcomes_and_Curriculum_Map/alignment_matrix.csv", "03_Course_Block_Syllabi/syllabus_block_A.md", "03_Course_Block_Syllabi/syllabus_block_B.md", "04_Module_Packages/", "05_Assignments_Projects_Capstone/", "06_Instructor_Guide/instructor_guide.md", "07_Student_Edition/README.md", "08_Credentials/certificate_achievement.ob3.json", "09_Import_Package/cloud_lab_config.json", "10_Quality_Gate/quality_gate.md", "datasets/", "manifest.json"]) assert.ok(names.some((n) => n.startsWith(dir)), dir);
    assert.equal(names.filter((n) => n.endsWith(".imscc")).length, 2);
    assert.ok(names.some((n) => /Instructor_Solution_EXECUTED\.ipynb$/.test(n)));
    assert.ok(names.some((n) => /MiniLab_2_Starter_TODO\.ipynb$/.test(n)));
    const ob3 = JSON.parse(unzip(pk.zip).find((e) => e.name.endsWith("certificate_achievement.ob3.json"))!.data.toString());
    assert.deepEqual(ob3.type, ["Achievement"]);
    assert.equal(ob3.alignment.length, 5);
  });

  it("downloads over HTTP for staff with office copies; learners are refused", async () => {
    const H = "http://localhost:3000/api/campus/v1/t/academy/";
    const signIn = async (u: string) => (await handleCampus(new Request(`${H}auth/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${u}@academy.scholarion.test`, password: DEMO_PASSWORD }) }), "v1/t/academy/auth/signin")).headers.get("set-cookie")!.split(";")[0];
    const get = (cookie: string) => handleCampus(new Request(`${H}programs/ai-native-professional/design-package.zip`, { headers: { cookie } }), "v1/t/academy/programs/ai-native-professional/design-package.zip");
    const r = await get(await signIn("instructor"));
    assert.equal(r.status, 200);
    const names = unzip(Buffer.from(await r.arrayBuffer())).map((e) => e.name);
    assert.ok(names.some((n) => n.endsWith("syllabus_block_A.docx")));
    assert.ok(names.some((n) => n.endsWith("curriculum_map.xlsx")));
    assert.ok(names.some((n) => n.endsWith("instructor_guide.pdf")));
    assert.equal((await get(await signIn("student1"))).status, 403);
  });
});
