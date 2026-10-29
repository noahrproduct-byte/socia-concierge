// Role and workspace checks on the routes the audit found open. A Member of
// someone else's Brand Workspace (or an Admin, where only the owner may act)
// is refused before anything reaches a platform or the database.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Role = "owner" | "admin" | "member";
let role: Role = "member";
const ctxFor = (r: Role) => ({
  viewerId: "viewer-1", ownerId: "owner-1", workspace: { id: "ws-1", name: "Brand", isDefault: true }, role: r, client: dbClient(), isOwner: r === "owner",
});

// A database stub: a scheduled legacy row for the calendar routes; every write is recorded.
const writes: string[] = [];
function dbClient() {
  const row = { id: "post-1", user_id: "owner-1", status: "scheduled", caption: "x", media_url: null, scheduled_at: new Date(Date.now() + 864e5).toISOString(), media_path: null };
  const q: Record<string, unknown> = {};
  const self = new Proxy(q, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: row, error: null });
      if (prop === "update" || prop === "delete" || prop === "insert" || prop === "upsert") return () => { writes.push(String(prop)); return self; };
      return () => self;
    },
  });
  return { from: () => self, rpc: () => self, storage: { from: () => self }, auth: { getUser: async () => ({ data: { user: { id: "viewer-1", email: "v@example.com" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => dbClient(), getViewer: async () => ({ supabase: dbClient(), user: { id: "viewer-1" } }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), resolveContext: async () => ctxFor(role) }));
vi.mock("@/lib/entitlements", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements")>()),
  getEntitlements: async () => ({ plan: "pro", features: new Proxy({}, { get: () => true }), limits: new Proxy({}, { get: () => 99 }), config: { name: "Pro" } }),
  canUseFeature: () => true,
}));
const sendCommentDraft = vi.fn(async () => ({ ok: true }));
const skipCommentDraft = vi.fn(async () => true);
vi.mock("@/lib/commentDrafts", () => ({ sendCommentDraft, skipCommentDraft, redraftComment: vi.fn(async () => null) }));
const createInvite = vi.fn(async () => ({ ok: true, invite: { id: "i1", token: "t" } }));
vi.mock("@/lib/team", async (orig) => ({ ...(await orig<typeof import("@/lib/team")>()), teamEnabled: async () => true, seatsUsed: async () => 0, createInvite }));
vi.mock("@/lib/planGuard", async (orig) => ({ ...(await orig<typeof import("@/lib/planGuard")>()), requireFeature: async () => ({ ent: { plan: "pro", config: { name: "Pro", limits: new Proxy({}, { get: () => 99 }) } }, denied: null }) }));
vi.mock("@/lib/workspaces", async (orig) => ({ ...(await orig<typeof import("@/lib/workspaces")>()), listWorkspaces: async () => [{ id: "ws-1" }] }));
vi.mock("@/lib/approvals", async (orig) => ({ ...(await orig<typeof import("@/lib/approvals")>()), memberEditBlock: async () => null }));

const json = (body: unknown, method = "POST") => new Request("https://sociaos.com/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => { writes.length = 0; sendCommentDraft.mockClear(); skipCommentDraft.mockClear(); createInvite.mockClear(); });

describe("comment replies", () => {
  it("a Member can't send or skip a reply as the brand", async () => {
    role = "member";
    const { POST } = await import("./comments/act/route");
    expect((await POST(json({ id: "d1", action: "send", text: "hi" }))).status).toBe(403);
    expect((await POST(json({ id: "d1", action: "skip" }))).status).toBe(403);
    expect(sendCommentDraft).not.toHaveBeenCalled();
    expect(skipCommentDraft).not.toHaveBeenCalled();
  });

  it("an Admin can, and only within the workspace being viewed", async () => {
    role = "admin";
    const { POST } = await import("./comments/act/route");
    expect((await POST(json({ id: "d1", action: "send", text: "hi" }))).status).toBe(200);
    expect(sendCommentDraft).toHaveBeenCalledWith(expect.anything(), "owner-1", "d1", "hi", "ws-1");
  });
});

describe("team invites", () => {
  it("only the owner may invite an admin", async () => {
    role = "admin";
    const { POST } = await import("./team/route");
    expect((await POST(json({ role: "admin" }))).status).toBe(403);
    expect(createInvite).not.toHaveBeenCalled();
    expect((await POST(json({ role: "member" }))).status).toBe(200);
  });
});

describe("the calendar's own endpoints", () => {
  it("a Member can't edit, cancel or delete a scheduled post", async () => {
    role = "member";
    const { PATCH, DELETE } = await import("./schedule/route");
    expect((await PATCH(json({ id: "post-1", caption: "member text" }, "PATCH"))).status).toBe(409);
    expect((await PATCH(json({ id: "post-1", status: "cancelled" }, "PATCH"))).status).toBe(409);
    expect((await DELETE(json({ id: "post-1" }, "DELETE"))).status).toBe(409);
    expect(writes).toEqual([]);
  });
});

describe("removing people", () => {
  it("an Admin's removal fails closed when SOCIA can't confirm the person is a Member", async () => {
    role = "admin";
    const { DELETE } = await import("./team/[userId]/route");
    // The stub's member list is empty, as when the read fails: nothing is removed.
    const res = await DELETE(new Request("https://sociaos.com/x", { method: "DELETE" }), { params: Promise.resolve({ userId: "someone-else" }) });
    expect(res.status).toBe(409);
    expect(writes).toEqual([]);
  });
});
