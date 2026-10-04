import { config, requireStaff } from "../communications/_lib";

const outputText = (data: any) => data.output_text || (data.output || []).flatMap((item: any) => item.content || []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");

export async function POST(request: Request) {
  try {
    requireStaff(request);
    const cfg = config();
    if (!cfg.OPENAI_API_KEY) return Response.json({ error: "OpenAI connection is not configured" }, { status: 503 });
    const body = await request.json() as Record<string, any>;
    const prompt = String(body.prompt || "").trim().slice(0, 4000);
    if (!prompt) return Response.json({ error: "Enter a request for Haven Copilot" }, { status: 400 });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.OPENAI_MODEL || "gpt-5",
        store: false,
        max_output_tokens: 700,
        instructions: "You are Haven Copilot for Oak Haven Lodging & Suites. Give concise, operationally useful answers. Never claim an action was executed unless the supplied context says it succeeded. Protect guest privacy, never expose secrets, and escalate emergencies or uncertain high-impact actions to staff. When discussing HavenConnect numbers, use only tenant-scoped allocations and clearly distinguish internal extensions from real PSTN numbers.",
        input: `Active agent: ${String(body.agent || "Operations Agent").slice(0, 80)}\nWorkspace context: ${JSON.stringify(body.context || {}).slice(0, 6000)}\nStaff request: ${prompt}`,
      }),
    });
    const data = await response.json() as any;
    if (!response.ok) return Response.json({ error: data?.error?.message || "Haven Copilot could not respond" }, { status: response.status });
    return Response.json({ message: outputText(data) || "Haven Copilot returned no text response.", responseId: data.id });
  } catch { return Response.json({ error: "Haven Copilot is temporarily unavailable" }, { status: 503 }); }
}
