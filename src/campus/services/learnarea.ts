import { CampusError, type Row, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { AI801, AI801_ACTIVITY, AI801_TOPICS } from "../academy/ai801";
import { AI801_LAB_KEY } from "../academy/ai801-seed";
import { LEAD_FACULTY } from "../../brand/faculty";
import { courseGradebook, itemView } from "./graded";
import { lockState } from "./projection";
import { effectivePolicy, listMyWorkspaces, listTemplates } from "./workspace";
import { SIM_SCENARIOS } from "../academy/sim-scenarios";
import type { StudioInput } from "./studio";

/**
 * The Scholarion hosted learning area: one place per course with 15 sections. This module
 * assembles what each section shows for the signed-in person; every action goes through the
 * graded, workspace, Studio and projection services, which enforce permissions themselves.
 */

export const LEARN_SECTIONS = [
  { slug: "dashboard", title: "Course Dashboard" },
  { slug: "modules", title: "Modules and Topics" },
  { slug: "sources", title: "Sources and Reading Library" },
  { slug: "lecture-studio", title: "Lecture Studio" },
  { slug: "cloud-labs", title: "Agentic Cloud Labs" },
  { slug: "mini-labs", title: "Interactive Mini-Labs" },
  { slug: "activities", title: "Hands-On In-Class Activities" },
  { slug: "assignments", title: "Assignments and Projects" },
  { slug: "quizzes", title: "Quizzes and Practice" },
  { slug: "workspaces", title: "Saved Workspaces" },
  { slug: "demos", title: "Application Demonstrations" },
  { slug: "gradebook", title: "Gradebook and Passbook" },
  { slug: "instructor", title: "Instructor Control Panel", staff: true },
  { slug: "environment", title: "Environment and Tool Permissions" },
  { slug: "outputs", title: "Studio Output Library" },
] as const;
export type LearnSection = (typeof LEARN_SECTIONS)[number]["slug"];

export function isCourseStaff(a: Actor, courseId: string) {
  return hasAny(a, ["admin", "designer"]) || hasAny(a, ["instructor", "ta"], courseId);
}

function courseRow(store: TenantStore, a: Actor, courseId: string) {
  const c = store.get("courses", courseId);
  if (!c) throw new CampusError("not_found", "Course not found", 404);
  if (!isCourseStaff(a, courseId) && !hasAny(a, ["student", "observer"], courseId)) throw new CampusError("forbidden", "Enroll in this course to open its learning area.", 403);
  return c;
}

/** Studio input for one AI-801 topic, grounded in the module brief and that topic's instructor notes. */
export function studioInputFor(store: TenantStore, courseId: string, topicKey: string): StudioInput {
  const t = AI801_TOPICS.find((x) => x.key === topicKey);
  if (!t) throw new CampusError("not_found", "Topic not found", 404);
  // The topic's own notes first, then the module brief and the sibling topics (enough material for 20+ flashcards).
  const rank = (topic: unknown) => (topic === t.title ? 0 : topic === "Module overview" ? 1 : 2);
  const srcs = store.list("studio_sources", (s) => s.courseKey === courseId && s.module === 1 && s.status === "available").sort((x, y) => rank(x.topic) - rank(y.topic) || String(x.createdAt).localeCompare(String(y.createdAt)));
  return {
    courseKey: courseId,
    courseCode: AI801.code,
    courseTitle: AI801.title,
    programTitle: AI801.program,
    moduleNumber: 1,
    moduleTitle: AI801.module.title,
    topicTitle: t.title,
    objectives: AI801.module.objectives.filter((o) => o.startsWith(t.lo)).concat(AI801.module.objectives.filter((o) => !o.startsWith(t.lo)).slice(0, 2)),
    level: AI801.level,
    duration: "90 min",
    assessments: [
      { key: "m01-activity-project", title: "Workspace project: Guest services agent", kind: "project", points: 100, due: "End of Module 1" },
      { key: "m01-course-quiz", title: "Module 1 graded quiz", kind: "quiz", points: 100, due: "End of Module 1" },
    ],
    designSamples: false,
    sourceIds: srcs.map((s) => s.id),
  };
}

const order = (i: Row) => {
  const n = AI801_TOPICS.findIndex((t) => t.title === i.topic);
  return n === -1 ? 99 : n;
};

export function learnOverview(store: TenantStore, a: Actor, courseId: string) {
  const c = courseRow(store, a, courseId);
  const staff = isCourseStaff(a, courseId);
  const items = store.list("graded_items", (i) => i.courseId === courseId && !!i.published).sort((x, y) => order(x) - order(y) || String(x.key).localeCompare(String(y.key)));
  const views = staff && !hasAny(a, ["student"], courseId) ? items.map((i) => ({ id: i.id, key: String(i.key), kind: String(i.kind), title: String(i.title), topic: (i.topic as string) ?? null, attemptsUsed: 0, attemptsRemaining: Number(i.maxAttempts), maxAttempts: Number(i.maxAttempts), best: null as null | { score: number; passed: boolean }, passMark: Number(i.passMark) })) : items.map((i) => {
    const v = itemView(store, a, i.id);
    return { id: v.id, key: v.key, kind: v.kind, title: v.title, topic: v.topic, attemptsUsed: v.attemptsUsed, attemptsRemaining: v.attemptsRemaining, maxAttempts: v.maxAttempts, best: v.best ? { score: v.best.score, passed: v.best.passed } : null, passMark: v.passMark };
  });
  const runs = store.list("studio_runs", (r) => r.courseKey === courseId).filter((r) => staff || !!r.releasedVersion).map((r) => ({ id: r.id, topic: String(r.topic), state: String(r.state), reviewState: String(r.reviewState ?? "draft"), version: Number(r.outputsVersion ?? 1), releasedVersion: (r.releasedVersion as number) ?? null }));
  const sources = staff ? store.list("studio_sources", (s) => s.courseKey === courseId).map((s) => ({ id: s.id, title: String(s.title), topic: String(s.topic), kind: String(s.kind), status: String(s.status), author: (s.author as string) ?? null, year: (s.year as string) ?? null, excerpt: String(s.text ?? "").slice(0, 280), reason: (s.reason as string) ?? null })) : store.list("studio_sources", (s) => s.courseKey === courseId && s.status === "available").map((s) => ({ id: s.id, title: String(s.title), topic: String(s.topic), kind: String(s.kind), status: String(s.status), author: (s.author as string) ?? null, year: (s.year as string) ?? null, excerpt: String(s.text ?? "").slice(0, 280), reason: null }));
  const gradebook = courseGradebook(store, a, courseId);
  const isAI801 = c.code === AI801.code;
  return {
    course: { id: c.id, code: String(c.code ?? ""), title: String(c.title), description: String(c.description ?? ""), program: String(c.program ?? ""), competencies: (c.competencies as { id: string; text: string }[]) ?? [] },
    faculty: { name: LEAD_FACULTY.shortName, role: LEAD_FACULTY.role, photo: LEAD_FACULTY.photo.avatar, alt: LEAD_FACULTY.photo.alt },
    staff,
    canUnlock: hasAny(a, ["admin"]) || hasAny(a, ["instructor"], courseId),
    module: isAI801 ? { number: 1, title: AI801.module.title, objectives: AI801.module.objectives } : null,
    topics: isAI801 ? AI801_TOPICS.map((t) => ({ key: t.key, title: t.title, lo: t.lo, competency: t.competency })) : [],
    items: views,
    sources,
    runs,
    activity: isAI801 ? { ...AI801_ACTIVITY, instructorSolution: undefined } : null,
    labKey: AI801_LAB_KEY,
    workspaces: listMyWorkspaces(store, a, courseId),
    templates: listTemplates().map((t) => ({ id: t.id, title: t.title, kind: t.kind, description: t.description })),
    policy: effectivePolicy(store, courseId, AI801_LAB_KEY),
    lock: lockState(store, courseId),
    demos: SIM_SCENARIOS.map((s) => ({ key: s.key, org: s.org, title: s.title })),
    gradebook,
  };
}

export type LearnOverview = ReturnType<typeof learnOverview>;
export type { Row };
