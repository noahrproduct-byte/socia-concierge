// What the clip picker learns from this brand: the clips it already posted
// (clips.post_id, set by Send to scheduler) and how each did against the
// account's own median, from the same measurement the Calendar and plans use
// (lib/planOutcomesLoad). Only settled, measured results count; any failure
// means "nothing to learn from yet". Server only.
import type { ScheduledPost } from "@/lib/scheduling";
import { scopeToWorkspace } from "@/lib/workspaces";
import { loadDestinationsLite, loadMeasureSources, resultsForPosts } from "@/lib/planOutcomesLoad";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type ClipOutcome = { title: string; hook: string | null; seconds: number | null; multiplier: number; text: string };

/** One line per posted clip, best first: "Opens 'Why…' (34 s), 'Title': 2.1x your usual interactions." Pure. */
export function clipResultLines(outcomes: ClipOutcome[], max = 10): string[] {
  return [...outcomes]
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, max)
    .map((o) => `"${o.title}"${o.seconds ? ` (${Math.round(o.seconds)} s)` : ""}${o.hook ? `, opens "${o.hook.slice(0, 80)}"` : ""}: ${o.text}`);
}

export async function loadClipOutcomes(svc: Supa, ownerId: string, wsId: string | null, now = new Date()): Promise<ClipOutcome[]> {
  try {
    const { data } = await scopeToWorkspace(svc.from("clips").select("title, hook, duration_ms, post_id").eq("user_id", ownerId).not("post_id", "is", null), wsId)
      .order("created_at", { ascending: false }).limit(40);
    const clips = (data ?? []) as { title: string | null; hook: string | null; duration_ms: number | null; post_id: string }[];
    if (!clips.length) return [];
    const postIds = Array.from(new Set(clips.map((c) => c.post_id)));
    const { data: postRows } = await svc.from("scheduled_posts").select("*").eq("user_id", ownerId).in("id", postIds);
    const posts = (postRows ?? []) as ScheduledPost[];
    const dests = await loadDestinationsLite(svc, postIds);
    const sources = await loadMeasureSources(svc, ownerId, wsId, posts, dests);
    const results = resultsForPosts(posts, dests, sources, now);
    const out: ClipOutcome[] = [];
    for (const c of clips) {
      const r = results.get(c.post_id);
      if (!r || !r.measured || r.early || r.multiplier == null) continue;
      out.push({ title: c.title ?? "Clip", hook: c.hook, seconds: c.duration_ms != null ? c.duration_ms / 1000 : null, multiplier: r.multiplier, text: r.text });
    }
    return out;
  } catch {
    return [];
  }
}
