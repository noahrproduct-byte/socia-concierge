// Results for posts SOCIA published: the closed loop between the Content Plan,
// the Calendar and what the platforms later reported. Everything here reads
// data SOCIA already holds (the stored Instagram and Facebook snapshots, and
// the owner's own YouTube uploads) and compares a post with the account's OWN
// baseline — the median of its recent posts — never an industry number.
//
// Honesty rules:
//   • A post the platform has not reported yet is "measuring", never 0.
//   • A baseline needs at least MIN_SAMPLE posts; below that the raw number is
//     shown with no multiplier.
//   • Engagement settles over the first days; anything measured inside
//     SETTLE_HOURS of publishing is labelled early.
import type { IgMediaItem } from "./instagramSync";
import type { FbPost } from "./facebookSync";
import type { YtVideo } from "./youtube";
import { interactionsTotal } from "./engagement";
import { fbPostEngagement } from "./metrics/facebook";
import { median } from "./metrics";
import type { Platform } from "./publishing/types";
import { fmtMultiplier } from "./multiplier";

/** Posts needed before a median is a defensible baseline. */
export const MIN_SAMPLE = 5;
/** Hours after publishing before a result is treated as settled. */
export const SETTLE_HOURS = 72;

/** What each platform exposes per post, from data SOCIA stores. */
export type MeasureSources = {
  /** Synced Instagram media (null = no Instagram connection to read). */
  instagram: IgMediaItem[] | null;
  /** Synced Facebook Page posts. */
  facebook: FbPost[] | null;
  /** The owner's YouTube videos by id, for the published ids asked for. */
  youtube: Record<string, YtVideo> | null;
  /** The channel's recent uploads, the YouTube baseline. */
  youtubeRecent: YtVideo[] | null;
};

export const EMPTY_SOURCES: MeasureSources = { instagram: null, facebook: null, youtube: null, youtubeRecent: null };

export type Measurement = {
  platform: Platform;
  externalPostId: string;
  /** true only when the platform's data for THIS post was found. */
  found: boolean;
  /** What is compared: interactions (likes + comments + saves + shares; reactions + comments + shares on Facebook) or views (YouTube). */
  metric: "interactions" | "views";
  value: number | null;
  views: number | null;
  /** The account's median for the metric, when at least MIN_SAMPLE posts exist. */
  median: number | null;
  multiplier: number | null;
  sampleSize: number;
};

const unmeasured = (platform: Platform, externalPostId: string, metric: Measurement["metric"], med: number | null, sampleSize: number): Measurement => ({
  platform, externalPostId, found: false, metric, value: null, views: null, median: med, multiplier: null, sampleSize,
});

const baseline = (xs: number[]): { median: number | null; sampleSize: number } => {
  const med = xs.length >= MIN_SAMPLE ? median(xs) : null;
  return { median: med != null && med > 0 ? med : null, sampleSize: xs.length };
};

/** One published destination against the platform data in `sources`. */
export function measureDestination(platform: Platform, externalPostId: string, sources: MeasureSources): Measurement {
  if (platform === "instagram") {
    const media = sources.instagram ?? [];
    const dated = media.filter((m) => m.timestamp);
    const b = baseline(dated.map(interactionsTotal));
    const hit = media.find((m) => m.id === externalPostId);
    if (!hit) return unmeasured(platform, externalPostId, "interactions", b.median, b.sampleSize);
    const value = interactionsTotal(hit);
    return { platform, externalPostId, found: true, metric: "interactions", value, views: hit.insights?.views ?? null, median: b.median, multiplier: b.median ? value / b.median : null, sampleSize: b.sampleSize };
  }
  if (platform === "facebook") {
    const posts = sources.facebook ?? [];
    const counted = posts.map(fbPostEngagement).filter((v): v is number => v != null);
    const b = baseline(counted);
    const hit = posts.find((p) => p.id === externalPostId);
    const value = hit ? fbPostEngagement(hit) : null;
    if (!hit || value == null) return unmeasured(platform, externalPostId, "interactions", b.median, b.sampleSize);
    return { platform, externalPostId, found: true, metric: "interactions", value, views: null, median: b.median, multiplier: b.median ? value / b.median : null, sampleSize: b.sampleSize };
  }
  if (platform === "youtube") {
    const recent = (sources.youtubeRecent ?? []).filter((v) => v.videoId !== externalPostId && v.views != null);
    const b = baseline(recent.map((v) => v.views as number));
    const hit = sources.youtube?.[externalPostId];
    if (!hit || hit.views == null) return unmeasured(platform, externalPostId, "views", b.median, b.sampleSize);
    return { platform, externalPostId, found: true, metric: "views", value: hit.views, views: hit.views, median: b.median, multiplier: b.median ? hit.views / b.median : null, sampleSize: b.sampleSize };
  }
  // TikTok: SOCIA stores per-video totals, but the publisher does not yet learn the video id it created.
  return unmeasured(platform, externalPostId, "views", null, 0);
}

export const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };

/** "2.1×" / "0.8×": see lib/multiplier.ts (client-safe). */
export { fmtMultiplier };

export type ResultLine = {
  /** One plain sentence about the post against the account's own baseline. */
  text: string;
  /** Shorter form for a chip: "2.1× your median" / "measuring" / "412 views". */
  short: string;
  multiplier: number | null;
  /** Measured inside SETTLE_HOURS of publishing: the number will still move. */
  early: boolean;
  /** false while the platform has not reported this post yet. */
  measured: boolean;
};

const hoursSince = (iso: string | null, now: Date): number | null => (iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : null);

/** The sentence for one measurement, or the honest "measuring" state. */
export function resultLine(m: Measurement, publishedAt: string | null, now: Date = new Date()): ResultLine {
  const name = PLATFORM_NAME[m.platform];
  const unit = m.metric === "views" ? "views" : "interactions";
  if (!m.found || m.value == null) {
    const text = m.platform === "tiktok"
      ? "TikTok results can't be matched to this post yet."
      : `${name} hasn't reported this post yet. SOCIA measures it against your median once the numbers arrive.`;
    return { text, short: "measuring", multiplier: null, early: false, measured: false };
  }
  const h = hoursSince(publishedAt, now);
  const early = h != null && h < SETTLE_HOURS;
  const when = early ? ` so far (${Math.max(1, Math.round((h ?? 0) / 24))} day${Math.round((h ?? 0) / 24) === 1 ? "" : "s"} after posting)` : "";
  const n = m.value.toLocaleString("en-US");
  if (m.multiplier == null) {
    return {
      text: `${n} ${unit}${when}. SOCIA needs ${MIN_SAMPLE} ${name} posts before it can compare this with your median (${m.sampleSize} so far).`,
      short: `${n} ${unit}`,
      multiplier: null, early, measured: true,
    };
  }
  const mult = fmtMultiplier(m.multiplier);
  return {
    text: `${mult} your typical ${name} post${when} — ${n} ${unit} against a median of ${Math.round(m.median!).toLocaleString("en-US")} over ${m.sampleSize} posts.`,
    short: `${mult} your median${early ? " so far" : ""}`,
    multiplier: m.multiplier, early, measured: true,
  };
}
