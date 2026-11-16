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

import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import type { FeatureKey, MeterKey } from "./plans";
import { creditsError, usageError, type PlanError } from "./planErrors";
import { getEntitlements, checkFeature, consumeUsage, releaseUsage, type Entitlements, type UsageSnapshot } from "./entitlements";
import { trackEvent, type ProductEventName } from "./events";
import { aiBudgetDenied, nextMonthStart } from "./aiSpend";
import { actionCredits, isCreditAction, type CreditAction } from "./credits/config";
import { CreditsError, creditBalance, refundCredits, spendCredits } from "./credits/ledger";
import { topupsOpen } from "./credits/topups";

/** Allowances whose use costs SOCIA AI money: they also stop at the plan's monthly AI ceiling. */
const AI_METERS = new Set<MeterKey>(["ask_socia", "content_studio", "content_generation", "account_audit", "content_plan", "content_ideas", "content_build", "music_tracks", "voiceovers"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const PLAN_DENIED_STATUS = 403;

export function deny(error: PlanError, status: number = PLAN_DENIED_STATUS): NextResponse {
  return NextResponse.json(error, { status });
}

/**
 * The usage counter could not be read or written. This is an operations
 * problem, not a plan decision, so it is a 503 with a plain message rather
 * than a PlanError (no upgrade CTA, nothing about the person's plan).
 */
export const METERING_UNAVAILABLE_COPY = "Usage metering is unavailable right now. Please try again in a moment.";

export function denyMeteringUnavailable(): NextResponse {
  return NextResponse.json({ error: METERING_UNAVAILABLE_COPY, code: "metering_unavailable" }, { status: 503 });
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
  // An AI feature is paid with credits (Noah, 2026-11-15): one balance for
  // everything, a fixed price per action. Before the credit tables exist the
  // per-feature allowance below still applies.
  if (isCreditAction(meter)) {
    const paid = await payWithCredits(supabase, userId, ent, meter);
    if (paid) return paid;
  }
  // An AI allowance: the account's month must also be under its plan's AI ceiling (lib/aiSpend.ts).
  if (AI_METERS.has(meter)) {
    const over = await aiBudgetDenied(userId, ent);
    if (over) return { ent, usage: null, denied: over, release: noop };
  }
  const r = await consumeUsage(supabase, ent, meter);
  if (r.unavailable) {
    return { ent, usage: r.usage, denied: denyMeteringUnavailable(), release: noop };
  }
  if (r.allowed) {
    // Only a consume that really counted can be released.
    const release = r.usage.used == null ? noop : () => releaseUsage(supabase, ent, meter);
    return { ent, usage: r.usage, denied: null, release };
  }
  recordEvent(supabase, userId, "usage_limit_reached", { meter, plan: ent.plan, limit: r.usage.limit });
  return { ent, usage: r.usage, denied: deny(r.error!), release: noop };
}

/**
 * Take one action's credits from the owner's balance. Null when the credit
 * tables aren't installed, so the caller falls back to the per-feature
 * allowance. The plan's AI ceiling stays in force as a safety net for work
 * that isn't paid with credits; it sits above the monthly credits.
 */
async function payWithCredits(supabase: Supa, userId: string, ent: Entitlements, action: CreditAction): Promise<UsageGuard | null> {
  const noop = async () => {};
  const cost = actionCredits(action);
  const now = new Date();
  const resetsOn = nextMonthStart(now).toISOString().slice(0, 10);
  // A feature the plan doesn't include (an allowance of 0) can't be bought with credits.
  if ((ent.config.meters[action] ?? 0) <= 0) {
    return { ent, usage: null, denied: deny(usageError(ent.plan, action, 0, 0, resetsOn)), release: noop };
  }
  const snap = (balance: number): UsageSnapshot => ({
    meter: action, used: null, limit: 0, remaining: Math.floor(balance / cost), resetsOn, credits: { balance, cost },
  });
  try {
    const balance = await creditBalance(userId, ent, now);
    if (balance == null) return null;
    if (balance < cost) {
      recordEvent(supabase, userId, "usage_limit_reached", { meter: action, plan: ent.plan, credits: balance, cost });
      return { ent, usage: snap(balance), denied: deny(creditsError(ent.plan, balance, cost, resetsOn, topupsOpen())), release: noop };
    }
    const over = await aiBudgetDenied(userId, ent);
    if (over) return { ent, usage: null, denied: over, release: noop };
    const ref = { kind: "action" as const, id: randomUUID() };
    const after = await spendCredits(userId, cost, ref, action);
    return { ent, usage: snap(after), denied: null, release: async () => { await refundCredits(userId, ref, "Didn't finish"); } };
  } catch (e) {
    if (e instanceof CreditsError && e.code === "insufficient_credits") {
      const balance = e.balance ?? 0;
      return { ent, usage: snap(balance), denied: deny(creditsError(ent.plan, balance, cost, resetsOn, topupsOpen())), release: noop };
    }
    console.error(`[credits] ${action} could not be paid:`, (e as Error)?.message ?? e);
    return { ent, usage: null, denied: denyMeteringUnavailable(), release: noop };
  }
}
