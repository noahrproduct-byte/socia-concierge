// Facebook adapter — the shallow platform. lib/facebookSync exposes a Page
// follower total and per-post reactions/comments/shares only: no views, no
// reach, no demographics, no daily series (Facebook doesn't provide them on the
// permissions SOCIA holds). The adapter emits exactly that and nothing more —
// every absent metric is UNAVAILABLE, never zero. Follower history begins only
// once the snapshot job records it (persistence phase), so there is no series
// here yet.

import type { FbPost, FbSnapshot } from "../../facebookSync";
import { platformCapability } from "../capabilities";
import { computeBaselines, multiplierFor } from "../baseline";
import { facebookFormat } from "../format";
import { displayTitle } from "../../overview";
import type { Metric, NormalizedAccountAnalytics, NormalizedPost } from "../types";

export type FacebookAdapterInput = { snap: FbSnapshot; days: number; now?: Date };

function knownSum(parts: (number | null | undefined)[]): number | null {
  const known = parts.filter((x): x is number => x != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

export function adaptFacebook(input: FacebookAdapterInput): NormalizedAccountAnalytics {
  const { snap, days } = input;
  const now = input.now ?? new Date();
  const cap = platformCapability("facebook");
  const since = now.getTime() - days * 86400000;

  const allPosts = snap.posts ?? [];
  const inRange = allPosts.filter((p: FbPost) => p.created_time && new Date(p.created_time).getTime() >= since);

  // ---- posts (with format-segmented vs-typical) ----
  const scored = allPosts
    .filter((p) => p.created_time)
    .sort((a, b) => new Date(b.created_time!).getTime() - new Date(a.created_time!).getTime())
    .map((p) => ({
      p,
      format: facebookFormat(p.status_type),
      engagement: knownSum([p.reactions, p.comments, p.shares]),
    }));
  const baselines = computeBaselines(scored.map((s) => ({ format: s.format, engagement: s.engagement })));
  const posts: NormalizedPost[] = scored.map((s, i) => ({
    id: s.p.id ?? String(i),
    platform: "facebook",
    format: s.format,
    title: displayTitle(s.p.message ?? ""),
    caption: s.p.message ?? "",
    publishedAt: s.p.created_time!,
    thumb: s.p.full_picture ?? null,
    permalink: s.p.permalink_url ?? null,
    metrics: { likes: s.p.reactions ?? null, comments: s.p.comments ?? null, shares: s.p.shares ?? null },
    engagement: s.engagement,
    multiplier: multiplierFor(s.engagement, s.format, baselines),
  }));

  // ---- KPIs (followers snapshot, posts in period, total engagement) ----
  const engTotal = knownSum(inRange.map((p) => knownSum([p.reactions, p.comments, p.shares])));
  const kpis: NormalizedAccountAnalytics["kpis"] = {
    followers: {
      value: snap.followers_count,
      status: snap.followers_count == null ? "UNAVAILABLE" : "VERIFIED",
      source: "Facebook Graph API: Page followers_count",
      method: "Current follower total reported by Facebook",
      period: "now",
      sampleSize: null,
    } as Metric,
    posts: {
      value: inRange.length,
      status: "CALCULATED",
      source: "Facebook Graph API: Page posts",
      method: "Count of posts published in the period",
      period: `last ${days} days`,
      sampleSize: inRange.length,
    } as Metric,
    engagement: {
      value: engTotal,
      status: engTotal == null ? "UNAVAILABLE" : "CALCULATED",
      source: "Facebook Graph API: reactions + comments + shares per post",
      method: "Sum of reactions, comments and shares across posts in the period",
      period: `last ${days} days`,
      sampleSize: inRange.length || null,
    } as Metric,
  };

  return {
    account: {
      platform: "facebook",
      accountId: snap.page_id ?? "",
      handle: snap.username,
      name: snap.page_name,
      avatar: snap.picture_url,
      audienceLabel: cap.audienceLabel,
      connectedAt: null,
      syncedAt: snap.last_synced_at,
    },
    kpis,
    // No daily series: Facebook exposes none, and SOCIA hasn't recorded follower
    // history for it yet. Empty is correct here — never a fabricated line.
    series: {},
    posts,
    demographics: { status: "unavailable", reason: "Facebook doesn't provide audience demographics on these permissions.", basis: "", dimensions: {} },
    baseline: baselines,
    collecting: false,
  };
}
