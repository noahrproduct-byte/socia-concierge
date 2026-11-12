"use client";

// Settings, Plan & billing: the AI credit balance for the Clipper and AI
// Studio, this month's allowance, top-up packs, and the last movements.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatCredits, type TopupKey } from "@/lib/credits/config";
import "@/app/(app)/ai/ai.css";

type Entry = { id: number; kind: string; amount: number; balance_after: number; note: string | null; created_at: string };
type Data = { balance: number | null; monthly: number; packs: readonly { key: TopupKey; credits: number; usd: number }[]; ledger: Entry[]; enabled: boolean; topups: boolean };

const KIND: Record<string, string> = { grant: "Monthly allowance", spend: "Spent", refund: "Refunded", topup: "Top-up", adjust: "Adjustment" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function CreditsPanel({ checkout }: { checkout: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/credits").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error || "Credits could not be read."); setData(j); }).catch((e) => setErr(e.message));
  }, []);
  async function buy(pack: TopupKey) {
    setBusy(pack); setErr(null);
    try {
      const r = await fetch("/api/billing/topup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack }) });
      const j = (await r.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!r.ok || !j?.url) throw new Error(j?.error || "Checkout couldn't be opened.");
      window.location.assign(j.url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Checkout couldn't be opened."); setBusy(null); }
  }
  if (!data && !err) return <div className="ai-wallet"><Loader2 size={14} className="spin" aria-hidden /></div>;
  if (!data || !data.enabled) return null;
  return (
    <div className="ai-wallet" id="credits">
      <div className="ai-wallet-row">
        <b>{data.balance == null ? "–" : formatCredits(data.balance)}</b>
        <span>AI credits for the Clipper and AI Studio. {data.monthly > 0 ? `${data.monthly.toLocaleString("en-US")} come with your plan each month.` : ""}</span>
      </div>
      {data.topups ? <div className="ai-packs">
        {data.packs.map((p) => (
          <button key={p.key} type="button" className="btn-secondary" disabled={!checkout || Boolean(busy)} onClick={() => buy(p.key)} aria-busy={busy === p.key || undefined}>
            {busy === p.key ? <Loader2 size={14} className="spin" aria-hidden /> : null} {p.credits.toLocaleString("en-US")} credits for ${p.usd}
          </button>
        ))}
        {!checkout && <small>Top-ups open with checkout.</small>}
      </div> : <p className="ai-note">Top-ups are not on sale yet.</p>}
      {err && <p className="ai-err" role="alert">{err}</p>}
      {data.ledger.length > 0 && (
        <ul className="ai-ledger">
          {data.ledger.slice(0, 8).map((e) => (
            <li key={e.id}><span>{day(e.created_at)} · {KIND[e.kind] ?? e.kind}{e.note ? `: ${e.note}` : ""}</span><b>{e.amount > 0 ? "+" : ""}{e.amount.toLocaleString("en-US")}</b></li>
          ))}
        </ul>
      )}
    </div>
  );
}
