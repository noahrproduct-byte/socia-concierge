"use client";

// Onboarding's last step: the plans, with the recommended one marked and the
// reasons under it (lib/planRecommend.ts: Growth, or a bigger plan when the
// brand already needs one; the reasons are built from the strategy and the
// plan's own numbers). Free stays as easy to choose as any other. A paid
// plan goes to Stripe Checkout and comes back here to finish; nothing is
// charged or switched on from this screen itself. When yearly plans are on
// sale the same Monthly / Yearly switch as the pricing page shows, opening on
// yearly, with the real yearly totals and savings (lib/yearly.ts).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BillingInterval, PlanId } from "@/lib/plans";
import { YEARLY_PER_MONTH, bestYearlyPercent, isPaidPlanId, money, yearlySaving, yearlyTotal } from "@/lib/yearly";
import type { Recommendation } from "@/lib/planRecommend";
import { LaunchWas } from "@/components/pricing/Launch";
import SioSays from "@/components/sio/SioSays";

type PlanCard = { id: PlanId; name: string; price: string; priceMonthly: number; tagline: string; credits: number; yearlyCredits: number | null; yearlyBuys: string | null; buys: string; competitors: number; workspaces: number };
type Data = { currentPlan: PlanId; checkout: boolean; yearly?: boolean; assumed: number | null; recommendation: Recommendation; plans: PlanCard[] };

export default function PlanStep({ headRef, onFree, busy, notice }: { headRef: React.RefObject<HTMLHeadingElement | null>; onFree: () => void; busy: boolean; notice?: string | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [going, setGoing] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<BillingInterval>("year");

  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding/recommend").then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Data) => { if (alive) setD(j); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Yearly only when all four yearly prices are set; otherwise every plan is monthly.
  const interval: BillingInterval = d?.yearly ? picked : "month";

  async function choose(plan: PlanId) {
    if (plan === "free") { onFree(); return; }
    setGoing(plan); setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval, from: "onboarding" }) });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) throw new Error(j?.error || "Checkout couldn't be started. Nothing was charged. Try again.");
      window.location.assign(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout couldn't be started. Nothing was charged. Try again.");
      setGoing(null);
    }
  }

  const paying = d && d.currentPlan !== "free";
  return (
    <>
      <SioSays expression={paying ? "happy" : "neutral"} headRef={headRef}
        title={paying ? "You're ready" : d && d.assumed != null ? "Choose how to start" : "I've put together your strategy. Now let's choose the tools that fit it."}>
        {paying ? "Your plan is already active, so there is nothing to choose here." : "Choose the tools and room you need to follow your plan. You can change plans at any time."}
      </SioSays>
      {notice && <p className="obp-notice" role="status">{notice}</p>}
      {failed && <p className="ob-err" role="alert">The plans couldn&apos;t be loaded. You can open SOCIA on Free and choose a plan later from Settings.</p>}
      {!d && !failed && <p className="obp-wait" role="status"><Loader2 size={16} className="spin" aria-hidden /> Working out which plan fits your strategy.</p>}

      {d && paying && (
        <p className="obp-current">You&apos;re on {d.plans.find((p) => p.id === d.currentPlan)?.name ?? "a paid plan"}.</p>
      )}
      {(failed || paying) && (
        <button type="button" className="ob-btn ob-btn-primary" onClick={onFree} disabled={busy}>{busy ? "Opening…" : "Open SOCIA"}</button>
      )}

      {d && !paying && (
        <>
          {d.assumed != null && <p className="obp-notice">Your strategy isn&apos;t written yet, so this assumes {d.assumed} posts a week.</p>}
          {d.yearly && (
            <div className="obp-switch" role="radiogroup" aria-label="Billing">
              {(["month", "year"] as const).map((i) => (
                <button key={i} type="button" role="radio" aria-checked={interval === i} className={interval === i ? "on" : undefined} onClick={() => setPicked(i)} disabled={going !== null}>
                  {i === "month" ? "Monthly" : "Yearly"}
                  {i === "year" && <span className="obp-switch-save">Save up to {bestYearlyPercent(d.plans.map((p) => p.id).filter(isPaidPlanId))}%</span>}
                </button>
              ))}
            </div>
          )}
          <ul className="obp-plans">
            {d.plans.map((p) => {
              const rec = p.id === d.recommendation.plan;
              const disabled = busy || going !== null || (p.id !== "free" && !d.checkout);
              const yearlyCard = interval === "year" && isPaidPlanId(p.id);
              const credits = yearlyCard && p.yearlyCredits != null ? p.yearlyCredits : p.credits;
              const buys = yearlyCard && p.yearlyBuys ? p.yearlyBuys : p.buys;
              return (
                <li key={p.id} className={rec ? "is-rec" : undefined}>
                  {rec && <span className="obp-badge">Recommended</span>}
                  <div className="obp-top">
                    <b>{p.name}</b>
                    {yearlyCard && isPaidPlanId(p.id) ? (
                      <span className="obp-price">
                        <span className="ln-was"><s><span className="ln-sr">Monthly price </span>{p.price}</s></span>
                        <span><b>{money(YEARLY_PER_MONTH[p.id])}</b><small> a month, before tax</small></span>
                        <small>Billed {money(yearlyTotal(p.id))} yearly. You save {money(yearlySaving(p.id))}.</small>
                      </span>
                    ) : (
                      <span className="obp-price">
                        {p.priceMonthly > 0 && <LaunchWas plan={p.id} price={p.priceMonthly} />}
                        <span><b>{p.price}</b>{p.priceMonthly > 0 ? <small> a month, before tax</small> : <small> forever</small>}</span>
                      </span>
                    )}
                  </div>
                  <p className="obp-line">{credits.toLocaleString("en-US")} AI credits a month: {buys}.</p>
                  <p className="obp-line">{p.workspaces} {p.workspaces === 1 ? "brand" : "brands"}, {p.competitors} competitors per brand.</p>
                  {rec && <ul className="obp-why">{d.recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                  <button type="button" className={`ob-btn ${rec ? "ob-btn-primary" : "ob-btn-ghost"}`} onClick={() => void choose(p.id)} disabled={disabled} aria-busy={going === p.id || undefined}>
                    {going === p.id ? "Opening checkout…" : p.id === "free" ? (busy ? "Opening…" : "Start on Free") : `Choose ${p.name}${yearlyCard ? " yearly" : ""}`}
                  </button>
                </li>
              );
            })}
          </ul>
          {!d.checkout && <p className="obp-notice">Paid plans can&apos;t be bought on this site yet. You can start on Free now.</p>}
          {err && <p className="ob-err" role="alert">{err}</p>}
          <p className="ob-note">{interval === "year" ? "Yearly plans are paid once a year through Stripe and your credits still arrive every month. Cancel at any time and the plan stays yours until the year ends." : "Paid plans are billed monthly through Stripe and you can cancel at any time."} Your strategy and goal are saved whichever plan you choose.</p>
        </>
      )}
    </>
  );
}
