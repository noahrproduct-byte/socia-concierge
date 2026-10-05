// Facebook analytics view-model — everything SOCIA can honestly say about a
// Page, built to the same standard as the Instagram and YouTube pages:
//   - followers: the current count, SOCIA's own daily snapshots (a real level
//     over time), and — with read_insights — Facebook's daily follows and
//     unfollows (so NET follows, not just gains)
//   - Page views / video views per day from Page Insights (read_insights),
//     with the previous period for comparison
//   - every post against the Page's own median: top, weakest and breakout
//     posts, the reactions / comments / shares mix, posting cadence and times
//   - what Facebook no longer exposes (reach / impressions, retired by Meta)
//     and what it never did (audience age / gender), stated plainly
// Post engagement is drawn on the day a post was PUBLISHED — content totals as
// bars, never passed off as a daily activity series. null is never coerced to 0.
//
// Pure: the page fetches, this shapes.

import { DAY_MS, fmtNum, type Insight, type PostCard, type Series, type SeriesPoint } from "../overview";
import { median } from "../metrics";
import { followerPoints as toFollowerPoints, type FollowerPoint } from "../followers";
import type { TimedPost } from "../postingTimes";
import { FB_POST_LIMIT, FB_REACTIONS, type FbPost, type FbReaction, type FbSnapshot } from "../facebookSync";
import type { PlatformSnapshotRow } from "../platformSnapshots";
import type { FbInsightPoint, FbInsights } from "../facebookInsights";

const dayList = (end: Date, days: number): string[] =>
  Array.from({ length: days }, (_, i) => new Date(end.getTime() - (days - i) * DAY_MS).toISOString().slice(0, 10));

const fmtDate = (day: string) =>
  new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Reactions + comments + shares on a post, or null when Facebook returned none
 *  of them (e.g. pages_read_user_content not granted) — never a guessed 0. */
export function fbPostEngagement(p: FbPost): number | null {
  const parts = [p.reactions, p.comments, p.shares].filter((v): v is number => v != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

export type FbKpi = {
  key: "followers" | "views" | "engagement" | "posts" | "avg";
  label: string;
  value: string;
  note: string;
  status: "ok" | "unavailable" | "collecting";
  delta: string | null;
  positive: boolean | null;
};

export type FbChange = { key: string; label: string; current: string; previous: string | null; delta: string | null; positive: boolean | null };

export type FbPostRow = {
  id: string;
  title: string;
  permalink: string | null;
  thumb: string | null;
  published: string;
  hasImage: boolean;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number | null;
  /** engagement ÷ the Page's median post; null until five posts have counts. */
  multiplier: number | null;
};

export type FbMix = {
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  /** Reactions by type, when Facebook returned the breakdown. */
  types: { key: FbReaction; label: string; value: number }[] | null;
};

export type FbWeek = { start: string; end: string; value: number; ratio: number };

export type FacebookAnalyticsData = {
  page: { name: string | null; username: string | null; avatar: string | null };
  status: FbSnapshot["status"];
  rangeLabel: string;
  rangeDays: number;
  today: string;
  kpis: FbKpi[];
  /** Follower level from SOCIA's own daily snapshots (a line). */
  followers: Series;
  /** Per-post engagement by publish date (bars). */
  engagement: Series;
  /** Page views per day from Facebook Insights; null until read_insights works. */
  views: Series | null;
  /** New follows per day from Facebook Insights; null until read_insights works. */
  follows: Series | null;
  videoViews: number | null;
  newFollows: number | null;
  unfollows: number | null;
  /** follows − unfollows, when Facebook returned both. */
  netFollows: number | null;
  insightsAvailable: boolean;
  changes: FbChange[];
  insights: Insight[];
  evidence: PostCard[];
  nextSteps: string[];
  posts: FbPostRow[];
  medianEngagement: number | null;
  mix: FbMix;
  publishing: { inRange: number; perWeek: number | null; analysed: number; capped: boolean };
  timed: TimedPost[];
  followerPoints: FollowerPoint[];
  followerStats: { now: number | null; net: number | null; growthPct: number | null; days: number; firstDay: string | null };
  weeks: { median: number | null; growth: FbWeek[]; decline: FbWeek[] };
  unavailable: { label: string; why: string }[];
  postsInRange: number;
};

const REACTION_LABEL: Record<FbReaction, string> = { like: "Like", love: "Love", care: "Care", haha: "Haha", wow: "Wow", sad: "Sad", angry: "Angry" };
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const short = (t: string, n = 44) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US")}`;
const pctDelta = (cur: number | null, prev: number | null): { text: string | null; positive: boolean | null; pct: number | null } => {
  if (cur == null || prev == null || prev <= 0) return { text: null, positive: null, pct: null };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return { text: null, positive: null, pct };
  return { text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`, positive: pct >= 0, pct };
};
const diffDelta = (cur: number | null, prev: number | null): { text: string | null; positive: boolean | null } => {
  if (cur == null || prev == null || cur === prev) return { text: null, positive: null };
  return { text: `${cur > prev ? "↑" : "↓"} ${Math.abs(cur - prev).toLocaleString("en-US")}`, positive: cur > prev };
};
const titleOf = (p: FbPost) => (p.message ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 80) || "(no caption)";

export function buildFacebookAnalytics(input: {
  snap: FbSnapshot;
  snapshots: PlatformSnapshotRow[];
  days: number;
  rangeLabel: string;
  now?: Date;
  /** Page Insights over twice the range, when the page fetched them (read_insights). */
  insights?: FbInsights | null;
}): FacebookAnalyticsData {
  const { snap, snapshots, days, rangeLabel } = input;
  const ins = input.insights ?? null;
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const curDays = dayList(end, days);
  const prevDays = dayList(new Date(end.getTime() - days * DAY_MS), days);
  const inCur = (day: string) => day >= curDays[0] && day <= curDays[curDays.length - 1];
  const inPrev = (day: string) => day >= prevDays[0] && day <= prevDays[prevDays.length - 1];

  const sum = (pts: SeriesPoint[]): number | null => {
    const v = pts.map((p) => p.value).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const lastVal = (pts: SeriesPoint[]): number | null => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value != null) return pts[i].value;
    return null;
  };

  // ---- Followers: SOCIA's own daily snapshots ----
  const byDay = new Map(snapshots.map((r) => [r.day, r.followers]));
  const followerPts: SeriesPoint[] = curDays.map((d) => ({ day: d, value: byDay.has(d) ? byDay.get(d)! ?? null : null, postIds: [] }));
  const prevFollowerPts: SeriesPoint[] = prevDays.map((d) => ({ day: d, value: byDay.has(d) ? byDay.get(d)! ?? null : null, postIds: [] }));
  const haveFollowerHistory = followerPts.some((p) => p.value != null);
  const allFollowerPoints = toFollowerPoints(snapshots);
  const firstDay = allFollowerPoints[0]?.day ?? null;
  const followers: Series = {
    metric: "followers",
    label: "Followers",
    provenance: haveFollowerHistory ? "snapshot" : "unavailable",
    note: firstDay
      ? `Your Facebook follower count, recorded by SOCIA once a day since ${fmtDate(firstDay)}. Facebook doesn't provide earlier daily history.`
      : "SOCIA records your Facebook follower count once a day — the trend builds from here. Facebook doesn't provide past daily history.",
    current: followerPts,
    previous: prevFollowerPts,
    total: lastVal(followerPts),
    prevTotal: lastVal(prevFollowerPts),
  };
  const rangePts = allFollowerPoints.filter((p) => inCur(p.day));
  const followerNet = rangePts.length >= 2 ? rangePts[rangePts.length - 1].followers - rangePts[0].followers : null;
  const followerStats = {
    now: snap.followers_count,
    net: followerNet,
    growthPct: followerNet != null && rangePts[0].followers > 0 ? (followerNet / rangePts[0].followers) * 100 : null,
    days: allFollowerPoints.length,
    firstDay,
  };

  // ---- Posts ----
  const posts = (snap.posts ?? [])
    .filter((p) => p.created_time)
    .sort((a, b) => new Date(b.created_time!).getTime() - new Date(a.created_time!).getTime());
  const dayOf = (p: FbPost) => new Date(p.created_time!).toISOString().slice(0, 10);
  const oldestPostDay = posts.length ? dayOf(posts[posts.length - 1]) : null;
  // The previous period is only comparable when the fetched posts reach back
  // across it (or we hold every post the Page has).
  const prevCovered = posts.length > 0 && (posts.length < FB_POST_LIMIT || (oldestPostDay != null && oldestPostDay <= prevDays[0]));
  const postsCur = posts.filter((p) => inCur(dayOf(p)));
  const postsPrev = prevCovered ? posts.filter((p) => inPrev(dayOf(p))) : null;

  // ---- Per-post engagement by publish date (content totals, drawn as bars) ----
  const byPubDay = new Map<string, { value: number; ids: string[] }>();
  for (const p of posts) {
    const e = fbPostEngagement(p);
    if (e == null) continue;
    const d = dayOf(p);
    const cur = byPubDay.get(d) ?? { value: 0, ids: [] };
    cur.value += e;
    if (p.id) cur.ids.push(p.id);
    byPubDay.set(d, cur);
  }
  const engPoint = (d: string): SeriesPoint => ({ day: d, value: byPubDay.has(d) ? byPubDay.get(d)!.value : null, postIds: byPubDay.get(d)?.ids ?? [] });
  const engPts = curDays.map(engPoint);
  const engPrevPts = prevCovered ? prevDays.map(engPoint) : [];
  const anyEng = posts.some((p) => fbPostEngagement(p) != null);
  const engagement: Series = {
    metric: "engagement",
    label: "Engagement",
    provenance: anyEng ? "publish_totals" : "unavailable",
    note: anyEng
      ? "Reactions + comments + shares on each Facebook post, placed on the day it was published."
      : "Reactions and comments need the pages_read_user_content permission — reconnect Facebook to fill these in.",
    current: engPts,
    previous: engPrevPts,
    total: sum(engPts),
    prevTotal: engPrevPts.length ? sum(engPrevPts) ?? 0 : null,
  };

  // ---- Page Insights (read_insights): daily series over both windows ----
  // Facebook reports a day once it has ended, so "today" is never in the data.
  // Both windows are aligned to the LAST DAY FACEBOOK REPORTED; comparing a
  // window that ends today with a full previous one would bake in a fake drop.
  const mapOf = (pts: FbInsightPoint[] | null | undefined) => (pts ? new Map(pts.map((p) => [p.day, p.value])) : null);
  const allInsightDays = [ins?.views, ins?.videoViews, ins?.dailyFollows, ins?.dailyUnfollows].flatMap((s) => (s ?? []).map((p) => p.day)).filter((d) => d <= today);
  const lastInsightDay = allInsightDays.length ? allInsightDays.reduce((a, b) => (a > b ? a : b)) : null;
  const daysEnding = (last: string, n: number): string[] => {
    const t = new Date(last + "T00:00:00Z").getTime();
    return Array.from({ length: n }, (_, i) => new Date(t - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
  };
  const insCur = lastInsightDay ? daysEnding(lastInsightDay, days) : curDays;
  const insPrev = lastInsightDay ? daysEnding(insCur[0], days + 1).slice(0, days) : prevDays;
  const windowSum = (m: Map<string, number> | null, daysIn: string[]): number | null => {
    if (!m) return null;
    const vals = daysIn.filter((d) => m.has(d)).map((d) => m.get(d)!);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const insightSeries = (m: Map<string, number> | null, label: string, note: string, emptyNote: string): Series | null => {
    if (!m) return null;
    const current: SeriesPoint[] = insCur.map((d) => ({ day: d, value: m.has(d) ? m.get(d)! : null, postIds: byPubDay.get(d)?.ids ?? [] }));
    const prevRaw: SeriesPoint[] = insPrev.map((d) => ({ day: d, value: m.has(d) ? m.get(d)! : null, postIds: [] }));
    const has = current.some((p) => p.value != null);
    const hasPrev = prevRaw.some((p) => p.value != null);
    return {
      // Drawn as bars: a daily flow, not a level.
      metric: "views",
      label,
      provenance: has ? "platform_daily" : "unavailable",
      note: has ? note : emptyNote,
      current,
      previous: hasPrev ? prevRaw : [],
      total: has ? sum(current) : null,
      prevTotal: hasPrev ? sum(prevRaw) : null,
    };
  };
  const viewsMap = mapOf(ins?.views);
  const followsMap = mapOf(ins?.dailyFollows);
  const unfollowsMap = mapOf(ins?.dailyUnfollows);
  const videoMap = mapOf(ins?.videoViews);
  const lagNote = lastInsightDay && lastInsightDay < today ? ` Facebook reports a day once it has ended, so the chart ends on ${fmtDate(lastInsightDay)}.` : "";
  const views = insightSeries(viewsMap, "Views", `Page views per day, from Facebook Page Insights.${lagNote}`, "Facebook Insights returned no Page views for this period.");
  const follows = insightSeries(followsMap, "New follows", `New follows per day, from Facebook Page Insights (gains only; unfollows are counted in the net figure).${lagNote}`, "Facebook Insights returned no follow data for this period.");
  const videoViews = windowSum(videoMap, insCur);
  const videoViewsPrev = windowSum(videoMap, insPrev);
  const newFollows = windowSum(followsMap, insCur);
  const newFollowsPrev = windowSum(followsMap, insPrev);
  const unfollows = windowSum(unfollowsMap, insCur);
  const unfollowsPrev = windowSum(unfollowsMap, insPrev);
  const netFollows = newFollows != null && unfollows != null ? newFollows - unfollows : null;
  const netFollowsPrev = newFollowsPrev != null && unfollowsPrev != null ? newFollowsPrev - unfollowsPrev : null;

  // ---- Post rows against the Page's own median ----
  const rows: FbPostRow[] = posts.map((p) => ({
    id: p.id ?? "",
    title: titleOf(p),
    permalink: p.permalink_url ?? null,
    thumb: p.full_picture ?? null,
    published: p.created_time ?? "",
    hasImage: Boolean(p.full_picture),
    reactions: p.reactions ?? null,
    comments: p.comments ?? null,
    shares: p.shares ?? null,
    engagement: fbPostEngagement(p),
    multiplier: null,
  }));
  const counted = rows.filter((r) => r.engagement != null);
  const medianEngagement = counted.length ? median(counted.map((r) => r.engagement!)) : null;
  if (counted.length >= 5 && medianEngagement != null && medianEngagement > 0) for (const r of counted) r.multiplier = r.engagement! / medianEngagement;
  rows.sort((a, b) => (b.engagement ?? -1) - (a.engagement ?? -1));

  // ---- Totals for the period ----
  const engOf = (ps: FbPost[]) => (ps.some((p) => fbPostEngagement(p) != null) ? ps.reduce((a, p) => a + (fbPostEngagement(p) ?? 0), 0) : null);
  const engCur = engOf(postsCur);
  const engPrev = postsPrev ? engOf(postsPrev) : null;
  const dEng = pctDelta(engCur, engPrev);
  const dViews = pctDelta(views?.total ?? null, views?.prevTotal ?? null);
  const dPosts = diffDelta(postsCur.length, postsPrev ? postsPrev.length : null);
  const dFollowers = followerNet != null && followerNet !== 0 ? { text: `${followerNet > 0 ? "↑" : "↓"} ${Math.abs(followerNet).toLocaleString("en-US")}`, positive: followerNet > 0 } : { text: null, positive: null };
  const vsPrev = `vs. previous ${days} days`;
  const lower = rangeLabel.toLowerCase();

  const kpis: FbKpi[] = [
    {
      key: "followers", label: "Followers",
      value: snap.followers_count != null ? snap.followers_count.toLocaleString("en-US") : "—",
      note: newFollows != null
        ? `${signed(newFollows)} new follows · ${lower} (Facebook)`
        : followerNet != null ? `net change · ${lower}` : haveFollowerHistory ? "recorded daily by SOCIA" : snap.followers_count != null ? "trend starts building today" : "not provided by Facebook",
      status: snap.followers_count != null ? (haveFollowerHistory || newFollows != null ? "ok" : "collecting") : "unavailable",
      delta: dFollowers.text, positive: dFollowers.positive,
    },
    views && views.total != null
      ? {
          key: "views", label: "Page views", value: fmtNum(views.total),
          note: dViews.text ? vsPrev : videoViews != null ? `incl. ${fmtNum(videoViews)} video views · ${lower}` : `Facebook Page Insights · ${lower}`,
          status: "ok", delta: dViews.text, positive: dViews.positive,
        }
      : {
          key: "avg", label: "Avg engagement / post",
          value: engCur != null && postsCur.length ? fmtNum(Math.round(engCur / postsCur.length)) : "—",
          note: engCur != null ? "per post in range" : "needs engagement data",
          status: engCur != null && postsCur.length ? "ok" : "unavailable", delta: null, positive: null,
        },
    {
      key: "engagement", label: "Engagement", value: engCur != null ? fmtNum(engCur) : "—",
      note: engCur != null ? (dEng.text ? vsPrev : `reactions + comments + shares · ${lower}`) : anyEng ? `no posts with counts · ${lower}` : "needs pages_read_user_content",
      status: engCur != null ? "ok" : "unavailable", delta: dEng.text, positive: dEng.positive,
    },
    {
      key: "posts", label: "Posts", value: String(postsCur.length),
      note: dPosts.text ? vsPrev : `published · ${lower}`,
      status: "ok", delta: dPosts.text, positive: dPosts.positive,
    },
  ];

  // ---- What changed ----
  const changes: FbChange[] = [];
  if (views && views.total != null) changes.push({ key: "views", label: "Page views", current: fmtNum(views.total), previous: views.prevTotal != null ? fmtNum(views.prevTotal) : null, delta: dViews.text, positive: dViews.positive });
  if (videoViews != null) {
    const d = pctDelta(videoViews, videoViewsPrev);
    changes.push({ key: "video", label: "Video views", current: fmtNum(videoViews), previous: videoViewsPrev != null ? fmtNum(videoViewsPrev) : null, delta: d.text, positive: d.positive });
  }
  if (netFollows != null) {
    const d = diffDelta(netFollows, netFollowsPrev);
    changes.push({ key: "follows", label: "Net follows", current: signed(netFollows), previous: netFollowsPrev != null ? signed(netFollowsPrev) : null, delta: d.text, positive: d.positive });
  } else if (newFollows != null) {
    const d = diffDelta(newFollows, newFollowsPrev);
    changes.push({ key: "follows", label: "New follows", current: signed(newFollows), previous: newFollowsPrev != null ? signed(newFollowsPrev) : null, delta: d.text, positive: d.positive });
  } else if (followerNet != null) {
    changes.push({ key: "follows", label: "Followers (net)", current: signed(followerNet), previous: null, delta: null, positive: null });
  }
  if (engCur != null) changes.push({ key: "eng", label: "Engagement", current: fmtNum(engCur), previous: engPrev != null ? fmtNum(engPrev) : null, delta: dEng.text, positive: dEng.positive });
  changes.push({ key: "posts", label: "Posts published", current: String(postsCur.length), previous: postsPrev ? String(postsPrev.length) : null, delta: dPosts.text, positive: dPosts.positive });
  if (engCur != null && postsCur.length) {
    const avgCur = engCur / postsCur.length;
    const avgPrev = engPrev != null && postsPrev && postsPrev.length ? engPrev / postsPrev.length : null;
    const d = pctDelta(avgCur, avgPrev);
    changes.push({ key: "avg", label: "Avg engagement / post", current: fmtNum(Math.round(avgCur)), previous: avgPrev != null ? fmtNum(Math.round(avgPrev)) : null, delta: d.text, positive: d.positive });
  }

  // ---- Engagement mix for the period ----
  const sumField = (pick: (p: FbPost) => number | undefined): number | null => {
    const vals = postsCur.map(pick).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const typed = postsCur.filter((p) => p.reactionTypes);
  const mix: FbMix = {
    reactions: sumField((p) => p.reactions),
    comments: sumField((p) => p.comments),
    shares: sumField((p) => p.shares),
    types: typed.length
      ? FB_REACTIONS.map((k) => ({ key: k, label: REACTION_LABEL[k], value: typed.reduce((a, p) => a + (p.reactionTypes?.[k] ?? 0), 0) })).filter((t) => t.value > 0).sort((a, b) => b.value - a.value)
      : null,
  };

  // ---- Evidence cards for the insight drawer ----
  const evidence: PostCard[] = rows.map((r) => ({
    id: r.id, title: r.title, caption: r.title, published: r.published, format: r.hasImage ? "Photo" : "Post", platform: "facebook", isVideo: false,
    views: null, reach: null, likes: r.reactions, comments: r.comments, saves: null, shares: r.shares,
    engagements: r.engagement ?? 0, multiplier: r.multiplier, thumb: r.thumb, permalink: r.permalink,
  }));

  // ---- Insights (each one a comparison of two real numbers) ----
  const insights: Insight[] = [];
  const top = rows[0];
  if (top && top.multiplier != null && top.multiplier >= 3 && medianEngagement) {
    insights.push({
      id: "breakout", kind: "outlier", tone: "up", tag: "Breakout post", action: { label: "See posts", tab: "content" },
      title: `One post earned ${fmtMult(top.multiplier)} your median engagement`,
      body: `“${short(top.title)}”: ${top.engagement!.toLocaleString("en-US")} reactions, comments and shares against a median of ${Math.round(medianEngagement).toLocaleString("en-US")}.`,
      observed: [`“${short(top.title, 60)}”: ${top.engagement!.toLocaleString("en-US")} engagement`, `Median post: ${Math.round(medianEngagement).toLocaleString("en-US")} (${counted.length} posts with counts)`],
      interpretation: "A post this far above your median travelled well beyond your usual audience, most likely through shares and comments. One post can't prove what caused it, so treat it as a pattern to test.",
      recommendation: `Publish a follow-up in the same style as “${short(top.title, 40)}” and compare it against your ${Math.round(medianEngagement)} median.`,
      postIds: [top.id],
      planNote: `Repeat the style of “${short(top.title, 40)}” (${fmtMult(top.multiplier)} my median).`,
    });
  }

  const withImg = counted.filter((r) => r.hasImage), noImg = counted.filter((r) => !r.hasImage);
  if (withImg.length >= 3 && noImg.length >= 3) {
    const a = median(withImg.map((r) => r.engagement!))!, b = median(noImg.map((r) => r.engagement!))!;
    if (a > 0 && b > 0 && (a / b >= 1.3 || b / a >= 1.3)) {
      const imgWins = a >= b;
      const ratio = imgWins ? a / b : b / a;
      insights.push({
        id: "format", kind: "format", tone: "up", tag: "Format", action: { label: "See posts", tab: "content" },
        title: imgWins ? `Posts with a photo or video earn ${fmtMult(ratio)} your text-only posts` : `Your text-only posts earn ${fmtMult(ratio)} your posts with media`,
        body: `Median ${Math.round(a).toLocaleString("en-US")} engagement across ${withImg.length} posts with media vs ${Math.round(b).toLocaleString("en-US")} across ${noImg.length} without.`,
        observed: [`With a photo or video: median ${Math.round(a)} engagement (${withImg.length} posts)`, `Text only: median ${Math.round(b)} engagement (${noImg.length} posts)`],
        interpretation: "In this sample one kind of post lands better. The two groups may also differ in topic and timing, so the sample can't separate the media from everything else about those posts.",
        recommendation: imgWins ? "Attach a photo or short video to your next few posts and compare them against your median." : "Try a few more plain, conversational text posts and compare them against your median.",
        postIds: (imgWins ? withImg : noImg).slice(0, 3).map((r) => r.id),
        planNote: imgWins ? `Posts with media earn ${fmtMult(ratio)} my text-only posts.` : `Text-only posts earn ${fmtMult(ratio)} my posts with media.`,
      });
    }
  }

  if (dViews.pct != null && Math.abs(dViews.pct) >= 20 && views && views.prevTotal != null && views.prevTotal >= 50) {
    const up = dViews.pct > 0;
    insights.push({
      id: "views", kind: "trend", tone: up ? "up" : "down", tag: up ? "Views up" : "Views down", action: { label: "See growth", tab: "growth" },
      title: `Page views are ${up ? "up" : "down"} ${Math.abs(dViews.pct).toFixed(0)}% vs the previous ${days} days`,
      body: `${fmtNum(views.total!)} views against ${fmtNum(views.prevTotal)}.`,
      observed: [`This period: ${views.total!.toLocaleString("en-US")} Page views`, `Previous ${days} days: ${views.prevTotal.toLocaleString("en-US")}`, `Posts published: ${postsCur.length}${postsPrev ? ` vs ${postsPrev.length}` : ""}`],
      interpretation: up ? "More people viewed your Page content than in the period before. If you also posted more, part of the lift is simply volume." : "Fewer views than the period before. Check whether you posted less, or whether recent posts landed below your median.",
      recommendation: up ? "See which posts carried the lift on the Content tab and make more in that direction." : "Compare your recent posts against your median and revisit what worked before.",
      postIds: rows.slice(0, 3).map((r) => r.id),
      planNote: `Facebook Page views ${up ? "up" : "down"} ${Math.abs(dViews.pct).toFixed(0)}% vs previous period.`,
    });
  }

  if (counted.length >= 10) {
    const chrono = [...counted].sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
    const a = median(chrono.slice(0, 5).map((r) => r.engagement!))!, b = median(chrono.slice(5, 10).map((r) => r.engagement!))!;
    if (b > 0 && Math.abs(a / b - 1) >= 0.25) {
      const up = a > b;
      insights.push({
        id: "trend", kind: "trend", tone: up ? "up" : "down", tag: up ? "Recent lift" : "Recent decline", action: { label: "See posts", tab: "content" },
        title: up ? `Your last 5 posts earned ${fmtMult(a / b)} the median engagement of the 5 before` : `Your last 5 posts earned ${Math.round((1 - a / b) * 100)}% less median engagement than the 5 before`,
        body: `Median ${Math.round(a)} vs ${Math.round(b)} per post.`,
        observed: [`Last 5 posts: median ${Math.round(a)} engagement`, `Previous 5: median ${Math.round(b)}`],
        interpretation: up ? "Whatever changed in the last five is working; hold it constant while you test one thing at a time." : "The recent five share something the earlier ones didn't; compare topics and formats between the two groups before changing more.",
        recommendation: up ? "Keep the current mix for another week and measure again." : "Re-run the style of your best post from the earlier group this week.",
        postIds: chrono.slice(0, 5).map((r) => r.id),
        planNote: up ? "Recent Facebook posts trending up; keep the mix." : "Recent Facebook posts trending down; revisit the earlier winners.",
      });
    }
  }

  if (netFollows != null && netFollowsPrev != null && netFollows !== netFollowsPrev && Math.abs(netFollows - netFollowsPrev) >= Math.max(3, Math.abs(netFollowsPrev) * 0.25)) {
    const up = netFollows > netFollowsPrev;
    insights.push({
      id: "follows", kind: "trend", tone: up ? "up" : "down", tag: "Followers", action: { label: "See growth", tab: "growth" },
      title: `You gained ${signed(netFollows)} net followers, ${up ? "up" : "down"} from ${signed(netFollowsPrev)} the previous period`,
      body: `${newFollows!.toLocaleString("en-US")} follows and ${unfollows!.toLocaleString("en-US")} unfollows in the ${lower}.`,
      observed: [`This period: +${newFollows!.toLocaleString("en-US")} follows, −${unfollows!.toLocaleString("en-US")} unfollows (net ${signed(netFollows)})`, `Previous ${days} days: net ${signed(netFollowsPrev)}`],
      interpretation: "Net followers is follows minus unfollows as Facebook reports them. It moved between the two periods; the days with the most follows are on the Growth tab.",
      recommendation: up ? "Look at what you posted on your strongest follow days and repeat it." : "Check what changed in your posting on the days follows slowed.",
      postIds: [], planNote: `Facebook net follows ${signed(netFollows)} vs ${signed(netFollowsPrev)} the period before.`,
    });
  }

  if (postsPrev && postsPrev.length > 0 && postsCur.length / postsPrev.length <= 0.6) {
    insights.push({
      id: "cadence", kind: "cadence", tone: "down", tag: "Cadence", action: { label: "See posts", tab: "content" },
      title: `You published ${postsCur.length} post${postsCur.length === 1 ? "" : "s"}, down from ${postsPrev.length} the previous period`,
      body: `Posts in the ${lower} vs the ${days} days before.`,
      observed: [`This period: ${postsCur.length} posts`, `Previous ${days} days: ${postsPrev.length} posts`],
      interpretation: "Fewer posts means fewer chances to reach your followers; engagement usually follows cadence with a lag.",
      recommendation: `Get back to roughly ${postsPrev.length} posts per ${days} days; the Calendar can schedule them.`,
      postIds: [], planNote: `Facebook posts fell to ${postsCur.length} from ${postsPrev.length}.`,
    });
  }

  if (engCur != null && engCur > 0 && mix.shares != null && mix.shares / engCur >= 0.2) {
    insights.push({
      id: "shares", kind: "trend", tone: "info", tag: "Shares", action: { label: "See the mix", tab: "content" },
      title: `Shares make up ${Math.round((mix.shares / engCur) * 100)}% of your engagement`,
      body: `${mix.shares.toLocaleString("en-US")} shares out of ${engCur.toLocaleString("en-US")} reactions, comments and shares in the ${lower}.`,
      observed: [`Shares: ${mix.shares.toLocaleString("en-US")}`, `Reactions: ${(mix.reactions ?? 0).toLocaleString("en-US")}`, `Comments: ${(mix.comments ?? 0).toLocaleString("en-US")}`],
      interpretation: "A share puts your post in front of people who don't follow the Page. A high share of shares means your content is being passed along, which is how Pages reach new people now.",
      recommendation: "Look at which posts were shared most and make more that people would want to send to someone.",
      postIds: [...rows].filter((r) => r.shares != null).sort((a, b) => (b.shares ?? 0) - (a.shares ?? 0)).slice(0, 3).map((r) => r.id),
      planNote: `Shares are ${Math.round((mix.shares / engCur) * 100)}% of my Facebook engagement.`,
    });
  }

  // ---- Growth / decline weeks, from Page views (complete 7-day blocks) ----
  let weeks: FacebookAnalyticsData["weeks"] = { median: null, growth: [], decline: [] };
  if (views && views.provenance !== "unavailable") {
    let lastIdx = -1;
    views.current.forEach((p, i) => { if (p.value != null) lastIdx = i; });
    const blocks: FbWeek[] = [];
    for (let e = lastIdx + 1; e - 7 >= 0; e -= 7) {
      const b = views.current.slice(e - 7, e);
      blocks.unshift({ start: b[0].day, end: b[6].day, value: b.reduce((a, p) => a + (p.value ?? 0), 0), ratio: 1 });
    }
    const med = blocks.length >= 4 ? median(blocks.map((w) => w.value)) : null;
    if (med != null && med > 0) {
      const scored = blocks.map((w) => ({ ...w, ratio: w.value / med }));
      weeks = { median: med, growth: scored.filter((w) => w.ratio >= 1.5), decline: scored.filter((w) => w.ratio <= 0.6) };
    }
  }

  // ---- Posting times ----
  const timed: TimedPost[] = counted.map((r) => ({ id: r.id, t: r.published, e: r.engagement!, format: "Post" }));

  // ---- Honest "not available" list ----
  const unavailable: { label: string; why: string }[] = [
    { label: "Reach & impressions", why: "Meta retired these Page metrics across all API versions (2025–2026), so Facebook no longer provides them." },
    { label: "Audience age, gender and location", why: "Facebook's API no longer provides audience demographics for Pages." },
    { label: "Follower history before you connected", why: "SOCIA records the follower count once a day from the moment the Page is connected; earlier counts are not available." },
  ];
  if (!views || views.provenance === "unavailable") {
    unavailable.push({
      label: "Page & video views",
      why: ins?.available
        ? "Facebook Insights returned no view data for this Page in this period."
        : "Needs the read_insights permission — reconnect Facebook to grant it (public access arrives with App Review).",
    });
  }

  return {
    page: { name: snap.page_name, username: snap.username, avatar: snap.picture_url },
    status: snap.status,
    rangeLabel,
    rangeDays: days,
    today,
    kpis,
    followers,
    engagement,
    views,
    follows,
    videoViews,
    newFollows,
    unfollows,
    netFollows,
    insightsAvailable: Boolean(ins?.available),
    changes,
    insights,
    evidence,
    nextSteps: insights.slice(0, 3).map((i) => i.recommendation),
    posts: rows,
    medianEngagement,
    mix,
    publishing: { inRange: postsCur.length, perWeek: postsCur.length / (days / 7), analysed: posts.length, capped: posts.length >= FB_POST_LIMIT },
    timed,
    followerPoints: allFollowerPoints,
    followerStats,
    weeks,
    unavailable,
    postsInRange: postsCur.length,
  };
}
