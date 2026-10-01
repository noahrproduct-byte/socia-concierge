// Facebook Login — shared config for the Page connection OAuth flow.
// Docs: https://developers.facebook.com/docs/facebook-login
// Requires the "Facebook Login" product on the Meta app, with the callback
// registered under Valid OAuth Redirect URIs. Permissions used:
//   pages_show_list       -> list the Pages the user manages
//   pages_read_engagement -> Page profile + reactions/comments/shares summaries
//   pages_read_user_content -> read the Page's own posts. In Graph API v23 the
//                            /posts and /published_posts edges return error #10
//                            ("requires pages_read_user_content or Page Public
//                            Content Access") without it, so without this scope
//                            SOCIA gets the follower count but zero posts.
//                            Advanced Access (App Review) for public users;
//                            granted for app admins/testers in Development Mode.
//   instagram_basic       -> the IG Professional account linked to a Page,
//                            which is what unlocks Business Discovery: real
//                            public follower/media counts for OTHER public
//                            Instagram business accounts. This is the only
//                            route Meta offers to competitor data on
//                            Instagram; the Instagram Login API has none.
// read_insights (Page/post Insights time series) CAN be requested via this
// Facebook Login scope list, but it is an Advanced-Access permission: public
// users need App Review + Business Verification before Meta grants it. SOCIA
// does not request it yet — the plan is to queue that App Review after the
// in-flight Instagram review clears, and until then the capability map reports
// the Insights-only metrics (page/video views, Meta's daily follower-flow,
// post_clicks) as unavailable rather than guessing. SOCIA builds its own
// Facebook follower trend from followers_count (see lib/platformSnapshots.ts),
// which needs no extra permission. NOTE: Meta deprecated the impressions/reach/
// page_fans family (version-independent waves in Nov 2025 and June 2026), so
// Facebook reach/impressions are no longer retrievable on any version.
// In Development Mode insights work for app admins/developers/testers without
// App Review — useful for prototyping before submission.

export const FB_GRAPH_V = "v23.0";

// business_management lets the callback read Pages that live in a Business
// Portfolio / New Pages Experience, which do NOT come back from /me/accounts
// even for a direct Page admin. Needs Advanced Access for public users (App
// Review); works now for app admins/testers. See the /me/businesses fallback
// in the callback.
//   pages_manage_posts    -> publish photos/videos/text to the connected Page.
//                            Standard Access covers Pages the app admins/testers
//                            manage (so publishing works for them pre-review);
//                            Advanced Access (App Review) is needed for public
//                            users' Pages. Facebook Login silently omits an
//                            un-granted scope rather than rejecting the whole
//                            authorization, so requesting it is safe before the
//                            permission is added/approved in the Meta dashboard.
//   read_insights        -> Page/video view counts and the daily follower-flow
//                            series from the /insights edge. Advanced Access
//                            (App Review + Business Verification) for public
//                            users; works for app admins/testers in Dev Mode
//                            now. Facebook Login omits an un-granted scope
//                            rather than failing, so requesting it is safe
//                            before it's approved — the insights reader degrades
//                            to "unavailable" when it isn't granted.
//   pages_manage_engagement -> reply to (and moderate) comments on the Page's
//                            posts as the Page — the AI comment-replies feature
//                            (Growth+; every reply is approved by a person
//                            before it's sent). Advanced Access for public
//                            users; admins/testers in Dev Mode now.
export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_read_user_content", "pages_manage_posts", "pages_manage_engagement", "read_insights", "instagram_basic", "business_management"].join(",");

export function fbAppId() {
  return process.env.FACEBOOK_APP_ID;
}

export function fbAppSecret() {
  return process.env.FACEBOOK_APP_SECRET;
}

/** Facebook Login for Business apps authorize via a login configuration
 *  (created under Facebook Login for Business → Configurations) instead of
 *  raw scopes. When set, the OAuth dialog uses config_id. */
export function fbConfigId() {
  return process.env.FACEBOOK_LOGIN_CONFIG_ID;
}

export function fbRedirectUri(reqOrigin: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || reqOrigin;
  return `${base}/api/auth/facebook/callback`;
}

export function fbConfigured() {
  return Boolean(fbAppId() && fbAppSecret());
}
