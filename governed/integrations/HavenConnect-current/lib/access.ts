/** Who may sign in to HavenConnect, shared by the page gate and the Agentic AI API. */
import { env } from "cloudflare:workers";
import { loadAppsFromShared } from "./agentic-server";
import { canAccessApp } from "./apps";

const cfg = () => env as unknown as Record<string, string | undefined>;
const list = (key: string) => String(cfg()[key] || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
export const isPlatformAdmin = (email: string) => list("HAVEN_XCONNECT_ADMIN_EMAILS").includes(email.toLowerCase());
/** Same rule as the v39 staff boundary: an @oakhavensuites.com account or an explicitly listed administrator. */
export const isOakHavenStaff = (email: string) => { const e = email.toLowerCase().trim(); return Boolean(e) && (e.endsWith("@oakhavensuites.com") || isPlatformAdmin(e)); };
/** Product-room members from other domains get the Agentic AI rooms they belong to, not the staff workspace. */
export async function partnerRooms(email: string) {
  if (!email) return [];
  const apps = await loadAppsFromShared();
  return apps.filter(a => a.slug !== "oak-haven" && canAccessApp(a, email, false, false));
}
export const environmentName = (host: string) => String(cfg().HAVEN_ENVIRONMENT || (/^havenconnect-stage\./i.test(host) ? "staging" : "production")).toLowerCase();
