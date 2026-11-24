// What a Step 1 goal reads beyond the brand profile (lib/generation/goals.ts):
// the account's own best posts, by its own numbers, or the Reels that took off
// in the niche (Discover's, lib/discoverData.ts). Each comes with a line the
// page shows, so the person sees what SOCIA used. Server only.
import { createClient } from "@/lib/supabase/server";
import type { Ctx } from "@/lib/context";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import { loadDiscoverData } from "@/lib/discoverData";
import { pickViral } from "@/lib/viralPick";
import { refResult } from "@/lib/trendSignals";
import type { IdeaContext } from "./ideas";
import type { StudioGoal } from "./goals";

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n));
const FORMAT: Record<string, string> = { VIDEO: "Reel", REELS: "Reel", IMAGE: "Photo", CAROUSEL_ALBUM: "Carousel" };

/** The account's best posts, best first: by views when Instagram gave them, else likes and comments. Pure. */
export function bestPostLines(media: IgMediaItem[], max = 5): string[] {
  const score = (m: IgMediaItem) => m.insights?.views ?? (m.like_count ?? 0) + (m.comments_count ?? 0);
  return media
    .filter((m) => m.caption && !m.collab_owner && score(m) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
    .map((m) => {
      const nums = [m.insights?.views != null ? `${fmt(m.insights.views)} views` : null, m.like_count != null ? `${fmt(m.like_count)} likes` : null, m.comments_count != null ? `${fmt(m.comments_count)} comments` : null].filter(Boolean).join(", ");
      const cap = (m.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
      return `${FORMAT[String(m.media_product_type === "REELS" ? "REELS" : m.media_type ?? "")] ?? "Post"}: "${cap}" (${nums})`;
    });
}

export async function loadIdeaContext(ctx: Ctx, viewerId: string, goal: StudioGoal, draft: string | null): Promise<{ context: IdeaContext; used: string | null }> {
  if (goal === "improve") return { context: { goal, draft }, used: draft ? "Your draft" : null };
  if (goal === "best") {
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
    const best = bestPostLines(snap?.media ?? []);
    return { context: { goal, best }, used: best.length ? `Your ${best.length} best ${best.length === 1 ? "post" : "posts"} on Instagram` : null };
  }
  if (goal === "trending") {
    const supabase = await createClient();
    const d = await loadDiscoverData(supabase, { id: viewerId }).catch(() => null);
    const reels = d ? pickViral(d, 6).reels : [];
    const trending = reels.map((r) => ({ url: r.url, account: r.accountHandle ? `@${r.accountHandle}` : r.accountName, line: (r.line ?? r.title ?? r.format).slice(0, 140), result: refResult(r) || null }));
    return { context: { goal, trending }, used: trending.length ? `${trending.length} Reels that took off in your niche` : null };
  }
  return { context: { goal }, used: null };
}
