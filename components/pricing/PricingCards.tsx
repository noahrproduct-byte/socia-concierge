import { Check } from "lucide-react";
import { openPlatformsText } from "@/lib/platformStatus";
import { PLANS, SALE_ORDER, FEATURE_LABEL, FEATURE_STATUS, formatPrice, formatHistory, type PlanId, type PlanConfig } from "@/lib/plans";
import { creditsBuy, creditsOnSale } from "@/lib/credits/config";
import { comingSoonFor } from "@/lib/pricingTable";
import PlanCta from "./PlanCta";
import { LaunchWas } from "./Launch";

// Four plan cards. Each card carries the handful of reasons someone picks that
// plan, not the whole feature list (the comparison table below has that).
// Every number is read from PLANS so a limit changed in lib/plans.ts changes
// the card with it. Only features that exist today appear in the list; what a
// plan will include later sits in a separate, quieter "coming soon" line and
// is never sold as included.

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function highlightsFor(p: PlanConfig): (string | null)[] {
  const L = p.limits;
  const workspaces = n(L.workspaces, "Brand Workspace", "Brand Workspaces");
  // Every AI feature runs on one monthly credit balance (lib/credits/config.ts):
  // the card says how many credits and what they buy, not a list of per-feature counts.
  const credits = `${creditsOnSale(p.id).toLocaleString("en-US")} AI credits a month, for any AI feature`;
  const buys = `That's ${creditsBuy(creditsOnSale(p.id), (a) => p.meters[a] > 0)}`;
  const competitors = `${n(L.competitors, "competitor", "competitors")} per brand`;
  // Team members are a headline only once invites exist; until then the seat
  // count would be a promise about a feature that is not built, so it lives in
  // the card's "coming soon" line instead.
  const members = FEATURE_STATUS.team === "coming_soon" ? null : n(L.team_members, "team member", "team members");

  switch (p.id) {
    case "free":
      return [
        workspaces,
        `Connect ${openPlatformsText()}`,
        `${formatHistory(L.analytics_history_days)} of analytics`,
        credits,
        buys,
        `Build from clips: ${L.studio_clips_per_project} clips, ${L.studio_footage_minutes} minutes per project`,
        competitors,
        "Scheduling and publishing included",
      ];
    case "starter":
      return [
        workspaces,
        credits,
        buys,
        `${formatHistory(L.analytics_history_days)} of analytics, posting-time and growth analysis`,
        "What Changed, What's Working, What's Missing, What To Do Next",
        "Animated videos, voiceovers and the AI Clipper",
        `Live stream clips: ${L.stream_channels} Twitch stream at a time, ${L.stream_hours_month} hours a month`,
        competitors,
        "Full niche intelligence",
        members,
      ];
    case "growth":
      return [
        workspaces,
        credits,
        buys,
        `${formatHistory(L.analytics_history_days)} of analytics`,
        "Cross-platform analytics",
        "AI comment replies and daily recommendations",
        `Live stream clips: ${L.stream_channels} streams at a time, ${L.stream_hours_month} hours a month, saved as videos`,
        competitors,
        members,
        "Priority support",
      ];
    case "pro":
      return [
        workspaces,
        credits,
        buys,
        "AI Studio: AI-made videos and images, clips up to 10 seconds",
        `Live stream clips: ${L.stream_channels} streams at a time, ${L.stream_hours_month} hours a month`,
        formatHistory(L.analytics_history_days),
        "Cross-brand analytics, client reports and approvals",
        competitors,
        members,
        "Priority support and dedicated onboarding",
      ];
    case "scale":
      return [
        credits,
        buys,
        "AI Studio premium: Seedance 2.5 and 15-second clips",
        `Live stream clips: ${L.stream_hours_month} hours a month`,
        workspaces,
        formatHistory(L.analytics_history_days),
        competitors,
        members,
        "Priority support and dedicated onboarding",
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
    <div className="pr-grid" style={{ "--plans": SALE_ORDER.length } as React.CSSProperties}>
      {SALE_ORDER.map((id) => {
        const p = PLANS[id];
        const cls = ["pr-card", p.popular ? "popular" : "", highlight === id ? "highlight" : ""].filter(Boolean).join(" ");
        // Only what this plan adds over the one below, so the line stays short.
        const below = SALE_ORDER[SALE_ORDER.indexOf(id) - 1];
        const soon = comingSoonFor(id).filter((k) => !below || !PLANS[below].features[k]);
        return (
          <article key={id} id={`plan-${id}`} className={cls} aria-labelledby={`plan-${id}-name`}>
            <div className="pr-card-head">
              <h3 id={`plan-${id}-name`} className="pr-card-name">{p.name}</h3>
              {p.popular && <span className="pr-popular">Recommended</span>}
            </div>
            <LaunchWas plan={id} price={p.priceMonthly} />
            <div className="pr-price">
              <span className="pr-price-amount">{formatPrice(p)}</span>
              <span className="pr-price-per">/month</span>
            </div>
            <p className="pr-tagline">{p.tagline}</p>
            <p className="pr-audience">{p.audience}</p>
            <PlanCta plan={id} currentPlan={currentPlan} signedIn={signedIn} checkout={checkout} highlighted={highlight === id} />
            {below && <p className="pr-everything">Everything in {PLANS[below].name}, plus:</p>}
            <ul className="pr-list">
              {highlightsFor(p).filter((t): t is string => Boolean(t)).map((text) => (
                <li key={text}>
                  <Check size={14} aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            {soon.length > 0 && (
              <p className="pr-coming">
                <span className="pr-coming-label">Coming soon on {p.name}:</span> {soon.map((k) => FEATURE_LABEL[k]).join(", ")}.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
