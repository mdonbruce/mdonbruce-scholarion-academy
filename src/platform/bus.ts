import { getDb, nowIso, save } from "./store";
import type { CloudEvent } from "./types";
import { newId } from "./util";

/**
 * Platform event bus (Integration Spec §14). CloudEvents 1.0 envelope, at-least-once
 * semantics, idempotent consumers keyed on consumer + event id.
 * Local implementation: synchronous in-process fan-out with a durable log.
 */

type Handler = (evt: CloudEvent) => void;
interface Subscription {
  consumer: string;
  pattern: string; // exact type or prefix ending in ".*"
  handler: Handler;
}

const g = globalThis as unknown as { __scholarionBus?: Subscription[] };
const subs: Subscription[] = (g.__scholarionBus ??= []);

export function subscribe(consumer: string, pattern: string, handler: Handler): void {
  if (subs.some((s) => s.consumer === consumer && s.pattern === pattern)) return;
  subs.push({ consumer, pattern, handler });
}

function matches(pattern: string, type: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

/** Events carry ids, not PII. Callers must not put emails or names in `data`. */
export function publish<T extends Record<string, unknown>>(
  type: string,
  source: string,
  subject: string,
  data: T,
  tenantid = "academy-public",
): CloudEvent<T> {
  const evt: CloudEvent<T> = {
    specversion: "1.0",
    id: newId("evt"),
    type,
    source: `scholarion/${source}`,
    time: nowIso(),
    tenantid,
    subject,
    data,
  };
  const db = getDb();
  db.events.push(evt as CloudEvent);
  if (db.events.length > 2000) db.events.splice(0, db.events.length - 2000);
  deliver(evt as CloudEvent);
  save();
  return evt;
}

function deliver(evt: CloudEvent): void {
  const db = getDb();
  for (const s of subs) {
    if (!matches(s.pattern, evt.type)) continue;
    const key = `${s.consumer}:${evt.id}`;
    if (db.processed.includes(key)) continue;
    try {
      s.handler(evt);
      db.processed.push(key);
      if (db.processed.length > 5000) db.processed.splice(0, db.processed.length - 5000);
    } catch (err) {
      // Dead-letter: keep the event in the log; a replay will retry this consumer.
      console.error(`[bus] consumer ${s.consumer} failed on ${evt.type}`, err);
    }
  }
}

/** Replay unprocessed events (e.g. after a consumer fix). */
export function replay(sinceIso?: string): number {
  const db = getDb();
  let n = 0;
  for (const evt of db.events) {
    if (sinceIso && evt.time < sinceIso) continue;
    deliver(evt);
    n++;
  }
  save();
  return n;
}
