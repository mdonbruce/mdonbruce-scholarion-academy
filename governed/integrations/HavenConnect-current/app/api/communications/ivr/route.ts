import { gateway, verifyProviderRequest } from "../_lib";
const route: Record<string, { queue: string; extensions: string[] }> = { "1": { queue: "Reservations", extensions: ["2001"] }, "2": { queue: "Front Desk", extensions: ["2003", "2000"] }, "3": { queue: "Transportation", extensions: ["2060"] }, "4": { queue: "Guest Services", extensions: ["2002", "2000"] }, "5": { queue: "Haven AI Concierge", extensions: ["9000"] }, "6": { queue: "Emergency Center", extensions: ["9999", "2040"] } };
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!(await verifyProviderRequest(request, raw))) return Response.json({ error: "Unauthenticated IVR request" }, { status: 401 });
    const body = JSON.parse(raw) as any;
    const selected = route[String(body.digit || "")] || { queue: "Main Reception", extensions: ["100", "112"] };
    const result = await gateway("/v1/ivr/route", { callId: body.callId, ...selected, timeoutSeconds: 22, voicemailFallback: true });
    return Response.json({ queue: selected.queue, extensions: selected.extensions, ...result });
  } catch (error: any) {
    return Response.json({ error: error.message || "IVR routing failed" }, { status: 503 });
  }
}
