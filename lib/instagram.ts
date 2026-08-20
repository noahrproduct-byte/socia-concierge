// Instagram API with Instagram Login — shared config for the OAuth flow.
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

// Only request scopes that are actually enabled on the Instagram use case in the
// Meta app dashboard. Instagram rejects the whole authorization request if you ask
// for a permission the app has not been configured for — the user never gets
// redirected back, and no request ever reaches /api/auth/instagram/callback.
//
// Requesting unused permissions is also a documented App Review rejection cause,
// so keep this list to the minimum the product actually uses.
//
// Add back when the matching feature ships AND the permission is enabled in Meta:
//   instagram_business_content_publish  -> scheduling / auto-posting
//   instagram_business_manage_comments  -> comment management
//   instagram_business_manage_messages  -> DM management
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
].join(",");

export function igClientId() {
  return process.env.INSTAGRAM_CLIENT_ID;
}

export function igAppSecret() {
  return process.env.INSTAGRAM_APP_SECRET;
}

// The exact redirect URI Instagram will call back. It MUST match one of the
// "Valid OAuth Redirect URIs" registered in the Meta app dashboard. We prefer
// an explicit env var (stable across deploys) and fall back to the request origin.
export function igRedirectUri(reqOrigin: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || reqOrigin;
  return `${base}/api/auth/instagram/callback`;
}

// True when the server has the credentials needed to run the OAuth flow.
export function igConfigured() {
  return Boolean(igClientId() && igAppSecret());
}
