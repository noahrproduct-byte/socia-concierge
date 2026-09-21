import { Geist } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/entitlements";
import { recordEvent } from "@/lib/planGuard";
import { PLANS, checkoutAvailable, contactHref, isPlanId, type PlanId } from "@/lib/plans";
import { Nav, Footer } from "@/components/MarketingChrome";
import PricingCards from "@/components/pricing/PricingCards";
import ComparisonTable from "@/components/pricing/ComparisonTable";
import "./pricing.css";

// Public pricing page. Everything on it is generated from lib/plans.ts and
// lib/pricingTable.ts; this file only lays it out. Reading the visitor is
// optional: signed out, the page renders the same cards with sign-up CTAs.

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display" });

export const metadata = {
  title: "Pricing — SOCIA",
  description: "Four SOCIA plans, from a free account audit to multi-brand workspaces. What is included, what is limited by plan, and what is coming soon.",
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

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const [{ signedIn, plan }, { plan: wanted }] = await Promise.all([readVisitor(), searchParams]);
  const highlight = isPlanId(wanted) ? wanted : null;
  const checkout = checkoutAvailable();
  const pro = PLANS.pro.limits;

  return (
    <div className={`${geist.variable} so pr-page`}>
      <Nav signedIn={signedIn} current="/pricing" />

      <main className="pr-main">
        <header className="so-wrap center pr-head">
          <span className="so-label">Plans</span>
          <h2 className="so-h2">Know what to do next.</h2>
          <p className="so-lead">
            Start free with an account audit, then choose the plan that matches how many accounts you run and how much you want SOCIA to do each month.
          </p>
          {!checkout && (
            <p className="pr-note">
              Checkout is opening soon. <a href={contactHref("SOCIA paid plan")}>Contact us</a> to move to a paid plan today.
            </p>
          )}
        </header>

        <section className="so-wrap" aria-label="Plans">
          <PricingCards currentPlan={plan} signedIn={signedIn} checkout={checkout} highlight={highlight} />
        </section>

        <section className="so-wrap pr-compare" aria-labelledby="compare-heading">
          <h3 id="compare-heading" className="pr-section-title">Compare plans</h3>
          <p className="pr-section-lead">Everything each plan includes today, and what is on the way.</p>
          <ComparisonTable />
        </section>

        <section id="custom" className="so-wrap pr-custom" aria-labelledby="custom-heading">
          <h3 id="custom-heading" className="pr-section-title">Need more?</h3>
          <p>
            Need more than {pro.connected_accounts} accounts, {pro.team_seats} seats or larger usage limits?{" "}
            <a href={contactHref("SOCIA custom pricing")}>Contact us</a> for custom pricing.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
