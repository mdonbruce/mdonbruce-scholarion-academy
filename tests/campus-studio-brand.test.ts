import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus } from "./campus-helpers";
import { CampusError } from "../src/campus/core";
import { toPptx, pptxNotes } from "../src/documents/pptx";
import { pptxToDoc } from "../src/documents/read";
import { unzip } from "../src/documents/zip";
import {
  addSource,
  addSourceAndRefresh,
  checkRunMiniLab,
  getProfile,
  listOutputs,
  readOutput,
  rebuildTarget,
  releaseRun,
  setProfile,
  startRun,
  studioLmsPackage,
  moduleStudioBundle,
  twoTone,
  type StudioInput,
} from "../src/campus/services/studio";

/** Studio auto-generator: PowerPoint, branding profile, 1920×1080 covers, hint ladder, bib, chapters, rubrics, targeted rebuilds, LMS export. */

/* Original fixture prose written for this test. */
const NOTES = `
A vector store is a database that indexes embeddings so that similar items can be found quickly. An embedding is a list of numbers that represents the meaning of a piece of text. Retrieval is the step that finds the passages most relevant to a question. Chunking is the practice of splitting long documents into smaller passages before they are embedded.
First, the pipeline loads the source documents. Next, it splits them into chunks of a few hundred words. Then it embeds each chunk and stores the vectors with their text. After that, a question is embedded the same way and compared with the stored vectors. Finally, the closest chunks are passed to the model as context.
A common mistake is to use chunks that are too large, which dilutes the relevant passage. Another mistake is to forget to store the source of each chunk, which makes citations impossible.
For example, a course assistant can retrieve the two most relevant paragraphs from the syllabus before answering a learner's question about deadlines.
In practice, teams evaluate retrieval by checking whether the right passage appears in the top results for a fixed set of questions.
`;

const COURSE = "crs_demo_cs101";
const BASE: StudioInput = {
  courseKey: COURSE,
  courseCode: "CS-101",
  courseTitle: "Foundations of Programming",
  programTitle: "Agentic Systems Pathway",
  moduleNumber: 4,
  moduleTitle: "Retrieval",
  topicTitle: "Retrieval Pipelines",
  objectives: ["Explain how a retrieval pipeline finds relevant passages.", "Configure chunking for a document set."],
  level: "Intermediate",
  duration: "90 min",
  assessments: [{ key: "lab4", title: "Retrieval Lab", kind: "lab", points: 100 }],
};
const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
let RUN = "";
const staff = () => as("demo", "instructor");
const out = (rel: string) => {
  const s = staff();
  const o = listOutputs(s.store, s.actor, RUN).find((x) => x.relPath === rel);
  assert.ok(o, `missing ${rel}`);
  return readOutput(s.store, s.actor, String(o!.id));
};
const text = (rel: string) => {
  const c = out(rel).content;
  return typeof c === "string" ? c : c.toString("utf8");
};

before(async () => {
  freshCampus();
  const { store, actor } = staff();
  await addSource(store, actor, { courseKey: COURSE, module: 4, topic: BASE.topicTitle, kind: "text", title: "Retrieval notes", author: "Idahosa, M.", year: "2026", body: NOTES });
  setProfile(store, actor, COURSE, { motto: "Build it, test it, explain it.", accent: "#e0a526", format: "Live online + labs", keyTopics: ["Embeddings", "Chunking", "Retrieval"] });
  RUN = startRun(store, actor, BASE, { render: false }).id;
});

describe("PowerPoint writer", () => {
  it("writes a valid 16:9 deck with titles, speaker notes and an embedded picture", () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const b = toPptx({ title: "T", images: [{ data: png, type: "png" }], slides: [{ shapes: [{ t: "text", title: true, x: 0, y: 0, w: 800, h: 100, paras: [{ text: "Hello & <world>" }] }, { t: "image", x: 10, y: 200, w: 127, h: 148, image: 0, alt: "Photo" }], notes: "Say hello." }, { shapes: [{ t: "text", title: true, x: 0, y: 0, w: 800, h: 100, paras: [{ text: "Two" }] }] }] });
    const files = unzip(b);
    assert.ok(files.some((f) => f.name === "ppt/media/image1.png"));
    assert.match(files.find((f) => f.name === "ppt/presentation.xml")!.data.toString(), /<p:sldSz cx="12192000" cy="6858000"\/>/);
    assert.deepEqual(pptxNotes(files), ["Say hello.", ""]);
    assert.equal(pptxToDoc(b, "T").blocks[0].t === "h" && (pptxToDoc(b, "T").blocks[0] as { text: string }).text, "Slide 1: Hello & <world>");
  });

  it("splits a course code into two tones", () => {
    assert.deepEqual(twoTone("AI-801"), ["AI-", "801"]);
    assert.deepEqual(twoTone("CS 101"), ["CS ", "101"]);
    assert.deepEqual(twoTone("CAPSTONE"), ["CAPSTONE", ""]);
  });
});

describe("Studio outputs", () => {
  it("produces the 10-slide PowerPoint deck with notes and the approved photo, plus cover A and B PowerPoints", () => {
    const deck = out("03_Lecture_Deck/lecture_deck.pptx");
    assert.equal(deck.status, "ready");
    const files = unzip(deck.content as Buffer);
    assert.equal(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name)).length, 10);
    const notes = pptxNotes(files);
    assert.ok(notes.every((n) => n.length > 20), "every slide has speaker notes");
    assert.ok(files.some((f) => f.name.startsWith("ppt/media/image1.png")), "faculty photo embedded");
    const s1 = files.find((f) => f.name === "ppt/slides/slide1.xml")!.data.toString();
    assert.match(s1, /Dr\. Martins Idahosa/);
    assert.match(s1, /Lead Faculty &amp; Director of AI Innovation/);
    // Photo kept at its approved proportions (127×148 → never upscaled).
    assert.match(s1, /<a:ext cx="806450" cy="939800"\/>/);
    for (const v of ["A", "B"]) assert.equal(unzip(out(`03_Lecture_Deck/cover_slide_${v}.pptx`).content as Buffer).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name)).length, 1);
  });

  it("covers are 1920×1080 with motto band, two-tone code, module banner and a six-cell footer; B adds topics, process and outcomes", () => {
    const a = text("03_Lecture_Deck/cover_variant_A.html");
    const b = text("03_Lecture_Deck/cover_variant_B.html");
    for (const h of [a, b]) {
      assert.match(h, /width:1920px;height:1080px/);
      assert.match(h, /Build it, test it, explain it\./);
      assert.match(h, /MODULE 04/);
      for (const l of ["COURSE", "MODULE", "LEVEL", "DURATION", "FORMAT", "INSTRUCTOR"]) assert.match(h, new RegExp(`>${l}<`));
      assert.match(h, /Live online \+ labs/);
      assert.match(h, /">101<\/span>/);
      assert.match(h, /alt="Dr\. Martins Donbruce Idahosa/);
    }
    assert.match(a, /color:#e0a526;font-weight:700;">101</); // accent tone on the dark cover
    assert.doesNotMatch(a, /Key topics/);
    assert.match(b, /Key topics[\s\S]*Embeddings[\s\S]*How this module runs[\s\S]*Outcomes checklist/);
    assert.match(text("03_Lecture_Deck/cover_design_notes.md"), /From the course branding profile/);
  });

  it("only course staff set the branding profile; colours are validated", () => {
    const st = as("demo", "student1", false);
    assert.equal(status(() => setProfile(st.store, st.actor, COURSE, { motto: "x" })), 403);
    const s = staff();
    assert.equal(status(() => setProfile(s.store, s.actor, COURSE, { primary: "navy" })), 422);
    assert.equal(getProfile(s.store, COURSE)?.motto, "Build it, test it, explain it.");
  });

  it("writes sources_master.bib from the supplied details only", () => {
    const bib = text("01_Sources/sources_master.bib");
    assert.match(bib, /@misc\{Idahosa2026_S1,/);
    assert.match(bib, /author = \{Idahosa, M\.\}/);
    assert.match(bib, /AI DRAFT/);
  });

  it("adds audio chapters (one per slide) on the caption clock", () => {
    const ch = JSON.parse(text("04_Audio/audio_lecture_chapters.json")) as { chapters: { startTime: number; title: string }[] };
    assert.equal(ch.chapters.length, 10);
    assert.equal(ch.chapters[0].startTime, 0);
    assert.ok(ch.chapters.every((c, i) => i === 0 || c.startTime > ch.chapters[i - 1].startTime));
    assert.match(text("04_Audio/audio_lecture_chapters.vtt"), /^WEBVTT[\s\S]*Slide 10: Summary and readings/);
  });

  it("adds a student rubric (learner) and calibration notes (instructor)", () => {
    const st = out("12_Assessments_and_Rubrics/rubric_lab4_student.md");
    assert.equal(st.access, "learner");
    assert.match(String(st.content), /What Good Looks Like[\s\S]*- \[ \]/);
    const cal = out("12_Assessments_and_Rubrics/rubric_lab4_calibration.md");
    assert.equal(cal.access, "instructor");
    assert.match(String(cal.content), /Norming routine/);
  });
});

describe("Mini-lab hint ladder and solutions", () => {
  it("each task has three hints in the page and no answers; reset and show-solution are present", () => {
    const h = text("09_Student_Labs/minilab_1.html");
    const data = JSON.parse(/<script type="application\/json" id="hint-data">([\s\S]*?)<\/script>/.exec(h)![1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&")) as Record<string, string[]>;
    assert.ok(Object.values(data).length >= 3 && Object.values(data).every((x) => x.length === 3));
    assert.match(h, /id="reset"/);
    assert.match(h, /id="sol"/);
    assert.doesNotMatch(h, /data-answer|"answer"\s*:/);
  });

  it("the solution unlocks for learners only after two checks; staff can see it any time", () => {
    const s = staff();
    releaseRun(s.store, s.actor, RUN);
    const st = as("demo", "student1", false);
    assert.equal(status(() => checkRunMiniLab(st.store, st.actor, RUN, "minilab_1", {}, { reveal: true })), 409);
    assert.equal(checkRunMiniLab(st.store, st.actor, RUN, "minilab_1", {}).checks, 1);
    assert.equal(status(() => checkRunMiniLab(st.store, st.actor, RUN, "minilab_1", {}, { reveal: true })), 409);
    checkRunMiniLab(st.store, st.actor, RUN, "minilab_1", {});
    const r = checkRunMiniLab(st.store, st.actor, RUN, "minilab_1", {}, { reveal: true });
    assert.ok(r.solution && r.solution.length === r.total && r.solution.every((x) => x.answer));
    assert.ok(checkRunMiniLab(s.store, s.actor, RUN, "minilab_2", {}, { reveal: true }).solution);
  });
});

describe("Targeted rebuilds, LMS package and source refresh", () => {
  it("a released version can't be rebuilt in place", () => {
    const s = staff();
    assert.equal(status(() => rebuildTarget(s.store, s.actor, RUN, "cover_b")), 409);
    assert.equal(status(() => rebuildTarget(s.store, s.actor, RUN, "nope")), 422);
  });

  it("adding a source regenerates the topic as a new version that cites it", async () => {
    const s = staff();
    const r = await addSourceAndRefresh(s.store, s.actor, { courseKey: COURSE, module: 4, topic: BASE.topicTitle, kind: "text", title: "Evaluation notes", body: "Recall at k is the share of questions whose correct passage appears in the top k results. A reranker is a model that reorders retrieved passages by relevance." });
    assert.ok(r.regenerated);
    assert.equal(r.regenerated!.version, 2);
    assert.match(text("01_Sources/reading_list.md"), /Evaluation notes/);
  });

  it("rebuild cover B touches only cover B and refreshes the manifest", () => {
    const s = staff();
    setProfile(s.store, s.actor, COURSE, { motto: "Second motto for cover B." });
    const r = rebuildTarget(s.store, s.actor, RUN, "cover_b");
    assert.deepEqual(r.rebuilt.sort(), ["03_Lecture_Deck/cover_slide_B.pptx", "03_Lecture_Deck/cover_variant_B.html"]);
    assert.match(text("03_Lecture_Deck/cover_variant_B.html"), /Second motto for cover B\./);
    assert.match(text("03_Lecture_Deck/cover_variant_A.html"), /Build it, test it, explain it\./); // not rebuilt
  });

  it("exports a Common Cartridge with web content, QTI practice quiz and an import note; staff only", () => {
    const s = staff();
    const p = studioLmsPackage(s.store, s.actor, RUN);
    const files = unzip(p.zip);
    const manifest = files.find((f) => f.name === "imsmanifest.xml")!.data.toString();
    assert.match(manifest, /IMS Common Cartridge/);
    assert.match(manifest, /web_resources\/03_Lecture_Deck\/lecture_deck\.pptx/);
    assert.ok(files.some((f) => f.name === "assessments/practice_quiz.xml"));
    assert.ok(!files.some((f) => /answer_key|minilab_keys|_calibration/.test(f.name)), "instructor files stay out of web content");
    assert.equal(status(() => studioLmsPackage(s.store, as("demo", "student1", false).actor, RUN)), 403);
  });

  it("the module folder carries the real PowerPoint deck and cover files (binary intact)", () => {
    const s = staff();
    const b = moduleStudioBundle(s.store, s.actor, COURSE, 4);
    const files = unzip(b.zip);
    const deck = files.find((f) => f.name.endsWith("04_Lecture_Decks/Topic_01_lecture_deck.pptx"))!;
    assert.ok(deck, "deck in bundle");
    assert.equal(unzip(deck.data).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name)).length, 10);
    assert.ok(files.some((f) => f.name.endsWith("00_Cover/cover_slide.pptx")));
    assert.ok(!(b.manifest as { files: { path: string; status: string }[] }).files.some((f) => /lecture_deck\.pptx$/.test(f.path) && f.status === "needs render"));
  });
});
