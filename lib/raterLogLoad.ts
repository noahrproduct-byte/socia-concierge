// Reading and writing the Content Rater's memory (lib/raterLog.ts). The log
// sits on the brand's own row (brand_detail.rater), like its last idea set,
// so it needs no table of its own. Each entry's post is looked up on the
// Calendar and measured the way every published post is (lib/postResults.ts).
// Server only.

import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { scopeToWorkspace, updateWorkspace } from "@/lib/workspaces";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import type { ScheduledPost } from "@/lib/scheduling";
import { loadDestinationsLite, loadMeasureSources, resultsForPosts } from "@/lib/planOutcomesLoad";
import { measureDestination } from "@/lib/postResults";
import { addEntry, sanitizeLog, type PostState, type RaterEntry, type RaterOutcome } from "./raterLog";

export async function readLog(ctx: Ctx): Promise<RaterEntry[]> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizeLog((d as { rater?: unknown }).rater);
}

/** Best effort: a record that can't be saved never blocks saving the post. */
export async function saveEntry(ctx: Ctx, entry: RaterEntry): Promise<boolean> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, rater: { log: addEntry(sanitizeLog((detail as { rater?: unknown }).rater), entry) } } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) return await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
    const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}

/** Whether this post is on this brand's Calendar: an entry is only ever recorded for one that is. */
export async function ownsPost(ctx: Ctx, postId: string): Promise<boolean> {
  try {
    const { data } = await scopeToWorkspace(ctx.client.from("scheduled_posts").select("id").eq("user_id", ctx.ownerId).eq("id", postId), ctx.workspace?.id).limit(1);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

const stateOf = (p: ScheduledPost | undefined): PostState => {
  if (!p || p.status === "cancelled") return "gone";
  if (p.status === "published") return "published";
  if (p.status === "failed") return "failed";
  return p.status === "draft" ? "draft" : "scheduled";
};

/** The log with each entry's post state and, once published, its result against the account's usual. */
export async function loadOutcomes(ctx: Ctx, now: Date = new Date()): Promise<RaterOutcome[]> {
  const log = await readLog(ctx);
  if (!log.length) return [];
  const wsId = ctx.workspace?.id ?? null;
  let posts: ScheduledPost[] = [];
  try {
    const { data } = await scopeToWorkspace(ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).in("id", log.map((e) => e.postId)), wsId);
    posts = (data ?? []) as ScheduledPost[];
  } catch {
    posts = [];
  }
  const byId = new Map(posts.map((p) => [p.id, p]));
  let results = new Map<string, { short: string; text: string; measured: boolean; early: boolean; multiplier: number | null }>();
  // The Reel's own view count, for the range stated before it went out.
  const views = new Map<string, number>();
  const published = posts.filter((p) => p.status === "published");
  if (published.length) {
    try {
      const dests = await loadDestinationsLite(ctx.client, published.map((p) => p.id));
      const sources = await loadMeasureSources(ctx.client, ctx.ownerId, wsId, published, dests);
      results = resultsForPosts(published, dests, sources, now);
      for (const p of published) {
        const igId = dests.find((d) => d.postId === p.id && d.platform === "instagram" && d.status === "published" && d.externalPostId)?.externalPostId ?? p.published_media_id;
        const v = igId ? measureDestination("instagram", igId, sources).views : null;
        if (v != null) views.set(p.id, v);
      }
    } catch {
      /* results stay empty: each entry then says it is not measured yet */
    }
  }
  return log.map((e) => {
    const p = byId.get(e.postId);
    const r = results.get(e.postId);
    return {
      ...e, state: stateOf(p), publishedAt: p?.status === "published" ? p.updated_at : null, permalink: p?.permalink ?? null,
      result: r ? { short: r.short, text: r.text, measured: r.measured, early: r.early, multiplier: r.multiplier, views: views.get(e.postId) ?? null } : null,
    };
  });
}
