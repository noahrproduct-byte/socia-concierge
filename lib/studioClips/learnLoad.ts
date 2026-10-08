// Server side of Learn: the Content Studio builds that became posts, the
// posts' state, and their results from the same measurement the Content
// Plan and Calendar use. Read-only; any failure means "nothing to learn
// from yet", never an error in the Studio.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduledPost } from "@/lib/scheduling";
import { scopeToWorkspace } from "@/lib/workspaces";
import { loadDestinationsLite, loadMeasureSources, resultsForPosts } from "@/lib/planOutcomesLoad";
import { PLATFORM_NAME } from "@/lib/postResults";
import type { Edl, YieldResult } from "./types";
import { cutFeatures, learnedBlock, type StudioOutcome } from "./learn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

type BuildRow = { id: string; project_id: string; opportunity_idx: number; post_id: string; edl: Edl };

/** Every Studio build in this workspace that has a post, with the post's state and result. */
export async function loadStudioOutcomes(client: Supa, ownerId: string, wsId: string | null, opts: { projectId?: string; now?: Date } = {}): Promise<StudioOutcome[]> {
  let q = scopeToWorkspace(client.from("studio_builds").select("id, project_id, opportunity_idx, post_id, edl").eq("user_id", ownerId).not("post_id", "is", null), wsId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data: builds, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error || !builds?.length) return [];
  const rows = builds as BuildRow[];

  const projectIds = Array.from(new Set(rows.map((b) => b.project_id)));
  const postIds = Array.from(new Set(rows.map((b) => b.post_id)));
  const [projectsRes, postsRes] = await Promise.all([
    client.from("studio_projects").select("id, title, yield").eq("user_id", ownerId).in("id", projectIds),
    client.from("scheduled_posts").select("*").eq("user_id", ownerId).in("id", postIds),
  ]);
  const projects = new Map(((projectsRes.data ?? []) as { id: string; title: string; yield: YieldResult | null }[]).map((p) => [p.id, p]));
  const posts = (postsRes.data ?? []) as ScheduledPost[];
  const postById = new Map(posts.map((p) => [p.id, p]));

  const dests = await loadDestinationsLite(client, postIds);
  const sources = await loadMeasureSources(client, ownerId, wsId, posts, dests);
  const results = resultsForPosts(posts, dests, sources, opts.now ?? new Date());

  return rows
    .filter((b) => postById.has(b.post_id))
    .map((b) => {
      const project = projects.get(b.project_id);
      const opp = project?.yield?.opportunities.find((o) => o.idx === b.opportunity_idx);
      const r = results.get(b.post_id);
      return {
        buildId: b.id,
        projectId: b.project_id,
        opportunityIdx: b.opportunity_idx,
        projectTitle: project?.title ?? "Project",
        title: opp?.title ?? "Studio post",
        postId: b.post_id,
        status: postById.get(b.post_id)!.status,
        features: cutFeatures(b.edl),
        result: r ? { short: r.short, text: r.text, multiplier: r.multiplier, early: r.early, measured: r.measured, platform: PLATFORM_NAME[r.platform] } : null,
      };
    });
}

/** The "what worked" block for Content Studio's prompts; null when nothing has settled or anything fails. */
export async function studioLearnedLine(client: Supa, ownerId: string, wsId: string | null): Promise<string | null> {
  try {
    return learnedBlock(await loadStudioOutcomes(client, ownerId, wsId));
  } catch {
    return null;
  }
}
