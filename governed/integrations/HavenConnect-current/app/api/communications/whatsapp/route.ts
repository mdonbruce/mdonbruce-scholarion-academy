import { config, verifyProviderRequest } from "../_lib";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!(await verifyProviderRequest(request, raw))) return Response.json({ error: "Unauthenticated WhatsApp calling request" }, { status: 401 });
    const payload = JSON.parse(raw) as any;
    const c = config();
    if (!c.HAVEN_WHATSAPP_GATEWAY_URL || !c.HAVEN_WHATSAPP_GATEWAY_TOKEN) return Response.json({ error: "HavenConnect WhatsApp gateway is not connected" }, { status: 503 });
    const response = await fetch(c.HAVEN_WHATSAPP_GATEWAY_URL, { method: "POST", headers: { authorization: `Bearer ${c.HAVEN_WHATSAPP_GATEWAY_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ ...payload, queue: "Guest Services", application: "HavenConnect" }) });
    if (!response.ok) throw new Error("WhatsApp gateway rejected the interaction");
    return Response.json({ accepted: true, channel: "WhatsApp", queue: "Guest Services" });
  } catch (error: any) { return Response.json({ error: error.message || "WhatsApp interaction failed" }, { status: 503 }); }
}
