import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { PERK_DAYS, STREAK_GOAL, perkLive, perkWords } from "@/lib/perks/core";
import { perkStatus } from "@/lib/perks/server";

export const runtime = "nodejs";

// The first-week list and the posting streak for the account's owner, counted
// from what the account has really done, with the perk given when one has
// just been earned (lib/perks). Nothing is counted against a plan.
//   GET -> { firstWeek, streak, perk } | { off: true }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  // The account's own owner only: an invited teammate works in someone else's account.
  if (!ctx.isOwner) return NextResponse.json({ off: true });
  const s = await perkStatus(ctx.ownerId, user.created_at);
  if (!s) return NextResponse.json({ off: true });
  const ent = await getEntitlements(supabase, ctx.ownerId);
  return NextResponse.json({
    firstWeek: { ...s.firstWeek, rewarded: s.firstWeekRewarded },
    streak: { ...s.streak, goal: STREAK_GOAL, rewarded: s.streakRewarded },
    perk: { on: perkLive(s.perkUntil), until: s.perkUntil, words: perkWords(PLANS[ent.plan]), days: PERK_DAYS },
  });
}
