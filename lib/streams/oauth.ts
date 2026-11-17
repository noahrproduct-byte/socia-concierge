// Twitch sign-in plumbing for the stream clipper: the redirect address and the
// one-time state cookie that ties the callback to the browser that started it.

export const TWITCH_STATE_COOKIE = "tw_oauth_state";
export const TWITCH_STATE_MAX_AGE = 600;

/** The callback address registered on SOCIA's Twitch app. */
export function twitchRedirectUri(reqOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || reqOrigin;
  return `${base}/api/auth/twitch/callback`;
}

/** Where a finished sign-in lands: the Live streams tab, with the outcome. */
export const twitchDone = (origin: string, outcome: string) => `${origin}/clipper?tab=streams&twitch=${outcome}`;
