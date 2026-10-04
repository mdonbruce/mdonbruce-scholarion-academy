// Example: a Haven product backend (HavenUP, Scholaris, HomePilot, …) sending a customer message
// into its HavenConnect Agentic AI room. Run: node send-message.mjs
// Requires Node 18+. Keep the secret on your server; never ship it to a browser or mobile app.
import { createHmac, randomUUID } from "node:crypto";

const HAVENCONNECT_URL = process.env.HAVENCONNECT_URL || "https://havenconnect-stage.oakhavensuites.com";
const APP = process.env.HAVEN_APP || "havenup";                 // room slug
const SECRET = process.env.HAVEN_INBOUND_SECRET;                // same value as HAVEN_INBOUND_SECRET_<APP> in HavenConnect

const body = JSON.stringify({
  externalId: "booking-88412",            // your conversation or ticket id; later messages with the same id continue the session
  messageId: randomUUID(),                // makes retries safe
  channel: "Web",                         // Web, Mobile, Voice, Email, SMS, WhatsApp, Instagram, Messenger, X, Facebook
  subject: "Change booking date",
  text: "Hi, I need to move my booking from Friday to Saturday.",
  customer: { name: "Tom Becker", reference: "HV-88412" },
});
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");

const res = await fetch(`${HAVENCONNECT_URL}/api/agentic-ai/inbound`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-haven-app": APP, "x-haven-timestamp": timestamp, "x-haven-signature": `sha256=${signature}` },
  body,
});
console.log(res.status, await res.json());
