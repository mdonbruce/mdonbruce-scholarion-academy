import { ensurePlatform } from "../src/platform";
import { seed } from "../src/platform/seed";
import { getDb } from "../src/platform/store";
import { DAY } from "../src/platform/util";

Object.assign(process.env, { NODE_ENV: "test" });
process.env.CLOUDLAB_LOCAL_RUNNER ??= "1";

/** Fresh seeded platform for each test (consumers stay wired). */
export function fresh(): void {
  ensurePlatform();
  seed();
}

export function advanceDays(days: number): void {
  getDb().clockOffsetMs += days * DAY;
}
