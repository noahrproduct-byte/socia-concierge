// Normalized content-format taxonomy. Each platform names its content types
// differently (Instagram media_type, YouTube duration/live flag, Facebook
// status_type); baselines and comparisons only make sense like-with-like
// (Reels vs Reels, Shorts vs Shorts), so adapters map native types into the
// shared ContentFormat here. When a platform doesn't tell us, we return "post"
// rather than guessing a specific format.

import type { ContentFormat, Platform } from "./types";

const LABELS: Record<ContentFormat, string> = {
  reel: "Reel",
  short: "Short",
  video: "Video",
  photo: "Photo",
  carousel: "Carousel",
  story: "Story",
  live: "Live",
  text: "Text",
  link: "Link",
  post: "Post",
};

export function formatLabel(f: ContentFormat): string {
  return LABELS[f] ?? "Post";
}

/** Plural label for grouped views, e.g. "Reels", "Photos". */
export function formatLabelPlural(f: ContentFormat): string {
  return `${formatLabel(f)}s`;
}

// Instagram media_type → normalized. Matches the existing lib/overview mapping
// (VIDEO surfaces as Reel for professional accounts) but in normalized keys.
export function instagramFormat(mediaType: string | undefined | null): ContentFormat {
  switch ((mediaType ?? "").toUpperCase()) {
    case "VIDEO":
      return "reel";
    case "CAROUSEL_ALBUM":
      return "carousel";
    case "IMAGE":
      return "photo";
    case "STORY":
      return "story";
    default:
      return "post";
  }
}

// YouTube has no explicit "Short" type on the Data API; classification is a
// duration heuristic (<= 60s counts as a Short) plus the live-broadcast flag.
// Kept deliberately conservative and honest — when duration is unknown we
// return "video", never a guessed Short.
export function youtubeFormat(input: { durationSec?: number | null; liveBroadcastContent?: string | null }): ContentFormat {
  if (input.liveBroadcastContent && input.liveBroadcastContent !== "none") return "live";
  const d = input.durationSec;
  if (d != null && d > 0 && d <= 60) return "short";
  return "video";
}

// Facebook status_type / attachment → normalized.
export function facebookFormat(statusType: string | undefined | null): ContentFormat {
  switch ((statusType ?? "").toLowerCase()) {
    case "added_photos":
    case "added_photo":
      return "photo";
    case "added_video":
    case "video":
      return "video";
    case "shared_story":
    case "shared_link":
      return "link";
    case "mobile_status_update":
    case "status":
      return "text";
    default:
      return "post";
  }
}

// TikTok content is video-first (photo mode exists). Left minimal until the
// integration lands; adapters shouldn't call this yet.
export function tiktokFormat(mediaType: string | undefined | null): ContentFormat {
  return (mediaType ?? "").toLowerCase() === "photo" ? "photo" : "video";
}

/** Dispatch to the right native→normalized mapper for a platform. */
export function normalizeFormat(platform: Platform, native: string | undefined | null, extra?: { durationSec?: number | null; liveBroadcastContent?: string | null }): ContentFormat {
  switch (platform) {
    case "instagram":
      return instagramFormat(native);
    case "youtube":
      return youtubeFormat({ durationSec: extra?.durationSec, liveBroadcastContent: extra?.liveBroadcastContent ?? native });
    case "facebook":
      return facebookFormat(native);
    case "tiktok":
      return tiktokFormat(native);
  }
}
