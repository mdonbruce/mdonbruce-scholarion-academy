import { getDb } from "../../../../db";
import { voiceEvents, voiceRecordings } from "../../../../db/schema";
import { gateway, requireStaff, validDestination } from "../_lib";
export async function POST(request: Request) {
  try {
    const user = requireStaff(request);
    const body = await request.json() as any;
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(body.callId || ""))) return Response.json({ error: "A valid active call is required" }, { status: 400 });
    if (!new Set(["accept", "reject", "hold", "resume", "record", "stop-recording", "transfer", "add-participant", "remove-participant", "merge", "voicemail"]).has(body.action)) return Response.json({ error: "Unsupported call control" }, { status: 400 });
    if (["transfer", "add-participant"].includes(body.action) && !validDestination(body.target)) return Response.json({ error: "Enter a telephone number or extension for this action" }, { status: 400 });
    if (body.action === "record" && cleanEvidence(body.consentEvidence).length < 12) return Response.json({ error: "Recording requires consent evidence" }, { status: 400 });
    const result = await gateway(`/v1/calls/${body.callId}/control`, { action: body.action, target: body.target, consentEvidence: body.action === "record" ? cleanEvidence(body.consentEvidence) : undefined });
    await getDb().insert(voiceEvents).values({ id: crypto.randomUUID(), callId: body.callId, direction: "Control", channel: "Voice", staffEmail: user.email, remoteParty: String(body.target || ""), eventType: `Call control: ${body.action}`, status: "Completed", consentEvidence: body.action === "record" ? cleanEvidence(body.consentEvidence) : "" });
    if (body.action === "record") await getDb().insert(voiceRecordings).values({ id: crypto.randomUUID(), callId: body.callId, status: "Awaiting Provider", consentStatus: cleanEvidence(body.consentEvidence), retentionPolicy: "Organization policy pending provider confirmation", createdBy: user.email });
    return Response.json({ message: result.message || `Call ${body.action} completed` });
  } catch (error: any) { return Response.json({ error: error.message || "Call control failed" }, { status: 503 }); }
}
const cleanEvidence = (value: unknown) => String(value || "").trim().slice(0, 500);
