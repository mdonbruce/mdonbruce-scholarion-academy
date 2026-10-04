/** Next 15 searchParams → flat record (repeated keys joined with commas). */
export type RawSP = Promise<Record<string, string | string[] | undefined>>;
export async function flat(sp: RawSP): Promise<Record<string, string | undefined>> {
  const v = await sp;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? x.join(",") : x]));
}
