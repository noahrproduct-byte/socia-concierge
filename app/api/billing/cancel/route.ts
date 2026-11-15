import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { hasLiveSubscription, readBillingInfo } from "@/lib/billing";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS } from "@/lib/plans";
import { perUserLimit } from "@/lib/rateLimit";
import { BOOST_DAYS, REASONS, boostLines, canOfferBoost, cleanDetail, detailRequired, isReason } from "@/lib/retention/core";
import { boostHistory, cancelPageUrl, giveBoost, recordFeedback } from "@/lib/retention/server";

export const runtime = "nodejs";

// Cancelling a plan. The person says why (required), is offered a little more
// for staying, and either stays or goes on to Stripe's own page, which cancels
// at the end of the paid period. Nothing is cancelled by this route itself.
//   GET  -> { canCancel, plan, periodEnd, reasons, offer: { lines, days } | null }
//   POST { reason, detail?, choice: "stay" | "cancel" }
//        -> stay:   { stayed: true, boostUntil | null }
//        -> cancel: { url } (Stripe's cancel page)

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await who();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [billing, ent, history] = await Promise.all([readBillingInfo(supabase, user.id), getEntitlements(supabase, user.id), boostHistory(user.id)]);
  const canCancel = hasLiveSubscription(billing) && !billing.cancelAt;
  // The offer is what the plan itself would gain, without a boost already counted in.
  const lines = boostLines(PLANS[ent.plan]);
  const offer = history.ready && canOfferBoost(history.givenAt) && lines.length ? { lines, days: BOOST_DAYS } : null;
  return NextResponse.json({ canCancel, plan: PLANS[billing.plan]?.name ?? "your", periodEnd: billing.currentPeriodEnd, reasons: REASONS, offer });
}

export async function POST(req: Request) {
  const { supabase, user } = await who();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limited = await perUserLimit(user.id, "billing_cancel", 20, "plan changes");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { reason?: unknown; detail?: unknown; choice?: unknown } | null;
  // The reason is required: there is no way through this route without one.
  if (!isReason(body?.reason)) return NextResponse.json({ error: "Choose a reason first." }, { status: 400 });
  const reason = body.reason;
  const detail = cleanDetail(body?.detail);
  if (detailRequired(reason) && detail.length < 3) return NextResponse.json({ error: "Tell us the reason in a few words." }, { status: 400 });
  const choice = body?.choice === "stay" ? "stay" : body?.choice === "cancel" ? "cancel" : null;
  if (!choice) return NextResponse.json({ error: "Choose to stay or to cancel." }, { status: 400 });

  const billing = await readBillingInfo(supabase, user.id);
  if (!hasLiveSubscription(billing)) return NextResponse.json({ error: "There is no plan to cancel." }, { status: 404 });

  if (choice === "stay") {
    await recordFeedback(user.id, billing.plan, reason, detail, "stayed");
    const boostUntil = await giveBoost(user.id);
    return NextResponse.json({ stayed: true, boostUntil });
  }

  if (billing.cancelAt) return NextResponse.json({ error: "This plan is already set to cancel." }, { status: 409 });
  const stripe = getStripe();
  const svc = createServiceClient();
  if (!stripe || !svc) return NextResponse.json({ error: "Billing is not available right now. Try again in a minute." }, { status: 503 });
  const { data } = await svc.from("profiles").select("stripe_customer_id, stripe_subscription_id").eq("user_id", user.id).maybeSingle();
  const row = data as { stripe_customer_id?: string | null; stripe_subscription_id?: string | null } | null;
  if (!row?.stripe_customer_id || !row.stripe_subscription_id) return NextResponse.json({ error: "There is no plan to cancel." }, { status: 404 });
  await recordFeedback(user.id, billing.plan, reason, detail, "continued");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  try {
    const url = await cancelPageUrl(stripe, row.stripe_customer_id, row.stripe_subscription_id, `${origin}/settings#plan`);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[cancel] Stripe's cancel page couldn't be opened:", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "Stripe's cancel page couldn't be opened. Use Manage billing to cancel instead." }, { status: 502 });
  }
}
