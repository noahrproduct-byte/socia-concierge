import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TT_OAUTH_STATE_COOKIE,
  exchangeCode,
  fetchMyProfile,
  fetchMyVideos,
  readStateCookie,
  ttAuthConfigured,
  ttRedirectUri,
} from "@/lib/tiktokAuth";
import { profileColumns } from "@/lib/tiktokData";
import { canConnectAnother, getEntitlements, listConnectedAccounts } from "@/lib/entitlements";
import { trackEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 2 of TikTok OAuth: TikTok redirects here with ?code=... We verify the
// state nonce, trade the code for tokens, read the user's own profile and
// videos, and save the connection to their row.
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
    const res = NextResponse.redirect(`${origin}/${dest}?tt=${q}`);
    res.cookies.set(TT_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // TikTok sends ?error=access_denied when the person cancels the consent screen.
  if (url.searchParams.get("error")) return done("denied");

  const cookieNonce = readStateCookie(req);
  if (!nonce || !cookieNonce || nonce !== cookieNonce) return done("error");

  const code = url.searchParams.get("code");
  if (!code) return done("error");
  if (!ttAuthConfigured()) return done("notconfigured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/${dest}`);

  try {
    const tok = await exchangeCode(code, ttRedirectUri(origin));
    if (!tok) return done("error");

    const profile = await fetchMyProfile(tok.access_token);
    if (!profile) return done("noprofile");

    // Plan gate, server-side, before anything is written. Reconnecting the
    // account already on file never counts as a new slot.
    const ent = await getEntitlements(supabase, user.id);
    const list = await listConnectedAccounts(supabase, user.id);
    if (!canConnectAnother(ent, list, "tiktok", profile.openId).ok) {
      await trackEvent(supabase, user.id, "account_limit_reached", { platform: "tiktok", plan: ent.plan });
      return done("limit");
    }

    // Videos are best effort: a token without video.list (or a brand-new
    // account) still connects.
    const videos = await fetchMyVideos(tok.access_token, 20).catch(() => null);

    const now = Date.now();
    const row: Record<string, unknown> = {
      user_id: user.id,
      ...profileColumns(profile),
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      scopes: tok.scopes,
      token_expires_at: new Date(now + tok.expiresIn * 1000).toISOString(),
      refresh_expires_at: tok.refreshExpiresIn != null ? new Date(now + tok.refreshExpiresIn * 1000).toISOString() : null,
      videos: videos ?? null,
      last_synced_at: new Date(now).toISOString(),
      // plan_suspended_at is deliberately not written: the column is locked by
      // a trigger (only SOCIA billing may pause or un-pause), and a reconnect
      // of a paused account must not fail on it. New rows start un-paused.
      connected_at: new Date(now).toISOString(),
    };
    const { error: upErr } = await supabase.from("tiktok_connections").upsert(row, { onConflict: "user_id" });
    if (upErr) {
      console.error("TikTok connection upsert failed:", upErr.message);
      return done("error");
    }

    // Reflect it on the profile platform list so the sidebar and settings agree.
    try {
      const { data: prof } = await supabase.from("profiles").select("platforms").eq("user_id", user.id).maybeSingle();
      const platforms = Array.isArray((prof as { platforms?: string[] } | null)?.platforms)
        ? (prof as { platforms: string[] }).platforms
        : [];
      if (!platforms.includes("TikTok")) {
        await supabase
          .from("profiles")
          .upsert({ user_id: user.id, platforms: [...platforms, "TikTok"], updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      }
    } catch {
      // cosmetic
    }

    return done("connected");
  } catch (e) {
    console.error("TikTok callback error:", e);
    return done("error");
  }
}
