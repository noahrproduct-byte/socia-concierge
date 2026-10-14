// SOCIA's MCP tools (Phase 1: read-only). Each tool is a thin wrapper over
// lib/api/read.ts, the same service layer the developer API will use, and
// every call goes through one gate:
//
//   token scope (socia:read) -> the workspace was shared on the consent
//   screen and the person can still open it -> the owner's plan includes AI
//   assistants -> per-minute limit for this connection -> monthly meter ->
//   the read -> audit log.
//
// Results are JSON in both `content` (for clients that read text) and
// `structuredContent`. Refusals are tool errors with a message the assistant
// can relay; nothing is retried or guessed around.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Ctx } from "../context";
import type { Entitlements } from "../entitlements";
import type { Principal } from "../oauth/server";
import { SCOPE_READ } from "../oauth/config";
import { audit, serviceOrNull } from "../oauth/runtime";
import { ApiFailure, apiContext, guardRequest, listGranted } from "../api/context";
import {
  comparePlatforms, getAccountAnalytics, getContentPlan, getPerformanceInsights, getPostingRecommendations, getScheduledPosts,
  getToday, getTopPosts, listConnectedAccounts,
} from "../api/read";

export const SERVER_INSTRUCTIONS = [
  "SOCIA is a social media assistant. These tools read the connected person's own SOCIA data: Brand Workspaces, connected Instagram, Facebook, YouTube and TikTok accounts, analytics, top posts, insights, daily recommendations, posting times, the Content Plan and the Calendar.",
  "Every number comes from SOCIA's stored platform data and the same calculations SOCIA's own dashboard uses. A null value means the platform doesn't provide it or SOCIA doesn't have it yet; never present it as zero.",
  "If several Brand Workspaces are shared, call list_workspaces and ask which one, or pass workspace_id.",
  "These tools are read-only: they can't publish, schedule, edit or delete anything.",
].join(" ");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const workspaceId = z.string().uuid().optional().describe("Brand Workspace id from list_workspaces. Optional when only one workspace is shared.");
const days = z.union([z.literal(7), z.literal(28), z.literal(30), z.literal(90), z.literal(365)]).optional()
  .describe("Look-back window in days (7, 28, 30, 90 or 365). Default 30. The plan's analytics history may shorten it; the result says so.");
const platform = z.enum(["instagram", "youtube", "facebook", "tiktok"]);
const timezone = z.string().max(64).optional().describe('IANA time zone of the person, e.g. "America/Chicago". Default UTC.');

type ToolCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

const principalOf = (c: ToolCtx): Principal | null => (c.http?.authInfo?.extra?.principal as Principal | undefined) ?? null;

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** Keys that must never leave SOCIA in a tool result, at any depth. */
const SECRET_KEY = /(^|_)(access_?token|refresh_?token|id_?token|token_?hash|client_?secret|secret|password|api_?key|service_?role)($|_)/i;

/** The key path of anything secret-looking in a result, or null. A last line of defence: no read is meant to produce one. */
export function findSecret(value: unknown, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const hit = findSecret(value[i], `${path}[${i}]`); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) return `${path}.${k}`;
      const hit = findSecret(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

const fail = (message: string): Result => ({ content: [{ type: "text", text: message }], isError: true });

/** The one gate every tool call goes through. */
async function run(
  c: ToolCtx,
  tool: string,
  workspace: string | undefined | null,
  read: (ctx: Ctx, ent: Entitlements) => Promise<Record<string, unknown>>,
): Promise<Result> {
  const started = Date.now();
  const p = principalOf(c);
  const svc = serviceOrNull();
  if (!p || !svc) return fail("SOCIA couldn't confirm this connection. Reconnect SOCIA in the app.");
  if (!p.scopes.includes(SCOPE_READ)) return fail("This connection doesn't have permission to read SOCIA data.");
  let wsId: string | null = null;
  try {
    const ctx = await apiContext(svc, p, workspace);
    wsId = ctx.workspace?.id ?? null;
    const g = await guardRequest(svc, p, ctx.ownerId);
    const data = await read(ctx, g.ent);
    const out = { workspace: { id: ctx.workspace?.id ?? null, name: ctx.workspace?.name ?? null }, as_of: new Date().toISOString(), ...data };
    const leak = findSecret(out);
    if (leak) {
      console.error(`[mcp] ${tool} refused: secret-looking field at ${leak}`);
      await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "error", detail: { refused: leak } });
      return fail("SOCIA hit a problem reading this. Try again in a moment.");
    }
    await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "ok", ms: Date.now() - started });
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (e) {
    if (e instanceof ApiFailure) {
      await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: e.code === "limited" ? "limited" : "denied", ms: Date.now() - started, detail: { code: e.code } });
      return fail(e.message);
    }
    console.error(`[mcp] ${tool}`, (e as Error)?.message ?? e);
    await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "error", ms: Date.now() - started });
    return fail("SOCIA hit a problem reading this. Try again in a moment.");
  }
}

export function registerTools(server: McpServer): void {
  server.registerTool("list_workspaces", {
    title: "List Brand Workspaces",
    description: "Lists the SOCIA Brand Workspaces the person shared with this app (each brand or client is one workspace), with the person's role in each. Use the id as workspace_id in other tools.",
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async (_args, c) => {
    const started = Date.now();
    const p = principalOf(c as ToolCtx);
    const svc = serviceOrNull();
    if (!p || !svc) return fail("SOCIA couldn't confirm this connection. Reconnect SOCIA in the app.");
    if (!p.scopes.includes(SCOPE_READ)) return fail("This connection doesn't have permission to read SOCIA data.");
    try {
      await guardRequest(svc, p, p.userId);
      const workspaces = await listGranted(svc, p);
      const out = { as_of: new Date().toISOString(), workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, your_role: w.yourRole, is_default: w.isDefault })) };
      await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, action: "list_workspaces", outcome: "ok", ms: Date.now() - started });
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    } catch (e) {
      if (e instanceof ApiFailure) return fail(e.message);
      console.error("[mcp] list_workspaces", (e as Error)?.message ?? e);
      return fail("SOCIA hit a problem reading this. Try again in a moment.");
    }
  });

  server.registerTool("list_connected_accounts", {
    title: "List connected social accounts",
    description: "Lists the social accounts connected in a Brand Workspace (Instagram, Facebook Page, YouTube channel, TikTok) and whether SOCIA can publish to each. Never returns logins or tokens.",
    inputSchema: z.object({ workspace_id: workspaceId }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "list_connected_accounts", a.workspace_id, (ctx) => listConnectedAccounts(ctx)));

  server.registerTool("get_account_analytics", {
    title: "Get account analytics",
    description: "Headline analytics for each connected platform (or one platform) over a window: followers or subscribers, views, reach, interactions, posts published, with the previous period when the plan includes it. Values are the same ones SOCIA's Analytics page shows; null means the platform doesn't report it, with a note saying why.",
    inputSchema: z.object({ workspace_id: workspaceId, platform: platform.optional().describe("One platform, or omit for all connected platforms."), days }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_account_analytics", a.workspace_id, (ctx, ent) => getAccountAnalytics(ctx, ent, { platform: a.platform, days: a.days })));

  server.registerTool("compare_platforms", {
    title: "Compare platforms",
    description: "Side-by-side summary of every connected platform over a window (audience, views, interactions, posts published) plus the combined totals that are valid to add up. Platforms count views differently, which the result notes. Growth plan and up.",
    inputSchema: z.object({ workspace_id: workspaceId, days }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "compare_platforms", a.workspace_id, (ctx, ent) => comparePlatforms(ctx, ent, { days: a.days })));

  server.registerTool("get_top_posts", {
    title: "Get top posts",
    description: "The best-performing posts on one platform in a window, ranked by views (or interactions), with each post's numbers and how it compares with the account's own median post. Defaults to Instagram when connected.",
    inputSchema: z.object({
      workspace_id: workspaceId, platform: platform.optional(), days,
      limit: z.number().int().min(1).max(20).optional().describe("How many posts (1-20). Default 5."),
      sort_by: z.enum(["views", "engagement"]).optional().describe("Instagram only: rank by views (default) or by interactions."),
    }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_top_posts", a.workspace_id, (ctx, ent) => getTopPosts(ctx, ent, { platform: a.platform, days: a.days, limit: a.limit, sortBy: a.sort_by })));

  server.registerTool("get_performance_insights", {
    title: "Get performance insights",
    description: "SOCIA's verified insights for the workspace: what is working (breakout posts, strong formats, timing), what is missing (gaps against the brand's goals), next steps, and recent alerts. Each insight lists the observed numbers behind it.",
    inputSchema: z.object({ workspace_id: workspaceId, days }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_performance_insights", a.workspace_id, (ctx, ent) => getPerformanceInsights(ctx, ent, { days: a.days })));

  server.registerTool("get_today", {
    title: "Get today's recommendations",
    description: "Up to five things worth doing today in this workspace, most urgent first: posts that failed or aren't ready, today's Content Plan item, comment replies waiting, gaps in the schedule, the best posting window today, posts taking off. Each has a link to open it in SOCIA. Growth plan and up.",
    inputSchema: z.object({ workspace_id: workspaceId, timezone }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_today", a.workspace_id, (ctx, ent) => getToday(ctx, ent, { timezone: a.timezone })));

  server.registerTool("get_posting_recommendations", {
    title: "Get best posting times",
    description: "When this account's own Instagram posts have done best (weekday and time window, in the person's time zone), with how much better than its typical post and how many posts that rests on. Says so when there isn't enough history. Starter plan and up.",
    inputSchema: z.object({ workspace_id: workspaceId, timezone }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_posting_recommendations", a.workspace_id, (ctx, ent) => getPostingRecommendations(ctx, ent, { timezone: a.timezone })));

  server.registerTool("get_content_plan", {
    title: "Get the Content Plan",
    description: "The workspace's latest weekly Content Plan: the diagnosis, the top fixes, and each planned post (day, concept, hook, format) with whether it has been scheduled or published and how it did against the account's median.",
    inputSchema: z.object({ workspace_id: workspaceId }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_content_plan", a.workspace_id, (ctx) => getContentPlan(ctx)));

  server.registerTool("get_scheduled_posts", {
    title: "Get scheduled posts",
    description: "Posts on the workspace's SOCIA Calendar in a date window (default: yesterday to two weeks ahead), with each platform's status, time, link and any error. Published posts are left out unless asked for.",
    inputSchema: z.object({
      workspace_id: workspaceId,
      from: z.string().max(40).optional().describe("Start of the window, ISO date or date-time. Default: 24 hours ago."),
      to: z.string().max(40).optional().describe("End of the window, ISO date or date-time. Default: 14 days ahead. At most 62 days after from."),
      include_published: z.boolean().optional().describe("Also list posts already published in the window."),
    }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "get_scheduled_posts", a.workspace_id, (ctx) => getScheduledPosts(ctx, { from: a.from, to: a.to, includePublished: a.include_published })));
}
