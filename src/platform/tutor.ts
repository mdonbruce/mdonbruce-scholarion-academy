import { publish } from "./bus";
import { catalog } from "./catalog";
import { entitlements } from "./entitlements";
import { getDb, nowIso, save } from "./store";
import type { AiUsePolicy, Item, TutorCitation, TutorMode, TutorReply } from "./types";
import { PlatformError } from "./util";

/**
 * AI Tutor (Integration Spec §9). Answers only from the learner's course materials,
 * always with citations, and enforces the item's ai_use_policy server-side.
 * Local stand-in: lexical retrieval + templated answers. Swap `compose()` for the
 * Haven Agentic AI model call when the tutor is CONNECTED; the policy gate stays here.
 */

const STOP = new Set("a an the and or but if of to in on for with is are was were be been it this that these those what which who how why when where do does did can could should would i you me my your we our please about from as at by into than then so not no yes".split(" "));
const SOLUTION_ASK = /\b(write|give|show|send|provide|paste)\b.{0,40}\b(code|solution|answer|function|program)\b|\b(solve|complete|finish|do)\b.{0,30}\b(lab|quiz|project|capstone|assignment|for me|this)\b|\bwhat('?s| is) the (correct )?answer\b|\bfull solution\b/i;

export const TUTOR_QUOTA = { audit: 3, full: 200 };

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

interface Chunk {
  item: Item;
  text: string;
  toks: Set<string>;
}

function chunksFor(courseId: string): Chunk[] {
  const out: Chunk[] = [];
  for (const item of catalog.items(courseId)) {
    if (item.aiUsePolicy === "closed") continue; // graded/closed content is never retrieval material
    const text = [item.body ?? "", item.video?.transcript ?? "", item.lab ? item.lab.instructions.join(". ") : ""].join("\n");
    for (const para of text.split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)) {
      const t = para.trim();
      if (t.length < 25) continue;
      out.push({ item, text: t, toks: new Set(tokens(t)) });
    }
  }
  for (const m of catalog.modules(courseId)) {
    const item = catalog.items(courseId, m.no).find((i) => i.title === "Overview");
    if (item) out.push({ item, text: `Module ${m.no} key topics: ${m.keyTopics.join(", ")}.`, toks: new Set(tokens(m.keyTopics.join(" ") + " " + m.title)) });
  }
  return out;
}

function retrieve(courseId: string, query: string, k = 3): Chunk[] {
  const q = tokens(query);
  if (!q.length) return [];
  return chunksFor(courseId)
    .map((c) => ({ c, s: q.reduce((acc, w) => acc + (c.toks.has(w) ? 1 : [...c.toks].some((t) => t.startsWith(w) || w.startsWith(t)) ? 0.5 : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.c);
}

function cite(chunks: Chunk[]): TutorCitation[] {
  const seen = new Set<string>();
  return chunks
    .filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)))
    .map((c) => ({ itemId: c.item.id, title: `Module ${c.item.moduleNo} · ${c.item.title}`, excerpt: c.text.length > 220 ? c.text.slice(0, 217) + "…" : c.text }));
}

/** Does the message reproduce a closed (graded) question? Overlap ≥ 60% of its words. */
function matchesClosedQuestion(courseId: string, message: string): Item | null {
  const m = new Set(tokens(message));
  if (m.size < 3) return null;
  for (const item of catalog.items(courseId).filter((i) => i.aiUsePolicy === "closed" && i.quiz)) {
    for (const q of item.quiz!.questions) {
      const qt = tokens(q.prompt);
      if (qt.length >= 3 && qt.filter((w) => m.has(w)).length / qt.length >= 0.6) return item;
    }
  }
  return null;
}

function usage(userId: string): { count: number; bump: () => void } {
  const db = getDb();
  const day = nowIso().slice(0, 10);
  let u = db.tutorUsage.find((x) => x.userId === userId && x.day === day);
  if (!u) {
    u = { userId, day, count: 0 };
    db.tutorUsage.push(u);
  }
  const rec = u;
  return {
    count: rec.count,
    bump: () => {
      rec.count++;
      save();
    },
  };
}

export const tutor = {
  ask(input: { userId: string; courseId: string; itemId?: string; mode: TutorMode; message: string }): TutorReply {
    const course = catalog.get(input.courseId);
    if (!course) throw new PlatformError("not_found", "Course not found", 404);
    const item = input.itemId ? catalog.item(input.itemId) : undefined;
    const policy: AiUsePolicy = item?.aiUsePolicy ?? "open";

    const full = entitlements.check(input.userId, "tutor.use", input.courseId).allow;
    const viewing = entitlements.check(input.userId, "content.view", input.courseId).allow;
    if (!full && !viewing) throw new PlatformError("not_enrolled", "Enroll in this course to use the AI Tutor.", 403);
    const u = usage(input.userId);
    const limit = full ? TUTOR_QUOTA.full : TUTOR_QUOTA.audit;
    if (u.count >= limit) {
      return { kind: "quota", text: full ? "You've reached today's AI Tutor limit. It resets at midnight UTC." : `Audit learners get ${TUTOR_QUOTA.audit} AI Tutor previews a day. Upgrade for full tutor access, or ask an instructor.`, citations: [], policy, canEscalate: true };
    }
    u.bump();
    const reply = this.compose(input.courseId, item, policy, input.mode, input.message);
    publish("tutor.message.answered", "tutor", `user/${input.userId}`, { userId: input.userId, courseId: input.courseId, itemId: item?.id ?? null, kind: reply.kind, policy });
    return reply;
  },

  compose(courseId: string, item: Item | undefined, policy: AiUsePolicy, mode: TutorMode, message: string): TutorReply {
    // 1. Closed items: explain the policy, point to review material, never discuss the item.
    if (policy === "closed") {
      const review = retrieve(courseId, `${item?.title ?? ""} ${catalog.module(courseId, item?.moduleNo ?? 1)?.keyTopics.join(" ") ?? ""}`, 2);
      return {
        kind: "refusal",
        text: `I can't help with "${item?.title ?? "this item"}" — it's a graded assessment, so AI help is turned off for it. Once you submit, I'm happy to go over the concepts. Until then, these lessons are the best review:`,
        citations: cite(review),
        policy,
        canEscalate: false,
      };
    }
    // 2. Questions copied from a graded quiz are refused wherever they're asked.
    const closed = matchesClosedQuestion(courseId, message);
    if (closed) {
      return {
        kind: "refusal",
        text: `That looks like a question from "${closed.title}", which is graded. I can't answer it, but I can explain the underlying idea if you ask about the concept in your own words.`,
        citations: cite(retrieve(courseId, message, 2)),
        policy: "closed",
        canEscalate: false,
      };
    }
    // 3. hints_only: no solution code, ever.
    if (policy === "hints_only" && SOLUTION_ASK.test(message)) {
      const hits = retrieve(courseId, `${message} ${item?.lab?.instructions.join(" ") ?? ""}`, 2);
      return {
        kind: "refusal",
        text: `I won't write the solution for this ${item?.kind ?? "activity"} — working it out is how the skill sticks. Here's a nudge instead: re-read the step you're on, decide what the function receives and what it must return, then write one line at a time and run it. The lesson below covers the idea you need.`,
        citations: cite(hits),
        policy,
        canEscalate: true,
      };
    }

    const hits = retrieve(courseId, message || item?.title || "", 3);
    if (!hits.length && mode !== "quiz_me" && mode !== "summarize") {
      return { kind: "unavailable", text: "I couldn't find that in this course's materials, so I won't guess. Try rephrasing with terms from the lesson, or ask an instructor.", citations: [], policy, canEscalate: true };
    }

    if (mode === "summarize") {
      const mod = catalog.module(courseId, item?.moduleNo ?? 1);
      const summary = catalog.items(courseId, mod?.no).find((i) => i.kind === "summary");
      return {
        kind: "answer",
        text: `Module ${mod?.no}: ${mod?.title}. ${mod?.overview} Key topics: ${mod?.keyTopics.join("; ")}.`,
        citations: summary ? [{ itemId: summary.id, title: `Module ${summary.moduleNo} · ${summary.title}`, excerpt: summary.body ?? "" }] : cite(hits),
        policy,
        canEscalate: false,
      };
    }

    if (mode === "quiz_me") {
      const mod = catalog.module(courseId, item?.moduleNo ?? 1);
      const topics = mod?.keyTopics ?? [];
      const t = topics[(message.length + topics.length) % Math.max(1, topics.length)] ?? "this module";
      return {
        kind: "answer",
        text: `Practice question (not graded): In two or three sentences, explain ${t.toLowerCase()} and give one example from the module scenario. Reply with your answer and I'll compare it with the course materials.`,
        citations: cite(retrieve(courseId, t, 2)),
        policy,
        canEscalate: false,
      };
    }

    const lead = policy === "hints_only" ? "Here's a hint grounded in the course materials" : "Here's what the course materials say";
    const body = hits
      .slice(0, 2)
      .map((h) => h.text.replace(/\s+/g, " "))
      .join(" ");
    return { kind: "answer", text: `${lead}: ${body}`, citations: cite(hits), policy, canEscalate: true };
  },
};
