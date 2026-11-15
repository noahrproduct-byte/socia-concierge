import { describe, it, expect, vi } from "vitest";

// A cancelled Pro trial falls to Free: one workspace, one account per
// platform, the Free competitor count. The extras are paused, never deleted.
vi.mock("./entitlements", () => ({
  getEntitlements: async () => ({ plan: "free", config: { limits: { workspaces: 1, competitors: 2 } } }),
  getLimit: (ent: { config: { limits: Record<string, number> } }, k: string) => ent.config.limits[k],
  listConnectedAccounts: async () => [
    { id: "instagram:1", platform: "instagram", suspended: false },
    { id: "instagram:2", platform: "instagram", suspended: false },
    { id: "facebook:9", platform: "facebook", suspended: false },
    { id: "instagram:3", platform: "instagram", suspended: true },
  ],
}));

const { enforcePlanLimits, resumeWithin, competitorsOverLimit, competitorsToResume } = await import("./planDowngrade");

function svc(workspaces: { id: string; is_default: boolean; plan_suspended_at: string | null; created_at: string }[], competitors: { workspace_id?: string | null; platform: string; handle: string; is_active: boolean; added_at: string }[]) {
  const calls: { op: string; table?: string; value?: unknown; ids?: unknown; eqs?: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    let op = "select"; let value: unknown; let ids: unknown; const eqs: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { eqs[c] = v; return b; },
      is: (c: string, v: unknown) => { eqs[c] = v; return b; },
      in: (_c: string, v: unknown) => { ids = v; return b; },
      update: (v: unknown) => { op = "update"; value = v; return b; },
      then: (res: (v: unknown) => unknown) => {
        if (op === "update") { calls.push({ op, table, value, ids, eqs }); return Promise.resolve({ error: null }).then(res); }
        return Promise.resolve({ data: table === "workspaces" ? workspaces : competitors, error: null }).then(res);
      },
    };
    return b;
  };
  const rpc = async (name: string, args: unknown) => { calls.push({ op: "rpc", table: name, value: args }); return { error: null }; };
  return { client: { from, rpc } as never, calls };
}

describe("after a downgrade", () => {
  it("pauses the extra workspaces, accounts and competitors and keeps the defaults", async () => {
    const s = svc(
      [
        { id: "w-new", is_default: false, plan_suspended_at: null, created_at: "2026-10-10" },
        { id: "w-default", is_default: true, plan_suspended_at: null, created_at: "2026-10-12" },
        { id: "w-old", is_default: false, plan_suspended_at: null, created_at: "2026-09-01" },
      ],
      [
        { workspace_id: "w-default", platform: "instagram", handle: "b", is_active: true, added_at: "2026-10-02" },
        { workspace_id: "w-default", platform: "instagram", handle: "a", is_active: true, added_at: "2026-10-01" },
        { workspace_id: "w-default", platform: "instagram", handle: "c", is_active: true, added_at: "2026-10-03" },
      ],
    );
    const r = await enforcePlanLimits(s.client, "owner-1", new Date("2026-10-22T00:00:00Z"));
    expect(r).toEqual({ workspacesPaused: 2, accountsPaused: 1, competitorsPaused: 1 });
    const pause = s.calls.find((c) => c.op === "update" && c.table === "workspaces");
    expect(pause?.ids).toEqual(["w-old", "w-new"]);
    const comp = s.calls.find((c) => c.op === "update" && c.table === "tracked_competitors");
    expect(comp?.value).toEqual({ is_active: false });
    expect(comp?.ids).toEqual(["c"]);
    expect(comp?.eqs).toMatchObject({ user_id: "owner-1", platform: "instagram", workspace_id: "w-default" });
    const keep = s.calls.find((c) => c.op === "rpc")?.value as { p_accounts: string[]; p_competitors: string[] | null };
    expect(keep.p_accounts).toEqual(["instagram:1", "facebook:9"]);
    expect(keep.p_competitors).toBeNull();
  });

  it("does nothing when everything fits", async () => {
    const s = svc([{ id: "w", is_default: true, plan_suspended_at: null, created_at: "2026-10-01" }], []);
    const r = await enforcePlanLimits(s.client, "owner-1");
    expect(r.workspacesPaused).toBe(0);
    expect(s.calls.filter((c) => c.op === "update")).toEqual([]);
  });
});

describe("resuming after an upgrade", () => {
  it("resumes paused items in order, only as far as the plan allows", () => {
    expect(resumeWithin(["a"], ["b", "c", "d"], 3)).toEqual(["b", "c"]);
    expect(resumeWithin(["a", "b"], ["c"], 2)).toEqual([]);
    expect(resumeWithin(["a", "b", "c"], ["d"], 2)).toEqual([]);
  });
});

describe("competitors per brand", () => {
  const row = (workspace_id: string | null, handle: string, added_at: string, is_active = true) => ({ workspace_id, platform: "instagram", handle, added_at, is_active });
  it("trims each brand to the limit on its own, earliest added staying", () => {
    const rows = [row("a", "x", "1"), row("a", "y", "2"), row("a", "z", "3"), row("b", "x", "1"), row("b", "q", "2")];
    expect(competitorsOverLimit(rows, 2).map((c) => `${c.workspace_id}:${c.handle}`)).toEqual(["a:z"]);
  });
  it("resumes paused ones only where their brand has room", () => {
    const rows = [row("a", "x", "1"), row("a", "y", "2", false), row("b", "x", "1"), row("b", "q", "2"), row("b", "r", "3", false)];
    expect(competitorsToResume(rows, 2).map((c) => `${c.workspace_id}:${c.handle}`)).toEqual(["a:y"]);
  });
});
