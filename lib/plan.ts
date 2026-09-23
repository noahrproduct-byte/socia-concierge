// Compatibility shim. Plan logic now lives in lib/plans.ts (configuration) and
// lib/entitlements.ts (resolution + enforcement). These exports keep older
// call sites compiling while they migrate; new code should import from there.
//
// The plan still lives on profiles.plan. A missing column, a missing row, or
// any read error resolves to 'free', so features gate closed until the
// database says otherwise. The billing provider will own this column when
// checkout lands; until then it is set manually.

import { PLANS, PLAN_ORDER, normalizePlan, type PlanId } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type Plan = PlanId;

/** How many connected social accounts (all platforms combined) a plan may have active. */
export const ACCOUNT_LIMIT: Record<Plan, number> = Object.fromEntries(
  PLAN_ORDER.map((id) => [id, PLANS[id].limits.connected_accounts]),
) as Record<Plan, number>;

export function accountLimit(plan: Plan): number {
  return ACCOUNT_LIMIT[plan];
}

export async function getPlan(supabase: Supa, userId: string): Promise<Plan> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "free"; // column may not exist yet
    return normalizePlan(data?.plan);
  } catch {
    return "free";
  }
}
