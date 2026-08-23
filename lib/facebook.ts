// Facebook Login — shared config for the Page connection OAuth flow.
// Docs: https://developers.facebook.com/docs/facebook-login
// Requires the "Facebook Login" product on the Meta app, with the callback
// registered under Valid OAuth Redirect URIs. Permissions used:
//   pages_show_list       -> list the Pages the user manages
//   pages_read_engagement -> Page posts + engagement fields
//   read_insights         -> Page/post insights (where Meta provides them)
// In Development Mode these work for app admins/developers/testers without
// App Review — public users need the app reviewed by Meta.

export const FB_GRAPH_V = "v23.0";

export const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights"].join(",");

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
