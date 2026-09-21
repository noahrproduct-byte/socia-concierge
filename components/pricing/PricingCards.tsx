import { Check } from "lucide-react";
import { PLANS, PLAN_ORDER, formatPrice, type PlanId, type PlanConfig } from "@/lib/plans";
import { featureSoon } from "@/lib/pricingTable";
import PlanCta from "./PlanCta";

// Four plan cards. The sentences are written here, but every number is read
// from PLANS so a limit changed in lib/plans.ts changes the card with it, and
// every "Soon" tag is read from FEATURE_STATUS so a feature that ships stops
// being "soon" without anyone editing copy.

type Bullet = { text: string; soon?: boolean };

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function bulletsFor(p: PlanConfig): Bullet[] {
  const L = p.limits;
  const M = p.meters;
  const askSocia = { text: `${M.ask_socia} Ask SOCIA questions/month` };
  const studio = { text: `${M.content_studio} Content Studio analyses/month` };
  const competitors = { text: n(L.competitors, "competitor", "competitors") };

  switch (p.id) {
    case "free":
      return [
        { text: n(L.connected_accounts, "connected account", "connected accounts") },
        { text: "Basic analytics" },
        { text: n(M.account_audit, "account audit", "account audits") },
        askSocia,
        studio,
        competitors,
        { text: "Basic content calendar" },
      ];
    case "starter":
      return [
        { text: n(L.connected_accounts, "connected account", "connected accounts") },
        { text: "Full analytics" },
        { text: "Weekly Content Plan", soon: featureSoon("content_plan") },
        { text: "What To Do Next recommendations", soon: featureSoon("content_plan") },
        askSocia,
        studio,
        competitors,
        { text: "Niche intelligence", soon: featureSoon("niche_intelligence") },
        { text: "Scheduling and publishing (Instagram)", soon: featureSoon("scheduling") },
        { text: "Performance reports", soon: featureSoon("performance_reports") },
      ];
    case "growth":
      return [
        { text: `Up to ${n(L.connected_accounts, "connected account", "connected accounts")}` },
        { text: `Everything in ${PLANS.starter.name}` },
        { text: "Cross-platform analytics", soon: featureSoon("cross_platform_analytics") },
        { text: "Daily recommendations", soon: featureSoon("daily_recommendations") },
        askSocia,
        studio,
        competitors,
        // No feature key yet; stays "soon" until the trends work ships.
        { text: "Advanced trend intelligence", soon: true },
        { text: "Trend alerts", soon: featureSoon("trend_alerts") },
        { text: "Advanced reporting", soon: featureSoon("advanced_reports") },
        { text: n(L.team_seats, "team seat", "team seats"), soon: featureSoon("team") },
        { text: "Priority support" },
      ];
    case "pro":
      return [
        { text: `Up to ${n(L.connected_accounts, "connected account", "connected accounts")}` },
        { text: `Everything in ${PLANS.growth.name}` },
        { text: "Multi-brand and client management", soon: featureSoon("multi_brand") },
        competitors,
        { text: n(L.team_seats, "team seat", "team seats"), soon: featureSoon("team") },
        { text: "White-label reports", soon: featureSoon("white_label_reports") },
        { text: "Approval workflows", soon: featureSoon("approval_workflow") },
        { text: "Advanced exports", soon: featureSoon("analytics_exports") },
        askSocia,
        studio,
        { text: "Priority support" },
        { text: "Dedicated onboarding" },
      ];
  }
}

export default function PricingCards({
  currentPlan,
  signedIn,
  checkout,
  highlight,
}: {
  currentPlan: PlanId | null;
  signedIn: boolean;
  checkout: boolean;
  /** From ?plan=; that card is outlined and scrolled to. */
  highlight: PlanId | null;
}) {
  return (
    <div className="pr-grid">
      {PLAN_ORDER.map((id) => {
        const p = PLANS[id];
        const cls = ["pr-card", p.popular ? "popular" : "", highlight === id ? "highlight" : ""].filter(Boolean).join(" ");
        return (
          <article key={id} id={`plan-${id}`} className={cls} aria-labelledby={`plan-${id}-name`}>
            <div className="pr-card-head">
              <h3 id={`plan-${id}-name`} className="pr-card-name">{p.name}</h3>
              {p.popular && <span className="pr-popular">Most popular</span>}
            </div>
            <div className="pr-price">
              <span className="pr-price-amount">{formatPrice(p)}</span>
              <span className="pr-price-per">/month</span>
            </div>
            <p className="pr-tagline">{p.tagline}</p>
            <PlanCta plan={id} currentPlan={currentPlan} signedIn={signedIn} checkout={checkout} highlighted={highlight === id} />
            <ul className="pr-list">
              {bulletsFor(p).map((b) => (
                <li key={b.text}>
                  <Check size={14} aria-hidden />
                  <span>{b.text}</span>
                  {b.soon && <span className="pr-soon">Soon</span>}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
