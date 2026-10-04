/** Routes that perform their own authentication (room membership or a signed inbound credential). */
const independentlyAuthenticated = new Set([
  "/api/agentic-ai",
  "/api/agentic-ai/inbound",
  "/api/communications/voice",
  "/api/communications/whatsapp",
  "/api/communications/ivr",
]);

export function apiAccess(pathname: string, email: string | null, adminEmails: string): "handler" | "staff" | "unauthorized" {
  if (independentlyAuthenticated.has(pathname) || /^\/api\/hooks\/[^/]+$/.test(pathname)) return "handler";
  const viewer = (email || "").trim().toLowerCase();
  const admins = adminEmails.toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
  return viewer && (viewer.endsWith("@oakhavensuites.com") || admins.includes(viewer)) ? "staff" : "unauthorized";
}
