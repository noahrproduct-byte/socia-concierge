import { describe, it, expect } from "vitest";
import { activeWorkspaces, getActiveWorkspace, type Workspace } from "./workspaces";

// A tiny stand-in for the parts of the Supabase client these helpers touch:
// a workspaces table and a profiles.active_workspace_id lookup.
function fakeSupabase(rows: Partial<Workspace & { plan_suspended_at: string | null }>[], activeId: string | null) {
  const dbRows = rows.map((r, i) => ({
    id: r.id ?? `w${i}`,
    owner_id: "u1",
    name: r.name ?? `W${i}`,
    is_default: r.isDefault ?? false,
    plan_suspended_at: r.suspended ? "2026-01-01" : null,
    niche: null, brand_name: null, goals: null, brand_detail: null, niche_detail: null, niche_analyzed_at: null,
    created_at: `2026-01-0${i + 1}`,
  }));
  return {
    from(table: string) {
      if (table === "workspaces") {
        return {
          select() {
            return {
              // workspacesEnabled() probe: .limit(0) resolves with no error
              limit: async () => ({ data: [], error: null }),
              eq() {
                return {
                  order: async () => ({ data: dbRows, error: null }),
                  eq() { return { maybeSingle: async () => ({ data: dbRows[0] ?? null, error: null }) }; },
                };
              },
            };
          },
        };
      }
      // profiles
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: { active_workspace_id: activeId }, error: null }) }; } };
        },
      };
    },
  };
}

const ws = (over: Partial<Workspace>): Workspace => ({
  id: "w", ownerId: "u1", name: "W", isDefault: false, suspended: false,
  niche: null, brand_name: null, goals: null, brand_detail: null, niche_detail: null, niche_analyzed_at: null,
  createdAt: "2026-01-01", ...over,
});

describe("activeWorkspaces", () => {
  it("drops paused workspaces", () => {
    const list = [ws({ id: "a" }), ws({ id: "b", suspended: true }), ws({ id: "c" })];
    expect(activeWorkspaces(list).map((w) => w.id)).toEqual(["a", "c"]);
  });
});

describe("getActiveWorkspace", () => {
  it("prefers the stored active id when it is live", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = fakeSupabase([{ id: "w0", isDefault: true }, { id: "w1" }, { id: "w2" }], "w2") as any;
    const active = await getActiveWorkspace(sb, "u1");
    expect(active?.id).toBe("w2");
  });

  it("falls back to the default when no active id is set", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = fakeSupabase([{ id: "w0" }, { id: "w1", isDefault: true }], null) as any;
    const active = await getActiveWorkspace(sb, "u1");
    expect(active?.id).toBe("w1");
  });

  it("never returns a paused workspace, even when it is the stored active one", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = fakeSupabase([{ id: "w0", isDefault: true }, { id: "w1", suspended: true }], "w1") as any;
    const active = await getActiveWorkspace(sb, "u1");
    expect(active?.id).toBe("w0");
  });
});
