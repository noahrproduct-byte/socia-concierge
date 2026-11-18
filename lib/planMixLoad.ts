// Reads what a new plan's mix starts from (lib/planMix.ts): the brand's last
// plan in this workspace, its animated setting, its strategy's pace, the
// posting target it gave SIO, and whether the plan includes animated videos
// at all. Server only.
import { getEntitlements, getMeterLimit } from "./entitlements";
import { scopeToWorkspace } from "./workspaces";
import { defaultMix, type PlanMix } from "./planMix";
import type { BrandDetail } from "./profile";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** The posts of the brand's most recent plan, or null when it has none. */
export async function lastPlanItems(client: Supa, ownerId: string, workspaceId: string | null): Promise<{ animated?: boolean }[] | null> {
  try {
    const { data } = await scopeToWorkspace(client.from("plans").select("data").eq("user_id", ownerId), workspaceId)
      .order("created_at", { ascending: false })
      .limit(1);
    const items = (data?.[0]?.data as { weeklyPlan?: { animated?: boolean }[] } | undefined)?.weeklyPlan;
    return Array.isArray(items) && items.length ? items : null;
  } catch {
    return null;
  }
}

/** Whether this owner's plan includes animated videos (its monthly allowance is above zero). */
export async function animatedAllowed(client: Supa, ownerId: string): Promise<boolean> {
  try {
    return getMeterLimit(await getEntitlements(client, ownerId), "animated_videos") > 0;
  } catch {
    return false;
  }
}

/** The mix a new plan for this brand starts from, and whether animated posts may be in it. */
export async function startingMix(client: Supa, ownerId: string, workspaceId: string | null, brand: BrandDetail | null): Promise<{ mix: PlanMix; animatedAllowed: boolean }> {
  const [last, allowed] = await Promise.all([lastPlanItems(client, ownerId, workspaceId), animatedAllowed(client, ownerId)]);
  return {
    mix: defaultMix({ lastPlan: last, animatedPref: brand?.animated ?? null, pace: brand?.strategy?.frequency?.posts_per_week ?? null, animatedAllowed: allowed, target: brand?.growth?.routine?.post_days ?? null }),
    animatedAllowed: allowed,
  };
}
