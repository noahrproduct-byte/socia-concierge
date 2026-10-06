// Server-side loaders for post results and plan outcomes. They gather the rows
// SOCIA already stores (scheduled posts, their destinations, the Instagram and
// Facebook snapshots, the owner's YouTube uploads) and hand them to the pure
// functions in lib/postResults.ts and lib/planOutcomes.ts. Live YouTube reads
// go through the short-lived cache.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deliverable } from "./schema";
import type { ScheduledPost } from "./scheduling";
import type { Platform } from "./publishing/types";
import { loadDestinationRows, type DestinationRow } from "./publishing/db";
import { getIgSnapshot } from "./instagramSync";
import { getFbSnapshot } from "./facebookSync";
import { youtubeRecentUploads, youtubeVideoStats } from "./youtubeData";
import { cachedLive } from "./liveCache";
import { EMPTY_SOURCES, resultLine, measureDestination, type MeasureSources, type ResultLine } from "./postResults";
import { buildPlanOutcome, type DestinationLite, type PlanOutcome } from "./planOutcomes";
import { timed } from "./timing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const toLite = (r: DestinationRow): DestinationLite => ({
  postId: r.post_id,
  platform: r.platform as Platform,
  status: r.status,
  externalPostId: r.external_post_id,
  publishedAt: r.published_at,
  permalink: r.permalink,
});

/** Destination rows for these posts; none when the table is missing or unreadable. */
export async function loadDestinationsLite(supabase: Supa, postIds: string[]): Promise<DestinationLite[]> {
  if (!postIds.length) return [];
  try {
    return (await loadDestinationRows(supabase, postIds)).map(toLite);
  } catch {
    return [];
  }
}

/** Which platforms have a published post among these destinations / legacy rows, and the YouTube ids. */
function needsOf(posts: ScheduledPost[], dests: DestinationLite[]): { platforms: Set<Platform>; youtubeIds: string[] } {
  const platforms = new Set<Platform>();
  const youtubeIds: string[] = [];
  for (const d of dests) {
    if (d.status !== "published" || !d.externalPostId) continue;
    platforms.add(d.platform);
    if (d.platform === "youtube") youtubeIds.push(d.externalPostId);
  }
  if (posts.some((p) => p.status === "published" && p.published_media_id)) platforms.add("instagram");
  return { platforms, youtubeIds };
}

/**
 * The platform data needed to measure these posts. Only platforms with a
 * published post are read; Instagram and Facebook come from the stored
 * snapshots, YouTube from the owner's channel (cached briefly).
 */
export async function loadMeasureSources(supabase: Supa, ownerId: string, workspaceId: string | null, posts: ScheduledPost[], dests: DestinationLite[]): Promise<MeasureSources> {
  const { platforms, youtubeIds } = needsOf(posts, dests);
  if (!platforms.size) return EMPTY_SOURCES;
  const [ig, fb, yt] = await Promise.all([
    platforms.has("instagram") ? timed("results.instagram", () => getIgSnapshot(supabase, ownerId)).catch(() => null) : Promise.resolve(null),
    platforms.has("facebook") ? timed("results.facebook", () => getFbSnapshot(supabase, ownerId)).catch(() => null) : Promise.resolve(null),
    platforms.has("youtube")
      ? cachedLive(ownerId, ["yt-results", workspaceId, [...youtubeIds].sort().join(",")], async () => {
          const [videos, recent] = await Promise.all([youtubeVideoStats(supabase, ownerId, youtubeIds), youtubeRecentUploads(supabase, ownerId, 25)]);
          return { videos, recent };
        }, (v) => Object.keys(v.videos).length > 0 || v.recent.length > 0).catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    instagram: ig ? ig.media : null,
    facebook: fb?.status === "connected" ? fb.posts : null,
    youtube: yt?.value.videos ?? null,
    youtubeRecent: yt?.value.recent ?? null,
  };
}

export type PostResult = ResultLine & { platform: Platform };

/** Headline result per published post (best measured multiplier, else first), for the Calendar. */
export function resultsForPosts(posts: ScheduledPost[], dests: DestinationLite[], sources: MeasureSources, now: Date = new Date()): Map<string, PostResult> {
  const byPost = new Map<string, DestinationLite[]>();
  for (const d of dests) byPost.set(d.postId, [...(byPost.get(d.postId) ?? []), d]);
  const out = new Map<string, PostResult>();
  for (const p of posts) {
    const published = (byPost.get(p.id) ?? []).filter((d) => d.status === "published" && d.externalPostId);
    if (!published.length && p.status === "published" && p.published_media_id) {
      published.push({ postId: p.id, platform: "instagram", status: "published", externalPostId: p.published_media_id, publishedAt: p.updated_at, permalink: p.permalink });
    }
    if (!published.length) continue;
    const lines = published.map((d) => ({ platform: d.platform, ...resultLine(measureDestination(d.platform, d.externalPostId!, sources), d.publishedAt, now) }));
    const measured = lines.filter((l) => l.measured);
    const best = measured.filter((l) => l.multiplier != null).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0] ?? measured[0] ?? lines[0];
    out.set(p.id, best);
  }
  return out;
}

type PlanRow = { id: string; data: Deliverable; created_at: string };

/** Outcomes for several plans at once (the history list, the dashboard). */
export async function loadPlanOutcomes(supabase: Supa, ownerId: string, workspaceId: string | null, plans: PlanRow[], now: Date = new Date()): Promise<Map<string, PlanOutcome>> {
  const out = new Map<string, PlanOutcome>();
  if (!plans.length) return out;
  let posts: ScheduledPost[] = [];
  try {
    const { data } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", ownerId)
      .in("plan_id", plans.map((p) => p.id))
      .neq("status", "cancelled")
      .limit(500);
    posts = (data ?? []) as ScheduledPost[];
  } catch {
    posts = [];
  }
  const dests = await loadDestinationsLite(supabase, posts.map((p) => p.id));
  const sources = await loadMeasureSources(supabase, ownerId, workspaceId, posts, dests);
  for (const plan of plans) out.set(plan.id, buildPlanOutcome(plan, posts, dests, sources, now));
  return out;
}

export async function loadPlanOutcome(supabase: Supa, ownerId: string, workspaceId: string | null, plan: PlanRow, now: Date = new Date()): Promise<PlanOutcome> {
  return (await loadPlanOutcomes(supabase, ownerId, workspaceId, [plan], now)).get(plan.id)!;
}
