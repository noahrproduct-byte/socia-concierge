import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, twitchConfigured } from "@/lib/streams/twitch";
import { TWITCH_STATE_COOKIE, TWITCH_STATE_MAX_AGE, twitchDone, twitchRedirectUri } from "@/lib/streams/oauth";

export const runtime = "nodejs";

// Step 1 of connecting Twitch (Live streams in the AI Clipper): send the
// signed-in person to Twitch to approve reading chat and making clips.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!twitchConfigured()) return NextResponse.redirect(twitchDone(origin, "notconfigured"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/clipper`);
  // CSRF: the nonce goes out in `state` and must come back matching this HttpOnly cookie.
  const nonce = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(twitchRedirectUri(origin), nonce));
  res.cookies.set(TWITCH_STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TWITCH_STATE_MAX_AGE });
  return res;
}
