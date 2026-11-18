import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { createServiceClient } from "@/lib/supabase/service";
import { readStateCookie } from "@/lib/youtubeAuth";
import { exchangeCode, twitchConfigured } from "@/lib/streams/twitch";
import { saveConnection } from "@/lib/streams/server";
import { TWITCH_STATE_COOKIE, twitchDone, twitchRedirectUri } from "@/lib/streams/oauth";

export const runtime = "nodejs";

// Step 2: Twitch sends the person back with a one-time code. The state must
// match the cookie set at step 1; the tokens are saved by the server only
// (twitch_connections is private: supabase/stream-clipper.sql).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (outcome: string) => {
    const res = NextResponse.redirect(twitchDone(origin, outcome));
    res.cookies.set(TWITCH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };
  if (url.searchParams.get("error")) return done("denied");
  const state = url.searchParams.get("state") ?? "";
  const cookie = readStateCookie(req, TWITCH_STATE_COOKIE);
  if (!state || !cookie || state !== cookie) return done("error");
  const code = url.searchParams.get("code");
  if (!code) return done("error");
  if (!twitchConfigured()) return done("notconfigured");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/clipper`);
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "connect")) return done("forbidden");
  const db = createServiceClient() ?? ctx.client;
  try {
    const tok = await exchangeCode(code, twitchRedirectUri(origin));
    await saveConnection(db, ctx.ownerId, tok);
    return done("connected");
  } catch (e) {
    console.error("[twitch/callback]", (e as Error)?.message ?? e);
    return done("error");
  }
}
