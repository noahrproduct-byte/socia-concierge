"use client";

// Monthly or yearly on the pricing page (lib/yearly.ts). Both sets of cards
// are rendered on the server and this switch shows one; the choice is kept in
// the address (?interval=month) so a shared link opens on the same prices.
// Under the cards, the year side by side: what twelve monthly payments come to
// against one yearly payment, each pair drawn to scale (the yearly bar is the
// share of the monthly one it costs), with the dollars kept. Every
// figure is a real price; nothing is rounded up.
import { useEffect, useState, type ReactNode } from "react";
import { PLANS, type BillingInterval } from "@/lib/plans";
import { bestYearlyPercent, money, monthlyForAYear, yearlySaving, yearlyTotal, type PaidPlanId } from "@/lib/yearly";

export default function BillingSwitch({ monthly, yearly, plans, start = "year" }: {
  monthly: ReactNode;
  yearly: ReactNode;
  /** The paid plans on sale, in order. */
  plans: PaidPlanId[];
  start?: BillingInterval;
}) {
  const [interval, setPicked] = useState<BillingInterval>(start);
  // Keep the choice in the address without a reload, so a copied link opens on the same prices.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (interval === "month") url.searchParams.set("interval", "month");
      else url.searchParams.delete("interval");
      window.history.replaceState(null, "", url);
    } catch { /* the address is a convenience */ }
  }, [interval]);

  const best = bestYearlyPercent(plans);

  return (
    <>
      <div className="pr-switch-row">
        <div className="pr-switch" role="radiogroup" aria-label="Billing">
          {(["month", "year"] as const).map((i) => (
            <button key={i} type="button" role="radio" aria-checked={interval === i} className={interval === i ? "on" : undefined} onClick={() => setPicked(i)}>
              {i === "month" ? "Monthly" : "Yearly"}
              {i === "year" && best > 0 && <span className="pr-switch-save">Save up to {best}%</span>}
            </button>
          ))}
        </div>
      </div>

      <div hidden={interval !== "month"}>{monthly}</div>
      <div hidden={interval !== "year"}>{yearly}</div>

      <section className="pr-year" aria-labelledby="pr-year-h">
        <div className="pr-year-head">
          <h2 id="pr-year-h" className="pr-section-title">A year, monthly or yearly</h2>
          <p className="pr-section-lead">The same plan for twelve months. Paying once for the year costs less than twelve monthly payments.</p>
        </div>
        <div className="pr-year-rows">
          {plans.map((id) => (
            <div key={id} className="pr-year-row">
              <b className="pr-year-name">{PLANS[id].name}</b>
              <div className="pr-year-bars">
                <div className="pr-year-bar is-month" style={{ "--w": "100%" } as React.CSSProperties}>
                  <span>12 monthly payments</span><b>{money(monthlyForAYear(id))}</b>
                </div>
                <div className="pr-year-bar is-year" style={{ "--w": `${(yearlyTotal(id) / monthlyForAYear(id)) * 100}%` } as React.CSSProperties}>
                  <span>One yearly payment</span><b>{money(yearlyTotal(id))}</b>
                </div>
              </div>
              <p className="pr-year-keep">You keep <b>{money(yearlySaving(id))}</b></p>
            </div>
          ))}
        </div>
        <ul className="pr-year-why">
          <li><b>Your credits still arrive every month.</b> A yearly plan gets its AI credits on the first of each month, the same as a monthly one.</li>
          <li><b>One payment, one price for twelve months.</b> Your price stays the same for the whole year you paid for.</li>
          <li><b>Stop when you like.</b> Cancel any time in Manage billing. The plan stays yours until the year you paid for ends, and it doesn&apos;t renew.</li>
        </ul>
        {interval === "month" && (
          <p className="pr-year-cta"><button type="button" className="hm-btn hm-btn--primary hm-btn--lg" onClick={() => { setPicked("year"); document.querySelector(".pr-switch")?.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>See the yearly prices</button></p>
        )}
      </section>
    </>
  );
}
