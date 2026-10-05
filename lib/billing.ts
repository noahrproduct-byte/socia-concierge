// Billing state: how a Stripe subscription becomes a SOCIA plan, and the
// reads and writes around it. Writes go through the service role because
// profiles.plan and the billing columns are locked to it (supabase/billing.sql).
//
// Rules:
//   • Stripe is the source of truth. The plan is derived from the live
//     subscription's price, never from what the browser says.
//   • An unknown price changes nothing (logged); a dead subscription means Free.
//   • Past due keeps the plan while Stripe retries the card; the page says so.
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { getStripe, planForPrice } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type SubscriptionStatus = Stripe.Subscription.Status;

/** The billing columns of a profile, as the Settings page shows them. */
export type BillingInfo = {
  plan: PlanId;
  status: SubscriptionStatus | null;
  interval: BillingInterval | null;
  /** End of the current paid period (the renewal date), ISO. */
  currentPeriodEnd: string | null;
  /** When a scheduled cancellation takes effect, ISO; null when none. */
  cancelAt: string | null;
  trialEnd: string | null;
  hasCustomer: boolean;
  hasSubscription: boolean;
};

export type SubscriptionState = {
  /** null = the price is not one SOCIA sells; leave the plan alone. */
  plan: PlanId | null;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  trialEnd: string | null;
  customerId: string | null;
  subscriptionId: string;
  priceId: string | null;
};

const iso = (unix: number | null | undefined): string | null => (unix ? new Date(unix * 1000).toISOString() : null);

/** Statuses under which the person no longer has the paid plan. */
const ENDED: ReadonlySet<string> = new Set(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]);

/** Pure: what a Stripe subscription means for SOCIA. */
export function stateFromSubscription(sub: Stripe.Subscription): SubscriptionState {
  const item = sub.items?.data?.[0];
  const price = item?.price ?? null;
  const priceId = price?.id ?? null;
  const productId = typeof price?.product === "string" ? price.product : price?.product?.id ?? null;
  const known = planForPrice(priceId, productId);
  const ended = ENDED.has(sub.status);
  // Newer Stripe API versions keep the period on the item; older ones on the subscription.
  const periodEnd = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end
    ?? null;
  const currentPeriodEnd = iso(periodEnd);
  const recurring = String(price?.recurring?.interval ?? "");
  const fallbackInterval: BillingInterval | null = recurring === "month" ? "month" : recurring === "year" ? "year" : null;
  return {
    plan: ended ? "free" : known?.plan ?? null,
    status: sub.status,
    interval: known?.interval ?? fallbackInterval,
    currentPeriodEnd,
    cancelAt: ended ? null : iso(sub.cancel_at) ?? (sub.cancel_at_period_end ? currentPeriodEnd : null),
    trialEnd: iso(sub.trial_end),
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    subscriptionId: sub.id,
    priceId,
  };
}

/** Write a subscription's state to the person's profile (service role). */
export async function applySubscription(svc: Supa, userId: string, sub: Stripe.Subscription): Promise<SubscriptionState> {
  const s = stateFromSubscription(sub);
  if (s.plan == null) console.error(`[billing] unknown Stripe price ${s.priceId} on subscription ${s.subscriptionId}; plan left unchanged`);
  const row: Record<string, unknown> = {
    stripe_subscription_id: s.subscriptionId,
    subscription_status: s.status,
    billing_interval: s.interval,
    current_period_end: s.currentPeriodEnd,
    cancel_at: s.cancelAt,
    trial_end: s.trialEnd,
    updated_at: new Date().toISOString(),
  };
  if (s.plan != null) row.plan = s.plan;
  if (s.customerId) row.stripe_customer_id = s.customerId;
  const { error } = await svc.from("profiles").update(row).eq("user_id", userId);
  if (error) throw new Error(`[billing] profile update failed: ${error.message}`);
  return s;
}

/** Remember which Stripe customer a person is (service role). */
export async function saveCustomerId(svc: Supa, userId: string, customerId: string): Promise<void> {
  const { error } = await svc.from("profiles").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new Error(`[billing] could not save customer id: ${error.message}`);
}

/** The person a subscription belongs to: the metadata SOCIA set at checkout, else the customer id on file. */
export async function userIdForSubscription(svc: Supa, sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.user_id;
  if (fromMeta) return fromMeta;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data } = await svc.from("profiles").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/** true when this Stripe event was already applied. */
export async function billingEventSeen(svc: Supa, eventId: string): Promise<boolean> {
  const { data } = await svc.from("billing_events").select("id").eq("id", eventId).maybeSingle();
  return Boolean(data);
}

export async function markBillingEvent(svc: Supa, eventId: string, type: string, userId: string | null): Promise<void> {
  await svc.from("billing_events").insert({ id: eventId, type, user_id: userId }).then(() => null, () => null);
}

/** The person's own billing columns (their session can read its own profile). */
export async function readBillingInfo(supabase: Supa, userId: string): Promise<BillingInfo> {
  const empty: BillingInfo = { plan: "free", status: null, interval: null, currentPeriodEnd: null, cancelAt: null, trialEnd: null, hasCustomer: false, hasSubscription: false };
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, stripe_customer_id, stripe_subscription_id, subscription_status, billing_interval, current_period_end, cancel_at, trial_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return empty; // columns may not exist before billing.sql runs
    const r = data as Record<string, unknown>;
    const plan = (r.plan as PlanId | undefined) ?? "free";
    const interval = r.billing_interval === "month" || r.billing_interval === "year" ? r.billing_interval : null;
    return {
      plan,
      status: (r.subscription_status as SubscriptionStatus | null) ?? null,
      interval,
      currentPeriodEnd: (r.current_period_end as string | null) ?? null,
      cancelAt: (r.cancel_at as string | null) ?? null,
      trialEnd: (r.trial_end as string | null) ?? null,
      hasCustomer: Boolean(r.stripe_customer_id),
      hasSubscription: Boolean(r.stripe_subscription_id),
    };
  } catch {
    return empty;
  }
}

/** A subscription that still occupies the person's billing (changes go through the Customer Portal). */
export function hasLiveSubscription(b: BillingInfo): boolean {
  return b.hasSubscription && b.status != null && !ENDED.has(b.status);
}

/** Someone who has never had a subscription or a trial may start the 7-day trial. */
export function trialEligible(b: BillingInfo): boolean {
  return !b.hasSubscription && !b.trialEnd;
}

/**
 * After Checkout returns: read the session and apply its subscription at once,
 * so the plan shows without waiting for the webhook. The webhook applies the
 * same state again later; both writes are idempotent. Returns the state, or
 * null when nothing could be applied (not configured, wrong person, no sub).
 */
export async function syncCheckoutSession(sessionId: string, userId: string): Promise<SubscriptionState | null> {
  const stripe = getStripe();
  const svc = createServiceClient();
  if (!stripe || !svc) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (session.client_reference_id !== userId) return null;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (customerId) await saveCustomerId(svc, userId, customerId);
    const sub = session.subscription;
    if (!sub || typeof sub === "string") return null;
    return await applySubscription(svc, userId, sub);
  } catch (e) {
    console.error("[billing] checkout sync failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
