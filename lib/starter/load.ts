// Server side of the starter strategy: how much history a brand's connected
// accounts give SOCIA (lib/starter/readiness.ts), what SOCIA has observed on
// other accounts in its niche, and the creators the person follows on
// Discover. Every number is one a platform published. Server only.

import type { Ctx } from "../context";
import { getEntitlements } from "../entitlements";
import { loadSources } from "../api/sources";
import { buildAccountSample } from "../intel/accountSample";
import { nicheReadFor } from "../intel/profileLoad";
import { listTracked } from "../trackedCompetitors";
import { competitorScopeId } from "../workspaces";
import type { TtVideo } from "../tiktokAuth";
import { readinessOf, readinessThresholds, type Readiness } from "./readiness";

/** Posts read per platform for the readiness count: enough to pass the "established" mark on one platform. */
const PER_PLATFORM = 60;

export async function loadReadiness(ctx: Ctx, now = new Date()): Promise<Readiness | null> {
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const src = await loadSources(ctx, ent, { days: 90, platforms: ["instagram", "youtube", "facebook", "tiktok"] }).catch(() => null);
  if (!src) return null;
  const sample = buildAccountSample({
    now: src.now,
    ig: src.ig ? { username: src.ig.snap.username, name: src.ig.snap.name, biography: src.ig.snap.biography, followers: src.ig.snap.followers_count, media: src.ig.media } : null,
    fb: src.fb ? { name: src.fb.snap.page_name, followers: src.fb.snap.followers_count, posts: src.fb.snap.posts ?? [] } : null,
    yt: src.yt ? { title: src.yt.channel.title, handle: src.yt.channel.handle, subscribers: src.yt.channel.subscribers, videos: src.yt.topVideos ?? [] } : null,
    tt: src.tt ? { username: (src.tt.username as string | null) ?? null, followers: (src.tt.follower_count as number | null) ?? null, videos: Array.isArray(src.tt.videos) ? (src.tt.videos as TtVideo[]) : [] } : null,
  }, PER_PLATFORM);
  return readinessOf(sample.posts, now, readinessThresholds());
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * What SOCIA observed on other accounts in the niche, as lines: each a real
 * Reel or Short with the numbers its platform published and how far it beat
 * its creator's usual. Their results, not the person's. [] when none is held.
 */
export async function nicheObservations(ctx: Ctx, opts: { location?: string | null; max?: number } = {}): Promise<string[]> {
  const scope = await competitorScopeId(ctx.client, ctx.workspace?.id ?? null).catch(() => ctx.workspace?.id ?? null);
  const read = await nicheReadFor(ctx.client, ctx.ownerId, scope, { need: "saved", location: opts.location ?? null }).catch(() => null);
  if (!read) return [];
  return read.proven.slice(0, opts.max ?? 6).map((r) => {
    const who = r.accountHandle ? `@${r.accountHandle}` : r.accountName;
    const nums = [r.views != null ? `${fmt(r.views)} views` : null, r.likes != null ? `${fmt(r.likes)} likes` : null].filter(Boolean).join(", ");
    const lift = r.multiplier != null ? `, ${r.multiplier.toFixed(1)}x their median ${r.basis}` : "";
    return `${who} (${r.platform}), ${r.format}: "${(r.line ?? r.title ?? "").slice(0, 90)}"${nums ? `, ${nums}` : ""}${lift}${r.structures.length ? `; hook: ${r.structures.join(", ")}` : ""}${r.topics.length ? `; topics: ${r.topics.join(", ")}` : ""}`;
  });
}

/** The creators and competitors the person follows on Discover (their handles). */
export async function admiredHandles(ctx: Ctx): Promise<string[]> {
  const scope = await competitorScopeId(ctx.client, ctx.workspace?.id ?? null).catch(() => ctx.workspace?.id ?? null);
  const rows = await listTracked<{ handle: string }>(ctx.client, ctx.ownerId, "handle", { workspaceId: scope, limit: 12 }).catch(() => []);
  return [...new Set(rows.map((r) => r.handle).filter(Boolean))];
}
