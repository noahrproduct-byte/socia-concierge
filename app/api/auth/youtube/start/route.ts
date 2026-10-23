import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  YT_OAUTH_STATE_COOKIE,
  YT_OAUTH_STATE_MAX_AGE,
  YT_PKCE_COOKIE,
  pkcePair,
  ytAuthConfigured,
  ytAuthUrl,
  ytRedirectUri,
} from "@/lib/youtubeAuth";

export const runtime = "nodejs";

// Step 1 of YouTube OAuth: send the signed-in user to Google's consent screen.
// Google redirects back to /api/auth/youtube/callback with a one-time code.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // Where to land after the callback: settings (default) or onboarding, carried
  // through Google in the second half of the state value.
  const dest = url.searchParams.get("next") === "onboarding" ? "onboarding" : "settings";
  // Opt-in publishing: only this path requests the (unverified) write scope, so
  // an ordinary analytics connect never triggers the "unverified app" warning.
  const write = url.searchParams.get("publish") === "1";

  if (!ytAuthConfigured()) {
    return NextResponse.redirect(`${origin}/${dest}?yt=notconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${dest}`);

  // CSRF nonce: stored HttpOnly and echoed in `state`; the callback rejects any
  // response whose state does not match this cookie.
  // PKCE: an intercepted code is useless without the verifier in this browser's cookie.
  const nonce = crypto.randomUUID();
  const { verifier, challenge } = await pkcePair();
  const res = NextResponse.redirect(ytAuthUrl(`${nonce}.${dest}`, ytRedirectUri(origin), { write, challenge }));
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: YT_OAUTH_STATE_MAX_AGE,
  };
  res.cookies.set(YT_OAUTH_STATE_COOKIE, nonce, cookie);
  res.cookies.set(YT_PKCE_COOKIE, verifier, cookie);
  return res;
}
