import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  YT_OAUTH_STATE_COOKIE,
  exchangeCode,
  fetchMyChannel,
  readStateCookie,
  ytAuthConfigured,
  ytRedirectUri,
} from "@/lib/youtubeAuth";
import { canConnectAnother, getEntitlements, listConnectedAccounts } from "@/lib/entitlements";
import { trackEvent } from "@/lib/events";

export const runtime = "nodejs";

// Step 2 of YouTube OAuth: Google redirects here with ?code=... We verify the
// state nonce, trade the code for tokens, read the user's own channel, and save
// the connection to their row.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const state = url.searchParams.get("state") ?? "";
  const dotIndex = state.indexOf(".");
  const nonce = dotIndex === -1 ? state : state.slice(0, dotIndex);
  const destRaw = dotIndex === -1 ? "" : state.slice(dotIndex + 1);
  const dest = destRaw === "onboarding" ? "onboarding" : "settings";

  // Every exit clears the one-time state cookie.
  const done = (q: string) => {
    const res = NextResponse.redirect(`${origin}/${dest}?yt=${q}`);
    res.cookies.set(YT_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) return done("denied");

  // CSRF: the nonce echoed in state must match the cookie set at start.
  const cookieNonce = readStateCookie(req);
  if (!nonce || !cookieNonce || nonce !== cookieNonce) return done("error");

  const code = url.searchParams.get("code");
  if (!code) return done("error");
  if (!ytAuthConfigured()) return done("notconfigured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${dest}`);

  try {
    const tok = await exchangeCode(code, ytRedirectUri(origin));
    if (!tok) return done("error");

    const channel = await fetchMyChannel(tok.access_token);
    if (!channel) return done("nochannel");

    // Plan gate, server-side, before anything is written. Reconnecting the
    // channel already on file never counts as a new slot.
    const ent = await getEntitlements(supabase, user.id);
    const list = await listConnectedAccounts(supabase, user.id);
    if (!canConnectAnother(ent, list, "youtube", channel.channelId).ok) {
      await trackEvent(supabase, user.id, "account_limit_reached", { platform: "youtube", plan: ent.plan });
      return done("limit");
    }

    // A reconnect can return no refresh token; keep the stored one if so.
    let refreshToken = tok.refresh_token;
    if (!refreshToken) {
      const { data: prev } = await supabase
        .from("youtube_connections")
        .select("refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();
      refreshToken = (prev as { refresh_token?: string | null } | null)?.refresh_token ?? null;
    }

    const row = {
      user_id: user.id,
      channel_id: channel.channelId,
      title: channel.title,
      handle: channel.handle,
      avatar_url: channel.avatar,
      subscribers: channel.subscribers,
      access_token: tok.access_token,
      refresh_token: refreshToken,
      scopes: tok.scopes,
      token_expires_at: new Date(Date.now() + tok.expiresIn * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase
      .from("youtube_connections")
      .upsert(row, { onConflict: "user_id" });
    if (upErr) {
      console.error("YouTube connection upsert failed:", upErr.message);
      return done("error");
    }

    // Reflect it on the profile platform list so the sidebar and settings agree.
    // Best effort: the connection is already saved even if this write fails.
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("platforms")
        .eq("user_id", user.id)
        .maybeSingle();
      const platforms = Array.isArray((prof as { platforms?: string[] } | null)?.platforms)
        ? (prof as { platforms: string[] }).platforms
        : [];
      if (!platforms.includes("YouTube")) {
        await supabase
          .from("profiles")
          .upsert(
            { user_id: user.id, platforms: [...platforms, "YouTube"], updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
      }
    } catch {
      // platform list is cosmetic; ignore
    }

    return done("connected");
  } catch (e) {
    console.error("YouTube callback error:", e);
    return done("error");
  }
}
