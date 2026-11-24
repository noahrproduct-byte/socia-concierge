import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile, type BrandDetail } from "@/lib/profile";
import { trendFitOf } from "@/lib/discoverIntel";
import { rankTrending } from "@/lib/trendFit";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { ownAccounts } from "@/lib/ownAccounts";
import { getIgSnapshot } from "@/lib/instagramSync";
import { trendingFor, trendingPool } from "@/lib/discoverTrending";
import { feedPage } from "@/lib/discoverFeed";
import { signRefUrl } from "@/lib/studioClips/refToken";
import { isPlatformMediaUrl } from "@/lib/fetchGuard";

export const runtime = "nodejs";

// More of Discover's Trending feed (lib/discoverTrending.ts): a page of viral Reels from any industry that this
// business could adapt (lib/trendFit.ts, judged in the background read), never the brand's own and never one its
// Recommended feed already shows (their keys come as ?skip=). No AI, no new reads.
//   GET ?offset=12&skip=key1,key2 -> { reels, next }
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (!canUseFeature(ent, "niche_intelligence")) return NextResponse.json({ error: "Trending Reels are on a paid plan." }, { status: 403 });
  const u = new URL(req.url);
  const offset = Math.max(0, Math.min(1000, Number(u.searchParams.get("offset")) || 0));
  const skip = new Set((u.searchParams.get("skip") ?? "").split(",").map((k) => k.trim()).filter((k) => /^[A-Za-z0-9_-]{4,40}$/.test(k)).slice(0, 120));
  const [mine, snap, profile] = await Promise.all([
    ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
  ]);
  const own = mine ?? { keys: new Set<string>(), ids: new Set<string>(), handles: [] };
  if (snap?.username) own.keys.add(snap.username.toLowerCase().replace(/[^a-z0-9]/g, ""));
  // The same order as the page's first page: what this business could adapt (lib/trendFit.ts).
  const now = new Date();
  const fit = trendFitOf((profile?.brand_detail ?? null) as BrandDetail | null, profile?.niche ?? null, profile?.brand_name ?? null);
  const ranked = rankTrending(trendingFor(await trendingPool(now), { mine: own, skip }), fit.business, fit.store, fit.profile, now);
  const page = feedPage(ranked.reels, offset);
  const reels = page.reels.map((r) => { const t = r.video && isPlatformMediaUrl(r.video) ? signRefUrl(user.id, r.video) : null; return t ? { ...r, refToken: t } : r; });
  return NextResponse.json({ reels, next: page.next });
}
