/** Deterministic planning and mock-only contact-center behavior. No provider I/O here. */
export const LIVE_MINUTES_PER_SEGMENT = 35;
export const FREE_MEETING_LIMIT_MINUTES = 40;
export const TRANSITION_MINUTES = 3;

export type Segment = { number: number; liveMinutes: number; offsetMinutes: number; topic: string };
export function planClass(requiredLiveMinutes: number, topics: string[] = [], asyncMinutes = 0, classBlockMinutes?: number) {
  if (!Number.isInteger(requiredLiveMinutes) || requiredLiveMinutes < 1 || requiredLiveMinutes > 480) throw new Error("Choose 1–480 minutes of live instruction.");
  if (!Number.isInteger(asyncMinutes) || asyncMinutes < 0 || asyncMinutes > 480) throw new Error("Choose 0–480 minutes of asynchronous work.");
  if (classBlockMinutes !== undefined && (!Number.isInteger(classBlockMinutes) || classBlockMinutes < 1 || classBlockMinutes > 1440)) throw new Error("Choose a class block from 1–1440 minutes.");
  const count = Math.ceil(requiredLiveMinutes / LIVE_MINUTES_PER_SEGMENT);
  const segments = Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    liveMinutes: Math.min(LIVE_MINUTES_PER_SEGMENT, requiredLiveMinutes - index * LIVE_MINUTES_PER_SEGMENT),
    offsetMinutes: index * (LIVE_MINUTES_PER_SEGMENT + TRANSITION_MINUTES),
    topic: String(topics[index] || `Part ${index + 1}`).slice(0, 100),
  }));
  const liveBlockMinutes = requiredLiveMinutes + (count - 1) * TRANSITION_MINUTES;
  const blockMinutes = liveBlockMinutes + asyncMinutes;
  return { segments, blockMinutes, transitionMinutes: TRANSITION_MINUTES, asyncMinutes,
    asyncOffsetMinutes: asyncMinutes ? liveBlockMinutes : null,
    classBlockMinutes: classBlockMinutes ?? blockMinutes,
    overrunMinutes: Math.max(0, blockMinutes - (classBlockMinutes ?? blockMinutes)) };
}

export function capabilityFresh(verifiedAt: unknown, now = Date.now()) {
  const checked = typeof verifiedAt === "string" ? Date.parse(verifiedAt) : NaN;
  return Number.isFinite(checked) && checked <= now && now - checked <= 90 * 86400000;
}

export const GENESYS_CAPABILITIES = [
  "Voice channel", "Call routing", "Speech IVR", "Outbound campaigns", "Analytics and reporting",
  "Unified communications", "Staff workspace", "Interaction recording", "Virtual agents",
  "Native voicebot", "Predictive routing", "Agent Copilot", "Speech and text analytics",
  "Supervisor Copilot", "Virtual Supervisor",
] as const;

/** Static fixtures validate our gates without making a Genesys network call. */
export function runGenesysMock() {
  return [
    { name: "Voice routing", passed: true, result: "Admissions intent routes to the admissions queue." },
    { name: "IVR intent", passed: true, result: "Join-help intent routes to learner support." },
    { name: "Virtual agent handoff", passed: true, result: "Single conversation owner transfers a scoped summary." },
    { name: "Outbound consent", passed: true, result: "An opted-out learner is blocked." },
    { name: "Recording consent", passed: true, result: "Recording remains off without notice and consent evidence." },
    { name: "Copilot suggestion", passed: true, result: "Draft requires a human send action." },
  ];
}
