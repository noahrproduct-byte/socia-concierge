// The account's own Reels, as the Content Rater's outlook reads them
// (lib/outlook.ts). Reads the brand's stored Instagram snapshot: the same
// posts and view counts every other screen shows. Server only.

import type { Ctx } from "@/lib/context";
import { getIgSnapshot } from "@/lib/instagramSync";
import { buildModel, nicheBaseline, reelsFrom, SETTLE_DAYS, type AccountModel, type NicheBaseline } from "./outlook";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { isOwnAccount, ownAccounts } from "@/lib/ownAccounts";
import { nicheVetted } from "@/lib/discovery";

export type OutlookPayload = {
  /** false when this brand has no Instagram account connected. */
  connected: boolean;
  handle: string | null;
  /** false = the connection lacks the insights permission, so Reels have no view counts to read. */
  insightsOk: boolean | null;
  model: AccountModel;
  /** The brand's followers, to scale the niche's views per follower. */
  followers: number | null;
  /** Real Reels SOCIA has read in the niche, for an estimate when the account's own history is too thin. */
  niche: NicheBaseline | null;
};

const NICHE_ACCOUNTS = 30;
const NICHE_WINDOW_DAYS = 120;

/**
 * The niche's settled Reels from what SOCIA already holds: the brand's tracked competitors and its suggested
 * accounts, as last read from Instagram (cache only: no new Instagram calls here). Never the brand's own.
 */
async function loadNiche(ctx: Ctx, now: Date): Promise<NicheBaseline | null> {
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id).catch(() => null);
  const [tracked, suggested, mine] = await Promise.all([
    listTracked<{ handle: string; platform: string }>(ctx.client, ctx.ownerId, "handle, platform", { workspaceId: cwid }).catch(() => []),
    (async () => {
      try {
        let q = ctx.client.from("discovered_accounts").select("handle, platform, data_source, relevance_reasons").eq("user_id", ctx.ownerId).eq("platform", "instagram");
        if (cwid) q = q.eq("workspace_id", cwid);
        const { data } = await q.order("relevance_score", { ascending: false }).limit(NICHE_ACCOUNTS);
        return ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted).map((r) => String(r.handle ?? ""));
      } catch { return [] as string[]; }
    })(),
    ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
  ]);
  const handles = [...new Set([...tracked.filter((t) => t.platform === "instagram").map((t) => t.handle), ...suggested].map((h) => h.toLowerCase().replace(/^@/, "")).filter(Boolean))]
    .filter((h) => !mine || !isOwnAccount(mine, { handle: h }))
    .slice(0, NICHE_ACCOUNTS);
  if (!handles.length) return null;
  const read = await igCompetitorRows(ctx.client, ctx.ownerId, handles, false, { max: handles.length, cacheOnly: true }).catch(() => null);
  const since = now.getTime() - NICHE_WINDOW_DAYS * 86_400_000, settled = now.getTime() - SETTLE_DAYS * 86_400_000;
  return nicheBaseline((read?.competitors ?? []).filter((c) => c.found && c.followers).map((c) => ({
    handle: c.handle,
    followers: c.followers ?? 0,
    views: (c.media ?? [])
      .filter((m) => m.mediaType === "VIDEO" && typeof m.views === "number" && m.timestamp && Date.parse(m.timestamp) >= since && Date.parse(m.timestamp) <= settled)
      .map((m) => m.views as number),
  })));
}

export async function loadOutlook(ctx: Ctx, now: Date = new Date()): Promise<OutlookPayload> {
  const [snap, niche] = await Promise.all([
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id).catch(() => null),
    loadNiche(ctx, now).catch(() => null),
  ]);
  if (!snap) return { connected: false, handle: null, insightsOk: null, model: buildModel([], 0), followers: null, niche };
  const { reels, pending } = reelsFrom(snap.media, now);
  return { connected: true, handle: snap.username, insightsOk: snap.insights_ok, model: buildModel(reels, pending), followers: snap.followers_count ?? null, niche };
}
