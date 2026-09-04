"use client";

// "SOCIA understands your business" — every value here is real detection
// state (niche_detail, cached media, intelligence timestamps). Rescan runs
// the same analysis the Niche page uses.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Loader2, ArrowRight, Sparkle } from "lucide-react";

export type IntelState = {
  niche: string | null;
  subNiche: string | null;
  confidence: number | null;
  audience: string | null;
  signals: string[];
  postsAnalyzed: number | null;
  analyzedAgo: string | null;
  trendsAgo: string | null;
  location: string | null;
  connected: boolean;
};

const ANALYZES: { label: string; on: boolean; note?: string }[] = [
  { label: "Your posts & captions", on: true },
  { label: "Niche trends", on: true },
  { label: "Audience performance", on: true },
  { label: "Competitors", on: false, note: "preview" },
];

export default function IntelligenceCard({ intel }: { intel: IntelState }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function rescan() {
    setScanning(true);
    setErr(null);
    try {
      const res = await fetch("/api/analyze-account");
      if (!res.ok) throw new Error("Rescan failed — try again in a minute.");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Rescan failed.");
    } finally {
      setScanning(false);
    }
  }

  if (!intel.connected) {
    return (
      <div className="st3-intel-empty">
        <p>
          Connect your Instagram and SOCIA reads your real posts to detect your niche, audience,
          and content signals — then keeps its intelligence fresh automatically.
        </p>
        <Link href="#accounts" className="st2-connect">
          Connect an account <ArrowRight size={13} />
        </Link>
      </div>
    );
  }

  const healthy = (intel.confidence ?? 0) >= 75 && Boolean(intel.niche);

  return (
    <div>
      <div className="st3-intel-hero">
        <span className="st3-intel-ico">
          <Sparkle size={17} />
        </span>
        <div className="st3-intel-meta">
          <b>SOCIA understands your business</b>
          {intel.niche ? (
            <p className="st3-intel-niche">
              {intel.subNiche || intel.niche}
              {intel.confidence != null && intel.confidence > 0 && (
                <span className="st3-conf">{intel.confidence}% confidence</span>
              )}
            </p>
          ) : (
            <p className="st3-intel-niche">
              Niche not detected yet — <Link href="/competitors#trends">run detection</Link>
            </p>
          )}
          <div className="st3-intel-facts">
            {intel.location && <span>{intel.location}</span>}
            {intel.audience && <span>{intel.audience}</span>}
            {intel.postsAnalyzed != null && intel.postsAnalyzed > 0 && (
              <span>{intel.postsAnalyzed} posts analyzed</span>
            )}
            {intel.trendsAgo && <span>Intelligence refreshed {intel.trendsAgo}</span>}
          </div>
          {healthy && (
            <p className="st3-intel-ok">
              <Check size={12} /> Everything looks good
            </p>
          )}
        </div>
        <button className="st2-btn st3-rescan" onClick={rescan} disabled={scanning} type="button">
          {scanning ? (
            <>
              <Loader2 size={14} className="spin" /> Rescanning…
            </>
          ) : (
            <>
              <RefreshCw size={14} /> Rescan niche
            </>
          )}
        </button>
      </div>
      {err && <p className="st2-err" style={{ marginTop: 8 }}>{err}</p>}

      {intel.signals.length > 0 && (
        <div className="st3-signals">
          <small className="st3-sub">Detected content signals</small>
          <div className="st3-signal-chips">
            {intel.signals.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      )}

      <div className="st3-analyzes">
        <small className="st3-sub">What SOCIA analyzes</small>
        <ul>
          {ANALYZES.map((a) => (
            <li key={a.label} className={a.on ? "" : "off"}>
              <Check size={12} /> {a.label}
              {a.note && <em>{a.note}</em>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
