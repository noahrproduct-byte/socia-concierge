import { describe, it, expect, vi, beforeEach } from "vitest";

// Every AI feature is paid from one credit balance (2026-11-15): requireUsage
// takes the action's fixed price, refuses with a credits notice when short,
// refunds when the work fails, and falls back to the old per-feature allowance
// only when the credit tables aren't installed.

const balance = vi.fn();
const spend = vi.fn();
const refund = vi.fn();
const consume = vi.fn();
const budget = vi.fn();

vi.mock("./credits/ledger", async () => {
  class CreditsError extends Error {
    constructor(public code: string, message: string, public balance: number | null = null) { super(message); }
  }
  return { CreditsError, creditBalance: balance, spendCredits: spend, refundCredits: refund };
});
vi.mock("./credits/topups", () => ({ topupsOpen: () => false }));
vi.mock("./aiSpend", () => ({ aiBudgetDenied: budget, nextMonthStart: () => new Date("2026-12-01T00:00:00Z") }));
vi.mock("./events", () => ({ trackEvent: async () => {} }));
vi.mock("./entitlements", () => ({
  getEntitlements: async () => ({ userId: "owner", plan: "starter", invites: 0, config: { meters: { content_studio: 30, ask_socia: 50, animated_videos: 0, assistant_requests: 100 } }, periods: {} }),
  checkFeature: () => ({ ok: true }),
  consumeUsage: consume,
  releaseUsage: async () => {},
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) },
  after: (fn: () => void) => fn(),
}));

const { requireUsage } = await import("./planGuard");
const { actionCredits } = await import("./credits/config");

beforeEach(() => {
  balance.mockReset(); spend.mockReset(); refund.mockReset(); consume.mockReset(); budget.mockReset();
  budget.mockResolvedValue(null);
});

describe("paying for AI with credits", () => {
  it("takes the action's price and reports the balance left", async () => {
    balance.mockResolvedValue(1000);
    spend.mockResolvedValue(1000 - actionCredits("content_studio"));
    const u = await requireUsage({}, "owner", "content_studio");
    expect(u.denied).toBeNull();
    expect(spend).toHaveBeenCalledWith("owner", actionCredits("content_studio"), expect.objectContaining({ kind: "action" }), "content_studio");
    expect(u.usage?.credits).toEqual({ balance: 1000 - actionCredits("content_studio"), cost: actionCredits("content_studio") });
    expect(consume).not.toHaveBeenCalled();
  });

  it("refuses with a credits notice when the balance is short, spending nothing", async () => {
    balance.mockResolvedValue(5);
    const u = await requireUsage({}, "owner", "content_studio");
    const res = u.denied as unknown as { body: { code: string; credits: { balance: number; cost: number }; error: string }; status: number };
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("credits_short");
    expect(res.body.credits).toEqual({ balance: 5, cost: actionCredits("content_studio") });
    expect(res.body.error).toMatch(/needs \d+ credits and you have 5 left this month/);
    expect(spend).not.toHaveBeenCalled();
  });

  it("gives the credits back when the work fails", async () => {
    balance.mockResolvedValue(500);
    spend.mockResolvedValue(494);
    const u = await requireUsage({}, "owner", "ask_socia");
    await u.release();
    const ref = spend.mock.calls[0][2];
    expect(refund).toHaveBeenCalledWith("owner", ref, expect.any(String));
  });

  it("falls back to the per-feature allowance when the credit tables aren't installed", async () => {
    balance.mockResolvedValue(null);
    consume.mockResolvedValue({ allowed: true, usage: { meter: "ask_socia", used: 1, limit: 50, remaining: 49, resetsOn: "2026-12-01" }, error: null });
    const u = await requireUsage({}, "owner", "ask_socia");
    expect(u.denied).toBeNull();
    expect(consume).toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });

  it("refuses a feature the plan doesn't include, without touching credits", async () => {
    const u = await requireUsage({}, "owner", "animated_videos");
    const res = u.denied as unknown as { body: { code: string; error: string } };
    expect(res.body.code).toBe("usage_exhausted");
    expect(res.body.error).toMatch(/not included/);
    expect(balance).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });

  it("leaves allowances that aren't AI (AI assistant requests) on their own counter", async () => {
    consume.mockResolvedValue({ allowed: true, usage: { meter: "assistant_requests", used: 1, limit: 100, remaining: 99, resetsOn: "2026-12-01" }, error: null });
    await requireUsage({}, "owner", "assistant_requests");
    expect(balance).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalled();
  });
});
