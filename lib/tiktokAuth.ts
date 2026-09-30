// TikTok user connect — Login Kit (OAuth 2.0) so a signed-in creator can link
// their OWN TikTok account, and SOCIA can read that account's profile, stats
// and videos and upload posts on their behalf (Content Posting API).
//
// Docs (developers.tiktok.com, 2026-09):
//   Authorize : https://www.tiktok.com/v2/auth/authorize/
//   Token     : POST https://open.tiktokapis.com/v2/oauth/token/
//   Revoke    : POST https://open.tiktokapis.com/v2/oauth/revoke/
//   User info : GET  https://open.tiktokapis.com/v2/user/info/?fields=...
//   Video list: POST https://open.tiktokapis.com/v2/video/list/?fields=...
// TikTok calls the client id `client_key`; scopes are comma-separated.
//
// Setup (TikTok for Developers → the "Socia" app):
//   1. Login Kit + Content Posting API products added, scopes below approved.
//   2. Redirect URI exactly equal to ttRedirectUri() in production
//      (https://sociaos.com/api/auth/tiktok/callback).
//   3. TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in the environment. The
//      Sandbox has its own key/secret pair; use those until the app is live.

export const TT_SCOPES = [
  "user.info.basic",   // open_id, avatar, display name
  "user.info.profile", // username, bio, profile link, verified badge
  "user.info.stats",   // follower / following / likes / video counts
  "video.list",        // the account's own public videos and their counts
  "video.upload",      // Content Posting API: upload to the creator's inbox
  // "video.publish" (direct post) is requested when TikTok approves it; the
  // publisher checks the stored scopes and posts directly when it is there.
];

export const TT_OAUTH_STATE_COOKIE = "tt_oauth_state";
export const TT_OAUTH_STATE_MAX_AGE = 600; // 10 minutes to finish the round trip

const AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
export const TT_API = "https://open.tiktokapis.com/v2";

// .trim(): pasted credentials often carry a trailing newline.
export const ttClientKey = () => process.env.TIKTOK_CLIENT_KEY?.trim();
export const ttClientSecret = () => process.env.TIKTOK_CLIENT_SECRET?.trim();

export const ttAuthConfigured = (): boolean => Boolean(ttClientKey() && ttClientSecret());

export function ttRedirectUri(reqOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || reqOrigin;
  return `${base}/api/auth/tiktok/callback`;
}

export function ttAuthUrl(state: string, redirectUri: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("client_key", ttClientKey()!);
  u.searchParams.set("scope", TT_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

export type TtTokens = {
  access_token: string;
  refresh_token: string | null;
  open_id: string;
  /** seconds */
  expiresIn: number;
  /** seconds */
  refreshExpiresIn: number | null;
  scopes: string[];
};

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function parseTokens(j: TokenJson): TtTokens | null {
  if (!j.access_token || !j.open_id) return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? null,
    open_id: j.open_id,
    expiresIn: j.expires_in ?? 86400,
    refreshExpiresIn: j.refresh_expires_in ?? null,
    scopes: typeof j.scope === "string" ? j.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
  };
}

async function tokenRequest(body: URLSearchParams): Promise<TtTokens | null> {
  const res = await fetch(`${TT_API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body,
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res) return null;
  const j = (await res.json().catch(() => null)) as TokenJson | null;
  if (!res.ok || !j || j.error) {
    console.error("TikTok token request failed:", res.status, j?.error, j?.error_description);
    return null;
  }
  return parseTokens(j);
}

/** Trade the one-time authorization code for tokens. */
export function exchangeCode(code: string, redirectUri: string): Promise<TtTokens | null> {
  return tokenRequest(
    new URLSearchParams({
      client_key: ttClientKey()!,
      client_secret: ttClientSecret()!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  );
}

/** Swap a refresh token for a new access token (TikTok rotates the refresh token too). */
export function refreshAccessToken(refreshToken: string): Promise<TtTokens | null> {
  return tokenRequest(
    new URLSearchParams({
      client_key: ttClientKey()!,
      client_secret: ttClientSecret()!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

/** Best effort: tell TikTok the grant is over so it leaves the user's "Manage app permissions" list. */
export async function revokeToken(accessToken: string): Promise<void> {
  await fetch(`${TT_API}/oauth/revoke/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: ttClientKey()!, client_secret: ttClientSecret()!, token: accessToken }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
}

export type TtProfile = {
  openId: string;
  unionId: string | null;
  displayName: string;
  username: string | null;
  avatar: string | null;
  profileUrl: string | null;
  bio: string | null;
  isVerified: boolean | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  videos: number | null;
};

const USER_FIELDS = [
  "open_id", "union_id", "avatar_url", "avatar_large_url", "display_name",
  "username", "profile_deep_link", "bio_description", "is_verified",
  "follower_count", "following_count", "likes_count", "video_count",
];

// Every TikTok response carries `error.code`; "ok" means success. Fields the
// token's scopes do not cover are simply absent, never an error.
type TtEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

export async function fetchMyProfile(accessToken: string): Promise<TtProfile | null> {
  const u = new URL(`${TT_API}/user/info/`);
  u.searchParams.set("fields", USER_FIELDS.join(","));
  const res = await fetch(u, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return null;
  const j = (await res.json().catch(() => null)) as TtEnvelope<{ user?: Record<string, unknown> }> | null;
  const user = j?.data?.user;
  if (!res.ok || !user || (j?.error?.code && j.error.code !== "ok")) {
    console.error("TikTok user.info failed:", res.status, j?.error?.code, j?.error?.message);
    return null;
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const openId = str(user.open_id);
  if (!openId) return null;
  return {
    openId,
    unionId: str(user.union_id),
    displayName: str(user.display_name) ?? "TikTok account",
    username: str(user.username),
    avatar: str(user.avatar_large_url) ?? str(user.avatar_url),
    profileUrl: str(user.profile_deep_link),
    bio: str(user.bio_description),
    isVerified: typeof user.is_verified === "boolean" ? user.is_verified : null,
    followers: num(user.follower_count),
    following: num(user.following_count),
    likes: num(user.likes_count),
    videos: num(user.video_count),
  };
}

export type TtVideo = {
  id: string;
  createdAt: string | null;
  cover: string | null;
  url: string | null;
  caption: string | null;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

const VIDEO_FIELDS = [
  "id", "create_time", "cover_image_url", "share_url", "video_description",
  "duration", "title", "like_count", "comment_count", "share_count", "view_count",
];

/** The account's own public videos, newest first. Up to `max` (TikTok caps a page at 20). */
export async function fetchMyVideos(accessToken: string, max = 20): Promise<TtVideo[] | null> {
  const u = new URL(`${TT_API}/video/list/`);
  u.searchParams.set("fields", VIDEO_FIELDS.join(","));
  const res = await fetch(u, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ max_count: Math.min(20, Math.max(1, max)) }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return null;
  const j = (await res.json().catch(() => null)) as TtEnvelope<{ videos?: Record<string, unknown>[] }> | null;
  if (!res.ok || (j?.error?.code && j.error.code !== "ok")) {
    console.error("TikTok video.list failed:", res.status, j?.error?.code, j?.error?.message);
    return null;
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return (j?.data?.videos ?? [])
    .map((v): TtVideo | null => {
      const id = str(v.id);
      if (!id) return null;
      const t = num(v.create_time);
      return {
        id,
        createdAt: t != null ? new Date(t * 1000).toISOString() : null,
        cover: str(v.cover_image_url),
        url: str(v.share_url),
        caption: str(v.video_description) ?? str(v.title),
        durationSec: num(v.duration),
        views: num(v.view_count),
        likes: num(v.like_count),
        comments: num(v.comment_count),
        shares: num(v.share_count),
      };
    })
    .filter((v): v is TtVideo => v != null);
}

/** Read the state nonce cookie off a raw request (HttpOnly; never client-visible). */
export function readStateCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === TT_OAUTH_STATE_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
