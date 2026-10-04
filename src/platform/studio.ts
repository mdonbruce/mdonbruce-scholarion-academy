import { publish } from "./bus";
import { catalog } from "./catalog";
import { getDb, nowIso, save } from "./store";
import type { AudioOverview, MindMapNode, Module, StudioOutput } from "./types";
import { newId, PlatformError } from "./util";

/**
 * Scholarion Studio outputs (Integration Spec §11). Study aids generated from approved
 * module content; learners only ever see `published` outputs, after staff review.
 * Local stand-in generates deterministic drafts from module topics and readings.
 */

export interface Flashcard {
  front: string;
  back: string;
}

/**
 * Text-to-speech is not connected in this environment (no TTS service exists in the
 * platform), so audio overviews ship as a narrated script + transcript, labelled honestly.
 */
export const AUDIO_NOT_CONNECTED = "Script — audio narration not connected";

function audioOverview(mod: Module, courseTitle: string): AudioOverview {
  const script: AudioOverview["script"] = [
    { speaker: "Host", text: `Welcome to the audio overview for Module ${mod.no} of ${courseTitle}: ${mod.title}.` },
    { speaker: "Guide", text: mod.overview },
    ...(mod.objectives.length ? [{ speaker: "Host", text: `By the end of this module you should be able to: ${mod.objectives.join("; ")}.` }] : []),
    ...mod.keyTopics.map((t, i) => ({ speaker: i % 2 ? "Host" : "Guide", text: `Key topic ${i + 1}: ${t}. Look for it in this module's lesson and reading, and try explaining it in your own words.` })),
    ...(mod.scenario ? [{ speaker: "Guide", text: `The real-world scenario for this module: ${mod.scenario}` }] : []),
    { speaker: "Host", text: "That's the overview. Open the module to start the first item." },
  ];
  const transcript = script.map((l) => `${l.speaker}: ${l.text}`).join("\n");
  const words = transcript.split(/\s+/).length;
  return { script, transcript, estimatedMinutes: Math.max(1, Math.round(words / 150)), audioUrl: null, audioStatus: AUDIO_NOT_CONNECTED };
}

function mindMap(mod: Module): { root: MindMapNode } {
  const leaf = (label: string): MindMapNode => ({ label, children: [] });
  const children: MindMapNode[] = [];
  if (mod.objectives.length) children.push({ label: "Objectives", children: mod.objectives.map(leaf) });
  if (mod.keyTopics.length) children.push({ label: "Key topics", children: mod.keyTopics.map(leaf) });
  if (mod.scenario) children.push({ label: "Real-world scenario", children: [leaf(mod.scenario)] });
  return { root: { label: `Module ${mod.no}: ${mod.title}`, children } };
}

export const studio = {
  generate(courseId: string, moduleNo: number): StudioOutput[] {
    const mod = catalog.module(courseId, moduleNo);
    if (!mod) throw new PlatformError("not_found", "Module not found", 404);
    const db = getDb();
    const out: StudioOutput[] = [];
    const cards: Flashcard[] = mod.keyTopics.map((t) => ({ front: t, back: `${t}: covered in Module ${mod.no} (${mod.title}). Review the lesson and reading for a worked example.` }));
    const guide = {
      title: `Study guide — Module ${mod.no}`,
      sections: [
        { heading: "What this module covers", text: mod.overview },
        { heading: "Objectives", text: mod.objectives.join("; ") },
        { heading: "Check yourself", text: mod.keyTopics.map((t) => `Can you explain ${t.toLowerCase()} without notes?`).join(" ") },
      ],
    };
    const courseTitle = catalog.get(courseId)?.title ?? getDb().products.find((p) => p.id === courseId)?.title ?? "this course";
    for (const [kind, title, content] of [
      ["flashcards", `Flashcards — Module ${mod.no}`, cards],
      ["study_guide", `Study guide — Module ${mod.no}`, guide],
      ["audio_overview", `Audio overview (script) — Module ${mod.no}`, audioOverview(mod, courseTitle)],
      ["mind_map", `Mind map — Module ${mod.no}`, mindMap(mod)],
    ] as const) {
      if (db.studio.some((s) => s.courseId === courseId && s.moduleNo === moduleNo && s.kind === kind)) continue;
      const o: StudioOutput = { id: newId("std"), courseId, moduleNo, kind, title, content, state: "draft", createdAt: nowIso() };
      db.studio.push(o);
      out.push(o);
    }
    save();
    return out;
  },

  approve(outputId: string, instructorId: string): StudioOutput {
    const o = getDb().studio.find((s) => s.id === outputId);
    if (!o) throw new PlatformError("not_found", "Output not found", 404);
    o.state = "published";
    o.approvedBy = instructorId;
    publish("studio.output.published", "studio", `course/${o.courseId}`, { outputId: o.id, courseId: o.courseId, moduleNo: o.moduleNo, kind: o.kind });
    save();
    return o;
  },

  /** GET /v1/studio/outputs?item_id= — learners see published only. */
  forModule(courseId: string, moduleNo: number, includeDrafts = false): StudioOutput[] {
    return getDb().studio.filter((s) => s.courseId === courseId && s.moduleNo === moduleNo && (includeDrafts || s.state === "published"));
  },

  drafts(): StudioOutput[] {
    return getDb().studio.filter((s) => s.state === "draft");
  },
};
