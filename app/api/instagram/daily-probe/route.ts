import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const V = "v23.0";

// Diagnostic: what does Meta actually return for a period=day series, and
// what's currently stored in account_snapshots? No tokens in the response.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: conn } = await supabase
    .from("instagram_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn?.access_token) return NextResponse.json({ error: "No connection." }, { status: 400 });
  const token = conn.access_token as string;

  const now = Math.floor(Date.now() / 1000);
  const since = now - 25 * 86400;

  async function attempt(label: string, params: Record<string, string>) {
    const u = new URL(`https://graph.instagram.com/${V}/me/insights`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", token);
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(12000) });
      const j = await res.json();
      return {
        label,
        status: res.status,
        error: j?.error?.message?.slice(0, 180) ?? null,
        names: (j?.data ?? []).map((d: { name?: string }) => d.name),
        valueCounts: (j?.data ?? []).map((d: { values?: unknown[] }) => d.values?.length ?? 0),
        sample: (j?.data ?? [])[0]?.values?.slice(0, 3) ?? null,
      };
    } catch (e) {
      return { label, status: 0, error: e instanceof Error ? e.message : "failed" };
    }
  }

  const attempts = await Promise.all([
    attempt("views+reach since/until", {
      metric: "views,reach",
      period: "day",
      since: String(since),
      until: String(now),
    }),
    attempt("views only since/until", {
      metric: "views",
      period: "day",
      since: String(since),
      until: String(now),
    }),
    attempt("views day no range", { metric: "views", period: "day" }),
    attempt("reach day no range", { metric: "reach", period: "day" }),
  ]);

  const { data: snaps, error: snapErr } = await supabase
    .from("account_snapshots")
    .select("day, followers, views, reach")
    .eq("user_id", user.id)
    .order("day", { ascending: false })
    .limit(10);

  return NextResponse.json({
    attempts,
    stored_rows: snaps ?? [],
    stored_error: snapErr?.message ?? null,
  });
}
