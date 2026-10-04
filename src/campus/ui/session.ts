import "server-only";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import "../index";
import { broker, CampusError, resolveTenant, type Tenant, type TenantContext, type TenantStore } from "../core";
import { cookieName, resolveSession, type Actor } from "../iam";
import { ensureCampusSeed } from "../seed";

export interface CampusSession {
  tenant: Tenant;
  ctx: TenantContext;
  store: TenantStore;
  actor: Actor | null;
}

/** Server components: resolve the tenant (verified host or path slug) and the per-tenant session. */
export async function campusSession(slug: string): Promise<CampusSession> {
  ensureCampusSeed();
  const [jar, h] = await Promise.all([cookies(), headers()]);
  let ctx: TenantContext;
  try {
    ctx = resolveTenant({ host: h.get("x-forwarded-host") ?? h.get("host"), slug, traceId: h.get("x-trace-id") ?? undefined });
  } catch (e) {
    if (e instanceof CampusError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const tenant = broker.tenant(ctx.tenantId)!;
  if (tenant.status !== "active") return { tenant, ctx, store: null as unknown as TenantStore, actor: null };
  const store = broker.connect(ctx);
  const actor = resolveSession(store, jar.get(cookieName(tenant.id))?.value);
  return { tenant, ctx, store, actor };
}
