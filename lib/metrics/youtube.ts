// YouTube analytics view-model. Turns what YouTube's own APIs return into the
// same kind of intelligence the Instagram page offers — what changed, what's
// working, what to do next — using only real numbers:
//   - daily views / watch time / subscribers / engagement, with the previous
//     period aligned to the LAST DAY YOUTUBE HAS REPORTED (YouTube lags a
//     couple of days; drawing those days as zero would fake a drop)
//   - per-video performance inside the range, against the channel's own median
//   - Shorts vs long-form by YouTube's own classification
//   - where viewers come from, on what, and from where
// A report YouTube didn't return stays null and the page says "not available".
// Pure: the page fetches, this shapes. Every claim is observational.

import { DAY_MS, fmtNum, type Insight, type PostCard, type Series, type SeriesPoint } from "../overview";
import { median } from "../metrics";
import type { TimedPost } from "../postingTimes";
import type { YouTubeAnalytics, YtBar, YtDailyExt, YtSlice } from "../youtubeData";
import type { YtVideo } from "../youtube";

export type YtMetric = "views" | "watch_time" | "subscribers" | "engagement";

export type YtKpi = {
  key: "views" | "watch" | "subs" | "avd";
  label: string;
  value: string;
  note: string;
  status: "ok" | "unavailable" | "collecting";
  delta: string | null;
  positive: boolean | null;
};

export type YtChange = { key: string; label: string; current: string; previous: string | null; delta: string | null; positive: boolean | null };

export type YtVideoRow = {
  id: string;
  title: string;
  thumb: string | null;
  url: string;
  publishedAt: string | null;
  /** YouTube's own classification; null when YouTube didn't say. */
  type: "Short" | "Video" | null;
  durationSec: number | null;
  views: number;
  minutes: number | null;
  avgViewDurationSec: number | null;
  avgViewPct: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subsGained: number | null;
  /** views ÷ the median video in this list; null until five videos exist. */
  multiplier: number | null;
};

export type YtFormatRow = { key: string; label: string; views: number; minutes: number; share: number; videos: number | null; medianViews: number | null };
export type YtShare = { label: string; value: number; share: number };
export type YtWeek = { start: string; end: string; value: number; ratio: number };

export type YouTubeAnalyticsData = {
  channel: YouTubeAnalytics["channel"];
  rangeLabel: string;
  rangeDays: number;
  today: string;
  /** Last day YouTube has reported. Charts end here. */
  lastDay: string | null;
  kpis: YtKpi[];
  series: Record<YtMetric, Series>;
  changes: YtChange[];
  insights: Insight[];
  /** Video cards the insight drawer can show as evidence. */
  evidence: PostCard[];
  nextSteps: string[];
  videos: YtVideoRow[];
  /** "range" = stats inside the selected period; "lifetime" = public totals (fallback). */
  videoBasis: "range" | "lifetime";
  medianViews: number | null;
  formats: YtFormatRow[] | null;
  uploads: { analysed: number; total: number | null; inRange: number; perWeek: number | null };
  timed: TimedPost[];
  audience: { ages: YtBar[]; genders: YtBar[]; countries: YtShare[] | null; devices: YtShare[] | null; traffic: YtShare[] | null };
  subscribers: { now: number | null; gained: number | null; lost: number | null; net: number | null };
  weeks: { median: number | null; growth: YtWeek[]; decline: YtWeek[] };
  note: string | null;
  unavailable: { label: string; why: string }[];
};

// ------------------------------------------------------------- helpers ----

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => dayStr(new Date(new Date(day + "T00:00:00Z").getTime() + n * DAY_MS));
const daysEnding = (last: string, n: number): string[] => Array.from({ length: n }, (_, i) => addDays(last, i - (n - 1)));

/** "4:07" from seconds. */
export function fmtClock(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** "12.4 h" / "310 h" from minutes. */
export function fmtHours(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = minutes / 60;
  return `${h >= 100 ? fmtNum(Math.round(h)) : h.toFixed(h >= 10 ? 0 : 1).replace(/\.0$/, "")} h`;
}
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const pctDelta = (cur: number | null, prev: number | null): { text: string | null; positive: boolean | null; pct: number | null } => {
  if (cur == null || prev == null || prev <= 0) return { text: null, positive: null, pct: null };
  const pct = ((cur - prev) / prev) * 100;
  // A change that rounds to 0.0% is "no change", not an arrow.
  if (Math.abs(pct) < 0.05) return { text: null, positive: null, pct };
  return { text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`, positive: pct >= 0, pct };
};
const short = (t: string, n = 44) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

const TYPE_LABEL: Record<string, string> = { SHORTS: "Shorts", VIDEO_ON_DEMAND: "Videos", LIVE_STREAM: "Live streams", STORY: "Stories", UNSPECIFIED: "Other" };
const TRAFFIC_LABEL: Record<string, string> = {
  YT_SEARCH: "YouTube search", SUBSCRIBER: "Subscriptions & notifications feed", RELATED_VIDEO: "Suggested videos", SHORTS: "Shorts feed",
  YT_CHANNEL: "Your channel page", PLAYLIST: "Playlists", YT_PLAYLIST_PAGE: "Playlist pages", NOTIFICATION: "Notifications",
  EXT_URL: "External sites & apps", NO_LINK_OTHER: "Direct or unknown", NO_LINK_EMBEDDED: "Embedded players", END_SCREEN: "End screens",
  ADVERTISING: "YouTube advertising", YT_OTHER_PAGE: "Other YouTube pages", HASHTAGS: "Hashtag pages", CAMPAIGN_CARD: "Campaign cards",
  ANNOTATION: "Cards & annotations", LIVE_REDIRECT: "Live redirects", SOUND_PAGE: "Sound pages", VIDEO_REMIXES: "Remixes", PROMOTED: "Promoted",
};
const DEVICE_LABEL: Record<string, string> = { MOBILE: "Mobile", DESKTOP: "Computer", TV: "TV", TABLET: "Tablet", GAME_CONSOLE: "Game console", UNKNOWN_PLATFORM: "Other" };
const pretty = (k: string) => k.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function shares(slices: YtSlice[] | null, label: (k: string) => string, top = 8): YtShare[] | null {
  if (!slices) return null;
  const total = slices.reduce((a, s) => a + s.views, 0);
  if (total <= 0) return [];
  return slices.filter((s) => s.views > 0).slice(0, top).map((s) => ({ label: label(s.key), value: s.views, share: s.views / total }));
}

type Totals = { views: number; minutes: number; gained: number; lost: number | null; engagement: number | null };
const totalsOf = (rows: YtDailyExt[], ext: boolean): Totals => ({
  views: rows.reduce((a, r) => a + r.views, 0),
  minutes: rows.reduce((a, r) => a + r.minutes, 0),
  gained: rows.reduce((a, r) => a + r.subsGained, 0),
  lost: ext ? rows.reduce((a, r) => a + r.subsLost, 0) : null,
  engagement: ext ? rows.reduce((a, r) => a + r.likes + r.comments + r.shares, 0) : null,
});

// --------------------------------------------------------------- build ----

export function buildYouTubeAnalytics(input: { yt: YouTubeAnalytics; days: number; rangeLabel: string; now?: Date }): YouTubeAnalyticsData {
  const { yt, days, rangeLabel } = input;
  const now = input.now ?? new Date();
  const today = dayStr(now);
  const deep = yt.deep;
  const uploads: YtVideo[] = deep?.uploads ?? yt.topVideos ?? [];

  // ---- Windows, aligned to the last day YouTube has reported ----
  const ext = Boolean(deep?.daily && deep.daily.length);
  const rows: YtDailyExt[] = ext
    ? deep!.daily!
    : yt.series.map((d) => ({ day: d.day, views: d.views, minutes: d.minutes, subsGained: d.subs, subsLost: 0, likes: 0, comments: 0, shares: 0 }));
  const byDay = new Map(rows.map((r) => [r.day, r]));
  let lastDay: string | null = null;
  if (rows.length) {
    const lastRow = rows[rows.length - 1].day;
    const floor = addDays(today, -3); // YouTube's reporting lag is a couple of days at most
    lastDay = lastRow > floor ? lastRow : floor;
    if (lastDay > today) lastDay = today;
  }
  const ZERO = (day: string): YtDailyExt => ({ day, views: 0, minutes: 0, subsGained: 0, subsLost: 0, likes: 0, comments: 0, shares: 0 });
  const curDays = lastDay ? daysEnding(lastDay, days) : [];
  const prevDays = lastDay && ext ? daysEnding(addDays(lastDay, -days), days) : [];
  // Inside the span YouTube has reported, a missing day is a real zero.
  const cur = curDays.map((d) => byDay.get(d) ?? ZERO(d));
  // The extended report is fetched over twice the range, so the previous window
  // is covered whenever it exists; without it there is no previous period.
  const prev = prevDays.length ? prevDays.map((d) => byDay.get(d) ?? ZERO(d)) : null;
  const hasData = rows.length > 0;
  const tCur = hasData ? totalsOf(cur, ext) : null;
  const tPrev = prev ? totalsOf(prev, ext) : null;

  // ---- Uploads by day (so a chart bar can name what was published) ----
  const uploadsByDay = new Map<string, string[]>();
  for (const v of uploads) {
    if (!v.publishedAt) continue;
    const d = v.publishedAt.slice(0, 10);
    uploadsByDay.set(d, [...(uploadsByDay.get(d) ?? []), v.videoId]);
  }

  // ---- Series ----
  const mk = (label: string, pick: (r: YtDailyExt) => number, available: boolean, note: string, unavailableNote: string): Series => {
    const current: SeriesPoint[] = cur.map((r) => ({ day: r.day, value: available ? pick(r) : null, postIds: uploadsByDay.get(r.day) ?? [] }));
    const previous: SeriesPoint[] = prev && available ? prev.map((r) => ({ day: r.day, value: pick(r), postIds: [] })) : [];
    const sum = (pts: SeriesPoint[]) => pts.reduce((a, p) => a + (p.value ?? 0), 0);
    return {
      // OverviewChart only distinguishes "followers" (a level, drawn as a line);
      // every YouTube series here is a daily flow, drawn as bars.
      metric: "views",
      label,
      provenance: available && hasData ? "platform_daily" : "unavailable",
      note: available && hasData ? note : unavailableNote,
      current,
      previous,
      total: available && hasData ? sum(current) : null,
      prevTotal: previous.length ? sum(previous) : null,
    };
  };
  const lagNote = lastDay && lastDay < today ? ` YouTube reports with a short delay, so the chart ends on ${new Date(lastDay + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.` : "";
  const noData = yt.note ?? "YouTube Analytics returned no data for this period.";
  const series: Record<YtMetric, Series> = {
    views: mk("Views", (r) => r.views, true, `Daily views from YouTube Analytics.${lagNote}`, noData),
    watch_time: mk("Watch time (min)", (r) => r.minutes, true, `Minutes watched per day, from YouTube Analytics.${lagNote}`, noData),
    subscribers: mk("Subscribers gained", (r) => r.subsGained, true, `New subscribers per day (gains only; losses are counted in the net figure).${lagNote}`, noData),
    engagement: mk("Engagement", (r) => r.likes + r.comments + r.shares, ext, `Likes + comments + shares per day, from YouTube Analytics.${lagNote}`, "YouTube didn't return daily likes, comments and shares for this channel."),
  };

  // ---- KPIs ----
  const avd = tCur && tCur.views > 0 ? (tCur.minutes * 60) / tCur.views : null;
  const avdPrev = tPrev && tPrev.views > 0 ? (tPrev.minutes * 60) / tPrev.views : null;
  const net = tCur ? (tCur.lost != null ? tCur.gained - tCur.lost : null) : null;
  const netPrev = tPrev ? (tPrev.lost != null ? tPrev.gained - tPrev.lost : null) : null;
  const vsPrev = `vs. previous ${days} days`;
  const dV = pctDelta(tCur?.views ?? null, tPrev?.views ?? null);
  const dW = pctDelta(tCur?.minutes ?? null, tPrev?.minutes ?? null);
  const dA = pctDelta(avd, avdPrev);
  const subValue = net != null ? net : tCur ? tCur.gained : null;
  const subPrev = net != null ? netPrev : tPrev ? tPrev.gained : null;
  const subDiff = subValue != null && subPrev != null ? subValue - subPrev : null;
  const pctViewed = deep?.avgViewPercentage.current ?? null;
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US")}`;

  const kpis: YtKpi[] = [
    {
      key: "views", label: "Views", value: tCur ? fmtNum(tCur.views) : "—",
      note: tCur ? (dV.text ? vsPrev : rangeLabel.toLowerCase()) : "not returned by YouTube yet",
      status: tCur ? "ok" : "unavailable", delta: dV.text, positive: dV.positive,
    },
    {
      key: "watch", label: "Watch time", value: tCur ? fmtHours(tCur.minutes) : "—",
      note: tCur ? (dW.text ? vsPrev : rangeLabel.toLowerCase()) : "not returned by YouTube yet",
      status: tCur ? "ok" : "unavailable", delta: dW.text, positive: dW.positive,
    },
    {
      key: "subs", label: net != null ? "Net subscribers" : "Subscribers gained", value: subValue != null ? signed(subValue) : "—",
      note: yt.channel.subscribers != null ? `${yt.channel.subscribers.toLocaleString("en-US")} subscribers now` : subValue != null ? rangeLabel.toLowerCase() : "not returned by YouTube yet",
      status: subValue != null ? "ok" : "unavailable",
      delta: subDiff != null && subDiff !== 0 ? `${subDiff > 0 ? "↑" : "↓"} ${Math.abs(subDiff).toLocaleString("en-US")}` : null,
      positive: subDiff != null && subDiff !== 0 ? subDiff > 0 : null,
    },
    {
      key: "avd", label: "Avg view duration", value: fmtClock(avd),
      note: pctViewed != null ? `${pctViewed.toFixed(0)}% of each video watched, on average` : avd != null ? "watch time ÷ views" : "needs views in the period",
      status: avd != null ? "ok" : "unavailable", delta: dA.text, positive: dA.positive,
    },
  ];

  // ---- Per-video rows ----
  const shortsSet = deep?.shortsIds ? new Set(deep.shortsIds) : null;
  let videoBasis: "range" | "lifetime" = "lifetime";
  let videos: YtVideoRow[] = [];
  if (deep?.videoStats && deep.videoStats.length) {
    videoBasis = "range";
    videos = deep.videoStats.map((s) => {
      const m = deep.videoMeta[s.videoId];
      return {
        id: s.videoId,
        title: m?.title || "Video unavailable",
        thumb: m?.thumb ?? null,
        url: `https://www.youtube.com/watch?v=${s.videoId}`,
        publishedAt: m?.publishedAt || null,
        type: shortsSet ? (shortsSet.has(s.videoId) ? "Short" : "Video") : null,
        durationSec: m?.durationSec ?? null,
        views: s.views,
        minutes: s.minutes,
        avgViewDurationSec: s.avgViewDurationSec,
        avgViewPct: s.avgViewPercentage,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        subsGained: s.subsGained,
        multiplier: null,
      };
    });
  } else {
    videos = uploads
      .filter((v) => v.views != null)
      .map((v) => ({
        id: v.videoId, title: v.title, thumb: v.thumb, url: `https://www.youtube.com/watch?v=${v.videoId}`, publishedAt: v.publishedAt || null,
        type: null, durationSec: v.durationSec, views: v.views!, minutes: null, avgViewDurationSec: null, avgViewPct: null,
        likes: v.likes, comments: v.comments, shares: null, subsGained: null, multiplier: null,
      }));
  }
  videos.sort((a, b) => b.views - a.views);
  const medianViews = videos.length ? median(videos.map((v) => v.views)) : null;
  if (videos.length >= 5 && medianViews != null && medianViews > 0) for (const v of videos) v.multiplier = v.views / medianViews;

  // ---- Shorts vs long-form (YouTube's own classification) ----
  let formats: YtFormatRow[] | null = null;
  if (deep?.contentTypes) {
    const total = deep.contentTypes.reduce((a, s) => a + s.views, 0);
    formats = deep.contentTypes
      .filter((s) => s.views > 0)
      .map((s) => {
        const mine = shortsSet && videoBasis === "range" && (s.key === "SHORTS" || s.key === "VIDEO_ON_DEMAND")
          ? videos.filter((v) => (s.key === "SHORTS" ? v.type === "Short" : v.type === "Video"))
          : null;
        return {
          key: s.key, label: TYPE_LABEL[s.key] ?? pretty(s.key), views: s.views, minutes: s.minutes, share: total > 0 ? s.views / total : 0,
          videos: mine ? mine.length : null,
          medianViews: mine && mine.length >= 3 ? median(mine.map((v) => v.views)) : null,
        };
      });
  }

  // ---- Uploads / cadence ----
  const inWindow = (v: YtVideo, d0: string, d1: string) => Boolean(v.publishedAt) && v.publishedAt.slice(0, 10) >= d0 && v.publishedAt.slice(0, 10) <= d1;
  const uploadsCur = curDays.length ? uploads.filter((v) => inWindow(v, curDays[0], curDays[curDays.length - 1])).length : 0;
  const oldestUpload = uploads.map((v) => v.publishedAt?.slice(0, 10)).filter(Boolean).sort()[0] ?? null;
  const haveAllUploads = yt.channel.videoCount != null && uploads.length >= yt.channel.videoCount;
  const prevUploadsKnown = Boolean(prevDays.length && (haveAllUploads || (oldestUpload && oldestUpload <= prevDays[0])));
  const uploadsPrev = prevUploadsKnown ? uploads.filter((v) => inWindow(v, prevDays[0], prevDays[prevDays.length - 1])).length : null;

  // ---- What changed ----
  const changes: YtChange[] = [];
  if (tCur) {
    changes.push({ key: "views", label: "Views", current: fmtNum(tCur.views), previous: tPrev ? fmtNum(tPrev.views) : null, delta: dV.text, positive: dV.positive });
    changes.push({ key: "watch", label: "Watch time", current: fmtHours(tCur.minutes), previous: tPrev ? fmtHours(tPrev.minutes) : null, delta: dW.text, positive: dW.positive });
    if (subValue != null) changes.push({ key: "subs", label: net != null ? "Net subscribers" : "Subscribers gained", current: signed(subValue), previous: subPrev != null ? signed(subPrev) : null, delta: subDiff != null && subDiff !== 0 ? `${subDiff > 0 ? "↑" : "↓"} ${Math.abs(subDiff).toLocaleString("en-US")}` : null, positive: subDiff != null && subDiff !== 0 ? subDiff > 0 : null });
    changes.push({ key: "avd", label: "Avg view duration", current: fmtClock(avd), previous: avdPrev != null ? fmtClock(avdPrev) : null, delta: dA.text, positive: dA.positive });
    if (tCur.engagement != null) {
      const dE = pctDelta(tCur.engagement, tPrev?.engagement ?? null);
      changes.push({ key: "eng", label: "Likes, comments & shares", current: fmtNum(tCur.engagement), previous: tPrev?.engagement != null ? fmtNum(tPrev.engagement) : null, delta: dE.text, positive: dE.positive });
    }
    const dU = uploadsPrev != null ? uploadsCur - uploadsPrev : null;
    changes.push({ key: "uploads", label: "Videos published", current: String(uploadsCur), previous: uploadsPrev != null ? String(uploadsPrev) : null, delta: dU != null && dU !== 0 ? `${dU > 0 ? "↑" : "↓"} ${Math.abs(dU)}` : null, positive: dU != null && dU !== 0 ? dU > 0 : null });
  }

  // ---- Evidence cards (reuse the PostCard shape the insight drawer renders) ----
  const evidence: PostCard[] = videos.map((v) => ({
    id: v.id, title: v.title, caption: v.title, published: v.publishedAt ?? "", format: v.type ?? "Video", platform: "youtube", isVideo: true,
    views: v.views, reach: null, likes: v.likes, comments: v.comments, saves: null, shares: v.shares,
    engagements: (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), multiplier: v.multiplier, thumb: v.thumb, permalink: v.url,
  }));

  // ---- Insights (each one a comparison of two real numbers) ----
  const insights: Insight[] = [];
  const basisWords = videoBasis === "range" ? `in the ${rangeLabel.toLowerCase()}` : "lifetime";

  const top = videos[0];
  if (top && top.multiplier != null && top.multiplier >= 3 && medianViews) {
    insights.push({
      id: "breakout", kind: "outlier", tone: "up", tag: "Breakout video", action: { label: "See videos", tab: "content" },
      title: `“${short(top.title)}” earned ${fmtMult(top.multiplier)} your typical video's views`,
      body: `${fmtNum(top.views)} views ${basisWords}, against a median of ${fmtNum(Math.round(medianViews))} across ${videos.length} videos.`,
      observed: [`“${short(top.title, 60)}”: ${top.views.toLocaleString("en-US")} views ${basisWords}`, `Median video: ${Math.round(medianViews).toLocaleString("en-US")} views (${videos.length} videos)`],
      interpretation: "A video this far above your median was shown well beyond your usual audience. Its topic, title and thumbnail are the likeliest reasons; one video can't prove which, so treat it as a pattern to test rather than a conclusion.",
      recommendation: `Make a follow-up on the same topic and packaging as “${short(top.title, 40)}”, then compare it against your ${fmtNum(Math.round(medianViews))}-view median.`,
      postIds: [top.id],
      planNote: `Follow up “${short(top.title, 40)}” (${fmtMult(top.multiplier)} my median views).`,
    });
  }

  const shortsRow = formats?.find((f) => f.key === "SHORTS");
  const longRow = formats?.find((f) => f.key === "VIDEO_ON_DEMAND");
  if (shortsRow && longRow && shortsRow.medianViews != null && longRow.medianViews != null && longRow.medianViews > 0 && shortsRow.medianViews > 0) {
    const ratio = shortsRow.medianViews / longRow.medianViews;
    if (ratio >= 1.3 || ratio <= 1 / 1.3) {
      const win = ratio >= 1 ? shortsRow : longRow, lose = ratio >= 1 ? longRow : shortsRow;
      const r = ratio >= 1 ? ratio : 1 / ratio;
      insights.push({
        id: "format", kind: "format", tone: "up", tag: "Format", action: { label: "Compare formats", tab: "content" },
        title: `Your ${win.label} are earning ${fmtMult(r)} the median views of your ${lose.label.toLowerCase()}`,
        body: `Median ${fmtNum(Math.round(win.medianViews!))} views across ${win.videos} ${win.label.toLowerCase()} vs ${fmtNum(Math.round(lose.medianViews!))} across ${lose.videos} ${lose.label.toLowerCase()}, ${rangeLabel.toLowerCase()}.`,
        observed: [`${win.label}: median ${Math.round(win.medianViews!).toLocaleString("en-US")} views (${win.videos} videos)`, `${lose.label}: median ${Math.round(lose.medianViews!).toLocaleString("en-US")} views (${lose.videos} videos)`, `${shortsRow.label} drove ${Math.round(shortsRow.share * 100)}% of all views in the period`],
        interpretation: "In this period one format travelled further per video. Views are not the same as watch time or subscribers, and the sample is small, so check those before shifting your mix.",
        recommendation: `Weight the next few uploads toward ${win.label.toLowerCase()} and re-check median views, watch time and subscribers gained per format.`,
        postIds: videos.filter((v) => (win.key === "SHORTS" ? v.type === "Short" : v.type === "Video")).slice(0, 3).map((v) => v.id),
        planNote: `${win.label} earn ${fmtMult(r)} the median views of my ${lose.label.toLowerCase()}.`,
      });
    }
  } else if (formats && formats.length >= 2 && formats[0].share >= 0.6) {
    const f = [...formats].sort((a, b) => b.share - a.share)[0];
    insights.push({
      id: "format", kind: "format", tone: "info", tag: "Format", action: { label: "Compare formats", tab: "content" },
      title: `${f.label} drove ${Math.round(f.share * 100)}% of your views this period`,
      body: `${fmtNum(f.views)} of ${fmtNum(formats.reduce((a, x) => a + x.views, 0))} views, by YouTube's own content-type classification.`,
      observed: formats.map((x) => `${x.label}: ${x.views.toLocaleString("en-US")} views (${Math.round(x.share * 100)}%), ${fmtHours(x.minutes)} watched`),
      interpretation: "This is where the views came from, not proof of which format is better: a format with more uploads will naturally collect more views. Compare watch time alongside it.",
      recommendation: "Check watch time per format on the Content tab before changing your mix.",
      postIds: [], planNote: `${f.label} drove ${Math.round(f.share * 100)}% of views.`,
    });
  }

  if (dV.pct != null && Math.abs(dV.pct) >= 20 && tPrev && tPrev.views >= 50 && tCur) {
    const up = dV.pct > 0;
    insights.push({
      id: "trend", kind: "trend", tone: up ? "up" : "down", tag: up ? "Views up" : "Views down", action: { label: "See growth", tab: "growth" },
      title: `Views are ${up ? "up" : "down"} ${Math.abs(dV.pct).toFixed(0)}% vs the previous ${days} days`,
      body: `${fmtNum(tCur.views)} views against ${fmtNum(tPrev.views)}.`,
      observed: [`This period: ${tCur.views.toLocaleString("en-US")} views`, `Previous ${days} days: ${tPrev.views.toLocaleString("en-US")} views`, `Videos published: ${uploadsCur}${uploadsPrev != null ? ` vs ${uploadsPrev}` : ""}`],
      interpretation: up ? "More views than the period before. If you also published more, part of the lift is simply volume — the Content tab shows which videos carried it." : "Fewer views than the period before. Check whether you published less, or whether recent videos are landing below your median.",
      recommendation: up ? "Look at which videos carried the lift and make more in that direction." : "Compare your recent uploads against your median on the Content tab and revisit the topics that worked before.",
      postIds: videos.slice(0, 3).map((v) => v.id),
      planNote: `Views ${up ? "up" : "down"} ${Math.abs(dV.pct).toFixed(0)}% vs previous period.`,
    });
  }

  if (net != null && netPrev != null && net !== netPrev && Math.abs(net - netPrev) >= Math.max(3, Math.abs(netPrev) * 0.25)) {
    const up = net > netPrev;
    insights.push({
      id: "subs", kind: "trend", tone: up ? "up" : "down", tag: "Subscribers", action: { label: "See growth", tab: "growth" },
      title: `You gained ${signed(net)} net subscribers, ${up ? "up" : "down"} from ${signed(netPrev)} the previous period`,
      body: `${tCur!.gained.toLocaleString("en-US")} gained and ${tCur!.lost!.toLocaleString("en-US")} lost in the ${rangeLabel.toLowerCase()}.`,
      observed: [`This period: +${tCur!.gained.toLocaleString("en-US")} gained, −${tCur!.lost!.toLocaleString("en-US")} lost (net ${signed(net)})`, `Previous ${days} days: net ${signed(netPrev)}`],
      interpretation: "Net subscribers is gains minus losses as YouTube reports them. It moved between the two periods; the videos that gained the most subscribers are listed on the Content tab.",
      recommendation: up ? "Find the videos with the most subscribers gained and repeat what they did in the first 30 seconds." : "Check which videos gained subscribers before, and whether recent uploads moved away from those topics.",
      postIds: [...videos].filter((v) => v.subsGained != null).sort((a, b) => (b.subsGained ?? 0) - (a.subsGained ?? 0)).slice(0, 3).map((v) => v.id),
      planNote: `Net subscribers ${signed(net)} vs ${signed(netPrev)} the period before.`,
    });
  }

  // Retention: long-form only, against the median of the OTHER long-form
  // videos. Shorts always score high on percentage viewed, so mixing them in
  // would crown a Short every time and say nothing useful.
  if (videoBasis === "range" && medianViews != null) {
    const isLong = (v: YtVideoRow) => (v.type != null ? v.type === "Video" : v.durationSec != null && v.durationSec > 180);
    const longs = videos.filter((v) => v.avgViewPct != null && isLong(v));
    const held = longs.filter((v) => v.views >= medianViews).sort((a, b) => b.avgViewPct! - a.avgViewPct!)[0];
    const others = held ? longs.filter((v) => v.id !== held.id) : [];
    const typical = others.length >= 3 ? median(others.map((v) => v.avgViewPct!)) : null;
    if (held && typical != null && typical > 0 && held.avgViewPct! >= typical * 1.3) {
      insights.push({
        id: "retention", kind: "window", tone: "info", tag: "Retention", action: { label: "See videos", tab: "content" },
        title: `“${short(held.title)}” held viewers for ${held.avgViewPct!.toFixed(0)}% of its length`,
        body: `Your other long-form videos typically hold ${typical.toFixed(0)}% in the ${rangeLabel.toLowerCase()}.`,
        observed: [`“${short(held.title, 60)}”: ${held.avgViewPct!.toFixed(0)}% average percentage viewed, ${held.views.toLocaleString("en-US")} views`, `Median of your other ${others.length} long-form videos: ${typical.toFixed(0)}% viewed`],
        interpretation: "People stayed with this video noticeably longer than with your other long-form videos. Length still matters — a shorter video is easier to finish — so compare it with videos of similar length.",
        recommendation: `Re-watch the opening and pacing of “${short(held.title, 40)}” and reuse that structure in your next video of similar length.`,
        postIds: [held.id],
        planNote: `“${short(held.title, 40)}” held ${held.avgViewPct!.toFixed(0)}% vs ${typical.toFixed(0)}% for my other long-form videos.`,
      });
    }
  }

  if (uploadsPrev != null && uploadsPrev > 0 && uploadsCur / uploadsPrev <= 0.6) {
    insights.push({
      id: "cadence", kind: "cadence", tone: "down", tag: "Cadence", action: { label: "See videos", tab: "content" },
      title: `You published ${uploadsCur} video${uploadsCur === 1 ? "" : "s"}, down from ${uploadsPrev} the previous period`,
      body: `Uploads in the ${rangeLabel.toLowerCase()} vs the ${days} days before.`,
      observed: [`This period: ${uploadsCur} uploads`, `Previous ${days} days: ${uploadsPrev} uploads`],
      interpretation: "Fewer uploads means fewer chances for YouTube to test your videos with new viewers; views usually follow cadence with a lag.",
      recommendation: `Get back to roughly ${uploadsPrev} uploads per ${days} days; the Calendar can schedule them.`,
      postIds: [], planNote: `Uploads fell to ${uploadsCur} from ${uploadsPrev}.`,
    });
  }

  const traffic = shares(deep?.traffic ?? null, (k) => TRAFFIC_LABEL[k] ?? pretty(k));
  if (traffic && traffic[0] && traffic[0].share >= 0.5) {
    insights.push({
      id: "traffic", kind: "trend", tone: "info", tag: "Discovery", action: { label: "See audience", tab: "audience" },
      title: `${Math.round(traffic[0].share * 100)}% of your views came from ${traffic[0].label}`,
      body: `${fmtNum(traffic[0].value)} views in the ${rangeLabel.toLowerCase()}, by YouTube's traffic-source report.`,
      observed: traffic.slice(0, 4).map((t) => `${t.label}: ${t.value.toLocaleString("en-US")} views (${Math.round(t.share * 100)}%)`),
      interpretation: "This is how viewers reached your videos. A channel that leans on one source is exposed if that source slows down.",
      recommendation: "Keep serving the source that works, and test one video aimed at your second-largest source.",
      postIds: [], planNote: `${Math.round(traffic[0].share * 100)}% of views from ${traffic[0].label}.`,
    });
  }

  // ---- Growth / decline weeks (complete 7-day blocks ending on lastDay) ----
  const weekBlocks: YtWeek[] = [];
  for (let endIdx = cur.length; endIdx - 7 >= 0; endIdx -= 7) {
    const block = cur.slice(endIdx - 7, endIdx);
    weekBlocks.unshift({ start: block[0].day, end: block[6].day, value: block.reduce((a, r) => a + r.views, 0), ratio: 1 });
  }
  const weekMedian = weekBlocks.length >= 4 ? median(weekBlocks.map((w) => w.value)) : null;
  const weeks = weekMedian != null && weekMedian > 0
    ? {
        median: weekMedian,
        growth: weekBlocks.map((w) => ({ ...w, ratio: w.value / weekMedian })).filter((w) => w.ratio >= 1.5),
        decline: weekBlocks.map((w) => ({ ...w, ratio: w.value / weekMedian })).filter((w) => w.ratio <= 0.6),
      }
    : { median: null, growth: [], decline: [] };

  // ---- Posting times: each upload's public views against the channel median ----
  const timed: TimedPost[] = uploads.filter((v) => v.publishedAt && v.views != null).map((v) => ({ id: v.videoId, t: v.publishedAt, e: v.views!, format: "Video" }));

  // ---- Honest "not available" list ----
  const unavailable: { label: string; why: string }[] = [
    { label: "Thumbnail impressions & click-through rate", why: "YouTube shows these in YouTube Studio but doesn't provide them through its Analytics API." },
    { label: "Subscriber-count history", why: "YouTube's API reports subscribers gained and lost per day, not the running total on past dates." },
  ];
  if (deep && deep.videoStats == null) unavailable.push({ label: "Per-video stats for this period", why: "YouTube didn't return the per-video report, so the video list shows lifetime public totals instead." });
  if (deep && deep.contentTypes == null) unavailable.push({ label: "Shorts vs long-form split", why: "YouTube didn't return its content-type report for this channel." });

  return {
    channel: yt.channel,
    rangeLabel,
    rangeDays: days,
    today,
    lastDay,
    kpis,
    series,
    changes,
    insights,
    evidence,
    nextSteps: insights.slice(0, 3).map((i) => i.recommendation),
    videos,
    videoBasis,
    medianViews,
    formats,
    uploads: { analysed: uploads.length, total: yt.channel.videoCount, inRange: uploadsCur, perWeek: curDays.length ? uploadsCur / (days / 7) : null },
    timed,
    audience: {
      ages: yt.demographics,
      genders: yt.genders ?? [],
      countries: shares(deep?.countries ?? null, countryName, 10),
      devices: shares(deep?.devices ?? null, (k) => DEVICE_LABEL[k] ?? pretty(k)),
      traffic,
    },
    subscribers: { now: yt.channel.subscribers, gained: tCur?.gained ?? null, lost: tCur?.lost ?? null, net },
    weeks,
    note: yt.note,
    unavailable,
  };
}
