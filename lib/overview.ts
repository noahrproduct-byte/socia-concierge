// Everything the Dashboard and Analytics pages show, assembled from real rows
// with deterministic arithmetic. Every number carries its provenance and the
// UI renders "—" / "Not available" / "Collecting" when a source is missing.
//
//   raw platform data → normalized → calculated here → rendered → AI interprets

import type { IgMediaItem } from "./instagramSync";
import type { DailySnapshot } from "./dashboardMetrics";
import { engagementOf, median, postsPerWeek, pctChange } from "./metrics";
import { bestWindow, type TimedPost } from "./bestTime";
import type { Deliverable } from "./schema";
import type { ScheduledPost } from "./scheduling";

export const DAY_MS = 86400000;

export const RANGES = [
  { id: "7", days: 7, label: "Last 7 days" },
  { id: "28", days: 28, label: "Last 28 days" },
  { id: "30", days: 30, label: "Last 30 days" },
  { id: "90", days: 90, label: "Last 90 days" },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];
export const rangeDays = (id: string | undefined): number =>
  RANGES.find((r) => r.id === id)?.days ?? 30;

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : n.toLocaleString("en-US");

export const FORMAT_LABEL: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Photo" };
export const formatOf = (m: { media_type?: string }) => FORMAT_LABEL[m.media_type ?? ""] ?? "Post";

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayList = (endExclusive: Date, days: number): string[] =>
  Array.from({ length: days }, (_, i) => new Date(endExclusive.getTime() - (days - i) * DAY_MS).toISOString().slice(0, 10));

// ---------------------------------------------------------------- posts ----

export type PostCard = {
  id: string;
  title: string;
  caption: string;
  published: string;
  format: string;
  platform: "instagram";
  isVideo: boolean;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  engagements: number;
  /** engagements ÷ the account's own median. null until a baseline exists. */
  multiplier: number | null;
  thumb: string | null;
  permalink: string | null;
};

export function displayTitle(caption: string): string {
  const first = caption.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const noTags = first.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return noTags || first || "(no caption)";
}

export function postCards(media: IgMediaItem[], baseline: number | null): PostCard[] {
  return media
    .filter((m) => m.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .map((m, i) => {
      const e = engagementOf(m);
      return {
        id: m.id ?? String(i),
        title: displayTitle(m.caption ?? ""),
        caption: m.caption ?? "",
        published: m.timestamp!,
        format: formatOf(m),
        platform: "instagram",
        isVideo: m.media_type === "VIDEO",
        views: m.insights?.views ?? null,
        reach: m.insights?.reach ?? null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        saves: m.insights?.saved ?? null,
        shares: m.insights?.shares ?? null,
        engagements: e,
        multiplier: baseline && baseline > 0 ? e / baseline : null,
        thumb: m.thumbnail_url || m.media_url || null,
        permalink: m.permalink ?? null,
      };
    });
}

/** Top posts by the metric the platform actually served; views when every
 *  post has them, engagement otherwise. */
export function rankPosts(posts: PostCard[], by: "views" | "engagements" = "views", limit = 6): PostCard[] {
  const haveViews = posts.some((p) => p.views != null);
  const key = by === "views" && haveViews ? "views" : "engagements";
  return [...posts].sort((a, b) => ((b[key] as number | null) ?? -1) - ((a[key] as number | null) ?? -1)).slice(0, limit);
}

// --------------------------------------------------------------- series ----

export type MetricId = "views" | "engagement" | "followers" | "reach";
export type Provenance = "instagram_daily" | "publish_totals" | "snapshot" | "unavailable";
export type SeriesPoint = { day: string; value: number | null; postIds: string[] };
export type Series = {
  metric: MetricId;
  label: string;
  provenance: Provenance;
  /** One sentence the chart shows about where the numbers come from. */
  note: string;
  current: SeriesPoint[];
  previous: SeriesPoint[];
  total: number | null;
  prevTotal: number | null;
};

const META_DAILY = "instagram_api";

export function buildSeries(
  metric: MetricId,
  media: IgMediaItem[],
  daily: DailySnapshot[],
  days: number,
  now = new Date(),
): Series {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const curDays = dayList(end, days);
  const prevDays = dayList(new Date(end.getTime() - days * DAY_MS), days);
  const rows = new Map(daily.map((d) => [d.day, d]));
  const byPublishDay = new Map<string, IgMediaItem[]>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const k = utcDay(m.timestamp);
    byPublishDay.set(k, [...(byPublishDay.get(k) ?? []), m]);
  }
  const ids = (ms: IgMediaItem[]) => ms.map((m) => m.id ?? "").filter(Boolean);

  const make = (dayKeys: string[], pick: (d: string) => { value: number | null; postIds: string[] }): SeriesPoint[] =>
    dayKeys.map((d) => ({ day: d, ...pick(d) }));

  const sum = (pts: SeriesPoint[]): number | null => {
    const vals = pts.map((p) => p.value).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const last = (pts: SeriesPoint[]): number | null => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value != null) return pts[i].value;
    return null;
  };

  if (metric === "views") {
    const metaDays = curDays.filter((d) => rows.get(d)?.views != null && rows.get(d)?.source === META_DAILY);
    if (metaDays.length) {
      const pick = (d: string) => {
        const r = rows.get(d);
        return { value: r?.source === META_DAILY ? (r.views ?? null) : null, postIds: ids(byPublishDay.get(d) ?? []) };
      };
      const current = make(curDays, pick), previous = make(prevDays, pick);
      return { metric, label: "Views", provenance: "instagram_daily", note: "Instagram's own daily views series.", current, previous, total: sum(current), prevTotal: sum(previous) };
    }
    const anyViews = media.some((m) => m.insights?.views != null);
    if (anyViews) {
      const pick = (d: string) => {
        const ms = (byPublishDay.get(d) ?? []).filter((m) => m.insights?.views != null);
        return { value: ms.length ? ms.reduce((s, m) => s + (m.insights!.views ?? 0), 0) : null, postIds: ids(ms) };
      };
      const current = make(curDays, pick), previous = make(prevDays, pick);
      return { metric, label: "Views", provenance: "publish_totals", note: "Each post's total views, placed on the day it was published. Instagram hasn't served a daily views series for this account yet.", current, previous, total: sum(current), prevTotal: sum(previous) };
    }
    return { metric, label: "Views", provenance: "unavailable", note: "Instagram hasn't returned views for this account.", current: make(curDays, () => ({ value: null, postIds: [] })), previous: [], total: null, prevTotal: null };
  }

  if (metric === "engagement") {
    const pick = (d: string) => {
      const ms = byPublishDay.get(d) ?? [];
      return { value: ms.length ? ms.reduce((s, m) => s + engagementOf(m), 0) : null, postIds: ids(ms) };
    };
    const current = make(curDays, pick), previous = make(prevDays, pick);
    return { metric, label: "Engagement", provenance: "publish_totals", note: "Likes + comments on each post, placed on the day it was published.", current, previous, total: sum(current) ?? 0, prevTotal: sum(previous) };
  }

  if (metric === "followers") {
    const pick = (d: string) => ({ value: rows.get(d)?.followers ?? null, postIds: [] });
    const current = make(curDays, pick), previous = make(prevDays, pick);
    const first = daily.find((d) => d.followers != null)?.day;
    const has = current.some((p) => p.value != null);
    return {
      metric, label: "Followers",
      provenance: has ? "snapshot" : "unavailable",
      note: first ? `Your follower count, recorded by SOCIA each day since ${new Date(first + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : "SOCIA records your follower count daily from the moment you connect; no history yet.",
      current, previous, total: last(current), prevTotal: last(previous),
    };
  }

  // reach
  const pick = (d: string) => {
    const r = rows.get(d);
    return { value: r?.source === META_DAILY ? (r.reach ?? null) : null, postIds: ids(byPublishDay.get(d) ?? []) };
  };
  const current = make(curDays, pick), previous = make(prevDays, pick);
  const has = current.some((p) => p.value != null);
  return { metric, label: "Reach", provenance: has ? "instagram_daily" : "unavailable", note: has ? "Accounts reached per day, Instagram's own daily series." : "Instagram hasn't returned daily reach for this account yet.", current, previous, total: sum(current), prevTotal: sum(previous) };
}

/** Sum consecutive days into ISO weeks (Mon-start) for the weekly view. */
export function weekly(points: SeriesPoint[], mode: "sum" | "last" = "sum"): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let bucket: SeriesPoint | null = null;
  for (const p of points) {
    const d = new Date(p.day + "T00:00:00Z");
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
    if (!bucket || bucket.day !== monday) {
      bucket = { day: monday, value: null, postIds: [] };
      out.push(bucket);
    }
    if (p.value != null) bucket.value = mode === "last" ? p.value : (bucket.value ?? 0) + p.value;
    bucket.postIds.push(...p.postIds);
  }
  return out;
}

// ----------------------------------------------------------------- KPIs ----

export type Kpi = {
  id: "views" | "engagement_rate" | "followers" | "reach" | "posts";
  label: string;
  value: string;
  raw: number | null;
  deltaPct: number | null;
  deltaText: string | null;
  positive: boolean | null;
  note: string;
  status: "ok" | "unavailable" | "collecting";
  source: string;
};

export function buildKpis(input: {
  media: IgMediaItem[];
  daily: DailySnapshot[];
  followers: number | null;
  days: number;
  now?: Date;
}): Kpi[] {
  const { media, daily, followers, days } = input;
  const now = input.now ?? new Date();
  const views = buildSeries("views", media, daily, days, now);
  const reach = buildSeries("reach", media, daily, days, now);
  const foll = buildSeries("followers", media, daily, days, now);
  const since = now.getTime() - days * DAY_MS;
  const prevSince = since - days * DAY_MS;
  const inRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const prevRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= prevSince && new Date(m.timestamp).getTime() < since);
  const oldest = media.length ? Math.min(...media.filter((m) => m.timestamp).map((m) => new Date(m.timestamp!).getTime())) : null;
  const coversPrev = oldest != null && oldest <= prevSince;
  const period = `vs. previous ${days} days`;

  const delta = (cur: number | null, prev: number | null): { pct: number | null; text: string | null } => {
    if (cur == null || prev == null) return { pct: null, text: null };
    if (prev === 0) return { pct: null, text: cur > 0 ? "new" : null };
    const pct = pctChange(cur, prev);
    return { pct, text: pct == null ? null : `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(pct >= 100 ? 0 : 1)}%` };
  };

  // Engagement rate over posts in range: (likes+comments) ÷ followers ÷ posts
  const rate = (ms: IgMediaItem[]) => (followers && followers > 0 && ms.length ? (ms.reduce((s, m) => s + engagementOf(m), 0) / ms.length / followers) * 100 : null);
  const rateCur = rate(inRange);
  const ratePrev = coversPrev || prevRange.length ? rate(prevRange) : null;

  const v = delta(views.total, views.prevTotal);
  const r = delta(reach.total, reach.prevTotal);
  const f = delta(foll.total, foll.prevTotal);
  const e = delta(rateCur, ratePrev);
  const p = coversPrev || prevRange.length ? inRange.length - prevRange.length : null;

  return [
    {
      id: "views", label: "Total Views", value: views.total != null ? fmtNum(views.total) : "—", raw: views.total,
      deltaPct: v.pct, deltaText: v.text, positive: v.pct == null ? null : v.pct >= 0,
      note: views.total == null ? "Not returned by Instagram yet" : v.text ? period : `last ${days} days`,
      status: views.total == null ? "unavailable" : "ok", source: views.note,
    },
    {
      id: "engagement_rate", label: "Engagement Rate", value: rateCur != null ? `${rateCur.toFixed(rateCur < 1 ? 2 : 1)}%` : "—", raw: rateCur,
      deltaPct: e.pct, deltaText: e.pct != null ? `${e.pct >= 0 ? "↑" : "↓"} ${Math.abs(rateCur! - ratePrev!).toFixed(2)} pts` : null, positive: e.pct == null ? null : e.pct >= 0,
      note: rateCur == null ? (inRange.length ? "Needs a follower count" : `No posts in the last ${days} days`) : e.pct != null ? period : `${inRange.length} post${inRange.length === 1 ? "" : "s"} · likes + comments ÷ followers`,
      status: rateCur == null ? "unavailable" : "ok", source: "Average likes + comments per post published in the period, divided by current followers.",
    },
    {
      id: "followers", label: "Followers", value: followers != null ? followers.toLocaleString("en-US") : "—", raw: followers,
      deltaPct: f.pct, deltaText: f.text ?? (foll.total != null && foll.prevTotal == null ? null : null), positive: f.pct == null ? null : f.pct >= 0,
      note: followers == null ? "Connect Instagram" : f.text ? period : foll.provenance === "snapshot" ? "history still collecting" : "live from Instagram",
      status: followers == null ? "unavailable" : f.text ? "ok" : "collecting", source: foll.note,
    },
    {
      id: "reach", label: "Reach", value: reach.total != null ? fmtNum(reach.total) : "—", raw: reach.total,
      deltaPct: r.pct, deltaText: r.text, positive: r.pct == null ? null : r.pct >= 0,
      note: reach.total == null ? "Daily reach not returned yet" : r.text ? period : `last ${days} days`,
      status: reach.total == null ? "collecting" : "ok", source: reach.note,
    },
    {
      id: "posts", label: "Total Posts", value: String(inRange.length), raw: inRange.length,
      deltaPct: null, deltaText: p != null ? `${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}` : null, positive: p == null ? null : p >= 0,
      note: p != null ? period : `published in the last ${days} days`, status: "ok", source: "Posts published in the period, from Instagram's media list.",
    },
  ];
}

// ------------------------------------------------------------ breakdowns ---

export type Slice = { label: string; value: number; share: number; count: number; tone: "primary" | "info" | "success" | "warning" | "danger" | "muted"; note?: string };

/** Views (or engagement) by format for the period. Only formats that exist. */
export function formatBreakdown(media: IgMediaItem[], days: number, now = new Date()): { slices: Slice[]; metric: "views" | "engagement"; total: number } {
  const since = now.getTime() - days * DAY_MS;
  const ms = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const haveViews = ms.length > 0 && ms.every((m) => m.insights?.views != null);
  const metric = haveViews ? "views" : "engagement";
  const val = (m: IgMediaItem) => (metric === "views" ? (m.insights?.views ?? 0) : engagementOf(m));
  const groups: Record<string, { value: number; count: number }> = {};
  for (const m of ms) {
    const f = formatOf(m) + (formatOf(m) === "Photo" ? "s" : "s");
    groups[f] = { value: (groups[f]?.value ?? 0) + val(m), count: (groups[f]?.count ?? 0) + 1 };
  }
  const total = Object.values(groups).reduce((s, g) => s + g.value, 0);
  const tones: Slice["tone"][] = ["primary", "info", "success", "warning", "muted"];
  const slices = Object.entries(groups)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([label, g], i) => ({ label, value: g.value, share: total ? g.value / total : 0, count: g.count, tone: tones[i % tones.length] }));
  return { slices, metric, total };
}

export type PlatformRow = { id: "instagram" | "tiktok" | "facebook" | "youtube"; label: string; connected: boolean; value: number | null; deltaPct: number | null; share: number };

// ------------------------------------------------------------- insights ----

export type Insight = {
  id: string;
  kind: "outlier" | "format" | "location" | "window" | "cadence" | "trend";
  tone: "up" | "down" | "info" | "warn";
  title: string;
  body: string;
  observed: string[];
  interpretation: string;
  recommendation: string;
  postIds: string[];
  /** For "Add to Content Plan": the note dropped into the brief. */
  planNote: string;
};

const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildInsights(input: {
  media: IgMediaItem[];
  baseline: number | null;
  location: string | null;
  handle: string | null;
}): Insight[] {
  const { media, baseline, location } = input;
  const out: Insight[] = [];
  const dated = media.filter((m) => m.timestamp);
  const eng = (m: IgMediaItem) => engagementOf(m);
  const label = (m: IgMediaItem) => `"${displayTitle(m.caption ?? "").slice(0, 40)}"`;

  // 1. Outlier: one post far above the account's own median
  if (baseline && baseline > 0 && dated.length >= 5) {
    const top = [...dated].sort((a, b) => eng(b) - eng(a))[0];
    const mult = eng(top) / baseline;
    if (mult >= 3) {
      out.push({
        id: "outlier", kind: "outlier", tone: "up",
        title: `One ${formatOf(top).toLowerCase()} did ${fmtMult(mult)} your usual engagement`,
        body: `${label(top)} earned ${eng(top).toLocaleString("en-US")} likes and comments against a median of ${Math.round(baseline).toLocaleString("en-US")}.`,
        observed: [
          `${label(top)}: ${eng(top).toLocaleString("en-US")} engagements${top.insights?.views != null ? `, ${fmtNum(top.insights.views)} views` : ""}`,
          `Your median post: ${Math.round(baseline).toLocaleString("en-US")} engagements (last ${dated.length} posts)`,
        ],
        interpretation: "A single post this far above the median usually means its hook and format hit an audience beyond your followers. That's a repeatable pattern, not luck, until a second attempt says otherwise.",
        recommendation: `Make a second post with the same format and opening line structure as ${label(top)}, and compare it against the ${Math.round(baseline)} median.`,
        postIds: [top.id ?? ""],
        planNote: `Repeat the format and hook of ${label(top)} (${fmtMult(mult)} my median).`,
      });
    }
  }

  // 2. Format: a format whose median beats the account median by 15%+
  if (baseline && baseline > 0) {
    const byFmt = new Map<string, IgMediaItem[]>();
    for (const m of dated) byFmt.set(formatOf(m), [...(byFmt.get(formatOf(m)) ?? []), m]);
    let best: { fmt: string; med: number; n: number } | null = null;
    let worst: { fmt: string; med: number; n: number } | null = null;
    for (const [fmt, ms] of byFmt) {
      if (ms.length < 3) continue;
      const med = median(ms.map(eng))!;
      if (!best || med > best.med) best = { fmt, med, n: ms.length };
      if (!worst || med < worst.med) worst = { fmt, med, n: ms.length };
    }
    if (best && best.med / baseline >= 1.15 && byFmt.size > 1) {
      const vs = worst && worst.fmt !== best.fmt ? ` ${best.fmt}s: ${Math.round(best.med)} median vs ${worst.fmt}s: ${Math.round(worst.med)}.` : "";
      out.push({
        id: "format", kind: "format", tone: "up",
        title: `${best.fmt}s are your strongest format`,
        body: `Median ${Math.round(best.med).toLocaleString("en-US")} engagements across ${plural(best.n, best.fmt.toLowerCase())}, ${fmtMult(best.med / baseline)} your overall median.`,
        observed: [`${best.fmt}s: median ${Math.round(best.med)} engagements (${best.n} posts)`, `All posts: median ${Math.round(baseline)}`, ...(vs ? [vs.trim()] : [])],
        interpretation: "The format itself is carrying reach here; Instagram distributes it to more non-followers than your other formats.",
        recommendation: `Plan the next week so at least two thirds of posts are ${best.fmt.toLowerCase()}s.`,
        postIds: (byFmt.get(best.fmt) ?? []).slice(0, 3).map((m) => m.id ?? ""),
        planNote: `${best.fmt}s earn ${fmtMult(best.med / baseline)} my median; weight the week toward them.`,
      });
    }
  }

  // 3. Location mentions
  if (location && dated.length >= 5) {
    const tokens = location.split(/[,/]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2 && !/^[a-z]{2}$/.test(t));
    if (tokens.length) {
      const mentions = dated.filter((m) => tokens.some((t) => (m.caption ?? "").toLowerCase().includes(t)));
      const rest = dated.filter((m) => !mentions.includes(m));
      const place = location.split(",")[0].trim();
      if (mentions.length === 0) {
        out.push({
          id: "location", kind: "location", tone: "warn",
          title: `None of your last ${dated.length} posts mention ${place}`,
          body: "For a local business, reach that isn't local doesn't turn into visits.",
          observed: [`0 of ${dated.length} captions mention ${tokens.map((t) => `"${t}"`).join(" or ")}`],
          interpretation: "Instagram uses caption text and location tags when it decides who nearby sees a post. Without them your reach is spread wherever the format travels, not where your customers are.",
          recommendation: `Add ${place} to captions and tag the location on every post this week; compare local follower growth after two weeks.`,
          postIds: [],
          planNote: `No recent post mentions ${place}; every post this week should name it.`,
        });
      } else if (mentions.length >= 2 && rest.length >= 2) {
        const mm = median(mentions.map(eng))!, mr = median(rest.map(eng))!;
        if (mr > 0 && (mm / mr >= 1.3 || mm / mr <= 0.7)) {
          const up = mm >= mr;
          out.push({
            id: "location", kind: "location", tone: up ? "up" : "info",
            title: up ? `Posts that mention ${place} earn ${fmtMult(mm / mr)} more` : `Posts that mention ${place} earn less than the rest`,
            body: `Median ${Math.round(mm)} engagements on ${plural(mentions.length, "post")} mentioning ${place}, vs ${Math.round(mr)} on the other ${rest.length}.`,
            observed: [`${mentions.length} posts mention ${place}: median ${Math.round(mm)}`, `${rest.length} posts don't: median ${Math.round(mr)}`],
            interpretation: up ? "Naming the place seems to help Instagram put the post in front of people nearby, who engage more." : "The local posts are landing softer; the hooks on them may be weaker rather than the location itself hurting.",
            recommendation: up ? `Keep ${place} in the caption and add the location tag on every post.` : `Keep naming ${place}, but open those posts with the same hook style as your best performers.`,
            postIds: mentions.slice(0, 3).map((m) => m.id ?? ""),
            planNote: up ? `Local mentions earn ${fmtMult(mm / mr)}; name ${place} in every caption.` : `Local posts underperform; pair ${place} mentions with stronger hooks.`,
          });
        }
      }
    }
  }

  // 4. Best window (audience timing from the account's own posts)
  const timed: TimedPost[] = dated.map((m) => ({ t: m.timestamp!, e: eng(m) }));
  const win = bestWindow(timed, 5);
  if (win) {
    out.push({
      id: "window", kind: "window", tone: "info",
      title: `Your audience engages most ${win.short}`,
      body: `Computed from when your last ${timed.length} posts earned their engagement.`,
      observed: [`Best window: ${win.long}`, `Sample: ${timed.length} dated posts`],
      interpretation: "Posts published into the window get their first engagement faster, which Instagram reads as a signal to keep distributing.",
      recommendation: `Schedule this week's most important post for ${win.short}.`,
      postIds: [],
      planNote: `Best engagement window: ${win.long}.`,
    });
  }

  // 5. Cadence
  const cur = postsPerWeek(dated.map((m) => m.timestamp), 30);
  const prev = postsPerWeek(dated.map((m) => m.timestamp), 60);
  if (cur != null && prev != null) {
    const prev30 = Math.max(0, prev * 2 - cur); // posts/week in the 30 days before the last 30
    if (prev30 > 0 && cur / prev30 <= 0.7) {
      out.push({
        id: "cadence", kind: "cadence", tone: "down",
        title: `Posting dropped to ${cur.toFixed(1)}/week`,
        body: `From ${prev30.toFixed(1)}/week in the 30 days before.`,
        observed: [`Last 30 days: ${cur.toFixed(1)} posts/week`, `Previous 30 days: ${prev30.toFixed(1)} posts/week`],
        interpretation: "Fewer posts means fewer chances for the algorithm to test your content with new people; reach tends to follow cadence with a lag.",
        recommendation: `Get back to ${Math.max(3, Math.round(prev30))} posts a week; the Calendar can place them at your best hour.`,
        postIds: [],
        planNote: `Cadence fell to ${cur.toFixed(1)}/week; plan ${Math.max(3, Math.round(prev30))} posts.`,
      });
    }
  }

  // 6. Trend: last 5 vs previous 5
  if (dated.length >= 10) {
    const sorted = [...dated].sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
    const a = median(sorted.slice(0, 5).map(eng))!, b = median(sorted.slice(5, 10).map(eng))!;
    if (b > 0 && Math.abs(a / b - 1) >= 0.25) {
      const up = a > b;
      out.push({
        id: "trend", kind: "trend", tone: up ? "up" : "down",
        title: up ? `Your last 5 posts run ${fmtMult(a / b)} the 5 before` : `Your last 5 posts run ${Math.round((1 - a / b) * 100)}% below the 5 before`,
        body: `Median ${Math.round(a)} vs ${Math.round(b)} engagements.`,
        observed: [`Last 5 posts: median ${Math.round(a)}`, `Previous 5: median ${Math.round(b)}`],
        interpretation: up ? "Whatever changed in the last five is working; hold it constant while you test one variable at a time." : "The recent five share something the earlier ones didn't; compare hooks and formats between the two groups before changing more.",
        recommendation: up ? "Keep the current format mix for another week and measure again." : "Re-run the best-performing format from the earlier group this week.",
        postIds: sorted.slice(0, 5).map((m) => m.id ?? ""),
        planNote: up ? "Recent posts trending up; keep the mix." : "Recent posts trending down; revisit the earlier winning format.",
      });
    }
  }

  const order: Insight["kind"][] = ["outlier", "format", "location", "trend", "window", "cadence"];
  return out.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
}

// --------------------------------------------------------- plan & goals ----

export type FocusTile = { icon: "video" | "map" | "users" | "target"; label: string; title: string; detail: string };
export type Focus = { planId: string; headline: string; tiles: FocusTile[]; createdAt: string };

export function buildFocus(plan: { id: string; data: Deliverable; created_at: string } | null): Focus | null {
  if (!plan?.data?.topFixes?.length) return null;
  const iconFor = (s: string): FocusTile["icon"] =>
    /reel|video|short/i.test(s) ? "video" : /local|location|geotag|nearby|hermitage|nashville|neighbou?rhood|city/i.test(s) ? "map" : /people|staff|face|customer|team|owner|human/i.test(s) ? "users" : "target";
  const labelFor = (s: string): string =>
    /reel|video/i.test(s) ? "REELS" : /local|location|geotag/i.test(s) ? "LOCAL" : /people|staff|face|customer|team/i.test(s) ? "PEOPLE" : /hook|caption|first line/i.test(s) ? "HOOKS" : /cta|order|book|link/i.test(s) ? "ORDERS" : "FOCUS";
  return {
    planId: plan.id,
    headline: plan.data.headline,
    createdAt: plan.created_at,
    tiles: plan.data.topFixes.slice(0, 3).map((f) => ({ icon: iconFor(f.fix + " " + f.why), label: labelFor(f.fix + " " + f.why), title: f.fix, detail: f.why })),
  };
}

export type GoalTracker = { label: string; current: number | null; target: number | null; display: string; note: string };

export function buildGoals(input: {
  goalsText: string | null;
  plan: { id: string; data: Deliverable } | null;
  scheduled: ScheduledPost[];
  media: IgMediaItem[];
  frequency: string | null;
  followerDelta30: number | null;
}): { goals: string[]; trackers: GoalTracker[] } {
  const goals = (input.goalsText ?? "")
    .split(/[,;]|\band\b/i)
    .map((g) => g.trim())
    .filter((g) => g.length > 3)
    .slice(0, 4);
  const trackers: GoalTracker[] = [];
  if (input.plan) {
    const total = input.plan.data.weeklyPlan?.length ?? 0;
    const done = input.scheduled.filter((p) => p.plan_id === input.plan!.id && p.status !== "cancelled").length;
    if (total) trackers.push({ label: "Plan on the calendar", current: done, target: total, display: `${done} / ${total} posts`, note: "Drafts and scheduled posts created from your latest Content Plan." });
  }
  const weekAgo = Date.now() - 7 * DAY_MS;
  const thisWeek = input.media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= weekAgo).length;
  const target = input.frequency ? parseInt(input.frequency.match(/\d+/)?.[0] ?? "", 10) : NaN;
  trackers.push({
    label: "Posts this week",
    current: thisWeek,
    target: Number.isFinite(target) ? target : null,
    display: Number.isFinite(target) ? `${thisWeek} / ${target} posts` : `${thisWeek} post${thisWeek === 1 ? "" : "s"}`,
    note: Number.isFinite(target) ? "Against the cadence set in your strategist settings." : "Set a posting cadence in Settings → AI Strategist to track it here.",
  });
  if (input.followerDelta30 != null) {
    trackers.push({ label: "Followers, last 30 days", current: input.followerDelta30, target: null, display: `${input.followerDelta30 >= 0 ? "+" : ""}${input.followerDelta30.toLocaleString("en-US")}`, note: "From SOCIA's daily follower snapshots." });
  }
  return { goals, trackers };
}

// --------------------------------------------------------------- events ----

export type Activity = { id: string; kind: "scheduled" | "published" | "failed" | "draft" | "plan" | "sync"; title: string; detail: string; at: string };

export function buildActivity(input: { scheduled: ScheduledPost[]; plans: { id: string; created_at: string; client_handle: string | null }[]; syncedAt: string | null; handle: string | null }): Activity[] {
  const out: Activity[] = [];
  for (const p of input.scheduled) {
    const t = displayTitle(p.caption).slice(0, 44) || "Untitled post";
    if (p.status === "published") out.push({ id: `pub-${p.id}`, kind: "published", title: "Post published", detail: t, at: p.updated_at });
    else if (p.status === "scheduled") out.push({ id: `sch-${p.id}`, kind: "scheduled", title: "Post scheduled", detail: `${t} · ${new Date(p.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, at: p.updated_at });
    else if (p.status === "failed") out.push({ id: `fail-${p.id}`, kind: "failed", title: "Post needs attention", detail: p.error?.slice(0, 60) ?? t, at: p.updated_at });
    else if (p.status === "draft") out.push({ id: `draft-${p.id}`, kind: "draft", title: "Draft added", detail: t, at: p.created_at });
  }
  for (const pl of input.plans) out.push({ id: `plan-${pl.id}`, kind: "plan", title: "Content plan generated", detail: pl.client_handle ? `for ${pl.client_handle}` : "weekly plan", at: pl.created_at });
  if (input.syncedAt) out.push({ id: "sync", kind: "sync", title: "Instagram synced", detail: input.handle ? `@${input.handle}` : "account", at: input.syncedAt });
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
}

export type Upcoming = { id: string; at: string; title: string; status: ScheduledPost["status"]; format: string; thumb: string | null; platform: "instagram" };

export function buildUpcoming(scheduled: ScheduledPost[], limit = 4): Upcoming[] {
  const now = Date.now();
  return scheduled
    .filter((p) => p.status !== "cancelled" && p.status !== "published" && new Date(p.scheduled_at).getTime() >= now - DAY_MS)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, limit)
    .map((p) => ({
      id: p.id, at: p.scheduled_at, title: displayTitle(p.caption) || "Untitled post", status: p.status,
      format: p.media_type === "IMAGE" ? "Instagram Photo" : "Instagram Reel",
      thumb: p.media_type === "IMAGE" ? p.media_url : null, platform: "instagram",
    }));
}

export const relTime = (iso: string, now = Date.now()): string => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};
