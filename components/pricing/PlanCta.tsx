"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLANS, contactHref, type PlanId } from "@/lib/plans";

// The one control on each pricing card. Honest by construction: while
// checkout is not wired, a paid plan's button opens a contact email instead of
// pretending to start a purchase, and a plan the person is already on is a
// label, not a button.

export default function PlanCta({
  plan,
  currentPlan,
  signedIn,
  checkout,
  highlighted = false,
}: {
  plan: PlanId;
  currentPlan: PlanId | null;
  signedIn: boolean;
  /** checkoutAvailable() from the server. False until a billing provider exists. */
  checkout: boolean;
  /** The card linked to from ?plan=; scrolled into view on load. */
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const p = PLANS[plan];
  const isCurrent = signedIn && currentPlan === plan;

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
        body: JSON.stringify({ name: "upgrade_clicked", props: { plan, from: "pricing" } }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* analytics never blocks the click */
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
  } else {
    // No checkout route exists yet, so the button opens a contact email and
    // says so; the plan's own cta string is reserved for a real purchase.
    // When checkoutAvailable() flips, this is the one place to route to the
    // billing flow instead.
    const href = contactHref(`SOCIA ${p.name} plan`);
    body = (
      <a
        href={href}
        className={`so-btn ${p.popular ? "so-btn-blue" : "so-btn-ghost"}`}
        onClick={trackUpgrade}
        title={checkout ? undefined : "Opens an email to the SOCIA team"}
      >
        {checkout ? <>{p.cta} <ArrowRight size={14} /></> : `Contact us about ${p.name}`}
      </a>
    );
  }

  return <div ref={ref} className="pr-cta">{body}</div>;
}
