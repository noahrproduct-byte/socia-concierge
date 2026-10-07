import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, isBillingInterval, isPaidPlan, resolvePriceId } from "@/lib/stripe";
import { hasLiveSubscription, readBillingInfo, saveCustomerId, trialEligible } from "@/lib/billing";
import { PLANS, checkoutAvailable } from "@/lib/plans";
import { recordEvent } from "@/lib/planGuard";

export const runtime = "nodejs";

// Start a Stripe Checkout for a paid plan. Body: { plan, interval }.
// Sold through Stripe Managed Payments: Stripe (via Link) is the merchant of
// record and handles sales tax, receipts, fraud and disputes. That requires a
// Managed Payments tax code on each Product in the Stripe Dashboard and rules
// out automatic_tax, tax_id_collection, payment_method_types, customer_update
// and invoice_creation on this session, none of which are used here.
// Returns { url } to send the browser to. Someone who already has a live
// subscription is sent to the Customer Portal instead (plan changes, including
// up/downgrades, happen there with Stripe's proration rules).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to choose a plan." }, { status: 401 });

  const stripe = getStripe();
  const svc = createServiceClient();
  if (!stripe || !svc || !checkoutAvailable()) {
    return NextResponse.json({ error: "Checkout is not available yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { plan?: unknown; interval?: unknown } | null;
  const plan = typeof body?.plan === "string" ? body.plan : "";
  const interval = typeof body?.interval === "string" ? body.interval : "month";
  if (!isPaidPlan(plan) || !isBillingInterval(interval)) {
    return NextResponse.json({ error: "Choose a paid plan and a billing period." }, { status: 400 });
  }
  const price = await resolvePriceId(stripe, plan, interval).catch(() => null);
  if (!price) return NextResponse.json({ error: `The ${PLANS[plan].name} price is not configured yet.` }, { status: 503 });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const billing = await readBillingInfo(supabase, user.id);

  // Already paying: the Portal is where the plan changes.
  if (hasLiveSubscription(billing)) {
    const { data } = await svc.from("profiles").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const customer = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
    if (!customer) return NextResponse.json({ error: "Your billing account could not be found. Contact us and we'll sort it out." }, { status: 409 });
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/settings#plan` });
    return NextResponse.json({ url: portal.url, portal: true });
  }

  // One Stripe customer per person, created on first checkout.
  let customer: string | null = null;
  {
    const { data } = await svc.from("profiles").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    customer = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  }
  if (!customer) {
    const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
    customer = created.id;
    await saveCustomerId(svc, user.id, customer);
  }

  const trial = trialEligible(billing);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    // The card is always collected; the 7-day trial applies to a first subscription only.
    payment_method_collection: "always",
    subscription_data: {
      metadata: { user_id: user.id, plan },
      ...(trial ? { trial_period_days: 7 } : {}),
    },
    allow_promotion_codes: true,
    managed_payments: { enabled: true },
    success_url: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}#plan`,
    cancel_url: `${origin}/pricing?billing=cancelled&plan=${plan}`,
  });
  if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout page. Try again." }, { status: 502 });

  recordEvent(supabase, user.id, "checkout_started", { plan, interval, trial });
  return NextResponse.json({ url: session.url });
}
