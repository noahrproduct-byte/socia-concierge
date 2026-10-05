import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { applySubscription, billingEventSeen, markBillingEvent, saveCustomerId, userIdForSubscription } from "@/lib/billing";

export const runtime = "nodejs";

// Stripe → SOCIA. Register https://sociaos.com/api/stripe/webhook in the
// Stripe Dashboard with these events:
//   checkout.session.completed
//   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
// The signature is verified against the raw body; each event id is applied
// once; anything unexpected returns a non-2xx so Stripe retries.
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
        await applySubscription(svc, userId, sub);
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
