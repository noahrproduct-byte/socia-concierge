import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FB_GRAPH_V, FB_OAUTH_STATE_COOKIE, FB_SCOPES, OAUTH_STATE_MAX_AGE, fbAppId, fbConfigId, fbConfigured, fbRedirectUri,
  newOauthNonce, oauthStateCookie,
} from "@/lib/facebook";

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
  const configId = fbConfigId();
  if (configId) {
    // Facebook Login for Business: permissions come from the configuration.
    authorize.searchParams.set("config_id", configId);
  } else {
    authorize.searchParams.set("scope", FB_SCOPES);
  }
  // A per-request nonce travels in `state` and in an HttpOnly cookie; the
  // callback exchanges the code only when the two match (CSRF).
  const nonce = newOauthNonce();
  authorize.searchParams.set("state", `${nonce}.settings`);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(oauthStateCookie(FB_OAUTH_STATE_COOKIE, nonce, OAUTH_STATE_MAX_AGE));
  return res;
}
