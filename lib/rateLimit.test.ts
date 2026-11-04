import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rate: "ok" as "ok" | "limited" | "unavailable", over: false, budgetCalls: 0 }));
vi.mock("@/lib/oauth/runtime", () => ({ rateHit: async () => s.rate }));
vi.mock("@/lib/aiSpend", () => ({
  aiBudgetDenied: async () => { s.budgetCalls++; return s.over ? new Response(null, { status: 429 }) : null; },
}));

import { perUserLimit } from "./rateLimit";

beforeEach(() => { s.rate = "ok"; s.over = false; s.budgetCalls = 0; });

describe("perUserLimit", () => {
  it("lets a request through under the hourly limit", async () => {
    expect(await perUserLimit("o", "niche", 15, "niche analyses")).toBeNull();
  });
  it("refuses at the hourly limit", async () => {
    s.rate = "limited";
    expect((await perUserLimit("o", "niche", 15, "niche analyses"))?.status).toBe(429);
  });
  it("refuses when the limiter can't count, instead of letting everything through", async () => {
    s.rate = "unavailable";
    expect((await perUserLimit("o", "niche", 15, "niche analyses"))?.status).toBe(503);
  });
  it("also stops AI actions at the plan's monthly AI ceiling, and only AI actions", async () => {
    s.over = true;
    expect((await perUserLimit("o", "comment_redraft", 20, "new reply suggestions"))?.status).toBe(429);
    expect(s.budgetCalls).toBe(1);
    expect(await perUserLimit("o", "platform-delete", 30, "deletes")).toBeNull();
    expect(s.budgetCalls).toBe(1);
  });
});
