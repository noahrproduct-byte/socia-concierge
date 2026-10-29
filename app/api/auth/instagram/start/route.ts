import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IG_SCOPES, igClientId, igConfigured, igRedirectUri } from "@/lib/instagram";
import { IG_STATE_COOKIE, newOAuthState, setStateCookie } from "@/lib/oauthState";

export const runtime = "nodejs";

// Step 1 of Instagram OAuth: send the (signed-in) user to Instagram's consent
// screen. Instagram sends them back to our /callback with a one-time code.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // Where to land after the callback: the settings page (default) or the
  // onboarding wizard, passed through Instagram via the OAuth state param.
  const next = url.searchParams.get("next") === "onboarding" ? "onboarding" : "settings";

  if (!igConfigured()) {
    return NextResponse.redirect(`${origin}/${next}?ig=notconfigured`);
  }

  // Must be signed in so the callback can attach the token to this user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${next}`);

  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("force_reauth", "true");
  authorize.searchParams.set("client_id", igClientId()!);
  authorize.searchParams.set("redirect_uri", igRedirectUri(origin));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", IG_SCOPES);
  // CSRF: a one-time nonce in an HttpOnly cookie, echoed back in state.
  const { state, nonce } = newOAuthState(next);
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  setStateCookie(res, IG_STATE_COOKIE, nonce);
  return res;
}
