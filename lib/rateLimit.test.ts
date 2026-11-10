import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ rate: "ok" as "ok" | "limited" | "unavailable", over: false, budgetCalls: 0, budgetFor: [] as string[], keys: [] as string[] }));
vi.mock("@/lib/oauth/runtime", () => ({ rateHit: async (key: string) => { s.keys.push(key); return s.rate; } }));
vi.mock("@/lib/aiSpend", () => ({
  aiBudgetDenied: async (owner: string) => { s.budgetCalls++; s.budgetFor.push(owner); return s.over ? new Response(null, { status: 429 }) : null; },
}));

import { perUserLimit } from "./rateLimit";

beforeEach(() => { s.rate = "ok"; s.over = false; s.budgetCalls = 0; s.budgetFor = []; s.keys = []; });

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
  it("counts a member's hour on the member, and checks the month of the owner who pays", async () => {
    await perUserLimit("member-1", "clipper_reframe", 120, "clip framing", "owner-1");
    expect(s.keys).toEqual(["user:member-1:clipper_reframe"]);
    expect(s.budgetFor).toEqual(["owner-1"]);
    await perUserLimit("owner-1", "place_scan", 10, "place scans");
    expect(s.budgetFor).toEqual(["owner-1", "owner-1"]);
  });
});
