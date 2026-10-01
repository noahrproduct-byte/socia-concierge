// Reads the connected user's OWN YouTube channel data for the Dashboard and
// Analytics pages, using the OAuth token stored at connect time.
//
//   - channel + video stats  -> youtube.readonly     (channels.list mine=true)
//   - views / watch time / subscribers / demographics -> yt-analytics.readonly
//
// Everything here is the user's own channel only, read-only, and every figure
// is what Google returns; a metric Google omits stays null and renders "—".

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "./youtubeAuth";
import { recentVideos, isoDurationSec, type YtVideo } from "./youtube";
import { activeWorkspaceId, workspacesEnabled } from "./workspaces";
import { readPlatformSnapshots } from "./platformSnapshots";

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type YtDaily = { day: string; views: number; minutes: number; subs: number };
export type YtBar = { label: string; value: number };

export type YouTubeAnalytics = {
  channel: {
    title: string;
    handle: string | null;
    avatar: string | null;
    subscribers: number | null;
    totalViews: number | null;
    videoCount: number | null;
  };
  /** Totals across the selected range. null when the analytics call failed. */
  range: { views: number; minutes: number; subs: number } | null;
  series: YtDaily[];
  topVideos: YtVideo[];
  /** Viewer share by age bucket (male + female summed), when available. */
  demographics: YtBar[];
  /** Viewer share by gender, from the same demographics report. */
  genders: YtBar[];
  /** A human reason when analytics could not be read (auth, api, none yet). */
  note: string | null;
  /** The richer reports the Analytics page uses; null on the light path. */
  deep: YtDeep | null;
};

export type YtDailyExt = { day: string; views: number; minutes: number; subsGained: number; subsLost: number; likes: number; comments: number; shares: number };
export type YtVideoStat = {
  videoId: string;
  views: number;
  minutes: number;
  avgViewDurationSec: number | null;
  avgViewPercentage: number | null;
  likes: number;
  comments: number;
  shares: number;
  subsGained: number;
};
export type YtSlice = { key: string; views: number; minutes: number };

/** Everything beyond the basic panel. Each report is fetched on its own and is
 *  null when YouTube didn't answer — the UI then says "not available" for that
 *  one section instead of guessing. */
export type YtDeep = {
  /** Daily rows over twice the range (current + previous window), oldest first. */
  daily: YtDailyExt[] | null;
  /** Channel-wide average percentage viewed for the current / previous window. */
  avgViewPercentage: { current: number | null; previous: number | null };
  /** Per-video stats inside the range, top 50 by views. */
  videoStats: YtVideoStat[] | null;
  /** Details (title, thumbnail, length, publish date) for the videos in videoStats. */
  videoMeta: Record<string, YtVideo>;
  /** Ids of in-range videos YouTube itself classifies as Shorts; null = YouTube didn't say. */
  shortsIds: string[] | null;
  /** Views / watch time by YouTube's own content type (SHORTS, VIDEO_ON_DEMAND, LIVE_STREAM…). */
  contentTypes: YtSlice[] | null;
  traffic: YtSlice[] | null;
  devices: YtSlice[] | null;
  countries: YtSlice[] | null;
  /** Up to 50 most recent public uploads, with lifetime public stats. */
  uploads: YtVideo[];
};

type ConnRow = {
  channel_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  /** OAuth scopes Google granted at connect time; null on rows from before the column existed. */
  scopes?: string[] | null;
  /** Set when a plan downgrade paused this channel: kept, not read. */
  plan_suspended_at?: string | null;
};

/**
 * The user's connection row with `cols`, also reading scopes and
 * plan_suspended_at when those columns exist (the migrations may not have run
 * yet). Any read error resolves to null: an unreadable row is "not connected",
 * never a guess.
 */
async function readConnRow<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  userId: string,
  cols: string,
): Promise<T | null> {
  // When Brand Workspaces are enabled, a user may hold one channel per
  // workspace; read the active workspace's row. Otherwise the one row per user.
  const wsId = (await workspacesEnabled(supabase)) ? await activeWorkspaceId(supabase, userId) : null;
  const attempts = [`${cols}, scopes, plan_suspended_at`, `${cols}, plan_suspended_at`, cols];
  for (let i = 0; i < attempts.length; i++) {
    try {
      let q = supabase.from("youtube_connections").select(attempts[i]).eq("user_id", userId);
      if (wsId) q = q.eq("workspace_id", wsId);
      const { data, error } = await q.limit(1);
      if (!error) return ((data as unknown as T[] | null) ?? [])[0] ?? null;
      if (i === attempts.length - 1) return null;
    } catch {
      /* pre-migration: retry with fewer columns */
      if (i === attempts.length - 1) return null;
    }
  }
  return null;
}

export type YouTubeAccess = {
  token: string;
  channelId: string | null;
  /** Granted scopes as stored; null when the connection predates scope tracking. */
  scopes: string[] | null;
};

/**
 * A valid access token for the user's connected channel, refreshing and
 * persisting when the stored one is within two minutes of expiry. Returns null
 * when there is no connection at all, or when the channel is paused by a plan
 * downgrade (its data is not read and nothing is published to it).
 * Server only: the token never reaches the browser except inside a YouTube
 * upload session the publish route hands out on purpose.
 */
export async function youtubeAccessToken(supabase: SupabaseClient, userId: string): Promise<YouTubeAccess | null> {
  const row = await readConnRow<ConnRow>(supabase, userId, "channel_id, access_token, refresh_token, token_expires_at");
  if (!row?.access_token) return null;
  if (row.plan_suspended_at != null) return null;
  const scopes = Array.isArray(row.scopes) ? row.scopes : null;

  const expMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (expMs - Date.now() > 120_000) return { token: row.access_token, channelId: row.channel_id, scopes };
  if (!row.refresh_token) return { token: row.access_token, channelId: row.channel_id, scopes };

  const tok = await refreshAccessToken(row.refresh_token);
  if (!tok) return { token: row.access_token, channelId: row.channel_id, scopes };
  // Scope the token write to THIS channel, so refreshing one workspace's
  // YouTube never overwrites another workspace's channel token.
  let uq = supabase
    .from("youtube_connections")
    .update({
      access_token: tok.access_token,
      token_expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      ...(tok.refresh_token && tok.refresh_token !== row.refresh_token ? { refresh_token: tok.refresh_token } : {}),
    })
    .eq("user_id", userId);
  if (row.channel_id) uq = uq.eq("channel_id", row.channel_id);
  await uq.then(() => undefined, () => undefined);
  return { token: tok.access_token, channelId: row.channel_id, scopes };
}

// The analytics readers only need the token and channel.
async function validToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ token: string; channelId: string | null } | null> {
  const a = await youtubeAccessToken(supabase, userId);
  return a ? { token: a.token, channelId: a.channelId } : null;
}

async function getJson(url: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

type ChannelItem = {
  snippet?: { title?: string; customUrl?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

// Rows come back as arrays ordered by columnHeaders; map by header name so we
// never depend on positional ordering.
function rowsByHeader(payload: Record<string, unknown> | null): { headers: string[]; rows: unknown[][] } {
  const headers = Array.isArray(payload?.columnHeaders)
    ? (payload!.columnHeaders as { name?: string }[]).map((h) => h.name ?? "")
    : [];
  const rows = Array.isArray(payload?.rows) ? (payload!.rows as unknown[][]) : [];
  return { headers, rows };
}

type Report = { headers: string[]; rows: unknown[][] };

/** One YouTube Analytics report for the user's own channel, or null on any error. */
async function report(token: string, params: string): Promise<Report | null> {
  const j = await getJson(`${ANALYTICS}?ids=channel==MINE&${params}`, token);
  return j ? rowsByHeader(j) : null;
}

const cell = (r: unknown[], i: number): number => (i >= 0 ? Number(r[i] ?? 0) || 0 : 0);
const cellOrNull = (r: unknown[], i: number): number | null => {
  if (i < 0 || r[i] == null) return null;
  const n = Number(r[i]);
  return Number.isFinite(n) ? n : null;
};

/** Views + watch time split by one dimension (traffic source, device, country, content type). */
async function sliceReport(token: string, range: string, dimension: string, extra = ""): Promise<YtSlice[] | null> {
  const r = await report(token, `${range}&metrics=views,estimatedMinutesWatched&dimensions=${dimension}&sort=-views${extra}`);
  if (!r) return null;
  const iK = r.headers.indexOf(dimension);
  if (iK < 0) return null;
  const iV = r.headers.indexOf("views");
  const iM = r.headers.indexOf("estimatedMinutesWatched");
  return r.rows.map((row) => ({ key: String(row[iK] ?? ""), views: cell(row, iV), minutes: cell(row, iM) })).filter((s) => s.key);
}

type VideoItem = {
  id: string;
  snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

/** Video details by id through the owner's own token (so private and unlisted
 *  uploads resolve too). Missing ids are simply absent. */
async function videosByIds(token: string, ids: string[]): Promise<Record<string, YtVideo>> {
  const out: Record<string, YtVideo> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const j = await getJson(`${DATA}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}`, token);
    for (const v of ((j?.items as VideoItem[] | undefined) ?? [])) {
      out[v.id] = {
        videoId: v.id,
        title: v.snippet?.title ?? "",
        publishedAt: v.snippet?.publishedAt ?? "",
        thumb: v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.medium?.url ?? null,
        views: num(v.statistics?.viewCount),
        likes: num(v.statistics?.likeCount),
        comments: num(v.statistics?.commentCount),
        durationSec: isoDurationSec(v.contentDetails?.duration),
      };
    }
  }
  return out;
}

/** The richer reports for the Analytics page. All requests run in parallel and
 *  fail independently. */
async function fetchDeep(token: string, uploadsPlaylist: string | null, days: number): Promise<YtDeep> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - days * 86400000);
  const wideStart = new Date(end.getTime() - (2 * days + 3) * 86400000);
  const range = `startDate=${ymd(start)}&endDate=${ymd(end)}`;
  const prevRange = `startDate=${ymd(prevStart)}&endDate=${ymd(prevEnd)}`;

  const [dailyR, pctCur, pctPrev, videoR, shortsR, contentTypes, traffic, devices, countries, uploads] = await Promise.all([
    report(token, `startDate=${ymd(wideStart)}&endDate=${ymd(end)}&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares&dimensions=day&sort=day`),
    report(token, `${range}&metrics=averageViewPercentage`),
    report(token, `${prevRange}&metrics=averageViewPercentage`),
    report(token, `${range}&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained&dimensions=video&sort=-views&maxResults=50`),
    report(token, `${range}&metrics=views&dimensions=video&filters=creatorContentType==SHORTS&sort=-views&maxResults=200`),
    sliceReport(token, range, "creatorContentType"),
    sliceReport(token, range, "insightTrafficSourceType"),
    sliceReport(token, range, "deviceType"),
    sliceReport(token, range, "country", "&maxResults=10"),
    uploadsPlaylist ? recentVideos(uploadsPlaylist, 50).catch(() => [] as YtVideo[]) : Promise.resolve([] as YtVideo[]),
  ]);

  let daily: YtDailyExt[] | null = null;
  if (dailyR) {
    const h = dailyR.headers;
    const iDay = h.indexOf("day");
    const ix = { v: h.indexOf("views"), m: h.indexOf("estimatedMinutesWatched"), g: h.indexOf("subscribersGained"), l: h.indexOf("subscribersLost"), li: h.indexOf("likes"), c: h.indexOf("comments"), s: h.indexOf("shares") };
    if (iDay >= 0) {
      daily = dailyR.rows
        .map((r) => ({ day: String(r[iDay] ?? ""), views: cell(r, ix.v), minutes: cell(r, ix.m), subsGained: cell(r, ix.g), subsLost: cell(r, ix.l), likes: cell(r, ix.li), comments: cell(r, ix.c), shares: cell(r, ix.s) }))
        .filter((d) => d.day);
    }
  }

  const pct = (r: Report | null): number | null => (r && r.rows[0] ? cellOrNull(r.rows[0], r.headers.indexOf("averageViewPercentage")) : null);

  let videoStats: YtVideoStat[] | null = null;
  if (videoR) {
    const h = videoR.headers;
    const iId = h.indexOf("video");
    if (iId >= 0) {
      const ix = { v: h.indexOf("views"), m: h.indexOf("estimatedMinutesWatched"), d: h.indexOf("averageViewDuration"), p: h.indexOf("averageViewPercentage"), li: h.indexOf("likes"), c: h.indexOf("comments"), s: h.indexOf("shares"), g: h.indexOf("subscribersGained") };
      videoStats = videoR.rows
        .map((r) => ({ videoId: String(r[iId] ?? ""), views: cell(r, ix.v), minutes: cell(r, ix.m), avgViewDurationSec: cellOrNull(r, ix.d), avgViewPercentage: cellOrNull(r, ix.p), likes: cell(r, ix.li), comments: cell(r, ix.c), shares: cell(r, ix.s), subsGained: cell(r, ix.g) }))
        .filter((v) => v.videoId);
    }
  }
  const videoMeta = videoStats?.length ? await videosByIds(token, videoStats.map((v) => v.videoId)).catch(() => ({} as Record<string, YtVideo>)) : {};

  let shortsIds: string[] | null = null;
  if (shortsR) {
    const iId = shortsR.headers.indexOf("video");
    if (iId >= 0) shortsIds = shortsR.rows.map((r) => String(r[iId] ?? "")).filter(Boolean);
  }

  return { daily, avgViewPercentage: { current: pct(pctCur), previous: pct(pctPrev) }, videoStats, videoMeta, shortsIds, contentTypes, traffic, devices, countries, uploads };
}

/** Everything the YouTube panel shows, for the signed-in user's own channel.
 *  Returns null only when the user has no YouTube connection. Pass
 *  `{ deep: true }` for the Analytics page's richer reports; the Dashboard uses
 *  the light path. */
export async function getYouTubeAnalytics(
  supabase: SupabaseClient,
  userId: string,
  days: number,
  opts: { deep?: boolean } = {},
): Promise<YouTubeAnalytics | null> {
  const auth = await validToken(supabase, userId);
  if (!auth) return null;
  const { token, channelId } = auth;

  // Channel identity + lifetime stats + uploads playlist (youtube.readonly).
  const chJson = await getJson(
    `${DATA}/channels?part=snippet,statistics,contentDetails&mine=true`,
    token,
  );
  const it = (chJson?.items as ChannelItem[] | undefined)?.[0];
  const channel: YouTubeAnalytics["channel"] = {
    title: it?.snippet?.title ?? "Your channel",
    handle: it?.snippet?.customUrl ?? null,
    avatar: it?.snippet?.thumbnails?.medium?.url ?? it?.snippet?.thumbnails?.default?.url ?? null,
    subscribers: it?.statistics?.hiddenSubscriberCount ? null : num(it?.statistics?.subscriberCount),
    totalViews: num(it?.statistics?.viewCount),
    videoCount: num(it?.statistics?.videoCount),
  };
  const uploads = it?.contentDetails?.relatedPlaylists?.uploads ?? null;

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const q = `ids=channel==MINE&startDate=${ymd(start)}&endDate=${ymd(end)}`;

  // Live daily views / watch time / subscribers gained (yt-analytics.readonly).
  const seriesJson = await getJson(
    `${ANALYTICS}?${q}&metrics=views,estimatedMinutesWatched,subscribersGained&dimensions=day&sort=day`,
    token,
  );
  const liveMap = new Map<string, YtDaily>();
  if (seriesJson) {
    const { headers, rows } = rowsByHeader(seriesJson);
    const iDay = headers.indexOf("day");
    const iViews = headers.indexOf("views");
    const iMin = headers.indexOf("estimatedMinutesWatched");
    const iSubs = headers.indexOf("subscribersGained");
    for (const r of rows) {
      const day = String(r[iDay] ?? "");
      if (day) liveMap.set(day, { day, views: Number(r[iViews] ?? 0), minutes: Number(r[iMin] ?? 0), subs: Number(r[iSubs] ?? 0) });
    }
  }

  // Merge with the durable history SOCIA records daily (platform_snapshots):
  // prefer the live value for each day, fall back to the stored one, and when
  // the live call returned nothing at all fall back to stored history entirely
  // so the trend still shows. Both come from YouTube's own Analytics API, so
  // they agree for finalised days; stored only adds resilience and reach.
  const startDay = ymd(start);
  const endDay = ymd(end);
  const storedMap = new Map<string, { views: number | null; minutes: number | null; subs: number | null }>();
  if (channelId) {
    const stored = await readPlatformSnapshots(supabase, userId, "youtube", channelId).catch(() => []);
    for (const r of stored) {
      if (!r.day || r.day < startDay || r.day > endDay) continue;
      storedMap.set(r.day, { views: r.views, minutes: r.watch_time_minutes, subs: r.followers_gained });
    }
  }

  const allDays = Array.from(new Set([...liveMap.keys(), ...storedMap.keys()])).sort();
  const series: YtDaily[] = allDays.map((day) => {
    const lv = liveMap.get(day);
    const st = storedMap.get(day);
    return {
      day,
      views: lv?.views ?? st?.views ?? 0,
      minutes: lv?.minutes ?? st?.minutes ?? 0,
      subs: lv?.subs ?? st?.subs ?? 0,
    };
  });

  let range: YouTubeAnalytics["range"] = null;
  let note: string | null = null;
  if (series.length) {
    range = series.reduce(
      (a, d) => ({ views: a.views + d.views, minutes: a.minutes + d.minutes, subs: a.subs + d.subs }),
      { views: 0, minutes: 0, subs: 0 },
    );
    // Live call failed but SOCIA's recorded history filled the gap.
    if (liveMap.size === 0 && storedMap.size > 0) {
      note = "Showing the history SOCIA has recorded — live YouTube Analytics was unavailable just now.";
    }
  } else {
    // No live data and no stored history yet: say so instead of showing zeros.
    note = "YouTube Analytics has no data for this period yet, or the analytics permission was not granted.";
  }

  // Viewer share by age (sum genders), when the channel has enough data.
  const demoJson = await getJson(
    `${ANALYTICS}?${q}&metrics=viewerPercentage&dimensions=ageGroup,gender&sort=ageGroup`,
    token,
  );
  const demoMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  if (demoJson) {
    const { headers, rows } = rowsByHeader(demoJson);
    const iAge = headers.indexOf("ageGroup");
    const iGender = headers.indexOf("gender");
    const iPct = headers.indexOf("viewerPercentage");
    for (const r of rows) {
      const age = String(r[iAge] ?? "").replace(/^age/, "");
      const pct = Number(r[iPct] ?? 0);
      demoMap.set(age, (demoMap.get(age) ?? 0) + pct);
      if (iGender >= 0) {
        const g = String(r[iGender] ?? "");
        if (g) genderMap.set(g, (genderMap.get(g) ?? 0) + pct);
      }
    }
  }
  const demographics: YtBar[] = [...demoMap.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const GENDER_LABEL: Record<string, string> = { female: "Female", male: "Male", user_specified: "Other" };
  const genders: YtBar[] = [...genderMap.entries()]
    .map(([k, value]) => ({ label: GENDER_LABEL[k] ?? k, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => b.value - a.value);

  // The Analytics page asks for the richer reports; the Dashboard does not.
  if (opts.deep) {
    const deep = await fetchDeep(token, uploads, days);
    return { channel, range, series, topVideos: deep.uploads.slice(0, 6), demographics, genders, note, deep };
  }

  // Recent uploads with public stats (reuses the public-data reader).
  const topVideos = uploads ? await recentVideos(uploads, 6).catch(() => []) : [];

  return { channel, range, series, topVideos, demographics, genders, note, deep: null };
}

/** Lightweight connection check for pages that only need to know it exists.
 *  A channel paused by a plan downgrade counts as not connected. */
export async function hasYouTubeConnection(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const row = await readConnRow<{ user_id: string; plan_suspended_at?: string | null }>(supabase, userId, "user_id");
  return Boolean(row) && row!.plan_suspended_at == null;
}
