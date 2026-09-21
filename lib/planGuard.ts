// Route-handler wrappers around lib/entitlements.ts. Every API route that is
// plan-sensitive does one of these before any expensive or restricted work:
//
//   const g = await requireFeature(supabase, user.id, "scheduling");
//   if (g.denied) return g.denied;
//
//   const u = await requireUsage(supabase, user.id, "ask_socia");
//   if (u.denied) return u.denied;          // 403 with a PlanError body
//   try { ... call the model ... }
//   catch (e) { await u.release(); ... }    // the unit paid for nothing: give it back
//   return NextResponse.json({ answer, usage: u.usage });
//
// The 403 body is a PlanError (lib/planErrors.ts) so the client can render the
// exact sentence and the right upgrade CTA. Enforcement lives here, on the
// server; hiding a button in the UI is never the only gate.

import { NextResponse, after } from "next/server";
import type { FeatureKey, MeterKey } from "./plans";
import type { PlanError } from "./planErrors";
import { getEntitlements, checkFeature, consumeUsage, releaseUsage, type Entitlements, type UsageSnapshot } from "./entitlements";
import { trackEvent, type ProductEventName } from "./events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const PLAN_DENIED_STATUS = 403;

export function deny(error: PlanError, status: number = PLAN_DENIED_STATUS): NextResponse {
  return NextResponse.json(error, { status });
}

/**
 * Record a product event without delaying the response and without losing it
 * when the serverless function is frozen after the response: after() runs the
 * insert once the response has been sent.
 */
export function recordEvent(supabase: Supa, userId: string, name: ProductEventName, props?: Record<string, unknown>): void {
  try {
    after(() => trackEvent(supabase, userId, name, props));
  } catch {
    // Outside a request scope (tests): fire and forget.
    void trackEvent(supabase, userId, name, props);
  }
}

export async function requireFeature(
  supabase: Supa,
  userId: string,
  key: FeatureKey,
  ent?: Entitlements,
): Promise<{ ent: Entitlements; denied: NextResponse | null }> {
  const e = ent ?? (await getEntitlements(supabase, userId));
  const check = checkFeature(e, key);
  if (check.ok) return { ent: e, denied: null };
  recordEvent(supabase, userId, "feature_locked", { feature: key, plan: e.plan });
  return { ent: e, denied: deny(check.error) };
}

export type UsageGuard = {
  ent: Entitlements;
  usage: UsageSnapshot | null;
  denied: NextResponse | null;
  /** Give the consumed unit back when the work it paid for failed. No-op when nothing was counted. */
  release: () => Promise<void>;
};

/**
 * Consume one unit of a meter, optionally requiring a feature first (a plan
 * that lacks the feature is told so, instead of being told its meter is at 0).
 */
export async function requireUsage(
  supabase: Supa,
  userId: string,
  meter: MeterKey,
  opts: { feature?: FeatureKey; ent?: Entitlements } = {},
): Promise<UsageGuard> {
  const noop = async () => {};
  const ent = opts.ent ?? (await getEntitlements(supabase, userId));
  if (opts.feature) {
    const check = checkFeature(ent, opts.feature);
    if (!check.ok) {
      recordEvent(supabase, userId, "feature_locked", { feature: opts.feature, plan: ent.plan });
      return { ent, usage: null, denied: deny(check.error), release: noop };
    }
  }
  const r = await consumeUsage(supabase, ent, meter);
  if (r.allowed) {
    // Only a consume that really counted can be released; the fail-open path (used null) never is.
    const release = r.usage.used == null ? noop : () => releaseUsage(supabase, ent, meter);
    return { ent, usage: r.usage, denied: null, release };
  }
  recordEvent(supabase, userId, "usage_limit_reached", { meter, plan: ent.plan, limit: r.usage.limit });
  return { ent, usage: r.usage, denied: deny(r.error!), release: noop };
}
