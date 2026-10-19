import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { ApiFailure } from "../api/context";

// The service layer and the database are mocked: these tests check the MCP
// surface itself (protocol eras, auth challenge, tool list, the gate every
// call goes through), not the reads, which have their own tests.
const calls: { tool: string; workspace: string | null | undefined }[] = [];
const audits: { action: string; outcome: string }[] = [];
const writes: { tool: string; input: unknown }[] = [];
let rate: "ok" | "limited" | "unavailable" = "ok";

vi.mock("../oauth/runtime", () => ({
  serviceOrNull: () => ({}),
  audit: async (e: { action: string; outcome: string }) => { audits.push({ action: e.action, outcome: e.outcome }); },
  rateHit: async () => rate,
}));
vi.mock("../entitlements", () => ({
  checkFeature: (ent: { features?: Record<string, boolean> }, key: string) => (ent.features?.[key] === false ? { ok: false, error: { error: `${key} locked` } } : { ok: true }),
  getLimit: () => 5,
}));
vi.mock("../api/media", () => ({ listWorkspaceMedia: async () => [{ media_id: "m1", kind: "image" }] }));
vi.mock("../api/write", () => ({
  createPost: async (_ctx: unknown, _ent: unknown, input: unknown) => { writes.push({ tool: "create_post", input }); return { post_id: "p1", result: "published", destinations: [] }; },
  cancelPost: async (_ctx: unknown, id: string) => { writes.push({ tool: "cancel_post", input: id }); return { post_id: id, cancelled: ["instagram"], not_cancelled: [] }; },
}));
vi.mock("../api/context", async (orig) => {
  const real = await orig<typeof import("../api/context")>();
  return {
    ...real,
    apiContext: async (_svc: unknown, p: { workspaceIds: string[] }, ws?: string | null) => {
      const id = ws ?? (p.workspaceIds.length === 1 ? p.workspaceIds[0] : null);
      if (!id) throw new real.ApiFailure("invalid_input", "Several Brand Workspaces are shared. Pass workspace_id.");
      if (!p.workspaceIds.includes(id)) throw new real.ApiFailure("forbidden", "That Brand Workspace isn't shared with this app.");
      return { viewerId: "u1", ownerId: "owner-1", workspace: { id, name: "Salvo's" }, role: "owner", client: {}, isOwner: true };
    },
    guardRequest: async (_svc: unknown, p: { connectionId: string }) => {
      if (p.connectionId === "over-limit") throw new real.ApiFailure("limited", "This month's AI assistant requests are used up.");
      if (p.connectionId === "free-plan") return { ent: { plan: "free", features: { ai_assistant_publishing: false } }, usage: { used: 1, limit: 100 } };
      return { ent: { plan: "growth" }, usage: { used: 1, limit: 5000 } };
    },
    listGranted: async () => [{ id: "ws-1", name: "Salvo's", yourRole: "owner", isDefault: true }],
  };
});
vi.mock("../api/read", () => {
  const stub = (tool: string) => async () => { calls.push({ tool, workspace: null }); return { result: tool, value: null, note: "unavailable" }; };
  return {
    listConnectedAccounts: stub("list_connected_accounts"), getAccountAnalytics: stub("get_account_analytics"), comparePlatforms: stub("compare_platforms"),
    getTopPosts: stub("get_top_posts"), getPerformanceInsights: stub("get_performance_insights"), getToday: stub("get_today"),
    getPostingRecommendations: stub("get_posting_recommendations"), getContentPlan: stub("get_content_plan"), getScheduledPosts: stub("get_scheduled_posts"),
  };
});

const { registerTools, SERVER_INSTRUCTIONS } = await import("./tools");

const principal = (over: Record<string, unknown> = {}) => ({
  userId: "u1", connectionId: "conn-1", clientId: "claude", clientName: "Claude", scopes: ["socia:read"], workspaceIds: ["ws-1"], expiresAt: 4102444800, ...over,
});
const TOKENS: Record<string, ReturnType<typeof principal>> = {
  good: principal(),
  two: principal({ workspaceIds: ["ws-1", "ws-2"] }),
  limited: principal({ connectionId: "over-limit" }),
  poster: principal({ scopes: ["socia:read", "socia:publish"] }),
  freePoster: principal({ connectionId: "free-plan", scopes: ["socia:read", "socia:publish"] }),
};

const handler = withMcpAuth(
  createMcpHandler(registerTools, { serverInfo: { name: "SOCIA", version: "1.0.0" }, instructions: SERVER_INSTRUCTIONS }),
  async (_req, bearer): Promise<AuthInfo | undefined> => {
    const p = bearer ? TOKENS[bearer] : undefined;
    return p ? { token: bearer!, clientId: p.clientId, scopes: p.scopes, expiresAt: p.expiresAt, extra: { principal: p } } : undefined;
  },
  { required: true, requiredScopes: ["socia:read"], resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp", resourceUrl: "https://sociaos.com" },
);

async function connect(token: string, mode: "legacy" | "auto") {
  const client = new Client({ name: "test", version: "1.0.0" }, { versionNegotiation: { mode } });
  const transport = new StreamableHTTPClientTransport(new URL("https://sociaos.com/mcp"), {
    fetch: (url, init) => handler(new Request(url, init)),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

beforeEach(() => { calls.length = 0; audits.length = 0; writes.length = 0; rate = "ok"; });

const READ_TOOLS = [
  "compare_platforms", "get_account_analytics", "get_content_plan", "get_performance_insights", "get_posting_recommendations",
  "get_scheduled_posts", "get_today", "get_top_posts", "list_connected_accounts", "list_media", "list_workspaces",
];
const POST = { caption: "Fresh out of the oven", media: [{ media_id: "m1" }], platforms: [{ platform: "instagram" }], when: "now" };

describe("the MCP endpoint", () => {
  it("answers a request without a token with 401 and the resource metadata to sign in with", async () => {
    const res = await handler(new Request("https://sociaos.com/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('resource_metadata="https://sociaos.com/.well-known/oauth-protected-resource/mcp"');
  });

  for (const mode of ["legacy", "auto"] as const) {
    it(`lists the read-only tools and the two posting tools, marked as such (${mode} protocol)`, async () => {
      const client = await connect("good", mode);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, "cancel_post", "create_post"].sort());
      for (const t of tools) {
        const posting = t.name === "create_post" || t.name === "cancel_post";
        expect(t.annotations?.readOnlyHint).toBe(!posting);
        expect(t.annotations?.destructiveHint).toBe(posting);
        expect((t.description ?? "").length).toBeGreaterThan(60);
      }
      await client.close();
    });

    it(`calls a tool through the gate and returns structured data (${mode} protocol)`, async () => {
      const client = await connect("good", mode);
      const r = await client.callTool({ name: "get_top_posts", arguments: { platform: "instagram", days: 30, limit: 3 } });
      expect(r.isError).toBeFalsy();
      expect(r.structuredContent).toMatchObject({ workspace: { id: "ws-1", name: "Salvo's" }, result: "get_top_posts", value: null });
      expect(calls.map((c) => c.tool)).toEqual(["get_top_posts"]);
      expect(audits).toEqual([{ action: "get_top_posts", outcome: "ok" }]);
      await client.close();
    });
  }

  it("refuses a workspace that wasn't shared, and asks which one when several were", async () => {
    const client = await connect("two", "auto");
    const other = await client.callTool({ name: "get_content_plan", arguments: { workspace_id: "00000000-0000-4000-8000-000000000009" } });
    expect(other.isError).toBe(true);
    expect(JSON.stringify(other.content)).toContain("isn't shared");
    const ambiguous = await client.callTool({ name: "get_today", arguments: {} });
    expect(ambiguous.isError).toBe(true);
    expect(JSON.stringify(ambiguous.content)).toContain("Pass workspace_id");
    expect(calls).toEqual([]);
    await client.close();
  });

  it("stops at the usage limit before reading anything", async () => {
    const client = await connect("limited", "auto");
    const r = await client.callTool({ name: "get_account_analytics", arguments: {} });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("used up");
    expect(calls).toEqual([]);
    expect(audits).toEqual([{ action: "get_account_analytics", outcome: "limited" }]);
    await client.close();
  });

  it("rejects bad input before the gate", async () => {
    const client = await connect("good", "auto");
    const r = await client.callTool({ name: "get_top_posts", arguments: { limit: 500 } }).catch((e) => ({ isError: true, content: [{ text: String(e) }] }));
    expect(r.isError).toBe(true);
    expect(calls).toEqual([]);
    await client.close();
  });

  it("keeps ApiFailure messages safe to relay", () => {
    expect(new ApiFailure("forbidden", "x").code).toBe("forbidden");
  });

  it("finds any secret-looking field at any depth, and nothing in ordinary results", async () => {
    const { findSecret } = await import("./tools");
    expect(findSecret({ posts: [{ id: "1", views: 3 }], note: "token counts" })).toBeNull();
    expect(findSecret({ accounts: [{ platform: "instagram", access_token: "x" }] })).toBe("$.accounts[0].access_token");
    expect(findSecret({ a: { b: { refreshToken: "x" } } })).toBe("$.a.b.refreshToken");
    expect(findSecret({ client_secret: "x" })).toBe("$.client_secret");
    expect(findSecret({ token_hash: "x" })).toBe("$.token_hash");
    expect(findSecret({ tokens_used: 3, tokenizer: "x" })).toBeNull();
  });

  it("refuses to post when publishing isn't turned on for the connection, and says where to turn it on", async () => {
    const client = await connect("good", "auto");
    const r = await client.callTool({ name: "create_post", arguments: POST });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("Settings → AI Assistants");
    expect(writes).toEqual([]);
    await client.close();
  });

  it("posts through the gate when publishing is on, and audits it", async () => {
    const client = await connect("poster", "auto");
    const r = await client.callTool({ name: "create_post", arguments: POST });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ workspace: { id: "ws-1" }, post_id: "p1", result: "published" });
    expect(writes).toEqual([{ tool: "create_post", input: POST }]);
    expect(audits).toEqual([{ action: "create_post", outcome: "ok" }]);
    await client.close();
  });

  it("refuses on a plan without assistant publishing, and at the hourly cap, before writing anything", async () => {
    const free = await connect("freePoster", "auto");
    const a = await free.callTool({ name: "create_post", arguments: POST });
    expect(a.isError).toBe(true);
    expect(JSON.stringify(a.content)).toContain("paid plans");
    await free.close();
    rate = "limited";
    const capped = await connect("poster", "auto");
    const b = await capped.callTool({ name: "create_post", arguments: POST });
    expect(b.isError).toBe(true);
    expect(JSON.stringify(b.content)).toContain("posts an hour");
    // Withdrawing isn't a new post, so the hourly cap doesn't apply to it.
    const c = await capped.callTool({ name: "cancel_post", arguments: { post_id: "00000000-0000-4000-8000-000000000001" } });
    expect(c.isError).toBeFalsy();
    expect(writes).toEqual([{ tool: "cancel_post", input: "00000000-0000-4000-8000-000000000001" }]);
    await capped.close();
  });

  it("lists media with only read access", async () => {
    const client = await connect("good", "auto");
    const r = await client.callTool({ name: "list_media", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ media: [{ media_id: "m1" }] });
    await client.close();
  });
});
