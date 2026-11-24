import { describe, it, expect, vi, beforeEach } from "vitest";

const hits = new Map<string, number>();
let down = false;
vi.mock("./oauth/runtime", () => ({
  rateHit: async (key: string, _w: number, limit: number) => {
    if (down) return "unavailable";
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return n <= limit ? "ok" : "limited";
  },
}));
const alarms: string[] = [];
vi.mock("./providerAlarm", async (orig) => ({ ...(await orig<typeof import("./providerAlarm")>()), raiseAdminAlarm: (a: { fingerprint: string }) => alarms.push(a.fingerprint) }));

import { PLAN_TRIES_PER_DAY, planTryAllowed } from "./weeklyPlanJob";

const NOW = new Date("2026-11-23T03:00:00Z");
beforeEach(() => { hits.clear(); alarms.length = 0; down = false; });

describe("automatic plan tries", () => {
  it(`allows ${PLAN_TRIES_PER_DAY} tries a day, then stops and tells the admins once`, async () => {
    const results = [];
    for (let k = 0; k < 6; k++) results.push(await planTryAllowed("owner-1", NOW));
    expect(results).toEqual([true, true, false, false, false, false]);
    expect(new Set(alarms)).toEqual(new Set(["weekly-plan-gave-up:owner-1:2026-11-23"]));
  });
  it("counts each account on its own", async () => {
    await planTryAllowed("owner-1", NOW);
    await planTryAllowed("owner-1", NOW);
    expect(await planTryAllowed("owner-2", NOW)).toBe(true);
  });
  it("doesn't try when the count can't be kept", async () => {
    down = true;
    expect(await planTryAllowed("owner-1", NOW)).toBe(false);
  });
});
