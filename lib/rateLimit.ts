import { NextResponse } from "next/server";
import { rateHit } from "@/lib/oauth/runtime";

/**
 * A per-person hourly ceiling on a costly action that has no plan allowance of
 * its own (comment redrafts, transcription, niche analyses, clip edits).
 * Backed by socia_rate_hit (supabase/ai-assistants.sql). When the limiter
 * itself is unavailable the action is allowed and the problem logged: these
 * guard against runaway cost, and a broken limiter shouldn't take features down.
 */
export async function perUserLimit(userId: string, bucket: string, perHour: number, what: string): Promise<NextResponse | null> {
  const r = await rateHit(`user:${userId}:${bucket}`, 3600, perHour);
  if (r !== "limited") return null;
  return NextResponse.json({ error: `You've reached the hourly limit for ${what}. Try again in a little while.`, code: "rate_limited" }, { status: 429 });
}
