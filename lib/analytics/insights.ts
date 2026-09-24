// The deterministic insight engine. Every insight is a real calculation over
// the normalized bundle — a breakout above the account's own typical, a format
// that travels further, a posting window, a recent trend or cadence change, or
// (across accounts) where growth actually happened. The numbers are computed
// here; the interpretation is measured and sample-size-aware; nothing is
// invented, and a finding only appears when the evidence supports it. AI (Ask
// SOCIA) can elaborate on a finding later, but never manufactures one.

import { median, postsPerWeek } from "../metrics";
import { formatLabel, formatLabelPlural } from "./format";
import { postingWindows } from "./derive";
import { relText } from "../postingTimes";
import { platformCapability } from "./capabilities";
import type { ContentFormat, NormalizedAccountAnalytics, NormalizedPost, Platform } from "./types";

export type InsightKind = "breakout" | "format" | "timing" | "trend" | "cadence" | "platform";

export type AnalyticsInsight = {
  id: string;
  platform: Platform | "all";
  kind: InsightKind;
  tone: "up" | "down" | "info" | "warn";
  /** Short uppercase-ish label, e.g. "Breakout". */
  tag: string;
  title: string;
  body: string;
  observed: string[];
  interpretation: string;
  recommendation: string;
  postIds: string[];
};

const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const round = (n: number) => Math.round(n).toLocaleString("en-US");
const engOf = (p: NormalizedPost) => p.engagement;

// A post's headline number for evidence. `interactionsFirst` keeps the number
// consistent with an interaction-based multiplier (breakouts compare
// interactions to the interaction baseline, so views must not be the compared
// figure); views are still mentioned as extra context when present.
function statLine(p: NormalizedPost, interactionsFirst = false): string {
  if (interactionsFirst) {
    const ix = p.engagement != null ? `${round(p.engagement)} interactions` : "no interactions returned";
    return p.metrics.views != null ? `${ix}, ${round(p.metrics.views)} views` : ix;
  }
  if (p.metrics.views != null) return `${round(p.metrics.views)} views`;
  return p.engagement != null ? `${round(p.engagement)} interactions` : "no metrics returned";
}

/** All deterministic insights for one connected account, most useful first. */
export function accountInsights(acc: NormalizedAccountAnalytics): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  const platform = acc.account.platform;
  const label = platformCapability(platform).label;
  const dated = acc.posts.filter((p) => p.publishedAt && p.engagement != null);
  const baseAll = acc.baseline.all ?? null;

  // 1. Breakout — a post far above the account's own typical.
  if (baseAll && baseAll > 0) {
    const top = [...acc.posts].filter((p) => p.multiplier != null).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0];
    if (top && top.multiplier != null && top.multiplier >= 3) {
      out.push({
        id: `breakout-${platform}`,
        platform,
        kind: "breakout",
        tone: "up",
        tag: "Breakout",
        title: `One ${formatLabel(top.format).toLowerCase()} earned ${fmtMult(top.multiplier)} your typical interactions`,
        body: `"${top.title.slice(0, 48)}": ${statLine(top, true)}, against a typical ${formatLabel(top.format).toLowerCase()} of ${round(acc.baseline[top.format] ?? baseAll)} interactions.`,
        observed: [`"${top.title.slice(0, 48)}": ${statLine(top, true)}`, `Your typical ${formatLabel(top.format).toLowerCase()}: ${round(acc.baseline[top.format] ?? baseAll)} interactions`],
        interpretation: `A post this far above your median was distributed well beyond your ${acc.account.audienceLabel.toLowerCase()}. The hook and subject are the likeliest reasons; one post can't prove which, so treat it as a pattern to test.`,
        recommendation: `Make another ${formatLabel(top.format).toLowerCase()} with the same opening and subject, and compare it against your ${round(acc.baseline[top.format] ?? baseAll)} typical.`,
        postIds: [top.id],
      });
    }
  }

  // 2. Format — a format whose median beats the account median by 15%+.
  if (baseAll && baseAll > 0) {
    const byFmt = new Map<ContentFormat, number[]>();
    for (const p of dated) byFmt.set(p.format, [...(byFmt.get(p.format) ?? []), p.engagement!]);
    let best: { fmt: ContentFormat; med: number; n: number } | null = null;
    for (const [fmt, xs] of byFmt) {
      if (xs.length < 3) continue;
      const med = median(xs)!;
      if (!best || med > best.med) best = { fmt, med, n: xs.length };
    }
    if (best && byFmt.size > 1 && best.med / baseAll >= 1.15) {
      out.push({
        id: `format-${platform}`,
        platform,
        kind: "format",
        tone: "up",
        tag: "Format",
        title: `${formatLabelPlural(best.fmt)} are your strongest format`,
        body: `Median ${round(best.med)} interactions across ${plural(best.n, formatLabel(best.fmt).toLowerCase())}, ${fmtMult(best.med / baseAll)} your overall median.`,
        observed: [`${formatLabelPlural(best.fmt)}: median ${round(best.med)} interactions (${best.n} posts)`, `All posts: median ${round(baseAll)}`],
        interpretation: `In this sample ${formatLabelPlural(best.fmt).toLowerCase()} travel further than your other formats. Sample sizes are small, so keep measuring.`,
        recommendation: `Weight the next week toward ${formatLabelPlural(best.fmt).toLowerCase()}.`,
        postIds: (dated.filter((p) => p.format === best!.fmt).slice(0, 3).map((p) => p.id)),
      });
    }
  }

  // 3. Timing — the strongest posting window, if there's enough history.
  const w = postingWindows(acc.posts);
  if (w.enough && w.best.length) {
    const top = w.best[0];
    out.push({
      id: `timing-${platform}`,
      platform,
      kind: "timing",
      tone: "info",
      tag: top.confidence === "early" ? "Early signal" : "Best time",
      title: `Your strongest engagement landed ${top.label}`,
      body: `${relText(top.rel)} across ${plural(top.n, "post")} in that window.${top.confidence === "early" ? " Fewer than 4 posts, so an early signal." : ""}`,
      observed: [`${top.label}: ${relText(top.rel)} (${plural(top.n, "post")})`, `Sample: ${w.posts} dated posts, medians vs your typical`],
      interpretation: "Posts in that window earned more in this sample. That's when they landed, not proof the hour caused it.",
      recommendation: `Schedule this week's most important post for ${top.label} and compare it with your typical.`,
      postIds: top.postIds,
    });
  }

  // 4. Trend — last 5 vs previous 5 dated posts.
  if (dated.length >= 10) {
    const sorted = [...dated].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const a = median(sorted.slice(0, 5).map((p) => engOf(p)!))!;
    const b = median(sorted.slice(5, 10).map((p) => engOf(p)!))!;
    if (b > 0 && Math.abs(a / b - 1) >= 0.25) {
      const up = a > b;
      out.push({
        id: `trend-${platform}`,
        platform,
        kind: "trend",
        tone: up ? "up" : "down",
        tag: up ? "Recent lift" : "Recent decline",
        title: up ? `Your last 5 posts earned ${fmtMult(a / b)} the median of the 5 before` : `Your last 5 posts earned ${Math.round((1 - a / b) * 100)}% fewer median interactions than the 5 before`,
        body: `Median ${round(a)} vs ${round(b)} interactions per post.`,
        observed: [`Last 5 posts: median ${round(a)}`, `Previous 5: median ${round(b)}`],
        interpretation: up ? "Whatever changed in the last five is working; hold it while you test one variable at a time." : "The recent five share something the earlier ones didn't; compare hooks and formats before changing more.",
        recommendation: up ? "Keep the current mix another week and measure again." : "Re-run your best format from the earlier group this week.",
        postIds: sorted.slice(0, 5).map((p) => p.id),
      });
    }
  }

  // 5. Cadence — posting rate dropped.
  const cur = postsPerWeek(dated.map((p) => p.publishedAt), 30);
  const prev = postsPerWeek(dated.map((p) => p.publishedAt), 60);
  if (cur != null && prev != null) {
    const prev30 = Math.max(0, prev * 2 - cur);
    if (prev30 > 0 && cur / prev30 <= 0.7) {
      out.push({
        id: `cadence-${platform}`,
        platform,
        kind: "cadence",
        tone: "down",
        tag: "Cadence",
        title: `Posting dropped to ${cur.toFixed(1)}/week`,
        body: `From ${prev30.toFixed(1)}/week in the 30 days before.`,
        observed: [`Last 30 days: ${cur.toFixed(1)} posts/week`, `Previous 30 days: ${prev30.toFixed(1)} posts/week`],
        interpretation: `Fewer posts means fewer chances for ${label} to test your content with new people; reach tends to follow cadence.`,
        recommendation: `Get back to about ${Math.max(3, Math.round(prev30))} posts a week.`,
        postIds: [],
      });
    }
  }

  return out;
}

/** Cross-platform insights for the All-Accounts view. Comparisons are relative
 *  (each platform against its own typical) or absolute counts stated as such —
 *  never pretending audiences on different platforms are the same people. */
export function crossPlatformInsights(accounts: NormalizedAccountAnalytics[]): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  if (accounts.length < 2) return out;

  // Audience growth leader (absolute net adds, stated per platform).
  const growth = accounts
    .map((a) => ({ a, net: a.series.net_followers?.total ?? null }))
    .filter((x): x is { a: NormalizedAccountAnalytics; net: number } => x.net != null);
  if (growth.length >= 2) {
    growth.sort((x, y) => y.net - x.net);
    const lead = growth[0];
    if (lead.net > 0) {
      out.push({
        id: "platform-growth",
        platform: "all",
        kind: "platform",
        tone: "up",
        tag: "Where you grew",
        title: `${platformCapability(lead.a.account.platform).label} added the most audience this period`,
        body: growth.map((g) => `${platformCapability(g.a.account.platform).label} ${g.net >= 0 ? "+" : ""}${round(g.net)} ${g.a.account.audienceLabel.toLowerCase()}`).join(" · "),
        observed: growth.map((g) => `${platformCapability(g.a.account.platform).label}: ${g.net >= 0 ? "+" : ""}${round(g.net)} ${g.a.account.audienceLabel.toLowerCase()}`),
        interpretation: "These are net adds on each platform. They aren't the same people, so read this as where your reach is compounding fastest, not one audience.",
        recommendation: `Put an extra post this week on ${platformCapability(lead.a.account.platform).label} while it's compounding.`,
        postIds: [],
      });
    }
  }

  // Best single breakout across platforms (relative to that platform's typical).
  const breakouts = accounts
    .map((a) => {
      const top = [...a.posts].filter((p) => p.multiplier != null).sort((x, y) => (y.multiplier ?? 0) - (x.multiplier ?? 0))[0];
      return top && top.multiplier != null ? { a, top } : null;
    })
    .filter((x): x is { a: NormalizedAccountAnalytics; top: NormalizedPost } => x != null && x.top.multiplier! >= 3);
  if (breakouts.length) {
    breakouts.sort((x, y) => (y.top.multiplier ?? 0) - (x.top.multiplier ?? 0));
    const b = breakouts[0];
    out.push({
      id: "platform-breakout",
      platform: "all",
      kind: "platform",
      tone: "up",
      tag: "Top breakout",
      title: `Your biggest breakout was on ${platformCapability(b.a.account.platform).label}`,
      body: `"${b.top.title.slice(0, 48)}" earned ${fmtMult(b.top.multiplier!)} that account's typical interactions.`,
      observed: [`${platformCapability(b.a.account.platform).label}: ${statLine(b.top, true)} (${fmtMult(b.top.multiplier!)} typical interactions)`],
      interpretation: "Relative to each platform's own norm, this was your standout post. Compare its hook and format against your usual.",
      recommendation: `Adapt "${b.top.title.slice(0, 40)}" for your other platforms and compare.`,
      postIds: [b.top.id],
    });
  }

  return out;
}
