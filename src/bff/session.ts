import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensurePlatform, identity, type User } from "@/platform";
import { SESSION_COOKIE } from "./http";

/** Server-component session access (Next.js specific). Route handlers use bff/http instead. */

export async function getUser(): Promise<User | null> {
  ensurePlatform();
  const jar = await cookies();
  return identity.resolveSession(jar.get(SESSION_COOKIE)?.value)?.user ?? null;
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
