"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS, PLAN_ORDER, FEATURE_LABEL, FEATURE_STATUS, formatHistory, monthlyEquivalent, annualNote, type BillingInterval, type PlanId, type PlanConfig } from "@/lib/plans";
import { comingSoonFor } from "@/lib/pricingTable";
import PlanCta from "./PlanCta";

// Four plan cards. Each card carries the handful of reasons someone picks that
// plan, not the whole feature list (the comparison table below has that).
// Every number is read from PLANS so a limit changed in lib/plans.ts changes
// the card with it. Only features that exist today appear in the list; what a
// plan will include later sits in a separate, quieter "coming soon" line and
// is never sold as included.

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function highlightsFor(p: PlanConfig): (string | null)[] {
  const L = p.limits;
  const M = p.meters;
  const workspaces = n(L.workspaces, "Brand Workspace", "Brand Workspaces");
  const askSocia = `${M.ask_socia} Ask SOCIA questions/month`;
  const studio = `${M.content_studio} Content Studio analyses/month`;
  const competitors = n(L.competitors, "competitor", "competitors");
  // Team members are a headline only once invites exist; until then the seat
  // count would be a promise about a feature that is not built, so it lives in
  // the card's "coming soon" line instead.
  const members = FEATURE_STATUS.team === "coming_soon" ? null : n(L.team_members, "team member", "team members");

  switch (p.id) {
    case "free":
      return [
        workspaces,
        "Connect Instagram, Facebook, TikTok and YouTube",
        `${formatHistory(L.analytics_history_days)} of analytics`,
        `${M.content_ideas} content ideas/week`,
        askSocia,
        studio,
        competitors,
        "Scheduling and publishing included",
      ];
    case "starter":
      return [
        workspaces,
        `${formatHistory(L.analytics_history_days)} of analytics, posting-time and growth analysis`,
        "What Changed, What's Working, What's Missing, What To Do Next",
        `Full weekly Content Plan (${M.content_plan}/month)`,
        askSocia,
        studio,
        competitors,
        "Full niche intelligence",
        members,
      ];
    case "growth":
      return [
        workspaces,
        `${formatHistory(L.analytics_history_days)} of analytics`,
        "Cross-platform analytics",
        askSocia,
        studio,
        competitors,
        members,
        "Priority support",
      ];
    case "pro":
      return [
        workspaces,
        formatHistory(L.analytics_history_days),
        askSocia,
        studio,
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
  // Billing period for every card at once. Annual is two months free; the
  // card shows the per-month figure and says what is billed.
  const [interval, setInterval] = useState<BillingInterval>("month");
  return (
    <>
    <div className="pr-toggle" role="group" aria-label="Billing period">
      <button type="button" className={interval === "month" ? "on" : ""} aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
      <button type="button" className={interval === "year" ? "on" : ""} aria-pressed={interval === "year"} onClick={() => setInterval("year")}>
        Annual <span className="pr-toggle-save">2 months free</span>
      </button>
    </div>
    <div className="pr-grid">
      {PLAN_ORDER.map((id) => {
        const p = PLANS[id];
        const cls = ["pr-card", p.popular ? "popular" : "", highlight === id ? "highlight" : ""].filter(Boolean).join(" ");
        // Only what this plan adds over the one below, so the line stays short.
        const below = PLAN_ORDER[PLAN_ORDER.indexOf(id) - 1];
        const soon = comingSoonFor(id).filter((k) => !below || !PLANS[below].features[k]);
        return (
          <article key={id} id={`plan-${id}`} className={cls} aria-labelledby={`plan-${id}-name`}>
            <div className="pr-card-head">
              <h3 id={`plan-${id}-name`} className="pr-card-name">{p.name}</h3>
              {p.popular && <span className="pr-popular">Most popular</span>}
            </div>
            <div className="pr-price">
              <span className="pr-price-amount">{monthlyEquivalent(p, interval)}</span>
              <span className="pr-price-per">/month</span>
            </div>
            {interval === "year" && annualNote(p) && <p className="pr-annual-note">{annualNote(p)}</p>}
            <p className="pr-tagline">{p.tagline}</p>
            <p className="pr-audience">{p.audience}</p>
            <PlanCta plan={id} currentPlan={currentPlan} signedIn={signedIn} checkout={checkout} interval={interval} highlighted={highlight === id} />
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
    </>
  );
}
