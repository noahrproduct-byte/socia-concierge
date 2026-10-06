// The capability model: what each platform's CURRENT API allows, what SOCIA
// has implemented, and what a given connected account can do right now.
// The composer renders from this; nothing in the UI hardcodes a platform rule.
//
// Every limit below was taken from the official developer documentation on
// 2026-09-21 (URLs in `sources`). If a number is not documented, it is not
// here. Where the docs disagree, the stricter value is used and noted.
//
// Client-safe: no server imports.

import type { Platform, MediaKind, InstagramFormat } from "./types";

export type MediaRule = {
  kinds: MediaKind[];
  /** Accepted MIME types for the file picker and validation. */
  mimes: string[];
  maxBytes: number;
  minItems: number;
  maxItems: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  minWidth?: number;
  maxWidth?: number;
  /** width / height */
  aspectMin?: number;
  aspectMax?: number;
  recommendedAspect?: string;
  /** Human notes shown next to the picker (documented facts only). */
  notes: string[];
};

export type CaptionRule = {
  /** Which settings field carries the text on this platform. */
  field: "caption" | "title" | "description";
  max: number;
  /** Bytes instead of characters (YouTube description). */
  unit: "chars" | "bytes";
  maxHashtags?: number;
  maxMentions?: number;
  forbiddenChars?: string[];
};

export type FormatId = InstagramFormat | "video" | "feed" | "photo";

export type FormatSpec = {
  id: FormatId;
  label: string;
  media: MediaRule;
  caption: CaptionRule;
  /** SOCIA can publish this format today (adapter exists). */
  implemented: boolean;
};

export type Feature =
  | "cover" | "altText" | "userTags" | "collaborators" | "location" | "aiDisclosure" | "brandedContent"
  | "commentsToggle" | "duetStitch" | "madeForKids" | "playlist" | "privacy" | "tags" | "title" | "description"
  | "thumbnail" | "nativeScheduling" | "shareToFeed";

export type FeatureState = "supported" | "unsupported" | "unverified" | "needs_scope";

export type PlatformCapabilities = {
  platform: Platform;
  label: string;
  /** Adapter exists and can publish at least one format. */
  implemented: boolean;
  formats: FormatSpec[];
  features: Record<Feature, FeatureState>;
  /** Extra text-field limits the settings form enforces. */
  fields: {
    title?: { max: number; forbiddenChars?: string[] };
    description?: { maxBytes: number; forbiddenChars?: string[] };
    tags?: { maxTotalChars: number };
    altText?: { max: number };
  };
  /** Honest one-liners the UI shows for this platform (facts, not promises). */
  notes: string[];
  sources: string[];
};

const MB = 1024 * 1024;

const INSTAGRAM: PlatformCapabilities = {
  platform: "instagram",
  label: "Instagram",
  implemented: true,
  formats: [
    {
      id: "reel",
      label: "Reel",
      implemented: true,
      media: {
        kinds: ["video"], mimes: ["video/mp4", "video/quicktime"], maxBytes: 300 * MB, minItems: 1, maxItems: 1,
        minDurationSec: 3, maxDurationSec: 15 * 60, maxWidth: 1920, aspectMin: 0.01, aspectMax: 10, recommendedAspect: "9:16",
        notes: ["MP4 or MOV, H.264 or HEVC, up to 300 MB, 3 seconds to 15 minutes.", "9:16 is recommended; other ratios are cropped by Instagram."],
      },
      caption: { field: "caption", max: 2200, unit: "chars", maxHashtags: 30, maxMentions: 20 },
    },
    {
      id: "image",
      label: "Image",
      implemented: true,
      media: {
        kinds: ["image"], mimes: ["image/jpeg"], maxBytes: 8 * MB, minItems: 1, maxItems: 1,
        minWidth: 320, maxWidth: 1440, aspectMin: 0.8, aspectMax: 1.91, recommendedAspect: "4:5 to 1.91:1",
        notes: ["JPEG only, up to 8 MB, 320 to 1440 px wide, aspect ratio between 4:5 and 1.91:1."],
      },
      caption: { field: "caption", max: 2200, unit: "chars", maxHashtags: 30, maxMentions: 20 },
    },
    {
      id: "carousel",
      label: "Carousel",
      implemented: true,
      media: {
        kinds: ["image"], mimes: ["image/jpeg"], maxBytes: 8 * MB, minItems: 2, maxItems: 10,
        minWidth: 320, maxWidth: 1440, aspectMin: 0.8, aspectMax: 1.91,
        notes: ["2 to 10 JPEG images. Instagram crops every image to the first image's aspect ratio."],
      },
      caption: { field: "caption", max: 2200, unit: "chars", maxHashtags: 30, maxMentions: 20 },
    },
  ],
  features: {
    cover: "supported", altText: "supported", userTags: "supported", collaborators: "unverified", location: "unsupported",
    aiDisclosure: "supported", brandedContent: "unsupported", commentsToggle: "needs_scope", duetStitch: "unsupported",
    madeForKids: "unsupported", playlist: "unsupported", privacy: "unsupported", tags: "unsupported", title: "unsupported",
    description: "unsupported", thumbnail: "supported", nativeScheduling: "unsupported", shareToFeed: "supported",
  },
  fields: { altText: { max: 1000 } },
  notes: [
    "Instagram does not schedule posts itself; SOCIA publishes at the chosen time.",
    "Collab posts: Meta's Instagram-Login guide doesn't list collaborators, so SOCIA checks them with Instagram on a test that posts nothing before you can schedule.",
    "Location tags, paid-partnership labels and product tags need the Facebook-Login version of the API and are not available.",
  ],
  sources: [
    "https://developers.facebook.com/docs/instagram-platform/content-publishing",
    "https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media",
  ],
};

const YOUTUBE: PlatformCapabilities = {
  platform: "youtube",
  label: "YouTube",
  implemented: true,
  formats: [
    {
      id: "video",
      label: "Video",
      implemented: true,
      media: {
        kinds: ["video"], mimes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"], maxBytes: 256 * 1024 * MB, minItems: 1, maxItems: 1,
        notes: ["Any common video file. A vertical video up to 3 minutes is shown as a Short.", "Uploads go from your browser straight to YouTube."],
      },
      caption: { field: "description", max: 5000, unit: "bytes", forbiddenChars: ["<", ">"] },
    },
  ],
  features: {
    cover: "unsupported", altText: "unsupported", userTags: "unsupported", collaborators: "unsupported", location: "unsupported",
    aiDisclosure: "supported", brandedContent: "unsupported", commentsToggle: "unsupported", duetStitch: "unsupported",
    madeForKids: "supported", playlist: "supported", privacy: "supported", tags: "supported", title: "supported",
    description: "supported", thumbnail: "supported", nativeScheduling: "supported", shareToFeed: "unsupported",
  },
  fields: {
    title: { max: 100, forbiddenChars: ["<", ">"] },
    description: { maxBytes: 5000, forbiddenChars: ["<", ">"] },
    tags: { maxTotalChars: 500 },
  },
  notes: [
    "YouTube schedules natively: a scheduled video is uploaded now as private and goes live at the chosen time.",
    "Until Google completes its API audit of SOCIA, videos uploaded through SOCIA stay private on YouTube regardless of the visibility chosen.",
    "Custom thumbnails need a channel YouTube has enabled for them; otherwise YouTube keeps its own.",
  ],
  sources: [
    "https://developers.google.com/youtube/v3/docs/videos/insert",
    "https://developers.google.com/youtube/v3/docs/videos",
    "https://developers.google.com/youtube/v3/docs/thumbnails/set",
    "https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits",
  ],
};

const FACEBOOK: PlatformCapabilities = {
  platform: "facebook",
  label: "Facebook",
  implemented: true,
  formats: [
    {
      id: "feed",
      label: "Page post",
      implemented: true,
      media: {
        kinds: ["image", "video"], mimes: ["image/jpeg", "image/png", "image/gif", "video/mp4"], maxBytes: 10 * MB, minItems: 0, maxItems: 10,
        notes: ["Photos up to 10 MB (JPEG, PNG, GIF)."],
      },
      caption: { field: "caption", max: 63206, unit: "chars" },
    },
  ],
  features: {
    cover: "supported", altText: "supported", userTags: "unsupported", collaborators: "unsupported", location: "supported",
    aiDisclosure: "supported", brandedContent: "unsupported", commentsToggle: "unsupported", duetStitch: "unsupported",
    madeForKids: "unsupported", playlist: "unsupported", privacy: "unsupported", tags: "unsupported", title: "supported",
    description: "supported", thumbnail: "supported", nativeScheduling: "supported", shareToFeed: "unsupported",
  },
  fields: {},
  notes: ["Publishes text, a photo, several photos, or a video to the Page feed. Needs the pages_manage_posts permission: granted to Pages the app admins/testers manage today, and to all users' Pages once Meta approves it. Reconnect Facebook after granting it."],
  sources: ["https://developers.facebook.com/docs/pages-api/posts/", "https://developers.facebook.com/docs/video-api/guides/reels-publishing/"],
};

const TIKTOK: PlatformCapabilities = {
  platform: "tiktok",
  label: "TikTok",
  implemented: true,
  formats: [
    {
      id: "video",
      label: "Video",
      implemented: true,
      media: {
        kinds: ["video"], mimes: ["video/mp4", "video/quicktime", "video/webm"], maxBytes: 4 * 1024 * MB, minItems: 1, maxItems: 1,
        maxDurationSec: 10 * 60, minWidth: 360, maxWidth: 4096,
        notes: ["MP4, MOV or WebM, up to 10 minutes; each creator has their own maximum length."],
      },
      caption: { field: "caption", max: 2200, unit: "chars" },
    },
  ],
  features: {
    cover: "supported", altText: "unsupported", userTags: "unsupported", collaborators: "unsupported", location: "unsupported",
    aiDisclosure: "supported", brandedContent: "supported", commentsToggle: "supported", duetStitch: "supported",
    madeForKids: "unsupported", playlist: "unsupported", privacy: "supported", tags: "unsupported", title: "unsupported",
    description: "unsupported", thumbnail: "unsupported", nativeScheduling: "unsupported", shareToFeed: "unsupported",
  },
  fields: {},
  notes: [
    "Videos are uploaded to your TikTok inbox as drafts: you finish and post them in the TikTok app. Direct posting switches on once TikTok approves SOCIA's video.publish scope.",
    "Until TikTok completes its audit of SOCIA, videos posted directly are limited to private visibility.",
  ],
  sources: ["https://developers.tiktok.com/doc/content-posting-api-get-started", "https://developers.tiktok.com/doc/content-sharing-guidelines"],
};

export const CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  instagram: INSTAGRAM,
  youtube: YOUTUBE,
  facebook: FACEBOOK,
  tiktok: TIKTOK,
};

export function formatSpec(platform: Platform, id: FormatId): FormatSpec | null {
  return CAPABILITIES[platform].formats.find((f) => f.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Availability for a specific connected account, right now.
// ---------------------------------------------------------------------------

export type Availability =
  | { state: "available"; notes: string[] }
  | { state: "needs_scope"; reason: string; action: "reconnect"; notes: string[] }
  | { state: "needs_approval"; reason: string; notes: string[] }
  | { state: "not_connected"; reason: string; notes: string[] }
  | { state: "coming_soon"; reason: string; notes: string[] };

export const IG_PUBLISH_SCOPE = "instagram_business_content_publish";
/** Pages API: publish posts to a Facebook Page. */
export const FB_PUBLISH_SCOPE = "pages_manage_posts";
/** Content Posting API: upload to the creator's inbox (drafts). */
export const TT_UPLOAD_SCOPE = "video.upload";
/** Content Posting API: post directly to the profile. */
export const TT_PUBLISH_SCOPE = "video.publish";
/** Any of these lets SOCIA upload; `youtube` also allows editing and playlists. */
export const YT_WRITE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export function availabilityFor(
  platform: Platform,
  account: { status: "connected" | "expired"; suspended: boolean; scopes: string[] | null } | null,
): Availability {
  const caps = CAPABILITIES[platform];
  if (!caps.implemented) return { state: "needs_approval", reason: caps.notes[0], notes: caps.notes };
  if (!account) return { state: "not_connected", reason: `Connect ${caps.label} in Settings to publish there.`, notes: caps.notes };
  if (account.suspended) return { state: "not_connected", reason: `This ${caps.label} account is paused by your plan.`, notes: caps.notes };
  if (account.status === "expired") return { state: "needs_scope", reason: `${caps.label} needs to be reconnected.`, action: "reconnect", notes: caps.notes };
  if (platform === "instagram") {
    // A null scope list is a pre-scope-tracking connection; the publisher tries it.
    if (account.scopes && !account.scopes.includes(IG_PUBLISH_SCOPE)) {
      return { state: "needs_scope", reason: "Reconnect Instagram to allow publishing.", action: "reconnect", notes: caps.notes };
    }
    return { state: "available", notes: caps.notes };
  }
  if (platform === "youtube") {
    if (!account.scopes || !account.scopes.some((s) => YT_WRITE_SCOPES.includes(s))) {
      return { state: "needs_scope", reason: "Reconnect YouTube to allow uploads.", action: "reconnect", notes: caps.notes };
    }
    return { state: "available", notes: caps.notes };
  }
  if (platform === "tiktok") {
    // Either posting scope lets SOCIA upload; the adapter picks inbox vs direct.
    if (account.scopes && !account.scopes.includes(TT_UPLOAD_SCOPE) && !account.scopes.includes(TT_PUBLISH_SCOPE)) {
      return { state: "needs_scope", reason: "Reconnect TikTok to allow uploads.", action: "reconnect", notes: caps.notes };
    }
    return { state: "available", notes: caps.notes };
  }
  if (platform === "facebook") {
    // Facebook connections don't record scopes yet, so a null list is tried and
    // the publisher reports a missing permission precisely. A recorded list
    // without pages_manage_posts is a definite reconnect.
    if (account.scopes && !account.scopes.includes(FB_PUBLISH_SCOPE)) {
      return { state: "needs_scope", reason: "Reconnect Facebook to allow publishing.", action: "reconnect", notes: caps.notes };
    }
    return { state: "available", notes: caps.notes };
  }
  return { state: "not_connected", reason: "Not available.", notes: caps.notes };
}
