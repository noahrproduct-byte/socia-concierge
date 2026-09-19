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
  // Scheduling / auto-posting. Must be enabled on the Instagram use case in
  // the Meta app dashboard BEFORE users reconnect, or Instagram rejects the
  // whole authorization (see the note above).
  "instagram_business_content_publish",
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

// ---- OAuth state (CSRF) ----------------------------------------------------
// Both Meta flows carry `<nonce>.<destination>` in the OAuth `state` param and
// keep the nonce in a short-lived HttpOnly cookie. A callback only exchanges
// its code when the two match, so an authorization code obtained by someone
// else cannot be attached to a signed-in user's account by sending them to
// the callback URL. The Facebook flow re-exports these from lib/facebook.ts.

export const IG_OAUTH_STATE_COOKIE = "ig_oauth_state";

/** Lifetime of the nonce cookie: long enough for the consent screen, no more. */
export const OAUTH_STATE_MAX_AGE = 600;

/** A fresh random nonce for one authorization round trip. */
export const newOauthNonce = () => crypto.randomUUID();

/** Cookie attributes for the nonce. A `maxAge` of 0 clears it. */
export function oauthStateCookie(name: string, value: string, maxAge: number) {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    ...(maxAge === 0 ? { expires: new Date(0) } : {}),
  };
}

/** Split `<nonce>.<destination>`. Either part is empty on a forged, stale or
 *  hand-typed callback, which the nonce check then refuses. */
export function parseOauthState(state: string | null): { nonce: string; dest: string } {
  const s = state ?? "";
  const i = s.indexOf(".");
  if (i <= 0) return { nonce: "", dest: "" };
  return { nonce: s.slice(0, i), dest: s.slice(i + 1) };
}

/** True only when the callback carries a nonce and it equals the cookie's. */
export function oauthStateValid(nonce: string, cookie: string | null | undefined): boolean {
  return Boolean(nonce && cookie && nonce === cookie);
}
