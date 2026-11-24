// Two things Discover's background read (lib/discoverRead.ts) now does after reading and judging accounts
// (Noah, 2026-11-24):
//   topUpCompetitors   adds accounts SOCIA found to the roster, as many as the person added (lib/competitorTopUp.ts);
//   judgeTrending      scores the most promising Trending Reels for how well they transfer (lib/trendFit.ts).
// Neither charges the person's credits: what they cost is SOCIA's, counted in the owner's AI spend and stopped by
// the plan's monthly AI ceiling like every other background read. Server only.
import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { createServiceClient } from "@/lib/supabase/service";
import { dismissedHandles } from "@/lib/competitorAutoPick";
import { brandKind } from "@/lib/discoverRules";
import { median } from "@/lib/metrics";
import { getProfile, type BrandDetail } from "@/lib/profile";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import { updateWorkspace } from "@/lib/workspaces";
import { ownAccounts } from "@/lib/ownAccounts";
import { isOwnAccount } from "@/lib/ownAccounts";
import { aiBudgetDenied } from "@/lib/aiSpend";
import { anthropic, FAST_MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { fitOf, sameStyle, styleKey, styleWord, type StyleMemory } from "@/lib/discoverStyle";
import { chooseTopUp, openAutoSlots, topUpReason, type TopUpCandidate } from "@/lib/competitorTopUp";
import { FIT_SCHEMA, FIT_SYSTEM, fitInput, judgmentsFrom, sanitizeTrendFit, toJudge, withJudgments, type TrendFitStore } from "@/lib/trendFit";
import { trendingFor, trendingPool } from "@/lib/discoverTrending";
import { businessFrom } from "@/lib/discoverAdaptServer";
import { profileKey } from "@/lib/discoverAdapt";

const DAY = 86_400_000;

/**
 * Add SOCIA's picks to the roster: accounts it has read and judged to fit, past the quality bar, never one the
 * person removed, never past the plan's limit. Returns the handles added. Best effort.
 */
export async function topUpCompetitors(ctx: Ctx, memory: StyleMemory, candidates: string[], now: Date): Promise<string[]> {
  const svc = createServiceClient();
  if (!svc || !candidates.length) return [];
  try {
    const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id);
    // Without the removals table a removal can't be respected, so nothing is added (as autoPickCompetitors does).
    const dismissed = await dismissedHandles(svc, ctx.ownerId, cwid);
    if (!dismissed) return [];
    const [ent, tracked, mine, profile] = await Promise.all([
      getEntitlements(ctx.client, ctx.ownerId),
      listTracked<{ handle: string; platform: string; added_by: string | null }>(ctx.client, ctx.ownerId, "handle, platform, added_by", { workspaceId: cwid }),
      ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
      getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    ]);
    const limit = getLimit(ent, "competitors");
    const auto = tracked.filter((t) => t.added_by === "socia").length;
    const open = openAutoSlots(tracked.length - auto, auto, limit);
    if (open <= 0) return [];
    const g = profile?.brand_detail?.growth;
    const app = brandKind({ accountType: g?.account_type ?? null, name: profile?.brand_name ?? null, niche: profile?.niche ?? null, about: [profile?.brand_detail?.description, g?.business?.offer] }).app;
    const rows = await igCompetitorRows(ctx.client, ctx.ownerId, candidates, false, { max: candidates.length, cacheOnly: true });
    const since = now.getTime() - 60 * DAY;
    const list: TopUpCandidate[] = rows.competitors.filter((c) => c.found).map((c) => {
      const media = c.media ?? [];
      const videos = media.filter((m) => m.mediaType === "VIDEO");
      const views = videos.map((m) => m.views).filter((v): v is number => v != null);
      const usual = views.length >= 3 ? median(views) : null;
      const key = styleKey("instagram", c.handle);
      return {
        handle: c.handle, name: c.displayName ?? null, fit: fitOf(memory, key, now), followers: c.followers ?? null,
        medianViews: usual, engagement: c.engagementRate ?? null, postsPerWeek: c.postsPerWeek ?? null,
        recentReels: videos.filter((m) => !m.timestamp || Date.parse(m.timestamp) >= since).length,
        breakouts: usual ? views.filter((v) => v >= usual * 3).length : 0,
        sameStyle: sameStyle(memory.accounts[key], memory.own), app,
      };
    }).filter((c) => !(mine && isOwnAccount(mine, { handle: c.handle, name: c.name })));
    const skip = new Set([...tracked.map((t) => t.handle.toLowerCase()), ...dismissed]);
    const added: string[] = [];
    for (const c of chooseTopUp(list, open, skip)) {
      // The same privileged add the Track button uses: the plan's limit is checked in the same call.
      const { data, error } = await svc.rpc("socia_add_competitor", cwid
        ? { p_user: ctx.ownerId, p_workspace: cwid, p_platform: "instagram", p_handle: c.handle, p_limit: limit }
        : { p_user: ctx.ownerId, p_platform: "instagram", p_handle: c.handle, p_limit: limit });
      if (error) break;
      const row = (Array.isArray(data) ? data[0] : data) as { added?: boolean } | null;
      if (!row?.added) break;
      let mark = svc.from("tracked_competitors").update({ added_by: "socia", pick_reason: topUpReason(c) })
        .eq("user_id", ctx.ownerId).eq("platform", "instagram").eq("handle", c.handle);
      if (cwid) mark = mark.eq("workspace_id", cwid);
      await mark;
      added.push(c.handle);
    }
    if (added.length) console.log(`[discover/top-up] ${ctx.ownerId} added ${added.length} (open ${open})`);
    return added;
  } catch (e) {
    console.error("[discover/top-up]", (e as Error)?.message ?? e);
    return [];
  }
}

/** The brand's Trending judgments and its business profile key, for ranking (lib/trendFit.ts rankTrending). */
export function trendFitOf(detail: BrandDetail | null, niche: string | null, name: string | null): { store: TrendFitStore | null; business: string[]; profile: string } {
  const business = businessFrom(detail, niche, name);
  return { store: sanitizeTrendFit((detail as { trendFit?: unknown } | null)?.trendFit), business, profile: profileKey(business) };
}

/**
 * Score the most promising Trending Reels this brand hasn't had judged: one fast, text-only call, kept on the
 * brand row. Skipped when the owner's monthly AI ceiling is reached. Returns how many were judged.
 */
export async function judgeTrending(ctx: Ctx, memory: StyleMemory, now: Date): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  if (await aiBudgetDenied(ctx.ownerId).catch(() => null)) return 0;
  try {
    const [detail, profile, mine] = await Promise.all([
      currentDetail(ctx).catch(() => null),
      getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
      ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
    ]);
    const { store, business, profile: key } = trendFitOf(detail, profile?.niche ?? null, profile?.brand_name ?? null);
    const pool = trendingFor(await trendingPool(now), { mine });
    const reels = toJudge(pool, business, store, key, now);
    if (!reels.length) return 0;
    const res = await anthropic.messages.create({
      model: FAST_MODEL, max_tokens: 6000, system: FIT_SYSTEM,
      output_config: { format: { type: "json_schema", schema: FIT_SCHEMA }, ...effortFor(FAST_MODEL, "low") },
      messages: [{ role: "user", content: fitInput(business, styleWord(memory.own), reels) }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(ctx.ownerId, "trend_fit", res);
    const u = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    console.log(`[discover/trend-fit] reels=${reels.length} in=${u?.input_tokens ?? 0} out=${u?.output_tokens ?? 0}`);
    const block = (res as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text");
    let parsed: unknown = null;
    try { parsed = JSON.parse((block?.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { parsed = null; }
    const add = judgmentsFrom(parsed, reels, now);
    const count = Object.keys(add).length;
    if (!count) return 0;
    const fresh = await freshDetail(ctx);
    const next = { ...fresh, trendFit: withJudgments(sanitizeTrendFit((fresh as { trendFit?: unknown }).trendFit), key, add) } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
    else await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return count;
  } catch (e) {
    console.error("[discover/trend-fit]", (e as Error)?.message ?? e);
    return 0;
  }
}
