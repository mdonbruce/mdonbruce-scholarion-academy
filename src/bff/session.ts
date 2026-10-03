import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, localeFromAcceptLanguage, REGION_COOKIE, setRequestPrefs } from "@/i18n";
import { regionFromAcceptLanguage } from "@/platform/pricing";
import { redirect } from "next/navigation";
import { ensurePlatform, identity, type User } from "@/platform";
import { SESSION_COOKIE } from "./http";

/** Server-component session access (Next.js specific). Route handlers use bff/http instead. */

export async function getUser(): Promise<User | null> {
  ensurePlatform();
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const user = identity.resolveSession(jar.get(SESSION_COOKIE)?.value)?.user ?? null;
  // Language and price region for this request: cookie → saved preference → browser.
  const accept = h.get("accept-language");
  setRequestPrefs({
    locale: jar.get(LOCALE_COOKIE)?.value ?? user?.locale ?? localeFromAcceptLanguage(accept),
    region: jar.get(REGION_COOKIE)?.value ?? user?.region ?? regionFromAcceptLanguage(accept),
  });
  return user;
}

export async function requireUser(next: string): Promise<User> {
  const u = await getUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireRole(next: string, ...roles: Parameters<typeof identity.hasRole>[1][]): Promise<User> {
  const u = await requireUser(next);
  if (!identity.hasRole(u, ...roles)) redirect("/app");
  if (identity.needsMfaSetup(u)) redirect("/app/security?required=1");
  return u;
}
