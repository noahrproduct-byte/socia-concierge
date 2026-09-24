import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TT_OAUTH_STATE_COOKIE,
  TT_OAUTH_STATE_MAX_AGE,
  ttAuthConfigured,
  ttAuthUrl,
  ttRedirectUri,
} from "@/lib/tiktokAuth";

export const runtime = "nodejs";

// Step 1 of TikTok OAuth (Login Kit): send the signed-in user to TikTok's
// consent screen. TikTok redirects back to /api/auth/tiktok/callback with a
// one-time code.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const dest = url.searchParams.get("next") === "onboarding" ? "onboarding" : "settings";

  if (!ttAuthConfigured()) {
    return NextResponse.redirect(`${origin}/${dest}?tt=notconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${dest}`);

  // CSRF nonce: stored HttpOnly and echoed in `state`; the callback rejects any
  // response whose state does not match this cookie.
  const nonce = crypto.randomUUID();
  const res = NextResponse.redirect(ttAuthUrl(`${nonce}.${dest}`, ttRedirectUri(origin)));
  res.cookies.set(TT_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TT_OAUTH_STATE_MAX_AGE,
  });
  return res;
}
