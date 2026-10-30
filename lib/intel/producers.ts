// Producers turn data SOCIA already has into InsightDrafts. They reuse the
// existing detectors rather than duplicating them, and add the diagnostics
// the brief asks for. Pure: the caller passes the loaded data in.

import type { Insight as OverviewInsight } from "../overview";
import type { GoalPlatform } from "../growth";
import { confidenceFor, type InsightDraft, type InsightPost } from "./insight";

const HOUR = 3_600_000;
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------
// The Overview's Instagram detectors (lib/overview.ts buildInsights)
// ---------------------------------------------------------------------------

const LEARNING: Record<OverviewInsight["kind"], string> = {
  outlier: "Whether the format and opening, not the one-off subject, repeat the result.",
  format: "Whether this format keeps its lead as more posts use it.",
  location: "Whether naming the place changes who engages, measured on local follower growth.",
  window: "Whether the timing holds once the posts themselves are similar.",
  cadence: "Whether reach recovers when posting returns to the earlier pace.",
  trend: "Which single change explains the move, by changing one thing at a time.",
};

/** Sample size behind each detector, for confidenceFor. One breakout post is a lead; a cadence count is close to fact. */
const SAMPLE: Record<OverviewInsight["kind"], number> = { outlier: 1, format: 6, location: 4, window: 4, cadence: 12, trend: 5 };

export function fromOverviewInsights(list: OverviewInsight[], ctx: { handle: string | null; syncedAt: string | null; postsById: Map<string, InsightPost> }): InsightDraft[] {
  return list.map((i) => {
    const subject = i.kind === "outlier" ? i.postIds[0] ?? "post" : i.kind;
    return {
      fingerprint: `instagram:overview:${i.kind}:${subject}`,
      producer: "overview",
      category: i.kind === "cadence" || i.kind === "trend" ? "performance" : "content",
      platform: "instagram",
      title: i.title,
      observation: i.body,
      metrics: [],
      posts: i.postIds.map((id) => ctx.postsById.get(id)).filter((p): p is InsightPost => Boolean(p)),
      periodStart: null,
      periodEnd: ctx.syncedAt,
      explanations: i.interpretation ? [{ type: "hypothesis", text: i.interpretation }] : [],
      confidence: confidenceFor(SAMPLE[i.kind]),
      limitations: [
        "Per-post numbers are lifetime totals, so older posts have had longer to collect them.",
        ...(i.kind === "outlier" ? ["One post can't show which element made the difference."] : []),
      ],
      recommendation: { action: i.recommendation, why: i.observed[0] ?? i.body, learning: LEARNING[i.kind], href: "/tool" },
      source: { rule: `overview.${i.kind}`, data: i.observed, retrievedAt: ctx.syncedAt },
    };
  });
}

// ---------------------------------------------------------------------------
// Diagnostic: a recent post reporting zero views
// ---------------------------------------------------------------------------

export type RecentPost = { platform: GoalPlatform; id: string; title: string; permalink: string | null; publishedAt: string | null; views: number | null; format: string };

/**
 * A post published at least two hours before SOCIA last read the account
 * (and within the last three days) that reports zero views. Only when the
 * platform reported a view count at all: a missing number is not a zero.
 * The explanations are hypotheses; SOCIA can't see a platform's ranking.
 */
export function zeroViewDiagnostics(posts: RecentPost[], syncedAt: string | null, now: Date): InsightDraft[] {
  if (!syncedAt) return [];
  const read = Date.parse(syncedAt);
  return posts
    .filter((p) => p.views === 0 && p.publishedAt)
    .filter((p) => {
      const pub = Date.parse(p.publishedAt!);
      return read - pub >= 2 * HOUR && now.getTime() - pub <= 72 * HOUR;
    })
    .map((p) => {
      const ageH = Math.round((read - Date.parse(p.publishedAt!)) / HOUR);
      const name = p.platform === "youtube" ? "YouTube" : "Instagram";
      return {
        fingerprint: `${p.platform}:diagnostic:zero_views:${p.id}`,
        producer: "diagnostics",
        category: "diagnostic" as const,
        platform: p.platform,
        title: `"${short(p.title || "Your latest post")}" is reporting zero views`,
        observation: `${name} reported 0 views for this ${p.format.toLowerCase()} ${ageH} hours after it was published, when SOCIA last read the account.`,
        metrics: [
          { label: "Views reported", value: 0, unit: "count" as const, basis: `${name}, read ${new Date(read).toISOString().slice(0, 16).replace("T", " ")} UTC` },
          { label: "Hours since publishing", value: ageH, unit: "hours" as const, basis: "at the time of that read" },
        ],
        posts: [{ platform: p.platform, id: p.id, title: p.title, permalink: p.permalink }],
        periodStart: p.publishedAt,
        periodEnd: syncedAt,
        explanations: [
          { type: "hypothesis" as const, text: `${name} may not have reported views yet; counts can arrive hours late.` },
          { type: "hypothesis" as const, text: "The post may not be publicly visible (private, unlisted, a trial or still processing)." },
          { type: "hypothesis" as const, text: "Distribution may be limited for a reason the platform doesn't share with apps." },
        ],
        confidence: 40,
        limitations: [
          "SOCIA can't yet see when your earlier posts got their first views, so it can't compare these hours with your usual start.",
          "Platforms don't share ranking decisions with apps, so the cause can't be confirmed from here.",
        ],
        recommendation: {
          action: "Open the post on the platform and confirm it is public, then check the account's status page for notices. Look again after the next refresh.",
          why: "These checks separate a reporting delay or a visibility setting from a real lack of views.",
          learning: "Whether this is a delay, a setting, or a distribution problem.",
          href: p.permalink,
        },
        source: { rule: "diagnostic.zero_views: views == 0, published 2-72h before the read", data: [`views 0 at ${ageH}h`], retrievedAt: syncedAt },
      };
    });
}
