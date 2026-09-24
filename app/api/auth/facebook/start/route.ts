import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FB_GRAPH_V, FB_SCOPES, fbAppId, fbConfigId, fbConfigured, fbRedirectUri } from "@/lib/facebook";

export const runtime = "nodejs";

// Step 1 of Facebook OAuth: send the signed-in user to Meta's consent screen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (!fbConfigured()) {
    return NextResponse.redirect(`${origin}/settings?fb=notconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/settings`);

  const authorize = new URL(`https://www.facebook.com/${FB_GRAPH_V}/dialog/oauth`);
  authorize.searchParams.set("client_id", fbAppId()!);
  authorize.searchParams.set("redirect_uri", fbRedirectUri(origin));
  authorize.searchParams.set("response_type", "code");
  // Classic Facebook Login is the default: with a Login-for-Business
  // configuration the granted Page is a business asset that does NOT come back
  // from GET /me/accounts, so the connect never completes (confirmed 2026-09-23:
  // pages_show_list granted, /me/accounts empty). Classic scope login returns
  // the user's Pages there and also grants instagram_basic for Business
  // Discovery. Login for Business stays available behind an explicit opt-in.
  const configId = fbConfigId();
  if (configId && process.env.FACEBOOK_USE_CONFIG_ID === "1") {
    authorize.searchParams.set("config_id", configId);
  } else {
    authorize.searchParams.set("scope", FB_SCOPES);
  }
  authorize.searchParams.set("state", "settings");

  return NextResponse.redirect(authorize.toString());
}
