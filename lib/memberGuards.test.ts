// A Member may edit drafts, never what is scheduled or published, and a
// deleted brand never keeps posts queued to go out.
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase/service", () => ({ createServiceClient: () => null }));

import { memberEditBlock } from "./approvals";
import { deleteWorkspace } from "./workspaces";

type Answer = { data: unknown; error: unknown };
/** A query stub: each table answers with what the test gives; writes are recorded. */
function client(tables: Record<string, Answer>, writes: { table: string; patch: unknown; filters: string[] }[] = []) {
  return {
    from(table: string) {
      const filters: string[] = [];
      let patch: unknown = null;
      const q: Record<string, unknown> = {
        select: () => q, eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q; }, in: () => q, order: () => q, limit: () => q,
        update: (p: unknown) => { patch = p; return q; }, delete: () => { patch = "delete"; return q; },
        maybeSingle: async () => tables[table] ?? { data: null, error: null },
        then: (ok: (v: Answer) => unknown) => {
          if (patch) writes.push({ table, patch, filters });
          return Promise.resolve(tables[table] ?? { data: [], error: null }).then(ok);
        },
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  } as never;
}
const member = (c: unknown) => ({ viewerId: "m", ownerId: "o", workspace: { id: "w1" }, role: "member", client: c, isOwner: false }) as never;

describe("memberEditBlock", () => {
  it("blocks a scheduled legacy post that has no destinations", async () => {
    const c = client({ scheduled_posts: { data: { status: "scheduled" }, error: null }, post_destinations: { data: [], error: null }, post_approvals: { data: [], error: null } });
    expect(await memberEditBlock(member(c), "p1")).toMatch(/owner or an admin/);
  });
  it("fails closed when the post can't be read", async () => {
    const c = client({ scheduled_posts: { data: null, error: { message: "timeout" } } });
    expect(await memberEditBlock(member(c), "p1")).toMatch(/couldn't check/);
  });
  it("leaves a draft editable", async () => {
    const c = client({ scheduled_posts: { data: { status: "draft" }, error: null }, post_destinations: { data: [{ status: "draft" }], error: null }, post_approvals: { data: [], error: null } });
    expect(await memberEditBlock(member(c), "p1")).toBeNull();
  });
});

const WS = [
  { id: "w1", owner_id: "o", name: "One", is_default: true, plan_suspended_at: null, created_at: "2026-01-01" },
  { id: "w2", owner_id: "o", name: "Two", is_default: false, plan_suspended_at: null, created_at: "2026-02-01" },
];

describe("deleteWorkspace", () => {
  it("cancels the brand's scheduled posts and destinations before deleting it", async () => {
    const writes: { table: string; patch: unknown; filters: string[] }[] = [];
    const res = await deleteWorkspace(client({ workspaces: { data: WS, error: null } }, writes), "o", "w2");
    expect(res).toEqual({ ok: true });
    expect(writes.map((w) => w.table)).toEqual(["scheduled_posts", "post_destinations", "workspaces"]);
    expect(writes[0]).toMatchObject({ patch: { status: "cancelled" } });
    expect(writes[0].filters).toEqual(expect.arrayContaining(["user_id=o", "workspace_id=w2", "status=scheduled"]));
  });
  it("refuses to delete when the posts can't be stopped", async () => {
    const res = await deleteWorkspace(client({ workspaces: { data: WS, error: null }, scheduled_posts: { data: null, error: { message: "timeout" } } }), "o", "w2");
    expect(res.ok).toBe(false);
  });
});
