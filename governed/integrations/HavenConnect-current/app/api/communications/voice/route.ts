import { gateway, verifyProviderRequest } from "../_lib";
import { getDb } from "../../../../db";
import { voiceEvents } from "../../../../db/schema";
export async function POST(request: Request) {
  try { const raw = await request.text(); if (!(await verifyProviderRequest(request, raw))) return Response.json({ error: "Unauthenticated inbound call request" }, { status: 401 }); const event = JSON.parse(raw); const result = await gateway("/v1/inbound", { event, application: "HavenConnect", defaultQueue: "Main Reception" }); await getDb().insert(voiceEvents).values({ id: crypto.randomUUID(), callId: String(result.callId || event.callId || crypto.randomUUID()), direction: "Inbound", channel: "PSTN / SIP", queue: String(result.queue || "Main Reception").slice(0, 100), remoteParty: String(event.from || "").slice(0, 40), eventType: "Authenticated inbound call", status: String(result.status || "Routing").slice(0, 40) }); return Response.json({ accepted: true, ...result }); }
  catch (error: any) { return Response.json({ error: error.message || "Inbound call could not be accepted" }, { status: 503 }); }
}
