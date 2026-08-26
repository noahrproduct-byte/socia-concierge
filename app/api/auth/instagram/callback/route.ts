import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { igAppSecret, igClientId, igConfigured, igRedirectUri } from "@/lib/instagram";
import { syncInstagram } from "@/lib/instagramSync";
import { accountLimit, getPlan } from "@/lib/plan";

export const runtime = "nodejs";

// Step 2 of Instagram OAuth: Instagram redirects here with ?code=... We trade
// the code (+ app secret) for a short-lived token, upgrade it to a 60-day
// long-lived token, fetch the account, and save it to the user's row.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // The start route put the return page in the OAuth state param.
  const dest = url.searchParams.get("state") === "onboarding" ? "onboarding" : "settings";
  const settings = (state: string) => NextResponse.redirect(`${origin}/${dest}?ig=${state}`);

  const error = url.searchParams.get("error");
  if (error) return settings("denied");

  // Instagram appends a "#_" fragment; strip it defensively.
  const code = url.searchParams.get("code")?.replace(/#_$/, "");
  if (!code) return settings("error");
  if (!igConfigured()) return settings("notconfigured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/settings`);

  const redirectUri = igRedirectUri(origin);

  try {
    // 1) Exchange the code for a short-lived token.
    const form = new URLSearchParams();
    form.set("client_id", igClientId()!);
    form.set("client_secret", igAppSecret()!);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code);

    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form,
    });
    const shortJson = await shortRes.json();
    if (!shortRes.ok || !shortJson.access_token) {
      console.error("IG short-token exchange failed:", shortJson);
      return settings("error");
    }
    const shortToken: string = shortJson.access_token;

    // 2) Upgrade to a long-lived (~60 day) token.
    const llUrl = new URL("https://graph.instagram.com/access_token");
    llUrl.searchParams.set("grant_type", "ig_exchange_token");
    llUrl.searchParams.set("client_secret", igAppSecret()!);
    llUrl.searchParams.set("access_token", shortToken);
    const llRes = await fetch(llUrl.toString());
    const llJson = await llRes.json();
    const longToken: string = llJson.access_token ?? shortToken;
    const expiresIn: number = llJson.expires_in ?? 60 * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Fetch the connected account's basic profile.
    const meUrl = new URL("https://graph.instagram.com/v21.0/me");
    meUrl.searchParams.set("fields", "user_id,username,account_type");
    meUrl.searchParams.set("access_token", longToken);
    const meRes = await fetch(meUrl.toString());
    const me = await meRes.json();

    // 4) Save the connection and reflect it on the profile. Reconnecting an
    // already-connected account is always allowed; a NEW account beyond the
    // plan's limit is the Pro gate (free: 1, pro: 3).
    const igId: string | null = me.user_id?.toString() ?? shortJson.user_id?.toString() ?? null;
    const { data: existingRows } = await supabase
      .from("instagram_connections")
      .select("ig_user_id, username")
      .eq("user_id", user.id);
    const existing = (existingRows ?? []) as { ig_user_id: string | null; username: string | null }[];
    const already = existing.some(
      (r) => (igId != null && r.ig_user_id === igId) || (me.username && r.username === me.username),
    );
    if (!already && existing.length >= accountLimit(await getPlan(supabase, user.id))) {
      return NextResponse.redirect(`${origin}/settings?ig=limit`);
    }

    const connRow = {
      user_id: user.id,
      ig_user_id: igId,
      username: me.username ?? null,
      account_type: me.account_type ?? null,
      access_token: longToken,
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    };
    // The freshly connected account becomes the one every page reads.
    // Deactivate the others FIRST: a partial unique index enforces one active
    // row per user, so activating before deactivating would violate it.
    // (Errors ignored pre-migration, where is_active doesn't exist.)
    await supabase
      .from("instagram_connections")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .then(() => undefined, () => undefined);
    // Post-migration identity is (user_id, ig_user_id); pre-migration it is
    // user_id alone, so fall back when the composite constraint isn't there.
    const { error: upsertErr } = await supabase
      .from("instagram_connections")
      .upsert({ ...connRow, is_active: true }, { onConflict: "user_id,ig_user_id" });
    if (upsertErr) {
      await supabase.from("instagram_connections").upsert(connRow, { onConflict: "user_id" });
    }

    await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, account_connected: true, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    // 5) First sync, immediately — profile + recent posts are cached before
    // the user even lands back in the app, so the dashboard is live at once.
    try {
      await syncInstagram(supabase, user.id);
    } catch {
      // pages self-heal with a stale-triggered sync
    }

    // Success lands on the dashboard, where the sync cinematic plays over the
    // freshly-live data. The onboarding path keeps its own analysis sequence.
    if (dest === "onboarding") return settings("connected");
    return NextResponse.redirect(`${origin}/dashboard?ig=connected`);
  } catch (e) {
    console.error("IG callback error:", e);
    return settings("error");
  }
}
