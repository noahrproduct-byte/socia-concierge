import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FB_GRAPH_V, FB_SCOPES, fbAppId, fbConfigId, fbConfigured, fbRedirectUri } from "@/lib/facebook";
import { FB_STATE_COOKIE, newOAuthState, setStateCookie } from "@/lib/oauthState";

export const runtime = "nodejs";

// Step 1 of Facebook OAuth: send the signed-in user to Meta's consent screen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // Where to land after the callback: settings (default) or the onboarding
  // wizard, carried through Facebook in the OAuth state param.
  const dest = url.searchParams.get("next") === "onboarding" ? "onboarding" : "settings";

  if (!fbConfigured()) {
    return NextResponse.redirect(`${origin}/${dest}?fb=notconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${dest}`);

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
    // Force Facebook to show the consent dialog again. When a user is already
    // connected, Facebook skips it and returns the EXISTING permissions, so a
    // newly-added scope (pages_read_user_content) is never granted on reconnect.
    // rerequest re-prompts for the missing/declined permissions.
    authorize.searchParams.set("auth_type", "rerequest");
  }
  // CSRF: a one-time nonce in an HttpOnly cookie, echoed back in state.
  const { state, nonce } = newOAuthState(dest);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  setStateCookie(res, FB_STATE_COOKIE, nonce);
  return res;
}
