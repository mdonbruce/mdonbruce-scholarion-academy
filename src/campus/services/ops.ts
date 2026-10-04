import { ecoTick } from "./ecosystem/discovery";
import { broker, CampusError, consumerNames, metrics, nowIso, nowMs, relay, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { announcementJob } from "./collaboration";
import { missingJob } from "./grading";
import { overdueJob } from "./sis";
import { digestJob, retentionJob } from "./success";
import { deliverWebhooks } from "./integration";
import { backupTenant, restoreDrill } from "./admin";
import { recordingRetentionJob } from "./calendar";
import { runQueuedJobs } from "./accountcfg";

/**
 * Operations (Tab 28, platform operators): scheduled jobs, SLOs, health, incidents,
 * backups and restore drills. Per-tenant figures never mix tenants' data — each is read
 * through that tenant's own store.
 */

export const SLO_TARGETS = { availability: 0.995, p95LatencyMs: 800, outboxLagSec: 60, deadLetters: 0 };

const latencies: number[] = [];
export function recordRequest(ms: number, status: number, route: string) {
  latencies.push(ms);
  if (latencies.length > 5000) latencies.splice(0, latencies.length - 5000);
  metrics.inc("api_requests_total", { status: String(Math.floor(status / 100)) + "xx", route });
}

function p95() {
  if (!latencies.length) return 0;
  const s = [...latencies].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length * 0.95)] ?? s[s.length - 1]);
}

/** Run every scheduled job for one tenant (cron calls this; tests call it directly). */
export async function runJobs(store: TenantStore) {
  const out: Record<string, unknown> = {};
  out.announcements = announcementJob(store);
  out.missing = missingJob(store);
  out.overdue = overdueJob(store);
  out.retention = retentionJob(store);
  out.recordings = recordingRetentionJob(store);
  out.backgroundJobs = runQueuedJobs(store).length;
  out.digestDaily = digestJob(store, "daily");
  out.ecosystem = await ecoTick(store);
  out.relayed = relay(store);
  out.webhooks = await deliverWebhooks(store);
  metrics.inc("jobs_runs_total", { tenant: store.tenantId });
  return out;
}

export function tenantHealth(store: TenantStore) {
  const pending = store.outbox().filter((e) => e.status === "pending");
  const oldest = pending.reduce((m, e) => Math.min(m, Date.parse(e.at)), nowMs());
  return {
    outboxPending: pending.length,
    outboxLagSec: pending.length ? Math.round((nowMs() - oldest) / 1000) : 0,
    deadLetters: store.outbox().filter((e) => e.status === "dead").length,
    webhookDead: store.list("webhook_deliveries", (d) => d.state === "dead").length,
    consumers: consumerNames(),
  };
}

export function slos() {
  const total = [...metrics.counters.entries()].filter(([k]) => k.startsWith("api_requests_total")).reduce((s, [, v]) => s + v, 0);
  const errors = [...metrics.counters.entries()].filter(([k]) => k.startsWith("api_requests_total") && k.includes('status="5xx"')).reduce((s, [, v]) => s + v, 0);
  const availability = total ? 1 - errors / total : 1;
  const tenants = broker.tenants().filter((t) => t.kind !== "validation" && t.status === "active").map((t) => {
    const store = broker.connect({ tenantId: t.id, slug: t.slug, via: "path", traceId: "ops-slo" });
    return { tenant: t.slug, ...tenantHealth(store) };
  });
  const worstLag = Math.max(0, ...tenants.map((t) => t.outboxLagSec));
  const dead = tenants.reduce((s, t) => s + t.deadLetters, 0);
  return {
    targets: SLO_TARGETS,
    current: { availability: Math.round(availability * 10000) / 10000, p95LatencyMs: p95(), outboxLagSec: worstLag, deadLetters: dead, requests: total },
    met: { availability: availability >= SLO_TARGETS.availability, p95LatencyMs: p95() <= SLO_TARGETS.p95LatencyMs, outboxLagSec: worstLag <= SLO_TARGETS.outboxLagSec, deadLetters: dead <= SLO_TARGETS.deadLetters },
    tenants,
    at: nowIso(),
  };
}

export function opsOverview(a: Actor) {
  if (!a.platformOperator) throw new CampusError("forbidden", "Platform operators only.", 403);
  return {
    tenants: broker.tenants().map((t) => ({ id: t.id, slug: t.slug, name: t.name, kind: t.kind, status: t.status, domains: t.domains })),
    backups: broker.platform().backups.slice(-20).reverse(),
    slos: slos(),
  };
}

/** Nightly: back up each live tenant and run a restore drill on the newest backup. */
export function nightlyBackupAndDrill() {
  const reports = [];
  for (const t of broker.tenants().filter((x) => x.kind !== "validation" && x.status === "active")) {
    const b = backupTenant(null, t.id);
    reports.push(restoreDrill(null, b.id));
  }
  return reports;
}
