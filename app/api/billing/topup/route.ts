import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { checkoutAvailable } from "@/lib/plans";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { saveCustomerId } from "@/lib/billing";
import { recordEvent } from "@/lib/planGuard";
import { CREDIT_PRICES_CONFIRMED, TOPUP_PACKS, type TopupKey } from "@/lib/credits/config";

export const runtime = "nodejs";

/** The Stripe Price for a pack: STRIPE_PRICE_TOPUP_SMALL, STRIPE_PRICE_TOPUP_LARGE (one-off prices). */
const topupPriceId = (key: TopupKey): string | null => process.env[`STRIPE_PRICE_TOPUP_${key.toUpperCase()}`]?.trim() || null;

// POST { pack } -> { url }: a one-off Stripe Checkout for a credit pack. The
// webhook (checkout.session.completed, mode "payment") adds the credits once.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to buy credits." }, { status: 401 });
  const stripe = getStripe();
  const svc = createServiceClient();
  // Closed until the credit prices are confirmed (lib/credits/config.ts).
  if (!stripe || !svc || !checkoutAvailable() || !CREDIT_PRICES_CONFIRMED) return NextResponse.json({ error: "Top-ups are not available yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { pack?: unknown } | null;
  const pack = TOPUP_PACKS.find((p) => p.key === body?.pack);
  if (!pack) return NextResponse.json({ error: "Choose a credit pack." }, { status: 400 });
  const price = topupPriceId(pack.key);
  if (!price) return NextResponse.json({ error: "That pack's price is not configured yet." }, { status: 503 });
  const ent = await getEntitlements(supabase, user.id);
  if (!canUseFeature(ent, "ai_clipper") && !canUseFeature(ent, "ai_studio")) return NextResponse.json({ error: "Credits are for the Scale plan's AI Clipper and AI Studio." }, { status: 403 });
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
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
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      metadata: { user_id: user.id, credits: String(pack.credits), pack: pack.key },
      managed_payments: { enabled: true },
      success_url: `${origin}/settings?credits=success#plan`,
      cancel_url: `${origin}/settings?credits=cancelled#plan`,
    });
    if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout page. Try again." }, { status: 502 });
    recordEvent(supabase, user.id, "checkout_started", { topup: pack.key, credits: pack.credits });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const err = e as { message?: string };
    console.error("[billing] top-up checkout failed:", err.message ?? e);
    return NextResponse.json({ error: "Stripe couldn't start the checkout. Nothing was charged; try again." }, { status: 502 });
  }
}
