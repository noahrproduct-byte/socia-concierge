"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { PLANS, contactHref, type BillingInterval, type PlanId } from "@/lib/plans";

// The button on a pricing card. Signed out it goes to sign-up; signed in it
// starts a Stripe Checkout for the chosen plan and billing period. Someone
// already on a paid plan is taken to the Customer Portal to switch (the server
// decides that and returns the right URL). Until Stripe is configured the
// button opens a contact email and says so.
export default function PlanCta({
  plan,
  currentPlan,
  signedIn,
  checkout,
  interval,
  highlighted = false,
}: {
  plan: PlanId;
  currentPlan: PlanId | null;
  signedIn: boolean;
  /** checkoutAvailable() from the server. */
  checkout: boolean;
  interval: BillingInterval;
  /** The card linked to from ?plan=; scrolled into view on load. */
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = PLANS[plan];
  const isCurrent = signedIn && currentPlan === plan;
  const paidAlready = signedIn && currentPlan != null && currentPlan !== "free";

  useEffect(() => {
    if (!highlighted) return;
    const card = ref.current?.closest(".pr-card");
    if (card instanceof HTMLElement) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      card.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
  }, [highlighted]);

  function trackUpgrade() {
    if (!signedIn) return;
    try {
      void fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "upgrade_clicked", props: { plan, from: "pricing", interval } }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* analytics never blocks the click */
    }
  }

  async function startCheckout() {
    setBusy(true);
    setErr(null);
    trackUpgrade();
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) throw new Error(j?.error || "Checkout couldn't be started. Please try again.");
      window.location.assign(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout couldn't be started. Please try again.");
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (isCurrent) {
    body = <span className="pr-cta-current">Current plan</span>;
  } else if (plan === "free") {
    body = signedIn
      ? <span className="pr-cta-muted">Included</span>
      : (
        <Link href="/signup" className="so-btn so-btn-ghost">
          {p.cta} <ArrowRight size={14} />
        </Link>
      );
  } else if (!checkout) {
    body = (
      <a
        href={contactHref(`SOCIA ${p.name} plan`)}
        className={`so-btn ${p.popular ? "so-btn-blue" : "so-btn-ghost"}`}
        onClick={trackUpgrade}
        title="Opens an email to the SOCIA team"
      >
        Contact us about {p.name}
      </a>
    );
  } else if (!signedIn) {
    body = (
      <Link href="/signup" className={`so-btn ${p.popular ? "so-btn-blue" : "so-btn-ghost"}`}>
        {p.cta} <ArrowRight size={14} />
      </Link>
    );
  } else {
    body = (
      <>
        <button
          type="button"
          className={`so-btn ${p.popular ? "so-btn-blue" : "so-btn-ghost"}`}
          onClick={startCheckout}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <Loader2 size={14} className="spin" /> : null}
          {paidAlready ? `Switch to ${p.name}` : p.cta}
          {!busy && <ArrowRight size={14} />}
        </button>
        {err && <small className="pr-cta-err" role="alert">{err}</small>}
      </>
    );
  }

  return <div ref={ref} className="pr-cta">{body}</div>;
}
