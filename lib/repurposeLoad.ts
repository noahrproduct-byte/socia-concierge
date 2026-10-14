// Server side of "Worth posting again": gathers the posts, SOCIA's own record
// of where each one went, and what each connected platform already carries,
// then hands them to lib/repurpose.ts. Instagram, Facebook and TikTok come
// from what the Dashboard already loaded; SOCIA's posts and YouTube's recent
// uploads are read here (YouTube through the short-lived cache). A read that
// fails leaves that platform unchecked, never "not there".
import type { SupabaseClient } from "@supabase/supabase-js";
import { scopeToWorkspace } from "./workspaces";
import { formatOf } from "./overview";
import { loadDestinationsLite } from "./planOutcomesLoad";
import { loadPickerAccountsDetailed } from "./publishing/db";
import { availabilityFor } from "./publishing/capabilities";
import { measureDestination, type MeasureSources } from "./postResults";
import { youtubeRecentUploads, youtubeVideoStats } from "./youtubeData";
import { cachedLive } from "./liveCache";
import type { IgMediaItem } from "./instagramSync";
import type { FbPost } from "./facebookSync";
import type { TtVideo } from "./tiktokAuth";
import type { MediaItem, Platform } from "./publishing/types";
import type { YtVideo } from "./youtube";
import { repurposeCandidates, WINDOW_DAYS, type Candidate, type PlatformTexts, type RepurposePost, type SociaPost } from "./repurpose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

type PostRow = { id: string; caption: string | null; status: string; published_media_id: string | null; media: MediaItem[] | null; media_path: string | null; media_type: string | null; media_url: string | null; created_at: string };

const DAY = 86_400_000;
const FORMAT: Record<Platform, string> = { instagram: "Post", youtube: "Video", tiktok: "Video", facebook: "Post" };

export async function loadRepurpose(
  client: Supa,
  ownerId: string,
  wsId: string | null,
  input: { igMedia: IgMediaItem[] | null; fbPosts: FbPost[] | null; ttVideos: TtVideo[] | null; now: number },
): Promise<Candidate[]> {
  const { igMedia, fbPosts, ttVideos, now } = input;

  // Platforms a draft can go to: connected, publishing now or after a reconnect.
  const { accounts } = await loadPickerAccountsDetailed(client, ownerId, wsId).catch(() => ({ accounts: [], complete: false }));
  const connected = Array.from(new Set(accounts
    .filter((a) => {
      const s = availabilityFor(a.platform, { status: a.status, suspended: a.suspended, scopes: a.scopes }).state;
      return s === "available" || s === "needs_scope";
    })
    .map((a) => a.platform)));
  if (!connected.length) return [];
  const ytConnected = accounts.some((a) => a.platform === "youtube" && !a.suspended);

  // SOCIA's posts from the window, with where each went or is set to go.
  let rows: PostRow[] = [];
  try {
    const { data } = await scopeToWorkspace(
      client.from("scheduled_posts").select("id, caption, status, published_media_id, media, media_path, media_type, media_url, created_at").eq("user_id", ownerId).neq("status", "cancelled")
        .gte("created_at", new Date(now - WINDOW_DAYS * DAY).toISOString()),
      wsId,
    ).order("created_at", { ascending: false }).limit(200);
    rows = (data ?? []) as PostRow[];
  } catch {
    rows = [];
  }
  const dests = await loadDestinationsLite(client, rows.map((r) => r.id));
  const socia: SociaPost[] = rows.map((r) => {
    const mine = dests.filter((d) => d.postId === r.id && d.status !== "cancelled");
    const platforms = new Set<Platform>(mine.map((d) => d.platform));
    if (r.published_media_id) platforms.add("instagram");
    return {
      id: r.id, caption: r.caption ?? "", platforms: [...platforms],
      externalIds: [...mine.map((d) => d.externalPostId).filter((x): x is string => Boolean(x)), ...(r.published_media_id ? [r.published_media_id] : [])],
    };
  });
  const storedFile = (r: PostRow): MediaItem | null => {
    const m = Array.isArray(r.media) ? r.media[0] : null;
    if (m?.path) return m;
    return r.media_path ? { id: r.id, kind: r.media_type === "IMAGE" ? "image" : "video", name: "", mime: "", size: null, width: null, height: null, duration: null, path: r.media_path, url: r.media_url } : null;
  };
  const byExternal = new Map<string, PostRow>();
  for (const r of rows) {
    if (!storedFile(r)) continue;
    if (r.published_media_id) byExternal.set(r.published_media_id, r);
    for (const d of dests) if (d.postId === r.id && d.platform === "instagram" && d.externalPostId) byExternal.set(d.externalPostId, r);
  }

  // YouTube: recent uploads (titles to match, the views baseline) and SOCIA's own uploads' stats.
  const ytIds = dests.filter((d) => d.platform === "youtube" && d.status === "published" && d.externalPostId).map((d) => d.externalPostId!);
  const yt = ytConnected
    ? await cachedLive(ownerId, ["repurpose-yt", wsId, [...ytIds].sort().join(",")], async () => {
        const [recent, videos] = await Promise.all([youtubeRecentUploads(client, ownerId, 50), youtubeVideoStats(client, ownerId, ytIds)]);
        return { recent, videos };
      }, (v) => v.recent.length > 0 || Object.keys(v.videos).length > 0).catch(() => null)
    : null;
  const ytRecent: YtVideo[] | null = yt?.value.recent ?? null;

  const sources: MeasureSources = {
    instagram: igMedia, facebook: fbPosts,
    youtube: yt?.value.videos ?? null, youtubeRecent: ytRecent,
  };

  const posts: RepurposePost[] = [];
  // Instagram: every post of the window, from SOCIA's stored file when SOCIA sent it.
  for (const m of igMedia ?? []) {
    if (!m.id || !m.timestamp || (m.media_type !== "VIDEO" && m.media_type !== "IMAGE")) continue;
    const meas = measureDestination("instagram", m.id, sources);
    if (!meas.found || meas.value == null || meas.multiplier == null) continue;
    const row = byExternal.get(m.id);
    posts.push({
      ref: row ? { kind: "post", id: row.id } : { kind: "instagram", id: m.id },
      platform: "instagram", externalId: m.id, caption: m.caption ?? row?.caption ?? "",
      kind: m.media_type === "VIDEO" ? "video" : "image", format: formatOf(m),
      thumb: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url ?? null : null), permalink: m.permalink ?? null,
      postedAt: m.timestamp, multiplier: meas.multiplier, sample: meas.sampleSize, metric: "interactions",
    });
  }
  // What SOCIA sent to YouTube and Facebook, measured on those platforms.
  for (const d of dests) {
    if (d.status !== "published" || !d.externalPostId || (d.platform !== "youtube" && d.platform !== "facebook")) continue;
    const row = rows.find((r) => r.id === d.postId);
    const file = row ? storedFile(row) : null;
    if (!row || !file) continue;
    const meas = measureDestination(d.platform, d.externalPostId, sources);
    if (!meas.found || meas.multiplier == null) continue;
    posts.push({
      ref: { kind: "post", id: row.id }, platform: d.platform, externalId: d.externalPostId, caption: row.caption ?? "",
      kind: file.kind, format: file.kind === "video" ? "Video" : FORMAT[d.platform],
      thumb: file.kind === "image" ? file.url : null, permalink: d.permalink,
      postedAt: d.publishedAt ?? row.created_at, multiplier: meas.multiplier, sample: meas.sampleSize, metric: meas.metric,
    });
  }

  const texts: PlatformTexts = {
    instagram: igMedia ? igMedia.map((m) => m.caption ?? "") : null,
    tiktok: ttVideos ? ttVideos.map((v) => v.caption ?? "") : null,
    youtube: ytRecent ? ytRecent.map((v) => v.title) : null,
    facebook: fbPosts ? fbPosts.map((p) => p.message ?? "") : null,
  };
  return repurposeCandidates({ posts, socia, texts, connected, now });
}
