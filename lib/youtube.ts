// YouTube Data API v3 — the one platform that publishes competitor statistics
// through an official API. Everything here is genuinely public data Google
// serves for any channel: subscriber count, lifetime views, video count, and
// per-video view/like/comment counts.
//
// The honesty rules that govern the rest of SOCIA still apply:
//   - a field Google omits (e.g. hidden subscriber counts) returns null and
//     renders "—"; it is never inferred
//   - nothing here is presented as private analytics. These are the same
//     numbers any visitor sees on the channel page.
//
// The key is server-only (YOUTUBE_API_KEY in the environment) and never
// reaches the browser.

const API = "https://www.googleapis.com/youtube/v3";

export const ytConfigured = (): boolean => Boolean(process.env.YOUTUBE_API_KEY);

export type YtChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  /** null when the channel hides its subscriber count. */
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  uploadsPlaylist: string | null;
};

export type YtVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const u = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", key);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000), next: { revalidate: 900 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type ChannelItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toChannel(it: ChannelItem): YtChannel {
  return {
    channelId: it.id,
    title: it.snippet?.title ?? "",
    handle: it.snippet?.customUrl ?? null,
    avatar: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
    // A hidden subscriber count is unavailable, not zero.
    subscribers: it.statistics?.hiddenSubscriberCount ? null : num(it.statistics?.subscriberCount),
    views: num(it.statistics?.viewCount),
    videoCount: num(it.statistics?.videoCount),
    uploadsPlaylist: it.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

/** Resolve "@handle", a channel URL, or a raw channel id to a channel. */
export async function resolveChannel(input: string): Promise<YtChannel | null> {
  const raw = input.trim();
  let handle = raw.replace(/^@/, "");
  let channelId: string | null = null;

  const urlMatch = /youtube\.com\/(?:(channel)\/([A-Za-z0-9_-]+)|@([A-Za-z0-9._-]+)|(?:c|user)\/([A-Za-z0-9._-]+))/.exec(raw);
  if (urlMatch) {
    if (urlMatch[1] === "channel") channelId = urlMatch[2];
    else handle = urlMatch[3] ?? urlMatch[4] ?? handle;
  } else if (/^UC[A-Za-z0-9_-]{20,}$/.test(raw)) {
    channelId = raw;
  }

  const parts = "snippet,statistics,contentDetails";
  if (channelId) {
    const j = await ytFetch<{ items?: ChannelItem[] }>("channels", { part: parts, id: channelId });
    return j?.items?.[0] ? toChannel(j.items[0]) : null;
  }

  // forHandle is the documented lookup for @handles.
  const byHandle = await ytFetch<{ items?: ChannelItem[] }>("channels", { part: parts, forHandle: handle });
  if (byHandle?.items?.[0]) return toChannel(byHandle.items[0]);

  // Fall back to search when the handle doesn't resolve directly.
  const found = await ytFetch<{ items?: { id?: { channelId?: string } }[] }>("search", {
    part: "snippet", type: "channel", maxResults: "1", q: handle,
  });
  const id = found?.items?.[0]?.id?.channelId;
  if (!id) return null;
  const j = await ytFetch<{ items?: ChannelItem[] }>("channels", { part: parts, id });
  return j?.items?.[0] ? toChannel(j.items[0]) : null;
}

/** Recent uploads with their public statistics. */
export async function recentVideos(uploadsPlaylist: string, max = 10): Promise<YtVideo[]> {
  const list = await ytFetch<{ items?: { contentDetails?: { videoId?: string } }[] }>("playlistItems", {
    part: "contentDetails", playlistId: uploadsPlaylist, maxResults: String(Math.min(50, max)),
  });
  const ids = (list?.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
  if (!ids.length) return [];

  const vids = await ytFetch<{
    items?: {
      id: string;
      snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    }[];
  }>("videos", { part: "snippet,statistics", id: ids.join(",") });

  return (vids?.items ?? []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title ?? "",
    publishedAt: v.snippet?.publishedAt ?? "",
    thumb: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
  }));
}

/** Uploads per week over the window the fetched videos actually span.
 *  null when there aren't enough dated videos to measure honestly. */
export function uploadsPerWeek(videos: YtVideo[]): number | null {
  const times = videos.map((v) => new Date(v.publishedAt).getTime()).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (times.length < 2) return null;
  const spanDays = (times[times.length - 1] - times[0]) / 86400000;
  if (spanDays < 1) return null;
  return (times.length / spanDays) * 7;
}

/** Public engagement rate: (likes + comments) / views × 100, per video, median.
 *  Uses only counts Google returned; null when views are hidden. */
export function publicEngagementRate(videos: YtVideo[]): number | null {
  const rates = videos
    .filter((v) => v.views != null && v.views > 0)
    .map((v) => (((v.likes ?? 0) + (v.comments ?? 0)) / v.views!) * 100);
  if (!rates.length) return null;
  const s = [...rates].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type YtStats = {
  handle: string;
  found: boolean;
  channelId?: string;
  title?: string;
  avatar?: string | null;
  url?: string;
  subscribers?: number | null;
  lifetimeViews?: number | null;
  videoCount?: number | null;
  uploadsPerWeek?: number | null;
  engagementRate?: number | null;
  medianViews?: number | null;
  topVideos?: (YtVideo & { url: string })[];
};

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Everything the UI shows for one tracked channel, from public data only.
 *  One implementation shared by the API route and the server-rendered page. */
export async function channelStats(handle: string): Promise<YtStats> {
  const ch = await resolveChannel(handle);
  if (!ch) return { handle, found: false };
  const vids = ch.uploadsPlaylist ? await recentVideos(ch.uploadsPlaylist, 10) : [];
  return {
    handle,
    found: true,
    channelId: ch.channelId,
    title: ch.title,
    avatar: ch.avatar,
    url: `https://youtube.com/channel/${ch.channelId}`,
    subscribers: ch.subscribers,
    lifetimeViews: ch.views,
    videoCount: ch.videoCount,
    uploadsPerWeek: uploadsPerWeek(vids),
    engagementRate: publicEngagementRate(vids),
    medianViews: medianOf(vids.map((v) => v.views).filter((v): v is number => v != null)),
    topVideos: [...vids]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 3)
      .map((v) => ({ ...v, url: `https://youtube.com/watch?v=${v.videoId}` })),
  };
}
