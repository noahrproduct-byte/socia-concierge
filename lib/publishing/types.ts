// Multi-platform publishing: the shared data model.
//
// One ContentItem (the parent row in scheduled_posts: master caption + ordered
// media) fans out to N Destinations (rows in post_destinations), each with its
// own platform settings, schedule and lifecycle. Nothing here talks to a
// platform; adapters (lib/publishing/adapters/*) do that.
//
// Client-safe: no server imports.

export type Platform = "instagram" | "youtube" | "facebook" | "tiktok";
export const PLATFORMS: Platform[] = ["instagram", "youtube", "facebook", "tiktok"];
export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export type MediaKind = "image" | "video";

/**
 * One uploaded file. width/height/duration are measured in the browser and
 * size is read from the file; null = not measured or not recorded (legacy rows
 * never stored a size). Unknown is never rendered or validated as 0.
 */
export type MediaItem = {
  id: string;
  kind: MediaKind;
  name: string;
  /** "" when the type was never recorded (legacy rows); never a guess. */
  mime: string;
  size: number | null;
  width: number | null;
  height: number | null;
  /** seconds, videos only */
  duration: number | null;
  /** storage object path in the scheduled-media bucket; null until uploaded */
  path: string | null;
  /** public URL the platforms fetch; null until uploaded */
  url: string | null;
};

/**
 * Per-destination lifecycle. One platform failing never changes another.
 *   draft      missing something (media, caption, time)
 *   ready      complete, not yet scheduled (quick review state)
 *   scheduled  waiting for its time
 *   uploading  bytes in flight (browser -> YouTube, or server -> platform)
 *   processing platform accepted the media and is transcoding / reviewing
 *   published  live, external id known
 *   failed     platform refused; error_code + error_message set; retryable
 *   cancelled  withdrawn by the person
 */
export type DestinationStatus =
  | "draft" | "ready" | "scheduled" | "uploading" | "processing" | "published" | "failed" | "cancelled";

export const DESTINATION_STATUSES: DestinationStatus[] = [
  "draft", "ready", "scheduled", "uploading", "processing", "published", "failed", "cancelled",
];

export const STATUS_LABEL: Record<DestinationStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  uploading: "Uploading",
  processing: "Processing",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Per-platform settings. `caption: null` means "use the master caption".
// Only fields the platform API actually accepts (see capabilities.ts sources).
// ---------------------------------------------------------------------------

export type InstagramFormat = "reel" | "image" | "carousel";

export type InstagramSettings = {
  format: InstagramFormat;
  caption: string | null;
  /** Reels: also show in the Feed tab (share_to_feed). */
  shareToFeed: boolean;
  /** Reels cover: frame offset in ms (thumb_offset); null = platform default (0). */
  coverTimestampMs: number | null;
  /** Images and carousel images only (alt_text, 1000 chars). */
  altText: string | null;
  /** Public users to tag (user_tags); x/y 0..1 for images. */
  userTags: { username: string; x?: number; y?: number }[];
  /** is_ai_generated disclosure. */
  aiGenerated: boolean;
  /** Collab post: up to 3 usernames invited as co-authors (collaborators). Reels, feed images, carousels. */
  collaborators: string[];
  /** SOCIA's pre-flight check of `collaborators` with Instagram (lib/publishing/collaborators.ts). */
  collaboratorsCheck: CollaboratorsCheck | null;
};

/**
 * What Instagram said when SOCIA created an UNPUBLISHED test container with
 * these collaborators on the account (nothing is posted; containers expire).
 *   accepted     Instagram validated the usernames (it refuses an invented one)
 *   unconfirmed  Instagram took them without validating, so the invite can't be confirmed in advance
 *   rejected     Instagram refused them; the message is Instagram's
 *   error        the check couldn't run (network, rate limit)
 */
export type CollaboratorsCheck = {
  /** lower-cased and sorted, exactly as checked */
  usernames: string[];
  status: "accepted" | "unconfirmed" | "rejected" | "error";
  message: string | null;
  at: string;
};

export type YouTubePrivacy = "public" | "unlisted" | "private";

export type YouTubeSettings = {
  /** Required by YouTube, 100 chars, no < or >. Never derived from the caption silently. */
  title: string;
  /** null = use the master caption as the description. 5000 bytes. */
  description: string | null;
  /** snippet.tags: 500 chars total. Distinct from #hashtags in text. */
  tags: string[];
  categoryId: string | null;
  privacy: YouTubePrivacy;
  /** status.selfDeclaredMadeForKids. Required: null blocks publishing. */
  madeForKids: boolean | null;
  /** status.containsSyntheticMedia disclosure. */
  syntheticMedia: boolean;
  playlistId: string | null;
  notifySubscribers: boolean;
  license: "youtube" | "creativeCommon";
  embeddable: boolean;
  /** recordingDetails.recordingDate, ISO date or null. */
  recordingDate: string | null;
  /** snippet.defaultLanguage, BCP-47 or null. */
  language: string | null;
  /** MediaItem.id of an uploaded image to set as the custom thumbnail, or null. */
  thumbnailMediaId: string | null;
};

/** Facebook publishing is not available to SOCIA yet (needs pages_manage_posts). Kept minimal. */
export type FacebookSettings = {
  format: "feed" | "reel";
  caption: string | null;
  title: string | null;
};

/** TikTok has no integration yet. Shape follows the Content Posting API for when it does. */
export type TikTokSettings = {
  caption: string | null;
  /** Must be one of creator_info.privacy_level_options; null = not chosen. */
  privacy: string | null;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  coverTimestampMs: number | null;
  brandContent: boolean;
  brandOrganic: boolean;
  aiGenerated: boolean;
};

export type SettingsByPlatform = {
  instagram: InstagramSettings;
  youtube: YouTubeSettings;
  facebook: FacebookSettings;
  tiktok: TikTokSettings;
};

export type DestinationSettings = SettingsByPlatform[Platform];

export function defaultSettings<P extends Platform>(platform: P): SettingsByPlatform[P] {
  const all: SettingsByPlatform = {
    instagram: { format: "reel", caption: null, shareToFeed: true, coverTimestampMs: null, altText: null, userTags: [], aiGenerated: false, collaborators: [], collaboratorsCheck: null },
    youtube: {
      title: "", description: null, tags: [], categoryId: null, privacy: "public", madeForKids: null, syntheticMedia: false,
      playlistId: null, notifySubscribers: true, license: "youtube", embeddable: true, recordingDate: null, language: null, thumbnailMediaId: null,
    },
    facebook: { format: "feed", caption: null, title: null },
    tiktok: { caption: null, privacy: null, allowComments: true, allowDuet: true, allowStitch: true, coverTimestampMs: null, brandContent: false, brandOrganic: false, aiGenerated: false },
  };
  return all[platform];
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type Destination = {
  id: string;
  postId: string;
  platform: Platform;
  accountId: string;
  status: DestinationStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  externalContainerId: string | null;
  permalink: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  settings: DestinationSettings;
  createdAt: string;
  updatedAt: string;
};

/** The parent. `status` is the aggregate of its destinations (lib/publishing/status.ts). */
export type ContentItem = {
  id: string;
  userId: string;
  caption: string;
  media: MediaItem[];
  /** Default publish time; destinations may override per platform. */
  scheduledAt: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  source: "calendar" | "composer" | "quick" | "studio" | "plan" | null;
  planId: string | null;
  planDay: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  destinations: Destination[];
};

/** Stable key for a destination inside the composer: platform + account. */
export const destinationKey = (platform: Platform, accountId: string) => `${platform}:${accountId}`;
