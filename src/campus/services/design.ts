import { CampusError, nowIso, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import type { ProgramSpec } from "../academy/programs-data";
import { activityEditions, AI_POLICY, BLOOM, boundaryViolations, capstoneBrief, dataCardMd, datasetCsv, designFor, DRAFT, instructorGuide, isDesignProgram, notebook, quizBlueprint, scriptOutline, slidesOutline, syllabusMd, walkthrough, type ProgramDesign } from "../academy/design";
import { copyCheck } from "./claims";
import { exportCourse } from "./content";
import { audit } from "./common";
import { zipDeflate } from "../../documents";

/**
 * Program design packages (#1–#11): the extended quality gate, human sign-offs (designer + SME,
 * never the same person) and the downloadable package in the design-prompt order.
 */

const STAFF = ["admin", "designer", "instructor", "registrar"] as const;

function specOf(store: TenantStore, codeOrSlug: string): { spec: ProgramSpec; page: Row; offering: Row | undefined } {
  const page = store.list("program_pages", (p) => (p.spec as ProgramSpec)?.code === codeOrSlug || p.slug === codeOrSlug || (p.spec as ProgramSpec)?.slug === codeOrSlug)[0];
  if (!page) throw new CampusError("not_found", "Program not found", 404);
  const spec = page.spec as ProgramSpec;
  if (!isDesignProgram(spec.code)) throw new CampusError("not_applicable", "Design packages cover programs #1–#11.", 409);
  return { spec, page, offering: store.get("offerings", page.offeringId as string) };
}

/** Market-reference wording that must never appear in learner-facing copy (internal gap analysis only). */
const REFERENCE_PHRASES = [/johns hopkins/i, /\bMIT\b/, /massachusetts institute/i, /ut austin/i, /mccombs/i, /great learning/i, /post\s?-?graduate/i, /\bPG (program|diploma|certificate)\b/i, /certificate program in agentic ai\b/i, /applied generative ai and agentic ai\b/i, /no code and agentic ai\b/i, /workflows and agents for productivity\b/i, /generative ai and agents for software development\b/i, /ai agents for business applications\b/i, /ai and agentic ai in (finance|healthcare)\b/i];

const learnerCopy = (spec: ProgramSpec) => [spec.title, spec.valueStatement, ...spec.overview, ...spec.outcomes, ...spec.audience, spec.prerequisites, ...spec.curriculum.map((w) => `${w.title}. ${w.focus}`), ...spec.projects.map((p) => `${p.name}. ${p.description}`), spec.credential.certificate, spec.credential.badge, spec.credential.description, ...spec.faqs.map((f) => `${f.q} ${f.a}`)].join("\n");

export type GateStatus = "pass" | "needs_action" | "needs_review" | "fail";
export interface GateCheck {
  key: string;
  label: string;
  status: GateStatus;
  detail: string;
}

function courseIds(store: TenantStore, offering: Row | undefined) {
  if (!offering) return [];
  return [offering.courseId as string, ...((offering.blockCourseIds as string[] | undefined) ?? [])].filter(Boolean);
}

/** Estimated learner hours per week from the planned work (for the ±15% workload gate). */
export function workload(spec: ProgramSpec, d: ProgramDesign) {
  const H: Record<string, number> = { activity: 1.5, quiz: 0.5, lab: 2, assignment: 2.5, project: 3, midterm_project: 4, capstone: 6, midterm_exam: 1.5, final_exam: 2, final_practical: 3 };
  const stated = spec.hoursPerWeek ?? null;
  const target = stated ? (stated[0] + stated[1]) / 2 : null;
  return d.weeks
    .filter((w) => !w.optional)
    .map((w) => {
      const live = /weekend|sat|sun/i.test(spec.formatText) ? 3 : 1.5;
      const est = Math.round((live + 1 + d.assessments.filter((a) => a.week === w.week).reduce((s, a) => s + (H[a.kind] ?? 1), 0)) * 10) / 10;
      const over = target ? est > target * 1.15 : false;
      const under = target ? est < target * 0.85 : false;
      return { week: w.week, estimated: est, stated: target, within: target ? !over && !under : null, flag: over ? "over" : under ? "under" : null };
    });
}

export function designGate(store: TenantStore, codeOrSlug: string): { code: string; checks: GateCheck[]; publishable: boolean } {
  const { spec, offering } = specOf(store, codeOrSlug);
  const d = designFor(spec);
  const checks: GateCheck[] = [];
  const add = (key: string, label: string, status: GateStatus, detail: string) => checks.push({ key, label, status, detail });
  const copy = learnerCopy(spec);
  const orig = REFERENCE_PHRASES.filter((re) => re.test(copy));
  add("originality", "Originality: no market-reference titles, outlines or provider names", orig.length ? "fail" : "pass", orig.length ? `Found: ${orig.map((r) => r.source).join(", ")}` : "No reference-provider names or titles in learner-facing copy.");
  const claims = copyCheck(store, copy.replace(/#\s?\d+(\.\d+)?/g, "Program N"));
  add("claims", "Claims: no unverified salary, placement, accreditation or partnership claims", claims.length ? "fail" : "pass", claims.length ? claims.map((c) => `${c.label} "${c.match}"`).join("; ") : "Copy Checker passed.");
  const orphans = d.issues.filter((i) => i.kind === "orphan_outcome" || i.kind === "orphan_assessment");
  add("alignment", "Every outcome maps to an assessment and every assessment to an outcome", orphans.length ? "needs_review" : "pass", orphans.length ? `${orphans.length} link(s) added automatically for coverage — confirm: ${orphans.map((i) => i.target).join(", ")}` : `${d.assessments.length} assessments aligned to ${d.outcomes.length} competencies.`);
  const bloomGaps = d.outcomes.filter((o) => (d.matrix.find((m) => m.outcome === o.id)?.maxCap ?? 0) < o.bloom);
  const mism = d.issues.filter((i) => i.kind === "bloom_mismatch");
  add("bloom", "Bloom fit: design/evaluate outcomes are not assessed by recall alone", bloomGaps.length ? "fail" : mism.length ? "needs_review" : "pass", bloomGaps.length ? bloomGaps.map((o) => `${o.id} (${o.bloomName})`).join(", ") : mism.length ? `${mism.length} outcome(s) relinked to the capstone/project: ${mism.map((i) => i.target).join(", ")} — add a matching rubric criterion.` : "Every competency is assessed at or above its Bloom level.");
  const dsOk = d.datasets.every((x) => x.synthetic && x.license && x.intendedUse && x.knownBiases && x.fields.length);
  add("datasets", "Datasets are synthetic or licensed, with complete data cards", dsOk ? "pass" : "fail", `${d.datasets.length} dataset(s): source, license, fields, intended use and known biases recorded; CSVs generated from a fixed seed.`);
  add("notebooks", "Notebooks run top to bottom; solutions EXECUTED with outputs saved", "needs_action", d.notebooks ? "Starter and solution notebooks are generated. Execute them in the Scholarion Cloud Lab (pinned image) and save outputs; this environment doesn't execute notebooks." : "No-code track: tool walkthroughs and reference builds are generated; screenshots need capture once the tool version is pinned.");
  const pinned = spec.tools.flatMap((g) => g.items).filter((i) => /\d+\.\d+/.test(i)).length;
  add("versions", "Tools and framework versions verified current and pinned", "needs_action", `${pinned} of ${spec.tools.flatMap((g) => g.items).length} tool entries carry a version; the rest are pinned in the Cloud Lab at cohort start (Freshness check).`);
  add("accessibility", "Accessibility: headings, alt text, captions, contrast, keyboard, notebook accessibility", "needs_review", "Generated documents use real headings and tables; slides and recordings need captions and alt text when produced. Run the accessibility audit on the final media.");
  const ra = spec.curriculum.some((w) => /guardrail|responsib|secur|govern|privacy|ethic|risk|bias|human-in-the-loop|regulat/i.test(`${w.title} ${w.focus}`));
  const bound = boundaryViolations(spec);
  add("responsible_ai", "Responsible AI covered; finance and healthcare boundaries enforced", bound.length ? "fail" : ra ? "pass" : "fail", bound.length ? bound.join(" ") : ra ? `Responsible-AI content present.${d.industryRules.length ? ` Boundary checked: ${d.industryRules.join(" ")}` : ""}` : "No week covers evaluation, guardrails, privacy or governance.");
  const ids = courseIds(store, offering);
  const mods = store.list("modules", (m) => ids.includes(m.courseId as string) && /^(Week|Weekend) /.test(String(m.title)) && !/^Optional/.test(String(m.title)));
  const locked = mods.filter((m) => !!m.sequential).length;
  const quizzes = store.list("quizzes", (q) => ids.includes(q.courseId as string)).length;
  const plannedQuizzes = d.assessments.filter((a) => a.kind === "quiz" || a.kind === "midterm_exam" || a.kind === "final_exam").length;
  const anns = store.list("announcements", (x) => ids.includes(x.courseId as string) && !!x.auto).length;
  const withPolicy = store.list("assignments", (x) => ids.includes(x.courseId as string) && !!x.aiPolicy).length;
  const shellsOk = ids.length > 0 && locked === mods.length && quizzes >= plannedQuizzes && anns >= mods.length && withPolicy > 0;
  add("shells", "Course shells load: sequential locking, quizzes, rubrics, pacing, announcements", shellsOk ? "pass" : "fail", `${ids.length} course(s); ${locked}/${mods.length} modules locked in sequence; ${quizzes}/${plannedQuizzes} quiz and exam shells; ${anns} weekly announcements; ${withPolicy} items with an AI-use policy.`);
  const leaks = d.weeks.filter((w) => !w.kind && !w.optional).filter((w) => /answer key|instructor-led sample|instructor edition — contains/i.test(activityEditions(spec, d, w).student));
  add("editions", "Student editions contain no answers; instructor editions complete", leaks.length ? "fail" : "pass", leaks.length ? `Answer text in student editions: weeks ${leaks.map((w) => w.week).join(", ")}` : "Student editions have instructions only; instructor editions add the sample, answer key, common mistakes and timing.");
  const wl = workload(spec, d);
  const off = wl.filter((w) => w.within === false);
  add("workload", "Workload within stated hours (±15%)", !spec.hoursPerWeek ? "needs_action" : off.length > Math.ceil(wl.length * 0.25) ? "needs_review" : "pass", !spec.hoursPerWeek ? "Weekly hours aren't set." : off.length ? `${off.length} week(s) outside ±15%: ${off.map((w) => `W${w.week} ${w.estimated}h (${w.flag})`).join(", ")}` : "Every week's estimate is within ±15% of the stated hours.");
  add("credit", "Credit status explicit and correct (non-credit)", /non-credit|not for (academic )?credit|does not carry/i.test(spec.creditStatement) ? "pass" : "fail", spec.creditStatement);
  const so = store.list("program_design_signoffs", (s) => s.programCode === spec.code && !s.revokedAt);
  const designer = so.find((s) => s.kind === "designer");
  const sme = so.find((s) => s.kind === "sme");
  add("peer_review", "Peer review by a second instructional designer and a subject-matter expert", designer && sme ? "pass" : "needs_action", designer && sme ? `Designer ${designer.byName} (${String(designer.at).slice(0, 10)}); SME ${sme.byName} (${String(sme.at).slice(0, 10)}).` : `Awaiting: ${[!designer && "instructional designer", !sme && "subject-matter expert"].filter(Boolean).join(" and ")}.`);
  return { code: spec.code, checks, publishable: checks.every((c) => c.status === "pass") };
}

/** Designer or SME sign-off. Separation of duties: one person can't sign both, and the generator never signs. */
export function signOff(store: TenantStore, a: Actor, codeOrSlug: string, kind: "designer" | "sme", note: string) {
  const { spec } = specOf(store, codeOrSlug);
  if (kind === "designer" && !hasAny(a, ["designer", "admin"])) throw new CampusError("forbidden", "Instructional-designer sign-off needs the designer role.", 403);
  if (kind === "sme" && !hasAny(a, ["instructor", "admin"])) throw new CampusError("forbidden", "SME sign-off needs an instructor (subject-matter expert).", 403);
  if (!String(note ?? "").trim()) throw new CampusError("invalid", "Add a review note (what you checked).", 422);
  const mine = store.list("program_design_signoffs", (s) => s.programCode === spec.code && s.by === a.id && !s.revokedAt);
  if (mine.some((s) => s.kind !== kind)) throw new CampusError("separation_of_duties", "The same person can't sign off as both designer and SME.", 409);
  const ex = store.list("program_design_signoffs", (s) => s.programCode === spec.code && s.kind === kind && !s.revokedAt)[0];
  const user = store.get("users", a.id);
  const row = store.tx(() => (ex ? store.update("program_design_signoffs", ex.id, { by: a.id, byName: user?.name ?? a.id, at: nowIso(), note: String(note).slice(0, 1000) }) : store.insert("program_design_signoffs", { programCode: spec.code, kind, by: a.id, byName: user?.name ?? a.id, at: nowIso(), note: String(note).slice(0, 1000), revokedAt: null }, "pds")));
  audit(store, a, "programs.design_signoff", `programs/${spec.code}`, kind);
  return row;
}

/** Summary for the Program Studio panel. */
export function designSummary(store: TenantStore, a: Actor, codeOrSlug: string) {
  if (!hasAny(a, [...STAFF])) throw new CampusError("forbidden", "Staff only.", 403);
  const { spec } = specOf(store, codeOrSlug);
  const d = designFor(spec);
  const gate = designGate(store, spec.code);
  return {
    code: spec.code,
    slug: spec.slug,
    title: spec.title,
    track: d.track,
    notebooks: d.notebooks,
    status: DRAFT,
    blocks: d.blocks,
    outcomes: d.outcomes,
    matrix: d.matrix,
    issues: d.issues,
    counts: Object.fromEntries(["quiz", "lab", "assignment", "project", "midterm_project", "capstone", "midterm_exam", "final_exam", "final_practical", "activity"].map((k) => [k, d.assessments.filter((x) => x.kind === k).length])),
    assessments: d.assessments.map((x) => ({ id: x.id, kind: x.kind, block: x.block, week: x.week, title: x.title, weight: x.weight, outcomes: x.outcomes, aiPolicy: x.aiPolicy, review: x.addedForCoverage ?? null })),
    datasets: d.datasets.map((x) => ({ name: x.name, file: x.file, rows: x.rows, license: x.license })),
    credential: d.credential.completion,
    career: d.career,
    evaluation: d.evaluation,
    workload: workload(spec, d),
    gate,
    signoffs: store.list("program_design_signoffs", (s) => s.programCode === spec.code && !s.revokedAt).map((s) => ({ kind: s.kind, byName: s.byName, at: s.at, note: s.note })),
  };
}

/* ---------------- package ---------------- */

const pad = (n: string | number) => String(n).padStart(2, "0");

export function designPackage(store: TenantStore, a: Actor, codeOrSlug: string): { zip: Buffer; root: string; manifest: Record<string, unknown> } {
  if (!hasAny(a, ["admin", "designer", "instructor"])) throw new CampusError("forbidden", "Staff only — the package includes instructor editions and answer keys.", 403);
  const { spec, offering } = specOf(store, codeOrSlug);
  const d = designFor(spec);
  const root = `Scholaris_${spec.code.replace("#", "P")}_${spec.slug}_Design_Package`;
  const files: { path: string; data: string | Buffer; status: string; access: "learner" | "instructor"; note?: string }[] = [];
  const add = (path: string, data: string | Buffer, access: "learner" | "instructor" = "instructor", status = "drafted", note?: string) => files.push({ path, data, status, access, note });

  // 1 Catalog page
  add("01_Catalog_Page/catalog_page.md", `# ${spec.title}\n\n${DRAFT}\n\n${spec.overview.join("\n\n")}\n\n| Item | Detail |\n|---|---|\n| Who it's for | ${spec.audience.join("; ")} |\n| Prerequisites | ${spec.prerequisites} |\n| Length | ${spec.weeks} weeks |\n| Weekly hours | ${spec.hoursPerWeek ? spec.hoursPerWeek.join("–") : "to be set"} |\n| Delivery | ${spec.formatText} |\n| Track | ${d.track} |\n| Tools | ${spec.tools.map((g) => `${g.family}: ${g.items.join(", ")}`).join("; ")} |\n| Capstone | ${spec.projects.find((p) => p.kind === "capstone")?.description ?? "—"} |\n| Credential | ${spec.credential.certificate} (non-credit) |\n| Stackability | ${(spec.waives ?? []).map((w) => w.note).join(" ") || "Stacks with related Academy programs through the pathway graph."} |\n| Career services | ${spec.careerServices.join("; ")} |\n\n## Outcomes\n${d.outcomes.map((o) => `- ${o.text}`).join("\n")}\n`, "learner", "drafted");
  // 2 Outcomes and curriculum map
  add("02_Outcomes_and_Curriculum_Map/outcomes.md", `# Program competencies\n\n${DRAFT}\n\n| ID | Competency | Bloom | Introduced | Developed | Mastered | Assessed by |\n|---|---|---|---|---|---|---|\n${d.outcomes.map((o) => { const m = d.matrix.find((x) => x.outcome === o.id)!; return `| ${o.id} | ${o.text} | ${o.bloomName} | W${m.introduced ?? "—"} | W${m.developed ?? "—"} | W${m.mastered ?? "—"} | ${m.assessments.length} items |`; }).join("\n")}\n`);
  add("02_Outcomes_and_Curriculum_Map/curriculum_map.csv", ["week,block,module,topics,competencies,readings,lab,activity,assessments,live_session,est_hours", ...d.weeks.filter((w) => !w.optional).map((w) => [w.week, w.block, w.title, w.topics.join("; "), w.outcomes.join(" "), w.readings.join("; "), w.lab ?? "", w.activity, w.assessments.map((id) => d.assessments.find((x) => x.id === id)?.title ?? id).join("; "), w.liveSession, w.hours].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n");
  add("02_Outcomes_and_Curriculum_Map/alignment_matrix.csv", ["assessment_id,kind,block,week,title,weight_pct,ai_use_policy,bloom_cap," + d.outcomes.map((o) => o.id).join(",") + ",needs_review", ...d.assessments.map((x) => [x.id, x.kind, x.block, x.week, `"${x.title.replace(/"/g, '""')}"`, x.weight, x.aiPolicy, BLOOM[x.bloomCap], ...d.outcomes.map((o) => (x.outcomes.includes(o.id) ? "X" : "")), x.addedForCoverage ? `"linked for coverage: ${x.addedForCoverage.join(" ")}"` : ""].join(","))].join("\n") + "\n");
  add("02_Outcomes_and_Curriculum_Map/alignment_issues.md", `# Alignment issues\n\n${DRAFT}\n\n${d.issues.length ? d.issues.map((i) => `- **${i.kind}** ${i.target}: ${i.detail} Fix: ${i.fix}`).join("\n") : "No issues found."}\n`);
  // 3 Syllabi
  for (const b of d.blocks) add(`03_Course_Block_Syllabi/syllabus_block_${b.key}.md`, syllabusMd(spec, d, b), "learner");
  // 4 Module packages
  for (const w of d.weeks.filter((x) => !x.optional)) {
    const dir = `04_Module_Packages/Week_${pad(w.week)}_${w.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}`;
    if (!w.kind) {
      const ed = activityEditions(spec, d, w);
      add(`${dir}/activity_student_edition.md`, ed.student, "learner");
      add(`${dir}/activity_instructor_edition.md`, ed.instructor, "instructor");
    }
    if (d.notebooks) {
      add(`${dir}/Week_${pad(w.week)}_Student_Starter_TODO.ipynb`, notebook(spec, d, w, false), "learner");
      add(`${dir}/Week_${pad(w.week)}_Instructor_Solution_EXECUTED.ipynb`, notebook(spec, d, w, true), "instructor", "needs execution", "Solution cells filled; execute in the Cloud Lab and save outputs before release.");
      for (const n of [1, 2]) {
        add(`${dir}/mini_labs/MiniLab_${n}_Starter_TODO.ipynb`, notebook(spec, d, w, false, `Mini Lab ${n}`), "learner");
        add(`${dir}/mini_labs/MiniLab_${n}_Solution_EXECUTED.ipynb`, notebook(spec, d, w, true, `Mini Lab ${n}`), "instructor", "needs execution");
      }
    } else {
      add(`${dir}/Week_${pad(w.week)}_Tool_Walkthrough.md`, walkthrough(spec, d, w), "learner", "drafted", "Screenshots need capture once the tool version is pinned.");
      for (const n of [1, 2]) add(`${dir}/mini_labs/MiniLab_${n}_walkthrough.md`, walkthrough(spec, d, { ...w, title: `${w.title} — Mini Lab ${n}` }), "learner");
    }
    for (const qa of d.assessments.filter((x) => x.week === w.week && ["quiz", "midterm_exam", "final_exam"].includes(x.kind))) add(`${dir}/${qa.kind}_blueprint.json`, JSON.stringify(quizBlueprint(d, qa), null, 2), "instructor", "needs SME", "Items to be authored from the blueprint.");
    add(`${dir}/slides_outline.md`, slidesOutline(spec, d, w), "learner");
    add(`${dir}/lecture_script_outline.md`, scriptOutline(spec, w), "instructor");
  }
  // 5 Assessments
  for (const p of spec.projects) add(`05_Assignments_Projects_Capstone/${p.kind}_${p.key}_brief.md`, capstoneBrief(spec, d, p), "learner");
  add("05_Assignments_Projects_Capstone/assessment_plan.md", `# Assessment plan\n\n${DRAFT}\n\n| ID | Kind | Block | Week | Title | Weight % | Competencies | AI-use policy |\n|---|---|---|---|---|---|---|---|\n${d.assessments.map((x) => `| ${x.id} | ${x.kind.replace(/_/g, " ")} | ${x.block} | ${x.week} | ${x.title} | ${x.weight} | ${x.outcomes.join(", ")} | ${x.aiPolicy} |`).join("\n")}\n`, "learner");
  // 6 Instructor guide
  add("06_Instructor_Guide/instructor_guide.md", instructorGuide(spec, d));
  // 7 Student edition index
  add("07_Student_Edition/README.md", `# Student edition\n\n${DRAFT}\n\nLearner-facing files in this package (no answers): every \`activity_student_edition.md\`, \`*_Starter_TODO.ipynb\`${d.notebooks ? "" : ", tool walkthroughs"}, syllabi, slides outlines, project and capstone briefs and the catalog page.\n\n${files.filter((f) => f.access === "learner").map((f) => `- ${f.path}`).join("\n")}\n`, "learner");
  // 8 Credentials
  add("08_Credentials/completion_criteria.md", `# Credential — ${spec.credential.certificate}\n\n${DRAFT}\n\n${d.credential.completion.map((c) => `- ${c}`).join("\n")}\n\nIssued as a W3C Verifiable Credential (Open Badges 3.0) plus a printable certificate. Non-credit.\n`, "learner");
  add("08_Credentials/certificate_achievement.ob3.json", JSON.stringify(d.credential.achievement, null, 2));
  add("08_Credentials/capstone_skill_badge.ob3.json", JSON.stringify(d.credential.skillBadge, null, 2));
  add("08_Credentials/career_services.md", `# Career-services hooks\n\n${DRAFT}\n\n## Portfolio items\n${d.career.portfolio.map((p) => `- **${p.item}** — ${p.evidence}`).join("\n")}\n\n## Résumé bullet suggestions\n${d.career.resumeBullets.map((b) => `- ${b}`).join("\n")}\n\n## Interview practice prompts\n${d.career.interviewPrompts.map((b) => `- ${b}`).join("\n")}\n\n## Roles where these skills are used\n${d.career.roles.map((r) => `- ${r}`).join("\n")}\n\n${d.career.note}\n`, "learner");
  add("08_Credentials/evaluation_plan.md", `# Evaluation plan\n\n${DRAFT}\n\n## Pre/post skills assessment\n| Competency | Items | Bloom |\n|---|---|---|\n${d.evaluation.prePost.map((x) => `| ${x.outcome} | ${x.items} | ${x.bloom} |`).join("\n")}\n\n## Module feedback survey\n${d.evaluation.survey.map((x) => `- ${x}`).join("\n")}\n\n## Analytics\n${d.evaluation.analytics.map((x) => `- ${x}`).join("\n")}\n\n## Remediation\n${d.evaluation.remediation}\n`);
  // Datasets
  for (const ds of d.datasets) {
    add(ds.file, datasetCsv(ds), "learner", "complete");
    add(ds.file.replace(/\.csv$/, "_DATA_CARD.md"), dataCardMd(ds, spec), "learner", "complete");
  }
  // 9 Import package: Common Cartridge per block + Cloud Lab configs
  for (const cid of courseIds(store, offering)) {
    try {
      add(`09_Import_Package/${cid}.imscc`, exportCourse(store, a, cid), "instructor", "complete");
    } catch (e) {
      add(`09_Import_Package/${cid}.imscc.txt`, `Export not available: ${(e as Error).message}`, "instructor", "blocked");
    }
  }
  add("09_Import_Package/cloud_lab_config.json", JSON.stringify({ program: spec.code, image: d.notebooks ? "scholarion/python-ai:pinned-at-cohort-start" : null, track: d.track, datasets: d.datasets.map((x) => x.file), apiKeys: { scope: "learner", spendCapUsd: 10, rateLimitPerMin: 30, expiresDays: 30, masterKeysExposed: false }, egress: "allowlist", gradePassback: { lti: "AGS", posted: false }, notebooks: d.notebooks ? "starter to learners; solutions released per policy after the due date" : "n/a (no-code track)", status: "needs version pinning" }, null, 2));
  // 10 Quality gate
  const gate = designGate(store, spec.code);
  add("10_Quality_Gate/quality_gate.md", `# Quality gate — ${spec.code} ${spec.title}\n\n${DRAFT}\n\n| Check | Status | Detail |\n|---|---|---|\n${gate.checks.map((c) => `| ${c.label} | ${c.status.replace(/_/g, " ")} | ${c.detail.replace(/\|/g, "/")} |`).join("\n")}\n\n**Publishable:** ${gate.publishable ? "yes" : "not yet — resolve the items above."}\n`);
  add("10_Quality_Gate/status_report.md", `# Status report\n\n- **Complete:** catalog page, curriculum map, alignment matrix, syllabi, activity editions, ${d.notebooks ? "starter and solution notebooks (not executed)" : "tool walkthroughs"}, datasets with data cards, credential definitions, career hooks, evaluation plan, instructor guide, course shells.\n- **Drafted (AI DRAFT):** every authored text in this package.\n- **Needs SME review:** quiz and exam items (blueprints only), capstone exemplar, alignment links flagged for review, readings marked "SME to confirm".\n- **Tooling/licensing risks:** tool versions pinned at cohort start; no-code tools must be verified for education use.\n`);
  const manifest = {
    root,
    program: `${spec.code} ${spec.title}`,
    generatedAt: nowIso(),
    status: DRAFT,
    order: ["01_Catalog_Page", "02_Outcomes_and_Curriculum_Map", "03_Course_Block_Syllabi", "04_Module_Packages", "05_Assignments_Projects_Capstone", "06_Instructor_Guide", "07_Student_Edition", "08_Credentials", "09_Import_Package", "10_Quality_Gate", "datasets"],
    files: files.map((f) => ({ path: `${root}/${f.path}`, access: f.access, status: f.status, note: f.note ?? null })),
    gate: gate.checks.map((c) => ({ key: c.key, status: c.status })),
  };
  audit(store, a, "programs.design_package", `programs/${spec.code}`);
  return { zip: zipDeflate([...files.map((f) => ({ name: `${root}/${f.path}`, data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8") })), { name: `${root}/manifest.json`, data: Buffer.from(JSON.stringify(manifest, null, 2)) }]), root, manifest };
}

export { AI_POLICY };
