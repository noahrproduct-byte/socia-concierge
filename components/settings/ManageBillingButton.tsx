"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

// Opens the Stripe Customer Portal (card, plan switch, cancel, invoices).
export default function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) throw new Error(j?.error || "Billing couldn't be opened. Please try again.");
      window.location.assign(j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Billing couldn't be opened. Please try again.");
      setBusy(false);
    }
  }

  return (
    <span className="pb-manage">
      <button type="button" className="btn-primary" onClick={open} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <Loader2 size={14} className="spin" /> : null} Manage billing
      </button>
      {err && <small className="pb-err" role="alert">{err}</small>}
    </span>
  );
}
