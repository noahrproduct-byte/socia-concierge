// SOCIA's MCP tools. Each tool is a thin wrapper over lib/api/read.ts or
// lib/api/write.ts, the same service layer the developer API will use, and
// every call goes through one gate:
//
//   token scope (socia:read) -> the workspace was shared on the consent
//   screen and the person can still open it -> the owner's plan includes AI
//   assistants -> per-minute limit for this connection -> monthly meter ->
//   the read -> audit log.
//
// Posting tools (create_post, cancel_post) also need: the connection's
// publishing permission (socia:publish, off unless the person turned it on)
// -> the owner's plan includes assistant publishing (paid plans) -> the
// hourly post cap for this connection. lib/api/write.ts then applies the
// composer's own checks (role, accounts, validation).
//
// Results are JSON in both `content` (for clients that read text) and
// `structuredContent`. Refusals are tool errors with a message the assistant
// can relay; nothing is retried or guessed around.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Ctx } from "../context";
import type { Entitlements } from "../entitlements";
import type { Principal } from "../oauth/server";
import { appOrigin, SCOPE_PUBLISH, SCOPE_READ } from "../oauth/config";
import { audit, rateHit, serviceOrNull } from "../oauth/runtime";
import { checkFeature, getLimit } from "../entitlements";
import { ApiFailure, apiContext, guardRequest, listGranted } from "../api/context";
import { listWorkspaceMedia } from "../api/media";
import { cancelPost, createPost, type CreatePostInput } from "../api/write";
import {
  comparePlatforms, getAccountAnalytics, getContentPlan, getPerformanceInsights, getPostingRecommendations, getScheduledPosts,
  getToday, getTopPosts, listConnectedAccounts,
} from "../api/read";

export const SERVER_INSTRUCTIONS = [
  "SOCIA is a social media assistant. These tools read the connected person's own SOCIA data: Brand Workspaces, connected Instagram, Facebook, YouTube and TikTok accounts, analytics, top posts, insights, daily recommendations, posting times, the Content Plan and the Calendar.",
  "Every number comes from SOCIA's stored platform data and the same calculations SOCIA's own dashboard uses. A null value means the platform doesn't provide it or SOCIA doesn't have it yet; never present it as zero.",
  "If several Brand Workspaces are shared, call list_workspaces and ask which one, or pass workspace_id.",
  "Posting: if the person turned on publishing for this app, create_post publishes to Instagram and Facebook right away or at a set time, or saves a draft on any platform; cancel_post withdraws a post that hasn't gone out. Only post what the person asked for, with the caption and media they approved in this conversation, because create_post publishes without another confirmation. If posting isn't turned on, the tools say how to turn it on.",
  "Nothing can be deleted or edited after publishing, and settings can't be changed.",
].join(" ");

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
/** Posting changes the person's public accounts and can't be undone once live. */
const POSTS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;
const WITHDRAW = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;
/** Time an MCP request may spend before /mcp's 60-second limit. */
const REQUEST_BUDGET_MS = 55_000;

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

/**
 * A flat ceiling per connection, checked before anything is looked up, so a
 * client sending bad workspace ids cannot run unlimited queries and audit
 * writes. The plan's own per-minute limit (guardRequest) still applies after.
 */
const CONNECTION_CALLS_PER_MINUTE = 120;
const overConnectionLimit = async (connectionId: string) => (await rateHit(`mcp-any:${connectionId}`, 60, CONNECTION_CALLS_PER_MINUTE)) === "limited";

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
if (await overConnectionLimit(p.connectionId)) return fail(`Too many requests from ${p.clientName ?? "this app"}. Wait a minute and try again.`);
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

/** The gate for posting tools: the read gate, then publishing permission, plan and hourly cap. */
async function runPosting(
  c: ToolCtx,
  tool: string,
  workspace: string | undefined | null,
  countsAsPost: boolean,
  write: (ctx: Ctx, ent: Entitlements, deadline: number) => Promise<Record<string, unknown>>,
): Promise<Result> {
  const started = Date.now();
  const p = principalOf(c);
  const svc = serviceOrNull();
  if (!p || !svc) return fail("SOCIA couldn't confirm this connection. Reconnect SOCIA in the app.");
if (await overConnectionLimit(p.connectionId)) return fail(`Too many requests from ${p.clientName ?? "this app"}. Wait a minute and try again.`);
  if (!p.scopes.includes(SCOPE_READ)) return fail("This connection doesn't have permission to use SOCIA data.");
  if (!p.scopes.includes(SCOPE_PUBLISH)) {
    return fail(`Posting isn't turned on for ${p.clientName ?? "this app"}. The person can turn on "Can publish posts" for it in SOCIA → Settings → AI Assistants (${appOrigin()}/settings#ai-assistants), then ask again.`);
  }
  let wsId: string | null = null;
  try {
    const ctx = await apiContext(svc, p, workspace);
    wsId = ctx.workspace?.id ?? null;
    const g = await guardRequest(svc, p, ctx.ownerId);
    const feature = checkFeature(g.ent, "ai_assistant_publishing");
    if (!feature.ok) throw new ApiFailure("forbidden", `Posting from AI assistants is included in SOCIA's paid plans; this workspace is on ${g.ent.plan}. Upgrade at ${appOrigin()}/pricing.`);
    if (countsAsPost) {
      const perHour = getLimit(g.ent, "assistant_posts_per_hour");
      const rate = perHour > 0 ? await rateHit(`mcp-post:${p.connectionId}`, 3600, perHour) : "limited";
      if (rate === "unavailable") throw new ApiFailure("unavailable", "SOCIA couldn't check this connection's posting limit just now. Try again shortly.");
      if (rate === "limited") throw new ApiFailure("limited", `This app can create ${perHour} posts an hour on the ${g.ent.plan} plan. Wait a while and try again, or post from SOCIA directly.`);
    }
    const data = await write(ctx, g.ent, started + REQUEST_BUDGET_MS);
    const out = { workspace: { id: ctx.workspace?.id ?? null, name: ctx.workspace?.name ?? null }, as_of: new Date().toISOString(), ...data };
    const leak = findSecret(out);
    if (leak) {
      console.error(`[mcp] ${tool} refused: secret-looking field at ${leak}`);
      await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "error", detail: { refused: leak } });
      return fail("SOCIA hit a problem with this. Check SOCIA's Calendar before trying again.");
    }
    await audit({
      userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "ok", ms: Date.now() - started,
      detail: { post_id: data.post_id ?? null, result: data.result ?? null, cancelled: data.cancelled ?? null },
    });
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (e) {
    if (e instanceof ApiFailure) {
      await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: e.code === "limited" ? "limited" : "denied", ms: Date.now() - started, detail: { code: e.code } });
      return fail(e.message);
    }
    console.error(`[mcp] ${tool}`, (e as Error)?.message ?? e);
    await audit({ userId: p.userId, connectionId: p.connectionId, clientId: p.clientId, workspaceId: wsId, action: tool, outcome: "error", ms: Date.now() - started });
    // A failure after saving may have left a post behind; never invite a blind retry.
    return fail("SOCIA hit a problem with this. Check SOCIA's Calendar to see whether the post was saved before trying again.");
  }
}

const mediaRef = z.object({
  media_id: z.string().max(100).optional().describe("A file already in SOCIA, from list_media."),
  url: z.string().url().max(2000).optional().describe("A public https link to the image or video file itself (not a share page). SOCIA copies it once. Images up to 10 MB, videos up to 100 MB."),
}).describe("Exactly one of media_id or url.");

const destination = z.object({
  platform,
  account_id: z.string().max(100).optional().describe("From list_connected_accounts. Optional when the workspace has one account on that platform."),
  format: z.enum(["reel", "image", "carousel", "feed"]).optional().describe("Instagram: reel, image or carousel (default from the media). Facebook: feed (default) or reel."),
  share_to_feed: z.boolean().optional().describe("Instagram Reels: also show in the main feed. Default true."),
  alt_text: z.string().max(1000).optional().describe("Instagram images: alt text."),
  ai_generated: z.boolean().optional().describe("Label the post as AI-generated where the platform supports it."),
  title: z.string().max(100).optional().describe("YouTube drafts: video title."),
  made_for_kids: z.boolean().optional().describe("YouTube drafts: whether the video is made for kids."),
  privacy: z.string().max(40).optional().describe("YouTube drafts: public, unlisted or private. TikTok drafts: the privacy level."),
});

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
if (await overConnectionLimit(p.connectionId)) return fail(`Too many requests from ${p.clientName ?? "this app"}. Wait a minute and try again.`);
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

  server.registerTool("list_media", {
    title: "List media in SOCIA",
    description: "Images and videos already uploaded to SOCIA in this workspace (attached to its posts and drafts), newest first, with each file's type, size and dimensions. Pass a media_id to create_post to reuse a file; SOCIA copies it.",
    inputSchema: z.object({ workspace_id: workspaceId, limit: z.number().int().min(1).max(50).optional().describe("How many files (1-50). Default 20.") }),
    annotations: READ_ONLY,
  }, async (a, c) => run(c as ToolCtx, "list_media", a.workspace_id, async (ctx) => ({ media: await listWorkspaceMedia(ctx, a.limit ?? 20) })));

  server.registerTool("create_post", {
    title: "Create, schedule or publish a post",
    description: [
      "Posts to the workspace's connected accounts. when=\"now\" publishes right away; a future time with its UTC offset (e.g. 2026-10-24T18:00:00-05:00) schedules it; when=\"draft\" saves it in SOCIA without publishing.",
      "Publishing and scheduling work for Instagram and Facebook. YouTube and TikTok can only be saved as drafts, which the person finishes in SOCIA's Create post.",
      "This publishes without another confirmation, so only call it for a post the person asked for, with the caption and media they approved. SOCIA checks the account, the person's role and each platform's rules first and refuses with the reason; a Member's post is saved and sent for approval instead.",
      "Returns each platform's status and link; publishing can take a few minutes to finish, and get_scheduled_posts shows the result.",
    ].join(" "),
    inputSchema: z.object({
      workspace_id: workspaceId,
      caption: z.string().max(5000).describe("The caption or post text, hashtags included. Each platform's own limits are checked."),
      media: z.array(mediaRef).max(10).describe("Images or videos in order (a carousel takes several images). Empty only for a text post on Facebook or a draft."),
      platforms: z.array(destination).min(1).max(4).describe("Where to post, one entry per account."),
      when: z.string().max(40).describe('"now", "draft", or a future ISO time with its UTC offset.'),
    }),
    annotations: POSTS,
  }, async (a, c) => runPosting(c as ToolCtx, "create_post", a.workspace_id, true, (ctx, ent, deadline) =>
    createPost(ctx, ent, { caption: a.caption, media: a.media, platforms: a.platforms as CreatePostInput["platforms"], when: a.when }, { svc: serviceOrNull(), origin: appOrigin(), deadline })));

  server.registerTool("cancel_post", {
    title: "Cancel a scheduled post",
    description: "Withdraws a post's platforms that haven't started going out (scheduled, draft or failed), so nothing more is published. Platforms already uploading, processing or published are left as they are and listed; a live post is deleted in the platform's own app. Takes a post_id from create_post or get_scheduled_posts.",
    inputSchema: z.object({ workspace_id: workspaceId, post_id: z.string().uuid().describe("The SOCIA post id.") }),
    annotations: WITHDRAW,
  }, async (a, c) => runPosting(c as ToolCtx, "cancel_post", a.workspace_id, false, (ctx) => cancelPost(ctx, a.post_id)));
}
