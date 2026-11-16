import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { activeByPlatform, getEntitlements, listConnectedAccounts, workspacesInUse } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { readStrategy } from "@/lib/strategyLoad";
import { getProfile } from "@/lib/profile";
import { brandWorkspace } from "@/lib/context";
import { PLANS, SALE_ORDER, checkoutAvailable, formatPrice } from "@/lib/plans";
import { MONTHLY_CREDITS, creditsBuy, type CreditAction } from "@/lib/credits/config";
import { recommendPlan } from "@/lib/planRecommend";
import type { GrowthProfile } from "@/lib/growth";

export const runtime = "nodejs";

/** Posts a week assumed when no strategy has been written yet; the screen says it is an assumption. */
const ASSUMED_POSTS = 3;

// Onboarding's last step: the plans on sale and the one that fits this
// brand's strategy (lib/planRecommend.ts), with the reasons. Everything is
// read from the saved strategy, the tracked competitors, the connected
// accounts and the plans' own numbers.
//   GET -> { currentPlan, checkout, assumed, recommendation, plans: [...] }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const [ent, strategy, accounts, profile, cwid] = await Promise.all([
    getEntitlements(supabase, ctx.ownerId),
    readStrategy(ctx).catch(() => null),
    listConnectedAccounts(ctx.client, ctx.ownerId).catch(() => []),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    competitorScopeId(ctx.client, ctx.workspace?.id).catch(() => null),
  ]);
  const tracked = await listTracked(ctx.client, ctx.ownerId, "handle", { workspaceId: cwid }).catch(() => []);
  const platforms = Object.values(activeByPlatform(accounts)).filter((n) => n > 0).length;
  const growth = (profile?.brand_detail?.growth ?? null) as GrowthProfile | null;
  const recommendation = recommendPlan({
    postsPerWeek: strategy?.frequency.posts_per_week ?? ASSUMED_POSTS,
    competitors: tracked.length,
    platforms,
    brands: Math.max(1, workspacesInUse(accounts)),
    mainGoal: growth?.main_goal ?? null,
  });
  return NextResponse.json({
    currentPlan: ent.plan,
    checkout: checkoutAvailable(),
    assumed: strategy ? null : ASSUMED_POSTS,
    recommendation,
    plans: SALE_ORDER.map((id) => {
      const p = PLANS[id];
      return {
        id, name: p.name, price: formatPrice(p), priceMonthly: p.priceMonthly, tagline: p.tagline,
        credits: MONTHLY_CREDITS[id],
        buys: creditsBuy(MONTHLY_CREDITS[id], (a: CreditAction) => (p.meters[a] ?? 0) > 0),
        competitors: p.limits.competitors, workspaces: p.limits.workspaces,
      };
    }),
  });
}
