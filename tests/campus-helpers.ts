import "../src/campus";
import { broker, resetClock, type TenantContext, type TenantStore } from "../src/campus/core";
import { actorFor, type Actor } from "../src/campus/iam";
import { ensureCampusSeed, resetCampusSeed, type SeedUsers } from "../src/campus/seed";
import { resetRateLimits } from "../src/campus/services/integration";

Object.assign(process.env, { NODE_ENV: "test" });
process.env.CLOUDLAB_LOCAL_RUNNER ??= "1";

export function freshCampus(): Record<string, SeedUsers> {
  broker.reset();
  resetClock();
  resetCampusSeed();
  resetRateLimits();
  return ensureCampusSeed();
}

export function ctx(slug: string): TenantContext {
  const t = broker.tenant(slug)!;
  return { tenantId: t.id, slug: t.slug, via: "path", traceId: `test-${slug}` };
}

export function storeOf(slug: string): TenantStore {
  return broker.connect(ctx(slug));
}

/** A fresh store + actor for a seeded user key (e.g. "admin", "student1"). */
export function as(slug: string, key: string, mfa = true): { store: TenantStore; actor: Actor } {
  const store = storeOf(slug);
  return { store, actor: actorFor(store, `usr_${slug}_${key}`, mfa) };
}
