// The account's recent wins, read through the same loaders the Calendar uses
// for its result chips (lib/planOutcomesLoad.ts). Server only.
import type { Ctx } from "@/lib/context";
import type { ScheduledPost } from "@/lib/scheduling";
import { scopeToWorkspace } from "@/lib/workspaces";
import { loadDestinationsLite, loadMeasureSources, resultsForPosts } from "@/lib/planOutcomesLoad";
import { winsFrom, type Win, type WinInput } from "./core";

/** Published posts of the last 90 days, newest first, with each one's result. `only` narrows to one post. */
export async function loadWins(ctx: Ctx, opts: { only?: string; limit?: number; now?: Date } = {}): Promise<Win[]> {
  const now = opts.now ?? new Date();
  const wsId = ctx.workspace?.id ?? null;
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  let q = ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).eq("status", "published").gte("updated_at", since).order("updated_at", { ascending: false }).limit(60);
  if (opts.only) q = q.eq("id", opts.only);
  const { data, error } = await scopeToWorkspace(q, wsId);
  if (error) return [];
  const posts = (data ?? []) as (ScheduledPost & { published_at?: string | null })[];
  if (!posts.length) return [];
  const dests = await loadDestinationsLite(ctx.client, posts.map((p) => p.id));
  const sources = await loadMeasureSources(ctx.client, ctx.ownerId, wsId, posts, dests);
  const results = resultsForPosts(posts, dests, sources, now);
  const inputs: WinInput[] = posts.flatMap((p) => {
    const r = results.get(p.id);
    if (!r) return [];
    const published = dests.find((d) => d.postId === p.id && d.platform === r.platform)?.publishedAt ?? p.published_at ?? p.updated_at;
    // YouTube is compared on views; Instagram and Facebook on interactions (lib/postResults.ts).
    return [{ postId: p.id, caption: p.caption, publishedAt: published, platform: r.platform, metric: r.platform === "youtube" ? "views" : "interactions", multiplier: r.multiplier, measured: r.measured, early: r.early }];
  });
  return winsFrom(inputs, opts.limit);
}
