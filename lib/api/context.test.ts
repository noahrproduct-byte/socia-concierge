import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Workspace } from "../workspaces";

const state = {
  workspaces: [] as Workspace[],
  plan: "growth",
  features: { ai_assistants: true } as Record<string, boolean>,
  perMinute: 30,
  rateOk: true,
  meter: { allowed: true, unavailable: false, used: 1, limit: 5000 },
  rateKeys: [] as string[],
  consumedFor: [] as string[],
};

vi.mock("../workspaces", () => ({ listAccessibleWorkspaces: async () => state.workspaces }));
vi.mock("../oauth/runtime", () => ({ rateHit: async (key: string) => { state.rateKeys.push(key); return state.rateOk ? "ok" : "limited"; } }));
vi.mock("../entitlements", () => ({
  getEntitlements: async (_svc: unknown, ownerId: string) => ({ userId: ownerId, plan: state.plan }),
  canUseFeature: (_ent: unknown, key: string) => Boolean(state.features[key]),
  getLimit: () => state.perMinute,
  consumeUsage: async (_svc: unknown, ent: { userId: string }) => {
    state.consumedFor.push(ent.userId);
    return { allowed: state.meter.allowed, unavailable: state.meter.unavailable, usage: { used: state.meter.used, limit: state.meter.limit } };
  },
}));

const { apiContext, guardRequest, listGranted, ApiFailure } = await import("./context");

const ws = (id: string, ownerId: string, over: Partial<Workspace> = {}): Workspace => ({
  id, ownerId, name: `WS ${id}`, isDefault: false, suspended: false, role: ownerId === "me" ? "owner" : "member",
  niche: null, brand_name: null, goals: null, brand_detail: null, niche_detail: null, niche_analyzed_at: null, ...over,
} as Workspace);
const principal = (workspaceIds: string[]) => ({ userId: "me", connectionId: "c1", clientId: "claude", clientName: "Claude", scopes: ["socia:read"], workspaceIds, expiresAt: 0 });
const svc = {} as never;

beforeEach(() => {
  state.workspaces = [ws("w1", "me", { isDefault: true }), ws("w2", "me"), ws("w3", "boss", { role: "admin" }), ws("w4", "me", { suspended: true })];
  state.features = { ai_assistants: true };
  state.rateOk = true;
  state.meter = { allowed: true, unavailable: false, used: 1, limit: 5000 };
  state.rateKeys = [];
  state.consumedFor = [];
});

describe("which workspace a connection may read", () => {
  it("lists only workspaces that were shared AND are still open to the person AND not paused", async () => {
    const out = await listGranted(svc, principal(["w1", "w3", "w4", "w-gone"]));
    expect(out).toEqual([
      { id: "w1", name: "WS w1", yourRole: "owner", isDefault: true },
      { id: "w3", name: "WS w3", yourRole: "admin", isDefault: false },
    ]);
  });

  it("reads a shared workspace as its owner (the team-member path), never another", async () => {
    const own = await apiContext(svc, principal(["w1", "w3"]), "w1");
    expect(own).toMatchObject({ ownerId: "me", viewerId: "me", role: "owner", isOwner: true, workspace: { id: "w1" } });
    const invited = await apiContext(svc, principal(["w1", "w3"]), "w3");
    expect(invited).toMatchObject({ ownerId: "boss", viewerId: "me", role: "admin", isOwner: false });
    await expect(apiContext(svc, principal(["w1"]), "w2")).rejects.toMatchObject({ code: "forbidden" }); // owned but not shared
    await expect(apiContext(svc, principal(["w1", "w4"]), "w4")).rejects.toMatchObject({ code: "forbidden" }); // paused
    await expect(apiContext(svc, principal(["w9"]), "w9")).rejects.toMatchObject({ code: "forbidden" }); // someone else's
  });

  it("loses access the moment the person loses it in SOCIA", async () => {
    const p = principal(["w3"]);
    expect((await apiContext(svc, p)).workspace?.id).toBe("w3");
    state.workspaces = state.workspaces.filter((w) => w.id !== "w3"); // removed from the team
    await expect(apiContext(svc, p)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("uses the only shared workspace by default and asks when there are several", async () => {
    expect((await apiContext(svc, principal(["w2"]))).workspace?.id).toBe("w2");
    const e = await apiContext(svc, principal(["w1", "w2"])).catch((x) => x);
    expect(e).toBeInstanceOf(ApiFailure);
    expect(e.code).toBe("invalid_input");
  });
});

describe("the per-request gate", () => {
  it("checks the owner's plan, then this connection's rate, then the owner's monthly meter", async () => {
    await guardRequest(svc, principal(["w3"]), "boss");
    expect(state.rateKeys).toEqual(["mcp:c1"]);
    expect(state.consumedFor).toEqual(["boss"]);
  });
  it("refuses when the plan doesn't include AI assistants", async () => {
    state.features = {};
    await expect(guardRequest(svc, principal(["w1"]), "me")).rejects.toMatchObject({ code: "forbidden" });
    expect(state.rateKeys).toEqual([]);
  });
  it("refuses over the per-minute limit without spending the monthly meter", async () => {
    state.rateOk = false;
    await expect(guardRequest(svc, principal(["w1"]), "me")).rejects.toMatchObject({ code: "limited" });
    expect(state.consumedFor).toEqual([]);
  });
  it("refuses when the monthly meter is used up, or can't be checked", async () => {
    state.meter = { ...state.meter, allowed: false };
    await expect(guardRequest(svc, principal(["w1"]), "me")).rejects.toMatchObject({ code: "limited" });
    state.meter = { ...state.meter, allowed: false, unavailable: true };
    await expect(guardRequest(svc, principal(["w1"]), "me")).rejects.toMatchObject({ code: "unavailable" });
  });
});
