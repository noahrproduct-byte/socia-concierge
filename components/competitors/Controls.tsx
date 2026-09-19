"use client";

// Header and section controls. Every select changes a real parameter: the
// page's ?range= / ?platform= / ?niche_range= (server recomputes), or the
// profile's niche (discovery re-scopes on the next refresh).

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { NICHES } from "@/lib/niches";
import { PlatformMark } from "./shared";

export function ParamSelect({ name, value, options, ariaLabel, icon, clearValue }: {
  name: string; value: string; options: { value: string; label: string }[]; ariaLabel: string; icon?: React.ReactNode;
  /** The option that means "unset"; the parameter is removed instead of written. */
  clearValue?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="lb-sel compact cx-sel">
      {icon}
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = new URLSearchParams(params?.toString() ?? "");
          if (e.target.value === clearValue) next.delete(name); else next.set(name, e.target.value);
          const q = next.toString();
          router.push(`/competitors${q ? `?${q}` : ""}${name === "niche_range" ? "#trends" : ""}`);
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function PlatformSelect({ value }: { value: string }) {
  return (
    <ParamSelect
      name="platform" value={value} ariaLabel="Platform" clearValue="all"
      icon={<span className={`cx-plat-ico ${value}`}><PlatformMark p={value === "all" ? "instagram" : value} size={12} /></span>}
      options={[{ value: "all", label: "All platforms" }, { value: "instagram", label: "Instagram" }, { value: "youtube", label: "YouTube" }, { value: "facebook", label: "Facebook" }]}
    />
  );
}

export function RangeSelect({ days }: { days: number }) {
  return (
    <ParamSelect name="range" value={String(days)} ariaLabel="Date range" clearValue="30"
      options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
  );
}

export function NicheRangeSelect({ value }: { value: 30 | 90 | 0 }) {
  return (
    <ParamSelect name="niche_range" value={value === 0 ? "all" : String(value)} ariaLabel="Niche content range" clearValue="90"
      options={[{ value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "all", label: "All found" }]} />
  );
}

/** Changes the profile niche (the same call the onboarding chooser makes),
 *  then re-renders the page. Discovery re-scopes on the next refresh. */
export function NicheSelect({ niche }: { niche: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const choose = useCallback(async (n: string) => {
    if (!n || n === niche) return;
    setBusy(true);
    try {
      const res = await fetch("/api/analyze-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choose: { niche: n } }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }, [niche, router]);
  return (
    <label className="lb-sel compact cx-sel">
      <span>Niche:</span>
      <select value={niche ?? ""} aria-label="Niche" disabled={busy} onChange={(e) => choose(e.target.value)}>
        {!niche && <option value="">Choose a niche</option>}
        {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {busy && <Loader2 size={12} className="cx-spin" />}
    </label>
  );
}

/** Runs discovery, then re-renders from the stored results. A refused run
 *  (rate limit, server error) shows the server's own message beside the button. */
export function RefreshButton({ className = "cx-refresh", label = "Refresh" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/competitors/intel?refresh=1");
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? `Refresh failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setErr("Couldn't reach SOCIA. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={`${className}${busy ? " busy" : ""}`} disabled={busy} aria-label="Refresh competitor and niche data" onClick={run}>
        <RefreshCw size={12} className={busy ? "cx-spin" : undefined} /> {busy ? "Refreshing…" : label}
      </button>
      {err && <small className="cx-add-err" role="alert">{err}</small>}
    </>
  );
}
