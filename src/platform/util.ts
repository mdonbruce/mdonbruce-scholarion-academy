import { randomBytes, createHash } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID-style id: 10 chars of time + 16 chars of randomness, prefixed for readability. */
export function newId(prefix: string): string {
  let t = Date.now();
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return `${prefix}_${time}${rand}`;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export const DAY = 24 * 60 * 60 * 1000;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString();
}

export function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Damerau-free Levenshtein, small strings only (search typo tolerance). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const prev = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[n];
}

export class PlatformError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
