// Deterministic readiness checks, driven entirely by the capability model.
// Runs in the browser (as the person edits) and again on the server (before
// anything is published). Never guesses: a value that was not measured
// (width/duration null) produces a warning that it will be checked at upload,
// not a block and not a pass.
//
// Client-safe: no server imports.

import { CAPABILITIES, formatSpec, type FormatId, type MediaRule, type CaptionRule } from "./capabilities";
import type { MediaItem, Platform, DestinationSettings, InstagramSettings, YouTubeSettings, TikTokSettings } from "./types";
import { MAX_COLLABORATORS, IG_USERNAME_RE, normalizeUsername } from "./igRules";

export type Severity = "block" | "warn";

export type Issue = {
  code: string;
  severity: Severity;
  message: string;
  /** Which composer field to focus, when there is one. */
  field?: string;
};

export type ReadinessLevel = "ready" | "warning" | "blocked";

export type Readiness = { level: ReadinessLevel; issues: Issue[] };

export function levelOf(issues: Issue[]): ReadinessLevel {
  if (issues.some((i) => i.severity === "block")) return "blocked";
  if (issues.length) return "warning";
  return "ready";
}

const fmtMB = (b: number) => `${Math.round((b / (1024 * 1024)) * 10) / 10} MB`;
const fmtGB = (b: number) => `${Math.round((b / (1024 * 1024 * 1024)) * 10) / 10} GB`;
const fmtBytes = (b: number) => (b >= 1024 * 1024 * 1024 ? fmtGB(b) : fmtMB(b));
const fmtSec = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

export function byteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return Buffer.from(s, "utf8").length;
}

export const countHashtags = (s: string) => (s.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
export const countMentions = (s: string) => (s.match(/(^|\s)@[\p{L}\p{N}_.]+/gu) ?? []).length;

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export function validateMedia(media: MediaItem[], rule: MediaRule, platformLabel: string): Issue[] {
  const out: Issue[] = [];
  if (media.length < rule.minItems) {
    out.push({
      code: "media_missing", severity: "block", field: "media",
      message: rule.minItems <= 1 ? "Add media to publish." : `${platformLabel} needs at least ${rule.minItems} items for this format.`,
    });
    return out;
  }
  if (media.length > rule.maxItems) {
    out.push({ code: "media_count", severity: "block", field: "media", message: `${platformLabel} allows up to ${rule.maxItems} ${rule.maxItems === 1 ? "file" : "items"} for this format.` });
  }
  media.forEach((m, i) => {
    const which = media.length > 1 ? ` (item ${i + 1})` : "";
    if (!rule.kinds.includes(m.kind)) {
      out.push({ code: "media_kind", severity: "block", field: "media", message: `${platformLabel} needs ${rule.kinds.join(" or ")} for this format${which}.` });
      return;
    }
    if (!m.mime) {
      out.push({ code: "media_mime_unknown", severity: "warn", field: "media", message: `File type was not recorded${which}; ${platformLabel} will check it at upload.` });
    } else if (rule.mimes.length && !rule.mimes.includes(m.mime)) {
      out.push({ code: "media_mime", severity: "block", field: "media", message: `${platformLabel} does not accept ${m.mime}${which}. Use ${rule.mimes.map((x) => x.split("/")[1].toUpperCase()).join(", ")}.` });
    }
    if (m.size == null) {
      out.push({ code: "media_size_unknown", severity: "warn", field: "media", message: `File size was not recorded${which}; ${platformLabel} will check it at upload.` });
    } else if (m.size > rule.maxBytes) {
      out.push({ code: "media_size", severity: "block", field: "media", message: `${platformLabel} allows up to ${fmtBytes(rule.maxBytes)}${which}; this file is ${fmtBytes(m.size)}.` });
    }
    if (m.kind === "video") {
      if (m.duration == null) {
        out.push({ code: "media_duration_unknown", severity: "warn", field: "media", message: `Video length was not measured${which}; ${platformLabel} will check it at upload.` });
      } else {
        if (rule.minDurationSec != null && m.duration < rule.minDurationSec) out.push({ code: "media_short", severity: "block", field: "media", message: `${platformLabel} needs at least ${fmtSec(rule.minDurationSec)}${which}; this video is ${fmtSec(m.duration)}.` });
        if (rule.maxDurationSec != null && m.duration > rule.maxDurationSec) out.push({ code: "media_long", severity: "block", field: "media", message: `${platformLabel} allows up to ${fmtSec(rule.maxDurationSec)}${which}; this video is ${fmtSec(m.duration)}.` });
      }
    }
    if (m.width == null || m.height == null) {
      out.push({ code: "media_dimensions_unknown", severity: "warn", field: "media", message: `Dimensions were not measured${which}; ${platformLabel} will check them at upload.` });
    } else {
      if (rule.minWidth != null && m.width < rule.minWidth) out.push({ code: "media_narrow", severity: "block", field: "media", message: `${platformLabel} needs at least ${rule.minWidth} px wide${which}; this is ${m.width} px.` });
      if (rule.maxWidth != null && m.width > rule.maxWidth) out.push({ code: "media_wide", severity: "warn", field: "media", message: `${platformLabel} downsizes anything wider than ${rule.maxWidth} px${which}.` });
      const aspect = m.width / m.height;
      if (rule.aspectMin != null && aspect < rule.aspectMin) out.push({ code: "media_aspect", severity: "block", field: "media", message: `${platformLabel} rejects this aspect ratio${which} (too tall). Allowed: ${rule.recommendedAspect ?? `${rule.aspectMin} to ${rule.aspectMax}`}.` });
      else if (rule.aspectMax != null && aspect > rule.aspectMax) out.push({ code: "media_aspect", severity: "block", field: "media", message: `${platformLabel} rejects this aspect ratio${which} (too wide). Allowed: ${rule.recommendedAspect ?? `${rule.aspectMin} to ${rule.aspectMax}`}.` });
      else if (rule.recommendedAspect === "9:16" && Math.abs(aspect - 9 / 16) > 0.05) out.push({ code: "media_aspect_hint", severity: "warn", field: "media", message: `${platformLabel} recommends 9:16 for this format; other ratios are cropped or letterboxed.` });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function validateText(text: string, rule: CaptionRule, label: string, field: string, required: boolean): Issue[] {
  const out: Issue[] = [];
  const t = text.trim();
  if (!t) {
    if (required) out.push({ code: `${field}_missing`, severity: "block", field, message: `${label} is required.` });
    return out;
  }
  const len = rule.unit === "bytes" ? byteLength(t) : [...t].length;
  if (len > rule.max) out.push({ code: `${field}_long`, severity: "block", field, message: `${label} is ${len} ${rule.unit}; the limit is ${rule.max}.` });
  if (rule.forbiddenChars?.some((c) => t.includes(c))) out.push({ code: `${field}_chars`, severity: "block", field, message: `${label} cannot contain ${rule.forbiddenChars.join(" or ")}.` });
  if (rule.maxHashtags != null && countHashtags(t) > rule.maxHashtags) out.push({ code: "hashtags_many", severity: "block", field, message: `Up to ${rule.maxHashtags} hashtags allowed; found ${countHashtags(t)}.` });
  if (rule.maxMentions != null && countMentions(t) > rule.maxMentions) out.push({ code: "mentions_many", severity: "block", field, message: `Up to ${rule.maxMentions} @mentions allowed; found ${countMentions(t)}.` });
  return out;
}

// ---------------------------------------------------------------------------
// Per destination
// ---------------------------------------------------------------------------

export type DestinationInput = {
  platform: Platform;
  media: MediaItem[];
  masterCaption: string;
  settings: DestinationSettings;
  scheduledAt: string | null;
  /** When true, a schedule time in the past is a block (publish-now skips this). */
  requireFutureTime: boolean;
  now?: Date;
};

export function formatIdFor(platform: Platform, settings: DestinationSettings): FormatId {
  if (platform === "instagram") return (settings as InstagramSettings).format;
  if (platform === "facebook") return "feed";
  return "video";
}

/** The text this destination will actually carry. */
export function effectiveCaption(platform: Platform, masterCaption: string, settings: DestinationSettings): string {
  if (platform === "youtube") return (settings as YouTubeSettings).description ?? masterCaption;
  const s = settings as { caption: string | null };
  return s.caption ?? masterCaption;
}

/**
 * Collab-post collaborators. A list Instagram refused, or one SOCIA hasn't
 * checked yet, blocks scheduling so the post can't fail at its publish time
 * because of it; a check that couldn't run or couldn't confirm is a warning.
 */
export function collaboratorIssues(s: InstagramSettings): Issue[] {
  const list = s.collaborators ?? [];
  if (!list.length) return [];
  const out: Issue[] = [];
  const field = "collaborators";
  if (list.length > MAX_COLLABORATORS) out.push({ code: "collaborators_many", severity: "block", field, message: `Instagram allows up to ${MAX_COLLABORATORS} collaborators on a post.` });
  const bad = list.find((u) => !IG_USERNAME_RE.test(u.replace(/^@/, "")));
  if (bad) out.push({ code: "collaborator_invalid", severity: "block", field, message: `“${bad}” isn't a valid Instagram username.` });
  if (out.length) return out;
  const check = s.collaboratorsCheck ?? null;
  const sorted = Array.from(new Set(list.map(normalizeUsername))).sort().join(",");
  if (!check || check.usernames.join(",") !== sorted) {
    out.push({ code: "collaborators_unchecked", severity: "block", field, message: "SOCIA hasn't checked these collaborators with Instagram yet." });
  } else if (check.status === "rejected") {
    out.push({ code: "collaborators_rejected", severity: "block", field, message: check.message ?? "Instagram refused these collaborators." });
  } else if (check.status === "error") {
    out.push({ code: "collaborators_check_failed", severity: "warn", field, message: check.message ?? "SOCIA couldn't check the collaborators with Instagram." });
  } else if (check.status === "unconfirmed") {
    out.push({ code: "collaborators_unconfirmed", severity: "warn", field, message: "Instagram didn't confirm the collaborators in advance; check the invite in Instagram after the post goes live." });
  }
  return out;
}

export function validateDestination(input: DestinationInput): Readiness {
  const caps = CAPABILITIES[input.platform];
  const issues: Issue[] = [];
  if (!caps.implemented) {
    issues.push({ code: "platform_unavailable", severity: "block", message: caps.notes[0] });
    return { level: "blocked", issues };
  }
  const fmt = formatSpec(input.platform, formatIdFor(input.platform, input.settings));
  if (!fmt || !fmt.implemented) {
    issues.push({ code: "format_unavailable", severity: "block", field: "format", message: `${caps.label} does not support this format through SOCIA yet.` });
    return { level: "blocked", issues };
  }

  issues.push(...validateMedia(input.media, fmt.media, caps.label));

  const text = effectiveCaption(input.platform, input.masterCaption, input.settings);
  const textLabel = fmt.caption.field === "description" ? "Description" : "Caption";
  issues.push(...validateText(text, fmt.caption, textLabel, fmt.caption.field, fmt.caption.field === "caption"));

  if (input.platform === "instagram") {
    const s = input.settings as InstagramSettings;
    if (s.altText && caps.fields.altText && [...s.altText].length > caps.fields.altText.max) {
      issues.push({ code: "alt_text_long", severity: "block", field: "altText", message: `Alt text is limited to ${caps.fields.altText.max} characters.` });
    }
    if (s.altText && s.format === "reel") issues.push({ code: "alt_text_reel", severity: "warn", field: "altText", message: "Instagram ignores alt text on Reels." });
    if (s.userTags.length && s.format !== "reel" && s.userTags.some((t) => t.x == null || t.y == null)) {
      issues.push({ code: "user_tag_position", severity: "block", field: "userTags", message: "Each tagged user on an image needs a position." });
    }
    issues.push(...collaboratorIssues(s));
  }

  if (input.platform === "youtube") {
    const s = input.settings as YouTubeSettings;
    const tf = caps.fields.title!;
    issues.push(...validateText(s.title, { field: "title", max: tf.max, unit: "chars", forbiddenChars: tf.forbiddenChars }, "Title", "title", true));
    if (s.madeForKids == null) issues.push({ code: "made_for_kids_unset", severity: "block", field: "madeForKids", message: "Choose whether this video is made for kids. YouTube requires it." });
    const tagChars = s.tags.reduce((n, t) => n + (t.includes(" ") ? t.length + 2 : t.length) + 1, 0);
    if (caps.fields.tags && tagChars > caps.fields.tags.maxTotalChars) issues.push({ code: "tags_long", severity: "block", field: "tags", message: `Tags are limited to ${caps.fields.tags.maxTotalChars} characters in total.` });
    if (s.tags.some((t) => t.includes("<") || t.includes(">"))) issues.push({ code: "tags_chars", severity: "block", field: "tags", message: "Tags cannot contain < or >." });
  }

  if (input.platform === "tiktok") {
    const s = input.settings as TikTokSettings;
    if (s.brandContent && s.privacy === "SELF_ONLY") {
      issues.push({ code: "tiktok_brand_private", severity: "block", field: "privacy", message: "TikTok does not allow branded content on a private (only me) video." });
    }
    if (s.coverTimestampMs != null && input.media[0]?.duration != null && s.coverTimestampMs > input.media[0].duration * 1000) {
      issues.push({ code: "cover_out_of_range", severity: "block", field: "coverTimestampMs", message: "The cover frame is past the end of the video." });
    }
  }

  if (input.requireFutureTime) {
    if (!input.scheduledAt) issues.push({ code: "time_missing", severity: "block", field: "scheduledAt", message: "Choose a publish time." });
    else {
      const t = new Date(input.scheduledAt).getTime();
      const now = (input.now ?? new Date()).getTime();
      if (Number.isNaN(t)) issues.push({ code: "time_invalid", severity: "block", field: "scheduledAt", message: "The publish time is not valid." });
      else if (t <= now) issues.push({ code: "time_past", severity: "block", field: "scheduledAt", message: "The publish time is in the past." });
    }
  }

  return { level: levelOf(issues), issues };
}
