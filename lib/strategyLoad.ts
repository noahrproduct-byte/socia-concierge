// Server side of the Growth Strategy (lib/strategy.ts): gather the facts from
// SOCIA's own data, ask the model once to write the strategy from them, and
// keep it on the brand's own row beside the Growth Profile
// (brand_detail.strategy). Server only.

import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { updateWorkspace } from "./workspaces";
import { getEntitlements } from "./entitlements";
import { loadSources } from "./api/sources";
import { buildAccountSample } from "./intel/accountSample";
import { whatWorks } from "./intel/overview";
import { listInsights } from "./intel/insightStore";
import { currentDetail } from "./intel/understandLoad";
import { listGoals } from "./growthStore";
import { getProfile, type BrandDetail } from "./profile";
import { GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, growthLines } from "./growth";
import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import type { TtVideo } from "./tiktokAuth";
import { STRATEGY_SYSTEM, factLines, normalizeStrategy, strategySchema, type GrowthStrategy, type StrategyFacts } from "./strategy";

export async function readStrategy(ctx: Ctx): Promise<GrowthStrategy | null> {
  const s = (await currentDetail(ctx).catch(() => ({}) as BrandDetail)).strategy;
  return s?.v === 1 ? s : null;
}

export async function saveStrategy(ctx: Ctx, s: GrowthStrategy): Promise<boolean> {
  const detail = await currentDetail(ctx);
  const next: BrandDetail = { ...detail, strategy: s };
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

/** Everything the strategy may rest on, from what SOCIA already holds for this brand. */
export async function strategyFacts(ctx: Ctx): Promise<{ facts: StrategyFacts; goalLine: string | null }> {
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const [profile, src, insights, goals] = await Promise.all([
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    loadSources(ctx, ent, { days: 90 }).catch(() => null),
    listInsights(ctx, { limit: 8 }).catch(() => ({ tableReady: false, insights: [] })),
    listGoals(ctx).catch(() => ({ tableReady: false, goals: [] })),
  ]);
  const growth = profile?.brand_detail?.growth ?? null;
  const sample = src
    ? buildAccountSample({
        now: src.now,
        ig: src.ig ? { username: src.ig.snap.username, name: src.ig.snap.name, biography: src.ig.snap.biography, followers: src.ig.snap.followers_count, media: src.ig.media } : null,
        fb: src.fb ? { name: src.fb.snap.page_name, followers: src.fb.snap.followers_count, posts: src.fb.snap.posts ?? [] } : null,
        yt: src.yt ? { title: src.yt.channel.title, handle: src.yt.channel.handle, subscribers: src.yt.channel.subscribers, videos: src.yt.topVideos ?? [] } : null,
        tt: src.tt ? { username: (src.tt.username as string | null) ?? null, followers: (src.tt.follower_count as number | null) ?? null, videos: Array.isArray(src.tt.videos) ? (src.tt.videos as TtVideo[]) : [] } : null,
      })
    : { facts: [], posts: [] };
  const paces = sample.facts.map((f) => f.postsPerWeek).filter((n): n is number => n != null);
  const goalLines = goals.goals.map((g) => {
    const m = goalMetric(g.metric);
    return `${m?.label ?? g.metric} to ${formatGoalValue(g.metric, g.target)}${g.due_date ? ` by ${g.due_date}` : ""}${g.platforms.length ? ` (${g.platforms.map((p) => GOAL_PLATFORM_NAME[p]).join(", ")})` : ""}`;
  });
  const primaryIdx = goals.goals.findIndex((g) => g.kind === "primary");
  return {
    facts: {
      growth,
      niche: profile?.niche ?? null,
      brandName: profile?.brand_name ?? null,
      pace: paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      works: whatWorks(sample).slice(0, 6).map((w) => `${w.format}s: ${w.multiple}x the account's median ${w.metric} (${w.posts} posts) on ${GOAL_PLATFORM_NAME[w.platform]}`),
      findings: insights.insights.map((i) => `${i.title}. ${i.observation}`),
      goals: goalLines.map((l, i) => `${goals.goals[i].kind === "primary" ? "Primary" : "Secondary"}: ${l}`),
      themes: growth?.understanding?.themes ?? [],
    },
    goalLine: primaryIdx >= 0 ? goalLines[primaryIdx] : null,
  };
}

/** One model call; the draft is bounded and held to the person's time before it is kept. */
export async function generateStrategy(ctx: Ctx, now = new Date()): Promise<GrowthStrategy> {
  const { facts, goalLine } = await strategyFacts(ctx);
  const { prompt, basedOn } = factLines(facts);
  const who = growthLines(facts.growth).join("\n");
  const res = (await anthropic.messages.create({
    model: FAST_MODEL, max_tokens: 3000, system: STRATEGY_SYSTEM,
    output_config: { format: { type: "json_schema", schema: strategySchema }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content: `# Their Growth Profile\n${who || "(not filled in yet)"}\n\n# Main goal\n${goalLine ?? "not set"}\n\n# Facts SOCIA holds\n${prompt}\n\nWrite the strategy. Today is ${now.toISOString().slice(0, 10)}.` }],
  } as never)) as unknown as { content: { type: string; text?: string }[] };
  recordAiUsage(ctx.ownerId, "growth_strategy", res);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Record<string, unknown>;
  return normalizeStrategy(raw, { growth: facts.growth, goalLine, basedOn, now });
}
