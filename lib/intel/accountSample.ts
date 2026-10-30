// What SOCIA can read about a brand's connected accounts, as one sample for
// classification, plus the facts it can state without any AI: how often each
// account posts, in which formats, and which posts did best against that
// account's own median. Pure: the caller loads the platform data
// (lib/api/sources.ts loadSources) and passes it in.

import type { IgMediaItem } from "../instagramSync";
import type { FbPost } from "../facebookSync";
import type { YtVideo } from "../youtube";
import type { TtVideo } from "../tiktokAuth";
import type { GoalPlatform } from "../growth";
import { interactionsTotal } from "../engagement";

export type SamplePost = {
  platform: GoalPlatform;
  id: string;
  date: string | null;
  format: string;
  text: string;
  /** The platform's own headline number for the post, and what it is. */
  metric: { name: string; value: number } | null;
};

export type PlatformFacts = {
  platform: GoalPlatform;
  handle: string | null;
  followers: number | null;
  bio: string | null;
  postsSampled: number;
  postsLast30: number;
  postsPerWeek: number | null;
  formats: { format: string; count: number }[];
  /** Up to three posts at least 1.5x this account's own median, by that platform's metric. */
  standouts: { text: string; format: string; multiple: number; metric: string; value: number }[];
};

export type AccountSample = { facts: PlatformFacts[]; posts: SamplePost[] };

export type SampleInput = {
  now: Date;
  ig: { username: string | null; name: string | null; biography: string | null; followers: number | null; media: IgMediaItem[] } | null;
  fb: { name: string | null; followers: number | null; posts: FbPost[] } | null;
  yt: { title: string | null; handle: string | null; subscribers: number | null; videos: YtVideo[] } | null;
  tt: { username: string | null; followers: number | null; videos: TtVideo[] } | null;
};

const DAY = 86_400_000;
const clip = (s: string | null | undefined, n = 220) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const igFormat = (m: IgMediaItem) =>
  m.media_product_type === "REELS" || m.media_type === "VIDEO" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Photo";

function factsFor(platform: GoalPlatform, handle: string | null, followers: number | null, bio: string | null, posts: SamplePost[], now: Date): PlatformFacts {
  const dated = posts.filter((p) => p.date && !Number.isNaN(Date.parse(p.date)));
  const last30 = dated.filter((p) => now.getTime() - Date.parse(p.date!) <= 30 * DAY).length;
  const formats = new Map<string, number>();
  for (const p of posts) formats.set(p.format, (formats.get(p.format) ?? 0) + 1);
  const measured = posts.filter((p) => p.metric && p.metric.value >= 0);
  const med = median(measured.map((p) => p.metric!.value));
  const standouts =
    measured.length >= 5 && med && med > 0
      ? measured
          .map((p) => ({ p, multiple: p.metric!.value / med }))
          .filter((x) => x.multiple >= 1.5)
          .sort((a, b) => b.multiple - a.multiple)
          .slice(0, 3)
          .map(({ p, multiple }) => ({ text: clip(p.text, 80) || "(no caption)", format: p.format, multiple: Math.round(multiple * 10) / 10, metric: p.metric!.name, value: p.metric!.value }))
      : [];
  return {
    platform,
    handle,
    followers,
    bio: bio ? clip(bio, 300) : null,
    postsSampled: posts.length,
    postsLast30: last30,
    postsPerWeek: dated.length ? Math.round((last30 / (30 / 7)) * 10) / 10 : null,
    formats: [...formats.entries()].map(([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count),
    standouts,
  };
}

export function buildAccountSample(input: SampleInput, perPlatform = 20): AccountSample {
  const facts: PlatformFacts[] = [];
  const posts: SamplePost[] = [];

  if (input.ig) {
    const ps: SamplePost[] = input.ig.media.filter((m) => !m.collab_owner).slice(0, perPlatform).map((m, i) => ({
      platform: "instagram",
      id: m.id ?? `ig${i}`,
      date: m.timestamp ?? null,
      format: igFormat(m),
      text: clip(m.caption),
      metric: m.insights?.views != null ? { name: "views", value: m.insights.views } : { name: "interactions", value: interactionsTotal(m) },
    }));
    facts.push(factsFor("instagram", input.ig.username, input.ig.followers, input.ig.biography, ps, input.now));
    posts.push(...ps);
  }
  if (input.yt) {
    const ps: SamplePost[] = input.yt.videos.slice(0, perPlatform).map((v) => ({
      platform: "youtube",
      id: v.videoId,
      date: v.publishedAt,
      format: v.durationSec != null && v.durationSec <= 60 ? "Short" : "Video",
      text: clip(v.title),
      metric: v.views != null ? { name: "views", value: v.views } : null,
    }));
    facts.push(factsFor("youtube", input.yt.handle ?? input.yt.title, input.yt.subscribers, null, ps, input.now));
    posts.push(...ps);
  }
  if (input.tt) {
    const ps: SamplePost[] = input.tt.videos.slice(0, perPlatform).map((v) => ({
      platform: "tiktok",
      id: v.id,
      date: v.createdAt,
      format: "Video",
      text: clip(v.caption),
      metric: v.views != null ? { name: "views", value: v.views } : null,
    }));
    facts.push(factsFor("tiktok", input.tt.username, input.tt.followers, null, ps, input.now));
    posts.push(...ps);
  }
  if (input.fb) {
    const ps: SamplePost[] = input.fb.posts.slice(0, perPlatform).map((p, i) => ({
      platform: "facebook",
      id: p.id ?? `fb${i}`,
      date: p.created_time ?? null,
      format: p.status_type === "added_video" ? "Video" : p.full_picture ? "Photo" : "Text",
      text: clip(p.message),
      metric: p.reactions != null || p.comments != null || p.shares != null
        ? { name: "interactions", value: (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) }
        : null,
    }));
    facts.push(factsFor("facebook", input.fb.name, input.fb.followers, null, ps, input.now));
    posts.push(...ps);
  }
  return { facts, posts };
}

/** Enough text to classify honestly: at least three posts with words, or a bio. */
export const sampleIsEnough = (s: AccountSample) =>
  s.posts.filter((p) => p.text.length >= 15).length >= 3 || s.facts.some((f) => (f.bio ?? "").length >= 20);
