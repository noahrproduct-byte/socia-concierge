import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { creditsBuy, type CreditAction } from "@/lib/credits/config";
import { PERK_CREDITS, PERK_WORDS, STREAK_GOAL } from "@/lib/perks/core";
import { perkStatus } from "@/lib/perks/server";
import { brandStreak } from "@/lib/postingStreakLoad";

export const runtime = "nodejs";

// The first-week list and the posting streak for the account's owner, counted
// from what the account has really done, with the perk given when one has
// just been earned (lib/perks). Nothing is counted against a plan.
//   GET -> { firstWeek, streak, posting, perk } | { off: true }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  // The account's own owner only: an invited teammate works in someone else's account.
  if (!ctx.isOwner) return NextResponse.json({ off: true });
  const ent = await getEntitlements(supabase, ctx.ownerId);
  // The active brand's streak against its own posting target; null or not ready before its tables exist.
  const brand = await brandStreak(ctx, ent).catch((e) => { console.error("[perks] brand streak:", (e as Error)?.message ?? e); return null; });
  const s = await perkStatus(ctx.ownerId, user.created_at, new Date(), brand?.ready ? brand.streak.weeks : null);
  if (!s) return NextResponse.json({ off: true });
  return NextResponse.json({
    firstWeek: { ...s.firstWeek, rewarded: s.firstWeekRewarded },
    streak: { ...s.streak, goal: STREAK_GOAL, rewarded: s.streakRewarded },
    // The streak by posting days, once it can be counted; the card shows this in place of the older one.
    posting: brand?.ready ? { ...brand.streak, line: brand.line, week: brand.week, next: brand.next, platforms: brand.platforms, breaks: brand.breaks, goal: STREAK_GOAL, rewarded: s.streakRewarded } : null,
    // What the credits buy on this person's plan, so the number means something.
    perk: { words: PERK_WORDS, buys: creditsBuy(PERK_CREDITS, (a: CreditAction) => (PLANS[ent.plan].meters[a] ?? 0) > 0) },
  });
}
