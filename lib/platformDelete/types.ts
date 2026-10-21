// Delete on platform: the shared shapes and the copy. A published post can be
// removed from Instagram, YouTube or Facebook from inside SOCIA; TikTok's API
// has no delete, so SOCIA says so and links to the video. SOCIA keeps the post
// in its record, marked deleted, with the last numbers it saw.
//
// Client-safe: no server imports. The resolver (capability.ts) and the server
// side (service.ts) build on these.

import type { Platform } from "../publishing/types";
import { PLATFORM_LABEL } from "../publishing/types";
import type { Measurement } from "../postResults";

/** What SOCIA would delete: one published object on one platform account. */
export type DeleteTarget = {
  platform: Platform;
  /** ig_user_id, YouTube channel id, Page id, TikTok open id. */
  accountId: string;
  /** IG media id, YouTube video id, Page post id. */
  externalId: string;
  permalink: string | null;
  postId: string | null;
  destinationId: string | null;
  /** Instagram collab post another account posted (IgMediaItem.collab_owner). */
  collabOwner: string | null;
  caption: string | null;
};

export type DeleteReasonCode =
  | "tiktok_no_api"
  | "collab_not_owner"
  | "ig_not_connected"
  | "ig_account_changed"
  | "ig_no_facebook"
  | "ig_facebook_other_account"
  | "facebook_reconnect"
  | "facebook_missing_scope"
  | "facebook_expired"
  | "facebook_suspended"
  | "yt_not_connected"
  | "yt_channel_mismatch"
  | "yt_needs_scope"
  | "fb_not_connected"
  | "fb_missing_scope"
  | "migration"
  | "unknown_id";

export type DeleteVia = "facebook_user_token" | "facebook_page_token" | "youtube_oauth";
export type DeleteAction = "connect_facebook" | "reconnect_facebook" | "reconnect_youtube" | null;

export type DeleteCapability =
  | { canDelete: true; platform: Platform; via: DeleteVia; platformUrl: string | null }
  | { canDelete: false; platform: Platform; code: DeleteReasonCode; reason: string; action: DeleteAction; platformUrl: string | null };

/** The last measurement SOCIA took before the platform call, and when. */
export type DeletedResult = Measurement & { measuredAt: string };

export type DeleteOutcome =
  | { ok: true; deletedAt: string; gone: boolean }
  /** The platform cannot delete this from SOCIA (409). */
  | { ok: false; capability: DeleteCapability }
  /** The platform refused; its words are shown as they came (502). */
  | { ok: false; error: string; code: string | null };

export type CopyCtx = { handle?: string | null; other?: string | null; owner?: string | null };

const at = (h: string | null | undefined, fallback: string) => (h ? `@${h.replace(/^@/, "")}` : fallback);

/** One plain sentence per reason. No em dashes anywhere in here. */
export const DELETE_COPY: Record<DeleteReasonCode, (ctx: CopyCtx) => string> = {
  tiktok_no_api: () => "TikTok's API has no way to delete a video. Delete it in the TikTok app.",
  collab_not_owner: (c) => `This is a collab post by ${at(c.owner, "another account")}. Only the account that posted it can delete it.`,
  ig_not_connected: () => "Instagram is not connected in this workspace, or it is paused by your plan. Delete the post in the Instagram app.",
  ig_account_changed: (c) => `This post is on an Instagram account that is not the one connected here now (${at(c.handle, "this workspace's account")}). Delete it in the Instagram app.`,
  ig_no_facebook: (c) => `Deleting an Instagram post from SOCIA needs a Facebook Page linked to ${at(c.handle, "this Instagram account")}. Connect it in Settings, or delete the post in the Instagram app.`,
  ig_facebook_other_account: (c) => `The connected Facebook Page is linked to ${at(c.other, "another Instagram account")}, not ${at(c.handle, "this one")}. Delete this post in the Instagram app.`,
  facebook_reconnect: () => "Reconnect Facebook so SOCIA can delete Instagram posts. Until then, delete it in the Instagram app.",
  facebook_missing_scope: () => "Reconnect Facebook so SOCIA can delete Instagram posts. SOCIA needs the Instagram content permission. Until then, delete it in the Instagram app.",
  facebook_expired: () => "Facebook's access has expired. Reconnect Facebook to delete from SOCIA, or delete it in the app.",
  facebook_suspended: () => "The connected Facebook Page is paused by your plan. Delete this post in the app.",
  yt_not_connected: () => "YouTube is not connected in this workspace. Delete the video on YouTube.",
  yt_channel_mismatch: () => "The YouTube channel connected here is not the one this video is on. Delete the video on YouTube.",
  yt_needs_scope: () => "Reconnect YouTube with the broader permission (Settings, Enable uploads) to delete videos from SOCIA. Until then, delete it on YouTube.",
  fb_not_connected: () => "This Facebook Page is not connected in this workspace. Delete the post on Facebook.",
  fb_missing_scope: () => "Reconnect Facebook so SOCIA can manage this Page's posts. Until then, delete it on Facebook.",
  migration: () => "SOCIA's database needs the platform-deletions migration before posts can be deleted from here.",
  unknown_id: () => "SOCIA could not match this post to a connected account in this workspace. Delete it in the platform's own app.",
};

/** "Oct 21, 2026" (UTC, so the server and the browser agree). */
export const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Deleted from Instagram on Oct 21, 2026" */
export const deletedLine = (platform: Platform, deletedAt: string): string =>
  `Deleted from ${PLATFORM_LABEL[platform]} on ${fmtDate(deletedAt)}`;

/** The word for what is being deleted: "Reel", "post", "video". */
export function deleteNoun(platform: Platform, format?: string | null): string {
  const f = (format ?? "").toLowerCase();
  if (platform === "youtube" || platform === "tiktok") return "video";
  if (f === "reel" || f === "reels") return "Reel";
  if (f === "carousel" || f === "carousel_album") return "carousel";
  if (f === "story") return "Story";
  return "post";
}
