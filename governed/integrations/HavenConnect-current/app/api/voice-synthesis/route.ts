import { getDb } from "@/db";
import { voiceEvents } from "@/db/schema";
import { config, requireStaff } from "../communications/_lib";
import { synthesizeAmara, voiceSynthesisStatus } from "@/lib/voice-synthesis";

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export async function GET(request: Request) {
  try {
    requireStaff(request);
    return Response.json({ ...voiceSynthesisStatus(config()), persona: "Amara", backupAsset: "/amara-official.mp3", backupPurpose: "Consented fixed recording; not dynamic speech" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) { return Response.json({ error: error.message || "Voice status unavailable" }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const user = requireStaff(request), body = await request.json();
    const text = clean(body.text, 1600), language = ["en-NG", "pcm-NG"].includes(body.language) ? body.language : "en-NG";
    if (!text) return Response.json({ error: "Text is required", code: "invalid_request" }, { status: 400 });
    const result = await synthesizeAmara(config(), text, language);
    await getDb().insert(voiceEvents).values({ id: crypto.randomUUID(), callId: clean(body.sessionId, 100) || crypto.randomUUID(), direction: "Synthesis", channel: "Voice", staffEmail: user.email, remoteParty: "Amara", eventType: "Dynamic speech generated", status: "Completed", consentEvidence: "Provider consent reference verified", notes: `provider=${result.provider}; language=${language}; characters=${text.length}; sensitive text not stored` });
    return new Response(result.bytes, { headers: { "content-type": result.contentType, "cache-control": "no-store", "x-haven-voice": "Amara", "x-content-type-options": "nosniff" } });
  } catch (error: any) {
    const code = error.code || "synthesis_failed", status = code === "configuration_required" ? 503 : code === "invalid_configuration" ? 500 : 502;
    return Response.json({ error: error.message || "Dynamic speech failed", code }, { status });
  }
}
