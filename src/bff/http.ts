import { identity, type User } from "@/platform";
import { PlatformError } from "@/platform/util";

/** HTTP helpers shared by the BFF router. Framework-agnostic (standard Request/Response). */

export const SESSION_COOKIE = "sch_session";

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function currentUser(req: Request): { user: User; token: string } | null {
  const token = readCookie(req, SESSION_COOKIE);
  const r = identity.resolveSession(token);
  return r && token ? { user: r.user, token } : null;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

/** Only same-site relative paths; blocks open redirects like //evil.example. */
export function safeRedirect(path: string | null | undefined, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}

export function redirect(to: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location: to, ...headers } });
}

export function withQuery(path: string, params: Record<string, string>): string {
  const u = new URL(path, "http://x");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.pathname + u.search;
}

export function isForm(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
}

export async function body(req: Request): Promise<Record<string, string>> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  if (isForm(req)) {
    const fd = await req.formData();
    const out: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (typeof v === "string") out[k] = v;
      else out[k] = (v as File).name;
    });
    return out;
  }
  try {
    const data = (await req.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  } catch {
    return {};
  }
}

/** CSRF defence for state-changing requests: Origin (when sent) must match Host. SameSite=Lax covers the rest. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function errorResponse(req: Request, err: unknown, back = "/"): Response {
  const pe = err instanceof PlatformError ? err : null;
  if (!pe) console.error("[bff] unexpected error", err);
  const message = pe?.message ?? "Something went wrong. Please try again.";
  const status = pe?.status ?? 500;
  if (isForm(req)) return redirect(withQuery(back, { error: message }));
  return json({ error: { code: pe?.code ?? "internal", message } }, status);
}
