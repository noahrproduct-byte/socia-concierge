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
import { recentVideos, type YtVideo } from "./youtube";

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
  /** A human reason when analytics could not be read (auth, api, none yet). */
  note: string | null;
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
  const attempts = [`${cols}, scopes, plan_suspended_at`, `${cols}, plan_suspended_at`, cols];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const { data, error } = await supabase
        .from("youtube_connections")
        .select(attempts[i])
        .eq("user_id", userId)
        .maybeSingle();
      if (!error) return (data as T | null) ?? null;
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
  await supabase
    .from("youtube_connections")
    .update({
      access_token: tok.access_token,
      token_expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      ...(tok.refresh_token && tok.refresh_token !== row.refresh_token ? { refresh_token: tok.refresh_token } : {}),
    })
    .eq("user_id", userId)
    .then(() => undefined, () => undefined);
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

/** Everything the YouTube panel shows, for the signed-in user's own channel.
 *  Returns null only when the user has no YouTube connection. */
export async function getYouTubeAnalytics(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<YouTubeAnalytics | null> {
  const auth = await validToken(supabase, userId);
  if (!auth) return null;
  const { token } = auth;

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

  // Daily views / watch time / subscribers gained (yt-analytics.readonly).
  const seriesJson = await getJson(
    `${ANALYTICS}?${q}&metrics=views,estimatedMinutesWatched,subscribersGained&dimensions=day&sort=day`,
    token,
  );
  let series: YtDaily[] = [];
  let range: YouTubeAnalytics["range"] = null;
  let note: string | null = null;
  if (seriesJson) {
    const { headers, rows } = rowsByHeader(seriesJson);
    const iDay = headers.indexOf("day");
    const iViews = headers.indexOf("views");
    const iMin = headers.indexOf("estimatedMinutesWatched");
    const iSubs = headers.indexOf("subscribersGained");
    series = rows.map((r) => ({
      day: String(r[iDay] ?? ""),
      views: Number(r[iViews] ?? 0),
      minutes: Number(r[iMin] ?? 0),
      subs: Number(r[iSubs] ?? 0),
    }));
    range = series.reduce(
      (a, d) => ({ views: a.views + d.views, minutes: a.minutes + d.minutes, subs: a.subs + d.subs }),
      { views: 0, minutes: 0, subs: 0 },
    );
  } else {
    // Analytics can be empty for a channel with no recent activity, or blocked
    // if the analytics scope was not granted. Say so instead of showing zeros.
    note = "YouTube Analytics has no data for this period yet, or the analytics permission was not granted.";
  }

  // Viewer share by age (sum genders), when the channel has enough data.
  const demoJson = await getJson(
    `${ANALYTICS}?${q}&metrics=viewerPercentage&dimensions=ageGroup,gender&sort=ageGroup`,
    token,
  );
  const demoMap = new Map<string, number>();
  if (demoJson) {
    const { headers, rows } = rowsByHeader(demoJson);
    const iAge = headers.indexOf("ageGroup");
    const iPct = headers.indexOf("viewerPercentage");
    for (const r of rows) {
      const age = String(r[iAge] ?? "").replace(/^age/, "");
      const pct = Number(r[iPct] ?? 0);
      demoMap.set(age, (demoMap.get(age) ?? 0) + pct);
    }
  }
  const demographics: YtBar[] = [...demoMap.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Recent uploads with public stats (reuses the public-data reader).
  const topVideos = uploads ? await recentVideos(uploads, 6).catch(() => []) : [];

  return { channel, range, series, topVideos, demographics, note };
}

/** Lightweight connection check for pages that only need to know it exists.
 *  A channel paused by a plan downgrade counts as not connected. */
export async function hasYouTubeConnection(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const row = await readConnRow<{ user_id: string; plan_suspended_at?: string | null }>(supabase, userId, "user_id");
  return Boolean(row) && row!.plan_suspended_at == null;
}
