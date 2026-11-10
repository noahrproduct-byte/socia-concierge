import { beforeEach, describe, expect, it, vi } from "vitest";

// Paid AI work that runs without a person pressing a button: each one checks
// the owner's monthly AI ceiling first, and the free first plan is given once.
const s = vi.hoisted(() => ({
  over: false,
  events: [] as unknown[],
  eventRows: [] as unknown[],
  eventError: null as { message: string } | null,
  filters: [] as [string, string, unknown][],
  generated: 0,
  consumed: 0,
  snapshots: 0,
}));

function chain(table: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "eq", "is"]) {
    q[m] = (k: string, v: unknown) => { if (m === "eq" || m === "is") s.filters.push([m, k, v]); return q; };
  }
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (res: (v: unknown) => unknown) => res(table === "product_events" ? { data: s.eventError ? null : s.eventRows, error: s.eventError } : { data: [], error: null, count: 0 });
  return q;
}
const svc = { from: (table: string) => chain(table) } as never;

vi.mock("./supabase/service", () => ({ createServiceClient: () => svc }));
vi.mock("./aiSpend", () => ({ aiBudgetDenied: async () => (s.over ? new Response(null, { status: 429 }) : null) }));
vi.mock("./entitlements", () => ({
  getEntitlements: async () => ({ plan: "growth" }),
  canUseFeature: () => true,
  consumeUsage: async () => { s.consumed++; return { allowed: true, usage: { used: 1 } }; },
  releaseUsage: async () => null,
}));
vi.mock("./workspaces", () => ({ getActiveWorkspace: async () => null, competitorScopeId: async () => null, scopeToWorkspace: (q: unknown) => q }));
vi.mock("./instagramSync", () => ({ getIgSnapshot: async () => { s.snapshots++; return null; } }));
vi.mock("./planGenerate", () => ({ generatePlan: async () => { s.generated++; return { data: {}, saved: null }; } }));
vi.mock("./strategyLoad", () => ({ readStrategy: async () => null, generateStrategy: async () => null, saveStrategy: async () => true }));
vi.mock("./events", () => ({ trackEvent: async (...a: unknown[]) => { s.events.push(a); } }));

import { generateWeeklyPlanFor } from "./weeklyPlanJob";
import { initialPlanGiven, needsInitialPlan } from "./initialPlan";
import { transcriptionOverrun } from "./studioClips/job";

beforeEach(() => {
  s.over = false; s.events = []; s.eventRows = []; s.eventError = null; s.filters = [];
  s.generated = 0; s.consumed = 0; s.snapshots = 0;
});

describe("the Sunday plan job", () => {
  it("skips an owner whose month is over the plan's AI ceiling, before reading or counting anything", async () => {
    s.over = true;
    expect(await generateWeeklyPlanFor(svc, "owner-1", new Date("2026-11-08T23:00:00Z"), true)).toBe("over_budget");
    expect(s.snapshots).toBe(0);
    expect(s.consumed).toBe(0);
    expect(s.generated).toBe(0);
  });

  it("goes on to the account checks when the owner is under it", async () => {
    expect(await generateWeeklyPlanFor(svc, "owner-1", new Date("2026-11-08T23:00:00Z"), true)).toBe("no_account");
    expect(s.snapshots).toBe(1);
  });
});

describe("the free first plan after onboarding", () => {
  const ctx = (wsId: string | null) => ({ client: svc, ownerId: "owner-1", workspace: wsId ? { id: wsId } : null }) as never;

  it("is given while the brand has no plan and none was written for it", async () => {
    expect(await needsInitialPlan(ctx("ws-1"))).toBe(true);
    expect(s.filters).toContainEqual(["eq", "props->>workspace_id", "ws-1"]);
    expect(s.filters).toContainEqual(["eq", "name", "initial_plan"]);
  });

  it("isn't given again once it was written, even with the plans list emptied", async () => {
    s.eventRows = [{ id: 1 }];
    expect(await needsInitialPlan(ctx("ws-1"))).toBe(false);
    expect(await initialPlanGiven("owner-1", null)).toBe(true);
    expect(s.filters).toContainEqual(["is", "props->>workspace_id", null]);
  });

  it("isn't given when SOCIA can't tell whether it was", async () => {
    s.eventError = { message: "unavailable" };
    expect(await initialPlanGiven("owner-1", "ws-1")).toBe(true);
  });
});

describe("transcription of Build from Clips footage", () => {
  it("counts the audio the service heard beyond the length counted at submit", () => {
    expect(transcriptionOverrun(10, 10_000)).toBe(0);
    expect(transcriptionOverrun(10, 9_000)).toBe(0);
    expect(transcriptionOverrun(1, 600_000)).toBe(599);
    expect(transcriptionOverrun(null, 30_000)).toBe(30);
    expect(transcriptionOverrun(10, null)).toBe(0);
  });
});
