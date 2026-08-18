// Instagram API with Instagram Login — shared config for the OAuth flow.
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
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
