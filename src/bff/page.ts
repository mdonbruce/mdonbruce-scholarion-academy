/** Small helpers for App Router pages (Next 15: params and searchParams are Promises). */

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function flashOf(sp: Record<string, string | string[] | undefined>) {
  return { notice: one(sp.notice), error: one(sp.error) };
}
