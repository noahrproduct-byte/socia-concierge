// Discover's "Trending" feed: viral Reels from any industry, for ideas a brand wouldn't meet in its own niche
// (Noah, 2026-11-24). They come from the public accounts SOCIA has already read on Instagram for every brand
// (ig_competitor_snapshots: other accounts' public Reels and the numbers Meta published), so the feed costs
// no new Instagram reads and no AI; only Reels past VIRAL_MIN_VIEWS count. Which brand read an account is never
// shown or used. The pool is kept for half an hour per server. Server only.
import { createServiceClient } from "@/lib/supabase/service";
import { igPosts } from "@/lib/trendSignalsLoad";
import { isViralFor, provenReels, rankTrendingReels, type TrendAccount } from "@/lib/trendSignals";
import type { IgCompetitor, IgCompetitorPost } from "@/lib/igCompetitorData";
import { feedScore, type FeedReel } from "@/lib/discoverFeed";
import { isOwnAccount, type OwnAccounts } from "@/lib/ownAccounts";
import { reelKey } from "@/lib/discoverStyle";

const TTL_MS = 30 * 60_000;
/** Accounts read in the last three weeks count; older reads are stale. */
const READ_WITHIN_MS = 21 * 86_400_000;
const ROWS = 800;
const POOL_MAX = 400;

let cached: { at: number; reels: FeedReel[] } | null = null;

type SnapRow = { handle: string; display_name: string | null; profile_picture: string | null; followers: number | null; media: IgCompetitorPost[] | null; fetched_at: string };

/** The pool from saved rows: the latest read of each account, its viral Reels ranked, two per account at most. Pure. */
export function poolFromRows(rows: SnapRow[], now: Date): FeedReel[] {
  const latest = new Map<string, SnapRow>();
  for (const r of rows) {
    const k = r.handle.toLowerCase();
    const had = latest.get(k);
    if (!had || Date.parse(r.fetched_at) > Date.parse(had.fetched_at)) latest.set(k, r);
  }
  const accounts: TrendAccount[] = [...latest.values()].map((r) => ({
    platform: "instagram", name: r.display_name || `@${r.handle}`, handle: r.handle, avatar: r.profile_picture,
    posts: igPosts({ handle: r.handle, found: true, media: Array.isArray(r.media) ? r.media : [] } as IgCompetitor),
  }));
  const viral = rankTrendingReels(accounts, [], now).filter((r) => isViralFor(false, r));
  return provenReels(viral, { max: POOL_MAX, perAccount: 2 })
    .map((r): FeedReel => ({ ...r, source: "trending" }))
    .sort((a, b) => feedScore(b, now) - feedScore(a, now))
    .map((r, i) => ({ ...r, id: `T${i + 1}` }));
}

/** Every trending Reel SOCIA holds, best first. Empty when the store can't be read. */
export async function trendingPool(now = new Date()): Promise<FeedReel[]> {
  if (cached && now.getTime() - cached.at < TTL_MS) return cached.reels;
  const svc = createServiceClient();
  if (!svc) return [];
  try {
    const { data, error } = await svc
      .from("ig_competitor_snapshots")
      .select("handle, display_name, profile_picture, followers, media, fetched_at")
      .gte("fetched_at", new Date(now.getTime() - READ_WITHIN_MS).toISOString())
      .order("fetched_at", { ascending: false })
      .limit(ROWS);
    if (error) throw error;
    const reels = poolFromRows((data ?? []) as SnapRow[], now);
    cached = { at: now.getTime(), reels };
    return reels;
  } catch (e) {
    console.error("[discover/trending] pool unreadable:", (e as Error)?.message ?? e);
    return cached?.reels ?? [];
  }
}

/** The trending Reels for one brand: never its own accounts' or the ones already in its recommended feed. Pure. */
export function trendingFor(pool: FeedReel[], opts: { mine?: OwnAccounts | null; skip?: Set<string> }): FeedReel[] {
  return pool.filter((r) => {
    const k = reelKey(r.url) ?? r.url;
    if (opts.skip?.has(k) || opts.skip?.has(r.url)) return false;
    return !(opts.mine && isOwnAccount(opts.mine, { handle: r.accountHandle, name: r.accountName }));
  });
}
