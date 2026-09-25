import { describe, it, expect, vi, afterEach } from "vitest";
import { PLANS } from "./plans";
import { consumeUsage, releaseUsage, mergeConfig, currentPeriods, type Entitlements } from "./entitlements";

// The two properties of the meter that must never regress:
//   1. a broken counter REFUSES the request (fail closed), it never lets it through;
//   2. a refund never goes through the caller's own session (that RPC is service-role only).

const ent = (plan: keyof typeof PLANS): Entitlements => {
  const periods = currentPeriods(new Date("2026-09-25T12:00:00Z"));
  return { userId: "u1", plan, config: mergeConfig(PLANS[plan]), period: periods.month, periods, source: "profile" };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (rpc: (...args: any[]) => Promise<{ data: unknown; error: unknown }>) => ({ rpc });

afterEach(() => vi.restoreAllMocks());

describe("metering fails closed", () => {
  it("refuses when the counter cannot be written, and marks it unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = client(async () => ({ data: null, error: new Error("function socia_consume_usage does not exist") }));
    const r = await consumeUsage(broken, ent("starter"), "ask_socia");
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBe(true);
    expect(r.usage.used).toBeNull();
    expect(r.error).toBeNull();
  });

  it("refuses when the RPC throws, too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing = client(async () => { throw new Error("network"); });
    const r = await consumeUsage(throwing, ent("growth"), "content_studio");
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBe(true);
  });

  it("counts and allows when the counter answers", async () => {
    const ok = client(async () => ({ data: [{ allowed: true, used_count: 3 }], error: null }));
    const r = await consumeUsage(ok, ent("starter"), "ask_socia");
    expect(r.allowed).toBe(true);
    expect(r.unavailable).toBeUndefined();
    expect(r.usage.used).toBe(3);
    expect(r.usage.remaining).toBe(PLANS.starter.meters.ask_socia - 3);
  });

  it("refuses at the limit with a usage error, not an outage", async () => {
    const full = client(async () => ({ data: [{ allowed: false, used_count: PLANS.starter.meters.ask_socia }], error: null }));
    const r = await consumeUsage(full, ent("starter"), "ask_socia");
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBeUndefined();
    expect(r.error?.code).toBe("usage_exhausted");
  });

  it("refuses a zero allowance without touching the counter", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const r = await consumeUsage(client(rpc), ent("free"), "content_plan");
    expect(r.allowed).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts a weekly meter in its week, not the month", async () => {
    const rpc = vi.fn(async () => ({ data: [{ allowed: true, used_count: 1 }], error: null }));
    const r = await consumeUsage(client(rpc), ent("free"), "content_ideas");
    expect(rpc).toHaveBeenCalledWith("socia_consume_usage", { p_meter: "content_ideas", p_period_start: "2026-09-21", p_limit: 3 });
    expect(r.usage.resetsOn).toBe("2026-09-28");
  });
});

describe("usage refunds", () => {
  it("never go through the caller's own session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const userRpc = vi.fn(async () => ({ data: null, error: null }));
    // No service-role key in the test environment: the refund must be skipped, not routed to the user client.
    await releaseUsage(client(userRpc), ent("starter"), "ask_socia");
    expect(userRpc).not.toHaveBeenCalled();
  });
});
