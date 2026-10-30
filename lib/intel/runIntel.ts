// One intelligence run for the brand in ctx: load the connected accounts the
// way Analytics does, run the producers, store the findings, and record the
// run in intelligence_jobs. No AI call: every finding here comes from
// deterministic detectors over the account's own data.
//
// Server only.

import type { Ctx } from "../context";
import { getEntitlements } from "../entitlements";
import { loadSources } from "../api/sources";
import { buildInsights, displayTitle } from "../overview";
import { median } from "../metrics";
import { interactionsTotal } from "../engagement";
import { fromOverviewInsights, zeroViewDiagnostics, type RecentPost } from "./producers";
import { storeInsights, startJob, finishJob } from "./insightStore";
import type { InsightDraft, InsightPost } from "./insight";

export const PRODUCERS = ["overview", "diagnostics"];

export type IntelRun = { tableReady: boolean; found: number; added: number; updated: number; superseded: number; platforms: string[] };

export async function runInsights(ctx: Ctx, trigger: "onboarding" | "manual" | "cron"): Promise<IntelRun> {
  const job = await startJob(ctx, "refresh_insights", trigger).catch(() => null);
  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const src = await loadSources(ctx, ent, { days: 30, platforms: ["instagram", "youtube"] });
    const drafts: InsightDraft[] = [];
    const platforms: string[] = [];

    if (src.ig) {
      platforms.push("instagram");
      const media = src.ig.media.filter((m) => m.timestamp);
      const postsById = new Map<string, InsightPost>(
        media.filter((m) => m.id).map((m) => [m.id!, { platform: "instagram", id: m.id!, title: displayTitle(m.caption ?? "") || "Untitled post", permalink: m.permalink ?? null }]),
      );
      const baseline = median(media.map(interactionsTotal));
      const found = buildInsights({ media, baseline, location: src.profile?.brand_detail?.location ?? null, handle: src.ig.snap.username });
      drafts.push(...fromOverviewInsights(found, { handle: src.ig.snap.username, syncedAt: src.ig.snap.last_synced_at, postsById }));
      const recent: RecentPost[] = media.map((m) => ({
        platform: "instagram",
        id: m.id ?? "",
        title: displayTitle(m.caption ?? ""),
        permalink: m.permalink ?? null,
        publishedAt: m.timestamp ?? null,
        // Only a reported count: a missing views metric is not a zero.
        views: m.insights?.views ?? null,
        format: m.media_product_type === "REELS" || m.media_type === "VIDEO" ? "Reel" : "Post",
      }));
      drafts.push(...zeroViewDiagnostics(recent.filter((p) => p.id), src.ig.snap.last_synced_at, src.now));
    }
    if (src.yt) {
      platforms.push("youtube");
      const recent: RecentPost[] = (src.yt.topVideos ?? []).map((v) => ({
        platform: "youtube",
        id: v.videoId,
        title: v.title,
        permalink: `https://youtu.be/${v.videoId}`,
        publishedAt: v.publishedAt,
        views: v.views,
        format: v.durationSec != null && v.durationSec <= 60 ? "Short" : "Video",
      }));
      drafts.push(...zeroViewDiagnostics(recent, src.now.toISOString(), src.now));
    }

    const stored = await storeInsights(ctx, PRODUCERS, drafts, src.now);
    const run: IntelRun = { ...stored, found: drafts.length, platforms };
    await finishJob(ctx, job, { ok: true, result: run }).catch(() => undefined);
    return run;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishJob(ctx, job, { ok: false, error: msg }).catch(() => undefined);
    throw e;
  }
}
