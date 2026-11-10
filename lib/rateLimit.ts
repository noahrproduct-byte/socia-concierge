import { NextResponse } from "next/server";
import { rateHit } from "@/lib/oauth/runtime";
import { aiBudgetDenied } from "@/lib/aiSpend";

/** Hourly buckets whose action calls a paid AI service: they also stop at the plan's monthly AI ceiling. */
export const AI_BUCKETS = new Set(["clip_edl", "comment_redraft", "comment_sync", "growth_strategy", "initial_plan", "music-playlist", "niche", "niche_formats", "studio-brief", "studio-enhance", "transcribe", "competitor_intel", "studio_ideas", "clipper_reframe", "place_scan"]);

/**
 * A per-person hourly ceiling on a costly action that has no plan allowance of
 * its own (comment redrafts, transcription, niche analyses, clip edits), and,
 * for AI actions, the owner's monthly AI ceiling (lib/aiSpend.ts). Backed by
 * socia_rate_hit (supabase/ai-assistants.sql). When the limiter itself is
 * unavailable the action is refused: these are the only thing between a
 * script and an unbounded bill.
 *
 * The AI ceiling belongs to the account that pays: pass `ownerId` when the
 * hourly count is kept per person (a workspace member) rather than per owner.
 */
export async function perUserLimit(userId: string, bucket: string, perHour: number, what: string, ownerId: string = userId): Promise<NextResponse | null> {
  const r = await rateHit(`user:${userId}:${bucket}`, 3600, perHour);
  if (r === "unavailable") return NextResponse.json({ error: `SOCIA can't check the limit for ${what} just now. Try again in a minute.`, code: "rate_unavailable" }, { status: 503 });
  if (r === "limited") return NextResponse.json({ error: `You've reached the hourly limit for ${what}. Try again in a little while.`, code: "rate_limited" }, { status: 429 });
  if (AI_BUCKETS.has(bucket)) return aiBudgetDenied(ownerId);
  return null;
}
