import { describe, it, expect } from "vitest";
import { getActiveConnection } from "./instagramSync";

// A tiny in-memory stand-in for the Supabase query builder: enough of
// from/select/eq/is/limit/maybeSingle to exercise which row the reader picks.
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const run = () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select() { return b; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return b; },
        is(k: string, v: unknown) { filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
        limit() { return b; },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
      };
      return b;
    },
  };
}

const A = { user_id: "u", ig_user_id: "A", username: "brand_a", workspace_id: "wsA", is_active: true, plan_suspended_at: null };
const B = { user_id: "u", ig_user_id: "B", username: "brand_b", workspace_id: "wsB", is_active: false, plan_suspended_at: null };

describe("getActiveConnection (Brand Workspaces)", () => {
  it("reads the row IN the given workspace, not the owner's is_active pointer", async () => {
    const db = fakeDb({ instagram_connections: [A, B] });
    const row = await getActiveConnection(db, "u", "username", "wsB");
    expect(row?.username).toBe("brand_b");
  });

  it("a workspace without an Instagram account is not connected — never another workspace's account", async () => {
    const db = fakeDb({ instagram_connections: [A, B] });
    expect(await getActiveConnection(db, "u", "username", "wsC")).toBeNull();
  });

  it("looks the owner's active workspace up when the caller has no context", async () => {
    const db = fakeDb({ instagram_connections: [A, B], profiles: [{ user_id: "u", active_workspace_id: "wsB" }] });
    const row = await getActiveConnection(db, "u", "username");
    expect(row?.username).toBe("brand_b");
  });

  it("never returns an account paused by the plan", async () => {
    const paused = { ...B, plan_suspended_at: "2026-10-01T00:00:00Z" };
    const db = fakeDb({ instagram_connections: [A, paused] });
    expect(await getActiveConnection(db, "u", "username", "wsB")).toBeNull();
  });

  it("pre-workspaces: the active row, else the person's only row", async () => {
    const active = fakeDb({ instagram_connections: [{ ...A, workspace_id: null }, { ...B, workspace_id: null }] });
    expect((await getActiveConnection(active, "u", "username", null))?.username).toBe("brand_a");
    const single = fakeDb({ instagram_connections: [{ ...B, workspace_id: null }] });
    expect((await getActiveConnection(single, "u", "username", null))?.username).toBe("brand_b");
  });
});
