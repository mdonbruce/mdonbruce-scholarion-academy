import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ivrFlowVersions, voiceEvents, voiceQueues, voiceRecordings, voiceStaffProfiles } from "../../../db/schema";
import { config, normalizeDestination, requireStaff } from "../communications/_lib";

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const list = (value: unknown) => Array.isArray(value) ? value.map((item) => clean(item, 100)).filter(Boolean).slice(0, 40) : [];
const readList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };
const providerState = (ready: boolean, approval = false) => ready ? "Testing" : approval ? "Awaiting Provider Approval" : "Awaiting Credentials";

export async function GET(request: Request) {
  try {
    const user = requireStaff(request), db = getDb(), cfg = config();
    const [profiles, queues, events, ivr, recordings] = await Promise.all([
      db.select().from(voiceStaffProfiles).orderBy(voiceStaffProfiles.extension).limit(250),
      db.select().from(voiceQueues).orderBy(voiceQueues.name).limit(100),
      db.select().from(voiceEvents).orderBy(desc(voiceEvents.createdAt)).limit(500),
      db.select().from(ivrFlowVersions).orderBy(desc(ivrFlowVersions.createdAt)).limit(50),
      db.select().from(voiceRecordings).orderBy(desc(voiceRecordings.createdAt)).limit(100),
    ]);
    const queueMetrics = queues.map((queue) => {
      const rows = events.filter((event) => event.queue === queue.name), waiting = rows.filter((event) => event.status === "Waiting"), answered = rows.filter((event) => event.status === "Answered"), abandoned = rows.filter((event) => event.status === "Abandoned");
      const waits = answered.map((event) => event.waitSeconds).filter((value): value is number => typeof value === "number");
      return { queueId: queue.id, waiting: waiting.length, longestWait: waiting.length ? Math.max(...waiting.map((event) => event.waitSeconds || 0)) : null, activeCalls: rows.filter((event) => event.status === "Connected").length, abandoned: abandoned.length, averageAnswerTime: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null, serviceLevel: waits.length ? Math.round((waits.filter((value) => value <= queue.serviceLevelSeconds).length / waits.length) * 100) : null, callbacks: rows.filter((event) => event.eventType === "Callback requested" && event.status !== "Completed").length };
    });
    const adapters = [
      { id: "pstn", category: "PSTN / SIP", provider: cfg.HAVEN_VOICE_PROVIDER_NAME || null, status: providerState(Boolean(cfg.HAVEN_COMMUNICATIONS_GATEWAY_URL && cfg.HAVEN_SIP_GATEWAY_URI)), requirement: "Approved Nigerian carrier or SIP/PSTN provider, gateway URL, token, SIP URI, and live call test" },
      { id: "webrtc", category: "WebRTC signaling", provider: cfg.HAVEN_WEBRTC_PROVIDER_NAME || "HavenConnect internal signaling", status: cfg.HAVEN_TURN_URL ? "Testing" : "Provisioning", requirement: "TURN credentials and two-party media test" },
      { id: "whatsapp", category: "WhatsApp Business Calling", provider: "Meta WhatsApp Business Platform", status: providerState(Boolean(cfg.HAVEN_WHATSAPP_GATEWAY_URL && cfg.HAVEN_WHATSAPP_GATEWAY_TOKEN), true), requirement: "Verified business, eligible number, Meta permissions, webhook/SIP setup, consent, and real test call" },
      { id: "video", category: "Video conferencing", provider: cfg.HAVEN_VIDEO_PROVIDER_NAME || "HavenMeet WebRTC", status: cfg.HAVEN_TURN_URL ? "Testing" : "Provisioning", requirement: "TURN/media infrastructure and multi-party capacity test" },
      { id: "recording", category: "Recording and storage", provider: cfg.HAVEN_RECORDING_PROVIDER_NAME || null, status: providerState(Boolean(cfg.HAVEN_RECORDING_PROVIDER_URL)), requirement: "Provider, encryption, storage, consent, retention, playback, and deletion test" },
      { id: "ai", category: "AI voice", provider: cfg.HAVEN_AI_VOICE_PROVIDER_NAME || null, status: providerState(Boolean(cfg.HAVEN_AI_VOICE_URL && cfg.HAVEN_AI_VOICE_TOKEN)), requirement: "Approved real-time AI media service and live Amara voice tests" },
      { id: "number", category: "Nigerian business number", provider: cfg.HAVEN_NIGERIAN_CARRIER_NAME || null, status: cfg.HAVEN_NIGERIAN_NUMBER ? "Testing" : "Awaiting Provider Approval", requirement: "Ownership, availability/porting, caller ID, inbound/outbound, international and failover tests" },
    ];
    return Response.json({ viewer: user, profiles: profiles.map((item) => ({ ...item, queueMembership: readList(item.queueMembership), callPermissions: readList(item.callPermissions) })), queues: queues.map((item) => ({ ...item, skills: readList(item.skills), metrics: queueMetrics.find((metric) => metric.queueId === item.id) })), events, ivr: ivr.map((item) => ({ ...item, menu: readList(item.menu) })), recordings, adapters });
  } catch (error: any) { return Response.json({ error: error.message || "Voice operations data is unavailable" }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const user = requireStaff(request), body = await request.json(), kind = clean(body.kind, 40), db = getDb();
    if (kind === "profile") {
      const email = clean(body.workEmail, 180).toLowerCase(), extension = clean(body.extension, 8);
      if (!email.endsWith("@oakhavensuites.com") || !/^2\d{3}$/.test(extension)) return Response.json({ error: "Use an approved Oak Haven address and unique 2xxx extension" }, { status: 400 });
      const item = { id: crypto.randomUUID(), employeeName: clean(body.employeeName, 120), jobTitle: clean(body.jobTitle, 100), department: clean(body.department, 80), workEmail: email, extension, presence: "Offline", queueMembership: JSON.stringify(list(body.queueMembership)), callPermissions: JSON.stringify(list(body.callPermissions)), availability: "Unavailable", assignedProperty: clean(body.assignedProperty, 150) || "Oak Haven Lodging & Suites" };
      if (!item.employeeName || !item.jobTitle || !item.department) return Response.json({ error: "Employee name, title, and department are required" }, { status: 400 });
      await db.insert(voiceStaffProfiles).values(item); return Response.json({ item }, { status: 201 });
    }
    if (kind === "queue") {
      const allowed = ["Ring all", "Sequential", "Round robin", "Longest idle", "Skills based", "Priority based", "Language based", "Department based"];
      const name = clean(body.name, 100), strategy = allowed.includes(body.strategy) ? body.strategy : "Skills based";
      if (!name) return Response.json({ error: "Queue name is required" }, { status: 400 });
      const item = { id: crypto.randomUUID(), name, strategy, skills: JSON.stringify(list(body.skills)), overflowQueue: clean(body.overflowQueue, 100) || null, afterHoursTarget: clean(body.afterHoursTarget, 100) || "Voicemail", serviceLevelSeconds: Math.max(10, Math.min(300, Number(body.serviceLevelSeconds) || 30)), status: "Disabled" };
      await db.insert(voiceQueues).values(item); return Response.json({ item }, { status: 201 });
    }
    if (kind === "ivr") {
      const name = clean(body.name, 100) || "Oak Haven Main Line";
      const [{ maxVersion }] = await db.select({ maxVersion: sql<number>`coalesce(max(${ivrFlowVersions.version}), 0)` }).from(ivrFlowVersions).where(eq(ivrFlowVersions.name, name));
      const item = { id: crypto.randomUUID(), name, version: Number(maxVersion) + 1, greeting: clean(body.greeting, 2000), menu: JSON.stringify(list(body.menu)), businessHours: JSON.stringify(body.businessHours || {}), status: "Draft", createdBy: user.email };
      if (!item.greeting || !readList(item.menu).length) return Response.json({ error: "Greeting and menu routes are required" }, { status: 400 });
      await db.insert(ivrFlowVersions).values(item); return Response.json({ item }, { status: 201 });
    }
    if (kind === "callback") {
      const number = normalizeDestination(body.number), queue = clean(body.queue, 100);
      if (!/^\+\d{8,15}$/.test(number) || !queue) return Response.json({ error: "Provide a valid Nigerian or international number and queue" }, { status: 400 });
      const item = { id: crypto.randomUUID(), callId: crypto.randomUUID(), direction: "Outbound", channel: "Callback", queue, staffEmail: user.email, remoteParty: number, eventType: "Callback requested", status: "Requested", notes: clean(body.notes, 1000) };
      await db.insert(voiceEvents).values(item); return Response.json({ item }, { status: 201 });
    }
    return Response.json({ error: "Unknown voice operation" }, { status: 400 });
  } catch (error: any) { return Response.json({ error: error.message || "Voice operation failed" }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  try {
    const user = requireStaff(request), body = await request.json(), kind = clean(body.kind, 40), db = getDb();
    if (kind === "queue-status") {
      const status = body.status === "Testing" ? "Testing" : body.status === "Disabled" ? "Disabled" : "";
      if (!status) return Response.json({ error: "Queue may be set to Testing or Disabled until a live routing test succeeds" }, { status: 400 });
      const [item] = await db.update(voiceQueues).set({ status }).where(eq(voiceQueues.id, clean(body.id, 80))).returning(); return item ? Response.json({ item }) : Response.json({ error: "Queue not found" }, { status: 404 });
    }
    if (kind === "ivr-status") {
      const [flow] = await db.select().from(ivrFlowVersions).where(eq(ivrFlowVersions.id, clean(body.id, 80))).limit(1);
      if (!flow) return Response.json({ error: "IVR version not found" }, { status: 404 });
      const status = body.status === "Approved" ? "Approved" : body.status === "Draft" ? "Draft" : "";
      if (!status) return Response.json({ error: "Approve or return the flow to draft" }, { status: 400 });
      const [item] = await db.update(ivrFlowVersions).set({ status, approvedBy: status === "Approved" ? user.email : null }).where(eq(ivrFlowVersions.id, flow.id)).returning(); return Response.json({ item });
    }
    return Response.json({ error: "Unknown voice update" }, { status: 400 });
  } catch (error: any) { return Response.json({ error: error.message || "Voice update failed" }, { status: 503 }); }
}
