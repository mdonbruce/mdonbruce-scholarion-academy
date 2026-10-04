/**
 * Five-field cron expressions evaluated in an explicit IANA time zone (never the server's).
 * Supports *, lists, ranges and steps. Day-of-month and day-of-week follow the usual rule:
 * when both are restricted, either may match.
 */

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

function field(src: string, min: number, max: number): { set: Set<number>; star: boolean } {
  const out = new Set<number>();
  const star = src === "*";
  for (const part of src.split(",")) {
    const [range, stepS] = part.split("/");
    const step = stepS ? Number(stepS) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad step in "${src}"`);
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepS ? max : lo) : Number(b);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) throw new Error(`Out of range: "${src}"`);
    for (let v = lo; v <= hi; v += step) out.add(v === 7 && max === 7 ? 0 : v);
  }
  return { set: out, star };
}

export function parseCron(expr: string): CronSpec {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("A cron expression has five fields: minute hour day-of-month month day-of-week.");
  const m = field(parts[0], 0, 59);
  const h = field(parts[1], 0, 23);
  const d = field(parts[2], 1, 31);
  const mo = field(parts[3], 1, 12);
  const w = field(parts[4], 0, 7);
  return { minute: m.set, hour: h.set, dom: d.set, month: mo.set, dow: w.set, domStar: d.star, dowStar: w.star };
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in a time zone. */
const FMT = new Map<string, Intl.DateTimeFormat>();
export function zonedParts(ms: number, tz: string) {
  const f = FMT.get(tz) ?? FMT.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" })).get(tz)!;
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), dow: WD[p.weekday as string] };
}

function matches(s: CronSpec, z: ReturnType<typeof zonedParts>) {
  if (!s.minute.has(z.minute) || !s.hour.has(z.hour) || !s.month.has(z.month)) return false;
  const domOk = s.dom.has(z.day);
  const dowOk = s.dow.has(z.dow);
  if (s.domStar && s.dowStar) return true;
  if (s.domStar) return dowOk;
  if (s.dowStar) return domOk;
  return domOk || dowOk;
}

const MIN = 60_000;

/** The next fire time strictly after `afterMs` (minute resolution; searches up to ~400 days). */
export function nextFire(expr: string, tz: string, afterMs: number): number | null {
  const s = parseCron(expr);
  let t = Math.floor(afterMs / MIN) * MIN + MIN;
  const end = t + 400 * 24 * 60 * MIN;
  while (t < end) {
    const z = zonedParts(t, tz);
    if (!s.month.has(z.month) || !s.hour.has(z.hour)) {
      t += (60 - z.minute) * MIN;
      continue;
    }
    if (matches(s, z)) return t;
    t += MIN;
  }
  return null;
}

/** The most recent fire time at or before `atMs`, searching back at most `lookbackMs`. */
export function prevFire(expr: string, tz: string, atMs: number, lookbackMs = 40 * 24 * 60 * MIN): number | null {
  const s = parseCron(expr);
  let t = Math.floor(atMs / MIN) * MIN;
  const stop = t - lookbackMs;
  while (t >= stop) {
    const z = zonedParts(t, tz);
    if (!s.hour.has(z.hour)) {
      t -= (z.minute + 1) * MIN;
      continue;
    }
    if (matches(s, z)) return t;
    t -= MIN;
  }
  return null;
}

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
