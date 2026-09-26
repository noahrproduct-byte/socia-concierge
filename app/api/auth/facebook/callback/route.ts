import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { igAccountForPage } from "@/lib/igBusinessDiscovery";
import { FB_GRAPH_V, fbAppId, fbAppSecret, fbRedirectUri } from "@/lib/facebook";
import { syncFacebook } from "@/lib/facebookSync";
import { activeByPlatform, canConnectAnother, getEntitlements, getLimit, listConnectedAccounts } from "@/lib/entitlements";
import { ensureDefaultWorkspace, workspacesEnabled } from "@/lib/workspaces";
import { trackEvent } from "@/lib/events";

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

// Pages a person reaches through a Business Portfolio. New Pages Experience /
// Business-owned Pages do NOT come back from /me/accounts even for a direct
// admin, so when that edge is empty we look through the person's Businesses.
// Needs business_management on the token.
async function pagesViaBusiness(base: string, token: string): Promise<PageEntry[]> {
  const out: PageEntry[] = [];
  const seen = new Set<string>();
  try {
    const bizUrl = new URL(`${base}/me/businesses`);
    bizUrl.searchParams.set("fields", "id,name");
    bizUrl.searchParams.set("limit", "25");
    bizUrl.searchParams.set("access_token", token);
    const bizRes = await fetch(bizUrl, { signal: AbortSignal.timeout(10000) });
    const bizJson = (await bizRes.json().catch(() => null)) as { data?: { id: string }[] } | null;
    for (const b of bizJson?.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"] as const) {
        const pUrl = new URL(`${base}/${b.id}/${edge}`);
        pUrl.searchParams.set("fields", "id,name,username,followers_count,fan_count,picture{url},access_token");
        pUrl.searchParams.set("limit", "50");
        pUrl.searchParams.set("access_token", token);
        const pRes = await fetch(pUrl, { signal: AbortSignal.timeout(10000) });
        const pJson = (await pRes.json().catch(() => null)) as { data?: PageEntry[] } | null;
        for (const p of pJson?.data ?? []) {
          if (p?.id && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
        }
      }
    }
  } catch {
    /* return whatever was collected */
  }
  return out;
}

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

    // The app-scoped Facebook user id, so a later deauthorize or data
    // deletion request from Meta (which carries only this id) can find the
    // connection. Best effort: the connection works without it.
    let fbUserId: string | null = null;
    try {
      const meUrl = new URL(`${BASE}/me`);
      meUrl.searchParams.set("fields", "id");
      meUrl.searchParams.set("access_token", userToken);
      const meRes = await fetch(meUrl, { signal: AbortSignal.timeout(8000) });
      const meJson = (await meRes.json().catch(() => null)) as { id?: string } | null;
      fbUserId = meJson?.id ?? null;
    } catch {
      fbUserId = null;
    }

    // Pages this user manages (includes a Page access token per Page).
    const pagesUrl = new URL(`${BASE}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,username,followers_count,fan_count,picture{url},access_token");
    pagesUrl.searchParams.set("limit", "25");
    pagesUrl.searchParams.set("access_token", userToken);
    const pagesRes = await fetch(pagesUrl, { signal: AbortSignal.timeout(10000) });
    const pagesJson = await pagesRes.json().catch(() => null);
    if (!pagesRes.ok) return done("error");
    let pages: PageEntry[] = pagesJson?.data ?? [];
    // New Pages Experience / Business-owned Pages are invisible to /me/accounts;
    // fall back to the person's Businesses before giving up.
    let viaBusiness = 0;
    if (!pages.length) {
      const bizPages = await pagesViaBusiness(BASE, userToken);
      viaBusiness = bizPages.length;
      if (bizPages.length) pages = bizPages;
    }
    if (!pages.length) {
      // An empty Page list has two very different causes, and the user cannot
      // act until they know which. Ask Facebook what it actually granted:
      // with Facebook Login for Business the permissions come from the login
      // configuration in the Meta dashboard, NOT from the scope parameter, so
      // a config missing pages_show_list returns no Pages however many the
      // user grants.
      let granted: string[] = [];
      try {
        const permUrl = new URL(`${BASE}/me/permissions`);
        permUrl.searchParams.set("access_token", userToken);
        const permRes = await fetch(permUrl, { signal: AbortSignal.timeout(10000) });
        const permJson = (await permRes.json().catch(() => null)) as
          | { data?: { permission?: string; status?: string }[] }
          | null;
        granted = (permJson?.data ?? [])
          .filter((x) => x.status === "granted" && x.permission)
          .map((x) => x.permission!);
      } catch {
        /* fall through to the generic message */
      }
      // Diagnostic: /me/accounts returned no Pages. Surface what Facebook
      // actually granted so a missing pages_show_list in the login
      // configuration is distinguishable from an account with no Page. Names
      // only, no tokens. Remove once the connect path is confirmed.
      console.error("[fb connect] no pages returned. granted=", granted, " viaBusiness=", viaBusiness, " accountsRaw=", JSON.stringify(pagesJson).slice(0, 400));
      const reason = granted.length && !granted.includes("pages_show_list") ? "noperm" : "nopages";
      return NextResponse.redirect(`${origin}/settings?fb=${reason}&fbperms=${encodeURIComponent(granted.join(",") || "none")}&fbbiz=${viaBusiness}`);
    }

    // Plan gate, server-side, before anything is written. A Page's identity is
    // its page id, so reconnecting the Page already on file never hits it.
    const ent = await getEntitlements(supabase, user.id);
    const list = await listConnectedAccounts(supabase, user.id);
    // Brand Workspaces: the Page belongs to the active workspace (one per
    // workspace), so writes conflict on workspace_id and the fb_user_id update
    // is scoped to that row. Before the migration it stays one row per user.
    const ws = (await workspacesEnabled(supabase)) ? await ensureDefaultWorkspace(supabase, user.id) : null;
    const onConflict = ws ? "workspace_id" : "user_id";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scopeFb = (q: any) => (ws ? q.eq("workspace_id", ws.id) : q);
    const limitHit = async () => {
      await trackEvent(supabase, user.id, "account_limit_reached", { platform: "facebook", plan: ent.plan });
      return done("limit");
    };

    if (pages.length === 1) {
      // Unambiguous — connect it directly.
      const p = pages[0];
      if (!canConnectAnother(ent, list, "facebook", p.id).ok) return limitHit();
      // The Page-linked Instagram account is what unlocks Business Discovery.
      const ig = p.access_token ? await igAccountForPage(p.id, p.access_token).catch(() => null) : null;
      const row: Record<string, unknown> = {
        user_id: user.id,
        page_id: p.id,
        page_name: p.name ?? null,
        username: p.username ?? null,
        followers_count: p.followers_count ?? p.fan_count ?? null,
        picture_url: p.picture?.data?.url ?? null,
        access_token: p.access_token ?? null,
        connection_status: "connected",
        pending_pages: null,
        ig_business_id: ig?.id ?? null,
        ig_business_username: ig?.username ?? null,
      };
      if (ws) row.workspace_id = ws.id;
      let { error } = await supabase
        .from("facebook_connections")
        .upsert(row, { onConflict });
      if (error) {
        // ig_business_* columns may not exist yet — connect without them.
        delete row.ig_business_id;
        delete row.ig_business_username;
        ({ error } = await supabase
          .from("facebook_connections")
          .upsert(row, { onConflict }));
      }
      if (error) return done("error");
      if (fbUserId) await scopeFb(supabase.from("facebook_connections").update({ fb_user_id: fbUserId }).eq("user_id", user.id)).then(() => null, () => null);
      await syncFacebook(supabase, user.id).catch(() => null);
      return done("connected");
    }

    // Multiple Pages — store the list and let the user choose (never auto-pick).
    // No Page is chosen yet, so only block when there is no Facebook Page on
    // file to reconnect AND every slot is already taken; the select route
    // re-checks with the chosen id.
    const hasFbPage = list.some((a) => a.platform === "facebook");
    if (!hasFbPage && activeByPlatform(list).facebook >= getLimit(ent, "workspaces")) return limitHit();
    const pendingRow: Record<string, unknown> = {
      user_id: user.id,
      page_id: null,
      page_name: null,
      username: null,
      access_token: null,
      connection_status: "choose_page",
      pending_pages: pages,
    };
    if (ws) pendingRow.workspace_id = ws.id;
    const { error } = await supabase.from("facebook_connections").upsert(pendingRow, { onConflict });
    if (error) return done("error");
    if (fbUserId) await scopeFb(supabase.from("facebook_connections").update({ fb_user_id: fbUserId }).eq("user_id", user.id)).then(() => null, () => null);
    return done("choose");
  } catch {
    return done("error");
  }
}
