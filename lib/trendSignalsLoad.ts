// Reads what the niche is posting for the plan strategist and the idea writer:
// the same accounts and Reels the Discover page shows (tracked accounts, then
// discovered ones, Instagram through Business Discovery and YouTube through
// its Data API, plus Reels and Shorts discovery found), ranked and grouped by
// lib/trendSignals. On the niche-trends plan feature only. Server only; every
// source is best-effort and the whole read gives up after READ_BUDGET_MS so a
// slow platform never holds up a plan.

import { canUseFeature, getEntitlements } from "./entitlements";
import { channelStats, ytConfigured, ytFormat, type YtStats } from "./youtube";
import { igCompetitorRows, type IgCompetitor } from "./igCompetitorData";
import { withBaseline, type CompPost } from "./competitorIntel";
import { listTracked } from "./trackedCompetitors";
import { isOwnAccount, ownAccounts } from "./ownAccounts";
import { locationTokens } from "./competitorPatterns";
import { nicheVetted } from "./discovery";
import { scopeToWorkspace } from "./workspaces";
import type { NichePost } from "./nicheTrends";
import { provenReels, rankTrendingReels, trendSignals, type ProvenReel, type TrendAccount, type TrendSignals } from "./trendSignals";

const READ_BUDGET_MS = 15000;
const IG_FORMAT: Record<string, string> = { VIDEO: "Reel", IMAGE: "Photo", CAROUSEL_ALBUM: "Carousel" };
const CONTENT_FORMAT: Record<string, string> = { short: "Short", video: "Video", reel: "Reel" };

export function ytPosts(s: YtStats): CompPost[] {
  return withBaseline((s.recent ?? []).map((v) => ({
    url: v.url, title: v.title || null, thumb: v.thumb, views: v.views, likes: v.likes, comments: v.comments,
    publishedAt: v.publishedAt || null, format: ytFormat(v.durationSec), durationSec: v.durationSec, multiplier: null,
  })));
}

export function igPosts(c: IgCompetitor): CompPost[] {
  return (c.media ?? []).map((m) => ({
    url: m.permalink ?? "", title: m.caption ? m.caption.split("\n")[0].slice(0, 140) : null, thumb: m.thumbnail,
    views: m.views ?? null, likes: m.likes, comments: m.comments, publishedAt: m.timestamp,
    format: m.mediaType ? IG_FORMAT[m.mediaType] ?? null : null, durationSec: null, multiplier: null, video: m.video ?? null,
  })).filter((p) => p.url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** What the niche read gives a plan or an idea batch: the grouped trends, and the Reels that took off, to build on. */
export type NicheRead = { signals: TrendSignals; proven: ProvenReel[] };

/** How old a stored Instagram read may be for a cached-only read (the Dashboard never calls a platform for this). */
const CACHED_MAX_AGE_MS = 7 * 86_400_000;

/** Stored Business Discovery reads of these handles, no newer than CACHED_MAX_AGE_MS; no platform call. */
async function cachedIgCompetitors(client: Supa, ownerId: string, handles: string[], now: Date): Promise<{ competitors: IgCompetitor[] }> {
  if (!handles.length) return { competitors: [] };
  const { data } = await client.from("ig_competitor_snapshots").select("handle, display_name, profile_picture, media, fetched_at").eq("user_id", ownerId).in("handle", handles);
  const rows = ((data ?? []) as { handle: string; display_name: string | null; profile_picture: string | null; media: IgCompetitor["media"]; fetched_at: string }[])
    .filter((r) => now.getTime() - Date.parse(r.fetched_at) < CACHED_MAX_AGE_MS);
  return { competitors: rows.map((r) => ({ handle: r.handle, found: true, displayName: r.display_name, profilePicture: r.profile_picture, media: r.media ?? [] }) as IgCompetitor) };
}

async function read(client: Supa, ownerId: string, scopeId: string | null, location: string | null, now: Date, cachedOnly = false): Promise<NicheRead | null> {
  const ent = await getEntitlements(client, ownerId);
  if (!canUseFeature(ent, "niche_intelligence")) return null;
  const mine = await ownAccounts(client, ownerId).catch(() => null);
  const notMine = (a: { handle?: string | null; name?: string | null }) => !mine || !isOwnAccount(mine, a);

  const [tracked, discovered, contentRows] = await Promise.all([
    listTracked<{ platform: string; handle: string }>(client, ownerId, "platform, handle", { workspaceId: scopeId }).catch(() => []),
    (async () => {
      try {
        const { data } = await scopeToWorkspace(client.from("discovered_accounts").select("platform, handle, display_name, data_source, relevance_reasons").eq("user_id", ownerId), scopeId)
          .order("relevance_score", { ascending: false, nullsFirst: false }).limit(48);
        // YouTube search results count only once they passed the niche check (lib/nicheCheck.ts).
        return ((data ?? []) as { platform: string; handle: string | null; display_name: string | null }[]).filter(nicheVetted).slice(0, 24);
      } catch { return []; }
    })(),
    (async () => {
      try {
        const { data } = await scopeToWorkspace(client.from("discovered_content")
          .select("content_url, platform, account_name, account_handle, title, thumbnail_url, views, likes, comments, published_at, content_type, multiplier, data_source, relevance_reasons")
          .eq("user_id", ownerId), scopeId)
          .in("content_type", ["short", "reel"]).order("relevance_score", { ascending: false }).limit(120);
        return ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted);
      } catch { return []; }
    })(),
  ]);

  // The same order as the Discover page: tracked first, then discovered.
  const handles = (platform: string, max: number) => [...new Set([
    ...tracked.filter((t) => t.platform === platform).map((t) => t.handle),
    ...discovered.filter((d) => d.platform === platform && d.handle).map((d) => d.handle!),
  ].map((h) => h.replace(/^@/, "").toLowerCase()))].filter((h) => notMine({ handle: h })).slice(0, max);
  const igHandles = handles("instagram", 8);
  // A cached-only read skips YouTube: its channel reads cost quota on every call.
  const ytHandles = ytConfigured() && !cachedOnly ? handles("youtube", 6) : [];

  const [igRes, ytRes] = await Promise.all([
    !igHandles.length ? Promise.resolve(null)
      : cachedOnly ? cachedIgCompetitors(client, ownerId, igHandles, now).catch(() => null)
      : igCompetitorRows(client, ownerId, igHandles).catch(() => null),
    Promise.all(ytHandles.map((h) => channelStats(h).catch(() => null))),
  ]);

  const accounts: TrendAccount[] = [];
  for (const c of igRes?.competitors ?? []) {
    if (!c.found || !notMine({ handle: c.handle, name: c.displayName })) continue;
    accounts.push({ platform: "instagram", name: (c.displayName ?? `@${c.handle}`).trim(), handle: c.handle, avatar: c.profilePicture ?? null, posts: igPosts(c) });
  }
  for (const s of ytRes) {
    if (!s?.found || !notMine({ handle: s.handle, name: s.title })) continue;
    accounts.push({ platform: "youtube", name: (s.title ?? `@${s.handle}`).trim(), handle: s.handle, avatar: s.avatar ?? null, posts: ytPosts(s) });
  }
  const content: NichePost[] = contentRows
    .filter((r) => notMine({ handle: (r.account_handle as string) ?? null, name: (r.account_name as string) ?? null }))
    .map((r) => ({
      url: String(r.content_url), platform: String(r.platform), accountName: (r.account_name as string) ?? null, accountHandle: (r.account_handle as string) ?? null,
      title: (r.title as string) ?? null, thumb: (r.thumbnail_url as string) ?? null,
      views: (r.views as number) ?? null, likes: (r.likes as number) ?? null, comments: (r.comments as number) ?? null,
      publishedAt: (r.published_at as string) ?? null, multiplier: r.multiplier != null ? Number(r.multiplier) : null,
      relevanceScore: 0, tags: [], format: r.content_type ? CONTENT_FORMAT[String(r.content_type)] ?? null : null,
      why: null, dataSource: String(r.data_source ?? "web_research"),
    }));

  const reels = rankTrendingReels(accounts, content, now);
  if (!reels.length) return null;
  const loc = locationTokens(location);
  // Every hook and topic group, not only the six a prompt lists, so each Reel's track record finds its own.
  return { signals: trendSignals(reels, { loc }), proven: provenReels(reels, { loc, max: 8, signals: trendSignals(reels, { loc, max: 40 }) }) };
}

/** The niche's trends for one brand, or null when the plan lacks niche trends, nothing was found, or the read ran out of time. */
export async function loadNicheRead(client: Supa, ownerId: string, scopeId: string | null, opts: { location?: string | null; now?: Date } = {}): Promise<NicheRead | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), READ_BUDGET_MS); });
  try {
    return await Promise.race([read(client, ownerId, scopeId, opts.location ?? null, opts.now ?? new Date()).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The same read from what SOCIA already stored (Instagram reads of the last
 * week and the Reels discovery saved), with no platform call: cheap enough
 * for every Dashboard view. Null without the plan feature or anything stored.
 */
export async function loadCachedNicheRead(client: Supa, ownerId: string, scopeId: string | null, opts: { location?: string | null; now?: Date } = {}): Promise<NicheRead | null> {
  return read(client, ownerId, scopeId, opts.location ?? null, opts.now ?? new Date(), true).catch(() => null);
}
