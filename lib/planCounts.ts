// How many accounts pay for each plan right now, for the pricing cards' one
// line of social proof. Read from profiles (the Stripe webhook keeps plan and
// subscription_status there), never estimated. A count under PROOF_MIN is
// not shown at all: a small number is not proof, and nothing replaces it.

import { unstable_cache } from "next/cache";
import { createServiceClient } from "./supabase/service";
import { PLANS, isPlanId, type PlanId } from "./plans";

/** A plan's count is shown only from this many paying accounts. */
export const PROOF_MIN = 100;
/** Subscription states that are paying (or about to): the same set the spend report counts. */
const LIVE = ["active", "trialing", "past_due"];

export type PlanCounts = Partial<Record<PlanId, number>>;

/** The card's line, or null below PROOF_MIN (or with no count). */
export function proofLine(plan: PlanId, count: number | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count < PROOF_MIN) return null;
  return `${Math.floor(count).toLocaleString("en-US")} accounts are on ${PLANS[plan].name} today`;
}

/** Count paying profiles per plan from rows (exported for tests). */
export function countByPlan(rows: { plan: string | null }[]): PlanCounts {
  const out: PlanCounts = {};
  for (const r of rows) if (r.plan && isPlanId(r.plan)) out[r.plan] = (out[r.plan] ?? 0) + 1;
  return out;
}

async function load(): Promise<PlanCounts> {
  const svc = createServiceClient();
  if (!svc) return {};
  const { data, error } = await svc.from("profiles").select("plan").in("subscription_status", LIVE).limit(20000);
  if (error || !data) return {};
  return countByPlan(data as { plan: string | null }[]);
}

/** Cached for an hour: the public page reads it on every visit. Empty on any failure, so nothing is shown. */
export const loadPlanCounts = unstable_cache(() => load().catch(() => ({}) as PlanCounts), ["pricing-plan-counts"], { revalidate: 3600 });
