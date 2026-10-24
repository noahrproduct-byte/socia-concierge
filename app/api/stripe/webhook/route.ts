import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { applySubscription, billingEventSeen, markBillingEvent, saveCustomerId, userIdForSubscription } from "@/lib/billing";
import { enforcePlanLimits } from "@/lib/planDowngrade";

export const runtime = "nodejs";

// Stripe → SOCIA. Register https://sociaos.com/api/stripe/webhook in the
// Stripe Dashboard with these events:
//   checkout.session.completed
//   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
// The signature is verified against the raw body; each event id is applied
// once; anything unexpected returns a non-2xx so Stripe retries.
/** After a plan change: pause what the new plan doesn't cover (never deletes; Settings can change the choice). */
async function pauseOverLimits(svc: Parameters<typeof enforcePlanLimits>[0], userId: string): Promise<void> {
  try {
    const r = await enforcePlanLimits(svc, userId);
    if (r.workspacesPaused || r.accountsPaused || r.competitorsPaused) console.log("[billing] paused over-limit items", JSON.stringify({ userId, ...r }));
  } catch (e) {
    // The plan itself is already right; a failure here must not make Stripe retry the event.
    console.error("[billing] could not pause over-limit items:", e instanceof Error ? e.message : e);
  }
}

/** The profile holds a different subscription that has not ended. */
async function anotherSubscriptionIsLive(svc: Parameters<typeof enforcePlanLimits>[0], userId: string, subId: string): Promise<boolean> {
  const { data } = await svc.from("profiles").select("stripe_subscription_id, subscription_status").eq("user_id", userId).maybeSingle();
  const row = data as { stripe_subscription_id?: string | null; subscription_status?: string | null } | null;
  if (!row?.stripe_subscription_id || row.stripe_subscription_id === subId) return false;
  return ["active", "trialing", "past_due"].includes(row.subscription_status ?? "");
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig ?? "", secret);
  } catch (e) {
    console.error("[billing] webhook signature rejected:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "service role missing" }, { status: 503 });

  if (await billingEventSeen(svc, event.id)) return NextResponse.json({ received: true, duplicate: true });

  let userId: string | null = null;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        if (userId && customerId) await saveCustomerId(svc, userId, customerId);
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        if (userId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(svc, userId, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        userId = await userIdForSubscription(svc, sub);
        if (!userId) {
          console.error(`[billing] no SOCIA user for subscription ${sub.id} (customer ${typeof sub.customer === "string" ? sub.customer : sub.customer?.id})`);
          break;
        }
        // Apply Stripe's CURRENT state, never the event's snapshot: a retried
        // old "updated: active" arriving after "deleted" must not restore a
        // paid plan. And an event about another subscription never
        // overwrites the one that is live on the profile.
        const live = await stripe.subscriptions.retrieve(sub.id);
        if (await anotherSubscriptionIsLive(svc, userId, live.id)) {
          console.warn(`[billing] ignored ${event.type} for ${live.id}: another live subscription is on file`);
          break;
        }
        await applySubscription(svc, userId, live);
        await pauseOverLimits(svc, userId);
        break;
      }
      default:
        break; // not subscribed to anything else; ignore if Stripe sends it anyway
    }
  } catch (e) {
    console.error(`[billing] ${event.type} failed:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "apply failed" }, { status: 500 }); // Stripe retries
  }

  await markBillingEvent(svc, event.id, event.type, userId);
  return NextResponse.json({ received: true });
}
