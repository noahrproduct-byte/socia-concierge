import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IG_SCOPES, igClientId, igConfigured, igRedirectUri } from "@/lib/instagram";

export const runtime = "nodejs";

// Step 1 of Instagram OAuth: send the (signed-in) user to Instagram's consent
// screen. Instagram sends them back to our /callback with a one-time code.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  if (!igConfigured()) {
    return NextResponse.redirect(`${origin}/settings?ig=notconfigured`);
  }

  // Must be signed in so the callback can attach the token to this user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/settings`);

  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("force_reauth", "true");
  authorize.searchParams.set("client_id", igClientId()!);
  authorize.searchParams.set("redirect_uri", igRedirectUri(origin));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", IG_SCOPES);

  return NextResponse.redirect(authorize.toString());
}
