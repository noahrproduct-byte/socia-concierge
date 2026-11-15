"use client";

// Settings, Plan & billing: the AI credit balance every AI feature is paid
// from, this month's credits, what each feature uses, top-up packs, and the
// last movements.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/plans";
import { ACTION_USD, actionCredits, creditsBuy, formatCredits, type CreditAction, type TopupKey } from "@/lib/credits/config";
import "@/app/(app)/ai/ai.css";

type Entry = { id: number; kind: string; amount: number; balance_after: number; note: string | null; created_at: string };
type Data = { plan?: PlanId; balance: number | null; monthly: number; packs: readonly { key: TopupKey; credits: number; usd: number }[]; ledger: Entry[]; enabled: boolean; topups: boolean };

const KIND: Record<string, string> = { grant: "Monthly credits", spend: "Spent", refund: "Refunded", topup: "Top-up", adjust: "Adjustment" };

/** What a spend paid for, from the note SOCIA writes on it (lib/planGuard.ts). */
const ACTION_NAME: Record<CreditAction, string> = {
  ask_socia: "Ask SOCIA", content_studio: "Video rating", content_generation: "Hooks and captions", account_audit: "Account audit",
  content_plan: "Content Plan", content_ideas: "Video ideas", content_build: "Footage analysis", video_builds: "AI-made video",
  animated_videos: "Animated video", music_tracks: "Music track", voiceovers: "Voiceover",
};
const noteText = (note: string | null) => (note && note in ACTION_NAME ? ACTION_NAME[note as CreditAction] : note);
const PRICES = (Object.keys(ACTION_USD) as CreditAction[]).map((a) => ({ name: ACTION_NAME[a], credits: actionCredits(a) }));
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
        <span>
          AI credits for every AI feature. {data.monthly > 0 ? `${data.monthly.toLocaleString("en-US")} come with your plan each month (${creditsBuy(data.monthly, (a) => (data.plan ? PLANS[data.plan].meters[a] > 0 : true))}). They refill on the 1st and don't carry over; top-ups don't expire.` : ""}
        </span>
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
      <details className="ai-prices">
        <summary>What each feature uses</summary>
        <ul>{PRICES.map((p) => <li key={p.name}><span>{p.name}</span><b>{formatCredits(p.credits)}</b></li>)}</ul>
        <p className="ai-note">The Clipper and AI Studio show their price before each job.</p>
      </details>
      {data.ledger.length > 0 && (
        <ul className="ai-ledger">
          {data.ledger.slice(0, 8).map((e) => (
            <li key={e.id}><span>{day(e.created_at)} · {KIND[e.kind] ?? e.kind}{noteText(e.note) ? `: ${noteText(e.note)}` : ""}</span><b>{e.amount > 0 ? "+" : ""}{e.amount.toLocaleString("en-US")}</b></li>
          ))}
        </ul>
      )}
    </div>
  );
}
