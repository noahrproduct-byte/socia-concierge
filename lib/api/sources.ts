// The platform data an API request reads, loaded exactly as the Analytics
// page loads it (same helpers, same stored rows, the same short-lived cache
// for live platform reads), and only for the platforms the request needs.
// Then the same builders the pages use turn it into each platform's view.
import type { Ctx } from "../context";
import { brandWorkspace } from "../context";
import { scopeToWorkspace } from "../workspaces";
import { getProfile, type Profile } from "../profile";
import { getFbSnapshot, type FbSnapshot } from "../facebookSync";
import { getFacebookInsights, type FbInsights } from "../facebookInsights";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem, type IgSnapshot } from "../instagramSync";
import { readPlatformSnapshots, type PlatformSnapshotRow } from "../platformSnapshots";
import { getYouTubeAnalytics, type YouTubeAnalytics } from "../youtubeData";
import { cachedLive } from "../liveCache";
import { maxHistoryDays, type Entitlements } from "../entitlements";
import { RANGES, clampRangeId, rangeDays } from "../overview";
import type { DailySnapshot } from "../dashboardMetrics";

export type PlatformKey = "instagram" | "facebook" | "youtube" | "tiktok";
export const PLATFORM_KEYS: PlatformKey[] = ["instagram", "youtube", "facebook", "tiktok"];

type IgRow = DailySnapshot & { followers_gained: number | null };

export type Sources = {
  now: Date;
  days: number;
  rangeLabel: string;
  /** The range the person asked for, when the plan shortened it. */
  clampedFrom: number | null;
  profile: Profile | null;
  ig: { snap: IgSnapshot; media: IgMediaItem[]; daily: IgRow[] } | null;
  fb: { snap: FbSnapshot; snaps: PlatformSnapshotRow[]; insights: FbInsights | null } | null;
  yt: YouTubeAnalytics | null;
  tt: Record<string, unknown> | null;
};

/** The plan's history limit applied to a requested number of days, as the pages apply it. */
export function rangeFor(ent: Entitlements, requested: number | undefined): { days: number; label: string; clampedFrom: number | null } {
  const want = RANGES.find((r) => r.days === requested)?.id ?? "30";
  const id = clampRangeId(want, maxHistoryDays(ent));
  const days = rangeDays(id);
  return { days, label: RANGES.find((r) => r.id === id)?.label ?? "Last 30 days", clampedFrom: requested && days < requested ? requested : null };
}

export async function loadSources(ctx: Ctx, ent: Entitlements, opts: { days?: number; platforms?: PlatformKey[]; deepYouTube?: boolean } = {}): Promise<Sources> {
  const want = new Set(opts.platforms?.length ? opts.platforms : PLATFORM_KEYS);
  const r = rangeFor(ent, opts.days);
  const wsId = ctx.workspace?.id ?? null;
  const scope = ["api", wsId];

  const profileP = getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const igP: Promise<Sources["ig"]> = want.has("instagram")
    ? getIgSnapshot(ctx.client, ctx.ownerId, wsId).then(async (snap) => {
        if (!snap || snap.followers_count == null) return null;
        const daily = await readDailySnapshots<IgRow>(ctx.client, ctx.ownerId, snap.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as IgRow[]);
        return { snap, media: snap.media ?? [], daily };
      }).catch(() => null)
    : Promise.resolve(null);
  const fbP: Promise<Sources["fb"]> = want.has("facebook")
    ? getFbSnapshot(ctx.client, ctx.ownerId, wsId ?? undefined).then(async (snap) => {
        if (!snap || snap.status !== "connected") return null;
        const [snaps, insights] = await Promise.all([
          snap.page_id ? readPlatformSnapshots(ctx.client, ctx.ownerId, "facebook", snap.page_id).catch(() => []) : Promise.resolve([]),
          cachedLive(ctx.ownerId, ["fb-insights", ...scope, snap.page_id, r.days], () => getFacebookInsights(ctx.client, ctx.ownerId, r.days, wsId ?? undefined), (v) => v.available).then((c) => c?.value ?? null).catch(() => null),
        ]);
        return { snap, snaps, insights };
      }).catch(() => null)
    : Promise.resolve(null);
  const ytP: Promise<YouTubeAnalytics | null> = want.has("youtube")
    ? cachedLive(ctx.ownerId, [opts.deepYouTube ? "yt-deep" : "yt", ...scope, r.days], () => getYouTubeAnalytics(ctx.client, ctx.ownerId, r.days, { deep: Boolean(opts.deepYouTube), workspaceId: wsId ?? undefined }), (v) => v.note == null)
        .then((c) => c?.value ?? null).catch(() => null)
    : Promise.resolve(null);
  const ttP: Promise<Record<string, unknown> | null> = want.has("tiktok")
    ? (async () => {
        try {
          const { data } = await scopeToWorkspace(
            ctx.client.from("tiktok_connections").select("username, display_name, avatar_url, is_verified, follower_count, likes_count, video_count, videos, last_synced_at").eq("user_id", ctx.ownerId),
            wsId,
          ).limit(1);
          return ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
        } catch {
          return null;
        }
      })()
    : Promise.resolve(null);

  const [profile, ig, fb, yt, tt] = await Promise.all([profileP, igP, fbP, ytP, ttP]);
  return { now: new Date(), days: r.days, rangeLabel: r.label, clampedFrom: r.clampedFrom, profile, ig, fb, yt, tt };
}
