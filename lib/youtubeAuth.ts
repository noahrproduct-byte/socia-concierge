// YouTube user connect — OAuth 2.0 so a signed-in creator can link their OWN
// channel, and SOCIA can read that channel's videos and analytics on their
// behalf.
//
// This is separate from lib/youtube.ts, which uses a server API key to read
// PUBLIC competitor statistics. That file never sees a user token; this one is
// only ever about the signed-in user's own channel, via Google OAuth.
//
// Setup (Google Cloud Console, the same project that holds YOUTUBE_API_KEY):
//   1. OAuth consent screen (External) requesting the scopes below.
//   2. OAuth 2.0 Client ID (type: Web application) whose authorized redirect
//      URI exactly matches ytRedirectUri() in production and dev.
//   3. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.

// Read-only for now: the user's own channel/videos, and their YouTube Analytics
// (views, watch time, subscribers gained, demographics). No upload/write scope
// yet — publishing to YouTube is a later feature and a separate Google audit,
// and requesting a permission the product does not use is a review rejection
// cause (the same rule we follow on the Instagram side).
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

// Random per-attempt nonce lives in this cookie and must match the value echoed
// back in the OAuth `state`, so a stray callback cannot attach someone else's
// channel to the signed-in user.
export const YT_OAUTH_STATE_COOKIE = "yt_oauth_state";
export const YT_OAUTH_STATE_MAX_AGE = 600; // 10 minutes to finish the round trip

export const ytClientId = () => process.env.GOOGLE_CLIENT_ID;
export const ytClientSecret = () => process.env.GOOGLE_CLIENT_SECRET;

// True when the server has what it needs to run the connect flow.
export const ytAuthConfigured = (): boolean => Boolean(ytClientId() && ytClientSecret());

// Must match one of the Authorized redirect URIs registered on the OAuth client.
// Prefer the stable env origin; fall back to the request origin for local dev.
export function ytRedirectUri(reqOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || reqOrigin;
  return `${base}/api/auth/youtube/callback`;
}

// The Google consent URL. access_type=offline + prompt=consent so Google always
// returns a refresh token (even when the user reconnects an already-granted
// channel), which we need to keep reading after the 1-hour access token expires.
export function ytAuthUrl(state: string, redirectUri: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", ytClientId()!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YT_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export type YtTokens = {
  access_token: string;
  /** Present on first consent (and on every consent because we force prompt). */
  refresh_token: string | null;
  expiresIn: number;
  scopes: string[];
};

function parseTokens(j: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): YtTokens | null {
  if (!j.access_token) return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? null,
    expiresIn: j.expires_in ?? 3600,
    scopes: typeof j.scope === "string" ? j.scope.split(" ").filter(Boolean) : [],
  };
}

// Trade the one-time authorization code for tokens. Returns null on any failure
// (the caller shows a generic error; the real reason is logged server-side).
export async function exchangeCode(code: string, redirectUri: string): Promise<YtTokens | null> {
  const body = new URLSearchParams({
    code,
    client_id: ytClientId()!,
    client_secret: ytClientSecret()!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res || !res.ok) {
    if (res) console.error("YouTube token exchange failed:", await res.text().catch(() => ""));
    return null;
  }
  return parseTokens(await res.json());
}

// Swap a refresh token for a fresh access token. Google usually omits a new
// refresh token here, so keep the existing one when it does.
export async function refreshAccessToken(refreshToken: string): Promise<YtTokens | null> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: ytClientId()!,
    client_secret: ytClientSecret()!,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const tok = parseTokens(await res.json());
  if (tok && !tok.refresh_token) tok.refresh_token = refreshToken;
  return tok;
}

export type MyChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  /** null when the channel hides its subscriber count. */
  subscribers: number | null;
};

// The signed-in user's own channel (mine=true uses the OAuth token's identity).
export async function fetchMyChannel(accessToken: string): Promise<MyChannel | null> {
  const u = new URL("https://www.googleapis.com/youtube/v3/channels");
  u.searchParams.set("part", "snippet,statistics");
  u.searchParams.set("mine", "true");
  const res = await fetch(u, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const j = (await res.json().catch(() => null)) as {
    items?: {
      id: string;
      snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
    }[];
  } | null;
  const it = j?.items?.[0];
  if (!it) return null;
  const hidden = it.statistics?.hiddenSubscriberCount;
  const subs = it.statistics?.subscriberCount;
  return {
    channelId: it.id,
    title: it.snippet?.title ?? "",
    handle: it.snippet?.customUrl ?? null,
    avatar: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
    subscribers: hidden || subs == null ? null : Number(subs),
  };
}

// Read the state nonce cookie off a raw request (route handlers receive the
// Web Request; the cookie is HttpOnly so it never appears client-side).
export function readStateCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === YT_OAUTH_STATE_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
