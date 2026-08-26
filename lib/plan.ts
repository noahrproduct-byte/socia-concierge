// Plan resolution. The plan lives on profiles.plan ('free' | 'pro') and is the
// single gate for Pro features. Nothing here invents a plan: a missing column,
// a missing row, or any read error resolves to 'free', so features gate closed
// until the database says otherwise. Stripe will own this column when billing
// lands; until then it is set manually.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type Plan = "free" | "pro";

/** How many Instagram accounts a plan may connect. */
export const ACCOUNT_LIMIT: Record<Plan, number> = { free: 1, pro: 3 };

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
    return data?.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}
