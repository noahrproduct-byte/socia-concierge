import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getActiveConnection } from "@/lib/instagramSync";

export const runtime = "nodejs";
export const maxDuration = 120;

// Diagnostic: probes the real Instagram Insights endpoints for the ACTIVE
// Brand Workspace's connected account, one metric at a time, and reports the raw Meta
// responses (values, or the exact error). Never returns tokens. Used to
// establish exactly which metrics this account/token/API version provides,
// instead of assuming.

const V = "v23.0";
const BASE = `https://graph.instagram.com/${V}`;

type Probe = {
  metric: string;
  params: string;
  status: number;
  ok: boolean;
  value?: unknown;
  name?: string;
  error?: string;
  empty?: boolean;
};

async function probe(path: string, metric: string, extra: Record<string, string>, token: string): Promise<Probe> {
  const u = new URL(`${BASE}${path}`);
  u.searchParams.set("metric", metric);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  const paramsShown = `${path}?metric=${metric}${Object.entries(extra).map(([k, v]) => `&${k}=${v}`).join("")}`;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        metric,
        params: paramsShown,
        status: res.status,
        ok: false,
        error: json?.error?.message?.slice(0, 220) ?? "unparseable error",
      };
    }
    const d = json?.data?.[0];
    // Insights values arrive either as values[] (time series) or total_value.
    const value = d?.total_value?.value ?? d?.values?.map((v: { value: unknown }) => v.value) ?? null;
    return {
      metric,
      params: paramsShown,
      status: res.status,
      ok: true,
      name: d?.name,
      value,
      empty: !json?.data?.length, // empty array = metric not provided, NOT zero
    };
  } catch (e) {
    return { metric, params: paramsShown, status: 0, ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const conn = await getActiveConnection(ctx.client, ctx.ownerId, "access_token, username, media");
  if (!conn?.access_token) return NextResponse.json({ error: "No Instagram connection." }, { status: 400 });
  const token = conn.access_token as string;

  // Who/what is this account?
  const meRes = await fetch(
    `${BASE}/me?fields=id,username,account_type,followers_count&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const me = await meRes.json().catch(() => null);

  // ---- raw media list: exactly what Instagram says the account published.
  // media_product_type distinguishes FEED / REELS / STORY; the media edge
  // itself omits stories and collab posts authored by the partner account,
  // which is the usual cause of "SOCIA missed my post". ----
  const mediaRes = await fetch(
    `${BASE}/me/media?fields=id,timestamp,media_type,media_product_type,caption,permalink&limit=10&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(10000) },
  );
  const mediaJson = await mediaRes.json().catch(() => null);
  const recent_media =
    mediaJson?.data?.map((m: Record<string, unknown>) => ({
      timestamp: m.timestamp ?? null,
      media_type: m.media_type ?? null,
      media_product_type: m.media_product_type ?? null,
      caption: typeof m.caption === "string" ? m.caption.split("\n")[0].slice(0, 60) : null,
      permalink: m.permalink ?? null,
    })) ?? null;

  // ---- account-level insights, one metric at a time ----
  const accountMetrics = [
    "views",
    "reach",
    "follower_count",
    "profile_views",
    "accounts_engaged",
    "total_interactions",
    "likes",
    "comments",
    "saves",
    "shares",
  ];
  const account: Probe[] = await Promise.all(
    accountMetrics.map(async (metric) => {
      // Most interaction metrics require metric_type=total_value; try that
      // first, then fall back to a plain period=day series.
      const p = await probe("/me/insights", metric, { period: "day", metric_type: "total_value" }, token);
      if (p.ok) return p;
      const fallback = await probe("/me/insights", metric, { period: "day" }, token);
      if (fallback.ok) return fallback;
      p.error = `${p.error} || plain: ${fallback.error?.slice(0, 120)}`;
      return p;
    }),
  );

  // ---- media-level insights on one reel and one non-reel ----
  const media = Array.isArray(conn.media) ? (conn.media as { id?: string; media_type?: string }[]) : [];
  const reel = media.find((m) => m.media_type === "VIDEO");
  const other = media.find((m) => m.media_type !== "VIDEO");
  const mediaMetrics = ["views", "reach", "saved", "shares", "likes", "comments", "total_interactions"];
  const mediaProbes: Record<string, Probe[]> = {};
  for (const [label, item] of [["reel", reel], ["other", other]] as const) {
    if (!item?.id) continue;
    mediaProbes[`${label} (${item.media_type})`] = await Promise.all(
      mediaMetrics.map((metric) => probe(`/${item.id}/insights`, metric, {}, token)),
    );
  }

  return NextResponse.json({
    api_version: V,
    recent_media,
    recent_media_error: mediaJson?.error?.message ?? null,
    account_info: {
      username: me?.username ?? null,
      ig_user_id: me?.id ?? null,
      account_type: me?.account_type ?? null,
      followers: me?.followers_count ?? null,
      me_error: me?.error?.message ?? null,
    },
    account_insights: account,
    media_insights: mediaProbes,
  });
}
