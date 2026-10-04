import { config } from "../_lib";
export async function GET() {
  const c = config();
  const iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }, ...(c.HAVEN_TURN_URL ? [{ urls: c.HAVEN_TURN_URL, username: c.HAVEN_TURN_USERNAME || "", credential: c.HAVEN_TURN_CREDENTIAL || "" }] : [])];
  return Response.json({ loading: false, configured: Boolean(c.HAVEN_COMMUNICATIONS_GATEWAY_URL && c.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN), internalWebrtc: true, webrtc: true, queue: true, video: true, whatsapp: Boolean(c.HAVEN_WHATSAPP_GATEWAY_URL && c.HAVEN_WHATSAPP_GATEWAY_TOKEN), openai: Boolean(c.HAVEN_AI_VOICE_URL && c.HAVEN_AI_VOICE_TOKEN), sip: Boolean(c.HAVEN_COMMUNICATIONS_GATEWAY_URL && c.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN && c.HAVEN_SIP_GATEWAY_URI), turn: Boolean(c.HAVEN_TURN_URL), recording: Boolean(c.HAVEN_RECORDING_PROVIDER_URL), iceServers });
}
