// The "All Platforms" view model. Combines across platforms ONLY where the
// combination is mathematically valid:
//   - Audience  = sum of followers/subscribers (all are audience-size levels)
//   - Content   = sum of posts/videos published in the range (all are counts)
//   - Engagement= sum of per-item engagement (DIRECTIONAL — each platform counts
//                 it a little differently, said so plainly)
// There is deliberately NO combined "views"/"reach": Instagram reach, YouTube
// views, Facebook (none) and TikTok views are different measurements, so a
// single number would be false precision. Views stay per-platform.
//
// Pure: the page gathers each platform's summary, this assembles the view.

export type PlatformKey = "instagram" | "youtube" | "facebook" | "tiktok";

export const PLATFORM_NAME: Record<PlatformKey, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/** One platform's contribution, using its OWN native metrics. A metric the
 *  platform doesn't provide is null (with a reason), never 0. */
export type PlatformSummary = {
  platform: PlatformKey;
  connected: boolean;
  label: string;
  /** Followers or subscribers — an audience-size level. */
  audience: number | null;
  audienceLabel: string;
  /** Platform-native views in range, where the platform reports them. */
  views: number | null;
  viewsNote: string | null;
  /** Per-item engagement total in range (directional across platforms). */
  engagement: number | null;
  /** Posts/videos published in range. */
  contentPublished: number | null;
};

export type CombinedMetric = { value: number | null; note: string };

export type AllPlatformsData = {
  presence: { platform: PlatformKey; label: string; connected: boolean }[];
  combined: { audience: CombinedMetric; contentPublished: CombinedMetric; engagement: CombinedMetric };
  /** Connected platforms first (by audience), then the rest. */
  platforms: PlatformSummary[];
  insights: { id: string; title: string; body: string }[];
  connectedCount: number;
};

const ORDER: PlatformKey[] = ["instagram", "youtube", "facebook", "tiktok"];

export function buildAllPlatforms(summaries: PlatformSummary[]): AllPlatformsData {
  const byKey = new Map(summaries.map((s) => [s.platform, s]));
  const ordered = ORDER.map((k) => byKey.get(k)).filter((s): s is PlatformSummary => Boolean(s));
  const connected = ordered.filter((s) => s.connected);
  const n = connected.length;

  const sumOf = (pick: (s: PlatformSummary) => number | null): number | null => {
    const vals = connected.map(pick).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const plural = (count: number) => (count === 1 ? "platform" : "platforms");
  const combined = {
    audience: {
      value: sumOf((s) => s.audience),
      note: `Followers and subscribers across your ${n} connected ${plural(n)}.`,
    },
    contentPublished: {
      value: sumOf((s) => s.contentPublished),
      note: `Posts and videos published in this period across your connected platforms.`,
    },
    engagement: {
      value: sumOf((s) => s.engagement),
      note: `Likes, comments, shares and reactions across platforms — directional, since each platform defines engagement a little differently.`,
    },
  };

  const insights: AllPlatformsData["insights"] = [];

  const withAudience = connected.filter((s) => s.audience != null);
  if (withAudience.length >= 2) {
    const top = [...withAudience].sort((a, b) => b.audience! - a.audience!)[0];
    insights.push({
      id: "audience",
      title: "Largest audience",
      body: `Your biggest audience is on ${PLATFORM_NAME[top.platform]} — ${top.audience!.toLocaleString("en-US")} ${top.audienceLabel}.`,
    });
  }

  const withEng = connected.filter((s) => s.engagement != null && s.engagement > 0);
  if (withEng.length >= 2) {
    const top = [...withEng].sort((a, b) => b.engagement! - a.engagement!)[0];
    insights.push({
      id: "engagement",
      title: "Engagement leader",
      body: `${PLATFORM_NAME[top.platform]} drove the most engagement this period (${top.engagement!.toLocaleString("en-US")}). Platforms count engagement differently, so read this as direction, not a like-for-like total.`,
    });
  }

  const withContent = connected.filter((s) => s.contentPublished != null);
  const totalContent = withContent.reduce((a, s) => a + (s.contentPublished ?? 0), 0);
  if (withContent.length >= 2 && totalContent > 0) {
    const top = [...withContent].sort((a, b) => (b.contentPublished ?? 0) - (a.contentPublished ?? 0))[0];
    insights.push({
      id: "cadence",
      title: "Where you're publishing",
      body: `Of the ${totalContent} posts you published this period, most went to ${PLATFORM_NAME[top.platform]} (${top.contentPublished}).`,
    });
  }

  if (!insights.length && n >= 1) {
    insights.push({
      id: "collecting",
      title: "Building your cross-platform picture",
      body: "As SOCIA records more days of history across your connected platforms, verified cross-platform observations will appear here.",
    });
  }

  return {
    presence: ORDER.map((k) => {
      const s = byKey.get(k);
      return { platform: k, label: PLATFORM_NAME[k], connected: Boolean(s?.connected) };
    }),
    combined,
    platforms: [...connected.sort((a, b) => (b.audience ?? -1) - (a.audience ?? -1)), ...ordered.filter((s) => !s.connected)],
    insights,
    connectedCount: n,
  };
}
