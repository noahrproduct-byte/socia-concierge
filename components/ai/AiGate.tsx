import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { PLANS, onSale, pricingHref, type FeatureKey, type PlanId } from "@/lib/plans";
import { MONTHLY_CREDITS } from "@/lib/credits/config";

// What a plan without the feature sees: what it is, which plan has it, one link.
export default function AiGate({ feature, plan, currentPlan, what }: { feature: FeatureKey; plan: PlanId; currentPlan: PlanId; what: string }) {
  const name = feature === "ai_clipper" ? "AI Clipper" : "AI Studio";
  if (!onSale(plan)) {
    return (
      <div className="ai-gate" data-feature={feature} data-current={currentPlan}>
        <span className="ai-gate-ico" aria-hidden><Lock size={20} /></span>
        <h2>{name} is not available yet</h2>
        <p>{what}</p>
      </div>
    );
  }
  return (
    <div className="ai-gate" data-feature={feature} data-current={currentPlan}>
      <span className="ai-gate-ico" aria-hidden><Lock size={20} /></span>
      <h2>{name} is on {PLANS[plan].name}</h2>
      <p>{what}</p>
      <p className="ai-gate-note">{PLANS[plan].name} includes {MONTHLY_CREDITS[plan].toLocaleString("en-US")} AI credits a month for the Clipper and AI Studio; every action shows its price before it runs.</p>
      <Link href={pricingHref(plan)} className="btn-primary">Upgrade to {PLANS[plan].name} <ArrowRight size={14} /></Link>
    </div>
  );
}
