import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { havenNumbers, rtcCalls, voiceEvents, voiceStaffProfiles } from "../../../../db/schema";
import { config, gateway, isHavenVirtualNumber, normalizeDestination, requireStaff, validDestination, validExtension } from "../_lib";
export async function GET(request: Request) {
  try {
    const extension = new URL(request.url).searchParams.get("extension");
    if (!validExtension(extension)) return Response.json({ error: "Valid extension required" }, { status: 400 });
    const calls = await getDb().select().from(rtcCalls).where(and(eq(rtcCalls.toExtension, String(extension)), eq(rtcCalls.status, "Ringing"))).orderBy(desc(rtcCalls.createdAt)).limit(5);
    if (calls.length) return Response.json({ calls: calls.map((call) => ({ id: call.id, from: call.fromExtension, offer: call.offer, internal: true, status: call.status })) });
    try { const result = await gateway(`/v1/calls/incoming?extension=${extension}`, {}, "GET"); return Response.json({ calls: Array.isArray(result.calls) ? result.calls : [] }); }
    catch { return Response.json({ calls: [] }); }
  } catch { return Response.json({ calls: [] }); }
}
export async function POST(request: Request) {
  try {
    const user = requireStaff(request);
    const body = await request.json() as any;
    if (!validExtension(body.fromExtension) || !validDestination(body.destination)) return Response.json({ error: "Enter a valid extension or international telephone number" }, { status: 400 });
    if (!String(body.offer || "").startsWith("v=0")) return Response.json({ error: "A valid WebRTC offer is required" }, { status: 400 });
    const enteredDestination = String(body.destination).trim();
    const normalizedDestination = normalizeDestination(enteredDestination);
    let destination = normalizedDestination;
    let havenRoute: any = undefined;
    if (isHavenVirtualNumber(normalizedDestination)) {
      const rows = await getDb().select().from(havenNumbers).where(eq(havenNumbers.status, "Active"));
      havenRoute = rows.find((row) => normalizeDestination(row.virtualNumber) === normalizedDestination);
      if (!havenRoute) return Response.json({ error: "This HavenConnect number is not assigned" }, { status: 404 });
      destination = havenRoute.extension;
    }
    const external = destination.startsWith("+");
    const [profile] = await getDb().select().from(voiceStaffProfiles).where(eq(voiceStaffProfiles.workEmail, user.email)).limit(1);
    const permissions: string[] = profile ? JSON.parse(profile.callPermissions || "[]") : [];
    if (external && (!profile || !permissions.includes("External calling"))) return Response.json({ error: "Your HavenConnect extension is not authorized for external calling" }, { status: 403 });
    if (external && !destination.startsWith("+234") && !permissions.includes("International dialing")) return Response.json({ error: "Your HavenConnect role is not authorized for international dialing" }, { status: 403 });
    if (!external && validExtension(destination)) {
      const id = crypto.randomUUID();
      await getDb().insert(rtcCalls).values({ id, fromExtension: normalizeDestination(body.fromExtension), toExtension: destination, offer: body.offer, status: "Ringing" });
      await getDb().insert(voiceEvents).values({ id: crypto.randomUUID(), callId: id, direction: "Internal", channel: "WebRTC", staffEmail: user.email, remoteParty: destination, eventType: "Call started", status: "Ringing" });
      return Response.json({ callId: id, status: "Ringing", internal: true }, { status: 201 });
    }
    if (external && !config().HAVEN_SIP_GATEWAY_URI) return Response.json({ error: "Connect a licensed Nigerian SIP carrier before placing external calls" }, { status: 503 });
    const result = await gateway("/v1/calls", { fromExtension: body.fromExtension, destination, offer: body.offer, route: havenRoute ? { type: havenRoute.routeType, target: havenRoute.routeTarget, tenant: havenRoute.tenant } : undefined, sipGateway: external ? config().HAVEN_SIP_GATEWAY_URI : undefined });
    await getDb().insert(voiceEvents).values({ id: crypto.randomUUID(), callId: String(result.callId), direction: "Outbound", channel: "PSTN / SIP", staffEmail: user.email, remoteParty: destination, eventType: "Call started", status: String(result.status || "Connecting") });
    return Response.json({ callId: result.callId, answer: result.answer, status: result.status || "Connected" }, { status: 201 });
  } catch (error: any) { return Response.json({ error: error.message || "Call could not be started" }, { status: 503 }); }
}
