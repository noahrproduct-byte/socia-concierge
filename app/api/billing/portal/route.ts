import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// Open the Stripe Customer Portal: update the card, switch plans, cancel,
// download invoices. Returns { url }.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const stripe = getStripe();
  const svc = createServiceClient();
  if (!stripe || !svc) return NextResponse.json({ error: "Billing is not available yet." }, { status: 503 });

  const { data } = await svc.from("profiles").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  const customer = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customer) return NextResponse.json({ error: "There is no billing account for you yet. Choose a plan first." }, { status: 404 });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/settings#plan` });
  return NextResponse.json({ url: session.url });
}
