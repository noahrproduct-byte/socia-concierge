import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { recordEvent } from "@/lib/planGuard";
import { PLANS, checkoutAvailable, contactHref, isPlanId, type PlanId } from "@/lib/plans";
import HomeNav from "@/components/home/HomeNav";
import HomeFooter from "@/components/home/HomeFooter";
import PricingCards from "@/components/pricing/PricingCards";
import ComparisonTable from "@/components/pricing/ComparisonTable";
import "@/components/home/home.css";
import "./pricing.css";
import { marketingFonts } from "@/components/home/fonts";

// Public pricing page. Everything on it is generated from lib/plans.ts and
// lib/pricingTable.ts; this file only lays it out. Reading the visitor is
// optional: signed out, the page renders the same cards with sign-up CTAs. It
// wears the homepage's look (components/home/home.css): its top bar, footer,
// type, black actions and cards.


export const metadata = {
  title: "Pricing | SOCIA",
  description: "Four SOCIA plans, from a free account audit to multi-brand workspaces. What each plan includes and what is limited by plan.",
};

async function readVisitor(): Promise<{ signedIn: boolean; plan: PlanId | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { signedIn: false, plan: null };
    const ent = await getEntitlements(supabase, user.id);
    recordEvent(supabase, user.id, "pricing_viewed", { plan: ent.plan });
    return { signedIn: true, plan: ent.plan };
  } catch {
    // Missing env or an auth hiccup must not take the public page down.
    return { signedIn: false, plan: null };
  }
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const [{ signedIn, plan }, { plan: wanted, billing }] = await Promise.all([readVisitor(), searchParams]);
  const highlight = isPlanId(wanted) ? wanted : null;
  const checkout = checkoutAvailable();
  const pro = PLANS.pro.limits;

  return (
    <div className={`${marketingFonts} hm pr-page`}>
      <HomeNav signedIn={signedIn} current="/pricing" />

      <main className="pr-main">
        <header className="hm-wrap pr-head">
          <span className="hm-eyebrow">Plans</span>
          <h1 className="hm-h2 is-center">Know what to do next.</h1>
          <p className="hm-lead">
            Start free with one brand, then choose the plan that matches how many brands you run and how much you want SOCIA to do each month.
          </p>
          {!checkout && (
            <p className="pr-note">
              Checkout is opening soon. <a href={contactHref("SOCIA paid plan")}>Contact us</a> to move to a paid plan today.
            </p>
          )}
          {checkout && billing === "cancelled" && (
            <p className="pr-note" role="status">Checkout was cancelled. Nothing was charged.</p>
          )}
          {checkout && (
            <p className="pr-fine">
              Have a promo code from one of our videos? Enter it on the checkout page.{" "}
              Prices in USD before tax. Payments are handled by Stripe and sold through Link, which adds sales tax at checkout where it applies; charges show as LINK.COM* on your statement.
            </p>
          )}
        </header>

        <section className="hm-wrap" aria-label="Plans">
          <PricingCards currentPlan={plan} signedIn={signedIn} checkout={checkout} highlight={highlight} />
        </section>

        <section className="hm-wrap pr-compare" aria-labelledby="compare-heading">
          <h2 id="compare-heading" className="pr-section-title">Compare plans</h2>
          <p className="pr-section-lead">Everything each plan includes today, and what is on the way.</p>
          <ComparisonTable />
        </section>

        <section id="custom" className="hm-wrap pr-custom-wrap" aria-labelledby="custom-heading">
          <div className="pr-custom">
            <h2 id="custom-heading" className="pr-section-title">Need more?</h2>
            <p>
              Need more than {pro.workspaces} Brand Workspaces, {pro.team_members} team members or larger usage limits?{" "}
              <a href={contactHref("SOCIA custom pricing")}>Contact us</a> for custom pricing.
            </p>
          </div>
        </section>
      </main>

      <HomeFooter onHome={false} />
    </div>
  );
}
