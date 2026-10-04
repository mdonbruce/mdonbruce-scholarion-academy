export type VoiceConfig = Record<string, string | undefined>;

export function voiceSynthesisStatus(cfg: VoiceConfig) {
  const endpoint = String(cfg.HAVEN_TTS_ENDPOINT || "").trim();
  const provider = String(cfg.HAVEN_TTS_PROVIDER || "").trim();
  const voiceId = String(cfg.AMARA_VOICE_ID || "").trim();
  const consentId = String(cfg.AMARA_VOICE_CONSENT_ID || "").trim();
  const apiKey = String(cfg.HAVEN_TTS_API_KEY || "").trim();
  const configured = Boolean(endpoint && provider && voiceId && consentId && apiKey);
  const missing = [
    ["HAVEN_TTS_ENDPOINT", endpoint], ["HAVEN_TTS_PROVIDER", provider],
    ["AMARA_VOICE_ID", voiceId], ["AMARA_VOICE_CONSENT_ID", consentId],
    ["HAVEN_TTS_API_KEY", apiKey],
  ].filter(([, value]) => !value).map(([key]) => key);
  return { configured, provider: provider || null, voiceId: voiceId || null, consentRecorded: Boolean(consentId), missing };
}

export async function synthesizeAmara(cfg: VoiceConfig, text: string, language: string) {
  const status = voiceSynthesisStatus(cfg);
  if (!status.configured) throw Object.assign(new Error(`Dynamic Amara speech requires ${status.missing.join(", ")}`), { code: "configuration_required" });
  if (!/^https:\/\//i.test(String(cfg.HAVEN_TTS_ENDPOINT))) throw Object.assign(new Error("The TTS endpoint must use HTTPS"), { code: "invalid_configuration" });
  const response = await fetch(String(cfg.HAVEN_TTS_ENDPOINT), {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.HAVEN_TTS_API_KEY}`, "content-type": "application/json", accept: "audio/mpeg, audio/wav, audio/ogg" },
    body: JSON.stringify({ text, voice_id: cfg.AMARA_VOICE_ID, language, output_format: "mp3", watermark: true, consent_reference: cfg.AMARA_VOICE_CONSENT_ID, purpose: "oak-haven-assistant" }),
  });
  if (!response.ok) throw Object.assign(new Error(`The configured speech provider rejected the request (${response.status})`), { code: "provider_error" });
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("audio/")) throw Object.assign(new Error("The configured speech provider did not return audio"), { code: "provider_error" });
  return { bytes: await response.arrayBuffer(), contentType: type, provider: String(cfg.HAVEN_TTS_PROVIDER) };
}
