/**
 * Server-side model router for HavenConnect Agentic AI.
 * Keys stay on the server. Text is redacted by the caller before it reaches this module.
 * Provider order: AI_PROVIDER when explicitly set; otherwise OpenAI is primary and Anthropic is fallback.
 */
export type AiConfig = Record<string, string | undefined>;
export type AiResult = { text: string; provider: string; model: string };

export function aiStatus(cfg: AiConfig) {
  const anthropic = Boolean(cfg.ANTHROPIC_API_KEY), openai = Boolean(cfg.OPENAI_API_KEY);
  const preferred = (cfg.AI_PROVIDER || "").toLowerCase();
  const provider = preferred === "anthropic" && anthropic ? "anthropic" : preferred === "openai" && openai ? "openai" : openai ? "openai" : anthropic ? "anthropic" : "";
  return {
    provider,
    model: provider === "anthropic" ? cfg.ANTHROPIC_MODEL || "claude-sonnet-5" : provider === "openai" ? cfg.OPENAI_MODEL || "gpt-5" : "",
    configured: Boolean(provider),
    fallback: provider === "openai" && anthropic ? "anthropic" : provider === "anthropic" && openai ? "openai" : "",
  };
}

async function generatePrimary(cfg: AiConfig, system: string, input: string, maxTokens = 700): Promise<AiResult> {
  const status = aiStatus(cfg);
  if (!status.configured) throw new Error("No AI provider is configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY as a hosted secret.");
  if (status.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": String(cfg.ANTHROPIC_API_KEY), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: status.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: input }] }),
    });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(data?.error?.message || "The AI provider rejected the request");
    const text = (data.content || []).filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n").trim();
    return { text, provider: "anthropic", model: status.model };
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: status.model, store: false, max_output_tokens: maxTokens, instructions: system, input }),
  });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data?.error?.message || "The AI provider rejected the request");
  const text = data.output_text || (data.output || []).flatMap((item: any) => item.content || []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n");
  return { text: String(text).trim(), provider: "openai", model: status.model };
}

export async function generate(cfg: AiConfig, system: string, input: string, maxTokens = 700): Promise<AiResult> {
  const status = aiStatus(cfg);
  if (!status.configured) throw new Error("No AI provider is configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY as a hosted secret.");
  try {
    return await generatePrimary(cfg, system, input, maxTokens);
  } catch (primaryError) {
    if (!status.fallback) throw primaryError;
    return generatePrimary({ ...cfg, AI_PROVIDER: status.fallback }, system, input, maxTokens);
  }
}

/** Tolerant JSON extraction: whole reply, a fenced block, or the first {...}/[...] span. */
export function parseJson(text: string): unknown {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  const direct = tryParse(text.trim()); if (direct !== undefined) return direct;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { const f = tryParse(fence[1]); if (f !== undefined) return f; }
  const start = text.search(/[[{]/), end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) { const s = tryParse(text.slice(start, end + 1)); if (s !== undefined) return s; }
  throw new Error("The AI reply was not valid JSON");
}

export const TASKS: Record<string, { system: string; json?: boolean; max?: number }> = {
  reply: { system: "You are a HavenConnect customer and student experience agent for Oak Haven. Reply in 1–3 short sentences, plain text. Use only the approved guidance supplied. Never claim an account, payment, grade or enrollment change happened unless the context says it succeeded. If the person is upset, asks for a human, or the matter is sensitive, say you are bringing in a staff member." },
  summary: { system: "Summarize this conversation for a human agent handoff in four short lines: issue, what was done, customer mood, next step. Plain text." },
  article: { system: "Draft a short help-center article answering the questions provided. Where you do not know exact dates, fees or numbers, write [confirm: …] instead of inventing them. Reply with only JSON {\"title\": string, \"content\": string (under 120 words)}.", json: true },
  insights: { system: "You are the Insights agent. From the interaction summary provided, produce up to 3 actionable recommendations. Reply with only a JSON array of {\"title\": string, \"kind\": \"Emerging issue\"|\"Knowledge gap\"|\"Cost\"|\"Deflection win\", \"impact\": \"High\"|\"Medium\"|\"Low\", \"recommendation\": string, \"module\": one of \"knowledge\",\"autoflows\",\"classification\",\"campaigns\",\"studio\"}.", json: true, max: 900 },
  journey: { system: "Create a customer journey map. Reply with only JSON {\"title\": string, \"stages\": [5 short names], \"activity\": [5], \"emotion\": [5 integers -2..1], \"thoughts\": [5 short quotes], \"pain\": [5], \"opp\": [5 AI-agent opportunities], \"touchpoints\": [5], \"kpis\": [5]}. Keep every string under 70 characters.", json: true, max: 1200 },
  campaign: { system: "Write two A/B variants of an outbound message in Oak Haven's brand voice: warm, direct, specific, never over-promising. Use {first_name} and {link} placeholders. Reply with only JSON {\"a\": string, \"b\": string}.", json: true },
  widget: { system: "Choose the best dashboard widget for the request from the catalog provided. Reply with only JSON {\"metric\": key, \"type\": one of that metric's types, \"title\": short title}.", json: true },
  instructions: { system: "Write concise operating instructions for a customer-experience AI agent as 6–8 lines starting with \"- \". Include escalation and data-protection rules. Plain text." },
  student: { system: "Write a 3-sentence advising brief about this student for staff. Do not include identification numbers. Plain text." },
  orchestrator: { system: "You are the HavenConnect Orchestrator inside a staff workspace. Answer briefly in plain text. When the staff member asks you to do something, propose exactly one action for their approval. Reply with only JSON {\"answer\": string, \"action\": null | {\"type\": \"open_module\"|\"enroll\"|\"resolve_session\"|\"draft_campaign\", \"label\": string, \"args\": object}}. open_module args {module}; enroll args {contextId, course}; resolve_session args {sessionId}; draft_campaign args {name, segment, channel, message}.", json: true, max: 900 },
};
