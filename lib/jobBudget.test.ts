import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory api_rate_counters for the service client.
const rows = new Map<string, number>();
let failReads = false;
vi.mock("./supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, v: string) => { q[col] = v; return chain; },
        maybeSingle: async () => (failReads ? { data: null, error: { message: "down" } } : { data: rows.has(`${q.key}|${q.window_start}`) ? { count: rows.get(`${q.key}|${q.window_start}`) } : null, error: null }),
        upsert: async (r: { key: string; window_start: string; count: number }) => { rows.set(`${r.key}|${r.window_start}`, r.count); return { error: null }; },
      };
      return chain;
    },
  }),
}));
const alarms: string[] = [];
vi.mock("./providerAlarm", () => ({ raiseAdminAlarm: (a: { fingerprint: string }) => alarms.push(a.fingerprint) }));

import { addJobSpend, budgetedJob, currentJob, jobBudgetSpent, jobCapUsd, jobSpendKey, jobSpendToday, runAsJob } from "./jobBudget";

const NOW = new Date("2026-11-23T09:00:00Z");

beforeEach(() => { rows.clear(); alarms.length = 0; failReads = false; delete process.env.JOB_AI_DAILY_CAP_USD; });

describe("jobCapUsd", () => {
  it("defaults to $15 and takes a positive override", () => {
    expect(jobCapUsd(undefined)).toBe(15);
    expect(jobCapUsd("40")).toBe(40);
    expect(jobCapUsd("-1")).toBe(15);
    expect(jobCapUsd("lots")).toBe(15);
  });
});

describe("the daily total", () => {
  it("is kept per UTC day", () => {
    expect(jobSpendKey(NOW)).toEqual({ key: "jobs:ai-micro-usd:2026-11-23", windowStart: "2026-11-23T00:00:00.000Z" });
  });
  it("adds each call's cost", async () => {
    await addJobSpend(2_500_000, NOW);
    await addJobSpend(1_000_000, NOW);
    expect(await jobSpendToday(NOW)).toBeCloseTo(3.5);
    expect(await jobSpendToday(new Date("2026-11-24T01:00:00Z"))).toBe(0);
  });
});

describe("jobBudgetSpent", () => {
  it("lets jobs run under the ceiling", async () => {
    await addJobSpend(14_000_000, NOW);
    expect(await jobBudgetSpent("weekly plans", NOW)).toBe(false);
    expect(alarms).toEqual([]);
  });
  it("stops them at the ceiling and tells the admins", async () => {
    await addJobSpend(15_000_000, NOW);
    expect(await jobBudgetSpent("weekly plans", NOW)).toBe(true);
    expect(alarms).toEqual(["job-budget:2026-11-23"]);
  });
  it("stops them when the total can't be read", async () => {
    failReads = true;
    expect(await jobBudgetSpent("weekly plans", NOW)).toBe(true);
  });
});

describe("runAsJob and budgetedJob", () => {
  it("marks code inside a job, and only inside", async () => {
    expect(currentJob()).toBeNull();
    expect(await runAsJob("weekly plans", async () => currentJob())).toBe("weekly plans");
  });
  it("skips the whole job once the ceiling is reached", async () => {
    let ran = false;
    expect(await budgetedJob("automatic replies", async () => { ran = true; return 1; }, NOW)).toBe(1);
    expect(ran).toBe(true);
    await addJobSpend(20_000_000, NOW);
    ran = false;
    expect(await budgetedJob("automatic replies", async () => { ran = true; return 1; }, NOW)).toEqual({ stopped: "job_budget" });
    expect(ran).toBe(false);
  });
});
