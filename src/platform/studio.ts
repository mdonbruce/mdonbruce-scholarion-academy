import { publish } from "./bus";
import { catalog } from "./catalog";
import { getDb, nowIso, save } from "./store";
import type { StudioOutput } from "./types";
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
    for (const [kind, title, content] of [
      ["flashcards", `Flashcards — Module ${mod.no}`, cards],
      ["study_guide", `Study guide — Module ${mod.no}`, guide],
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
