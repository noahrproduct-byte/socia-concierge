"use client";

// "Reels to copy from" on Discover (Noah, 2026-11-16): Instagram accounts the
// brand copies Reels from for their style, any topic, never counted as
// competitors (moe.dev for SOCIA). SOCIA reads them and finds more like them
// (lib/discoverRead.ts); their Reels that reach past their followers lead the
// "Reels to copy" group.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, X } from "lucide-react";
import PlanNotice from "@/components/PlanNotice";
import { fmtN } from "@/components/competitors/shared";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { DiscoverAccount } from "./types";

export default function CopyFrom({ accounts, limit, onChanged }: { accounts: DiscoverAccount[]; limit: number; onChanged: () => void }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanError | null>(null);
  const mine = accounts.filter((a) => a.copy === "you");

  async function send(method: "POST" | "DELETE", h: string) {
    setBusy(h); setErr(null); setPlan(null);
    try {
      const res = await fetch("/api/discover/copy", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: h }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { if (isPlanError(j)) setPlan(j); else setErr(j.error ?? "That didn't save. Try again."); return; }
      if (method === "POST") setHandle("");
      router.refresh();
      onChanged();
    } catch {
      setErr("Couldn't reach SOCIA. Try again.");
    } finally { setBusy(null); }
  }

  return (
    <section className="ov-card cx2-card" aria-labelledby="dsc-copy">
      <div className="cx2-card-head">
        <h2 id="dsc-copy"><Copy size={14} aria-hidden /> Reels to copy from</h2>
        <span className="cx2-micro">{mine.length} of {limit} for this brand</span>
      </div>
      <p className="dsc-lead">Accounts whose videos you want to copy for their style, on any topic. They aren&apos;t competitors. SOCIA reads their Reels and finds more accounts like them.</p>
      <form className="dsc-copy-form" onSubmit={(e) => { e.preventDefault(); if (handle.trim()) void send("POST", handle.trim()); }}>
        <label htmlFor="dsc-copy-handle" className="sr-only">Instagram handle or link</label>
        <input id="dsc-copy-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or Instagram link" autoComplete="off" />
        <button type="submit" className="ov-btn primary small" disabled={!handle.trim() || Boolean(busy)}>
          {busy && busy === handle.trim() ? <Loader2 size={13} className="cx-spin" aria-hidden /> : <Plus size={13} aria-hidden />} Add
        </button>
      </form>
      {plan ? <PlanNotice error={plan} compact /> : err && <p className="dsc-note" role="alert">{err}</p>}
      {accounts.length > 0 && (
        <ul className="dsc-copy-list">
          {accounts.map((a) => (
            <li key={a.id}>
              <span className="dsc-copy-name">
                <b>{a.name}</b>
                <a href={a.url ?? `https://instagram.com/${a.handle}`} target="_blank" rel="noopener noreferrer">@{a.handle}</a>
              </span>
              <span className="dsc-copy-facts">
                {a.reading ? "Reading on Instagram" : a.audience.value != null
                  ? `${fmtN(a.audience.value)} followers${a.medianViews.value != null ? `, ${fmtN(Math.round(a.medianViews.value))} median views` : ""}`
                  : a.postsGate === "not_business" ? "Personal account: Instagram shares nothing" : "Instagram shared nothing"}
                {a.style ? `. ${a.style}` : ""}
                {a.copy === "found" && a.copyVia ? `. Found from @${a.copyVia}` : ""}
              </span>
              <button type="button" className="dsc-x" aria-label={`Stop copying from @${a.handle}`} title="Remove" disabled={busy === a.handle} onClick={() => void send("DELETE", a.handle)}>
                {busy === a.handle ? <Loader2 size={13} className="cx-spin" aria-hidden /> : <X size={14} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
