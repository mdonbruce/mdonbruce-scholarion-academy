import { CampusError, nowIso, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { audit } from "../common";
import { zip } from "../files";
import { LEAD_FACULTY, fitSize } from "../../../brand/faculty";
import { facultyDataUri } from "../../../brand/faculty-assets";
import { listOutputs, readOutput, RUNS } from "./pipeline";
import { canSeeInstructor, isLearnerOf } from "./sources";

/**
 * Module export in the "Studio master prompt" layout:
 *   [COURSE_CODE]_Module_[NN]_Studio/00_Cover … 17_Requirements_Videos + manifest.json
 * Built from the topic runs of one module. Files are mapped from the generated outputs; anything
 * that needs a renderer or execution (PNG, PPTX, MP3, MP4, executed notebooks) is listed in the
 * manifest as "needs render" / "needs execution" instead of being faked.
 */

type Entry = { path: string; data: Buffer | string; topic: string | null; type: string; status: string; sources: string[]; access: "learner" | "instructor"; note?: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");

function vttToSrt(vtt: string) {
  const cues = vtt.replace(/\r/g, "").split(/\n\n+/).filter((b) => b.includes("-->"));
  return cues.map((b, i) => {
    const lines = b.split("\n").filter((l) => !/^WEBVTT/.test(l));
    const ti = lines.findIndex((l) => l.includes("-->"));
    const time = lines[ti].replace(/\./g, ",").replace(/(^|\s)(\d{2}:\d{2},\d{3})/g, "$100:$2");
    return `${i + 1}\n${time}\n${lines.slice(ti + 1).join("\n")}`;
  }).join("\n\n") + "\n";
}

function notebook(cells: { type: "markdown" | "code"; source: string }[], title: string) {
  return JSON.stringify({
    cells: cells.map((c) => (c.type === "markdown" ? { cell_type: "markdown", metadata: {}, source: c.source.split(/(?<=\n)/) } : { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source: c.source.split(/(?<=\n)/) })),
    metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, language_info: { name: "python" }, title },
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 1);
}

function photo() {
  const f = LEAD_FACULTY;
  const size = fitSize(f.photo, 190, 222);
  return `<img src="${facultyDataUri(f) ?? f.photo.src}" width="${size.width}" height="${size.height}" alt="${esc(f.photo.alt)}" style="border-radius:12px;object-fit:cover;object-position:top">`;
}

function coursePage(code: string, title: string, moduleNo: number, moduleTitle: string, topics: string[]) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(code)} Module ${pad(moduleNo)} — course cover page</title><style>body{margin:0;font-family:Arial,sans-serif;background:#0b1f4d;color:#fff}main{max-width:960px;margin:0 auto;padding:48px}h1{font:700 44px/1.1 Georgia,serif;margin:8px 0}.who{display:flex;gap:20px;align-items:center;margin-top:28px}.gold{color:#f2c66d}li{margin:6px 0}</style></head><body><main>
<p class="gold"><strong>Scholarion Academy</strong></p><p>${esc(code)} · ${esc(title)}</p><h1>Module ${pad(moduleNo)}: ${esc(moduleTitle)}</h1>
<h2>Topics</h2><ol>${topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
<div class="who">${photo()}<div><p><strong>${esc(LEAD_FACULTY.name)}</strong></p><p>${esc(LEAD_FACULTY.role)}, Scholarion Academy</p></div></div>
<p style="font-size:13px;margin-top:32px">AI DRAFT — requires instructor review before release. Provisional Scholarion design until cover samples are supplied.</p></main></body></html>`;
}

function titleCard(code: string, moduleNo: number, label: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Video title card — ${esc(label)}</title><style>body{margin:0;background:#000}.c{width:1280px;height:720px;background:#0b1f4d;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box}h1{font:700 48px/1.1 Georgia,serif;margin:8px 0}.gold{color:#f2c66d}</style></head><body><section class="c" aria-label="Video title card">${photo()}<div><p class="gold"><strong>Scholarion Academy</strong> · ${esc(code)} · Module ${pad(moduleNo)}</p><h1>${esc(label)}</h1><p><strong>${esc(LEAD_FACULTY.name)}</strong> — ${esc(LEAD_FACULTY.role)}</p></div></section></body></html>`;
}

export function moduleStudioBundle(store: TenantStore, a: Actor, courseKey: string, moduleNumber: number): { zip: Buffer; manifest: unknown; root: string } {
  const staff = canSeeInstructor(store, a, courseKey);
  if (!staff && !isLearnerOf(store, a, courseKey)) throw new CampusError("forbidden", "These Studio outputs aren't available to you.", 403);
  const runs = store.list(RUNS, (r) => r.courseKey === courseKey && Number(r.module) === Number(moduleNumber) && (staff || !!r.releasedVersion)).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  if (!runs.length) throw new CampusError("not_found", "No Studio topics for this module yet.", 404);
  const input = runs[0].input as { courseCode: string; courseTitle: string; moduleTitle: string };
  const code = String(input.courseCode).replace(/[^A-Za-z0-9]+/g, "");
  const root = `${code}_Module_${pad(moduleNumber)}_Studio`;
  const entries: Entry[] = [];
  const add = (path: string, data: Buffer | string, topic: string | null, type: string, status = "complete", sources: string[] = [], access: "learner" | "instructor" = "learner", note?: string) => entries.push({ path, data, topic, type, status, sources, access, note });
  const todo = (path: string, topic: string | null, type: string, status: string, note: string, access: "learner" | "instructor" = "learner") => entries.push({ path, data: "", topic, type, status, sources: [], access, note });
  const topics = runs.map((r) => String(r.topic));
  add("00_Cover/course_cover_page.html", coursePage(input.courseCode, input.courseTitle, moduleNumber, input.moduleTitle, topics), null, "course_cover_page");
  add("00_Cover/video_title_card.html", titleCard(input.courseCode, moduleNumber, input.moduleTitle), null, "video_title_card");
  todo("00_Cover/video_title_card.png", null, "video_title_card", "needs render", "Render the HTML title card at 1280×720 (no renderer configured).");
  todo("00_Cover/cover_slide.png", null, "cover_slide", "needs render", "Render 00_Cover/cover_slide.html at 1920×1080.");
  runs.forEach((run, i) => {
    const TT = `Topic_${pad(i + 1)}`;
    const topic = String(run.topic);
    let outs: ReturnType<typeof listOutputs> = [];
    try {
      outs = listOutputs(store, a, run.id);
    } catch {
      return;
    }
    const get = (rel: string) => {
      const o = outs.find((x) => x.relPath === rel);
      if (!o) return null;
      try {
        const r = readOutput(store, a, String(o.id));
        return { text: typeof r.content === "string" ? r.content : r.content.toString("utf8"), refs: (o.sourceRefs as string[]) ?? [], status: String(o.status), access: String(o.access) as "learner" | "instructor", meta: o.meta as Record<string, unknown> | null };
      } catch {
        return null;
      }
    };
    const put = (rel: string, to: string, type: string) => {
      const g = get(rel);
      if (g) add(to, g.text, topic, type, g.status === "ready" ? "complete" : g.status, g.refs, g.access);
      return g;
    };
    if (i === 0) {
      put("03_Lecture_Deck/cover_variant_A.html", "00_Cover/cover_slide.html", "cover_slide");
    }
    const dd = put("04_Audio/deep_dive_script.md", `01_Audio_Overview/${TT}_audio_overview_script.md`, "audio_overview");
    const words = Number(dd?.meta?.words ?? 0);
    if (dd && words && words < 2300) {
      const e = entries[entries.length - 1];
      e.note = `${words} words (~${Math.round(words / 145)} min); the target is ~2,300–2,500 (~16 min). Add more sources to lengthen it — the Studio doesn't pad beyond the sources.`;
    }
    todo(`01_Audio_Overview/${TT}_audio_overview.mp3`, topic, "audio_overview", "needs render", "No text-to-speech provider is configured.");
    put("07_Study_Guides_and_Flashcards/study_guide.md", `02_Study_Guides/${TT}_study_guide.md`, "study_guide");
    put("06_Infographics_and_Mind_Maps/mind_map.mmd", `03_Mind_Maps/${TT}_mindmap.mmd`, "mind_map");
    todo(`03_Mind_Maps/${TT}_mindmap.svg`, topic, "mind_map", "needs render", "Render the Mermaid file (no renderer configured).");
    put("03_Lecture_Deck/lecture_deck.html", `04_Lecture_Decks/${TT}_lecture_deck.html`, "lecture_deck");
    put("03_Lecture_Deck/speaker_notes.md", `04_Lecture_Decks/${TT}_speaker_notes.md`, "speaker_notes");
    todo(`04_Lecture_Decks/${TT}_lecture_deck.pptx`, topic, "lecture_deck", "needs render", "Export the 10-slide HTML deck to PowerPoint (no PPTX renderer configured).");
    put("04_Audio/audio_lecture_script.md", `05_Audio_Lectures/${TT}_audio_lecture_script.md`, "audio_lecture");
    todo(`05_Audio_Lectures/${TT}_audio_lecture.mp3`, topic, "audio_lecture", "needs render", "No text-to-speech provider is configured.");
    put("02_Overview_and_Lessons/lecture_overview.md", `06_Lecture_Overviews/${TT}_lecture_overview.md`, "lecture_overview");
    put("06_Infographics_and_Mind_Maps/infographic_alt_text.md", `07_Infographics/${TT}_infographic_spec.md`, "infographic");
    put("06_Infographics_and_Mind_Maps/infographic.html", `07_Infographics/${TT}_infographic.html`, "infographic");
    todo(`07_Infographics/${TT}_infographic.png`, topic, "infographic", "needs render", "Render the HTML infographic at 1920×1080.");
    put("02_Overview_and_Lessons/lecture_notes.md", `08_Lecture_Notes/${TT}_lecture_notes.md`, "lecture_notes");
    const setup = ["setup_guide.md", "resource_limits.md", "healthcheck.md", "troubleshooting.md"].map((f) => get(`13_Environment_Templates/lab_env/${f}`)?.text ?? "").filter(Boolean).join("\n\n");
    if (setup) add(`09_Lab_Environments/${TT}_lab_setup.md`, setup, topic, "lab_environment");
    // Programming environment: notebooks built from the starter repo. Solutions are NOT executed here.
    const starter = get("13_Environment_Templates/programming_env/starter_repo/src/lab.py")?.text ?? "";
    const tests = get("13_Environment_Templates/programming_env/starter_repo/tests/test_lab.py")?.text ?? "";
    const seed = get("13_Environment_Templates/lab_env/seed/topic_seed.csv")?.text ?? "";
    if (starter) {
      const head = { type: "markdown" as const, source: `# ${topic} — programming lab\n\n${input.courseCode} · Module ${pad(moduleNumber)} · ${LEAD_FACULTY.name}, ${LEAD_FACULTY.role}, Scholarion Academy\n\nWrite the seed data, complete the TODO, then run the tests.\n` };
      const seedCell = { type: "code" as const, source: `SEED = """${seed.replace(/"""/g, "'''")}"""\nwith open("topic_seed.csv", "w", encoding="utf-8") as fh:\n    fh.write(SEED)\n` };
      const testCell = { type: "code" as const, source: tests.replace("from src.lab import find_concept\n", "") + `\ntest_find_concept_is_case_insensitive()\ntest_find_concept_missing_returns_none()\nprint("All tests passed")\n` };
      add(`10_Programming/${TT}_student_starter.ipynb`, notebook([head, seedCell, { type: "code", source: starter.replace(/^"""[\s\S]*?"""\n/, "") }, testCell], `${topic} — student starter`), topic, "programming_env");
      const solution = starter.replace(/"""TODO: ([\s\S]*?)"""\n    raise NotImplementedError/, '"""$1"""\n    target = name.strip().lower()\n    for row in rows:\n        if str(row.get("concept", "")).strip().lower() == target:\n            return row\n    return None');
      add(`10_Programming/${TT}_instructor_solution.ipynb`, notebook([head, seedCell, { type: "code", source: solution.replace(/^"""[\s\S]*?"""\n/, "") }, testCell, { type: "code", source: 'rows = load_concepts("topic_seed.csv")\nprint(len(rows), "concepts loaded")\nprint(find_concept(rows, rows[0]["concept"]) if rows else None)\n' }], `${topic} — instructor solution`), topic, "programming_env", "complete", [], "instructor", "Solution notebook (not yet executed).");
      todo(`10_Programming/${TT}_instructor_solution_EXECUTED.ipynb`, topic, "programming_env", "needs execution", "Run the instructor solution top to bottom in Jupyter/Colab and save it with outputs; the Studio doesn't execute code.", "instructor");
    }
    if (i === 0) {
      put("13_Environment_Templates/programming_env/requirements.txt", "10_Programming/requirements.txt", "programming_env");
      put("13_Environment_Templates/devops_env/Dockerfile", "11_DevOps/Dockerfile", "devops_env");
      put("13_Environment_Templates/programming_env/.devcontainer/devcontainer.json", "11_DevOps/devcontainer.json", "devops_env");
      put("13_Environment_Templates/lab_env/docker-compose.yml", "11_DevOps/docker-compose.yml", "devops_env");
    }
    put("07_Study_Guides_and_Flashcards/flashcards.csv", `12_Flashcards/${TT}_flashcards.csv`, "flashcards");
    put("08_Practice_Quizzes/practice_quiz_student.md", `13_Practice_Quizzes/${TT}_quiz_student.md`, "practice_quiz");
    put("08_Practice_Quizzes/practice_quiz_key.md", `13_Practice_Quizzes/${TT}_quiz_answer_key.md`, "practice_quiz_key");
    put("01_Sources/reading_list.md", `14_Sources/${TT}_sources.md`, "sources");
    for (const o of outs.filter((x) => /^12_Assessments_and_Rubrics\/rubric_.*\.md$/.test(String(x.relPath)))) put(String(o.relPath), `15_Rubrics/${String(o.relPath).split("/")[1].replace(/^rubric_/, "").replace(/\.md$/, "")}_rubric.md`, "rubric");
    put("09_Student_Labs/minilab_1.html", `16_Mini_Labs/${TT}_MiniLab_1.html`, "mini_lab");
    put("09_Student_Labs/minilab_2.html", `16_Mini_Labs/${TT}_MiniLab_2.html`, "mini_lab");
    for (const o of outs.filter((x) => /^05_Video\/.*_requirements_(script|storyboard)\.md$/.test(String(x.relPath)))) put(String(o.relPath), `17_Requirements_Videos/${String(o.relPath).split("/")[1]}`, "requirements_video");
    for (const o of outs.filter((x) => /^05_Video\/.*_requirements\.vtt$/.test(String(x.relPath)))) {
      const g = get(String(o.relPath));
      if (g) add(`17_Requirements_Videos/${String(o.relPath).split("/")[1].replace(/\.vtt$/, ".srt")}`, vttToSrt(g.text), topic, "requirements_video_captions", "complete", g.refs);
      todo(`17_Requirements_Videos/${String(o.relPath).split("/")[1].replace(/\.vtt$/, ".mp4")}`, topic, "requirements_video", "needs render", "Render at 1280×720 (~5 minutes) opening on 00_Cover/video_title_card; no narrated-video renderer is configured.");
    }
  });
  // Deduplicate rubric/requirements files that repeat across topics (same assessment).
  const seen = new Set<string>();
  const unique = entries.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)));
  const visible = unique.filter((e) => staff || e.access === "learner");
  const manifest = {
    label: "AI DRAFT — requires instructor review before release.",
    root,
    generatedAt: nowIso(),
    course: `${input.courseCode} ${input.courseTitle}`,
    module: `Module ${pad(moduleNumber)}: ${input.moduleTitle}`,
    topics: topics.map((t, i) => ({ id: `Topic_${pad(i + 1)}`, title: t })),
    files: visible.map((e) => ({ path: `${root}/${e.path}`, topic: e.topic, type: e.type, status: e.status, sources: e.sources, access: e.access, note: e.note ?? null })),
    checks: {
      allTopicsComplete: topics.length > 0,
      studentFilesWithoutAnswers: visible.filter((e) => e.access === "learner").every((e) => !/answer_key|instructor_solution/.test(e.path)),
      needsRender: visible.filter((e) => e.status === "needs render").length,
      needsExecution: visible.filter((e) => e.status === "needs execution").length,
    },
  };
  const files = visible.filter((e) => (typeof e.data === "string" ? e.data.length : e.data.length) > 0).map((e) => ({ name: `${root}/${e.path}`, data: Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8") }));
  files.push({ name: `${root}/manifest.json`, data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  audit(store, a, "studio.module_bundle", `${RUNS}/${courseKey}/${moduleNumber}`, staff ? "staff" : "learner");
  return { zip: zip(files), manifest, root };
}
