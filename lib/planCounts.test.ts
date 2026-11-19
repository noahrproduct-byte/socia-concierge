import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./supabase/service", () => ({ createServiceClient: () => null }));
import { proofLine, countByPlan, PROOF_MIN, loadPlanCounts } from "./planCounts";

describe("pricing social proof", () => {
  it("says nothing below the minimum, or without a count", () => {
    expect(proofLine("growth", undefined)).toBeNull();
    expect(proofLine("growth", 0)).toBeNull();
    expect(proofLine("growth", PROOF_MIN - 1)).toBeNull();
  });
  it("states the real count once it is proof", () => {
    expect(proofLine("growth", 1240)).toBe("1,240 accounts are on Growth today");
  });
  it("counts only known plans", () => {
    expect(countByPlan([{ plan: "growth" }, { plan: "growth" }, { plan: "pro" }, { plan: null }, { plan: "bogus" }])).toEqual({ growth: 2, pro: 1 });
  });
  it("reads nothing (so shows nothing) without the service client", async () => {
    expect(await loadPlanCounts()).toEqual({});
  });
});
