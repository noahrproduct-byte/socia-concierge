// Can SOCIA delete this post from its platform right now? A pure answer from
// what SOCIA stores (the connections, their tokens' presence and scopes), so
// the UI can say why not in plain words before anyone presses anything.
// Nothing here calls a platform; the platform's own answer at delete time
// still wins (service.ts).
//
// Platform facts (official docs, 2026-10-21):
//   Instagram  DELETE graph.facebook.com/{ig-media-id} with a Facebook USER
//              token holding instagram_basic + instagram_manage_contents. Only
//              the Facebook-Login API deletes; the Instagram-Login token SOCIA
//              publishes with cannot. The Page SOCIA connected must be linked
//              to the same Instagram account.
//   YouTube    videos.delete needs youtube, youtube.force-ssl or
//              youtubepartner. youtube.upload uploads but does not delete, so
//              this file keeps its own scope list instead of hasWriteScope().
//   Facebook   DELETE graph.facebook.com/{post-id} with the Page token and
//              pages_manage_posts.
//   TikTok     the Content Posting API has no delete endpoint.
//
// Client-safe.

import { FB_IG_DELETE_SCOPE } from "../facebook";
import { DELETE_COPY, type CopyCtx, type DeleteAction, type DeleteCapability, type DeleteReasonCode, type DeleteTarget } from "./types";

export { FB_IG_DELETE_SCOPE };

/** Any one of these lets videos.delete run. youtube.upload is deliberately absent. */
export const YT_DELETE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtubepartner",
];

/** Pages API: delete a Page post. Same permission that publishes. */
export const FB_PAGE_DELETE_SCOPE = "pages_manage_posts";

export type DeleteInputs = {
  target: DeleteTarget;
  /** The workspace's Facebook row (by workspace, or by page_id for a Facebook target). */
  facebook: {
    pageId: string | null;
    igBusinessId: string | null;
    igBusinessUsername: string | null;
    hasPageToken: boolean;
    hasUserToken: boolean;
    userTokenExpiresAt: string | null;
    /** Permission names Meta granted; null when the row predates scope recording. */
    scopes: string[] | null;
    status: string | null;
    suspended: boolean;
  } | null;
  /** The Instagram account the target belongs to. */
  instagram: { igUserId: string; username: string | null } | null;
  /** youtubeAccessToken() minus the token. */
  youtube: { channelId: string | null; scopes: string[] | null } | null;
  /** false before supabase/platform-deletions.sql has run. */
  ledgerAvailable: boolean;
  now: Date;
};

const sameHandle = (a: string | null | undefined, b: string | null | undefined): boolean =>
  Boolean(a && b) && a!.replace(/^@/, "").toLowerCase() === b!.replace(/^@/, "").toLowerCase();

export function resolveDeleteCapability(i: DeleteInputs): DeleteCapability {
  const { target } = i;
  const url = target.permalink ?? null;
  const no = (code: DeleteReasonCode, action: DeleteAction = null, ctx: CopyCtx = {}): DeleteCapability => ({
    canDelete: false, platform: target.platform, code, reason: DELETE_COPY[code](ctx), action, platformUrl: url,
  });

  if (!i.ledgerAvailable) return no("migration");

  if (target.platform === "tiktok") return no("tiktok_no_api");

  if (target.platform === "instagram") {
    if (target.collabOwner) return no("collab_not_owner", null, { owner: target.collabOwner });
    if (!i.instagram) return no("ig_not_connected");
    const handle = i.instagram.username ?? null;
    // The post must be on the account connected in this workspace now: never
    // delete with one account's tokens what was published to another.
    if (target.accountId !== i.instagram.igUserId) return no("ig_account_changed", null, { handle });
    const fb = i.facebook;
    if (!fb || !fb.pageId) return no("ig_no_facebook", "connect_facebook", { handle });
    // The Page's linked Instagram account must be that same account. The id
    // decides when Meta returned one; the handle only when it did not.
    const linked = fb.igBusinessId != null ? fb.igBusinessId === target.accountId : sameHandle(fb.igBusinessUsername, handle);
    if (!linked) return no("ig_facebook_other_account", null, { handle, other: fb.igBusinessUsername });
    if (fb.suspended) return no("facebook_suspended");
    const expired = fb.status === "expired" || (fb.userTokenExpiresAt != null && new Date(fb.userTokenExpiresAt).getTime() <= i.now.getTime());
    if (expired) return no("facebook_expired", "reconnect_facebook");
    if (!fb.hasUserToken) return no("facebook_reconnect", "reconnect_facebook");
    if (Array.isArray(fb.scopes) && !fb.scopes.includes(FB_IG_DELETE_SCOPE)) return no("facebook_missing_scope", "reconnect_facebook");
    // scopes null: an unknown list is tried; Meta's answer decides.
    return { canDelete: true, platform: "instagram", via: "facebook_user_token", platformUrl: url };
  }

  if (target.platform === "youtube") {
    const yt = i.youtube;
    if (!yt) return no("yt_not_connected");
    if (yt.channelId && yt.channelId !== target.accountId) return no("yt_channel_mismatch");
    // null scopes (rows from before scope tracking) do not qualify: unknown is not yes.
    if (!yt.scopes?.some((s) => YT_DELETE_SCOPES.includes(s))) return no("yt_needs_scope", "reconnect_youtube");
    return { canDelete: true, platform: "youtube", via: "youtube_oauth", platformUrl: url };
  }

  if (target.platform === "facebook") {
    const fb = i.facebook;
    if (!fb || !fb.pageId || fb.pageId !== target.accountId || !fb.hasPageToken) return no("fb_not_connected");
    if (fb.suspended) return no("facebook_suspended");
    if (fb.status === "expired") return no("facebook_expired", "reconnect_facebook");
    if (Array.isArray(fb.scopes) && !fb.scopes.includes(FB_PAGE_DELETE_SCOPE)) return no("fb_missing_scope", "reconnect_facebook");
    return { canDelete: true, platform: "facebook", via: "facebook_page_token", platformUrl: url };
  }

  return no("unknown_id");
}
