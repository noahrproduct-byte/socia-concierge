import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FB_GRAPH_V, fbAppId, fbAppSecret } from "@/lib/facebook";

export const runtime = "nodejs";

// TEMPORARY diagnostic: inspect the scopes actually carried by the stored
// Facebook PAGE token (via debug_token), so we can tell whether
// pages_read_user_content was granted to the token SOCIA uses. Returns scope
// NAMES only — never the token itself. Authed: a user only sees their own
// connection. Remove once the Facebook posts issue is resolved.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data } = await supabase
    .from("facebook_connections")
    .select("access_token, page_id, connection_status")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as { access_token?: string; page_id?: string; connection_status?: string } | null;
  if (!row?.access_token) return NextResponse.json({ error: "no facebook connection or no stored token", connection_status: row?.connection_status ?? null });

  const appId = fbAppId(), appSecret = fbAppSecret();
  if (!appId || !appSecret) return NextResponse.json({ error: "Facebook app credentials not configured on THIS server (open this on production, not localhost)" });

  const u = new URL(`https://graph.facebook.com/${FB_GRAPH_V}/debug_token`);
  u.searchParams.set("input_token", row.access_token);
  u.searchParams.set("access_token", `${appId}|${appSecret}`);
  const res = await fetch(u, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = await res?.json().catch(() => null) as { data?: { type?: string; is_valid?: boolean; scopes?: string[]; granular_scopes?: { scope: string; target_ids?: string[] }[] }; error?: unknown } | null;
  const d = j?.data;
  const scopes = d?.scopes ?? [];
  return NextResponse.json({
    page_id: row.page_id ?? null,
    connection_status: row.connection_status ?? null,
    token_type: d?.type ?? null,
    is_valid: d?.is_valid ?? null,
    has_pages_read_user_content: scopes.includes("pages_read_user_content"),
    has_pages_read_engagement: scopes.includes("pages_read_engagement"),
    scopes,
    granular_scopes: d?.granular_scopes ?? null,
    debug_error: j?.error ?? null,
  });
}
