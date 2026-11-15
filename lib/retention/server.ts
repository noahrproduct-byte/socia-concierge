// Cancelling a plan, server side: the answer to "why", the stay boost, and
// the link to Stripe's own cancel page (lib/retention/core.ts holds the
// rules). Writes go through the service role after the caller has been
// authenticated. Server only.
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { topupCredits } from "@/lib/credits/ledger";
import { BOOST_DAYS, STAY_CREDITS, canOfferBoost, type ReasonId } from "./core";

const missing = (e: { code?: string; message?: string } | null | undefined): boolean =>
  Boolean(e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204" || /does not exist|Could not find/i.test(e.message ?? "")));

/** When this account last took the stay offer; `ready` is false before supabase/cancel-flow.sql has run. */
export async function boostHistory(userId: string): Promise<{ ready: boolean; givenAt: string | null; until: string | null }> {
  const svc = createServiceClient();
  if (!svc) return { ready: false, givenAt: null, until: null };
  const { data, error } = await svc.from("referral_bonuses").select("boost_until, boost_given_at").eq("user_id", userId).maybeSingle();
  if (error) return { ready: !missing(error), givenAt: null, until: null };
  return { ready: true, givenAt: (data?.boost_given_at as string | null) ?? null, until: (data?.boost_until as string | null) ?? null };
}

/** Keeps the answer. Never throws: a person's cancellation never waits on this. Returns whether it was kept. */
export async function recordFeedback(userId: string, plan: string, reason: ReasonId, detail: string, outcome: "stayed" | "continued"): Promise<boolean> {
  const svc = createServiceClient();
  if (!svc) return false;
  try {
    const { error } = await svc.from("cancel_feedback").insert({ user_id: userId, plan, reason, detail: detail || null, outcome });
    if (error && !missing(error)) console.error("[cancel] feedback not kept:", error.message);
    return !error;
  } catch (e) {
    console.error("[cancel] feedback not kept:", (e as Error)?.message ?? e);
    return false;
  }
}

/**
 * Gives the stay offer, if this account can have it: the credits go onto the
 * balance (keyed by the day, so a repeat adds nothing), then the row is
 * marked and the month's AI ceiling gets room for BOOST_DAYS. If the credits
 * can't be added nothing is marked. Returns when the ceiling's room runs
 * until, or null when the offer wasn't given.
 */
export async function giveBoost(userId: string, now: Date = new Date()): Promise<string | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const h = await boostHistory(userId);
  if (!h.ready || !canOfferBoost(h.givenAt, now)) return null;
  try {
    await topupCredits(userId, STAY_CREDITS, `stay:${userId}:${now.toISOString().slice(0, 10)}`, "For staying");
  } catch (e) {
    console.error("[cancel] stay credits not added:", (e as Error)?.message ?? e);
    return null;
  }
  const until = new Date(now.getTime() + BOOST_DAYS * 86_400_000).toISOString();
  const patch = { boost_until: until, boost_given_at: now.toISOString(), updated_at: now.toISOString() };
  // The row may already hold this person's invitations: change only the boost.
  const upd = await svc.from("referral_bonuses").update(patch).eq("user_id", userId).select("user_id");
  if (upd.error) return null;
  if (!upd.data?.length) {
    const ins = await svc.from("referral_bonuses").insert({ user_id: userId, ...patch });
    if (ins.error) return null;
  }
  return until;
}

/** A link straight to Stripe's own page that cancels this subscription at the end of the paid period. */
export async function cancelPageUrl(stripe: Stripe, customer: string, subscription: string, returnUrl: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer, return_url: returnUrl,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription },
      after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
    },
  });
  return session.url;
}
