// Server side of the Today card: gathers the facts lib/dailyRecs.ts reads.
// Most come from rows the Dashboard already loaded (Calendar posts, the latest
// plan, each platform's stored posts); this adds the comment replies waiting
// for approval and the Content Studio posts not started yet. Every read that
// fails (a table that isn't there yet, a feature the plan doesn't include)
// leaves its section out.
import type { SupabaseClient } from "@supabase/supabase-js";
import { scopeToWorkspace } from "./workspaces";
import { displayTitle, formatOf } from "./overview";
import { interactionsTotal } from "./engagement";
import { detectBreakouts, type BreakoutPost } from "./alertDetectors";
import { igBreakoutPosts, fbBreakoutPosts, ttBreakoutPosts } from "./breakoutPosts";
import type { ScheduledPost } from "./scheduling";
import type { Deliverable } from "./schema";
import type { IgMediaItem } from "./instagramSync";
import type { FbPost } from "./facebookSync";
import type { TtVideo } from "./tiktokAuth";
import type { YieldResult } from "./studioClips/types";
import type { TodayBreakout, TodayFacts, TodayPost, TodayStudio } from "./dailyRecs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export function todayPosts(scheduled: ScheduledPost[]): TodayPost[] {
  return scheduled
    .filter((p) => p.status !== "cancelled")
    .map((p) => ({
      id: p.id, at: p.scheduled_at, status: p.status, planId: p.plan_id, planDay: p.plan_day,
      title: displayTitle(p.caption ?? "") === "(no caption)" ? "Untitled post" : displayTitle(p.caption ?? ""),
      hasMedia: Boolean(p.media_url || p.media_path), image: p.media_type === "IMAGE",
    }));
}

/** The strongest post of the last 7 days across platforms, judged as the breakout alerts judge it. */
export function pickBreakout(input: { ig?: IgMediaItem[] | null; fb?: FbPost[] | null; tt?: TtVideo[] | null }, now: number): TodayBreakout | null {
  const sets: { platform: TodayBreakout["platform"]; posts: BreakoutPost[]; metric: TodayBreakout["metric"] }[] = [
    { platform: "instagram", posts: input.ig?.length ? igBreakoutPosts(input.ig) : [], metric: "interactions" },
    { platform: "facebook", posts: input.fb?.length ? fbBreakoutPosts(input.fb) : [], metric: "interactions" },
    { platform: "tiktok", posts: input.tt?.length ? ttBreakoutPosts(input.tt) : [], metric: "views" },
  ];
  let best: TodayBreakout | null = null;
  for (const s of sets) {
    if (!s.posts.length) continue;
    const byId = new Map(s.posts.map((p) => [p.id, p]));
    for (const c of detectBreakouts({ platform: s.platform, posts: s.posts, now, metric: s.metric })) {
      const id = c.fingerprint.split(":").slice(2).join(":");
      const post = byId.get(id);
      const ev = (c.evidence ?? {}) as { multiplier?: number; sample?: number; format?: string };
      if (!post || ev.multiplier == null) continue;
      if (best && best.multiplier >= ev.multiplier) continue;
      const title = displayTitle(post.caption ?? "");
      best = {
        platform: s.platform, format: ev.format ?? post.format, multiplier: ev.multiplier, metric: s.metric, sample: ev.sample ?? 0,
        title: title === "(no caption)" ? `Your ${post.format.toLowerCase()}` : title,
        postedAt: new Date(post.timestampMs).toISOString(), permalink: post.permalink ?? null,
      };
    }
  }
  return best;
}

/** Comment replies SOCIA drafted that wait for a person; counted as the Comments inbox lists them. */
export async function loadWaitingComments(client: Supa, ownerId: string, wsId: string | null): Promise<TodayFacts["comments"]> {
  try {
    let q = client.from("comment_drafts").select("comment_created_at, created_at", { count: "exact" }).eq("user_id", ownerId).eq("status", "drafted");
    if (wsId) q = q.eq("workspace_id", wsId);
    const { data, count, error } = await q.order("created_at", { ascending: true }).limit(1);
    if (error) return null;
    const first = (data ?? [])[0] as { comment_created_at: string | null; created_at: string } | undefined;
    return { waiting: count ?? 0, oldestAt: first ? first.comment_created_at ?? first.created_at : null };
  } catch {
    return null;
  }
}

/** The newest analysed Content Studio project that still has posts nobody has started. */
export async function loadStudioNext(client: Supa, ownerId: string, wsId: string | null): Promise<TodayStudio | null> {
  try {
    const { data, error } = await scopeToWorkspace(
      client.from("studio_projects").select("id, title, yield, updated_at").eq("user_id", ownerId).eq("status", "ready"),
      wsId,
    ).order("updated_at", { ascending: false }).limit(5);
    if (error || !data?.length) return null;
    const projects = data as { id: string; title: string | null; yield: YieldResult | null }[];
    const { data: builds, error: bErr } = await client.from("studio_builds").select("project_id, opportunity_idx").eq("user_id", ownerId).in("project_id", projects.map((p) => p.id));
    if (bErr) return null;
    const started = new Set(((builds ?? []) as { project_id: string; opportunity_idx: number }[]).map((b) => `${b.project_id}:${b.opportunity_idx}`));
    for (const p of projects) {
      const opps = p.yield?.opportunities ?? [];
      const todo = opps.filter((o) => !started.has(`${p.id}:${o.idx}`)).sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1));
      if (todo.length) return { projectId: p.id, title: p.title, found: opps.length, notStarted: todo.length, next: todo[0].title };
    }
    return null;
  } catch {
    return null;
  }
}

/** The Today card's facts, from what the Dashboard already holds plus the two reads above. */
export function todayFacts(input: {
  plan: { id: string; data: Deliverable; created_at: string } | null;
  scheduled: ScheduledPost[];
  igMedia: IgMediaItem[] | null;
  fbPosts: FbPost[] | null;
  ttVideos: TtVideo[] | null;
  comments: TodayFacts["comments"];
  studio: TodayStudio | null;
  now: number;
}): TodayFacts {
  const timed = input.igMedia
    ? input.igMedia.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }))
    : null;
  return {
    plan: input.plan ? { id: input.plan.id, createdAt: input.plan.created_at, items: (input.plan.data.weeklyPlan ?? []).map((it) => ({ day: it.day, concept: it.concept, format: it.format })) } : null,
    posts: todayPosts(input.scheduled),
    timed,
    comments: input.comments,
    breakout: pickBreakout({ ig: input.igMedia, fb: input.fbPosts, tt: input.ttVideos }, input.now),
    studio: input.studio,
  };
}
