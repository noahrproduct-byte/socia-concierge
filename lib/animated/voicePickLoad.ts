// The account's saved videos that have a voiceover, each with its real result
// when it has been posted and reported (lib/postResults.ts), for
// lib/animated/voicePick.ts. Server only.
import type { Ctx } from "@/lib/context";
import type { ScheduledPost } from "@/lib/scheduling";
import { isMissingColumnError, scopeToWorkspace } from "@/lib/workspaces";
import { loadDestinationsLite, loadMeasureSources, resultsForPosts } from "@/lib/planOutcomesLoad";
import type { VoiceUse } from "./voicePick";

type Row = ScheduledPost & { voice_id: string | null };

/** Every saved video with a voiceover (newest 80), with its result when there is one. Empty before supabase/post-voices.sql is run. */
export async function loadVoiceUses(ctx: Ctx, now: Date = new Date()): Promise<VoiceUse[]> {
  const wsId = ctx.workspace?.id ?? null;
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).not("voice_id", "is", null).order("created_at", { ascending: false }).limit(80),
    wsId,
  );
  if (error) {
    if (!isMissingColumnError(error)) console.error("[animated/voice] reading voice history failed:", error.message);
    return [];
  }
  const posts = ((data ?? []) as Row[]).filter((p) => p.voice_id);
  if (!posts.length) return [];
  const dests = await loadDestinationsLite(ctx.client, posts.map((p) => p.id));
  const sources = await loadMeasureSources(ctx.client, ctx.ownerId, wsId, posts, dests);
  const results = resultsForPosts(posts, dests, sources, now);
  return posts.map((p) => {
    const r = results.get(p.id);
    return { voiceId: p.voice_id as string, multiplier: r?.measured ? r.multiplier : null, settled: Boolean(r?.measured && !r.early) };
  });
}
