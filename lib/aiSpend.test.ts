import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ spent: 0 as number | null, error: null as { message: string; code?: string } | null, rpc: [] as unknown[] }));
vi.mock("./supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => (state.error ? { data: null, error: state.error } : { data: state.spent == null ? null : { micro_usd: state.spent }, error: null });
      return q;
    },
    rpc: async (name: string, args: unknown) => { state.rpc.push({ name, args }); return { data: 1, error: null }; },
  }),
}));
vi.mock("./entitlements", () => ({ getEntitlements: async () => ({ plan: "starter" }) }));

import { addSpend, aiBudgetDenied, claudeMicros, monthKey, musicMicros, nextMonthStart, spendState, transcriptionMicros } from "./aiSpend";
import { PLANS } from "./plans";

beforeEach(() => { state.spent = 0; state.error = null; state.rpc = []; });

describe("what a call costs", () => {
  it("prices Claude by model, in millionths of a dollar", () => {
    expect(claudeMicros("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4_000_000);
    expect(claudeMicros("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 1000 })).toBe(12_000);
    expect(claudeMicros("claude-opus-5-5", { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 3 } })).toBe(30_000);
    expect(claudeMicros("claude-opus-5-5", { cache_read_input_tokens: 1_000_000 })).toBe(400_000);
  });
  it("prices an unknown model like the most expensive, never as free", () => {
    expect(claudeMicros("some-new-model", { output_tokens: 1000 })).toBe(20_000);
    expect(claudeMicros("claude-opus-5-5", null)).toBe(0);
  });
  it("prices transcription by the hour and music by the minute", () => {
    expect(transcriptionMicros(3600)).toBe(210_000);
    expect(musicMicros(60)).toBe(150_000);
  });
});

describe("the month", () => {
  it("is keyed on its first day and comes back on the 1st", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(monthKey(now)).toBe("2026-11-01");
    expect(nextMonthStart(now).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(monthKey(new Date("2026-12-31T23:59:00Z"))).toBe("2026-12-01");
  });
});

describe("the plan's ceiling", () => {
  it("every plan has one, below what it brings in", () => {
    for (const p of Object.values(PLANS)) {
      expect(p.aiSpendCapUsd).toBeGreaterThan(0);
      if (p.priceMonthly > 0) expect(p.aiSpendCapUsd).toBeLessThan(p.priceMonthly * 0.929 - 0.3);
    }
  });

  it("goes ahead under the ceiling, and refuses at it with when AI comes back", async () => {
    state.spent = 11_990_000;
    expect(await aiBudgetDenied("owner-1", null, new Date("2026-11-04T12:00:00Z"))).toBeNull();
    state.spent = PLANS.starter.aiSpendCapUsd * 1_000_000;
    const res = await aiBudgetDenied("owner-1", null, new Date("2026-11-04T12:00:00Z"));
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body).toMatchObject({ code: "ai_budget" });
    expect(body.error).toMatch(/December 1/);
  });

  it("goes ahead when the counter can't be read (before ai-spend.sql), so nothing breaks", async () => {
    state.error = { message: 'relation "public.ai_spend" does not exist', code: "42P01" };
    expect(await spendState("owner-1", { plan: "starter" } as never)).toBeNull();
    expect(await aiBudgetDenied("owner-1")).toBeNull();
  });

  it("adds a call's cost to the owner's month, and ignores nothing-cost calls", async () => {
    await addSpend("owner-1", 12_000, new Date("2026-11-04T12:00:00Z"));
    await addSpend("owner-1", 0);
    await addSpend(null, 5);
    expect(state.rpc).toEqual([{ name: "socia_ai_spend_add", args: { p_user: "owner-1", p_month: "2026-11-01", p_micros: 12_000 } }]);
  });
});
