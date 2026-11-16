"use client";

// Onboarding's last step: the plans, with the one that fits this brand's
// strategy marked "Recommended for your goal" and the reasons under it
// (lib/planRecommend.ts picks the cheapest plan that covers the strategy; it
// is never "most popular"). Free stays as easy to choose as any other. A paid
// plan goes to Stripe Checkout and comes back here to finish; nothing is
// charged or switched on from this screen itself.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlanId } from "@/lib/plans";
import type { Recommendation } from "@/lib/planRecommend";
import { LaunchWas } from "@/components/pricing/Launch";

type PlanCard = { id: PlanId; name: string; price: string; priceMonthly: number; tagline: string; credits: number; buys: string; competitors: number; workspaces: number };
type Data = { currentPlan: PlanId; checkout: boolean; assumed: number | null; recommendation: Recommendation; plans: PlanCard[] };

export default function PlanStep({ headRef, onFree, busy, notice }: { headRef: React.RefObject<HTMLHeadingElement | null>; onFree: () => void; busy: boolean; notice?: string | null }) {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [going, setGoing] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding/recommend").then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Data) => { if (alive) setD(j); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  async function choose(plan: PlanId) {
    if (plan === "free") { onFree(); return; }
    setGoing(plan); setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval: "month", from: "onboarding" }) });
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
      <div className="ob-head">
        <h1 ref={headRef} tabIndex={-1}>{paying ? "You're ready" : d && d.assumed != null ? "Choose how to start" : "Your strategy is ready. Let's put it to work."}</h1>
        <p>{paying ? "Your plan is already active, so there is nothing to choose here." : "Choose the tools and room you need to follow your plan. You can change plans at any time."}</p>
      </div>
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
          <ul className="obp-plans">
            {d.plans.map((p) => {
              const rec = p.id === d.recommendation.plan;
              const disabled = busy || going !== null || (p.id !== "free" && !d.checkout);
              return (
                <li key={p.id} className={rec ? "is-rec" : undefined}>
                  {rec && <span className="obp-badge">{d.assumed != null ? `Recommended for ${d.assumed} posts a week` : "Recommended for your goal"}</span>}
                  <div className="obp-top">
                    <b>{p.name}</b>
                    <span className="obp-price">
                      {p.priceMonthly > 0 && <LaunchWas plan={p.id} price={p.priceMonthly} />}
                      <span><b>{p.price}</b>{p.priceMonthly > 0 ? <small> a month, before tax</small> : <small> forever</small>}</span>
                    </span>
                  </div>
                  <p className="obp-line">{p.credits.toLocaleString("en-US")} AI credits a month: {p.buys}.</p>
                  <p className="obp-line">{p.workspaces} {p.workspaces === 1 ? "brand" : "brands"}, {p.competitors} competitors per brand.</p>
                  {rec && <ul className="obp-why">{d.recommendation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                  <button type="button" className={`ob-btn ${rec ? "ob-btn-primary" : "ob-btn-ghost"}`} onClick={() => void choose(p.id)} disabled={disabled} aria-busy={going === p.id || undefined}>
                    {going === p.id ? "Opening checkout…" : p.id === "free" ? (busy ? "Opening…" : "Start on Free") : `Choose ${p.name}`}
                  </button>
                </li>
              );
            })}
          </ul>
          {!d.checkout && <p className="obp-notice">Paid plans can&apos;t be bought on this site yet. You can start on Free now.</p>}
          {err && <p className="ob-err" role="alert">{err}</p>}
          <p className="ob-note">Paid plans are billed monthly through Stripe and you can cancel at any time. Your strategy and goal are saved whichever plan you choose.</p>
        </>
      )}
    </>
  );
}
