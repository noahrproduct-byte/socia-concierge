import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FB_GRAPH_V, fbAppId, fbAppSecret, fbRedirectUri } from "@/lib/facebook";
import { syncFacebook } from "@/lib/facebookSync";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = `https://graph.facebook.com/${FB_GRAPH_V}`;

type PageEntry = {
  id: string;
  name?: string;
  username?: string;
  followers_count?: number;
  fan_count?: number;
  picture?: { data?: { url?: string } };
  access_token?: string;
};

// Step 2: exchange the code for a long-lived token, list the user's Pages,
// and either connect the single Page or ask the user to choose.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (q: string) => NextResponse.redirect(`${origin}/settings?fb=${q}`);

  if (url.searchParams.get("error_reason") === "user_denied" || url.searchParams.get("error") === "access_denied") {
    return done("denied");
  }
  const code = url.searchParams.get("code");
  if (!code) return done("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/settings`);

  try {
    // code -> short-lived user token
    const tokenUrl = new URL(`${BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", fbAppId()!);
    tokenUrl.searchParams.set("client_secret", fbAppSecret()!);
    tokenUrl.searchParams.set("redirect_uri", fbRedirectUri(origin));
    tokenUrl.searchParams.set("code", code);
    const shortRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(10000) });
    const shortJson = await shortRes.json().catch(() => null);
    if (!shortRes.ok || !shortJson?.access_token) return done("error");

    // short-lived -> long-lived user token (Page tokens derived from it don't expire)
    const longUrl = new URL(`${BASE}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", fbAppId()!);
    longUrl.searchParams.set("client_secret", fbAppSecret()!);
    longUrl.searchParams.set("fb_exchange_token", shortJson.access_token);
    const longRes = await fetch(longUrl, { signal: AbortSignal.timeout(10000) });
    const longJson = await longRes.json().catch(() => null);
    const userToken: string = longJson?.access_token ?? shortJson.access_token;

    // Pages this user manages (includes a Page access token per Page).
    const pagesUrl = new URL(`${BASE}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,username,followers_count,fan_count,picture{url},access_token");
    pagesUrl.searchParams.set("limit", "25");
    pagesUrl.searchParams.set("access_token", userToken);
    const pagesRes = await fetch(pagesUrl, { signal: AbortSignal.timeout(10000) });
    const pagesJson = await pagesRes.json().catch(() => null);
    if (!pagesRes.ok) return done("error");
    const pages: PageEntry[] = pagesJson?.data ?? [];
    if (!pages.length) return done("nopages");

    if (pages.length === 1) {
      // Unambiguous — connect it directly.
      const p = pages[0];
      const { error } = await supabase.from("facebook_connections").upsert(
        {
          user_id: user.id,
          page_id: p.id,
          page_name: p.name ?? null,
          username: p.username ?? null,
          followers_count: p.followers_count ?? p.fan_count ?? null,
          picture_url: p.picture?.data?.url ?? null,
          access_token: p.access_token ?? null,
          connection_status: "connected",
          pending_pages: null,
        },
        { onConflict: "user_id" },
      );
      if (error) return done("error");
      await syncFacebook(supabase, user.id).catch(() => null);
      return done("connected");
    }

    // Multiple Pages — store the list and let the user choose (never auto-pick).
    const { error } = await supabase.from("facebook_connections").upsert(
      {
        user_id: user.id,
        page_id: null,
        page_name: null,
        username: null,
        access_token: null,
        connection_status: "choose_page",
        pending_pages: pages,
      },
      { onConflict: "user_id" },
    );
    if (error) return done("error");
    return done("choose");
  } catch {
    return done("error");
  }
}
