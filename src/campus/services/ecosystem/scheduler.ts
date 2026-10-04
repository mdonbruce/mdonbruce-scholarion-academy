import { broker } from "../../core";
import { tickPlans } from "../plans";
import { ecoTick } from "./discovery";

/**
 * In-process scheduler: every minute, plan and work due discovery jobs for each active tenant.
 * Starts with the campus (not in tests; set SCHOLARION_SCHEDULER=off to disable, e.g. when an
 * external cron calls the eco.tick / ops.run_jobs operations instead). Overlap is prevented by
 * job leases and unique period keys, so an external cron and this loop can safely coexist.
 */
const G = globalThis as unknown as { __scholarionEcoScheduler?: ReturnType<typeof setInterval>; __scholarionEcoBusy?: boolean };

export function startEcoScheduler(intervalMs = 60_000) {
  if (G.__scholarionEcoScheduler || process.env.NODE_ENV === "test" || process.env.SCHOLARION_SCHEDULER === "off") return false;
  G.__scholarionEcoScheduler = setInterval(async () => {
    if (G.__scholarionEcoBusy) return;
    G.__scholarionEcoBusy = true;
    try {
      for (const t of broker.tenants().filter((x) => x.status === "active" && x.kind !== "validation")) {
        const store = broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: "eco-scheduler" });
        try {
          tickPlans(store); // subscription reminders, renewals and period ends (sandbox)
        } catch (e) {
          console.error(`[plans] ${t.slug}:`, (e as Error).message);
        }
        if (!store.list("eco_schedules", () => true).length) continue;
        await ecoTick(store, 5).catch((e) => console.error(`[eco-scheduler] ${t.slug}:`, (e as Error).message));
      }
    } finally {
      G.__scholarionEcoBusy = false;
    }
  }, intervalMs);
  G.__scholarionEcoScheduler.unref?.();
  return true;
}

export function stopEcoScheduler() {
  if (G.__scholarionEcoScheduler) clearInterval(G.__scholarionEcoScheduler);
  G.__scholarionEcoScheduler = undefined;
}
