import { env } from "cloudflare:workers";
export const config = () => env as unknown as Record<string, string | undefined>;
export const viewer = (request: Request) => {
  const email = String(request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  const explicitlyAuthorized = String(config().HAVEN_XCONNECT_ADMIN_EMAILS || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
  return { email, staff: email.endsWith("@oakhavensuites.com") || explicitlyAuthorized.includes(email) };
};
export const requireStaff = (request: Request) => {
  const user = viewer(request);
  if (!user.staff) throw new Error("Sign in with an authorized @oakhavensuites.com account to use HavenConnect calling");
  return user;
};
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
export async function verifyProviderRequest(request: Request, rawBody: string) {
  const secret = config().HAVEN_INBOUND_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-haven-signature")?.replace(/^sha256=/, "").toLowerCase();
  if (!secret || !supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  if (expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}
export async function gateway(path: string, body: Record<string, unknown>, method = "POST") {
  const cfg = config();
  if (!cfg.HAVEN_COMMUNICATIONS_GATEWAY_URL || !cfg.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN) throw new Error("HavenConnect communications gateway is not connected");
  const response = await fetch(`${cfg.HAVEN_COMMUNICATIONS_GATEWAY_URL.replace(/\/$/, "")}${path}`, { method, headers: { authorization: `Bearer ${cfg.HAVEN_COMMUNICATIONS_GATEWAY_TOKEN}`, "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data.error || "HavenConnect gateway request failed");
  return data;
}
export const normalizeDestination = (value: unknown) => {
  let number = String(value || "").trim().replace(/[\s().-]/g, "");
  if (/^0[789]\d{9}$/.test(number)) number = `+234${number.slice(1)}`;
  else if (/^234[789]\d{9}$/.test(number)) number = `+${number}`;
  else if (/^00\d{8,15}$/.test(number)) number = `+${number.slice(2)}`;
  return number;
};
export const validExtension = (value: unknown) => /^(?:[2-9]\d{3})$/.test(normalizeDestination(value));
export const validDestination = (value: unknown) => /^(?:\+\d{8,15}|[2-9]\d{3})$/.test(normalizeDestination(value));
export const isHavenVirtualNumber = (value: unknown) => /^\+(?:777|888|999)\d{7,12}$/.test(normalizeDestination(value));
