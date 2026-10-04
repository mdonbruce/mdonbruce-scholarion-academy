import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { as, freshCampus, storeOf } from "./campus-helpers";
import { advanceClock, CampusError, nowMs, relay } from "../src/campus/core";
import * as M from "../src/campus/services/comms";
import { ai801CourseId } from "../src/campus/academy/ai801-seed";

/** CX & Live Sessions Hub — 40-minute engine, HavenConnect agents and the Genesys mock. */

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CampusError, String(e));
    return (e as CampusError).status;
  }
  return 200;
};
const u = (k: string, mfa = true) => as("academy", k, mfa);
const MIN = 60_000;
let COURSE = "";
let SESSION = "";
let START = 0;
const delivered = (userId: string, re: RegExp) => {
  relay(storeOf("academy"));
  return storeOf("academy").list("deliveries", (d) => d.userId === userId && d.channel === "in_app" && re.test(String(d.subject))).length;
};

before(() => {
  freshCampus();
  COURSE = ai801CourseId(storeOf("academy"));
});

describe("40-minute session engine", () => {
  it("maps class blocks to segments: 50 → 1 + async, 90 → 2, 2 h → 3, 4 h → 6 with structured breaks", () => {
    assert.deepEqual([M.segmentPlan(50).segments.length, M.segmentPlan(50).asyncMinutes], [1, 15]);
    assert.equal(M.segmentPlan(90).segments.length, 2);
    assert.equal(M.segmentPlan(90).breakMinutes, 3);
    assert.equal(M.segmentPlan(120).segments.length, 3);
    const four = M.segmentPlan(240);
    assert.deepEqual(four.segments.map((s) => s.label), ["Lecture A", "Lab Part 1", "Lab Part 2", "Lecture B", "Activity", "Wrap-up"]);
    assert.ok(four.segments.every((s) => s.teach === 35 && s.buffer === 5));
  });

  it("1-on-1 office hours and licensed hosts aren't segmented", () => {
    assert.equal(M.segmentPlan(75, { kind: "office_hours" }).segments[0].teach, 75);
    assert.equal(M.segmentPlan(180, { licensedHost: true }).segments.length, 1);
  });

  it("a 90-minute class pre-creates both meetings with security, a Session Card and calendar entries", () => {
    const i = u("instructor");
    START = nowMs() + 2 * 86_400_000;
    const s = M.planSession(i.store, i.actor, { courseId: COURSE, title: "Module 1 live lecture", startsAt: new Date(START).toISOString(), totalMinutes: 90 });
    SESSION = s.id;
    const segs = s.segments as M.Segment[];
    assert.equal(segs.length, 2);
    assert.ok(segs.every((g) => g.meetingId && g.passcode && g.waitingRoom && g.simulated));
    assert.notEqual(segs[0].meetingId, segs[1].meetingId);
    assert.equal(storeOf("academy").list("calendar_events", (e) => e.commsSessionId === s.id).length, 2);
    const card = M.sessionCard(storeOf("academy"), u("student1", false).actor, s.id);
    assert.equal(card.parts.length, 2);
    assert.equal(status(() => M.sessionCard(storeOf("academy"), as("demo", "student1", false).actor, s.id)), 403); // not enrolled → no links
  });
});

describe("Reminders, warnings, recaps and the support agent", () => {
  it("sends the 24-hour and 15-minute reminders once each", () => {
    const s = storeOf("academy");
    advanceClock(START - nowMs() - 23 * 3600_000);
    M.tickSessions(s);
    M.tickSessions(s);
    assert.equal(delivered("usr_academy_student1", /starts tomorrow/), 1);
    advanceClock(START - nowMs() - 10 * MIN);
    M.tickSessions(s);
    assert.equal(delivered("usr_academy_student1", /starts in 15 minutes/), 1);
  });

  it("warns at 33 minutes, posts the next link when Part 1 ends and drafts a recap for approval", () => {
    const s = storeOf("academy");
    advanceClock(START + 33 * MIN - nowMs());
    assert.match(String(M.liveState(s, SESSION).warning), /Part 1 ends in/);
    M.tickSessions(s);
    assert.equal(delivered("usr_academy_student1", /Part 1 ends in 5 minutes/), 1);
    advanceClock(7 * MIN);
    M.tickSessions(s);
    assert.equal(delivered("usr_academy_student1", /Part 2 is starting/), 1);
    const recap = s.list("comms_recaps", (r) => r.sessionId === SESSION)[0];
    assert.equal(recap.state, "awaiting_approval");
    assert.match(String(recap.text), /AI DRAFT/);
    M.approveRecap(s, u("instructor").actor, recap.id, "Part 1: tokens, context windows and cost.");
    assert.equal(s.get("comms_recaps", recap.id)!.state, "posted");
  });

  it("answers 'my class ended, where do I go?' with the Part 2 link, the recap and an AI disclosure", () => {
    const st = u("student1", false);
    const r = M.supportAnswer(st.store, st.actor, "My class ended, where do I go?");
    const part2 = (storeOf("academy").get("comms_sessions", SESSION)!.segments as M.Segment[])[1];
    assert.equal(r.intent, "rejoin");
    assert.match(r.answer, new RegExp(part2.meetingId));
    assert.match(r.answer, /Recap of the last part/);
    assert.match(r.answer, /AI assistant/);
    assert.ok(r.ms < 10_000);
  });
});

describe("Failover, link security, attendance and recordings", () => {
  it("falls back to Webex for the remaining part with new links", () => {
    const s = storeOf("academy");
    const before = (s.get("comms_sessions", SESSION)!.segments as M.Segment[])[1];
    M.failover(s, u("instructor").actor, SESSION, "Zoom outage");
    const after = (s.get("comms_sessions", SESSION)!.segments as M.Segment[])[1];
    assert.equal(after.platform, "webex");
    assert.notEqual(after.meetingId, before.meetingId);
  });

  it("regenerates a leaked link and keeps the waiting room on", () => {
    const s = storeOf("academy");
    const old = (s.get("comms_sessions", SESSION)!.segments as M.Segment[])[1];
    const fresh = M.regenerateLink(s, u("instructor").actor, SESSION, 2)!;
    assert.notEqual(fresh.meetingId, old.meetingId);
    assert.notEqual(fresh.passcode, old.passcode);
    assert.equal(fresh.waitingRoom, true);
  });

  it("reconciles attendance across both parts and flags partial attendance without penalty", () => {
    const s = storeOf("academy");
    const i = u("instructor");
    const segs = s.get("comms_sessions", SESSION)!.segments as M.Segment[];
    const at = (g: M.Segment, off: number) => new Date(Date.parse(g.startsAt) + off * MIN).toISOString();
    M.recordJoin(s, i.actor, { sessionId: SESSION, segment: 1, userId: "usr_academy_student1", joinedAt: at(segs[0], 0), leftAt: at(segs[0], 38) });
    M.recordJoin(s, i.actor, { sessionId: SESSION, segment: 2, userId: "usr_academy_student1", joinedAt: at(segs[1], 1), leftAt: at(segs[1], 38) });
    M.recordJoin(s, i.actor, { sessionId: SESSION, segment: 1, userId: "usr_academy_student2", joinedAt: at(segs[0], 0), leftAt: at(segs[0], 30) });
    const r = M.reconcile(s, i.actor, SESSION);
    assert.equal(r.learners.find((l) => l.userId === "usr_academy_student1")!.status, "present");
    const partial = r.learners.find((l) => l.userId === "usr_academy_student2")!;
    assert.equal(partial.status, "partial");
    assert.match(String(partial.flag), /no automatic penalty/);
    const an = M.sessionAnalytics(s, i.actor).find((x) => x.session === "Module 1 live lecture")!;
    assert.equal(an.rejoin[0].rejoinRate, 50);
  });

  it("a local recording gets captions from its transcript and publishes only after review", () => {
    const s = storeOf("academy");
    const i = u("instructor");
    assert.equal(status(() => M.uploadRecording(s, i.actor, { sessionId: SESSION, segment: 1, fileName: "part1.mp4", consentNoticeShown: false })), 422);
    const none = M.uploadRecording(s, i.actor, { sessionId: SESSION, segment: 2, fileName: "part2.mp4", consentNoticeShown: true });
    assert.equal(status(() => M.publishRecording(s, i.actor, none.id)), 409);
    const rec = M.uploadRecording(s, i.actor, { sessionId: SESSION, segment: 1, fileName: "part1.mp4", consentNoticeShown: true, transcript: "Today we look at tokens and context windows. Cost grows with tokens. Latency matters for users." });
    assert.match(String(rec.captions), /^WEBVTT/);
    M.publishRecording(s, i.actor, rec.id);
    assert.ok(s.list("pages", (p) => p.courseId === COURSE && /Recording: Module 1 live lecture — Part 1/.test(String(p.title))).length);
  });
});

describe("Connector hub and Genesys Cloud", () => {
  it("shows Zoom and Webex with plan limits and verification date; Genesys disabled awaiting subscription", () => {
    const hub = M.connectorHub(storeOf("academy"), u("admin").actor);
    const zoom = hub.find((c) => c.key === "zoom")!;
    assert.match(zoom.plan, /40 minutes/);
    assert.ok(zoom.verifiedAt);
    assert.equal(hub.find((c) => c.key === "genesys")!.status, "DISABLED");
  });

  it("mock-mode tests pass with no real API calls", () => {
    const r = M.genesysMockSuite(storeOf("academy"));
    assert.equal(r.realApiCalls, 0);
    assert.ok(r.passed, JSON.stringify(r.results));
    assert.equal(r.results.length, 6);
  });

  it("enabling Voice and Routing needs the checklist and licences; other modules stay disabled", () => {
    const s = storeOf("academy");
    const a = u("admin");
    assert.equal(status(() => M.setModule(s, a.actor, "voice", true, true)), 409);
    for (const c of M.ACTIVATION_CHECKLIST) M.recordChecklist(s, a.actor, c.key, true);
    assert.equal(status(() => M.setModule(s, a.actor, "voice", true, false)), 409);
    M.setModule(s, a.actor, "voice", true, true);
    const st = M.setModule(s, a.actor, "routing", true, true);
    assert.deepEqual(st.connected.sort(), ["routing", "voice"]);
    assert.equal(st.modules.filter((m) => m.status === "DISABLED").length, 13);
    assert.equal(st.realApiCalls, 0);
  });
});
